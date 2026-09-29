/**
 * logboek.js
 *
 * Diagnoselogboek voor stap 7 "Onderweg" (proef achtergrond-GPS). Houdt per
 * rit bij wanneer er posities binnenkwamen, of de app zichtbaar was of op de
 * achtergrond stond (scherm uit, andere app), wanneer een POI triggerde en
 * wanneer bel en voorlezen begonnen, eindigden of mislukten.
 *
 * Doel: zwart op wit zien waar Android (of het batterijbeheer van de
 * fabrikant) ingrijpt. Daarvoor ook een "hartslag": een timer die elke
 * HARTSLAG_MS een tijdstip noteert. Een groot gat in de hartslag betekent
 * dat JavaScript in de WebView stil lag, ook als er geen posities kwamen.
 *
 * Het logboek staat in localStorage (OPSLAG_SLEUTEL), zodat het ook na het
 * afsluiten of wegvallen van de app nog te bekijken en te delen is. Er wordt
 * steeds één rit bewaard: de laatste.
 *
 * Opbouw:
 * - maakLogboek(): het logboek zelf, zonder browserafhankelijkheden
 *   (netwerkloos te testen, zie test-logboek.js);
 * - koppelBrowser(logboek): zichtbaarheid, hartslag en periodiek opslaan;
 * - analyseer(data) en alsTekst(data): samenvatting en deelbare tekst.
 */

export const OPSLAG_SLEUTEL = 'wikipoi-logboek'
export const HARTSLAG_MS = 10000
const OPSLAAN_MS = 15000
const MAX_POSITIES = 20000
const MAX_GEBEURTENISSEN = 3000

// localStorage als die er is (browser/WebView), anders niets.
function standaardOpslag() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    // Geen toegang tot localStorage.
  }
  return null
}

export function maakLogboek({ nu = () => Date.now(), opslag = standaardOpslag() } = {}) {
  let data = null

  function opslaan() {
    if (!opslag || !data) return
    try {
      opslag.setItem(OPSLAG_SLEUTEL, JSON.stringify(data))
    } catch (err) {
      console.warn('WikiPoi logboek opslaan mislukt:', err)
    }
  }

  function noteer(soort, tekst = '') {
    if (!data) return
    if (data.gebeurtenissen.length >= MAX_GEBEURTENISSEN) return
    data.gebeurtenissen.push([nu(), soort, String(tekst)])
  }

  return {
    // Nieuwe rit: het vorige logboek wordt vervangen.
    begin(bron, toestel = '') {
      data = {
        versie: 1,
        bron,
        toestel,
        start: nu(),
        eind: null,
        posities: [], // [ontvangen, vertraging ms, nauwkeurigheid m]
        hartslagen: [], // tijdstippen
        gebeurtenissen: [], // [tijd, soort, tekst]
      }
      noteer('start', `bron: ${bron}`)
      opslaan()
    },
    noteer(soort, tekst) {
      noteer(soort, tekst)
      // Gebeurtenissen zijn zeldzaam en belangrijk: direct bewaren.
      opslaan()
    },
    // tijd = tijdstip van de meting (van de GPS), nauwkeurigheid in m.
    positie({ tijd, nauwkeurigheid } = {}) {
      if (!data || data.posities.length >= MAX_POSITIES) return
      const ontvangen = nu()
      const vertraging = Number.isFinite(tijd) ? Math.max(0, ontvangen - tijd) : null
      const nauwk = Number.isFinite(nauwkeurigheid) ? Math.round(nauwkeurigheid) : null
      data.posities.push([ontvangen, vertraging, nauwk])
    },
    hartslag() {
      if (!data) return
      data.hartslagen.push(nu())
    },
    stop() {
      if (!data || data.eind) return
      noteer('stop', '')
      data.eind = nu()
      opslaan()
    },
    opslaan,
    actief() {
      return Boolean(data && !data.eind)
    },
    gegevens() {
      return data
    },
    // Laatst bewaarde rit uit de opslag (ook van een eerdere app-sessie).
    laad() {
      if (!opslag) return null
      try {
        const tekst = opslag.getItem(OPSLAG_SLEUTEL)
        if (!tekst) return null
        const geladen = JSON.parse(tekst)
        return geladen && geladen.versie === 1 ? geladen : null
      } catch {
        return null
      }
    },
  }
}

// Zichtbaarheid (scherm aan/uit, andere app op de voorgrond), hartslag en
// periodiek opslaan. Geeft een functie terug die alles weer loskoppelt.
export function koppelBrowser(logboek) {
  if (typeof document === 'undefined') return () => {}
  const stand = () => (document.visibilityState === 'visible' ? 'zichtbaar' : 'verborgen')
  logboek.noteer('scherm', stand())
  const bijWissel = () => {
    logboek.noteer('scherm', stand())
  }
  document.addEventListener('visibilitychange', bijWissel)
  const hartslag = setInterval(() => logboek.hartslag(), HARTSLAG_MS)
  const opslaan = setInterval(() => logboek.opslaan(), OPSLAAN_MS)
  logboek.hartslag()
  return () => {
    document.removeEventListener('visibilitychange', bijWissel)
    clearInterval(hartslag)
    clearInterval(opslaan)
    logboek.opslaan()
  }
}

