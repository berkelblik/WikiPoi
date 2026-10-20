/**
 * Instellingen.jsx
 *
 * Instellingenscherm (0.22.0, onderwerp 5, keuze A1): geopend met ⚙ in de
 * kopregel, venster zoals "Over WikiPoi" (z-index 2200). Standaardwaarden
 * (B1–B5), "Standaardwaarden terugzetten" (B6) en de updatecontrole (D3).
 * Waarden en opslag: instellingen.js; updatecontrole: update.js.
 */
import { createPortal } from 'react-dom'
import {
  CORRIDOR_MAX_METERS,
  CORRIDOR_MIN_METERS,
  CORRIDOR_STEP_METERS,
  EIGEN_MAX_KEUZES,
  KEUZE_S_KEUZES,
  VERVOER_KEUZES,
  kmTekst,
} from '../instellingen.js'
import './Over.css'

const VERVOER_LABEL = { wandelaar: 'Wandelaar', fietser: 'Fietser', motorrijder: 'Motorrijder' }

// "20-10 14:05"
function momentTekst(ms) {
  const d = new Date(ms)
  const twee = (n) => String(n).padStart(2, '0')
  return `${twee(d.getDate())}-${twee(d.getMonth() + 1)} ${twee(d.getHours())}:${twee(d.getMinutes())}`
}

function uitkomstTekst(u, versie) {
  if (!u) return ''
  if (u.soort === 'nieuw') return `Versie ${u.versie} is beschikbaar${u.prerelease ? ' (bèta)' : ''}.`
  if (u.soort === 'actueel') return `Je hebt de nieuwste versie (${versie}).`
  if (u.soort === 'geen') return 'Nog geen release gepubliceerd.'
  return `Controleren lukte niet: ${u.tekst}.`
}

function Keuzeknoppen({ waarden, waarde, tekst, onKies }) {
  return (
    <div className="inst-knoppen">
      {waarden.map((w) => (
        <button
          key={w}
          type="button"
          className={w === waarde ? 'btn btn-yellow btn-small' : 'btn btn-indigo btn-small'}
          aria-pressed={w === waarde}
          onClick={() => onKies(w)}
        >
          {tekst(w)}
        </button>
      ))}
    </div>
  )
}

function Instellingen({ instellingen, versie, update, onWijzig, onStandaard, onControleer, onSluiten }) {
  const i = instellingen
  return createPortal(
    <div
      className="over-achtergrond"
      role="dialog"
      aria-modal="true"
      aria-labelledby="inst-titel"
      onClick={onSluiten}
    >
      <div className="over-venster over-venster-lang" onClick={(e) => e.stopPropagation()}>
        <h2 id="inst-titel" className="over-titel">
          Instellingen
        </h2>

        <h3 className="over-kop">Grens eigen POI's</h3>
        <p className="over-klein">
          Eigen POI's doen mee tot deze afstand van de route (bij "altijd melden"). Buiten de corridor worden
          ze alleen bij de POI zelf gemeld.
        </p>
        <Keuzeknoppen
          waarden={EIGEN_MAX_KEUZES}
          waarde={i.eigenMaxM}
          tekst={kmTekst}
          onKies={(w) => onWijzig({ eigenMaxM: w })}
        />

        <h3 className="over-kop">Corridor bij de start</h3>
        <label className="inst-schuif">
          <span>{i.corridorM} m aan weerszijden van de route</span>
          <input
            type="range"
            min={CORRIDOR_MIN_METERS}
            max={CORRIDOR_MAX_METERS}
            step={CORRIDOR_STEP_METERS}
            value={i.corridorM}
            onChange={(e) => onWijzig({ corridorM: Number(e.target.value) })}
          />
        </label>

        <label className="inst-vinkje">
          <input
            type="checkbox"
            checked={i.ookZonderTekst}
            onChange={() => onWijzig({ ookZonderTekst: !i.ookZonderTekst })}
          />{' '}
          Ook POI's zonder tekst standaard meenemen
        </label>

        <h3 className="over-kop">Vervoerwijze bij de start</h3>
        <Keuzeknoppen
          waarden={VERVOER_KEUZES}
          waarde={i.vervoer}
          tekst={(w) => VERVOER_LABEL[w]}
          onKies={(w) => onWijzig({ vervoer: w })}
        />

        <h3 className="over-kop">Afteltijd keuzevenster</h3>
        <p className="over-klein">Zo lang blijft het venster staan als er meer POI's tegelijk zijn.</p>
        <Keuzeknoppen
          waarden={KEUZE_S_KEUZES}
          waarde={i.keuzeS}
          tekst={(w) => `${w} s`}
          onKies={(w) => onWijzig({ keuzeS: w })}
        />

        <h3 className="over-kop">Updates</h3>
        <label className="inst-vinkje">
          <input
            type="checkbox"
            checked={i.updateAuto}
            onChange={() => onWijzig({ updateAuto: !i.updateAuto })}
          />{' '}
          Bij het opstarten op updates controleren (hoogstens één keer per dag)
        </label>
        <div className="inst-knoppen">
          <button
            type="button"
            className={update.bezig ? 'btn btn-indigo btn-small is-disabled' : 'btn btn-indigo btn-small'}
            disabled={update.bezig}
            onClick={onControleer}
          >
            {update.bezig ? 'Bezig met controleren…' : 'Controleren op update'}
          </button>
        </div>
        {update.uitkomst && (
          <p className="inst-uitkomst" role="status">
            {uitkomstTekst(update.uitkomst, versie)}{' '}
            {update.uitkomst.soort === 'nieuw' && (
              <a href={update.uitkomst.url} target="_blank" rel="noopener noreferrer">
                Bekijken
              </a>
            )}
          </p>
        )}
        <p className="over-klein">
          Deze versie: {versie}
          {update.laatsteMs ? ` · laatst gecontroleerd ${momentTekst(update.laatsteMs)}` : ''}
        </p>

        <div className="over-knoppen">
          <button type="button" className="btn btn-indigo btn-small" onClick={onStandaard}>
            Standaardwaarden terugzetten
          </button>
          <button type="button" className="btn btn-green btn-small" onClick={onSluiten}>
            Sluiten
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default Instellingen
