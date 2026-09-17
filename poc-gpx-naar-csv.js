#!/usr/bin/env node
/**
 * poc-gpx-naar-csv.js
 *
 * RUW proof-of-concept-script (geen onderdeel van src/) dat de WikiPoi-
 * modules aan elkaar knoopt tot één werkende pijplijn:
 *
 *   GPX-bestand
 *     → route-buffer.js       (track/route inlezen, bounding box)
 *     → poi-categories.js     (categorie-filter → Wikidata-QID's + OSM-tags,
 *                               gegroepeerd per effectieve zoekstraal)
 *     → wikidata-search.js    (kandidaat-POI's ophalen, per straal-groep)
 *     → osm-fallback.js       (draait standaard ALTIJD aanvullend mee, per straal-groep)
 *     → route-buffer.js       (werkelijke afstand tot de route berekenen)
 *     → wikipedia-summary.js  (samenvatting per kandidaat ophalen)
 *     → ÓF europoi-csv.js     (CSV met BOM/CRLF genereren)
 *       ÓF preview-html.js    (bij --preview: HTML-kaart met trigger-schuifje)
 *
 * Gebruik:
 *   node poc-gpx-naar-csv.js <invoer.gpx> [uitvoer] [zoekstraal_m] [trigger_afstand_m] [categorieën] [osm_skip_drempel] [--preview]
 *
 * Voorbeelden:
 *   node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.csv 400 75 kerken,molens,kastelen,oorlogsgeschiedenis
 *   node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.preview.html 400 75 kerken,molens --preview
 *
 * Werkwijze met --preview: eerst zonder definitieve trigger-afstand een
 * preview genereren, in de browser bekijken en met het schuifje de
 * gewenste trigger-afstand bepalen, en dán dit script ZONDER --preview
 * opnieuw draaien met die afstand als vierde argument voor de
 * definitieve CSV. De preview-stap genereert bewust geen CSV, en de
 * CSV-stap bewust geen HTML — dat houdt beide onderdelen simpel en
 * onafhankelijk testbaar.
 *
 * ZOEKSTRAAL PER CATEGORIE:
 * De <zoekstraal_m>-parameter (searchRadiusMeters) is de STANDAARDstraal
 * voor categorieën zonder eigen straal. Sommige categorieën kunnen via
 * poi-categories.js een eigen, afwijkende searchRadiusMeters hebben (bijv.
 * een dichte categorie als "Gebouwd erfgoed" op 150m, terwijl de rest op
 * de hier opgegeven standaardstraal blijft zoeken). De pijplijn groepeert
 * de geselecteerde categorieën per effectieve straal
 * (poiCategories.groupSelectedKeysByRadius()) en doet per groep een eigen
 * bounding box + Wikidata/OSM-zoekopdracht; de resultaten worden daarna
 * samengevoegd (met dedupe, ook tussen groepen onderling). Hebben alle
 * geselecteerde categorieën geen eigen straal, dan ontstaat er precies één
 * groep en is het gedrag identiek aan vóór deze groepering bestond.
 */

const fs = require('fs');
const path = require('path');

const routeBuffer = require('./src/route-buffer.js');
const poiCategories = require('./src/poi-categories.js');
const wikidataSearch = require('./src/wikidata-search.js');
const osmFallback = require('./src/osm-fallback.js');
const wikipediaSummary = require('./src/wikipedia-summary.js');
const europoiCsv = require('./src/europoi-csv.js');

const USER_AGENT = 'WikiPoi/0.1 (https://github.com/berkelblik/WikiPoi)';
const DEFAULT_SEARCH_RADIUS_M = 400;
const DEFAULT_TRIGGER_DISTANCE_M = 50;
// osm-fallback.js draait STANDAARD ALTIJD mee, naast Wikidata — een route
// (zoals een industriegebied) kan namelijk best een handvol Wikidata-
// treffers opleveren terwijl OSM daar nog veel meer te bieden heeft; het
// ruwe aantal Wikidata-treffers is geen betrouwbare graadmeter voor "is
// dit genoeg". Wil je de OSM-aanvulling toch overslaan zodra Wikidata al
// minstens N kandidaten vond (bijv. om sneller te zijn of minder "kale"
// naam-zonder-tekst-resultaten te krijgen), geef dan een eindige
// osmFallbackSkipThreshold mee. Infinity (de standaard) betekent: nooit
// overslaan. De drempel wordt PER STRAAL-GROEP toegepast (zie stap 4
// hieronder), dus op basis van hoeveel Wikidata-kandidaten die ene groep
// zelf opleverde — niet het totaal over alle groepen heen.
const DEFAULT_OSM_FALLBACK_SKIP_THRESHOLD = Infinity;
// Twee resultaten (uit Wikidata en uit OSM, eventueel uit verschillende
// straal-groepen) die dichter bij elkaar liggen dan dit worden als
// dezelfde fysieke plek beschouwd; de OSM-versie wordt dan overgeslagen
// (Wikidata/Wikipedia levert immers de rijkere tekst).
const DUPLICATE_DISTANCE_METERS = 30;

