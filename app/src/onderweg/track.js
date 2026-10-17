/**
 * track.js
 *
 * Track van een rit in stap 8 "Onderweg" (0.18.0, keuze B2): elke ontvangen
 * GPS-meting (ruw, met de uitkomst van het positiefilter) en elke getoonde
 * (gefilterde) positie. Na afloop te delen als GPX-bestand met:
 *   - trk "Gefilterd": de positie zoals WikiPoi die gebruikte (pointer,
 *     trigger);
 *   - trk "Ruw": alle metingen zoals de telefoon ze leverde;
 *   - wpt per weggegooide meting ("weggegooid: nauwkeurigheid 43 m" of
 *     "weggegooid: sprong"), om het filter te beoordelen.
 *
 * De track wordt tijdens de rit om de OPSLAAN_MS bewaard (localStorage),
 * zodat hij ook na een herstart van de app nog te delen is. Puur en in Node
 * te testen (test-track.js): opslag en klok zijn in te spuiten.
 *
 * Pauze (0.18.1, keuze P1–P4): blijft de gefilterde positie PAUZE_NA_MS
 * binnen PAUZE_STRAAL_M van het laatste bewegingspunt, dan pauzeert de
 * opname (ook de ruwe metingen); zodra de positie meer dan HERVAT_M van het
 * pauzepunt af is, gaat hij verder in een nieuw segment (GPX <trkseg>, op de
 * kaart een gat). Werkt ook als er geen posities binnenkomen (tik(), elke
 * seconde vanuit useOnderweg). Een pauze korter dan KORTE_PAUZE_MS telt niet
 * (geen nieuw segment): zo knipt langzaam wandelen de track niet in stukjes.
 * Pauzes: data.pauzes = [{ van, tot, start, eind, lat, lng }]; tot = tijd
 * (GPS-klok) van het eerste punt na de pauze, start/eind = klok van het
 * toestel (voor de duur). Een punt hoort bij segment n = aantal pauzes met
 * tot <= tijd van het punt.
 *
 * 0.19.1 (testrit 17-10, ± 260 pauzes in 40 min):
 *   P5 Pauze alleen bij aantoonbaar stilstaan: minstens PAUZE_MIN_POSITIES
 *      gefilterde posities, PAUZE_NA_MS lang, alle binnen PAUZE_STRAAL_M.
 *      Uitblijvende posities (weggegooide metingen) geven geen pauze meer;
 *      tik() is alleen nog voor de simulatie.
 *   P6 Een pauze telt pas vanaf KORTE_PAUZE_MS (20 s); pauzeTelt() zegt of
 *      de lopende pauze al zo lang duurt.
 *   P7 Metingen tijdens een pauze worden niet als losse punten opgenomen
 *      (geen kluwen in de GPX), maar samengevat in de pauze: aantal,
 *      mediaan nauwkeurigheid en grootste afstand tot het pauzepunt; in de
 *      GPX als <desc> bij de wpt "pauze (…)".
 *   F1 Elk punt van de ruwe track krijgt zijn nauwkeurigheid als <desc>.
 */

export const OPSLAG_SLEUTEL = 'wikipoi-track'
export const MAX_PUNTEN = 20000
export const MAX_WEGGEGOOID_WPT = 2000
export const OPSLAAN_MS = 30000
export const PAUZE_NA_MS = 3000
export const PAUZE_STRAAL_M = 5
export const HERVAT_M = 8
export const KORTE_PAUZE_MS = 20000
export const PAUZE_MIN_POSITIES = 3
// Hoogstens zoveel nauwkeurigheden per pauze bewaren (voor de mediaan).
const MAX_PAUZE_METINGEN = 1000

// Statuscodes in de compacte opslag.
const CODE = { geaccepteerd: 'g', nauwkeurigheid: 'n', sprong: 's' }
const UIT_CODE = { g: 'geaccepteerd', n: 'nauwkeurigheid', s: 'sprong' }

function standaardOpslag() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Geen opslag (privévenster e.d.).
  }
  return null
}

const rond = (x, n) => (Number.isFinite(x) ? Number(x.toFixed(n)) : null)

