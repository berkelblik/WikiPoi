/**
 * test-update.js
 *
 * Netwerkloze tests voor update.js (0.22.0).
 * Uitvoeren: node src/over/test-update.js (vanuit app/)
 */
import assert from 'node:assert'
import {
  leesVersie,
  vergelijkVersies,
  kiesNieuwste,
  beoordeel,
  autoControleNodig,
  controleer,
  leesLaatste,
  bewaarLaatste,
  RELEASES_URL,
  AUTO_INTERVAL_MS,
} from './update.js'

let geslaagd = 0
async function test(naam, fn) {
  await fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

const rel = (tag, extra = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/berkelblik/WikiPoi/releases/tag/${tag}`,
  draft: false,
  prerelease: false,
  ...extra,
})

await test('leesVersie: met en zonder v, pre-release, ongeldig', () => {
  assert.deepStrictEqual(leesVersie('v0.30.0-beta.2'), { kern: [0, 30, 0], pre: ['beta', 2] })
  assert.deepStrictEqual(leesVersie('0.22.0'), { kern: [0, 22, 0], pre: [] })
  assert.strictEqual(leesVersie('versie 1'), null)
  assert.strictEqual(leesVersie(null), null)
})

await test('vergelijkVersies volgens semver', () => {
  assert.ok(vergelijkVersies('0.22.0', '0.21.0') > 0)
  assert.ok(vergelijkVersies('0.21.0', '0.21.1') < 0)
  assert.ok(vergelijkVersies('0.30.0-beta', '0.22.0') > 0)
  assert.ok(vergelijkVersies('0.30.0-beta', '0.30.0') < 0)
  assert.ok(vergelijkVersies('0.30.0-beta.2', '0.30.0-beta.10') < 0)
  assert.ok(vergelijkVersies('0.30.0-beta', '0.30.0-beta.1') < 0)
  assert.ok(vergelijkVersies('1.0.0-alpha', '1.0.0-beta') < 0)
  assert.strictEqual(vergelijkVersies('v0.22.0', '0.22.0'), 0)
})

await test('kiesNieuwste: hoogste versie, ook pre-release, geen concept (E1)', () => {
  const n = kiesNieuwste([
    rel('v0.30.0'),
    rel('v0.31.0', { draft: true }),
    rel('v0.30.1-beta', { prerelease: true }),
    rel('test'),
  ])
  assert.deepStrictEqual(n, {
    versie: '0.30.1-beta',
    url: 'https://github.com/berkelblik/WikiPoi/releases/tag/v0.30.1-beta',
    prerelease: true,
  })
  assert.strictEqual(kiesNieuwste([]), null)
  assert.strictEqual(kiesNieuwste({ message: 'Not Found' }), null)
})

await test('beoordeel: nieuw / actueel / geen', () => {
  assert.strictEqual(beoordeel([rel('v0.30.0-beta', { prerelease: true })], '0.22.0').soort, 'nieuw')
  assert.deepStrictEqual(beoordeel([rel('v0.22.0')], '0.22.0'), { soort: 'actueel', versie: '0.22.0' })
  assert.strictEqual(beoordeel([rel('v0.21.0')], '0.22.0').soort, 'actueel')
  assert.deepStrictEqual(beoordeel([], '0.22.0'), { soort: 'geen' })
})

await test('autoControleNodig: hoogstens één keer per dag', () => {
  const nu = 1_800_000_000_000
  assert.strictEqual(autoControleNodig(null, nu), true)
  assert.strictEqual(autoControleNodig(nu - 1000, nu), false)
  assert.strictEqual(autoControleNodig(nu - AUTO_INTERVAL_MS, nu), true)
  assert.strictEqual(autoControleNodig(nu + 60000, nu), true) // klok teruggezet
})

await test('controleer: juiste URL, uitkomst en fouten', async () => {
  let gevraagd = null
  const goed = async (url) => {
    gevraagd = url
    return { ok: true, status: 200, json: async () => [rel('v0.30.0-beta', { prerelease: true })] }
  }
  const r = await controleer('0.22.0', { fetchFn: goed })
  assert.strictEqual(gevraagd, RELEASES_URL)
  assert.strictEqual(r.soort, 'nieuw')
  assert.strictEqual(r.versie, '0.30.0-beta')
  const leeg = await controleer('0.22.0', { fetchFn: async () => ({ ok: true, json: async () => [] }) })
  assert.deepStrictEqual(leeg, { soort: 'geen' })
  const limiet = await controleer('0.22.0', { fetchFn: async () => ({ ok: false, status: 403 }) })
  assert.deepStrictEqual(limiet, { soort: 'fout', tekst: 'GitHub vraagt even te wachten', code: 'wachten', status: 403 })
  const offline = await controleer('0.22.0', {
    fetchFn: async () => {
      throw new TypeError('Failed to fetch')
    },
  })
  assert.deepStrictEqual(offline, { soort: 'fout', tekst: 'geen verbinding met GitHub', code: 'verbinding' })
  const kapot = await controleer('0.22.0', { fetchFn: async () => ({ ok: false, status: 500 }) })
  assert.deepStrictEqual(kapot, { soort: 'fout', tekst: 'GitHub gaf fout 500', code: 'status', status: 500 })
})

await test('laatste controle bewaren en lezen', () => {
  const d = {}
  const o = { getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => (d[k] = String(v)) }
  assert.strictEqual(leesLaatste(o), null)
  bewaarLaatste(1234567, o)
  assert.strictEqual(leesLaatste(o), 1234567)
  assert.strictEqual(leesLaatste(null), null)
})

console.log(`Alle ${geslaagd} controles geslaagd.`)
