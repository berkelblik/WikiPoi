/**
 * taal.js
 *
 * Taalhulpjes voor WikiPoi.
 *
 * - APP_TAAL: taal van de bediening. De app is (nog) alleen Nederlandstalig;
 *   bij een latere vertaling van de bediening verandert dit mee. Ook de
 *   terugvaltaal als voorlezen in een andere taal niet lukt.
 * - telefoonTaal(): taal van het toestel (navigator.language), gebruikt als
 *   voorkeurstaal voor Wikipedia-artikelen en Wikidata-namen en voor de
 *   klokrichting onderweg.
 * - klokZin(): korte zin met de klokrichting ("Auf 3 Uhr.") in de taal van
 *   het toestel, voor de aankondiging onderweg.
 * - afstandZin(): begin van de aankondiging van een POI die ver weg ligt
 *   ("Op 900 meter:"), in de taal van het toestel (0.19.3, T3b).
 * - toelichtingTaal(): in welke taal de toelichting van een POI is, zodat
 *   die met een passende stem wordt voorgelezen.
 * - labelTaal(): in welke taal de naam van een POI is, voor het uitspreken
 *   van de naam bij POI's zonder toelichting.
 */

export const APP_TAAL = 'nl-NL'

const TAALCODE_RE = /^[a-z]{2,3}(-[a-z0-9]+)*$/i

/** Volledige taalcode van het toestel, bijv. 'nl-NL' of 'it-IT'. */
export function telefoonTaal() {
  const t = typeof navigator !== 'undefined' && navigator.language
  return t && TAALCODE_RE.test(t) ? t : APP_TAAL
}

/** Alleen de taal, zonder regio: 'fr-BE' → 'fr'. */
export function basisTaal(code) {
  return String(code || '').toLowerCase().split('-')[0]
}

/** Taal uit een Wikipedia-URL: 'https://fr.wikipedia.org/wiki/…' → 'fr'. */
export function taalVanUrl(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.wikipedia\.org\//i.exec(url || '')
  return m ? m[1].toLowerCase() : null
}

// 'mul' (taalonafhankelijk label) en onbekende waarden zijn geen bruikbare
// voorleestaal.
function bruikbaar(code) {
  return code && code !== 'mul' && TAALCODE_RE.test(code) ? code : null
}

/**
 * Taal van de toelichting die voor een POI wordt voorgelezen/geëxporteerd:
 * - met samenvatting die zelf een taal meegeeft (zin uit Wikidata,
 *   gemeente-terugval): die taal;
 * - met samenvatting: de taal van het Wikipedia-artikel;
 * - anders: de taal van de Wikidata-omschrijving (xml:lang);
 * - onbekend: de taal van de telefoon.
 *
 * @param {object} poi
 * @param {{summary?:object}|null} entry - samenvatting uit stap 5, of null
 * @returns {string} taalcode, bijv. 'fr' of 'nl-NL'
 */
export function toelichtingTaal(poi, entry) {
  if (entry && entry.summary) {
    const t =
      bruikbaar(entry.summary.lang) ||
      bruikbaar(poi.articleLanguage) ||
      bruikbaar(taalVanUrl(poi.wikipediaUrl))
    if (t) return t
  } else {
    const t = bruikbaar(poi.descriptionLanguage)
    if (t) return t
  }
  return telefoonTaal()
}

/**
 * Taal van de naam (label) van een POI: de taal die de Wikidata-
 * labelservice meegaf (labelLanguage). Bij 'mul', onbekend of dezelfde
 * basistaal als het toestel: de taal van het toestel (met regio, bijv.
 * 'nl-NL', voor de juiste stem).
 *
 * @param {object} poi
 * @returns {string} taalcode, bijv. 'fr' of 'nl-NL'
 */
export function labelTaal(poi) {
  const t = bruikbaar(poi && poi.labelLanguage)
  const toestel = telefoonTaal()
  if (!t || basisTaal(t) === basisTaal(toestel)) return toestel
  return t
}

