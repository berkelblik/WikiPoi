/**
 * test-vertaling.js
 *
 * Netwerkloze tests voor de vertaling van de bediening (0.23.0, onderwerp 6):
 *   - elke sleutel staat in elke taal, met dezelfde {plaatshouders};
 *   - meervoud heeft 'een' en 'meer', vet (**) staat in paren;
 *   - elke sleutel die in de broncode genoemd wordt, bestaat;
 *   - t(), meervoud, terugval, getal(), telwoord(), taalkeuze en stem (E1).
 * Uitvoeren: node src/test-vertaling.js (vanuit app/)
 */
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TALEN,
  BEDIENINGS_TALEN,
  TAAL_INSTELLINGEN,
  EIGEN_NAAM,
  t,
  tIn,
  heeft,
  getal,
  telwoord,
  zetTaal,
  bedieningsTaal,
  automatischeTaal,
  taalVoorKeuze,
  stemTaal,
  spreekTaal,
} from './vertaal.js'
import { VERVOER_KEUZES } from './instellingen.js'
import { TAAL_KEUZES } from './taalvolgorde.js'
import { BRONNEN } from './over/bronnen.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log(`ok - ${naam}`)
}

const NL = TALEN.nl.teksten
const vormen = (w) => (w && typeof w === 'object' ? Object.values(w) : [w])
const plaatshouders = (w) => [...new Set(vormen(w).flatMap((v) => v.match(/\{\w+\}/g) || []))].sort()

test('talen: nl en en, keuzes en eigen namen', () => {
  assert.deepStrictEqual(BEDIENINGS_TALEN.slice(0, 2), ['nl', 'en'])
  assert.deepStrictEqual(TAAL_INSTELLINGEN, ['auto', 'nl', 'en', 'de', 'fr'])
  BEDIENINGS_TALEN.forEach((c) => assert.ok(EIGEN_NAAM[c], c))
})

test('elke sleutel in elke taal, en geen extra sleutels', () => {
  for (const taal of Object.keys(TALEN)) {
    const T = TALEN[taal].teksten
    const ontbreekt = Object.keys(NL).filter((k) => !(k in T))
    const extra = Object.keys(T).filter((k) => !(k in NL))
    assert.deepStrictEqual(ontbreekt, [], `${taal} mist`)
    assert.deepStrictEqual(extra, [], `${taal} heeft extra`)
  }
})

test('zelfde plaatshouders in elke taal', () => {
  for (const taal of Object.keys(TALEN)) {
    for (const [k, w] of Object.entries(TALEN[taal].teksten)) {
      assert.deepStrictEqual(plaatshouders(w), plaatshouders(NL[k]), `${taal}: ${k}`)
    }
  }
})

test('vorm: tekst of { een, meer } met {aantal}; vet in paren; meervoudsregel en telwoorden', () => {
  for (const taal of Object.keys(TALEN)) {
    const P = TALEN[taal]
    assert.strictEqual(typeof P.meervoud, 'function', taal)
    assert.ok(P.decimaal === ',' || P.decimaal === '.', taal)
    assert.strictEqual(P.telwoorden.length, 11, taal)
    for (const [k, w] of Object.entries(P.teksten)) {
      if (typeof w === 'object') {
        assert.deepStrictEqual(Object.keys(w).sort(), ['een', 'meer'], `${taal}: ${k}`)
        assert.ok(plaatshouders(w).includes('{aantal}') || k === 'keuze.pauzeTekst', `${taal}: ${k} zonder {aantal}`)
      } else {
        assert.strictEqual(typeof w, 'string', `${taal}: ${k}`)
      }
      vormen(w).forEach((v) => assert.strictEqual(v.split('**').length % 2, 1, `${taal}: ${k} vet`))
    }
  }
})

// Alle .js/.jsx-bestanden in src/ (behalve talen/ en tests).
function bronbestanden(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam)
    if (statSync(pad).isDirectory()) return naam === 'talen' ? [] : bronbestanden(pad)
    return /\.jsx?$/.test(naam) && !/^test-/.test(naam) ? [pad] : []
  })
}

