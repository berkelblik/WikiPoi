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
 * Audio van eigen POI's (0.11.0): speelAudio() zet een mp3 (internetlink
 * of gekoppeld lokaal bestand, zie mp3bron.js) in de wachtrij. De bronnen
 * worden na elkaar geprobeerd; begint een bron niet binnen AUDIO_START_MS
 * te klinken (geen verbinding, laadfout), dan volgt de volgende bron, en
 * als geen enkele bron lukt de terugvaltekst (voorlezen), zoals EuroPoi
 * (src/audioEngine.js, 7 s). Afspelen via HTML-audio in de WebView.
 *
 * Diagnose (proef achtergrond-GPS): met zetDiagnose(fn) krijgt fn(soort,
 * tekst) een melding bij begin, einde en mislukken van bel, voorlezen en
 * mp3 (mp3-start, mp3-einde, mp3-fout, mp3-terugval), voor het logboek
 * (logboek.js).
 */
import { TextToSpeech } from '@capacitor-community/text-to-speech'
import { APP_TAAL } from '../taal.js'
import belUrl from './fietsbel.mp3'

const TEMPO = 1.0

// Veiligheidsgrens: blijft 'ended' uit (bijv. geluid geblokkeerd), dan gaat
// de wachtrij na deze tijd toch verder. De bel zelf duurt 2,4 s.
const BEL_MAX_MS = 4000

// Een mp3 die niet binnen deze tijd begint te klinken, telt als mislukt
// (zoals EuroPoi). Daarna klinkt hij zo lang als hij duurt.
const AUDIO_START_MS = 7000
// Marge boven de duur van een mp3 voordat de wachtrij toch verdergaat.
const AUDIO_MARGE_MS = 15000

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
// Geluiden (bel, mp3) die nu klinken, zodat stopSpreken() ze kan afbreken.
const actieveGeluiden = new Set()

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
      if (audio) actieveGeluiden.delete(audio)
      meld(hoe === 'einde' ? 'bel-einde' : hoe === 'tijd' ? 'bel-tijd' : 'bel-fout', tekst)
      klaar()
    }
    try {
      meld('bel-start')
      audio = new Audio(belUrl)
      actieveGeluiden.add(audio)
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

// Speelt één audiobron af. Geeft een belofte met true als de bron heeft
// geklonken (tot het einde, of tot een fout of stop ná de start) en false
// als hij niet binnen AUDIO_START_MS begon te klinken.
function speelBron(bron) {
  return new Promise((klaar) => {
    let audio = null
    let timer = null
    let gestart = false
    let afgerond = false
    const omschrijving = `${bron.soort} ${bron.naam}`
    const einde = (gelukt, soort, tekst) => {
      if (afgerond) return
      afgerond = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      if (audio) {
        actieveGeluiden.delete(audio)
        if (!gelukt) {
          try {
            audio.pause()
            audio.removeAttribute('src')
            audio.load()
          } catch {
            // Niets aan de hand.
          }
        }
      }
      meld(soort, tekst)
      klaar(gelukt)
    }
    try {
      meld('mp3-start', omschrijving)
      audio = new Audio()
      actieveGeluiden.add(audio)
      audio.preload = 'auto'
      audio.addEventListener(
        'playing',
        () => {
          gestart = true
          if (timer !== null) clearTimeout(timer)
          timer = null
          // Veiligheidsgrens: blijft 'ended' uit (bijv. de verbinding valt
          // weg), dan gaat de wachtrij na de duur plus een marge toch verder.
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            timer = setTimeout(
              () => einde(true, 'mp3-einde', `${bron.soort}, tijdgrens`),
              audio.duration * 1000 + AUDIO_MARGE_MS
            )
          }
        },
        { once: true }
      )
      audio.addEventListener('ended', () => einde(true, 'mp3-einde', bron.soort), { once: true })
      // Gepauzeerd ná de start (stopSpreken() of het systeem, bijv. een
      // telefoongesprek): telt als afgerond, zodat de wachtrij verder kan.
      // Bij een gewoon einde komt 'pause' vlak vóór 'ended' (audio.ended).
      audio.addEventListener('pause', () => {
        if (gestart && !audio.ended) einde(true, 'mp3-einde', `${bron.soort}, onderbroken`)
      })
      // Voor stopSpreken() vóór de start (nog aan het laden).
      audio.wikipoiStop = () => einde(true, 'mp3-einde', `${bron.soort}, gestopt`)
      audio.addEventListener('error', () => {
        const code = audio.error ? audio.error.code : '?'
        // Fout na de start: wat al klonk, is gehoord; geen terugval.
        einde(gestart, 'mp3-fout', `${omschrijving}: ${gestart ? 'onderbroken' : 'laadfout'} (code ${code})`)
      })
      timer = setTimeout(() => {
        if (!gestart) einde(false, 'mp3-fout', `${omschrijving}: begon niet binnen ${AUDIO_START_MS / 1000} s`)
      }, AUDIO_START_MS)
      audio.src = bron.src
      const p = audio.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          if (!gestart) einde(false, 'mp3-fout', `${omschrijving}: ${foutBericht(err)}`)
        })
      }
    } catch (err) {
      einde(false, 'mp3-fout', `${omschrijving}: ${foutBericht(err)}`)
    }
  })
}

// Bronnen na elkaar proberen; lukt geen enkele, dan de terugvaltekst(en).
async function speelAudioItem(item, gen) {
  if (item.overgeslagen) meld('mp3-fout', item.overgeslagen)
  for (const bron of item.bronnen) {
    const gelukt = await speelBron(bron)
    if (gen !== generatie) return
    if (gelukt) return
  }
  if (item.terugval.length === 0) return
  meld('mp3-terugval', 'voorlezen')
  for (const deel of item.terugval) {
    await spreekUit(deel.tekst, deel.lang, gen)
    if (gen !== generatie) return
  }
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
    } else if (item.soort === 'audio') {
      await speelAudioItem(item, gen)
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

/**
 * Audio achteraan de wachtrij zetten (0.11.0).
 * - bronnen: [{ src, soort: 'link'|'lokaal', naam }], in afspeelvolgorde
 *   (mp3bron.js, audioBronnen);
 * - terugval: [{ tekst, lang }], voorgelezen als geen bron lukt;
 * - overgeslagen: reden waarom een link niet geprobeerd wordt (logboek);
 * - onStart en onEinde zijn optioneel.
 * Zonder bronnen wordt meteen de terugvaltekst voorgelezen.
 */
export function speelAudio({ bronnen = [], terugval = [], overgeslagen = '', onStart, onEinde } = {}) {
  const tekst = terugval
    .map((d) => ({ tekst: String(d.tekst || '').trim(), lang: d.lang || APP_TAAL }))
    .filter((d) => d.tekst)
  if (bronnen.length === 0 && tekst.length === 0) return
  wachtrij.push({ soort: 'audio', bronnen, terugval: tekst, overgeslagen, onStart, onEinde })
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
  Array.from(actieveGeluiden).forEach((audio) => {
    if (typeof audio.wikipoiStop === 'function') audio.wikipoiStop()
    try {
      audio.pause()
    } catch {
      // Niets aan de hand.
    }
  })
  actieveGeluiden.clear()
  try {
    await TextToSpeech.stop()
  } catch {
    // Niets aan de hand: er werd niets uitgesproken.
  }
}
