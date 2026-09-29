/**
 * test-simulatie.js
 *
 * Netwerkloze test voor simulatie.js: afstanden langs de route, punt op
 * afstand, projectie van een POI op de route, "Naar volgende POI" en de
 * simulatie zelf (tikken, pauze, versnelling, sprong, einde route).
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-simulatie.js
 */
import assert from 'node:assert'
import { afstand } from './geo.js'
import {
  cumulatieveAfstanden,
  puntOpAfstand,
  afstandLangsRoute,
  volgendeDoel,
  maakSimulatie,
} from './simulatie.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}
const ongeveer = (a, b, marge, tekst) =>
  assert.ok(Math.abs(a - b) <= marge, `${tekst}: ${a} i.p.v. ~${b} (marge ${marge})`)

// Rechte route naar het noorden langs 5° OL: 0,01° breedte ≈ 1112 m.
const ROUTE = [
  { lat: 52.0, lng: 5.0 },
  { lat: 52.005, lng: 5.0 },
  { lat: 52.01, lng: 5.0 },
]
const CUM = cumulatieveAfstanden(ROUTE)
const LENGTE = CUM[CUM.length - 1]

test('cumulatieve afstanden', () => {
  assert.strictEqual(CUM.length, 3)
  assert.strictEqual(CUM[0], 0)
  ongeveer(LENGTE, 1112, 2, 'routelengte')
  ongeveer(CUM[1], LENGTE / 2, 0.5, 'halverwege')
  assert.deepStrictEqual(cumulatieveAfstanden([]), [])
})

test('punt op afstand', () => {
  const midden = puntOpAfstand(ROUTE, CUM, LENGTE / 2)
  ongeveer(midden.lat, 52.005, 1e-6, 'lat midden')
  const kwart = puntOpAfstand(ROUTE, CUM, LENGTE / 4)
  ongeveer(kwart.lat, 52.0025, 1e-6, 'lat kwart')
  assert.deepStrictEqual(puntOpAfstand(ROUTE, CUM, -5), { lat: 52.0, lng: 5.0 })
  assert.deepStrictEqual(puntOpAfstand(ROUTE, CUM, LENGTE + 100), { lat: 52.01, lng: 5.0 })
  assert.strictEqual(puntOpAfstand([], [], 10), null)
})

test('afstand langs de route (POI naast de route)', () => {
  // POI ± 70 m oost van de route, op driekwart.
  const poi = { lat: 52.0075, lng: 5.001 }
  ongeveer(afstandLangsRoute(ROUTE, CUM, poi), (LENGTE * 3) / 4, 2, 'positie POI')
  ongeveer(afstandLangsRoute(ROUTE, CUM, { lat: 51.99, lng: 5.0 }), 0, 0.01, 'vóór begin')
  ongeveer(afstandLangsRoute(ROUTE, CUM, { lat: 52.02, lng: 5.0 }), LENGTE, 0.01, 'na eind')
})

test('volgende doel', () => {
  assert.strictEqual(volgendeDoel([800, 500], 0, 300), 200)
  assert.strictEqual(volgendeDoel([800, 500], 250, 300), 500) // 500-300 al gepasseerd
  assert.strictEqual(volgendeDoel([800, 500], 600, 300), null)
  assert.strictEqual(volgendeDoel([NaN], 0, 300), null)
  assert.strictEqual(volgendeDoel([], 0, 300), null)
})

test('simulatie: start, tikken, versnelling, pauze', () => {
  const posities = []
  let laatsteStatus = null
  const sim = maakSimulatie(ROUTE, {
    snelheidKmu: 36, // 10 m/s
    metTimer: false,
    nu: () => 1000,
    onPositie: (pos) => posities.push(pos),
    onStatus: (s) => {
      laatsteStatus = s
    },
  })
  sim.start()
  assert.strictEqual(posities.length, 1)
  assert.deepStrictEqual(posities[0], {
    coords: { latitude: 52.0, longitude: 5.0, accuracy: 5 },
    timestamp: 1000,
  })
  sim.tik()
  ongeveer(laatsteStatus.meters, 10, 1e-9, 'na 1 tik')
  ongeveer(afstand(ROUTE[0], { lat: posities[1].coords.latitude, lng: 5.0 }), 10, 0.1, 'positie na 1 tik')
  sim.zetVersnelling(5)
  sim.tik()
  ongeveer(laatsteStatus.meters, 60, 1e-9, 'na tik ×5')
  assert.strictEqual(laatsteStatus.versnelling, 5)
  sim.pauzeer(true)
  sim.tik()
  ongeveer(laatsteStatus.meters, 60, 1e-9, 'gepauzeerd')
  assert.strictEqual(laatsteStatus.gepauzeerd, true)
  sim.pauzeer(false)
  sim.zetSnelheid(18) // 5 m/s × 5
  sim.tik()
  ongeveer(laatsteStatus.meters, 85, 1e-9, 'na snelheidswijziging')
})

test('simulatie: sprong geeft eerst aanlooppunt (rijrichting)', () => {
  const posities = []
  let laatsteStatus = null
  const sim = maakSimulatie(ROUTE, {
    metTimer: false,
    onPositie: (pos) => posities.push(pos),
    onStatus: (s) => {
      laatsteStatus = s
    },
  })
  sim.start()
  sim.springNaar(500)
  assert.strictEqual(posities.length, 3)
  const p1 = { lat: posities[1].coords.latitude, lng: posities[1].coords.longitude }
  const p2 = { lat: posities[2].coords.latitude, lng: posities[2].coords.longitude }
  ongeveer(afstand(p1, p2), 20, 0.1, 'aanloop')
  assert.ok(p2.lat > p1.lat, 'rijrichting noord')
  ongeveer(laatsteStatus.meters, 500, 1e-9, 'na sprong')
  assert.strictEqual(laatsteStatus.klaar, false)
  ongeveer(sim.afstandVan({ lat: 52.0075, lng: 5.001 }), (LENGTE * 3) / 4, 2, 'afstandVan')
})

test('simulatie: einde route', () => {
  let laatsteStatus = null
  const sim = maakSimulatie(ROUTE, {
    snelheidKmu: 360, // 100 m/s
    metTimer: false,
    onStatus: (s) => {
      laatsteStatus = s
    },
  })
  sim.start()
  sim.zetVersnelling(10) // 1000 m per tik
  sim.tik()
  assert.strictEqual(laatsteStatus.klaar, false)
  sim.tik()
  assert.strictEqual(laatsteStatus.klaar, true)
  ongeveer(laatsteStatus.meters, LENGTE, 1e-9, 'op het eind')
  sim.tik() // na het eind gebeurt niets meer
  ongeveer(laatsteStatus.meters, LENGTE, 1e-9, 'blijft op het eind')
})

console.log(`\n${geslaagd} tests geslaagd.`)
