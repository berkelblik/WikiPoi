/**
 * Onderweg.jsx
 *
 * Inhoud van stap 7 "Onderweg": keuze vervoerwijze, route starten/stoppen,
 * GPS-status, voorleesstatus en de dichtstbijzijnde POI's met afstand,
 * klokrichting en triggerstraal. Tik op een POI om hem direct te laten
 * voorlezen (handig om thuis te testen).
 *
 * Bouwstap 2 van "Onderweg": nog geen eco-screen of track.
 */
import { useState } from 'react'
import { useOnderweg, VERVOER, STANDAARD_VERVOER } from './useOnderweg.js'
import { formatAfstand } from './geo.js'
import { getCategoryStyle } from '../components/poi-icons.js'

function Onderweg({ pois, summariesById }) {
  const [vervoer, setVervoer] = useState(STANDAARD_VERVOER)
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
  } = useOnderweg(pois, { vervoer, samenvattingen: summariesById })

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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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
        onClick={actief ? stop : start}
      >
        {actief ? 'Route stoppen' : `Route starten (${pois.length} POI's)`}
      </button>
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
    </>
  )
}

export default Onderweg
