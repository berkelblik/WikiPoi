/**
 * rijk.jsx
 *
 * Vertaalde tekst met opmaak (0.23.0): **vet** wordt <strong>. Voor teksten
 * uit talen/*.js waarin een deel vet staat (bijv. de welkomstmelding of
 * "**12** POI's gevonden").
 */
import { t } from './vertaal.js'

/** Tekst met **vet** als React-onderdelen. */
export function rijk(tekst) {
  const delen = String(tekst).split('**')
  return delen.map((deel, i) => (i % 2 === 1 ? <strong key={i}>{deel}</strong> : deel))
}

/** t() met opmaak. */
export function tr(sleutel, params) {
  return rijk(t(sleutel, params))
}
