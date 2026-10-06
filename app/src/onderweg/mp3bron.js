/**
 * mp3bron.js
 *
 * Audiobronnen van een eigen POI voor stap 7 "Onderweg" (0.11.0), volgens
 * dezelfde afspraken als EuroPoi, zodat één CSV plus één map met
 * audiobestanden in beide apps werkt:
 * - De mp3-kolom van de CSV is een INTERNETLINK (http/https). Dropbox-links
 *   worden omgezet naar een directe downloadlink (zoals fixDrop in EuroPoi,
 *   src/geoUtils.js).
 * - Lokale audiobestanden worden apart gekoppeld ("Audiobestanden koppelen"),
 *   op BESTANDSNAAM = PLUSCODE, bijv. "9F37M7RQ+2X.mp3" (zoals de bulk-import
 *   van EuroPoi, src/hooks/useGpx.js). Vergelijken gebeurt genormaliseerd:
 *   hoofdletters, alleen letters en cijfers (normPlus in EuroPoi).
 *
 * Offline audio (0.14.0): gekoppelde lokale bestanden worden in de app
 * bewaard en internetlinks worden direct na de CSV-import gedownload
 * (audioOpslag.js). Afspeelvolgorde: lokaal bestand (eigen keuze van de
 * gebruiker) → gedownloade kopie van de link → link (alleen online) →
 * voorlezen. Het afspelen zelf staat in spreek.js.
 *
 * Alleen pure functies: netwerkloos te testen (test-mp3bron.js).
 */

/** Is de tekst een internetlink (http of https)? */
export function isLink(tekst) {
  return /^https?:\/\/\S+$/i.test(String(tekst || '').trim())
}

/**
 * Pluscode of bestandsnaam genormaliseerd voor vergelijking: hoofdletters,
 * alleen A-Z en 0-9 ("9f37m7rq+2x" → "9F37M7RQ2X"). Een eventuele extensie
 * (.mp3/.wav) moet de aanroeper er zelf al af hebben gehaald.
 */
