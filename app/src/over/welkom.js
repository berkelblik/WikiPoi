/**
 * welkom.js
 *
 * Wanneer de melding bij eerste gebruik ("Begrepen") verschijnt (0.21.0,
 * keuzes A1/A3): bij de eerste start en opnieuw bij elke nieuwe
 * hoofdversie (0.x → 1.x). "Begrepen" wordt onthouden in localStorage;
 * lukt lezen of opslaan niet, dan verschijnt de melding gewoon nog eens.
 * Puur, zodat het in Node te testen is (test-welkom.js).
 */

export const WELKOM_SLEUTEL = 'wikipoi-welkom'

/** Hoofdversie: '0.21.0' → '0', '1.2.3' → '1'. */
export function hoofdversie(versie) {
  const m = /^(\d+)\./.exec(String(versie || ''))
  return m ? m[1] : '0'
}

function standaardOpslag() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

/** Moet de melding getoond worden voor deze versie? */
export function welkomTonen(versie, opslag = standaardOpslag()) {
  try {
    return !opslag || opslag.getItem(WELKOM_SLEUTEL) !== hoofdversie(versie)
  } catch {
    return true
  }
}

/** "Begrepen": onthouden voor deze hoofdversie. */
export function welkomBegrepen(versie, opslag = standaardOpslag()) {
  try {
    if (opslag) opslag.setItem(WELKOM_SLEUTEL, hoofdversie(versie))
  } catch {
    // niet erg: de melding komt dan bij de volgende start nog eens
  }
}

/** "Welkomstmelding opnieuw tonen" (Over WikiPoi). */
export function welkomVergeten(opslag = standaardOpslag()) {
  try {
    if (opslag) opslag.removeItem(WELKOM_SLEUTEL)
  } catch {
    // niet erg
  }
}
