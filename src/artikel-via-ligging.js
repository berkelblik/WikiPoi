/**
 * artikel-via-ligging.js
 *
 * "Artikel via de ligging" (0.17.0): heeft een POI geen Wikipedia-artikel
 * in de eerste taal van de taallijst (meestal de telefoontaal), dan zoeken
 * we in de Wikipedia van die taal naar artikelen die binnen ± 100 m liggen
 * (geozoeken, één verzoek per POI). Aanleiding: Keppel Castle — op
 * Wikidata twee items voor één kasteel; het gevonden item heeft alleen een
 * Engels artikel, het Nederlandse artikel "Kasteel Keppel" hangt aan het
 * andere item.
 *
 * Een gevonden artikel telt alleen als het vrijwel zeker over hetzelfde
 * object gaat (keuze 3C):
 *   - het Wikidata-item van het artikel is de POI zelf (of een item dat er
 *     al mee is samengevoegd) → altijd goed;
 *   - het artikel hoort bij een ANDERE POI in de lijst → nooit (een kapel
 *     naast een kerk krijgt nooit de tekst van die kerk);
 *   - anders moet de titel een kenmerkend woord delen met de naam van de
 *     POI ("Keppel"), en als de naam een soort noemt (kasteel, kerk, molen
 *     …, in nl/en/de/fr, ook als deel van een samenstelling zoals
 *     "Dionysiuskerk") moet de titel een passende soort noemen. Zo krijgt
 *     "Keppel Castle" wel "Kasteel Keppel", maar niet het dorp "Laag-Keppel".
 * Liever soms geen vondst dan een verkeerde tekst.
 *
 * Meer talen (0.17.3, keuze B1): heeft de POI zijn beste artikel in taal
 * nummer k van de lijst (of geen artikel), dan zoeken we via de ligging in
 * de talen 1 … k−1, in volgorde, en stoppen bij de eerste vondst. Zo krijgt
 * "Burg Keppel" bij Frans → Duits → Nederlands → Engels het Duitse "Schloss
 * Keppel" in plaats van het Engelse eigen artikel.
 *
 * Werkt zowel als CommonJS-module (Node, voor de test) als los <script> in
 * de browser (window.WikiPoiArtikelViaLigging).
 */