export function normPluscode(tekst) {
  return String(tekst || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** Bestandsnaam zonder extensie ("9F37M7RQ+2X.mp3" → "9F37M7RQ+2X"). */
export function zonderExtensie(naam) {
  return String(naam || '').replace(/\.[^.]+$/, '')
}

/** Is dit bestand een audiobestand dat gekoppeld kan worden (mp3 of wav)? */
export function isAudioBestand(naam) {
  return /\.(mp3|wav)$/i.test(String(naam || '').trim())
}

/**
 * Dropbox-deellink → directe downloadlink: www.dropbox.com wordt
 * dl.dropboxusercontent.com, en de parameters dl en st (verlopen) gaan eruit.
 * Andere links blijven ongewijzigd (alleen spaties en aanhalingstekens weg).
 */
export function directeLink(url) {
  let u = String(url || '')
    .trim()
    .replace(/['"]/g, '')
  if (!u) return ''
  if (!/dropbox\.com/i.test(u)) return u
  u = u.replace(/\/\/(www\.)?dropbox\.com/i, '//dl.dropboxusercontent.com')
  try {
    const obj = new URL(u)
    obj.searchParams.delete('dl')
    obj.searchParams.delete('st')
    return obj.toString()
  } catch {
    return u.replace(/[?&]st=[^&]*/g, '').replace(/[?&]dl=0/g, '')
  }
}

/**
 * Sleutels waarop lokale audiobestanden aan een eigen POI worden gekoppeld:
 * de pluscode uit de CSV (als die er stond) en de uit lat/lng berekende
 * pluscode, beide genormaliseerd en zonder dubbelingen.
 *
 * @param {string} csvPluscode - pluscode-kolom uit de CSV (mag leeg zijn)
 * @param {string} berekend - pluscode berekend uit lat/lng
 * @returns {string[]}
 */
export function koppelSleutels(csvPluscode, berekend) {
  const sleutels = []
  for (const s of [csvPluscode, berekend]) {
    const n = normPluscode(s)
    if (n && !sleutels.includes(n)) sleutels.push(n)
  }
  return sleutels
}

/**
 * Afspeelbronnen van een POI, in volgorde: gekoppeld lokaal bestand,
 * gedownloade kopie van de link, dan de link zelf (alleen als online).
 *
 * @param {{mp3?: string, audioLokaal?: {url: string, naam: string}|null,
 *   audioKopie?: {url: string}|null}} poi
 * @param {boolean} online - navigator.onLine
 * @returns {{bronnen: Array<{src: string, soort: 'lokaal'|'kopie'|'link', naam: string}>, overgeslagen: string}}
 *   overgeslagen: reden waarom een link niet geprobeerd wordt ('' als n.v.t.)
 */
export function audioBronnen(poi, online) {
  const bronnen = []
  let overgeslagen = ''
  if (!poi) return { bronnen, overgeslagen }
  if (poi.audioLokaal && poi.audioLokaal.url) {
    bronnen.push({ src: poi.audioLokaal.url, soort: 'lokaal', naam: poi.audioLokaal.naam || '' })
  }
  if (isLink(poi.mp3)) {
    const link = poi.mp3.trim()
    if (poi.audioKopie && poi.audioKopie.url) {
      bronnen.push({ src: poi.audioKopie.url, soort: 'kopie', naam: link })
    }
    if (online) {
      bronnen.push({ src: directeLink(link), soort: 'link', naam: link })
    } else {
      overgeslagen = 'link overgeslagen: geen internet'
    }
  }
  return { bronnen, overgeslagen }
}

/**
 * Bestandsnaam voor de gedownloade kopie van een link: een vaste hash van de
 * link (FNV-1a, 32 bits, hex) plus de extensie uit de link (mp3, wav, m4a,
 * ogg of aac; anders mp3). Dezelfde link geeft altijd dezelfde naam.
 *
 * @param {string} link
 * @returns {string} bijv. "1a2b3c4d.mp3"
 */
export function kopieNaam(link) {
  const tekst = String(link || '').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < tekst.length; i += 1) {
    h ^= tekst.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  let ext = 'mp3'
  try {
    const m = /\.([a-z0-9]{2,4})$/i.exec(new URL(tekst).pathname)
    if (m && ['mp3', 'wav', 'm4a', 'ogg', 'aac'].includes(m[1].toLowerCase())) ext = m[1].toLowerCase()
  } catch {
    // Geen geldige URL: standaard mp3.
  }
  return `${h.toString(16).padStart(8, '0')}.${ext}`
}

/**
 * Lijkt een download op audio? Een webpagina (bijv. een Dropbox-
 * voorbeeldpagina of een foutmelding) telt niet. Kijkt naar het
 * content-type en naar de eerste bytes (base64): ID3-kop of mp3-frame,
 * RIFF (wav), ftyp (m4a) of OggS.
 *
 * @param {string} contentType - Content-Type uit het antwoord (mag leeg zijn)
 * @param {string} base64 - inhoud als base64
 * @returns {boolean}
 */
export function lijktAudio(contentType, base64) {
  const type = String(contentType || '').toLowerCase()
  if (/text\/|html|json|xml/.test(type)) return false
  const b = String(base64 || '')
  if (b.length < 8) return false
  let kop
  try {
    kop = atob(b.slice(0, 16))
  } catch {
    return false
  }
  const c = (i) => kop.charCodeAt(i)
  if (kop.startsWith('ID3') || kop.startsWith('RIFF') || kop.startsWith('OggS')) return true
  if (kop.slice(4, 8) === 'ftyp') return true
  if (c(0) === 0xff && (c(1) & 0xe0) === 0xe0) return true // mp3/aac-frame
  return type.startsWith('audio/')
}

/** Bytes als tekst voor de gebruiker: "850 kB" of "12,3 MB". */
export function grootteTekst(bytes) {
  const n = Number(bytes) || 0
  if (n < 1000 * 1000) return `${Math.max(0, Math.round(n / 1000))} kB`
  return `${(n / (1000 * 1000)).toFixed(1).replace('.', ',')} MB`
}
