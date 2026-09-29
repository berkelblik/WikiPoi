/**
 * test-wikidata-zin.js
 *
 * Netwerkloze test voor wikidata-zin.js: querytekst, SPARQL-rijen
 * parseren, zinsdelen (heilige, herdenking, tijd, stijl, status) en hele
 * zinnen, de foto (P18) en de hoofdfunctie met een nagebootste fetch.
 *
 * Uitvoeren vanuit src/:  node test-wikidata-zin.js
 */

'use strict';

const assert = require('assert');
const Z = require('./wikidata-zin.js');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log('OK  ' + name);
}

const ENT = 'http://www.wikidata.org/entity/';
const uri = (q) => ({ type: 'uri', value: ENT + q });
const lit = (v) => ({ type: 'literal', value: String(v) });
const lab = (v, lang) => (lang ? { type: 'literal', value: v, 'xml:lang': lang } : { type: 'literal', value: v });

/** Rij met een item-waarde. */
function rij(item, eig, waarde, label, lang, mens) {
  const b = { item: uri(item), eig: lit(eig), waarde: uri(waarde), waardeLabel: lab(label, lang) };
  if (mens) b.mens = lit(1);
  return b;
}
/** Rij met een tijdwaarde. */
function tijdRij(item, eig, tijd, precisie, circa) {
  const b = { item: uri(item), eig: lit(eig), tijd: lit(tijd), precisie: lit(precisie) };
  if (circa) b.circa = uri('Q5727902');
  return b;
}
/** Rij met een foto (P18), zoals de query hem levert. */
function fotoRij(item, bestandsUrl) {
  return {
    item: uri(item),
    eig: lit('P18'),
    foto: { type: 'uri', value: 'http://commons.wikimedia.org/wiki/Special:FilePath/' + bestandsUrl },
  };
}
const json = (bindings) => ({ results: { bindings } });

// Morvan-achtige kerk: nl-label heilige, eeuw, romaans, monument historique.
const KERK = [
  rij('Q1', 'P31', 'Q16970', 'kerkgebouw', 'nl'),
  rij('Q1', 'P417', 'Q380', 'Germanus van Auxerre', 'nl', true),
  tijdRij('Q1', 'P571', '1150-01-01T00:00:00Z', 7),
  rij('Q1', 'P149', 'Q46261', 'romaanse architectuur', 'nl'),
  rij('Q1', 'P1435', 'Q10387575', 'inscrit monument historique', 'fr'),
];

// Oorlogsmonument: herdenkt WO II, maker, onthuld 1950.
const MONUMENT = [
  rij('Q2', 'P31', 'Q575759', 'oorlogsmonument', 'nl'),
  rij('Q2', 'P547', 'Q362', 'Tweede Wereldoorlog', 'nl'),
  rij('Q2', 'P170', 'Q99', 'Jan Jansen', 'mul', true),
  tijdRij('Q2', 'P1619', '1950-05-04T00:00:00Z', 11),
];

