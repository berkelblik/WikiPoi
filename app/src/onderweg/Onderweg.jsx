/**
 * Onderweg.jsx
 *
 * Inhoud van stap 7 "Onderweg": keuze vervoerwijze, route starten/stoppen,
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
 */
import { useState } from 'react'
import { useOnderweg, VERVOER, STANDAARD_VERVOER } from './useOnderweg.js'
import EcoScherm from './EcoScherm.jsx'
import { SIM_SNELHEID_KMU, SIM_VERSNELLINGEN } from './simulatie.js'
import { formatAfstand } from './geo.js'
import { getCategoryStyle } from '../components/poi-icons.js'
import RouteMap from '../components/RouteMap.jsx'

// Productie: true = eco-scherm meteen bij "Route starten". Testfase: false,
// dan blijft de lijst zichtbaar en open je het eco-scherm met de knop.
const ECO_BIJ_START = false

// Testfase: true = keuze "Simulatie" zichtbaar. Productie: false.
const TEST_SIMULATIE = true

// Hoogte van de kaart in stap 7 (kleiner dan bij stap 4, zodat de lijst
// met dichtstbijzijnde POI's eronder in beeld blijft).
const KAART_HOOGTE = '260px'

// "3,2" (km, één decimaal, komma).
const km = (meters) => (meters / 1000).toFixed(1).replace('.', ',')

function Onderweg({ pois, summariesById, routePunten }) {
  const [vervoer, setVervoer] = useState(STANDAARD_VERVOER)
  const [ecoOpen, setEcoOpen] = useState(false)
  const [simAan, setSimAan] = useState(false)
  const [simMelding, setSimMelding] = useState('')
  const simulatieMogelijk =
    TEST_SIMULATIE && Array.isArray(routePunten) && routePunten.length >= 2
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
  } = useOnderweg(pois, {
    vervoer,
    samenvattingen: summariesById,
    eco: ecoOpen,
    simulatie: simulatieMogelijk && simAan ? routePunten : null,
  })

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

  const zonderSamenvatting = pois.filter((p) => !(p.id in (summariesById || {}))).length

  return (
    <>
      <p className="muted">
        Volgt je GPS-positie langs de route en leest elke POI één keer voor zodra je in de buurt
        bent. Afstand = tot het punt op de route dat het dichtst bij de POI ligt. Triggerstraal:
        automatisch (straal van de vervoerwijze, of afstand POI–route + 50 m als dat meer is).
      </p>
      {zonderSamenvatting > 0 && (
        <p className="muted">
          Tip: voor {zonderSamenvatting} POI's is nog geen samenvatting opgehaald (stap 5); die
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
      {simulatieMogelijk && !actief && (
        <label
          className="muted"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
        >
          <input type="checkbox" checked={simAan} onChange={(e) => setSimAan(e.target.checked)} />
          Simulatie: rit langs de route zonder GPS (testmodus)
        </label>
      )}
      <button
        type="button"
        className={actief ? 'btn btn-pink btn-wide' : 'btn btn-green btn-wide'}
        onClick={actief ? routeStoppen : routeStarten}
      >
        {actief
          ? 'Route stoppen'
          : `${simulatieMogelijk && simAan ? 'Simulatie' : 'Route'} starten (${pois.length} POI's)`}
      </button>
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
              <span
                aria-hidden="true"
                className="category-dot"
                style={{ background: getCategoryStyle(poi.categoryKey).color }}
              />
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
