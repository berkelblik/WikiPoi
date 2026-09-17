#!/usr/bin/env node
/**
 * test-sluis-gemaal-qid.js
 *
 * WEGWERPSCRIPT — na gebruik weer verwijderen uit de repo (zoals ook
 * gedaan is met test-rijksmonument-property.js).
 *
 * Doel: de juiste Wikidata-QID('s) vinden voor de categorieën "sluis"
 * (lock) en "gemaal" (pumping station), voor gebruik in poi-categories.js
 * bij de toekomstige "Waterstaat & infrastructuur"-verzamelcategorie.
 *
 * AANPAK — bewust NIET gokken en die gok testen (zoals losse
 * zoekmachine-zoektochten naar de gemaal-QID al onbetrouwbaar bleken),
 * maar EMPIRISCH ontdekken: zoek alle Wikidata-items met een coördinaat
 * binnen een bounding box waarvan het Nederlandse label "sluis" resp.
 * "gemaal" bevat, en tel per item welke instanceOf-klasse(s) (P31) het
 * heeft. De QID die daarbij herhaaldelijk opduikt, is de juiste.
 *
 * Zoekgebied: een ruime bounding box rond Overijssel/Twente (rond het
 * Twentekanaal en de Overijsselse Vecht) — een gebied met relatief veel
 * sluizen én gemalen, dus een hogere trefkans dan strikt rond Zutphen.
 *
 * Gebruik: node test-sluis-gemaal-qid.js
 * (geen argumenten nodig, draait rechtstreeks tegen query.wikidata.org)
 */

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi/0.1-testscript (https://github.com/berkelblik/WikiPoi)';

// Ruwe bounding box rond Overijssel/Twente
const BBOX = { minLat: 52.15, maxLat: 52.55, minLng: 6.3, maxLng: 6.95 };

/**
 * Bouwt een SPARQL-query die zoekt naar items met coördinaat binnen de
 * bbox, waarvan het Nederlandse label het gegeven woord bevat, en geeft
 * per item ook de instanceOf-klasse(s) (P31) mee.
 */
function buildLabelSearchQuery(bbox, searchWord) {
  return (
    'SELECT ?item ?itemLabel ?itemDescription ?type ?typeLabel ?location WHERE {\n' +
    '  SERVICE wikibase:box {\n' +
    '    ?item wdt:P625 ?location .\n' +
    '    bd:serviceParam wikibase:cornerWest "Point(' +
    bbox.minLng +
    ' ' +
    bbox.minLat +
    ')"^^geo:wktLiteral .\n' +
    '    bd:serviceParam wikibase:cornerEast "Point(' +
    bbox.maxLng +
    ' ' +
    bbox.maxLat +
    ')"^^geo:wktLiteral .\n' +
    '  }\n' +
    '  ?item rdfs:label ?label .\n' +
    '  FILTER(LANG(?label) = "nl")\n' +
    '  FILTER(CONTAINS(LCASE(?label), "' +
    searchWord +
    '"))\n' +
    '  OPTIONAL { ?item wdt:P31 ?type . }\n' +
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }\n' +
    '}\n' +
    'LIMIT 100'
  );
}

async function runQuery(query) {
  const url = WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error('Wikidata-query mislukt: HTTP ' + response.status + ' ' + response.statusText);
  }
  const data = await response.json();
  return data.results.bindings;
}

function qidFromUri(uri) {
  if (!uri) return null;
  return uri.substring(uri.lastIndexOf('/') + 1);
}

/**
 * Groepeert de ruwe bindings per item (een item kan meerdere P31-waarden
 * hebben, dus meerdere rijen in de ruwe respons) en telt daarna hoe vaak
 * elke instanceOf-klasse voorkomt over ALLE gevonden items heen — dat is
 * de kernvraag: welke klasse duikt herhaaldelijk op?
 */
function analyzeResults(bindings) {
  const itemsById = new Map();
  const typeCounts = new Map(); // qid -> { label, count }

  for (const b of bindings) {
    const itemQid = qidFromUri(b.item && b.item.value);
    if (!itemQid) continue;

    if (!itemsById.has(itemQid)) {
      itemsById.set(itemQid, {
        qid: itemQid,
        label: b.itemLabel ? b.itemLabel.value : itemQid,
        description: b.itemDescription ? b.itemDescription.value : null,
        types: new Set(),
      });
    }
    const item = itemsById.get(itemQid);

    const typeQid = qidFromUri(b.type && b.type.value);
    if (typeQid) {
      item.types.add(typeQid + (b.typeLabel ? ' (' + b.typeLabel.value + ')' : ''));
      const key = typeQid + '|' + (b.typeLabel ? b.typeLabel.value : '');
      if (!typeCounts.has(key)) {
        typeCounts.set(key, { qid: typeQid, label: b.typeLabel ? b.typeLabel.value : '(geen label)', count: 0 });
      }
      typeCounts.get(key).count++;
    }
  }

  return {
    items: Array.from(itemsById.values()),
    typeCountsSorted: Array.from(typeCounts.values()).sort((a, b) => b.count - a.count),
  };
}

function printSection(title, searchWord, items, typeCountsSorted) {
  console.log('\n=== ' + title + ' (zoekwoord: "' + searchWord + '") ===');
  console.log('Aantal gevonden items met "' + searchWord + '" in het label: ' + items.length);

  console.log('\n--- Meest voorkomende instanceOf-klassen (P31) — de bovenste is vermoedelijk de juiste QID ---');
  if (typeCountsSorted.length === 0) {
    console.log('  (geen instanceOf-waarden gevonden — items hebben mogelijk geen P31)');
  }
  for (const t of typeCountsSorted.slice(0, 10)) {
    console.log('  ' + t.count + '×  ' + t.qid + '  —  ' + t.label);
  }

  console.log('\n--- Voorbeelditems (eerste 10) ---');
  for (const item of items.slice(0, 10)) {
    console.log(
      '  ' +
        item.qid +
        '  "' +
        item.label +
        '"' +
        (item.description ? ' — ' + item.description : '') +
        '\n      types: ' +
        (item.types.size > 0 ? Array.from(item.types).join(', ') : '(geen)')
    );
  }
}

async function main() {
  console.log('Zoekgebied (bbox rond Overijssel/Twente):', JSON.stringify(BBOX));

  console.log('\nBezig met zoeken naar "sluis"...');
  const sluisBindings = await runQuery(buildLabelSearchQuery(BBOX, 'sluis'));
  const sluisAnalysis = analyzeResults(sluisBindings);
  printSection('SLUIZEN', 'sluis', sluisAnalysis.items, sluisAnalysis.typeCountsSorted);

  console.log('\nBezig met zoeken naar "gemaal"...');
  const gemaalBindings = await runQuery(buildLabelSearchQuery(BBOX, 'gemaal'));
  const gemaalAnalysis = analyzeResults(gemaalBindings);
  printSection('GEMALEN', 'gemaal', gemaalAnalysis.items, gemaalAnalysis.typeCountsSorted);

  console.log('\n\nKlaar. Kopieer de volledige terminaluitvoer hierboven en stuur die terug —');
  console.log('daaruit kan de juiste QID per categorie worden afgeleid.');
}

main().catch((err) => {
  console.error('FOUT:', err);
  process.exit(1);
});
