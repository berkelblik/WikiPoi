/**
 * useOnderweg.js
 *
 * React-hook voor stap 7 "Onderweg": volgt de GPS-positie zolang de route
 * loopt, berekent per POI de afstand tot het triggerpunt (het punt op de
 * route dat het dichtst bij de POI ligt, snapPoint uit App.jsx) en leest een
 * POI voor zodra je binnen de triggerstraal komt — per rit één keer.
 *
 * Triggerstraal "Automatisch" (EuroPoi-regels, route-modus):
 *   max(straal van de vervoerwijze, afstand POI–route + 50 m).
 *
 * Rijrichting: niet uit coords.heading (op Android via @capacitor/geolocation
 * vaak leeg), maar berekend uit twee GPS-punten die minstens
 * MIN_VERPLAATSING_VOOR_RICHTING_M uit elkaar liggen. Bij stilstand blijft de
 * laatst bekende richting staan (zelfde gedrag als EuroPoi).
 *
 * Bouwstap 2 van "Onderweg": nog geen eco-screen of track.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import { afstand, peiling, klokRichting } from './geo.js'
import { spreek, stopSpreken } from './spreek.js'

// Minimale verplaatsing voordat de rijrichting wordt (bij)gewerkt. Kleiner
// maakt de richting bij stilstand onrustig door GPS-ruis.
const MIN_VERPLAATSING_VOOR_RICHTING_M = 10

// Aantal dichtstbijzijnde POI's dat de hook teruggeeft voor de lijst.
const AANTAL_DICHTSTBIJ = 3

// Straal per vervoerwijze, gelijk aan EuroPoi (src/config.js, TRANSPORT).
export const VERVOER = {
  fietser: { label: 'Fietser', straal: 100 },
  wandelaar: { label: 'Wandelaar', straal: 30 },
}
export const STANDAARD_VERVOER = 'fietser'

// Extra marge bovenop de afstand POI–route (EuroPoi: poiToRoute + 50).
const ROUTE_MARGE_M = 50

export function triggerStraal(poi, vervoer) {
  const basis = (VERVOER[vervoer] || VERVOER[STANDAARD_VERVOER]).straal
  const totRoute = Number.isFinite(poi.distanceToRoute) ? poi.distanceToRoute : 0
  return Math.max(basis, totRoute + ROUTE_MARGE_M)
}

// Voorleestekst: naam, eventueel klokrichting, dan de samenvatting (stap 5)
// of anders de Wikidata-omschrijving — dezelfde keuze als de CSV-export.
export function voorleesTekst(poi, samenvattingen, klok) {
  const entry = samenvattingen ? samenvattingen[poi.id] : null
  const beschrijving =
    entry && entry.summary ? entry.summary.extractShort || '' : poi.description || ''
  const kop = Number.isFinite(klok) ? `${poi.label}, op ${klok} uur.` : `${poi.label}.`
  return `${kop} ${beschrijving}`.trim()
}

function foutTekst(err) {
  return 'GPS-fout: ' + (err && err.message ? err.message : String(err))
}

export function useOnderweg(pois, { vervoer = STANDAARD_VERVOER, samenvattingen = {} } = {}) {
  const [actief, setActief] = useState(false)
  const [positie, setPositie] = useState(null) // { lat, lng, nauwkeurigheid, tijd }
  const [rijrichting, setRijrichting] = useState(null) // graden, of null = onbekend
  const [fout, setFout] = useState('')
  const [voorgelezen, setVoorgelezen] = useState({}) // { [poi.id]: true } deze rit
  const [nuAanHetVoorlezen, setNuAanHetVoorlezen] = useState(null) // label of null

  const watchIdRef = useRef(null)
  const richtingPuntRef = useRef(null)
  const voorgelezenRef = useRef({})
  const samenvattingenRef = useRef(samenvattingen)

  useEffect(() => {
    samenvattingenRef.current = samenvattingen
  }, [samenvattingen])

  const verwerkPositie = useCallback((pos) => {
    const c = pos && pos.coords
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return
    const punt = { lat: c.latitude, lng: c.longitude }

    const vorig = richtingPuntRef.current
    if (!vorig) {
      richtingPuntRef.current = punt
    } else if (afstand(vorig, punt) >= MIN_VERPLAATSING_VOOR_RICHTING_M) {
      setRijrichting(peiling(vorig, punt))
      richtingPuntRef.current = punt
    }

    setPositie({ ...punt, nauwkeurigheid: c.accuracy, tijd: pos.timestamp })
  }, [])

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch({ id: watchIdRef.current }).catch(() => {})
      watchIdRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setFout('')
    setPositie(null)
    setRijrichting(null)
    richtingPuntRef.current = null
    voorgelezenRef.current = {}
    setVoorgelezen({})
    try {
      // Op het web vraagt de browser zelf om toestemming bij watchPosition.
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.requestPermissions()
        if (perm.location !== 'granted') {
          setFout('Geen toestemming voor nauwkeurige locatie. Sta dit toe in de Android-instellingen.')
          return
        }
      }
      stopWatch()
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        (pos, err) => {
          if (err) {
            setFout(foutTekst(err))
            return
          }
          setFout('')
          verwerkPositie(pos)
        }
      )
      watchIdRef.current = id
      setActief(true)
    } catch (err) {
      setFout(foutTekst(err))
      setActief(false)
    }
  }, [stopWatch, verwerkPositie])

  const stopVoorlezen = useCallback(() => {
    stopSpreken()
    setNuAanHetVoorlezen(null)
  }, [])

  const stop = useCallback(() => {
    stopWatch()
    stopVoorlezen()
    setActief(false)
  }, [stopWatch, stopVoorlezen])

  // Bij verlaten van de pagina/component GPS-volgen en voorlezen stoppen.
  useEffect(
    () => () => {
      stopWatch()
      stopSpreken()
    },
    [stopWatch]
  )

  // Handmatig voorlezen (tik op een POI in de lijst); telt niet als
  // "voorgelezen" voor de automatische trigger.
  const leesVoor = useCallback((poi) => {
    spreek(voorleesTekst(poi, samenvattingenRef.current, poi.klok), {
      onStart: () => setNuAanHetVoorlezen(poi.label),
      onEinde: () => setNuAanHetVoorlezen(null),
    })
  }, [])

  // Per POI: afstand tot triggerpunt (snapPoint; anders de POI zelf),
  // triggerstraal en klokrichting. Gesorteerd op afstand tot triggerpunt.
  const poisMetAfstand = useMemo(() => {
    if (!positie) return []
    return pois
      .map((p) => {
        const triggerpunt = p.snapPoint || p
        return {
          ...p,
          afstandTriggerpunt: afstand(positie, triggerpunt),
          straal: triggerStraal(p, vervoer),
          klok: rijrichting === null ? null : klokRichting(rijrichting, peiling(positie, p)),
        }
      })
      .filter((p) => Number.isFinite(p.afstandTriggerpunt))
      .sort((a, b) => a.afstandTriggerpunt - b.afstandTriggerpunt)
  }, [pois, positie, rijrichting, vervoer])

  // Automatische trigger: alle POI's binnen hun straal die deze rit nog niet
  // aan de beurt waren, dichtstbijzijnde eerst, via de wachtrij.
  useEffect(() => {
    if (!actief) return
    const nieuw = poisMetAfstand.filter(
      (p) => p.afstandTriggerpunt <= p.straal && !voorgelezenRef.current[p.id]
    )
    if (nieuw.length === 0) return
    const volgende = { ...voorgelezenRef.current }
    nieuw.forEach((p) => {
      volgende[p.id] = true
    })
    voorgelezenRef.current = volgende
    setVoorgelezen(volgende)
    nieuw.forEach((p) => {
      spreek(voorleesTekst(p, samenvattingenRef.current, p.klok), {
        onStart: () => setNuAanHetVoorlezen(p.label),
        onEinde: () => setNuAanHetVoorlezen(null),
      })
    })
  }, [actief, poisMetAfstand])

  const dichtstbij = poisMetAfstand.slice(0, AANTAL_DICHTSTBIJ)
  const aantalVoorgelezen = Object.keys(voorgelezen).length

  return {
    actief,
    positie,
    rijrichting,
    fout,
    start,
    stop,
    dichtstbij,
    voorgelezen,
    aantalVoorgelezen,
    nuAanHetVoorlezen,
    leesVoor,
    stopVoorlezen,
  }
}
