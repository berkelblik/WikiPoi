import { useState, useEffect, useMemo, useRef } from 'react'
import '../../src/europoi-csv.js'
import '../../src/wikidata-search.js'
import '../../src/route-buffer.js'
import '../../src/osm-fallback.js'
import '../../src/wikipedia-summary.js'
import '../../src/artikel-via-ligging.js'
import '../../src/wikidata-zin.js'
import '../../src/commons-foto.js'
import '../../src/poi-categories.js'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import RouteMap from './components/RouteMap.jsx'
import Onderweg from './onderweg/Onderweg.jsx'
import CategoryDot from './components/CategoryDot.jsx'
import { telefoonTaal } from './taal.js'
import { pluscode } from './onderweg/pluscode.js'
import {
  isLink,
  isAudioBestand,
  koppelSleutels,
  normPluscode,
  zonderExtensie,
  grootteTekst,
} from './onderweg/mp3bron.js'
import * as AudioOpslag from './onderweg/audioOpslag.js'
import './App.css'
import { version as APP_VERSION } from '../package.json'
import { tekstMetNaam, toelichtingVan } from './onderweg/voorleestekst.js'
import { alleenBijPoi } from './onderweg/trigger.js'
import Welkom from './over/Welkom.jsx'
import OverWikiPoi from './over/OverWikiPoi.jsx'
import { welkomTonen, welkomBegrepen, welkomVergeten } from './over/welkom.js'
import Instellingen from './over/Instellingen.jsx'
import { controleer, autoControleNodig, leesLaatste, bewaarLaatste } from './over/update.js'
import {
  CORRIDOR_MAX_METERS,
  CORRIDOR_MIN_METERS,
  CORRIDOR_STEP_METERS,
  leesInstellingen,
  bewaarInstellingen,
  standaardTerug,
  kmTekst,
} from './instellingen.js'
import {
  effectieveBron,
  zoektWiki,
  gebruiktEigen,
  grensMeters,
  leesBron,
  bewaarBron,
  leesEigenMelden,
  bewaarEigenMelden,
} from './zoekbron.js'
import {
  MAX_TALEN,
  basis,
  taalNaam,
  effectieveVolgorde,
  beginTalen,
  lijstRijen,
  wisselTaal,
  verplaatsTaal,
  volgordeTekst,
  leesTaalKeuze,
  bewaarTaalKeuze,
} from './taalvolgorde.js'

// WikiPoi — één doorlopende flow in acht stappen (sinds 0.16.0):
//   1. Route (GPX)  2. Bronnen (zoeken in + eigen POI's uit een CSV)
//   3. Categorieën (+ optioneel OSM)  4. Zoeken  5. Kaart met corridor-slider
//   6. Wikipedia-samenvattingen  7. CSV voor EuroPoi
//   8. Onderweg (zelfstandig gebruik: GPS volgen langs de route)
// Een stap wordt pas bruikbaar als de vorige klaar is. Wie route, zoekbron,
// categorieën of de OSM-schakelaar wijzigt, maakt eerdere zoekresultaten
// ongeldig; die worden dan gewist (resetResults). Bij "Alleen eigen POI's"
// zijn stap 3 en 6 ingeklapt (niet nodig).
// Taal van de teksten (0.17.0, stap 2, taalvolgorde.js): automatisch
// (telefoontaal → taal van het land → en → fr → de) of een eigen volgorde.
// Heeft een POI geen artikel in de eerste taal, dan zoekt stap 6 op
// dezelfde plek naar een artikel in een taal die hoger staat dan zijn eigen
// artikel (artikel-via-ligging.js; sinds 0.17.3 niet alleen de eerste taal).
// Eigen POI's (CSV, stap 2) staan los van de zoekresultaten: importeren of
// verwijderen na het zoeken vraagt geen nieuwe zoekactie.

// Corridor langs de route: de slider bepaalt hoe breed de strook aan
// weerszijden van de route is waarbinnen POI's meegaan. De bounding box van
// de zoekopdracht krijgt aan alle kanten een marge van de MAXIMALE
// corridorbreedte, zodat schuiven daarna alleen nog lokaal filtert.
// Grenzen en stapgrootte: instellingen.js; de beginwaarde is een instelling
// (0.22.0, B3).

// Wikidata-items met verschillende QID's binnen deze afstand van elkaar
// worden als één POI behandeld (één gebouw, meerdere items).
const WIKIDATA_MERGE_METERS = 10
// Time-out per Overpass-poging, per server (ms). De query vraagt de server
// zelf om maximaal 25 s rekentijd; 30 s laat ruimte voor netwerkvertraging.
// Slechtste geval per categorie: 2 rondes x 2 servers x 30 s + 3 s pauze.
const OSM_TIMEOUT_MS = 30000

// Eigen POI's uit een CSV (EuroPoi-formaat): eigen categorie en kleur, geen
// Wikipedia. Een gevonden POI met dezelfde naam (hoofdletters/spaties
// genegeerd) binnen deze afstand van een eigen POI vervalt: de eigen POI wint.
// Of ze meedoen tot de grens eigen POI's (instelling, standaard 2 km) of alleen binnen de corridor, en
// of er ook (of alleen) in Wikidata wordt gezocht: zie zoekbron.js (0.15.0).
const EIGEN_CATEGORY_KEY = 'eigen'
const EIGEN_CATEGORY_LABEL = 'Eigen POI'
const EIGEN_DUBBEL_METERS = 100
// Keuzerondjes "Zoeken in" bovenaan stap 2 (0.15.0/0.16.0, zoekbron.js).
const ZOEKBRON_KEUZES = [
  { key: 'wiki', label: 'Wikidata/Wikipedia', uitleg: "De categorieën van stap 3; eigen POI's doen niet mee." },
  { key: 'eigen', label: "Alleen eigen POI's", uitleg: 'Uit je eigen CSV (hieronder); geen internet nodig.' },
  { key: 'beide', label: 'Beide', uitleg: "Wikidata/Wikipedia én de eigen POI's." },
]
// Zoveel overgeslagen regels worden met regelnummer en reden getoond.
const EIGEN_MAX_REDENEN = 5
// Zoveel niet-gekoppelde audiobestanden worden bij naam genoemd.
const AUDIO_MAX_NAMEN = 5

// Heeft deze POI een toelichting die het melden waard is (0.12.0)? Eigen
// POI's altijd (bewust toegevoegd). Anders: een Wikipedia-samenvatting of
// een zin uit Wikidata. Een korte Wikidata-omschrijving of alleen de naam
// telt niet. Nog niet opgehaald: wel als er een artikel is (wordt bij stap
// 5 of 6 opgehaald), niet zonder artikel. Ophalen mislukt terwijl er wel
// een artikel is (bijv. geen verbinding): telt mee, om niet op een
// tijdelijke fout af te vallen.
function heeftTekst(p, summaries) {
  if (p.eigen) return true
  const entry = summaries[p.id]
  if (!entry) return Boolean(p.wikipediaUrl)
  if (entry.summary) return true
  return Boolean(p.wikipediaUrl) && Boolean(entry.summaryError)
}

