/**
 * test-artikel-via-ligging.js
 *
 * Netwerkloze test voor artikel-via-ligging.js (0.17.0): welk artikel uit
 * het geozoeken bij een POI hoort (keuze 3C), plus URL en antwoord.
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-artikel-via-ligging.js
 */

const L = require('./artikel-via-ligging.js');

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
const titel = (k) => (k ? k.titel : null);

// Woorden
check('woorden: Kasteel Keppel', L.woorden('Kasteel Keppel'), { kern: ['keppel'], soorten: ['kasteel'] });
check('woorden: Sint-Dionysiuskerk', L.woorden('Sint-Dionysiuskerk'), { kern: ['dionysius'], soorten: ['kerk'] });
check('woorden: Boetselaersborg', L.woorden('Boetselaersborg'), { kern: ['boetselaers'], soorten: ['kasteel'] });
check('woorden: Château de Chambord', L.woorden('Château de Chambord'), { kern: ['chambord'], soorten: ['kasteel'] });
check('woorden: Laag-Keppel', L.woorden('Laag-Keppel'), { kern: ['keppel'], soorten: [] });
check('woorden: Kerkhof → begraafplaats, niet kerk', L.woorden('Kerkhof Almen').soorten, ['begraafplaats']);
check('woorden: Schloß Neuschwanstein', L.woorden('Schloß Neuschwanstein'), { kern: ['neuschwanstein'], soorten: ['kasteel'] });
check('titelVanUrl', L.titelVanUrl('https://en.wikipedia.org/wiki/Keppel_Castle'), 'Keppel Castle');
check('titelVanUrl met codering', L.titelVanUrl('https://fr.wikipedia.org/wiki/Ch%C3%A2teau_de_Chambord'), 'Château de Chambord');

// Keppel: twee Wikidata-items, gevonden item heeft alleen een Engels artikel.
const keppel = {
  id: 'Q2769348',
  label: 'Keppel Castle',
  lat: 52.0,
  lng: 6.2,
  wikipediaUrl: 'https://en.wikipedia.org/wiki/Keppel_Castle',
  articles: { en: 'https://en.wikipedia.org/wiki/Keppel_Castle' },
};
const keppelKandidaten = [
  { titel: 'Laag-Keppel', qid: 'Q1', afstand: 40 },
  { titel: 'Kasteel Keppel', qid: 'Q99', afstand: 12 },
  { titel: 'Oude IJssel', qid: 'Q2', afstand: 60 },
];
check('Keppel → Kasteel Keppel (niet het dorp)', titel(L.kiesArtikel(keppel, keppelKandidaten)), 'Kasteel Keppel');
check(
  'Keppel: alleen het dorp in de buurt → geen vondst',
  titel(L.kiesArtikel(keppel, [{ titel: 'Laag-Keppel', qid: 'Q1', afstand: 40 }])),
  null
);
check(
  'Artikel van een andere POI → overgeslagen',
  titel(L.kiesArtikel(keppel, keppelKandidaten, { andereIds: new Set(['Q99']) })),
  null
);
check(
  'Artikel van de POI zelf → altijd goed, ook zonder gedeeld woord',
  titel(L.kiesArtikel(keppel, [{ titel: 'Iets heel anders', qid: 'Q2769348', afstand: 5 }])),
  'Iets heel anders'
);
check(
  'Artikel van een samengevoegd item → goed',
  titel(
    L.kiesArtikel({ ...keppel, mergedFrom: [{ id: 'Q77', label: 'X' }] }, [{ titel: 'Y', qid: 'Q77', afstand: 5 }], {
      andereIds: ['Q77'],
    })
  ),
  'Y'
);
check(
  'Verder dan 100 m → niet',
  titel(L.kiesArtikel(keppel, [{ titel: 'Kasteel Keppel', qid: 'Q99', afstand: 150 }])),
  null
);

