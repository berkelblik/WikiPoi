/**
 * geo.js
 *
 * Kleine rekenhulpen voor stap 7 "Onderweg": afstand, peiling (kompasrichting
 * van punt a naar punt b) en klokrichting (1–12 uur) ten opzichte van de
 * rijrichting. Punten zijn objecten { lat, lng } in graden.
 * Zelfde formules als EuroPoi (src/geoUtils.js: hav, bear, clockDir).
 */

const AARDSTRAAL_M = 6371e3

const naarRad = (graden) => (graden * Math.PI) / 180
const naarGraden = (rad) => (rad * 180) / Math.PI

function isPunt(p) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

/** Haversine-afstand tussen twee punten, in meters (NaN bij ongeldige invoer). */
export function afstand(a, b) {
  if (!isPunt(a) || !isPunt(b)) return NaN
  const dLat = naarRad(b.lat - a.lat)
  const dLng = naarRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(naarRad(a.lat)) * Math.cos(naarRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return AARDSTRAAL_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Kompasrichting van a naar b in graden (0 = noord, 90 = oost), 0–360. */
export function peiling(a, b) {
  if (!isPunt(a) || !isPunt(b)) return NaN
  const y = Math.sin(naarRad(b.lng - a.lng)) * Math.cos(naarRad(b.lat))
  const x =
    Math.cos(naarRad(a.lat)) * Math.sin(naarRad(b.lat)) -
    Math.sin(naarRad(a.lat)) * Math.cos(naarRad(b.lat)) * Math.cos(naarRad(b.lng - a.lng))
  return (naarGraden(Math.atan2(y, x)) + 360) % 360
}

/**
 * Hoek van het doel ten opzichte van de rijrichting, 0–360 graden
 * (0 = recht vooruit, 90 = rechts). Basis voor de wijzer in het eco-screen.
 */
export function relatieveHoek(rijrichting, doelPeiling) {
  return (doelPeiling - rijrichting + 360) % 360
}

/** Klokrichting 1–12 (12 = recht vooruit, 3 = rechts, 6 = achter, 9 = links). */
export function klokRichting(rijrichting, doelPeiling) {
  const uur = Math.round(relatieveHoek(rijrichting, doelPeiling) / 30)
  return uur === 0 || uur === 12 ? 12 : uur
}

/** Afstand leesbaar: "350 m" of "2,4 km". */
export function formatAfstand(meters) {
  if (!Number.isFinite(meters)) return '?'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}
