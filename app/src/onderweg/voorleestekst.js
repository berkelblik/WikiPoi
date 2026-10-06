/**
 * voorleestekst.js
 *
 * Pure functies (zonder React of geluid) voor de tekst die bij een POI wordt
 * voorgelezen (stap 7) en geëxporteerd (stap 6, kolom desc), zodat beide
 * dezelfde regel volgen. Netwerkloze test: test-voorleestekst.js.
 *
 * Naam bij het voorlezen (0.13.0): een zin uit Wikidata begint met het soort
 * object ("Oorlogsmonument, ter herdenking …") en noemt de naam niet; ook
 * eigen beschrijvingen doen dat vaak niet. Daarom komt de naam vóór de
 * toelichting als die er nog niet in staat (keuze 1B). Volgorde: klokzin →
 * naam → toelichting (keuze 2A). Wikipedia-samenvattingen beginnen meestal
 * met de naam en blijven dan ongewijzigd.
 */
import { basisTaal, klokZin, labelTaal, toelichtingTaal } from '../taal.js'

// Kleine letters, zonder accenten, leestekens als spatie, enkele spaties.
function vergelijkbaar(tekst) {
  return String(tekst || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * Staat de naam al in de tekst? Vergelijking zonder hoofdletters, accenten
 * en leestekens, op hele woorden ("Kerk" telt niet in "kerkgebouw"). Een
 * toevoeging tussen haakjes aan het eind van de naam ("Sint-Jan (Laren)")
 * hoeft niet in de tekst te staan.
 *
 * @param {string} naam
 * @param {string} tekst
 * @returns {boolean} true als de naam erin staat (of er geen naam is)
 */
export function naamInTekst(naam, tekst) {
  const volledig = vergelijkbaar(naam)
  if (!volledig) return true
  const t = ` ${vergelijkbaar(tekst)} `
  if (t.includes(` ${volledig} `)) return true
  const kern = vergelijkbaar(String(naam).replace(/\s*\([^()]*\)\s*$/, ''))
  return Boolean(kern) && kern !== volledig && t.includes(` ${kern} `)
}

/** Naam als zin: met een punt, tenzij die al op . ! of ? eindigt. */
export function naamZin(naam) {
  const n = String(naam || '').trim()
  if (!n) return ''
  return /[.!?…]$/.test(n) ? n : `${n}.`
}

/**
 * Tekst voor de CSV-export (desc): "Naam. Toelichting" als de naam niet al
 * in de toelichting staat. Zonder toelichting leeg (EuroPoi leest dan zelf
 * de naam).
 *
 * @param {string} naam
 * @param {string} toelichting
 * @returns {string}
 */
export function tekstMetNaam(naam, toelichting) {
  const t = String(toelichting || '').trim()
  if (!t) return ''
  if (naamInTekst(naam, t)) return t
  return `${naamZin(naam)} ${t}`
}

/**
 * Toelichting van een POI: de samenvatting uit stap 5 (Wikipedia of zin uit
 * Wikidata), anders de eigen beschrijving of de Wikidata-omschrijving.
 * Dezelfde keuze als de CSV-export.
 */
export function toelichtingVan(poi, samenvattingen) {
  const entry = samenvattingen ? samenvattingen[poi.id] || null : null
  return (entry && entry.summary ? entry.summary.extractShort || '' : poi.description || '').trim()
}

// Opeenvolgende delen met dezelfde basistaal samenvoegen tot één deel (één
// stem, geen pauze); de taalcode van het laatste deel blijft.
function voegSamen(delen) {
  const uit = []
  delen.forEach((deel) => {
    const vorig = uit[uit.length - 1]
    if (vorig && basisTaal(vorig.lang) === basisTaal(deel.lang)) {
      uit[uit.length - 1] = { tekst: `${vorig.tekst} ${deel.tekst}`, lang: deel.lang }
    } else {
      uit.push(deel)
    }
  })
  return uit
}

/**
 * Wat er bij een POI wordt voorgelezen, als lijst van delen
 * { tekst, lang } (elk deel met de stem van zijn taal):
 * - klokrichting ("Op 3 uur.") in de taal van het toestel, als die richting
 *   bekend is en er een vertaling voor die taal is (taal.js, klokZin);
 * - naam, in de taal van het label, als die niet al in de toelichting staat;
 * - toelichting, in de taal van die tekst.
 * Zonder toelichting: naam en dan klokrichting (de bel zegt anders niets).
 * Delen met dezelfde basistaal worden één deel.
 *
 * @param {object} poi
 * @param {object|null} samenvattingen - per POI-id { summary, … } uit stap 5
 * @param {number|null} klok - klokrichting 1–12, of null (eco, terugval)
 * @returns {{tekst:string, lang:string}[]}
 */
export function voorleesDelen(poi, samenvattingen, klok) {
  const entry = samenvattingen ? samenvattingen[poi.id] || null : null
  const beschrijving = toelichtingVan(poi, samenvattingen)
  const richting = klokZin(klok)
  const naam = naamZin(poi.label)
  const naamDeel = naam ? { tekst: naam, lang: labelTaal(poi) } : null
  if (!beschrijving) {
    return voegSamen([naamDeel, richting].filter(Boolean))
  }
  const toelichting = { tekst: beschrijving, lang: toelichtingTaal(poi, entry) }
  const metNaam = naamDeel && !naamInTekst(poi.label, beschrijving) ? naamDeel : null
  return voegSamen([richting, metNaam, toelichting].filter(Boolean))
}
