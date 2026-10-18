/**
 * test-europoi-csv-import.js
 *
 * Geïsoleerde, netwerkloze test voor europoi-csv.js#fromEuroPoiCsv()
 * (0.10.0, "Eigen POI's"): BOM, CRLF/LF, aanhalingstekens, kopregel in
 * andere volgorde, bestand zonder kopregel, ongeldige regels (decimale
 * komma, ontbrekende naam, buiten bereik), mp3, pluscode (0.11.0), een
 * rondgang export → import, radius en dubbele POI's (0.19.1), positie uit
 * de pluscode (0.19.2).
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-europoi-csv-import.js
 *
 * Slaagt (exit code 0) als alle scenario's kloppen; geeft anders per
 * mislukt scenario een duidelijke regel met verwacht vs. werkelijk
 * resultaat, en sluit af met exit code 1.
 */

const { fromEuroPoiCsv, toEuroPoiCsvWithBom } = require('./europoi-csv.js');

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('OK    ' + name);
  } else {
    failures++;
    console.log('FOUT  ' + name + (detail ? ' — ' + detail : ''));
  }
}

const HEADER = 'lat;lng;pluscode;name;desc;category;radius;mp3';
const MP3 = 'https://www.spannendegeschiedenis.nl/wp-content/uploads/2021/05/B-8-Staringkoepel-DEF-NL.mp3';

// 1. Standaardbestand: BOM, CRLF, aanhalingstekens, puntkomma en "" in desc.
{
  const text =
    '\uFEFF' +
    HEADER + '\r\n' +
    '52.150000;6.290000;"9F48572R+22";"Kerk";"Mooi; oud ""gebouw""";"20261101";0;""\r\n' +
    '52.160000;6.300000;"";"Molen";"";"20261101";0;"' + MP3 + '"\r\n';
  const r = fromEuroPoiCsv(text);
  check('1a twee POI\'s', r.pois.length === 2, JSON.stringify(r));
  check('1b desc met ; en ""', r.pois[0] && r.pois[0].desc === 'Mooi; oud "gebouw"', r.pois[0] && r.pois[0].desc);
  check('1c lege desc', r.pois[1] && r.pois[1].desc === '');
  check('1d mp3 bewaard', r.pois[1] && r.pois[1].mp3 === MP3);
  check('1e niets overgeslagen', r.skipped.length === 0 && r.error === '');
  check('1f getallen', r.pois[0] && r.pois[0].lat === 52.15 && r.pois[0].lng === 6.29);
}

// 2. LF, geen BOM, geen aanhalingstekens, kopregel in andere volgorde + "lon".
{
  const text = 'name;lon;lat;desc\nToren;6.1;52.1;Hoog\n';
  const r = fromEuroPoiCsv(text);
  check('2a kolommen op naam', r.pois.length === 1 && r.pois[0].name === 'Toren' && r.pois[0].lat === 52.1 && r.pois[0].lng === 6.1, JSON.stringify(r));
  check('2b mp3 leeg zonder kolom', r.pois[0] && r.pois[0].mp3 === '');
}

// 3. Zonder kopregel: vaste EuroPoi-volgorde.
{
  const r = fromEuroPoiCsv('52.2;6.2;;Brug;Over de Berkel;x;0;\n');
  check('3 zonder kopregel', r.pois.length === 1 && r.pois[0].name === 'Brug' && r.pois[0].desc === 'Over de Berkel', JSON.stringify(r));
}

// 4. Ongeldige regels met reden en regelnummer.
{
  const text = [
    HEADER,
    '52,15;6,29;;Kommakerk;;;0;', // regel 2: decimale komma
    '52.15;6.29;;;;;0;', // regel 3: naam ontbreekt
    '95.0;6.29;;Noordpool;;;0;', // regel 4: buiten bereik
    ';6.29;;Geen lat;;;0;', // regel 5: lat ontbreekt
    'abc;6.29;;Tekst;;;0;', // regel 6: geen getal
    '', // lege regel: telt niet
    '52.17;6.31;;Goed;;;0; koepel.mp3 ', // regel 8: geldig, lokaal mp3-bestand
  ].join('\n');
  const r = fromEuroPoiCsv(text);
  check('4a één geldige POI', r.pois.length === 1 && r.pois[0].name === 'Goed', JSON.stringify(r.pois));
  check('4b vijf overgeslagen', r.skipped.length === 5, JSON.stringify(r.skipped));
  check('4c komma herkend', r.skipped[0] && r.skipped[0].line === 2 && /decimale komma/.test(r.skipped[0].reason), JSON.stringify(r.skipped[0]));
  check('4d naam ontbreekt', r.skipped[1] && r.skipped[1].line === 3 && /naam/.test(r.skipped[1].reason));
  check('4e buiten bereik', r.skipped[2] && /bereik/.test(r.skipped[2].reason));
  check('4f lokale mp3 bewaard (zonder spaties)', r.pois[0] && r.pois[0].mp3 === 'koepel.mp3', r.pois[0] && JSON.stringify(r.pois[0].mp3));
}

