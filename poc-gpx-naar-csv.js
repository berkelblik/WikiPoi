#!/usr/bin/env node
/**
 * poc-gpx-naar-csv.js
 *
 * RUW proof-of-concept-script (geen onderdeel van src/) dat de vier
 * bestaande WikiPoi-modules aan elkaar knoopt tot één werkende pijplijn:
 *
 *   GPX-bestand
 *     → route-buffer.js       (track/route inlezen, bounding box)
 *     → poi-categories.js     (categorie-filter → Wikidata-QID's)
 *     → wikidata-search.js    (kandidaat-POI's ophalen)
 *     → route-buffer.js       (filteren op werkelijke afstand tot de route)
 *     → wikipedia-summary.js  (samenvatting per kandidaat ophalen)
 *     → europoi-csv.js        (CSV met BOM/CRLF genereren)
 *
 * Er is nog GEEN preview-UI (trigger-preview.js) — de trigger-afstand
 * wordt hier via een commandoregel-parameter meegegeven in plaats van
 * interactief ingesteld. Er is ook nog GEEN OSM-fallback: als Wikidata
 * niets oplevert, levert dit script simpelweg een lege CSV op.
 *
 * Gebruik:
 *   node poc-gpx-naar-csv.js <invoer.gpx> [uitvoer.csv] [zoekstraal_m] [trigger_afstand_m] [categorieën]
 *
 * Voorbeeld:
 *   node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.csv 400 75 kerken,molens,kastelen,oorlogsgeschiedenis
 */

const fs = require('fs');
const path = require('path');

const routeBuffer = require('./src/route-buffer.js');
const poiCategories = require('./src/poi-categories.js');
const wikidataSearch = require('./src/wikidata-search.js');
const wikipediaSummary = require('./src/wikipedia-summary.js');
const europoiCsv = require('./src/europoi-csv.js');

const USER_AGENT = 'WikiPoi/0.1 (https://github.com/berkelblik/WikiPoi)';
const DEFAULT_SEARCH_RADIUS_M = 400;
const DEFAULT_TRIGGER_DISTANCE_M = 50;

/**
 * De kernpijplijn, los van bestands-I/O en CLI-argumenten — zodat dit
 * zonder netwerktoegang getest kan worden door searchWikidataBox en
 * fetchSummariesForCandidates te vervangen door mocks.
 *
 * @param {object} options
 * @param {string} options.gpxText - inhoud van het GPX-bestand
 * @param {string} [options.routeNameFallback] - gebruikt als het GPX-bestand geen <name> heeft
 * @param {number} [options.searchRadiusMeters=400] - hoe ver van de route Wikidata wordt doorzocht
 * @param {number} [options.triggerDistanceMeters=50] - vanaf welke afstand EuroPoi zou moeten triggeren
 * @param {string[]} [options.categoryKeys] - poi-categories.js-keys; standaard: getDefaultSelectedKeys()
 * @param {string} [options.language='nl']
 * @param {Function} [options.searchWikidataBox] - override voor tests
 * @param {Function} [options.fetchSummariesForCandidates] - override voor tests
 * @param {Function} [options.log] - override voor tests (standaard console.log)
 * @returns {Promise<{routeName:string, csv:string|null, pois:Array, candidates:Array, withinTrigger:Array}>}
 */
