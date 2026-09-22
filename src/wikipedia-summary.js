/**
 * wikipedia-summary.js
 *
 * Haalt voor een Wikipedia-URL (zoals teruggegeven door wikidata-search.js
 * als `wikipediaUrl`) de samenvatting op via de publieke Wikipedia REST API
 * (`/api/rest_v1/page/summary/...`), en verkort die desgewenst tot een
 * paar zinnen — geschikt om als audio-tekst in EuroPoi te gebruiken.
 *
 * De REST API ondersteunt CORS, dus deze module werkt zowel in de browser
 * als in Node (Node 18+, native fetch), net als route-buffer.js en
 * wikidata-search.js.
 *
 * Werkt zowel als CommonJS-module (Node) als los <script> in de browser.
 */

(function (root, factory) {
  // BELANGRIJK: beide toewijzingen zijn hier onvoorwaardelijk (twee losse
  // `if`-blokken), NIET als `if`/`else if`. Vite/Rollup detecteert
  // automatisch `module.exports`-syntax en injecteert soms zelf een nep-
  // `module`-object voor CommonJS-interop, ook bij een ESM side-effect-
  // import — waardoor een `else if (typeof window !== 'undefined')`-tak
  // stilzwijgend wordt overgeslagen en window.WikiPoiWikipediaSummary
  // undefined blijft. Zie europoi-csv.js / wikidata-search.js /
  // route-buffer.js / osm-fallback.js voor dezelfde fix.
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (typeof window !== 'undefined') {
    window.WikiPoiWikipediaSummary = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_MAX_SENTENCES = 3;
  const DEFAULT_CONCURRENCY = 4;

  /**
   * Haalt taalcode en paginatitel uit een Wikipedia-URL, bijv.
   * "https://nl.wikipedia.org/wiki/Ontzet_van_Lochem" →
   * { lang: 'nl', title: 'Ontzet_van_Lochem' }.
   *
   * @param {string} wikipediaUrl
   * @returns {{lang:string, title:string}|null} null als de URL niet
   *   herkend wordt als een Wikipedia-paginalink
   */
  function parseWikipediaUrl(wikipediaUrl) {
    if (!wikipediaUrl) return null;
    const m = /^https?:\/\/([a-z0-9-]+)\.wikipedia\.org\/wiki\/([^?#]+)/i.exec(
      wikipediaUrl
    );
    if (!m) return null;
    return { lang: m[1], title: decodeURIComponent(m[2]) };
  }

  /**
   * Bouwt de REST-API-URL voor de /page/summary/-endpoint.
   */
  function buildSummaryEndpoint(lang, title) {
    // De titel moet met onderstrepingstekens (zoals in de wiki-URL) en
    // vervolgens URL-encoded worden; spaties worden dus eerst weer naar
    // "_" omgezet voor het geval een titel als losse tekst is aangeleverd.
    const normalizedTitle = title.replace(/ /g, '_');
    return (
      'https://' +
      lang +
      '.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(normalizedTitle)
    );
  }

  /**
   * Verkort platte tekst tot de eerste `maxSentences` zinnen. Eenvoudige,
   * dependency-vrije zinsdetectie: splitst op een punt/uitroepteken/
   * vraagteken gevolgd door een spatie en een hoofdletter (of het einde
   * van de tekst). Dit is geen perfecte NLP-zinsdetectie (jaartallen als
   * "22 sept." kunnen in theorie verkeerd breken), maar voor korte
   * encyclopedische samenvattingen in de praktijk ruim voldoende.
   *
   * @param {string} text
   * @param {number} [maxSentences=3]
   * @returns {string}
   */
  function truncateToSentences(text, maxSentences) {
    if (!text) return '';
    maxSentences = maxSentences || DEFAULT_MAX_SENTENCES;

    const sentences = text.match(/[^.!?]+[.!?]+(?=\s+[A-ZÀ-ÖØ-Þ]|\s*$)/g);
    if (!sentences || sentences.length === 0) {
      // Geen duidelijke zinsgrenzen gevonden (bijv. tekst zonder
      // eindpunt); geef de hele tekst terug.
      return text.trim();
    }

    return sentences
      .slice(0, maxSentences)
      .map((s) => s.trim())
      .join(' ')
      .trim();
  }

  /**
   * Bouwt de URL voor de klassieke MediaWiki-actie-API met de
   * TextExtracts-extensie (`prop=extracts`). In tegenstelling tot de
   * REST /page/summary/-endpoint (die alleen de INLEIDENDE alinea vóór
   * de eerste kop teruggeeft) telt `exsentences` hier door het HELE
   * artikel heen, dus ook door tekst die onder kopjes als "Geschiedenis"
   * of "Interieur" staat. Voor korte artikelen waarvan de inleiding
   * toevallig maar uit één zin bestaat, levert dit een veel rijker
   * resultaat op.
   *
   * `origin=*` is vereist voor CORS bij aanroep vanuit de browser; in
   * Node heeft de parameter geen effect maar is hij onschadelijk.
   */
  function buildFullBodyExtractEndpoint(lang, title, maxSentences) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'extracts',
      exsentences: String(maxSentences || DEFAULT_MAX_SENTENCES),
      explaintext: '1',
      redirects: '1',
      origin: '*',
      titles: title,
    });
    return 'https://' + lang + '.wikipedia.org/w/api.php?' + params.toString();
  }

  /**
   * Haalt, via de klassieke actie-API, de eerste `maxSentences` zinnen op
   * uit het VOLLEDIGE artikel (niet beperkt tot de inleidende alinea).
   * Geeft `null` terug (in plaats van te gooien) als er iets misgaat of
   * de pagina niet gevonden wordt — de aanroeper valt dan terug op de
   * kortere REST-samenvatting, zodat één mislukte aanvullende aanroep
   * nooit de hele samenvatting laat mislukken.
   *
   * @returns {Promise<string|null>}
   */
  async function fetchFullBodyExtract(lang, title, maxSentences, options) {
    options = options || {};
    const endpoint = buildFullBodyExtractEndpoint(lang, title, maxSentences);
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const headers = { Accept: 'application/json' };
    if (options.userAgent) {
      headers['User-Agent'] = options.userAgent;
    }

    try {
      const response = await fetch(endpoint, {
        headers: headers,
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) return null;

      const data = await response.json();
      const pages = data && data.query && data.query.pages;
      if (!Array.isArray(pages) || pages.length === 0) return null;

      const page = pages[0];
      if (page.missing || !page.extract) return null;

      return page.extract;
    } catch (err) {
      // Netwerkfout, timeout, of onverwachte responsvorm — stilzwijgend
      // null teruggeven; fetchSummary() vangt dit op met een terugval.
      return null;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  /**
   * Haalt de samenvatting op voor één Wikipedia-URL.
   *
   * @param {string} wikipediaUrl
   * @param {object} [options]
   * @param {number} [options.maxSentences=3]
   * @param {number} [options.timeoutMs=15000]
   * @param {string} [options.userAgent] - alleen relevant bij server-side gebruik
   * @returns {Promise<{title:string, extract:string, extractShort:string, thumbnailUrl:?string, pageUrl:?string, attribution:string}>}
   */
  async function fetchSummary(wikipediaUrl, options) {
    options = options || {};
    const parsed = parseWikipediaUrl(wikipediaUrl);
    if (!parsed) {
      throw new Error(
        'Kan geen Wikipedia-taal/titel herleiden uit URL: ' + wikipediaUrl
      );
    }

    const endpoint = buildSummaryEndpoint(parsed.lang, parsed.title);
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const hasAbortController = typeof AbortController !== 'undefined';
    const controller = hasAbortController ? new AbortController() : null;
    let timeoutId = null;
    if (controller) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const headers = { Accept: 'application/json' };
    if (options.userAgent) {
      headers['User-Agent'] = options.userAgent; // werkt alleen server-side
    }

    let response;
    try {
      response = await fetch(endpoint, {
        headers: headers,
        signal: controller ? controller.signal : undefined,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        'Wikipedia-samenvatting ophalen mislukt: HTTP ' +
          response.status +
          ' ' +
          response.statusText +
          ' (' +
          endpoint +
          ')'
      );
    }

    const data = await response.json();
    const extract = data.extract || '';

    // De REST-inleiding kan (bij korte artikelen) maar één zin lang zijn
    // terwijl de rest van het artikel onder kopjes wel degelijk meer
    // vertelt. Probeer daarom aanvullend het volledige artikel te
    // doorzoeken; lukt dat niet, dan valt extractShort gewoon terug op
    // de REST-inleiding (huidig gedrag, geen regressie).
    const fullBodyExtract = await fetchFullBodyExtract(
      parsed.lang,
      data.title || parsed.title,
      options.maxSentences,
      options
    );
    const richestExtract = fullBodyExtract || extract;

    return {
      title: data.title || parsed.title,
      extract: extract,
      extractShort: truncateToSentences(richestExtract, options.maxSentences),
      thumbnailUrl: (data.thumbnail && data.thumbnail.source) || null,
      pageUrl:
        (data.content_urls &&
          data.content_urls.desktop &&
          data.content_urls.desktop.page) ||
        wikipediaUrl,
      attribution:
        data.title && parsed.lang
          ? '"' + data.title + '", Wikipedia (' + parsed.lang + '), CC BY-SA 4.0'
          : 'Wikipedia, CC BY-SA 4.0',
    };
  }

  /**
   * Voert een array van async taken uit met een maximum aantal gelijktijdig
   * lopende taken (simpele "promise pool"), zodat een lange route met veel
   * kandidaten niet honderden gelijktijdige requests naar Wikipedia stuurt.
   */
  async function runWithConcurrency(items, worker, concurrency) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runNext() {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex++;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }

    const workers = [];
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    for (let i = 0; i < workerCount; i++) {
      workers.push(runNext());
    }
    await Promise.all(workers);
    return results;
  }

  /**
   * Verrijkt een array van kandidaat-POI's (zoals teruggegeven door
   * wikidata-search.js — elk met een `wikipediaUrl`-veld) met hun
   * Wikipedia-samenvatting. Kandidaten zonder `wikipediaUrl` of waarvoor
   * het ophalen mislukt worden niet overgeslagen maar krijgen een
   * `summaryError`-veld — zo valt één mislukt verzoek de rest van de
   * batch niet om.
   *
   * @param {Array<{wikipediaUrl?:string}>} candidates
   * @param {object} [options] - zie fetchSummary(); plus:
   * @param {number} [options.concurrency=4]
   * @returns {Promise<Array>} dezelfde candidates, elk aangevuld met
   *   `summary` (zie fetchSummary()) of `summaryError` (string)
   */
  async function fetchSummariesForCandidates(candidates, options) {
    options = options || {};
    const concurrency = options.concurrency || DEFAULT_CONCURRENCY;

    return runWithConcurrency(
      candidates,
      async (candidate) => {
        if (!candidate.wikipediaUrl) {
          return Object.assign({}, candidate, {
            summaryError: 'Geen wikipediaUrl aanwezig voor dit item',
          });
        }
        try {
          const summary = await fetchSummary(candidate.wikipediaUrl, options);
          return Object.assign({}, candidate, { summary: summary });
        } catch (err) {
          return Object.assign({}, candidate, { summaryError: err.message });
        }
      },
      concurrency
    );
  }

  return {
    parseWikipediaUrl,
    buildSummaryEndpoint,
    buildFullBodyExtractEndpoint,
    fetchFullBodyExtract,
    truncateToSentences,
    fetchSummary,
    fetchSummariesForCandidates,
  };
});