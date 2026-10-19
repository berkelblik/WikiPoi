/**
 * trigger.js
 *
 * Afstand en straal voor de automatische trigger in stap 8 "Onderweg"
 * (0.19.1). Puur, zodat het in Node te testen is (test-trigger.js).
 *
 * T1 Afstand: de kleinste van de afstand tot het triggerpunt op de route
 *    (snapPoint, het routepunt dat het dichtst bij de POI ligt) en de
 *    afstand tot de POI zelf. Een POI triggert zo bij het volgen van de
 *    route én als je er werkelijk langs komt terwijl de route ergens anders
 *    loopt (testrit 17-10: Cammock op 5 m gepasseerd, getriggerd op 879 m).
 *
 * Straal per POI: eigen POI's met een radius > 0 in de CSV gebruiken die
 *    straal; radius 0 (of leeg) = de straal van de vervoerwijze (zoals in
 *    EuroPoi).
 *
 * Alleen bij de POI zelf (0.19.5): een eigen POI buiten de corridor triggert
 *    niet bij het routepunt, alleen als je er werkelijk langs komt (zoals in
 *    EuroPoi). Zelf aangevinkt bij stap 5 (0.19.4) of binnen de corridor:
 *    ook bij het routepunt (testrit 19-10: Cammock en Twentekanaal, 860–910 m
 *    van de route, kondigden zich aan bij het routepunt).
 */
import { afstand } from './geo.js'

/** Straal in meters: radius van de POI als die > 0 is, anders die van de vervoerwijze. */
export function poiStraal(poi, vervoerStraal) {
  const r = poi && Number(poi.radius)
  return Number.isFinite(r) && r > 0 ? r : vervoerStraal
}

/**
 * Triggert deze POI alleen bij de POI zelf? Eigen POI, niet zelf gekozen en
 * verder dan de corridor van de route.
 *
 * @param {object} poi - met eigen, zelfGekozen, distanceToRoute
 * @param {number} corridorMeters
 * @returns {boolean}
 */
export function alleenBijPoi(poi, corridorMeters) {
  return Boolean(
    poi &&
      poi.eigen &&
      !poi.zelfGekozen &&
      Number.isFinite(poi.distanceToRoute) &&
      poi.distanceToRoute > corridorMeters
  )
}

/**
 * Afstanden van positie tot een POI:
 *   { afstand, totPoi, totRoutepunt, via }
 * afstand = de kleinste; via = 'poi' of 'route' (welke het was);
 * totRoutepunt = null als de POI geen triggerpunt op de route heeft.
 */
export function triggerAfstand(positie, poi) {
  const totPoi = afstand(positie, poi)
  const sp = poi && poi.snapPoint
  const totRoutepunt = sp && Number.isFinite(sp.lat) && Number.isFinite(sp.lng) ? afstand(positie, sp) : null
  // Alleen bij de POI zelf (0.19.5): routepunt wel noemen (logboek), niet gebruiken.
  if (poi && poi.alleenBijPoi) {
    return { afstand: totPoi, totPoi, totRoutepunt, via: 'poi' }
  }
  if (totRoutepunt === null || !Number.isFinite(totRoutepunt)) {
    return { afstand: totPoi, totPoi, totRoutepunt: null, via: 'poi' }
  }
  if (!Number.isFinite(totPoi) || totRoutepunt < totPoi) {
    return { afstand: totRoutepunt, totPoi, totRoutepunt, via: 'route' }
  }
  return { afstand: totPoi, totPoi, totRoutepunt, via: 'poi' }
}

/** Afstand POI–route in meters (distanceToRoute uit App.jsx, anders POI–triggerpunt), of null. */
export function poiTotRoute(poi) {
  if (!poi) return null
  if (Number.isFinite(poi.distanceToRoute)) return poi.distanceToRoute
  const sp = poi.snapPoint
  if (sp && Number.isFinite(sp.lat) && Number.isFinite(sp.lng)) return afstand(poi, sp)
  return null
}

const m = (x) => `${Math.round(x)} m`

/**
 * Logboekregel bij een trigger (T2):
 * "Cammock (33 m tot POI, 412 m tot routepunt, POI 880 m van de route, straal 100 m, lijst)".
 */
export function triggerTekst(p, soort) {
  const delen = []
  if (Number.isFinite(p.afstandPoi)) delen.push(`${m(p.afstandPoi)} tot POI`)
  if (Number.isFinite(p.afstandRoutepunt)) delen.push(`${m(p.afstandRoutepunt)} tot routepunt`)
  const route = poiTotRoute(p)
  if (Number.isFinite(route)) delen.push(`POI ${m(route)} van de route`)
  delen.push(`straal ${m(p.straal)}${p.eigenStraal ? ' (CSV)' : ''}`)
  if (soort) delen.push(soort)
  if (p.zelfGekozen) delen.push('zelf gekozen')
  if (p.alleenBijPoi) delen.push('alleen bij POI')
  return `${p.label} (${delen.join(', ')})`
}
