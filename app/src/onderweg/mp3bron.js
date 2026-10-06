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
 * Afspeelvolgorde (zoals EuroPoi, zonder ElevenLabs): link (alleen online)
 * → lokaal bestand → voorlezen. Het afspelen zelf staat in spreek.js.
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
 * Afspeelbronnen van een POI, in volgorde: link (alleen als online), dan
 * het gekoppelde lokale bestand.
 *
 * @param {{mp3?: string, audioLokaal?: {url: string, naam: string}|null}} poi
 * @param {boolean} online - navigator.onLine
 * @returns {{bronnen: Array<{src: string, soort: 'link'|'lokaal', naam: string}>, overgeslagen: string}}
 *   overgeslagen: reden waarom een link niet geprobeerd wordt ('' als n.v.t.)
 */
export function audioBronnen(poi, online) {
  const bronnen = []
  let overgeslagen = ''
  if (poi && isLink(poi.mp3)) {
    if (online) {
      bronnen.push({ src: directeLink(poi.mp3), soort: 'link', naam: poi.mp3.trim() })
    } else {
      overgeslagen = 'link overgeslagen: geen internet'
    }
  }
  if (poi && poi.audioLokaal && poi.audioLokaal.url) {
    bronnen.push({ src: poi.audioLokaal.url, soort: 'lokaal', naam: poi.audioLokaal.naam || '' })
  }
  return { bronnen, overgeslagen }
}
