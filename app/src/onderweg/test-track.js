/**
 * test-track.js
 *
 * Netwerkloze test voor track.js (0.18.0): begin/stop, metingen en posities,
 * opslaan en laden, lijn, lengte, telling, bestandsnaam en GPX.
 * 0.18.1: pauze bij stilstand, hervatten in een nieuw segment, korte pauzes,
 * tik(), pauze bij stoppen, wissen en tracks van vóór 0.18.1.
 * 0.19.1: pauze alleen bij genoeg posities (P5), telt vanaf 20 s (P6),
 * metingen tijdens de pauze samengevat (P7), nauwkeurigheid in de ruwe
 * track (F1).
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-track.js
 */
import assert from 'node:assert'
import {
  maakTrack,
  lijnVan,
  lengteVan,
  tellingVan,
  alsGpx,
  bestandsnaam,
  segmentenVan,
  pauzesVan,
  OPSLAG_SLEUTEL,
  OPSLAAN_MS,
} from './track.js'
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
  // F1: nauwkeurigheid per ruw punt.
  assert.match(ruw, /<trkpt lat="52.01" lon="6.5"><time>2026-10-16T12:05:01Z<\/time><desc>±43 m<\/desc><\/trkpt>/)
  assert.ok(gpx.trim().endsWith('</gpx>'))
  assert.strictEqual(alsGpx(null), '')
})

// 0.18.1: rit met stilstand. Elke seconde een positie; klok en GPS-tijd
// lopen gelijk. 1° breedte ≈ 111 km, dus 0.00001° ≈ 1,1 m.
function ritMetPauze(pauzeSec) {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  let s = 0
  const stap = (lat) => {
    o.zet(START + s * 1000)
    const m = { lat, lng: 6.5, nauwkeurigheid: 5, tijd: START + s * 1000 }
    tr.positie(m)
    tr.meting(m, 'geaccepteerd')
    s += 1
  }
  // 5 s rijden, 20 m per seconde verder.
  for (let i = 0; i < 5; i++) stap(52.0 + i * 0.00018)
  const stilLat = 52.0 + 4 * 0.00018
  // Stilstand met ruis van ± 2 m.
  for (let i = 0; i < pauzeSec; i++) stap(stilLat + (i % 2 ? 0.00002 : -0.00002))
  // Weer rijden.
  for (let i = 1; i <= 5; i++) stap(stilLat + i * 0.00018)
  return { o, tr }
}

test('Pauze na 3 s stilstand, verder in een nieuw segment', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  const zet = (sec, lat) => {
    o.zet(START + sec * 1000)
    tr.positie({ lat, lng: 6.5, tijd: START + sec * 1000 })
  }
  zet(0, 52.0)
  zet(1, 52.00002)
  zet(2, 52.0)
  assert.strictEqual(tr.gepauzeerd(), false, 'na 2 s nog niet')
  zet(3, 52.00002)
  assert.strictEqual(tr.gepauzeerd(), true, 'na 3 s gepauzeerd')
  const voor = tr.huidig().gefilterd.length
  tr.meting({ lat: 52.0, lng: 6.5, nauwkeurigheid: 5, tijd: START + 4000 }, 'geaccepteerd')
  zet(30, 52.00005) // 5,6 m: nog binnen 8 m
  assert.strictEqual(tr.gepauzeerd(), true)
  assert.strictEqual(tr.huidig().gefilterd.length, voor, 'geen punten tijdens pauze')
  assert.strictEqual(tr.huidig().ruw.length, 0, 'geen ruwe metingen tijdens pauze')
  zet(31, 52.0001) // 11 m: verder
  assert.strictEqual(tr.gepauzeerd(), false)
  const d = tr.huidig()
  assert.strictEqual(d.pauzes.length, 1)
  assert.strictEqual(d.pauzes[0].tot, START + 31000)
  assert.strictEqual(d.pauzes[0].eind - d.pauzes[0].start, 28000)
  assert.strictEqual(segmentenVan(d).length, 2)
})

test('Hele rit: segmenten, lengte zonder sprong, pauzes en GPX', () => {
  const { o, tr } = ritMetPauze(60)
  o.zet(START + 80000)
  tr.stop()
  const d = tr.laad()
  const segs = segmentenVan(d)
  assert.strictEqual(segs.length, 2)
  // Rijden 4×20 m + stilstand (ruis) vóór de pauze, daarna 4×20 m: het
  // eerste punt na de pauze ligt ± 20 m verder, dat stuk telt niet mee.
  const lengte = lengteVan(d, afstand)
  assert.ok(lengte > 150 && lengte < 175, lengte)
  const p = pauzesVan(d)
  assert.strictEqual(p.aantal, 1)
  assert.ok(p.pauzeMs >= 55000 && p.pauzeMs <= 60000, p.pauzeMs)
  assert.strictEqual(p.onderwegMs, 80000 - p.pauzeMs)
  const gpx = alsGpx(d)
  assert.strictEqual((gpx.match(/<trkseg>/g) || []).length, 4, 'twee segmenten in elk van de twee tracks')
  assert.match(gpx, /<name>pauze \(58 s\)<\/name>/)
})

test('Korte pauze (< 20 s) maakt geen nieuw segment', () => {
  const { tr } = ritMetPauze(18)
  const d = tr.huidig()
  assert.strictEqual(d.pauzes.length, 0)
  assert.strictEqual(segmentenVan(d).length, 1)
  assert.strictEqual(tr.gepauzeerd(), false)
})

