/**
 * pluscode.js
 *
 * Open Location Code ("pluscode") van een punt, 10 tekens plus '+'
 * (bijv. "8FV58WMH+X9", nauwkeurigheid ± 14 m). Voor weergave in het
 * eco-scherm, zodat een POI ook zonder naam terug te vinden is.
 * Zelfde algoritme als EuroPoi (src/geoUtils.js, encPlus).
 */

const ALFABET = '23456789CFGHJMPQRVWX'

/**
 * @param {number} lat - breedtegraad in graden
 * @param {number} lng - lengtegraad in graden
 * @returns {string} pluscode, of '' bij ongeldige invoer
 */
export function pluscode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  let la = Math.min(Math.max(lat, -90), 89.999999) + 90
  let lo = Math.min(Math.max(lng, -180), 179.999999) + 180
  let code = ''
  for (let i = 0; i < 5; i++) {
    const stap = 20 ** (1 - i)
    code += ALFABET[Math.floor(la / stap)] + ALFABET[Math.floor(lo / stap)]
    la %= stap
    lo %= stap
    if (i === 3) code += '+'
  }
  return code
}
