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

const poisTekst = (n) => (n === 1 ? "1 POI" : `${n} POI's`)

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
      return r.zonder > 0
        ? `${poisTekst(r.zonder)} zonder samenvatting: korte omschrijving.`
        : null
    case 'offline':
      return `Geen verbinding: ${poisTekst(r.aantal)} met korte omschrijving.`
    case 'fout':
      return `Samenvattingen ophalen lukte niet: ${poisTekst(r.aantal)} met korte omschrijving.`
    case 'te-lang':
      return `Samenvattingen nog niet binnen na ${Math.round(MAX_WACHT_MS / 1000)} s; ze worden onderweg nog gebruikt zodra ze er zijn.`
    case 'overgeslagen':
      return 'Gestart zonder te wachten; samenvattingen worden onderweg nog gebruikt zodra ze er zijn.'
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
