/**
 * test-poiKeuze.js
 *
 * Netwerkloze test voor poiKeuze.js (0.19.0): meerdere POI's tegelijk,
 * keuzevenster, verlopen, kiezen, wachtrij (O6), pauze (O7) en teksten.
 * 0.19.1: herhaling van het pauzevenster hoogstens eens per 5 min (P6).
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-poiKeuze.js
 */
import assert from 'node:assert'
import {
  besluitBinnen,
  keuzeVerlopen,
  kiesUit,
  volgendeUitWachtrij,
  pauzeKeuze,
  magPauzeAanbieden,
  PAUZE_HERHAAL_MS,
  aankondigingTekst,
  pauzeTekst,
  opsomming,
  voegToe,
} from './poiKeuze.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

const A = { id: 'a' }
const B = { id: 'b' }
const C = { id: 'c' }

test('Eén POI, niets bezig: direct voorlezen', () => {
  const r = besluitBinnen({ nieuw: [A] })
  assert.strictEqual(r.speel, 'a')
  assert.strictEqual(r.keuze, null)
  assert.strictEqual(r.aankondig, false)
})

test('Geen nieuwe POI: niets', () => {
  const r = besluitBinnen({ nieuw: [], bezig: true })
  assert.deepStrictEqual([r.speel, r.keuze, r.wachtend, r.later], [null, null, [], []])
})

test('Twee tegelijk, scherm zichtbaar: venster overlap + aankondiging', () => {
  const r = besluitBinnen({ nieuw: [A, B] })
  assert.deepStrictEqual(r.keuze, { soort: 'overlap', ids: ['a', 'b'] })
  assert.strictEqual(r.aankondig, true)
  assert.strictEqual(r.speel, null)
})

test('Twee tegelijk, scherm uit: dichtstbij voorlezen, rest naar Later (O5)', () => {
  const r = besluitBinnen({ nieuw: [A, B, C], zichtbaar: false })
  assert.strictEqual(r.speel, 'a')
  assert.deepStrictEqual(r.later, ['b', 'c'])
  assert.strictEqual(r.keuze, null)
})

test('Bezig + nieuwe, zichtbaar: venster "ook", geen aankondiging', () => {
  const r = besluitBinnen({ nieuw: [B], bezig: true })
  assert.deepStrictEqual(r.keuze, { soort: 'ook', ids: ['b'] })
  assert.strictEqual(r.aankondig, false)
  assert.strictEqual(r.speel, null)
})

test('Bezig + nieuwe, scherm uit: in de wachtrij', () => {
  const r = besluitBinnen({ nieuw: [B, C], bezig: true, zichtbaar: false })
  assert.deepStrictEqual(r.wachtend, ['b', 'c'])
  assert.strictEqual(r.keuze, null)
})

test('Venster open: nieuwe erbij (zonder dubbelen), aftellen loopt door (M3)', () => {
  const r = besluitBinnen({ nieuw: [B, C], keuze: { soort: 'overlap', ids: ['a', 'b'], tot: 12345 } })
  assert.deepStrictEqual(r.keuze, { soort: 'overlap', ids: ['a', 'b', 'c'], tot: 12345 })
  assert.strictEqual(r.aankondig, false)
})

test('Pauzevenster open + nieuwe POI: gewoon beslissen', () => {
  const r = besluitBinnen({
    nieuw: [C],
    keuze: { soort: 'pauze', ids: ['a'] },
  })
  assert.strictEqual(r.speel, 'c')
})

test('Verlopen: overlap → dichtstbij, rest Later; ook → wachtrij; pauze → niets', () => {
  let r = keuzeVerlopen({ soort: 'overlap', ids: ['a', 'b', 'c'] })
  assert.strictEqual(r.speel, 'a')
  assert.deepStrictEqual(r.later, ['b', 'c'])
  r = keuzeVerlopen({ soort: 'ook', ids: ['b'] })
  assert.strictEqual(r.speel, null)
  assert.deepStrictEqual(r.wachtend, ['b'])
  r = keuzeVerlopen({ soort: 'pauze', ids: ['a'] })
  assert.deepStrictEqual([r.speel, r.later, r.wachtend], [null, [], []])
  assert.strictEqual(keuzeVerlopen(null).speel, null)
})

