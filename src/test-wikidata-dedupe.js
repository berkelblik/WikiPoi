/**
 * test-wikidata-dedupe.js
 *
 * Geïsoleerde, netwerkloze test voor
 * wikidata-search.js#dedupeByProximity() — het samenvoegen van
 * Wikidata-items met verschillende QID's die (vrijwel) op dezelfde plek
 * liggen. Aanleiding: in Zutphen staan "Broederenkerk" en "Waalse kerk"
 * als twee items op exact dezelfde coördinaat; het is één pand.
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-wikidata-dedupe.js
 *
 * Slaagt (exit code 0) als alle scenario's kloppen; geeft anders per
 * mislukt scenario een regel met verwacht vs. werkelijk resultaat, en
 * sluit af met exit code 1.
 */

const { dedupeByProximity } = require('./wikidata-search.js');

// ~1 meter in breedtegraad, om afstanden in de testdata te kunnen zetten.
const M = 1 / 111195;

const scenarios = [];
function scenario(name, fn) {
  scenarios.push({ name, fn });
}
function eq(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

scenario('Zutphen-praktijkgeval: zelfde plek, alleen één heeft Wikipedia → die blijft, namen gecombineerd', () => {
  const input = [
    { id: 'Q1', label: 'Waalse kerk', lat: 52.1405, lng: 6.1968, wikipediaUrl: null },
    {
      id: 'Q2',
      label: 'Broederenkerk',
      lat: 52.1405,
      lng: 6.1968,
      wikipediaUrl: 'https://nl.wikipedia.org/wiki/Broederenkerk_(Zutphen)',
    },
  ];
  const out = dedupeByProximity(input);
  const expected = { count: 1, id: 'Q2', label: 'Broederenkerk (Waalse kerk)', mergedFrom: ['Q1'] };
  const actual = {
    count: out.length,
    id: out[0] && out[0].id,
    label: out[0] && out[0].label,
    mergedFrom: out[0] && out[0].mergedFrom ? out[0].mergedFrom.map((m) => m.id) : null,
  };
  return { ok: eq(actual, expected), expected, actual };
});

scenario('Beide met Wikipedia → eerst gevonden item blijft', () => {
  const input = [
    { id: 'Q1', label: 'A', lat: 52, lng: 6, wikipediaUrl: 'https://nl.wikipedia.org/wiki/A' },
    { id: 'Q2', label: 'B', lat: 52, lng: 6, wikipediaUrl: 'https://nl.wikipedia.org/wiki/B' },
  ];
  const out = dedupeByProximity(input);
  const expected = ['Q1', 'A (B)'];
  const actual = [out.length === 1 && out[0].id, out[0] && out[0].label];
  return { ok: eq(actual, expected), expected, actual };
});

scenario('8m uit elkaar → samengevoegd (binnen drempel 10m)', () => {
  const input = [
    { id: 'Q1', label: 'A', lat: 52, lng: 6 },
    { id: 'Q2', label: 'B', lat: 52 + 8 * M, lng: 6 },
  ];
  const out = dedupeByProximity(input);
  return { ok: out.length === 1, expected: 1, actual: out.length };
});

scenario('30m uit elkaar (kerk + beeld ervoor) → allebei behouden', () => {
  const input = [
    { id: 'Q1', label: 'Kerk', lat: 52, lng: 6 },
    { id: 'Q2', label: 'Beeld', lat: 52 + 30 * M, lng: 6 },
  ];
  const out = dedupeByProximity(input);
  const expected = ['Q1', 'Q2'];
  const actual = out.map((o) => o.id);
  return { ok: eq(actual, expected), expected, actual };
});

scenario('mergeLabels: false → naam ongewijzigd, mergedFrom wel gevuld', () => {
  const input = [
    { id: 'Q1', label: 'A', lat: 52, lng: 6 },
    { id: 'Q2', label: 'B', lat: 52, lng: 6 },
  ];
  const out = dedupeByProximity(input, { mergeLabels: false });
  const expected = ['A', ['Q2']];
  const actual = [out[0].label, out[0].mergedFrom.map((m) => m.id)];
  return { ok: eq(actual, expected), expected, actual };
});

scenario('Gelijke namen → geen dubbele naam tussen haakjes', () => {
  const input = [
    { id: 'Q1', label: 'Molen De Hoop', lat: 52, lng: 6 },
    { id: 'Q2', label: 'molen de hoop', lat: 52, lng: 6 },
  ];
  const out = dedupeByProximity(input);
  return { ok: out.length === 1 && out[0].label === 'Molen De Hoop', expected: 'Molen De Hoop', actual: out[0].label };
});

scenario('Drie items op één plek → één item, twee namen tussen haakjes', () => {
  const input = [
    { id: 'Q1', label: 'A', lat: 52, lng: 6 },
    { id: 'Q2', label: 'B', lat: 52, lng: 6, wikipediaUrl: 'https://nl.wikipedia.org/wiki/B' },
    { id: 'Q3', label: 'C', lat: 52, lng: 6 },
  ];
  const out = dedupeByProximity(input);
  const expected = [1, 'Q2', 'B (A, C)'];
  const actual = [out.length, out[0].id, out[0].label];
  return { ok: eq(actual, expected), expected, actual };
});

scenario('Items zonder coördinaten → ongemoeid, volgorde behouden', () => {
  const input = [
    { id: 'Q1', label: 'A', lat: 52, lng: 6 },
    { id: 'Q2', label: 'Zonder plek' },
    { id: 'Q3', label: 'C', lat: 53, lng: 6 },
  ];
  const out = dedupeByProximity(input);
  const expected = ['Q1', 'Q2', 'Q3'];
  const actual = out.map((o) => o.id);
  return { ok: eq(actual, expected), expected, actual };
});

let allPassed = true;
for (const s of scenarios) {
  let result;
  try {
    result = s.fn();
  } catch (err) {
    result = { ok: false, expected: '(geen fout)', actual: 'Fout: ' + err.message };
  }
  if (result.ok) {
    console.log('OK    ' + s.name);
  } else {
    allPassed = false;
    console.log('FOUT  ' + s.name);
    console.log('      verwacht:  ' + JSON.stringify(result.expected));
    console.log('      werkelijk: ' + JSON.stringify(result.actual));
  }
}

console.log('\n' + (allPassed ? "ALLE SCENARIO'S GESLAAGD" : "ER ZIJN MISLUKTE SCENARIO'S — zie FOUT-regels hierboven"));
process.exit(allPassed ? 0 : 1);
