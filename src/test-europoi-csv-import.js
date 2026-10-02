/**
 * test-europoi-csv-import.js
 *
 * Geïsoleerde, netwerkloze test voor europoi-csv.js#fromEuroPoiCsv()
 * (0.10.0, "Eigen POI's"): BOM, CRLF/LF, aanhalingstekens, kopregel in
 * andere volgorde, bestand zonder kopregel, ongeldige regels (decimale
 * komma, ontbrekende naam, buiten bereik), mp3 (link of lokaal bestand) en
 * een rondgang
 * export → import.
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
    '52.150000;6.290000;"9F37M7RQ+2X";"Kerk";"Mooi; oud ""gebouw""";"20261101";0;""\r\n' +
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

if (failures > 0) {
  console.log('\n' + failures + ' scenario(s) mislukt.');
  process.exit(1);
}
console.log('\nAlle scenario\'s geslaagd.');
