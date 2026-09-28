/**
 * Onderweg.jsx
 *
 * Inhoud van stap 7 "Onderweg": keuze vervoerwijze, route starten/stoppen,
 * GPS-status, voorleesstatus en de dichtstbijzijnde POI's met afstand,
 * klokrichting en triggerstraal. Tik op een POI om hem direct te laten
 * voorlezen (handig om thuis te testen).
 *
 * Eco-scherm (bouwstap 4): zwart scherm dat aan blijft en bij een trigger de
 * POI toont; openen met de knop "Eco-scherm", sluiten met 3× tikken.
 * ECO_BIJ_START = true opent het meteen bij "Route starten" (productie).
 */
import { useState } from 'react'
import { useOnderweg, VERVOER, STANDAARD_VERVOER } from './useOnderweg.js'
import EcoScherm from './EcoScherm.jsx'
import { formatAfstand } from './geo.js'
import { getCategoryStyle } from '../components/poi-icons.js'

// Productie: true = eco-scherm meteen bij "Route starten". Testfase: false,
// dan blijft de lijst zichtbaar en open je het eco-scherm met de knop.
const ECO_BIJ_START = false

function Onderweg({ pois, summariesById }) {
  const [vervoer, setVervoer] = useState(STANDAARD_VERVOER)
  const [ecoOpen, setEcoOpen] = useState(false)
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
  } = useOnderweg(pois, { vervoer, samenvattingen: summariesById, eco: ecoOpen })

  const routeStarten = () => {
    start()
    if (ECO_BIJ_START) setEcoOpen(true)
  }

  const routeStoppen = () => {
    setEcoOpen(false)
    stop()
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
      <button
        type="button"
        className={actief ? 'btn btn-pink btn-wide' : 'btn btn-green btn-wide'}
        onClick={actief ? routeStoppen : routeStarten}
      >
        {actief ? 'Route stoppen' : `Route starten (${pois.length} POI's)`}
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
          onSluiten={() => setEcoOpen(false)}
        />
      )}
    </>
  )
}

export default Onderweg
