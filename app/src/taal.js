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
 * - toelichtingTaal(): in welke taal de toelichting van een POI is, zodat
 *   die met een passende stem wordt voorgelezen.
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