test('elke sleutel uit de broncode bestaat', () => {
  const src = dirname(fileURLToPath(import.meta.url))
  const RE = /'((?:alg|kop|update|stap\d|vervoer|onderweg|ophalen|gps|eco|keuze|kaart|inst|welkom|over|bron|taal)\.[A-Za-z0-9.]+)'/g
  const gevonden = new Set()
  for (const pad of bronbestanden(src)) {
    for (const m of readFileSync(pad, 'utf8').matchAll(RE)) gevonden.add(m[1])
  }
  // Sleutels die in de code worden samengesteld.
  VERVOER_KEUZES.forEach((v) => gevonden.add(`vervoer.${v}`))
  ;['wiki', 'eigen', 'beide'].forEach((b) => {
    gevonden.add(`stap2.bron.${b}`)
    gevonden.add(`stap2.bron.${b}.uitleg`)
  })
  ;['geenFetch', 'wachten', 'status', 'verbinding'].forEach((c) => gevonden.add(`inst.update.reden.${c}`))
  BRONNEN.forEach((b) => gevonden.add(`bron.${b.sleutel}`))
  TAAL_KEUZES.forEach((c) => gevonden.add(`taal.${c}`))
  const ontbreekt = [...gevonden].filter((k) => !(k in NL))
  assert.deepStrictEqual(ontbreekt, [])
  assert.ok(gevonden.size > 300, `maar ${gevonden.size} sleutels gevonden`)
})

test('t(): standaard Nederlands, plaatshouders, meervoud, onbekende sleutel', () => {
  assert.strictEqual(bedieningsTaal(), 'nl')
  assert.strictEqual(t('stap1.titel'), 'Route')
  assert.strictEqual(t('stap4.teVer', { aantal: 1, km: '2 km' }).slice(0, 18), '1 eigen POI ligt v')
  assert.ok(t('stap4.teVer', { aantal: 3, km: '2 km' }).startsWith("3 eigen POI's liggen"))
  assert.strictEqual(t('stap1.punten', { aantal: 1 }), '1 routepunten')
  assert.strictEqual(t('alg.fout'), 'Fout: {bericht}')
  assert.strictEqual(t('bestaat.niet'), 'bestaat.niet')
  assert.strictEqual(heeft('taal.de'), true)
  assert.strictEqual(heeft('taal.xx'), false)
  assert.strictEqual(tIn('en', 'stap1.punten', { aantal: 1 }), '1 route point')
  assert.strictEqual(tIn('en', 'stap1.punten', { aantal: 0 }), '0 route points')
  assert.strictEqual(tIn('xx', 'stap1.uitleg'), NL['stap1.uitleg'])
})

test('taalkeuze: automatisch uit de telefoontaal, anders Engels', () => {
  assert.strictEqual(automatischeTaal('nl-BE'), 'nl')
  assert.strictEqual(automatischeTaal('en-US'), 'en')
  assert.strictEqual(automatischeTaal('it-IT'), 'en')
  assert.strictEqual(automatischeTaal(''), 'en')
  assert.strictEqual(taalVoorKeuze('nl', 'en-US'), 'nl')
  assert.strictEqual(taalVoorKeuze('auto', 'nl-NL'), 'nl')
  assert.strictEqual(taalVoorKeuze('onzin', 'nl-NL'), 'nl')
  for (const k of ['de', 'fr']) assert.strictEqual(taalVoorKeuze(k, 'nl-NL'), TALEN[k] ? k : 'en')
})

test('getal en telwoord volgen de bedieningstaal; zetTaal', () => {
  assert.strictEqual(getal(1.5, 1), '1,5')
  assert.strictEqual(getal(0.5), '0,5')
  assert.strictEqual(telwoord(2), 'twee')
  assert.strictEqual(telwoord(2, true), 'Twee')
  assert.strictEqual(telwoord(12), '12')
  assert.strictEqual(zetTaal('en'), 'en')
  assert.strictEqual(getal(1.5, 1), '1.5')
  assert.strictEqual(telwoord(3, true), 'Three')
  assert.strictEqual(t('stap4.gevonden', { aantal: 1 }), '**1** POI found')
  assert.strictEqual(zetTaal('nl'), 'nl')
  assert.strictEqual(t('stap4.gevonden', { aantal: 1 }), "**1** POI's gevonden")
})

test('stem (E1): gekozen taal → stem van die taal; automatisch → geen voorkeur (telefoon)', () => {
  zetTaal('nl')
  assert.ok(/^nl/.test(stemTaal()))
  assert.ok(/^nl/.test(spreekTaal()))
  zetTaal('en')
  assert.ok(/^en/.test(stemTaal()))
  assert.ok(/^en/.test(spreekTaal()))
  zetTaal('auto')
  assert.strictEqual(spreekTaal(), null)
  zetTaal('nl')
})

console.log(`Alle ${geslaagd} controles geslaagd.`)
