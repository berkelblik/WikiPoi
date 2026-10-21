/**
 * poiKeuze.js
 *
 * Meerdere POI's tegelijk in stap 8 "Onderweg" (0.19.0, keuzes O1–O7).
 * Pure beslisregels (geen React, geen geluid), te testen met
 * test-poiKeuze.js; useOnderweg.js voert de besluiten uit.
 *
 * O1  Overlap = er komt een POI binnen zijn straal terwijl er al een wordt
 *     voorgelezen (of een keuzevenster openstaat), of er komen er twee of
 *     meer tegelijk binnen.
 * O2  Twee of meer tegelijk, niets bezig: één bel, de namen worden genoemd
 *     ("Hier twee bezienswaardigheden: A en B.") en een keuzevenster met een
 *     knop per POI (soort 'overlap').
 *     Komt er een bij terwijl er een wordt voorgelezen: geen bel, het
 *     voorlezen loopt door, het venster toont "Ook hier: …" (soort 'ook').
 * O3  Na KEUZE_MS zonder keuze: 'overlap' → de dichtstbijzijnde (de eerste)
 *     wordt voorgelezen; 'ook' → de POI gaat in de wachtrij.
 * O4  Niet gekozen POI's (bij 'overlap') gaan naar "Later beluisteren".
 * O5  Scherm niet zichtbaar (uit of andere app): geen venster; de
 *     dichtstbijzijnde wordt voorgelezen, de rest gaat naar "Later" (bij
 *     'overlap') of in de wachtrij (bij 'ook').
 * O6  Wachtrij: een POI die aan de beurt komt terwijl je al buiten zijn
 *     straal bent, wordt niet meer voorgelezen maar gaat naar "Later".
 * O7  Pauze (track gepauzeerd) met POI's in "Later" en niets bezig: korte
 *     zin ("Je hebt 2 bezienswaardigheden om te beluisteren.") en een
 *     venster met die POI's (soort 'pauze'); verloopt na PAUZE_KEUZE_MS
 *     zonder iets voor te lezen.
 *
 * Een keuze is { soort: 'overlap' | 'ook' | 'pauze', ids: [id, …], tot? },
 * ids gesorteerd van dichtbij naar ver (bij 'pauze' in de volgorde van
 * "Later"); tot = tijdstip waarop het venster verloopt (zet de hook).
 *
 * Veel POI's (M2, M3): de aankondiging noemt hoogstens AANKONDIGING_MAX
 * namen ("… en nog twee"); komen er POI's bij in een open venster, dan loopt
 * het aftellen door (tot blijft gelijk), zodat het venster niet eindeloos
 * openblijft in een drukke straat.
 *
 * Herhaling pauzevenster (0.19.1, P6): hoogstens één keer per
 * PAUZE_HERHAAL_MS, tenzij er iets nieuws in "Later" staat
 * (magPauzeAanbieden).
 */
import { t, telwoord } from '../vertaal.js'

export const KEUZE_MS = 10000
export const PAUZE_KEUZE_MS = 30000
export const PAUZE_HERHAAL_MS = 5 * 60 * 1000
export const AANKONDIGING_MAX = 3

const leeg = () => ({
  speel: null,
  keuze: null,
  wachtend: [],
  later: [],
  aankondig: false,
  onderbreek: false,
})

/**
 * Nieuwe POI's binnen hun straal (dichtstbij eerst).
 * - bezig: er wordt nu een POI (automatisch) voorgelezen;
 * - keuze: het venster dat openstaat, of null;
 * - zichtbaar: het scherm is te zien (document.visibilityState).
 * Geeft { speel, keuze, wachtend, later, aankondig } terug: speel = id om
 * nu voor te lezen; keuze = nieuw of bijgewerkt venster; wachtend = ids
 * achter in de wachtrij; later = ids naar "Later beluisteren"; aankondig =
 * bel + namen noemen (alleen bij een nieuw 'overlap'-venster).
 */
export function besluitBinnen({ nieuw, bezig = false, keuze = null, zichtbaar = true }) {
  const uit = leeg()
  const ids = (nieuw || []).map((p) => p.id)
  if (ids.length === 0) return uit
  // Venster staat al open (niet 'pauze'): erbij zetten, timer begint opnieuw.
  if (keuze && keuze.soort !== 'pauze') {
    uit.keuze = {
      soort: keuze.soort,
      ids: [...keuze.ids, ...ids.filter((id) => !keuze.ids.includes(id))],
      tot: keuze.tot,
    }
    return uit
  }
  if (bezig) {
    if (zichtbaar) uit.keuze = { soort: 'ook', ids }
    else uit.wachtend = ids
    return uit
  }
  if (ids.length === 1) {
    uit.speel = ids[0]
    return uit
  }
  if (zichtbaar) {
    uit.keuze = { soort: 'overlap', ids }
    uit.aankondig = true
  } else {
    uit.speel = ids[0]
    uit.later = ids.slice(1)
  }
  return uit
}