/**
 * De kernpijplijn, los van bestands-I/O en CLI-argumenten — zodat dit
 * zonder netwerktoegang getest kan worden door searchWikidataBox en
 * fetchSummariesForCandidates te vervangen door mocks.
 *
 * @param {object} options
 * @param {string} options.gpxText - inhoud van het GPX-bestand
 * @param {string} [options.routeNameFallback] - gebruikt als het GPX-bestand geen <name> heeft
 * @param {number} [options.searchRadiusMeters=400] - standaardstraal (rond de route) voor
 *   categorieën zonder eigen searchRadiusMeters in poi-categories.js; zie de opmerking
 *   "ZOEKSTRAAL PER CATEGORIE" bovenaan dit bestand
 * @param {number} [options.triggerDistanceMeters=50] - vanaf welke afstand EuroPoi zou moeten triggeren
 * @param {string[]} [options.categoryKeys] - poi-categories.js-keys; standaard: getDefaultSelectedKeys()
 * @param {string} [options.language='nl']
 * @param {number} [options.osmFallbackSkipThreshold=Infinity] - zie DEFAULT_OSM_FALLBACK_SKIP_THRESHOLD;
 *   geef een eindig getal om, per straal-groep, de OSM-aanvulling over te slaan zodra Wikidata
 *   voor die groep al minstens dit aantal kandidaten vond
 * @param {boolean} [options.previewMode=false] - true: verrijk ALLE kandidaten binnen de
 *   zoekstraal (niet alleen die binnen triggerDistanceMeters) met een Wikipedia-samenvatting,
 *   en genereer GEEN CSV — bedoeld voor gebruik met preview-html.js, waar de gebruiker de
 *   trigger-afstand nog interactief instelt
 * @param {Function} [options.searchWikidataBox] - override voor tests
 * @param {Function} [options.searchOverpass] - override voor tests
 * @param {Function} [options.fetchSummariesForCandidates] - override voor tests
 * @param {Function} [options.log] - override voor tests (standaard console.log)
 * @returns {Promise<{
 *   routeName: string,
 *   routePoints: Array<{lat:number,lng:number}>,
 *   csv: string|null,
 *   pois: Array,
 *   candidates: Array,
 *   withinTrigger: Array,
 *   previewCandidates: (Array|undefined)
 * }>}
 *   previewCandidates is alleen gevuld wanneer previewMode:true — ALLE kandidaten
 *   binnen de zoekstraal, elk met distanceToRouteMeters én een Wikipedia-samenvatting
 *   (of summaryError), rechtstreeks bruikbaar als input voor preview-html.js.
 */
