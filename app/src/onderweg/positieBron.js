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
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation')

export const MELDING_TITEL = 'WikiPoi'
export const MELDING_TEKST = 'WikiPoi volgt uw route'

export function achtergrondMogelijk() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

function foutTekst(err) {
  return 'GPS-fout: ' + (err && err.message ? err.message : String(err))
}

async function startVoorgrond({ onPositie, onFout }) {
  // Op het web vraagt de browser zelf om toestemming bij watchPosition.
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.requestPermissions()
    if (perm.location !== 'granted') {
      throw new Error('Geen toestemming voor nauwkeurige locatie. Sta dit toe in de Android-instellingen.')
    }
  }
  const id = await Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    (pos, err) => {
      if (err) {
        onFout(foutTekst(err))
        return
      }
      onPositie(pos)
    }
  )
  return {
    bron: 'voorgrond',
    stop: async () => {
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
      backgroundMessage: MELDING_TEKST,
      requestPermissions: true,
      stale: false,
      distanceFilter: 0,
    },
    (locatie, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') {
          onFout('Geen toestemming voor locatie. Sta dit toe in de Android-instellingen.')
        } else {
          onFout(foutTekst(err))
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
  return startVoorgrond({ onPositie, onFout })
}