async function runPipeline(options) {
  const {
    gpxText,
    routeNameFallback,
    searchRadiusMeters = DEFAULT_SEARCH_RADIUS_M,
    triggerDistanceMeters = DEFAULT_TRIGGER_DISTANCE_M,
    categoryKeys,
    language = 'nl',
    searchWikidataBox = wikidataSearch.searchWikidataBox,
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

  // 2. Bounding box voor de zoekstraal rond de route
  const bbox = routeBuffer.getBoundingBox(parsedRoute.points, searchRadiusMeters);

  // 3. Categorie-selectie → Wikidata-QID's
  const selectedKeys = categoryKeys || poiCategories.getDefaultSelectedKeys();
  const instanceOf = poiCategories.qidsForKeys(selectedKeys);
  log(`Categorieën: ${selectedKeys.join(', ')} (${instanceOf.length} Wikidata-typen)`);

  // 4. Wikidata-zoekopdracht binnen de bounding box
  const candidates = await searchWikidataBox(bbox, {
    language: language,
    instanceOf: instanceOf,
    userAgent: USER_AGENT,
  });
  log(
    `Wikidata leverde ${candidates.length} kandidaten op binnen de zoekstraal van ${searchRadiusMeters}m.`
  );

  // 5. Filteren op de WERKELIJKE afstand tot de route (de bbox is een
  // rechthoek, dus bevat ook punten die verder dan de zoekstraal van de
  // route zelf liggen; en de trigger-afstand kan bovendien kleiner zijn
  // dan de zoekstraal). Dit vervangt tijdelijk de nog te bouwen
  // preview-stap, waarin de gebruiker dit interactief zou doen.
  const withinTrigger = [];
  for (const candidate of candidates) {
    const distance = routeBuffer.distanceToRoute(candidate, parsedRoute.points);
    if (distance <= triggerDistanceMeters) {
      withinTrigger.push(
        Object.assign({}, candidate, { distanceToRouteMeters: Math.round(distance) })
      );
    }
  }
  log(
    `${withinTrigger.length} van de ${candidates.length} kandidaten liggen binnen de trigger-afstand van ${triggerDistanceMeters}m.`
  );

  if (withinTrigger.length === 0) {
    log('Geen kandidaten binnen de trigger-afstand — geen CSV gegenereerd.');
    return { routeName, csv: null, pois: [], candidates, withinTrigger };
  }

  // 6. Wikipedia-samenvattingen ophalen voor de overgebleven kandidaten
  const enriched = await fetchSummariesForCandidates(withinTrigger, {
    maxSentences: 3,
    userAgent: USER_AGENT,
  });

  // 7. Omzetten naar EuroPoi-CSV-rijen
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

  // 8. CSV genereren (BOM + CRLF, via de bestaande, gedeelde EuroPoi-module)
  const csv = europoiCsv.toEuroPoiCsvWithBom(pois);
  log(`CSV gegenereerd met ${pois.length} POI('s).`);

  return { routeName, csv, pois, candidates, withinTrigger };
}

async function main() {
  const [, , gpxPath, outputPathArg, searchRadiusArg, triggerDistanceArg, categoriesArg] =
    process.argv;

  if (!gpxPath) {
    console.error(
      'Gebruik: node poc-gpx-naar-csv.js <invoer.gpx> [uitvoer.csv] [zoekstraal_m] [trigger_afstand_m] [categorieën,komma,gescheiden]'
    );
    console.error(
      'Voorbeeld: node poc-gpx-naar-csv.js examples/Utrechtse_Waterlinie.gpx waterlinie.csv 400 75 kerken,molens,kastelen,oorlogsgeschiedenis'
    );
    process.exit(1);
  }

  const gpxText = fs.readFileSync(gpxPath, 'utf8');
  const routeNameFallback = path.basename(gpxPath, path.extname(gpxPath));
  const outputPath = outputPathArg || gpxPath.replace(/\.gpx$/i, '') + '.csv';

  const searchRadiusMeters = searchRadiusArg ? Number(searchRadiusArg) : DEFAULT_SEARCH_RADIUS_M;
  const triggerDistanceMeters = triggerDistanceArg
    ? Number(triggerDistanceArg)
    : DEFAULT_TRIGGER_DISTANCE_M;
  const categoryKeys = categoriesArg
    ? categoriesArg.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  const { csv, pois, routeName } = await runPipeline({
    gpxText,
    routeNameFallback,
    searchRadiusMeters,
    triggerDistanceMeters,
    categoryKeys,
  });

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