test('tik(): pauze ook zonder nieuwe posities', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('simulatie')
  tr.positie({ lat: 52.0, lng: 6.5, tijd: START })
  o.zet(START + 2000)
  tr.tik()
  assert.strictEqual(tr.gepauzeerd(), false)
  o.zet(START + 3000)
  tr.tik()
  assert.strictEqual(tr.gepauzeerd(), true)
  // Lopende pauze is meteen bewaard (herstart tijdens pauze).
  assert.strictEqual(JSON.parse(o.ruw.get(OPSLAG_SLEUTEL)).pauzes.length, 1)
})

test('Stoppen tijdens een pauze: geen pauze, maar het einde', () => {
  const { o, tr } = ritMetPauze(0)
  o.zet(START + 60000)
  tr.tik()
  assert.strictEqual(tr.gepauzeerd(), true)
  tr.stop()
  const d = tr.laad()
  assert.strictEqual(d.pauzes.length, 0)
  assert.strictEqual(pauzesVan(d).aantal, 0)
  assert.strictEqual(tr.gepauzeerd(), false)
})

test('Wissen en track van vóór 0.18.1 (zonder pauzes)', () => {
  const oud = { start: START, eind: START + 5000, ruw: [], gefilterd: [[START, 52, 6.5], [START + 1000, 52.001, 6.5]] }
  assert.strictEqual(segmentenVan(oud).length, 1)
  assert.deepStrictEqual(pauzesVan(oud), { aantal: 0, pauzeMs: 0, onderwegMs: 5000 })
  assert.match(alsGpx(oud), /<trkseg>/)
  const { o, tr } = rit()
  tr.wis()
  assert.ok(o.ruw.has(OPSLAG_SLEUTEL), 'niet wissen tijdens een rit')
  tr.stop()
  tr.wis()
  assert.strictEqual(tr.laad(), null)
})

test('P5: geen pauze zonder genoeg posities (gat in de metingen)', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  const zet = (sec, lat) => {
    o.zet(START + sec * 1000)
    tr.positie({ lat, lng: 6.5, tijd: START + sec * 1000 })
  }
  zet(0, 52.0)
  zet(8, 52.00002) // 8 s later, maar pas de tweede positie
  assert.strictEqual(tr.gepauzeerd(), false, 'twee posities zijn niet genoeg')
  zet(9, 52.0)
  assert.strictEqual(tr.gepauzeerd(), true, 'drie posities binnen 5 m, na 3 s')
})

test('P6: pauze telt vanaf 20 s; laatste pauze met duur', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  const zet = (sec, lat) => {
    o.zet(START + sec * 1000)
    tr.positie({ lat, lng: 6.5, tijd: START + sec * 1000 })
  }
  for (let i = 0; i <= 3; i++) zet(i, 52.0 + (i % 2) * 0.00002)
  assert.strictEqual(tr.gepauzeerd(), true)
  o.zet(START + 22000)
  assert.strictEqual(tr.pauzeTelt(), false, '19 s')
  o.zet(START + 23000)
  assert.strictEqual(tr.pauzeTelt(), true, '20 s')
  zet(40, 52.0002)
  assert.strictEqual(tr.pauzeTelt(), false)
  const p = tr.laatstePauze()
  assert.strictEqual(p.eind - p.start, 37000)
  assert.strictEqual(tr.huidig().pauzes.length, 1)
})

test('P7: metingen tijdens de pauze samengevat, niet als losse punten', () => {
  const o = omgeving(START)
  const tr = maakTrack({ nu: o.nu, opslag: o.opslag })
  tr.begin('voorgrond')
  const d = tr.huidig()
  const stilLat = 52.0
  // 4 s stil om de pauze te openen, daarna 60 metingen met ruis.
  for (let i = 0; i < 4; i++) {
    const t = START + (4 + i) * 1000
    o.zet(t)
    tr.positie({ lat: stilLat, lng: 6.5, tijd: t })
  }
  assert.strictEqual(tr.gepauzeerd(), true)
  const voor = d.ruw.length
  for (let i = 0; i < 60; i++) {
    const t = START + (8 + i) * 1000
    o.zet(t)
    const m = { lat: stilLat + (i % 3) * 0.00003, lng: 6.5, nauwkeurigheid: 10 + (i % 5) * 5, tijd: t }
    tr.positie(m)
    tr.meting(m, i % 4 ? 'geaccepteerd' : 'nauwkeurigheid')
  }
  assert.strictEqual(d.ruw.length, voor, 'geen ruwe punten tijdens de pauze')
  o.zet(START + 70000)
  tr.positie({ lat: stilLat + 0.0002, lng: 6.5, tijd: START + 70000 })
  const p = d.pauzes[0]
  assert.strictEqual(p.metingen, 60)
  assert.strictEqual(p.mediaanNauw, 20)
  assert.ok(p.maxAfstand > 6 && p.maxAfstand < 7.5, p.maxAfstand)
  assert.strictEqual(p.nauw, undefined, 'lijst na afsluiten weg')
  assert.match(
    alsGpx(d),
    /<name>pauze \(1 min\)<\/name><desc>60 metingen tijdens de pauze, mediaan ±20 m, tot 7 m van het pauzepunt<\/desc>/
  )
})

console.log(`\n${geslaagd} tests geslaagd.`)
