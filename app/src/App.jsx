import { useState } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
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

// Voorbeeldfilter voor Test 5, in afwachting van poi-categories.js (die
// straks de echte categorie → tagfilter-koppeling levert): alles met een
// "historic"-tag (welke waarde dan ook), of tourism=attraction.
const EXAMPLE_OSM_TAG_FILTER_GROUPS = [
  [{ key: 'historic' }],
  [{ key: 'tourism', value: 'attraction' }],
]

function App() {
  const [csv, setCsv] = useState('')
  const [csvError, setCsvError] = useState('')
  const [gpsResult, setGpsResult] = useState('')
  const [gpsError, setGpsError] = useState('')
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [wikidataResults, setWikidataResults] = useState(null)
  const [wikidataError, setWikidataError] = useState('')
  const [wikidataLoading, setWikidataLoading] = useState(false)
  const [osmResults, setOsmResults] = useState(null)
  const [osmError, setOsmError] = useState('')
  const [osmLoading, setOsmLoading] = useState(false)
  const [summaryResults, setSummaryResults] = useState(null)
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)

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
      // Gebruik de bounding box van de geladen GPX-route (Test 4) als die
      // er is; anders het vaste testgebied bij Zutphen als fallback.
      const bbox = routeInfo ? routeInfo.bbox : FALLBACK_TEST_BBOX
      const results = await window.WikiPoiWikidataSearch.searchWikidataBox(bbox)
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
      const bbox = routeInfo ? routeInfo.bbox : FALLBACK_TEST_BBOX
      const results = await window.WikiPoiOsmFallback.searchOverpass(
        bbox,
        EXAMPLE_OSM_TAG_FILTER_GROUPS
      )
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
      // één lijst van kandidaten; beide kunnen een wikipediaUrl hebben.
      const candidates = [...(wikidataResults || []), ...(osmResults || [])]
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
        <h2>Test 3: POI's zoeken via Wikidata</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '0.5em' }}>
          {routeInfo
            ? `Zoekt binnen de bounding box van "${routeInfo.fileName}" (Test 4 hierboven).`
            : 'Nog geen route geladen bij Test 4 — gebruikt het vaste testgebied bij Zutphen.'}
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
          Voorbeeldfilter (nog niet gekoppeld aan poi-categories.js):
          "historic" (elke waarde) of "tourism=attraction".{' '}
          {routeInfo
            ? `Zoekt binnen de bounding box van "${routeInfo.fileName}" (Test 4 hierboven).`
            : 'Nog geen route geladen bij Test 4 — gebruikt het vaste testgebied bij Zutphen.'}
        </p>
        <button onClick={runOsmFallbackTest} disabled={osmLoading}>
          {osmLoading ? 'Bezig met zoeken...' : "Zoek POI's via Overpass (OSM)"}
        </button>
        {osmResults && (
          <div style={{ textAlign: 'left', marginTop: '1em' }}>
            <p>{osmResults.length} resultaat/resultaten gevonden:</p>
            <ul>
              {osmResults.map((poi) => (
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
          (OSM) resultaten samen met hun Wikipedia-samenvatting (max. 3
          zinnen), via wikipedia-summary.js. Voer eerst Test 3 en/of Test
          5 uit.
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
