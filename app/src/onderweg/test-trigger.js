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
import { alleenBijPoi, poiStraal, triggerAfstand, poiTotRoute, triggerTekst } from './trigger.js'

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

test('triggerTekst: zelf gekozen POI (0.19.4)', () => {
  const p = { label: 'Hervormde kerk', afstandPoi: 915, afstandRoutepunt: 99, straal: 100, zelfGekozen: true }
  assert.strictEqual(
    triggerTekst(p, 'lijst'),
    'Hervormde kerk (915 m tot POI, 99 m tot routepunt, straal 100 m, lijst, zelf gekozen)'
  )
})

test('alleenBijPoi: eigen POI buiten de corridor, niet zelf gekozen (0.19.5)', () => {
  assert.strictEqual(alleenBijPoi({ eigen: true, distanceToRoute: 859 }, 150), true)
  assert.strictEqual(alleenBijPoi({ eigen: true, distanceToRoute: 122 }, 150), false) // Bertus
  assert.strictEqual(alleenBijPoi({ eigen: true, distanceToRoute: 122 }, 100), true)
  assert.strictEqual(alleenBijPoi({ eigen: true, distanceToRoute: 859, zelfGekozen: true }, 150), false)
  assert.strictEqual(alleenBijPoi({ eigen: false, distanceToRoute: 859 }, 150), false)
  assert.strictEqual(alleenBijPoi({ eigen: true, distanceToRoute: null }, 150), false)
})

test('triggerAfstand: alleen bij de POI → routepunt telt niet mee', () => {
  // Op het routepunt (0,008° ≈ 890 m van de POI).
  const opRoute = { lat: 52.168, lng: 6.29 }
  const gewoon = triggerAfstand(opRoute, POI)
  assert.strictEqual(gewoon.via, 'route')
  const alleen = triggerAfstand(opRoute, { ...POI, alleenBijPoi: true })
  assert.strictEqual(alleen.via, 'poi')
  assert.ok(dichtbij(alleen.afstand, 890, 5), alleen.afstand)
  assert.ok(dichtbij(alleen.totRoutepunt, 0))
  const p = { label: 'Twentekanaal', afstandPoi: 4, afstandRoutepunt: 857, straal: 100, alleenBijPoi: true }
  assert.strictEqual(
    triggerTekst(p, 'lijst'),
    'Twentekanaal (4 m tot POI, 857 m tot routepunt, straal 100 m, lijst, alleen bij POI)'
  )
})

console.log(`\n${geslaagd} tests geslaagd.`)
