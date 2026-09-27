/**
 * gemeente-terugval.js
 *
 * Tekst voor POI's ZONDER eigen Wikipedia-artikel, uit het artikel van de
 * plaats of gemeente waarin de POI ligt (veldtest Morvan, sept. 2026: kerken
 * en oorlogsmonumenten hebben daar zelden een eigen artikel, maar het
 * artikel van de commune noemt ze vaak onder "Lieux et monuments").
 *
 * Werkwijze:
 * 1. Eén Wikidata-query voor alle POI's samen: de P131-keten (ligt in
 *    bestuurlijke eenheid) tot maximaal 3 stappen omhoog, met per schakel de
 *    Wikipedia-artikelen in de taallijst. Niveau 1 (de directe P131) telt
 *    altijd mee, tenzij het een bekend hoger niveau is (HOGER_NIVEAU);
 *    niveau 2 en 3 alleen als ze aantoonbaar een gemeente zijn
 *    (GEMEENTE_TYPEN), bijv. een fusiegemeente boven een oud dorp.
 *    Veldtest Morvan (sept. 2026): zonder die eis kwamen arrondissementen
 *    en kantons mee, met veel zinloze verzoeken.
 *    Het gaat om Wikidata-items (QID's), niet om namen: twee dorpen met
 *    dezelfde naam (Laren Gld. / Laren NH) kunnen dus niet verwisseld worden.
 * 2. Per POI de schakels van klein naar groot, per schakel de talen in
 *    voorkeursvolgorde: artikeltekst ophalen (actie-API, platte tekst met
 *    kopjes; één verzoek per artikel, gedeeld tussen POI's), een kopje als
 *    "Lieux et monuments" / "Sehenswürdigkeiten" / "Bezienswaardigheden"
 *    zoeken en daarin zinnen kiezen die de POI noemen.
 * 3. De eerste treffer wint. Geen treffer: null (de app houdt dan de
 *    Wikidata-omschrijving).
 *
 * Zinnen worden alleen gekozen als ze het type van de POI noemen (église,
 * Kirche, kerk, ...) of een onderscheidend woord uit de naam
 * ("Saint-Pierre"); NIET zomaar de eerste zinnen van het kopje, want die
 * gaan vaak over een ander object.
 *
 * Alle tekstbewerkingen zijn losse functies zonder netwerk (zie
 * test-gemeente-terugval.js). Werkt als CommonJS-module (Node 18+) en als
 * los <script> in de browser (window.WikiPoiGemeenteTerugval).
 */

