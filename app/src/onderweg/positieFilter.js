/**
 * positieFilter.js
 *
 * Filter voor GPS-posities in stap 8 "Onderweg" (0.18.0). Aanleiding: bij
 * een testrit versprong de pointer regelmatig van de werkelijke plek. Zelfde
 * aanpak als EuroPoi-AndroidLite v1.6.0 (src/hooks/useLocation.js:
 * nauwkeurigheid ≤ 25 m, gemiddelde over 5 metingen), aangevuld met een
 * terugval en een sprongfilter. 0.19.1 (F2): grens 35 m, omdat de Poco
 * bij de testrit van 17-10 met 25 m 35 % van de metingen weggooide
 * (mediaan van de weggegooide 27 m).
 *
 * A1 Nauwkeurigheid: een meting met een nauwkeurigheid slechter dan
 *    MAX_NAUWKEURIGHEID_M valt af. Is er TERUGVAL_MS lang geen goede meting
 *    geweest, dan wordt de beste meting uit die periode toch genomen, mits
 *    niet slechter dan TERUGVAL_MAX_M (anders zou de pointer onder bomen of
 *    met het scherm uit blijven stilstaan).
 * A2 Sprong: een meting die vanaf de vorige geaccepteerde meting een
 *    onmogelijke snelheid vergt (per vervoerwijze, MAX_SNELHEID_KMU, met de
 *    nauwkeurigheid van beide metingen als marge) valt af. Komen er
 *    SPRONG_ACCEPTEREN zulke metingen achter elkaar, dan was de vorige meting
 *    fout: de nieuwe wordt geaccepteerd en het gemiddelde begint opnieuw.
 * A3 Gemiddelde: de getoonde positie is het gemiddelde van de laatste
 *    BUFFER_GROOTTE geaccepteerde metingen (vloeiender, loopt bij 20 km/u
 *    zo'n 10 m achter).
 *
 * Puur (geen React, geen Capacitor), zodat het in Node te testen is
 * (test-positieFilter.js).
 *
 * Gebruik:
 *   const f = maakPositieFilter({ maxSnelheidKmu: 60 })
 *   const r = f.verwerk({ lat, lng, nauwkeurigheid, tijd })
 *   r.status: 'geaccepteerd' | 'nauwkeurigheid' | 'sprong' | 'dubbel'
 *   r.punt (alleen bij 'geaccepteerd'): { lat, lng, nauwkeurigheid, tijd },
 *     het gemiddelde; r.terugval / r.sprongGeaccepteerd geven aan waarom.
 */
import { afstand } from './geo.js'

export const MAX_NAUWKEURIGHEID_M = 35
export const TERUGVAL_MS = 10000
export const TERUGVAL_MAX_M = 100
export const SPRONG_ACCEPTEREN = 3
export const BUFFER_GROOTTE = 5

// Hoogste geloofwaardige snelheid per vervoerwijze (km/u).
export const MAX_SNELHEID_KMU = {
  wandelaar: 15,
  fietser: 60,
  motorrijder: 200,
}

const isGetal = (x) => typeof x === 'number' && Number.isFinite(x)

