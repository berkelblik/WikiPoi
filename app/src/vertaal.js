/**
 * vertaal.js
 *
 * Vertaling van de bediening (0.23.0, onderwerp 6, keuzes A1–F1).
 *
 * - Per taal een bestand in talen/ (nl.js, en.js; later de.js, fr.js) met
 *   platte sleutels ('stap1.titel') en een meervoudsregel.
 * - t('sleutel', { aantal, naam, … }): de tekst in de bedieningstaal, met
 *   {naam} vervangen door de waarde. Een tekst kan een meervoud hebben:
 *   { een: '…', meer: '…' }; welke vorm geldt, bepaalt de meervoudsregel
 *   van de taal met de waarde 'aantal'. Ontbreekt een sleutel in de taal,
 *   dan het Nederlands, en anders de sleutel zelf (valt op).
 * - Vet: **tekst** (zie rijk.jsx); in t() blijven de sterretjes staan.
 * - Taal: keuze 'auto' (taal van de telefoon; nl/en/de/fr, andere → Engels)
 *   of een vaste taal (instelling 'taal', B1). Een taal waarvan het bestand
 *   er (nog) niet is, valt terug op Engels.
 * - Zolang zetTaal() niet is aangeroepen (bijv. in de tests in Node) is de
 *   bediening Nederlands en volgt het voorlezen de telefoon, zoals vóór 0.23.0.
 *
 * Gesproken aankondigingen (E1): stemTaal() is de stem van de bedieningstaal
 * ('nl-NL', 'en-GB', …); spreekTaal() is bij 'auto' de taal van de telefoon
 * (ongewijzigd), anders stemTaal().
 *
 * Puur (geen React), zodat het in Node te testen is (test-vertaling.js).
 */
import nl from './talen/nl.js'
import en from './talen/en.js'

export const TALEN = { nl, en }

/** Talen waarin de bediening er is, in volgorde van de keuzelijst. */
export const BEDIENINGS_TALEN = ['nl', 'en', 'de', 'fr'].filter((c) => TALEN[c])

/** Mogelijke waarden van de instelling 'taal' (ook talen die nog komen). */
export const TAAL_INSTELLINGEN = ['auto', 'nl', 'en', 'de', 'fr']

/** Naam van elke taal in die taal zelf (keuzeknoppen Instellingen). */
export const EIGEN_NAAM = { nl: 'Nederlands', en: 'English', de: 'Deutsch', fr: 'Français' }

// Stem per bedieningstaal als de telefoon een andere taal heeft.
const STEM = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR' }

const TERUGVAL = 'en'
const BRON = 'nl'

let keuze = 'auto'
let actief = BRON
let gezet = false

function basis(code) {
  return String(code || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .split('-')[0]
}

function navigatorTaal() {
  return typeof navigator !== 'undefined' && navigator.language ? String(navigator.language) : ''
}

/** Bedieningstaal bij 'auto': de telefoontaal als die er is, anders Engels. */
export function automatischeTaal(telefoon = navigatorTaal()) {
  const b = basis(telefoon)
  return TALEN[b] ? b : TERUGVAL
}

/** Bedieningstaal bij een keuze ('auto', 'nl', …). */
export function taalVoorKeuze(k, telefoon = navigatorTaal()) {
  if (k === 'auto' || !TAAL_INSTELLINGEN.includes(k)) return automatischeTaal(telefoon)
  return TALEN[k] ? k : TERUGVAL
}

/** Instelling 'taal' toepassen; geeft de bedieningstaal terug. */
export function zetTaal(k) {
  keuze = TAAL_INSTELLINGEN.includes(k) ? k : 'auto'
  actief = taalVoorKeuze(keuze)
  gezet = true
  return actief
}

/** Huidige bedieningstaal: 'nl', 'en', … */
export function bedieningsTaal() {
  return actief
}

/** Huidige keuze ('auto', 'nl', …). */
export function taalKeuze() {
  return keuze
}

/** Stem (taalcode met regio) van de bedieningstaal. */
export function stemTaal() {
  const tel = navigatorTaal()
  if (tel && basis(tel) === actief && /^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(tel)) return tel
  return STEM[actief] || 'nl-NL'
}

/**
 * Taal van klokzin en afstandszin (E1): bij 'auto' (of nog niet gezet) de
 * taal van de telefoon, zoals vóór 0.23.0; anders de stem van de gekozen
 * bedieningstaal. null = geen voorkeur (taal.js neemt dan de telefoontaal).
 */
export function spreekTaal() {
  return !gezet || keuze === 'auto' ? null : stemTaal()
}

function vorm(taal, waarde, params) {
  if (waarde && typeof waarde === 'object') {
    const n = params && Number(params.aantal)
    const regel = TALEN[taal] && TALEN[taal].meervoud
    const welke = regel && Number.isFinite(n) ? regel(n) : 'meer'
    return waarde[welke] !== undefined ? waarde[welke] : waarde.meer
  }
  return waarde
}

function vul(tekst, params) {
  if (!params) return tekst
  return tekst.replace(/\{(\w+)\}/g, (heel, naam) =>
    params[naam] === undefined || params[naam] === null ? heel : String(params[naam])
  )
}

/** Tekst in een bepaalde taal (bijv. het logboek: altijd 'nl'). */
export function tIn(taal, sleutel, params) {
  const pakket = TALEN[taal] || TALEN[BRON]
  let waarde = pakket.teksten[sleutel]
  let bron = taal
  if (waarde === undefined) {
    waarde = TALEN[BRON].teksten[sleutel]
    bron = BRON
  }
  if (waarde === undefined) return sleutel
  const tekst = vorm(bron, waarde, params)
  return typeof tekst === 'string' ? vul(tekst, params) : sleutel
}

/** Tekst in de bedieningstaal. */
export function t(sleutel, params) {
  return tIn(actief, sleutel, params)
}

/** Bestaat de sleutel (in de bedieningstaal of het Nederlands)? */
export function heeft(sleutel) {
  return (TALEN[actief] && sleutel in TALEN[actief].teksten) || sleutel in TALEN[BRON].teksten
}

/**
 * Getal met de decimaalteken van de bedieningstaal: getal(1.5, 1) →
 * '1,5' (nl) of '1.5' (en). Zonder decimalen: zoals het is (2 → '2',
 * 0.5 → '0,5').
 */
export function getal(waarde, decimalen) {
  const tekst = Number.isInteger(decimalen) ? Number(waarde).toFixed(decimalen) : String(waarde)
  const punt = TALEN[actief] && TALEN[actief].decimaal === '.'
  return punt ? tekst : tekst.replace('.', ',')
}

/**
 * Getal als woord (voor gesproken en korte teksten): telwoord(2) → 'twee'
 * (nl) of 'two' (en); boven de lijst van de taal het cijfer. hoofdletter:
 * eerste letter als hoofdletter ('Twee').
 */
export function telwoord(n, hoofdletter = false) {
  const lijst = (TALEN[actief] && TALEN[actief].telwoorden) || TALEN[BRON].telwoorden
  const w = Number.isInteger(n) && n >= 0 && n < lijst.length ? lijst[n] : String(n)
  return hoofdletter ? w.charAt(0).toUpperCase() + w.slice(1) : w
}