// Grootste gat tussen opeenvolgende tijdstippen: { ms, na } of null.
function grootsteGat(tijden) {
  let beste = null
  for (let i = 1; i < tijden.length; i++) {
    const ms = tijden[i] - tijden[i - 1]
    if (!beste || ms > beste.ms) beste = { ms, na: tijden[i - 1] }
  }
  return beste
}

// Samenvatting van een rit: aantallen, grootste gaten, vertraging en per
// minuut het aantal posities, hartslagen en de schermstand.
export function analyseer(data) {
  if (!data) return null
  const eind = data.eind || (data.posities.length ? data.posities[data.posities.length - 1][0] : data.start)
  const posTijden = data.posities.map((p) => p[0])
  const vertragingen = data.posities.map((p) => p[1]).filter((v) => Number.isFinite(v))
  const gemVertraging = vertragingen.length
    ? vertragingen.reduce((a, b) => a + b, 0) / vertragingen.length
    : null
  const maxVertraging = vertragingen.length ? Math.max(...vertragingen) : null

  const schermWissels = data.gebeurtenissen.filter((g) => g[1] === 'scherm')
  const standOp = (t) => {
    let stand = null
    schermWissels.forEach((g) => {
      if (g[0] <= t) stand = g[2]
    })
    return stand
  }

  const perMinuut = []
  const eersteMinuut = Math.floor(data.start / 60000) * 60000
  for (let m = eersteMinuut; m <= eind; m += 60000) {
    const binnen = (t) => t >= m && t < m + 60000
    const standen = new Set([standOp(m)])
    schermWissels.forEach((g) => {
      if (binnen(g[0])) standen.add(g[2])
    })
    standen.delete(null)
    perMinuut.push({
      minuut: m,
      posities: posTijden.filter(binnen).length,
      hartslagen: data.hartslagen.filter(binnen).length,
      scherm: standen.size === 0 ? '?' : standen.size > 1 ? 'wisselend' : [...standen][0],
    })
  }

  const telSoort = (soort) => data.gebeurtenissen.filter((g) => g[1] === soort).length
  return {
    duurMs: eind - data.start,
    aantalPosities: data.posities.length,
    grootsteGatPositie: grootsteGat(posTijden),
    grootsteGatHartslag: grootsteGat(data.hartslagen),
    gemVertraging,
    maxVertraging,
    triggers: telSoort('trigger'),
    fouten: data.gebeurtenissen.filter((g) => /fout/.test(g[1])).length,
    perMinuut,
  }
}

const tweeCijfers = (n) => String(n).padStart(2, '0')

export function tijdTekst(ms, metSeconden = true) {
  const d = new Date(ms)
  const hm = `${tweeCijfers(d.getHours())}:${tweeCijfers(d.getMinutes())}`
  return metSeconden ? `${hm}:${tweeCijfers(d.getSeconds())}` : hm
}

function datumTekst(ms) {
  const d = new Date(ms)
  return `${tweeCijfers(d.getDate())}-${tweeCijfers(d.getMonth() + 1)}-${d.getFullYear()}`
}

// "1,4 s"; vanaf 90 s in minuten met één decimaal ("2,5 min").
export function duurTekst(ms) {
  if (!Number.isFinite(ms)) return '?'
  if (ms >= 90000) return `${(ms / 60000).toFixed(1).replace('.', ',')} min`
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

// Deelbare tekst van een rit.
export function alsTekst(data) {
  const a = analyseer(data)
  if (!a) return ''
  const regels = []
  regels.push('WikiPoi-logboek (proef achtergrond-GPS)')
  regels.push(
    `Rit: ${datumTekst(data.start)} ${tijdTekst(data.start)} – ` +
      (data.eind ? tijdTekst(data.eind) : 'niet afgesloten') +
      ` (${duurTekst(a.duurMs)}), bron: ${data.bron}`
  )
  if (data.toestel) regels.push(`Toestel: ${data.toestel}`)
  regels.push(
    `Posities: ${a.aantalPosities}` +
      (a.grootsteGatPositie
        ? `, grootste gat ${duurTekst(a.grootsteGatPositie.ms)} (na ${tijdTekst(a.grootsteGatPositie.na)})`
        : '') +
      (a.gemVertraging !== null
        ? `, vertraging gem. ${duurTekst(a.gemVertraging)}, max. ${duurTekst(a.maxVertraging)}`
        : '')
  )
  regels.push(
    'Hartslag (elke ' +
      duurTekst(HARTSLAG_MS) +
      '): ' +
      (a.grootsteGatHartslag
        ? `grootste gat ${duurTekst(a.grootsteGatHartslag.ms)} (na ${tijdTekst(a.grootsteGatHartslag.na)})`
        : 'geen gegevens')
  )
  regels.push(`Triggers: ${a.triggers}, fouten: ${a.fouten}`)
  regels.push('')
  regels.push('Per minuut (posities, hartslagen, scherm):')
  a.perMinuut.forEach((m) => {
    regels.push(`${tijdTekst(m.minuut, false)}  ${String(m.posities).padStart(3)}  ${String(m.hartslagen).padStart(2)}  ${m.scherm}`)
  })
  regels.push('')
  regels.push('Gebeurtenissen:')
  data.gebeurtenissen.forEach(([t, soort, tekst]) => {
    regels.push(`${tijdTekst(t)}  ${soort}${tekst ? '  ' + tekst : ''}`)
  })
  return regels.join('\n')
}

// Het logboek van de app (één per app-sessie).
export const logboek = maakLogboek()
