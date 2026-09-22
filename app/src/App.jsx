import { useState, useEffect } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
import '../../src/poi-categories.js'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import './App.css'

// Zoekstraal rond de route, zoals eerder afgesproken (~400m).
const SEARCH_RADIUS_METERS = 400

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
  const [osmResults, setOsmResults] = useState(null)
  const [osmError, setOsmError] = useState('')
  const [osmLoading, setOsmLoading] = useState(false)
  const [summaryResults, setSummaryResults] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

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
  const filteredOsmResults =
    osmResults && osmFilterAvailable
      ? window.WikiPoiOsmFallback.filterAndDedupeOsmCandidates(osmResults, wikidataResults || [])
      : osmResults
  const osmSkippedCount =
    osmResults && filteredOsmResults ? osmResults.length - filteredOsmResults.length : 0

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
          SEARCH_RADIUS_METERS
        )
        setRouteInfo({
          fileName: file.name,
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
              Berekende bounding box (marge {SEARCH_RADIUS_METERS}m):
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
            <p>{wikidataResults.length} resultaat/resultaten gevonden:</p>
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
    </>
  )
}

export default App
