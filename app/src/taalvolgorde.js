/**
 * taalvolgorde.js
 *
 * Taal van de teksten (0.17.0): in welke talen, in welke volgorde WikiPoi
 * Wikipedia-artikelen en namen zoekt. Los van App.jsx, zodat het zonder
 * React en zonder netwerk te testen is (test-taalvolgorde.js).
 *
 * Twee keuzes (stap 2, onder "Zoeken in"):
 *   'auto'  — telefoontaal → taal van het land van de route → en → fr → de
 *             (standaard). De taal van het land komt uit Wikidata
 *             (wikidata-search.js#fetchLandTaal); lukt dat niet, dan zonder.
 *   'eigen' — een eigen lijst (1 tot MAX_TALEN talen uit TAAL_KEUZES), in de
 *             volgorde van de gebruiker.
 *
 * De eerste taal van de volgorde is ook de taal waarin "artikel via de
 * ligging" zoekt (artikel-via-ligging.js).
 *
 * De keuze wordt bewaard (localStorage, sleutel wikipoi.taalkeuze, JSON).
 * Lukt bewaren of lezen niet, dan geldt de standaardkeuze.
 */

import { t, heeft } from './vertaal.js'

export const MAX_TALEN = 6

// Talen in de lijst bij "Eigen volgorde".
export const TAAL_KEUZES = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'da', 'sv', 'pl']

// Terugvaltalen na telefoontaal en landtaal (zoals vóór 0.17.0).
export const TERUGVAL_TALEN = ['en', 'fr', 'de']

// Namen van de talen voor de bediening: taal.<code> in talen/*.js (0.23.0).
// Onbekende codes: de code zelf.

const TAALCODE_RE = /^[a-z]{2,3}$/
const SLEUTEL = 'wikipoi.taalkeuze'

export const STANDAARD_TAALKEUZE = Object.freeze({ modus: 'auto', talen: [] })

/** Basistaal in kleine letters: 'nl-NL' → 'nl', 'fr_BE' → 'fr'. */
export function basis(code) {
  return String(code || '').trim().toLowerCase().replace(/_/g, '-').split('-')[0]
}

/** Naam van een taal in de taal van de bediening: 'de' → 'Duits' (nl). */
export function taalNaam(code) {
  const b = basis(code)
  return heeft(`taal.${b}`) ? t(`taal.${b}`) : b
}

/** Unieke, geldige basistalen, hoogstens MAX_TALEN, in volgorde. */
function uniek(codes) {
  const uit = []
  for (const c of codes) {
    const b = basis(c)
    if (!TAALCODE_RE.test(b) || uit.includes(b)) continue
    uit.push(b)
    if (uit.length >= MAX_TALEN) break
  }
  return uit
}

/**
 * Automatische volgorde: telefoontaal → landtaal → en → fr → de.
 * @param {string} telefoon - bijv. 'nl-NL'
 * @param {?string} landTaal - bijv. 'fr', of null als onbekend
 * @returns {string[]}
 */
export function automatischeVolgorde(telefoon, landTaal) {
  return uniek([telefoon, landTaal, ...TERUGVAL_TALEN].filter(Boolean))
}

/** Eigen lijst opschonen: alleen TAAL_KEUZES, uniek, hoogstens MAX_TALEN. */
export function schoonTalen(talen) {
  if (!Array.isArray(talen)) return []
  return uniek(talen).filter((c) => TAAL_KEUZES.includes(c))
}

/** Een geldige keuze; ongeldige delen → standaard. */
export function schoonKeuze(keuze) {
  if (!keuze || typeof keuze !== 'object') return STANDAARD_TAALKEUZE
  const talen = schoonTalen(keuze.talen)
  if (keuze.modus === 'eigen' && talen.length > 0) return { modus: 'eigen', talen }
  return { modus: 'auto', talen }
}

/**
 * De volgorde die bij het zoeken geldt.
 * @param {{modus:string, talen:string[]}} keuze
 * @param {string} telefoon
 * @param {?string} landTaal - alleen gebruikt bij 'auto'
 */
export function effectieveVolgorde(keuze, telefoon, landTaal) {
  const k = schoonKeuze(keuze)
  if (k.modus === 'eigen') return k.talen
  return automatischeVolgorde(telefoon, landTaal)
}

/**
 * Beginlijst bij overschakelen naar "Eigen volgorde": de eerder bewaarde
 * eigen lijst, anders de automatische volgorde (zonder landtaal), beperkt
 * tot TAAL_KEUZES.
 */
export function beginTalen(keuze, telefoon) {
  const k = schoonKeuze(keuze)
  if (k.talen.length > 0) return k.talen
  const auto = schoonTalen(automatischeVolgorde(telefoon, null))
  return auto.length > 0 ? auto : ['nl', 'en']
}

/**
 * Rijen voor de lijst bij "Eigen volgorde": eerst de gekozen talen in hun
 * volgorde, daarna de overige uit TAAL_KEUZES.
 * @returns {Array<{code:string, naam:string, gekozen:boolean}>}
 */
export function lijstRijen(talen) {
  const gekozen = schoonTalen(talen)
  const rest = TAAL_KEUZES.filter((c) => !gekozen.includes(c))
  return [
    ...gekozen.map((code) => ({ code, naam: taalNaam(code), gekozen: true })),
    ...rest.map((code) => ({ code, naam: taalNaam(code), gekozen: false })),
  ]
}

/** Taal aan- of uitzetten (aan: achteraan). Nooit minder dan 1, nooit meer dan MAX_TALEN. */
export function wisselTaal(talen, code) {
  const lijst = schoonTalen(talen)
  if (lijst.includes(code)) return lijst.length > 1 ? lijst.filter((c) => c !== code) : lijst
  if (!TAAL_KEUZES.includes(code) || lijst.length >= MAX_TALEN) return lijst
  return [...lijst, code]
}

/** Gekozen taal één plek omhoog (stap -1) of omlaag (stap 1). */
export function verplaatsTaal(talen, code, stap) {
  const lijst = schoonTalen(talen)
  const i = lijst.indexOf(code)
  const j = i + stap
  if (i < 0 || j < 0 || j >= lijst.length) return lijst
  const uit = [...lijst]
  ;[uit[i], uit[j]] = [uit[j], uit[i]]
  return uit
}

/** "Nederlands → Engels → Frans" */
export function volgordeTekst(talen) {
  return (talen || []).map(taalNaam).join(' → ')
}

function opslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function leesTaalKeuze() {
  try {
    const s = opslag()
    const tekst = s ? s.getItem(SLEUTEL) : null
    return tekst ? schoonKeuze(JSON.parse(tekst)) : STANDAARD_TAALKEUZE
  } catch {
    return STANDAARD_TAALKEUZE
  }
}

export function bewaarTaalKeuze(keuze) {
  try {
    const s = opslag()
    if (s) s.setItem(SLEUTEL, JSON.stringify(schoonKeuze(keuze)))
  } catch {
    // Bewaren is een gemak, geen voorwaarde.
  }
}
