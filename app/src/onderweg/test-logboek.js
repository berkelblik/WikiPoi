/**
 * test-logboek.js
 *
 * Netwerkloze test voor logboek.js: begin/stop, posities met vertraging,
 * opslaan en laden, analyse (grootste gat, per minuut, schermstand) en de
 * deelbare tekst.
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-logboek.js
 */
import assert from 'node:assert'
import { maakLogboek, analyseer, alsTekst, duurTekst, OPSLAG_SLEUTEL } from './logboek.js'

process.env.TZ = 'UTC'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

// Nepklok en nepopslag.
function omgeving(startMs) {
  let t = startMs
  const opslag = new Map()
  return {
    nu: () => t,
    zet: (ms) => {
      t = ms
    },
    opslag: {
      setItem: (k, v) => opslag.set(k, v),
      getItem: (k) => (opslag.has(k) ? opslag.get(k) : null),
    },
    ruw: opslag,
  }
}

const START = Date.UTC(2026, 8, 29, 14, 3, 0) // 29-09-2026 14:03:00 UTC

test('begin, gebeurtenissen en stop', () => {
  const o = omgeving(START)
  const lb = maakLogboek({ nu: o.nu, opslag: o.opslag })
  assert.strictEqual(lb.actief(), false)
  lb.begin('achtergrond', 'Android 16')
  assert.strictEqual(lb.actief(), true)
  o.zet(START + 5000)
  lb.noteer('trigger', 'Kerk')
  o.zet(START + 9000)
  lb.stop()
  lb.stop() // tweede keer: niets
  const d = lb.gegevens()
  assert.strictEqual(lb.actief(), false)
  assert.strictEqual(d.eind, START + 9000)
  assert.deepStrictEqual(
    d.gebeurtenissen.map((g) => g[1]),
    ['start', 'trigger', 'stop']
  )
})

test('positie: vertraging en afgeronde nauwkeurigheid', () => {
  const o = omgeving(START)
  const lb = maakLogboek({ nu: o.nu, opslag: o.opslag })
  lb.begin('voorgrond')
  o.zet(START + 2000)
  lb.positie({ tijd: START + 1500, nauwkeurigheid: 4.6 })
  lb.positie({ tijd: undefined, nauwkeurigheid: undefined })
  lb.positie({ tijd: START + 9000, nauwkeurigheid: 3 }) // tijd in de toekomst → 0
  assert.deepStrictEqual(lb.gegevens().posities, [
    [START + 2000, 500, 5],
    [START + 2000, null, null],
    [START + 2000, 0, 3],
  ])
})

test('niets vastleggen vóór begin', () => {
  const o = omgeving(START)
  const lb = maakLogboek({ nu: o.nu, opslag: o.opslag })
  lb.noteer('trigger', 'x')
  lb.positie({ tijd: START, nauwkeurigheid: 3 })
  lb.hartslag()
  lb.stop()
  assert.strictEqual(lb.gegevens(), null)
  assert.strictEqual(o.ruw.size, 0)
})

test('opslaan en laden (ook in een nieuw logboek)', () => {
  const o = omgeving(START)
  const lb = maakLogboek({ nu: o.nu, opslag: o.opslag })
  lb.begin('achtergrond')
  o.zet(START + 1000)
  lb.positie({ tijd: START + 900, nauwkeurigheid: 5 })
  lb.opslaan()
  const ander = maakLogboek({ nu: o.nu, opslag: o.opslag })
  const geladen = ander.laad()
  assert.strictEqual(geladen.bron, 'achtergrond')
  assert.strictEqual(geladen.posities.length, 1)
  assert.strictEqual(geladen.eind, null)
  o.ruw.set(OPSLAG_SLEUTEL, '{kapot')
  assert.strictEqual(ander.laad(), null)
  assert.strictEqual(maakLogboek({ nu: o.nu, opslag: null }).laad(), null)
})

// Rit van 2,5 minuut: posities elke seconde, behalve een gat van 40 s
// (scherm uit), hartslag elke 10 s met een gat van 40 s.
function voorbeeldRit() {
  const o = omgeving(START)
  const lb = maakLogboek({ nu: o.nu, opslag: o.opslag })
  lb.begin('achtergrond', 'Android 16; 25053PC47G')
  lb.noteer('scherm', 'zichtbaar')
  for (let s = 1; s <= 150; s++) {
    o.zet(START + s * 1000)
    if (s === 70) lb.noteer('scherm', 'verborgen')
    if (s === 140) lb.noteer('scherm', 'zichtbaar')
    if (s < 80 || s > 120) lb.positie({ tijd: START + s * 1000 - 200, nauwkeurigheid: 4 })
    if (s % 10 === 0 && (s < 90 || s > 110)) lb.hartslag()
    if (s === 130) lb.noteer('trigger', 'Église (80 m, straal 100 m, eco)')
    if (s === 131) lb.noteer('bel-fout', 'NotAllowedError')
  }
  lb.stop()
  return lb.gegevens()
}

test('analyse: aantallen, grootste gaten en vertraging', () => {
  const a = analyseer(voorbeeldRit())
  assert.strictEqual(a.duurMs, 150000)
  assert.strictEqual(a.aantalPosities, 79 + 30)
  assert.deepStrictEqual(a.grootsteGatPositie, { ms: 42000, na: START + 79000 })
  assert.deepStrictEqual(a.grootsteGatHartslag, { ms: 40000, na: START + 80000 })
  assert.strictEqual(a.gemVertraging, 200)
  assert.strictEqual(a.maxVertraging, 200)
  assert.strictEqual(a.triggers, 1)
  assert.strictEqual(a.fouten, 1)
})

test('analyse: per minuut posities, hartslagen en schermstand', () => {
  const a = analyseer(voorbeeldRit())
  assert.deepStrictEqual(
    a.perMinuut.map((m) => [m.posities, m.hartslagen, m.scherm]),
    [
      [59, 5, 'zichtbaar'], // 14:03 (s 1–59)
      [20, 3, 'wisselend'], // 14:04 (s 60–119; scherm uit vanaf s 70)
      [30, 4, 'wisselend'], // 14:05 (s 120–150; scherm aan vanaf s 140)
    ]
  )
})

test('tekst: kopregels, per minuut en gebeurtenissen', () => {
  const tekst = alsTekst(voorbeeldRit())
  const regels = tekst.split('\n')
  assert.strictEqual(regels[0], 'WikiPoi-logboek (proef achtergrond-GPS)')
  assert.strictEqual(regels[1], 'Rit: 29-09-2026 14:03:00 – 14:05:30 (2,5 min), bron: achtergrond')
  assert.strictEqual(regels[2], 'Toestel: Android 16; 25053PC47G')
  assert.ok(regels[3].startsWith('Posities: 109, grootste gat 42,0 s (na 14:04:19)'))
  assert.ok(regels[4].includes('grootste gat 40,0 s (na 14:04:20)'))
  assert.ok(tekst.includes('14:04   20   3  wisselend'))
  assert.ok(tekst.includes('14:05:10  trigger  Église (80 m, straal 100 m, eco)'))
  assert.ok(tekst.includes('14:05:11  bel-fout  NotAllowedError'))
  assert.ok(tekst.endsWith('14:05:30  stop'))
  assert.strictEqual(alsTekst(null), '')
})

test('duurTekst', () => {
  assert.strictEqual(duurTekst(1400), '1,4 s')
  assert.strictEqual(duurTekst(89999), '90,0 s')
  assert.strictEqual(duurTekst(150000), '2,5 min')
  assert.strictEqual(duurTekst(NaN), '?')
})

console.log(`\n${geslaagd} tests geslaagd.`)
