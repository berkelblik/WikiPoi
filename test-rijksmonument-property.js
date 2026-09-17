#!/usr/bin/env node
/**
 * test-rijksmonument-property.js
 *
 * Los, wegwerpbaar testscript (geen onderdeel van src/) om te verifiëren of
 * P359 daadwerkelijk de Wikidata-eigenschap "Rijksmonument ID" is, en of
 * een bbox-zoekopdracht op basis daarvan bruikbare resultaten oplevert —
 * met dezelfde wikibase:box-aanpak die wikidata-search.js al gebruikt voor
 * de bestaande instanceOf-categorieën.
 *
 * Gebruik:
 *   node test-rijksmonument-property.js
 *
 * (Geen argumenten nodig; de bbox hieronder staat vast op de omgeving
 * Zutphen/Warnsveld, waar we toch al mee aan het testen waren.)
 */

const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'WikiPoi/0.1 (https://github.com/berkelblik/WikiPoi) - eenmalige property-verificatie';

async function runQuery(query) {
  const url = SPARQL_ENDPOINT + '?query=' + encodeURIComponent(query) + '&format=json';
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`SPARQL-aanvraag mislukt: HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  console.log('--- Stap 1: is P359 echt "Rijksmonument ID"? ---');
  const labelQuery = `
    SELECT ?label ?description WHERE {
      wd:P359 rdfs:label ?label .
      FILTER(lang(?label) = "nl")
      OPTIONAL {
        wd:P359 schema:description ?description .
        FILTER(lang(?description) = "nl")
      }
    }
  `;
  const labelResult = await runQuery(labelQuery);
  if (labelResult.results.bindings.length === 0) {
    console.log('GEEN resultaat — P359 heeft geen Nederlands label, of bestaat niet (meer).');
  } else {
    for (const row of labelResult.results.bindings) {
      console.log(`Label: "${row.label.value}"`);
      if (row.description) {
        console.log(`Omschrijving: "${row.description.value}"`);
      }
    }
  }

  console.log('\n--- Stap 2: levert een bbox-zoekopdracht met P359 resultaten op? ---');
  console.log('(bbox: Zutphen/Warnsveld-omgeving, dezelfde regio als de testroute)');
  const bboxQuery = `
    SELECT ?item ?itemLabel ?rijksmonumentId ?coord WHERE {
      SERVICE wikibase:box {
        ?item wdt:P625 ?coord .
        bd:serviceParam wikibase:cornerWest "Point(6.15 52.10)"^^geo:wktLiteral .
        bd:serviceParam wikibase:cornerEast "Point(6.30 52.20)"^^geo:wktLiteral .
      }
      ?item wdt:P359 ?rijksmonumentId .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
    }
    LIMIT 20
  `;
  const bboxResult = await runQuery(bboxQuery);
  const rows = bboxResult.results.bindings;
  console.log(`${rows.length} resultaat(en) gevonden binnen de bbox.\n`);
  for (const row of rows) {
    const name = row.itemLabel ? row.itemLabel.value : '(geen label)';
    const id = row.rijksmonumentId ? row.rijksmonumentId.value : '?';
    const coord = row.coord ? row.coord.value : '?';
    console.log(`- ${name} — rijksmonumentnr. ${id} — ${coord}`);
  }

  if (rows.length === 0) {
    console.log(
      '\nLet op: 0 resultaten kan betekenen dat P359 wel bestaat maar in deze specifieke\n' +
      'bbox toevallig niets is ingevuld op Wikidata (rijksmonumenten hebben lang niet\n' +
      'allemaal hun P359 al gekoppeld) — dat zegt dan meer over de dekking van Wikidata\n' +
      'dan over de query zelf. Probeer in dat geval een grotere/andere bbox.'
    );
  }
}

main().catch((err) => {
  console.error('FOUT:', err.message);
  process.exit(1);
});
