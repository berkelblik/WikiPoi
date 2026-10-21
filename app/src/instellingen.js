/**
 * instellingen.js
 *
 * Instellingen van WikiPoi (0.22.0, onderwerp 5, keuzes B1–B6 en C1):
 * standaardwaarden die bij elke start gelden en in het instellingenscherm
 * (⚙ in de kopregel) te wijzigen zijn. Alles staat als JSON onder één
 * sleutel (INSTELLINGEN_SLEUTEL); een ontbrekende of ongeldige waarde valt
 * terug op de standaard. De oudere losse sleutels (zoekbron, eigenMelden,
 * taalkeuze, track opnemen) blijven daarnaast bestaan.
 *
 * Puur (geen React, geen Capacitor), zodat het in Node te testen is
 * (test-instellingen.js).
 *
 *   eigenMaxM      Grens eigen POI's bij 'altijd melden' (B1): 500/1000/2000/5000 m
 *   ookZonderTekst Standaard "ook POI's zonder tekst" (B2)
 *   corridorM      Standaard corridorbreedte (B3): 50–500 m, stappen van 25 m
 *   vervoer        Standaard vervoerwijze stap 8 (B4)
 *   keuzeS         Afteltijd keuzevenster (B5): 5/10/15/20 s
 *   updateAuto     Automatisch op updates controleren (D3)
 *   taal           Taal van de bediening (0.23.0, onderwerp 6, B1): 'auto'
 *                  (telefoon) of 'nl'/'en'/'de'/'fr'
 */
import { EIGEN_MAX_METERS } from './zoekbron.js'
import { TAAL_INSTELLINGEN, getal } from './vertaal.js'

export const INSTELLINGEN_SLEUTEL = 'wikipoi.instellingen'

export const CORRIDOR_MIN_METERS = 50
export const CORRIDOR_MAX_METERS = 500
export const CORRIDOR_STEP_METERS = 25

export const EIGEN_MAX_KEUZES = [500, 1000, 2000, 5000]
export const KEUZE_S_KEUZES = [5, 10, 15, 20]
// Gelijk aan de sleutels van VERVOER in onderweg/useOnderweg.js (dat bestand
// is niet in Node te importeren).
export const VERVOER_KEUZES = ['wandelaar', 'fietser', 'motorrijder']

export const STANDAARD_INSTELLINGEN = Object.freeze({
  eigenMaxM: EIGEN_MAX_METERS,
  ookZonderTekst: false,
  corridorM: 250,
  vervoer: 'fietser',
  keuzeS: 10,
  updateAuto: true,
  taal: 'auto',
})

function standaardOpslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function geldigeCorridor(m) {
  return (
    Number.isFinite(m) &&
    m >= CORRIDOR_MIN_METERS &&
    m <= CORRIDOR_MAX_METERS &&
    (m - CORRIDOR_MIN_METERS) % CORRIDOR_STEP_METERS === 0
  )
}

/** Elke waarde controleren; wat ontbreekt of niet klopt wordt de standaard. */
export function normaliseer(ruw) {
  const r = ruw && typeof ruw === 'object' ? ruw : {}
  const s = STANDAARD_INSTELLINGEN
  return {
    eigenMaxM: EIGEN_MAX_KEUZES.includes(r.eigenMaxM) ? r.eigenMaxM : s.eigenMaxM,
    ookZonderTekst: typeof r.ookZonderTekst === 'boolean' ? r.ookZonderTekst : s.ookZonderTekst,
    corridorM: geldigeCorridor(r.corridorM) ? r.corridorM : s.corridorM,
    vervoer: VERVOER_KEUZES.includes(r.vervoer) ? r.vervoer : s.vervoer,
    keuzeS: KEUZE_S_KEUZES.includes(r.keuzeS) ? r.keuzeS : s.keuzeS,
    updateAuto: typeof r.updateAuto === 'boolean' ? r.updateAuto : s.updateAuto,
    taal: TAAL_INSTELLINGEN.includes(r.taal) ? r.taal : s.taal,
  }
}

export function leesInstellingen(opslag = standaardOpslag()) {
  try {
    const tekst = opslag ? opslag.getItem(INSTELLINGEN_SLEUTEL) : null
    return normaliseer(tekst ? JSON.parse(tekst) : null)
  } catch {
    return normaliseer(null)
  }
}

/** Bewaart (genormaliseerd) en geeft terug wat bewaard is. */
export function bewaarInstellingen(inst, opslag = standaardOpslag()) {
  const n = normaliseer(inst)
  try {
    if (opslag) opslag.setItem(INSTELLINGEN_SLEUTEL, JSON.stringify(n))
  } catch {
    // Bewaren is een gemak, geen voorwaarde.
  }
  return n
}

/** "Standaardwaarden terugzetten" (B6). */
export function standaardTerug(opslag = standaardOpslag()) {
  try {
    if (opslag) opslag.removeItem(INSTELLINGEN_SLEUTEL)
  } catch {
    // niet erg
  }
  return normaliseer(null)
}

/** 500 → "0,5 km" (Engels: "0.5 km"), 2000 → "2 km". */
export function kmTekst(meters) {
  return `${getal(meters / 1000)} km`
}
