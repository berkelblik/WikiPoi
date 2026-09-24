/**
 * wikidata-search.js
 *
 * Zoekt Wikidata-items met een coördinaat (P625) binnen een bounding box
 * (zoals geleverd door route-buffer.js → getBoundingBox()), en die een
 * Wikipedia-artikel hebben in de gewenste taal.
 *
 * Ondersteunt twee, elkaar uitsluitende, filtermodi bovenop de basis
 * coördinaat+artikel-voorwaarde:
 *   - options.instanceOf  — "is instance-of/subclass-of één van deze QID's"
 *     (bestaande modus, bijv. voor kastelen, molens, kerken, ...)
 *   - options.hasProperty — "heeft deze eigenschap (PID)", bijv. P359
 *     ("Rijksmonument ID"). Nieuw, toegevoegd voor de "Gebouwd erfgoed"-
 *     verzamelcategorie, waar niet één klasse-QID volstaat maar een
 *     Wikidata-eigenschap het onderscheidende kenmerk is.
 * Worden beide opgegeven, dan heeft instanceOf voorrang (hasProperty wordt
 * dan genegeerd) — combineren van beide filters in één query wordt (nog)
 * niet ondersteund, was ook niet nodig voor de huidige categorieën.
 *
 * In instanceOf-modus geeft elk resultaat ook `matchedTypes` terug: de
 * QID('s) uit options.instanceOf waarlangs het item gevonden is. Zo kan de
 * aanroeper de QID's van meerdere categorieën in ÉÉN verzoek combineren en
 * daarna zelf per item de categorie bepalen (gemeten sept. 2026: één
 * verzoek voor 4 categorieën ± 3× sneller dan 4 losse verzoeken).
 *
 * Opnieuw proberen gebeurt bij een timeout, bij HTTP 429/5xx (de publieke
 * service geeft bij drukte geregeld 502/503/504) en bij een verbroken
 * verbinding (fetch gooit dan een TypeError, bijv. "terminated").
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
  // BELANGRIJK: beide toewijzingen gebeuren hier onvoorwaardelijk, niet als
  // elkaars if/else-tak. Bundelaars zoals Vite/Rollup herkennen automatisch
  // module.exports-syntax en injecteren daarom soms zelf een (nep-)`module`-
  // object voor CommonJS-compatibiliteit, ook wanneer dit bestand via een
  // ESM side-effect-import wordt binnengehaald. Stond de root-toewijzing in
  // een "else"-tak, dan zou hij worden overgeslagen zodra die nep-module
  // aanwezig is, en zou root.WikiPoiWikidataSearch undefined blijven in de
  // gebouwde app — dezelfde bug die eerder in europoi-csv.js werd gevonden.
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiWikidataSearch = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
  const DEFAULT_LANGUAGE = 'nl';
  const DEFAULT_LIMIT = 300;
  const DEFAULT_TIMEOUT_MS = 40000;
  const DEFAULT_MAX_RETRIES = 2; // 2 automatische herhalingen = max. 3 pogingen totaal
  const RETRY_BACKOFF_MS = 3000; // korte pauze tussen pogingen, oplopend per poging
  // HTTP-statussen waarbij opnieuw proberen zin heeft: te veel verzoeken
  // (429) en tijdelijke serverproblemen (5xx). Andere fouten (bijv. 400 bij
  // een ongeldige query) worden meteen doorgegeven.
  const RETRYABLE_HTTP_STATUS = [429, 500, 502, 503, 504];

  /**
   * Bouwt de SPARQL-query voor een bounding-box-zoekopdracht.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {object} [options]
   * @param {string} [options.language='nl'] - taalcode voor label/artikel
   * @param {number} [options.limit=500] - max. aantal resultaten
   * @param {string[]} [options.instanceOf] - optionele lijst Wikidata-QIDs
   *   (bijv. ['Q570116','Q2319498']) om te filteren op "instance of / subclass
   *   of" een van deze typen (bijv. monument, bezienswaardigheid). Heeft
   *   voorrang op options.hasProperty als beide zijn opgegeven.
   * @param {string} [options.hasProperty] - optionele Wikidata-property-ID
   *   (bijv. 'P359' voor "Rijksmonument ID") om te filteren op "heeft deze
   *   eigenschap". Wordt genegeerd als options.instanceOf ook is opgegeven.
   *   De waarde van de eigenschap wordt, indien aanwezig, meegenomen in het
   *   resultaat als `propertyValue` (zie parseSparqlResults()).
   * @param {boolean} [options.optimizerHint=false] - zet de queryoptimizer
   *   van de server uit (hint:Query hint:optimizer "None"), zodat de stappen
   *   in de geschreven volgorde worden uitgevoerd. Metingen (sept. 2026)
   *   waren wisselend: soms veel sneller, soms trager. Daarom standaard uit.
   * @returns {string} SPARQL-querytekst
   */
  function buildBoxQuery(bbox, options) {
    options = options || {};
    const lang = options.language || DEFAULT_LANGUAGE;
    const limit = options.limit || DEFAULT_LIMIT;
    const instanceOf = options.instanceOf;
    const hasProperty = options.hasProperty;

    let typeClause = '';
    let propertyValueSelect = '';
    if (Array.isArray(instanceOf) && instanceOf.length > 0) {
      // Dubbele QID's weglaten (twee categorieën kunnen dezelfde QID delen).
      const uniqueQids = Array.from(new Set(instanceOf));
      const values = uniqueQids.map((id) => 'wd:' + id).join(' ');
      typeClause =
        '?item wdt:P31/wdt:P279* ?type .\n  VALUES ?type { ' + values + ' }\n  ';
      // ?type meegeven, zodat elk resultaat weet via welke QID het gevonden
      // is (matchedTypes, zie parseSparqlResults()).
      propertyValueSelect = ' ?type';
    } else if (hasProperty) {
      typeClause = '?item wdt:' + hasProperty + ' ?propertyValue .\n  ';
      propertyValueSelect = ' ?propertyValue';
    }

    // Let op: wikibase:box verwacht cornerWest/cornerEast als "Point(lng lat)"
    // (WKT-volgorde is lng/lat, dus andersom dan de gebruikelijke lat/lng
    // volgorde in de rest van deze codebase — bewust hier lokaal gehouden
    // om verwarring elders te voorkomen).
    const hintClause = options.optimizerHint ? '  hint:Query hint:optimizer "None" .\n' : '';

    return (
      'SELECT ?item ?itemLabel ?itemDescription ?location ?article' +
      propertyValueSelect +
      ' WHERE {\n' +
      hintClause +
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
   * @returns {Array<{id:string,label:string,description:?string,lat:number,lng:number,wikipediaUrl:?string,propertyValue:?string,matchedTypes:?string[]}>}
   *   `propertyValue` is alleen aanwezig als de query met options.hasProperty
   *   is opgebouwd en de binding een waarde voor ?propertyValue bevat.
   *   `matchedTypes` is alleen aanwezig als de query met options.instanceOf
   *   is opgebouwd: de QID uit die lijst waarlangs dit item gevonden is.
   *   Eén item kan dan meerdere keren voorkomen (één keer per QID);
   *   dedupeById() voegt de matchedTypes van zulke dubbelen samen.
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

      const result = {
        id: id,
        label: b.itemLabel ? b.itemLabel.value : id || 'Onbekend',
        description: b.itemDescription ? b.itemDescription.value : null,
        lat: point.lat,
        lng: point.lng,
        wikipediaUrl: b.article ? b.article.value : null,
      };
      if (b.propertyValue && b.propertyValue.value !== undefined) {
        result.propertyValue = b.propertyValue.value;
      }
      if (b.type && b.type.value) {
        const typeUrl = b.type.value; // http://www.wikidata.org/entity/Q16970
        result.matchedTypes = [typeUrl.substring(typeUrl.lastIndexOf('/') + 1)];
      }
      results.push(result);
    }
    return results;
  }

  /**
   * Verwijdert duplicaten op basis van Wikidata-id (kan voorkomen als
   * meerdere zoekopdrachten samengevoegd worden, bijv. bij een lange route
   * die in meerdere bbox-stukken wordt opgedeeld, of als één item via
   * meerdere QID's uit options.instanceOf gevonden is). Het eerste item
   * blijft; hebben de dubbelen `matchedTypes`, dan worden die samengevoegd
   * in het behouden item (zonder dubbele QID's).
   */
  function dedupeById(items) {
    const keptById = new Map();
    const out = [];
    for (const it of items) {
      if (!it.id) continue;
      const kept = keptById.get(it.id);
      if (!kept) {
        const copy = Object.assign({}, it);
        if (Array.isArray(it.matchedTypes)) copy.matchedTypes = it.matchedTypes.slice();
        keptById.set(it.id, copy);
        out.push(copy);
        continue;
      }
      if (Array.isArray(it.matchedTypes)) {
        if (!Array.isArray(kept.matchedTypes)) kept.matchedTypes = [];
        for (const t of it.matchedTypes) {
          if (!kept.matchedTypes.includes(t)) kept.matchedTypes.push(t);
        }
      }
    }
    return out;
  }

  /**
   * Haversine-afstand in meters tussen twee {lat,lng}-punten. Lokaal
   * gehouden zodat deze module geen afhankelijkheid van route-buffer.js of
   * osm-fallback.js krijgt.
   */
  function haversineMeters(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function hasCoords(it) {
    return it && typeof it.lat === 'number' && typeof it.lng === 'number';
  }

  /**
   * Voegt Wikidata-items samen die (vrijwel) op dezelfde plek liggen maar
   * verschillende QID's hebben — bijv. één gebouw met een item voor het
   * gebouw zelf én een item voor een latere functie. Praktijkgeval
   * Zutphen: "Broederenkerk" en "Waalse kerk" zijn hetzelfde pand, met
   * exact dezelfde coördinaat. Zonder samenvoegen zou EuroPoi op die plek
   * twee keer aankondigen.
   *
   * Drempel standaard 10m: krap genoeg om echt verschillende objecten
   * vlak naast elkaar (kerk + beeld ervoor) apart te laten, ruim genoeg
   * voor kleine coördinaatverschillen tussen twee items van één gebouw.
   *
   * Welke blijft: het item met een Wikipedia-koppeling (levert straks de
   * samenvatting); hebben ze die allebei of geen van beide, dan het eerst
   * gevonden item. Het behouden item houdt zijn plek in de lijst.
   * Met mergeLabels (standaard aan) komt de naam van de afgevallen
   * item(s) tussen haakjes achter de naam, bijv. "Broederenkerk (Waalse
   * kerk)"; `mergedFrom` bewaart id + naam van de afgevallen items.
   * Items zonder coördinaten worden ongemoeid doorgegeven.
   *
   * @param {Array} items
   * @param {{thresholdMeters?:number, mergeLabels?:boolean}} [options]
   * @returns {Array}
   */
  function dedupeByProximity(items, options) {
    const opts = options || {};
    const threshold =
      typeof opts.thresholdMeters === 'number' ? opts.thresholdMeters : 10;
    const mergeLabels = opts.mergeLabels !== false;

    // Clusters: { kept, others: [] } in volgorde van eerste voorkomen.
    const clusters = [];
    const passthrough = []; // {index, item} voor items zonder coördinaten
    (items || []).forEach((it, index) => {
      if (!hasCoords(it)) {
        passthrough.push({ index: index, item: it });
        return;
      }
      const cluster = clusters.find(
        (c) => haversineMeters(c.kept, it) <= threshold
      );
      if (!cluster) {
        clusters.push({ index: index, kept: it, others: [] });
        return;
      }
      if (!cluster.kept.wikipediaUrl && it.wikipediaUrl) {
        cluster.others.push(cluster.kept);
        cluster.kept = it;
      } else {
        cluster.others.push(it);
      }
    });

    const merged = clusters.map((c) => {
      if (c.others.length === 0) return { index: c.index, item: c.kept };
      const item = Object.assign({}, c.kept, {
        mergedFrom: c.others.map((o) => ({ id: o.id, label: o.label })),
      });
      if (mergeLabels) {
        const base = String(c.kept.label || '').trim();
        const extra = [];
        c.others.forEach((o) => {
          const l = String(o.label || '').trim();
          if (
            l &&
            l.toLowerCase() !== base.toLowerCase() &&
            !extra.some((e) => e.toLowerCase() === l.toLowerCase())
          ) {
            extra.push(l);
          }
        });
        if (extra.length > 0) item.label = base + ' (' + extra.join(', ') + ')';
      }
      return { index: c.index, item: item };
    });

    return merged
      .concat(passthrough)
      .sort((a, b) => a.index - b.index)
      .map((x) => x.item);
  }

  /**
   * Eén enkele poging om de bounding-box-query uit te voeren — zonder
   * herhaling. Los gehouden van searchWikidataBox() zodat de
   * herhalingslogica daar overzichtelijk blijft.
   */
  async function performSingleRequest(url, headers, timeoutMs) {
    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
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
      const err = new Error(
        'Wikidata-query mislukt: HTTP ' + response.status + ' ' + response.statusText
      );
      err.status = response.status;
      err.retryable = RETRYABLE_HTTP_STATUS.includes(response.status);
      throw err;
    }

    return response.json();
  }

  /**
   * Bepaalt of een mislukte poging opnieuw geprobeerd mag worden:
   * timeout (AbortError), HTTP 429/5xx (err.retryable) of een verbroken
   * verbinding (TypeError uit fetch, bijv. "fetch failed" of "terminated").
   */
  function isRetryableError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    if (err.retryable === true) return true;
    if (err.name === 'TypeError') return true;
    if (err.name === 'SyntaxError') return true; // afgebroken/onvolledige JSON-respons
    return false;
  }

  /**
   * Voert de bounding-box-zoekopdracht daadwerkelijk uit tegen de publieke
   * Wikidata Query Service. Bij een timeout, HTTP 429/5xx of een verbroken
   * verbinding (de service is soms incidenteel traag of overbelast) wordt de
   * aanvraag automatisch herhaald voordat de fout wordt doorgegeven — de
   * aanroeper hoeft dus niet zelf handmatig opnieuw te proberen.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {object} [options] - zie buildBoxQuery(); plus:
   * @param {number} [options.timeoutMs=40000]
   * @param {number} [options.maxRetries=2] - aantal automatische herhalingen
   *   bij een timeout, HTTP 429/5xx of verbroken verbinding
   * @param {string} [options.userAgent] - alleen relevant bij server-side gebruik
   * @returns {Promise<Array>} kandidaat-POI's, zie parseSparqlResults()
   */
  async function searchWikidataBox(bbox, options) {
    options = options || {};
    const query = buildBoxQuery(bbox, options);
    const url =
      WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const maxRetries =
      options.maxRetries !== undefined ? options.maxRetries : DEFAULT_MAX_RETRIES;

    const headers = { Accept: 'application/sparql-results+json' };
    if (options.userAgent) {
      headers['User-Agent'] = options.userAgent; // werkt alleen server-side; browsers negeren dit
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const data = await performSingleRequest(url, headers, timeoutMs);
        // Eén Wikidata-item kan meerdere keren in de ruwe SPARQL-respons
        // voorkomen — bijv. als het via meerdere routes in de klasse-
        // hiërarchie aan het instanceOf-filter voldoet. Dedupliceren
        // voorkomt dat de aanroeper (en uiteindelijk de CSV) hetzelfde
        // punt dubbel krijgt.
        return dedupeById(parseSparqlResults(data));
      } catch (err) {
        lastError = err;
        const hasRetriesLeft = attempt < maxRetries;
        if (!isRetryableError(err) || !hasRetriesLeft) {
          throw err;
        }
        // Korte, oplopende pauze vóór de volgende poging — geeft een
        // tijdelijk drukke periode bij Wikidata de kans om te zakken,
        // in plaats van meteen weer tegen dezelfde traagheid aan te lopen.
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
    throw lastError;
  }

  return {
    buildBoxQuery,
    parseWktPoint,
    parseSparqlResults,
    dedupeById,
    dedupeByProximity,
    searchWikidataBox,
  };
});