(function (root, factory) {
  // Beide toewijzingen onvoorwaardelijk, zie wikipedia-summary.js.
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (typeof window !== 'undefined') {
    window.WikiPoiArtikelViaLigging = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STRAAL_METERS = 100;
  const MAX_KANDIDATEN = 10;
  const DEFAULT_TIMEOUT_MS = 15000;
  const DEFAULT_CONCURRENCY = 4;
  const TAALCODE_RE = /^[a-z]{2,3}(-[a-z0-9]+)*$/;

  // Soorten objecten, per soort de woorden in nl/en/de/fr (zonder accenten,
  // kleine letters). Een naam die een soort noemt, past alleen bij een titel
  // met dezelfde of een verwante soort (VERWANT).
  const SOORTEN = {
    kasteel: ['kasteel', 'slot', 'burcht', 'borg', 'borch', 'havezate', 'castle', 'burg', 'schloss', 'chateau', 'manoir', 'manor'],
    huis: ['huis', 'huize', 'landhuis', 'buitenplaats', 'villa', 'house', 'hall', 'haus', 'herrenhaus', 'maison'],
    landgoed: ['landgoed', 'estate', 'domaine'],
    paleis: ['paleis', 'palace', 'palast', 'palais'],
    kerk: ['kerk', 'kathedraal', 'basiliek', 'church', 'cathedral', 'basilica', 'kirche', 'dom', 'munster', 'basilika', 'eglise', 'cathedrale', 'basilique'],
    kapel: ['kapel', 'chapel', 'kapelle', 'chapelle'],
    klooster: ['klooster', 'abdij', 'priorij', 'abbey', 'monastery', 'priory', 'kloster', 'abtei', 'abbaye', 'monastere', 'prieure'],
    molen: ['molen', 'mill', 'windmill', 'watermill', 'muhle', 'windmuhle', 'moulin'],
    toren: ['toren', 'tower', 'turm', 'tour'],
    brug: ['brug', 'bridge', 'brucke', 'pont'],
    museum: ['museum', 'musee'],
    park: ['park', 'parc'],
    poort: ['poort', 'gate', 'tor', 'porte'],
    station: ['station', 'bahnhof', 'gare'],
    school: ['school', 'schule', 'ecole'],
    monument: ['monument', 'gedenkteken', 'memorial', 'denkmal', 'mahnmal', 'ehrenmal'],
    begraafplaats: ['begraafplaats', 'kerkhof', 'cemetery', 'graveyard', 'friedhof', 'cimetiere'],
    synagoge: ['synagoge', 'synagogue'],
    fort: ['fort', 'schans', 'fortress', 'citadel', 'festung', 'zitadelle', 'citadelle'],
    boerderij: ['boerderij', 'farm', 'bauernhof', 'ferme'],
    plein: ['plein', 'square', 'platz'],
  };
  const VERWANT = [
    ['kasteel', 'huis'],
    ['kasteel', 'landgoed'],
    ['huis', 'landgoed'],
    ['kasteel', 'paleis'],
    ['kerk', 'kapel'],
    ['kerk', 'klooster'],
    ['kapel', 'klooster'],
    ['kasteel', 'fort'],
  ];
  // Woord → soort.
  const SOORT_VAN = new Map();
  Object.keys(SOORTEN).forEach((soort) => {
    SOORTEN[soort].forEach((w) => SOORT_VAN.set(w, soort));
  });
  // Woorden die ook als laatste deel van een samenstelling herkend worden
  // ("Dionysiuskerk", "Boetselaersborg", "Korenmolen"), langste eerst.
  // Korte woorden (tor, dom, hof …) niet: te veel toevallige uitgangen.
  const ACHTERVOEGSELS = Array.from(SOORT_VAN.keys())
    .filter((w) => w.length >= 4)
    .sort((a, b) => b.length - a.length);
  const MIN_STAM = 3;

  // Lidwoorden, voorzetsels, heiligen en algemene bijvoeglijke naamwoorden:
  // geen kenmerkend woord.
  const STOPWOORDEN = new Set([
    'de', 'het', 'een', 'van', 'der', 'den', 'des', 'te', 'ten', 'ter', 'op', 'in', 'aan', 'bij', 'en', 'tot',
    'the', 'of', 'and', 'at', 'on', 'la', 'le', 'les', 'du', 'et', 'au', 'aux', 'sur', 'sous',
    'die', 'das', 'dem', 'und', 'zu', 'zum', 'zur', 'am', 'im', 'von', 'vom', 'bei', 'an',
    'sint', 'sankt', 'saint', 'sainte', 'san', 'santa', 'heilige', 'heiligen',
    'oude', 'oud', 'nieuwe', 'nieuw', 'grote', 'groot', 'kleine', 'klein', 'hoog', 'laag',
    'old', 'new', 'great', 'little', 'upper', 'lower',
    'alte', 'alter', 'altes', 'neue', 'neuer', 'neues', 'grosse', 'kleine',
    'vieux', 'vieille', 'neuf', 'nouveau', 'grand', 'grande', 'petit', 'petite',
  ]);

  function normaliseer(tekst) {
    return String(tekst || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/ß/g, 'ss');
  }

  /**
   * Kenmerkende woorden en genoemde soorten van een naam of titel.
   * "Kasteel Keppel" → { kern: ['keppel'], soorten: ['kasteel'] };
   * "Sint-Dionysiuskerk" → { kern: ['dionysius'], soorten: ['kerk'] }.
   *
   * @param {string} tekst
   * @returns {{kern:string[], soorten:string[]}}
   */
  function woorden(tekst) {
    const kern = [];
    const soorten = [];
    const voegToe = (lijst, w) => {
      if (!lijst.includes(w)) lijst.push(w);
    };
    const tokens = normaliseer(tekst).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    for (const t of tokens) {
      if (/^\d+$/.test(t)) continue;
      if (SOORT_VAN.has(t)) {
        voegToe(soorten, SOORT_VAN.get(t));
        continue;
      }
      if (STOPWOORDEN.has(t)) continue;
      const achter = ACHTERVOEGSELS.find((w) => t.length - w.length >= MIN_STAM && t.endsWith(w));
      if (achter) {
        voegToe(soorten, SOORT_VAN.get(achter));
        const stam = t.slice(0, t.length - achter.length);
        if (stam.length >= MIN_STAM && !STOPWOORDEN.has(stam)) voegToe(kern, stam);
        continue;
      }
      if (t.length >= MIN_STAM) voegToe(kern, t);
    }
    return { kern, soorten };
  }

  function soortenPassen(a, b) {
    return a.some((x) =>
      b.some((y) => x === y || VERWANT.some(([p, q]) => (p === x && q === y) || (p === y && q === x)))
    );
  }

  /** Titel uit een Wikipedia-URL: ".../wiki/Keppel_Castle" → "Keppel Castle". */
  function titelVanUrl(url) {
    const m = /\.wikipedia\.org\/wiki\/([^?#]+)/i.exec(url || '');
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]).replace(/_/g, ' ');
    } catch {
      return m[1].replace(/_/g, ' ');
    }
  }

  /**
   * Alle namen waaronder we de POI kennen: de naam, de namen van
   * samengevoegde items en de titels van zijn artikelen in andere talen.
   */
  function namenVan(poi) {
    const namen = [];
    if (poi && poi.label) namen.push(poi.label);
    ((poi && poi.mergedFrom) || []).forEach((m) => {
      if (m && m.label) namen.push(m.label);
    });
    const artikelen = (poi && poi.articles) || {};
    Object.keys(artikelen).forEach((taal) => {
      const t = titelVanUrl(artikelen[taal]);
      if (t) namen.push(t);
    });
    if (poi && poi.wikipediaUrl) {
      const t = titelVanUrl(poi.wikipediaUrl);
      if (t) namen.push(t);
    }
    return namen;
  }

  /**
   * Kiest uit de kandidaten (zie leesGeozoekResultaat) het artikel dat bij
   * de POI hoort, of null. Regels: zie bovenaan dit bestand.
   *
   * @param {object} poi - { id, label, mergedFrom?, articles?, wikipediaUrl? }
   * @param {Array<{titel:string, qid:?string, afstand:number}>} kandidaten
   * @param {{andereIds?:Set<string>|string[], maxMeters?:number}} [options]
   * @returns {{titel:string, qid:?string, afstand:number}|null}
   */
  function kiesArtikel(poi, kandidaten, options) {
    const opts = options || {};
    const maxMeters = typeof opts.maxMeters === 'number' ? opts.maxMeters : STRAAL_METERS;
    const andere = opts.andereIds instanceof Set ? opts.andereIds : new Set(opts.andereIds || []);
    const eigenIds = new Set([poi && poi.id].concat(((poi && poi.mergedFrom) || []).map((m) => m && m.id)));
    eigenIds.delete(undefined);
    eigenIds.delete(null);

    const poiKern = new Set();
    const poiSoorten = [];
    namenVan(poi).forEach((naam) => {
      const w = woorden(naam);
      w.kern.forEach((k) => poiKern.add(k));
      w.soorten.forEach((s) => {
        if (!poiSoorten.includes(s)) poiSoorten.push(s);
      });
    });

    let beste = null;
    let besteScore = -Infinity;
    for (const k of kandidaten || []) {
      if (!k || !k.titel) continue;
      const afstand = Number.isFinite(k.afstand) ? k.afstand : maxMeters;
      if (afstand > maxMeters) continue;
      if (k.qid && eigenIds.has(k.qid)) return k;
      if (k.qid && andere.has(k.qid)) continue;
      const w = woorden(k.titel);
      // Een tussen- of meervouds-s telt niet: "Boetselaers(borg)" = "Boetselaer".
      const gedeeld = w.kern.filter(
        (x) => poiKern.has(x) || poiKern.has(x + 's') || (x.endsWith('s') && poiKern.has(x.slice(0, -1)))
      ).length;
      if (gedeeld === 0) continue;
      if (poiSoorten.length > 0 && !soortenPassen(poiSoorten, w.soorten)) continue;
      const score = gedeeld * 1000 - afstand;
      if (score > besteScore) {
        beste = k;
        besteScore = score;
      }
    }
    return beste;
  }

  /** Geozoek-URL voor de Wikipedia van `taal` rond een punt. */
  function bouwGeozoekUrl(taal, lat, lng, options) {
    const opts = options || {};
    if (!TAALCODE_RE.test(String(taal || ''))) throw new Error('Ongeldige taalcode: ' + taal);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Ongeldig punt.');
    const punt = lat + '|' + lng;
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      generator: 'geosearch',
      ggscoord: punt,
      ggsradius: String(opts.straalMeters || STRAAL_METERS),
      ggslimit: String(MAX_KANDIDATEN),
      ggsnamespace: '0',
      prop: 'coordinates|pageprops',
      ppprop: 'wikibase_item',
      codistancefrompoint: punt,
      colimit: 'max',
    });
    return 'https://' + taal + '.wikipedia.org/w/api.php?' + params.toString();
  }

  /**
   * Antwoord van de geozoek-URL → kandidaten { titel, qid, afstand },
   * dichtstbijzijnde eerst.
   */
  function leesGeozoekResultaat(json) {
    const pages = (json && json.query && json.query.pages) || [];
    const lijst = Array.isArray(pages) ? pages : Object.values(pages);
    return lijst
      .filter((p) => p && p.title && (p.ns === undefined || p.ns === 0))
      .map((p) => {
        const co = Array.isArray(p.coordinates) ? p.coordinates.find((c) => c.primary) || p.coordinates[0] : null;
        return {
          titel: p.title,
          qid: (p.pageprops && p.pageprops.wikibase_item) || null,
          afstand: co && Number.isFinite(co.dist) ? co.dist : STRAAL_METERS,
        };
      })
      .sort((a, b) => a.afstand - b.afstand);
  }

  /** Artikel-URL: ('nl', 'Kasteel Keppel') → https://nl.wikipedia.org/wiki/Kasteel_Keppel */
  function artikelUrl(taal, titel) {
    return 'https://' + taal + '.wikipedia.org/wiki/' + encodeURIComponent(String(titel).replace(/ /g, '_'));
  }

  /** Naam uit een titel: een toevoeging tussen haakjes achteraan vervalt. */
  function naamVanTitel(titel) {
    const kort = String(titel || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    return kort || String(titel || '').trim();
  }

  async function haalJson(url, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) throw new Error('Geozoeken mislukt: HTTP ' + response.status);
      return await response.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Zoekt voor elke POI een artikel in de Wikipedia van `taal` via de
   * ligging. Eén verzoek per POI, maximaal `concurrency` tegelijk. Een
   * mislukt verzoek geeft voor die POI gewoon geen vondst.
   *
   * @param {Array<object>} pois - met id, lat, lng, label, …
   * @param {string} taal - bijv. 'nl'
   * @param {{andereIds?:Set<string>, concurrency?:number, timeoutMs?:number}} [options]
   *   andereIds: QID's van ALLE POI's in de lijst (incl. samengevoegde);
   *   per POI worden de eigen id's er automatisch uit gelaten.
   * @returns {Promise<Object<string,{url:string, titel:string, naam:string, taal:string, qid:?string, afstand:number}>>}
   *   per POI-id een vondst; POI's zonder vondst ontbreken
   */
  async function zoekArtikelenViaLigging(pois, taal, options) {
    const opts = options || {};
    const alle = opts.andereIds instanceof Set ? opts.andereIds : new Set(opts.andereIds || []);
    const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
    const lijst = (pois || []).filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const vondsten = {};
    let volgende = 0;
    async function werker() {
      while (volgende < lijst.length) {
        const poi = lijst[volgende++];
        try {
          const json = await haalJson(bouwGeozoekUrl(taal, poi.lat, poi.lng), timeoutMs);
          const eigen = new Set([poi.id].concat((poi.mergedFrom || []).map((m) => m.id)));
          const andere = new Set(Array.from(alle).filter((id) => !eigen.has(id)));
          const k = kiesArtikel(poi, leesGeozoekResultaat(json), { andereIds: andere });
          if (k) {
            vondsten[poi.id] = {
              url: artikelUrl(taal, k.titel),
              titel: k.titel,
              naam: naamVanTitel(k.titel),
              taal,
              qid: k.qid,
              afstand: k.afstand,
            };
          }
        } catch (err) {
          // Geen vondst voor deze POI; de rest gaat door.
          if (typeof console !== 'undefined') console.warn('Artikel via ligging mislukt:', poi.id, err && err.message);
        }
      }
    }
    const aantal = Math.max(1, Math.min(opts.concurrency || DEFAULT_CONCURRENCY, lijst.length));
    await Promise.all(Array.from({ length: aantal }, werker));
    return vondsten;
  }

  /** Taalcode zonder regio: 'de-AT' → 'de'. */
  function basisTaal(code) {
    return String(code || '').toLowerCase().split('-')[0];
  }

  /**
   * Talen waarin we via de ligging zoeken (B1): alle talen die in de lijst
   * hoger staan dan de taal van het eigen artikel van de POI; heeft de POI
   * geen artikel in een taal uit de lijst, dan alle talen.
   *
   * @param {object} poi - { articleLanguage? }
   * @param {string[]} talen - taalvolgorde, bijv. ['fr', 'de', 'nl', 'en']
   * @returns {string[]}
   */
  function talenVoorLigging(poi, talen) {
    const lijst = (talen || []).map(basisTaal).filter(Boolean);
    const k = lijst.indexOf(basisTaal(poi && poi.articleLanguage));
    return k === -1 ? lijst : lijst.slice(0, k);
  }

  /**
   * Zoekt via de ligging in meerdere talen (B1): eerst in de eerste taal
   * voor alle POI's die daar geen artikel hebben, dan in de tweede taal
   * voor de POI's die nog geen vondst hebben en waarvan het eigen artikel
   * lager staat, enzovoort. Per POI dus hoogstens één verzoek per taal die
   * hoger staat dan zijn eigen artikel.
   *
   * @param {Array<object>} pois
   * @param {string[]} talen - taalvolgorde
   * @param {object} [options] - zie zoekArtikelenViaLigging
   * @param {function(string, Object):Promise<Object>} [zoeker] - voor de test;
   *   standaard zoekArtikelenViaLigging(pois, taal, options)
   * @returns {Promise<Object<string, object>>} per POI-id een vondst (met .taal)
   */
  async function zoekArtikelenViaLiggingInTalen(pois, talen, options, zoeker) {
    const zoek = zoeker || ((lijst, taal) => zoekArtikelenViaLigging(lijst, taal, options));
    const kandidaten = (pois || []).filter((p) => p && !p.eigen);
    const vondsten = {};
    const lijst = (talen || []).map(basisTaal).filter(Boolean);
    for (const taal of lijst) {
      const nog = kandidaten.filter((p) => !vondsten[p.id] && talenVoorLigging(p, lijst).includes(taal));
      if (nog.length === 0) continue;
      const gevonden = (await zoek(nog, taal)) || {};
      Object.keys(gevonden).forEach((id) => {
        if (!vondsten[id]) vondsten[id] = gevonden[id];
      });
    }
    return vondsten;
  }

  return {
    STRAAL_METERS,
    talenVoorLigging,
    zoekArtikelenViaLiggingInTalen,
    woorden,
    titelVanUrl,
    namenVan,
    kiesArtikel,
    bouwGeozoekUrl,
    leesGeozoekResultaat,
    artikelUrl,
    naamVanTitel,
    zoekArtikelenViaLigging,
  };
});
