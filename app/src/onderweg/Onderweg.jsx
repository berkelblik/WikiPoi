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
import { useState, useEffect, useMemo, useRef } from 'react'
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
import { ophalenVoorStart, ophaalMelding, ophaalLogregel } from './samenvattingVoorStart.js'
import { SIM_SNELHEID_KMU, SIM_VERSNELLINGEN } from './simulatie.js'
import { formatAfstand, afstand } from './geo.js'
import CategoryDot from '../components/CategoryDot.jsx'
import RouteMap from '../components/RouteMap.jsx'
import { t, getal } from '../vertaal.js'

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
  return t('onderweg.duurUren', { uur: Math.floor(min / 60), min: min % 60 })
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
  if (p.onderwegMs !== null) delen.push(t('onderweg.track.onderweg', { duur: ritDuur(p.onderwegMs) }))
  else delen.push(t('onderweg.track.nietAfgesloten'))
  if (p.aantal === 0) delen.push(t('onderweg.track.geenPauzes'))
  else delen.push(t('onderweg.track.pauzes', { aantal: p.aantal, duur: ritDuur(p.pauzeMs) }))
  return t('onderweg.track.samenvatting', { moment: ritMoment(data.start), delen: delen.join(' · ') })
}

// "3,2" (km, één decimaal, komma).
const km = (meters) => getal(meters / 1000, 1)

// Eén regel samenvatting van een logboek (zoals het logboek: Nederlands).
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