async function runPipeline(options) {
  const {
    gpxText,
    routeNameFallback,
    searchRadiusMeters = DEFAULT_SEARCH_RADIUS_M,
    triggerDistanceMeters = DEFAULT_TRIGGER_DISTANCE_M,
    categoryKeys,
    language = 'nl',
    osmFallbackSkipThreshold = DEFAULT_OSM_FALLBACK_SKIP_THRESHOLD,
    previewMode = false,
    searchWikidataBox = wikidataSearch.searchWikidataBox,
    searchOverpass = osmFallback.searchOverpass,
    fetchSummariesForCandidates = wikipediaSummary.fetchSummariesForCandidates,
    log = console.log,
  } = options;

  // 1. GPX inlezen (track heeft voorrang boven route, zie route-buffer.js)
  const parsedRoute = routeBuffer.parseGpxLineString(gpxText);
  if (!parsedRoute.points || parsedRoute.points.length === 0) {
    throw new Error(
      'Geen track- of routepunten gevonden in dit GPX-bestand (geen <trkpt> of <rtept>).'
    );
  }
  const routeName = parsedRoute.name || routeNameFallback || 'Onbekende route';
  log(
    `GPX ingelezen: bron=${parsedRoute.source}, ${parsedRoute.points.length} punten, routenaam="${routeName}"`
  );

  // 2. Categorie-selectie → groepen per effectieve zoekstraal. Zonder
  // categorieën met een eigen searchRadiusMeters (de huidige situatie voor
  // alle 7 categorieën) levert dit precies één groep op met
  // searchRadiusMeters als straal — functioneel identiek aan de vorige,
  // ongegroepeerde opzet.
  const selectedKeys = categoryKeys || poiCategories.getDefaultSelectedKeys();
  const radiusGroups = poiCategories.groupSelectedKeysByRadius(selectedKeys, searchRadiusMeters);
  log(
    `Categorieën: ${selectedKeys.join(', ')} → ${radiusGroups.length} straal-groep(en): ` +
      radiusGroups.map((g) => `${g.radiusMeters}m [${g.keys.join(', ')}]`).join('; ')
  );

  // 3. Per straal-groep: eigen bounding box, eigen Wikidata-zoekopdracht en
  // eigen OSM-aanvulling. Kandidaten worden meteen in één gezamenlijke
  // lijst verzameld, met dedupe zowel binnen als tussen groepen (op
  // Wikidata-id, en op onderlinge afstand voor OSM-resultaten) — zodat een
  // route die toevallig in twee groepen dezelfde plek oplevert (bijv. een
  // rijksmonumentale kerk die zowel bij "kerken" als bij "Gebouwd erfgoed"
  // hoort) niet dubbel in de uitkomst belandt.
  const candidates = [];
  const seenWikidataIds = new Set();

  for (const group of radiusGroups) {
    const bbox = routeBuffer.getBoundingBox(parsedRoute.points, group.radiusMeters);
    const instanceOf = poiCategories.qidsForKeys(group.keys);

    const groupWikidataCandidates = await searchWikidataBox(bbox, {
      language: language,
      instanceOf: instanceOf,
      userAgent: USER_AGENT,
    });

    let nieuweWikidata = 0;
    for (const candidate of groupWikidataCandidates) {
      if (candidate.id && seenWikidataIds.has(candidate.id)) continue;
      if (candidate.id) seenWikidataIds.add(candidate.id);
      candidates.push(candidate);
      nieuweWikidata++;
    }
    log(
      `  Straal-groep ${group.radiusMeters}m [${group.keys.join(', ')}]: Wikidata leverde ` +
        `${groupWikidataCandidates.length} kandidaten op, waarvan ${nieuweWikidata} nieuw.`
    );

    // OSM-aanvulling draait standaard altijd mee (zie
    // DEFAULT_OSM_FALLBACK_SKIP_THRESHOLD hierboven voor de reden), tenzij
    // déze straal-groep al minstens osmFallbackSkipThreshold nieuwe
    // Wikidata-kandidaten opleverde. OSM-resultaten die vrijwel op
    // dezelfde plek liggen als een reeds verzamelde kandidaat (uit welke
    // groep dan ook) worden overgeslagen.
    if (nieuweWikidata < osmFallbackSkipThreshold) {
      const osmTagFilterGroups = poiCategories.osmTagFiltersForKeys(group.keys);
      const osmCandidates = await searchOverpass(bbox, osmTagFilterGroups, {
        userAgent: USER_AGENT,
      });

      let toegevoegd = 0;
      for (const osmCandidate of osmCandidates) {
        const isDuplicate = candidates.some(
          (existing) =>
            routeBuffer.haversineDistance(existing, osmCandidate) <= DUPLICATE_DISTANCE_METERS
        );
        if (!isDuplicate) {
          candidates.push(osmCandidate);
          toegevoegd++;
        }
      }
      log(
        `  Straal-groep ${group.radiusMeters}m [${group.keys.join(', ')}]: OSM leverde ` +
          `${osmCandidates.length} kandidaten op, waarvan ${toegevoegd} nieuw ` +
          `(${osmCandidates.length - toegevoegd} viel samen met een bestaande kandidaat).`
      );
    } else {
      log(
        `  Straal-groep ${group.radiusMeters}m [${group.keys.join(', ')}]: OSM-aanvulling ` +
          `overgeslagen (Wikidata vond al ${nieuweWikidata} nieuwe kandidaten, drempel=${osmFallbackSkipThreshold}).`
      );
    }
  }

  log(`In totaal ${candidates.length} unieke kandidaten over alle straal-groepen samen.`);

  // 4. Werkelijke afstand tot de route berekenen voor ALLE kandidaten (elke
  // bbox is een rechthoek, dus bevat ook punten die verder dan de eigen
  // zoekstraal van de route zelf liggen). Dit gebeurt voor ALLE
  // kandidaten — niet alleen die binnen de trigger-afstand vallen — zodat
  // preview-modus ook de kandidaten ERBUITEN kan tonen (grijs/uitgevouwen
  // op de kaart) terwijl de gebruiker de trigger-afstand nog instelt. Dit
  // gebeurt na het samenvoegen van alle straal-groepen, dus onafhankelijk
  // van welke groep een kandidaat oorspronkelijk opleverde.
  const candidatesWithDistance = candidates.map((candidate) => {
    const distance = routeBuffer.distanceToRoute(candidate, parsedRoute.points);
    return Object.assign({}, candidate, { distanceToRouteMeters: Math.round(distance) });
  });

  const withinTrigger = candidatesWithDistance.filter(
    (c) => c.distanceToRouteMeters <= triggerDistanceMeters
  );
  log(
    `${withinTrigger.length} van de ${candidatesWithDistance.length} kandidaten liggen binnen de trigger-afstand van ${triggerDistanceMeters}m.`
  );

  if (candidatesWithDistance.length === 0) {
    log('Geen kandidaten gevonden binnen de zoekstra(a)l(en).');
    return {
      routeName,
      routePoints: parsedRoute.points,
      csv: null,
      pois: [],
      candidates: candidatesWithDistance,
      withinTrigger: [],
      previewCandidates: previewMode ? [] : undefined,
    };
  }

  if (!previewMode && withinTrigger.length === 0) {
    log('Geen kandidaten binnen de trigger-afstand — geen CSV gegenereerd.');
    return {
      routeName,
      routePoints: parsedRoute.points,
      csv: null,
      pois: [],
      candidates: candidatesWithDistance,
      withinTrigger: [],
      previewCandidates: undefined,
    };
  }

  // 5. Wikipedia-samenvattingen ophalen.
  // - Normale modus: alleen voor kandidaten binnen de trigger-afstand
  //   (spaart onnodige Wikipedia-aanvragen uit).
  // - Preview-modus: voor ALLE kandidaten binnen de zoekstraal/-stralen,
  //   zodat de preview-pagina ieders samenvatting al klaar heeft staan
  //   wanneer de gebruiker het schuifje verschuift (anders zou elke
  //   aanpassing een nieuwe pijplijn-run met netwerkverkeer vereisen).
  const toEnrich = previewMode ? candidatesWithDistance : withinTrigger;
  const enriched = await fetchSummariesForCandidates(toEnrich, {
    maxSentences: 3,
    userAgent: USER_AGENT,
  });

  if (previewMode) {
    log(`Preview-modus: ${enriched.length} kandidaten verrijkt met samenvatting.`);
    return {
      routeName,
      routePoints: parsedRoute.points,
      csv: null,
      pois: [],
      candidates: candidatesWithDistance,
      withinTrigger,
      previewCandidates: enriched,
    };
  }

  // 6. Omzetten naar EuroPoi-CSV-rijen (alleen kandidaten binnen de
  // trigger-afstand, zoals in de normale modus altijd al het geval was).
  const pois = enriched.map((c) => {
    let desc = (c.summary && c.summary.extractShort) || '';
    if (!desc) {
      // Terugval: Wikidata-omschrijving (kort, geen mooie zin, maar beter
      // dan een lege audiotekst) als de Wikipedia-samenvatting mislukte.
      desc = c.description || '';
      if (c.summaryError) {
        log(
          `  Let op: geen Wikipedia-samenvatting voor "${c.label}" (${c.summaryError}); Wikidata-omschrijving gebruikt als terugval.`
        );
      }
    }
    return {
      lat: c.lat,
      lng: c.lng,
      name: c.label,
      desc: desc,
      category: routeName,
      radius: triggerDistanceMeters,
      mp3: '',
    };
  });

  // 7. CSV genereren (BOM + CRLF, via de bestaande, gedeelde EuroPoi-module)
  const csv = europoiCsv.toEuroPoiCsvWithBom(pois);
  log(`CSV gegenereerd met ${pois.length} POI('s).`);

  return {
    routeName,
    routePoints: parsedRoute.points,
    csv,
    pois,
    candidates: candidatesWithDistance,
    withinTrigger,
    previewCandidates: undefined,
  };
}

