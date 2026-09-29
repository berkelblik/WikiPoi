/**
 * spreek.js
 *
 * Voorleeswachtrij voor stap 7 "Onderweg", via
 * @capacitor-community/text-to-speech (Android: native TTS; browser:
 * speechSynthesis). Teksten worden na elkaar uitgesproken, nooit door elkaar;
 * TextToSpeech.speak() wacht tot de tekst helemaal is uitgesproken.
 * Zelfde principe als de wachtrij in EuroPoi (src/audioEngine.js).
 *
 * Elke tekst heeft een eigen taal (lang). Lukt uitspreken in die taal niet
 * (bijv. geen stem voor die taal op het toestel), dan volgt één nieuwe
 * poging in APP_TAAL.
 *
 * Naast tekst kan de wachtrij een fietsbel bevatten: een kort geluid dat de
 * gebruiker voorbereidt op het bericht dat volgt, in plaats van een
 * gesproken naam. De volgende tekst start pas als de bel is uitgeklonken.
 * - bel(): één belletje (lijstweergave);
 * - dubbeleBel(): bel 1, na tussenpozeMs bel 2 (eco-scherm);
 * - belNu(): direct, buiten de wachtrij (tikken op het eco-scherm).
 * Geluid: "Bike bell" (freesound_community, Pixabay, nr. 40094), ingekort
 * tot één belletje; Pixabay Content License.
 *
 * Diagnose (proef achtergrond-GPS): met zetDiagnose(fn) krijgt fn(soort,
 * tekst) een melding bij begin, einde en mislukken van bel en voorlezen,
 * voor het logboek (logboek.js).
 */
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { APP_TAAL } from '../taal.js'
import belUrl from './fietsbel.mp3'

const TEMPO = 1.0

// Veiligheidsgrens: blijft 'ended' uit (bijv. geluid geblokkeerd), dan gaat
// de wachtrij na deze tijd toch verder. De bel zelf duurt 2,4 s.
const BEL_MAX_MS = 4000

// Standaard tijd tussen bel 1 en bel 2 bij dubbeleBel().
export const DUBBELE_BEL_TUSSENPOZE_MS = 1000

// Diagnosefunctie (soort, tekst) of null.
let diagnose = null

export function zetDiagnose(fn) {
  diagnose = typeof fn === 'function' ? fn : null
}

function meld(soort, tekst = '') {
  if (!diagnose) return
  try {
    diagnose(soort, tekst)
  } catch {
    // Diagnose mag het voorlezen nooit hinderen.
  }
}

let wachtrij = []
let bezig = false
// Wordt bij stopSpreken() opgehoogd; een lopende lus die een andere
// generatie ziet, stopt zonder verder iets te doen.
let generatie = 0
// Belgeluiden die nu klinken, zodat stopSpreken() ze kan afbreken.
const actieveBellen = new Set()

function foutBericht(err) {
  return err && err.message ? err.message : String(err)
}

async function spreekUit(tekst, lang, gen) {
  meld('spreek-start', `${lang}, ${tekst.length} tekens`)
  try {
    await TextToSpeech.speak({ text: tekst, lang, rate: TEMPO })
    meld('spreek-einde', lang)
    return
  } catch (err) {
    if (gen !== generatie) return
    meld('spreek-fout', `${lang}: ${foutBericht(err)}`)
    if (lang === APP_TAAL) {
      console.warn('WikiPoi voorlezen mislukt:', err)
      return
    }
    console.warn('WikiPoi voorlezen in ' + lang + ' mislukt, terugval ' + APP_TAAL + ':', err)
  }
  try {
    await TextToSpeech.speak({ text: tekst, lang: APP_TAAL, rate: TEMPO })
    meld('spreek-einde', APP_TAAL)
  } catch (err) {
    meld('spreek-fout', `${APP_TAAL}: ${foutBericht(err)}`)
    console.warn('WikiPoi voorlezen mislukt:', err)
  }
}

