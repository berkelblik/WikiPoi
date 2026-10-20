/**
 * OverWikiPoi.jsx
 *
 * Scherm "Over WikiPoi" (0.21.0, onderwerp 4, keuze B1): versie, licentie,
 * broncode, gegevensbronnen, korte privacy-uitleg en een knop om de
 * melding bij eerste gebruik opnieuw te tonen. Teksten: bronnen.js.
 */
import { createPortal } from 'react-dom'
import { BRONCODE_URL, BRONNEN, LICENTIE, PRIVACY_KORT } from './bronnen.js'
import './Over.css'

function OverWikiPoi({ versie, onSluiten, onWelkomOpnieuw }) {
  return createPortal(
    <div
      className="over-achtergrond"
      role="dialog"
      aria-modal="true"
      aria-labelledby="over-titel"
      onClick={onSluiten}
    >
      <div className="over-venster over-venster-lang" onClick={(e) => e.stopPropagation()}>
        <h2 id="over-titel" className="over-titel">
          Over WikiPoi
        </h2>
        <p>
          <strong>Versie {versie}</strong> · bèta
        </p>

        <h3 className="over-kop">Licentie</h3>
        <p>
          {LICENTIE.houder}.{' '}
          <a href={LICENTIE.url} target="_blank" rel="noopener noreferrer">
            {LICENTIE.naam}
          </a>
          . {LICENTIE.uitleg}
        </p>
        <p>
          Broncode:{' '}
          <a href={BRONCODE_URL} target="_blank" rel="noopener noreferrer">
            github.com/berkelblik/WikiPoi
          </a>
        </p>

        <h3 className="over-kop">Bronnen</h3>
        <ul className="over-lijst over-bronnen">
          {BRONNEN.map((b) => (
            <li key={b.naam}>
              <strong>{b.naam}</strong> — {b.wat}.{' '}
              <a href={b.url} target="_blank" rel="noopener noreferrer">
                {b.licentie}
              </a>
            </li>
          ))}
        </ul>

        <h3 className="over-kop">Privacy</h3>
        <p>{PRIVACY_KORT}</p>

        <div className="over-knoppen">
          <button type="button" className="btn btn-indigo btn-small" onClick={onWelkomOpnieuw}>
            Welkomstmelding opnieuw tonen
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

export default OverWikiPoi
