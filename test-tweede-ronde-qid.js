#!/usr/bin/env node
/**
 * test-tweede-ronde-qid.js
 *
 * WEGWERPSCRIPT — na gebruik weer verwijderen uit de repo.
 *
 * Vervolg op test-overige-subtypes-qid.js: twee subtypes leverden daar
 * geen bruikbare Wikidata-klasse op ("gedenkteken" vond toevallig alleen
 * oorlogsmonumenten; "vesting"/"stadswal" vond te weinig/de verkeerde
 * klassen). Deze tweede ronde probeert het met andere zoekwoorden en/of
 * andere zoekgebieden:
 *
 *   - GEDENKTEKENS: breder zoekwoord "monument" i.p.v. "gedenkteken",
 *     zelfde Overijssel/Twente-gebied.
 *   - VESTINGWERKEN/STADSWALLEN: zoekwoorden "stadsmuur" en "schans",
 *     nu gezocht in drie gebieden tegelijk — de Achterhoek (Bredevoort/
 *     Groenlo, zoals vorige keer) plus twee bekende vestingsteden:
 *     Naarden (sterschans, Noord-Holland) en Bourtange (sterschans,
 *     Groningen). Resultaten uit alle drie de gebieden worden
 *     samengevoegd vóór de instanceOf-analyse.
 *
 * Gebruik: node test-tweede-ronde-qid.js
 */

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi/0.1-testscript (https://github.com/berkelblik/WikiPoi)';

const GEDENKTEKEN_SEARCH = {
  title: 'GEDENKTEKENS (breder zoekwoord)',
  searchWord: 'monument',
  bbox: { minLat: 52.15, maxLat: 52.55, minLng: 6.3, maxLng: 6.95 }, // Overijssel/Twente
};

const VESTING_SEARCH = {
  title: 'VESTINGWERKEN/STADSWALLEN (bredere zoekwoorden + extra gebieden)',
  searchWords: ['stadsmuur', 'schans'],
  regions: [
    { name: 'Achterhoek (Bredevoort/Groenlo)', bbox: { minLat: 51.85, maxLat: 52.25, minLng: 6.3, maxLng: 6.9 } },
    { name: 'Naarden', bbox: { minLat: 52.28, maxLat: 52.31, minLng: 5.14, maxLng: 5.18 } },
    { name: 'Bourtange', bbox: { minLat: 52.99, maxLat: 53.03, minLng: 7.16, maxLng: 7.22 } },
  ],
};

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
    'LIMIT 150'
  );
}

async function runSelectQuery(query) {
  const url = WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
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

function analyzeResults(bindings) {
  const itemsById = new Map();
  const typeCounts = new Map();

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

function printSection(title, searchLabel, items, typeCountsSorted) {
  console.log('\n=== ' + title + ' (' + searchLabel + ') ===');
  console.log('Aantal gevonden items: ' + items.length);

  console.log('\n--- Meest voorkomende instanceOf-klassen (P31) ---');
  if (typeCountsSorted.length === 0) {
    console.log('  (geen instanceOf-waarden gevonden)');
  }
  for (const t of typeCountsSorted.slice(0, 12)) {
    console.log('  ' + t.count + '×  ' + t.qid + '  —  ' + t.label);
  }

  console.log('\n--- Voorbeelditems (eerste 12) ---');
  for (const item of items.slice(0, 12)) {
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
  // --- Gedenktekens: breder zoekwoord ---
  console.log('Bezig met zoeken naar "' + GEDENKTEKEN_SEARCH.searchWord + '"...');
  const gedenkBindings = await runSelectQuery(
    buildLabelSearchQuery(GEDENKTEKEN_SEARCH.bbox, GEDENKTEKEN_SEARCH.searchWord)
  );
  const gedenkAnalysis = analyzeResults(gedenkBindings);
  printSection(GEDENKTEKEN_SEARCH.title, 'zoekwoord: "' + GEDENKTEKEN_SEARCH.searchWord + '"', gedenkAnalysis.items, gedenkAnalysis.typeCountsSorted);

  // --- Vestingwerken: meerdere zoekwoorden × meerdere gebieden ---
  console.log(
    '\n\nBezig met zoeken naar ' +
      VESTING_SEARCH.searchWords.map((w) => '"' + w + '"').join(' en ') +
      ' in ' +
      VESTING_SEARCH.regions.length +
      ' gebieden...'
  );
  let vestingBindings = [];
  for (const region of VESTING_SEARCH.regions) {
    for (const word of VESTING_SEARCH.searchWords) {
      console.log('  ...' + word + ' in ' + region.name);
      const bindings = await runSelectQuery(buildLabelSearchQuery(region.bbox, word));
      vestingBindings = vestingBindings.concat(bindings);
    }
  }
  const vestingAnalysis = analyzeResults(vestingBindings);
  printSection(
    VESTING_SEARCH.title,
    'zoekwoorden: ' + VESTING_SEARCH.searchWords.join(' / ') + '; gebieden: ' + VESTING_SEARCH.regions.map((r) => r.name).join(', '),
    vestingAnalysis.items,
    vestingAnalysis.typeCountsSorted
  );

  console.log('\n\nKlaar. Kopieer de volledige terminaluitvoer hierboven en stuur die terug.');
}

main().catch((err) => {
  console.error('FOUT:', err);
  process.exit(1);
});