// Start één belletje en geeft een belofte terug die klaar is als de bel is
// uitgeklonken (of mislukt, of de veiligheidsgrens verstreken is). Een fout
// is nooit fataal: dan volgt gewoon de tekst.
function startBel() {
  return new Promise((klaar) => {
    let audio = null
    let timer = null
    let afgerond = false
    // hoe: 'einde', 'fout' of 'tijd' (veiligheidsgrens verstreken).
    const einde = (hoe, tekst = '') => {
      if (afgerond) return
      afgerond = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      if (audio) actieveBellen.delete(audio)
      meld(hoe === 'einde' ? 'bel-einde' : hoe === 'tijd' ? 'bel-tijd' : 'bel-fout', tekst)
      klaar()
    }
    try {
      meld('bel-start')
      audio = new Audio(belUrl)
      actieveBellen.add(audio)
      audio.addEventListener('ended', () => einde('einde'), { once: true })
      audio.addEventListener('error', () => einde('fout', 'laadfout'), { once: true })
      timer = setTimeout(() => einde('tijd'), BEL_MAX_MS)
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('WikiPoi fietsbel mislukt:', err)
          einde('fout', foutBericht(err))
        })
      }
    } catch (err) {
      console.warn('WikiPoi fietsbel mislukt:', err)
      einde('fout', foutBericht(err))
    }
  })
}

function wacht(ms) {
  return new Promise((klaar) => setTimeout(klaar, ms))
}

async function speelDubbeleBel(tussenpozeMs, gen) {
  const eerste = startBel()
  await wacht(tussenpozeMs)
  if (gen !== generatie) return
  const tweede = startBel()
  await Promise.all([eerste, tweede])
}

async function verwerk() {
  if (bezig) return
  bezig = true
  const gen = generatie
  while (gen === generatie && wachtrij.length > 0) {
    const item = wachtrij.shift()
    if (item.onStart) item.onStart()
    if (item.soort === 'bel') {
      await startBel()
    } else if (item.soort === 'dubbeleBel') {
      await speelDubbeleBel(item.tussenpozeMs, gen)
    } else {
      await spreekUit(item.tekst, item.lang, gen)
    }
    // Afgebroken met stopSpreken(): een eventuele nieuwe lus beheert 'bezig'.
    if (gen !== generatie) return
    if (item.onEinde) item.onEinde()
  }
  bezig = false
}

/**
 * Tekst achteraan de wachtrij zetten.
 * lang (standaard APP_TAAL), onStart en onEinde zijn optioneel.
 */
export function spreek(tekst, { lang = APP_TAAL, onStart, onEinde } = {}) {
  const schoon = String(tekst || '').trim()
  if (!schoon) return
  wachtrij.push({ soort: 'tekst', tekst: schoon, lang: lang || APP_TAAL, onStart, onEinde })
  verwerk()
}

/**
 * Eén fietsbel achteraan de wachtrij zetten.
 * onStart en onEinde zijn optioneel.
 */
export function bel({ onStart, onEinde } = {}) {
  wachtrij.push({ soort: 'bel', onStart, onEinde })
  verwerk()
}

/**
 * Dubbele fietsbel achteraan de wachtrij zetten: bel 1 direct (onStart),
 * bel 2 na tussenpozeMs; onEinde als bel 2 is uitgeklonken.
 */
export function dubbeleBel({ tussenpozeMs = DUBBELE_BEL_TUSSENPOZE_MS, onStart, onEinde } = {}) {
  wachtrij.push({ soort: 'dubbeleBel', tussenpozeMs, onStart, onEinde })
  verwerk()
}

/** Eén fietsbel direct, buiten de wachtrij (klinkt eventueel door spraak heen). */
export function belNu() {
  startBel()
}

/** Huidige tekst of bel afbreken en de wachtrij leegmaken. */
export async function stopSpreken() {
  generatie += 1
  wachtrij = []
  bezig = false
  actieveBellen.forEach((audio) => {
    try {
      audio.pause()
    } catch {
      // Niets aan de hand.
    }
  })
  actieveBellen.clear()
  try {
    await TextToSpeech.stop()
  } catch {
    // Niets aan de hand: er werd niets uitgesproken.
  }
}
