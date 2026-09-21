import { useState } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
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
  const [wikidataResults, setWikidataResults] = useState(null)
  const [wikidataError, setWikidataError] = useState('')
  const [wikidataLoading, setWikidataLoading] = useState(false)

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
    // Een nieuwe route maakt eerdere Wikidata-resultaten (van de vorige
    // route of het testgebied) ongeldig; laat de gebruiker niet naar
    // resultaten kijken die niet meer bij de huidige route horen.
    setWikidataResults(null)
    setWikidataError('')

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

      <section>
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
    </>
  )
}

export default App
