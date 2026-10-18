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
 * Sinds 0.19.2 kan de positie ook uit de pluscode komen (OLC.decode).
 * Bestandseisen (bevestigd tegen EuroPoi's referentie-export):
 *   - UTF-8 BOM vooraan het bestand
 *   - CRLF-regeleindes
 *
 * Geen dependencies — werkt zowel in de browser als in Node.js.
 */

// ---- Open Location Code (Plus Codes) encoder en decoder ----
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

  // Volledige, nauwkeurige code (0.19.2): 8 tekens vóór de '+' en 2 tot 7
  // erna (vakje ± 14 m of kleiner). Grovere codes ("9F37R2PM+", opgevuld
  // "9F470000+") en korte codes ("R2PM+84 Dalem") tellen niet: te grof of
  // zonder plaats niet te bepalen. Hoofdletters/kleine letters maken niet uit.
  const VOL = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,7}$/;

  function isFull(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!VOL.test(c)) return false;
    // Eerste teken breedte (max. 180°: index < 9), tweede lengte (max. 360°: index < 18).
    if (CODE_ALPHABET.indexOf(c[0]) * ENCODING_BASE >= LATITUDE_MAX * 2) return false;
    if (CODE_ALPHABET.indexOf(c[1]) * ENCODING_BASE >= LONGITUDE_MAX * 2) return false;
    return true;
  }

  /**
   * Midden van het vakje van een volledige code: { lat, lng, latSize,
   * lngSize } (graden), of null bij een ongeldige of korte code.
   */
  function decode(code) {
    if (!isFull(code)) return null;
    const c = String(code).trim().toUpperCase().replace('+', '');
    let lat = -LATITUDE_MAX;
    let lng = -LONGITUDE_MAX;
    let res = ENCODING_BASE; // 20 graden voor het eerste paar
    let latSize = 0;
    let lngSize = 0;
    const paren = Math.min(c.length, PAIR_CODE_LENGTH);
    for (let i = 0; i < paren; i += 2) {
      lat += CODE_ALPHABET.indexOf(c[i]) * res;
      lng += CODE_ALPHABET.indexOf(c[i + 1]) * res;
      latSize = res;
      lngSize = res;
      res /= ENCODING_BASE;
    }
    for (let i = PAIR_CODE_LENGTH; i < c.length; i++) {
      latSize /= GRID_ROWS;
      lngSize /= GRID_COLUMNS;
      const ndx = CODE_ALPHABET.indexOf(c[i]);
      lat += Math.floor(ndx / GRID_COLUMNS) * latSize;
      lng += (ndx % GRID_COLUMNS) * lngSize;
    }
    return { lat: lat + latSize / 2, lng: lng + lngSize / 2, latSize, lngSize };
  }

  return { encode, decode, isFull };
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
 * @property {string} [pluscode] - volledige code; anders berekend uit lat/lng (0.19.2)
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
    // Eigen pluscode ongewijzigd laten (0.19.2, PC4); anders berekenen.
    const eigen = String(poi.pluscode || '').trim().toUpperCase();
    const pluscode = OLC.isFull(eigen) ? eigen : OLC.encode(Number(poi.lat), Number(poi.lng), 10);
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
 *   "lon") bevat, of een kolom "pluscode"; de kolommen worden dan op naam gezocht, dus een andere
 *   volgorde mag. Zonder kopregel geldt de vaste EuroPoi-volgorde.
 * - Verplicht per regel: een geldige positie (volledige pluscode, of lat en
 *   lng met decimale punt binnen bereik) en name.
 *   Ongeldige regels worden overgeslagen en geteld, met reden en
 *   regelnummer. Een decimale komma telt als ongeldig: EuroPoi accepteert
 *   alleen een punt, en het bestand moet in beide apps bruikbaar blijven.
 * - pluscode: wordt ongewijzigd doorgegeven (alleen spaties eromheen weg);
 *   WikiPoi koppelt er lokale audiobestanden mee (bestandsnaam = pluscode,
 *   zoals EuroPoi).
 * - Positie (0.19.2, keuzes PC1–PC3): een volledige pluscode gaat voor
 *   (midden van het vakje); lat/lng is de reserve. Ligt lat/lng binnen het
 *   vakje van de pluscode (ze kloppen met elkaar), dan wordt lat/lng
 *   gebruikt: preciezer, en een export van WikiPoi leest zo ongewijzigd in. Zo maakt een decimale
 *   komma in lat/lng (bijv. na bewerken in een spreadsheet) niet uit zolang
 *   de pluscode klopt. Liggen pluscode en lat/lng meer dan
 *   AFWIJKING_MAX_METERS uit elkaar, dan staat dat in warnings. Korte codes
 *   ("R2PM+84 Dalem") worden niet herkend. Per POI zegt bron welke werd
 *   gebruikt: 'pluscode', 'latlng' (geen bruikbare pluscode) of 'beide'
 *   (lat/lng binnen het vakje van de pluscode).
 * - category wordt genegeerd.
 * - radius (0.19.1): triggerstraal in meters; 0, leeg of geen geldig getal
 *   = de straal van de vervoerwijze (zoals in EuroPoi).
 * - Dubbele POI's (0.19.1, D1): dezelfde naam (hoofdletters en spaties
 *   eromheen tellen niet) op minder dan DUBBEL_MAX_METERS van een eerdere
 *   regel worden samengevoegd tot de eerste; lege velden (desc, mp3,
 *   pluscode, radius) worden aangevuld uit de dubbele. Zie merged.
 * - mp3: wordt ongewijzigd doorgegeven (alleen spaties eromheen weg). In
 *   EuroPoi is dit een internetlink; lokale audio koppelt de app apart.
 * - Lege regels tellen niet mee.
 *
 * @param {string} text - inhoud van het bestand
 * @returns {{
 *   pois: Array<{lat:number, lng:number, pluscode:string, name:string, desc:string, radius:number, mp3:string, line:number}>,
 *   skipped: Array<{line:number, reason:string}>,
 *   merged: Array<{line:number, metLine:number, name:string}>,
 *   warnings: Array<{line:number, name:string, meters:number}>,
 *   error: string
 * }} error is gevuld als het bestand als geheel onbruikbaar is.
 */
