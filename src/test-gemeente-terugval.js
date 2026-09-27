/**
 * test-gemeente-terugval.js
 *
 * Netwerkloze test voor gemeente-terugval.js: querytekst, P131-keten
 * parseren, kopjes en zinnen kiezen, en de volgorde (klein → groot, taal
 * na taal) met een nagebootste fetch.
 *
 * Uitvoeren vanuit src/:  node test-gemeente-terugval.js
 */

'use strict';

const assert = require('assert');
const G = require('./gemeente-terugval.js');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log('OK  ' + name);
}

const ent = (q) => ({ value: 'http://www.wikidata.org/entity/' + q });

// Voorbeeldtekst zoals de actie-API hem levert (explaintext, kopjes als wiki).
const FR_VASSY = [
  'Vassy est une commune française située dans le département de la Nièvre.',
  '',
  '== Géographie ==',
  "Le village est traversé par l'Yonne. L'église domine la vallée.",
  '',
  '== Culture locale et patrimoine ==',
  '',
  '=== Lieux et monuments ===',
  "L'église Saint-Pierre date du XIIe s. et a été remaniée au XVIe siècle. Elle abrite un retable classé.",
  'Le lavoir communal a été restauré en 1998.',
  'Monument aux morts, érigé en 1921 sur la place du village.',
  '',
  '=== Personnalités liées à la commune ===',
  'Jean Dupont, peintre.',
].join('\n');

// Veldtest Morvan (sept. 2026): lege monumentensectie ({{…}} valt weg in
// de platte tekst) en een persoon onder hetzelfde hoofdkopje.
const FR_SMDP = [
  'Saint-Martin-du-Puy est une commune française.',
  '== Culture locale et patrimoine ==',
  '=== Lieux et monuments ===',
  '',
  '=== Personnalités liées à la commune ===',
  "Gabriel Magdelénat (1587-1661), né à Saint-Martin-du-Puy et mort à Auxerre, poète latinisant dont l'œuvre fut éditée.",
  '==== Détails ====',
  "L'église Saint-Martin de Saint-Martin-du-Puy est mentionnée dans son œuvre poétique.",
].join('\n');

const DE_LIJST = [
  'Empury ist eine Gemeinde.',
  '== Sehenswürdigkeiten ==',
  'Kirche Saint-Laurent',
  'Kriegerdenkmal',
].join('\n');

const NL_VASSY = [
  'Vassy is een gemeente in het Franse departement Nièvre.',
  '',
  '== Geografie ==',
  'De oppervlakte van Vassy bedraagt 12 km².',
].join('\n');

const DE_DORF = [
  'Dorf ist eine Gemeinde.',
  '== Sehenswürdigkeiten ==',
  '=== Dorfkirche St. Martin ===',
  'Die Kirche wurde 1450 erbaut. Der Turm ist älter. Die Orgel stammt von 1780. Der Altar ist barock.',
  '=== Kriegerdenkmal ===',
  'Das Denkmal erinnert an die Gefallenen beider Weltkriege.',
].join('\n');

