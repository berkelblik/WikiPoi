/**
 * test-wikidata-query.js
 *
 * Netwerkloze test voor wikidata-search.js: taallijst (resolveLanguages),
 * querytekst (buildBoxQuery) en het kiezen van het beste artikel per item
 * (parseSparqlResults) met een nagebootste SPARQL-respons.
 *
 * Uitvoeren vanuit src/:  node test-wikidata-query.js
 */

'use strict';

const assert = require('assert');
const {
  resolveLanguages,
  buildBoxQuery,
  parseSparqlResults,
  dedupeById,
} = require('./wikidata-search.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log('OK  ' + name);
}

const bbox = { minLat: 47.1, maxLat: 47.3, minLng: 3.9, maxLng: 4.2 };

// --- resolveLanguages -------------------------------------------------------

test('standaard: nl + terugvaltalen', () => {
  assert.deepStrictEqual(resolveLanguages(), ['nl', 'en', 'fr', 'de']);
});

test('telefoontaal met regio wordt afgekapt', () => {
  assert.deepStrictEqual(resolveLanguages({ language: 'fr-FR' }), ['fr', 'en', 'de']);
});

test('telefoontaal en valt samen met terugvaltaal (geen dubbele)', () => {
  assert.deepStrictEqual(resolveLanguages({ language: 'EN' }), ['en', 'fr', 'de']);
});

test('ongeldige codes vallen weg', () => {
  assert.deepStrictEqual(
    resolveLanguages({ languages: ['nl', 'x" }', '', 42, 'de'] }),
    ['nl', 'de']
  );
});

test('lege of ongeldige lijst → standaard', () => {
  assert.deepStrictEqual(resolveLanguages({ languages: ['!!'] }), ['nl', 'en', 'fr', 'de']);
});

// --- buildBoxQuery ----------------------------------------------------------

test('query: geen verplicht artikel, wel OPTIONAL per taal', () => {
  const q = buildBoxQuery(bbox, { language: 'nl', instanceOf: ['Q16970'] });
  assert.ok(!/\?article/.test(q), 'oude ?article mag niet meer voorkomen');
  assert.strictEqual((q.match(/OPTIONAL \{ \?art\d/g) || []).length, 4);
  assert.ok(q.includes('<https://nl.wikipedia.org/>'));
  assert.ok(q.includes('<https://de.wikipedia.org/>'));
  assert.ok(!q.includes('FILTER(BOUND'), 'zonder requireArticle geen filter');
  assert.ok(q.includes('wikibase:language "nl,mul,en,fr,de"'));
  assert.ok(q.includes('ORDER BY DESC(?sitelinks)'));
  assert.ok(q.includes('VALUES ?type { wd:Q16970 }'));
});

test('query: requireArticle voegt FILTER toe', () => {
  const q = buildBoxQuery(bbox, { language: 'fr', requireArticle: true });
  assert.ok(q.includes('FILTER(BOUND(?art0) || BOUND(?art1) || BOUND(?art2))'));
});

test('query: hasProperty-modus blijft werken', () => {
  const q = buildBoxQuery(bbox, { hasProperty: 'P359' });
  assert.ok(q.includes('?item wdt:P359 ?propertyValue'));
  assert.ok(q.includes('?propertyValue WHERE'));
});

// --- parseSparqlResults -----------------------------------------------------

const languages = ['nl', 'en', 'fr', 'de'];
const pt = (lng, lat) => ({ value: 'Point(' + lng + ' ' + lat + ')' });
const ent = (q) => ({ value: 'http://www.wikidata.org/entity/' + q });

const fake = {
  results: {
    bindings: [
      {
        // alleen fr-artikel → fr gekozen
        item: ent('Q1'),
        itemLabel: { value: 'Église Saint-Martin' },
        location: pt(4.0, 47.2),
        sitelinks: { value: '3' },
        art2: { value: 'https://fr.wikipedia.org/wiki/%C3%89glise_Saint-Martin' },
        type: ent('Q16970'),
      },
      {
        // en én fr → en gekozen (eerder in voorkeursvolgorde)
        item: ent('Q2'),
        itemLabel: { value: 'Château de Chastellux' },
        location: pt(3.9, 47.3),
        sitelinks: { value: '5' },
        art1: { value: 'https://en.wikipedia.org/wiki/Ch%C3%A2teau_de_Chastellux' },
        art2: { value: 'https://fr.wikipedia.org/wiki/Ch%C3%A2teau_de_Chastellux' },
        type: ent('Q23413'),
      },
      {
        // geen enkel artikel → meenemen zonder wikipediaUrl
        item: ent('Q3'),
        itemLabel: { value: 'Croix de chemin' },
        itemDescription: { value: 'croix de chemin en Bourgogne' },
        location: pt(4.1, 47.15),
        sitelinks: { value: '0' },
        type: ent('Q16970'),
      },
      {
        // zelfde item nogmaals via ander type → dedupeById voegt samen
        item: ent('Q2'),
        itemLabel: { value: 'Château de Chastellux' },
        location: pt(3.9, 47.3),
        sitelinks: { value: '5' },
        art1: { value: 'https://en.wikipedia.org/wiki/Ch%C3%A2teau_de_Chastellux' },
        type: ent('Q57831'),
      },
    ],
  },
};

test('parse: beste artikel per item in voorkeursvolgorde', () => {
  const r = parseSparqlResults(fake, languages);
  assert.strictEqual(r.length, 4);
  assert.strictEqual(r[0].articleLanguage, 'fr');
  assert.ok(r[0].wikipediaUrl.startsWith('https://fr.wikipedia.org/'));
  assert.strictEqual(r[0].sitelinks, 3);
  assert.strictEqual(r[1].articleLanguage, 'en');
  assert.ok(r[1].wikipediaUrl.startsWith('https://en.wikipedia.org/'));
});

test('parse: articles bevat alle gevonden talen', () => {
  const r = parseSparqlResults(fake, languages);
  assert.deepStrictEqual(Object.keys(r[1].articles), ['en', 'fr']);
  assert.ok(r[1].articles.fr.startsWith('https://fr.wikipedia.org/'));
  assert.deepStrictEqual(r[2].articles, {});
});

test('parse: item zonder artikel blijft, met naam en omschrijving', () => {
  const r = parseSparqlResults(fake, languages);
  assert.strictEqual(r[2].wikipediaUrl, null);
  assert.strictEqual(r[2].articleLanguage, null);
  assert.strictEqual(r[2].label, 'Croix de chemin');
  assert.strictEqual(r[2].description, 'croix de chemin en Bourgogne');
  assert.strictEqual(r[2].sitelinks, 0);
});

test('parse + dedupeById: matchedTypes samengevoegd', () => {
  const r = dedupeById(parseSparqlResults(fake, languages));
  assert.strictEqual(r.length, 3);
  const q2 = r.find((x) => x.id === 'Q2');
  assert.deepStrictEqual(q2.matchedTypes, ['Q23413', 'Q57831']);
});

test('parse: oud formaat met ?article (taal uit URL)', () => {
  const r = parseSparqlResults({
    results: {
      bindings: [
        {
          item: ent('Q9'),
          itemLabel: { value: 'Walburgiskerk' },
          location: pt(6.19, 52.14),
          article: { value: 'https://nl.wikipedia.org/wiki/Walburgiskerk_(Zutphen)' },
        },
      ],
    },
  });
  assert.strictEqual(r[0].articleLanguage, 'nl');
  assert.ok(r[0].wikipediaUrl.includes('Walburgiskerk'));
});

console.log('\nAlle ' + passed + ' tests geslaagd.');