export function maakPositieFilter({
  maxSnelheidKmu = MAX_SNELHEID_KMU.fietser,
  maxNauwkeurigheidM = MAX_NAUWKEURIGHEID_M,
  terugvalMs = TERUGVAL_MS,
  terugvalMaxM = TERUGVAL_MAX_M,
  sprongAccepteren = SPRONG_ACCEPTEREN,
  bufferGrootte = BUFFER_GROOTTE,
} = {}) {
  let snelheid = maxSnelheidKmu
  let vorige = null // laatste geaccepteerde (ruwe) meting
  let laatsteRuw = null // laatste ontvangen meting (voor dubbelen)
  let buffer = []
  let sindsTijd = null // begin van de periode zonder geaccepteerde meting
  let besteSlechte = null // beste afgewezen meting (≤ terugvalMaxM) in die periode
  let sprongenOpRij = 0
  let tellers = leeg()

  function leeg() {
    return { geaccepteerd: 0, nauwkeurigheid: 0, sprong: 0, terugval: 0, sprongGeaccepteerd: 0, dubbel: 0 }
  }

  function gemiddelde(meting) {
    buffer.push(meting)
    if (buffer.length > bufferGrootte) buffer.shift()
    const n = buffer.length
    const som = buffer.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
    return { lat: som.lat / n, lng: som.lng / n, nauwkeurigheid: meting.nauwkeurigheid, tijd: meting.tijd }
  }

  // Past de meting bij de vorige geaccepteerde, gegeven de snelheid?
  function isSprong(m) {
    if (!vorige) return false
    const d = afstand(vorige, m)
    const dt = Math.max(1, (m.tijd - vorige.tijd) / 1000)
    const marge = (isGetal(vorige.nauwkeurigheid) ? vorige.nauwkeurigheid : 0) +
      (isGetal(m.nauwkeurigheid) ? m.nauwkeurigheid : 0)
    return d > (snelheid / 3.6) * dt + marge
  }

  function accepteer(m, extra) {
    vorige = m
    sindsTijd = m.tijd
    besteSlechte = null
    sprongenOpRij = 0
    tellers.geaccepteerd += 1
    return { status: 'geaccepteerd', punt: gemiddelde(m), ...extra }
  }

  function verwerk(invoer) {
    if (!invoer || !isGetal(invoer.lat) || !isGetal(invoer.lng)) return null
    const m = {
      lat: invoer.lat,
      lng: invoer.lng,
      nauwkeurigheid: isGetal(invoer.nauwkeurigheid) ? invoer.nauwkeurigheid : NaN,
      tijd: isGetal(invoer.tijd) ? invoer.tijd : Date.now(),
    }
    // Dezelfde meting twee keer (watchPosition én opvraging): negeren.
    if (laatsteRuw && laatsteRuw.tijd === m.tijd && laatsteRuw.lat === m.lat && laatsteRuw.lng === m.lng) {
      tellers.dubbel += 1
      return { status: 'dubbel' }
    }
    laatsteRuw = m
    if (sindsTijd === null) sindsTijd = m.tijd

    // A1: nauwkeurigheid (onbekend telt als goed, bijv. in de browser).
    let kandidaat = m
    let terugval = false
    if (isGetal(m.nauwkeurigheid) && m.nauwkeurigheid > maxNauwkeurigheidM) {
      if (m.nauwkeurigheid <= terugvalMaxM && (!besteSlechte || m.nauwkeurigheid <= besteSlechte.nauwkeurigheid)) {
        besteSlechte = m
      }
      if (m.tijd - sindsTijd < terugvalMs || !besteSlechte) {
        tellers.nauwkeurigheid += 1
        return { status: 'nauwkeurigheid' }
      }
      kandidaat = besteSlechte
      terugval = true
      if (kandidaat !== m) tellers.nauwkeurigheid += 1
    }

    // A2: sprong.
    if (isSprong(kandidaat)) {
      sprongenOpRij += 1
      if (sprongenOpRij < sprongAccepteren) {
        tellers.sprong += 1
        return { status: 'sprong' }
      }
      buffer = []
      tellers.sprongGeaccepteerd += 1
      if (terugval) tellers.terugval += 1
      return accepteer(kandidaat, { sprongGeaccepteerd: true, terugval })
    }
    if (terugval) tellers.terugval += 1
    return accepteer(kandidaat, { terugval })
  }

  return {
    verwerk,
    zetMaxSnelheid(kmu) {
      if (isGetal(kmu) && kmu > 0) snelheid = kmu
    },
    tellers: () => ({ ...tellers }),
    reset() {
      vorige = null
      laatsteRuw = null
      buffer = []
      sindsTijd = null
      besteSlechte = null
      sprongenOpRij = 0
      tellers = leeg()
    },
  }
}

/** Korte tekst voor het logboek. */
export function tellersTekst(t) {
  if (!t) return ''
  const weg = t.nauwkeurigheid + t.sprong
  return (
    `${t.geaccepteerd} geaccepteerd, ${weg} weggegooid (${t.nauwkeurigheid} nauwkeurigheid, ${t.sprong} sprong)` +
    `, ${t.terugval} via terugval, ${t.sprongGeaccepteerd} sprong na ${SPRONG_ACCEPTEREN}× geaccepteerd` +
    (t.dubbel ? `, ${t.dubbel} dubbel` : '')
  )
}
