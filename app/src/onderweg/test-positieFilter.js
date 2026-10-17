/**
 * test-positieFilter.js
 *
 * Netwerkloze test voor positieFilter.js (0.18.0): nauwkeurigheid met
 * terugval (A1), sprongfilter (A2), gemiddelde over 5 metingen (A3),
 * dubbele metingen en de tellers.
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-positieFilter.js
 */
import assert from 'node:assert'
import { maakPositieFilter, tellersTekst, MAX_SNELHEID_KMU } from './positieFilter.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

// 1 m noordwaarts ≈ 0,000008993° breedte.
const GRAAD_PER_M = 1 / 111195
const punt = (meterNoord, tijdS, nauw = 5) => ({
  lat: 52 + meterNoord * GRAAD_PER_M,
  lng: 6.5,
  nauwkeurigheid: nauw,
  tijd: 1_000_000 + tijdS * 1000,
})
const meterVan = (p) => (p.lat - 52) / GRAAD_PER_M

test('Eerste goede meting geaccepteerd', () => {
  const f = maakPositieFilter()
  const r = f.verwerk(punt(0, 0))
  assert.strictEqual(r.status, 'geaccepteerd')
  assert.ok(Math.abs(meterVan(r.punt)) < 0.01)
})

test('Ongeldige invoer → null', () => {
  const f = maakPositieFilter()
  assert.strictEqual(f.verwerk({ lat: NaN, lng: 1 }), null)
  assert.strictEqual(f.verwerk(null), null)
})

test('A1: slechter dan 35 m → weggegooid (0.19.1, F2; was 25 m)', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(5, 1, 40)).status, 'nauwkeurigheid')
  assert.strictEqual(f.verwerk(punt(10, 2, 35)).status, 'geaccepteerd')
  assert.strictEqual(f.verwerk(punt(12, 3, 27)).status, 'geaccepteerd')
})

test('A1: onbekende nauwkeurigheid telt als goed', () => {
  const f = maakPositieFilter()
  assert.strictEqual(f.verwerk({ lat: 52, lng: 6, tijd: 1 }).status, 'geaccepteerd')
})

test('A1: terugval na 10 s → beste slechte meting (≤ 100 m)', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(20, 4, 60)).status, 'nauwkeurigheid')
  assert.strictEqual(f.verwerk(punt(30, 6, 45)).status, 'nauwkeurigheid')
  assert.strictEqual(f.verwerk(punt(40, 8, 80)).status, 'nauwkeurigheid')
  const r = f.verwerk(punt(50, 10, 70))
  assert.strictEqual(r.status, 'geaccepteerd')
  assert.strictEqual(r.terugval, true)
  // De beste was die van 45 m (op 30 m); gemiddelde van 0 en 30.
  assert.ok(Math.abs(meterVan(r.punt) - 15) < 0.1, meterVan(r.punt))
})

test('A1: geen terugval als alles slechter dan 100 m is', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(20, 5, 150)).status, 'nauwkeurigheid')
  assert.strictEqual(f.verwerk(punt(30, 12, 200)).status, 'nauwkeurigheid')
})

test('A1: na terugval begint een nieuwe periode van 10 s', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  f.verwerk(punt(10, 2, 40))
  assert.strictEqual(f.verwerk(punt(20, 10, 40)).status, 'geaccepteerd')
  assert.strictEqual(f.verwerk(punt(30, 12, 40)).status, 'nauwkeurigheid')
  assert.strictEqual(f.verwerk(punt(40, 20, 40)).status, 'geaccepteerd')
})

test('A2: sprong van 300 m in 1 s (fietser) → weggegooid', () => {
  const f = maakPositieFilter({ maxSnelheidKmu: MAX_SNELHEID_KMU.fietser })
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(300, 1)).status, 'sprong')
  assert.strictEqual(f.verwerk(punt(6, 2)).status, 'geaccepteerd')
})

test('A2: 15 m in 1 s past bij fietser (60 km/u + marge)', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(15, 1)).status, 'geaccepteerd')
})

test('A2: wandelaar strenger dan fietser', () => {
  const f = maakPositieFilter({ maxSnelheidKmu: MAX_SNELHEID_KMU.wandelaar })
  f.verwerk(punt(0, 0, 2))
  assert.strictEqual(f.verwerk(punt(15, 1, 2)).status, 'sprong')
  f.zetMaxSnelheid(MAX_SNELHEID_KMU.motorrijder)
  assert.strictEqual(f.verwerk(punt(15, 2, 2)).status, 'geaccepteerd')
})

test('A2: 3× sprong achter elkaar → geaccepteerd, gemiddelde opnieuw', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  f.verwerk(punt(2, 1))
  assert.strictEqual(f.verwerk(punt(500, 2)).status, 'sprong')
  assert.strictEqual(f.verwerk(punt(505, 3)).status, 'sprong')
  const r = f.verwerk(punt(510, 4))
  assert.strictEqual(r.status, 'geaccepteerd')
  assert.strictEqual(r.sprongGeaccepteerd, true)
  assert.ok(Math.abs(meterVan(r.punt) - 510) < 0.1, 'buffer leeggemaakt')
})

test('A2: na lange stilte past een grotere afstand', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  // 600 m in 60 s = 36 km/u.
  assert.strictEqual(f.verwerk(punt(600, 60)).status, 'geaccepteerd')
})

test('A3: gemiddelde over de laatste 5 metingen', () => {
  const f = maakPositieFilter()
  let r
  for (let i = 0; i < 7; i++) r = f.verwerk(punt(i * 5, i))
  // Laatste 5: 10, 15, 20, 25, 30 → 20.
  assert.ok(Math.abs(meterVan(r.punt) - 20) < 0.1, meterVan(r.punt))
  assert.strictEqual(r.punt.nauwkeurigheid, 5)
})

test('Dubbele meting (zelfde tijd en plek) → dubbel', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  assert.strictEqual(f.verwerk(punt(0, 0)).status, 'dubbel')
})

test('Tellers en tekst', () => {
  const f = maakPositieFilter()
  f.verwerk(punt(0, 0))
  f.verwerk(punt(5, 1, 40))
  f.verwerk(punt(400, 2))
  f.verwerk(punt(8, 3))
  const t = f.tellers()
  assert.deepStrictEqual(
    [t.geaccepteerd, t.nauwkeurigheid, t.sprong],
    [2, 1, 1]
  )
  assert.match(tellersTekst(t), /^2 geaccepteerd, 2 weggegooid \(1 nauwkeurigheid, 1 sprong\)/)
  f.reset()
  assert.strictEqual(f.tellers().geaccepteerd, 0)
})

console.log(`\n${geslaagd} tests geslaagd.`)
