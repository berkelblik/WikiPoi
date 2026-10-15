/**
 * test-taalvolgorde.js
 *
 * Netwerkloze test voor taalvolgorde.js (0.17.0): automatische en eigen
 * taalvolgorde, de lijst bij "Eigen volgorde" (aan/uit, omhoog/omlaag) en
 * het bewaren/teruglezen van de keuze (met een nagebootste localStorage).
 *
 * Uitvoeren vanuit app/:  node src/test-taalvolgorde.js
 */
import assert from 'node:assert'
import {
  MAX_TALEN,
  basis,
  taalNaam,
  automatischeVolgorde,
  schoonKeuze,
  effectieveVolgorde,
  beginTalen,
  lijstRijen,
  wisselTaal,
  verplaatsTaal,
  volgordeTekst,
  leesTaalKeuze,
  bewaarTaalKeuze,
} from './taalvolgorde.js'

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

test('basis en taalNaam', () => {
  assert.strictEqual(basis('nl-NL'), 'nl')
  assert.strictEqual(basis('fr_BE'), 'fr')
  assert.strictEqual(taalNaam('de-CH'), 'Duits')
  assert.strictEqual(taalNaam('xx'), 'xx')
})

test('automatisch: telefoon → land → en → fr → de, zonder dubbele', () => {
  assert.deepStrictEqual(automatischeVolgorde('nl-NL', 'nl'), ['nl', 'en', 'fr', 'de'])
  assert.deepStrictEqual(automatischeVolgorde('fr-FR', 'nl'), ['fr', 'nl', 'en', 'de'])
  assert.deepStrictEqual(automatischeVolgorde('nl-NL', 'it'), ['nl', 'it', 'en', 'fr', 'de'])
  assert.deepStrictEqual(automatischeVolgorde('nl-NL', null), ['nl', 'en', 'fr', 'de'])
  assert.deepStrictEqual(automatischeVolgorde('ja-JP', 'cs'), ['ja', 'cs', 'en', 'fr', 'de'])
})

test('automatisch: hoogstens MAX_TALEN, ongeldige codes vallen weg', () => {
  assert.ok(automatischeVolgorde('nl', 'pl').length <= MAX_TALEN)
  assert.deepStrictEqual(automatischeVolgorde('n!', 'de'), ['de', 'en', 'fr'])
})

test('schoonKeuze: ongeldig → auto; eigen zonder talen → auto', () => {
  assert.deepStrictEqual(schoonKeuze(null), { modus: 'auto', talen: [] })
  assert.deepStrictEqual(schoonKeuze({ modus: 'eigen', talen: [] }), { modus: 'auto', talen: [] })
  assert.deepStrictEqual(schoonKeuze({ modus: 'eigen', talen: ['de', 'xx', 'de', 'NL'] }), {
    modus: 'eigen',
    talen: ['de', 'nl'],
  })
  assert.deepStrictEqual(schoonKeuze({ modus: 'raar', talen: ['fr'] }), { modus: 'auto', talen: ['fr'] })
})

test('effectieveVolgorde: auto gebruikt landtaal, eigen niet', () => {
  assert.deepStrictEqual(effectieveVolgorde({ modus: 'auto', talen: ['de'] }, 'fr-FR', 'nl'), ['fr', 'nl', 'en', 'de'])
  assert.deepStrictEqual(effectieveVolgorde({ modus: 'eigen', talen: ['de', 'nl'] }, 'fr-FR', 'it'), ['de', 'nl'])
})

test('beginTalen: bewaarde lijst, anders automatisch zonder landtaal', () => {
  assert.deepStrictEqual(beginTalen({ modus: 'auto', talen: ['de', 'nl'] }, 'nl-NL'), ['de', 'nl'])
  assert.deepStrictEqual(beginTalen({ modus: 'auto', talen: [] }, 'nl-NL'), ['nl', 'en', 'fr', 'de'])
  assert.deepStrictEqual(beginTalen(null, 'ja-JP'), ['en', 'fr', 'de'])
})

test('lijstRijen: gekozen eerst in volgorde, daarna de rest', () => {
  const rijen = lijstRijen(['de', 'nl'])
  assert.deepStrictEqual(
    rijen.slice(0, 3).map((r) => [r.code, r.gekozen]),
    [
      ['de', true],
      ['nl', true],
      ['en', false],
    ]
  )
  assert.strictEqual(rijen.length, 10)
  assert.strictEqual(rijen[0].naam, 'Duits')
})

test('wisselTaal: aan achteraan, uit; nooit 0, nooit meer dan MAX_TALEN', () => {
  assert.deepStrictEqual(wisselTaal(['nl'], 'de'), ['nl', 'de'])
  assert.deepStrictEqual(wisselTaal(['nl', 'de'], 'nl'), ['de'])
  assert.deepStrictEqual(wisselTaal(['nl'], 'nl'), ['nl'])
  const vol = ['nl', 'en', 'de', 'fr', 'es', 'it']
  assert.deepStrictEqual(wisselTaal(vol, 'pt'), vol)
  assert.deepStrictEqual(wisselTaal(['nl'], 'xx'), ['nl'])
})

test('verplaatsTaal: omhoog, omlaag, niet voorbij de rand', () => {
  assert.deepStrictEqual(verplaatsTaal(['nl', 'en', 'de'], 'de', -1), ['nl', 'de', 'en'])
  assert.deepStrictEqual(verplaatsTaal(['nl', 'en', 'de'], 'nl', 1), ['en', 'nl', 'de'])
  assert.deepStrictEqual(verplaatsTaal(['nl', 'en'], 'nl', -1), ['nl', 'en'])
  assert.deepStrictEqual(verplaatsTaal(['nl', 'en'], 'en', 1), ['nl', 'en'])
  assert.deepStrictEqual(verplaatsTaal(['nl', 'en'], 'fr', 1), ['nl', 'en'])
})

test('volgordeTekst', () => {
  assert.strictEqual(volgordeTekst(['nl', 'en', 'fr']), 'Nederlands → Engels → Frans')
})

test('bewaren en teruglezen', () => {
  Object.defineProperty(globalThis, 'localStorage', { value: nepOpslag(), configurable: true })
  assert.deepStrictEqual(leesTaalKeuze(), { modus: 'auto', talen: [] })
  bewaarTaalKeuze({ modus: 'eigen', talen: ['de', 'nl'] })
  assert.deepStrictEqual(leesTaalKeuze(), { modus: 'eigen', talen: ['de', 'nl'] })
  localStorage.setItem('wikipoi.taalkeuze', '{kapot')
  assert.deepStrictEqual(leesTaalKeuze(), { modus: 'auto', talen: [] })
})

test('opslag onbruikbaar → standaard, geen fout', () => {
  const kapot = {
    getItem: () => {
      throw new Error('kapot')
    },
    setItem: () => {
      throw new Error('kapot')
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: kapot, configurable: true })
  bewaarTaalKeuze({ modus: 'eigen', talen: ['de'] })
  assert.deepStrictEqual(leesTaalKeuze(), { modus: 'auto', talen: [] })
})

console.log(`\n${geslaagd} tests geslaagd.`)
