/**
 * Welkom.jsx
 *
 * Melding bij eerste gebruik (0.21.0, onderwerp 4, keuzes A1/A3): over de
 * app heen, met één knop "Begrepen". Wanneer hij verschijnt: welkom.js.
 */
import { createPortal } from 'react-dom'
import { t } from '../vertaal.js'
import { tr } from '../rijk.jsx'
import './Over.css'

function Welkom({ onBegrepen }) {
  return createPortal(
    <div className="over-achtergrond" role="dialog" aria-modal="true" aria-labelledby="welkom-titel">
      <div className="over-venster">
        <h2 id="welkom-titel" className="over-titel">
          {t('welkom.titel')}
        </h2>
        <p>{t('welkom.intro')}</p>
        <ul className="over-lijst">
          <li>{tr('welkom.verkeer')}</li>
          <li>{tr('welkom.eco')}</li>
          <li>{tr('welkom.locatie')}</li>
          <li>{tr('welkom.internet')}</li>
          <li>{tr('welkom.beta')}</li>
        </ul>
        <p className="over-klein">{t('welkom.meer')}</p>
        <button type="button" className="btn btn-green btn-wide" onClick={onBegrepen}>
          {t('welkom.begrepen')}
        </button>
      </div>
    </div>,
    document.body
  )
}

export default Welkom
