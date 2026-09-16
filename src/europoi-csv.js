/**
 * europoi-csv.js
 *
 * Gedeelde bouwsteen, overgenomen uit EuroPoi's gpx2europoi.html-tool.
 * Doel: garanderen dat elke tool die POI's aanlevert (handmatig via GPX,
 * of automatisch via WikiPoi) exact hetzelfde, compatibele CSV-formaat
 * produceert dat de EuroPoi-app verwacht.
 *
 * Uitvoerformaat: lat;lng;pluscode;name;desc;category;radius;mp3
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

// Werkt zowel als CommonJS-module (Node/tests) als los <script> in de browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { OLC, toEuroPoiCsv, toEuroPoiCsvWithBom, toEuroPoiCsvBlob, cleanText };
} else if (typeof window !== 'undefined') {
  window.EuroPoiCsv = { OLC, toEuroPoiCsv, toEuroPoiCsvWithBom, toEuroPoiCsvBlob, cleanText };
}
