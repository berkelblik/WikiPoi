/**
 * audioOpslag.js
 *
 * Offline audio bij eigen POI's (0.14.0): bewaart in de eigen gegevensmap
 * van de app (Capacitor Filesystem, Directory.Data, map "wikipoi/"):
 * - eigen.json: de laatst geïmporteerde eigen POI's (zodat ze na een herstart
 *   terug zijn);
 * - audio/lokaal/<SLEUTEL>.<ext>: gekoppelde lokale bestanden (bestandsnaam =
 *   genormaliseerde pluscode, zoals EuroPoi);
 * - audio/kopie/<hash>.<ext>: gedownloade kopieën van mp3-internetlinks;
 * - audio.json: overzicht { lokaal: [{ sleutel, bestand, naam, bytes }],
 *   kopie: { <link>: { bestand, bytes } } }.
 *
 * Downloaden gaat via CapacitorHttp (native): geen CORS-beperking van de
 * WebView. Afspelen via Capacitor.convertFileSrc (http://localhost/…).
 *
 * Alleen op het toestel (Capacitor.isNativePlatform()); in de browser
 * gebruikt App.jsx de oude werkwijze (alleen voor de sessie).
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { directeLink, kopieNaam, lijktAudio } from './mp3bron.js'

const MAP = 'wikipoi'
const EIGEN = `${MAP}/eigen.json`
const INDEX = `${MAP}/audio.json`
const AUDIO = `${MAP}/audio`
const LOKAAL = `${AUDIO}/lokaal`
const KOPIE = `${AUDIO}/kopie`
const DIR = Directory.Data

// Tijdgrenzen voor één download (ms).
const VERBIND_MS = 15000
const LEES_MS = 120000

const LEEG_INDEX = () => ({ lokaal: [], kopie: {} })

async function leesJson(path) {
  try {
    const r = await Filesystem.readFile({ path, directory: DIR, encoding: Encoding.UTF8 })
    return JSON.parse(String(r.data))
  } catch {
    return null
  }
}

async function schrijfJson(path, data) {
  await Filesystem.writeFile({
    path,
    directory: DIR,
    data: JSON.stringify(data),
    encoding: Encoding.UTF8,
    recursive: true,
  })
}

async function wis(path, map = false) {
  try {
    if (map) await Filesystem.rmdir({ path, directory: DIR, recursive: true })
    else await Filesystem.deleteFile({ path, directory: DIR })
  } catch {
    // Bestond niet: prima.
  }
}

/** Afspeel-URL van een bewaard bestand (http://localhost/_capacitor_file_/…). */
export async function afspeelUrl(path) {
  const { uri } = await Filesystem.getUri({ path, directory: DIR })
  return Capacitor.convertFileSrc(uri)
}

// Base64 van een gekozen bestand (File/Blob), zonder "data:…;base64,".
function naarBase64(bestand) {
  return new Promise((klaar, fout) => {
    const r = new FileReader()
    r.onload = () => klaar(String(r.result).split(',')[1] || '')
    r.onerror = () => fout(new Error('kon het bestand niet lezen'))
    r.readAsDataURL(bestand)
  })
}

function extensie(naam) {
  const m = /\.([a-z0-9]{2,4})$/i.exec(String(naam || ''))
  return m ? m[1].toLowerCase() : 'mp3'
}

// ---- Overzicht ----

export async function leesIndex() {
  const i = await leesJson(INDEX)
  if (!i || typeof i !== 'object') return LEEG_INDEX()
  return { lokaal: Array.isArray(i.lokaal) ? i.lokaal : [], kopie: i.kopie && typeof i.kopie === 'object' ? i.kopie : {} }
}

async function schrijfIndex(index) {
  await schrijfJson(INDEX, index)
}

/** Aantal bestanden en totale grootte van alle bewaarde audio. */
export function totaal(index) {
  const lijst = [...index.lokaal, ...Object.values(index.kopie)]
  return { aantal: lijst.length, bytes: lijst.reduce((s, x) => s + (Number(x.bytes) || 0), 0) }
}

// ---- Eigen POI's ----

export async function bewaarEigen(eigenImport) {
  await schrijfJson(EIGEN, eigenImport)
}

export async function laadEigen() {
  const e = await leesJson(EIGEN)
  return e && Array.isArray(e.pois) ? e : null
}

/** Eigen POI's én alle bewaarde audio wissen (nieuwe import of "Verwijderen"). */
export async function wisAlles() {
  await wis(EIGEN)
  await wis(INDEX)
  await wis(AUDIO, true)
}

// ---- Lokale bestanden ----

/**
 * Gekozen bestanden bewaren; vervangt alle eerder gekoppelde bestanden.
 *
 * @param {Array<{sleutel: string, bestand: File, naam: string}>} keuze
 * @returns {Promise<Array<{sleutel, url, naam, bytes}>>} bewaarde bestanden
 *   met afspeel-URL; een bestand dat niet bewaard kon worden, ontbreekt
 */
