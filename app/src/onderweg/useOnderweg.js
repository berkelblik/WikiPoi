/**
 * useOnderweg.js
 *
 * React-hook voor stap 8 "Onderweg": volgt de GPS-positie zolang de route
 * loopt, berekent per POI de afstand tot het triggerpunt (het punt op de
 * route dat het dichtst bij de POI ligt, snapPoint uit App.jsx) en leest een
 * POI voor zodra je binnen de triggerstraal komt — per rit één keer.
 *
 * Triggerstraal (0.18.1, keuze S1): de straal van de vervoerwijze; sinds
 * 0.19.1 gaat een radius > 0 uit de CSV (eigen POI's) voor (trigger.js).
 * (De keuze "Automatisch" uit 0.18.0, met afstand POI–route + 50 m, is
 * vervallen.)
 *
 * Afstand (0.19.1, keuze T1, trigger.js): de kleinste van de afstand tot
 * het triggerpunt op de route en de afstand tot de POI zelf. Zo triggert
 * een POI bij het volgen van de route én als je er werkelijk langs komt
 * terwijl de route ergens anders loopt. Het logboek noemt beide afstanden
 * en de afstand POI–route (T2).
 *
 * Positiefilter (0.18.0, positieFilter.js): GPS-metingen gaan eerst door
 * het filter (nauwkeurigheid ≤ 35 m met terugval, sprongfilter per
 * vervoerwijze, gemiddelde over 5 metingen); alleen de gefilterde positie
 * bepaalt pointer, rijrichting en trigger. De simulatie gaat er niet door
 * ("Naar volgende POI" is een bewuste sprong).
 *
 * Track (0.18.0, track.js, keuze B2): elke ruwe meting (met de uitkomst
 * van het filter) en elke gefilterde positie; de lijn van de gefilterde
 * posities staat op de kaart (trackLijn), na afloop op te slaan als GPX.
 * 0.18.1: alleen met optie trackOpnemen; bij stilstand pauzeert de opname
 * (trackGepauzeerd) en gaat bij beweging verder in een nieuw segment
 * (trackLijn = [[[lat, lng], …], …], één lijn per segment).
 * 0.19.1 (P5/P6): alleen pauze bij aantoonbaar stilstaan (posities binnen
 * 5 m); uitblijvende posities geven geen pauze meer (tik() alleen bij de
 * simulatie). Pas een pauze van 20 s telt (track.pauzeTelt()): die komt in
 * het logboek en alleen dan worden de POI's uit "Later" aangeboden, hoogstens
 * één keer per 5 min tenzij er iets nieuws in "Later" staat.
 *
 * Rijrichting: niet uit coords.heading (op Android via @capacitor/geolocation
 * vaak leeg), maar berekend uit twee GPS-punten die minstens
 * MIN_VERPLAATSING_VOOR_RICHTING_M uit elkaar liggen. Bij stilstand blijft de
 * laatst bekende richting staan (zelfde gedrag als EuroPoi).
 *
 * Aankondiging: een fietsbel en daarna de klokrichting in de taal van het
 * toestel ("Auf 3 Uhr."). De naam wordt uitgesproken (in de taal van het
 * label) als die niet al in de toelichting staat (0.13.0,
 * voorleestekst.js): "Op 3 uur. Neergestorte vlieger. Oorlogsmonument, …".
 *
 * Met het eco-scherm open (optie eco) is het verloop anders: bel 1 op het
 * moment dat je de straal binnenkomt (het eco-scherm toont dan de POI), na
 * 1 s bel 2, daarna de toelichting — zonder klokzin, want de klok staat op
 * het scherm. De hook geeft die POI terug als ecoPoi, zolang hij wordt
 * voorgelezen of je nog binnen de straal bent.
 *
 * Simulatie (testmodus): met optie simulatie = de routepunten gebruikt
 * "Route starten" geen GPS, maar schuift de positie elke seconde verder
 * langs de route (simulatie.js). Die posities gaan door verwerkPositie, net
 * als echte GPS-posities, zodat trigger, bellen en eco-scherm ongewijzigd
 * werken. Snelheid volgt de vervoerwijze; versnelling, pauze en "Naar
 * volgende POI" via simVersnelling, simPauze en simVolgendePoi.
 *
 * Positiebron (positieBron.js): standaard 'voorgrond' (@capacitor/
 * geolocation); met optie achtergrond = true de voorgrondservice van
 * @capacitor-community/background-geolocation, zodat posities ook met het
 * scherm uit binnenkomen (proef achtergrond-GPS).
 *
 * Logboek (logboek.js): per rit posities, schermstand, hartslag, triggers,
 * bel en voorlezen, voor de proef achtergrond-GPS. Bron 'simulatie' bij
 * een gesimuleerde rit.
 *
 * Eigen POI's met audio (0.11.0, mp3bron.js): na bel (en klokzin) klinkt
 * de mp3 — internetlink (online) of gekoppeld lokaal bestand — in plaats
 * van de voorgelezen toelichting. Lukt geen enkele bron, dan wordt de
 * toelichting alsnog voorgelezen (zonder klokzin, die klonk al).
 *
 * Meerdere POI's tegelijk (0.19.0, poiKeuze.js, keuzes O1–O7): komen er
 * twee of meer tegelijk binnen hun straal, dan klinkt één bel, worden de
 * namen genoemd en opent een keuzevenster (keuze); zonder keuze na 10 s
 * de dichtstbijzijnde. Komt er een bij tijdens het voorlezen: venster "Ook
 * hier" zonder bel. Niet gekozen of al gepasseerde POI's gaan naar "Later
 * beluisteren" (later); bij een pauze van de track worden die aangeboden.
 * Met het scherm uit geen venster: dichtstbijzijnde eerst, rest naar later.
 *
 * Bouwstap 4 van "Onderweg": eco-scherm; sinds 0.18.0 met track.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { afstand, peiling, klokRichting } from './geo.js'
import { spreek, bel, dubbeleBel, speelAudio, stopSpreken, zetDiagnose } from './spreek.js'
import { audioBronnen } from './mp3bron.js'
import { startPositieBron } from './positieBron.js'
import { logboek, koppelBrowser } from './logboek.js'
import { afstandNoemen, audioOpening, voorleesDelen } from './voorleestekst.js'
import { maakSimulatie, volgendeDoel, SIM_SNELHEID_KMU, SIM_VOORLOOP_M } from './simulatie.js'
import { maakPositieFilter, MAX_SNELHEID_KMU, tellersTekst } from './positieFilter.js'
import { track, segmentenVan } from './track.js'
import { poiStraal, triggerAfstand, triggerTekst } from './trigger.js'
import {
  besluitBinnen,
  keuzeVerlopen,
  kiesUit,
  volgendeUitWachtrij,
  pauzeKeuze,
  magPauzeAanbieden,
  aankondigingTekst,
  pauzeTekst,
  voegToe,
  KEUZE_MS,
  PAUZE_KEUZE_MS,
} from './poiKeuze.js'

// Minimale verplaatsing voordat de rijrichting wordt (bij)gewerkt. Kleiner
// maakt de richting bij stilstand onrustig door GPS-ruis.
const MIN_VERPLAATSING_VOOR_RICHTING_M = 10

// Aantal dichtstbijzijnde POI's dat de hook teruggeeft voor de lijst.
const AANTAL_DICHTSTBIJ = 3

// Straal per vervoerwijze, gelijk aan EuroPoi (src/config.js, TRANSPORT).
export const VERVOER = {
  wandelaar: { label: 'Wandelaar', straal: 30 },
  fietser: { label: 'Fietser', straal: 100 },
  motorrijder: { label: 'Motorrijder', straal: 160 },
}
export const STANDAARD_VERVOER = 'fietser'

// Triggerstraal: de straal van de vervoerwijze (0.18.1, keuze S1).
export function triggerStraal(vervoer) {
  return (VERVOER[vervoer] || VERVOER[STANDAARD_VERVOER]).straal
}

// voorleesDelen (klokzin → naam → toelichting) staat in voorleestekst.js
// (0.13.0), samen met de regel voor de CSV-export.

// Alle delen van een POI in de wachtrij: onStart bij het eerste deel (of de
// bel), onEinde na het laatste. Soort:
// - 'handmatig': zonder bel (de gebruiker begint zelf);
// - 'lijst': één bel, dan klokzin, naam (indien nodig) en toelichting;
// - 'eco': dubbele bel, dan naam (indien nodig) en toelichting, zonder klokzin.
// Heeft de POI audio (eigen POI met mp3-link of gekoppeld bestand), dan
// klinkt die in plaats van de toelichting, met de toelichting als terugval.
// zonderBel (0.19.0): geen bel, bijv. na een keuze in het venster (de bel
// klonk al bij de aankondiging). afstand (0.19.3, T3b): afstand (m) tot de
// POI op het moment van voorlezen; verder dan AFSTAND_NOEMEN_M wordt die
// genoemd in plaats van de klokrichting (ook bij eco). Geeft false als er
// niets voor te lezen is.
function spreekPoi(
  poi,
  samenvattingen,
  klok,
  { soort = 'handmatig', zonderBel = false, afstand = null, onStart, onEinde } = {}
) {
  if (afstandNoemen(afstand)) {
    logboek.noteer('voorlezen', `${poi.label}: afstand genoemd (${Math.round(afstand)} m)`)
  }
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  const audio = audioBronnen(poi, online)
  if (audio.bronnen.length > 0) {
    speelPoiAudio(poi, samenvattingen, klok, audio, { soort, zonderBel, afstand, onStart, onEinde })
    return true
  }
  const delen = voorleesDelen(poi, samenvattingen, soort === 'eco' ? null : klok, afstand)
  if (delen.length === 0) return false
  let startGebruikt = false
  if (soort === 'lijst' && !zonderBel) {
    bel({ onStart })
    startGebruikt = true
  } else if (soort === 'eco' && !zonderBel) {
    dubbeleBel({ onStart })
    startGebruikt = true
  }
  delen.forEach((deel, i) => {
    spreek(deel.tekst, {
      lang: deel.lang,
      onStart: i === 0 && !startGebruikt ? onStart : undefined,
      onEinde: i === delen.length - 1 ? onEinde : undefined,
    })
  })
  return true
}

// Variant van spreekPoi voor een POI met audio: bel (lijst/eco), klokzin
// (niet bij eco) of, ver weg, afstand en naam (0.19.3), dan de audio met de
// toelichting zonder klokzin als terugval.
function speelPoiAudio(poi, samenvattingen, klok, audio, { soort, zonderBel, afstand, onStart, onEinde }) {
  let startGebruikt = false
  if (soort === 'lijst' && !zonderBel) {
    bel({ onStart })
    startGebruikt = true
  } else if (soort === 'eco' && !zonderBel) {
    dubbeleBel({ onStart })
    startGebruikt = true
  }
  audioOpening(poi, soort === 'eco' ? null : klok, afstand).forEach((deel) => {
    spreek(deel.tekst, { lang: deel.lang, onStart: startGebruikt ? undefined : onStart })
    startGebruikt = true
  })
  speelAudio({
    bronnen: audio.bronnen,
    overgeslagen: audio.overgeslagen,
    terugval: voorleesDelen(poi, samenvattingen, null),
    onStart: startGebruikt ? undefined : onStart,
    onEinde,
  })
}

// Foto's van de POI's alvast laden, zodat ze in de cache van de WebView
// staan als het eco-scherm ze later onderweg (mogelijk zonder bereik) toont.
function laadFotosVooraf(pois, samenvattingen) {
  if (typeof Image === 'undefined') return
  pois.forEach((poi) => {
    const entry = samenvattingen ? samenvattingen[poi.id] : null
    const url =
      (entry && entry.foto && entry.foto.url) || (entry && entry.summary ? entry.summary.thumbnailUrl : null)
    if (url) {
      const img = new Image()
      img.src = url
    }
  })
}

// Ruwe meting uit de vorm van de Geolocation-API ({ coords, timestamp }),
// of null bij een ongeldige positie.
function leesMeting(pos) {
  const c = pos && pos.coords
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null
  return {
    lat: c.latitude,
    lng: c.longitude,
    nauwkeurigheid: c.accuracy,
    tijd: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
  }
}

// Is het scherm te zien? (O5: met het scherm uit of een andere app op de
// voorgrond geen keuzevenster.)
function labelVan(pois, id) {
  const p = (pois || []).find((x) => x.id === id)
  return p ? p.label : String(id)
}

function schermZichtbaar() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function foutTekst(err) {
  return 'GPS-fout: ' + (err && err.message ? err.message : String(err))
}

// Korte toestelomschrijving voor het logboek: het deel tussen haakjes van
// de user-agent, bijv. "Linux; Android 16; 25053PC47G Build/…; wv".
function toestelTekst() {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return ''
  const m = navigator.userAgent.match(/\(([^)]*)\)/)
  return m ? m[1] : navigator.userAgent.slice(0, 120)
}

// Logboek beginnen voor een nieuwe rit en koppelen aan zichtbaarheid,
// hartslag en de diagnosemeldingen van bel en voorlezen. Geeft een
// functie terug die alles weer loskoppelt en het logboek afsluit.
function beginLogboek(bron) {
  logboek.begin(bron, toestelTekst())
  const ontkoppel = koppelBrowser(logboek)
  zetDiagnose((soort, tekst) => logboek.noteer(soort, tekst))
  return () => {
    zetDiagnose(null)
    logboek.stop()
    ontkoppel()
  }
}

export function useOnderweg(
  pois,
  {
    vervoer = STANDAARD_VERVOER,
    samenvattingen = {},
    eco = false,
    simulatie = null,
    achtergrond = false,
    trackOpnemen = true,
  } = {}
) {
  const [actief, setActief] = useState(false)
  const [positie, setPositie] = useState(null) // { lat, lng, nauwkeurigheid, tijd }
  const [rijrichting, setRijrichting] = useState(null) // graden, of null = onbekend
  const [fout, setFout] = useState('')
  const [voorgelezen, setVoorgelezen] = useState({}) // { [poi.id]: true } deze rit
  const [nuAanHetVoorlezen, setNuAanHetVoorlezen] = useState(null) // label of null
  // POI voor het eco-scherm: { id, klaar } (klaar = uitgesproken), of null.
  const [ecoTrigger, setEcoTrigger] = useState(null)
  // Simulatie: { meters, lengte, versnelling, gepauzeerd, klaar }, of null.
  const [simStatus, setSimStatus] = useState(null)
  // Laatst automatisch voorgelezen POI (id), voor de herhaalknop op het
  // eco-scherm; blijft staan tot de volgende POI aan de beurt is.
  const [laatstePoiId, setLaatstePoiId] = useState(null)
  // Lijnen van de gefilterde posities van deze rit, één per segment.
  const [trackLijn, setTrackLijn] = useState([])
  const [trackGepauzeerd, setTrackGepauzeerd] = useState(false)
  // Keuzevenster (0.19.0): { soort, ids, tot } of null; "Later beluisteren": ids.
  const [keuze, setKeuze] = useState(null)
  const [later, setLater] = useState([])

  const bronRef = useRef(null) // { bron, stop } van positieBron.js
  const logboekStopRef = useRef(null)
  const richtingPuntRef = useRef(null)
  const voorgelezenRef = useRef({})
  const samenvattingenRef = useRef(samenvattingen)
  const poisRef = useRef(pois)
  const ecoRef = useRef(eco)
  const vervoerRef = useRef(vervoer)
  const simRef = useRef(null)
  const filterRef = useRef(null)
  if (filterRef.current === null) filterRef.current = maakPositieFilter()
  const keuzeRef = useRef(null)
  const laterRef = useRef([])
  const wachtendRef = useRef([]) // ids die na de huidige aan de beurt zijn
  const bezigIdRef = useRef(null) // POI die nu automatisch wordt voorgelezen
  const poisMetAfstandRef = useRef([])
  const pauzeAangebodenRef = useRef(false) // O7: één aanbod per pauze
  const vorigAanbodRef = useRef(null) // P6: { tijd, ids } van het laatste aanbod

  useEffect(() => {
    samenvattingenRef.current = samenvattingen
  }, [samenvattingen])

  useEffect(() => {
    poisRef.current = pois
  }, [pois])

  useEffect(() => {
    ecoRef.current = eco
  }, [eco])

  // Andere vervoerwijze tijdens een simulatie: andere snelheid.
  useEffect(() => {
    vervoerRef.current = vervoer
    filterRef.current.zetMaxSnelheid(MAX_SNELHEID_KMU[vervoer] || MAX_SNELHEID_KMU[STANDAARD_VERVOER])
    if (simRef.current) {
      simRef.current.zetSnelheid(SIM_SNELHEID_KMU[vervoer] || SIM_SNELHEID_KMU[STANDAARD_VERVOER])
    }
  }, [vervoer])

  // Pauzestatus van de track bijwerken. Het scherm toont de pauze na 3 s;
  // het logboek en het pauze-aanbod (O7) pas als de pauze telt (20 s, P6),
  // zodat kort stilstaan geen regels oplevert.
  const pauzeRef = useRef(false)
  const langePauzeRef = useRef(false)
  const [langePauze, setLangePauze] = useState(false)
  const werkPauzeBij = useCallback(() => {
    const nu = track.gepauzeerd()
    if (nu !== pauzeRef.current) {
      pauzeRef.current = nu
      setTrackGepauzeerd(nu)
    }
    const lang = track.pauzeTelt()
    if (lang === langePauzeRef.current) return
    langePauzeRef.current = lang
    setLangePauze(lang)
    if (lang) {
      logboek.noteer('info', 'track gepauzeerd (stilstand)')
    } else {
      const p = track.laatstePauze()
      const s = p && Number.isFinite(p.eind) ? Math.round((p.eind - p.start) / 1000) : null
      logboek.noteer('info', s === null ? 'track verder' : `track verder (pauze ${s} s)`)
    }
  }, [])

  // Gefilterde (of gesimuleerde) positie tonen: rijrichting, positie, track.
  const toonPositie = useCallback((p) => {
    const punt = { lat: p.lat, lng: p.lng }
    const vorig = richtingPuntRef.current
    if (!vorig) {
      richtingPuntRef.current = punt
    } else if (afstand(vorig, punt) >= MIN_VERPLAATSING_VOOR_RICHTING_M) {
      setRijrichting(peiling(vorig, punt))
      richtingPuntRef.current = punt
    }
    const d = track.huidig()
    if (d) {
      const aantal = d.gefilterd.length
      track.positie(p)
      if (d.gefilterd.length !== aantal) setTrackLijn(segmentenVan(d))
      werkPauzeBij()
    }
    setPositie({ ...punt, nauwkeurigheid: p.nauwkeurigheid, tijd: p.tijd })
  }, [werkPauzeBij])

  // Simulatie: geen filter.
  const verwerkPositie = useCallback(
    (pos) => {
      const m = leesMeting(pos)
      if (!m) return
      logboek.positie({ tijd: m.tijd, nauwkeurigheid: m.nauwkeurigheid })
      // Eerst de positie: na een pauze komt de meting dan in het nieuwe segment.
      toonPositie(m)
      track.meting(m, 'geaccepteerd')
    },
    [toonPositie]
  )

  // Echte GPS: eerst door het positiefilter.
  const verwerkGps = useCallback(
    (pos) => {
      const m = leesMeting(pos)
      if (!m) return
      const r = filterRef.current.verwerk(m)
      if (!r || r.status === 'dubbel') return
      logboek.positie({ tijd: m.tijd, nauwkeurigheid: m.nauwkeurigheid })
      if (r.status !== 'geaccepteerd') {
        track.meting(m, r.status)
        return
      }
      if (r.sprongGeaccepteerd) logboek.noteer('filter', 'sprong geaccepteerd (vorige posities waren fout)')
      // Eerst de positie: na een pauze komt de meting dan in het nieuwe segment.
      toonPositie(r.punt)
      track.meting(m, r.status)
    },
    [toonPositie]
  )

  const stopBron = useCallback(() => {
    if (bronRef.current) {
      bronRef.current.stop()
      bronRef.current = null
    }
  }, [])

  const stopLogboek = useCallback(() => {
    if (logboekStopRef.current) {
      const t = filterRef.current.tellers()
      if (t.geaccepteerd + t.nauwkeurigheid + t.sprong > 0) logboek.noteer('filter', tellersTekst(t))
      track.stop()
      logboekStopRef.current()
      logboekStopRef.current = null
    }
  }, [])

  const stopSim = useCallback(() => {
    if (simRef.current) {
      simRef.current.stop()
      simRef.current = null
    }
    setSimStatus(null)
  }, [])

  const start = useCallback(async () => {
    setFout('')
    setPositie(null)
    setRijrichting(null)
    richtingPuntRef.current = null
    voorgelezenRef.current = {}
    setVoorgelezen({})
    setEcoTrigger(null)
    setLaatstePoiId(null)
    setTrackLijn([])
    setTrackGepauzeerd(false)
    pauzeRef.current = false
    langePauzeRef.current = false
    setLangePauze(false)
    vorigAanbodRef.current = null
    keuzeRef.current = null
    setKeuze(null)
    laterRef.current = []
    setLater([])
    wachtendRef.current = []
    bezigIdRef.current = null
    filterRef.current.reset()
    filterRef.current.zetMaxSnelheid(
      MAX_SNELHEID_KMU[vervoerRef.current] || MAX_SNELHEID_KMU[STANDAARD_VERVOER]
    )
    laadFotosVooraf(poisRef.current, samenvattingenRef.current)
    stopSim()
    stopBron()
    stopLogboek()
    if (Array.isArray(simulatie) && simulatie.length >= 2) {
      logboekStopRef.current = beginLogboek('simulatie')
      if (trackOpnemen) track.begin('simulatie')
      const sim = maakSimulatie(simulatie, {
        snelheidKmu:
          SIM_SNELHEID_KMU[vervoerRef.current] || SIM_SNELHEID_KMU[STANDAARD_VERVOER],
        onPositie: verwerkPositie,
        onStatus: setSimStatus,
      })
      simRef.current = sim
      sim.start()
      setActief(true)
      return
    }
    const soort = achtergrond ? 'achtergrond' : 'voorgrond'
    logboekStopRef.current = beginLogboek(soort)
    if (trackOpnemen) track.begin(soort)
    try {
      const bron = await startPositieBron(soort, {
        onPositie: (pos) => {
          setFout('')
          verwerkGps(pos)
        },
        onFout: (tekst) => {
          logboek.noteer('gps-fout', tekst)
          setFout(tekst)
        },
        onInfo: (tekst) => logboek.noteer('info', tekst),
      })
      bronRef.current = bron
      logboek.noteer('info', `bron actief: ${bron.bron}`)
      setActief(true)
    } catch (err) {
      const tekst = err && err.message && /toestemming/i.test(err.message) ? err.message : foutTekst(err)
      logboek.noteer('gps-fout', tekst)
      stopLogboek()
      setFout(tekst)
      setActief(false)
    }
  }, [simulatie, achtergrond, trackOpnemen, stopBron, stopSim, stopLogboek, verwerkPositie, verwerkGps])

  // Elke seconde: pauzestatus bijwerken (de duur van een pauze loopt door
  // zonder nieuwe posities). Bij de simulatie ook pauzeren zonder nieuwe
  // posities (simulatie op pauze); bij echte GPS niet meer (P5: een gat in
  // de metingen is geen stilstand).
  useEffect(() => {
    if (!actief) return undefined
    const iv = setInterval(() => {
      if (simRef.current) track.tik()
      werkPauzeBij()
    }, 1000)
    return () => clearInterval(iv)
  }, [actief, werkPauzeBij])

  // Venster openen of bijwerken; een meegegeven tot (M3: POI's erbij in een
  // open venster) blijft staan, anders begint het aftellen.
  const zetKeuze = useCallback((k) => {
    keuzeRef.current = k
      ? {
          ...k,
          tot: Number.isFinite(k.tot) ? k.tot : Date.now() + (k.soort === 'pauze' ? PAUZE_KEUZE_MS : KEUZE_MS),
        }
      : null
    setKeuze(keuzeRef.current)
  }, [])

  const naarLater = useCallback((ids) => {
    const nieuw = (ids || []).filter((id) => id !== null && id !== undefined && !laterRef.current.includes(id))
    if (nieuw.length === 0) return
    laterRef.current = voegToe(laterRef.current, nieuw)
    setLater(laterRef.current)
    logboek.noteer('keuze', 'later beluisteren: ' + nieuw.map((id) => labelVan(poisRef.current, id)).join(', '))
  }, [])

  const uitLater = useCallback((id) => {
    if (!laterRef.current.includes(id)) return
    laterRef.current = laterRef.current.filter((x) => x !== id)
    setLater(laterRef.current)
  }, [])

  // "Stil": voorlezen stoppen; wat nog in de wachtrij stond gaat naar "Later".
  const stopVoorlezen = useCallback(() => {
    stopSpreken()
    setNuAanHetVoorlezen(null)
    setEcoTrigger(null)
    bezigIdRef.current = null
    naarLater(wachtendRef.current)
    wachtendRef.current = []
  }, [naarLater])

  const stop = useCallback(() => {
    stopBron()
    stopSim()
    stopVoorlezen()
    stopLogboek()
    pauzeRef.current = false
    setTrackGepauzeerd(false)
    langePauzeRef.current = false
    setLangePauze(false)
    zetKeuze(null)
    setActief(false)
  }, [stopBron, stopSim, stopVoorlezen, stopLogboek, zetKeuze])

  // Bij verlaten van de pagina/component GPS-volgen, simulatie, voorlezen en
  // logboek stoppen.
  useEffect(
    () => () => {
      stopBron()
      if (simRef.current) simRef.current.stop()
      stopSpreken()
      stopLogboek()
    },
    [stopBron, stopLogboek]
  )

  const simPauze = useCallback(() => {
    const sim = simRef.current
    if (sim) sim.pauzeer(!sim.status().gepauzeerd)
  }, [])

  const simVersnelling = useCallback((v) => {
    if (simRef.current) simRef.current.zetVersnelling(v)
  }, [])

  // Naar SIM_VOORLOOP_M vóór de eerstvolgende POI die nog niet aan de beurt
  // was. Geeft false als er verderop geen POI meer is.
  const simVolgendePoi = useCallback(() => {
    const sim = simRef.current
    if (!sim) return false
    const posities = poisRef.current
      .filter((p) => !voorgelezenRef.current[p.id] && !p.alleenBijPoi)
      .map((p) => sim.afstandVan(p.snapPoint || p))
    const doel = volgendeDoel(posities, sim.status().meters, SIM_VOORLOOP_M)
    if (doel === null) return false
    sim.springNaar(doel)
    return true
  }, [])

  // Handmatig voorlezen (tik op een POI in de lijst); telt niet als
  // "voorgelezen" voor de automatische trigger.
  const leesVoor = useCallback((poi) => {
    spreekPoi(poi, samenvattingenRef.current, poi.klok, {
      afstand: poi.afstandPoi,
      onStart: () => setNuAanHetVoorlezen(poi.label),
      onEinde: () => setNuAanHetVoorlezen(null),
    })
  }, [])

  // Herhaalknop op het eco-scherm: het lopende voorlezen (en wat nog in de
  // wachtrij stond) stoppen en de toelichting van deze POI direct opnieuw
  // voorlezen, zonder bel en zonder klokzin. De POI staat dan weer op het
  // eco-scherm tot hij is uitgesproken (en daarna zolang je binnen de straal
  // bent).
  const herhaal = useCallback(async (poi) => {
    if (!poi) return
    await stopSpreken()
    setNuAanHetVoorlezen(null)
    spreekPoi(poi, samenvattingenRef.current, null, {
      soort: 'handmatig',
      onStart: () => {
        setNuAanHetVoorlezen(poi.label)
        setEcoTrigger({ id: poi.id, klaar: false })
      },
      onEinde: () => {
        setNuAanHetVoorlezen(null)
        setEcoTrigger((huidig) => (huidig && huidig.id === poi.id ? { ...huidig, klaar: true } : huidig))
      },
    })
  }, [])

  // Per POI: triggerafstand (T1: de kleinste van triggerpunt op de route en
  // de POI zelf; afstandTriggerpunt), beide afstanden apart, triggerstraal
  // (radius uit de CSV of die van de vervoerwijze) en klokrichting.
  // Gesorteerd op triggerafstand.
  const poisMetAfstand = useMemo(() => {
    if (!positie) return []
    const vervoerStraal = triggerStraal(vervoer)
    return pois
      .map((p) => {
        const t = triggerAfstand(positie, p)
        const straal = poiStraal(p, vervoerStraal)
        return {
          ...p,
          afstandTriggerpunt: t.afstand,
          afstandPoi: t.totPoi,
          afstandRoutepunt: t.totRoutepunt,
          straal,
          eigenStraal: straal !== vervoerStraal,
          klok: rijrichting === null ? null : klokRichting(rijrichting, peiling(positie, p)),
        }
      })
      .filter((p) => Number.isFinite(p.afstandTriggerpunt))
      .sort((a, b) => a.afstandTriggerpunt - b.afstandTriggerpunt)
  }, [pois, positie, rijrichting, vervoer])

  // Laatste afstanden/klokrichting, voor besluiten buiten de render om.
  useEffect(() => {
    poisMetAfstandRef.current = poisMetAfstand
  }, [poisMetAfstand])

  const zoekPoi = useCallback(
    (id) =>
      poisMetAfstandRef.current.find((p) => p.id === id) ||
      poisRef.current.find((p) => p.id === id) ||
      null,
    []
  )

  // Volgende uit de wachtrij; via een ref, omdat speelAuto en volgende
  // elkaar aanroepen.
  const volgendeRef = useRef(() => {})
  const biedPauzeAanRef = useRef(() => {})

  // POI automatisch voorlezen (bel tenzij zonderBel, eco of lijst).
  const speelAuto = useCallback(
    (id, { zonderBel = false } = {}) => {
      const p = zoekPoi(id)
      if (!p) {
        volgendeRef.current()
        return
      }
      uitLater(id)
      bezigIdRef.current = id
      const soort = ecoRef.current ? 'eco' : 'lijst'
      const gestart = spreekPoi(p, samenvattingenRef.current, Number.isFinite(p.klok) ? p.klok : null, {
        soort,
        zonderBel,
        afstand: p.afstandPoi,
        onStart: () => {
          setNuAanHetVoorlezen(p.label)
          setLaatstePoiId(p.id)
          if (soort === 'eco') setEcoTrigger({ id: p.id, klaar: false })
        },
        onEinde: () => {
          setNuAanHetVoorlezen(null)
          setEcoTrigger((huidig) => (huidig && huidig.id === p.id ? { ...huidig, klaar: true } : huidig))
          if (bezigIdRef.current === id) {
            bezigIdRef.current = null
            volgendeRef.current()
          }
        },
      })
      if (!gestart) {
        bezigIdRef.current = null
        volgendeRef.current()
      }
    },
    [zoekPoi, uitLater]
  )

  // Volgende uit de wachtrij (O6). Niet zolang er op een keuze wordt
  // gewacht; staat er een venster "Ook hier" open, dan is het nu aan die
  // POI('s), zonder de 10 s af te wachten.
  const volgende = useCallback(() => {
    if (bezigIdRef.current) return
    const k = keuzeRef.current
    if (k && k.soort === 'overlap') return
    if (k && k.soort === 'ook') {
      zetKeuze(null)
      wachtendRef.current = voegToe(wachtendRef.current, k.ids)
    }
    const r = volgendeUitWachtrij(wachtendRef.current, (id) => {
      const p = poisMetAfstandRef.current.find((x) => x.id === id)
      return !!p && p.afstandTriggerpunt <= p.straal
    })
    wachtendRef.current = r.rest
    naarLater(r.later)
    if (r.speel) speelAuto(r.speel)
    else if (langePauzeRef.current) biedPauzeAanRef.current()
  }, [naarLater, speelAuto, zetKeuze])

  useEffect(() => {
    volgendeRef.current = volgende
  }, [volgende])

  // Besluit uit poiKeuze.js uitvoeren.
  const voer = useCallback(
    (r, { uitVenster = false } = {}) => {
      if (r.onderbreek) {
        const huidig = bezigIdRef.current
        bezigIdRef.current = null
        stopSpreken()
        setNuAanHetVoorlezen(null)
        if (huidig) naarLater([huidig])
      }
      naarLater(r.later)
      if (r.wachtend.length > 0) wachtendRef.current = voegToe(wachtendRef.current, r.wachtend)
      if (r.keuze) {
        zetKeuze(r.keuze)
        const namen = r.keuze.ids.map((id) => labelVan(poisRef.current, id))
        logboek.noteer('keuze', `venster ${r.keuze.soort}: ${namen.join(', ')}`)
        if (r.aankondig) {
          bel()
          spreek(aankondigingTekst(namen))
        }
      }
      if (r.speel) speelAuto(r.speel, { zonderBel: uitVenster })
      else volgende()
    },
    [naarLater, zetKeuze, speelAuto, volgende]
  )

  // Automatische trigger: alle POI's binnen hun straal die deze rit nog niet
  // aan de beurt waren (dichtstbijzijnde eerst); poiKeuze.js beslist of er
  // voorgelezen, gekozen of gewacht wordt (0.19.0).
  useEffect(() => {
    if (!actief) return
    const nieuw = poisMetAfstand.filter(
      (p) => p.afstandTriggerpunt <= p.straal && !voorgelezenRef.current[p.id]
    )
    if (nieuw.length === 0) return
    const volgendeMap = { ...voorgelezenRef.current }
    nieuw.forEach((p) => {
      volgendeMap[p.id] = true
    })
    voorgelezenRef.current = volgendeMap
    setVoorgelezen(volgendeMap)
    const soort = ecoRef.current ? 'eco' : 'lijst'
    nieuw.forEach((p) => {
      logboek.noteer('trigger', triggerTekst(p, soort))
    })
    voer(
      besluitBinnen({
        nieuw,
        bezig: !!bezigIdRef.current,
        keuze: keuzeRef.current,
        zichtbaar: schermZichtbaar(),
      })
    )
  }, [actief, poisMetAfstand, voer])

  // Venster verloopt zonder keuze (O3).
  useEffect(() => {
    if (!keuze) return undefined
    const t = setTimeout(() => {
      const k = keuzeRef.current
      if (!k || k.tot !== keuze.tot) return
      zetKeuze(null)
      logboek.noteer('keuze', `geen keuze (${k.soort})`)
      voer(keuzeVerlopen(k), { uitVenster: true })
    }, Math.max(0, keuze.tot - Date.now()))
    return () => clearTimeout(t)
  }, [keuze, voer, zetKeuze])

  // Pauze van de track (O7): POI's uit "Later" aanbieden, één keer per
  // pauze; zodra de pauze telt (20 s, P6), of zodra het voorlezen tijdens
  // de pauze klaar is (via volgende()). Hoogstens één keer per 5 min, tenzij
  // er sinds het vorige aanbod iets nieuws in "Later" staat.
  const biedPauzeAan = useCallback(() => {
    if (pauzeAangebodenRef.current) return
    const k = pauzeKeuze({
      gepauzeerd: langePauzeRef.current,
      later: laterRef.current,
      bezig: !!bezigIdRef.current,
      keuze: keuzeRef.current,
    })
    if (!k) return
    const nu = Date.now()
    if (!magPauzeAanbieden({ nu, vorige: vorigAanbodRef.current, later: k.ids })) return
    pauzeAangebodenRef.current = true
    vorigAanbodRef.current = { tijd: nu, ids: k.ids }
    zetKeuze(k)
    logboek.noteer('keuze', `pauze: ${k.ids.length} later beluisteren aangeboden`)
    spreek(pauzeTekst(k.ids.length))
  }, [zetKeuze])

  useEffect(() => {
    biedPauzeAanRef.current = biedPauzeAan
  }, [biedPauzeAan])

  useEffect(() => {
    if (langePauze) biedPauzeAan()
    else pauzeAangebodenRef.current = false
  }, [langePauze, biedPauzeAan])

  // Tik in het venster.
  const kies = useCallback(
    (id) => {
      const k = keuzeRef.current
      if (!k) return
      zetKeuze(null)
      logboek.noteer('keuze', `gekozen: ${labelVan(poisRef.current, id)}`)
      // Aankondiging of pauzezin die nog loopt: afbreken, de keuze gaat voor.
      if (k.soort !== 'ook' && !bezigIdRef.current) stopSpreken()
      voer(kiesUit(k, id), { uitVenster: true })
    },
    [voer, zetKeuze]
  )

  // "Later" (overlap/ook) of "Sluiten" (pauze) in het venster.
  const keuzeLater = useCallback(() => {
    const k = keuzeRef.current
    if (!k) return
    zetKeuze(null)
    if (k.soort !== 'pauze') naarLater(k.ids)
    volgende()
  }, [naarLater, volgende, zetKeuze])

  // POI uit "Later beluisteren" voorlezen (zonder bel, met klokzin).
  const speelLater = useCallback(
    (poi) => {
      if (!poi) return
      uitLater(poi.id)
      const p = zoekPoi(poi.id) || poi
      spreekPoi(p, samenvattingenRef.current, Number.isFinite(p.klok) ? p.klok : null, {
        afstand: p.afstandPoi,
        onStart: () => setNuAanHetVoorlezen(p.label),
        onEinde: () => setNuAanHetVoorlezen(null),
      })
    },
    [uitLater, zoekPoi]
  )

  const dichtstbij = poisMetAfstand.slice(0, AANTAL_DICHTSTBIJ)

  // POI voor het eco-scherm: zichtbaar zolang hij wordt voorgelezen, en
  // daarna zolang je nog binnen de straal bent.
  const ecoKandidaat = ecoTrigger ? poisMetAfstand.find((p) => p.id === ecoTrigger.id) : null
  const ecoPoi =
    ecoKandidaat && (!ecoTrigger.klaar || ecoKandidaat.afstandTriggerpunt <= ecoKandidaat.straal)
      ? ecoKandidaat
      : null
  const aantalVoorgelezen = Object.keys(voorgelezen).length
  const laatstePoi = laatstePoiId ? pois.find((p) => p.id === laatstePoiId) || null : null
  const keuzePois = keuze
    ? {
        soort: keuze.soort,
        tot: keuze.tot,
        pois: keuze.ids.map((id) => pois.find((p) => p.id === id)).filter(Boolean),
      }
    : null
  const laterPois = later.map((id) => pois.find((p) => p.id === id)).filter(Boolean)

  return {
    actief,
    positie,
    rijrichting,
    fout,
    start,
    stop,
    dichtstbij,
    voorgelezen,
    aantalVoorgelezen,
    nuAanHetVoorlezen,
    leesVoor,
    stopVoorlezen,
    ecoPoi,
    laatstePoi,
    herhaal,
    simStatus,
    simPauze,
    simVersnelling,
    simVolgendePoi,
    trackLijn,
    trackGepauzeerd,
    keuze: keuzePois,
    kies,
    keuzeLater,
    later: laterPois,
    speelLater,
  }
}