// Klokrichting per taal (basistaal van het toestel). Alleen talen waarvoor
// de zin met zekerheid klopt; voor andere talen vervalt de klokrichting.
// Getallen als cijfers: de stem van die taal spreekt ze zelf goed uit.
const KLOK_ZINNEN = {
  nl: (uur) => `Op ${uur} uur.`,
  de: (uur) => `Auf ${uur} Uhr.`,
  en: (uur) => `At ${uur} o'clock.`,
  fr: (uur) => (uur === 1 ? 'À 1 heure.' : `À ${uur} heures.`),
}

/**
 * Klokrichting als korte zin in de taal van het toestel.
 *
 * @param {number|null} uur - 1–12, of null/onbekend
 * @param {string} [taal] - taalcode; standaard telefoonTaal()
 * @returns {{tekst:string, lang:string}|null} null bij onbekende richting of
 *   een taal zonder vertaling
 */
export function klokZin(uur, taal = telefoonTaal()) {
  if (!Number.isInteger(uur) || uur < 1 || uur > 12) return null
  const maak = KLOK_ZINNEN[basisTaal(taal)]
  return maak ? { tekst: maak(uur), lang: taal } : null
}

/**
 * Afstand afgerond voor het uitspreken (0.19.3, T3b, keuze B1): onder 1 km
 * op 50 m, vanaf 1 km op 0,1 km.
 *
 * @param {number} meters
 * @returns {{eenheid:'m'|'km', waarde:number}|null} null bij een ongeldige afstand
 */
export function afstandAfgerond(meters) {
  if (!Number.isFinite(meters) || meters < 0) return null
  const m = Math.round(meters / 50) * 50
  if (m < 1000) return { eenheid: 'm', waarde: m }
  return { eenheid: 'km', waarde: Math.round(meters / 100) / 10 }
}

// Getal met decimale komma (behalve Engels); hele kilometers zonder ",0".
function getal(waarde, komma) {
  const t = Number.isInteger(waarde) ? String(waarde) : waarde.toFixed(1)
  return komma ? t.replace('.', ',') : t
}

// Afstandszin per taal (zelfde talen als KLOK_ZINNEN); eindigt op een
// dubbele punt, daarna volgt de naam.
const AFSTAND_ZINNEN = {
  nl: ({ eenheid, waarde }) =>
    eenheid === 'm' ? `Op ${waarde} meter:` : `Op ${getal(waarde, true)} kilometer:`,
  de: ({ eenheid, waarde }) =>
    eenheid === 'm'
      ? `In ${waarde} Metern:`
      : `In ${getal(waarde, true)} ${waarde === 1 ? 'Kilometer' : 'Kilometern'}:`,
  en: ({ eenheid, waarde }) =>
    eenheid === 'm'
      ? `${waarde} metres away:`
      : `${getal(waarde, false)} ${waarde === 1 ? 'kilometre' : 'kilometres'} away:`,
  fr: ({ eenheid, waarde }) =>
    eenheid === 'm'
      ? `À ${waarde} mètres :`
      : `À ${getal(waarde, true)} ${waarde < 2 ? 'kilomètre' : 'kilomètres'} :`,
}

/**
 * Afstand tot de POI als begin van de aankondiging ("Op 900 meter:"), in de
 * taal van het toestel. Of de afstand genoemd wordt (drempel) beslist
 * voorleestekst.js.
 *
 * @param {number} meters
 * @param {string} [taal] - taalcode; standaard telefoonTaal()
 * @returns {{tekst:string, lang:string}|null} null bij een ongeldige afstand
 *   of een taal zonder vertaling
 */
export function afstandZin(meters, taal = telefoonTaal()) {
  const a = afstandAfgerond(meters)
  const maak = AFSTAND_ZINNEN[basisTaal(taal)]
  return a && maak ? { tekst: maak(a), lang: taal } : null
}
