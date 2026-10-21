/**
 * KeuzeVenster.jsx
 *
 * Keuzevenster voor meerdere POI's tegelijk in stap 8 "Onderweg" (0.19.0,
 * poiKeuze.js). Onderaan het scherm, boven de app én boven het eco-scherm
 * (portal in <body>), met grote knoppen zodat je er onderweg met één blik
 * en één tik uit kunt kiezen. Drie soorten:
 *   - 'overlap': twee of meer POI's tegelijk; zonder keuze begint na de
 *     afteltijd de dichtstbijzijnde (de bovenste);
 *   - 'ook': er komt een POI bij terwijl er een wordt voorgelezen; tik =
 *     nu luisteren (onderbreekt), anders volgt hij daarna;
 *   - 'pauze': bij stilstand de POI's uit "Later beluisteren".
 * Tikken in het venster tellen niet mee als tik op het eco-scherm.
 * Bij veel POI's (M1) is het venster hoogstens 70 % van het scherm hoog en
 * scrollt de knoppenlijst.
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t, telwoord } from '../vertaal.js'
import './KeuzeVenster.css'

function titel(soort, aantal) {
  if (soort === 'ook') return t('keuze.titel.ook', { aantal })
  if (soort === 'pauze') return t('keuze.titel.pauze')
  return t('keuze.titel.overlap', { telwoord: telwoord(aantal, true) })
}

function KeuzeVenster({ keuze, onKies, onLater }) {
  const [nu, setNu] = useState(() => Date.now())

  useEffect(() => {
    const iv = setInterval(() => setNu(Date.now()), 500)
    return () => clearInterval(iv)
  }, [])

  if (!keuze || keuze.pois.length === 0) return null
  const { soort, pois, tot } = keuze
  const seconden = Math.max(0, Math.ceil((tot - nu) / 1000))

  let hint = ''
  if (soort === 'overlap') hint = t('keuze.hint.overlap', { s: seconden })
  else if (soort === 'ook') hint = t('keuze.hint.ook')
  else hint = t('keuze.hint.pauze')

  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn()
  }

  return createPortal(
    <div
      className="keuze-venster"
      role="dialog"
      aria-label={titel(soort, pois.length)}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="keuze-titel">{titel(soort, pois.length)}</p>
      <p className="keuze-hint">{hint}</p>
      <div className="keuze-knoppen">
        {pois.map((p, i) => (
          <button
            key={p.id}
            type="button"
            className={soort === 'overlap' && i === 0 ? 'keuze-poi keuze-poi-standaard' : 'keuze-poi'}
            onClick={stop(() => onKies(p.id))}
          >
            ▶ {p.label}
          </button>
        ))}
      </div>
      <button type="button" className="keuze-later" onClick={stop(onLater)}>
        {soort === 'pauze' ? t('alg.sluiten') : soort === 'overlap' ? t('keuze.allemaalLater') : t('alg.later')}
      </button>
    </div>,
    document.body
  )
}

export default KeuzeVenster
