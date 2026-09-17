/**
 * poi-categories.js
 *
 * Vaste, herkenbare categorieën waaruit de gebruiker vóór het starten van
 * de Wikidata-zoekopdracht kan kiezen (aanvinklijstje) — zodat WikiPoi
 * alleen categorieën ophaalt die voor déze tocht relevant zijn, zonder dat
 * de gebruiker ook maar iets van Wikidata-QID's hoeft te weten.
 *
 * Elke categorie is gekoppeld aan één of meer Wikidata-QID's. Die worden
 * gebruikt als `instanceOf`-filter voor wikidata-search.js: een kandidaat
 * komt alleen mee als hij "instance of / subclass of" één van de QID's van
 * een aangevinkte categorie is.
 *
 * ACHTERGROND (n.a.v. de live testquery rond Lochem, 16 sept. 2026):
 * zonder filter kwamen naast een écht bruikbaar resultaat ("Ontzet van
 * Lochem", een belegering) ook een gemeente ("Lochem") en een sportclub
 * ("Lochemse Hockey Club") mee — beide zonder filter niet te onderscheiden
 * van interessante bezienswaardigheden. Alle QID's hieronder zijn
 * geverifieerd tegen Wikidata (niet uit het geheugen aangenomen).
 *
 * Werkt zowel als CommonJS-module (Node) als los <script> in de browser,
 * naar analogie van de andere WikiPoi-modules.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WikiPoiCategories = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Elke categorie:
   * - key: technische sleutel (stabiel, gebruik dit in opgeslagen
   *   gebruikersvoorkeuren — niet het label, dat kan nog wijzigen)
   * - labels: vertalingen van het label voor het aanvinklijstje, per
   *   taalcode (bijv. {nl: 'Kerken', en: 'Churches', ...})
   * - descriptions: vertalingen van een korte toelichting (optioneel te
   *   tonen, bijv. als tooltip), zelfde structuur als labels
   * - qids: Wikidata-QID's waarop gefilterd wordt (instance of / subclass of)
   * - osmTags: OpenStreetMap-tagfilters voor osm-fallback.js — een array
   *   van filtergroepen; elke filtergroep is een array van {key, value}
   *   (AND binnen een groep, OR tussen groepen). Gebruikt als Wikidata
   *   niets opleverde voor deze categorie in een bepaald gebied.
   * - defaultEnabled: of deze categorie standaard is aangevinkt
   * - searchRadiusMeters (optioneel): overschrijft voor déze categorie de
   *   standaard zoekstraal die poc-gpx-naar-csv.js/runPipeline() gebruikt
   *   (searchRadiusMeters-parameter daar, standaard 400m). Weggelaten of
   *   niet gezet ⇒ de categorie gebruikt gewoon de standaardstraal. Nodig
   *   voor categorieën met een van nature hoge dichtheid — bijv. de
   *   toekomstige "Gebouwd erfgoed"-categorie (rijksmonumenten), waar rond
   *   Zutphen al 20+ treffers in één klein gebied werden gevonden; die zal
   *   searchRadiusMeters: 150 krijgen zodra hij wordt toegevoegd. Zie
   *   groupSelectedKeysByRadius() hieronder voor hoe de pijplijn hiermee
   *   omgaat.
   */
  const CATEGORIES = [
    {
      key: 'kerken',
      labels: { nl: 'Kerken', en: 'Churches', fr: 'Églises', de: 'Kirchen', es: 'Iglesias' },
      descriptions: {
        nl: 'Kerkgebouwen',
        en: 'Church buildings',
        fr: 'Édifices religieux',
        de: 'Kirchengebäude',
        es: 'Edificios religiosos',
      },
      qids: ['Q16970'], // church building
      osmTags: [[{ key: 'amenity', value: 'place_of_worship' }, { key: 'religion', value: 'christian' }]],
      defaultEnabled: true,
    },
    {
      key: 'molens',
      labels: { nl: 'Molens', en: 'Windmills', fr: 'Moulins', de: 'Mühlen', es: 'Molinos' },
      descriptions: {
        nl: 'Wind- en watermolens',
        en: 'Wind and water mills',
        fr: 'Moulins à vent et à eau',
        de: 'Wind- und Wassermühlen',
        es: 'Molinos de viento y de agua',
      },
      qids: ['Q38720'], // windmill
      osmTags: [[{ key: 'man_made', value: 'windmill' }]],
      defaultEnabled: true,
    },
    {
      key: 'musea',
      labels: { nl: 'Musea', en: 'Museums', fr: 'Musées', de: 'Museen', es: 'Museos' },
      descriptions: {
        nl: 'Musea en tentoonstellingsruimtes',
        en: 'Museums and exhibition spaces',
        fr: "Musées et espaces d'exposition",
        de: 'Museen und Ausstellungsräume',
        es: 'Museos y espacios de exposición',
      },
      qids: ['Q33506'], // museum
      osmTags: [[{ key: 'tourism', value: 'museum' }]],
      defaultEnabled: false,
    },
    {
      key: 'kastelen',
      labels: { nl: 'Kastelen', en: 'Castles', fr: 'Châteaux', de: 'Burgen und Schlösser', es: 'Castillos' },
      descriptions: {
        nl: 'Kastelen en vestingwerken',
        en: 'Castles and fortifications',
        fr: 'Châteaux et fortifications',
        de: 'Burgen und Festungsanlagen',
        es: 'Castillos y fortificaciones',
      },
      qids: ['Q23413'], // castle
      osmTags: [[{ key: 'historic', value: 'castle' }]],
      defaultEnabled: true,
    },
    {
      key: 'oorlogsgeschiedenis',
      labels: {
        nl: 'Oorlogsgeschiedenis',
        en: 'War history',
        fr: 'Histoire de guerre',
        de: 'Kriegsgeschichte',
        es: 'Historia bélica',
      },
      descriptions: {
        nl: 'Veldslagen, belegeringen en oorlogsmonumenten (bijv. WO II of het Beleg van Lochem)',
        en: 'Battles, sieges and war memorials (e.g. WWII or the Siege of Lochem)',
        fr: 'Batailles, sièges et monuments commémoratifs de guerre (p. ex. la Seconde Guerre mondiale ou le siège de Lochem)',
        de: 'Schlachten, Belagerungen und Kriegsdenkmäler (z. B. Zweiter Weltkrieg oder die Belagerung von Lochem)',
        es: 'Batallas, asedios y monumentos conmemorativos de guerra (p. ej. la Segunda Guerra Mundial o el asedio de Lochem)',
      },
      qids: [
        'Q178561', // battle
        'Q188055', // siege
        'Q575759', // war memorial
      ],
      osmTags: [
        [{ key: 'historic', value: 'memorial' }, { key: 'memorial', value: 'war_memorial' }],
        [{ key: 'historic', value: 'battlefield' }],
      ],
      defaultEnabled: true,
    },
    {
      key: 'archeologie',
      labels: { nl: 'Archeologie', en: 'Archaeology', fr: 'Archéologie', de: 'Archäologie', es: 'Arqueología' },
      descriptions: {
        nl: 'Archeologische vindplaatsen',
        en: 'Archaeological sites',
        fr: 'Sites archéologiques',
        de: 'Archäologische Fundstätten',
        es: 'Yacimientos arqueológicos',
      },
      qids: ['Q839954'], // archaeological site
      osmTags: [[{ key: 'historic', value: 'archaeological_site' }]],
      defaultEnabled: false,
    },
    {
      key: 'natuur',
      labels: {
        nl: 'Natuurgebieden',
        en: 'Nature reserves',
        fr: 'Réserves naturelles',
        de: 'Naturschutzgebiete',
        es: 'Reservas naturales',
      },
      descriptions: {
        nl: 'Beschermde natuurgebieden',
        en: 'Protected nature reserves',
        fr: 'Réserves naturelles protégées',
        de: 'Geschützte Naturschutzgebiete',
        es: 'Reservas naturales protegidas',
      },
      qids: ['Q179049'], // nature reserve
      osmTags: [[{ key: 'leisure', value: 'nature_reserve' }]],
      defaultEnabled: false,
    },

    // ---------------------------------------------------------------
    // Vanaf hier: 4 nieuwe verzamelcategorieën (toegevoegd n.a.v. de
    // dichtheids-/QID-verificatiesessie van 17 sept. 2026). Elke
    // categorie hieronder dekt meerdere subtypes, gekozen boven 10
    // losse, smalle categorieën om de UI overzichtelijk te houden — zie
    // de description hieronder voor de subtypes die elke categorie dekt.
    // Per subtype/QID staat in een comment aangegeven hoe hard het is
    // getest:
    //   [geverifieerd] — live tegen Wikidata getest met een specifiek
    //                    testscript en bevestigd
    //   [afgeleid]     — gevonden via een bredere labelzoekopdracht;
    //                    aannemelijk, maar niet 1-op-1 herbevestigd
    //                    tegen een los, onafhankelijk voorbeeld
    //   [aanname]      — UIT HET GEHEUGEN, NIET live getest; loop hier
    //                    dus rekening mee dat dit een keer mis kan zijn
    //                    (zoals eerder bij de gemaal-QID gebeurde)
    // ---------------------------------------------------------------
    {
      key: 'gebouwd_erfgoed',
      labels: {
        nl: 'Gebouwd erfgoed',
        en: 'Built heritage',
        fr: 'Patrimoine bâti',
        de: 'Baudenkmäler',
        es: 'Patrimonio construido',
      },
      descriptions: {
        nl: 'Rijksmonumenten: o.a. kerken, molens, boerderijen, kloosters, industrieel erfgoed en begraafplaatsen',
        en: 'National heritage sites: e.g. churches, mills, farmhouses, monasteries, industrial heritage and cemeteries',
        fr: "Monuments nationaux : églises, moulins, fermes, monastères, patrimoine industriel, cimetières, etc.",
        de: 'Nationaldenkmäler: u. a. Kirchen, Mühlen, Bauernhöfe, Klöster, Industriedenkmäler und Friedhöfe',
        es: 'Monumentos nacionales: iglesias, molinos, granjas, monasterios, patrimonio industrial, cementerios, etc.',
      },
      // Geen qids: deze categorie gebruikt hasProperty i.p.v. instanceOf
      // (zie wikidata-search.js#buildBoxQuery) — een rijksmonument is
      // geen aparte Wikidata-KLASSE, maar elk type gebouw (kerk, molen,
      // boerderij, ...) dat toevallig de eigenschap P359 heeft.
      qids: [],
      hasProperty: 'P359', // [geverifieerd] "Rijksmonument ID" — live bevestigd, 20 treffers rond Zutphen
      osmTags: [
        [{ key: 'heritage', value: '2' }], // [geverifieerd, Nederlandse rijksmonumenten]
        // ref:rce=* (aanwezigheid van een RCE-nummer, ongeacht de
        // waarde) zou eigenlijk ook moeten meetellen, maar het huidige
        // osmTags-schema ondersteunt alleen exacte key/value-paren, geen
        // "aanwezig, ongeacht waarde"-wildcard. Nog op te pakken in
        // osm-fallback.js als je dit alsnog wilt toevoegen.
      ],
      // Hoge dichtheid geconstateerd (20+ in één klein gebied rond
      // Zutphen) — kleinere straal dan de standaard ~400m, gecombineerd
      // met de trigger-preview om de rest te filteren (besluit 17 sept. 2026).
      searchRadiusMeters: 150,
      defaultEnabled: false,
    },
    {
      key: 'prehistorie_archeologie',
      labels: {
        nl: 'Prehistorie & archeologie',
        en: 'Prehistory & archaeology',
        fr: 'Préhistoire et archéologie',
        de: 'Vorgeschichte & Archäologie',
        es: 'Prehistoria y arqueología',
      },
      descriptions: {
        nl: 'Hunebedden, grafheuvels, en vestingwerken/stadswallen',
        en: 'Dolmens, burial mounds, and fortifications/city walls',
        fr: 'Dolmens, tumulus et fortifications/remparts',
        de: 'Hünengräber, Grabhügel und Festungsanlagen/Stadtmauern',
        es: 'Dólmenes, túmulos y fortificaciones/murallas',
      },
      qids: [
        'Q839954', // [geverifieerd] archaeological site — dekt hunebedden al automatisch mee
        // via de subclass-hiërarchie (P31/P279*) in wikidata-search.js;
        // live getest: een hunebed-item bleek hier al onder te vallen,
        // dus GEEN aparte hunebed-QID nodig. Overlapt met de bestaande,
        // los aanvinkbare "archeologie"-categorie hierboven — geen
        // probleem, qidsForKeys() dedupliceert QID's toch al.
        'Q127418', // [aanname, NIET geverifieerd] burial mound (grafheuvel)
        'Q91203', // [afgeleid] schans (uit labelzoekopdracht "schans", Naarden/Bourtange/Achterhoek)
        'Q57821', // [afgeleid] verdedigingswerk/fortification (idem)
      ],
      osmTags: [
        [{ key: 'historic', value: 'archaeological_site' }],
        [{ key: 'historic', value: 'tumulus' }],
        [{ key: 'historic', value: 'citywalls' }],
        [{ key: 'historic', value: 'fort' }],
      ],
      defaultEnabled: false,
    },
    {
      key: 'waterstaat_infrastructuur',
      labels: {
        nl: 'Waterstaat & infrastructuur',
        en: 'Water management & infrastructure',
        fr: 'Gestion des eaux et infrastructures',
        de: 'Wasserbau & Infrastruktur',
        es: 'Gestión del agua e infraestructura',
      },
      descriptions: {
        nl: 'Vuurtorens, sluizen, gemalen en historische bruggen (bruggen vooral via Gebouwd erfgoed)',
        en: 'Lighthouses, locks, pumping stations and historic bridges (bridges mostly via Built heritage)',
        fr: 'Phares, écluses, stations de pompage et ponts historiques (ponts surtout via Patrimoine bâti)',
        de: 'Leuchttürme, Schleusen, Schöpfwerke und historische Brücken (Brücken meist über Baudenkmäler)',
        es: 'Faros, esclusas, estaciones de bombeo y puentes históricos (puentes sobre todo vía Patrimonio construido)',
      },
      qids: [
        'Q39715', // [aanname, eerder als "reeds bevestigd" genoteerd — niet in DEZE sessie herverifieerd] lighthouse
        'Q105731', // [geverifieerd] schutsluis (lock)
        'Q446013', // [geverifieerd] pompgemaal (pumping station)
        'Q2230272', // [geverifieerd] dieselgemaal (subtype van pompgemaal, apart opgenomen i.p.v. aangenomen subklasse-verband)
        // Historische bruggen: GEEN aparte QID. Alle "brug"-treffers met
        // een duidelijk historisch karakter bleken zelf Rijksmonumenten
        // te zijn — die vallen al onder "Gebouwd erfgoed" (P359). Een
        // aparte QID voor "historische brug" bestaat niet in Wikidata;
        // Q12280 (brug) is te generiek om hier te gebruiken.
      ],
      osmTags: [
        [{ key: 'man_made', value: 'lighthouse' }], // [geverifieerd]
        [{ key: 'waterway', value: 'lock' }], // [geverifieerd]
        [{ key: 'waterway', value: 'lock_gate' }], // [geverifieerd]
        [{ key: 'man_made', value: 'pumping_station' }], // [geverifieerd]
      ],
      defaultEnabled: false,
    },
    {
      key: 'kunst_gedenktekens',
      labels: {
        nl: 'Kunst & gedenktekens',
        en: 'Art & memorials',
        fr: 'Art et monuments commémoratifs',
        de: 'Kunst & Gedenkstätten',
        es: 'Arte y monumentos conmemorativos',
      },
      descriptions: {
        nl: 'Standbeelden en gedenktekens (niet-oorlogsgerelateerd; oorlogsmonumenten staan al bij Oorlogsgeschiedenis)',
        en: 'Statues and memorials (non-war; war memorials are already under War history)',
        fr: 'Statues et monuments commémoratifs (hors guerre ; les monuments aux morts sont déjà sous Histoire de guerre)',
        de: 'Statuen und Gedenkstätten (nicht kriegsbezogen; Kriegsdenkmäler siehe bereits Kriegsgeschichte)',
        es: 'Estatuas y monumentos conmemorativos (no bélicos; los monumentos de guerra ya están en Historia bélica)',
      },
      qids: [
        'Q179700', // [aanname, NIET geverifieerd] statue (standbeeld)
        'Q11734477', // [afgeleid] gedenksteen — uit labelzoekopdracht "monument", meestal samen met oorlogsmonument gevonden
        'Q721747', // [afgeleid] gedenkplaat
        'Q51845395', // [afgeleid] gedenkzuil
        'Q1497483', // [afgeleid] gedenkkruis
        'Q6023295', // [afgeleid] funeraire architectuur
      ],
      osmTags: [
        [{ key: 'tourism', value: 'artwork' }],
        [{ key: 'historic', value: 'memorial' }],
      ],
      defaultEnabled: false,
    },
  ];

  const DEFAULT_UI_LANGUAGE = 'nl';
  const SUPPORTED_UI_LANGUAGES = ['nl', 'en', 'fr', 'de', 'es'];

  /**
   * Kiest de tekst in de gevraagde taal uit een vertaaltabel, met een
   * terugvalketen: gevraagde taal → Nederlands (de "brontaal" waarin
   * alles gegarandeerd bestaat) → Engels → de eerste vertaling die er
   * toevallig is (zou niet moeten voorkomen bij de huidige, complete
   * vertaaltabellen, maar voorkomt een crash mocht een categorie ooit
   * onvolledig vertaald worden toegevoegd).
   */
  function resolveTranslation(translations, uiLanguage) {
    return (
      translations[uiLanguage] ||
      translations[DEFAULT_UI_LANGUAGE] ||
      translations.en ||
      Object.values(translations)[0]
    );
  }

  /**
   * De taalcodes waarvoor de categorienamen daadwerkelijk vertaald zijn.
   */
  function getSupportedUiLanguages() {
    return SUPPORTED_UI_LANGUAGES.slice();
  }

  /**
   * Haalt de primaire taalsubtag uit een BCP47-achtige locale-string, bijv.
   * "fr-FR" → "fr", "pt_BR" → "pt", "de-DE" → "de". Hoofdletterongevoelig.
   * Geeft null terug als er geen bruikbare taalcode uit te halen valt.
   */
  function normalizeLocale(locale) {
    if (!locale) return null;
    const primary = String(locale).split(/[-_]/)[0].toLowerCase();
    return /^[a-z]{2,3}$/.test(primary) ? primary : null;
  }

  /**
   * Bepaalt welke UI-taal gebruikt moet worden op basis van de
   * apparaat-/browserlocale van de gebruiker (bijv. `navigator.language`
   * in een PWA, of het Capacitor-equivalent in de native app — het
   * uitlezen daarvan is aan de aanroeper, deze functie doet alleen de
   * vertaling naar "wat kan WikiPoi ermee").
   *
   * Staat de taal van het apparaat in de ondersteunde lijst
   * (getSupportedUiLanguages()), dan wordt die gebruikt. Staat hij er
   * niet in (bijv. Portugees, Italiaans, Pools), dan valt de UI terug op
   * Engels — expliciet gekozen in plaats van Nederlands, omdat Engels
   * voor een willekeurige buitenlandse toerist een neutralere/breder
   * begrepen keuze is dan Nederlands.
   *
   * @param {string} [deviceLocale] - bijv. "fr-FR", "pt-BR", "nl"
   * @returns {string} een taalcode uit getSupportedUiLanguages()
   */
  function resolveUiLanguage(deviceLocale) {
    const primary = normalizeLocale(deviceLocale);
    if (primary && SUPPORTED_UI_LANGUAGES.includes(primary)) {
      return primary;
    }
    return 'en';
  }

  /**
   * Bouwt, op basis van diezelfde apparaatlocale, de taalprioriteitsketen
   * die direct als `languages`-optie aan
   * wikidata-search.js#searchWikidataBox() kan worden meegegeven — zodat
   * de UI-taal en de inhoud-taal met één instelling in de pas lopen.
   *
   * De keten is: [herkende voorkeurstaal, 'en', 'nl'] (dubbele talen
   * verwijderd) — dus bij een niet-ondersteunde apparaattaal wordt dat
   * gewoon ['en', 'nl']. Nederlands staat altijd als laatste vangnet in
   * de keten, ongeacht de voorkeurstaal, omdat dat nu eenmaal de taal is
   * waarin de meeste Nederlandse POI's het rijkst gedocumenteerd zijn.
   *
   * @param {string} [deviceLocale]
   * @returns {string[]}
   */
  function getContentLanguageChain(deviceLocale) {
    const uiLanguage = resolveUiLanguage(deviceLocale);
    const chain = [uiLanguage];
    if (!chain.includes('en')) chain.push('en');
    if (!chain.includes('nl')) chain.push('nl');
    return chain;
  }

  /**
   * Geeft de volledige categorie-tabel terug, bijv. om een aanvinklijstje
   * mee op te bouwen in de UI. `label` en `description` zijn — net als
   * voorheen — gewone strings; welke taal dat is, bepaalt `uiLanguage`
   * (standaard Nederlands, zoals altijd).
   *
   * @param {string} [uiLanguage='nl'] - taalcode voor label/description,
   *   bijv. 'fr' voor een Franstalige gebruiker
   */
  function getCategories(uiLanguage) {
    const lang = uiLanguage || DEFAULT_UI_LANGUAGE;
    // Kopie teruggeven zodat de aanroeper de vaste tabel niet per ongeluk
    // kan muteren.
    return CATEGORIES.map((c) => ({
      key: c.key,
      label: resolveTranslation(c.labels, lang),
      description: resolveTranslation(c.descriptions, lang),
      qids: c.qids.slice(),
      osmTags: c.osmTags.map((group) => group.map((tag) => Object.assign({}, tag))),
      defaultEnabled: c.defaultEnabled,
      searchRadiusMeters: c.searchRadiusMeters || null,
      hasProperty: c.hasProperty || null,
    }));
  }

  /**
   * De keys van de categorieën die standaard aangevinkt zouden moeten
   * staan wanneer de gebruiker de zoekopdracht voor het eerst opent.
   */
  function getDefaultSelectedKeys() {
    return CATEGORIES.filter((c) => c.defaultEnabled).map((c) => c.key);
  }

  /**
   * Zet een lijst van aangevinkte categorie-keys (zoals door de UI
   * teruggegeven) om naar een platte, gededupliceerde lijst van
   * Wikidata-QID's — direct bruikbaar als `instanceOf`-optie voor
   * wikidata-search.js: buildBoxQuery(bbox, { instanceOf: qidsFor(keys) }).
   *
   * Onbekende keys worden genegeerd (geen foutmelding) zodat een oude,
   * opgeslagen selectie van de gebruiker niet crasht als een categorie
   * ooit hernoemd of verwijderd wordt.
   *
   * @param {string[]} selectedKeys
   * @returns {string[]} unieke Wikidata-QID's
   */
  function qidsForKeys(selectedKeys) {
    const keys = new Set(selectedKeys || []);
    const qids = new Set();
    for (const category of CATEGORIES) {
      if (keys.has(category.key)) {
        for (const qid of category.qids) {
          qids.add(qid);
        }
      }
    }
    return Array.from(qids);
  }

  /**
   * Zet een lijst van aangevinkte categorie-keys om naar een platte lijst
   * van OSM-tagfiltergroepen — direct bruikbaar voor osm-fallback.js.
   * Elke filtergroep is een array van {key, value}-paren (AND binnen een
   * groep); de teruggegeven array is de OR van alle groepen van alle
   * aangevinkte categorieën. Onbekende keys worden net als bij
   * qidsForKeys() stilzwijgend genegeerd.
   *
   * @param {string[]} selectedKeys
   * @returns {Array<Array<{key:string, value:string}>>}
   */
  function osmTagFiltersForKeys(selectedKeys) {
    const keys = new Set(selectedKeys || []);
    const groups = [];
    for (const category of CATEGORIES) {
      if (keys.has(category.key)) {
        for (const group of category.osmTags) {
          groups.push(group.map((tag) => Object.assign({}, tag)));
        }
      }
    }
    return groups;
  }

  /**
   * Zet een lijst van aangevinkte categorie-keys om naar een platte,
   * gededupliceerde lijst van Wikidata-property-ID's (PID's, bijv.
   * 'P359') van categorieën die een hasProperty-filter gebruiken in
   * plaats van (of naast) instanceOf-QID's — zie wikidata-search.js#
   * buildBoxQuery() voor hoe deze modus werkt. Op dit moment gebruikt
   * alléén "Gebouwd erfgoed" (P359) deze modus.
   *
   * LET OP — nog niet aangesloten op poc-gpx-naar-csv.js: de pijplijn
   * roept momenteel alleen qidsForKeys()/instanceOf aan; om een
   * hasProperty-categorie als "Gebouwd erfgoed" daadwerkelijk te laten
   * meezoeken is een aanvullende aanpassing aan runPipeline() nodig (een
   * aparte Wikidata-aanroep per hasProperty-waarde, naast de bestaande
   * instanceOf-aanroep per straal-groep). Deze functie levert alvast de
   * bouwsteen daarvoor.
   *
   * @param {string[]} selectedKeys
   * @returns {string[]} unieke property-ID's (PID's)
   */
  function hasPropertyForKeys(selectedKeys) {
    const keys = new Set(selectedKeys || []);
    const properties = new Set();
    for (const category of CATEGORIES) {
      if (keys.has(category.key) && category.hasProperty) {
        properties.add(category.hasProperty);
      }
    }
    return Array.from(properties);
  }

  /**
   * Groepeert aangevinkte categorie-keys op hun EFFECTIEVE zoekstraal —
   * dat is category.searchRadiusMeters als die gezet is, anders
   * defaultRadiusMeters. Bedoeld voor poc-gpx-naar-csv.js/runPipeline():
   * omdat verschillende categorieën verschillende zoekstralen kunnen
   * hebben (bijv. een dichte categorie als toekomstige "Gebouwd erfgoed"
   * op 150m, de rest op de standaard ~400m), kan de pijplijn niet langer
   * met één gedeelde bounding box werken. Deze functie levert de indeling
   * waarmee de pijplijn per straal een aparte bbox + Wikidata/OSM-
   * zoekopdracht kan uitvoeren.
   *
   * Bevatten alle aangevinkte categorieën geen eigen searchRadiusMeters
   * (de situatie voor alle 7 huidige categorieën), dan levert dit precies
   * ÉÉN groep op met defaultRadiusMeters — het gedrag van de pijplijn
   * blijft dan identiek aan vóór deze functie bestond.
   *
   * Onbekende keys worden, net als bij qidsForKeys() en
   * osmTagFiltersForKeys(), stilzwijgend genegeerd.
   *
   * @param {string[]} selectedKeys
   * @param {number} defaultRadiusMeters - straal voor categorieën zonder
   *   eigen searchRadiusMeters (in de pijplijn: DEFAULT_SEARCH_RADIUS_M of
   *   de door de gebruiker opgegeven waarde)
   * @returns {Array<{radiusMeters:number, keys:string[]}>} groepen, in de
   *   volgorde waarin de eerste categorie van elke groep in CATEGORIES
   *   voorkomt (deterministisch, handig voor voorspelbare logregels)
   */
  function groupSelectedKeysByRadius(selectedKeys, defaultRadiusMeters) {
    const keys = new Set(selectedKeys || []);
    const order = []; // volgorde waarin radii voor het eerst gezien worden
    const keysByRadius = new Map();
    for (const category of CATEGORIES) {
      if (!keys.has(category.key)) continue;
      const radius = category.searchRadiusMeters || defaultRadiusMeters;
      if (!keysByRadius.has(radius)) {
        keysByRadius.set(radius, []);
        order.push(radius);
      }
      keysByRadius.get(radius).push(category.key);
    }
    return order.map((radiusMeters) => ({
      radiusMeters,
      keys: keysByRadius.get(radiusMeters),
    }));
  }

  return {
    getCategories,
    getDefaultSelectedKeys,
    qidsForKeys,
    hasPropertyForKeys,
    osmTagFiltersForKeys,
    groupSelectedKeysByRadius,
    getSupportedUiLanguages,
    resolveUiLanguage,
    getContentLanguageChain,
  };
});
