/**
 * Instellingen.jsx
 *
 * Instellingenscherm (0.22.0, onderwerp 5, keuze A1): geopend met ⚙ in de
 * kopregel, venster zoals "Over WikiPoi" (z-index 2200). Standaardwaarden
 * (B1–B5), "Standaardwaarden terugzetten" (B6) en de updatecontrole (D3).
 * Waarden en opslag: instellingen.js; updatecontrole: update.js.
 * 0.23.0: taal van de bediening (onderwerp 6, B1) bovenaan.
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
import { t, BEDIENINGS_TALEN, EIGEN_NAAM } from '../vertaal.js'
import './Over.css'

// "20-10 14:05"
function momentTekst(ms) {
  const d = new Date(ms)
  const twee = (n) => String(n).padStart(2, '0')
  return `${twee(d.getDate())}-${twee(d.getMonth() + 1)} ${twee(d.getHours())}:${twee(d.getMinutes())}`
}

function uitkomstTekst(u, versie) {
  if (!u) return ''
  if (u.soort === 'nieuw') return t('inst.update.nieuw', { versie: u.versie, beta: u.prerelease ? t('update.beta') : '' })
  if (u.soort === 'actueel') return t('inst.update.actueel', { versie })
  if (u.soort === 'geen') return t('inst.update.geen')
  return t('inst.update.fout', { reden: u.code ? t(`inst.update.reden.${u.code}`, { status: u.status }) : u.tekst })
}

// Keuzes voor de taal: Automatisch en de talen waarin de bediening er is.
const TAAL_KNOPPEN = ['auto', ...BEDIENINGS_TALEN]

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
          {t('kop.instellingen')}
        </h2>

        <h3 className="over-kop">{t('inst.taal')}</h3>
        <Keuzeknoppen
          waarden={TAAL_KNOPPEN}
          waarde={TAAL_KNOPPEN.includes(i.taal) ? i.taal : 'auto'}
          tekst={(w) => (w === 'auto' ? t('inst.taalAuto') : EIGEN_NAAM[w])}
          onKies={(w) => onWijzig({ taal: w })}
        />

        <h3 className="over-kop">{t('inst.grens')}</h3>
        <p className="over-klein">{t('inst.grensUitleg')}</p>
        <Keuzeknoppen
          waarden={EIGEN_MAX_KEUZES}
          waarde={i.eigenMaxM}
          tekst={kmTekst}
          onKies={(w) => onWijzig({ eigenMaxM: w })}
        />

        <h3 className="over-kop">{t('inst.corridor')}</h3>
        <label className="inst-schuif">
          <span>{t('inst.corridorWaarde', { meters: i.corridorM })}</span>
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
          {t('inst.zonderTekst')}
        </label>

        <h3 className="over-kop">{t('inst.vervoer')}</h3>
        <Keuzeknoppen
          waarden={VERVOER_KEUZES}
          waarde={i.vervoer}
          tekst={(w) => t(`vervoer.${w}`)}
          onKies={(w) => onWijzig({ vervoer: w })}
        />

        <h3 className="over-kop">{t('inst.afteltijd')}</h3>
        <p className="over-klein">{t('inst.afteltijdUitleg')}</p>
        <Keuzeknoppen
          waarden={KEUZE_S_KEUZES}
          waarde={i.keuzeS}
          tekst={(w) => `${w} s`}
          onKies={(w) => onWijzig({ keuzeS: w })}
        />

        <h3 className="over-kop">{t('inst.updates')}</h3>
        <label className="inst-vinkje">
          <input
            type="checkbox"
            checked={i.updateAuto}
            onChange={() => onWijzig({ updateAuto: !i.updateAuto })}
          />{' '}
          {t('inst.updateAuto')}
        </label>
        <div className="inst-knoppen">
          <button
            type="button"
            className={update.bezig ? 'btn btn-indigo btn-small is-disabled' : 'btn btn-indigo btn-small'}
            disabled={update.bezig}
            onClick={onControleer}
          >
            {update.bezig ? t('inst.update.bezig') : t('inst.update.knop')}
          </button>
        </div>
        {update.uitkomst && (
          <p className="inst-uitkomst" role="status">
            {uitkomstTekst(update.uitkomst, versie)}{' '}
            {update.uitkomst.soort === 'nieuw' && (
              <a href={update.uitkomst.url} target="_blank" rel="noopener noreferrer">
                {t('alg.bekijken')}
              </a>
            )}
          </p>
        )}
        <p className="over-klein">
          {t('inst.dezeVersie', { versie })}
          {update.laatsteMs ? t('inst.laatst', { moment: momentTekst(update.laatsteMs) }) : ''}
        </p>

        <div className="over-knoppen">
          <button type="button" className="btn btn-indigo btn-small" onClick={onStandaard}>
            {t('inst.standaard')}
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

export default Instellingen
