/**
 * europoi-csv.js
 *
 * Gedeelde bouwsteen, overgenomen uit EuroPoi's gpx2europoi.html-tool.
 * Doel: garanderen dat elke tool die POI's aanlevert (handmatig via GPX,
 * of automatisch via WikiPoi) exact hetzelfde, compatibele CSV-formaat
 * produceert dat de EuroPoi-app verwacht.
 *
 * Uitvoerformaat: lat;lng;pluscode;name;desc;category;radius;mp3
 * Inlezen ("Eigen POI's" in WikiPoi): fromEuroPoiCsv(), zelfde formaat.
 * Bestandseisen (bevestigd tegen EuroPoi's referentie-export):
 *   - UTF-8 BOM vooraan het bestand
 *   - CRLF-regeleindes
 *
 * Geen dependencies — werkt zowel in de browser als in Node.js.
 */

// ---- Open Location Code (Plus Codes) encoder ----
// Poort van de officiële Apache-2.0-licensed implementatie:
// https://github.com/google/open-location-code/blob/main/js/src/openlocationcode.js
// Copyright 2014 Google Inc. Licensed under the Apache License, Version 2.0.
const OLC = (function () {
  const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
  const ENCODING_BASE = CODE_ALPHABET.length;
  const LATITUDE_MAX = 90;
  const LONGITUDE_MAX = 180;
  const SEPARATOR_POSITION = 8;
  const PAIR_CODE_LENGTH = 10;
  const GRID_CODE_LENGTH = 15 - PAIR_CODE_LENGTH;
  const GRID_ROWS = 5;
  const GRID_COLUMNS = 4;
  const PAIR_PRECISION = Math.pow(ENCODING_BASE, 3);
  const FINAL_LAT_PRECISION = PAIR_PRECISION * Math.pow(GRID_ROWS, GRID_CODE_LENGTH);
  const FINAL_LNG_PRECISION = PAIR_PRECISION * Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH);

  function clipLatitude(lat) {
    return Math.min(90, Math.max(-90, lat));
  }
  function normalizeLongitude(lng) {
    while (lng < -180) lng += 360;
    while (lng >= 180) lng -= 360;
    return lng;
  }

  function locationToIntegers(latitude, longitude) {
    let latVal = Math.floor(latitude * FINAL_LAT_PRECISION);
    latVal += LATITUDE_MAX * FINAL_LAT_PRECISION;
    if (latVal < 0) latVal = 0;
    else if (latVal >= 2 * LATITUDE_MAX * FINAL_LAT_PRECISION) latVal = 2 * LATITUDE_MAX * FINAL_LAT_PRECISION - 1;

    let lngVal = Math.floor(longitude * FINAL_LNG_PRECISION);
    lngVal += LONGITUDE_MAX * FINAL_LNG_PRECISION;
    if (lngVal < 0) lngVal = (lngVal % (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION)) + 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION;
    else if (lngVal >= 2 * LONGITUDE_MAX * FINAL_LNG_PRECISION) lngVal = lngVal % (2 * LONGITUDE_MAX * FINAL_LNG_PRECISION);

    return [latVal, lngVal];
  }

  function encodeIntegers(latInt, lngInt, codeLength) {
    codeLength = codeLength || PAIR_CODE_LENGTH;
    const code = new Array(16);
    code[SEPARATOR_POSITION] = '+';

    if (codeLength > PAIR_CODE_LENGTH) {
      for (let i = 15 - PAIR_CODE_LENGTH; i >= 1; i--) {
        const latDigit = latInt % GRID_ROWS;
        const lngDigit = lngInt % GRID_COLUMNS;
        const ndx = latDigit * GRID_COLUMNS + lngDigit;
        code[SEPARATOR_POSITION + 2 + i] = CODE_ALPHABET.charAt(ndx);
        latInt = Math.floor(latInt / GRID_ROWS);
        lngInt = Math.floor(lngInt / GRID_COLUMNS);
      }
    } else {
      latInt = Math.floor(latInt / Math.pow(GRID_ROWS, GRID_CODE_LENGTH));
      lngInt = Math.floor(lngInt / Math.pow(GRID_COLUMNS, GRID_CODE_LENGTH));
    }

    code[SEPARATOR_POSITION + 1] = CODE_ALPHABET.charAt(latInt % ENCODING_BASE);
    code[SEPARATOR_POSITION + 2] = CODE_ALPHABET.charAt(lngInt % ENCODING_BASE);
    latInt = Math.floor(latInt / ENCODING_BASE);
    lngInt = Math.floor(lngInt / ENCODING_BASE);

    for (let i = PAIR_CODE_LENGTH / 2 + 1; i >= 0; i -= 2) {
      code[i] = CODE_ALPHABET.charAt(latInt % ENCODING_BASE);
      code[i + 1] = CODE_ALPHABET.charAt(lngInt % ENCODING_BASE);
      latInt = Math.floor(latInt / ENCODING_BASE);
      lngInt = Math.floor(lngInt / ENCODING_BASE);
    }

    if (codeLength >= SEPARATOR_POSITION) {
      return code.slice(0, codeLength + 1).join('');
    }
    return code.slice(0, codeLength).join('') + Array(SEPARATOR_POSITION - codeLength + 1).join('0') + '+';
  }

  function encode(latitude, longitude, codeLength) {
    latitude = clipLatitude(Number(latitude));
    longitude = normalizeLongitude(Number(longitude));
    const [latInt, lngInt] = locationToIntegers(latitude, longitude);
    return encodeIntegers(latInt, lngInt, codeLength);
  }

  return { encode };
})();

