/**
 * test-voorleestekst.js
 *
 * Netwerkloze test voor voorleestekst.js (0.13.0): staat de naam al in de
 * toelichting, de exporttekst "Naam. Toelichting" en de voorleesdelen
 * (klokzin → naam → toelichting, samenvoegen per taal, eco en terugval).
 *
 * Uitvoeren vanuit app/:  node src/onderweg/test-voorleestekst.js
 */
import assert from 'node:assert'

// Toestel op Nederlands zetten (Node meldt zelf 'en-US').
Object.defineProperty(globalThis, 'navigator', {
  value: { language: 'nl-NL' },
  configurable: true,
})

const { naamInTekst, naamZin, tekstMetNaam, toelichtingVan, voorleesDelen } = await import(
  './voorleestekst.js'
)

let geslaagd = 0
function test(naam, fn) {
  fn()
  geslaagd += 1
  console.log('OK  ' + naam)
}

const ZIN = 'Oorlogsmonument, ter herdenking van de bemanning van een Lancaster.'

test('naamInTekst: hoofdletters, accenten en leestekens tellen niet', () => {
  assert.ok(naamInTekst('Sint-Janskerk', 'De sint janskerk is een kerk in Laren.'))
  assert.ok(naamInTekst('Château de Chambord', 'Het chateau de Chambord is een kasteel.'))
  assert.ok(naamInTekst("'t Hoge Huis", 'Het pand t Hoge Huis staat aan de markt.'))
  assert.ok(!naamInTekst('Neergestorte vlieger', ZIN))
})

test('naamInTekst: alleen hele woorden', () => {
  assert.ok(!naamInTekst('Kerk', 'Een kerkgebouw uit de 15e eeuw.'))
  assert.ok(naamInTekst('Kerk', 'Kerk uit de 15e eeuw.'))
})

test('naamInTekst: toevoeging tussen haakjes hoeft er niet in', () => {
  assert.ok(naamInTekst('Sint-Jan (Laren)', 'De Sint-Jan is een kerk.'))
  assert.ok(naamInTekst('Sint-Jan (Laren)', 'Sint-Jan (Laren) is een kerk.'))
  assert.ok(!naamInTekst('Sint-Jan (Laren)', 'Een kerk in Laren.'))
})

test('naamInTekst: zonder naam altijd waar', () => {
  assert.ok(naamInTekst('', ZIN))
  assert.ok(naamInTekst(undefined, ZIN))
})

test('naamZin: punt erbij, niet dubbel', () => {
  assert.strictEqual(naamZin('Neergestorte vlieger'), 'Neergestorte vlieger.')
  assert.strictEqual(naamZin('Kijk uit!'), 'Kijk uit!')
  assert.strictEqual(naamZin('St.'), 'St.')
  assert.strictEqual(naamZin('  '), '')
})

test('tekstMetNaam (export): naam ervoor als die ontbreekt, anders ongewijzigd', () => {
  assert.strictEqual(tekstMetNaam('Neergestorte vlieger', ZIN), `Neergestorte vlieger. ${ZIN}`)
  const wp = 'De Sint-Janskerk is een kerk in Laren.'
  assert.strictEqual(tekstMetNaam('Sint-Janskerk', wp), wp)
  assert.strictEqual(tekstMetNaam('Picknickplaats', ''), '')
  assert.strictEqual(tekstMetNaam('', ZIN), ZIN)
  // Opnieuw importeren van een export: geen dubbele naam.
  const eenmaal = tekstMetNaam('Neergestorte vlieger', ZIN)
  assert.strictEqual(tekstMetNaam('Neergestorte vlieger', eenmaal), eenmaal)
})

test('toelichtingVan: samenvatting, anders beschrijving', () => {
  const poi = { id: 'Q1', description: 'oorlogsmonument in Lochem' }
  assert.strictEqual(toelichtingVan(poi, {}), 'oorlogsmonument in Lochem')
  assert.strictEqual(toelichtingVan(poi, { Q1: { summary: { extractShort: ZIN } } }), ZIN)
  assert.strictEqual(toelichtingVan({ id: 'e1' }, null), '')
})

const vlieger = { id: 'Q1', label: 'Neergestorte vlieger', labelLanguage: 'nl' }
const zinUitWikidata = { Q1: { summary: { extractShort: ZIN, lang: 'nl' } } }

test('voorleesDelen: klokzin → naam → toelichting in één deel', () => {
  assert.deepStrictEqual(voorleesDelen(vlieger, zinUitWikidata, 3), [
    { tekst: `Op 3 uur. Neergestorte vlieger. ${ZIN}`, lang: 'nl' },
  ])
})

test('voorleesDelen: eco/terugval zonder klokzin', () => {
  assert.deepStrictEqual(voorleesDelen(vlieger, zinUitWikidata, null), [
    { tekst: `Neergestorte vlieger. ${ZIN}`, lang: 'nl' },
  ])
})

test('voorleesDelen: naam al in de samenvatting → niet dubbel', () => {
  const kerk = { id: 'Q2', label: 'Sint-Janskerk', labelLanguage: 'nl' }
  const s = { Q2: { summary: { extractShort: 'De Sint-Janskerk is een kerk.', lang: 'nl' } } }
  assert.deepStrictEqual(voorleesDelen(kerk, s, 9), [
    { tekst: 'Op 9 uur. De Sint-Janskerk is een kerk.', lang: 'nl' },
  ])
})

test('voorleesDelen: zonder toelichting naam en dan klokzin (zoals voorheen)', () => {
  assert.deepStrictEqual(voorleesDelen(vlieger, {}, 3), [
    { tekst: 'Neergestorte vlieger. Op 3 uur.', lang: 'nl-NL' },
  ])
  assert.deepStrictEqual(voorleesDelen({ id: 'x' }, {}, 3), [{ tekst: 'Op 3 uur.', lang: 'nl-NL' }])
  assert.deepStrictEqual(voorleesDelen({ id: 'x' }, {}, null), [])
})

test('voorleesDelen: andere talen → aparte delen met eigen stem', () => {
  const chateau = { id: 'Q3', label: 'Château de Chambord', labelLanguage: 'fr' }
  const s = { Q3: { summary: { extractShort: 'Un château de la Loire.', lang: 'fr' } } }
  assert.deepStrictEqual(voorleesDelen(chateau, s, 2), [
    { tekst: 'Op 2 uur.', lang: 'nl-NL' },
    { tekst: 'Château de Chambord. Un château de la Loire.', lang: 'fr' },
  ])
  const monument = { id: 'Q4', label: 'Monument aux morts', labelLanguage: 'fr' }
  const z = { Q4: { summary: { extractShort: 'Oorlogsmonument in Bayeux.', lang: 'nl' } } }
  assert.deepStrictEqual(voorleesDelen(monument, z, 12), [
    { tekst: 'Op 12 uur.', lang: 'nl-NL' },
    { tekst: 'Monument aux morts.', lang: 'fr' },
    { tekst: 'Oorlogsmonument in Bayeux.', lang: 'nl' },
  ])
})

test('voorleesDelen: eigen POI met beschrijving zonder naam', () => {
  const eigen = { id: 'e1', eigen: true, label: 'Picknickplaats', description: 'Bankjes aan de Berkel.' }
  assert.deepStrictEqual(voorleesDelen(eigen, {}, null), [
    { tekst: 'Picknickplaats. Bankjes aan de Berkel.', lang: 'nl-NL' },
  ])
})

console.log(`\nAlle ${geslaagd} controles geslaagd.`)
