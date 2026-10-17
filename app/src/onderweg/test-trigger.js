/**
 * test-trigger.js
 *
 * Netwerkloze test voor trigger.js (0.19.1): afstand tot POI of routepunt
 * (T1), straal per POI uit de CSV-kolom radius, afstand POI–route en de
 * logboekregel (T2).
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-trigger.js
 */
import assert from 'node:assert'
import { poiStraal, triggerAfstand, poiTotRoute, triggerTekst } from './trigger.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

// 0,001° breedte ≈ 111 m.
const POI = { id: 'c', label: 'Cammock', lat: 52.16, lng: 6.29, snapPoint: { lat: 52.168, lng: 6.29 } }
const dichtbij = (x, y, marge = 2) => Math.abs(x - y) <= marge

test('Straal: radius > 0 uit de CSV, anders die van de vervoerwijze', () => {
  assert.strictEqual(poiStraal({ radius: 200 }, 100), 200)
  assert.strictEqual(poiStraal({ radius: 0 }, 100), 100)
  assert.strictEqual(poiStraal({}, 30), 30)
  assert.strictEqual(poiStraal({ radius: -5 }, 160), 160)
  assert.strictEqual(poiStraal({ radius: 'x' }, 100), 100)
  assert.strictEqual(poiStraal(null, 100), 100)
})

test('T1: bij de POI zelf (route ligt ver weg) → afstand tot de POI', () => {
  const r = triggerAfstand({ lat: 52.1603, lng: 6.29 }, POI)
  assert.strictEqual(r.via, 'poi')
  assert.ok(dichtbij(r.afstand, 33), `afstand ${r.afstand}`)
  assert.ok(dichtbij(r.totRoutepunt, 856), `routepunt ${r.totRoutepunt}`)
})

test('T1: op de route bij het triggerpunt → afstand tot het routepunt', () => {
  const r = triggerAfstand({ lat: 52.1681, lng: 6.29 }, POI)
  assert.strictEqual(r.via, 'route')
  assert.ok(dichtbij(r.afstand, 11), `afstand ${r.afstand}`)
  assert.ok(r.totPoi > 800)
})

test('T1: POI zonder triggerpunt → afstand tot de POI', () => {
  const r = triggerAfstand({ lat: 52.161, lng: 6.29 }, { lat: 52.16, lng: 6.29 })
  assert.strictEqual(r.via, 'poi')
  assert.strictEqual(r.totRoutepunt, null)
  assert.ok(dichtbij(r.afstand, 111))
})

test('Afstand POI–route: distanceToRoute, anders POI–triggerpunt, anders null', () => {
  assert.strictEqual(poiTotRoute({ ...POI, distanceToRoute: 880 }), 880)
  assert.ok(dichtbij(poiTotRoute(POI), 890, 3))
  assert.strictEqual(poiTotRoute({ lat: 1, lng: 2 }), null)
})

test('T2: logboekregel met beide afstanden, POI–route en straal', () => {
  const p = { ...POI, distanceToRoute: 880, afstandPoi: 33.2, afstandRoutepunt: 412.4, straal: 100 }
  assert.strictEqual(
    triggerTekst(p, 'lijst'),
    'Cammock (33 m tot POI, 412 m tot routepunt, POI 880 m van de route, straal 100 m, lijst)'
  )
  const q = { label: 'X', afstandPoi: 50, afstandRoutepunt: null, straal: 200, eigenStraal: true }
  assert.strictEqual(triggerTekst(q, 'eco'), 'X (50 m tot POI, straal 200 m (CSV), eco)')
})

console.log(`\n${geslaagd} tests geslaagd.`)
