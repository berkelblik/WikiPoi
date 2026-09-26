/**
 * spreek.js
 *
 * Voorleeswachtrij voor stap 7 "Onderweg", via
 * @capacitor-community/text-to-speech (Android: native TTS; browser:
 * speechSynthesis). Teksten worden na elkaar uitgesproken, nooit door elkaar;
 * TextToSpeech.speak() wacht tot de tekst helemaal is uitgesproken.
 * Zelfde principe als de wachtrij in EuroPoi (src/audioEngine.js).
 */
import { TextToSpeech } from '@capacitor-community/text-to-speech'

const TAAL = 'nl-NL'
const TEMPO = 1.0

let wachtrij = []
let bezig = false
// Wordt bij stopSpreken() opgehoogd; een lopende lus die een andere
// generatie ziet, stopt zonder verder iets te doen.
let generatie = 0

async function verwerk() {
  if (bezig) return
  bezig = true
  const gen = generatie
  while (gen === generatie && wachtrij.length > 0) {
    const item = wachtrij.shift()
    if (item.onStart) item.onStart()
    try {
      await TextToSpeech.speak({ text: item.tekst, lang: TAAL, rate: TEMPO })
    } catch (err) {
      console.warn('WikiPoi voorlezen mislukt:', err)
    }
    // Afgebroken met stopSpreken(): een eventuele nieuwe lus beheert 'bezig'.
    if (gen !== generatie) return
    if (item.onEinde) item.onEinde()
  }
  bezig = false
}

/** Tekst achteraan de wachtrij zetten. onStart/onEinde zijn optioneel. */
export function spreek(tekst, { onStart, onEinde } = {}) {
  const schoon = String(tekst || '').trim()
  if (!schoon) return
  wachtrij.push({ tekst: schoon, onStart, onEinde })
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