// 5. Regelnummers kloppen ook na een desc met een regeleinde.
{
  const text = HEADER + '\n52.1;6.1;;A;"twee\nregels";;0;\n52.2;6.2;;;;;0;\n';
  const r = fromEuroPoiCsv(text);
  check('5a desc opgeschoond', r.pois[0] && r.pois[0].desc === 'twee regels');
  check('5b regelnummer na meerregelig veld', r.skipped[0] && r.skipped[0].line === 4, JSON.stringify(r.skipped));
}

// 6. Hele bestand onbruikbaar.
{
  check('6a leeg bestand', fromEuroPoiCsv('\uFEFF\r\n').error !== '');
  check('6b komma als scheidingsteken', /puntkomma/.test(fromEuroPoiCsv('lat,lng,name\n52.1,6.1,A\n').error));
  check('6c kopregel zonder name', /name/.test(fromEuroPoiCsv('lat;lng;desc\n52.1;6.1;x\n').error));
}

// 7. Rondgang: wat WikiPoi exporteert, leest WikiPoi weer foutloos in.
{
  const rows = [
    { lat: 52.123456, lng: 6.654321, name: 'Kerk "De Ark"', desc: 'Regel één;\nregel twee', category: 'route', radius: 0, mp3: MP3 },
    { lat: -33.9, lng: 18.4, name: 'Kaapstad', desc: '', category: 'route', radius: 0, mp3: '' },
  ];
  const r = fromEuroPoiCsv(toEuroPoiCsvWithBom(rows));
  check('7a aantal', r.pois.length === 2 && r.skipped.length === 0, JSON.stringify(r));
  check('7b naam met aanhalingstekens', r.pois[0] && r.pois[0].name === 'Kerk "De Ark"');
  check('7c desc', r.pois[0] && r.pois[0].desc === 'Regel één; regel twee');
  check('7d mp3', r.pois[0] && r.pois[0].mp3 === MP3);
  check('7e negatieve coördinaat', r.pois[1] && r.pois[1].lat === -33.9);
}

// 8. Pluscode wordt doorgegeven (0.11.0: koppelen lokale audio).
{
  const r = fromEuroPoiCsv(
    HEADER + '\n' + '52.15;6.29;" 9F37M7RQ+2X ";Kerk;;r;0;\n' + '52.16;6.30;;Molen;;r;0;\n'
  );
  check('8a pluscode met kopregel', r.pois[0] && r.pois[0].pluscode === '9F37M7RQ+2X', JSON.stringify(r.pois[0]));
  check('8b lege pluscode', r.pois[1] && r.pois[1].pluscode === '');
  const z = fromEuroPoiCsv('52.15;6.29;9F37M7RQ+2X;Kerk;;r;0;\n');
  check('8c pluscode zonder kopregel', z.pois[0] && z.pois[0].pluscode === '9F37M7RQ+2X', JSON.stringify(z));
  const o = fromEuroPoiCsv('name;lng;lat\nKerk;6.29;52.15\n');
  check('8d geen pluscodekolom', o.pois[0] && o.pois[0].pluscode === '', JSON.stringify(o));
}

// 9. Radius (0.19.1): > 0 = eigen straal, 0/leeg/ongeldig = vervoerwijze (0).
{
  const r = fromEuroPoiCsv(
    HEADER + '\n' +
      '52.15;6.29;;Monument X;;r;0;\n' +
      '52.16;6.29;;Monument Y;;r;200;\n' +
      '52.17;6.29;;Z;;r;;\n' +
      '52.18;6.29;;W;;r;abc;\n' +
      '52.19;6.29;;V;;r;-50;\n' +
      '52.20;6.29;;U;;r;75.5;\n'
  );
  check('9a radius 0', r.pois[0] && r.pois[0].radius === 0, JSON.stringify(r.pois[0]));
  check('9b radius 200', r.pois[1] && r.pois[1].radius === 200, JSON.stringify(r.pois[1]));
  check('9c leeg, ongeldig, negatief → 0', r.pois.slice(2, 5).every((p) => p.radius === 0));
  check('9d radius met decimale punt', r.pois[5] && r.pois[5].radius === 75.5);
  const z = fromEuroPoiCsv('52.15;6.29;;Kerk;;r;150;\n');
  check('9e radius zonder kopregel', z.pois[0] && z.pois[0].radius === 150, JSON.stringify(z));
  const o = fromEuroPoiCsv('name;lng;lat;radius\nKerk;6.29;52.15;120\n');
  check('9f radius in andere volgorde', o.pois[0] && o.pois[0].radius === 120, JSON.stringify(o));
}

