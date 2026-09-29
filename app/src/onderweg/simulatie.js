/**
 * simulatie.js
 *
 * Testmodus voor stap 7 "Onderweg": een rit langs de geladen GPX-route
 * nabootsen zonder GPS. Levert elke tik een positie af in hetzelfde formaat
 * als @capacitor/geolocation ({ coords: { latitude, longitude, accuracy },
 * timestamp }), zodat useOnderweg.js die via dezelfde weg verwerkt als een
 * echte GPS-positie (rijrichting, trigger, bellen, eco-scherm).
 *
 * Snelheid volgt de vervoerwijze (SIM_SNELHEID_KMU), met een versnelling
 * ×1/×5/×10. "Naar volgende POI" springt naar SIM_VOORLOOP_M vóór de
 * eerstvolgende POI langs de route die nog niet aan de beurt was.
 *
 * Alleen pure rekenfuncties en een timer; geen React. Netwerkloze test:
 * vanuit app/:  node src/onderweg/test-simulatie.js
 */
import { afstand } from './geo.js'

// Gesimuleerde snelheid per vervoerwijze (sleutels als VERVOER in useOnderweg.js).
export const SIM_SNELHEID_KMU = { wandelaar: 5, fietser: 18, motorrijder: 60 }
export const SIM_VERSNELLINGEN = [1, 5, 10]
export const SIM_TIK_MS = 1000
// "Naar volgende POI": zoveel meter vóór de POI (langs de route) beginnen.
export const SIM_VOORLOOP_M = 300
// Bij een sprong eerst een punt zoveel meter eerder, zodat de rijrichting
// meteen klopt (useOnderweg.js werkt de richting bij vanaf 10 m verplaatsing).
const AANLOOP_RICHTING_M = 20
const SIM_NAUWKEURIGHEID_M = 5

/** Afgelegde afstand (m) vanaf het begin, per routepunt; eerste waarde 0. */
export function cumulatieveAfstanden(punten) {
  const cum = []
  if (!Array.isArray(punten) || punten.length === 0) return cum
  cum.push(0)
  for (let i = 1; i < punten.length; i++) {
    const d = afstand(punten[i - 1], punten[i])
    cum.push(cum[i - 1] + (Number.isFinite(d) ? d : 0))
  }
  return cum
}

/** Punt { lat, lng } op `meters` langs de route (begrensd tot begin/eind). */
export function puntOpAfstand(punten, cum, meters) {
  if (!Array.isArray(punten) || punten.length === 0) return null
  if (punten.length === 1 || meters <= 0) return { lat: punten[0].lat, lng: punten[0].lng }
  const lengte = cum[cum.length - 1]
  if (meters >= lengte) {
    const laatste = punten[punten.length - 1]
    return { lat: laatste.lat, lng: laatste.lng }
  }
  // Binair zoeken naar segment i met cum[i] <= meters < cum[i + 1].
  let laag = 0
  let hoog = cum.length - 1
  while (hoog - laag > 1) {
    const midden = (laag + hoog) >> 1
    if (cum[midden] <= meters) laag = midden
    else hoog = midden
  }
  const a = punten[laag]
  const b = punten[hoog]
  const seg = cum[hoog] - cum[laag]
  const t = seg > 0 ? (meters - cum[laag]) / seg : 0
  return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }
}

// Loodrechte projectie van p op segment a–b in een lokaal vlak
// (lengtegraad geschaald met cos(breedte)); t = 0..1 langs het segment.
function projecteer(a, b, p) {
  const k = Math.cos((a.lat * Math.PI) / 180)
  const bx = (b.lng - a.lng) * k
  const by = b.lat - a.lat
  const px = (p.lng - a.lng) * k
  const py = p.lat - a.lat
  const len2 = bx * bx + by * by
  let t = len2 === 0 ? 0 : (px * bx + py * by) / len2
  t = Math.max(0, Math.min(1, t))
  return { t, q: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) } }
}