// Kerk en kapel naast elkaar: soort moet passen.
const kerk = { id: 'Q10', label: 'Dionysiuskerk', lat: 52, lng: 6.5 };
check(
  'Kerk: school met dezelfde naam → niet',
  titel(L.kiesArtikel(kerk, [{ titel: 'Dionysiusschool', qid: 'Q11', afstand: 20 }])),
  null
);
check(
  'Kerk: "Sint-Dionysiuskerk (Markelo)" → wel',
  titel(L.kiesArtikel(kerk, [{ titel: 'Sint-Dionysiuskerk (Markelo)', qid: 'Q12', afstand: 8 }])),
  'Sint-Dionysiuskerk (Markelo)'
);
check(
  'Kerk: verwante soort (kapel) → wel',
  titel(L.kiesArtikel({ id: 'Q1', label: 'Mariakerk' }, [{ titel: 'Mariakapel', qid: 'Q2', afstand: 10 }])),
  'Mariakapel'
);
check(
  'Engelse naam, Duits artikel: "St. Mary\'s Church" ↔ "Marienkirche" → geen gedeeld woord, niet',
  titel(L.kiesArtikel({ id: 'Q1', label: "St. Mary's Church" }, [{ titel: 'Marienkirche', qid: 'Q2', afstand: 10 }])),
  null
);
check(
  'Taalonafhankelijke eigennaam: "Château de Chambord" ↔ "Kasteel van Chambord"',
  titel(L.kiesArtikel({ id: 'Q1', label: 'Château de Chambord' }, [{ titel: 'Kasteel van Chambord', qid: 'Q2', afstand: 30 }])),
  'Kasteel van Chambord'
);
check(
  'Naam zonder soort: gedeeld woord volstaat',
  titel(L.kiesArtikel({ id: 'Q1', label: 'Hackfort' }, [{ titel: 'Kasteel Hackfort', qid: 'Q2', afstand: 20 }])),
  'Kasteel Hackfort'
);
check(
  'Meer gedeelde woorden wint van dichterbij',
  titel(
    L.kiesArtikel({ id: 'Q1', label: 'Huis Ruurlo Bergh' }, [
      { titel: 'Huis Bergh', qid: 'Q2', afstand: 5 },
      { titel: 'Kasteel Ruurlo Bergh', qid: 'Q3', afstand: 50 },
    ])
  ),
  'Kasteel Ruurlo Bergh'
);
check(
  'Tussen-s: "Boetselaersborg" ↔ "Kasteel Boetselaer"',
  titel(L.kiesArtikel({ id: 'Q1', label: 'Boetselaersborg' }, [{ titel: 'Kasteel Boetselaer', qid: 'Q2', afstand: 10 }])),
  'Kasteel Boetselaer'
);
check('Geen kandidaten → null', L.kiesArtikel(keppel, []), null);

// URL, antwoord, naam
const url = L.bouwGeozoekUrl('nl', 52.0, 6.2);
check('URL: nl.wikipedia, geosearch, 100 m', url.startsWith('https://nl.wikipedia.org/w/api.php?') && url.includes('generator=geosearch') && url.includes('ggsradius=100'), true);
let fout = null;
try {
  L.bouwGeozoekUrl('nl"; drop', 52, 6);
} catch (e) {
  fout = e.message;
}
check('URL: ongeldige taal → fout', fout !== null, true);
const antwoord = {
  query: {
    pages: [
      { pageid: 1, ns: 0, title: 'Laag-Keppel', pageprops: { wikibase_item: 'Q1' }, coordinates: [{ lat: 0, lon: 0, primary: true, dist: 40.2 }] },
      { pageid: 2, ns: 0, title: 'Kasteel Keppel', pageprops: { wikibase_item: 'Q99' }, coordinates: [{ lat: 0, lon: 0, primary: true, dist: 11.7 }] },
      { pageid: 3, ns: 0, title: 'Zonder coördinaat' },
    ],
  },
};
check(
  'Antwoord lezen: dichtstbijzijnde eerst',
  L.leesGeozoekResultaat(antwoord),
  [
    { titel: 'Kasteel Keppel', qid: 'Q99', afstand: 11.7 },
    { titel: 'Laag-Keppel', qid: 'Q1', afstand: 40.2 },
    { titel: 'Zonder coördinaat', qid: null, afstand: 100 },
  ]
);
check('Leeg antwoord → []', L.leesGeozoekResultaat({}), []);
check('artikelUrl', L.artikelUrl('nl', 'Kasteel Keppel'), 'https://nl.wikipedia.org/wiki/Kasteel_Keppel');
check('naamVanTitel: haakjes vervallen', L.naamVanTitel('Sint-Dionysiuskerk (Markelo)'), 'Sint-Dionysiuskerk');
check('naamVanTitel: zonder haakjes', L.naamVanTitel('Kasteel Keppel'), 'Kasteel Keppel');

console.log(
  mislukt === 0 ? `\nAlle ${geslaagd} tests geslaagd.` : `\n${mislukt} van ${geslaagd + mislukt} tests mislukt.`
);
process.exit(mislukt === 0 ? 0 : 1);
