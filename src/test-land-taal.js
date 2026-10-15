/**
 * test-land-taal.js
 *
 * Netwerkloze test voor de taal van het land (0.17.0):
 * wikidata-search.js#buildLandTaalQuery() en #kiesLandTaal().
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-land-taal.js
 */

const { buildLandTaalQuery, kiesLandTaal } = require('./wikidata-search.js');

let geslaagd = 0;
let mislukt = 0;
function check(naam, werkelijk, verwacht) {
  if (JSON.stringify(werkelijk) === JSON.stringify(verwacht)) {
    geslaagd += 1;
    console.log('OK    ' + naam);
  } else {
    mislukt += 1;
    console.log('FOUT  ' + naam);
    console.log('      verwacht:  ' + JSON.stringify(verwacht));
    console.log('      werkelijk: ' + JSON.stringify(werkelijk));
  }
}

const land = (code, n = 1) => Array.from({ length: n }, () => ({ bron: 'land', code }));
const eigen = (code, n = 1) => Array.from({ length: n }, () => ({ bron: 'eigen', code }));

// Query
const q = buildLandTaalQuery({ lat: 52.13, lng: 6.31 });
check('query: punt als Point(lng lat)', q.includes('Point(6.31 52.13)'), true);
check('query: P17/P37/P424 en P1705', ['P17', 'P37', 'P424', 'P1705'].every((p) => q.includes(p)), true);
let fout = null;
try {
  buildLandTaalQuery({ lat: 'x', lng: 6 });
} catch (e) {
  fout = e.message;
}
check('query: ongeldig punt → fout', fout !== null, true);

// Keuze
check('Nederland: alleen nl', kiesLandTaal(land('nl', 20)), 'nl');
check('leeg → null', kiesLandTaal([]), null);
check('geen array → null', kiesLandTaal(undefined), null);
check(
  'Grens NL/DE: meer Nederlandse items → nl',
  kiesLandTaal([...land('de', 8), ...land('nl', 12)]),
  'nl'
);
check(
  'België/Vlaanderen: nl, fr, de officieel; eigen namen nl → nl',
  kiesLandTaal([...land('nl', 10), ...land('fr', 10), ...land('de', 10), ...eigen('nl', 6)]),
  'nl'
);
check(
  'België/Wallonië: eigen namen fr → fr',
  kiesLandTaal([...land('nl', 10), ...land('fr', 10), ...land('de', 10), ...eigen('fr', 4)]),
  'fr'
);
check(
  'Eigen naam in streektaal (nds) telt niet: geen officiële taal',
  kiesLandTaal([...land('nl', 3), ...eigen('nds', 50)]),
  'nl'
);
check('Regiovariant: de-ch → de', kiesLandTaal([...land('de-ch', 2)]), 'de');
check('mul en ongeldige codes vallen weg', kiesLandTaal([...land('mul', 5), ...land('x1', 5), ...land('fr', 1)]), 'fr');
check('Gelijke stand → eerst gevonden', kiesLandTaal([...land('fr', 2), ...land('it', 2)]), 'fr');
check(
  'Ruwe SPARQL-JSON',
  kiesLandTaal({
    results: {
      bindings: [
        { bron: { value: 'land' }, code: { value: 'nl' } },
        { bron: { value: 'eigen' }, code: { value: 'nl' } },
      ],
    },
  }),
  'nl'
);

console.log(
  mislukt === 0 ? `\nAlle ${geslaagd} tests geslaagd.` : `\n${mislukt} van ${geslaagd + mislukt} tests mislukt.`
);
process.exit(mislukt === 0 ? 0 : 1);
