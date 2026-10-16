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
 */

export const OPSLAG_SLEUTEL = 'wikipoi-track'
export const MAX_PUNTEN = 20000
export const MAX_WEGGEGOOID_WPT = 2000
export const OPSLAAN_MS = 30000

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

export function maakTrack({ nu = () => Date.now(), opslag = standaardOpslag() } = {}) {
  let data = null
  let laatstOpgeslagen = 0

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
      data = { start: nu(), eind: null, bron: bron || '', ruw: [], gefilterd: [] }
      laatstOpgeslagen = 0
      opslaan(true)
    },
    /** Ruwe meting met de uitkomst van het filter. */
    meting({ lat, lng, nauwkeurigheid, tijd }, status) {
      if (!data || data.ruw.length >= MAX_PUNTEN || !CODE[status]) return
      data.ruw.push([tijd || nu(), rond(lat, 6), rond(lng, 6), rond(nauwkeurigheid, 1), CODE[status]])
      opslaan(false)
    },
    /** Getoonde (gefilterde) positie. */
    positie({ lat, lng, tijd }) {
      if (!data || data.gefilterd.length >= MAX_PUNTEN) return
      data.gefilterd.push([tijd || nu(), rond(lat, 6), rond(lng, 6)])
      opslaan(false)
    },
    stop() {
      if (!data) return
      data.eind = nu()
      opslaan(true)
      data = null
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

/** Lengte van de gefilterde track in meters. */
export function lengteVan(data, afstand) {
  const lijn = lijnVan(data)
  let m = 0
  for (let i = 1; i < lijn.length; i++) {
    const d = afstand({ lat: lijn[i - 1][0], lng: lijn[i - 1][1] }, { lat: lijn[i][0], lng: lijn[i][1] })
    if (Number.isFinite(d)) m += d
  }
  return m
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

function trkpt(lat, lng, tijd) {
  return `      <trkpt lat="${lat}" lon="${lng}"><time>${isoTijd(tijd)}</time></trkpt>`
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
  const trk = (titel, punten) => {
    regels.push('  <trk>')
    regels.push(`    <name>${xml(titel)}</name>`)
    regels.push('    <trkseg>')
    punten.forEach((p) => {
      if (p[1] !== null && p[2] !== null) regels.push(trkpt(p[1], p[2], p[0]))
    })
    regels.push('    </trkseg>')
    regels.push('  </trk>')
  }
  trk('Gefilterd', data.gefilterd || [])
  trk('Ruw (alle metingen)', data.ruw || [])
  regels.push('</gpx>')
  return regels.join('\n') + '\n'
}

export const track = maakTrack()
