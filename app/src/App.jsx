import { useState, useEffect, useMemo } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
import '../../src/poi-categories.js'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import RouteMap from './components/RouteMap.jsx'
import './App.css'

// Corridor langs de route: de slider bepaalt hoe breed de strook aan
// weerszijden van de route is waarbinnen POI's meegaan. De bounding box van
// de Wikidata/OSM-zoekopdracht krijgt aan alle kanten een marge van de
// MAXIMALE corridorbreedte, zodat elke POI die bij enige sliderstand binnen
// de corridor valt ook echt opgehaald is. Schuiven filtert daarna alleen nog
// lokaal, zonder nieuwe zoekopdracht. 500m gekozen omdat WikiPoi voor
// wandelaars en fietsers is; eventueel later te verhogen (max. ~1000m).
const CORRIDOR_MAX_METERS = 500
const CORRIDOR_MIN_METERS = 50
const CORRIDOR_STEP_METERS = 25
const CORRIDOR_DEFAULT_METERS = 250

// Wikidata-items met verschillende QID's binnen deze afstand van elkaar
// worden als één POI behandeld (één gebouw, meerdere items).
const WIKIDATA_MERGE_METERS = 10

// Vast testgebied rond het eerdere GPS-testpunt bij Zutphen (ca. 1,1 x
// 0,7 km), gebruikt als fallback zolang er nog geen GPX-route is geladen.
const FALLBACK_TEST_BBOX = {
  minLat: 52.1276,
  maxLat: 52.1376,
  minLng: 6.2133,
  maxLng: 6.2333,
}

