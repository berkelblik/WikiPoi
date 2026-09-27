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
 */
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { APP_TAAL } from '../taal.js'

const TEMPO = 1.0

let wachtrij = []
let bezig = false
// Wordt bij stopSpreken() opgehoogd; een lopende lus die een andere
// generatie ziet, stopt zonder verder iets te doen.
let generatie = 0

async function spreekUit(tekst, lang, gen) {
  try {
    await TextToSpeech.speak({ text: tekst, lang, rate: TEMPO })
    return
  } catch (err) {
    if (gen !== generatie) return
    if (lang === APP_TAAL) {
      console.warn('WikiPoi voorlezen mislukt:', err)
      return
    }
    console.warn('WikiPoi voorlezen in ' + lang + ' mislukt, terugval ' + APP_TAAL + ':', err)
  }
  try {
    await TextToSpeech.speak({ text: tekst, lang: APP_TAAL, rate: TEMPO })
  } catch (err) {
    console.warn('WikiPoi voorlezen mislukt:', err)
  }
}

async function verwerk() {
  if (bezig) return
  bezig = true
  const gen = generatie
  while (gen === generatie && wachtrij.length > 0) {
    const item = wachtrij.shift()
    if (item.onStart) item.onStart()
    await spreekUit(item.tekst, item.lang, gen)
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
  wachtrij.push({ tekst: schoon, lang: lang || APP_TAAL, onStart, onEinde })
  verwerk()
}

/** Huidige tekst afbreken en de wachtrij leegmaken. */
export async function stopSpreken() {
  generatie += 1
  wachtrij = []
  bezig = false
  try {
    await TextToSpeech.stop()
  } catch {
    // Niets aan de hand: er werd niets uitgesproken.
  }
}
