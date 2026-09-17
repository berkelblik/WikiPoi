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
   * - label: Nederlandse tekst voor het aanvinklijstje
   * - description: korte toelichting (optioneel te tonen, bijv. als tooltip)
   * - qids: Wikidata-QID's waarop gefilterd wordt (instance of / subclass of)
   * - osmTags: OpenStreetMap-tagfilters voor osm-fallback.js — een array
   *   van filtergroepen; elke filtergroep is een array van {key, value}
   *   (AND binnen een groep, OR tussen groepen). Gebruikt als Wikidata
   *   niets opleverde voor deze categorie in een bepaald gebied.
   * - defaultEnabled: of deze categorie standaard is aangevinkt
   */
  const CATEGORIES = [
    {
      key: 'kerken',
      label: 'Kerken',
      description: 'Kerkgebouwen',
      qids: ['Q16970'], // church building
      osmTags: [[{ key: 'amenity', value: 'place_of_worship' }, { key: 'religion', value: 'christian' }]],
      defaultEnabled: true,
    },
    {
      key: 'molens',
      label: 'Molens',
      description: 'Wind- en watermolens',
      qids: ['Q38720'], // windmill
      osmTags: [[{ key: 'man_made', value: 'windmill' }]],
      defaultEnabled: true,
    },
    {
      key: 'musea',
      label: 'Musea',
      description: 'Musea en tentoonstellingsruimtes',
      qids: ['Q33506'], // museum
      osmTags: [[{ key: 'tourism', value: 'museum' }]],
      defaultEnabled: false,
    },
    {
      key: 'kastelen',
      label: 'Kastelen',
      description: 'Kastelen en vestingwerken',
      qids: ['Q23413'], // castle
      osmTags: [[{ key: 'historic', value: 'castle' }]],
      defaultEnabled: true,
    },
    {
      key: 'oorlogsgeschiedenis',
      label: 'Oorlogsgeschiedenis',
      description:
        'Veldslagen, belegeringen en oorlogsmonumenten (bijv. WO II of het Beleg van Lochem)',
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
      label: 'Archeologie',
      description: 'Archeologische vindplaatsen',
      qids: ['Q839954'], // archaeological site
      osmTags: [[{ key: 'historic', value: 'archaeological_site' }]],
      defaultEnabled: false,
    },
    {
      key: 'natuur',
      label: 'Natuurgebieden',
      description: 'Beschermde natuurgebieden',
      qids: ['Q179049'], // nature reserve
      osmTags: [[{ key: 'leisure', value: 'nature_reserve' }]],
      defaultEnabled: false,
    },
  ];

  /**
   * Geeft de volledige categorie-tabel terug, bijv. om een aanvinklijstje
   * mee op te bouwen in de UI.
   */
  function getCategories() {
    // Kopie teruggeven zodat de aanroeper de vaste tabel niet per ongeluk
    // kan muteren.
    return CATEGORIES.map((c) =>
      Object.assign({}, c, {
        qids: c.qids.slice(),
        osmTags: c.osmTags.map((group) => group.map((tag) => Object.assign({}, tag))),
      })
    );
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

  return {
    getCategories,
    getDefaultSelectedKeys,
    qidsForKeys,
    osmTagFiltersForKeys,
  };
});
