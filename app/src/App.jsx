import { useState, useEffect, useMemo } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
import '../../src/poi-categories.js'
import { Capacitor } from '@capacitor/core'
import RouteMap from './components/RouteMap.jsx'
import { getCategoryStyle } from './components/poi-icons.js'
import './App.css'

// WikiPoi — één doorlopende flow in zes stappen:
//   1. Route (GPX)  2. Categorieën (+ optioneel OSM)  3. Zoeken
//   4. Kaart met corridor-slider  5. Wikipedia-samenvattingen  6. CSV voor EuroPoi
// Een stap wordt pas bruikbaar als de vorige klaar is. Wie route, categorieën
// of de OSM-schakelaar wijzigt, maakt eerdere zoekresultaten ongeldig; die
// worden dan gewist (resetResults).

// Corridor langs de route: de slider bepaalt hoe breed de strook aan
// weerszijden van de route is waarbinnen POI's meegaan. De bounding box van
// de zoekopdracht krijgt aan alle kanten een marge van de MAXIMALE
// corridorbreedte, zodat schuiven daarna alleen nog lokaal filtert.
const CORRIDOR_MAX_METERS = 500
const CORRIDOR_MIN_METERS = 50
const CORRIDOR_STEP_METERS = 25
const CORRIDOR_DEFAULT_METERS = 250

// Wikidata-items met verschillende QID's binnen deze afstand van elkaar
// worden als één POI behandeld (één gebouw, meerdere items).
const WIKIDATA_MERGE_METERS = 10

const SUMMARY_MAX_SENTENCES = 3

// Triggerstraal per POI in de EuroPoi-CSV. Voorlopig vast; later eventueel
// per categorie of instelbaar.
const DEFAULT_TRIGGER_RADIUS_METERS = 50

const MAP_HEIGHT = '320px'

// Zoekresultaten van meerdere categorieën samenvoegen: bij hetzelfde id wint
// het EERST gevonden item (en dus diens categoryKey). De zoekopdrachten
// draaien in de volgorde van poi-categories.js, met "Gebouwd erfgoed"
// (hasProperty) als laatste — een kerk die ook rijksmonument is, houdt zo
// het specifiekere kerk-icoon. Items zonder id worden altijd behouden.
function dedupeFirstWins(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item.id) return true
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function errorText(err) {
  return 'Fout: ' + (err && err.message ? err.message : String(err))
}

// Routenaam = bestandsnaam van de GPX zonder extensie.
function routeNameFromFileName(fileName) {
  return String(fileName || '').replace(/\.gpx$/i, '').trim()
}