function vergelijkNaam(naam) {
  return String(naam || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Alle categorieën met QID's gaan samen in één Wikidata-verzoek (gemeten:
// ± 3× sneller dan één verzoek per categorie, en minder kans op een fout
// bij drukte). De resultaatlimiet schaalt mee met het aantal categorieën,
// zodat er niet minder POI's gevonden worden dan met losse verzoeken.
const WIKIDATA_LIMIT_PER_CATEGORY = 300

const SUMMARY_MAX_SENTENCES = 3

// Foto bij een samenvatting: eerst de foto met bronvermelding (entry.foto,
// Commons), anders de thumbnail van het artikel (bijv. een lokaal
// Wikipedia-bestand, zonder maker en licentie).
function fotoUrlVan(entry) {
  if (!entry) return null
  if (entry.foto && entry.foto.url) return entry.foto.url
  return entry.summary && entry.summary.thumbnailUrl ? entry.summary.thumbnailUrl : null
}

// Triggerstraal per POI in de EuroPoi-CSV: 0, EuroPoi kiest zelf (op basis
// van vervoerswijze en, in route-modus, de afstand tot de route). Eigen
// POI's met een radius > 0 in hun CSV houden die (0.19.1).
const DEFAULT_TRIGGER_RADIUS_METERS = 0

// "40 m" of "1,5 km" (melding afwijkende pluscode, 0.19.2).
function afstandTekst(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

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

// Laatste deel van een link als korte naam ("…/B-8-Staringkoepel-DEF-NL.mp3").
function linkNaam(link) {
  try {
    const delen = new URL(link).pathname.split('/').filter(Boolean)
    return decodeURIComponent(delen[delen.length - 1] || link)
  } catch {
    return String(link)
  }
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
  // Instellingen (0.22.0, onderwerp 5): standaardwaarden, ⚙ in de kopregel.
  const [instellingen, setInstellingen] = useState(leesInstellingen)
  const [toonInstellingen, setToonInstellingen] = useState(false)
  // Updatecontrole (D3): { bezig, uitkomst, laatsteMs }; melding = nieuwe
  // versie gevonden bij de automatische of handmatige controle.
  const [update, setUpdate] = useState(() => ({ bezig: false, uitkomst: null, laatsteMs: leesLaatste() }))
  const [updateMelding, setUpdateMelding] = useState(null)
  const eigenMaxM = instellingen.eigenMaxM
  const [corridorMeters, setCorridorMeters] = useState(() => instellingen.corridorM)
  // Samenvattingen per POI-id: { summary, summaryError }. Een id dat hier
  // (nog) niet in staat, is nog niet opgehaald.
  const [summariesById, setSummariesById] = useState({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [routeName, setRouteName] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  // Eigen POI's: { fileName, pois, melding, overgeslagen } of null.
  const [eigenImport, setEigenImport] = useState(null)
  const [eigenFout, setEigenFout] = useState('')
  // Lokale audiobestanden bij eigen POI's (0.11.0): bestandsnaam = pluscode,
  // zoals EuroPoi. { bestanden: [{ sleutel, url, naam }], geenAudio } of
  // null. Op het toestel bewaard in de app (0.14.0, audioOpslag.js; url =
  // afspeel-URL van het bewaarde bestand); in de browser een blob-URL,
  // alleen voor deze sessie.
  const [eigenAudio, setEigenAudio] = useState(null)
  const [audioOpslaan, setAudioOpslaan] = useState(false)
  // Gedownloade kopieën van mp3-links (0.14.0, alleen op het toestel):
  // perLink { <link>: { url, bytes } }; bezig { klaar, totaal } tijdens het
  // downloaden; resultaat { gelukt, totaal, fouten, melding } daarna.
  const [audioKopie, setAudioKopie] = useState({ perLink: {}, bezig: null, resultaat: null })
  // Alle bewaarde audio: { aantal, bytes }.
  const [audioTotaal, setAudioTotaal] = useState({ aantal: 0, bytes: 0 })
  // Volgnummer van de downloadronde: een nieuwe import of "Verwijderen"
  // breekt een lopende ronde af.
  const downloadRonde = useRef(0)
  // POI's zonder tekst (alleen naam of korte Wikidata-omschrijving) toch
  // melden en exporteren (0.12.0)? Standaard niet.
  const [ookZonderTekst, setOokZonderTekst] = useState(() => instellingen.ookZonderTekst)
  // Zelf gekozen POI's (0.19.4, S1a–S5a): POI's die vanzelf niet meedoen
  // (buiten de corridor, eigen POI te ver, zonder tekst) en die de gebruiker
  // bij stap 5 toch heeft aangevinkt. { [id]: true }; geldt tot een nieuwe
  // route of zoekactie (resetResults).
  const [gekozen, setGekozen] = useState({})
  // Kader "Niet opgenomen" bij stap 5 open of dicht (standaard dicht).
  const [toonNietOpgenomen, setToonNietOpgenomen] = useState(false)
  // POI's waarmee de lopende rit is gestart (0.20.0, R4a): die blijven
  // meedoen, ook als na het ophalen blijkt dat ze geen tekst hebben. null =
  // geen rit.
  const [ritIds, setRitIds] = useState(null)
  // Melding bij eerste gebruik en scherm "Over WikiPoi" (0.21.0).
  const [toonWelkom, setToonWelkom] = useState(() => welkomTonen(APP_VERSION))
  const [toonOver, setToonOver] = useState(false)
  const nietOpgenomenKop = useRef(null)
  // Zoekbron en wanneer eigen POI's meedoen (beide stap 2), 0.15.0:
  // bewaard en bij het starten teruggezet (zoekbron.js).
  const [bron, setBron] = useState(leesBron)
  const [eigenMelden, setEigenMelden] = useState(leesEigenMelden)
  // Taal van de teksten (0.17.0): { modus: 'auto'|'eigen', talen } —
  // bewaard (taalvolgorde.js). taalInfo: de volgorde die bij het laatste
  // zoeken gold { modus, talen, landTaal, landFout }, of null.
  const [taalKeuze, setTaalKeuze] = useState(leesTaalKeuze)
  const [taalInfo, setTaalInfo] = useState(null)

  const isNative = Capacitor.isNativePlatform()

  // Instellingen wijzigen (0.22.0): bewaren; corridor en "ook zonder tekst"
  // gaan meteen over op de nieuwe standaardwaarde als die gewijzigd is.
  function wijzigInstellingen(wijziging) {
    const nieuw = bewaarInstellingen({ ...instellingen, ...wijziging })
    setInstellingen(nieuw)
    if ('corridorM' in wijziging) setCorridorMeters(nieuw.corridorM)
    if ('ookZonderTekst' in wijziging) setOokZonderTekst(nieuw.ookZonderTekst)
  }
  // "Standaardwaarden terugzetten" (B6).
  function pasInstellingenToe(nieuw) {
    setInstellingen(nieuw)
    setCorridorMeters(nieuw.corridorM)
    setOokZonderTekst(nieuw.ookZonderTekst)
  }

  // Updatecontrole (D3/E1): handmatig vanuit Instellingen of automatisch bij
  // het opstarten. Een nieuwe versie geeft de melding onder de kopregel.
  const updateBezig = useRef(false)
  async function controleerOpUpdate(automatisch) {
    if (updateBezig.current) return
    updateBezig.current = true
    setUpdate((u) => ({ ...u, bezig: true }))
    const uitkomst = await controleer(APP_VERSION)
    const nu = Date.now()
    bewaarLaatste(nu)
    updateBezig.current = false
    // Automatisch: een fout blijft stil (ook niet in Instellingen).
    setUpdate((u) => ({
      bezig: false,
      uitkomst: automatisch && uitkomst.soort === 'fout' ? u.uitkomst : uitkomst,
      laatsteMs: nu,
    }))
    if (uitkomst.soort === 'nieuw') setUpdateMelding(uitkomst)
  }
  // Automatisch: hoogstens één keer per dag, alleen met internet, even na de
  // start zodat het opstarten er geen last van heeft.
  useEffect(() => {
    if (!instellingen.updateAuto) return undefined
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined
    if (!autoControleNodig(leesLaatste(), Date.now())) return undefined
    const t = setTimeout(() => controleerOpUpdate(true), 3000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // De standaard-aangevinkte categorieën komen uit poi-categories.js zelf;
  // dat kan pas ná de module-import ingelezen worden, dus in een effect.
  useEffect(() => {
    if (window.WikiPoiCategories && typeof window.WikiPoiCategories.getDefaultSelectedKeys === 'function') {
      setSelectedCategoryKeys(window.WikiPoiCategories.getDefaultSelectedKeys())
    }
  }, [])

  // Verstreken tijd bij de voortgangsmelding van stap 4: elke nieuwe melding
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
    labels[EIGEN_CATEGORY_KEY] = EIGEN_CATEGORY_LABEL
    return labels
  }, [categoryList])

  const searchDone = wikidataResults !== null
  // Zonder eigen POI's wordt altijd in Wikidata gezocht.
  const bronEffectief = effectieveBron(bron, !!eigenImport)
  const alleenEigen = bronEffectief === 'eigen'

  // Alle POI's: na het zoeken de eigen POI's (CSV) plus de gevonden POI's
  // (Wikidata + eventueel OSM, al gefilterd bij het zoeken). Een gevonden POI
  // met dezelfde naam binnen EIGEN_DUBBEL_METERS van een eigen POI vervalt.
  // Koppeling lokale audiobestanden → eigen POI's (op pluscode).
  const audioKoppeling = useMemo(() => {
    const perPoi = {}
    if (!eigenAudio) return { perPoi, gekoppeld: 0, nietGekoppeld: [] }
    const pois = eigenImport ? eigenImport.pois : []
    const gebruikt = new Set()
    pois.forEach((p) => {
      const bestand = eigenAudio.bestanden.find((b) => p.koppelSleutels.includes(b.sleutel))
      if (bestand) {
        perPoi[p.id] = { url: bestand.url, naam: bestand.naam }
        gebruikt.add(bestand.sleutel)
      }
    })
    const nietGekoppeld = eigenAudio.bestanden.filter((b) => !gebruikt.has(b.sleutel)).map((b) => b.naam)
    return { perPoi, gekoppeld: Object.keys(perPoi).length, nietGekoppeld }
  }, [eigenAudio, eigenImport])

  const { allPois, eigenVervangen } = useMemo(() => {
    const gevonden = zoektWiki(bronEffectief) ? [...(wikidataResults || []), ...(osmResults || [])] : []
    const eigen =
      searchDone && eigenImport && gebruiktEigen(bronEffectief)
        ? eigenImport.pois.map((p) => ({
            ...p,
            audioLokaal: audioKoppeling.perPoi[p.id] || null,
            audioKopie: isLink(p.mp3) ? audioKopie.perLink[p.mp3.trim()] || null : null,
          }))
        : []
    const rb = window.WikiPoiRouteBuffer
    if (eigen.length === 0 || !rb || typeof rb.haversineDistance !== 'function') {
      return { allPois: [...eigen, ...gevonden], eigenVervangen: 0 }
    }
    const over = gevonden.filter(
      (p) =>
        !eigen.some(
          (e) =>
            vergelijkNaam(e.label) === vergelijkNaam(p.label) &&
            rb.haversineDistance(e, p) <= EIGEN_DUBBEL_METERS
        )
    )
    return { allPois: [...eigen, ...over], eigenVervangen: gevonden.length - over.length }
  }, [wikidataResults, osmResults, eigenImport, searchDone, audioKoppeling, audioKopie, bronEffectief])

  // Blob-URL's van audiobestanden (browser) vrijgeven bij vervangen of afsluiten.
  useEffect(() => {
    if (!eigenAudio) return undefined
    return () => {
      eigenAudio.bestanden.forEach((b) => {
        if (b.url.startsWith('blob:')) URL.revokeObjectURL(b.url)
      })
    }
  }, [eigenAudio])

  // Offline audio (0.14.0): bij het starten op het toestel de bewaarde eigen
  // POI's, gekoppelde bestanden en kopieën terugzetten, en links zonder
  // kopie (bijv. een download die werd onderbroken) alsnog downloaden.
  useEffect(() => {
    if (!isNative) return undefined
    let actief = true
    ;(async () => {
      try {
        const eigen = await AudioOpslag.laadEigen()
        if (!actief || !eigen) return
        const index = await AudioOpslag.leesIndex()
        const bestanden = await AudioOpslag.laadLokaal(index)
        const perLink = await AudioOpslag.laadKopieen(index)
        if (!actief) return
        setEigenImport((huidig) => huidig || eigen)
        if (bestanden.length > 0) setEigenAudio((huidig) => huidig || { bestanden, geenAudio: 0 })
        setAudioKopie({ perLink, bezig: null, resultaat: null })
        setAudioTotaal(AudioOpslag.totaal(index))
        downloadLinks(eigen, { stil: true })
      } catch (err) {
        console.warn('Bewaarde eigen POI\'s laden mislukt:', err)
      }
    })()
    return () => {
      actief = false
    }
    // Alleen bij het starten (isNative verandert niet).
  }, [isNative])

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
  const eigenCount = routeMeasuredPois.filter((p) => p.eigen).length
  // Eigen POI's verder dan de grens (instelling, standaard 2 km; bij 'altijd melden'): wel
  // zichtbaar, doen niet mee. Bij 'alleen binnen de corridor' toont stap 5 dat
  // per POI.
  const eigenTeVer =
    eigenMelden === 'altijd'
      ? routeMeasuredPois.filter(
          (p) => p.eigen && Number.isFinite(p.distanceToRoute) && p.distanceToRoute > eigenMaxM
        ).length
      : 0

  // Goedkope stap die wél bij elke sliderbeweging draait: binnen/buiten de
  // corridor markeren.
  // Artikel via de ligging gevonden (stap 6, 0.17.0): naam, artikel en
  // taal van dat artikel; de oorspronkelijke naam blijft bewaard
  // (naamWikidata, net als bij de naam uit de artikeltitel, 0.17.1).
  const mapPois = useMemo(
    () =>
      routeMeasuredPois.map((p) => {
        const lig = summariesById[p.id] && summariesById[p.id].viaLigging
        return {
          ...p,
          ...(lig
            ? {
                label: lig.naam,
                labelLanguage: lig.taal,
                wikipediaUrl: lig.url,
                articleLanguage: lig.taal,
                naamWikidata: p.label,
              }
            : null),
          // Eigen POI's doen mee tot de grens (eigenMaxM), ook buiten de corridor,
          // of (keuze 'corridor') alleen binnen de corridor.
          inCorridor:
            p.distanceToRoute === null
              ? true
              : p.distanceToRoute <= grensMeters(p.eigen, eigenMelden, corridorMeters, eigenMaxM),
          // Zelf aangevinkt bij stap 5 (0.19.4): doet altijd mee.
          zelfGekozen: Boolean(gekozen[p.id]),
          // Eigen POI buiten de corridor: alleen bij de POI zelf (0.19.5).
          alleenBijPoi: alleenBijPoi({ ...p, zelfGekozen: Boolean(gekozen[p.id]) }, corridorMeters),
        }
      }),
    [routeMeasuredPois, corridorMeters, eigenMelden, eigenMaxM, summariesById, gekozen]
  )
  const mapPoisSorted = useMemo(
    () => [...mapPois].sort((a, b) => (a.distanceToRoute ?? 0) - (b.distanceToRoute ?? 0)),
    [mapPois]
  )
  // POI's binnen de corridor, plus de zelf gekozen POI's (0.19.4): voor
  // samenvattingen (stap 6) en export (stap 7).
  const corridorPois = mapPoisSorted.filter((p) => p.inCorridor || p.zelfGekozen)
  // POI's binnen de corridor die ook gemeld worden (Onderweg) en meegaan in
  // de export: zonder tekst alleen als dat bij stap 6 is aangezet. Zelf
  // gekozen POI's altijd (0.19.4, S3a).
  const meldtMee = (p) => p.zelfGekozen || ookZonderTekst || heeftTekst(p, summariesById)
  const meldPois = corridorPois.filter((p) => meldtMee(p) || (ritIds && ritIds.has(p.id)))
  const zonderTekstCount = corridorPois.length - meldPois.length
  // Doet vanzelf mee (zonder vinkje): binnen de corridor en met tekst (of
  // 'ook zonder tekst'). De rest staat in het kader "Niet opgenomen".
  const meldtVanzelf = (p) => p.inCorridor && (ookZonderTekst || heeftTekst(p, summariesById))
  const nietOpgenomen = mapPoisSorted.filter((p) => !meldtVanzelf(p))
  const gekozenCount = nietOpgenomen.filter((p) => p.zelfGekozen).length
  // Kaart: POI's die niet meedoen vervaagd (buiten de corridor of zonder
  // tekst); zelf gekozen POI's in volle kleur.
  const kaartPois = useMemo(
    () =>
      mapPois.map((p) => {
        const doetMee = p.zelfGekozen || (p.inCorridor && (ookZonderTekst || heeftTekst(p, summariesById)))
        return doetMee === p.inCorridor ? p : { ...p, inCorridor: doetMee }
      }),
    [mapPois, ookZonderTekst, summariesById]
  )
  function wisselGekozen(id) {
    setGekozen((oud) => {
      const nieuw = { ...oud }
      if (nieuw[id]) delete nieuw[id]
      else nieuw[id] = true
      return nieuw
    })
  }
  // Waarom een POI niet vanzelf meedoet (kader "Niet opgenomen").
  function redenNietOpgenomen(p) {
    if (!p.inCorridor) {
      if (!p.eigen || eigenMelden === 'corridor') return 'buiten de corridor'
      return `verder dan ${kmTekst(eigenMaxM)}`
    }
    return 'geen tekst'
  }
  // Eigen POI's hebben hun eigen beschrijving en gaan niet naar Wikipedia.
  const summaryMissingPois = corridorPois.filter((p) => !p.eigen && !(p.id in summariesById))
  const eigenInCorridorCount = corridorPois.filter((p) => p.eigen).length
  const summaryFoundCount = corridorPois.filter(
    (p) => summariesById[p.id] && summariesById[p.id].summary && !summariesById[p.id].summary.viaWikidata
  ).length
  const wikidataZinCount = corridorPois.filter(
    (p) => summariesById[p.id] && summariesById[p.id].summary && summariesById[p.id].summary.viaWikidata
  ).length
  const viaLiggingPois = corridorPois.filter(
    (p) => summariesById[p.id] && summariesById[p.id].summary && summariesById[p.id].viaLigging
  )
  const viaLiggingCount = viaLiggingPois.length
  // Aantal per taal, in de volgorde van de taallijst (keuze C, 0.17.3).
  const viaLiggingPerTaal = (() => {
    const tel = {}
    viaLiggingPois.forEach((p) => {
      const t = summariesById[p.id].viaLigging.taal
      tel[t] = (tel[t] || 0) + 1
    })
    const volgorde = taalInfo ? taalInfo.talen : []
    return Object.keys(tel)
      .sort((a, b) => {
        const ia = volgorde.indexOf(a)
        const ib = volgorde.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      .map((taal) => ({ taal, aantal: tel[taal] }))
  })()
  // De categorie (= routenaam) koppelt de POI's in EuroPoi aan de route;
  // die heet daar standaard naar het GPX-bestand. Waarschuwen bij verschil.
  const fileRouteName = routeInfo ? routeNameFromFileName(routeInfo.fileName) : ''
  const routeNameDiffers = fileRouteName !== '' && routeName.trim() !== fileRouteName

  function resetResults() {
    setWikidataResults(null)
    setTaalInfo(null)
    setOsmResults(null)
    setMergedCount(0)
    setSearchProgress('')
    setSearchError('')
    setOsmWarning('')
    setSummariesById({})
    setSummaryError('')
    setExportMessage('')
    setExportError('')
    setGekozen({})
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

  // Andere zoekbron: eerdere resultaten gelden niet meer.
  function kiesBron(nieuw) {
    if (searchLoading || nieuw === bron) return
    setBron(nieuw)
    bewaarBron(nieuw)
    resetResults()
  }

  // Andere taal van de teksten: de artikelen moeten opnieuw opgehaald
  // worden, dus eerdere resultaten gelden niet meer.
  function kiesTaalKeuze(nieuw) {
    if (searchLoading) return
    setTaalKeuze(nieuw)
    bewaarTaalKeuze(nieuw)
    resetResults()
  }

  function kiesTaalModus(modus) {
    if (modus === taalKeuze.modus) return
    kiesTaalKeuze(
      modus === 'eigen'
        ? { modus: 'eigen', talen: beginTalen(taalKeuze, telefoonTaal()) }
        : { modus: 'auto', talen: taalKeuze.talen }
    )
  }

  function wijzigEigenTalen(talen) {
    kiesTaalKeuze({ modus: 'eigen', talen })
  }

  // Wanneer eigen POI's meedoen: alleen een filter, geen nieuwe zoekactie.
  function kiesEigenMelden(nieuw) {
    if (searchLoading) return
    setEigenMelden(nieuw)
    bewaarEigenMelden(nieuw)
    setExportMessage('')
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

  // Eigen POI's uit een CSV in EuroPoi-formaat (europoi-csv.js). Mislukt het
  // inlezen, dan blijft een eerdere import staan.
  function handleEigenCsvChange(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    setEigenFout('')
    if (!window.EuroPoiCsv || typeof window.EuroPoiCsv.fromEuroPoiCsv !== 'function') {
      setEigenFout('Fout: europoi-csv.js is niet correct geladen.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const r = window.EuroPoiCsv.fromEuroPoiCsv(String(reader.result))
        if (r.error) {
          setEigenFout(`${file.name}: ${r.error}`)
          return
        }
        if (r.pois.length === 0) {
          const reden = r.skipped.length > 0 ? ` (bijv. regel ${r.skipped[0].line}: ${r.skipped[0].reason})` : ''
          setEigenFout(`${file.name}: geen bruikbare POI's gevonden${reden}.`)
          return
        }
        // mp3-kolom: internetlink, zoals in EuroPoi. Iets anders (bijv. een
        // bestandsnaam) wordt niet afgespeeld, maar wel ongewijzigd
        // geëxporteerd; lokale audio gaat via "Audiobestanden koppelen".
        const metLink = r.pois.filter((p) => isLink(p.mp3)).length
        const geenLink = r.pois.filter((p) => p.mp3 && !isLink(p.mp3)).length
        const nieuw = {
          fileName: file.name,
          pois: r.pois.map((p) => ({
            id: `eigen-${p.line}`,
            label: p.name,
            lat: p.lat,
            lng: p.lng,
            description: p.desc,
            mp3: p.mp3,
            // Triggerstraal uit de CSV (0.19.1): > 0 gaat voor die van de
            // vervoerwijze; 0 = die van de vervoerwijze.
            radius: p.radius > 0 ? p.radius : 0,
            // Pluscode uit de CSV (0.19.2): bepaalt de positie en gaat
            // ongewijzigd mee in de export.
            pluscode: p.pluscode || '',
            // Lokale audio: bestandsnaam = pluscode uit de CSV of berekend.
            koppelSleutels: koppelSleutels(p.pluscode, pluscode(p.lat, p.lng)),
            categoryKey: EIGEN_CATEGORY_KEY,
            eigen: true,
          })),
          melding:
            `${file.name}: ${r.pois.length} POI's ingelezen` +
            (metLink > 0 ? `, waarvan ${metLink} met mp3-link` : '') +
            '.' +
            (r.merged && r.merged.length > 0
              ? ` ${r.merged.length === 1 ? '1 dubbele regel' : `${r.merged.length} dubbele regels`} samengevoegd` +
                ` (${r.merged.map((m) => `regel ${m.line} met ${m.metLine}`).join(', ')}).`
              : '') +
            (geenLink > 0
              ? ` ${geenLink === 1 ? '1 mp3-verwijzing is' : `${geenLink} mp3-verwijzingen zijn`} geen` +
                " internetlink en wordt niet afgespeeld (lokale bestanden: via 'Audiobestanden koppelen')."
              : '') +
            // PC3 (0.19.2): pluscode en lat/lng verschillen; de pluscode is gebruikt.
            (r.warnings && r.warnings.length > 0
              ? ` Pluscode en lat/lng wijken af (pluscode gebruikt): ${r.warnings
                  .slice(0, 5)
                  .map((w) => `regel ${w.line} (${w.name}) ${afstandTekst(w.meters)}`)
                  .join(', ')}${r.warnings.length > 5 ? ` en nog ${r.warnings.length - 5}` : ''}.`
              : ''),
          overgeslagen: r.skipped,
        }
        setEigenImport(nieuw)
        setExportMessage('')
        // Een nieuwe import vervangt alle bewaarde audio (keuze 4A, 0.14.0).
        setEigenAudio(null)
        if (isNative) {
          vervangBewaard(nieuw)
        }
      } catch (err) {
        setEigenFout(errorText(err))
      }
    }
    reader.onerror = () => {
      setEigenFout('Fout: kon het bestand niet lezen.')
    }
    reader.readAsText(file)
  }

  function verwijderEigenPois() {
    // Werd alleen in de eigen POI's gezocht, dan is er zonder CSV niets meer
    // over: opnieuw zoeken (nu in Wikidata).
    if (alleenEigen) resetResults()
    setEigenImport(null)
    setEigenFout('')
    setEigenAudio(null)
    setExportMessage('')
    downloadRonde.current += 1
    setAudioKopie({ perLink: {}, bezig: null, resultaat: null })
    if (isNative) {
      AudioOpslag.wisAlles()
        .then(verversTotaal)
        .catch((err) => console.warn('Wissen bewaarde audio mislukt:', err))
    }
  }

  // ---- Offline audio (0.14.0, alleen op het toestel) ----

  async function verversTotaal() {
    try {
      setAudioTotaal(AudioOpslag.totaal(await AudioOpslag.leesIndex()))
    } catch {
      setAudioTotaal({ aantal: 0, bytes: 0 })
    }
  }

  // Nieuwe import: oude eigen POI's en audio wissen, de nieuwe bewaren en
  // de mp3-links downloaden.
  async function vervangBewaard(nieuw) {
    downloadRonde.current += 1
    setAudioKopie({ perLink: {}, bezig: null, resultaat: null })
    try {
      await AudioOpslag.wisAlles()
      await AudioOpslag.bewaarEigen(nieuw)
    } catch (err) {
      console.warn('Eigen POI\'s bewaren mislukt:', err)
    }
    await verversTotaal()
    downloadLinks(nieuw)
  }

  // Alle mp3-links van de eigen POI's downloaden die nog geen kopie hebben.
  // stil: geen melding als er niets te doen is of geen internet is (bij het
  // starten van de app).
  async function downloadLinks(eigen, { stil = false } = {}) {
    const links = eigen.pois.filter((p) => isLink(p.mp3)).map((p) => p.mp3.trim())
    if (links.length === 0) return
    const ronde = downloadRonde.current + 1
    downloadRonde.current = ronde
    const afgebroken = () => downloadRonde.current !== ronde
    const index = await AudioOpslag.leesIndex()
    const totaalLinks = new Set(links).size
    const ontbrekend = [...new Set(links)].filter((l) => !index.kopie[l])
    if (ontbrekend.length === 0) {
      if (!stil) {
        setAudioKopie((k) => ({
          ...k,
          resultaat: { gelukt: totaalLinks, totaal: totaalLinks, fouten: [], melding: '' },
        }))
      }
      return
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!stil) {
        setAudioKopie((k) => ({
          ...k,
          resultaat: {
            gelukt: totaalLinks - ontbrekend.length,
            totaal: totaalLinks,
            fouten: [],
            melding: 'Geen internet: de mp3-links worden gedownload zodra WikiPoi met internet opnieuw start.',
          },
        }))
      }
      return
    }
    setAudioKopie((k) => ({ ...k, bezig: { klaar: 0, totaal: ontbrekend.length }, resultaat: null }))
    const { fouten } = await AudioOpslag.downloadKopieen(ontbrekend, {
      afgebroken,
      voortgang: (stand) => {
        if (!afgebroken()) setAudioKopie((k) => ({ ...k, bezig: stand }))
      },
    })
    if (afgebroken()) return
    const nu = await AudioOpslag.leesIndex()
    const perLink = await AudioOpslag.laadKopieen(nu)
    if (afgebroken()) return
    setAudioKopie({
      perLink,
      bezig: null,
      resultaat: { gelukt: totaalLinks - fouten.length, totaal: totaalLinks, fouten, melding: '' },
    })
    setAudioTotaal(AudioOpslag.totaal(nu))
  }

  // Lokale audiobestanden (mp3/wav) bij de eigen POI's: bestandsnaam =
  // pluscode (zoals de bulk-import van EuroPoi). Een nieuwe keuze vervangt
  // de vorige. Op het toestel bewaard in de app (0.14.0); in de browser
  // alleen voor deze sessie.
  async function handleAudioChange(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    const bestanden = []
    let geenAudio = 0
    files.forEach((f) => {
      if (!isAudioBestand(f.name)) {
        geenAudio += 1
        return
      }
      const sleutel = normPluscode(zonderExtensie(f.name))
      if (!sleutel || bestanden.some((b) => b.sleutel === sleutel)) return
      bestanden.push({ sleutel, bestand: f, naam: f.name })
    })
    if (!isNative) {
      setEigenAudio({
        bestanden: bestanden.map((b) => ({ sleutel: b.sleutel, url: URL.createObjectURL(b.bestand), naam: b.naam })),
        geenAudio,
      })
      return
    }
    setAudioOpslaan(true)
    try {
      const bewaard = await AudioOpslag.bewaarLokaal(bestanden)
      setEigenAudio({ bestanden: bewaard, geenAudio, nietBewaard: bestanden.length - bewaard.length })
    } catch (err) {
      setEigenFout(`Audiobestanden bewaren mislukt: ${errorText(err)}`)
    } finally {
      setAudioOpslaan(false)
      verversTotaal()
    }
  }

  function verwijderAudio() {
    setEigenAudio(null)
    if (isNative) {
      AudioOpslag.wisLokaal()
        .then(verversTotaal)
        .catch((err) => console.warn('Ontkoppelen mislukt:', err))
    }
  }

  async function runSearch() {
    if (!routeInfo) return
    resetResults()
    // Alleen eigen POI's: niets op te halen, geen internet nodig. De eigen
    // POI's verschijnen zodra searchDone waar is (allPois).
    if (alleenEigen) {
      setMergedCount(0)
      setOsmResults([])
      setWikidataResults([])
      return
    }
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
      if (selected.length === 0) {
        setSearchError('Kies minimaal één categorie bij stap 3.')
        return
      }

      // Taal van de teksten (0.17.0). Automatisch: eerst de taal van het
      // land rond het beginpunt van de route (één Wikidata-verzoek). Lukt
      // dat niet, dan zoeken we zonder; dat staat dan bij stap 4.
      let landTaal = null
      let landFout = false
      if (taalKeuze.modus !== 'eigen' && routeInfo.points && routeInfo.points.length > 0) {
        setSearchProgress('Taal van het land bepalen')
        try {
          landTaal = await window.WikiPoiWikidataSearch.fetchLandTaal(routeInfo.points[0])
          if (!landTaal) landFout = true
        } catch (err) {
          console.warn('Taal van het land bepalen mislukt:', err)
          landFout = true
        }
      }
      const talen = effectieveVolgorde(taalKeuze, telefoonTaal(), landTaal)
      setTaalInfo({ modus: taalKeuze.modus, talen, landTaal, landFout })

      const qidCategories = selected.filter((c) => c.qids.length > 0)
      const wikidataJobs = []
      if (qidCategories.length > 0) {
        wikidataJobs.push({
          label: qidCategories.length === 1 ? qidCategories[0].label : 'alle categorieën',
          query: {
            // Artikel en naam in de taalvolgorde van stap 2 (0.17.0).
            languages: talen,
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
            query: { languages: talen, hasProperty: c.hasProperty },
            categoryKeyFor: () => c.key,
          })
        })
      if (wikidataJobs.length === 0) {
        setSearchError('Kies minimaal één categorie bij stap 3.')
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
          // Bij twee items met een artikel wint de beste taal (0.17.0).
          languages: talen,
        })
        merged = before - results.length
      }
      // Vangnet: categorie via het id herstellen als die bij samenvoegen wegviel.
      results = results.map((item) =>
        item.categoryKey ? item : { ...item, categoryKey: categoryKeyById.get(item.id) || null }
      )

      // OpenStreetMap per categorie: gelukte categorieën blijven bewaard, ook
      // als een latere categorie mislukt; de Wikidata-resultaten gaan nooit
      // verloren. Mislukt een categorie op alle servers (na alle rondes), dan
      // zijn de servers vrijwel zeker overbelast: de overige OSM-categorieën
      // worden dan overgeslagen om minutenlang wachten te voorkomen.
      let osm = []
      let osmFailure = null // { label, message } van de mislukte categorie
      const osmSkipped = []
      let osmSucceeded = 0
      for (const category of osmCategories) {
        done += 1
        if (osmFailure) {
          osmSkipped.push(category.label)
          continue
        }
        setSearchProgress(`OpenStreetMap: ${category.label} (${done} van ${total})`)
        try {
          const tagFilterGroups = window.WikiPoiCategories.osmTagFiltersForKeys([category.key])
          const found = await window.WikiPoiOsmFallback.searchOverpass(routeInfo.bbox, tagFilterGroups, {
            timeoutMs: OSM_TIMEOUT_MS,
          })
          osm = osm.concat(found.map((item) => ({ ...item, categoryKey: category.key })))
          osmSucceeded += 1
        } catch (err) {
          osmFailure = {
            label: category.label,
            message: err && err.message ? err.message : String(err),
          }
        }
      }
      if (osmFailure) {
        if (osmSucceeded === 0) {
          setOsmWarning(
            'Let op: OpenStreetMap niet beschikbaar (' + osmFailure.message + '). Resultaten zonder OpenStreetMap.'
          )
        } else {
          setOsmWarning(
            'Let op: OpenStreetMap gedeeltelijk: ' +
              osmFailure.label +
              ' niet gelukt (' +
              osmFailure.message +
              ').' +
              (osmSkipped.length > 0 ? ' ' + osmSkipped.join(', ') + ' overgeslagen.' : '') +
              ' Resultaten van de overige OpenStreetMap-categorieën zijn wel meegenomen.'
          )
        }
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
    const vondsten = await zoekViaLigging(candidates)
    const enriched = await window.WikiPoiWikipediaSummary.fetchSummariesForCandidates(
      candidates.map((p) => (vondsten[p.id] ? { ...p, wikipediaUrl: vondsten[p.id].url } : p)),
      { maxSentences: SUMMARY_MAX_SENTENCES }
    )
    const added = {}
    enriched.forEach((item, index) => {
      const id = item.id || candidates[index].id
      const lig = vondsten[id]
      if (lig && item.summary) {
        added[id] = { summary: { ...item.summary, lang: lig.taal }, summaryError: '', viaLigging: lig }
      } else {
        added[id] = { summary: item.summary || null, summaryError: item.summaryError || '' }
      }
    })
    // Artikel via de ligging gevonden, maar ophalen mislukt: dan alsnog het
    // eigen artikel van de POI (als die er is).
    const opnieuw = candidates.filter((p) => vondsten[p.id] && !added[p.id].summary && p.wikipediaUrl)
    if (opnieuw.length > 0) {
      const tweede = await window.WikiPoiWikipediaSummary.fetchSummariesForCandidates(opnieuw, {
        maxSentences: SUMMARY_MAX_SENTENCES,
      })
      tweede.forEach((item, index) => {
        added[opnieuw[index].id] = { summary: item.summary || null, summaryError: item.summaryError || '' }
      })
    }
    // Terugval voor Wikidata-items zonder samenvatting: een korte Nederlandse
    // zin uit Wikidata-eigenschappen (wikidata-zin.js, één verzoek). Mislukt
    // dit, dan blijft de Wikidata-omschrijving, zoals voorheen. Dezelfde
    // query levert de Wikidata-foto (P18), ook als er geen zin is.
    const zonderTekst = candidates.filter((p) => !(added[p.id] && added[p.id].summary))
    const fotoBestanden = {}
    if (
      zonderTekst.length > 0 &&
      window.WikiPoiWikidataZin &&
      typeof window.WikiPoiWikidataZin.haalWikidataZinnen === 'function'
    ) {
      try {
        const zinnen = await window.WikiPoiWikidataZin.haalWikidataZinnen(zonderTekst, { retryDelayMs: 1000 })
        zonderTekst.forEach((p) => {
          const r = zinnen[p.id]
          if (r && r.summary) added[p.id] = { summary: r.summary, summaryError: '' }
          if (r && r.fotoBestand) fotoBestanden[p.id] = r.fotoBestand
        })
      } catch (err) {
        console.warn('Zin uit Wikidata mislukt:', err)
      }
    }
    await voegFotosToe(candidates, added, fotoBestanden)
    setSummariesById((prev) => ({ ...prev, ...added }))
    return { ...summariesById, ...added }
  }

  // Ontbrekende samenvattingen ophalen bij "Route starten" (0.20.0, R1a):
  // dezelfde stap als bij stap 6/7. Geeft { opgehaald, zonder } terug.
  async function haalSamenvattingenVoorRit() {
    const ids = summaryMissingPois.map((p) => p.id)
    if (ids.length === 0) return { opgehaald: 0, zonder: 0 }
    setSummaryError('')
    setSummaryLoading(true)
    try {
      const s = await fetchMissingSummaries()
      const opgehaald = ids.filter((id) => s[id] && s[id].summary).length
      return { opgehaald, zonder: ids.length - opgehaald }
    } finally {
      setSummaryLoading(false)
    }
  }

  // Artikel via de ligging (0.17.0): voor POI's zonder artikel in de eerste
  // taal van de taalvolgorde (keuze bij stap 2) een artikel op dezelfde plek
  // zoeken. Sinds 0.17.3 (B1) in alle talen die hoger staan dan het eigen
  // artikel, in volgorde; de eerste vondst wint. Geeft { id: vondst } terug;
  // mislukt het, dan {}.
  async function zoekViaLigging(candidates) {
    const L = window.WikiPoiArtikelViaLigging
    const talen = taalInfo ? taalInfo.talen : []
    const eerste = talen.length > 0 ? talen[0] : null
    if (!eerste || !L || typeof L.zoekArtikelenViaLiggingInTalen !== 'function') return {}
    const zonder = candidates.filter((p) => !p.eigen && basis(p.articleLanguage) !== eerste)
    if (zonder.length === 0) return {}
    // Id's van alle gevonden POI's (ook samengevoegde): hun artikelen
    // horen niet bij een andere POI.
    const andereIds = new Set()
    ;[...(wikidataResults || []), ...(osmResults || [])].forEach((p) => {
      if (p.id) andereIds.add(p.id)
      ;(p.mergedFrom || []).forEach((m) => m.id && andereIds.add(m.id))
    })
    try {
      return await L.zoekArtikelenViaLiggingInTalen(zonder, talen, { andereIds })
    } catch (err) {
      console.warn('Artikel via ligging mislukt:', err)
      return {}
    }
  }

  // Foto's bij de samenvattingen (entry.foto = { bestand, url, maker,
  // licentie }): de thumbnail van het artikel als die op Commons staat,
  // anders de Wikidata-foto (P18) van POI's zonder artikel. Daarna maker en
  // licentie via de Commons-API (commons-foto.js, één verzoek per 50
  // foto's). Mislukt dat, dan blijven de foto's zonder bronvermelding.
  async function voegFotosToe(candidates, added, fotoBestanden) {
    const CF = window.WikiPoiCommonsFoto
    if (!CF || typeof CF.haalFotoInfo !== 'function') return
    candidates.forEach((p) => {
      const entry = added[p.id] || { summary: null, summaryError: '' }
      const thumb = entry.summary && entry.summary.thumbnailUrl
      const bestand = thumb ? CF.bestandUitUploadUrl(thumb) : fotoBestanden[p.id] || null
      if (!bestand) return
      added[p.id] = {
        ...entry,
        foto: { bestand, url: thumb || CF.fotoUrl(bestand), maker: null, licentie: null },
      }
    })
    const bestanden = Object.values(added)
      .map((e) => (e.foto ? e.foto.bestand : null))
      .filter(Boolean)
    if (bestanden.length === 0) return
    try {
      const info = await CF.haalFotoInfo(bestanden, { retryDelayMs: 1000 })
      Object.keys(added).forEach((id) => {
        const foto = added[id].foto
        if (foto && info[foto.bestand]) added[id] = { ...added[id], foto: { ...foto, ...info[foto.bestand] } }
      })
    } catch (err) {
      console.warn('Maker en licentie van foto\'s (Commons) mislukt:', err)
    }
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
        setExportError('Er liggen geen POI\'s binnen de corridor. Verbreed de strook bij stap 5.')
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
      // Zonder tekst alleen als dat bij stap 6 is aangezet (0.12.0).
      const exportPois = corridorPois.filter((p) => p.zelfGekozen || ookZonderTekst || heeftTekst(p, summaries))
      if (exportPois.length === 0) {
        setExportError(
          "Geen van de POI's binnen de corridor heeft een tekst. Zet bij stap 6 'Ook POI's zonder tekst melden' aan, of verbreed de corridor."
        )
        return
      }
      // Tekst: alleen de Wikipedia-samenvatting (of de zin uit Wikidata),
      // zonder bronvermelding (die zou in EuroPoi worden voorgelezen; WikiPoi
      // toont hem bij stap 6). Zonder beide de Wikidata-omschrijving; eigen
      // POI's hun eigen beschrijving. Staat de naam er niet in, dan komt hij
      // ervóór ("Naam. Toelichting", 0.13.0), zodat ook EuroPoi hem noemt.
      // Leeg blijft leeg: EuroPoi leest dan zelf de naam.
      const rows = exportPois.map((p) => {
        const desc = tekstMetNaam(p.label, toelichtingVan(p, summaries))
        return {
          lat: p.lat,
          lng: p.lng,
          name: p.label || '(zonder naam)',
          desc,
          category,
          // Eigen POI's houden hun straal uit de CSV (0.19.1).
          radius: p.eigen && p.radius > 0 ? p.radius : DEFAULT_TRIGGER_RADIUS_METERS,
          // Eigen pluscode ongewijzigd mee (0.19.2, PC4); anders berekend.
          pluscode: p.eigen ? p.pluscode || '' : '',
          mp3: p.eigen ? p.mp3 || '' : '',
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
    const disabled = searchLoading || blocked || alleenEigen
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
        <div className="app-kopteksten">
          <div className="app-title">WikiPoi</div>
          <div className="app-subtitle">Beziens&shy;waardig&shy;heden langs je route</div>
          <div className="app-versieregel">versie {APP_VERSION} · bèta</div>
        </div>
        <div className="app-kopknoppen">
          <button
            type="button"
            className="app-info"
            onClick={() => setToonInstellingen(true)}
            aria-label="Instellingen"
            title="Instellingen"
          >
            <span className="app-info-icoon app-tandwiel" aria-hidden="true">
              ⚙
            </span>
            <span className="app-info-versie">Instellingen</span>
          </button>
          <button
            type="button"
            className="app-info"
            onClick={() => setToonOver(true)}
            aria-label="Over WikiPoi"
            title="Over WikiPoi"
          >
            <span className="app-info-icoon" aria-hidden="true">
              i
            </span>
            <span className="app-info-versie">Over</span>
          </button>
        </div>
      </header>
      {updateMelding && (
        <div className="update-melding" role="status">
          <span>
            Versie {updateMelding.versie} van WikiPoi is beschikbaar{updateMelding.prerelease ? ' (bèta)' : ''}.
          </span>
          <a
            className="btn btn-yellow btn-small"
            href={updateMelding.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setUpdateMelding(null)}
          >
            Bekijken
          </a>
          <button type="button" className="btn btn-indigo btn-small" onClick={() => setUpdateMelding(null)}>
            Later
          </button>
        </div>
      )}
      {toonInstellingen && (
        <Instellingen
          instellingen={instellingen}
          versie={APP_VERSION}
          update={update}
          onWijzig={wijzigInstellingen}
          onStandaard={() => pasInstellingenToe(standaardTerug())}
          onControleer={() => controleerOpUpdate(false)}
          onSluiten={() => setToonInstellingen(false)}
        />
      )}
      {toonWelkom && (
        <Welkom
          onBegrepen={() => {
            welkomBegrepen(APP_VERSION)
            setToonWelkom(false)
          }}
        />
      )}
      {toonOver && (
        <OverWikiPoi
          versie={APP_VERSION}
          onSluiten={() => setToonOver(false)}
          onWelkomOpnieuw={() => {
            welkomVergeten()
            setToonOver(false)
            setToonWelkom(true)
          }}
        />
      )}

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

        <Step number={2} title="Bronnen">
          <fieldset className="keuze-groep keuze-groep-boven">
            <legend>Zoeken in</legend>
            {ZOEKBRON_KEUZES.map((k) => {
              const uit = searchLoading || (k.key !== 'wiki' && !eigenImport)
              return (
                <label key={k.key} className={uit ? 'toggle-row is-disabled' : 'toggle-row'}>
                  <input
                    type="radio"
                    name="zoekbron"
                    checked={bronEffectief === k.key}
                    disabled={uit}
                    onChange={() => kiesBron(k.key)}
                  />
                  <span>
                    {k.label}
                    <br />
                    <span className="muted">{k.uitleg}</span>
                  </span>
                </label>
              )
            })}
            {!eigenImport && (
              <p className="muted">Voeg hieronder een CSV toe voor eigen POI's.</p>
            )}
          </fieldset>
          {!alleenEigen && (
            <fieldset className="keuze-groep keuze-groep-boven">
              <legend>Taal van de teksten</legend>
              <label className={searchLoading ? 'toggle-row is-disabled' : 'toggle-row'}>
                <input
                  type="radio"
                  name="taalkeuze"
                  checked={taalKeuze.modus !== 'eigen'}
                  disabled={searchLoading}
                  onChange={() => kiesTaalModus('auto')}
                />
                <span>
                  Automatisch
                  <br />
                  <span className="muted">
                    {taalNaam(telefoonTaal())} (taal van je telefoon), dan de taal van het land van de route, dan
                    Engels, Frans en Duits.
                  </span>
                </span>
              </label>
              <label className={searchLoading ? 'toggle-row is-disabled' : 'toggle-row'}>
                <input
                  type="radio"
                  name="taalkeuze"
                  checked={taalKeuze.modus === 'eigen'}
                  disabled={searchLoading}
                  onChange={() => kiesTaalModus('eigen')}
                />
                <span>
                  Eigen volgorde
                  <br />
                  <span className="muted">Kies zelf de talen (hoogstens {MAX_TALEN}) en hun volgorde.</span>
                </span>
              </label>
              {taalKeuze.modus === 'eigen' && (
                <ol className="taal-lijst">
                  {lijstRijen(taalKeuze.talen).map((r, i) => {
                    const vol = !r.gekozen && taalKeuze.talen.length >= MAX_TALEN
                    const laatste = r.gekozen && taalKeuze.talen.length === 1
                    return (
                      <li key={r.code} className={r.gekozen ? 'taal-rij is-gekozen' : 'taal-rij'}>
                        <label className={searchLoading || vol || laatste ? 'is-disabled' : ''}>
                          <input
                            type="checkbox"
                            checked={r.gekozen}
                            disabled={searchLoading || vol || laatste}
                            onChange={() => wijzigEigenTalen(wisselTaal(taalKeuze.talen, r.code))}
                          />
                          <span>
                            {r.gekozen && <span className="taal-nr">{i + 1}.</span>}
                            {r.naam}
                          </span>
                        </label>
                        {r.gekozen && (
                          <span className="taal-pijlen">
                            <button
                              type="button"
                              className="btn btn-indigo btn-klein"
                              aria-label={`${r.naam} omhoog`}
                              disabled={searchLoading || i === 0}
                              onClick={() => wijzigEigenTalen(verplaatsTaal(taalKeuze.talen, r.code, -1))}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn btn-indigo btn-klein"
                              aria-label={`${r.naam} omlaag`}
                              disabled={searchLoading || i === taalKeuze.talen.length - 1}
                              onClick={() => wijzigEigenTalen(verplaatsTaal(taalKeuze.talen, r.code, 1))}
                            >
                              ↓
                            </button>
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}
              <p className="muted">
                Heeft een POI geen artikel in de eerste taal, dan zoekt stap 6 op dezelfde plek naar een artikel in
                een taal die hoger in de lijst staat. Een andere keuze wist de zoekresultaten.
              </p>
            </fieldset>
          )}
          <div className="eigen-pois">
            <label className={searchLoading ? 'btn btn-indigo btn-small is-disabled' : 'btn btn-indigo btn-small'}>
              <input
                type="file"
                accept=".csv,text/csv,text/comma-separated-values"
                onChange={handleEigenCsvChange}
                disabled={searchLoading}
                hidden
              />
              {eigenImport ? "Andere eigen POI's (CSV)" : "Eigen POI's toevoegen (CSV)"}
            </label>
            {eigenImport && (
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={verwijderEigenPois}
                disabled={searchLoading}
              >
                Verwijderen
              </button>
            )}
            {!eigenImport && !eigenFout && (
              <p className="muted">
                Optioneel: een CSV in EuroPoi-formaat (lat;lng;pluscode;name;desc;category;radius;mp3). Een
                volledige pluscode bepaalt de plek; lat/lng is de reserve. Eigen
                POI's verschijnen na het zoeken. Daarna kun je kiezen of ze altijd meedoen (tot{' '}
                {kmTekst(eigenMaxM)} van de route) of alleen binnen de corridor.
              </p>
            )}
            {eigenImport && (
              <>
                <p className="success">
                  <CategoryDot categoryKey={EIGEN_CATEGORY_KEY} /> {eigenImport.melding}
                </p>
                <fieldset className="keuze-groep">
                  <legend>Eigen POI's melden</legend>
                  <label className={searchLoading ? 'toggle-row is-disabled' : 'toggle-row'}>
                    <input
                      type="radio"
                      name="eigen-melden"
                      checked={eigenMelden === 'altijd'}
                      disabled={searchLoading}
                      onChange={() => kiesEigenMelden('altijd')}
                    />
                    <span>
                      Altijd
                      <br />
                      <span className="muted">
                        Tot {kmTekst(eigenMaxM)} van de route, ook buiten de corridor; daar alleen gemeld
                        bij de POI zelf.
                      </span>
                    </span>
                  </label>
                  <label className={searchLoading ? 'toggle-row is-disabled' : 'toggle-row'}>
                    <input
                      type="radio"
                      name="eigen-melden"
                      checked={eigenMelden === 'corridor'}
                      disabled={searchLoading}
                      onChange={() => kiesEigenMelden('corridor')}
                    />
                    <span>
                      Alleen binnen de corridor
                      <br />
                      <span className="muted">Net als de gevonden POI's (breedte instellen bij stap 5).</span>
                    </span>
                  </label>
                </fieldset>
                {eigenImport.overgeslagen.length > 0 && (
                  <div className="muted">
                    {eigenImport.overgeslagen.length === 1
                      ? '1 regel overgeslagen:'
                      : `${eigenImport.overgeslagen.length} regels overgeslagen:`}
                    <ul className="eigen-redenen">
                      {eigenImport.overgeslagen.slice(0, EIGEN_MAX_REDENEN).map((s) => (
                        <li key={s.line}>
                          regel {s.line}: {s.reason}
                        </li>
                      ))}
                      {eigenImport.overgeslagen.length > EIGEN_MAX_REDENEN && (
                        <li>en nog {eigenImport.overgeslagen.length - EIGEN_MAX_REDENEN} andere</li>
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
            {eigenImport && (
              <div className="eigen-audio">
                <label
                  className={
                    searchLoading || audioOpslaan ? 'btn btn-indigo btn-small is-disabled' : 'btn btn-indigo btn-small'
                  }
                >
                  <input
                    type="file"
                    multiple
                    accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
                    onChange={handleAudioChange}
                    disabled={searchLoading || audioOpslaan}
                    hidden
                  />
                  {eigenAudio ? 'Andere audiobestanden' : 'Audiobestanden koppelen'}
                </label>
                {eigenAudio && (
                  <button
                    type="button"
                    className="btn btn-indigo btn-small"
                    onClick={verwijderAudio}
                    disabled={searchLoading || audioOpslaan}
                  >
                    Ontkoppelen
                  </button>
                )}
                {!eigenAudio && (
                  <p className="muted">
                    Optioneel: mp3- of wav-bestanden op de telefoon, met de pluscode als bestandsnaam (bijv.
                    9F37M7RQ+2X.mp3), zoals in EuroPoi. Meerdere tegelijk kiezen mag.
                    {isNative ? ' Ze worden in WikiPoi bewaard, zodat ze ook zonder internet werken.' : ''}
                  </p>
                )}
                {audioOpslaan && <p className="muted">Audiobestanden bewaren…</p>}
                {eigenAudio && (
                  <>
                    <p className={audioKoppeling.gekoppeld > 0 ? 'success' : 'error'}>
                      {audioKoppeling.gekoppeld === 1
                        ? '1 audiobestand gekoppeld aan een eigen POI.'
                        : `${audioKoppeling.gekoppeld} audiobestanden gekoppeld aan eigen POI's.`}
                    </p>
                    {audioKoppeling.nietGekoppeld.length > 0 && (
                      <div className="muted">
                        {audioKoppeling.nietGekoppeld.length === 1
                          ? '1 bestand past bij geen enkele eigen POI:'
                          : `${audioKoppeling.nietGekoppeld.length} bestanden passen bij geen enkele eigen POI:`}
                        <ul className="eigen-redenen">
                          {audioKoppeling.nietGekoppeld.slice(0, AUDIO_MAX_NAMEN).map((naam) => (
                            <li key={naam}>{naam}</li>
                          ))}
                          {audioKoppeling.nietGekoppeld.length > AUDIO_MAX_NAMEN && (
                            <li>en nog {audioKoppeling.nietGekoppeld.length - AUDIO_MAX_NAMEN} andere</li>
                          )}
                        </ul>
                      </div>
                    )}
                    {eigenAudio.geenAudio > 0 && (
                      <p className="muted">
                        {eigenAudio.geenAudio === 1
                          ? '1 bestand is geen mp3 of wav en is overgeslagen.'
                          : `${eigenAudio.geenAudio} bestanden zijn geen mp3 of wav en zijn overgeslagen.`}
                      </p>
                    )}
                    {eigenAudio.nietBewaard > 0 && (
                      <p className="error">
                        {eigenAudio.nietBewaard === 1
                          ? '1 audiobestand kon niet worden bewaard.'
                          : `${eigenAudio.nietBewaard} audiobestanden konden niet worden bewaard.`}
                      </p>
                    )}
                  </>
                )}
                {audioKopie.bezig && (
                  <p className="muted">
                    Mp3-links offline opslaan: {audioKopie.bezig.klaar} van {audioKopie.bezig.totaal}…
                  </p>
                )}
                {audioKopie.resultaat && (
                  <>
                    <p
                      className={
                        audioKopie.resultaat.gelukt === audioKopie.resultaat.totaal ? 'success' : 'error'
                      }
                    >
                      Audio offline: {audioKopie.resultaat.gelukt} van {audioKopie.resultaat.totaal}{' '}
                      {audioKopie.resultaat.totaal === 1 ? 'mp3-link' : 'mp3-links'} opgeslagen.
                      {audioKopie.resultaat.melding ? ` ${audioKopie.resultaat.melding}` : ''}
                    </p>
                    {audioKopie.resultaat.fouten.length > 0 && (
                      <div className="muted">
                        Niet gelukt (wordt onderweg met internet nog via de link geprobeerd):
                        <ul className="eigen-redenen">
                          {audioKopie.resultaat.fouten.slice(0, AUDIO_MAX_NAMEN).map((f) => (
                            <li key={f.link}>
                              {linkNaam(f.link)}: {f.reden}
                            </li>
                          ))}
                          {audioKopie.resultaat.fouten.length > AUDIO_MAX_NAMEN && (
                            <li>en nog {audioKopie.resultaat.fouten.length - AUDIO_MAX_NAMEN} andere</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {isNative && audioTotaal.aantal > 0 && (
                  <p className="muted">
                    Opgeslagen audio: {audioTotaal.aantal} {audioTotaal.aantal === 1 ? 'bestand' : 'bestanden'},{' '}
                    {grootteTekst(audioTotaal.bytes)}.
                  </p>
                )}
              </div>
            )}
            {eigenFout && <p className="error">{eigenFout}</p>}
          </div>
        </Step>

        <Step
          number={3}
          title="Categorieën"
          disabled={alleenEigen}
          hint="Niet nodig: je zoekt alleen in je eigen POI's (stap 2)."
        >
          {!categoriesAvailable && <p className="error">Fout: poi-categories.js is niet correct geladen.</p>}
          {categoriesAvailable && (
            <>
              <ul className="category-list">{coreCategories.map((cat) => renderCategoryItem(cat, false))}</ul>
              <p className="category-group-title">
                Verzamelcategorieën <span className="muted">(max. {maxExtraCategories} tegelijk)</span>
              </p>
              <ul className="category-list">{extraCategories.map((cat) => renderCategoryItem(cat, true))}</ul>
              <label className={searchLoading || alleenEigen ? 'toggle-row is-disabled' : 'toggle-row'}>
                <input
                  type="checkbox"
                  checked={useOsm}
                  disabled={searchLoading || alleenEigen}
                  onChange={toggleOsm}
                />
                <span>
                  Ook OpenStreetMap doorzoeken
                  <br />
                  <span className="muted">Vindt soms extra punten, maar maakt het zoeken trager.</span>
                </span>
              </label>
            </>
          )}
        </Step>

        <Step number={4} title="Zoeken" disabled={!routeInfo} hint="Kies eerst een route bij stap 1.">
          <button
            type="button"
            className="btn btn-yellow btn-wide"
            onClick={runSearch}
            disabled={searchLoading || (!alleenEigen && selectedCategoryKeys.length === 0)}
          >
            {searchLoading ? 'Bezig met zoeken…' : searchDone ? 'Opnieuw zoeken' : "POI's zoeken"}
          </button>
          {!alleenEigen && selectedCategoryKeys.length === 0 && (
            <p className="muted">
              Kies minimaal één categorie bij stap 3
              {eigenImport ? ", of kies bij stap 2 'Alleen eigen POI's'." : '.'}
            </p>
          )}
          {searchProgress && (
            <p className="muted">
              {searchProgress}
              {progressSeconds > 0 ? ` — ${progressSeconds} s` : ''}
            </p>
          )}
          {searchDone && (
            <p>
              <strong>{routeMeasuredPois.length}</strong> POI's gevonden
              {eigenCount > 0 && `, inclusief ${eigenCount} eigen`}
              {eigenVervangen > 0 && `, ${eigenVervangen} vervangen door een eigen POI`}
              {mergedCount > 0 && `, ${mergedCount} dubbele samengevoegd`}
              {useOsm && !alleenEigen && `, waarvan ${osmFoundCount} via OpenStreetMap`}.
            </p>
          )}
          {searchDone && taalInfo && (
            <p className="muted">
              Taal van de teksten: {volgordeTekst(taalInfo.talen)}
              {taalInfo.modus === 'eigen'
                ? ' (eigen volgorde).'
                : taalInfo.landTaal
                  ? ` (taal van het land: ${taalNaam(taalInfo.landTaal)}).`
                  : taalInfo.landFout
                    ? ' (taal van het land niet bepaald).'
                    : '.'}
            </p>
          )}
          {searchDone && eigenTeVer > 0 && (
            <p className="muted">
              {eigenTeVer === 1 ? "1 eigen POI ligt" : `${eigenTeVer} eigen POI's liggen`} verder dan{' '}
              {kmTekst(eigenMaxM)} van de route: zichtbaar op de kaart, maar {eigenTeVer === 1 ? 'doet' : 'doen'} niet mee.
            </p>
          )}
          {osmWarning && <p className="error">{osmWarning}</p>}
          {searchError && <p className="error">{searchError}</p>}
        </Step>

        <Step number={5} title="Kaart" disabled={!routeInfo} hint="Kies eerst een route bij stap 1.">
          <button type="button" className="btn btn-indigo btn-small" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Kaart verbergen' : 'Kaart tonen'}
          </button>
          {/* Kaart blijft in de pagina staan; alleen de hoogte wisselt, zodat
              Leaflet zijn toestand behoudt. */}
          <div className="map-frame" style={{ height: showMap ? MAP_HEIGHT : '0px' }}>
            <RouteMap
              routePoints={routeInfo ? routeInfo.points : null}
              pois={kaartPois}
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
          {!searchDone && <p className="muted">Na het zoeken bij stap 4 verschijnen hier de POI's.</p>}
          {searchDone && mapPois.length === 0 && (
            <p className="muted">
              {alleenEigen
                ? "Geen eigen POI's gevonden."
                : "Geen POI's gevonden. Kies andere categorieën bij stap 3."}
            </p>
          )}
          {searchDone && mapPois.length > 0 && (
            <>
              <p>
                <strong>{meldPois.length}</strong> van {mapPois.length} POI's doen mee
                {gekozenCount > 0 ? ` (waarvan ${gekozenCount} zelf gekozen)` : ''}
                {nietOpgenomen.length > 0 ? `; ${nietOpgenomen.length - gekozenCount} niet opgenomen.` : '.'}
              </p>
              <ul className="poi-list">
                {meldPois.map((poi) => (
                  <li key={poi.id}>
                    <CategoryDot categoryKey={poi.categoryKey} />
                    <span>
                      {poi.label}{' '}
                      <span className="muted">
                        ({poi.categoryLabel},{' '}
                        {Number.isFinite(poi.distanceToRoute)
                          ? `${Math.round(poi.distanceToRoute)} m`
                          : 'afstand onbekend'}
                        {poi.zelfGekozen
                          ? poi.inCorridor && poi.eigen && poi.distanceToRoute > corridorMeters
                            ? ', buiten de corridor: bij de POI zelf en bij de route'
                            : ', zelf gekozen'
                          : poi.alleenBijPoi
                            ? ', buiten de corridor: alleen bij de POI zelf'
                            : !poi.eigen && !poi.wikipediaUrl && ', geen artikel'}
                        )
                      </span>
                      {/* Eigen POI buiten de corridor (0.22.3, V1): ook bij de
                          route laten melden, zonder omweg via de grens. */}
                      {poi.inCorridor &&
                        poi.eigen &&
                        Number.isFinite(poi.distanceToRoute) &&
                        poi.distanceToRoute > corridorMeters && (
                          <label className="ook-bij-route">
                            <input
                              type="checkbox"
                              checked={poi.zelfGekozen}
                              onChange={() => wisselGekozen(poi.id)}
                            />{' '}
                            ook bij de route melden
                          </label>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
              {nietOpgenomen.length > 0 && (
                <div className="niet-opgenomen">
                  <button
                    type="button"
                    ref={nietOpgenomenKop}
                    className="niet-opgenomen-kop"
                    aria-expanded={toonNietOpgenomen}
                    onClick={() => setToonNietOpgenomen((v) => !v)}
                  >
                    <span aria-hidden="true">{toonNietOpgenomen ? '▾' : '▸'}</span> Niet opgenomen (
                    {nietOpgenomen.length}
                    {gekozenCount > 0 ? `, ${gekozenCount} aangevinkt` : ''})
                  </button>
                  {toonNietOpgenomen && (
                    <>
                      <p className="muted">
                        Vink een POI aan om hem toch mee te nemen. Onderweg wordt hij voorgelezen bij het
                        dichtstbijzijnde punt van de route; ligt hij verder dan 300 m weg, dan noemt de
                        aankondiging de afstand.
                      </p>
                      <ul className="poi-list niet-opgenomen-lijst">
                        {nietOpgenomen.map((poi) => (
                          <li key={poi.id} className={poi.zelfGekozen ? '' : 'is-out'}>
                            <label className="niet-opgenomen-regel">
                              <input
                                type="checkbox"
                                checked={poi.zelfGekozen}
                                onChange={() => wisselGekozen(poi.id)}
                              />
                              <CategoryDot categoryKey={poi.categoryKey} faded={!poi.zelfGekozen} />
                              <span>
                                {poi.label}{' '}
                                <span className="muted">
                                  ({poi.categoryLabel},{' '}
                                  {Number.isFinite(poi.distanceToRoute)
                                    ? `${Math.round(poi.distanceToRoute)} m`
                                    : 'afstand onbekend'}
                                  , {redenNietOpgenomen(poi)})
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="btn btn-indigo btn-small niet-opgenomen-inklappen"
                        onClick={() => {
                          setToonNietOpgenomen(false)
                          const kop = nietOpgenomenKop.current
                          if (kop && kop.scrollIntoView) kop.scrollIntoView({ block: 'nearest' })
                        }}
                      >
                        Inklappen
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </Step>

        <Step
          number={6}
          title="Samenvattingen"
          disabled={!searchDone || alleenEigen}
          hint={
            alleenEigen
              ? "Niet nodig: eigen POI's hebben hun eigen beschrijving."
              : "Zoek eerst POI's bij stap 4."
          }
        >
          <p>
            <strong>{summaryFoundCount}</strong> van {corridorPois.length} POI's binnen de corridor
            hebben een Wikipedia-samenvatting
            {wikidataZinCount > 0 ? `; ${wikidataZinCount} kregen een zin uit Wikidata.` : '.'}
          </p>
          {viaLiggingCount > 0 && viaLiggingPerTaal.length === 1 && (
            <p className="muted">
              {viaLiggingCount === 1 ? '1 artikel' : `${viaLiggingCount} artikelen`} in het{' '}
              {taalNaam(viaLiggingPerTaal[0].taal)} gevonden via de ligging (Wikidata had er geen in die taal).
            </p>
          )}
          {viaLiggingPerTaal.length > 1 && (
            <p className="muted">
              {viaLiggingCount} artikelen gevonden via de ligging:{' '}
              {viaLiggingPerTaal.map((v) => `${v.aantal} in het ${taalNaam(v.taal)}`).join(', ')} (Wikidata had
              er geen in die talen).
            </p>
          )}
          {eigenInCorridorCount > 0 && (
            <p className="muted">
              {eigenInCorridorCount} eigen POI's gebruiken hun eigen beschrijving (zonder beschrijving: alleen
              de naam).
            </p>
          )}
          <p className="muted">
            Optioneel: bij opslaan (stap 7) worden ontbrekende samenvattingen automatisch opgehaald.
          </p>
          <label className="toggle-row">
            <input type="checkbox" checked={ookZonderTekst} onChange={() => setOokZonderTekst((v) => !v)} />
            <span>
              Ook POI's zonder tekst melden
              <br />
              <span className="muted">
                Zonder Wikipedia-samenvatting of zin uit Wikidata wordt alleen de naam (of een korte omschrijving)
                voorgelezen.
              </span>
            </span>
          </label>
          {zonderTekstCount > 0 && !ookZonderTekst && (
            <p className="muted">
              {zonderTekstCount === 1 ? "1 POI zonder tekst doet" : `${zonderTekstCount} POI's zonder tekst doen`} niet
              mee in Onderweg en de export
              {summaryMissingPois.length > 0 ? '; na het ophalen kan dat nog veranderen.' : '.'}
            </p>
          )}
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
                  const fotoUrl = fotoUrlVan(entry)
                  const fotoBron = window.WikiPoiCommonsFoto
                    ? window.WikiPoiCommonsFoto.bronTekst(entry.foto)
                    : null
                  return (
                    <li key={poi.id}>
                      {fotoUrl && <img src={fotoUrl} alt="" />}
                      <span className="category-name">
                        <CategoryDot categoryKey={poi.categoryKey} />
                        {poi.label}
                      </span>
                      {poi.naamWikidata && !entry.viaLigging && (
                        <p className="summary-text muted">
                          Naam uit het artikel; in Wikidata: „{poi.naamWikidata}”.
                        </p>
                      )}
                      {entry.summary && entry.summary.viaWikidata ? (
                        <p className="summary-text">
                          <span className="muted">Geen artikel. Samengesteld uit Wikidata: </span>
                          „{entry.summary.extractShort}”
                        </p>
                      ) : entry.summary ? (
                        <>
                          {entry.viaLigging && (
                            <p className="summary-text muted">
                              Gevonden via de ligging
                              {poi.naamWikidata && poi.naamWikidata !== poi.label
                                ? `; in Wikidata: „${poi.naamWikidata}”`
                                : ''}
                              .
                            </p>
                          )}
                          <p className="summary-text">{entry.summary.extractShort}</p>
                          {entry.summary.attribution && (
                            <p className="summary-text muted">{entry.summary.attribution}</p>
                          )}
                        </>
                      ) : !poi.wikipediaUrl ? (
                        <p className="summary-text muted">
                          Geen Wikipedia-artikel.{' '}
                          {!meldtMee(poi)
                            ? 'Geen tekst: doet niet mee.'
                            : poi.description
                            ? `De CSV gebruikt de omschrijving: „${poi.description}”.`
                            : 'Er is ook geen omschrijving; alleen de naam gaat mee.'}
                        </p>
                      ) : (
                        <p className="summary-text muted">
                          Geen samenvatting ({entry.summaryError || 'onbekende reden'})
                          {meldtMee(poi) ? '; de CSV gebruikt de Wikidata-omschrijving.' : '; geen tekst: doet niet mee.'}
                        </p>
                      )}
                      {fotoUrl && fotoBron && <p className="summary-text muted foto-bron">{fotoBron}</p>}
                    </li>
                  )
                })}
            </ul>
          )}
        </Step>

        <Step number={7} title="Exporteren" disabled={!searchDone} hint="Zoek eerst POI's bij stap 4.">
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
          number={8}
          title="Onderweg"
          disabled={corridorPois.length === 0}
          hint="Zoek eerst POI's bij stap 4; er moet minstens één POI binnen de corridor liggen."
        >
          <Onderweg
            pois={meldPois}
            summariesById={summariesById}
            routePunten={routeInfo ? routeInfo.points : null}
            haalSamenvattingen={haalSamenvattingenVoorRit}
            onRit={setRitIds}
            standaardVervoer={instellingen.vervoer}
            keuzeMs={instellingen.keuzeS * 1000}
          />
        </Step>
      </main>
    </>
  )
}

export default App
