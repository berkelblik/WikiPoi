/**
 * Onderweg.jsx
 *
 * Inhoud van stap 8 "Onderweg": keuze vervoerwijze, route starten/stoppen,
 * GPS-status, voorleesstatus en de dichtstbijzijnde POI's met afstand,
 * klokrichting en triggerstraal. Tik op een POI om hem direct te laten
 * voorlezen (handig om thuis te testen).
 *
 * Eco-scherm (bouwstap 4): zwart scherm dat aan blijft en bij een trigger de
 * POI toont; openen met de knop "Eco-scherm", sluiten met 3× tikken. Met
 * "Opnieuw beluisteren" (ook na afloop, voor de laatst voorgelezen POI)
 * wordt de toelichting nog een keer voorgelezen, bijv. na lawaai onderweg.
 * ECO_BIJ_START = true opent het meteen bij "Route starten" (productie).
 *
 * Simulatie (testmodus, TEST_SIMULATIE): rit langs de geladen route zonder
 * GPS, om trigger en eco-scherm thuis te testen. Snelheid volgt de
 * vervoerwijze; versnelling ×1/×5/×10, pauze en "Naar volgende POI".
 *
 * Kaart: zolang de route loopt een compacte kaart (RouteMap) met route,
 * POI's en de eigen positie (stip, nauwkeurigheid, pijltje rijrichting).
 * De kaart volgt de positie; na zelf schuiven zet "Volg mij" het volgen
 * weer aan. Bij de simulatie is dat de gesimuleerde positie.
 *
 * Proef achtergrond-GPS (TEST_ACHTERGROND): vinkje "Achtergrond-GPS"
 * (alleen in de Android-app); de positie komt dan van een voorgrondservice
 * met vaste melding, zodat de app ook met het scherm uit blijft werken. Na
 * afloop toont stap 8 het logboek van de laatste rit (logboek.js), met
 * knoppen om het te bekijken en te delen.
 *
 * 0.18.0: de triggerstraal staat als cirkel op de kaart, de afgelegde
 * track als groene lijn (track.js).
 *
 * 0.18.1 (keuzes S1, T, G, P1–P4): opgeruimd, knoppen zonder vragen.
 *   - Straal altijd die van de vervoerwijze; de knoppen zeggen het zelf
 *     ("Fietser — meldt een POI 100 m vooraf").
 *   - Vinkje "Track opnemen" (standaard aan, bewaard in localStorage
 *     wikipoi.trackOpnemen). Tijdens de rit "Track: … opgenomen" of "Track
 *     gepauzeerd (stilstand)"; de track is een groene onderbroken lijn.
 *   - Na de rit: samenvatting (afstand, tijd onderweg, pauzes) met "Track
 *     opslaan (GPX)" en "Track weggooien" (met bevestiging).
 *   - Indeling: vervoerwijze → Track opnemen → Route starten → rit → track
 *     van de laatste rit → ingeklapt blok "Testen" (simulatie,
 *     Achtergrond-GPS, filtertellers, logboek).
 *
 * 0.19.0: keuzevenster bij meerdere POI's tegelijk (KeuzeVenster.jsx,
 * poiKeuze.js) en de lijst "Later beluisteren" (ook na de rit, tot de
 * volgende start; ook op het eco-scherm).
 *
 * 0.19.1: een POI triggert bij het triggerpunt op de route én bij de POI
 * zelf (T1); ligt de POI verder van de route, dan staat er op de kaart ook
 * een cirkel om de POI. Eigen POI's met een radius > 0 in de CSV hebben die
 * straal (trigger.js).
 */
