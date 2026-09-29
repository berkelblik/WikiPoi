/**
 * commons-foto.js
 *
 * Foto's van Wikimedia Commons: URL van een verkleinde versie, bestandsnaam
 * uit een thumbnail-URL van Wikipedia, en maker en licentie per foto (voor
 * de bronvermelding "Foto: <maker>, <licentie>" bij stap 5).
 *
 * Herkomst van de foto's:
 * - POI's zonder artikel: Wikidata P18 (wikidata-zin.js, fotoBestand);
 * - POI's met artikel: de thumbnail uit de Wikipedia-samenvatting. Alleen
 *   foto's die op Commons staan (upload.wikimedia.org/wikipedia/commons/)
 *   krijgen maker en licentie; lokale Wikipedia-bestanden niet.
 *
 * Maker en licentie komen uit de Commons-API (prop=imageinfo, extmetadata
 * Artist en LicenseShortName), één verzoek per MAX_PER_VERZOEK bestanden.
 * De API ondersteunt CORS met origin=*.
 *
 * Alle tekstbewerkingen zijn losse functies zonder netwerk (zie
 * test-commons-foto.js). Werkt als CommonJS-module (Node 18+) en als los
 * <script> in de browser (window.WikiPoiCommonsFoto).
 */

(function (root, factory) {
  // Beide toewijzingen onvoorwaardelijk (zie wikidata-search.js).
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiCommonsFoto = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
  const FILEPATH_BASIS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';
  const FOTO_BREEDTE = 320;
  const MAX_PER_VERZOEK = 50;
  const MAX_TEKENS_MAKER = 80;
  const DEFAULT_TIMEOUT_MS = 20000;

  // upload.wikimedia.org/wikipedia/commons/[thumb/]a/ab/<bestand>[/320px-...]
  const COMMONS_UPLOAD_RE =
    /^https?:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/i;

  const ENTITEITEN = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

  // ------------------------------------------------------------------
  // Bestandsnamen en URL's
  // ------------------------------------------------------------------

  /** Bestandsnaam met spaties, zonder "File:"-voorvoegsel; null als leeg. */
  function normaliseerBestand(naam) {
    const s = String(naam || '')
      .replace(/^(File|Bestand|Fichier|Datei):/i, '')
      .replace(/_/g, ' ')
      .trim();
    return s || null;
  }

  /**
   * URL van een verkleinde versie (standaard FOTO_BREEDTE pixels breed) via
   * Special:FilePath; null zonder bestandsnaam.
   */
  function fotoUrl(bestand, breedte) {
    const naam = normaliseerBestand(bestand);
    if (!naam) return null;
    return (
      FILEPATH_BASIS + encodeURIComponent(naam.replace(/ /g, '_')) + '?width=' + (breedte || FOTO_BREEDTE)
    );
  }

  /**
   * Bestandsnaam op Commons uit een thumbnail- of bestands-URL van
   * upload.wikimedia.org; null voor lokale Wikipedia-bestanden en andere URL's.
   */
  function bestandUitUploadUrl(url) {
    const m = COMMONS_UPLOAD_RE.exec(url || '');
    if (!m) return null;
    try {
      return normaliseerBestand(decodeURIComponent(m[1]));
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Maker en licentie
  // ------------------------------------------------------------------

  /** HTML naar platte tekst: tags weg, entiteiten omgezet, witruimte samengevoegd. */
  function platteTekst(html) {
    return String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&([a-z]+);/gi, (m, n) => (n.toLowerCase() in ENTITEITEN ? ENTITEITEN[n.toLowerCase()] : m))
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Maker als korte platte tekst (afgekapt met …); null als leeg. */
  function makerTekst(html) {
    const t = platteTekst(html);
    if (!t) return null;
    return t.length > MAX_TEKENS_MAKER ? t.slice(0, MAX_TEKENS_MAKER - 1).trimEnd() + '…' : t;
  }

  /** URL van het Commons-API-verzoek voor een lijst bestandsnamen. */
  function buildInfoUrl(bestanden) {
    const titels = bestanden.map((b) => 'File:' + b).join('|');
    return (
      COMMONS_API +
      '?action=query&format=json&formatversion=2&origin=*' +
      '&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist%7CLicenseShortName' +
      '&titles=' +
      encodeURIComponent(titels)
    );
  }

  /**
   * Zet de API-respons om naar { bestand: { maker, licentie } }, met als
   * sleutel de bestandsnaam zoals gevraagd. Genormaliseerde titels (bijv.
   * hoofdletter) worden teruggekoppeld; ontbrekende bestanden overgeslagen.
   */
  function parseInfo(json, bestanden) {
    const query = (json && json.query) || {};
    const genormaliseerd = {};
    (query.normalized || []).forEach((n) => {
      genormaliseerd[n.from] = n.to;
    });
    const perTitel = {};
    (query.pages || []).forEach((p) => {
      if (p && p.title && !p.missing && !p.invalid) perTitel[p.title] = p;
    });
    const resultaat = {};
    (bestanden || []).forEach((bestand) => {
      const titel = 'File:' + bestand;
      const pagina = perTitel[genormaliseerd[titel] || titel];
      const info = pagina && pagina.imageinfo && pagina.imageinfo[0];
      const meta = (info && info.extmetadata) || {};
      const maker = makerTekst(meta.Artist && meta.Artist.value);
      const licentie = platteTekst(meta.LicenseShortName && meta.LicenseShortName.value) || null;
      if (maker || licentie) resultaat[bestand] = { maker, licentie };
    });
    return resultaat;
  }

  /** "Foto: <maker>, <licentie>" (of met alleen één van beide); null zonder beide. */
  function bronTekst(foto) {
    if (!foto) return null;
    const delen = [foto.maker, foto.licentie].filter(Boolean);
    return delen.length ? 'Foto: ' + delen.join(', ') : null;
  }

  // ------------------------------------------------------------------
  // Netwerk
  // ------------------------------------------------------------------

  async function fetchMetTimeout(fetchImpl, url, init, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetchImpl(url, Object.assign({}, init, { signal: controller ? controller.signal : undefined }));
    } finally {
      if (t) clearTimeout(t);
    }
  }

  async function haalBlok(bestanden, opts) {
    const fetchImpl = opts.fetchImpl || fetch;
    const headers = { Accept: 'application/json' };
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
    const url = buildInfoUrl(bestanden);
    let laatsteFout = null;
    for (let poging = 0; poging < 2; poging++) {
      try {
        const res = await fetchMetTimeout(fetchImpl, url, { headers }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);
        if (res.ok) return parseInfo(await res.json(), bestanden);
        laatsteFout = new Error('Commons HTTP ' + res.status);
        if (![429, 500, 502, 503, 504].includes(res.status)) break;
      } catch (err) {
        laatsteFout = err;
      }
      await new Promise((r) => setTimeout(r, opts.retryDelayMs === undefined ? 3000 : opts.retryDelayMs));
    }
    throw laatsteFout || new Error('Commons mislukt');
  }

  /**
   * Maker en licentie voor een lijst bestandsnamen, in blokken van
   * MAX_PER_VERZOEK. Mislukt een blok, dan gooit deze functie.
   *
   * @param {string[]} bestanden - bestandsnamen (met of zonder "File:")
   * @param {object} [options] - { fetchImpl, userAgent, timeoutMs, retryDelayMs, blokGrootte }
   * @returns {Promise<Object<string, {maker:?string, licentie:?string}>>}
   */
  async function haalFotoInfo(bestanden, options) {
    const opts = options || {};
    const lijst = Array.from(new Set((bestanden || []).map(normaliseerBestand).filter(Boolean)));
    const blok = Math.max(1, Math.min(MAX_PER_VERZOEK, opts.blokGrootte || MAX_PER_VERZOEK));
    const resultaat = {};
    for (let i = 0; i < lijst.length; i += blok) {
      Object.assign(resultaat, await haalBlok(lijst.slice(i, i + blok), opts));
    }
    return resultaat;
  }

  return {
    FOTO_BREEDTE,
    MAX_PER_VERZOEK,
    MAX_TEKENS_MAKER,
    normaliseerBestand,
    fotoUrl,
    bestandUitUploadUrl,
    platteTekst,
    makerTekst,
    buildInfoUrl,
    parseInfo,
    bronTekst,
    haalFotoInfo,
  };
});
