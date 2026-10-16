/**
 * test-track.js
 *
 * Netwerkloze test voor track.js (0.18.0): begin/stop, metingen en posities,
 * opslaan en laden, lijn, lengte, telling, bestandsnaam en GPX.
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-track.js
 */
import assert from 'node:assert'
import { maakTrack, lijnVan, lengteVan, tellingVan, alsGpx, bestandsnaam, OPSLAG_SLEUTEL, OPSLAAN_MS } from './track.js'
import { afstand } from './geo.js'

process.env.TZ = 'UTC'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

function omgeving(startMs) {
  let t = startMs
  const opslag = new Map()
  return {
    nu: () => t,
    zet: (ms) => {
      t = ms
    },
    opslag: { getItem: (k) => (opslag.has(k) ? opslag.get(k) : null), setItem: (k, v) => opslag.set(k, v) },
    ruw: opslag,
  }
}

const START = Date.UTC(2026, 9, 16, 12, 5, 0)

function rit() {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  tr.meting({ lat: 52.0, lng: 6.5, nauwkeurigheid: 5, tijd: START }, 'geaccepteerd')
  tr.positie({ lat: 52.0, lng: 6.5, tijd: START })
  tr.meting({ lat: 52.01, lng: 6.5, nauwkeurigheid: 43.2, tijd: START + 1000 }, 'nauwkeurigheid')
  tr.meting({ lat: 52.5, lng: 6.5, nauwkeurigheid: 8, tijd: START + 2000 }, 'sprong')
  tr.meting({ lat: 52.001, lng: 6.5, nauwkeurigheid: 6, tijd: START + 3000 }, 'geaccepteerd')
  tr.positie({ lat: 52.0005, lng: 6.5, tijd: START + 3000 })
  return { o, tr }
}

test('Metingen en posities worden bewaard', () => {
  const { tr } = rit()
  const d = tr.huidig()
  assert.strictEqual(d.ruw.length, 4)
  assert.strictEqual(d.gefilterd.length, 2)
  assert.deepStrictEqual(d.ruw[1], [START + 1000, 52.01, 6.5, 43.2, 'n'])
})

test('Onbekende status en geen begin → genegeerd', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.meting({ lat: 1, lng: 1 }, 'geaccepteerd')
  assert.strictEqual(tr.huidig(), null)
  tr.begin('x')
  tr.meting({ lat: 1, lng: 1 }, 'dubbel')
  assert.strictEqual(tr.huidig().ruw.length, 0)
})

test('Opslaan: bij begin, om de 30 s en bij stop', () => {
  const { o, tr } = rit()
  let opgeslagen = JSON.parse(o.ruw.get(OPSLAG_SLEUTEL))
  assert.strictEqual(opgeslagen.ruw.length, 0, 'alleen begin opgeslagen')
  o.zet(START + OPSLAAN_MS + 1)
  tr.positie({ lat: 52.002, lng: 6.5 })
  opgeslagen = JSON.parse(o.ruw.get(OPSLAG_SLEUTEL))
  assert.strictEqual(opgeslagen.gefilterd.length, 3)
  tr.stop()
  const geladen = tr.laad()
  assert.strictEqual(geladen.eind, START + OPSLAAN_MS + 1)
  assert.strictEqual(tr.huidig(), null)
})

test('Lijn, lengte en telling', () => {
  const { tr } = rit()
  const d = tr.huidig()
  assert.deepStrictEqual(lijnVan(d), [[52.0, 6.5], [52.0005, 6.5]])
  assert.ok(Math.abs(lengteVan(d, afstand) - 55.6) < 0.5, lengteVan(d, afstand))
  assert.deepStrictEqual(tellingVan(d), { geaccepteerd: 2, nauwkeurigheid: 1, sprong: 1 })
  assert.deepStrictEqual(lijnVan(null), [])
})

test('Bestandsnaam', () => {
  assert.strictEqual(bestandsnaam({ start: START }), 'WikiPoi-track-2026-10-16-1205.gpx')
})

test('GPX: twee tracks en weggegooide metingen als wpt', () => {
  const { tr } = rit()
  const gpx = alsGpx(tr.huidig(), { naam: 'Rit & test' })
  assert.match(gpx, /^<\?xml version="1.0"/)
  assert.match(gpx, /<name>Rit &amp; test<\/name>/)
  assert.strictEqual((gpx.match(/<trk>/g) || []).length, 2)
  assert.strictEqual((gpx.match(/<wpt /g) || []).length, 2)
  assert.match(gpx, /<name>weggegooid: nauwkeurigheid 43 m<\/name>/)
  assert.match(gpx, /<name>weggegooid: sprong \(± 8 m\)<\/name>/)
  assert.match(gpx, /<trkpt lat="52.0005" lon="6.5"><time>2026-10-16T12:05:03Z<\/time><\/trkpt>/)
  const ruw = gpx.split('<name>Ruw (alle metingen)</name>')[1]
  assert.strictEqual((ruw.match(/<trkpt /g) || []).length, 4)
  assert.ok(gpx.trim().endsWith('</gpx>'))
  assert.strictEqual(alsGpx(null), '')
})

console.log(`\n${geslaagd} tests geslaagd.`)
