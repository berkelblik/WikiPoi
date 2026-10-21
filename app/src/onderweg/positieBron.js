/**
 * positieBron.js
 *
 * Eén interface voor de GPS-positie in stap 7 "Onderweg", met twee bronnen:
 *
 * - 'voorgrond': @capacitor/geolocation (watchPosition). Werkt alleen
 *   betrouwbaar zolang de app zichtbaar is (eco-scherm houdt het scherm aan).
 * - 'achtergrond': @capacitor-community/background-geolocation, als
 *   voorgrondservice met een vaste melding ("WikiPoi volgt uw route").
 *   Posities blijven dan binnenkomen met het scherm uit of met een andere
 *   app op de voorgrond. Alleen in de Android-app; in de browser valt
 *   'achtergrond' terug op 'voorgrond'.
 *
 * Voor de melding is op Android 13+ het recht POST_NOTIFICATIONS nodig; dat
 * wordt gevraagd via @capacitor/local-notifications. Zonder dat recht draait
 * de service wel, maar is de melding niet zichtbaar.
 *
 * startPositieBron(soort, { onPositie, onFout, onInfo }) geeft een belofte
 * met { bron, stop } terug; stop() is async. onPositie krijgt een object in
 * de vorm van de Geolocation-API: { coords: { latitude, longitude,
 * accuracy }, timestamp }, zodat useOnderweg niet weet welke bron actief is.
 * onInfo krijgt korte meldingen voor het logboek.
 *
 * Extra opvraging (0.18.0, keuze A4, zoals EuroPoi-AndroidLite v1.6.0): in
 * de voorgrondmodus naast watchPosition elke OPVRAAG_MS een losse
 * getCurrentPosition, omdat watchPosition op sommige toestellen met
 * tussenpozen levert. Dubbele metingen vangt positieFilter.js af. In de
 * achtergrondmodus niet: met het scherm uit lopen timers niet betrouwbaar.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'
import { t } from '../vertaal.js'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

export const OPVRAAG_MS = 2000
const OPVRAAG_TIMEOUT_MS = 4000

export const MELDING_TITEL = 'WikiPoi'

// Fouten gaan als { sleutel, params } naar useOnderweg (0.23.0): op het
// scherm in de taal van de bediening, in het logboek in het Nederlands.

export function achtergrondMogelijk() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function gpsFout(err) {
  return { sleutel: 'gps.fout', params: { bericht: err && err.message ? err.message : String(err) } }
}

async function startVoorgrond({ onPositie, onFout, onInfo }) {
  // Op het web vraagt de browser zelf om toestemming bij watchPosition.
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== 'granted') {
      const fout = new Error('geen toestemming voor nauwkeurige locatie')
      fout.sleutel = 'gps.geenToestemmingNauwkeurig'
      throw fout
    }
  }
  const id = await Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    (pos, err) => {
      if (err) {
        onFout(gpsFout(err))
        return
      }
      onPositie(pos)
    }
  )
  let gestopt = false
  let bezig = false
  const opvraag = setInterval(async () => {
    if (gestopt || bezig) return
    bezig = true
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: OPVRAAG_TIMEOUT_MS,
        maximumAge: 0,
      })
      if (!gestopt && pos) onPositie(pos)
    } catch {
      // Geen positie binnen de tijd: watchPosition blijft lopen.
    } finally {
      bezig = false
    }
  }, OPVRAAG_MS)
  onInfo(`extra opvraging elke ${OPVRAAG_MS / 1000} s`)
  return {
    bron: 'voorgrond',
    stop: async () => {
      gestopt = true
      clearInterval(opvraag)
      try {
        await Geolocation.clearWatch({ id })
      } catch {
        // Niets aan de hand.
      }
    },
  }
}

async function vraagMeldingRecht(onInfo) {
  try {
    let recht = await LocalNotifications.checkPermissions()
    if (recht.display !== 'granted') {
      recht = await LocalNotifications.requestPermissions()
    }
    onInfo(`meldingen: ${recht.display}`)
  } catch (err) {
    onInfo('meldingen: onbekend (' + (err && err.message ? err.message : String(err)) + ')')
  }
}

async function startAchtergrond({ onPositie, onFout, onInfo }) {
  await vraagMeldingRecht(onInfo)
  const id = await BackgroundGeolocation.addWatcher(
    {
      backgroundTitle: MELDING_TITEL,
      backgroundMessage: t('gps.melding'),
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (locatie, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') {
          onFout({ sleutel: 'gps.geenToestemming' })
        } else {
          onFout(gpsFout(err))
        }
        return
      }
      if (!locatie) return
      onPositie({
        coords: {
          latitude: locatie.latitude,
          longitude: locatie.longitude,
          accuracy: locatie.accuracy,
        },
        timestamp: locatie.time,
      })
    }
  )
  return {
    bron: 'achtergrond',
    stop: async () => {
      try {
        await BackgroundGeolocation.removeWatcher({ id })
      } catch {
        // Niets aan de hand.
      }
    },
  }
}

export async function startPositieBron(soort, { onPositie, onFout = () => {}, onInfo = () => {} }) {
  if (soort === 'achtergrond') {
    if (achtergrondMogelijk()) return startAchtergrond({ onPositie, onFout, onInfo })
    onInfo('achtergrond niet mogelijk op dit platform; voorgrond gebruikt')
  }
  return startVoorgrond({ onPositie, onFout, onInfo })
}