(function (root, factory) {
  // Beide toewijzingen onvoorwaardelijk (zie wikidata-search.js).
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiGemeenteTerugval = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
  const DEFAULT_LANGUAGES = ['nl', 'en', 'fr', 'de'];
  const LANGUAGE_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]+)*$/;
  const MAX_KETEN = 3;
  const DEFAULT_MAX_SENTENCES = 3;
  const DEFAULT_MAX_CHARS = 700;
  const DEFAULT_TIMEOUT_MS = 40000;
  const DEFAULT_CONCURRENCY = 4;

  // Bestuurlijke niveaus BOVEN de gemeente; zulke schakels worden niet
  // gebruikt (artikel te breed). Via P31/P279*, dus ook subklassen.
  const HOGER_NIVEAU = [
    'Q6256', // land
    'Q10864048', // bestuurlijke eenheid eerste niveau (provincie, regio, deelstaat)
    'Q134390', // provincie van Nederland
    'Q83116', // provincie van België
    'Q36784', // regio van Frankrijk
    'Q6465', // departement van Frankrijk
    'Q702842', // arrondissement van Frankrijk
    'Q18524218', // kanton van Frankrijk
    'Q1221156', // deelstaat van Duitsland
    'Q106658', // Landkreis
  ];

  // Gemeente-typen: alleen schakels van niveau 2 en 3 met één van deze
  // typen (via P31/P279*) worden gebruikt.
  const GEMEENTE_TYPEN = [
    'Q484170', // commune van Frankrijk (ook communes nouvelles)
    'Q2039348', // gemeente van Nederland
    'Q262166', // gemeente van Duitsland
    'Q493522', // gemeente van België
  ];

  // Kopjes (kleine letters, deel van de koptekst) waaronder monumenten staan.
  // Alle talen worden altijd geprobeerd: goedkoop en onschadelijk.
  const KOPJES = [
    // fr
    'lieux et monuments', 'monuments', 'patrimoine', 'curiosités', 'sites et monuments',
    // de
    'sehenswürdigkeiten', 'bauwerke', 'baudenkmäler', 'baudenkmale',
    // nl
    'bezienswaardigheden', 'monumenten', 'bouwwerken',
    // en
    'landmarks', 'sights', 'places of interest', 'notable buildings', 'architecture',
  ];

  // Subkopjes binnen een monumentensectie die NIET over monumenten gaan
  // (bijv. "Personnalités liées à la commune" onder "Culture locale et
  // patrimoine"); zulke subsecties (met hun eigen subsecties) vallen weg.
  const OVERSLAAN_KOPJES = [
    'personnalités', 'personnalité', 'héraldique', 'blason', 'jumelages', 'vie locale',
    'persönlichkeiten', 'söhne und töchter', 'wappen', 'partnerschaften', 'städtepartnerschaften',
    'bekende', 'personen', 'wapen', 'wapenschild', 'geboren',
    'notable people', 'people', 'coat of arms', 'twin towns',
  ];

  // Zinnen korter dan dit (in woorden) zijn meestal alleen een naam uit een
  // opsomming ("Kirche Saint-Laurent") en worden niet gekozen.
  const MIN_WOORDEN = 6;

  // Soorten POI met hun woorden in de gebruikte talen (kleine letters).
  // Een soort wordt herkend aan naam of omschrijving van de POI, of aan
  // de WikiPoi-categorie (SOORT_PER_CATEGORIE).
  const SOORTEN = {
    kerk: ['église', 'eglise', 'kirche', 'kerk', 'church', 'basilique', 'basilika', 'basiliek', 'basilica', 'cathédrale', 'dom', 'cathedral', 'kathedraal'],
    kapel: ['chapelle', 'kapelle', 'kapel', 'chapel'],
    klooster: ['abbaye', 'prieuré', 'couvent', 'kloster', 'abtei', 'klooster', 'abdij', 'priorij', 'abbey', 'priory', 'monastery'],
    oorlogsmonument: ['monument aux morts', 'kriegerdenkmal', 'gefallenendenkmal', 'ehrenmal', 'oorlogsmonument', 'war memorial', 'monument commémoratif', 'gedenkteken', 'monument voor de gevallenen'],
    molen: ['moulin', 'mühle', 'muehle', 'molen', 'mill', 'windmill', 'watermill'],
    kasteel: ['château', 'chateau', 'burg', 'schloss', 'kasteel', 'burcht', 'castle', 'manoir', 'havezate'],
    kruis: ['calvaire', 'croix', 'wegkreuz', 'wegkruis', 'wayside cross', 'kruisbeeld'],
    wasplaats: ['lavoir', 'waschhaus', 'wasplaats', 'washhouse'],
  };

  const SOORT_PER_CATEGORIE = {
    kerken: ['kerk', 'kapel'],
    kloosters: ['klooster'],
    molens: ['molen'],
    kastelen: ['kasteel'],
    oorlogsgeschiedenis: ['oorlogsmonument'],
  };

  // Woorden die in een naam niets onderscheiden.
  const STOPWOORDEN = [
    'de', 'du', 'des', 'la', 'le', 'les', 'et', 'en', 'au', 'aux', 'sur', 'sous',
    'der', 'die', 'das', 'den', 'dem', 'von', 'und', 'zum', 'zur', 'bei',
    'het', 'een', 'van', 'bij', 'op', 'in', 'aan',
    'the', 'of', 'and', 'at', 'on',
    'saint', 'sainte', 'sankt', 'sint', 'st', 'ste',
    'memorial', 'monument', 'department', 'département', 'france', 'frankrijk',
    'frankreich', 'nederland', 'netherlands', 'deutschland', 'duitsland',
    'belgique', 'belgië', 'belgium', 'gemeente', 'commune', 'gemeinde',
  ];

  // Afkortingen waarna een punt geen zinseinde is (kleine letters, zonder punt).
  const AFKORTINGEN = [
    'st', 'ste', 'av', 'apr', 'env', 'mgr', 'dr', 'hl', 'bzw', 'ca', 'ds',
    'bijv', 'o.a', 'm.n', 'nr', 'no', 'vs', 'etc', 'enz', 'jh', 'jhdt', 'j.-c',
  ];

  // ------------------------------------------------------------------
  // Talen
  // ------------------------------------------------------------------

  function resolveLanguages(languages) {
    const raw = Array.isArray(languages) && languages.length > 0 ? languages : DEFAULT_LANGUAGES;
    const out = [];
    for (const code of raw) {
      if (typeof code !== 'string') continue;
      let c = code.trim().toLowerCase().replace(/_/g, '-');
      if (/^[a-z]{2,3}-[a-z]{2}$/.test(c)) c = c.split('-')[0];
      if (!LANGUAGE_CODE_RE.test(c)) continue;
      if (!out.includes(c)) out.push(c);
    }
    return out.length > 0 ? out : DEFAULT_LANGUAGES.slice();
  }

  // ------------------------------------------------------------------
  // Stap 1: P131-keten via Wikidata
  // ------------------------------------------------------------------

  /**
   * SPARQL-query: per POI (QID) de schakels van de P131-keten (niveau 1 =
   * direct, t/m MAX_KETEN), zonder schakels boven gemeenteniveau, met per
   * taal een optioneel artikel (?art0, ?art1, ...).
   *
   * @param {string[]} ids - QID's van de POI's
   * @param {string[]} [languages]
   * @returns {string}
   */
  function buildKetenQuery(ids, languages) {
    const langs = resolveLanguages(languages);
    const values = Array.from(new Set(ids || []))
      .filter((id) => /^Q[0-9]+$/.test(id))
      .map((id) => 'wd:' + id)
      .join(' ');
    const gemeenteFilter =
      'FILTER EXISTS { ?plaats wdt:P31/wdt:P279* ?gem . VALUES ?gem { ' +
      GEMEENTE_TYPEN.map((q) => 'wd:' + q).join(' ') +
      ' } }';
    const unions = [];
    for (let n = 1; n <= MAX_KETEN; n++) {
      const pad = Array.from({ length: n }, () => 'wdt:P131').join('/');
      unions.push(
        '{ ?item ' + pad + ' ?plaats . BIND(' + n + ' AS ?niveau)' + (n > 1 ? ' ' + gemeenteFilter : '') + ' }'
      );
    }
    const artVars = langs.map((l, i) => '?art' + i);
    const artClauses = langs
      .map(
        (l, i) =>
          '  OPTIONAL { ?art' + i + ' schema:about ?plaats ; schema:isPartOf <https://' + l + '.wikipedia.org/> . }\n'
      )
      .join('');
    return (
      'SELECT ?item ?niveau ?plaats ?plaatsLabel ' + artVars.join(' ') + ' WHERE {\n' +
      '  VALUES ?item { ' + values + ' }\n' +
      '  ' + unions.join('\n  UNION ') + '\n' +
      '  FILTER NOT EXISTS {\n' +
      '    ?plaats wdt:P31/wdt:P279* ?hoog .\n' +
      '    VALUES ?hoog { ' + HOGER_NIVEAU.map((q) => 'wd:' + q).join(' ') + ' }\n' +
      '  }\n' +
      artClauses +
      '  SERVICE wikibase:label { bd:serviceParam wikibase:language "' + langs.concat(['mul']).join(',') + '". }\n' +
      '}'
    );
  }

  function qidUitUrl(url) {
    return url ? url.substring(url.lastIndexOf('/') + 1) : null;
  }

  /**
   * Zet de SPARQL-respons om naar { poiId: [schakel, ...] }, per POI
   * gesorteerd van klein (niveau 1) naar groot. Schakel:
   * { id, naam, niveau, articles: { taal: url } }. Een plaats die op
   * meerdere niveaus voorkomt, telt op het laagste niveau.
   */
  function parseKetenResults(sparqlJson, languages) {
    const langs = resolveLanguages(languages);
    const bindings = (sparqlJson && sparqlJson.results && sparqlJson.results.bindings) || [];
    const perPoi = {};
    for (const b of bindings) {
      const poiId = qidUitUrl(b.item && b.item.value);
      const plaatsId = qidUitUrl(b.plaats && b.plaats.value);
      if (!poiId || !plaatsId) continue;
      const niveau = b.niveau ? parseInt(b.niveau.value, 10) || MAX_KETEN : MAX_KETEN;
      const lijst = perPoi[poiId] || (perPoi[poiId] = []);
      let schakel = lijst.find((s) => s.id === plaatsId);
      if (!schakel) {
        schakel = {
          id: plaatsId,
          naam: b.plaatsLabel ? b.plaatsLabel.value : plaatsId,
          niveau: niveau,
          articles: {},
        };
        lijst.push(schakel);
      }
      if (niveau < schakel.niveau) schakel.niveau = niveau;
      langs.forEach((l, i) => {
        const art = b['art' + i];
        if (art && art.value && !schakel.articles[l]) schakel.articles[l] = art.value;
      });
    }
    Object.keys(perPoi).forEach((k) => perPoi[k].sort((a, b) => a.niveau - b.niveau));
    return perPoi;
  }

  // ------------------------------------------------------------------
  // Stap 2: artikeltekst, kopjes en zinnen (zonder netwerk)
  // ------------------------------------------------------------------

  function parseWikipediaUrl(url) {
    const m = /^https?:\/\/([a-z0-9-]+)\.wikipedia\.org\/wiki\/([^?#]+)/i.exec(url || '');
    if (!m) return null;
    return { lang: m[1].toLowerCase(), title: decodeURIComponent(m[2]).replace(/_/g, ' ') };
  }

  /** Actie-API: volledige platte tekst MET kopjes ("== Kop =="). */
  function buildArtikelTekstEndpoint(lang, title) {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'extracts',
      explaintext: '1',
      exsectionformat: 'wiki',
      redirects: '1',
      origin: '*',
      titles: title,
    });
    return 'https://' + lang + '.wikipedia.org/w/api.php?' + params.toString();
  }

  /**
   * Knipt platte tekst met "== Kop =="-regels in secties:
   * [{ niveau, kop, tekst }]. De inleiding krijgt niveau 1 en kop ''.
   */
  function splitSecties(tekst) {
    const secties = [{ niveau: 1, kop: '', regels: [] }];
    String(tekst || '')
      .split('\n')
      .forEach((regel) => {
        const m = /^\s*(={2,})\s*(.*?)\s*\1\s*$/.exec(regel);
        if (m) {
          secties.push({ niveau: m[1].length, kop: m[2], regels: [] });
        } else {
          secties[secties.length - 1].regels.push(regel);
        }
      });
    return secties.map((s) => ({ niveau: s.niveau, kop: s.kop, tekst: s.regels.join('\n').trim() }));
  }

  function normaliseer(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Woord als geheel (niet midden in een ander woord), ook met accenten.
  function bevatWoord(tekst, woord) {
    const t = normaliseer(tekst);
    const w = normaliseer(woord);
    if (!w) return false;
    let from = 0;
    for (;;) {
      const i = t.indexOf(w, from);
      if (i < 0) return false;
      const voor = i === 0 ? ' ' : t[i - 1];
      const na = i + w.length >= t.length ? ' ' : t[i + w.length];
      if (!/[\p{L}\p{N}]/u.test(voor) && !/[\p{L}\p{N}]/u.test(na)) return true;
      from = i + 1;
    }
  }

  /**
   * Monumentensecties: elke sectie waarvan de kop een woord uit KOPJES
   * bevat, samen met haar subsecties (behalve die met een kop uit
   * OVERSLAAN_KOPJES, inclusief hún subsecties). Geeft
   * [{ kop, subsecties: [{ kop, tekst }] }] terug; de eerste subsectie is
   * de sectie zelf (tekst vóór de eerste subkop).
   */
  function vindMonumentenSecties(secties) {
    const out = [];
    for (let i = 0; i < secties.length; i++) {
      const s = secties[i];
      if (!s.kop || !KOPJES.some((k) => bevatWoord(s.kop, k))) continue;
      const blok = { kop: s.kop, subsecties: [{ kop: s.kop, tekst: s.tekst }] };
      let j = i + 1;
      let overslaanTot = 0; // > 0: subsecties dieper dan dit niveau overslaan
      while (j < secties.length && secties[j].niveau > s.niveau) {
        const sub = secties[j];
        if (overslaanTot > 0 && sub.niveau > overslaanTot) {
          j++;
          continue;
        }
        overslaanTot = 0;
        if (OVERSLAAN_KOPJES.some((k) => bevatWoord(sub.kop, k))) {
          overslaanTot = sub.niveau;
        } else {
          blok.subsecties.push({ kop: sub.kop, tekst: sub.tekst });
        }
        j++;
      }
      out.push(blok);
      i = j - 1;
    }
    return out;
  }

  /**
   * Knipt tekst in zinnen. Elke regel is minstens een eigen zin
   * (opsommingen in de platte tekst hebben vaak geen slotpunt).
   */
  function splitZinnen(tekst) {
    const zinnen = [];
    String(tekst || '')
      .split('\n')
      .map((r) => r.replace(/^[\s*•·–-]+/, '').trim())
      .filter(Boolean)
      .forEach((regel) => {
        let start = 0;
        const grens = /[.!?]+["'»”)]*\s+(?=["'«„“(]?[\p{Lu}0-9])/gu;
        let m;
        while ((m = grens.exec(regel)) !== null) {
          const voor = regel.slice(start, m.index);
          const laatste = (voor.match(/(\S+)$/) || ['', ''])[1].replace(/^[("'«„“]+/, '');
          const isInitiaal = /^\p{Lu}$/u.test(laatste);
          if (m[0][0] === '.' && (isInitiaal || AFKORTINGEN.includes(laatste.toLowerCase()))) continue;
          zinnen.push(regel.slice(start, m.index + m[0].length).trim());
          start = m.index + m[0].length;
        }
        const rest = regel.slice(start).trim();
        if (rest) zinnen.push(rest);
      });
    return zinnen;
  }

  /** Soorten (sleutels van SOORTEN) van een POI, uit naam, omschrijving en categorie. */
  function bepaalSoorten(poi) {
    const tekst = (poi.label || '') + ' ' + (poi.description || '');
    const soorten = [];
    Object.keys(SOORTEN).forEach((soort) => {
      if (SOORTEN[soort].some((w) => bevatWoord(tekst, w))) soorten.push(soort);
    });
    const perCat = SOORT_PER_CATEGORIE[poi.categoryKey] || [];
    // Categorie alleen als naam/omschrijving niets opleverde.
    if (soorten.length === 0) perCat.forEach((s) => soorten.push(s));
    return soorten;
  }

  /**
   * Tekst zonder de plaatsnamen, zodat "saint-martin" (uit de kerknaam)
   * niet raakt in "né à Saint-Martin-du-Puy" (veldtest Morvan).
   * Langste namen eerst.
   */
  function zonderPlaatsnamen(tekst, plaatsNamen) {
    let t = normaliseer(tekst);
    (plaatsNamen || [])
      .map((n) => normaliseer(n))
      .filter((n) => n.length >= 3)
      .sort((a, b) => b.length - a.length)
      .forEach((n) => {
        t = t.split(n).join(' # ');
      });
    return t;
  }

  function aantalWoorden(zin) {
    return String(zin || '')
      .split(/\s+/)
      .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  }

  /**
   * Onderscheidende woorden uit de naam: geen stopwoorden, geen
   * soortwoorden, geen woorden uit de plaatsnamen van de keten, min. 4 tekens.
   * "église Saint-Pierre de Vassy" → ['saint-pierre'].
   */
  function naamWoorden(poi, plaatsNamen) {
    const soortWoorden = [];
    Object.keys(SOORTEN).forEach((s) => SOORTEN[s].forEach((w) => w.split(' ').forEach((x) => soortWoorden.push(x))));
    const plaats = [];
    (plaatsNamen || []).forEach((n) =>
      normaliseer(n)
        .split(/[\s,()]+/)
        .forEach((x) => x && plaats.push(x))
    );
    const out = [];
    normaliseer(poi.label)
      .split(/[\s,()]+/)
      .map((w) => w.replace(/^[dl]'/, '').replace(/^["'«„“]+|["'»”.:;]+$/g, ''))
      .forEach((w) => {
        if (w.length < 4) return;
        if (STOPWOORDEN.includes(w) || soortWoorden.includes(w) || plaats.includes(w)) return;
        if (!out.includes(w)) out.push(w);
      });
    return out;
  }

  /**
   * Kiest uit de monumentensecties de zinnen over deze POI.
   * Volgorde van voorkeur:
   *   1. een subkop die de POI noemt (naamwoord, of soortwoord als de POI
   *      geen naamwoorden heeft) → de eerste zinnen van die subsectie;
   *   2. zinnen met een naamwoord;
   *   3. zinnen met een soortwoord (alleen als de POI geen naamwoorden
   *      heeft, of als geen enkele zin een naamwoord bevat).
   * Naamwoorden worden gezocht in de tekst ZONDER plaatsnamen. Zinnen
   * korter dan MIN_WOORDEN tellen niet mee (bij 1: de subsectietekst als
   * geheel). Maximaal maxSentences zinnen en maxChars tekens, in de
   * oorspronkelijke volgorde. Geen treffer: null.
   *
   * @returns {{tekst:string, kop:string, grond:string}|null}
   */
  function kiesZinnen(blokken, poi, plaatsNamen, options) {
    const opts = options || {};
    const maxZinnen = opts.maxSentences || DEFAULT_MAX_SENTENCES;
    const maxTekens = opts.maxChars || DEFAULT_MAX_CHARS;
    const naam = naamWoorden(poi, plaatsNamen);
    const soortWoorden = [];
    bepaalSoorten(poi).forEach((s) => SOORTEN[s].forEach((w) => soortWoorden.push(w)));
    if (naam.length === 0 && soortWoorden.length === 0) return null;

    const noemtNaam = (t) => {
      const zonder = zonderPlaatsnamen(t, plaatsNamen);
      return naam.some((w) => bevatWoord(zonder, w));
    };
    const noemtSoort = (t) => soortWoorden.some((w) => bevatWoord(t, w));

    function inkorten(zinnen) {
      const gekozen = [];
      let lengte = 0;
      for (const z of zinnen) {
        if (gekozen.length >= maxZinnen) break;
        if (gekozen.length > 0 && lengte + z.length + 1 > maxTekens) break;
        gekozen.push(z);
        lengte += z.length + 1;
      }
      return gekozen.join(' ');
    }

    // 1. Subkop die de POI noemt.
    for (const blok of blokken) {
      for (const sub of blok.subsecties.slice(1)) {
        const raak = naam.length > 0 ? noemtNaam(sub.kop) : noemtSoort(sub.kop);
        const zinnen = splitZinnen(sub.tekst);
        if (raak && aantalWoorden(zinnen.join(' ')) >= MIN_WOORDEN) {
          return { tekst: inkorten(zinnen), kop: sub.kop, grond: 'subkop' };
        }
      }
    }

    // 2. en 3. Zinnen in alle monumentensecties samen.
    const alle = [];
    blokken.forEach((blok) =>
      blok.subsecties.forEach((sub) =>
        splitZinnen(sub.tekst).forEach((z) => {
          if (aantalWoorden(z) >= MIN_WOORDEN) alle.push({ z, kop: blok.kop });
        })
      )
    );
    const metNaam = alle.filter((x) => noemtNaam(x.z));
    if (metNaam.length > 0) {
      return { tekst: inkorten(metNaam.map((x) => x.z)), kop: metNaam[0].kop, grond: 'naam' };
    }
    const metSoort = alle.filter((x) => noemtSoort(x.z));
    if (metSoort.length > 0) {
      return { tekst: inkorten(metSoort.map((x) => x.z)), kop: metSoort[0].kop, grond: 'soort' };
    }
    return null;
  }

  /**
   * Zoekt in één artikeltekst naar zinnen over de POI.
   * @returns {{tekst,kop,grond}|null}
   */
  function zoekInArtikel(artikelTekst, poi, plaatsNamen, options) {
    const blokken = vindMonumentenSecties(splitSecties(artikelTekst));
    if (blokken.length === 0) return null;
    return kiesZinnen(blokken, poi, plaatsNamen, options);
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

  async function haalKeten(ids, options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    const query = buildKetenQuery(ids, opts.languages);
    const url = WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(query);
    const headers = { Accept: 'application/sparql-results+json' };
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
    let laatsteFout = null;
    for (let poging = 0; poging < 2; poging++) {
      try {
        const res = await fetchMetTimeout(fetchImpl, url, { headers }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);
        if (res.ok) return parseKetenResults(await res.json(), opts.languages);
        laatsteFout = new Error('Wikidata (plaatsen) HTTP ' + res.status);
        if (![429, 500, 502, 503, 504].includes(res.status)) break;
      } catch (err) {
        laatsteFout = err;
      }
      await new Promise((r) => setTimeout(r, opts.retryDelayMs === undefined ? 3000 : opts.retryDelayMs));
    }
    throw laatsteFout || new Error('Wikidata (plaatsen) mislukt');
  }

  /** Platte artikeltekst ophalen; null bij elke fout. */
  async function haalArtikelTekst(wikipediaUrl, options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    const p = parseWikipediaUrl(wikipediaUrl);
    if (!p) return null;
    const headers = { Accept: 'application/json' };
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
    try {
      const res = await fetchMetTimeout(
        fetchImpl,
        buildArtikelTekstEndpoint(p.lang, p.title),
        { headers },
        opts.timeoutMs || DEFAULT_TIMEOUT_MS
      );
      if (!res.ok) return null;
      const data = await res.json();
      const page = data && data.query && Array.isArray(data.query.pages) ? data.query.pages[0] : null;
      if (!page || page.missing || !page.extract) return null;
      return { tekst: page.extract, titel: page.title || p.title, lang: p.lang };
    } catch {
      return null;
    }
  }

  /**
   * Voor een lijst POI's zonder eigen artikel: tekst uit het artikel van de
   * plaats/gemeente. Mislukt de Wikidata-query, dan gooit deze functie;
   * mislukt één artikel, dan wordt het overgeslagen.
   *
   * @param {Array<{id:string,label:string,description?:string,categoryKey?:string}>} pois
   * @param {object} [options]
   * @param {string[]} [options.languages] - voorkeursvolgorde
   * @param {number} [options.maxSentences=3]
   * @param {number} [options.maxChars=700]
   * @param {number} [options.concurrency=4]
   * @param {object} [options.cache] - gedeelde cache (url → Promise), bijv.
   *   tussen twee aanroepen in de app
   * @param {Function} [options.fetchImpl] - voor tests
   * @returns {Promise<Object<string, {summary:?object, diagnose:object}>>}
   *   per POI-id: `summary` in hetzelfde formaat als wikipedia-summary.js
   *   (plus `lang` en `viaGemeente`), of null; `diagnose` beschrijft wat
   *   er geprobeerd is (voor het script).
   */
  async function haalGemeenteTeksten(pois, options) {
    const opts = options || {};
    const langs = resolveLanguages(opts.languages);
    const lijst = (pois || []).filter((p) => p && p.id);
    const resultaat = {};
    if (lijst.length === 0) return resultaat;

    const keten = await haalKeten(
      lijst.map((p) => p.id),
      Object.assign({}, opts, { languages: langs })
    );
    const cache = opts.cache || {};
    function artikel(url) {
      if (!cache[url]) cache[url] = haalArtikelTekst(url, opts);
      return cache[url];
    }

    async function verwerk(poi) {
      const schakels = keten[poi.id] || [];
      const plaatsNamen = schakels.map((s) => s.naam);
      const diagnose = { plaatsen: schakels.map((s) => s.naam + ' (' + s.niveau + ')'), geprobeerd: [] };
      for (const schakel of schakels) {
        for (const l of langs) {
          const url = schakel.articles[l];
          if (!url) continue;
          const art = await artikel(url);
          if (!art) {
            diagnose.geprobeerd.push(schakel.naam + ' [' + l + ']: niet opgehaald');
            continue;
          }
          const gevonden = zoekInArtikel(art.tekst, poi, plaatsNamen, opts);
          if (!gevonden) {
            const koppen = vindMonumentenSecties(splitSecties(art.tekst)).map((b) => b.kop);
            diagnose.geprobeerd.push(
              schakel.naam + ' [' + l + ']: ' + (koppen.length ? 'kopje "' + koppen.join('", "') + '", geen zin' : 'geen kopje')
            );
            continue;
          }
          diagnose.geprobeerd.push(schakel.naam + ' [' + l + ']: "' + gevonden.kop + '" (' + gevonden.grond + ')');
          return {
            summary: {
              title: art.titel,
              extract: gevonden.tekst,
              extractShort: gevonden.tekst,
              thumbnailUrl: null,
              pageUrl: url,
              lang: art.lang,
              attribution: '"' + art.titel + '", Wikipedia (' + art.lang + '), CC BY-SA 4.0',
              viaGemeente: { id: schakel.id, naam: schakel.naam, url: url, kop: gevonden.kop },
            },
            diagnose,
          };
        }
      }
      return { summary: null, diagnose };
    }

    // Kleine pool, zodat Wikipedia niet overspoeld wordt.
    const concurrency = Math.max(1, opts.concurrency || DEFAULT_CONCURRENCY);
    let volgende = 0;
    async function werker() {
      while (volgende < lijst.length) {
        const poi = lijst[volgende++];
        resultaat[poi.id] = await verwerk(poi);
      }
    }
    const werkers = [];
    for (let i = 0; i < Math.min(concurrency, lijst.length); i++) werkers.push(werker());
    await Promise.all(werkers);
    return resultaat;
  }

  return {
    HOGER_NIVEAU,
    GEMEENTE_TYPEN,
    KOPJES,
    OVERSLAAN_KOPJES,
    MIN_WOORDEN,
    SOORTEN,
    resolveLanguages,
    buildKetenQuery,
    parseKetenResults,
    parseWikipediaUrl,
    buildArtikelTekstEndpoint,
    splitSecties,
    vindMonumentenSecties,
    splitZinnen,
    bevatWoord,
    zonderPlaatsnamen,
    aantalWoorden,
    bepaalSoorten,
    naamWoorden,
    kiesZinnen,
    zoekInArtikel,
    haalArtikelTekst,
    haalGemeenteTeksten,
  };
});
