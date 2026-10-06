/**
 * test-mp3bron.js
 *
 * Netwerkloze test voor mp3bron.js (0.11.0): herkennen van links,
 * Dropbox-omzetting, normaliseren van pluscodes en bestandsnamen,
 * koppelsleutels en de afspeelvolgorde link → lokaal bestand.
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-mp3bron.js
 */
import assert from 'node:assert'
import {
  isLink,
  normPluscode,
  zonderExtensie,
  isAudioBestand,
  directeLink,
  koppelSleutels,
  audioBronnen,
} from './mp3bron.js'
import { pluscode } from './pluscode.js'

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

const LINK = 'https://www.spannendegeschiedenis.nl/wp-content/uploads/2021/05/B-8-Staringkoepel-DEF-NL.mp3'

test('isLink: http en https wel, rest niet', () => {
  assert.ok(isLink(LINK))
  assert.ok(isLink('  http://voorbeeld.nl/a.mp3 '))
  assert.ok(!isLink('koepel.mp3'))
  assert.ok(!isLink('/storage/emulated/0/Music/koepel.mp3'))
  assert.ok(!isLink('file:///sdcard/koepel.mp3'))
  assert.ok(!isLink('content://media/external/audio/1'))
  assert.ok(!isLink(''))
  assert.ok(!isLink(undefined))
})

test('normPluscode: hoofdletters, alleen letters en cijfers', () => {
  assert.strictEqual(normPluscode('9f37m7rq+2x'), '9F37M7RQ2X')
  assert.strictEqual(normPluscode(' 9F37 M7RQ+2X '), '9F37M7RQ2X')
  assert.strictEqual(normPluscode(''), '')
})

test('zonderExtensie en isAudioBestand', () => {
  assert.strictEqual(zonderExtensie('9F37M7RQ+2X.mp3'), '9F37M7RQ+2X')
  assert.strictEqual(zonderExtensie('geen-extensie'), 'geen-extensie')
  assert.ok(isAudioBestand('a.MP3'))
  assert.ok(isAudioBestand('a.wav'))
  assert.ok(!isAudioBestand('a.ogg'))
  assert.ok(!isAudioBestand('a.csv'))
})

test('directeLink: Dropbox omgezet, dl en st weg', () => {
  assert.strictEqual(
    directeLink('https://www.dropbox.com/scl/fi/abc/koepel.mp3?rlkey=xyz&st=123&dl=0'),
    'https://dl.dropboxusercontent.com/scl/fi/abc/koepel.mp3?rlkey=xyz'
  )
  assert.strictEqual(
    directeLink('https://dropbox.com/s/abc/koepel.mp3?dl=0'),
    'https://dl.dropboxusercontent.com/s/abc/koepel.mp3'
  )
  assert.strictEqual(directeLink(` "${LINK}" `), LINK)
  assert.strictEqual(directeLink(''), '')
})

test('koppelSleutels: CSV-pluscode en berekende, zonder dubbeling', () => {
  assert.deepStrictEqual(koppelSleutels('9F37M7RQ+2X', '9F37M7RQ+2X'), ['9F37M7RQ2X'])
  assert.deepStrictEqual(koppelSleutels('9F37M7RQ+2X', '9F37M7RQ+3W'), ['9F37M7RQ2X', '9F37M7RQ3W'])
  assert.deepStrictEqual(koppelSleutels('', '9F37M7RQ+3W'), ['9F37M7RQ3W'])
})

test('bestandsnaam = pluscode van de POI koppelt', () => {
  const code = pluscode(52.15, 6.29)
  const sleutels = koppelSleutels('', code)
  assert.ok(sleutels.includes(normPluscode(zonderExtensie(`${code}.mp3`))))
})

test('audioBronnen: volgorde link → lokaal', () => {
  const poi = { mp3: LINK, audioLokaal: { url: 'blob:x', naam: '9F37M7RQ+2X.mp3' } }
  const { bronnen, overgeslagen } = audioBronnen(poi, true)
  assert.deepStrictEqual(
    bronnen.map((b) => b.soort),
    ['link', 'lokaal']
  )
  assert.strictEqual(bronnen[0].src, LINK)
  assert.strictEqual(overgeslagen, '')
})

test('audioBronnen: offline geen link, wel lokaal', () => {
  const poi = { mp3: LINK, audioLokaal: { url: 'blob:x', naam: 'a.mp3' } }
  const { bronnen, overgeslagen } = audioBronnen(poi, false)
  assert.deepStrictEqual(
    bronnen.map((b) => b.soort),
    ['lokaal']
  )
  assert.match(overgeslagen, /geen internet/)
})

test('audioBronnen: geen link in mp3-kolom → geen bron', () => {
  assert.strictEqual(audioBronnen({ mp3: 'koepel.mp3' }, true).bronnen.length, 0)
  assert.strictEqual(audioBronnen({ mp3: '' }, true).bronnen.length, 0)
  assert.strictEqual(audioBronnen({}, true).bronnen.length, 0)
  assert.strictEqual(audioBronnen(null, true).bronnen.length, 0)
})

console.log(`\n${geslaagd} tests geslaagd.`)
