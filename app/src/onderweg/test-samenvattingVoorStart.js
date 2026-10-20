/**
 * test-samenvattingVoorStart.js
 *
 * Netwerkloze tests voor samenvattingVoorStart.js (0.20.0).
 * Uitvoeren: node src/onderweg/test-samenvattingVoorStart.js (vanuit app/)
 */
import assert from 'node:assert'
import { MAX_WACHT_MS, ophalenVoorStart, ophaalMelding, ophaalLogregel } from './samenvattingVoorStart.js'

let geslaagd = 0
async function test(naam, fn) {
  await fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

// Nep-timer: vuurt direct (time-out) of nooit.
const direct = (fn) => {
  fn()
  return 1
}
const nooit = () => 1
const traag = () => new Promise(() => {})

await test('niets te doen → niets, haal niet aangeroepen', async () => {
  let geroepen = false
  const r = await ophalenVoorStart({ aantal: 0, haal: () => (geroepen = true), wachtFn: nooit })
  assert.deepStrictEqual(r, { status: 'niets', aantal: 0 })
  assert.strictEqual(geroepen, false)
  assert.strictEqual(ophaalMelding(r), null)
  assert.strictEqual(ophaalLogregel(r), null)
})

await test('geslaagd: aantallen in logregel, melding alleen bij POI\'s zonder', async () => {
  const r = await ophalenVoorStart({
    aantal: 12,
    haal: async () => ({ opgehaald: 10, zonder: 2 }),
    wachtFn: nooit,
  })
  assert.deepStrictEqual(r, { status: 'klaar', aantal: 12, opgehaald: 10, zonder: 2 })
  assert.strictEqual(ophaalLogregel(r), 'samenvattingen: 10 opgehaald, 2 zonder')
  assert.strictEqual(ophaalMelding(r), "2 POI's zonder samenvatting: korte omschrijving.")
  const alles = await ophalenVoorStart({ aantal: 3, haal: async () => ({ opgehaald: 3, zonder: 0 }), wachtFn: nooit })
  assert.strictEqual(ophaalMelding(alles), null)
})

await test('offline → niet proberen', async () => {
  let geroepen = false
  const r = await ophalenVoorStart({ aantal: 1, online: false, haal: () => (geroepen = true), wachtFn: nooit })
  assert.strictEqual(r.status, 'offline')
  assert.strictEqual(geroepen, false)
  assert.strictEqual(ophaalMelding(r), 'Geen verbinding: 1 POI met korte omschrijving.')
  assert.strictEqual(ophaalLogregel(r), 'samenvattingen: geen verbinding (1 ontbrekend)')
})

await test('fout → toch starten met melding', async () => {
  const r = await ophalenVoorStart({
    aantal: 4,
    haal: async () => {
      throw new Error('HTTP 503')
    },
    wachtFn: nooit,
  })
  assert.deepStrictEqual(r, { status: 'fout', aantal: 4, fout: 'HTTP 503' })
  assert.strictEqual(ophaalLogregel(r), 'samenvattingen: mislukt (HTTP 503)')
  assert.match(ophaalMelding(r), /lukte niet: 4 POI's/)
})

await test('te lang → na de time-out starten', async () => {
  assert.strictEqual(MAX_WACHT_MS, 30000)
  const r = await ophalenVoorStart({ aantal: 5, haal: traag, wachtFn: direct })
  assert.strictEqual(r.status, 'te-lang')
  assert.strictEqual(ophaalLogregel(r), 'samenvattingen: nog bezig na 30 s (5 ontbrekend)')
})

await test('"Nu starten zonder" → overgeslagen', async () => {
  let sla
  const overslaan = new Promise((ok) => (sla = ok))
  const bezig = ophalenVoorStart({ aantal: 2, haal: traag, overslaan, wachtFn: nooit })
  sla()
  const r = await bezig
  assert.strictEqual(r.status, 'overgeslagen')
  assert.strictEqual(ophaalLogregel(r), 'samenvattingen: niet gewacht (2 ontbrekend)')
})

console.log(`\n${geslaagd} tests geslaagd.`)
