/**
 * osm-fallback.js
 *
 * Aanvullende zoekactie via de Overpass API (OpenStreetMap), te gebruiken
 * wanneer wikidata-search.js voor een gebied niets (of te weinig) oplevert.
 * OSM heeft doorgaans een fijnmaziger dekking van "kleine" objecten zoals
 * afzonderlijke molens, wegkruisen en veldslagplekken dan Wikidata/
 * Wikipedia, maar de meegeleverde informatie is minimaler: meestal alleen
 * een naam, geen samenvattende tekst zoals een Wikipedia-artikel.
 *
 * Gebruikt de publieke Overpass API (overpass-api.de/api/interpreter).
 * Overpass ondersteunt CORS, dus deze module werkt zowel in de browser
 * als in Node (Node 18+, native fetch), net als de andere WikiPoi-modules.
 *
 * De categorie → OSM-tagfilter-koppeling staat in poi-categories.js
 * (osmTagFiltersForKeys()) — dezelfde categorieën als voor Wikidata,
 * zodat de gebruiker niet twee keer iets hoeft te selecteren.
 *
 * Werkt zowel als CommonJS-module (Node) als los <script> in de browser.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WikiPoiOsmFallback = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const DEFAULT_TIMEOUT_MS = 25000;
  const DEFAULT_MAX_RETRIES = 1; // 1 automatische herhaling = max. 2 pogingen totaal
  const OVERPASS_QUERY_TIMEOUT_S = 25; // moet iets onder DEFAULT_TIMEOUT_MS blijven

  /**
   * Bouwt de Overpass QL-query voor een bounding box en een lijst
   * tagfiltergroepen (zoals geleverd door
   * poi-categories.js#osmTagFiltersForKeys()).
   *
   * Overpass' bbox-notatie is (zuid,west,noord,oost), d.w.z.
   * (minLat,minLng,maxLat,maxLng) — dat komt direct overeen met het
   * bbox-object van route-buffer.js#getBoundingBox().
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {Array<Array<{key:string,value:string}>>} tagFilterGroups
   * @param {object} [options]
   * @param {number} [options.timeoutSeconds=25]
   * @returns {string}
   */
  function buildOverpassQuery(bbox, tagFilterGroups, options) {
    options = options || {};
    const timeoutSeconds = options.timeoutSeconds || OVERPASS_QUERY_TIMEOUT_S;
    const bboxStr =
      bbox.minLat + ',' + bbox.minLng + ',' + bbox.maxLat + ',' + bbox.maxLng;

    const lines = ['[out:json][timeout:' + timeoutSeconds + '];', '('];

    for (const group of tagFilterGroups) {
      const tagClause = group
        .map((tag) => '["' + tag.key + '"="' + tag.value + '"]')
        .join('');
      // node én way, want zowel losse punten (bijv. een enkel wegkruis)
      // als vlakken (bijv. de omtrek van een kasteelterrein) komen voor.
      lines.push('  node' + tagClause + '(' + bboxStr + ');');
      lines.push('  way' + tagClause + '(' + bboxStr + ');');
    }

    lines.push(');');
    lines.push('out center;'); // "center" geeft ook voor ways een lat/lon terug

    return lines.join('\n');
  }

  /**
   * Zet één Overpass-element (node of way, na `out center`) om naar
   * WikiPoi's kandidaat-vorm — zoveel mogelijk gelijkvormig aan wat
   * wikidata-search.js teruggeeft, zodat de rest van de pijplijn
   * (trigger-preview.js, wikipedia-summary.js, europoi-csv.js) niet per
   * bron hoeft te onderscheiden.
   *
   * OSM-elementen hebben geen `wikipediaUrl` (tenzij de tag `wikipedia`
   * toevallig is ingevuld — dat proberen we alsnog te benutten), dus
   * `wikipedia-summary.js` zal voor de meeste OSM-resultaten een
   * `summaryError` teruggeven; de OSM-naam/beschrijving blijft dan als
   * (summiere) terugval-tekst over.
   */
  function elementToCandidate(element) {
    const tags = element.tags || {};
    const lat = element.type === 'node' ? element.lat : element.center && element.center.lat;
    const lng = element.type === 'node' ? element.lon : element.center && element.center.lon;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;

    // De `wikipedia`-tag heeft meestal het formaat "nl:Paginatitel".
    let wikipediaUrl = null;
    if (tags.wikipedia) {
      const m = /^([a-z0-9-]+):(.+)$/i.exec(tags.wikipedia);
      if (m) {
        const normalizedTitle = m[2].replace(/ /g, '_');
        wikipediaUrl = 'https://' + m[1] + '.wikipedia.org/wiki/' + encodeURIComponent(normalizedTitle);
      }
    }

    const label = tags.name || tags['name:nl'] || 'Naamloos punt (OSM)';
    const description = tags.description || tags.inscription || null;

    return {
      id: 'osm-' + element.type + '-' + element.id,
      label: label,
      description: description,
      lat: lat,
      lng: lng,
      wikipediaUrl: wikipediaUrl,
      source: 'osm',
    };
  }

  /**
   * Eén enkele poging om de Overpass-query uit te voeren, zonder
   * herhaling — analoog aan wikidata-search.js#performSingleRequest().
   */
  async function performSingleRequest(query, headers, timeoutMs) {
    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    let response;
    try {
      // Overpass verwacht de query als POST-body (niet als querystring —
      // die kan bij complexere queries te lang worden voor een GET-URL).
      response = await fetch(OVERPASS_ENDPOINT, {
        method: 'POST',
        headers: headers,
        body: 'data=' + encodeURIComponent(query),
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        'Overpass-query mislukt: HTTP ' + response.status + ' ' + response.statusText
      );
    }

    return response.json();
  }

  /**
   * Voert de Overpass-zoekopdracht uit en geeft de resultaten terug in
   * hetzelfde kandidaat-formaat als wikidata-search.js#searchWikidataBox().
   * Bij een timeout wordt de aanvraag automatisch één keer herhaald
   * (Overpass reageert, net als Wikidata, soms incidenteel traag) —
   * de aanroeper hoeft dus niet zelf handmatig opnieuw te proberen.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {Array<Array<{key:string,value:string}>>} tagFilterGroups
   * @param {object} [options]
   * @param {number} [options.timeoutMs=25000]
   * @param {number} [options.maxRetries=1] - aantal automatische herhalingen bij een timeout
   * @param {string} [options.userAgent] - alleen relevant bij server-side gebruik
   * @returns {Promise<Array>}
   */
  async function searchOverpass(bbox, tagFilterGroups, options) {
    options = options || {};
    if (!Array.isArray(tagFilterGroups) || tagFilterGroups.length === 0) {
      return []; // geen filters geselecteerd — niets te zoeken
    }

    const query = buildOverpassQuery(bbox, tagFilterGroups, options);
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxRetries =
      options.maxRetries !== undefined ? options.maxRetries : DEFAULT_MAX_RETRIES;

    const headers = { 'Content-Type': 'text/plain' };
    if (options.userAgent) {
      headers['User-Agent'] = options.userAgent;
    }

    let data;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        data = await performSingleRequest(query, headers, timeoutMs);
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const isTimeout = err.name === 'AbortError';
        const hasRetriesLeft = attempt < maxRetries;
        if (!isTimeout || !hasRetriesLeft) {
          throw err;
        }
        // Stilzwijgend opnieuw proberen bij een timeout.
      }
    }
    if (lastError) throw lastError;

    const elements = data.elements || [];

    const candidates = [];
    for (const element of elements) {
      const candidate = elementToCandidate(element);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  return {
    buildOverpassQuery,
    elementToCandidate,
    searchOverpass,
  };
});