/**
 * Verwijdert regeleindes/overtollige spaties zodat een multi-line
 * beschrijving (bijv. een Wikipedia-samenvatting) de puntkomma-CSV-rij
 * niet breekt.
 */
function cleanText(value) {
  if (!value) return '';
  return String(value).split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Eén POI-record voor EuroPoi.
 * @typedef {Object} EuroPoiRow
 * @property {number|string} lat
 * @property {number|string} lng
 * @property {string} name
 * @property {string} desc
 * @property {string} [category]
 * @property {number} [radius]
 * @property {string} [mp3]
 */

/**
 * Zet een lijst POI-records om naar EuroPoi's CSV-formaat, inclusief
 * automatisch berekende Plus Codes.
 *
 * @param {EuroPoiRow[]} pois
 * @returns {string} CSV-tekst (nog zonder BOM — zie writeEuroPoiCsvFile/toEuroPoiCsvBlob)
 */
function toEuroPoiCsv(pois) {
  const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const CRLF = '\r\n';
  const lines = ['lat;lng;pluscode;name;desc;category;radius;mp3'];

  for (const poi of pois) {
    const lat = Number(poi.lat).toFixed(6);
    const lng = Number(poi.lng).toFixed(6);
    const pluscode = OLC.encode(Number(poi.lat), Number(poi.lng), 10);
    const radius = Number.isFinite(poi.radius) ? poi.radius : 0;

    lines.push(
      [
        lat,
        lng,
        q(pluscode),
        q(cleanText(poi.name)),
        q(cleanText(poi.desc)),
        q(cleanText(poi.category || '')),
        radius,
        q(poi.mp3 || ''),
      ].join(';')
    );
  }

  return lines.join(CRLF) + CRLF;
}

/**
 * Zoals toEuroPoiCsv, maar met UTF-8 BOM ervoor — nodig voor correcte
 * weergave van accenten/diakrieten bij import in EuroPoi.
 *
 * @param {EuroPoiRow[]} pois
 * @returns {string}
 */
function toEuroPoiCsvWithBom(pois) {
  const BOM = '\uFEFF';
  return BOM + toEuroPoiCsv(pois);
}

/**
 * Browser-only helper: bouwt een downloadbare Blob van de CSV.
 * (In Node.js: schrijf toEuroPoiCsvWithBom(pois) rechtstreeks weg met fs.)
 *
 * @param {EuroPoiRow[]} pois
 * @returns {Blob}
 */
function toEuroPoiCsvBlob(pois) {
  return new Blob([toEuroPoiCsvWithBom(pois)], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Splitst CSV-tekst met puntkomma als scheidingsteken in records (arrays
 * van velden). Ondersteunt velden tussen aanhalingstekens, met daarin
 * puntkomma's, regeleindes en verdubbelde aanhalingstekens (""), en zowel
 * CRLF als LF. Geeft per record ook het regelnummer waarop het begint
 * (1-based), voor duidelijke meldingen.
 *
 * @param {string} text
 * @returns {Array<{line:number, fields:string[]}>}
 */
function splitCsvRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ';') {
      fields.push(field);
      field = '';
    } else if (ch === '\r') {
      // CR van CRLF negeren; de LF sluit het record af.
    } else if (ch === '\n') {
      fields.push(field);
      records.push({ line: recordLine, fields });
      fields = [];
      field = '';
      line++;
      recordLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || fields.length > 0) {
    fields.push(field);
    records.push({ line: recordLine, fields });
  }
  return records;
}

// Coördinaat met decimale PUNT (zoals EuroPoi vereist), optioneel met minteken.
const COORD_PATTERN = /^-?\d+(\.\d+)?$/;

/**
 * Leest een EuroPoi-CSV (lat;lng;pluscode;name;desc;category;radius;mp3) in,
 * bijv. voor "Eigen POI's" in WikiPoi. Met of zonder UTF-8 BOM, CRLF of LF,
 * velden met of zonder aanhalingstekens.
 *
 * - Kopregel: herkend als de eerste regel een kolom "lat" én "lng" (of
 *   "lon") bevat; de kolommen worden dan op naam gezocht, dus een andere
 *   volgorde mag. Zonder kopregel geldt de vaste EuroPoi-volgorde.
 * - Verplicht per regel: lat, lng (decimale punt, binnen bereik) en name.
 *   Ongeldige regels worden overgeslagen en geteld, met reden en
 *   regelnummer. Een decimale komma telt als ongeldig: EuroPoi accepteert
 *   alleen een punt, en het bestand moet in beide apps bruikbaar blijven.
 * - pluscode: wordt ongewijzigd doorgegeven (alleen spaties eromheen weg);
 *   WikiPoi koppelt er lokale audiobestanden mee (bestandsnaam = pluscode,
 *   zoals EuroPoi). De positie komt altijd uit lat/lng.
 * - category en radius worden genegeerd.
 * - mp3: wordt ongewijzigd doorgegeven (alleen spaties eromheen weg). In
 *   EuroPoi is dit een internetlink; lokale audio koppelt de app apart.
 * - Lege regels tellen niet mee.
 *
 * @param {string} text - inhoud van het bestand
 * @returns {{
 *   pois: Array<{lat:number, lng:number, pluscode:string, name:string, desc:string, mp3:string, line:number}>,
 *   skipped: Array<{line:number, reason:string}>,
 *   error: string
 * }} error is gevuld als het bestand als geheel onbruikbaar is.
 */
function fromEuroPoiCsv(text) {
  const result = { pois: [], skipped: [], error: '' };
  let body = String(text || '');
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);

  const records = splitCsvRecords(body).filter((r) => r.fields.some((f) => f.trim() !== ''));
  if (records.length === 0) {
    result.error = 'Het bestand is leeg.';
    return result;
  }

  // Standaardvolgorde van EuroPoi.
  let col = { lat: 0, lng: 1, pluscode: 2, name: 3, desc: 4, mp3: 7 };
  let start = 0;
  const first = records[0].fields.map((f) => f.trim().toLowerCase());
  if (first.includes('lat') && (first.includes('lng') || first.includes('lon'))) {
    const idx = (n) => first.indexOf(n);
    col = {
      lat: idx('lat'),
      lng: idx('lng') >= 0 ? idx('lng') : idx('lon'),
      pluscode: idx('pluscode'),
      name: idx('name'),
      desc: idx('desc'),
      mp3: idx('mp3'),
    };
    start = 1;
    if (col.name < 0) {
      result.error = 'De kopregel mist de verplichte kolom "name".';
      return result;
    }
  } else if (records[0].fields.length === 1 && records[0].fields[0].includes(',')) {
    // Eén kolom met komma's: vrijwel zeker opgeslagen met komma als
    // scheidingsteken in plaats van puntkomma.
    result.error = 'Geen puntkomma als scheidingsteken gevonden. Sla het bestand op als CSV met puntkomma (;).';
    return result;
  }

  const get = (fields, i) => (i >= 0 && i < fields.length ? fields[i].trim() : '');

  for (let r = start; r < records.length; r++) {
    const { line, fields } = records[r];
    const latText = get(fields, col.lat);
    const lngText = get(fields, col.lng);
    const name = cleanText(get(fields, col.name));

    if (fields.length === 1) {
      result.skipped.push({ line, reason: 'geen puntkomma als scheidingsteken' });
      continue;
    }
    if (latText === '' || lngText === '') {
      result.skipped.push({ line, reason: 'lat of lng ontbreekt' });
      continue;
    }
    if (/^-?\d+,\d+$/.test(latText) || /^-?\d+,\d+$/.test(lngText)) {
      result.skipped.push({ line, reason: 'decimale komma in coördinaat (gebruik een punt)' });
      continue;
    }
    if (!COORD_PATTERN.test(latText) || !COORD_PATTERN.test(lngText)) {
      result.skipped.push({ line, reason: 'lat of lng is geen geldig getal' });
      continue;
    }
    const lat = Number(latText);
    const lng = Number(lngText);
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      result.skipped.push({ line, reason: 'coördinaat buiten bereik' });
      continue;
    }
    if (!name) {
      result.skipped.push({ line, reason: 'naam ontbreekt' });
      continue;
    }
    const mp3 = get(fields, col.mp3);
    const pluscode = get(fields, col.pluscode);
    result.pois.push({ lat, lng, pluscode, name, desc: cleanText(get(fields, col.desc)), mp3, line });
  }
  return result;
}