function fromEuroPoiCsv(text) {
  const result = { pois: [], skipped: [], merged: [], warnings: [], error: '' };
  let body = String(text || '');
  if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);

  const records = splitCsvRecords(body).filter((r) => r.fields.some((f) => f.trim() !== ''));
  if (records.length === 0) {
    result.error = 'Het bestand is leeg.';
    return result;
  }

  // Standaardvolgorde van EuroPoi.
  let col = { lat: 0, lng: 1, pluscode: 2, name: 3, desc: 4, radius: 6, mp3: 7 };
  let start = 0;
  const first = records[0].fields.map((f) => f.trim().toLowerCase());
  if ((first.includes('lat') && (first.includes('lng') || first.includes('lon'))) || first.includes('pluscode')) {
    const idx = (n) => first.indexOf(n);
    col = {
      lat: idx('lat'),
      lng: idx('lng') >= 0 ? idx('lng') : idx('lon'),
      pluscode: idx('pluscode'),
      name: idx('name'),
      desc: idx('desc'),
      radius: idx('radius'),
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
    const pluscode = get(fields, col.pluscode);
    const vanCode = OLC.decode(pluscode);
    const ll = leesLatLng(latText, lngText);
    if (!vanCode && ll.reden) {
      const reden = pluscode
        ? `pluscode ongeldig of niet volledig, en ${ll.reden}`
        : ll.reden;
      result.skipped.push({ line, reason: reden });
      continue;
    }
    if (!name) {
      result.skipped.push({ line, reason: 'naam ontbreekt' });
      continue;
    }
    let lat;
    let lng;
    let bron;
    if (vanCode && !ll.reden && binnenVakje(ll, vanCode)) {
      lat = ll.lat;
      lng = ll.lng;
      bron = 'beide';
    } else if (vanCode) {
      lat = Number(vanCode.lat.toFixed(7));
      lng = Number(vanCode.lng.toFixed(7));
      bron = 'pluscode';
      // Vergelijken ook als lat/lng een decimale komma heeft (alleen hier).
      const vgl = ll.reden ? leesLatLng(latText.replace(',', '.'), lngText.replace(',', '.')) : ll;
      if (!vgl.reden) {
        const d = meters({ lat, lng }, vgl);
        if (d > AFWIJKING_MAX_METERS) result.warnings.push({ line, name, meters: Math.round(d) });
      }
    } else {
      lat = ll.lat;
      lng = ll.lng;
      bron = 'latlng';
    }
    const mp3 = get(fields, col.mp3);
    const radius = parseRadius(get(fields, col.radius));
    const poi = { lat, lng, pluscode, name, desc: cleanText(get(fields, col.desc)), radius, mp3, line, bron };
    const eerder = result.pois.find((p) => isDubbel(p, poi));
    if (eerder) {
      if (!eerder.desc && poi.desc) eerder.desc = poi.desc;
      if (!eerder.mp3 && poi.mp3) eerder.mp3 = poi.mp3;
      if (!eerder.pluscode && poi.pluscode) eerder.pluscode = poi.pluscode;
      if (!(eerder.radius > 0) && poi.radius > 0) eerder.radius = poi.radius;
      result.merged.push({ line, metLine: eerder.line, name });
      continue;
    }
    result.pois.push(poi);
  }
  return result;
}

// Pluscode en lat/lng mogen zoveel verschillen voordat er een waarschuwing
// komt (0.19.2, PC3). Een code van 10 tekens is een vakje van ± 14 m.
const AFWIJKING_MAX_METERS = 25;

// Ligt het punt in het vakje van de gedecodeerde pluscode (met wat marge
// voor afronding)?
function binnenVakje(p, vak) {
  const marge = 1e-9;
  return (
    Math.abs(p.lat - vak.lat) <= vak.latSize / 2 + marge && Math.abs(p.lng - vak.lng) <= vak.lngSize / 2 + marge
  );
}

// lat/lng uit de tekst: { lat, lng } of { reden } (waarom onbruikbaar).
function leesLatLng(latText, lngText) {
  if (latText === '' || lngText === '') return { reden: 'lat of lng ontbreekt' };
  if (/^-?\d+,\d+$/.test(latText) || /^-?\d+,\d+$/.test(lngText)) {
    return { reden: 'decimale komma in coördinaat (gebruik een punt)' };
  }
  if (!COORD_PATTERN.test(latText) || !COORD_PATTERN.test(lngText)) {
    return { reden: 'lat of lng is geen geldig getal' };
  }
  const lat = Number(latText);
  const lng = Number(lngText);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { reden: 'coördinaat buiten bereik' };
  return { lat, lng };
}

// Straal uit de kolom radius: een getal > 0 met decimale punt, anders 0.
function parseRadius(text) {
  if (!/^\d+(\.\d+)?$/.test(text)) return 0;
  const r = Number(text);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

// Dubbele POI (D1): zelfde naam en minder dan DUBBEL_MAX_METERS uit elkaar.
const DUBBEL_MAX_METERS = 5;

function isDubbel(a, b) {
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && meters(a, b) < DUBBEL_MAX_METERS;
}

// Haversine in meters.
function meters(a, b) {
  const r = (g) => (g * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371e3 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