function Onderweg({ pois, summariesById, routePunten, haalSamenvattingen, onRit, standaardVervoer, keuzeMs }) {
  const [vervoer, setVervoer] = useState(() => (VERVOER[standaardVervoer] ? standaardVervoer : STANDAARD_VERVOER))
  // Samenvattingen ophalen vóór de start (0.20.0): { aantal } of null.
  const [ophalen, setOphalen] = useState(null)
  const [ophaalTekst, setOphaalTekst] = useState('')
  const overslaanRef = useRef(null)
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
    keuzeMs,
  })
  // Andere standaard-vervoerwijze in Instellingen (0.22.0): meteen overnemen,
  // behalve tijdens een rit.
  useEffect(() => {
    if (!actief && VERVOER[standaardVervoer]) setVervoer(standaardVervoer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standaardVervoer])

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
    setTrackMelding(t('onderweg.track.weggegooid'))
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
        await Share.share({ title: naam, files: [geschreven.uri], dialogTitle: t('onderweg.track.opslaanTitel') })
        setTrackMelding(t('onderweg.track.aangeboden', { naam }))
      } else {
        const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }))
        const link = document.createElement('a')
        link.href = url
        link.download = naam
        document.body.appendChild(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setTrackMelding(t('onderweg.track.opgeslagen', { naam }))
      }
    } catch (err) {
      const bericht = err && err.message ? err.message : String(err)
      if (/cancel/i.test(bericht)) {
        setTrackMelding(t('onderweg.track.geannuleerd'))
        return
      }
      setTrackMelding(t('onderweg.track.mislukt', { bericht }))
    }
  }

  // Logboek van de laatste rit (ook van een eerdere app-sessie), opnieuw
  // gelezen telkens als de route stopt.
  const vorigLogboek = useMemo(() => (TEST_ACHTERGROND && !actief ? logboek.laad() : null), [actief])

  const deelLogboek = async () => {
    const tekst = alsTekst(vorigLogboek)
    setLogboekMelding('')
    try {
      await Share.share({ title: 'WikiPoi-logboek', text: tekst, dialogTitle: t('onderweg.logboek.delen') })
    } catch (err) {
      const bericht = err && err.message ? err.message : String(err)
      if (/cancel/i.test(bericht)) return
      try {
        await navigator.clipboard.writeText(tekst)
        setLogboekMelding(t('onderweg.logboek.klembord'))
      } catch {
        setLogboekMelding(t('onderweg.logboek.nietBeschikbaar'))
        setLogboekTonen(true)
      }
    }
  }

  // "Route starten" (0.20.0, R1a): eerst de ontbrekende samenvattingen
  // ophalen (hoogstens 30 s, knop "Nu starten zonder"), dan pas starten.
  // Bij simulatie niet wachten.
  const routeStarten = async () => {
    if (ophalen) return
    setSimMelding('')
    setTrackMelding('')
    setWeggooienVragen(false)
    setWeggegooid(false)
    setOphaalTekst('')
    if (onRit) onRit(new Set(pois.map((p) => p.id)))
    let uitkomst = null
    if (!simulatieGekozen && haalSamenvattingen && zonderSamenvatting > 0) {
      setOphalen({ aantal: zonderSamenvatting })
      uitkomst = await ophalenVoorStart({
        aantal: zonderSamenvatting,
        haal: haalSamenvattingen,
        online: typeof navigator === 'undefined' || navigator.onLine !== false,
        overslaan: new Promise((ok) => {
          overslaanRef.current = ok
        }),
      })
      overslaanRef.current = null
      setOphalen(null)
      setOphaalTekst(ophaalMelding(uitkomst) || '')
    }
    start()
    const regel = ophaalLogregel(uitkomst)
    if (regel) logboek.noteer('info', regel)
    if (ECO_BIJ_START) setEcoOpen(true)
  }

  const nuStartenZonder = () => {
    if (overslaanRef.current) overslaanRef.current()
  }

  const routeStoppen = () => {
    setEcoOpen(false)
    setOphaalTekst('')
    stop()
    if (onRit) onRit(null)
  }

  const naarVolgendePoi = () => {
    setSimMelding(simVolgendePoi() ? '' : t('onderweg.sim.geenVolgende'))
  }

  // Eigen POI's (CSV) hebben geen samenvatting nodig.
  const zonderSamenvatting = pois.filter((p) => !p.eigen && !(p.id in (summariesById || {}))).length

  const testenZichtbaar = simulatieMogelijk || achtergrondKeuze || (TEST_ACHTERGROND && vorigeTrack) || vorigLogboek

  return (
    <>
      <p className="muted">{t('onderweg.uitleg')}</p>
      {zonderSamenvatting > 0 && !actief && !ophalen && (
        <p className="muted">{t('onderweg.eerstOphalen', { aantal: zonderSamenvatting })}</p>
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
            {t('onderweg.vervoerKnop', { vervoer: t(`vervoer.${key}`), straal: v.straal })}
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
          {t('onderweg.trackOpnemen')}
        </label>
      )}
      <button
        type="button"
        className={actief ? 'btn btn-pink btn-wide' : 'btn btn-green btn-wide'}
        onClick={actief ? routeStoppen : routeStarten}
        disabled={!!ophalen}
      >
        {actief
          ? t('onderweg.stoppen')
          : ophalen
            ? t('onderweg.ophalen', { aantal: ophalen.aantal })
            : t(simulatieGekozen ? 'onderweg.simulatieStarten' : 'onderweg.routeStarten', { aantal: pois.length })}
      </button>
      {ophalen && (
        <button
          type="button"
          className="btn btn-indigo btn-small"
          style={{ marginTop: '8px' }}
          onClick={nuStartenZonder}
        >
          {t('onderweg.nuZonder')}
        </button>
      )}
      {ophaalTekst && (
        <p className="muted" style={{ marginTop: '8px' }}>
          {ophaalTekst}
        </p>
      )}
      {actief && achtergrondGekozen && (
        <p className="muted" style={{ marginTop: '8px' }}>
          {t('onderweg.achtergrondActief', { melding: t('gps.melding') })}
        </p>
      )}
      {actief && (
        <button
          type="button"
          className="btn btn-blue btn-wide"
          style={{ marginTop: '8px' }}
          onClick={() => setEcoOpen(true)}
        >
          {t('onderweg.ecoScherm')}
        </button>
      )}
      {actief && simStatus && (
        <>
          <p className="muted" style={{ marginTop: '8px' }}>
            {t('onderweg.sim.status', {
              km: km(simStatus.meters),
              lengte: km(simStatus.lengte),
              snelheid: SIM_SNELHEID_KMU[vervoer],
              versnelling: simStatus.versnelling,
            })}
            {simStatus.gepauzeerd ? t('onderweg.sim.gepauzeerd') : ''}
            {simStatus.klaar ? t('onderweg.sim.einde') : ''}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className="btn btn-indigo btn-small"
              disabled={simStatus.klaar}
              onClick={simPauze}
            >
              {simStatus.gepauzeerd ? t('onderweg.sim.verder') : t('onderweg.sim.pauze')}
            </button>
            <button
              type="button"
              className="btn btn-indigo btn-small"
              disabled={simStatus.klaar}
              onClick={naarVolgendePoi}
            >
              {t('onderweg.sim.volgende')}
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
      {fout && <p className="error">{t(fout.sleutel, fout.params)}</p>}
      {actief && !positie && !fout && <p className="muted">{t('onderweg.wachtGps')}</p>}
      {actief && positie && (
        <p className="muted">
          {t('onderweg.gpsStatus', {
            nauwkeurigheid: Number.isFinite(positie.nauwkeurigheid) ? Math.round(positie.nauwkeurigheid) : '?',
            richting: rijrichting === null ? t('onderweg.richtingOnbekend') : `${Math.round(rijrichting)}°`,
            voorgelezen: aantalVoorgelezen,
            aantal: pois.length,
          })}
        </p>
      )}
      {actief && trackOpnemen && (
        <p className="muted">
          {trackGepauzeerd
            ? t('onderweg.track.gepauzeerd')
            : t('onderweg.track.opgenomen', { afstand: formatAfstand(lengteLijnen(trackLijn)) })}
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
          {t('onderweg.voorlezen', { naam: nuAanHetVoorlezen })}{' '}
          <button type="button" className="btn btn-indigo btn-small" onClick={stopVoorlezen}>
            {t('onderweg.stil')}
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
                  {poi.klok !== null ? t('onderweg.opUur', { uur: poi.klok }) : ''})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {later.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <p className="muted">{t('onderweg.later', { aantal: later.length })}</p>
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
              <span className="muted">{t('onderweg.track.weggooienVraag')}</span>
              <button type="button" className="btn btn-pink btn-small" onClick={gooiTrackWeg}>
                {t('onderweg.track.weggooienJa')}
              </button>
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => setWeggooienVragen(false)}
              >
                {t('onderweg.track.weggooienNee')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="btn btn-green btn-small" onClick={deelTrack}>
                {t('onderweg.track.opslaan')}
              </button>
              <button
                type="button"
                className="btn btn-indigo btn-small"
                onClick={() => {
                  setTrackMelding('')
                  setWeggooienVragen(true)
                }}
              >
                {t('onderweg.track.weggooien')}
              </button>
            </div>
          )}
        </div>
      )}
      {trackMelding && <p className="muted">{trackMelding}</p>}
      {testenZichtbaar && (
        <details style={{ marginTop: '16px' }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            {t('onderweg.test.titel')}
          </summary>
          <div style={{ marginTop: '8px' }}>
            {actief && (simulatieMogelijk || achtergrondKeuze) && (
              <p className="muted">{t('onderweg.test.eerstStoppen')}</p>
            )}
            {simulatieMogelijk && !actief && (
              <label
                className="muted"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <input type="checkbox" checked={simAan} onChange={(e) => setSimAan(e.target.checked)} />
                {t('onderweg.test.simulatie')}
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
                {t('onderweg.test.achtergrond')}
              </label>
            )}
            {TEST_ACHTERGROND && vorigeTrack && vorigeTrack.ruw && vorigeTrack.ruw.length > 0 && (
              <p className="muted">
                {t('onderweg.test.filter', {
                  posities: vorigeTrack.gefilterd.length,
                  metingen: vorigeTrack.ruw.length,
                  nauwkeurigheid: vorigeTrackTelling.nauwkeurigheid,
                  sprong: vorigeTrackTelling.sprong,
                })}
              </p>
            )}
            {vorigLogboek && (
              <>
                <p className="muted">
                  {t('onderweg.test.logboek', { samenvatting: logboekSamenvatting(vorigLogboek) })}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <button type="button" className="btn btn-indigo btn-small" onClick={deelLogboek}>
                    {t('onderweg.logboek.delen')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-indigo btn-small"
                    aria-pressed={logboekTonen}
                    onClick={() => setLogboekTonen((v) => !v)}
                  >
                    {logboekTonen ? t('onderweg.logboek.verbergen') : t('onderweg.logboek.tonen')}
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
