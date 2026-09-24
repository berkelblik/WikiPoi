// meet-wikidata.js — tijdelijk meetscript (niet committen).
// Vergelijkt de huidige Wikidata-query met een variant waarin de
// Blazegraph-optimizer is uitgezet (hint:Query hint:optimizer "None"),
// zodat de stappen in de geschreven volgorde worden uitgevoerd.
// Gebruik (vanuit de hoofdmap van de repo): node meet-wikidata.js

const wds = require('./src/wikidata-search.js');

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi-meetscript/1.0 (https://github.com/berkelblik/WikiPoi)';
const TIMEOUT_MS = 90000;

const BOXES = [
  { naam: 'Zutphen (klein)', bbox: { minLat: 52.13, maxLat: 52.15, minLng: 6.18, maxLng: 6.22 } },
  { naam: 'Achterhoek (groot)', bbox: { minLat: 51.95, maxLat: 52.25, minLng: 6.2, maxLng: 6.65 } },
];

const QUERY_OPTIONS = { instanceOf: ['Q16970'] }; // kerkgebouw, zoals categorie "Kerken"

function metHint(query) {
  return query.replace('WHERE {\n', 'WHERE {\n  hint:Query hint:optimizer "None" .\n');
}

async function meet(query) {
  const url = ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { seconden: (Date.now() - start) / 1000, fout: 'HTTP ' + response.status };
    }
    const data = await response.json();
    const items = wds.dedupeById(wds.parseSparqlResults(data));
    return { seconden: (Date.now() - start) / 1000, ids: items.map((it) => it.id).sort() };
  } catch (err) {
    const fout = err.name === 'AbortError' ? 'timeout na ' + TIMEOUT_MS / 1000 + ' s' : err.message;
    return { seconden: (Date.now() - start) / 1000, fout };
  } finally {
    clearTimeout(timer);
  }
}

function toon(label, r) {
  const tijd = r.seconden.toFixed(1) + ' s';
  if (r.fout) {
    console.log('  ' + label + ': ' + tijd + ' — FOUT: ' + r.fout);
  } else {
    console.log('  ' + label + ': ' + tijd + ' — ' + r.ids.length + ' kerken');
  }
}

async function main() {
  for (const box of BOXES) {
    console.log(box.naam);
    const query = wds.buildBoxQuery(box.bbox, QUERY_OPTIONS);
    const huidig = await meet(query);
    toon('huidig   ', huidig);
    const hint = await meet(metHint(query));
    toon('met hint ', hint);
    if (!huidig.fout && !hint.fout) {
      const gelijk = JSON.stringify(huidig.ids) === JSON.stringify(hint.ids);
      console.log('  zelfde resultaten: ' + (gelijk ? 'ja' : 'NEE'));
    }
    console.log('');
  }
}

main();
