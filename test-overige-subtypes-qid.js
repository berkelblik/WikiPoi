#!/usr/bin/env node
/**
 * test-overige-subtypes-qid.js
 *
 * WEGWERPSCRIPT — na gebruik weer verwijderen uit de repo (zoals ook
 * gedaan bij test-rijksmonument-property.js en test-sluis-gemaal-qid.js).
 *
 * Doel: Wikidata-QID('s) vinden/verifiëren voor vier resterende subtypes
 * van de nieuwe verzamelcategorieën:
 *   - "Kunst & gedenktekens"          → gedenktekens (niet-oorlogsgerelateerd)
 *   - "Waterstaat & infrastructuur"   → historische bruggen
 *   - "Prehistorie & archeologie"     → hunebedden
 *   - "Prehistorie & archeologie"     → vestingwerken/stadswallen
 *
 * Standbeelden en grafheuvels zijn bewust NIET in dit script opgenomen —
 * daarvoor wordt een aanname (Q179700 resp. Q127418) rechtstreeks in
 * poi-categories.js gezet, met een code-comment dat de QID niet live
 * geverifieerd is (bewuste, expliciet zichtbare risico-afweging).
 *
 * AANPAK — zelfde methode als test-sluis-gemaal-qid.js: EMPIRISCH
 * ontdekken door te zoeken op Nederlands label binnen een bounding box,
 * en per gevonden item de instanceOf-klasse(s) (P31) tonen. Voor
 * hunebedden wordt daarnaast expliciet gecontroleerd of de klasse al
 * onder de BESTAANDE "archeologie"-categorie (Q839954, archaeological
 * site) valt via de subclass-hiërarchie (P279*) — zodat duidelijk wordt
 * of daar al helemaal niets nieuws voor nodig is.
 *
 * Gebruik: node test-overige-subtypes-qid.js
 * (geen argumenten nodig, draait rechtstreeks tegen query.wikidata.org)
 */

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi/0.1-testscript (https://github.com/berkelblik/WikiPoi)';

// Bestaande QID voor de "archeologie"-categorie, om tegen te toetsen
// (zie ASK-query bij hunebedden hieronder).
const ARCHAEOLOGICAL_SITE_QID = 'Q839954';

const SEARCHES = [
  {
    title: 'GEDENKTEKENS (niet-oorlogsgerelateerd)',
    searchWord: 'gedenkteken',
    // Overijssel/Twente — zelfde box als het vorige testscript
    bbox: { minLat: 52.15, maxLat: 52.55, minLng: 6.3, maxLng: 6.95 },
  },
  {
    title: 'HISTORISCHE BRUGGEN',
    searchWord: 'brug',
    bbox: { minLat: 52.15, maxLat: 52.55, minLng: 6.3, maxLng: 6.95 },
  },
  {
    title: 'HUNEBEDDEN',
    searchWord: 'hunebed',
    // Drenthe (Emmen/Borger e.o.) — kerngebied van Nederlandse hunebedden
    bbox: { minLat: 52.7, maxLat: 53.1, minLng: 6.5, maxLng: 7.0 },
  },
  {
    title: 'VESTINGWERKEN/STADSWALLEN',
    // Twee zoekwoorden na elkaar, want "vesting" en "stadswal" zijn beide
    // gangbare Nederlandse termen die niet noodzakelijk in elkaars label
    // voorkomen (bijv. "Vestingstad Groenlo" vs. "Stadswal Groenlo").
    searchWords: ['vesting', 'stadswal'],
    // Achterhoek inclusief Groenlo (bekende vestingstad), en Zutphen/Lochem
    bbox: { minLat: 51.85, maxLat: 52.25, minLng: 6.3, maxLng: 6.9 },
  },
];

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

/**
 * ASK-query: bestaat er voor dit item een pad van P31/P279* naar de
 * gegeven doel-QID? Gebruikt om te checken of een hunebed-item al onder
 * de bestaande "archeologie"-categorie (Q839954) valt, zonder dat we
 * daarvoor een aparte QID hoeven te introduceren.
 */
function buildIsSubclassAskQuery(itemQid, targetQid) {
  return (
    'ASK {\n' +
    '  wd:' +
    itemQid +
    ' wdt:P31/wdt:P279* wd:' +
    targetQid +
    ' .\n' +
    '}'
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

async function runAskQuery(query) {
  const url = WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error('Wikidata-query mislukt: HTTP ' + response.status + ' ' + response.statusText);
  }
  const data = await response.json();
  return data.boolean;
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

function printSection(title, searchWord, items, typeCountsSorted) {
  console.log('\n=== ' + title + ' (zoekwoord: "' + searchWord + '") ===');
  console.log('Aantal gevonden items: ' + items.length);

  console.log('\n--- Meest voorkomende instanceOf-klassen (P31) ---');
  if (typeCountsSorted.length === 0) {
    console.log('  (geen instanceOf-waarden gevonden)');
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

  return items;
}

async function main() {
  const allSectionItems = {};

  for (const search of SEARCHES) {
    if (search.searchWords) {
      // Vestingwerken/stadswallen: meerdere zoekwoorden na elkaar, resultaten samenvoegen
      console.log('\nBezig met zoeken naar ' + search.searchWords.map((w) => '"' + w + '"').join(' en ') + '...');
      let combinedBindings = [];
      for (const word of search.searchWords) {
        const bindings = await runSelectQuery(buildLabelSearchQuery(search.bbox, word));
        combinedBindings = combinedBindings.concat(bindings);
      }
      const analysis = analyzeResults(combinedBindings);
      allSectionItems[search.title] = printSection(
        search.title,
        search.searchWords.join(' / '),
        analysis.items,
        analysis.typeCountsSorted
      );
    } else {
      console.log('\nBezig met zoeken naar "' + search.searchWord + '"...');
      const bindings = await runSelectQuery(buildLabelSearchQuery(search.bbox, search.searchWord));
      const analysis = analyzeResults(bindings);
      allSectionItems[search.title] = printSection(
        search.title,
        search.searchWord,
        analysis.items,
        analysis.typeCountsSorted
      );
    }
  }

  // Extra check voor hunebedden: valt een gevonden hunebed-item al onder
  // de bestaande "archeologie"-categorie (Q839954) via de subclass-keten?
  const hunebedItems = allSectionItems['HUNEBEDDEN'] || [];
  if (hunebedItems.length > 0) {
    console.log('\n\n=== EXTRA CHECK: vallen hunebedden al onder de bestaande archeologie-categorie (Q839954)? ===');
    const testItem = hunebedItems[0];
    console.log('Test met item: ' + testItem.qid + ' ("' + testItem.label + '")');
    const isSubclass = await runAskQuery(buildIsSubclassAskQuery(testItem.qid, ARCHAEOLOGICAL_SITE_QID));
    console.log(
      isSubclass
        ? '→ JA: dit hunebed valt al onder Q839954 (archaeological site) via P31/P279*. ' +
            'De bestaande "archeologie"-categorie pakt hunebedden dus vermoedelijk al vanzelf mee — geen nieuwe QID nodig.'
        : '→ NEE: dit hunebed valt NIET onder Q839954 via P31/P279*. ' +
            'Er is dus wél een aparte QID/aanpak nodig voor hunebedden.'
    );
  } else {
    console.log('\n\n(Geen hunebed-items gevonden binnen de Drenthe-bbox — extra check overgeslagen.)');
  }

  console.log('\n\nKlaar. Kopieer de volledige terminaluitvoer hierboven en stuur die terug.');
}

main().catch((err) => {
  console.error('FOUT:', err);
  process.exit(1);
});