test('Kiezen: overlap, ook (onderbreken) en pauze', () => {
  let r = kiesUit({ soort: 'overlap', ids: ['a', 'b', 'c'] }, 'b')
  assert.strictEqual(r.speel, 'b')
  assert.deepStrictEqual(r.later, ['a', 'c'])
  assert.strictEqual(r.onderbreek, false)
  r = kiesUit({ soort: 'ook', ids: ['b', 'c'] }, 'c')
  assert.strictEqual(r.speel, 'c')
  assert.deepStrictEqual(r.wachtend, ['b'])
  assert.strictEqual(r.onderbreek, true)
  r = kiesUit({ soort: 'pauze', ids: ['a', 'b'] }, 'a')
  assert.strictEqual(r.speel, 'a')
  assert.deepStrictEqual(r.later, [])
  assert.strictEqual(kiesUit({ soort: 'overlap', ids: ['a'] }, 'x').speel, null)
})

test('Wachtrij (O6): voorbij → Later, eerste binnen de straal wordt voorgelezen', () => {
  const binnen = { a: false, b: true, c: true }
  const r = volgendeUitWachtrij(['a', 'b', 'c'], (id) => !!binnen[id])
  assert.strictEqual(r.speel, 'b')
  assert.deepStrictEqual(r.later, ['a'])
  assert.deepStrictEqual(r.rest, ['c'])
  const leeg = volgendeUitWachtrij(['a'], () => false)
  assert.strictEqual(leeg.speel, null)
  assert.deepStrictEqual(leeg.later, ['a'])
})

test('Pauzevenster (O7) alleen bij pauze, iets in Later, niets bezig, geen venster', () => {
  assert.deepStrictEqual(pauzeKeuze({ gepauzeerd: true, later: ['a', 'b'] }), {
    soort: 'pauze',
    ids: ['a', 'b'],
  })
  assert.strictEqual(pauzeKeuze({ gepauzeerd: false, later: ['a'] }), null)
  assert.strictEqual(pauzeKeuze({ gepauzeerd: true, later: [] }), null)
  assert.strictEqual(pauzeKeuze({ gepauzeerd: true, later: ['a'], bezig: true }), null)
  assert.strictEqual(
    pauzeKeuze({
      gepauzeerd: true,
      later: ['a'],
      keuze: { soort: 'ook', ids: ['b'] },
    }),
    null
  )
})

test('Pauzevenster herhalen (P6): na 5 min, of eerder als er iets nieuws in Later staat', () => {
  assert.strictEqual(PAUZE_HERHAAL_MS, 300000)
  assert.strictEqual(magPauzeAanbieden({ nu: 1000, vorige: null, later: ['a'] }), true)
  const vorige = { tijd: 1000, ids: ['a', 'b'] }
  assert.strictEqual(magPauzeAanbieden({ nu: 31000, vorige, later: ['a', 'b'] }), false)
  assert.strictEqual(magPauzeAanbieden({ nu: 31000, vorige, later: ['b'] }), false)
  assert.strictEqual(magPauzeAanbieden({ nu: 31000, vorige, later: ['a', 'c'] }), true)
  assert.strictEqual(magPauzeAanbieden({ nu: 1000 + PAUZE_HERHAAL_MS, vorige, later: ['a'] }), true)
})

test('Teksten en hulpjes', () => {
  assert.strictEqual(
    aankondigingTekst(['Kasteel Keppel', 'Laurentiuskerk']),
    'Hier twee bezienswaardigheden: Kasteel Keppel en Laurentiuskerk.'
  )
  assert.strictEqual(aankondigingTekst(['A', 'B', 'C']), 'Hier drie bezienswaardigheden: A, B en C.')
  assert.strictEqual(
    aankondigingTekst(['A', 'B', 'C', 'D', 'E']),
    'Hier vijf bezienswaardigheden: A, B, C en nog twee.'
  )
  assert.strictEqual(aankondigingTekst(['A', 'B', 'C', 'D']), 'Hier vier bezienswaardigheden: A, B, C en nog één.')
  assert.strictEqual(pauzeTekst(1), 'Je hebt één bezienswaardigheid om te beluisteren.')
  assert.strictEqual(pauzeTekst(3), 'Je hebt drie bezienswaardigheden om te beluisteren.')
  assert.strictEqual(pauzeTekst(12), 'Je hebt 12 bezienswaardigheden om te beluisteren.')
  assert.strictEqual(opsomming(['A']), 'A')
  assert.deepStrictEqual(voegToe(['a'], ['b', 'a', 'c']), ['a', 'b', 'c'])
})

console.log(`\n${geslaagd} tests geslaagd.`)
