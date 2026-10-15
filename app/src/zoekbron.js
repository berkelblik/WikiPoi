/**
 * zoekbron.js
 *
 * Keuzes voor de zoekbronnen en de eigen POI's (0.15.0), los van App.jsx
 * zodat ze zonder React en zonder netwerk te testen zijn
 * (test-zoekbron.js).
 *
 * - Zoekbron (stap 2, bovenaan): waar WikiPoi zoekt.
 *     'wiki'  — Wikidata/Wikipedia (+ eventueel OpenStreetMap)
 *     'eigen' — alleen de eigen POI's uit de CSV (geen internet nodig)
 *     'beide' — allebei (standaard; zo werkte WikiPoi tot 0.14.0)
 *   Zonder ingelezen CSV is de bron altijd 'wiki'.
 *
 * - Eigen POI's melden (stap 2, bij de CSV): wanneer een eigen POI meedoet.
 *     'altijd'   — tot EIGEN_MAX_METERS van de route, ook buiten de corridor;
 *                  gemeld op het dichtstbijzijnde punt van de route
 *                  (standaard; zo werkte WikiPoi tot 0.14.0)
 *     'corridor' — alleen binnen de corridor, net als gevonden POI's
 *
 * Beide keuzes worden bewaard (localStorage) en na een herstart
 * teruggezet. Lukt bewaren of lezen niet, dan gelden de standaardwaarden.
 */

export const BRONNEN = ['wiki', 'eigen', 'beide']
export const STANDAARD_BRON = 'beide'

export const EIGEN_MELDEN = ['altijd', 'corridor']
export const STANDAARD_EIGEN_MELDEN = 'altijd'

// Eigen POI's doen bij 'altijd' mee tot deze afstand van de route. Verder
// weg blijven ze zichtbaar op de kaart en in de lijst (vervaagd), maar doen
// ze niet mee: geen export, geen aankondiging in Onderweg (de triggerstraal
// zou anders afstand + 50 m worden).
export const EIGEN_MAX_METERS = 2000

const SLEUTEL_BRON = 'wikipoi.zoekbron'
const SLEUTEL_EIGEN_MELDEN = 'wikipoi.eigenMelden'

/** Bron die werkelijk geldt: zonder eigen POI's altijd 'wiki'. */
export function effectieveBron(bron, heeftEigen) {
  if (!heeftEigen) return 'wiki'
  return BRONNEN.includes(bron) ? bron : STANDAARD_BRON
}

/** Doen de gevonden (Wikidata/OSM) POI's mee bij deze bron? */
export function zoektWiki(bron) {
  return bron !== 'eigen'
}

/** Doen de eigen POI's mee bij deze bron? */
export function gebruiktEigen(bron) {
  return bron !== 'wiki'
}

/**
 * Tot welke afstand van de route een POI meedoet.
 * @param {boolean} eigen - eigen POI?
 * @param {string} eigenMelden - 'altijd' of 'corridor'
 * @param {number} corridorMeters - breedte corridor (slider stap 5)
 */
export function grensMeters(eigen, eigenMelden, corridorMeters) {
  if (eigen && eigenMelden !== 'corridor') return EIGEN_MAX_METERS
  return corridorMeters
}

function opslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

function lees(sleutel, toegestaan, standaard) {
  try {
    const s = opslag()
    const waarde = s ? s.getItem(sleutel) : null
    return toegestaan.includes(waarde) ? waarde : standaard
  } catch {
    return standaard
  }
}

function bewaar(sleutel, waarde) {
  try {
    const s = opslag()
    if (s) s.setItem(sleutel, waarde)
  } catch {
    // Bewaren is een gemak, geen voorwaarde.
  }
}

export function leesBron() {
  return lees(SLEUTEL_BRON, BRONNEN, STANDAARD_BRON)
}

export function bewaarBron(bron) {
  if (BRONNEN.includes(bron)) bewaar(SLEUTEL_BRON, bron)
}

export function leesEigenMelden() {
  return lees(SLEUTEL_EIGEN_MELDEN, EIGEN_MELDEN, STANDAARD_EIGEN_MELDEN)
}

export function bewaarEigenMelden(keuze) {
  if (EIGEN_MELDEN.includes(keuze)) bewaar(SLEUTEL_EIGEN_MELDEN, keuze)
}