async function main() {
  await test('query: QID\'s, eigenschappen, labeltalen, geen P131', () => {
    const q = Z.buildZinQuery(['Q1', 'Q2', 'Q1', 'onzin']);
    assert.ok(q.includes('VALUES ?item { wd:Q1 wd:Q2 }'));
    assert.ok(q.includes('("P417" wdt:P417)'));
    assert.ok(q.includes('("P571" p:P571 psv:P571)'));
    assert.ok(q.includes('"nl,mul,en,fr,de"'));
    assert.ok(!q.includes('P131'));
  });

  await test('query: foto (P18) als eigen tak met ?foto', () => {
    const q = Z.buildZinQuery(['Q1']);
    assert.ok(q.startsWith('SELECT ?item ?eig ?waarde ?waardeLabel ?mens ?tijd ?precisie ?circa ?foto WHERE'));
    assert.ok(q.includes('BIND("P18" AS ?eig)'));
    assert.ok(q.includes('?item wdt:P18 ?foto .'));
  });

  await test('foto: bestandsnaam uit FilePath-URL', () => {
    const basis = 'http://commons.wikimedia.org/wiki/Special:FilePath/';
    assert.strictEqual(Z.fotoBestandUit(basis + '%C3%89glise%20de%20Dun.jpg'), 'Église de Dun.jpg');
    assert.strictEqual(Z.fotoBestandUit(basis + 'Monument_aux_morts.JPG'), 'Monument aux morts.JPG');
    assert.strictEqual(Z.fotoBestandUit(basis + '%E0%A4%A.jpg'), null);
    assert.strictEqual(Z.fotoBestandUit('http://www.wikidata.org/entity/Q1'), null);
    assert.strictEqual(Z.fotoBestandUit(null), null);
  });

  await test('parseren: foto\'s per POI, dubbel eruit, geen invloed op de zin', () => {
    const p = Z.parseZinResults(
      json([
        ...KERK,
        fotoRij('Q1', 'Eglise%20A.jpg'),
        fotoRij('Q1', 'Eglise_A.jpg'),
        fotoRij('Q1', 'Eglise%20B.jpg'),
        { item: uri('Q3'), eig: lit('P18'), foto: { type: 'uri', value: 'http://example.org/x.jpg' } },
      ])
    );
    assert.deepStrictEqual(p.Q1.P18, ['Eglise A.jpg', 'Eglise B.jpg']);
    assert.ok(!p.Q3 || !p.Q3.P18);
    assert.strictEqual(Z.maakZin(p.Q1).zin, Z.maakZin(Z.parseZinResults(json(KERK)).Q1).zin);
  });

  await test('parseren: dubbele rijen samengevoegd, genid en QID-label genegeerd', () => {
    const p = Z.parseZinResults(
      json([
        rij('Q1', 'P31', 'Q16970', 'kerkgebouw', 'nl'),
        rij('Q1', 'P31', 'Q16970', 'kerkgebouw', 'nl'),
        { item: uri('Q1'), eig: lit('P170'), waarde: { type: 'uri', value: 'http://www.wikidata.org/.well-known/genid/abc' } },
        rij('Q1', 'P84', 'Q777', 'Q777', null, true),
        tijdRij('Q1', 'P571', '1880-01-01T00:00:00Z', 9),
        tijdRij('Q1', 'P571', '1880-01-01T00:00:00Z', 9, true),
      ])
    );
    assert.strictEqual(p.Q1.P31.length, 1);
    assert.strictEqual(p.Q1.P170, undefined);
    assert.strictEqual(p.Q1.P84[0].label, null);
    assert.deepStrictEqual(p.Q1.P571, [{ jaar: 1880, precisie: 9, circa: true }]);
  });

  await test('jaar: v.Chr. en onzin → null', () => {
    assert.strictEqual(Z.jaarUit('1150-01-01T00:00:00Z'), 1150);
    assert.strictEqual(Z.jaarUit('+0850-01-01T00:00:00Z'), 850);
    assert.strictEqual(Z.jaarUit('-0500-01-01T00:00:00Z'), null);
    assert.strictEqual(Z.jaarUit('onzin'), null);
  });

  await test('eeuw: 1101..1200 → 12e', () => {
    assert.strictEqual(Z.eeuwVan(1101), 12);
    assert.strictEqual(Z.eeuwVan(1150), 12);
    assert.strictEqual(Z.eeuwVan(1200), 12);
    assert.strictEqual(Z.eeuwVan(1201), 13);
  });

  await test('tijd: jaar, circa, decennium, eeuw, te grof', () => {
    assert.strictEqual(Z.tijdAanduiding({ jaar: 1950, precisie: 11 }).bij, 'in 1950');
    assert.strictEqual(Z.tijdAanduiding({ jaar: 1880, precisie: 9, circa: true }).bij, 'rond 1880');
    assert.strictEqual(Z.tijdAanduiding({ jaar: 1954, precisie: 8 }).uit, 'uit de jaren 1950');
    assert.strictEqual(Z.tijdAanduiding({ jaar: 1150, precisie: 7 }).bij, 'in de 12e eeuw');
    assert.strictEqual(Z.tijdAanduiding({ jaar: 1500, precisie: 6 }), null);
  });

  await test('soort: tabel met voorrang, anders NL-label, anders null', () => {
    const s = Z.bepaalSoort([
      { id: 'Q4989906', label: 'monument', lang: 'nl' },
      { id: 'Q575759', label: 'war memorial', lang: 'en' },
    ]);
    assert.strictEqual(s.naam, 'oorlogsmonument');
    assert.strictEqual(Z.bepaalSoort([{ id: 'Q123', label: 'wegkruis', lang: 'nl' }]).naam, 'wegkruis');
    assert.strictEqual(Z.bepaalSoort([{ id: 'Q123', label: 'wayside cross', lang: 'en' }]), null);
  });

  await test('toewijding: heilige (mens of voorvoegsel), twee heiligen, begrip alleen in NL', () => {
    assert.strictEqual(
      Z.deelToewijding([{ id: 'Q9', label: 'Saint Laurent', lang: 'fr', mens: false }]),
      'gewijd aan de heilige Laurent'
    );
    assert.strictEqual(
      Z.deelToewijding([
        { id: 'Q33923', label: 'Petrus', lang: 'nl', mens: true },
        { id: 'Q9200', label: 'Paulus', lang: 'nl', mens: true },
      ]),
      'gewijd aan de heiligen Petrus en Paulus'
    );
    assert.strictEqual(Z.deelToewijding([{ id: 'Q1', label: 'Holy Trinity', lang: 'en' }]), null);
    assert.strictEqual(
      Z.deelToewijding([{ id: 'Q1', label: 'Heilige Drie-eenheid', lang: 'nl' }]),
      'gewijd aan de heilige Drie-eenheid'
    );
  });

  await test('herdenkt: lidwoord bij begrip, niet bij persoon', () => {
    assert.strictEqual(
      Z.deelHerdenkt([{ id: 'Q362', label: 'Tweede Wereldoorlog', lang: 'nl' }]),
      'ter herdenking van de Tweede Wereldoorlog'
    );
    assert.strictEqual(
      Z.deelHerdenkt([{ id: 'Q4583', label: 'Anne Frank', lang: 'en', mens: true }]),
      'ter herdenking van Anne Frank'
    );
    assert.strictEqual(Z.deelHerdenkt([{ id: 'Q361', label: 'World War I', lang: 'en' }]), null);
  });

  await test('lidwoord: het verzet, meervoud, onzeker → weggelaten (Achterhoek)', () => {
    assert.strictEqual(
      Z.metLidwoord('Nederlands verzet in de Tweede Wereldoorlog'),
      'het Nederlands verzet in de Tweede Wereldoorlog'
    );
    assert.strictEqual(Z.metLidwoord('burgerslachtoffer'), 'de burgerslachtoffers');
    assert.strictEqual(Z.metLidwoord('Joodse slachtoffer'), 'de Joodse slachtoffers');
    assert.strictEqual(Z.metLidwoord('geallieerden'), 'de geallieerden');
    assert.strictEqual(Z.metLidwoord('de gevallenen'), 'de gevallenen');
    assert.strictEqual(Z.metLidwoord('bezetting'), null);
    assert.strictEqual(
      Z.deelHerdenkt([
        { id: 'Q1', label: 'bezetting', lang: 'nl' },
        { id: 'Q2', label: 'burgerslachtoffer', lang: 'nl' },
      ]),
      'ter herdenking van de burgerslachtoffers'
    );
    assert.strictEqual(Z.deelHerdenkt([{ id: 'Q1', label: 'bezetting', lang: 'nl' }]), null);
  });

  await test('stijl: tabel, NL-labelregel, Engels label → null', () => {
    assert.strictEqual(Z.deelStijl([{ id: 'Q46261', label: 'Romanesque architecture', lang: 'en' }]), 'in romaanse stijl');
    assert.strictEqual(Z.deelStijl([{ id: 'Q5', label: 'maaslandse architectuur', lang: 'nl' }]), 'in maaslandse stijl');
    assert.strictEqual(Z.deelStijl([{ id: 'Q5', label: 'Amsterdamse School', lang: 'nl' }]), 'in de stijl van de Amsterdamse School');
    assert.strictEqual(Z.deelStijl([{ id: 'Q5', label: 'Flamboyant', lang: 'en' }]), null);
  });

  await test('status: bekende waarden → beschermd monument, anders NL-label, anders null', () => {
    assert.strictEqual(Z.deelStatus([{ id: 'Q916333', label: 'rijksmonument', lang: 'nl' }]), 'beschermd monument');
    assert.strictEqual(Z.deelStatus([{ id: 'Q1', label: 'Baudenkmal', lang: 'de' }]), 'beschermd monument');
    assert.strictEqual(Z.deelStatus([{ id: 'Q1', label: 'gemeentelijk monument', lang: 'nl' }]), 'gemeentelijk monument');
    assert.strictEqual(Z.deelStatus([{ id: 'Q1', label: 'zone de protection', lang: 'fr' }]), null);
  });

  await test('zin: Morvan-kerk', () => {
    const r = Z.maakZin(Z.parseZinResults(json(KERK)).Q1);
    assert.strictEqual(
      r.zin,
      'Kerk gewijd aan de heilige Germanus van Auxerre, gebouwd in de 12e eeuw in romaanse stijl, beschermd monument.'
    );
    assert.deepStrictEqual(r.diagnose.gebruikt, ['P417', 'P571+P149', 'P1435']);
  });

  await test('zin: oorlogsmonument met onthulling en maker', () => {
    const r = Z.maakZin(Z.parseZinResults(json(MONUMENT)).Q2);
    assert.strictEqual(
      r.zin,
      'Oorlogsmonument ter herdenking van de Tweede Wereldoorlog, onthuld in 1950, gemaakt door Jan Jansen.'
    );
  });

  await test('zin: soort via NL-label krijgt neutraal "uit"', () => {
    const r = Z.maakZin(
      Z.parseZinResults(
        json([
          rij('Q3', 'P31', 'Q123', 'wegkruis', 'nl'),
          tijdRij('Q3', 'P571', '1880-01-01T00:00:00Z', 9, true),
          rij('Q3', 'P1435', 'Q916333', 'rijksmonument', 'nl'),
        ])
      ).Q3
    );
    assert.strictEqual(r.zin, 'Wegkruis van rond 1880, beschermd monument.');
  });

  await test('zin: monument met P571 → "opgericht"', () => {
    const r = Z.maakZin({
      P31: [{ id: 'Q4989906', label: 'monument', lang: 'nl' }],
      P571: [{ jaar: 1921, precisie: 9, circa: false }],
      P547: [{ id: 'Q361', label: 'Eerste Wereldoorlog', lang: 'nl' }],
    });
    assert.strictEqual(r.zin, 'Monument ter herdenking van de Eerste Wereldoorlog, opgericht in 1921.');
  });

  await test('geen zin: geen NL-soortnaam (diagnose noemt het label)', () => {
    const r = Z.maakZin({
      P31: [{ id: 'Q123', label: 'wayside cross', lang: 'en' }],
      P571: [{ jaar: 1880, precisie: 9 }],
      P1435: [{ id: 'Q916333', label: 'rijksmonument', lang: 'nl' }],
    });
    assert.strictEqual(r.zin, null);
    assert.ok(r.diagnose.reden.includes('wayside cross (en)'));
  });

  await test('geen zin: te weinig onderdelen; materiaal vult alleen aan', () => {
    const alleenStatus = Z.maakZin({
      P31: [{ id: 'Q16970', label: 'kerkgebouw', lang: 'nl' }],
      P1435: [{ id: 'Q916475', label: 'monument historique', lang: 'fr' }],
    });
    assert.strictEqual(alleenStatus.zin, null);
    assert.ok(alleenStatus.diagnose.reden.startsWith('te weinig onderdelen (1 van 2)'));

    const metMateriaal = Z.maakZin({
      P31: [{ id: 'Q16970', label: 'kerkgebouw', lang: 'nl' }],
      P1435: [{ id: 'Q916475', label: 'monument historique', lang: 'fr' }],
      P186: [{ id: 'Q13085', label: 'Zandsteen', lang: 'nl' }],
    });
    assert.strictEqual(metMateriaal.zin, 'Kerk van zandsteen, beschermd monument.');
  });

  await test('Engelse stijl zonder tabel: overgeslagen met diagnose, rest blijft', () => {
    const r = Z.maakZin({
      P31: [{ id: 'Q16970', label: 'kerkgebouw', lang: 'nl' }],
      P571: [{ jaar: 1250, precisie: 7 }],
      P149: [{ id: 'Q5', label: 'Flamboyant', lang: 'en' }],
      P1435: [{ id: 'Q916475', label: 'monument historique', lang: 'fr' }],
    });
    assert.strictEqual(r.zin, 'Kerk gebouwd in de 13e eeuw, beschermd monument.');
    assert.ok(r.diagnose.overgeslagen[0].startsWith('P149'));
  });

  await test('te lange zin: maker valt eerst weg, zin blijft ≤ maxTekens', () => {
    const lang = 'Jean-Baptiste Alexandre Théodore de Montmorency-Laval-Bouchard';
    const r = Z.maakZin(
      {
        P31: [{ id: 'Q16970', label: 'kerkgebouw', lang: 'nl' }],
        P417: [{ id: 'Q1', label: 'Germanus van Auxerre', lang: 'nl', mens: true }],
        P571: [{ jaar: 1150, precisie: 7 }],
        P84: [{ id: 'Q2', label: lang, lang: 'fr', mens: true }],
        P1435: [{ id: 'Q916475', label: 'monument historique', lang: 'fr' }],
      },
      { maxTekens: 100 }
    );
    assert.ok(r.zin.length <= 100);
    assert.ok(!r.zin.includes('Montmorency'));
    assert.ok(r.zin.endsWith('beschermd monument.'));
    assert.ok(r.diagnose.overgeslagen.includes('P84/P170: zin te lang'));
  });

  await test('summary: formaat, lang nl, viaWikidata', () => {
    const s = Z.maakSummary({ id: 'Q2', label: 'Monument' }, 'Zin.');
    assert.strictEqual(s.extractShort, 'Zin.');
    assert.strictEqual(s.lang, 'nl');
    assert.strictEqual(s.viaWikidata, true);
    assert.strictEqual(s.pageUrl, 'https://www.wikidata.org/wiki/Q2');
  });

  await test('hoofdfunctie: blokken, zin en null, OSM-id genegeerd', async () => {
    const aanroepen = [];
    const fetchImpl = async (url) => {
      const q = decodeURIComponent(url.split('query=')[1]);
      aanroepen.push(q);
      const bindings = [];
      if (q.includes('wd:Q1')) bindings.push(...KERK);
      if (q.includes('wd:Q2')) bindings.push(...MONUMENT);
      return { ok: true, json: async () => json(bindings) };
    };
    const r = await Z.haalWikidataZinnen(
      [
        { id: 'Q1', label: 'église Saint-Germain' },
        { id: 'Q2', label: 'War memorial' },
        { id: 'Q7', label: 'Wilhelminaboom' },
        { id: 'node/123', label: 'OSM-kerk' },
      ],
      { fetchImpl, blokGrootte: 2, retryDelayMs: 0 }
    );
    assert.strictEqual(aanroepen.length, 2);
    assert.ok(r.Q1.summary.extractShort.startsWith('Kerk gewijd aan'));
    assert.ok(r.Q2.summary.extractShort.startsWith('Oorlogsmonument'));
    assert.strictEqual(r.Q7.summary, null);
    assert.ok(r.Q7.diagnose.reden.includes('geen P31'));
    assert.strictEqual(r['node/123'], undefined);
    assert.strictEqual(r.Q1.fotoBestand, null);
  });

  await test('hoofdfunctie: fotoBestand, ook zonder zin (eerste foto)', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () =>
        json([
          ...KERK,
          fotoRij('Q1', 'Eglise%20A.jpg'),
          fotoRij('Q7', 'Monument_aux_morts.jpg'),
          fotoRij('Q7', 'Monument_2.jpg'),
        ]),
    });
    const r = await Z.haalWikidataZinnen(
      [
        { id: 'Q1', label: 'église' },
        { id: 'Q7', label: 'monument aux morts' },
      ],
      { fetchImpl, retryDelayMs: 0 }
    );
    assert.ok(r.Q1.summary);
    assert.strictEqual(r.Q1.fotoBestand, 'Eglise A.jpg');
    assert.strictEqual(r.Q7.summary, null);
    assert.strictEqual(r.Q7.fotoBestand, 'Monument aux morts.jpg');
  });

  await test('hoofdfunctie: HTTP 400 → fout, geen tweede poging', async () => {
    let n = 0;
    const fetchImpl = async () => {
      n += 1;
      return { ok: false, status: 400 };
    };
    await assert.rejects(() => Z.haalWikidataZinnen([{ id: 'Q1' }], { fetchImpl, retryDelayMs: 0 }), /HTTP 400/);
    assert.strictEqual(n, 1);
  });

  console.log('\nAlle ' + passed + ' tests geslaagd.');
}

main().catch((err) => {
  console.error('MISLUKT:', err);
  process.exit(1);
});