// Bestandsnaam voor de CSV, zonder tekens die Windows/Android weigeren.
function csvFileName(routeName) {
  const safe = routeName.replace(/[\\/:*?"<>|]+/g, '-').trim()
  return (safe || 'wikipoi') + '.csv'
}

// Klein gekleurd rondje in de categoriekleur, voor de lijsten.
function CategoryDot({ categoryKey, faded }) {
  return (
    <span
      aria-hidden="true"
      className="category-dot"
      style={{
        background: getCategoryStyle(categoryKey).color,
        opacity: faded ? 0.45 : 1,
      }}
    />
  )
}

// Eén genummerde stap. Zolang de stap nog niet bruikbaar is, staat er
// alleen een aanwijzing wat eerst moet gebeuren.
function Step({ number, title, disabled, hint, children }) {
  return (
    <section className={disabled ? 'step step-disabled' : 'step'}>
      <h2 className="step-title">
        <span className="step-number">{number}</span>
        {title}
      </h2>
      {disabled ? <p className="step-hint">{hint}</p> : children}
    </section>
  )
}

function App() {
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeError, setRouteError] = useState('')
  const [selectedCategoryKeys, setSelectedCategoryKeys] = useState([])
  const [useOsm, setUseOsm] = useState(false)
  const [wikidataResults, setWikidataResults] = useState(null)
  const [osmResults, setOsmResults] = useState(null)
  const [mergedCount, setMergedCount] = useState(0)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchProgress, setSearchProgress] = useState('')
  const [searchError, setSearchError] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [corridorMeters, setCorridorMeters] = useState(CORRIDOR_DEFAULT_METERS)
  // Samenvattingen per POI-id: { summary, summaryError }. Een id dat hier
  // (nog) niet in staat, is nog niet opgehaald.
  const [summariesById, setSummariesById] = useState({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [routeName, setRouteName] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')

  const isNative = Capacitor.isNativePlatform()

  // De standaard-aangevinkte categorieën komen uit poi-categories.js zelf;
  // dat kan pas ná de module-import ingelezen worden, dus in een effect.
  useEffect(() => {
    if (window.WikiPoiCategories && typeof window.WikiPoiCategories.getDefaultSelectedKeys === 'function') {
      setSelectedCategoryKeys(window.WikiPoiCategories.getDefaultSelectedKeys())
    }
  }, [])

  const categoriesAvailable =
    !!window.WikiPoiCategories && typeof window.WikiPoiCategories.getCategories === 'function'
  const categoryList = useMemo(
    () => (categoriesAvailable ? window.WikiPoiCategories.getCategories('nl') : []),
    [categoriesAvailable]
  )
  const coreCategories = categoryList.filter((c) => !c.group)
  const extraCategories = categoryList.filter((c) => c.group === 'nieuw')
  const maxExtraCategories = categoriesAvailable
    ? window.WikiPoiCategories.validateCategorySelection(selectedCategoryKeys).maxExtraCategories
    : 2
  const extraSelectedCount = extraCategories.filter((c) => selectedCategoryKeys.includes(c.key)).length

  // Categorienaam per key, voor popups, legenda en lijsten.
  const categoryLabelByKey = useMemo(() => {
    const labels = {}
    categoryList.forEach((c) => {
      labels[c.key] = c.label
    })
    return labels
  }, [categoryList])

  const searchDone = wikidataResults !== null

  // Alle gevonden POI's (Wikidata + eventueel OSM, al gefilterd bij het zoeken).
  const allPois = useMemo(
    () => [...(wikidataResults || []), ...(osmResults || [])],
    [wikidataResults, osmResults]
  )

  // Per POI de afstand tot de route en het dichtstbijzijnde routepunt (= waar
  // EuroPoi straks aankondigt). Alleen herberekend bij een nieuwe route of
  // nieuwe zoekresultaten — niet bij het verschuiven van de slider.
  const routeMeasuredPois = useMemo(() => {
    const routePoints = routeInfo ? routeInfo.points : null
    const canMeasure =
      !!routePoints &&
      routePoints.length > 0 &&
      !!window.WikiPoiRouteBuffer &&
      typeof window.WikiPoiRouteBuffer.closestPointOnRoute === 'function'
    return allPois.map((c) => {
      const categoryLabel = categoryLabelByKey[c.categoryKey] || 'Onbekende categorie'
      if (!canMeasure) {
        return { ...c, categoryLabel, distanceToRoute: null, snapPoint: null }
      }
      const r = window.WikiPoiRouteBuffer.closestPointOnRoute(c, routePoints)
      return { ...c, categoryLabel, distanceToRoute: r.distance, snapPoint: r.point }
    })
  }, [allPois, routeInfo, categoryLabelByKey])

  // Goedkope stap die wél bij elke sliderbeweging draait: binnen/buiten de
  // corridor markeren.
  const mapPois = useMemo(
    () =>
      routeMeasuredPois.map((p) => ({
        ...p,
        inCorridor: p.distanceToRoute === null ? true : p.distanceToRoute <= corridorMeters,
      })),
    [routeMeasuredPois, corridorMeters]
  )
  const mapPoisSorted = useMemo(
    () => [...mapPois].sort((a, b) => (a.distanceToRoute ?? 0) - (b.distanceToRoute ?? 0)),
    [mapPois]
  )
  const corridorPois = mapPoisSorted.filter((p) => p.inCorridor)
  const summaryMissingPois = corridorPois.filter((p) => !(p.id in summariesById))
  const summaryFoundCount = corridorPois.filter(
    (p) => summariesById[p.id] && summariesById[p.id].summary
  ).length

  function resetResults() {
    setWikidataResults(null)
    setOsmResults(null)
    setMergedCount(0)
    setSearchProgress('')
    setSearchError('')
    setSummariesById({})
    setSummaryError('')
    setExportMessage('')
    setExportError('')
  }

  function toggleCategory(key) {
    if (searchLoading) return
    const isSelected = selectedCategoryKeys.includes(key)
    if (!isSelected) {
      const cat = categoryList.find((c) => c.key === key)
      if (cat && cat.group === 'nieuw' && extraSelectedCount >= maxExtraCategories) return
    }
    setSelectedCategoryKeys(
      isSelected ? selectedCategoryKeys.filter((k) => k !== key) : [...selectedCategoryKeys, key]
    )
    resetResults()
  }

  function toggleOsm() {
    if (searchLoading) return
    setUseOsm((v) => !v)
    resetResults()
  }

  function handleGpxFileChange(event) {
    const file = event.target.files && event.target.files[0]
    // Zelfde bestand opnieuw kiezen moet ook weer een change-event geven.
    event.target.value = ''
    if (!file) return
    setRouteError('')
    setRouteInfo(null)
    resetResults()

    if (
      !window.WikiPoiRouteBuffer ||
      typeof window.WikiPoiRouteBuffer.parseGpxLineString !== 'function'
    ) {
      setRouteError('Fout: route-buffer.js is niet correct geladen.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = window.WikiPoiRouteBuffer.parseGpxLineString(String(reader.result))
        if (!parsed.points || parsed.points.length === 0) {
          setRouteError('Geen track- of routepunten gevonden in dit GPX-bestand.')
          return
        }
        setRouteInfo({
          fileName: file.name,
          points: parsed.points,
          pointCount: parsed.points.length,
          name: parsed.name,
          bbox: window.WikiPoiRouteBuffer.getBoundingBox(parsed.points, CORRIDOR_MAX_METERS),
        })
        setRouteName(routeNameFromFileName(file.name))
      } catch (err) {
        setRouteError(errorText(err))
      }
    }
    reader.onerror = () => {
      setRouteError('Fout: kon het bestand niet lezen.')
    }
    reader.readAsText(file)
  }

  async function runSearch() {
    if (!routeInfo) return
    resetResults()
    setSearchLoading(true)
    try {
      if (
        !window.WikiPoiWikidataSearch ||
        typeof window.WikiPoiWikidataSearch.searchWikidataBox !== 'function'
      ) {
        setSearchError('Fout: wikidata-search.js is niet correct geladen.')
        return
      }
      if (!categoriesAvailable) {
        setSearchError('Fout: poi-categories.js is niet correct geladen.')
        return
      }
      if (
        useOsm &&
        (!window.WikiPoiOsmFallback || typeof window.WikiPoiOsmFallback.searchOverpass !== 'function')
      ) {
        setSearchError('Fout: osm-fallback.js is niet correct geladen.')
        return
      }

      // Per aangevinkte categorie een eigen zoekopdracht, zodat elk
      // resultaat weet via welke categorie het gevonden is (categoryKey →
      // kleur en icoon). Eerst instanceOf, daarna hasProperty ("Gebouwd
      // erfgoed"), zie dedupeFirstWins().
      const selected = categoryList.filter((c) => selectedCategoryKeys.includes(c.key))
      const wikidataJobs = [
        ...selected
          .filter((c) => c.qids.length > 0)
          .map((c) => ({ category: c, query: { instanceOf: c.qids } })),
        ...selected
          .filter((c) => c.hasProperty)
          .map((c) => ({ category: c, query: { hasProperty: c.hasProperty } })),
      ]
      if (wikidataJobs.length === 0) {
        setSearchError('Kies minimaal één categorie bij stap 2.')
        return
      }
      const osmCategories = useOsm ? selected.filter((c) => c.osmTags && c.osmTags.length > 0) : []
      const total = wikidataJobs.length + osmCategories.length
      let done = 0

      let results = []
      for (const job of wikidataJobs) {
        done += 1
        setSearchProgress(`Wikidata: ${job.category.label} (${done} van ${total})`)
        const found = await window.WikiPoiWikidataSearch.searchWikidataBox(routeInfo.bbox, job.query)
        results = results.concat(found.map((item) => ({ ...item, categoryKey: job.category.key })))
      }
      results = dedupeFirstWins(results)
      const categoryKeyById = new Map(results.map((item) => [item.id, item.categoryKey]))

      // Verschillende QID's op (vrijwel) dezelfde plek samenvoegen, bijv.
      // Broederenkerk + Waalse kerk in Zutphen — één pand, twee items.
      let merged = 0
      if (typeof window.WikiPoiWikidataSearch.dedupeByProximity === 'function') {
        const before = results.length
        results = window.WikiPoiWikidataSearch.dedupeByProximity(results, {
          thresholdMeters: WIKIDATA_MERGE_METERS,
        })
        merged = before - results.length
      }
      // Vangnet: categorie via het id herstellen als die bij samenvoegen wegviel.
      results = results.map((item) =>
        item.categoryKey ? item : { ...item, categoryKey: categoryKeyById.get(item.id) || null }
      )

      let osm = []
      for (const category of osmCategories) {
        done += 1
        setSearchProgress(`OpenStreetMap: ${category.label} (${done} van ${total})`)
        const tagFilterGroups = window.WikiPoiCategories.osmTagFiltersForKeys([category.key])
        const found = await window.WikiPoiOsmFallback.searchOverpass(routeInfo.bbox, tagFilterGroups)
        osm = osm.concat(found.map((item) => ({ ...item, categoryKey: category.key })))
      }
      osm = dedupeFirstWins(osm)
      // OSM-punten die al via Wikidata gevonden zijn, of geen bruikbare
      // tekst hebben, vallen af (osm-fallback.js).
      if (
        osm.length > 0 &&
        typeof window.WikiPoiOsmFallback.filterAndDedupeOsmCandidates === 'function'
      ) {
        osm = window.WikiPoiOsmFallback.filterAndDedupeOsmCandidates(osm, results)
      }

      setMergedCount(merged)
      setOsmResults(osm)
      setWikidataResults(results)
      setSearchProgress('')
    } catch (err) {
      setSearchError(errorText(err))
      setSearchProgress('')
    } finally {
      setSearchLoading(false)
    }
  }

  // Alleen voor POI's binnen de corridor, en alleen voor die nog niet
  // opgehaald zijn: wie de slider verbreedt, haalt daarna alleen de nieuwe op.
  async function runSummaries() {
    setSummaryError('')
    setExportMessage('')
    if (
      !window.WikiPoiWikipediaSummary ||
      typeof window.WikiPoiWikipediaSummary.fetchSummariesForCandidates !== 'function'
    ) {
      setSummaryError('Fout: wikipedia-summary.js is niet correct geladen.')
      return
    }
    const candidates = summaryMissingPois
    if (candidates.length === 0) return
    setSummaryLoading(true)
    try {
      const enriched = await window.WikiPoiWikipediaSummary.fetchSummariesForCandidates(candidates, {
        maxSentences: SUMMARY_MAX_SENTENCES,
      })
      setSummariesById((prev) => {
        const next = { ...prev }
        enriched.forEach((item, index) => {
          const id = item.id || candidates[index].id
          next[id] = { summary: item.summary || null, summaryError: item.summaryError || '' }
        })
        return next
      })
    } catch (err) {
      setSummaryError(errorText(err))
    } finally {
      setSummaryLoading(false)
    }
  }

  function exportCsv() {
    setExportError('')
    setExportMessage('')
    try {
      if (!window.EuroPoiCsv || typeof window.EuroPoiCsv.toEuroPoiCsv !== 'function') {
        setExportError('Fout: europoi-csv.js is niet correct geladen.')
        return
      }
      const category = routeName.trim()
      if (!category) {
        setExportError('Vul een routenaam in; die wordt de categorie in EuroPoi.')
        return
      }
      if (corridorPois.length === 0) {
        setExportError('Er liggen geen POI\'s binnen de corridor. Verbreed de strook bij stap 4.')
        return
      }
      // Tekst: Wikipedia-samenvatting met bronvermelding (CC BY-SA vraagt om
      // naamsvermelding); zonder samenvatting de Wikidata-omschrijving.
      const rows = corridorPois.map((p) => {
        const entry = summariesById[p.id]
        const summary = entry && entry.summary
        const desc = summary
          ? [summary.extractShort, summary.attribution].filter(Boolean).join(' ')
          : p.description || ''
        return {
          lat: p.lat,
          lng: p.lng,
          name: p.label || '(zonder naam)',
          desc,
          category,
          radius: DEFAULT_TRIGGER_RADIUS_METERS,
          mp3: '',
        }
      })
      const csvText = window.EuroPoiCsv.toEuroPoiCsv(rows)
      const fileName = csvFileName(category)
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportMessage(`${rows.length} POI's opgeslagen in "${fileName}".`)
    } catch (err) {
      setExportError(errorText(err))
    }
  }

  function renderCategoryItem(cat, isExtra) {
    const checked = selectedCategoryKeys.includes(cat.key)
    const blocked = isExtra && !checked && extraSelectedCount >= maxExtraCategories
    const disabled = searchLoading || blocked
    return (
      <li key={cat.key} className={disabled ? 'category-item is-disabled' : 'category-item'}>
        <label>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => toggleCategory(cat.key)}
          />
          <span className="category-text">
            <span className="category-name">
              <CategoryDot categoryKey={cat.key} />
              {cat.label}
            </span>
            <span className="category-desc">{cat.description}</span>
          </span>
        </label>
      </li>
    )
  }

  const osmFoundCount = osmResults ? osmResults.length : 0

  return (
    <>
      <header className="app-header">
        <div className="app-logo" aria-hidden="true">
          W
        </div>
        <div>
          <div className="app-title">WikiPoi</div>
          <div className="app-subtitle">Bezienswaardigheden langs je route</div>
        </div>
      </header>

      <main className="app-main">
        <Step number={1} title="Route">
          <label className={searchLoading ? 'btn btn-blue is-disabled' : 'btn btn-blue'}>
            <input
              type="file"
              accept=".gpx"
              onChange={handleGpxFileChange}
              disabled={searchLoading}
              hidden
            />
            {routeInfo ? 'Andere route' : 'GPX kiezen'}
          </label>
          {routeInfo && (
            <p>
              <strong>{routeInfo.fileName}</strong>
              <br />
              <span className="muted">{routeInfo.pointCount} routepunten</span>
            </p>
          )}
          {!routeInfo && !routeError && (
            <p className="muted">Kies het GPX-bestand van je fiets- of wandelroute.</p>
          )}
          {routeError && <p className="error">{routeError}</p>}
        </Step>

        <Step number={2} title="Categorieën">
          {!categoriesAvailable && <p className="error">Fout: poi-categories.js is niet correct geladen.</p>}
          {categoriesAvailable && (
            <>
              <ul className="category-list">{coreCategories.map((cat) => renderCategoryItem(cat, false))}</ul>
              <p className="category-group-title">
                Verzamelcategorieën <span className="muted">(max. {maxExtraCategories} tegelijk)</span>
              </p>
              <ul className="category-list">{extraCategories.map((cat) => renderCategoryItem(cat, true))}</ul>
              <label className={searchLoading ? 'toggle-row is-disabled' : 'toggle-row'}>
                <input type="checkbox" checked={useOsm} disabled={searchLoading} onChange={toggleOsm} />
                <span>
                  Ook OpenStreetMap doorzoeken
                  <br />
                  <span className="muted">Vindt soms extra punten, maar maakt het zoeken trager.</span>
                </span>
              </label>
            </>
          )}
        </Step>

        <Step number={3} title="Zoeken" disabled={!routeInfo} hint="Kies eerst een route bij stap 1.">
          <button
            type="button"
            className="btn btn-yellow btn-wide"
            onClick={runSearch}
            disabled={searchLoading || selectedCategoryKeys.length === 0}
          >
            {searchLoading ? 'Bezig met zoeken…' : searchDone ? 'Opnieuw zoeken' : "POI's zoeken"}
          </button>
          {selectedCategoryKeys.length === 0 && <p className="muted">Kies minimaal één categorie bij stap 2.</p>}
          {searchProgress && <p className="muted">{searchProgress}</p>}
          {searchDone && (
            <p>
              <strong>{allPois.length}</strong> POI's gevonden
              {mergedCount > 0 && `, ${mergedCount} dubbele samengevoegd`}
              {useOsm && `, waarvan ${osmFoundCount} via OpenStreetMap`}.
            </p>
          )}
          {searchError && <p className="error">{searchError}</p>}
        </Step>

        <Step number={4} title="Kaart" disabled={!routeInfo} hint="Kies eerst een route bij stap 1.">
          <button type="button" className="btn btn-indigo btn-small" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Kaart verbergen' : 'Kaart tonen'}
          </button>
          {/* Kaart blijft in de pagina staan; alleen de hoogte wisselt, zodat
              Leaflet zijn toestand behoudt. */}
          <div className="map-frame" style={{ height: showMap ? MAP_HEIGHT : '0px' }}>
            <RouteMap
              routePoints={routeInfo ? routeInfo.points : null}
              pois={mapPois}
              corridorMeters={corridorMeters}
            />
          </div>
          <label htmlFor="corridor-slider" className="field-label">
            Corridor: {corridorMeters} m aan weerszijden van de route
          </label>
          <input
            id="corridor-slider"
            className="corridor-slider"
            type="range"
            min={CORRIDOR_MIN_METERS}
            max={CORRIDOR_MAX_METERS}
            step={CORRIDOR_STEP_METERS}
            value={corridorMeters}
            onChange={(e) => setCorridorMeters(Number(e.target.value))}
          />
          {!searchDone && <p className="muted">Na het zoeken bij stap 3 verschijnen hier de POI's.</p>}
          {searchDone && mapPois.length === 0 && (
            <p className="muted">Geen POI's gevonden. Kies andere categorieën bij stap 2.</p>
          )}
          {searchDone && mapPois.length > 0 && (
            <>
              <p>
                <strong>{corridorPois.length}</strong> van {mapPois.length} POI's binnen de corridor.
              </p>
              <ul className="poi-list">
                {mapPoisSorted.map((poi) => (
                  <li key={poi.id} className={poi.inCorridor ? '' : 'is-out'}>
                    <CategoryDot categoryKey={poi.categoryKey} faded={!poi.inCorridor} />
                    <span>
                      {poi.label}{' '}
                      <span className="muted">
                        ({poi.categoryLabel},{' '}
                        {Number.isFinite(poi.distanceToRoute)
                          ? `${Math.round(poi.distanceToRoute)} m`
                          : 'afstand onbekend'}
                        )
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>

        <Step number={5} title="Samenvattingen" disabled={!searchDone} hint="Zoek eerst POI's bij stap 3.">
          <p>
            <strong>{summaryFoundCount}</strong> van {corridorPois.length} POI's binnen de corridor
            hebben een Wikipedia-samenvatting.
          </p>
          <button
            type="button"
            className="btn btn-green btn-wide"
            onClick={runSummaries}
            disabled={summaryLoading || summaryMissingPois.length === 0}
          >
            {summaryLoading
              ? 'Bezig met ophalen…'
              : summaryMissingPois.length > 0
                ? `Samenvattingen ophalen (${summaryMissingPois.length})`
                : 'Alles opgehaald'}
          </button>
          {summaryError && <p className="error">{summaryError}</p>}
          {corridorPois.some((p) => p.id in summariesById) && (
            <ul className="poi-list summary-list">
              {corridorPois
                .filter((p) => p.id in summariesById)
                .map((poi) => {
                  const entry = summariesById[poi.id]
                  return (
                    <li key={poi.id}>
                      {entry.summary && entry.summary.thumbnailUrl && (
                        <img src={entry.summary.thumbnailUrl} alt="" />
                      )}
                      <span className="category-name">
                        <CategoryDot categoryKey={poi.categoryKey} />
                        {poi.label}
                      </span>
                      {entry.summary ? (
                        <p className="summary-text">{entry.summary.extractShort}</p>
                      ) : (
                        <p className="summary-text muted">
                          Geen samenvatting ({entry.summaryError || 'onbekende reden'}); de CSV
                          gebruikt de Wikidata-omschrijving.
                        </p>
                      )}
                    </li>
                  )
                })}
            </ul>
          )}
        </Step>

        <Step number={6} title="Exporteren" disabled={!searchDone} hint="Zoek eerst POI's bij stap 3.">
          <label htmlFor="route-name" className="field-label">
            Routenaam (categorie in EuroPoi)
          </label>
          <input
            id="route-name"
            className="text-input"
            type="text"
            value={routeName}
            onChange={(e) => setRouteName(e.target.value)}
          />
          {summaryMissingPois.length > 0 && (
            <p className="muted">
              Voor {summaryMissingPois.length} POI's is de samenvatting nog niet opgehaald (stap 5).
            </p>
          )}
          {isNative ? (
            <p className="muted">
              Opslaan werkt nog niet in de Android-app. Gebruik voorlopig de browserversie.
            </p>
          ) : (
            <button
              type="button"
              className="btn btn-pink btn-wide"
              onClick={exportCsv}
              disabled={corridorPois.length === 0}
            >
              CSV opslaan ({corridorPois.length} POI's)
            </button>
          )}
          {exportMessage && <p className="success">{exportMessage}</p>}
          {exportError && <p className="error">{exportError}</p>}
        </Step>
      </main>
    </>
  )
}

export default App
