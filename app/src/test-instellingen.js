/**
 * test-instellingen.js
 *
 * Netwerkloze tests voor instellingen.js (0.22.0).
 * Uitvoeren: node src/test-instellingen.js (vanuit app/)
 */
import assert from 'node:assert'
import {
  INSTELLINGEN_SLEUTEL,
  STANDAARD_INSTELLINGEN,
  normaliseer,
  leesInstellingen,
  bewaarInstellingen,
  standaardTerug,
  kmTekst,
} from './instellingen.js'
import { grensMeters, EIGEN_MAX_METERS } from './zoekbron.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

function nepOpslag() {
  const d = {}
  return {
    getItem: (k) => (k in d ? d[k] : null),
    setItem: (k, v) => (d[k] = String(v)),
    removeItem: (k) => delete d[k],
    d,
  }
}
const kapot = {
  getItem() {
    throw new Error('geen toegang')
  },
  setItem() {
    throw new Error('geen toegang')
  },
  removeItem() {
    throw new Error('geen toegang')
  },
}

test('standaard: 2 km, zonder tekst uit, 250 m, fietser, 10 s, update aan', () => {
  assert.deepStrictEqual(leesInstellingen(nepOpslag()), {
    eigenMaxM: 2000,
    ookZonderTekst: false,
    corridorM: 250,
    vervoer: 'fietser',
    keuzeS: 10,
    updateAuto: true,
  })
  assert.strictEqual(STANDAARD_INSTELLINGEN.eigenMaxM, EIGEN_MAX_METERS)
})

test('bewaren en teruglezen', () => {
  const o = nepOpslag()
  const inst = { eigenMaxM: 1000, ookZonderTekst: true, corridorM: 150, vervoer: 'wandelaar', keuzeS: 15, updateAuto: false }
  assert.deepStrictEqual(bewaarInstellingen(inst, o), inst)
  assert.deepStrictEqual(leesInstellingen(o), inst)
  assert.ok(o.d[INSTELLINGEN_SLEUTEL].includes('"eigenMaxM":1000'))
})

test('ongeldige waarden vallen per veld terug op de standaard', () => {
  const n = normaliseer({ eigenMaxM: 1500, ookZonderTekst: 'ja', corridorM: 260, vervoer: 'auto', keuzeS: 7, updateAuto: false })
  assert.deepStrictEqual(n, { ...STANDAARD_INSTELLINGEN, updateAuto: false })
  assert.strictEqual(normaliseer({ corridorM: 25 }).corridorM, 250)
  assert.strictEqual(normaliseer({ corridorM: 525 }).corridorM, 250)
  assert.strictEqual(normaliseer({ corridorM: 500 }).corridorM, 500)
})

test('kapotte JSON of opslag zonder toegang → standaard', () => {
  const o = nepOpslag()
  o.setItem(INSTELLINGEN_SLEUTEL, '{kapot')
  assert.deepStrictEqual(leesInstellingen(o), { ...STANDAARD_INSTELLINGEN })
  assert.deepStrictEqual(leesInstellingen(kapot), { ...STANDAARD_INSTELLINGEN })
  assert.strictEqual(bewaarInstellingen({ keuzeS: 5 }, kapot).keuzeS, 5)
  assert.deepStrictEqual(leesInstellingen(null), { ...STANDAARD_INSTELLINGEN })
})

test('standaardwaarden terugzetten wist de sleutel', () => {
  const o = nepOpslag()
  bewaarInstellingen({ keuzeS: 20 }, o)
  assert.deepStrictEqual(standaardTerug(o), { ...STANDAARD_INSTELLINGEN })
  assert.ok(!(INSTELLINGEN_SLEUTEL in o.d))
})

test('kmTekst: 0,5 km / 1 km / 2 km / 5 km', () => {
  assert.deepStrictEqual([500, 1000, 2000, 5000].map(kmTekst), ['0,5 km', '1 km', '2 km', '5 km'])
})

test('grensMeters volgt de ingestelde grens eigen POI\'s', () => {
  assert.strictEqual(grensMeters(true, 'altijd', 250, 1000), 1000)
  assert.strictEqual(grensMeters(true, 'altijd', 250), EIGEN_MAX_METERS)
  assert.strictEqual(grensMeters(true, 'corridor', 250, 1000), 250)
  assert.strictEqual(grensMeters(false, 'altijd', 300, 5000), 300)
})

console.log(`Alle ${geslaagd} controles geslaagd.`)
