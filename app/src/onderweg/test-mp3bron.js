/**
 * test-mp3bron.js
 *
 * Netwerkloze test voor mp3bron.js (0.11.0): herkennen van links,
 * Dropbox-omzetting, normaliseren van pluscodes en bestandsnamen,
 * koppelsleutels, de afspeelvolgorde lokaal → kopie → link (0.14.0), de
 * bestandsnaam van een gedownloade kopie, de audiocontrole van een download
 * en de groottetekst.
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
  kopieNaam,
  lijktAudio,
  grootteTekst,
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

test('audioBronnen: volgorde lokaal → kopie → link', () => {
  const poi = {
    mp3: LINK,
    audioLokaal: { url: 'blob:x', naam: '9F37M7RQ+2X.mp3' },
    audioKopie: { url: 'http://localhost/_capacitor_file_/k.mp3' },
  }
  const { bronnen, overgeslagen } = audioBronnen(poi, true)
  assert.deepStrictEqual(
    bronnen.map((b) => b.soort),
    ['lokaal', 'kopie', 'link']
  )
  assert.strictEqual(bronnen[1].naam, LINK)
  assert.strictEqual(bronnen[2].src, LINK)
  assert.strictEqual(overgeslagen, '')
})

test('audioBronnen: offline met kopie → kopie, link overgeslagen', () => {
  const poi = { mp3: LINK, audioKopie: { url: 'http://localhost/_capacitor_file_/k.mp3' } }
  const { bronnen, overgeslagen } = audioBronnen(poi, false)
  assert.deepStrictEqual(
    bronnen.map((b) => b.soort),
    ['kopie']
  )
  assert.match(overgeslagen, /geen internet/)
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

test('kopieNaam: vast, met extensie uit de link', () => {
  const a = kopieNaam(LINK)
  assert.match(a, /^[0-9a-f]{8}\.mp3$/)
  assert.strictEqual(kopieNaam(` ${LINK} `), a)
  assert.notStrictEqual(kopieNaam(LINK + '?v=2'), a)
  assert.match(kopieNaam('https://voorbeeld.nl/geluid/koepel.WAV'), /\.wav$/)
  assert.match(kopieNaam('https://voorbeeld.nl/stream?id=4'), /\.mp3$/)
  assert.match(kopieNaam('geen link'), /\.mp3$/)
})

test('lijktAudio: audio wel, webpagina niet', () => {
  const b = (t) => Buffer.from(t, 'latin1').toString('base64')
  assert.ok(lijktAudio('audio/mpeg', b('ID3\u0004\u0000\u0000\u0000\u0000')))
  assert.ok(lijktAudio('application/octet-stream', b('\u00ff\u00fb\u0090\u0064\u0000\u0000\u0000\u0000')))
  assert.ok(lijktAudio('', b('RIFF\u0024\u0000\u0000\u0000WAVE')))
  assert.ok(lijktAudio('binary/octet-stream', b('\u0000\u0000\u0000\u0020ftypM4A ')))
  assert.ok(!lijktAudio('text/html; charset=utf-8', b('ID3\u0004\u0000\u0000\u0000\u0000')))
  assert.ok(!lijktAudio('', b('<!DOCTYPE html><html>')))
  assert.ok(!lijktAudio('audio/mpeg', ''))
})

test('grootteTekst: kB en MB met komma', () => {
  assert.strictEqual(grootteTekst(0), '0 kB')
  assert.strictEqual(grootteTekst(850000), '850 kB')
  assert.strictEqual(grootteTekst(4300000), '4,3 MB')
})

console.log(`\n${geslaagd} tests geslaagd.`)
