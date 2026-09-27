/**
 * wikidata-zin.js
 *
 * Korte Nederlandse zin uit Wikidata-eigenschappen, als terugval voor POI's
 * ZONDER eigen Wikipedia-artikel (veldtest Morvan/Achterhoek, sept. 2026:
 * kerken en oorlogsmonumenten hebben vaak geen artikel, en de gemeente-
 * terugval vond er niets bruikbaars voor).
 *
 * Voorbeeld:
 *   "Kerk gewijd aan de heilige Germanus van Auxerre, gebouwd in de 12e eeuw
 *    in romaanse stijl, beschermd monument."
 *
 * Werkwijze:
 * 1. Eén Wikidata-query (per blok van max. BLOK_GROOTTE POI's) met de
 *    eigenschappen hieronder en de labels van hun waarden (nl, mul, en, fr,
 *    de). Van elk label wordt de taal meegenomen (xml:lang).
 * 2. Per POI een zin: soort (onderwerp) + onderdelen in vaste volgorde:
 *    toewijding (P417), herdenkt (P547), tijd (P571/P1619) + stijl (P149),
 *    maker (P84/P170), eventueel materiaal (P186), erfgoedstatus (P1435).
 *    De plaats (P131) komt er bewust NIET in (besluit sept. 2026: onderweg
 *    weet de fietser waar hij is).
 * 3. Minder dan MIN_ONDERDELEN onderdelen naast de soort: GEEN zin (de app
 *    houdt dan de Wikidata-omschrijving). Geen Nederlandse soortnaam: ook
 *    geen zin (een Engels zelfstandig naamwoord in een Nederlandse zin
 *    leest en klinkt rommelig).
 *
 * Namen (personen, organisaties) mogen in elke taal; begrippen (stijl,
 * materiaal, gebeurtenis, soort) alleen met een Nederlands of mul-label,
 * of via de vaste tabellen hieronder. Nooit een zin met een QID erin.
 *
 * Alle tekstbewerkingen zijn losse functies zonder netwerk (zie
 * test-wikidata-zin.js). Werkt als CommonJS-module (Node 18+) en als los
 * <script> in de browser (window.WikiPoiWikidataZin).
 */

