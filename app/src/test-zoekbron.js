/**
 * test-zoekbron.js
 *
 * Netwerkloze test voor zoekbron.js (0.15.0): de werkelijke zoekbron,
 * welke POI's meedoen per bron, de afstandsgrens voor eigen POI's en het
 * bewaren/teruglezen van beide keuzes (met een nagebootste localStorage).
 *
 * Uitvoeren vanuit app/:  node src/test-zoekbron.js
 */
import assert from 'node:assert'
import {
  effectieveBron,
  zoektWiki,
  gebruiktEigen,
  grensMeters,
  EIGEN_MAX_METERS,
  leesBron,
  bewaarBron,
  leesEigenMelden,
  bewaarEigenMelden,
} from './zoekbron.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log(`ok - ${naam}`)
}

function nepOpslag() {
  const data = {}
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    data,
  }
}

test('effectieveBron: zonder eigen POI\'s altijd wiki', () => {
  assert.strictEqual(effectieveBron('eigen', false), 'wiki')
  assert.strictEqual(effectieveBron('beide', false), 'wiki')
  assert.strictEqual(effectieveBron('wiki', false), 'wiki')
})

test('effectieveBron: met eigen POI\'s de keuze, onbekend → beide', () => {
  assert.strictEqual(effectieveBron('eigen', true), 'eigen')
  assert.strictEqual(effectieveBron('wiki', true), 'wiki')
  assert.strictEqual(effectieveBron('onzin', true), 'beide')
})

test('zoektWiki / gebruiktEigen per bron', () => {
  assert.deepStrictEqual(
    ['wiki', 'eigen', 'beide'].map((b) => [zoektWiki(b), gebruiktEigen(b)]),
    [
      [true, false],
      [false, true],
      [true, true],
    ]
  )
})

test('grensMeters: eigen POI altijd → 2 km, corridor → corridor', () => {
  assert.strictEqual(grensMeters(true, 'altijd', 250), EIGEN_MAX_METERS)
  assert.strictEqual(grensMeters(true, 'corridor', 250), 250)
  assert.strictEqual(grensMeters(false, 'altijd', 300), 300)
  assert.strictEqual(grensMeters(false, 'corridor', 300), 300)
})

test('lezen zonder localStorage: standaardwaarden', () => {
  assert.strictEqual(leesBron(), 'beide')
  assert.strictEqual(leesEigenMelden(), 'altijd')
  bewaarBron('eigen') // mag niet fout gaan
})

test('bewaren en teruglezen', () => {
  const opslag = nepOpslag()
  Object.defineProperty(globalThis, 'localStorage', { value: opslag, configurable: true })
  bewaarBron('eigen')
  bewaarEigenMelden('corridor')
  assert.strictEqual(leesBron(), 'eigen')
  assert.strictEqual(leesEigenMelden(), 'corridor')
})

test('ongeldige waarden worden niet bewaard of gelezen', () => {
  const opslag = nepOpslag()
  Object.defineProperty(globalThis, 'localStorage', { value: opslag, configurable: true })
  bewaarBron('alles')
  bewaarEigenMelden('nooit')
  assert.deepStrictEqual(opslag.data, {})
  opslag.setItem('wikipoi.zoekbron', 'alles')
  assert.strictEqual(leesBron(), 'beide')
})

test('localStorage die fouten geeft: standaardwaarden, geen crash', () => {
  const kapot = {
    getItem: () => {
      throw new Error('geblokkeerd')
    },
    setItem: () => {
      throw new Error('vol')
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: kapot, configurable: true })
  bewaarBron('wiki')
  assert.strictEqual(leesBron(), 'beide')
  assert.strictEqual(leesEigenMelden(), 'altijd')
})

console.log(`\n${geslaagd} tests geslaagd.`)
