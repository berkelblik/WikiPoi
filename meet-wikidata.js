// meet-wikidata.js — tijdelijk meetscript, versie 2 (na afloop verwijderen).
// Vergelijkt voor de standaard aangevinkte categorieën:
//   A = huidig: één verzoek per categorie, na elkaar (zoals App.jsx nu doet)
//   B = alle QID's samen in één verzoek
//   C = als B, met hint:Query hint:optimizer "None"
// Elke query krijgt een uniek commentaar, zodat de server geen bewaard
// (gecachet) antwoord teruggeeft. Twee rondes met wisselende volgorde.
// Gebruik (vanuit de hoofdmap van de repo): node meet-wikidata.js

const wds = require('./src/wikidata-search.js');
const cats = require('./src/poi-categories.js');

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi-meetscript/2.0 (https://github.com/berkelblik/WikiPoi)';
const TIMEOUT_MS = 90000;
const RONDES = 2;

const BBOX = { minLat: 51.95, maxLat: 52.25, minLng: 6.2, maxLng: 6.65 }; // Achterhoek

const selectedKeys = cats.getDefaultSelectedKeys();
const categories = cats
  .getCategories('nl')
  .filter((c) => selectedKeys.includes(c.key) && c.qids.length > 0);
const allQids = cats.qidsForKeys(categories.map((c) => c.key));

let teller = 0;
function uniek(query) {
  teller += 1;
  return query + '\n# meting ' + Date.now() + '-' + teller + '\n';
}

function metHint(query) {
  return query.replace('WHERE {\n', 'WHERE {\n  hint:Query hint:optimizer "None" .\n');
}

async function meet(query) {
  const url = ENDPOINT + '?format=json&query=' + encodeURIComponent(uniek(query));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { seconden: (Date.now() - start) / 1000, fout: 'HTTP ' + response.status, ids: [] };
    }
    const data = await response.json();
    const items = wds.dedupeById(wds.parseSparqlResults(data));
    return { seconden: (Date.now() - start) / 1000, ids: items.map((it) => it.id) };
  } catch (err) {
    const fout = err.name === 'AbortError' ? 'timeout na ' + TIMEOUT_MS / 1000 + ' s' : err.message;
    return { seconden: (Date.now() - start) / 1000, fout, ids: [] };
  } finally {
    clearTimeout(timer);
  }
}

async function variantA() {
  let totaal = 0;
  const ids = new Set();
  const delen = [];
  let fout = null;
  for (const c of categories) {
    const r = await meet(wds.buildBoxQuery(BBOX, { instanceOf: c.qids }));
    totaal += r.seconden;
    r.ids.forEach((id) => ids.add(id));
    delen.push(c.key + ' ' + r.seconden.toFixed(1) + ' s');
    if (r.fout) fout = c.key + ': ' + r.fout;
  }
  return { seconden: totaal, ids: Array.from(ids), fout, detail: delen.join(', ') };
}

async function variantB() {
  return meet(wds.buildBoxQuery(BBOX, { instanceOf: allQids }));
}

async function variantC() {
  return meet(metHint(wds.buildBoxQuery(BBOX, { instanceOf: allQids })));
}

function toon(label, r) {
  const tijd = r.seconden.toFixed(1) + ' s';
  const regel = '  ' + label + ': ' + tijd + ' — ' + r.ids.length + ' items';
  console.log(r.fout ? regel + ' — FOUT: ' + r.fout : regel);
  if (r.detail) console.log('      (' + r.detail + ')');
}

function zelfde(a, b) {
  return JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
}

async function main() {
  console.log('Categorieën: ' + categories.map((c) => c.key).join(', '));
  console.log('QID\'s: ' + allQids.join(' '));
  console.log('');
  const varianten = [
    ['A huidig (per categorie)', variantA],
    ['B één verzoek          ', variantB],
    ['C één verzoek + hint   ', variantC],
  ];
  for (let ronde = 1; ronde <= RONDES; ronde++) {
    console.log('Ronde ' + ronde);
    const volgorde = ronde % 2 === 1 ? varianten : varianten.slice().reverse();
    const uitkomst = {};
    for (const [label, fn] of volgorde) {
      const r = await fn();
      uitkomst[label[0]] = r;
      toon(label, r);
    }
    const a = uitkomst.A;
    const b = uitkomst.B;
    const c = uitkomst.C;
    if (!a.fout && !b.fout) console.log('  A en B zelfde items: ' + (zelfde(a.ids, b.ids) ? 'ja' : 'NEE'));
    if (!b.fout && !c.fout) console.log('  B en C zelfde items: ' + (zelfde(b.ids, c.ids) ? 'ja' : 'NEE'));
    console.log('');
  }
}

main();
