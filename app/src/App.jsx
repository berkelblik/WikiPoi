import { useState, useEffect, useMemo } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
import '../../src/poi-categories.js'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import RouteMap from './components/RouteMap.jsx'
import Onderweg from './onderweg/Onderweg.jsx'
import { getCategoryStyle } from './components/poi-icons.js'
import './App.css'

// WikiPoi — één doorlopende flow in zeven stappen:
//   1. Route (GPX)  2. Categorieën (+ optioneel OSM)  3. Zoeken
//   4. Kaart met corridor-slider  5. Wikipedia-samenvattingen  6. CSV voor EuroPoi
//   7. Onderweg (zelfstandig gebruik: GPS volgen langs de route)
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

// Alle categorieën met QID's gaan samen in één Wikidata-verzoek (gemeten:
// ± 3× sneller dan één verzoek per categorie, en minder kans op een fout
// bij drukte). De resultaatlimiet schaalt mee met het aantal categorieën,
// zodat er niet minder POI's gevonden worden dan met losse verzoeken.
const WIKIDATA_LIMIT_PER_CATEGORY = 300

const SUMMARY_MAX_SENTENCES = 3

// Triggerstraal per POI in de EuroPoi-CSV: altijd 0, EuroPoi kiest zelf
// (op basis van vervoerswijze en, in route-modus, de afstand tot de route).
const DEFAULT_TRIGGER_RADIUS_METERS = 0

const MAP_HEIGHT = '320px'

// Zoekresultaten van meerdere zoekopdrachten samenvoegen: bij hetzelfde id
// wint het EERST gevonden item (en dus diens categoryKey). Het gecombineerde
// QID-verzoek komt eerst, "Gebouwd erfgoed" (hasProperty) als laatste — een
// kerk die ook rijksmonument is, houdt zo het specifiekere kerk-icoon.
// Items zonder id worden altijd behouden.
function dedupeFirstWins(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item.id) return true
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

