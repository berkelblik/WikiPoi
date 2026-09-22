/**
 * test-osm-dedupe.js
 *
 * Geïsoleerde, netwerkloze test voor
 * osm-fallback.js#filterAndDedupeOsmCandidates() — controleert de vier
 * kernscenario's (dedupe op QID, "leeg punt" overslaan, punt met alleen
 * description behouden, punt met alleen wikipediaUrl behouden) tegen
 * verzonnen invoerdata, dus zonder Overpass of Wikidata aan te roepen.
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-osm-dedupe.js
 *
 * Slaagt (exit code 0) als alle scenario's kloppen; geeft anders per
 * mislukt scenario een duidelijke regel met verwacht vs. werkelijk
 * resultaat, en sluit af met exit code 1.
 */

const { filterAndDedupeOsmCandidates } = require('./osm-fallback.js');

// Nagebootste Test 3-resultaten (wikidata-search.js#searchWikidataBox()):
// alleen het `id`-veld (kale QID) doet ertoe voor deze test.
const wikidataCandidates = [
  { id: 'Q100', label: 'Kerk van Voorbeeld' },
  { id: 'Q200', label: 'Molen van Voorbeeld' },
];

// Nagebootste Test 5-resultaten (osm-fallback.js#elementToCandidate()):
// vier scenario's, met een korte naam zodat de uitvoer leesbaar blijft.
const osmCandidates = [
  {
    id: 'osm-node-1',
    label: 'Dubbel met Q100 (moet verdwijnen)',
    wikidataId: 'Q100',
    wikipediaUrl: null,
    description: null,
  },
  {
    id: 'osm-node-2',
    label: 'Nieuwe QID, niet in Test 3 (moet blijven)',
    wikidataId: 'Q999',
    wikipediaUrl: null,
    description: null,
  },
  {
    id: 'osm-node-3',
    label: 'Leeg punt, geen QID/URL/description (moet verdwijnen)',
    wikidataId: null,
    wikipediaUrl: null,
    description: null,
  },
  {
    id: 'osm-node-4',
    label: 'Alleen description, geen QID/URL (moet blijven)',
    wikidataId: null,
    wikipediaUrl: null,
    description: 'Een wegkruis uit 1734.',
  },
  {
    id: 'osm-node-5',
    label: 'Alleen wikipediaUrl, geen QID/description (moet blijven)',
    wikidataId: null,
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Voorbeeld',
    description: null,
  },
];

const result = filterAndDedupeOsmCandidates(osmCandidates, wikidataCandidates);
const resultIds = result.map((c) => c.id);

const expectations = [
  { id: 'osm-node-1', shouldRemain: false, reason: 'dedupe op QID (Q100 al in Test 3)' },
  { id: 'osm-node-2', shouldRemain: true, reason: 'QID niet in Test 3 — vangnet-scenario' },
  { id: 'osm-node-3', shouldRemain: false, reason: 'leeg punt, geen bruikbare tekst' },
  { id: 'osm-node-4', shouldRemain: true, reason: 'heeft description' },
  { id: 'osm-node-5', shouldRemain: true, reason: 'heeft wikipediaUrl' },
];

console.log('Invoer:', osmCandidates.length, 'OSM-kandidaten,', wikidataCandidates.length, 'Wikidata-kandidaten');
console.log('Resultaat na filterAndDedupeOsmCandidates():', resultIds.length, 'kandidaten overgebleven\n');

let allPassed = true;
for (const exp of expectations) {
  const actuallyRemains = resultIds.includes(exp.id);
  const passed = actuallyRemains === exp.shouldRemain;
  if (!passed) allPassed = false;
  const status = passed ? 'OK  ' : 'FOUT';
  const verwacht = exp.shouldRemain ? 'moet blijven' : 'moet verdwijnen';
  const werkelijk = actuallyRemains ? 'bleef staan' : 'is verdwenen';
  console.log(
    '[' + status + '] ' + exp.id + ' — ' + exp.reason +
    ' (verwacht: ' + verwacht + '; werkelijk: ' + werkelijk + ')'
  );
}

console.log('\n' + (allPassed ? 'ALLE SCENARIO\'S GESLAAGD' : 'ER ZIJN MISLUKTE SCENARIO\'S — zie FOUT-regels hierboven'));
process.exit(allPassed ? 0 : 1);