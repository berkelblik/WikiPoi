/**
 * wikidata-search.js
 *
 * Zoekt Wikidata-items met een coördinaat (P625) binnen een bounding box
 * (zoals geleverd door route-buffer.js → getBoundingBox()), en die een
 * Wikipedia-artikel hebben in de gewenste taal.
 *
 * Gebruikt de "wikibase:box"-geoservice van de publieke Wikidata Query
 * Service (query.wikidata.org/sparql). Deze service ondersteunt CORS, dus
 * de module werkt zowel in de browser als in Node (Node 18+, native
 * fetch).
 *
 * BELANGRIJK — User-Agent:
 * Wikimedia vraagt bij programmatische toegang een beschrijvende
 * User-Agent-header (zie https://meta.wikimedia.org/wiki/User-Agent_policy).
 * In de browser kan een script de User-Agent-header niet zelf zetten (die
 * wordt door de browser bepaald); dat is voor WikiPoi als browsergebaseerde
 * tool geen probleem — de policy is vooral bedoeld voor server-naar-server
 * bots. Mocht deze module ooit vanuit Node/een server draaien, geef dan
 * via options.userAgent een beschrijvende waarde mee.
 *
 * Werkt zowel als CommonJS-module (Node) als los <script> in de browser,
 * naar analogie van europoi-csv.js en route-buffer.js.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WikiPoiWikidataSearch = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
  const DEFAULT_LANGUAGE = 'nl';
  const DEFAULT_LIMIT = 300;
  const DEFAULT_TIMEOUT_MS = 20000;

  /**
   * Bouwt de SPARQL-query voor een bounding-box-zoekopdracht.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {object} [options]
   * @param {string} [options.language='nl'] - taalcode voor label/artikel
   * @param {number} [options.limit=500] - max. aantal resultaten
   * @param {string[]} [options.instanceOf] - optionele lijst Wikidata-QIDs
   *   (bijv. ['Q570116','Q2319498']) om te filteren op "instance of / subclass
   *   of" een van deze typen (bijv. monument, bezienswaardigheid). Zonder
   *   deze optie worden alle items met coördinaat + artikel meegenomen.
   * @returns {string} SPARQL-querytekst
   */
  function buildBoxQuery(bbox, options) {
    options = options || {};
    const lang = options.language || DEFAULT_LANGUAGE;
    const limit = options.limit || DEFAULT_LIMIT;
    const instanceOf = options.instanceOf;

    let typeClause = '';
    if (Array.isArray(instanceOf) && instanceOf.length > 0) {
      const values = instanceOf.map((id) => 'wd:' + id).join(' ');
      typeClause =
        '?item wdt:P31/wdt:P279* ?type .\n  VALUES ?type { ' + values + ' }\n  ';
    }

    // Let op: wikibase:box verwacht cornerWest/cornerEast als "Point(lng lat)"
    // (WKT-volgorde is lng/lat, dus andersom dan de gebruikelijke lat/lng
    // volgorde in de rest van deze codebase — bewust hier lokaal gehouden
    // om verwarring elders te voorkomen).
    return (
      'SELECT ?item ?itemLabel ?itemDescription ?location ?article WHERE {\n' +
      '  SERVICE wikibase:box {\n' +
      '    ?item wdt:P625 ?location .\n' +
      '    bd:serviceParam wikibase:cornerWest "Point(' +
      bbox.minLng +
      ' ' +
      bbox.minLat +
      ')"^^geo:wktLiteral .\n' +
      '    bd:serviceParam wikibase:cornerEast "Point(' +
      bbox.maxLng +
      ' ' +
      bbox.maxLat +
      ')"^^geo:wktLiteral .\n' +
      '  }\n' +
      '  ?article schema:about ?item ;\n' +
      '           schema:isPartOf <https://' +
      lang +
      '.wikipedia.org/> .\n' +
      '  ' +
      typeClause +
      'SERVICE wikibase:label { bd:serviceParam wikibase:language "' +
      lang +
      ',en". }\n' +
      '}\n' +
      'LIMIT ' +
      limit
    );
  }

  /**
   * Parseert een WKT "Point(lng lat)"-string naar {lat, lng}.
   */
  function parseWktPoint(wkt) {
    if (!wkt) return null;
    const m = /Point\(\s*([-0-9.]+)\s+([-0-9.]+)\s*\)/i.exec(wkt);
    if (!m) return null;
    return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }

  /**
   * Zet een ruwe SPARQL-JSON-respons (results.bindings) om naar een
   * eenvoudige, voor WikiPoi bruikbare array van kandidaat-POI's.
   * Los van de fetch-aanroep gehouden zodat dit ook zonder netwerktoegang
   * te testen is (bijv. met een opgeslagen voorbeeldrespons).
   *
   * @param {object} sparqlJson - de gedecodeerde JSON-respons
   * @returns {Array<{id:string,label:string,description:?string,lat:number,lng:number,wikipediaUrl:?string}>}
   */
  function parseSparqlResults(sparqlJson) {
    const bindings =
      (sparqlJson && sparqlJson.results && sparqlJson.results.bindings) || [];

    const results = [];
    for (const b of bindings) {
      const point =
        b.location && b.location.value ? parseWktPoint(b.location.value) : null;
      if (!point) continue; // zonder coördinaat kunnen we niks met dit item

      const itemUrl = b.item && b.item.value; // http://www.wikidata.org/entity/Q123
      const id = itemUrl ? itemUrl.substring(itemUrl.lastIndexOf('/') + 1) : null;

      results.push({
        id: id,
        label: b.itemLabel ? b.itemLabel.value : id || 'Onbekend',
        description: b.itemDescription ? b.itemDescription.value : null,
        lat: point.lat,
        lng: point.lng,
        wikipediaUrl: b.article ? b.article.value : null,
      });
    }
    return results;
  }

  /**
   * Verwijdert duplicaten op basis van Wikidata-id (kan voorkomen als
   * meerdere zoekopdrachten samengevoegd worden, bijv. bij een lange route
   * die in meerdere bbox-stukken wordt opgedeeld).
   */
  function dedupeById(items) {
    const seen = new Set();
    const out = [];
    for (const it of items) {
      if (!it.id || seen.has(it.id)) continue;
      seen.add(it.id);
      out.push(it);
    }
    return out;
  }

  /**
   * Voert de bounding-box-zoekopdracht daadwerkelijk uit tegen de publieke
   * Wikidata Query Service.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {object} [options] - zie buildBoxQuery(); plus:
   * @param {number} [options.timeoutMs=20000]
   * @param {string} [options.userAgent] - alleen relevant bij server-side gebruik
   * @returns {Promise<Array>} kandidaat-POI's, zie parseSparqlResults()
   */
  async function searchWikidataBox(bbox, options) {
    options = options || {};
    const query = buildBoxQuery(bbox, options);
    const url =
      WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const headers = { Accept: 'application/sparql-results+json' };
    if (options.userAgent) {
      headers['User-Agent'] = options.userAgent; // werkt alleen server-side; browsers negeren dit
    }

    let response;
    try {
      response = await fetch(url, {
        headers: headers,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        'Wikidata-query mislukt: HTTP ' + response.status + ' ' + response.statusText
      );
    }

    const data = await response.json();
    // Eén Wikidata-item kan meerdere keren in de ruwe SPARQL-respons
    // voorkomen — bijv. als het via meerdere routes in de klasse-
    // hiërarchie aan het instanceOf-filter voldoet. Dedupliceren
    // voorkomt dat de aanroeper (en uiteindelijk de CSV) hetzelfde punt
    // dubbel krijgt.
    return dedupeById(parseSparqlResults(data));
  }

  return {
    buildBoxQuery,
    parseWktPoint,
    parseSparqlResults,
    dedupeById,
    searchWikidataBox,
  };
});
