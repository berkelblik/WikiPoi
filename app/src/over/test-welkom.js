/**
 * test-welkom.js
 *
 * Netwerkloze tests voor welkom.js (0.21.0).
 * Uitvoeren: node src/over/test-welkom.js (vanuit app/)
 */
import assert from 'node:assert'
import { WELKOM_SLEUTEL, hoofdversie, welkomTonen, welkomBegrepen, welkomVergeten } from './welkom.js'

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

test('hoofdversie', () => {
  assert.strictEqual(hoofdversie('0.21.0'), '0')
  assert.strictEqual(hoofdversie('1.0.0'), '1')
  assert.strictEqual(hoofdversie('0.30.0-beta'), '0')
  assert.strictEqual(hoofdversie(''), '0')
})

test('eerste start → tonen; na Begrepen niet meer binnen dezelfde hoofdversie', () => {
  const o = nepOpslag()
  assert.strictEqual(welkomTonen('0.21.0', o), true)
  welkomBegrepen('0.21.0', o)
  assert.strictEqual(o.d[WELKOM_SLEUTEL], '0')
  assert.strictEqual(welkomTonen('0.21.0', o), false)
  assert.strictEqual(welkomTonen('0.30.0-beta', o), false)
})

test('nieuwe hoofdversie → opnieuw tonen (A1)', () => {
  const o = nepOpslag()
  welkomBegrepen('0.29.0', o)
  assert.strictEqual(welkomTonen('1.0.0', o), true)
})

test('opnieuw tonen via Over WikiPoi', () => {
  const o = nepOpslag()
  welkomBegrepen('0.21.0', o)
  welkomVergeten(o)
  assert.strictEqual(welkomTonen('0.21.0', o), true)
})

test('opslag niet beschikbaar of kapot → tonen, geen fout', () => {
  assert.strictEqual(welkomTonen('0.21.0', null), true)
  assert.strictEqual(welkomTonen('0.21.0', kapot), true)
  welkomBegrepen('0.21.0', kapot)
  welkomVergeten(kapot)
})

console.log(`\n${geslaagd} tests geslaagd.`)
