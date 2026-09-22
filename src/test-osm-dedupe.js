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
// `id` (kale QID), `wikipediaUrl` en coördinaten doen ertoe voor deze test.
// Q100 heeft bewust een ontdubbelingstoevoeging + koppelteken in de
// titel (zoals het echte Zutphen-praktijkgeval) — dat laat zien waarom
// de coördinaat-dedupe nodig is naast de titel-dedupe.
const wikidataCandidates = [
  {
    id: 'Q100',
    label: 'Sint-Walburgiskerk',
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Sint-Walburgiskerk_(Zutphen)',
    lat: 52.13959,
    lng: 6.1957,
  },
  {
    id: 'Q200',
    label: 'Voorbeeldmolen',
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Voorbeeldmolen',
    lat: 52.5,
    lng: 6.5,
  },
];

// Nagebootste Test 5-resultaten (osm-fallback.js#elementToCandidate()):
// acht scenario's, met een korte naam zodat de uitvoer leesbaar blijft.
const osmCandidates = [
  {
    id: 'osm-node-1',
    label: 'Dubbel met Q100 (moet verdwijnen — QID-match)',
    wikidataId: 'Q100',
    wikipediaUrl: null,
    description: null,
    lat: 52.13959,
    lng: 6.1957,
  },
  {
    id: 'osm-node-2',
    label: 'Nieuwe QID, niet in Test 3, ver weg (moet blijven — vangnet)',
    wikidataId: 'Q999',
    wikipediaUrl: null,
    description: null,
    lat: 52.6,
    lng: 6.6,
  },
  {
    id: 'osm-node-3',
    label: 'Leeg punt, ver weg (moet verdwijnen — geen bruikbare tekst)',
    wikidataId: null,
    wikipediaUrl: null,
    description: null,
    lat: 52.6,
    lng: 6.61,
  },
  {
    id: 'osm-node-4',
    label: 'Alleen description, ver weg (moet blijven)',
    wikidataId: null,
    wikipediaUrl: null,
    description: 'Een wegkruis uit 1734.',
    lat: 52.6,
    lng: 6.62,
  },
  {
    id: 'osm-node-5',
    label: 'wikipediaUrl niet in Test 3, ver weg (moet blijven)',
    wikidataId: null,
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Voorbeeld',
    description: null,
    lat: 52.6,
    lng: 6.63,
  },
  {
    id: 'osm-node-6',
    label: 'wikipediaUrl matcht Q200 exact, ver van Q200 vandaan (moet verdwijnen — titel-match, bewijst dat dit niet via coördinaten komt)',
    wikidataId: null,
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Voorbeeldmolen',
    description: null,
    lat: 52.6,
    lng: 6.64,
  },
  {
    id: 'osm-node-7',
    label: 'Praktijkgeval Zutphen: titel matcht NIET (geen koppelteken/toevoeging), coördinaten ~1-2m van Q100 (moet verdwijnen — coördinaat-match)',
    wikidataId: null,
    wikipediaUrl: 'https://nl.wikipedia.org/wiki/Sint_Walburgiskerk',
    description: null,
    lat: 52.13958,
    lng: 6.19572,
  },
  {
    id: 'osm-node-8',
    label: 'Afweging: description-only punt binnen 25m van Q100, geen eigen wiki-koppeling (moet verdwijnen — bewuste afweging coördinaat-dedupe)',
    wikidataId: null,
    wikipediaUrl: null,
    description: 'Gedenksteen pal naast de kerk.',
    lat: 52.1396,
    lng: 6.19575,
  },
];

const result = filterAndDedupeOsmCandidates(osmCandidates, wikidataCandidates);
const resultIds = result.map((c) => c.id);

const expectations = [
  { id: 'osm-node-1', shouldRemain: false, reason: 'dedupe op QID (Q100 al in Test 3)' },
  { id: 'osm-node-2', shouldRemain: true, reason: 'QID niet in Test 3, ver weg — vangnet-scenario' },
  { id: 'osm-node-3', shouldRemain: false, reason: 'leeg punt, geen bruikbare tekst' },
  { id: 'osm-node-4', shouldRemain: true, reason: 'heeft description, ver van elk Wikidata-punt' },
  { id: 'osm-node-5', shouldRemain: true, reason: 'wikipediaUrl, titel niet in Test 3, ver weg' },
  { id: 'osm-node-6', shouldRemain: false, reason: 'dedupe op exacte Wikipedia-titel (Q200), ondanks grote afstand' },
  { id: 'osm-node-7', shouldRemain: false, reason: 'dedupe op coördinaten (titel matcht niet door koppelteken/ontdubbeling)' },
  { id: 'osm-node-8', shouldRemain: false, reason: 'dedupe op coördinaten (bewuste afweging: geen eigen wiki-koppeling, maar binnen 25m van Q100)' },
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