// 10. Dubbele POI's (0.19.1, D1): zelfde naam en plek (< 5 m) samengevoegd.
{
  const r = fromEuroPoiCsv(
    HEADER + '\n' +
      '52.150000;6.290000;;Almen, Dorpshuis;;r;0;\n' +
      '52.150020;6.290000;;almen, dorpshuis ;Tekst;r;200;' + MP3 + '\n' +
      '52.150200;6.290000;;Almen, Dorpshuis;;r;0;\n' +
      '52.150000;6.290000;;Dorpskerk;;r;0;\n'
  );
  check('10a aantal na samenvoegen', r.pois.length === 3, JSON.stringify(r.pois.map((p) => p.name)));
  check('10b samengevoegd gemeld', r.merged.length === 1 && r.merged[0].line === 3 && r.merged[0].metLine === 2,
    JSON.stringify(r.merged));
  check('10c lege velden aangevuld', r.pois[0].desc === 'Tekst' && r.pois[0].mp3 === MP3 && r.pois[0].radius === 200,
    JSON.stringify(r.pois[0]));
  check('10d zelfde naam 22 m verder blijft apart', r.pois[1].name === 'Almen, Dorpshuis' && r.pois[1].line === 4);
  check('10e andere naam zelfde plek blijft apart', r.pois[2].name === 'Dorpskerk');
}

// 11. Positie uit de pluscode (0.19.2, PC1–PC4).
{
  const { OLC } = require('./europoi-csv.js');
  const d = OLC.decode('9F37R2PM+84');
  check('11a decode Dalem', d && Math.abs(d.lat - 51.8358125) < 1e-9 && Math.abs(d.lng - 5.0328125) < 1e-9, JSON.stringify(d));
  const d11 = OLC.decode('9f48579g+q37');
  check('11b decode 11 tekens, kleine letters', d11 && OLC.encode(d11.lat, d11.lng, 11) === '9F48579G+Q37');
  check('11c geen korte, grove of ongeldige code',
    ['R2PM+84', '9F37R2PM+', '9F470000+', '9F37R2PM84', 'X237R2PM+84', '9F37R2PM+8', ''].every((c) => OLC.decode(c) === null));
  const r = fromEuroPoiCsv(
    HEADER + '\n' +
      '51.8228125;5.0294375;9F37R2PM+84;Dalem;;r;0;\n' +      // pluscode wint, 1,5 km verschil
      '52,2684375;4,7345625;9F467P9M+9R;Fort;;r;0;\n' +       // decimale komma: pluscode
      ';;9F467XGX+W2;Batterij;;r;0;\n' +                      // alleen pluscode
      '52.150000;6.290000;9F48572R+22;Kerk;;r;0;\n' +         // binnen het vakje: lat/lng
      '52.150000;6.290000;;Molen;;r;0;\n' +                  // geen pluscode: lat/lng
      '52,15;6,29;R2PM+84;Kort;;r;0;\n'                       // korte code + komma: overgeslagen
  );
  const p = (n) => r.pois.find((x) => x.name === n);
  check('11d Dalem uit pluscode', p('Dalem') && p('Dalem').lat === 51.8358125 && p('Dalem').lng === 5.0328125 && p('Dalem').bron === 'pluscode',
    JSON.stringify(p('Dalem')));
  check('11e waarschuwing Dalem', r.warnings.length === 1 && r.warnings[0].line === 2 && r.warnings[0].meters > 1400 && r.warnings[0].meters < 1550,
    JSON.stringify(r.warnings));
  const k = fromEuroPoiCsv(HEADER + '\n51,8228125;5,0294375;9F37R2PM+84;Dalem;;r;0;\n');
  check('11n waarschuwing ook bij decimale komma', k.pois.length === 1 && k.warnings.length === 1, JSON.stringify(k));
  check('11f decimale komma, geldige pluscode', p('Fort') && p('Fort').bron === 'pluscode' && Math.abs(p('Fort').lat - 52.2684375) < 1e-9);
  check('11g alleen pluscode', p('Batterij') && p('Batterij').bron === 'pluscode');
  check('11h binnen het vakje: lat/lng', p('Kerk') && p('Kerk').bron === 'beide' && p('Kerk').lat === 52.15);
  check('11i zonder pluscode: lat/lng', p('Molen') && p('Molen').bron === 'latlng');
  check('11j korte code en komma: overgeslagen', !p('Kort') && r.skipped.length === 1 && /pluscode/.test(r.skipped[0].reason),
    JSON.stringify(r.skipped));
  const o = fromEuroPoiCsv('pluscode;name\n9F37R2PM+84;Dalem\n');
  check('11k kopregel met alleen pluscode', o.pois.length === 1 && o.pois[0].lat === 51.8358125, JSON.stringify(o));
  // PC4: export houdt de eigen pluscode (ook 11 tekens), lat/lng met punt.
  const csv = toEuroPoiCsvWithBom([
    { lat: 52.169412, lng: 6.275172, name: 'A', desc: '', pluscode: '9f48579g+q37' },
    { lat: 51.8358125, lng: 5.0328125, name: 'B', desc: '', pluscode: 'R2PM+84' },
  ]);
  check('11l export eigen pluscode', /^52\.169412;6\.275172;"9F48579G\+Q37";/m.test(csv), csv);
  check('11m export korte code vervangen', /^51\.835813;5\.032813;"9F37R2PM\+84";/m.test(csv), csv);
}

if (failures > 0) {
  console.log('\n' + failures + ' scenario(s) mislukt.');
  process.exit(1);
}
console.log('\nAlle scenario\'s geslaagd.');
