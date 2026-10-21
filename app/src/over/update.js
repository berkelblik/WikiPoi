/**
 * update.js
 *
 * Updatecontrole (0.22.0, onderwerp 5, keuzes D3 en E1). WikiPoi vraagt bij
 * GitHub de laatste releases op (releases?per_page=10, dus ook
 * pre-releases zoals 0.30.0-beta; 'releases/latest' slaat die over),
 * neemt de hoogste versie die geen concept is en vergelijkt die volgens
 * semver met de eigen versie (0.30.0-beta < 0.30.0).
 *
 * - Handmatig: knop "Controleren op update" in het instellingenscherm.
 * - Automatisch (uit te zetten): bij het opstarten, hoogstens één keer per
 *   AUTO_INTERVAL_MS en alleen met internet; meldt alleen een nieuwe versie.
 *
 * WikiPoi downloadt zelf geen APK: de melding opent de Release-pagina in de
 * browser van de telefoon. Puur op controleer() na (fetch meegeven), zodat
 * het in Node te testen is (test-update.js).
 */

export const RELEASES_URL = 'https://api.github.com/repos/berkelblik/WikiPoi/releases?per_page=10'
export const RELEASES_PAGINA = 'https://github.com/berkelblik/WikiPoi/releases'
export const LAATSTE_SLEUTEL = 'wikipoi.updateControle'
export const AUTO_INTERVAL_MS = 24 * 60 * 60 * 1000
export const TIMEOUT_MS = 15000

/** 'v0.30.0-beta.2' → { kern: [0, 30, 0], pre: ['beta', 2] }, anders null. */
export function leesVersie(tekst) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(String(tekst || '').trim())
  if (!m) return null
  const pre = m[4] ? m[4].split('.').map((d) => (/^\d+$/.test(d) ? Number(d) : d)) : []
  return { kern: [Number(m[1]), Number(m[2]), Number(m[3])], pre }
}

/** Semver-vergelijking: < 0 als a ouder is dan b, 0 gelijk, > 0 nieuwer. */
export function vergelijkVersies(a, b) {
  const va = typeof a === 'string' ? leesVersie(a) : a
  const vb = typeof b === 'string' ? leesVersie(b) : b
  if (!va || !vb) return 0
  for (let i = 0; i < 3; i++) {
    if (va.kern[i] !== vb.kern[i]) return va.kern[i] - vb.kern[i]
  }
  // Zonder pre-release is nieuwer dan met (0.30.0 > 0.30.0-beta).
  if (va.pre.length === 0 || vb.pre.length === 0) return vb.pre.length - va.pre.length
  for (let i = 0; i < Math.max(va.pre.length, vb.pre.length); i++) {
    const x = va.pre[i]
    const y = vb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (x === y) continue
    const xn = typeof x === 'number'
    const yn = typeof y === 'number'
    if (xn && yn) return x - y
    if (xn) return -1
    if (yn) return 1
    return x < y ? -1 : 1
  }
  return 0
}

/** Hoogste release die geen concept is: { versie, url, prerelease } of null. */
export function kiesNieuwste(releases) {
  let beste = null
  ;(Array.isArray(releases) ? releases : []).forEach((r) => {
    if (!r || r.draft) return
    const v = leesVersie(r.tag_name)
    if (!v) return
    if (!beste || vergelijkVersies(v, beste.v) > 0) {
      beste = {
        v,
        versie: String(r.tag_name).trim().replace(/^v/, ''),
        url: r.html_url || RELEASES_PAGINA,
        prerelease: Boolean(r.prerelease),
      }
    }
  })
  if (!beste) return null
  return { versie: beste.versie, url: beste.url, prerelease: beste.prerelease }
}

/**
 * Uitkomst van een controle voor de eigen versie:
 *   { soort: 'nieuw', versie, url, prerelease }
 *   { soort: 'actueel', versie }   (hoogste release is niet nieuwer)
 *   { soort: 'geen' }              (nog geen release gepubliceerd)
 */
export function beoordeel(releases, eigenVersie) {
  const n = kiesNieuwste(releases)
  if (!n) return { soort: 'geen' }
  if (vergelijkVersies(n.versie, eigenVersie) > 0) return { soort: 'nieuw', ...n }
  return { soort: 'actueel', versie: n.versie }
}

/** Mag de automatische controle nu? (hoogstens één keer per interval) */
export function autoControleNodig(laatsteMs, nuMs, intervalMs = AUTO_INTERVAL_MS) {
  if (!Number.isFinite(laatsteMs) || laatsteMs > nuMs) return true
  return nuMs - laatsteMs >= intervalMs
}

function standaardOpslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export function leesLaatste(opslag = standaardOpslag()) {
  try {
    const t = opslag ? Number(opslag.getItem(LAATSTE_SLEUTEL)) : NaN
    return Number.isFinite(t) && t > 0 ? t : null
  } catch {
    return null
  }
}

export function bewaarLaatste(ms, opslag = standaardOpslag()) {
  try {
    if (opslag) opslag.setItem(LAATSTE_SLEUTEL, String(ms))
  } catch {
    // niet erg
  }
}

/**
 * Releases ophalen en beoordelen. Geeft de uitkomst van beoordeel(), of
 * { soort: 'fout', tekst } bij geen verbinding of een fout van GitHub.
 */
export async function controleer(eigenVersie, { fetchFn = globalThis.fetch, timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof fetchFn !== 'function') return { soort: 'fout', tekst: 'geen verbinding mogelijk', code: 'geenFetch' }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  try {
    const resp = await fetchFn(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl ? ctrl.signal : undefined,
    })
    if (!resp || !resp.ok) {
      const status = resp ? resp.status : '?'
      const wachten = status === 403 || status === 429
      return {
        soort: 'fout',
        tekst: wachten ? 'GitHub vraagt even te wachten' : `GitHub gaf fout ${status}`,
        // Voor de vertaling (0.23.0): inst.update.reden.<code>.
        code: wachten ? 'wachten' : 'status',
        status,
      }
    }
    return beoordeel(await resp.json(), eigenVersie)
  } catch {
    return { soort: 'fout', tekst: 'geen verbinding met GitHub', code: 'verbinding' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