export async function bewaarLokaal(keuze) {
  await wis(LOKAAL, true)
  const lokaal = []
  const uit = []
  for (const k of keuze) {
    try {
      const data = await naarBase64(k.bestand)
      const path = `${LOKAAL}/${k.sleutel}.${extensie(k.naam)}`
      await Filesystem.writeFile({ path, directory: DIR, data, recursive: true })
      const bytes = k.bestand.size || 0
      lokaal.push({ sleutel: k.sleutel, bestand: path, naam: k.naam, bytes })
      uit.push({ sleutel: k.sleutel, url: await afspeelUrl(path), naam: k.naam, bytes })
    } catch (err) {
      console.warn('Audiobestand niet bewaard:', k.naam, err)
    }
  }
  // Opnieuw lezen: intussen kan er een kopie bij zijn gekomen.
  const nu = await leesIndex()
  await schrijfIndex({ ...nu, lokaal })
  return uit
}

/** Alleen de gekoppelde lokale bestanden wissen ("Ontkoppelen"). */
export async function wisLokaal() {
  const index = await leesIndex()
  await wis(LOKAAL, true)
  await schrijfIndex({ ...index, lokaal: [] })
}

/** Bewaarde lokale bestanden met afspeel-URL (na een herstart). */
export async function laadLokaal(index) {
  const uit = []
  for (const b of index.lokaal) {
    try {
      await Filesystem.stat({ path: b.bestand, directory: DIR })
      uit.push({ sleutel: b.sleutel, url: await afspeelUrl(b.bestand), naam: b.naam, bytes: b.bytes })
    } catch {
      // Bestand weg: overslaan.
    }
  }
  return uit
}

// ---- Kopieën van links ----

/**
 * Eén link downloaden en bewaren.
 *
 * @param {string} link - zoals in de CSV (Dropbox wordt omgezet)
 * @returns {Promise<{bestand: string, bytes: number}>} gooit een Error met
 *   een korte reden bij mislukken
 */
async function downloadEen(link) {
  const r = await CapacitorHttp.get({
    url: directeLink(link),
    responseType: 'blob',
    connectTimeout: VERBIND_MS,
    readTimeout: LEES_MS,
  })
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`)
  const headers = r.headers || {}
  const typeSleutel = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')
  const type = typeSleutel ? headers[typeSleutel] : ''
  const data = typeof r.data === 'string' ? r.data : ''
  if (!lijktAudio(type, data)) throw new Error(`geen audio (${type || 'onbekend type'})`)
  const path = `${KOPIE}/${kopieNaam(link)}`
  await Filesystem.writeFile({ path, directory: DIR, data, recursive: true })
  return { bestand: path, bytes: Math.floor((data.length * 3) / 4) }
}

/**
 * Alle links downloaden die nog geen kopie hebben, één voor één.
 *
 * @param {string[]} links
 * @param {object} opties
 * @param {(stand: {klaar: number, totaal: number}) => void} [opties.voortgang]
 * @param {() => boolean} [opties.afgebroken] - true: stoppen (nieuwe import)
 * @returns {Promise<{gelukt: number, fouten: Array<{link: string, reden: string}>}>}
 */
export async function downloadKopieen(links, { voortgang, afgebroken } = {}) {
  const uniek = [...new Set(links.map((l) => String(l).trim()))]
  const fouten = []
  let gelukt = 0
  for (let i = 0; i < uniek.length; i += 1) {
    if (afgebroken && afgebroken()) break
    if (voortgang) voortgang({ klaar: i, totaal: uniek.length })
    const link = uniek[i]
    const index = await leesIndex()
    if (index.kopie[link]) {
      gelukt += 1
      continue
    }
    try {
      const k = await downloadEen(link)
      if (afgebroken && afgebroken()) break
      const nu = await leesIndex()
      nu.kopie[link] = k
      await schrijfIndex(nu)
      gelukt += 1
    } catch (err) {
      fouten.push({ link, reden: (err && err.message) || String(err) })
    }
  }
  if (voortgang) voortgang({ klaar: uniek.length, totaal: uniek.length })
  return { gelukt, fouten }
}

/** Afspeel-URL's van de bewaarde kopieën: { <link>: { url, bytes } }. */
export async function laadKopieen(index) {
  const uit = {}
  for (const [link, k] of Object.entries(index.kopie)) {
    try {
      await Filesystem.stat({ path: k.bestand, directory: DIR })
      uit[link] = { url: await afspeelUrl(k.bestand), bytes: k.bytes }
    } catch {
      // Bestand weg: overslaan.
    }
  }
  return uit
}