// Werkt zowel als CommonJS-module (Node/tests) als los <script> of ESM-bundel-
// side-effect-import in de browser (Vite/Capacitor).
//
// BELANGRIJK: de window-toewijzing gebeurt hier ONVOORWAARDELIJK wanneer
// window bestaat — dus niet als "else"-tak na de module-check. Bundelaars
// zoals Vite/Rollup herkennen automatisch de module.exports-syntax hieronder
// en injecteren daarom soms zelf een (nep-)`module`-object om CommonJS-
// compatibiliteit te bieden, ook als het bestand via een ESM side-effect-
// import wordt binnengehaald. Als de window-toewijzing dan in een "else if"
// zou staan, wordt hij overgeslagen zodra die nep-module aanwezig is, en
// blijft window.EuroPoiCsv undefined in de gebouwde app — precies de bug
// die deze volgorde voorkomt.
if (typeof window !== 'undefined') {
  window.EuroPoiCsv = { OLC, toEuroPoiCsv, toEuroPoiCsvWithBom, toEuroPoiCsvBlob, cleanText, fromEuroPoiCsv };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OLC, toEuroPoiCsv, toEuroPoiCsvWithBom, toEuroPoiCsvBlob, cleanText, fromEuroPoiCsv, splitCsvRecords };
}