// Bepaalt de categorie van een item uit het gecombineerde QID-verzoek: de
// eerste categorie (in de volgorde van poi-categories.js) waarvan een QID in
// item.matchedTypes voorkomt. Zelfde "eerste wint"-principe als vroeger met
// één verzoek per categorie.
function categoryKeyForMatchedTypes(item, categories) {
  const types = item.matchedTypes || []
  const match = categories.find((c) => c.qids.some((qid) => types.includes(qid)))
  return match ? match.key : null
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
  // Seconden sinds de huidige voortgangsmelding verscheen (zie effect hieronder).
  const [progressSeconds, setProgressSeconds] = useState(0)
  const [searchError, setSearchError] = useState('')
  // Melding als OpenStreetMap faalde; de Wikidata-resultaten blijven dan staan.
  const [osmWarning, setOsmWarning] = useState('')
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

  // Verstreken tijd bij de voortgangsmelding van stap 3: elke nieuwe melding
  // (volgende zoekopdracht) begint weer bij 0. Zo is bij een trage Wikidata-
  // server te zien dat de app nog bezig is, en hoe lang één verzoek duurt.
  useEffect(() => {
    if (!searchProgress) return undefined
    const startedAt = Date.now()
    setProgressSeconds(0)
    const timer = setInterval(() => {
      setProgressSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [searchProgress])

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
  // De categorie (= routenaam) koppelt de POI's in EuroPoi aan de route;
  // die heet daar standaard naar het GPX-bestand. Waarschuwen bij verschil.
  const fileRouteName = routeInfo ? routeNameFromFileName(routeInfo.fileName) : ''
  const routeNameDiffers = fileRouteName !== '' && routeName.trim() !== fileRouteName

  function resetResults() {
    setWikidataResults(null)
    setOsmResults(null)
    setMergedCount(0)
    setSearchProgress('')
    setSearchError('')
    setOsmWarning('')
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

      // Eén gecombineerd verzoek voor alle aangevinkte categorieën met QID's;
      // per item bepaalt matchedTypes daarna de categorie (categoryKey →
      // kleur en icoon). Daarna één verzoek per hasProperty-categorie
      // ("Gebouwd erfgoed"), zie dedupeFirstWins().
      const selected = categoryList.filter((c) => selectedCategoryKeys.includes(c.key))
      const qidCategories = selected.filter((c) => c.qids.length > 0)
      const wikidataJobs = []
      if (qidCategories.length > 0) {
        wikidataJobs.push({
          label: qidCategories.length === 1 ? qidCategories[0].label : 'alle categorieën',
          query: {
            instanceOf: qidCategories.flatMap((c) => c.qids),
            limit: WIKIDATA_LIMIT_PER_CATEGORY * qidCategories.length,
            optimizerHint: qidCategories.length > 1,
          },
          categoryKeyFor: (item) => categoryKeyForMatchedTypes(item, qidCategories),
        })
      }
      selected
        .filter((c) => c.hasProperty)
        .forEach((c) => {
          wikidataJobs.push({
            label: c.label,
            query: { hasProperty: c.hasProperty },
            categoryKeyFor: () => c.key,
          })
        })
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
        setSearchProgress(`Wikidata: ${job.label} (${done} van ${total})`)
        const found = await window.WikiPoiWikidataSearch.searchWikidataBox(routeInfo.bbox, job.query)
        results = results.concat(found.map((item) => ({ ...item, categoryKey: job.categoryKeyFor(item) })))
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

      // Faalt OpenStreetMap (bijv. HTTP 429 Too Many Requests), dan gaan de
      // al gevonden Wikidata-resultaten niet verloren: de zoekactie gaat
      // verder zonder OSM en toont een melding (zoals het script).
      let osm = []
      try {
        for (const category of osmCategories) {
          done += 1
          setSearchProgress(`OpenStreetMap: ${category.label} (${done} van ${total})`)
          const tagFilterGroups = window.WikiPoiCategories.osmTagFiltersForKeys([category.key])
          const found = await window.WikiPoiOsmFallback.searchOverpass(routeInfo.bbox, tagFilterGroups)
          osm = osm.concat(found.map((item) => ({ ...item, categoryKey: category.key })))
        }
      } catch (err) {
        osm = []
        setOsmWarning(
          'Let op: OpenStreetMap niet beschikbaar (' + (err && err.message ? err.message : String(err)) + '). Resultaten zonder OpenStreetMap.'
        )
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

  // Haalt de ontbrekende samenvattingen op, alleen voor POI's binnen de
  // corridor: wie de slider verbreedt, haalt daarna alleen de nieuwe op.
  // Geeft de volledige, bijgewerkte verzameling terug, zodat de export die
  // direct kan gebruiken zonder op de state-update te wachten.
  async function fetchMissingSummaries() {
    const candidates = summaryMissingPois
    if (candidates.length === 0) return summariesById
    if (
      !window.WikiPoiWikipediaSummary ||
      typeof window.WikiPoiWikipediaSummary.fetchSummariesForCandidates !== 'function'
    ) {
      throw new Error('wikipedia-summary.js is niet correct geladen.')
    }
    const enriched = await window.WikiPoiWikipediaSummary.fetchSummariesForCandidates(candidates, {
      maxSentences: SUMMARY_MAX_SENTENCES,
    })
    const added = {}
    enriched.forEach((item, index) => {
      const id = item.id || candidates[index].id
      added[id] = { summary: item.summary || null, summaryError: item.summaryError || '' }
    })
    setSummariesById((prev) => ({ ...prev, ...added }))
    return { ...summariesById, ...added }
  }

  async function runSummaries() {
    setSummaryError('')
    setExportMessage('')
    if (summaryMissingPois.length === 0) return
    setSummaryLoading(true)
    try {
      await fetchMissingSummaries()
    } catch (err) {
      setSummaryError(errorText(err))
    } finally {
      setSummaryLoading(false)
    }
  }

  async function exportCsv() {
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
      // Eerst de ontbrekende samenvattingen ophalen, zodat de CSV nooit per
      // ongeluk alleen de korte Wikidata-omschrijvingen bevat.
      let summaries = summariesById
      if (summaryMissingPois.length > 0) {
        setSummaryError('')
        setSummaryLoading(true)
        try {
          summaries = await fetchMissingSummaries()
        } catch (err) {
          setExportError('Samenvattingen ophalen mislukt (' + errorText(err) + '). Probeer het opnieuw.')
          return
        } finally {
          setSummaryLoading(false)
        }
      }
      // Tekst: alleen de Wikipedia-samenvatting, zonder bronvermelding (die
      // zou in EuroPoi worden voorgelezen; WikiPoi toont hem bij stap 5).
      // Zonder samenvatting de Wikidata-omschrijving.
      const rows = corridorPois.map((p) => {
        const entry = summaries[p.id]
        const summary = entry && entry.summary
        const desc = summary ? summary.extractShort || '' : p.description || ''
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
      // Met BOM, zodat ook spreadsheetprogramma's (Excel) de tekens goed
      // tonen; EuroPoi leest het bestand met of zonder BOM.
      const csvText = window.EuroPoiCsv.toEuroPoiCsvWithBom(rows)
      const fileName = csvFileName(category)
      if (isNative) {
        await shareCsvNative(csvText, fileName, rows.length)
        return
      }
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

  // Android-app: een download via de browser werkt in de WebView niet.
  // Daarom het bestand in de cache van de app zetten en het Android-
  // deelmenu openen; de gebruiker kiest zelf waarheen (Bestanden, Drive,
  // e-mail, WhatsApp, of een app zoals EuroPoi die CSV-bestanden aanneemt).
  async function shareCsvNative(csvText, fileName, count) {
    const written = await Filesystem.writeFile({
      path: fileName,
      data: csvText,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    try {
      await Share.share({
        title: fileName,
        files: [written.uri],
        dialogTitle: 'CSV delen of opslaan',
      })
      setExportMessage(`"${fileName}" (${count} POI's) is aangeboden om te delen of op te slaan.`)
    } catch (err) {
      const text = err && err.message ? err.message : String(err)
      if (/cancel/i.test(text)) {
        setExportMessage('Delen geannuleerd. Druk opnieuw op de knop om het bestand alsnog te delen.')
        return
      }
      throw err
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
          {searchProgress && (
            <p className="muted">
              {searchProgress}
              {progressSeconds > 0 ? ` — ${progressSeconds} s` : ''}
            </p>
          )}
          {searchDone && (
            <p>
              <strong>{allPois.length}</strong> POI's gevonden
              {mergedCount > 0 && `, ${mergedCount} dubbele samengevoegd`}
              {useOsm && `, waarvan ${osmFoundCount} via OpenStreetMap`}.
            </p>
          )}
          {osmWarning && <p className="error">{osmWarning}</p>}
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
          <p className="muted">
            Optioneel: bij opslaan (stap 6) worden ontbrekende samenvattingen automatisch opgehaald.
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
                        <>
                          <p className="summary-text">{entry.summary.extractShort}</p>
                          {entry.summary.attribution && (
                            <p className="summary-text muted">{entry.summary.attribution}</p>
                          )}
                        </>
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
          {routeNameDiffers && (
            <div style={{ marginBottom: '14px' }}>
              <p className="muted">
                Let op: deze naam wijkt af van de GPX-bestandsnaam "{fileRouteName}". In EuroPoi
                koppelt de categorie de POI's aan de route met dezelfde naam; bij een andere naam
                worden ze niet aan deze route gekoppeld.
              </p>
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => setRouteName(fileRouteName)}
              >
                Bestandsnaam gebruiken
              </button>
            </div>
          )}
          {summaryMissingPois.length > 0 && (
            <p className="muted">
              Voor {summaryMissingPois.length} POI's wordt de samenvatting bij opslaan eerst
              opgehaald.
            </p>
          )}
          <button
            type="button"
            className="btn btn-pink btn-wide"
            onClick={exportCsv}
            disabled={corridorPois.length === 0 || summaryLoading}
          >
            {summaryLoading
              ? 'Samenvattingen ophalen…'
              : isNative
                ? `CSV delen of opslaan (${corridorPois.length} POI's)`
                : `CSV opslaan (${corridorPois.length} POI's)`}
          </button>
          {exportMessage && <p className="success">{exportMessage}</p>}
          {exportError && <p className="error">{exportError}</p>}
        </Step>

        <Step
          number={7}
          title="Onderweg"
          disabled={corridorPois.length === 0}
          hint="Zoek eerst POI's bij stap 3; er moet minstens één POI binnen de corridor liggen."
        >
          <Onderweg pois={corridorPois} summariesById={summariesById} />
        </Step>
      </main>
    </>
  )
}

export default App
