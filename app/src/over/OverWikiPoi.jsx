/**
 * OverWikiPoi.jsx
 *
 * Scherm "Over WikiPoi" (0.21.0, onderwerp 4, keuze B1): versie, licentie,
 * broncode, gegevensbronnen, korte privacy-uitleg en een knop om de
 * melding bij eerste gebruik opnieuw te tonen. Teksten: bronnen.js.
 */
import { createPortal } from 'react-dom'
import { BRONCODE_URL, BRONNEN, LICENTIE } from './bronnen.js'
import { t } from '../vertaal.js'
import { tr } from '../rijk.jsx'
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
          {t('kop.over')}
        </h2>
        <p>{tr('over.versie', { versie })}</p>

        <h3 className="over-kop">{t('over.licentie')}</h3>
        <p>
          {LICENTIE.houder}.{' '}
          <a href={LICENTIE.url} target="_blank" rel="noopener noreferrer">
            {LICENTIE.naam}
          </a>
          . {t('over.licentieUitleg')}
        </p>
        <p>
          {t('over.broncode')}{' '}
          <a href={BRONCODE_URL} target="_blank" rel="noopener noreferrer">
            github.com/berkelblik/WikiPoi
          </a>
        </p>

        <h3 className="over-kop">{t('over.bronnen')}</h3>
        <ul className="over-lijst over-bronnen">
          {BRONNEN.map((b) => (
            <li key={b.naam}>
              <strong>{b.naamSleutel ? t(b.naamSleutel) : b.naam}</strong> — {t(`bron.${b.sleutel}`)}.{' '}
              <a href={b.url} target="_blank" rel="noopener noreferrer">
                {b.licentieSleutel ? t(b.licentieSleutel) : b.licentie}
              </a>
            </li>
          ))}
        </ul>

        <h3 className="over-kop">{t('over.privacy')}</h3>
        <p>{t('over.privacyKort')}</p>

        <div className="over-knoppen">
          <button type="button" className="btn btn-indigo btn-small" onClick={onWelkomOpnieuw}>
            {t('over.welkomOpnieuw')}
          </button>
          <button type="button" className="btn btn-green btn-small" onClick={onSluiten}>
            {t('alg.sluiten')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default OverWikiPoi