(function (root, factory) {
  // Beide toewijzingen onvoorwaardelijk (zie wikidata-search.js).
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiWikidataZin = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
  const ZIN_TAAL = 'nl';
  // Labeltalen: eerst Nederlands, dan taalonafhankelijke namen (mul), dan
  // de talen waarin namen van personen meestal wel bestaan.
  const LABEL_TALEN = ['nl', 'mul', 'en', 'fr', 'de'];
  // Talen waarin een BEGRIP (stijl, materiaal, gebeurtenis) bruikbaar is.
  const BEGRIP_TALEN = ['nl', 'mul'];
  const MIN_ONDERDELEN = 2;
  const MAX_TEKENS = 200;
  const MAX_WAARDEN = 2;
  const BLOK_GROOTTE = 80;
  const DEFAULT_TIMEOUT_MS = 40000;

  const ENTITEIT_RE = /\/entity\/(Q[0-9]+)$/;

  // Eigenschappen met een item als waarde (via wdt:, dus de "beste" rang).
  const ITEM_EIGENSCHAPPEN = ['P31', 'P417', 'P547', 'P149', 'P1435', 'P84', 'P170', 'P186'];
  // Eigenschappen met een tijd als waarde (via p:/psv:, voor de precisie).
  const TIJD_EIGENSCHAPPEN = ['P571', 'P1619'];

  const Q_MENS = 'Q5';
  const Q_CIRCA = 'Q5727902';

  // ------------------------------------------------------------------
  // Vaste tabellen
  // ------------------------------------------------------------------

  // Soorten (P31) met Nederlandse naam en groep (bepaalt het werkwoord bij
  // de tijd). Volgorde = voorrang bij meerdere P31-waarden: specifiek eerst.
  const SOORTEN = [
    ['Q575759', 'oorlogsmonument', 'monument'],
    ['Q2977', 'kathedraal', 'gebouw'],
    ['Q163687', 'basiliek', 'gebouw'],
    ['Q120560', 'basiliek', 'gebouw'],
    ['Q108325', 'kapel', 'gebouw'],
    ['Q16970', 'kerk', 'gebouw'],
    ['Q160742', 'abdij', 'gebouw'],
    ['Q44613', 'klooster', 'gebouw'],
    ['Q38720', 'windmolen', 'gebouw'],
    ['Q185187', 'watermolen', 'gebouw'],
    ['Q44494', 'molen', 'gebouw'],
    ['Q751876', 'kasteel', 'gebouw'],
    ['Q23413', 'kasteel', 'gebouw'],
    ['Q16560', 'paleis', 'gebouw'],
    ['Q12518', 'toren', 'gebouw'],
    ['Q12280', 'brug', 'gebouw'],
    ['Q179700', 'standbeeld', 'beeld'],
    ['Q860861', 'beeld', 'beeld'],
    ['Q5003624', 'gedenkteken', 'monument'],
    ['Q4989906', 'monument', 'monument'],
    ['Q39614', 'begraafplaats', 'terrein'],
    ['Q109607', 'ruïne', 'gebouw'],
    ['Q3947', 'huis', 'gebouw'],
    ['Q41176', 'gebouw', 'gebouw'],
  ];
  const SOORT_PER_QID = {};
  SOORTEN.forEach(([q, naam, groep], i) => {
    if (!SOORT_PER_QID[q]) SOORT_PER_QID[q] = { naam, groep, rang: i };
  });

  // Werkwoord bij de tijd, per groep en eigenschap. Onbekende groep (soort
  // via Nederlands label): neutraal "uit" ("kerkgebouw uit de 12e eeuw").
  const WERKWOORDEN = {
    gebouw: { P571: 'gebouwd', P1619: 'geopend' },
    monument: { P571: 'opgericht', P1619: 'onthuld' },
    beeld: { P571: 'gemaakt', P1619: 'onthuld' },
    terrein: { P571: 'aangelegd', P1619: 'geopend' },
  };

  // Bouwstijlen (P149) met vaste Nederlandse zinsdelen.
  const STIJLEN = {
    Q46261: 'in romaanse stijl',
    Q176483: 'in gotische stijl',
    Q186363: 'in neogotische stijl',
    Q840829: 'in barokstijl',
    Q54111: 'in neoclassicistische stijl',
    Q236122: 'in renaissancestijl',
  };
  // Nederlandse stijllabels zonder vaste regel in STIJLEN.
  const STIJL_WOORDEN = {
    romaans: 'in romaanse stijl',
    romaanse: 'in romaanse stijl',
    gotiek: 'in gotische stijl',
    neogotiek: 'in neogotische stijl',
    neoromaans: 'in neoromaanse stijl',
    barok: 'in barokstijl',
    renaissance: 'in renaissancestijl',
    classicisme: 'in classicistische stijl',
    neoclassicisme: 'in neoclassicistische stijl',
    jugendstil: 'in jugendstil',
    'art nouveau': 'in art-nouveaustijl',
    'art deco': 'in art-decostijl',
    'amsterdamse school': 'in de stijl van de Amsterdamse School',
    'nieuwe zakelijkheid': 'in de stijl van de Nieuwe Zakelijkheid',
  };

  // Erfgoedstatus (P1435): bekende waarden vast naar "beschermd monument"
  // (besluit sept. 2026), zodat er geen "inscrit monument historique"
  // wordt voorgelezen.
  const STATUS_BESCHERMD_QIDS = ['Q916333', 'Q916475', 'Q10387684', 'Q10387575'];
  const STATUS_BESCHERMD_RE =
    /rijksmonument|monument historique|monument classé|baudenkmal|kulturdenkmal|beschermd monument|listed building|protected monument|heritage site/i;

  // ------------------------------------------------------------------
  // Query en parseren
  // ------------------------------------------------------------------

  /**
   * SPARQL-query voor een lijst QID's: één rij per waarde. Item-waarden met
   * label (en of het een mens is), tijdwaarden met precisie en circa.
   */
  function buildZinQuery(ids) {
    const values = Array.from(new Set(ids || []))
      .filter((id) => /^Q[0-9]+$/.test(id))
      .map((id) => 'wd:' + id)
      .join(' ');
    const itemParen = ITEM_EIGENSCHAPPEN.map((p) => '("' + p + '" wdt:' + p + ')').join(' ');
    const tijdParen = TIJD_EIGENSCHAPPEN.map((p) => '("' + p + '" p:' + p + ' psv:' + p + ')').join(' ');
    return (
      'SELECT ?item ?eig ?waarde ?waardeLabel ?mens ?tijd ?precisie ?circa WHERE {\n' +
      '  VALUES ?item { ' + values + ' }\n' +
      '  {\n' +
      '    VALUES (?eig ?p) { ' + itemParen + ' }\n' +
      '    ?item ?p ?waarde .\n' +
      '    FILTER(isIRI(?waarde))\n' +
      '    OPTIONAL { ?waarde wdt:P31 wd:' + Q_MENS + ' . BIND(1 AS ?mens) }\n' +
      '  }\n' +
      '  UNION\n' +
      '  {\n' +
      '    VALUES (?eig ?pp ?psv) { ' + tijdParen + ' }\n' +
      '    ?item ?pp ?st .\n' +
      '    ?st ?psv ?tv .\n' +
      '    ?tv wikibase:timeValue ?tijd ; wikibase:timePrecision ?precisie .\n' +
      '    FILTER NOT EXISTS { ?st wikibase:rank wikibase:DeprecatedRank }\n' +
      '    OPTIONAL { ?st pq:P1480 ?circa . }\n' +
      '  }\n' +
      '  SERVICE wikibase:label { bd:serviceParam wikibase:language "' + LABEL_TALEN.join(',') + '". }\n' +
      '}'
    );
  }

  function qidUit(url) {
    const m = ENTITEIT_RE.exec(url || '');
    return m ? m[1] : null;
  }

  /**
   * Zet de SPARQL-respons om naar { poiId: eigenschappen }, met
   * eigenschappen = { P31: [waarde], ..., P571: [tijd], ... }.
   * Waarde: { id, label, lang, mens }; label null als Wikidata alleen de
   * QID teruggeeft. Tijd: { jaar, precisie, circa }. Dubbele rijen
   * (door OPTIONAL-combinaties) worden samengevoegd.
   */
  function parseZinResults(sparqlJson) {
    const bindings = (sparqlJson && sparqlJson.results && sparqlJson.results.bindings) || [];
    const perPoi = {};
    for (const b of bindings) {
      const poiId = qidUit(b.item && b.item.value);
      const eig = b.eig && b.eig.value;
      if (!poiId || !eig) continue;
      const poi = perPoi[poiId] || (perPoi[poiId] = {});
      const lijst = poi[eig] || [];
      if (TIJD_EIGENSCHAPPEN.includes(eig)) {
        const jaar = jaarUit(b.tijd && b.tijd.value);
        const precisie = b.precisie ? parseInt(b.precisie.value, 10) : NaN;
        if (jaar === null || !Number.isFinite(precisie)) continue;
        const circa = qidUit(b.circa && b.circa.value) === Q_CIRCA;
        const bestaand = lijst.find((t) => t.jaar === jaar && t.precisie === precisie);
        if (bestaand) bestaand.circa = bestaand.circa || circa;
        else lijst.push({ jaar, precisie, circa });
        poi[eig] = lijst;
        continue;
      }
      const id = qidUit(b.waarde && b.waarde.value);
      if (!id) continue; // "onbekende waarde" (genid) of geen item
      const ruw = b.waardeLabel && b.waardeLabel.value;
      const lang = (b.waardeLabel && b.waardeLabel['xml:lang']) || null;
      const label = ruw && ruw !== id && lang ? ruw : null;
      const mens = !!(b.mens && b.mens.value);
      const bestaand = lijst.find((w) => w.id === id);
      if (bestaand) {
        bestaand.mens = bestaand.mens || mens;
        continue;
      }
      lijst.push({ id, label, lang: label ? lang : null, mens });
      poi[eig] = lijst;
    }
    return perPoi;
  }

  /** Jaar uit een Wikidata-tijd ("1150-01-01T00:00:00Z"); null bij v.Chr. of fout. */
  function jaarUit(tijd) {
    const m = /^([+-]?)0*([0-9]+)-/.exec(tijd || '');
    if (!m || m[1] === '-') return null;
    const jaar = parseInt(m[2], 10);
    return jaar > 0 ? jaar : null;
  }

  // ------------------------------------------------------------------
  // Zinsdelen (zonder netwerk)
  // ------------------------------------------------------------------

  function isBegripLabel(w) {
    return !!(w && w.label && BEGRIP_TALEN.includes(w.lang));
  }

  function hoofdletter(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function metEn(delen) {
    if (delen.length <= 1) return delen.join('');
    return delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1];
  }

  /** Soort (onderwerp): uit de vaste tabel, anders een Nederlands label. */
  function bepaalSoort(p31) {
    const waarden = p31 || [];
    let beste = null;
    for (const w of waarden) {
      const s = SOORT_PER_QID[w.id];
      if (s && (!beste || s.rang < beste.rang)) beste = Object.assign({ id: w.id }, s);
    }
    if (beste) return { id: beste.id, naam: beste.naam, groep: beste.groep, bron: 'tabel' };
    const nl = waarden
      .filter((w) => w.label && w.lang === ZIN_TAAL)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (nl) return { id: nl.id, naam: nl.label, groep: null, bron: 'label' };
    return null;
  }

  const HEILIGE_RE = /^(saint|sainte|sankt|sint|st\.?|ste\.?|san|santa|santo|heilige|h\.)\s+/i;

  /** Naam van een heilige zonder voorvoegsel, of null als het geen heilige lijkt. */
  function heiligeNaam(w) {
    if (!w || !w.label) return null;
    const m = HEILIGE_RE.exec(w.label);
    if (m) return w.label.slice(m[0].length);
    return w.mens ? w.label : null;
  }

  /** "gewijd aan de heilige Germanus" / "gewijd aan de heiligen Petrus en Paulus". */
  function deelToewijding(waarden) {
    const bruikbaar = (waarden || []).filter((w) => w.label && (w.mens || HEILIGE_RE.test(w.label) || isBegripLabel(w)));
    const gekozen = bruikbaar.slice(0, MAX_WAARDEN);
    if (gekozen.length === 0) return null;
    const heiligen = gekozen.map(heiligeNaam);
    if (heiligen.every((h) => h)) {
      return heiligen.length === 1
        ? 'gewijd aan de heilige ' + heiligen[0]
        : 'gewijd aan de heiligen ' + metEn(heiligen);
    }
    return (
      'gewijd aan ' +
      metEn(gekozen.map((w, i) => (heiligen[i] ? 'de heilige ' + heiligen[i] : w.label)))
    );
  }

  // Groepen mensen die Wikidata in het enkelvoud labelt ("burgerslachtoffer"),
  // maar die in de zin meervoud moeten zijn (veldtest Achterhoek, sept. 2026).
  const MEERVOUDEN = {
    slachtoffer: 'slachtoffers',
    burgerslachtoffer: 'burgerslachtoffers',
    oorlogsslachtoffer: 'oorlogsslachtoffers',
    militair: 'militairen',
    soldaat: 'soldaten',
    verzetsstrijder: 'verzetsstrijders',
    gevallene: 'gevallenen',
    gesneuvelde: 'gesneuvelden',
  };
  // Begrippen met "het" (veldtest Achterhoek: "de Nederlands verzet").
  const HET_RE = /^((nederlands|binnenlands|gewapend) )?verzet(\s|$)/i;

  /**
   * Begrip met lidwoord ("de Tweede Wereldoorlog", "het Nederlands verzet",
   * "de burgerslachtoffers"), of null als het lidwoord niet zeker is:
   * liever geen zinsdeel dan een fout zinsdeel.
   */
  function metLidwoord(label) {
    if (/^(de|het|een)\s/i.test(label)) return label;
    const woorden = label.split(' ');
    const laatste = woorden[woorden.length - 1];
    if (MEERVOUDEN[laatste.toLowerCase()]) {
      return 'de ' + woorden.slice(0, -1).concat([MEERVOUDEN[laatste.toLowerCase()]]).join(' ');
    }
    if (HET_RE.test(label)) return 'het ' + label;
    // Eigennamen van gebeurtenissen (Tweede Wereldoorlog, Holocaust,
    // Bevrijding) zijn vrijwel altijd de-woorden.
    if (/^[A-ZÀ-Ý]/.test(label)) return 'de ' + label;
    // Kleine letter: alleen een meervoud ("geallieerden") is zeker "de".
    if (/(en|s)$/.test(laatste)) return 'de ' + label;
    return null;
  }

  /** "ter herdenking van de Tweede Wereldoorlog" / "... van Anne Frank". */
  function deelHerdenkt(waarden) {
    const namen = (waarden || [])
      .filter((w) => w.label && (w.mens || isBegripLabel(w)))
      .map((w) => (w.mens ? w.label : metLidwoord(w.label)))
      .filter((n) => n)
      .slice(0, MAX_WAARDEN);
    if (namen.length === 0) return null;
    return 'ter herdenking van ' + metEn(namen);
  }

  /** Eeuw bij een jaar met eeuwprecisie: 1101..1200 → 12. */
  function eeuwVan(jaar) {
    return Math.floor((jaar - 1) / 100) + 1;
  }

  /**
   * Tijdsaanduiding: { bij, uit }, bijv. { bij: 'in de 12e eeuw',
   * uit: 'uit de 12e eeuw' }. Precisie 9+ = jaar, 8 = decennium,
   * 7 = eeuw; grover: null.
   */
  function tijdAanduiding(t) {
    if (!t || !t.jaar) return null;
    if (t.precisie >= 9) {
      return t.circa ? { bij: 'rond ' + t.jaar, uit: 'van rond ' + t.jaar } : { bij: 'in ' + t.jaar, uit: 'uit ' + t.jaar };
    }
    if (t.precisie === 8) {
      const dec = Math.floor(t.jaar / 10) * 10;
      return { bij: 'in de jaren ' + dec, uit: 'uit de jaren ' + dec };
    }
    if (t.precisie === 7) {
      const e = eeuwVan(t.jaar) + 'e eeuw';
      return { bij: 'in de ' + e, uit: 'uit de ' + e };
    }
    return null;
  }

  /** Nauwkeurigste tijd van een eigenschap (bij gelijke precisie de vroegste). */
  function kiesTijd(lijst) {
    const tijden = (lijst || []).filter((t) => tijdAanduiding(t));
    if (tijden.length === 0) return null;
    return tijden.slice().sort((a, b) => b.precisie - a.precisie || a.jaar - b.jaar)[0];
  }

  /** Stijl als zinsdeel ("in romaanse stijl") of null. */
  function deelStijl(waarden) {
    for (const w of waarden || []) {
      if (STIJLEN[w.id]) return STIJLEN[w.id];
    }
    for (const w of waarden || []) {
      if (!isBegripLabel(w)) continue;
      const l = w.label.toLowerCase().trim();
      if (STIJL_WOORDEN[l]) return STIJL_WOORDEN[l];
      const m = /^(\S+e) (architectuur|bouwkunst|bouwstijl|stijl)$/.exec(l);
      if (m) return 'in ' + m[1] + ' stijl';
    }
    return null;
  }

  /** "ontworpen door X" (P84) of anders "gemaakt door X" (P170). */
  function deelMaker(p84, p170) {
    const namen = (lijst) => (lijst || []).filter((w) => w.label).slice(0, MAX_WAARDEN).map((w) => w.label);
    const architecten = namen(p84);
    if (architecten.length) return 'ontworpen door ' + metEn(architecten);
    const makers = namen(p170);
    if (makers.length) return 'gemaakt door ' + metEn(makers);
    return null;
  }

  function deelMateriaal(waarden) {
    const nl = (waarden || []).filter(isBegripLabel).slice(0, MAX_WAARDEN).map((w) => w.label.toLowerCase());
    return nl.length ? 'van ' + metEn(nl) : null;
  }

  /** Erfgoedstatus: bekende waarden → "beschermd monument", anders NL-label. */
  function deelStatus(waarden) {
    const lijst = waarden || [];
    if (lijst.some((w) => STATUS_BESCHERMD_QIDS.includes(w.id) || (w.label && STATUS_BESCHERMD_RE.test(w.label)))) {
      return 'beschermd monument';
    }
    const nl = lijst.find((w) => w.label && w.lang === ZIN_TAAL);
    return nl ? nl.label.toLowerCase() : null;
  }

  /**
   * Bouwt de zin voor één POI.
   *
   * @param {object} eig - eigenschappen zoals parseZinResults() ze levert
   * @param {object} [options] - { minOnderdelen, maxTekens }
   * @returns {{ zin: ?string, diagnose: object }}
   */
  function maakZin(eig, options) {
    const opts = options || {};
    const minOnderdelen = opts.minOnderdelen === undefined ? MIN_ONDERDELEN : opts.minOnderdelen;
    const maxTekens = opts.maxTekens || MAX_TEKENS;
    const e = eig || {};
    const diagnose = { soort: null, gebruikt: [], overgeslagen: [], reden: null };

    const soort = bepaalSoort(e.P31);
    if (!soort) {
      const labels = (e.P31 || []).map((w) => (w.label ? w.label + ' (' + w.lang + ')' : w.id));
      diagnose.reden = 'geen Nederlandse soortnaam' + (labels.length ? ': ' + labels.join(', ') : ' (geen P31)');
      return { zin: null, diagnose };
    }
    diagnose.soort = soort.id + ' → ' + soort.naam;

    // Onderdelen in zinsvolgorde; `prio` bepaalt wat bij te lange zinnen
    // eerst wegvalt (hoogste prio-getal eerst).
    const delen = [];
    function voegToe(eigNaam, tekst, prio, overslaanReden) {
      if (tekst) {
        delen.push({ eig: eigNaam, tekst, prio });
      } else if (overslaanReden) {
        diagnose.overgeslagen.push(eigNaam + ': ' + overslaanReden);
      }
    }
    function waardenTekst(lijst) {
      return (lijst || []).map((w) => (w.label ? '"' + w.label + '" (' + w.lang + ')' : w.id)).join(', ');
    }

    if (e.P417) voegToe('P417', deelToewijding(e.P417), 1, 'geen bruikbare naam: ' + waardenTekst(e.P417));
    if (e.P547) voegToe('P547', deelHerdenkt(e.P547), 1, 'geen bruikbaar label: ' + waardenTekst(e.P547));

    // Tijd (P571, anders P1619) met eventueel de stijl erachter.
    const tijdEig = kiesTijd(e.P571) ? 'P571' : kiesTijd(e.P1619) ? 'P1619' : null;
    const stijl = deelStijl(e.P149);
    if (e.P149 && !stijl) diagnose.overgeslagen.push('P149: geen Nederlandse stijl: ' + waardenTekst(e.P149));
    if (tijdEig) {
      const t = tijdAanduiding(kiesTijd(e[tijdEig]));
      const ww = soort.groep && WERKWOORDEN[soort.groep] ? WERKWOORDEN[soort.groep][tijdEig] : null;
      let tekst = ww ? ww + ' ' + t.bij : t.uit;
      let eigen = tijdEig;
      if (stijl && ww === 'gebouwd') {
        tekst += ' ' + stijl;
        eigen += '+P149';
      }
      delen.push({ eig: eigen, tekst, prio: 1 });
      if (stijl && ww !== 'gebouwd') voegToe('P149', stijl, 3);
    } else {
      if (e.P571 || e.P1619) diagnose.overgeslagen.push('tijd: te grove precisie');
      if (stijl) voegToe('P149', stijl, 3);
    }

    voegToe('P84/P170', deelMaker(e.P84, e.P170), 3, e.P84 || e.P170 ? 'geen naam' : null);

    const status = deelStatus(e.P1435);
    if (e.P1435 && !status) diagnose.overgeslagen.push('P1435: onbekende status: ' + waardenTekst(e.P1435));

    // Materiaal alleen als er verder weinig te zeggen is.
    const zonderMateriaal = delen.length + (status ? 1 : 0);
    if (e.P186 && zonderMateriaal < minOnderdelen) {
      voegToe('P186', deelMateriaal(e.P186), 4, 'geen Nederlands label: ' + waardenTekst(e.P186));
    }
    if (status) delen.push({ eig: 'P1435', tekst: status, prio: 2 });

    if (delen.length < minOnderdelen) {
      diagnose.gebruikt = delen.map((d) => d.eig);
      diagnose.reden = 'te weinig onderdelen (' + delen.length + ' van ' + minOnderdelen + ')';
      return { zin: null, diagnose };
    }

    // Te lang: onderdelen met de hoogste prio laten vallen, zolang er
    // genoeg overblijven.
    function opbouw(lijst) {
      return hoofdletter(soort.naam) + ' ' + lijst.map((d) => d.tekst).join(', ') + '.';
    }
    let lijst = delen.slice();
    while (opbouw(lijst).length > maxTekens && lijst.length > minOnderdelen) {
      let weg = 0;
      lijst.forEach((d, i) => {
        if (d.prio >= lijst[weg].prio) weg = i;
      });
      diagnose.overgeslagen.push(lijst[weg].eig + ': zin te lang');
      lijst = lijst.filter((_, i) => i !== weg);
    }
    diagnose.gebruikt = lijst.map((d) => d.eig);
    return { zin: opbouw(lijst), diagnose };
  }

  /** Summary in het formaat van wikipedia-summary.js, plus lang en viaWikidata. */
  function maakSummary(poi, zin) {
    return {
      title: poi.label || poi.id,
      extract: zin,
      extractShort: zin,
      thumbnailUrl: null,
      pageUrl: 'https://www.wikidata.org/wiki/' + poi.id,
      lang: ZIN_TAAL,
      attribution: 'Samengesteld uit Wikidata (CC0)',
      viaWikidata: true,
    };
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

  async function haalEigenschappen(ids, options) {
    const opts = options || {};
    const fetchImpl = opts.fetchImpl || fetch;
    const url = WIKIDATA_SPARQL_ENDPOINT + '?format=json&query=' + encodeURIComponent(buildZinQuery(ids));
    const headers = { Accept: 'application/sparql-results+json' };
    if (opts.userAgent) headers['User-Agent'] = opts.userAgent;
    let laatsteFout = null;
    for (let poging = 0; poging < 2; poging++) {
      try {
        const res = await fetchMetTimeout(fetchImpl, url, { headers }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);
        if (res.ok) return parseZinResults(await res.json());
        laatsteFout = new Error('Wikidata (eigenschappen) HTTP ' + res.status);
        if (![429, 500, 502, 503, 504].includes(res.status)) break;
      } catch (err) {
        laatsteFout = err;
      }
      await new Promise((r) => setTimeout(r, opts.retryDelayMs === undefined ? 3000 : opts.retryDelayMs));
    }
    throw laatsteFout || new Error('Wikidata (eigenschappen) mislukt');
  }

  /**
   * Voor een lijst POI's zonder artikel: een Nederlandse zin uit Wikidata.
   * Mislukt een query, dan gooit deze functie.
   *
   * @param {Array<{id:string,label:string}>} pois
   * @param {object} [options]
   * @param {number} [options.blokGrootte=80] - QID's per query
   * @param {number} [options.minOnderdelen=2]
   * @param {number} [options.maxTekens=200]
   * @param {Function} [options.fetchImpl] - voor tests
   * @returns {Promise<Object<string, {summary:?object, diagnose:object}>>}
   */
  async function haalWikidataZinnen(pois, options) {
    const opts = options || {};
    const lijst = (pois || []).filter((p) => p && /^Q[0-9]+$/.test(p.id || ''));
    const resultaat = {};
    if (lijst.length === 0) return resultaat;
    const ids = Array.from(new Set(lijst.map((p) => p.id)));
    const blok = Math.max(1, opts.blokGrootte || BLOK_GROOTTE);
    const eigenschappen = {};
    for (let i = 0; i < ids.length; i += blok) {
      Object.assign(eigenschappen, await haalEigenschappen(ids.slice(i, i + blok), opts));
    }
    for (const poi of lijst) {
      const { zin, diagnose } = maakZin(eigenschappen[poi.id], opts);
      resultaat[poi.id] = { summary: zin ? maakSummary(poi, zin) : null, diagnose };
    }
    return resultaat;
  }

  return {
    ZIN_TAAL,
    LABEL_TALEN,
    MIN_ONDERDELEN,
    MAX_TEKENS,
    SOORTEN,
    STIJLEN,
    STATUS_BESCHERMD_QIDS,
    buildZinQuery,
    parseZinResults,
    jaarUit,
    bepaalSoort,
    heiligeNaam,
    deelToewijding,
    metLidwoord,
    deelHerdenkt,
    eeuwVan,
    tijdAanduiding,
    kiesTijd,
    deelStijl,
    deelMaker,
    deelMateriaal,
    deelStatus,
    maakZin,
    maakSummary,
    haalWikidataZinnen,
  };
});