/** Afstand (m) langs de route tot het routepunt dat het dichtst bij `punt` ligt. */
export function afstandLangsRoute(punten, cum, punt) {
  if (!Array.isArray(punten) || punten.length === 0 || !punt) return NaN
  if (punten.length === 1) return 0
  let beste = { d: Infinity, m: NaN }
  for (let i = 0; i < punten.length - 1; i++) {
    const { t, q } = projecteer(punten[i], punten[i + 1], punt)
    const d = afstand(punt, q)
    if (d < beste.d) beste = { d, m: cum[i] + t * (cum[i + 1] - cum[i]) }
  }
  return beste.m
}

/**
 * Doel (m langs de route) voor "Naar volgende POI": `voorloop` meter vóór de
 * dichtstbijzijnde POI verderop. POI's waarvoor dat punt al gepasseerd is,
 * tellen niet (die komen vanzelf aan de beurt). Geen kandidaat → null.
 * `posities`: afstand langs de route per nog niet voorgelezen POI.
 */
export function volgendeDoel(posities, huidig, voorloop = SIM_VOORLOOP_M) {
  let beste = null
  posities.forEach((m) => {
    if (!Number.isFinite(m)) return
    const doel = m - voorloop
    if (doel > huidig && (beste === null || doel < beste)) beste = doel
  })
  return beste
}

/**
 * Simulatie van een rit langs `punten`. Opties:
 * - snelheidKmu: beginsnelheid (km/u);
 * - onPositie(pos): elke nieuwe positie, in Geolocation-formaat;
 * - onStatus(status): na elke wijziging { meters, lengte, versnelling, gepauzeerd, klaar };
 * - metTimer: false = geen setInterval (voor tests; roep dan zelf tik() aan);
 * - nu: tijdsfunctie voor de timestamp.
 */
export function maakSimulatie(
  punten,
  { snelheidKmu = 18, onPositie, onStatus, metTimer = true, tikMs = SIM_TIK_MS, nu = () => Date.now() } = {}
) {
  const cum = cumulatieveAfstanden(punten)
  const lengte = cum.length > 0 ? cum[cum.length - 1] : 0
  let meters = 0
  let snelheid = snelheidKmu
  let versnelling = 1
  let gepauzeerd = false
  let klaar = false
  let timer = null

  const status = () => ({ meters, lengte, versnelling, gepauzeerd, klaar })
  const meld = () => {
    if (onStatus) onStatus(status())
  }

  function stuur() {
    const p = puntOpAfstand(punten, cum, meters)
    if (!p || !onPositie) return
    onPositie({
      coords: { latitude: p.lat, longitude: p.lng, accuracy: SIM_NAUWKEURIGHEID_M },
      timestamp: nu(),
    })
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function tik() {
    if (gepauzeerd || klaar) return
    meters = Math.min(lengte, meters + (snelheid / 3.6) * versnelling * (tikMs / 1000))
    if (meters >= lengte) {
      klaar = true
      stopTimer()
    }
    stuur()
    meld()
  }

  function start() {
    stopTimer()
    meters = 0
    gepauzeerd = false
    klaar = lengte <= 0
    stuur()
    meld()
    if (metTimer && !klaar) timer = setInterval(tik, tikMs)
  }

  function stop() {
    stopTimer()
  }

  function pauzeer(aan) {
    gepauzeerd = !!aan
    meld()
  }

  function zetVersnelling(v) {
    if (Number.isFinite(v) && v > 0) versnelling = v
    meld()
  }

  // Geen meld(): de snelheid volgt de vervoerwijze en staat al op het scherm.
  function zetSnelheid(kmu) {
    if (Number.isFinite(kmu) && kmu > 0) snelheid = kmu
  }

  function springNaar(doel) {
    const m = Math.max(0, Math.min(lengte, doel))
    meters = Math.max(0, m - AANLOOP_RICHTING_M)
    stuur()
    meters = m
    klaar = meters >= lengte
    if (klaar) stopTimer()
    stuur()
    meld()
  }

  return {
    lengte,
    start,
    stop,
    tik,
    pauzeer,
    zetVersnelling,
    zetSnelheid,
    springNaar,
    status,
    afstandVan: (punt) => afstandLangsRoute(punten, cum, punt),
  }
}