async function main() {
  // --- query -------------------------------------------------------------------

  await test('query: VALUES met geldige QID\'s, keten t/m 3, filter hoger niveau en gemeente-eis', () => {
    const q = G.buildKetenQuery(['Q1', 'Q2', 'Q1', 'fout'], ['nl-NL', 'fr']);
    assert.ok(q.includes('VALUES ?item { wd:Q1 wd:Q2 }'));
    assert.ok(q.includes('wdt:P131/wdt:P131/wdt:P131 ?plaats'));
    assert.ok(!q.includes('wdt:P131/wdt:P131/wdt:P131/wdt:P131'));
    assert.ok(q.includes('FILTER NOT EXISTS'));
    assert.ok(q.includes('wd:Q6465'));
    // niveau 1 zonder gemeente-eis, niveau 2 en 3 met
    assert.ok(q.includes('BIND(1 AS ?niveau) }'));
    assert.ok(q.includes('BIND(2 AS ?niveau) FILTER EXISTS'));
    assert.ok(q.includes('BIND(3 AS ?niveau) FILTER EXISTS'));
    assert.ok(q.includes('wd:Q484170'));
    assert.ok(q.includes('<https://nl.wikipedia.org/>'));
    assert.ok(q.includes('<https://fr.wikipedia.org/>'));
    assert.ok(q.includes('"nl,fr,mul"'));
  });

  // --- keten parseren ----------------------------------------------------------

  await test('keten: per POI gesorteerd klein → groot, artikelen per taal', () => {
    const langs = ['nl', 'fr'];
    const r = G.parseKetenResults(
      {
        results: {
          bindings: [
            { item: ent('Q10'), niveau: { value: '2' }, plaats: ent('Q200'), plaatsLabel: { value: 'Fusiegemeente' } },
            {
              item: ent('Q10'),
              niveau: { value: '1' },
              plaats: ent('Q100'),
              plaatsLabel: { value: 'Oud dorp' },
              art1: { value: 'https://fr.wikipedia.org/wiki/Oud_dorp' },
            },
            {
              item: ent('Q10'),
              niveau: { value: '1' },
              plaats: ent('Q100'),
              plaatsLabel: { value: 'Oud dorp' },
              art0: { value: 'https://nl.wikipedia.org/wiki/Oud_dorp' },
            },
          ],
        },
      },
      langs
    );
    assert.deepStrictEqual(r.Q10.map((s) => s.id), ['Q100', 'Q200']);
    assert.strictEqual(r.Q10[0].articles.nl, 'https://nl.wikipedia.org/wiki/Oud_dorp');
    assert.strictEqual(r.Q10[0].articles.fr, 'https://fr.wikipedia.org/wiki/Oud_dorp');
    assert.deepStrictEqual(r.Q10[1].articles, {});
  });

  // --- tekst -------------------------------------------------------------------

  await test('secties: kopjes en niveaus', () => {
    const s = G.splitSecties(FR_VASSY);
    assert.strictEqual(s[0].kop, '');
    assert.ok(s.some((x) => x.kop === 'Lieux et monuments' && x.niveau === 3));
  });

  await test('monumentensectie met subsecties (patrimoine → lieux et monuments)', () => {
    const b = G.vindMonumentenSecties(G.splitSecties(FR_VASSY));
    assert.strictEqual(b.length, 1);
    assert.strictEqual(b[0].kop, 'Culture locale et patrimoine');
    assert.ok(b[0].subsecties.some((x) => x.kop === 'Lieux et monuments'));
    // "Géographie" hoort er niet bij
    assert.ok(!b[0].subsecties.some((x) => x.kop === 'Géographie'));
  });

  await test('subsectie "Personnalités" (met eigen subsecties) valt weg', () => {
    const b = G.vindMonumentenSecties(G.splitSecties(FR_SMDP));
    assert.deepStrictEqual(
      b[0].subsecties.map((x) => x.kop),
      ['Culture locale et patrimoine', 'Lieux et monuments']
    );
  });

  await test('plaatsnamen uit tekst halen (langste eerst)', () => {
    const t = G.zonderPlaatsnamen('né à Saint-Martin-du-Puy, église Saint-Martin', ['Saint-Martin-du-Puy']);
    assert.ok(!t.includes('saint-martin-du-puy'));
    assert.ok(G.bevatWoord(t, 'saint-martin'));
    assert.ok(!G.bevatWoord(G.zonderPlaatsnamen('né à Saint-Martin-du-Puy', ['Saint-Martin-du-Puy']), 'saint-martin'));
  });

  await test('woorden tellen', () => {
    assert.strictEqual(G.aantalWoorden('Kirche Saint-Laurent'), 2);
    assert.strictEqual(G.aantalWoorden('Monument aux morts, érigé en 1921 – restauré.'), 7);
  });

  await test('zinnen: afkorting "s." en regels zonder slotpunt', () => {
    const z = G.splitZinnen(
      "L'église Saint-Pierre date du XIIe s. et a été remaniée. Elle abrite un retable.\nMonument aux morts, érigé en 1921"
    );
    assert.deepStrictEqual(z, [
      "L'église Saint-Pierre date du XIIe s. et a été remaniée.",
      'Elle abrite un retable.',
      'Monument aux morts, érigé en 1921',
    ]);
  });

  await test('soort uit naam/omschrijving, anders uit categorie', () => {
    assert.deepStrictEqual(G.bepaalSoorten({ label: 'église Saint-Pierre de Vassy' }), ['kerk']);
    assert.deepStrictEqual(
      G.bepaalSoorten({ label: 'Q123', description: 'War memorial of Nièvre department, France' }),
      ['oorlogsmonument']
    );
    assert.deepStrictEqual(G.bepaalSoorten({ label: 'Q9', categoryKey: 'molens' }), ['molen']);
  });

  await test('naamwoorden: zonder stopwoorden, soortwoorden en plaatsnaam', () => {
    assert.deepStrictEqual(G.naamWoorden({ label: 'église Saint-Pierre de Vassy' }, ['Vassy']), ['saint-pierre']);
    assert.deepStrictEqual(G.naamWoorden({ label: 'War memorial of Vassy' }, ['Vassy']), []);
  });

  // --- kiezen ------------------------------------------------------------------

  await test('kerk: zinnen met de naam (Saint-Pierre), niet de lavoir-zin', () => {
    const r = G.zoekInArtikel(FR_VASSY, { label: 'église Saint-Pierre de Vassy' }, ['Vassy']);
    assert.strictEqual(r.grond, 'naam');
    assert.ok(r.tekst.startsWith("L'église Saint-Pierre"));
    assert.ok(!r.tekst.includes('lavoir'));
  });

  await test('oorlogsmonument zonder naamwoord: zin met soortwoord', () => {
    const r = G.zoekInArtikel(FR_VASSY, { label: 'War memorial of Vassy', description: 'War memorial' }, ['Vassy']);
    assert.strictEqual(r.grond, 'soort');
    assert.strictEqual(r.tekst, 'Monument aux morts, érigé en 1921 sur la place du village.');
  });

  await test('kerk-zin in "Géographie" telt niet mee', () => {
    const r = G.zoekInArtikel(FR_VASSY, { label: 'église de Vassy' }, ['Vassy']);
    assert.ok(!r.tekst.includes('domine la vallée'));
  });

  await test('subkop met de naam: eerste zinnen van die subsectie (max 3)', () => {
    const r = G.zoekInArtikel(DE_DORF, { label: 'Dorfkirche St. Martin (Dorf)' }, ['Dorf']);
    assert.strictEqual(r.grond, 'subkop');
    assert.strictEqual(r.kop, 'Dorfkirche St. Martin');
    assert.strictEqual(r.tekst, 'Die Kirche wurde 1450 erbaut. Der Turm ist älter. Die Orgel stammt von 1780.');
  });

  await test('Morvan: persoon in "né à Saint-Martin-du-Puy" is geen treffer voor de kerk', () => {
    const poi = { label: 'église Saint-Martin de Saint-Martin-du-Puy' };
    assert.strictEqual(G.zoekInArtikel(FR_SMDP, poi, ['Saint-Martin-du-Puy']), null);
  });

  await test('Morvan: alleen namen in een opsomming (te kort) → null', () => {
    assert.strictEqual(G.zoekInArtikel(DE_LIJST, { label: 'église Saint-Laurent d\'Empury' }, ['Empury']), null);
    assert.strictEqual(G.zoekInArtikel(DE_LIJST, { label: 'War memorial of Empury', description: 'War memorial' }, ['Empury']), null);
  });

  await test('niets over de POI: null (geen willekeurige zinnen)', () => {
    assert.strictEqual(G.zoekInArtikel(FR_VASSY, { label: 'moulin de la Forge' }, ['Vassy']), null);
    assert.strictEqual(G.zoekInArtikel(NL_VASSY, { label: 'église Saint-Pierre' }, ['Vassy']), null);
  });

  // --- volgorde met nagebootste fetch -----------------------------------------

  await test('volgorde: nl-artikel zonder kopje → fr-artikel; artikel één keer opgehaald', async () => {
    const opgehaald = [];
    const teksten = {
      nl: { title: 'Vassy', extract: NL_VASSY },
      fr: { title: 'Vassy (Nièvre)', extract: FR_VASSY },
    };
    const fetchImpl = async (url) => {
      if (url.startsWith('https://query.wikidata.org/')) {
        const bindings = ['Q1', 'Q2'].map((q) => ({
          item: ent(q),
          niveau: { value: '1' },
          plaats: ent('Q500'),
          plaatsLabel: { value: 'Vassy' },
          art0: { value: 'https://nl.wikipedia.org/wiki/Vassy' },
          art2: { value: 'https://fr.wikipedia.org/wiki/Vassy_(Ni%C3%A8vre)' },
        }));
        return { ok: true, json: async () => ({ results: { bindings } }) };
      }
      const lang = /^https:\/\/([a-z]+)\./.exec(url)[1];
      opgehaald.push(lang);
      return { ok: true, json: async () => ({ query: { pages: [teksten[lang]] } }) };
    };
    const r = await G.haalGemeenteTeksten(
      [
        { id: 'Q1', label: 'église Saint-Pierre de Vassy' },
        { id: 'Q2', label: 'War memorial of Vassy', description: 'War memorial' },
      ],
      { languages: ['nl', 'en', 'fr', 'de'], fetchImpl, retryDelayMs: 0 }
    );
    assert.strictEqual(r.Q1.summary.lang, 'fr');
    assert.strictEqual(r.Q1.summary.viaGemeente.naam, 'Vassy');
    assert.strictEqual(r.Q1.summary.viaGemeente.kop, 'Culture locale et patrimoine');
    assert.ok(r.Q1.summary.attribution.includes('Wikipedia (fr)'));
    assert.ok(r.Q2.summary.extractShort.startsWith('Monument aux morts'));
    assert.ok(r.Q1.diagnose.geprobeerd[0].includes('[nl]: geen kopje'));
    // Twee POI's, maar elk artikel maar één keer opgehaald.
    assert.deepStrictEqual(opgehaald.sort(), ['fr', 'nl']);
  });

  await test('POI zonder keten: summary null', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ results: { bindings: [] } }) });
    const r = await G.haalGemeenteTeksten([{ id: 'Q7', label: 'église' }], { fetchImpl });
    assert.strictEqual(r.Q7.summary, null);
  });

  console.log('\nAlle ' + passed + ' tests geslaagd.');
}

main().catch((err) => {
  console.error('MISLUKT:', err);
  process.exit(1);
});
