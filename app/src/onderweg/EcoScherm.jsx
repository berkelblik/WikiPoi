/**
 * EcoScherm.jsx
 *
 * Eco-scherm voor stap 7 "Onderweg" (bouwstap 4), naar het voorbeeld van
 * EuroPoi (src/components/EcoScreen.jsx). Egaal zwart zolang er geen POI
 * aan de beurt is: zuinig op een OLED-scherm, en het scherm blijft aan
 * (keep-awake), zodat de GPS in de WebView blijft werken.
 *
 * Zodra een POI wordt getriggerd (useOnderweg geeft hem als ecoPoi), toont
 * het scherm: een wijzer naar de POI ten opzichte van de rijrichting, de
 * afstand tot de POI, de klokrichting, de naam, de pluscode en de foto uit
 * de samenvatting (stap 5), met bronvermelding.
 *
 * Tikken: 1× = fietsbel, 3× snel = eco-scherm sluiten.
 */
import { useEffect, useRef } from 'react'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { afstand, peiling, relatieveHoek, klokRichting } from './geo.js'
import { pluscode } from './pluscode.js'
import { belNu } from './spreek.js'
import './EcoScherm.css'

// Tijd waarbinnen tikken als één reeks telt (zelfde als EuroPoi).
const TIK_VENSTER_MS = 400

// Bron van een foto uit de Wikipedia-samenvatting: bestanden op Commons
// staan onder /wikipedia/commons/, lokale bestanden onder /wikipedia/<taal>/.
// Voorlopige vermelding; maker en licentie volgen in een latere stap.
function fotoBron(url) {
  return /\/wikipedia\/commons\//.test(url) ? 'Foto: Wikimedia Commons' : 'Foto: Wikipedia'
}

// Afstand als getal en eenheid, zoals in EuroPoi ("12" "M", "1,4" "KM").
function afstandDelen(meters) {
  if (!Number.isFinite(meters)) return { getal: '?', eenheid: '' }
  if (meters < 1000) return { getal: String(Math.round(meters)), eenheid: 'M' }
  return { getal: (meters / 1000).toFixed(1).replace('.', ','), eenheid: 'KM' }
}

const STREEPJES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

function EcoScherm({ poi, positie, rijrichting, samenvatting, onSluiten }) {
  const tikken = useRef(0)
  const tikTimer = useRef(null)

  // Scherm aan houden zolang het eco-scherm open is.
  useEffect(() => {
    KeepAwake.keepAwake().catch((err) => console.warn('WikiPoi keep-awake mislukt:', err))
    return () => {
      KeepAwake.allowSleep().catch(() => {})
    }
  }, [])

  useEffect(
    () => () => {
      if (tikTimer.current) clearTimeout(tikTimer.current)
    },
    []
  )

  const tik = () => {
    tikken.current += 1
    if (tikTimer.current) clearTimeout(tikTimer.current)
    if (tikken.current >= 3) {
      tikken.current = 0
      onSluiten()
      return
    }
    tikTimer.current = setTimeout(() => {
      if (tikken.current === 1) belNu()
      tikken.current = 0
    }, TIK_VENSTER_MS)
  }

  let inhoud = null
  if (poi && positie) {
    const richtingPoi = peiling(positie, poi)
    const bekend = rijrichting !== null && Number.isFinite(richtingPoi)
    const hoek = bekend ? relatieveHoek(rijrichting, richtingPoi) : 0
    const klok = bekend ? klokRichting(rijrichting, richtingPoi) : null
    const { getal, eenheid } = afstandDelen(afstand(positie, poi))
    const code = pluscode(poi.lat, poi.lng)
    const foto =
      samenvatting && samenvatting.summary ? samenvatting.summary.thumbnailUrl || null : null

    inhoud = (
      <div className="eco-inhoud">
        <svg className="eco-klok" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="92" className="eco-klok-rand" />
          {STREEPJES.map((graden) => (
            <line
              key={graden}
              x1="100"
              y1={graden % 90 === 0 ? 14 : 16}
              x2="100"
              y2={graden % 90 === 0 ? 30 : 24}
              className={graden % 90 === 0 ? 'eco-streep eco-streep-groot' : 'eco-streep'}
              transform={`rotate(${graden} 100 100)`}
            />
          ))}
          {bekend && (
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="36"
              className="eco-wijzer"
              transform={`rotate(${hoek} 100 100)`}
            />
          )}
          <circle cx="100" cy="100" r="7" className="eco-as" />
        </svg>

        <div className="eco-afstand">
          <span className="eco-afstand-getal">{getal}</span>
          <span className="eco-afstand-eenheid">{eenheid}</span>
        </div>

        <div className="eco-richting">
          <div className="eco-uur">
            <span className="eco-uur-getal">{klok === null ? '?' : klok}</span>
            <span className="eco-uur-label">uur</span>
          </div>
        </div>

        <div className="eco-kaart">
          <p className="eco-naam">{poi.label}</p>
          {code && <p className="eco-pluscode">{code}</p>}
          {foto && (
            <figure className="eco-foto">
              <img
                src={foto}
                alt=""
                onError={(e) => {
                  // Geen verbinding of foto weg: foto en vermelding verbergen.
                  e.currentTarget.parentElement.style.display = 'none'
                }}
              />
              <figcaption>{fotoBron(foto)}</figcaption>
            </figure>
          )}
        </div>

        <p className="eco-hint">1× tikken = bel · 3× snel tikken = sluiten</p>
      </div>
    )
  }

  return (
    <div className="eco-scherm" onClick={tik} role="presentation">
      {inhoud}
    </div>
  )
}

export default EcoScherm