async function main() {
  // --preview kan overal tussen de overige argumenten staan; hem er eerst
  // uithalen houdt de positionele argumenten (gpx, uitvoer, zoekstraal, ...)
  // op hun vaste plek, ongeacht waar de vlag is neergezet.
  const rawArgs = process.argv.slice(2);
  const previewMode = rawArgs.includes('--preview');
  const positional = rawArgs.filter((a) => a !== '--preview');

  const [
    gpxPath,
    outputPathArg,
    searchRadiusArg,
    triggerDistanceArg,
    categoriesArg,
    osmFallbackSkipThresholdArg,
  ] = positional;

  if (!gpxPath) {
    console.error(
      'Gebruik: node poc-gpx-naar-csv.js <invoer.gpx> [uitvoer] [zoekstraal_m] [trigger_afstand_m] [categorieën,komma,gescheiden] [osm_skip_drempel] [--preview]'
    );
    console.error(
      'Voorbeeld (CSV):     node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.csv 400 75 kerken,molens,kastelen,oorlogsgeschiedenis'
    );
    console.error(
      'Voorbeeld (preview): node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.preview.html 400 75 kerken,molens --preview'
    );
    process.exit(1);
  }

  const gpxText = fs.readFileSync(gpxPath, 'utf8');
  const routeNameFallback = path.basename(gpxPath, path.extname(gpxPath));
  const defaultExtension = previewMode ? '.preview.html' : '.csv';
  const outputPath = outputPathArg || gpxPath.replace(/\.gpx$/i, '') + defaultExtension;

  const searchRadiusMeters = searchRadiusArg ? Number(searchRadiusArg) : DEFAULT_SEARCH_RADIUS_M;
  const triggerDistanceMeters = triggerDistanceArg
    ? Number(triggerDistanceArg)
    : DEFAULT_TRIGGER_DISTANCE_M;
  const categoryKeys = categoriesArg
    ? categoriesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;
  const osmFallbackSkipThreshold = osmFallbackSkipThresholdArg
    ? Number(osmFallbackSkipThresholdArg)
    : DEFAULT_OSM_FALLBACK_SKIP_THRESHOLD;

  const result = await runPipeline({
    gpxText,
    routeNameFallback,
    searchRadiusMeters,
    triggerDistanceMeters,
    categoryKeys,
    osmFallbackSkipThreshold,
    previewMode,
  });

  if (previewMode) {
    const { routeName, routePoints, previewCandidates } = result;
    if (!previewCandidates || previewCandidates.length === 0) {
      console.log('Geen kandidaten gevonden binnen de zoekstraal — geen preview gegenereerd.');
      process.exit(0);
    }
    const { generatePreviewHtml } = require('./src/preview-html.js');
    const html = generatePreviewHtml({
      routeName,
      routePoints,
      candidates: previewCandidates,
      initialTriggerMeters: triggerDistanceMeters,
      maxSliderMeters: searchRadiusMeters,
    });
    fs.writeFileSync(outputPath, html, 'utf8');
    console.log(`\nPreview gegenereerd: ${outputPath}`);
    console.log('Open dit bestand in je browser, stel de gewenste trigger-afstand in met het schuifje,');
    console.log('en draai dit script daarna ZONDER --preview met die afstand als vierde argument voor de definitieve CSV.');
    return;
  }

  const { csv, pois, routeName } = result;
  if (!csv) {
    process.exit(0);
  }

  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(
    `\nKlaar. ${pois.length} POI('s) voor route "${routeName}" weggeschreven naar: ${outputPath}`
  );
  console.log('Importeer dit bestand in EuroPoi om het resultaat te beoordelen.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('FOUT:', err);
    process.exit(1);
  });
}

module.exports = { runPipeline };
