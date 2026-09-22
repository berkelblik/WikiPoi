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
  // BELANGRIJK: beide toewijzingen gebeuren hier onvoorwaardelijk, niet als
  // elkaars if/else-tak — zie europoi-csv.js, wikidata-search.js en
  // route-buffer.js voor de achtergrond van deze fix (Vite/Rollup
  // injecteert soms een nep-`module`-object voor CommonJS-compatibiliteit,
  // waardoor een "else"-tak met de root-toewijzing wordt overgeslagen).
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiOsmFallback = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const DEFAULT_TIMEOUT_MS = 40000;
  const DEFAULT_MAX_RETRIES = 2; // 2 automatische herhalingen = max. 3 pogingen totaal
  const RETRY_BACKOFF_MS = 3000; // korte pauze tussen pogingen, oplopend per poging
  const OVERPASS_QUERY_TIMEOUT_S = 38; // moet iets onder DEFAULT_TIMEOUT_MS blijven

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
   * @param {Array<Array<{key:string,value?:string}>>} tagFilterGroups - een
   *   tag zonder `value` (of met `value: '*'`) is een "aanwezig, ongeacht
   *   waarde"-filter, bijv. { key: 'ref:rce' } voor "heeft een RCE-nummer,
   *   welk nummer dan ook" — nodig omdat rijksmonumenten in OSM een uniek
   *   ref:rce-nummer per pand hebben, niet een vaste waarde.
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
        .map((tag) => {
          // Geen value (of expliciet '*') ⇒ presence-filter: Overpass'
          // ["key"]-notatie matcht de tag ongeacht de waarde.
          const isPresenceOnly =
            tag.value === undefined || tag.value === null || tag.value === '*';
          return isPresenceOnly
            ? '["' + tag.key + '"]'
            : '["' + tag.key + '"="' + tag.value + '"]';
        })
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
   *
   * `wikidataId` (uit de `wikidata`-tag, bijv. "Q12345") wordt apart van
   * `wikipediaUrl` bijgehouden — bedoeld voor filterAndDedupeOsmCandidates()
   * hieronder, dat hierop dedupliceert tegen wikidata-search.js-resultaten
   * (Test 3). Een QID-vergelijking is robuuster dan een URL-vergelijking
   * (taalvarianten, trailing slashes, encoding-verschillen spelen dan niet
   * mee).
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

    // De `wikidata`-tag bevat, indien aanwezig, rechtstreeks de QID
    // (bijv. "Q12345") — geen verdere parsing nodig, in tegenstelling tot
    // de `wikipedia`-tag hierboven.
    const wikidataId = tags.wikidata || null;

    const label = tags.name || tags['name:nl'] || 'Naamloos punt (OSM)';
    const description = tags.description || tags.inscription || null;

    return {
      id: 'osm-' + element.type + '-' + element.id,
      label: label,
      description: description,
      lat: lat,
      lng: lng,
      wikipediaUrl: wikipediaUrl,
      wikidataId: wikidataId,
      source: 'osm',
    };
  }

  /**
   * Haalt uit een Wikipedia-artikel-URL een genormaliseerde paginatitel,
   * bedoeld om twee URL's die naar hetzelfde artikel verwijzen (maar met
   * kleine notatieverschillen: underscore vs. spatie, hoofdlettergebruik,
   * URL-encoding) als gelijk te herkennen.
   *
   * BEPERKING: een Wikidata-artikeltitel mét ontdubbelingstoevoeging
   * (bijv. "Sint Walburgiskerk (Zutphen)") matcht NIET met een OSM
   * `wikipedia`-tag die naar de kale titel "Sint Walburgiskerk" verwijst —
   * dat blijven twee verschillende strings. Dit vangt dus het gangbare
   * geval (identieke titel in beide bronnen), niet elk edge-case.
   *
   * @param {?string} url
   * @returns {?string} kleine letters, spaties i.p.v. underscores, of null
   */
  function normalizeWikipediaTitle(url) {
    if (!url) return null;
    const m = /\/wiki\/([^#?]+)/.exec(url);
    if (!m) return null;
    let title = m[1];
    try {
      title = decodeURIComponent(title);
    } catch (e) {
      // ongeldige encoding — val terug op de ruwe (nog steeds bruikbare) tekst
    }
    return title.replace(/_/g, ' ').trim().toLowerCase();
  }

  /**
   * Berekent de afstand tussen twee coördinaten in meters (Haversine-
   * formule). Gebruikt door filterAndDedupeOsmCandidates() om OSM- en
   * Wikidata-kandidaten op nagenoeg dezelfde locatie te herkennen als
   * duplicaat, ook wanneer titel- of QID-matching niet aanslaat (bijv.
   * door een koppelteken- of ontdubbelingsverschil in de Wikipedia-titel).
   *
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number} afstand in meters
   */
  function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
    const EARTH_RADIUS_METERS = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
  }

  // Standaarddrempel voor "nagenoeg dezelfde locatie" in
  // filterAndDedupeOsmCandidates() — te overschrijven via
  // options.coordinateThresholdMeters. Bewust klein gehouden: groter
  // vergroot het risico dat een apart object vlak naast een Wikidata-POI
  // (bijv. een monument naast een kerk) onterecht als duplicaat wordt
  // gezien.
  const DEFAULT_COORDINATE_DEDUPE_THRESHOLD_METERS = 25;

  /**
   * Filtert en dedupliceert OSM-kandidaten t.o.v. reeds gevonden
   * Wikidata-kandidaten (Test 3 / wikidata-search.js#searchWikidataBox()).
   * Een OSM-kandidaat wordt overgeslagen zodra minstens één van deze drie
   * criteria een match geeft met een Wikidata-kandidaat:
   *
   *   1. `wikidataId` (OSM-tag `wikidata=*`) komt overeen met het `id`-veld
   *      (QID) van een Wikidata-kandidaat — de betrouwbaarste match.
   *   2. De genormaliseerde Wikipedia-paginatitel (exacte match, zie
   *      normalizeWikipediaTitle()) komt overeen.
   *   3. De coördinaten liggen binnen `options.coordinateThresholdMeters`
   *      (standaard 25m, zie haversineDistanceMeters()) van elkaar — vangt
   *      het geval op waarbij 1 en 2 net niet matchen door een koppelteken-
   *      of ontdubbelingsverschil in de titel (bijv. Wikidata's
   *      "Sint-Walburgiskerk (Zutphen)" vs. OSM's "Sint Walburgiskerk"),
   *      maar het overduidelijk om dezelfde locatie gaat.
   *
   * Daarnaast wordt een OSM-kandidaat zónder `wikidataId`, zónder
   * `wikipediaUrl` én zónder `description` altijd overgeslagen — een
   * "leeg" punt levert geen bruikbare tekst op voor de app.
   *
   * Een OSM-kandidaat die op geen van deze manieren matcht, blijft
   * behouden — dat is het vangnet-scenario (Wikidata-item zonder
   * coördinaat, of buiten het instanceOf/hasProperty-filter van de
   * gekozen categorie) waarom Test 5 naast Test 3 bestaat.
   *
   * @param {Array<{wikidataId:?string,wikipediaUrl:?string,description:?string,lat:number,lng:number}>} osmCandidates
   *   - resultaat van searchOverpass() / elementToCandidate()
   * @param {Array<{id:string,wikipediaUrl:?string,lat:number,lng:number}>} wikidataCandidates -
   *   resultaat van wikidata-search.js#searchWikidataBox() (of
   *   #dedupeById()); `id` is de kale QID, bijv. "Q12345"
   * @param {object} [options]
   * @param {number} [options.coordinateThresholdMeters=25]
   * @returns {Array} de gefilterde/gededupliceerde OSM-kandidatenlijst
   */
  function filterAndDedupeOsmCandidates(osmCandidates, wikidataCandidates, options) {
    options = options || {};
    const coordinateThresholdMeters =
      options.coordinateThresholdMeters !== undefined
        ? options.coordinateThresholdMeters
        : DEFAULT_COORDINATE_DEDUPE_THRESHOLD_METERS;

    const wikidataList = wikidataCandidates || [];
    const knownQids = new Set(wikidataList.map((c) => c.id).filter(Boolean));
    const knownTitles = new Set(
      wikidataList.map((c) => normalizeWikipediaTitle(c.wikipediaUrl)).filter(Boolean)
    );

    return (osmCandidates || []).filter((c) => {
      if (c.wikidataId && knownQids.has(c.wikidataId)) {
        return false; // match 1: QID
      }
      const osmTitle = normalizeWikipediaTitle(c.wikipediaUrl);
      if (osmTitle && knownTitles.has(osmTitle)) {
        return false; // match 2: exacte Wikipedia-titel
      }
      if (typeof c.lat === 'number' && typeof c.lng === 'number') {
        const isNearKnownWikidataPoint = wikidataList.some((wd) => {
          if (typeof wd.lat !== 'number' || typeof wd.lng !== 'number') return false;
          return (
            haversineDistanceMeters(c.lat, c.lng, wd.lat, wd.lng) <= coordinateThresholdMeters
          );
        });
        if (isNearKnownWikidataPoint) {
          return false; // match 3: nagenoeg dezelfde coördinaten
        }
      }
      const hasUsableContent = !!(c.wikidataId || c.wikipediaUrl || c.description);
      return hasUsableContent; // "leeg" punt zonder wiki-koppeling/tekst overslaan
    });
  }

  /**
   * Bepaalt of een HTTP-statuscode een TIJDELIJK serverprobleem
   * aanduidt, waarbij opnieuw proberen zinvol is (de server was even
   * overbelast of niet bereikbaar, niet per se blijvend "nee").
   * 502 (Bad Gateway), 503 (Service Unavailable) en 504 (Gateway
   * Timeout) vallen hieronder. Een 4xx-fout (zoals de eerder
   * geconstateerde 403 Access blocked) is típisch een permanente
   * afwijzing en wordt hier bewust NIET als herhaalbaar beschouwd.
   *
   * @param {number} status
   * @returns {boolean}
   */
  function isRetryableHttpStatus(status) {
    return status === 502 || status === 503 || status === 504;
  }

  /**
   * Eén enkele poging om de Overpass-query uit te voeren, zonder
   * herhaling — analoog aan wikidata-search.js#performSingleRequest().
   * Bij een HTTP-foutstatus wordt de statuscode op de gegooide Error
   * gezet (err.status), zodat searchOverpass() kan bepalen of de fout
   * herhaalbaar is (zie isRetryableHttpStatus() hierboven).
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
      const err = new Error(
        'Overpass-query mislukt: HTTP ' + response.status + ' ' + response.statusText
      );
      err.status = response.status;
      throw err;
    }

    return response.json();
  }

  /**
   * Voert de Overpass-zoekopdracht uit en geeft de resultaten terug in
   * hetzelfde kandidaat-formaat als wikidata-search.js#searchWikidataBox().
   * Bij een timeout ÓF een tijdelijke serverfout (HTTP 502/503/504, zie
   * isRetryableHttpStatus()) wordt de aanvraag automatisch herhaald —
   * de aanroeper hoeft dus niet zelf handmatig opnieuw te proberen. Een
   * niet-herhaalbare fout (bijv. HTTP 403, of geen pogingen meer over)
   * wordt gewoon meteen doorgegeven.
   *
   * ACHTERGROND (17 sept. 2026): tot deze wijziging werd alleen een
   * timeout (AbortError) als herhaalbaar herkend; een HTTP 504 die
   * tijdens live testen optrad, werd daardoor als harde fout doorgegeven
   * en liet de hele pijplijn-run crashen, ook al was de oorzaak (een
   * tijdelijk overbelaste publieke Overpass-server) net zo transiënt als
   * een timeout.
   *
   * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bbox
   * @param {Array<Array<{key:string,value:string}>>} tagFilterGroups
   * @param {object} [options]
   * @param {number} [options.timeoutMs=25000]
   * @param {number} [options.maxRetries=1] - aantal automatische herhalingen bij een timeout/5xx
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
        const isRetryableServerError = typeof err.status === 'number' && isRetryableHttpStatus(err.status);
        const isRetryable = isTimeout || isRetryableServerError;
        const hasRetriesLeft = attempt < maxRetries;
        if (!isRetryable || !hasRetriesLeft) {
          throw err;
        }
        // Korte, oplopende pauze vóór de volgende poging, zelfde reden
        // als in wikidata-search.js.
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS * (attempt + 1)));
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
    filterAndDedupeOsmCandidates,
    haversineDistanceMeters,
    normalizeWikipediaTitle,
    isRetryableHttpStatus,
    searchOverpass,
  };
});