import { useState, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { useOnderweg, VERVOER, STANDAARD_VERVOER, triggerStraal } from './useOnderweg.js'
import { poiStraal } from './trigger.js'
import {
  track as trackOpslag,
  alsGpx,
  bestandsnaam,
  lengteVan,
  tellingVan,
  pauzesVan,
} from './track.js'
import { achtergrondMogelijk } from './positieBron.js'
import { logboek, analyseer, alsTekst, duurTekst, tijdTekst } from './logboek.js'
import EcoScherm from './EcoScherm.jsx'
import KeuzeVenster from './KeuzeVenster.jsx'
import { SIM_SNELHEID_KMU, SIM_VERSNELLINGEN } from './simulatie.js'
import { formatAfstand, afstand } from './geo.js'
import CategoryDot from '../components/CategoryDot.jsx'
import RouteMap from '../components/RouteMap.jsx'

// Productie: true = eco-scherm meteen bij "Route starten". Testfase: false,
// dan blijft de lijst zichtbaar en open je het eco-scherm met de knop.
const ECO_BIJ_START = false

// Testfase: true = keuze "Simulatie" zichtbaar. Productie: false.
const TEST_SIMULATIE = true

// Proef achtergrond-GPS: true = keuze "Achtergrond-GPS" zichtbaar (alleen in
// de Android-app) en het logboek van de laatste rit onder de knoppen.
const TEST_ACHTERGROND = true

// Hoogte van de kaart in stap 8 (kleiner dan bij stap 5, zodat de lijst
// met dichtstbijzijnde POI's eronder in beeld blijft).
const KAART_HOOGTE = '260px'

const TRACK_SLEUTEL = 'wikipoi.trackOpnemen'

function laadTrackOpnemen() {
  try {
    return localStorage.getItem(TRACK_SLEUTEL) !== 'nee'
  } catch {
    return true
  }
}

function bewaarTrackOpnemen(aan) {
  try {
    localStorage.setItem(TRACK_SLEUTEL, aan ? 'ja' : 'nee')
  } catch {
    // Geen opslag: de keuze geldt alleen deze sessie.
  }
}

// "40 s", "48 min" of "1 u 12 min".
function ritDuur(ms) {
  if (!Number.isFinite(ms)) return '?'
  if (ms < 59500) return `${Math.round(ms / 1000)} s`
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} u ${min % 60} min`
}

// "16-10 14:05" (lokale tijd).
function ritMoment(ms) {
  const d = new Date(ms)
  const twee = (n) => String(n).padStart(2, '0')
  return `${twee(d.getDate())}-${twee(d.getMonth() + 1)} ${twee(d.getHours())}:${twee(d.getMinutes())}`
}

// Lengte van de lijnen op de kaart ([[[lat, lng], …], …]) in meters.
function lengteLijnen(lijnen) {
  let m = 0
  ;(lijnen || []).forEach((lijn) => {
    for (let i = 1; i < lijn.length; i++) {
      const d = afstand({ lat: lijn[i - 1][0], lng: lijn[i - 1][1] }, { lat: lijn[i][0], lng: lijn[i][1] })
      if (Number.isFinite(d)) m += d
    }
  })
  return m
}

// "Track laatste rit (16-10 14:05): 12,4 km · 48 min onderweg · 3 pauzes (14 min)"
function trackSamenvatting(data) {
  const p = pauzesVan(data)
  const delen = [formatAfstand(lengteVan(data, afstand))]
  if (p.onderwegMs !== null) delen.push(`${ritDuur(p.onderwegMs)} onderweg`)
  else delen.push('niet afgesloten')
  if (p.aantal === 0) delen.push('geen pauzes')
  else delen.push(`${p.aantal} ${p.aantal === 1 ? 'pauze' : 'pauzes'} (${ritDuur(p.pauzeMs)})`)
  return `Track laatste rit (${ritMoment(data.start)}): ${delen.join(' · ')}`
}

// "3,2" (km, één decimaal, komma).
const km = (meters) => (meters / 1000).toFixed(1).replace('.', ',')

// Eén regel samenvatting van een logboek.
function logboekSamenvatting(data) {
  const a = analyseer(data)
  if (!a) return ''
  return (
    `${tijdTekst(data.start, false)}, ${duurTekst(a.duurMs)}, bron ${data.bron}: ` +
    `${a.aantalPosities} posities` +
    (a.grootsteGatPositie ? `, grootste gat ${duurTekst(a.grootsteGatPositie.ms)}` : '') +
    (a.grootsteGatHartslag ? `, hartslag-gat ${duurTekst(a.grootsteGatHartslag.ms)}` : '') +
    `, ${a.triggers} triggers` +
    (a.fouten ? `, ${a.fouten} fouten` : '') +
    (data.eind ? '' : ' (niet afgesloten)')
  )
}

function Onderweg({ pois, summariesById, routePunten }) {
  const [vervoer, setVervoer] = useState(STANDAARD_VERVOER)
  const [ecoOpen, setEcoOpen] = useState(false)
  const [simAan, setSimAan] = useState(false)
  const [simMelding, setSimMelding] = useState('')
  const [achtergrondAan, setAchtergrondAan] = useState(false)
  const [logboekTonen, setLogboekTonen] = useState(false)
  const [logboekMelding, setLogboekMelding] = useState('')
  const [trackOpnemen, setTrackOpnemen] = useState(laadTrackOpnemen)
  const [trackMelding, setTrackMelding] = useState('')
  const [weggooienVragen, setWeggooienVragen] = useState(false)
  // Na "Track weggooien" de (al gelezen) track niet meer tonen.
  const [weggegooid, setWeggegooid] = useState(false)
  const simulatieMogelijk =
    TEST_SIMULATIE && Array.isArray(routePunten) && routePunten.length >= 2
  const achtergrondKeuze = TEST_ACHTERGROND && achtergrondMogelijk()
  const simulatieGekozen = simulatieMogelijk && simAan
  const achtergrondGekozen = achtergrondKeuze && achtergrondAan && !simulatieGekozen
  const {
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
    keuze,
    kies,
    keuzeLater,
    later,
    speelLater,
  } = useOnderweg(pois, {
    vervoer,
    samenvattingen: summariesById,
    eco: ecoOpen,
    simulatie: simulatieGekozen ? routePunten : null,
    achtergrond: achtergrondGekozen,
    trackOpnemen,
  })

  // Triggerstraal per POI voor de kaart: rond het triggerpunt op de route
  // en (T1, 0.19.1) ook rond de POI zelf als die er niet vlakbij ligt.
  // Alleen bij de POI zelf (0.19.5): alleen de cirkel om de POI.
  const straalCirkels = useMemo(() => {
    const cirkels = []
    pois.forEach((p) => {
      const straal = poiStraal(p, triggerStraal(vervoer))
      const klaar = !!voorgelezen[p.id]
      const t = p.alleenBijPoi ? p : p.snapPoint || p
      cirkels.push({ id: p.id, lat: t.lat, lng: t.lng, straal, voorgelezen: klaar })
      if (!p.alleenBijPoi && p.snapPoint && afstand(p, p.snapPoint) > 10) {
        cirkels.push({ id: `${p.id}-poi`, lat: p.lat, lng: p.lng, straal, voorgelezen: klaar })
      }
    })
    return cirkels
  }, [pois, vervoer, voorgelezen])

  const kiesTrackOpnemen = (aan) => {
    setTrackOpnemen(aan)
    bewaarTrackOpnemen(aan)
  }

  // Track van de laatste rit (ook van een eerdere app-sessie).
  const bewaardeTrack = useMemo(() => {
    if (actief) return null
    const d = trackOpslag.laad()
    return d && Array.isArray(d.gefilterd) && d.gefilterd.length > 0 ? d : null
  }, [actief])
  const vorigeTrack = weggegooid ? null : bewaardeTrack
  const vorigeTrackTelling = vorigeTrack ? tellingVan(vorigeTrack) : null

  const gooiTrackWeg = () => {
    trackOpslag.wis()
    setWeggooienVragen(false)
    setTrackMelding('Track weggegooid.')
    setWeggegooid(true)
  }

  const deelTrack = async () => {
    setTrackMelding('')
    const gpx = alsGpx(vorigeTrack, { naam: 'WikiPoi-rit' })
    const naam = bestandsnaam(vorigeTrack)
    try {
      if (Capacitor.isNativePlatform()) {
        const geschreven = await Filesystem.writeFile({
          path: naam,
          data: gpx,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        await Share.share({ title: naam, files: [geschreven.uri], dialogTitle: 'Track opslaan' })
        setTrackMelding(`"${naam}" aangeboden; kies bijv. "Opslaan in Bestanden" of Drive.`)
      } else {
        const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }))
        const link = document.createElement('a')
        link.href = url
        link.download = naam
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setTrackMelding(`"${naam}" opgeslagen.`)
      }
    } catch (err) {
      const bericht = err && err.message ? err.message : String(err)
      if (/cancel/i.test(bericht)) {
        setTrackMelding('Opslaan geannuleerd.')
        return
      }
      setTrackMelding('Track opslaan mislukt: ' + bericht)
    }
  }

  // Logboek van de laatste rit (ook van een eerdere app-sessie), opnieuw
  // gelezen telkens als de route stopt.
  const vorigLogboek = useMemo(() => (TEST_ACHTERGROND && !actief ? logboek.laad() : null), [actief])

  const deelLogboek = async () => {
    const tekst = alsTekst(vorigLogboek)
    setLogboekMelding('')
    try {
      await Share.share({ title: 'WikiPoi-logboek', text: tekst, dialogTitle: 'Logboek delen' })
    } catch (err) {
      const bericht = err && err.message ? err.message : String(err)
      if (/cancel/i.test(bericht)) return
      try {
        await navigator.clipboard.writeText(tekst)
        setLogboekMelding('Delen niet beschikbaar; het logboek staat op het klembord.')
      } catch {
        setLogboekMelding('Delen niet beschikbaar. Kies "Logboek tonen" en kopieer de tekst.')
        setLogboekTonen(true)
      }
    }
  }

  const routeStarten = () => {
    setSimMelding('')
    setTrackMelding('')
    setWeggooienVragen(false)
    setWeggegooid(false)
    start()
    if (ECO_BIJ_START) setEcoOpen(true)
  }

  const routeStoppen = () => {
    setEcoOpen(false)
    stop()
  }

  const naarVolgendePoi = () => {
    setSimMelding(simVolgendePoi() ? '' : 'Geen volgende POI meer verderop langs de route.')
  }

  // Eigen POI's (CSV) hebben geen samenvatting nodig.
  const zonderSamenvatting = pois.filter((p) => !p.eigen && !(p.id in (summariesById || {}))).length

  const testenZichtbaar = simulatieMogelijk || achtergrondKeuze || (TEST_ACHTERGROND && vorigeTrack) || vorigLogboek

  return (
    <>
      <p className="muted">
        Volgt je GPS-positie langs de route en leest elke POI één keer voor zodra je in de buurt
        bent.
      </p>
      {zonderSamenvatting > 0 && (
        <p className="muted">
          Tip: voor {zonderSamenvatting} POI's is nog geen samenvatting opgehaald (stap 6); die
          krijgen alleen de korte Wikidata-omschrijving.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        {Object.entries(VERVOER).map(([key, v]) => (
          <button
            key={key}
            type="button"
            className={key === vervoer ? 'btn btn-yellow btn-small' : 'btn btn-indigo btn-small'}
            aria-pressed={key === vervoer}
            onClick={() => setVervoer(key)}
          >
            {v.label} — meldt een POI {v.straal} m vooraf
          </button>
        ))}
      </div>
      {!actief && (
        <label
          className="muted"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
        >
          <input
            type="checkbox"
            checked={trackOpnemen}
            onChange={(e) => kiesTrackOpnemen(e.target.checked)}
          />
          Track opnemen (je afgelegde weg; pauzeert vanzelf als je stilstaat)
        </label>
      )}
      <button
        type="button"
        className={actief ? 'btn btn-pink btn-wide' : 'btn btn-green btn-wide'}
        onClick={actief ? routeStoppen : routeStarten}
      >
        {actief
          ? 'Route stoppen'
          : `${simulatieGekozen ? 'Simulatie' : 'Route'} starten (${pois.length} POI's)`}
      </button>
      {actief && achtergrondGekozen && (
        <p className="muted" style={{ marginTop: '8px' }}>
          Achtergrond-GPS actief: de melding "WikiPoi volgt uw route" blijft staan tot u de
          route stopt.
        </p>
      )}
      {actief && (
        <button
          type="button"
          className="btn btn-blue btn-wide"
          style={{ marginTop: '8px' }}
          onClick={() => setEcoOpen(true)}
        >
          Eco-scherm
        </button>
      )}
      {actief && simStatus && (
        <>
          <p className="muted" style={{ marginTop: '8px' }}>
            Simulatie: km {km(simStatus.meters)} van {km(simStatus.lengte)} ·{' '}
            {SIM_SNELHEID_KMU[vervoer]} km/u × {simStatus.versnelling}
            {simStatus.gepauzeerd ? ' · gepauzeerd' : ''}
            {simStatus.klaar ? ' · einde route' : ''}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className="btn btn-indigo btn-small"
              disabled={simStatus.klaar}
              onClick={simPauze}
            >
              {simStatus.gepauzeerd ? 'Verder' : 'Pauze'}
            </button>
            <button
              type="button"
              className="btn btn-indigo btn-small"
              disabled={simStatus.klaar}
              onClick={naarVolgendePoi}
            >
              Naar volgende POI
            </button>
            {SIM_VERSNELLINGEN.map((v) => (
              <button
                key={v}
                type="button"
                className={
                  v === simStatus.versnelling ? 'btn btn-yellow btn-small' : 'btn btn-indigo btn-small'
                }
                aria-pressed={v === simStatus.versnelling}
                onClick={() => simVersnelling(v)}
              >
                ×{v}
              </button>
            ))}
          </div>
          {simMelding && <p className="muted">{simMelding}</p>}
        </>
      )}
      {fout && <p className="error">{fout}</p>}
      {actief && !positie && !fout && <p className="muted">Wachten op GPS-positie…</p>}
      {actief && positie && (
        <p className="muted">
          GPS: nauwkeurigheid ±{' '}
          {Number.isFinite(positie.nauwkeurigheid) ? Math.round(positie.nauwkeurigheid) : '?'} m ·
          rijrichting:{' '}
          {rijrichting === null ? 'nog onbekend (eerst ± 10 m verplaatsen)' : `${Math.round(rijrichting)}°`}{' '}
          · voorgelezen: {aantalVoorgelezen} van {pois.length}
        </p>
      )}
      {actief && trackOpnemen && (
        <p className="muted">
          {trackGepauzeerd
            ? 'Track gepauzeerd (stilstand) — gaat verder zodra je weer beweegt.'
            : `Track: ${formatAfstand(lengteLijnen(trackLijn))} opgenomen.`}
        </p>
      )}
      {actief && (
        <div className="map-frame" style={{ height: KAART_HOOGTE, marginBottom: '12px' }}>
          <RouteMap
            routePoints={routePunten || []}
            pois={pois}
            corridorMeters={null}
            positie={positie}
            rijrichting={rijrichting}
            track={trackLijn}
            straalCirkels={straalCirkels}
          />
        </div>
      )}
      {nuAanHetVoorlezen && (
        <p className="success">
          Voorlezen: {nuAanHetVoorlezen}{' '}
          <button type="button" className="btn btn-indigo btn-small" onClick={stopVoorlezen}>
            Stil
          </button>
        </p>
      )}
      {actief && positie && dichtstbij.length > 0 && (
        <ul className="poi-list">
          {dichtstbij.map((poi) => (
            <li key={poi.id} onClick={() => leesVoor(poi)} style={{ cursor: 'pointer' }}>
              <CategoryDot categoryKey={poi.categoryKey} />
              <span>
                {voorgelezen[poi.id] ? '✓ ' : ''}
                {poi.label}{' '}
                <span className="muted">
                  ({formatAfstand(poi.afstandTriggerpunt)}
                  {poi.klok !== null ? `, op ${poi.klok} uur` : ''})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p className="muted">Later beluisteren ({later.length}):</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {later.map((poi) => (
              <button
                key={poi.id}
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => speelLater(poi)}
              >
                ▶ {poi.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {vorigeTrack && (
        <div style={{ marginTop: '16px' }}>
          <p className="muted">{trackSamenvatting(vorigeTrack)}</p>
          {weggooienVragen ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <span className="muted">Track definitief weggooien?</span>
              <button type="button" className="btn btn-pink btn-small" onClick={gooiTrackWeg}>
                Ja, weggooien
              </button>
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => setWeggooienVragen(false)}
              >
                Nee, bewaren
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn btn-green btn-small" onClick={deelTrack}>
                Track opslaan (GPX)
              </button>
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => {
                  setTrackMelding('')
                  setWeggooienVragen(true)
                }}
              >
                Track weggooien
              </button>
            </div>
          )}
        </div>
      )}
      {trackMelding && <p className="muted">{trackMelding}</p>}
      {testenZichtbaar && (
        <details style={{ marginTop: '16px' }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            Testen
          </summary>
          <div style={{ marginTop: '8px' }}>
            {simulatieMogelijk && !actief && (
              <label
                className="muted"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <input type="checkbox" checked={simAan} onChange={(e) => setSimAan(e.target.checked)} />
                Simulatie: rit langs de route zonder GPS
              </label>
            )}
            {achtergrondKeuze && !actief && !simulatieGekozen && (
              <label
                className="muted"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <input
                  type="checkbox"
                  checked={achtergrondAan}
                  onChange={(e) => setAchtergrondAan(e.target.checked)}
                />
                Achtergrond-GPS: blijft werken met het scherm uit (proef, met vaste melding)
              </label>
            )}
            {TEST_ACHTERGROND && vorigeTrack && vorigeTrack.ruw && vorigeTrack.ruw.length > 0 && (
              <p className="muted">
                Filter laatste rit: {vorigeTrack.gefilterd.length} posities; metingen{' '}
                {vorigeTrack.ruw.length}, waarvan weggegooid {vorigeTrackTelling.nauwkeurigheid}{' '}
                (nauwkeurigheid) en {vorigeTrackTelling.sprong} (sprong).
              </p>
            )}
            {vorigLogboek && (
              <>
                <p className="muted">Logboek laatste rit: {logboekSamenvatting(vorigLogboek)}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <button type="button" className="btn btn-indigo btn-small" onClick={deelLogboek}>
                    Logboek delen
                  </button>
                  <button
                    type="button"
                    className="btn btn-indigo btn-small"
                    aria-pressed={logboekTonen}
                    onClick={() => setLogboekTonen((v) => !v)}
                  >
                    {logboekTonen ? 'Logboek verbergen' : 'Logboek tonen'}
                  </button>
                </div>
                {logboekMelding && <p className="muted">{logboekMelding}</p>}
                {logboekTonen && (
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontSize: '12px',
                      maxHeight: '320px',
                      overflow: 'auto',
                      userSelect: 'text',
                    }}
                  >
                    {alsTekst(vorigLogboek)}
                  </pre>
                )}
              </>
            )}
          </div>
        </details>
      )}
      {actief && ecoOpen && (
        <EcoScherm
          poi={ecoPoi}
          positie={positie}
          rijrichting={rijrichting}
          samenvatting={ecoPoi && summariesById ? summariesById[ecoPoi.id] || null : null}
          laatstePoi={laatstePoi}
          onHerhaal={herhaal}
          later={later}
          onLater={speelLater}
          onSluiten={() => setEcoOpen(false)}
        />
      )}
      {actief && keuze && <KeuzeVenster keuze={keuze} onKies={kies} onLater={keuzeLater} />}
    </>
  )
}

export default Onderweg