function App() {
  const [csv, setCsv] = useState('')
  const [csvError, setCsvError] = useState('')
  const [gpsResult, setGpsResult] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState([])
  const [wikidataResults, setWikidataResults] = useState(null)
  const [wikidataError, setWikidataError] = useState('')
  const [wikidataLoading, setWikidataLoading] = useState(false)
  const [wikidataMergedCount, setWikidataMergedCount] = useState(0)
  const [osmResults, setOsmResults] = useState(null)
  const [osmError, setOsmError] = useState('')
  const [osmLoading, setOsmLoading] = useState(false)
  const [summaryResults, setSummaryResults] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [showMap, setShowMap] = useState(true)
  const [corridorMeters, setCorridorMeters] = useState(CORRIDOR_DEFAULT_METERS)

  // De standaard-aangevinkte categorieën komen uit poi-categories.js zelf
  // (getDefaultSelectedKeys()); dat kan pas ná de module-import ingelezen
  // worden, dus in een effect i.p.v. direct in useState().
  useEffect(() => {
    if (window.WikiPoiCategories && typeof window.WikiPoiCategories.getDefaultSelectedKeys === 'function') {
      setSelectedCategoryKeys(window.WikiPoiCategories.getDefaultSelectedKeys())
    }
  }, [])

  const categoriesAvailable =
    !!window.WikiPoiCategories && typeof window.WikiPoiCategories.getCategories === 'function'
  const categoryList = categoriesAvailable ? window.WikiPoiCategories.getCategories('nl') : []
  const coreCategories = categoryList.filter((c) => !c.group)
  const extraCategories = categoryList.filter((c) => c.group === 'nieuw')
  const categoryValidation = categoriesAvailable
    ? window.WikiPoiCategories.validateCategorySelection(selectedCategoryKeys)
    : { valid: true, extraSelectedKeys: [], maxExtraCategories: 2 }

  // Test 5-resultaten worden, vóór weergave én vóór gebruik in Test 6,
  // gefilterd tegen de Test 3-resultaten: dedupliceren op wikidataId/
  // Wikipedia-titel (dubbel met Wikidata) en "lege" punten (geen QID,
  // geen wikipediaUrl, geen description) overslaan — zie
  // osm-fallback.js#filterAndDedupeOsmCandidates(). Herberekend bij elke
  // render, dus reageert automatisch op nieuwe Test 3- of Test 5-runs.
  const osmFilterAvailable =
    !!window.WikiPoiOsmFallback &&
    typeof window.WikiPoiOsmFallback.filterAndDedupeOsmCandidates === 'function'
  // useMemo i.p.v. herberekenen bij elke render: de kaart-POI's hieronder
  // hangen hiervan af, en een steeds nieuwe array zou die (dure) afstand-
  // tot-route-berekening bij elke sliderbeweging opnieuw laten draaien.
  const filteredOsmResults = useMemo(
    () =>
      osmResults && osmFilterAvailable
        ? window.WikiPoiOsmFallback.filterAndDedupeOsmCandidates(osmResults, wikidataResults || [])
        : osmResults,
    [osmResults, wikidataResults, osmFilterAvailable]
  )
  const osmSkippedCount =
    osmResults && filteredOsmResults ? osmResults.length - filteredOsmResults.length : 0

  // Kaart-POI's: Test 3 (Wikidata) + Test 5 (OSM, gefilterd), met per POI
  // de afstand tot de route en het dichtstbijzijnde routepunt (= waar
  // EuroPoi straks aankondigt). Alleen herberekend bij een nieuwe route of
  // nieuwe zoekresultaten — niet bij het verschuiven van de slider.
  const routeMeasuredPois = useMemo(() => {
    const candidates = [...(wikidataResults || []), ...(filteredOsmResults || [])]
    const routePoints = routeInfo ? routeInfo.points : null
    const canMeasure =
      !!routePoints &&
      routePoints.length > 0 &&
      !!window.WikiPoiRouteBuffer &&
      typeof window.WikiPoiRouteBuffer.closestPointOnRoute === 'function'
    return candidates.map((c) => {
      if (!canMeasure) {
        return { ...c, distanceToRoute: null, snapPoint: null }
      }
      const r = window.WikiPoiRouteBuffer.closestPointOnRoute(c, routePoints)
      return { ...c, distanceToRoute: r.distance, snapPoint: r.point }
    })
  }, [wikidataResults, filteredOsmResults, routeInfo])

  // Goedkope stap die wél bij elke sliderbeweging draait: binnen/buiten de
  // corridor markeren. Zonder route valt alles "binnen" (niets te toetsen).
  const mapPois = useMemo(
    () =>
      routeMeasuredPois.map((p) => ({
        ...p,
        inCorridor: p.distanceToRoute === null ? true : p.distanceToRoute <= corridorMeters,
      })),
    [routeMeasuredPois, corridorMeters]
  )
  const poisInCorridorCount = mapPois.filter((p) => p.inCorridor).length
  const mapPoisSorted = [...mapPois].sort(
    (a, b) => (a.distanceToRoute ?? 0) - (b.distanceToRoute ?? 0)
  )

  function toggleCategory(key) {
    setSelectedCategoryKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function runSmokeTest() {
    setCsvError('')
    setCsv('')
    try {
      if (!window.EuroPoiCsv || typeof window.EuroPoiCsv.toEuroPoiCsv !== 'function') {
        setCsvError(
          'Fout: window.EuroPoiCsv is niet beschikbaar (europoi-csv.js is niet correct geladen).'
        )
        return
      }
      const testPois = [
        {
          lat: 52.1326,
          lng: 6.2233,
          name: 'Testpunt Zutphen',
          desc: 'Smoketest voor de fase 1-integratie.',
          category: 'Testroute',
          radius: 50,
          mp3: '',
        },
      ]
      const result = window.EuroPoiCsv.toEuroPoiCsv(testPois)
      setCsv(result)
    } catch (err) {
      setCsvError('Fout: ' + (err && err.message ? err.message : String(err)))
    }
  }

  async function runGpsTtsTest() {
    setGpsError('')
    setGpsResult('')
    try {
      // requestPermissions() is op het web niet geïmplementeerd door de
      // Capacitor-Geolocation-plugin; alleen op native (Android/iOS) is een
      // aparte toestemmingsaanvraag nodig. Op het web regelt de browser dit
      // zelf zodra getCurrentPosition() wordt aangeroepen.
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions()
        if (
          permission.location !== 'granted' &&
          permission.coarseLocation !== 'granted'
        ) {
          setGpsError('Geen toestemming gekregen voor locatie.')
          return
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20000,
      })
      const { latitude, longitude } = position.coords
      const plusCode = window.EuroPoiCsv.OLC.encode(latitude, longitude, 10)
      const resultText = `Positie gevonden: breedtegraad ${latitude.toFixed(
        5
      )}, lengtegraad ${longitude.toFixed(5)}. PlusCode: ${plusCode}.`
      setGpsResult(resultText)

      await TextToSpeech.speak({
        text: resultText,
        lang: 'nl-NL',
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
      })
    } catch (err) {
      setGpsError('Fout: ' + (err && err.message ? err.message : String(err)))
    }
  }

  function handleGpxFileChange(event) {
    setRouteError('')
    setRouteInfo(null)
    // Een nieuwe route maakt eerdere resultaten (van de vorige route of
    // het testgebied) ongeldig; laat de gebruiker niet naar resultaten
    // kijken die niet meer bij de huidige route horen.
    setWikidataResults(null)
    setWikidataError('')
    setOsmResults(null)
    setOsmError('')
    setSummaryResults(null)
    setSummaryError('')

    const file = event.target.files && event.target.files[0]
    if (!file) return

    if (
      !window.WikiPoiRouteBuffer ||
      typeof window.WikiPoiRouteBuffer.parseGpxLineString !== 'function'
    ) {
      setRouteError(
        'Fout: window.WikiPoiRouteBuffer is niet beschikbaar (route-buffer.js is niet correct geladen).'
      )
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const gpxText = String(reader.result)
        const parsed = window.WikiPoiRouteBuffer.parseGpxLineString(gpxText)
        if (!parsed.points || parsed.points.length === 0) {
          setRouteError(
            'Geen track- of routepunten gevonden in dit GPX-bestand (verwacht <trkpt> of <rtept>-elementen).'
          )
          return
        }
        const bbox = window.WikiPoiRouteBuffer.getBoundingBox(
          parsed.points,
          CORRIDOR_MAX_METERS
        )
        setRouteInfo({
          fileName: file.name,
          points: parsed.points,
          pointCount: parsed.points.length,
          source: parsed.source,
          name: parsed.name,
          bbox: bbox,
        })
      } catch (err) {
        setRouteError('Fout: ' + (err && err.message ? err.message : String(err)))
      }
    }
    reader.onerror = () => {
      setRouteError('Fout: kon het bestand niet lezen.')
    }
    reader.readAsText(file)
  }

  async function runWikidataTest() {
    setWikidataError('')
    setWikidataResults(null)
    setWikidataLoading(true)
    try {
      if (
        !window.WikiPoiWikidataSearch ||
        typeof window.WikiPoiWikidataSearch.searchWikidataBox !== 'function'
      ) {
        setWikidataError(
          'Fout: window.WikiPoiWikidataSearch is niet beschikbaar (wikidata-search.js is niet correct geladen).'
        )
        return
      }
      if (!categoriesAvailable) {
        setWikidataError(
          'Fout: window.WikiPoiCategories is niet beschikbaar (poi-categories.js is niet correct geladen).'
        )
        return
      }

      const qids = window.WikiPoiCategories.qidsForKeys(selectedCategoryKeys)
      const hasProperties = window.WikiPoiCategories.hasPropertyForKeys(selectedCategoryKeys)
      if (qids.length === 0 && hasProperties.length === 0) {
        setWikidataError('Selecteer minimaal één categorie hierboven.')
        return
      }

      // Gebruik de bounding box van de geladen GPX-route (Test 4) als die
      // er is; anders het vaste testgebied bij Zutphen als fallback.
      const bbox = routeInfo ? routeInfo.bbox : FALLBACK_TEST_BBOX

      // instanceOf- en hasProperty-filters kunnen niet in één SPARQL-query
      // gecombineerd worden (zie wikidata-search.js); is allebei
      // geselecteerd (bijv. "Kerken" + "Gebouwd erfgoed"), dan draaien we
      // ze als aparte zoekopdrachten en voegen de resultaten samen, met
      // dedupeById() voor het geval hetzelfde item via beide paden gevonden
      // wordt.
      let results = []
      if (qids.length > 0) {
        const instanceOfResults = await window.WikiPoiWikidataSearch.searchWikidataBox(bbox, {
          instanceOf: qids,
        })
        results = results.concat(instanceOfResults)
      }
      for (const propertyId of hasProperties) {
        const propertyResults = await window.WikiPoiWikidataSearch.searchWikidataBox(bbox, {
          hasProperty: propertyId,
        })
        results = results.concat(propertyResults)
      }
      results = window.WikiPoiWikidataSearch.dedupeById(results)
      // Daarna: verschillende QID's op (vrijwel) dezelfde plek samenvoegen
      // (drempel 10m), bijv. Broederenkerk + Waalse kerk in Zutphen — één
      // pand, twee Wikidata-items. Zie wikidata-search.js#dedupeByProximity().
      if (typeof window.WikiPoiWikidataSearch.dedupeByProximity === 'function') {
        const before = results.length
        results = window.WikiPoiWikidataSearch.dedupeByProximity(results, {
          thresholdMeters: WIKIDATA_MERGE_METERS,
        })
        setWikidataMergedCount(before - results.length)
      } else {
        setWikidataMergedCount(0)
      }
      setWikidataResults(results)
    } catch (err) {
      setWikidataError('Fout: ' + (err && err.message ? err.message : String(err)))
    } finally {
      setWikidataLoading(false)
    }
  }

  async function runOsmFallbackTest() {
    setOsmError('')
    setOsmResults(null)
    setOsmLoading(true)
    try {
      if (
        !window.WikiPoiOsmFallback ||
        typeof window.WikiPoiOsmFallback.searchOverpass !== 'function'
      ) {
        setOsmError(
          'Fout: window.WikiPoiOsmFallback is niet beschikbaar (osm-fallback.js is niet correct geladen).'
        )
        return
      }
      if (!categoriesAvailable) {
        setOsmError(
          'Fout: window.WikiPoiCategories is niet beschikbaar (poi-categories.js is niet correct geladen).'
        )
        return
      }

      const tagFilterGroups = window.WikiPoiCategories.osmTagFiltersForKeys(selectedCategoryKeys)
      if (tagFilterGroups.length === 0) {
        setOsmError('Selecteer minimaal één categorie hierboven.')
        return
      }

      const bbox = routeInfo ? routeInfo.bbox : FALLBACK_TEST_BBOX
      const results = await window.WikiPoiOsmFallback.searchOverpass(bbox, tagFilterGroups)
      setOsmResults(results)
    } catch (err) {
      setOsmError('Fout: ' + (err && err.message ? err.message : String(err)))
    } finally {
      setOsmLoading(false)
    }
  }

  async function runWikipediaSummaryTest() {
    setSummaryError('')
    setSummaryResults(null)
    setSummaryLoading(true)
    try {
      if (
        !window.WikiPoiWikipediaSummary ||
        typeof window.WikiPoiWikipediaSummary.fetchSummariesForCandidates !== 'function'
      ) {
        setSummaryError(
          'Fout: window.WikiPoiWikipediaSummary is niet beschikbaar (wikipedia-summary.js is niet correct geladen).'
        )
        return
      }
      // Combineert de Test 3- (Wikidata) en Test 5- (OSM) resultaten tot
      // één lijst van kandidaten. De OSM-kant gebruikt hier bewust
      // filteredOsmResults i.p.v. de ruwe osmResults: duplicaten met Test 3
      // (dedupe op wikidataId/Wikipedia-titel) en "lege" OSM-punten zonder
      // bruikbare tekst zijn dan al weggefilterd, zodat deze niet als
      // zinloze "Geen samenvatting"-regel in Test 6 verschijnen.
      const candidates = [...(wikidataResults || []), ...(filteredOsmResults || [])]
      if (candidates.length === 0) {
        setSummaryError(
          'Geen kandidaten beschikbaar — voer eerst Test 3 en/of Test 5 uit.'
        )
        return
      }
      const enriched = await window.WikiPoiWikipediaSummary.fetchSummariesForCandidates(
        candidates,
        { maxSentences: 3 }
      )
      setSummaryResults(enriched)
    } catch (err) {
      setSummaryError('Fout: ' + (err && err.message ? err.message : String(err)))
    } finally {
      setSummaryLoading(false)
    }
  }

  return (
    <>
      <h1>WikiPoi — smoketest</h1>

      <section style={{ marginBottom: '2em' }}>
        <h2>Test 1: bestaande CSV-pijplijn hergebruiken</h2>
        <button onClick={runSmokeTest}>
          Genereer testregel via europoi-csv.js
        </button>
        {csv && (
          <pre style={{ textAlign: 'left', background: '#eee', padding: '1em' }}>
            {csv}
          </pre>
        )}
        {csvError && <p style={{ color: 'red' }}>{csvError}</p>}
      </section>

      <section style={{ marginBottom: '2em' }}>
        <h2>Test 2: GPS-positie opvragen + voorlezen</h2>
        <button onClick={runGpsTtsTest}>Vraag positie op en lees voor</button>
        {gpsResult && <p>{gpsResult}</p>}
        {gpsError && <p style={{ color: 'red' }}>{gpsError}</p>}
      </section>

      <section style={{ marginBottom: '2em' }}>
        <h2>Test 4: GPX-route inladen + bounding box berekenen</h2>
        <input type="file" accept=".gpx" onChange={handleGpxFileChange} />
        {routeInfo && (
          <div style={{ textAlign: 'left', marginTop: '1em' }}>
            <p>
              Bestand: <strong>{routeInfo.fileName}</strong>
              <br />
              Type: {routeInfo.source === 'track' ? 'track (<trkpt>)' : 'route (<rtept>)'}
              <br />
              Naam in bestand: {routeInfo.name || '(geen naam gevonden)'}
              <br />
              Aantal punten: {routeInfo.pointCount}
            </p>
            <p>
              Berekende bounding box (marge {CORRIDOR_MAX_METERS}m = maximale corridorbreedte):
              <br />
              <code>
                minLat: {routeInfo.bbox.minLat.toFixed(5)}, maxLat:{' '}
                {routeInfo.bbox.maxLat.toFixed(5)}
                <br />
                minLng: {routeInfo.bbox.minLng.toFixed(5)}, maxLng:{' '}
                {routeInfo.bbox.maxLng.toFixed(5)}
              </code>
            </p>
          </div>
        )}
        {routeError && <p style={{ color: 'red' }}>{routeError}</p>}
      </section>

      <section style={{ marginBottom: '2em' }}>
        <h2>Categorieën selecteren (poi-categories.js)</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          Bepaalt welke Wikidata-QID's en OSM-tagfilters Test 3 en Test 5 hieronder gebruiken.
        </p>
        {!categoriesAvailable && (
          <p style={{ color: 'red' }}>
            Fout: window.WikiPoiCategories is niet beschikbaar (poi-categories.js is niet correct
            geladen).
          </p>
        )}
        {categoriesAvailable && (
          <div style={{ textAlign: 'left' }}>
            <p>
              <strong>Kerncategorieën</strong> (geen limiet):
            </p>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {coreCategories.map((cat) => (
                <li key={cat.key} style={{ marginBottom: '0.4em' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCategoryKeys.includes(cat.key)}
                      onChange={() => toggleCategory(cat.key)}
                    />{' '}
                    <strong>{cat.label}</strong> — {cat.description}
                  </label>
                </li>
              ))}
            </ul>
            <p>
              <strong>Nieuwe verzamelcategorieën</strong> (max.{' '}
              {categoryValidation.maxExtraCategories} tegelijk):
            </p>
            <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
              {extraCategories.map((cat) => (
                <li key={cat.key} style={{ marginBottom: '0.4em' }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCategoryKeys.includes(cat.key)}
                      onChange={() => toggleCategory(cat.key)}
                    />{' '}
                    <strong>{cat.label}</strong> — {cat.description}
                    {cat.searchRadiusMeters && (
                      <> (zoekstraal {cat.searchRadiusMeters}m i.p.v. standaard)</>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {!categoryValidation.valid && (
              <p style={{ color: 'red' }}>
                Je hebt {categoryValidation.extraSelectedKeys.length} nieuwe verzamelcategorieën
                aangevinkt (max. {categoryValidation.maxExtraCategories}):{' '}
                {categoryValidation.extraSelectedKeys.join(', ')}. Test 3/5 werken hierdoor nog wel,
                maar dit overschrijdt de afgesproken UI-regel.
              </p>
            )}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '2em' }}>
        <h2>Test 3: POI's zoeken via Wikidata</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          {routeInfo
            ? `Zoekt binnen de bounding box van "${routeInfo.fileName}" (Test 4 hierboven), gefilterd op de hierboven aangevinkte categorieën.`
            : 'Nog geen route geladen bij Test 4 — gebruikt het vaste testgebied bij Zutphen, gefilterd op de hierboven aangevinkte categorieën.'}
        </p>
        <button onClick={runWikidataTest} disabled={wikidataLoading}>
          {wikidataLoading
            ? 'Bezig met zoeken...'
            : routeInfo
              ? "Zoek POI's via Wikidata voor deze route"
              : "Zoek POI's via Wikidata (testgebied Zutphen)"}
        </button>
        {wikidataResults && (
          <div style={{ textAlign: 'left', marginTop: '1em' }}>
            <p>
              {wikidataResults.length} resultaat/resultaten gevonden
              {wikidataMergedCount > 0 &&
                ` (${wikidataMergedCount} item(s) samengevoegd omdat ze binnen ${WIKIDATA_MERGE_METERS}m van een ander item lagen)`}
              :
            </p>
            <ul>
              {wikidataResults.map((poi) => (
                <li key={poi.id} style={{ marginBottom: '0.75em' }}>
                  <strong>{poi.label}</strong>
                  {poi.description ? ` — ${poi.description}` : ''}
                  <br />
                  <small>
                    {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                    {poi.wikipediaUrl && (
                      <>
                        {' · '}
                        <a href={poi.wikipediaUrl} target="_blank" rel="noreferrer">
                          Wikipedia
                        </a>
                      </>
                    )}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
        {wikidataError && <p style={{ color: 'red' }}>{wikidataError}</p>}
      </section>

      <section style={{ marginBottom: '2em' }}>
        <h2>Test 5: OSM-fallback zoeken via Overpass</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          Gebruikt de OSM-tagfilters van de hierboven aangevinkte categorieën (niet meer het
          hardcoded voorbeeldfilter).{' '}
          {routeInfo
            ? `Zoekt binnen de bounding box van "${routeInfo.fileName}" (Test 4 hierboven).`
            : 'Nog geen route geladen bij Test 4 — gebruikt het vaste testgebied bij Zutphen.'}
        </p>
        <button onClick={runOsmFallbackTest} disabled={osmLoading}>
          {osmLoading ? 'Bezig met zoeken...' : "Zoek POI's via Overpass (OSM)"}
        </button>
        {osmResults && (
          <div style={{ textAlign: 'left', marginTop: '1em' }}>
            <p>
              {osmResults.length} resultaat/resultaten gevonden via Overpass.
              {osmFilterAvailable && (
                <>
                  {' '}
                  Na filteren op duplicaten met Test 3 (Wikidata) en punten zonder bruikbare
                  tekst blijven er <strong>{filteredOsmResults.length}</strong> over (
                  {osmSkippedCount} overgeslagen).
                </>
              )}
              {!osmFilterAvailable && (
                <>
                  {' '}
                  <span style={{ color: 'red' }}>
                    Let op: filterAndDedupeOsmCandidates() niet beschikbaar — toont ongefilterde
                    resultaten (osm-fallback.js niet correct geladen of verouderd).
                  </span>
                </>
              )}
            </p>
            <ul>
              {filteredOsmResults.map((poi) => (
                <li key={poi.id} style={{ marginBottom: '0.75em' }}>
                  <strong>{poi.label}</strong>
                  {poi.description ? ` — ${poi.description}` : ''}
                  <br />
                  <small>
                    {poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}
                    {poi.wikipediaUrl && (
                      <>
                        {' · '}
                        <a href={poi.wikipediaUrl} target="_blank" rel="noreferrer">
                          Wikipedia
                        </a>
                      </>
                    )}
                  </small>
                </li>
              ))}
            </ul>
          </div>
        )}
        {osmError && <p style={{ color: 'red' }}>{osmError}</p>}
      </section>

      <section>
        <h2>Test 6: Wikipedia-samenvattingen ophalen</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          Verrijkt de hierboven gevonden Test 3- (Wikidata) en Test 5-
          (OSM, gefilterd) resultaten samen met hun Wikipedia-samenvatting
          (max. 3 zinnen), via wikipedia-summary.js. Voer eerst Test 3
          en/of Test 5 uit.
        </p>
        <button onClick={runWikipediaSummaryTest} disabled={summaryLoading}>
          {summaryLoading ? 'Bezig met ophalen...' : 'Haal Wikipedia-samenvattingen op'}
        </button>
        {summaryResults && (
          <div style={{ textAlign: 'left', marginTop: '1em' }}>
            <p>{summaryResults.length} kandidaat/kandidaten verwerkt:</p>
            <ul>
              {summaryResults.map((item, index) => (
                <li key={item.id || index} style={{ marginBottom: '1em' }}>
                  <strong>{item.label}</strong>
                  <br />
                  {item.summary ? (
                    <>
                      {item.summary.thumbnailUrl && (
                        <img
                          src={item.summary.thumbnailUrl}
                          alt=""
                          style={{ maxWidth: '150px', display: 'block', margin: '0.5em 0' }}
                        />
                      )}
                      <span>{item.summary.extractShort}</span>
                      <br />
                      <small>{item.summary.attribution}</small>
                    </>
                  ) : (
                    <span style={{ color: 'red' }}>
                      Geen samenvatting: {item.summaryError}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {summaryError && <p style={{ color: 'red' }}>{summaryError}</p>}
      </section>

      <section style={{ marginTop: '2em' }}>
        <h2>Test 7: routekaart met corridor</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          Toont de route van Test 4 en de POI's van Test 3 en Test 5 (gefilterd). Groen = binnen
          de corridor (met stippellijn naar het punt op de route waar EuroPoi aankondigt), grijs =
          erbuiten. De slider filtert alleen lokaal; er wordt niet opnieuw gezocht.
        </p>
        <button type="button" onClick={() => setShowMap((v) => !v)}>
          {showMap ? 'Kaart verbergen' : 'Kaart tonen'}
        </button>

        {/* Kaart blijft altijd in de pagina staan; alleen de hoogte wisselt
            (zoals EuroPoi), zodat Leaflet zijn toestand behoudt. */}
        <div
          style={{
            height: showMap ? '320px' : '0px',
            overflow: 'hidden',
            marginTop: '0.75em',
            borderRadius: '12px',
          }}
        >
          <RouteMap routePoints={routeInfo ? routeInfo.points : null} pois={mapPois} />
        </div>

        <div style={{ textAlign: 'left', marginTop: '0.75em' }}>
          <label htmlFor="corridor-slider">
            Corridor: <strong>{corridorMeters} m</strong> aan weerszijden van de route
          </label>
          <input
            id="corridor-slider"
            type="range"
            min={CORRIDOR_MIN_METERS}
            max={CORRIDOR_MAX_METERS}
            step={CORRIDOR_STEP_METERS}
            value={corridorMeters}
            onChange={(e) => setCorridorMeters(Number(e.target.value))}
            disabled={!routeInfo}
            style={{ width: '100%', display: 'block', marginTop: '0.4em' }}
          />
          {!routeInfo && (
            <p>Laad eerst een GPX-route bij Test 4; zonder route is er geen corridor te meten.</p>
          )}
          {routeInfo && mapPois.length === 0 && (
            <p>Nog geen POI's gevonden — voer eerst Test 3 (en eventueel Test 5) uit.</p>
          )}
          {routeInfo && mapPois.length > 0 && (
            <>
              <p>
                <strong>{poisInCorridorCount}</strong> van {mapPois.length} POI's binnen de
                corridor.
              </p>
              <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                {mapPoisSorted.map((poi) => (
                  <li
                    key={poi.id}
                    style={{ marginBottom: '0.4em', color: poi.inCorridor ? 'inherit' : '#94a3b8' }}
                  >
                    {poi.inCorridor ? '●' : '○'} {poi.label} —{' '}
                    {Number.isFinite(poi.distanceToRoute)
                      ? `${Math.round(poi.distanceToRoute)} m van de route`
                      : 'afstand onbekend'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </>
  )
}

export default App
