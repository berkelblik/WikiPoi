// Wegwerp-testscript — vuurtoren-QID (Q39715) empirisch verifiëren
// Zoekt Wikidata-items met een NL-label dat "vuurtoren" bevat, binnen een
// bbox rond Terschelling/Vlieland (bekende vuurtorens: Brandaris, Vlieland),
// en toont per gevonden item de daadwerkelijke instanceOf-klasse(n) (P31).

const ENDPOINT = 'https://query.wikidata.org/sparql';

const query = `
SELECT ?item ?itemLabel ?instance ?instanceLabel WHERE {
  SERVICE wikibase:box {
    ?item wdt:P625 ?location .
    bd:serviceParam wikibase:cornerWest "Point(4.90 53.25)"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point(5.30 53.40)"^^geo:wktLiteral .
  }
  ?item rdfs:label ?label .
  FILTER(LANG(?label) = "nl")
  FILTER(CONTAINS(LCASE(?label), "vuurtoren"))
  ?item wdt:P31 ?instance .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "nl,en". }
}
`;

async function main() {
  const url = ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json' },
  });

  if (!response.ok) {
    console.error('Wikidata-query mislukt: HTTP ' + response.status + ' ' + response.statusText);
    process.exitCode = 1;
    return;
  }

  const data = await response.json();
  const bindings = (data.results && data.results.bindings) || [];

  if (bindings.length === 0) {
    console.log('Geen resultaten gevonden — probeer een andere/grotere bbox.');
    return;
  }

  console.log('Gevonden items met "vuurtoren" in het NL-label, met hun instanceOf-klasse:\n');
  const instanceIds = new Set();
  for (const b of bindings) {
    const itemId = b.item.value.split('/').pop();
    const instanceId = b.instance.value.split('/').pop();
    instanceIds.add(instanceId + ' (' + b.instanceLabel.value + ')');
    console.log(
      '- ' + b.itemLabel.value + ' [' + itemId + ']  →  instanceOf: ' +
      instanceId + ' (' + b.instanceLabel.value + ')'
    );
  }

  console.log('\nUnieke instanceOf-klassen gevonden:');
  for (const id of instanceIds) console.log('  ' + id);

  const matchesQ39715 = [...instanceIds].some((s) => s.startsWith('Q39715 '));
  console.log(
    '\n' + (matchesQ39715
      ? 'OK: Q39715 komt voor als instanceOf-klasse bij minstens één gevonden vuurtoren.'
      : 'LET OP: Q39715 komt NIET voor — controleer de hierboven gevonden klasse(n) i.p.v. Q39715.')
  );
}

main().catch((err) => {
  console.error('Test mislukt:', err.message);
  process.exitCode = 1;
});
