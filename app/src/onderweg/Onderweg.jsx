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
 * 0.18.0: keuze "Straal: Automatisch / Alleen vervoerwijze" (bewaard in
 * localStorage wikipoi.straalModus); de triggerstraal staat als cirkel op
 * de kaart, de afgelegde track als groene lijn. Na afloop "Track delen
 * (GPX)" (track.js): gefilterde en ruwe track plus de weggegooide metingen.
 */
import { useState, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import {
  useOnderweg,
  VERVOER,
  STANDAARD_VERVOER,
  STRAAL_MODI,
  STANDAARD_STRAAL_MODUS,
  triggerStraal,
} from './useOnderweg.js'
import { track as trackOpslag, alsGpx, bestandsnaam, lengteVan, tellingVan } from './track.js'
import { achtergrondMogelijk } from './positieBron.js'
import { logboek, analyseer, alsTekst, duurTekst, tijdTekst } from './logboek.js'
import EcoScherm from './EcoScherm.jsx'
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

const STRAAL_SLEUTEL = 'wikipoi.straalModus'

function laadStraalModus() {
  try {
    const v = localStorage.getItem(STRAAL_SLEUTEL)
    return v && STRAAL_MODI[v] ? v : STANDAARD_STRAAL_MODUS
  } catch {
    return STANDAARD_STRAAL_MODUS
  }
}

function bewaarStraalModus(v) {
  try {
    localStorage.setItem(STRAAL_SLEUTEL, v)
  } catch {
    // Geen opslag: de keuze geldt alleen deze sessie.
  }
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
  const [straalModus, setStraalModus] = useState(laadStraalModus)
  const [trackMelding, setTrackMelding] = useState('')
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
  } = useOnderweg(pois, {
    vervoer,
    samenvattingen: summariesById,
    eco: ecoOpen,
    simulatie: simulatieGekozen ? routePunten : null,
    achtergrond: achtergrondGekozen,
    straalModus,
  })

  // Triggerstraal per POI rond het triggerpunt, voor de kaart.
  const straalCirkels = useMemo(
    () =>
      pois.map((p) => {
        const t = p.snapPoint || p
        return {
          id: p.id,
          lat: t.lat,
          lng: t.lng,
          straal: triggerStraal(p, vervoer, straalModus),
          voorgelezen: !!voorgelezen[p.id],
        }
      }),
    [pois, vervoer, straalModus, voorgelezen]
  )

  const kiesStraalModus = (v) => {
    setStraalModus(v)
    bewaarStraalModus(v)
  }

  // Track van de laatste rit (ook van een eerdere app-sessie).
  const vorigeTrack = useMemo(() => (!actief ? trackOpslag.laad() : null), [actief])
  const vorigeTrackTelling = vorigeTrack ? tellingVan(vorigeTrack) : null

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
        await Share.share({ title: naam, files: [geschreven.uri], dialogTitle: 'Track delen of opslaan' })
        setTrackMelding(`"${naam}" is aangeboden om te delen of op te slaan.`)
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
        setTrackMelding('Delen geannuleerd.')
        return
      }
      setTrackMelding('Track delen mislukt: ' + bericht)
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

  return (
    <>
      <p className="muted">
        Volgt je GPS-positie langs de route en leest elke POI één keer voor zodra je in de buurt
        bent. Afstand = tot het punt op de route dat het dichtst bij de POI ligt. Triggerstraal:
        {straalModus === 'vervoer'
          ? ' alleen de straal van de vervoerwijze.'
          : ' automatisch (straal van de vervoerwijze, of afstand POI–route + 50 m als dat meer is).'}
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
            {v.label} ({v.straal} m)
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
        <span className="muted">Straal:</span>
        {Object.entries(STRAAL_MODI).map(([key, m]) => (
          <button
            key={key}
            type="button"
            className={key === straalModus ? 'btn btn-yellow btn-small' : 'btn btn-indigo btn-small'}
            aria-pressed={key === straalModus}
            onClick={() => kiesStraalModus(key)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {simulatieMogelijk && !actief && (
        <label
          className="muted"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
        >
          <input type="checkbox" checked={simAan} onChange={(e) => setSimAan(e.target.checked)} />
          Simulatie: rit langs de route zonder GPS (testmodus)
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
                  {poi.klok !== null ? `, op ${poi.klok} uur` : ''}, straal{' '}
                  {formatAfstand(poi.straal)})
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {vorigeTrack && vorigeTrack.ruw && vorigeTrack.ruw.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <p className="muted">
            Track laatste rit: {formatAfstand(lengteVan(vorigeTrack, afstand))},{' '}
            {vorigeTrack.gefilterd.length} posities; metingen {vorigeTrack.ruw.length}, waarvan
            weggegooid {vorigeTrackTelling.nauwkeurigheid} (nauwkeurigheid) en{' '}
            {vorigeTrackTelling.sprong} (sprong).
          </p>
          <button type="button" className="btn btn-indigo btn-small" onClick={deelTrack}>
            Track delen (GPX)
          </button>
          {trackMelding && <p className="muted">{trackMelding}</p>}
        </div>
      )}
      {vorigLogboek && (
        <div style={{ marginTop: '16px' }}>
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
        </div>
      )}
      {actief && ecoOpen && (
        <EcoScherm
          poi={ecoPoi}
          positie={positie}
          rijrichting={rijrichting}
          samenvatting={ecoPoi && summariesById ? summariesById[ecoPoi.id] || null : null}
          laatstePoi={laatstePoi}
          onHerhaal={herhaal}
          onSluiten={() => setEcoOpen(false)}
        />
      )}
    </>
  )
}

export default Onderweg