/** Venster verlopen zonder keuze (O3). */
export function keuzeVerlopen(keuze) {
  const uit = leeg()
  if (!keuze) return uit
  if (keuze.soort === 'overlap') {
    uit.speel = keuze.ids[0] ?? null
    uit.later = keuze.ids.slice(1)
  } else if (keuze.soort === 'ook') {
    uit.wachtend = [...keuze.ids]
  }
  // 'pauze': alleen sluiten; de POI's blijven in "Later".
  return uit
}

/**
 * Gebruiker tikt op een POI in het venster.
 * - 'overlap': die POI voorlezen, de andere naar "Later";
 * - 'ook': het lopende voorlezen onderbreken (de huidige POI gaat naar
 *   "Later", dat doet de hook), deze voorlezen, de andere in de wachtrij;
 * - 'pauze': die POI voorlezen (uit "Later"), de andere blijven in "Later".
 */
export function kiesUit(keuze, id) {
  const uit = leeg()
  if (!keuze || !keuze.ids.includes(id)) return uit
  const anderen = keuze.ids.filter((x) => x !== id)
  uit.speel = id
  if (keuze.soort === 'overlap') uit.later = anderen
  else if (keuze.soort === 'ook') {
    uit.wachtend = anderen
    uit.onderbreek = true
  }
  return uit
}

/**
 * Volgende uit de wachtrij (O6): de eerste die nog binnen zijn straal ligt
 * wordt voorgelezen; wie al buiten de straal is, gaat naar "Later".
 * binnenStraal(id) → true/false (onbekende POI: false).
 * Geeft { speel, later, rest } terug.
 */
export function volgendeUitWachtrij(wachtend, binnenStraal) {
  const later = []
  const rij = [...(wachtend || [])]
  while (rij.length > 0) {
    const id = rij.shift()
    if (binnenStraal(id)) return { speel: id, later, rest: rij }
    later.push(id)
  }
  return { speel: null, later, rest: [] }
}

/**
 * Mag het pauzevenster (O7) nu worden aangeboden (0.19.1, P6)? Hoogstens
 * één keer per PAUZE_HERHAAL_MS, tenzij er sinds het vorige aanbod iets
 * nieuws in "Later" staat. vorige = { tijd, ids } van het vorige aanbod, of
 * null.
 */
export function magPauzeAanbieden({ nu, vorige, later }) {
  if (!vorige || !Number.isFinite(vorige.tijd)) return true
  if (nu - vorige.tijd >= PAUZE_HERHAAL_MS) return true
  const eerder = new Set(vorige.ids || [])
  return (later || []).some((id) => !eerder.has(id))
}

/** Pauzevenster (O7), of null als het niet aan de orde is. */
export function pauzeKeuze({ gepauzeerd, later, bezig = false, keuze = null }) {
  if (!gepauzeerd || bezig || keuze || !later || later.length === 0) return null
  return { soort: 'pauze', ids: [...later] }
}

// Teksten (ook gesproken) in de taal van de bediening (0.23.0, E1).

/** "A", "A en B", "A, B en C". */
export function opsomming(namen) {
  const n = (namen || []).filter(Boolean)
  if (n.length <= 1) return n[0] || ''
  return t('keuze.opsomming', { lijst: n.slice(0, -1).join(', '), laatste: n[n.length - 1] })
}

/**
 * "Hier twee bezienswaardigheden: A en B."; bij meer dan AANKONDIGING_MAX
 * namen: "Hier vijf bezienswaardigheden: A, B, C en nog twee."
 */
export function aankondigingTekst(namen) {
  const n = (namen || []).filter(Boolean)
  const namenTekst =
    n.length <= AANKONDIGING_MAX
      ? opsomming(n)
      : t('keuze.enNog', {
          lijst: n.slice(0, AANKONDIGING_MAX).join(', '),
          telwoord: telwoord(n.length - AANKONDIGING_MAX),
        })
  return t('keuze.aankondiging', { telwoord: telwoord(n.length), namen: namenTekst })
}

/** "Je hebt één bezienswaardigheid om te beluisteren." */
export function pauzeTekst(aantal) {
  return t('keuze.pauzeTekst', { aantal, telwoord: telwoord(aantal) })
}

/** Ids zonder dubbelen toevoegen aan een lijst (volgorde blijft). */
export function voegToe(lijst, ids) {
  const uit = [...(lijst || [])]
  ;(ids || []).forEach((id) => {
    if (id !== null && id !== undefined && !uit.includes(id)) uit.push(id)
  })
  return uit
}
