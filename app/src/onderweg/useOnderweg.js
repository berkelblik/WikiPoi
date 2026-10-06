/**
 * useOnderweg.js
 *
 * React-hook voor stap 7 "Onderweg": volgt de GPS-positie zolang de route
 * loopt, berekent per POI de afstand tot het triggerpunt (het punt op de
 * route dat het dichtst bij de POI ligt, snapPoint uit App.jsx) en leest een
 * POI voor zodra je binnen de triggerstraal komt — per rit één keer.
 *
 * Triggerstraal "Automatisch" (EuroPoi-regels, route-modus):
 *   max(straal van de vervoerwijze, afstand POI–route + 50 m).
 *
 * Rijrichting: niet uit coords.heading (op Android via @capacitor/geolocation
 * vaak leeg), maar berekend uit twee GPS-punten die minstens
 * MIN_VERPLAATSING_VOOR_RICHTING_M uit elkaar liggen. Bij stilstand blijft de
 * laatst bekende richting staan (zelfde gedrag als EuroPoi).
 *
 * Aankondiging: geen gesproken naam (een buitenlandse plaatsnaam klinkt in
 * de stem van een andere taal vaak onherkenbaar), maar een fietsbel en
 * daarna de klokrichting in de taal van het toestel ("Auf 3 Uhr."). De
 * naam staat op het scherm en meestal ook in de toelichting.
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
 * Bouwstap 4 van "Onderweg": eco-scherm. Nog geen track.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { afstand, peiling, klokRichting } from './geo.js'
import { spreek, bel, dubbeleBel, speelAudio, stopSpreken, zetDiagnose } from './spreek.js'
import { audioBronnen } from './mp3bron.js'
import { startPositieBron } from './positieBron.js'
import { logboek, koppelBrowser } from './logboek.js'
import { basisTaal, klokZin, labelTaal, toelichtingTaal } from '../taal.js'
import { maakSimulatie, volgendeDoel, SIM_SNELHEID_KMU, SIM_VOORLOOP_M } from './simulatie.js'

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

// Extra marge bovenop de afstand POI–route (EuroPoi: poiToRoute + 50).
const ROUTE_MARGE_M = 50

export function triggerStraal(poi, vervoer) {
  const basis = (VERVOER[vervoer] || VERVOER[STANDAARD_VERVOER]).straal
  const totRoute = Number.isFinite(poi.distanceToRoute) ? poi.distanceToRoute : 0
  return Math.max(basis, totRoute + ROUTE_MARGE_M)
}

// Voorleestekst in delen, elk met een eigen taal:
// - klokrichting ("Auf 3 Uhr.") in de taal van het toestel, als die richting
//   bekend is en er een vertaling voor die taal is (taal.js, klokZin);
// - toelichting: de samenvatting (stap 5) of anders de Wikidata-omschrijving
//   (dezelfde keuze als de CSV-export), in de taal van die tekst.
// Is de basistaal van beide gelijk, dan wordt het één deel.
// Zonder toelichting wordt de naam wél uitgesproken, anders zegt de bel
// niets: in de taal van het label (labelLanguage uit Wikidata; 'mul' of
// onbekend: de taal van het toestel), de klokzin in de taal van het toestel.
// Ook hier één deel als de basistaal gelijk is.
export function voorleesDelen(poi, samenvattingen, klok) {
  const entry = samenvattingen ? samenvattingen[poi.id] || null : null
  const beschrijving = (
    entry && entry.summary ? entry.summary.extractShort || '' : poi.description || ''
  ).trim()
  const richting = klokZin(klok)
  if (!beschrijving) {
    const naam = `${poi.label || ''}`.trim()
    if (!naam) return richting ? [richting] : []
    const naamDeel = { tekst: `${naam}.`, lang: labelTaal(poi) }
    if (!richting) return [naamDeel]
    if (basisTaal(naamDeel.lang) === basisTaal(richting.lang)) {
      return [{ tekst: `${naamDeel.tekst} ${richting.tekst}`, lang: richting.lang }]
    }
    return [naamDeel, richting]
  }
  const taal = toelichtingTaal(poi, entry)
  if (!richting) return [{ tekst: beschrijving, lang: taal }]
  if (basisTaal(taal) === basisTaal(richting.lang)) {
    return [{ tekst: `${richting.tekst} ${beschrijving}`, lang: taal }]
  }
  return [richting, { tekst: beschrijving, lang: taal }]
}

// Alle delen van een POI in de wachtrij: onStart bij het eerste deel (of de
// bel), onEinde na het laatste. Soort:
// - 'handmatig': zonder bel (de gebruiker begint zelf);
// - 'lijst': één bel, dan klokzin en toelichting;
// - 'eco': dubbele bel, dan de toelichting zonder klokzin.
// Heeft de POI audio (eigen POI met mp3-link of gekoppeld bestand), dan
// klinkt die in plaats van de toelichting, met de toelichting als terugval.
function spreekPoi(poi, samenvattingen, klok, { soort = 'handmatig', onStart, onEinde } = {}) {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false
  const audio = audioBronnen(poi, online)
  if (audio.bronnen.length > 0) {
    speelPoiAudio(poi, samenvattingen, klok, audio, { soort, onStart, onEinde })
    return
  }
  const delen = voorleesDelen(poi, samenvattingen, soort === 'eco' ? null : klok)
  if (delen.length === 0) return
  let startGebruikt = false
  if (soort === 'lijst') {
    bel({ onStart })
    startGebruikt = true
  } else if (soort === 'eco') {
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
}

// Variant van spreekPoi voor een POI met audio: bel (lijst/eco), klokzin
// (niet bij eco), dan de audio met de toelichting zonder klokzin als terugval.
function speelPoiAudio(poi, samenvattingen, klok, audio, { soort, onStart, onEinde }) {
  let startGebruikt = false
  if (soort === 'lijst') {
    bel({ onStart })
    startGebruikt = true
  } else if (soort === 'eco') {
    dubbeleBel({ onStart })
    startGebruikt = true
  }
  const richting = soort === 'eco' ? null : klokZin(klok)
  if (richting) {
    spreek(richting.tekst, { lang: richting.lang, onStart: startGebruikt ? undefined : onStart })
    startGebruikt = true
  }
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

  const bronRef = useRef(null) // { bron, stop } van positieBron.js
  const logboekStopRef = useRef(null)
  const richtingPuntRef = useRef(null)
  const voorgelezenRef = useRef({})
  const samenvattingenRef = useRef(samenvattingen)
  const poisRef = useRef(pois)
  const ecoRef = useRef(eco)
  const vervoerRef = useRef(vervoer)
  const simRef = useRef(null)

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
    if (simRef.current) {
      simRef.current.zetSnelheid(SIM_SNELHEID_KMU[vervoer] || SIM_SNELHEID_KMU[STANDAARD_VERVOER])
    }
  }, [vervoer])

  const verwerkPositie = useCallback((pos) => {
    const c = pos && pos.coords
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return
    const punt = { lat: c.latitude, lng: c.longitude }

    const vorig = richtingPuntRef.current
    if (!vorig) {
      richtingPuntRef.current = punt
    } else if (afstand(vorig, punt) >= MIN_VERPLAATSING_VOOR_RICHTING_M) {
      setRijrichting(peiling(vorig, punt))
      richtingPuntRef.current = punt
    }

    logboek.positie({ tijd: pos.timestamp, nauwkeurigheid: c.accuracy })
    setPositie({ ...punt, nauwkeurigheid: c.accuracy, tijd: pos.timestamp })
  }, [])

  const stopBron = useCallback(() => {
    if (bronRef.current) {
      bronRef.current.stop()
      bronRef.current = null
    }
  }, [])

  const stopLogboek = useCallback(() => {
    if (logboekStopRef.current) {
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
    laadFotosVooraf(poisRef.current, samenvattingenRef.current)
    stopSim()
    stopBron()
    stopLogboek()
    if (Array.isArray(simulatie) && simulatie.length >= 2) {
      logboekStopRef.current = beginLogboek('simulatie')
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
    try {
      const bron = await startPositieBron(soort, {
        onPositie: (pos) => {
          setFout('')
          verwerkPositie(pos)
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
  }, [simulatie, achtergrond, stopBron, stopSim, stopLogboek, verwerkPositie])

  const stopVoorlezen = useCallback(() => {
    stopSpreken()
    setNuAanHetVoorlezen(null)
    setEcoTrigger(null)
  }, [])

  const stop = useCallback(() => {
    stopBron()
    stopSim()
    stopVoorlezen()
    stopLogboek()
    setActief(false)
  }, [stopBron, stopSim, stopVoorlezen, stopLogboek])

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
      .filter((p) => !voorgelezenRef.current[p.id])
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

  // Per POI: afstand tot triggerpunt (snapPoint; anders de POI zelf),
  // triggerstraal en klokrichting. Gesorteerd op afstand tot triggerpunt.
  const poisMetAfstand = useMemo(() => {
    if (!positie) return []
    return pois
      .map((p) => {
        const triggerpunt = p.snapPoint || p
        return {
          ...p,
          afstandTriggerpunt: afstand(positie, triggerpunt),
          straal: triggerStraal(p, vervoer),
          klok: rijrichting === null ? null : klokRichting(rijrichting, peiling(positie, p)),
        }
      })
      .filter((p) => Number.isFinite(p.afstandTriggerpunt))
      .sort((a, b) => a.afstandTriggerpunt - b.afstandTriggerpunt)
  }, [pois, positie, rijrichting, vervoer])

  // Automatische trigger: alle POI's binnen hun straal die deze rit nog niet
  // aan de beurt waren, dichtstbijzijnde eerst, via de wachtrij.
  useEffect(() => {
    if (!actief) return
    const nieuw = poisMetAfstand.filter(
      (p) => p.afstandTriggerpunt <= p.straal && !voorgelezenRef.current[p.id]
    )
    if (nieuw.length === 0) return
    const volgende = { ...voorgelezenRef.current }
    nieuw.forEach((p) => {
      volgende[p.id] = true
    })
    voorgelezenRef.current = volgende
    setVoorgelezen(volgende)
    const soort = ecoRef.current ? 'eco' : 'lijst'
    nieuw.forEach((p) => {
      logboek.noteer(
        'trigger',
        `${p.label} (${Math.round(p.afstandTriggerpunt)} m, straal ${Math.round(p.straal)} m, ${soort})`
      )
      spreekPoi(p, samenvattingenRef.current, p.klok, {
        soort,
        onStart: () => {
          setNuAanHetVoorlezen(p.label)
          setLaatstePoiId(p.id)
          if (soort === 'eco') setEcoTrigger({ id: p.id, klaar: false })
        },
        onEinde: () => {
          setNuAanHetVoorlezen(null)
          setEcoTrigger((huidig) =>
            huidig && huidig.id === p.id ? { ...huidig, klaar: true } : huidig
          )
        },
      })
    })
  }, [actief, poisMetAfstand])

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
  }
}
