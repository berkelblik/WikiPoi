/**
 * samenvattingVoorStart.js
 *
 * Ontbrekende samenvattingen ophalen bij "Route starten" (0.20.0, keuzes
 * R1a, R2, R3): eerst ophalen, hoogstens MAX_WACHT_MS wachten, met een
 * knop "Nu starten zonder"; zonder verbinding of bij een fout start de route
 * toch. Het ophalen zelf (App.jsx) loopt na een time-out of overslaan gewoon
 * door; wat later binnenkomt wordt onderweg nog gebruikt.
 *
 * Puur (zonder React), zodat het in Node te testen is:
 * test-samenvattingVoorStart.js.
 */
import { t } from '../vertaal.js'

/** Zo lang (ms) wacht "Route starten" hoogstens op de samenvattingen (R2). */
export const MAX_WACHT_MS = 30000

/**
 * Samenvattingen ophalen vóór de start.
 *
 * @param {object} o
 * @param {number} o.aantal - aantal POI's zonder samenvatting
 * @param {() => Promise<{opgehaald:number, zonder:number}>} o.haal - ophalen
 * @param {boolean} [o.online] - false: niet proberen
 * @param {number} [o.maxMs] - hoogstens zo lang wachten
 * @param {Promise<void>} [o.overslaan] - vervult als de gebruiker niet wil wachten
 * @param {(fn:Function, ms:number) => any} [o.wachtFn] - setTimeout (te vervangen in tests)
 * @returns {Promise<{status:'niets'|'klaar'|'offline'|'fout'|'te-lang'|'overgeslagen',
 *   aantal:number, opgehaald?:number, zonder?:number, fout?:string}>}
 */
export async function ophalenVoorStart({
  aantal,
  haal,
  online = true,
  maxMs = MAX_WACHT_MS,
  overslaan = null,
  wachtFn = setTimeout,
}) {
  if (!aantal || aantal <= 0) return { status: 'niets', aantal: 0 }
  if (!online) return { status: 'offline', aantal }
  let timer = null
  const kandidaten = [
    Promise.resolve()
      .then(haal)
      .then(
        (r) => ({ status: 'klaar', aantal, opgehaald: r.opgehaald, zonder: r.zonder }),
        (err) => ({ status: 'fout', aantal, fout: String((err && err.message) || err) })
      ),
    new Promise((ok) => {
      timer = wachtFn(() => ok({ status: 'te-lang', aantal }), maxMs)
    }),
  ]
  if (overslaan) kandidaten.push(overslaan.then(() => ({ status: 'overgeslagen', aantal })))
  const r = await Promise.race(kandidaten)
  if (timer !== null && typeof clearTimeout === 'function' && wachtFn === setTimeout) clearTimeout(timer)
  return r
}


/**
 * Melding op het scherm na het ophalen (null = geen melding nodig).
 *
 * @param {object} r - uitkomst van ophalenVoorStart
 * @returns {string|null}
 */
export function ophaalMelding(r) {
  if (!r) return null
  switch (r.status) {
    case 'klaar':
      return r.zonder > 0 ? t('ophalen.zonder', { aantal: r.zonder }) : null
    case 'offline':
      return t('ophalen.offline', { aantal: r.aantal })
    case 'fout':
      return t('ophalen.fout', { aantal: r.aantal })
    case 'te-lang':
      return t('ophalen.teLang', { s: Math.round(MAX_WACHT_MS / 1000) })
    case 'overgeslagen':
      return t('ophalen.overgeslagen')
    default:
      return null
  }
}

/**
 * Logboekregel (soort 'info') na het ophalen, of null.
 *
 * @param {object} r - uitkomst van ophalenVoorStart
 * @returns {string|null}
 */
export function ophaalLogregel(r) {
  if (!r || r.status === 'niets') return null
  if (r.status === 'klaar') return `samenvattingen: ${r.opgehaald} opgehaald, ${r.zonder} zonder`
  if (r.status === 'fout') return `samenvattingen: mislukt (${r.fout})`
  const reden = { offline: 'geen verbinding', 'te-lang': 'nog bezig na 30 s', overgeslagen: 'niet gewacht' }
  return `samenvattingen: ${reden[r.status]} (${r.aantal} ontbrekend)`
}