// Haversine in meters (zelfde formule als geo.js; hier los, zodat track.js
// zonder andere modules werkt).
function meters(a, b) {
  const r = (g) => (g * Math.PI) / 180
  const dLat = r(b.lat - a.lat)
  const dLng = r(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2
  return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function maakTrack({ nu = () => Date.now(), opslag = standaardOpslag() } = {}) {
  let data = null
  let laatstOpgeslagen = 0
  // Laatste bewegingspunt { lat, lng, ontvangen } en de lopende pauze.
  let anker = null
  let pauze = null
  let vorigePauze = null // laatst afgesloten pauze (ook een korte)

  function openPauze() {
    pauze = {
      van: null,
      tot: null,
      start: nu(),
      eind: null,
      lat: rond(anker.lat, 6),
      lng: rond(anker.lng, 6),
      metingen: 0,
      nauw: [],
      maxAfstand: 0,
    }
    const laatste = data.gefilterd[data.gefilterd.length - 1]
    pauze.van = laatste ? laatste[0] : null
    data.pauzes.push(pauze)
    opslaan(true)
  }

  // Nauwkeurigheden tijdens de pauze samenvatten tot de mediaan (P7).
  function vatSamen(p) {
    if (Array.isArray(p.nauw)) {
      const n = p.nauw.slice().sort((a, b) => a - b)
      p.mediaanNauw = n.length ? rond(n[Math.floor(n.length / 2)], 1) : null
      delete p.nauw
    }
    p.maxAfstand = rond(p.maxAfstand, 1)
  }

  function sluitPauze(tijd) {
    pauze.tot = tijd
    pauze.eind = nu()
    vatSamen(pauze)
    if (pauze.eind - pauze.start < KORTE_PAUZE_MS) data.pauzes.pop()
    vorigePauze = pauze
    pauze = null
  }

  function opslaan(dwingend) {
    if (!opslag || !data) return
    if (!dwingend && nu() - laatstOpgeslagen < OPSLAAN_MS) return
    laatstOpgeslagen = nu()
    try {
      opslag.setItem(OPSLAG_SLEUTEL, JSON.stringify(data))
    } catch {
      // Opslag vol of niet beschikbaar: de track in het geheugen blijft.
    }
  }

  return {
    begin(bron) {
      data = { start: nu(), eind: null, bron: bron || '', ruw: [], gefilterd: [], pauzes: [] }
      laatstOpgeslagen = 0
      anker = null
      pauze = null
      vorigePauze = null
      opslaan(true)
    },
    /**
     * Ruwe meting met de uitkomst van het filter. Tijdens een pauze alleen
     * meegeteld in de samenvatting van de pauze (P7).
     */
    meting({ lat, lng, nauwkeurigheid, tijd }, status) {
      if (!data || !CODE[status]) return
      if (pauze) {
        pauze.metingen += 1
        if (Number.isFinite(nauwkeurigheid) && pauze.nauw.length < MAX_PAUZE_METINGEN) {
          pauze.nauw.push(nauwkeurigheid)
        }
        const d = meters(pauze, { lat, lng })
        if (Number.isFinite(d) && d > pauze.maxAfstand) pauze.maxAfstand = d
        return
      }
      if (data.ruw.length >= MAX_PUNTEN) return
      data.ruw.push([tijd || nu(), rond(lat, 6), rond(lng, 6), rond(nauwkeurigheid, 1), CODE[status]])
      opslaan(false)
    },
    /**
     * Getoonde (gefilterde) positie. Roep dit aan vóór meting() van dezelfde
     * GPS-meting, zodat die na het hervatten in het nieuwe segment komt.
     */
    positie({ lat, lng, tijd }) {
      if (!data || data.gefilterd.length >= MAX_PUNTEN) return
      const t = tijd || nu()
      const p = { lat, lng }
      if (pauze) {
        if (meters(pauze, p) <= HERVAT_M) return
        sluitPauze(t)
        anker = { lat, lng, ontvangen: nu() }
      } else if (!anker || meters(anker, p) > PAUZE_STRAAL_M) {
        anker = { lat, lng, ontvangen: nu(), aantal: 1 }
      } else {
        // P5: pas pauze na PAUZE_NA_MS én genoeg posities binnen de straal.
        anker.aantal = (anker.aantal || 1) + 1
        if (nu() - anker.ontvangen >= PAUZE_NA_MS && anker.aantal >= PAUZE_MIN_POSITIES) {
          openPauze()
          return
        }
      }
      data.gefilterd.push([t, rond(lat, 6), rond(lng, 6)])
      opslaan(false)
    },
    /** Elke seconde bij de simulatie: pauze ook zonder nieuwe posities (simulatie op pauze). */
    tik() {
      if (data && !pauze && anker && nu() - anker.ontvangen >= PAUZE_NA_MS) openPauze()
    },
    /** True zolang de opname gepauzeerd is (na 3 s stilstand). */
    gepauzeerd: () => !!pauze,
    /** True als de lopende pauze al KORTE_PAUZE_MS duurt (P6: dan telt hij). */
    pauzeTelt: () => !!pauze && nu() - pauze.start >= KORTE_PAUZE_MS,
    /** Laatst afgesloten pauze ({ start, eind, … }), of null. */
    laatstePauze: () => vorigePauze,
    stop() {
      if (!data) return
      // Een pauze die bij het stoppen nog loopt, is geen pauze maar het einde.
      if (pauze) data.pauzes.pop()
      pauze = null
      anker = null
      data.eind = nu()
      opslaan(true)
      data = null
    },
    /** Bewaarde track weggooien (niet tijdens een rit). */
    wis() {
      if (data || !opslag) return
      try {
        if (opslag.removeItem) opslag.removeItem(OPSLAG_SLEUTEL)
        else opslag.setItem(OPSLAG_SLEUTEL, '')
      } catch {
        // Niet te wissen: niets aan te doen.
      }
    },
    /** Lopende track (of null). */
    huidig: () => data,
    /** Laatst bewaarde track (ook van een eerdere sessie), of null. */
    laad() {
      if (!opslag) return data
      try {
        const tekst = opslag.getItem(OPSLAG_SLEUTEL)
        return tekst ? JSON.parse(tekst) : data
      } catch {
        return data
      }
    },
  }
}

/** Lijn voor de kaart: [[lat, lng], …] van de gefilterde posities. */
export function lijnVan(data) {
  return data && Array.isArray(data.gefilterd) ? data.gefilterd.map((p) => [p[1], p[2]]) : []
}

/** Afgesloten pauzes (tot bekend), ook bij een track van vóór 0.18.1. */
function afgeslotenPauzes(data) {
  return ((data && data.pauzes) || []).filter((p) => p && Number.isFinite(p.tot))
}

/** Punten ([t, …]) per segment: [[punt, …], …]; lege segmenten weggelaten. */
export function segmenteer(punten, data) {
  const grenzen = afgeslotenPauzes(data)
    .map((p) => p.tot)
    .sort((a, b) => a - b)
  const segmenten = []
  ;(punten || []).forEach((p) => {
    let n = 0
    while (n < grenzen.length && grenzen[n] <= p[0]) n += 1
    if (!segmenten[n]) segmenten[n] = []
    segmenten[n].push(p)
  })
  return segmenten.filter(Boolean)
}

/** Lijnen voor de kaart, één per segment: [[[lat, lng], …], …]. */
export function segmentenVan(data) {
  if (!data || !Array.isArray(data.gefilterd)) return []
  return segmenteer(data.gefilterd, data).map((seg) => seg.map((p) => [p[1], p[2]]))
}

/** Lengte van de gefilterde track in meters (zonder de sprongen over pauzes). */
export function lengteVan(data, afstand) {
  let m = 0
  segmentenVan(data).forEach((lijn) => {
    for (let i = 1; i < lijn.length; i++) {
      const d = afstand({ lat: lijn[i - 1][0], lng: lijn[i - 1][1] }, { lat: lijn[i][0], lng: lijn[i][1] })
      if (Number.isFinite(d)) m += d
    }
  })
  return m
}

/** Pauzes en tijd onderweg: { aantal, pauzeMs, onderwegMs } (onderwegMs null bij lopende rit). */
export function pauzesVan(data) {
  const pauzes = afgeslotenPauzes(data)
  const pauzeMs = pauzes.reduce((som, p) => som + Math.max(0, (p.eind || 0) - (p.start || 0)), 0)
  const onderwegMs = data && data.eind && data.start ? Math.max(0, data.eind - data.start - pauzeMs) : null
  return { aantal: pauzes.length, pauzeMs, onderwegMs }
}

/** Telling per status van de ruwe metingen. */
export function tellingVan(data) {
  const t = { geaccepteerd: 0, nauwkeurigheid: 0, sprong: 0 }
  ;((data && data.ruw) || []).forEach((p) => {
    const s = UIT_CODE[p[4]]
    if (s) t[s] += 1
  })
  return t
}

function xml(tekst) {
  return String(tekst)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const isoTijd = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

// F1: met nauwkeurigheid (ruwe track) als <desc>"±23 m"</desc>.
function trkpt(lat, lng, tijd, nauw) {
  const desc = Number.isFinite(nauw) ? `<desc>±${Math.round(nauw)} m</desc>` : ''
  return `      <trkpt lat="${lat}" lon="${lng}"><time>${isoTijd(tijd)}</time>${desc}</trkpt>`
}

// Samenvatting van de metingen tijdens een pauze (P7), of ''.
function pauzeDesc(p) {
  if (!Number.isFinite(p.metingen) || p.metingen === 0) return ''
  const delen = [`${p.metingen} ${p.metingen === 1 ? 'meting' : 'metingen'} tijdens de pauze`]
  if (Number.isFinite(p.mediaanNauw)) delen.push(`mediaan ±${Math.round(p.mediaanNauw)} m`)
  if (Number.isFinite(p.maxAfstand)) delen.push(`tot ${Math.round(p.maxAfstand)} m van het pauzepunt`)
  return delen.join(', ')
}

/** Bestandsnaam: "WikiPoi-track-2026-10-16-1405.gpx" (lokale tijd). */
export function bestandsnaam(data) {
  const d = new Date(data && data.start ? data.start : Date.now())
  const twee = (n) => String(n).padStart(2, '0')
  return (
    `WikiPoi-track-${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}-` +
    `${twee(d.getHours())}${twee(d.getMinutes())}.gpx`
  )
}

/** GPX 1.1 met de tracks "Gefilterd" en "Ruw" en de weggegooide metingen als wpt. */
export function alsGpx(data, { maker = 'WikiPoi', naam = 'WikiPoi-rit' } = {}) {
  if (!data) return ''
  const regels = []
  regels.push('<?xml version="1.0" encoding="UTF-8"?>')
  regels.push(
    `<gpx version="1.1" creator="${xml(maker)}" xmlns="http://www.topografix.com/GPX/1/1">`
  )
  regels.push('  <metadata>')
  regels.push(`    <name>${xml(naam)}</name>`)
  regels.push(`    <time>${isoTijd(data.start)}</time>`)
  regels.push(`    <desc>${xml('Bron: ' + (data.bron || '?'))}</desc>`)
  regels.push('  </metadata>')
  let wpt = 0
  ;(data.ruw || []).forEach(([t, lat, lng, nauw, code]) => {
    if (code === 'g' || wpt >= MAX_WEGGEGOOID_WPT || lat === null || lng === null) return
    wpt += 1
    const reden =
      code === 'n' ? `nauwkeurigheid ${nauw === null ? '?' : Math.round(nauw)} m` : `sprong (± ${nauw === null ? '?' : Math.round(nauw)} m)`
    regels.push(
      `  <wpt lat="${lat}" lon="${lng}"><time>${isoTijd(t)}</time><name>${xml('weggegooid: ' + reden)}</name></wpt>`
    )
  })
  afgeslotenPauzes(data).forEach((p) => {
    if (p.lat === null || p.lng === null || !Number.isFinite(p.start)) return
    const ms = (p.eind || p.start) - p.start
    const duur = ms < 59500 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`
    const desc = pauzeDesc(p)
    regels.push(
      `  <wpt lat="${p.lat}" lon="${p.lng}"><time>${isoTijd(p.start)}</time><name>${xml(`pauze (${duur})`)}</name>` +
        (desc ? `<desc>${xml(desc)}</desc>` : '') +
        '</wpt>'
    )
  })
  const trk = (titel, punten, metNauw) => {
    regels.push('  <trk>')
    regels.push(`    <name>${xml(titel)}</name>`)
    const segmenten = segmenteer(punten, data)
    ;(segmenten.length ? segmenten : [[]]).forEach((seg) => {
      regels.push('    <trkseg>')
      seg.forEach((p) => {
        if (p[1] !== null && p[2] !== null) regels.push(trkpt(p[1], p[2], p[0], metNauw ? p[3] : null))
      })
      regels.push('    </trkseg>')
    })
    regels.push('  </trk>')
  }
  trk('Gefilterd', data.gefilterd || [])
  trk('Ruw (alle metingen)', data.ruw || [], true)
  regels.push('</gpx>')
  return regels.join('\n') + '\n'
}

export const track = maakTrack()
