/**
 * RouteMap.jsx
 *
 * Routekaart voor WikiPoi: toont de GPX-routelijn, de gevonden POI's en per
 * POI binnen de corridor een stippellijn naar het dichtstbijzijnde punt op
 * de route — het punt waar EuroPoi een route-gekoppelde POI straks
 * aankondigt.
 *
 * Afgeslankte variant van EuroPoi src/components/LeafletMap.jsx: zelfde
 * aanpak (gewone Leaflet, geen React-Leaflet; ResizeObserver →
 * invalidateSize() zodat in-/uitklappen geen grijze vlakken geeft; OSM/SAT-
 * wissel rechtsboven), maar zonder eigen-locatie-marker, volgmodus,
 * crosshair en GPS-track. Nieuw t.o.v. EuroPoi: fitBounds() op de route
 * i.p.v. centreren op de gebruiker.
 *
 * Leaflet komt hier uit npm (import) i.p.v. dynamisch van unpkg zoals in
 * EuroPoi: dan zit het in de app-bundel en werkt de kaartcode ook zonder
 * CDN.
 *
 * POI-markers: L.divIcon met een rond categorie-icoon (kleur + wit SVG-
 * icoon uit poi-icons.js). Geen afbeeldingsbestanden, dus de bekende
 * Vite/Leaflet-kwestie met ontbrekende standaard-markerafbeeldingen speelt
 * niet. Binnen de corridor: groot en vol; erbuiten: kleiner en vervaagd.
 * De stippellijn naar het triggerpunt krijgt de categoriekleur. Linksonder
 * staat een uitklapbare legenda met alleen de categorieën die op de kaart
 * voorkomen.
 *
 * Corridorstrook: onder de routelijn ligt een tweede, brede en
 * halfdoorzichtige lijn over dezelfde route. De lijndikte in pixels is
 * 2 × corridorMeters, omgerekend met de meters-per-pixel van het huidige
 * zoomniveau (Web Mercator) op de breedtegraad van het routemidden. Met
 * ronde uiteinden en hoeken is dat visueel precies de corridor. Omdat het
 * één lijn is, wordt de strook op plekken waar de route zichzelf kruist
 * niet donkerder. Bij in-/uitzoomen en bij het verschuiven van de slider
 * wordt alleen de lijndikte bijgewerkt.
 *
 * Props:
 *   routePoints    Array<{lat,lng}>        — routelijn (mag leeg zijn)
 *   pois           Array<{id,label,lat,lng,distanceToRoute,snapPoint,
 *                         inCorridor,categoryKey,categoryLabel}>
 *                                            — distanceToRoute/snapPoint mogen
 *                                              null zijn als er geen route is;
 *                                              categoryKey null → grijze
 *                                              standaardmarker
 *   corridorMeters number                  — corridorbreedte aan weerszijden
 *                                              van de route; zonder geldige
 *                                              waarde wordt geen strook getoond
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CATEGORY_STYLES, getCategoryStyle, markerHtml } from './poi-icons.js'

const MAP_TILES = {
  osm: {
    // Zonder {s}-subdomeinen (a/b/c): OSM raadt die sinds 2023 af.
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    label: 'OSM',
    attribution: '© OpenStreetMap · Leaflet',
  },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    label: 'SAT',
    attribution: '© Esri · Leaflet',
  },
}

// Standaardweergave zolang er geen route is: omgeving Zutphen (zelfde
// gebied als FALLBACK_TEST_BBOX in App.jsx).
const DEFAULT_CENTER = [52.1326, 6.2233]
const DEFAULT_ZOOM = 13

const COLOR_ROUTE = '#facc15'
// Corridorstrook: paars (route is geel), licht en halfdoorzichtig,
// zodat routelijn en POI's er goed boven zichtbaar blijven.
const COLOR_CORRIDOR = '#7c3aed'
const CORRIDOR_OPACITY = 0.2

// Markergrootte in pixels: binnen de corridor groot genoeg om het icoon op
// een telefoon te herkennen, erbuiten kleiner (en vervaagd, zie poi-icons.js).
const MARKER_SIZE_IN = 28
const MARKER_SIZE_OUT = 22
const LEGEND_SWATCH_SIZE = 18

// Omtrek van de aarde aan de evenaar (WGS84) en de tegelgrootte: de
// grootheden waarmee Leaflet (Web Mercator, EPSG:3857) rekent.
const EARTH_CIRCUMFERENCE_M = 40075016.686
const TILE_SIZE_PX = 256

// Aantal meters dat één schermpixel beslaat op breedtegraad lat bij zoom.
function metersPerPixel(lat, zoom) {
  return (
    (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) /
    (TILE_SIZE_PX * Math.pow(2, zoom))
  )
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function RouteMap({ routePoints, pois, corridorMeters }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const tileLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const corridorLayerRef = useRef(null)
  const poiLayerRef = useRef(null)
  // Breedtegraad van het routemidden, voor de omrekening meters → pixels.
  const routeLatRef = useRef(null)
  // Actuele corridorbreedte in een ref, zodat de zoomend-handler (die één
  // keer bij het initialiseren wordt gekoppeld) altijd de laatste waarde ziet.
  const corridorMetersRef = useRef(corridorMeters)
  corridorMetersRef.current = corridorMeters
  // Staat op true zolang de route nog niet in beeld is gebracht. fitBounds()
  // op een kaart met hoogte 0 (ingeklapt) werkt niet, dus dan wachten we
  // tot de ResizeObserver ziet dat de kaart zichtbaar is geworden.
  const needsFitRef = useRef(false)
  const [tileKey, setTileKey] = useState('osm')
  // Legenda standaard ingeklapt: op een telefoon is de kaart maar 320 px hoog.
  const [legendOpen, setLegendOpen] = useState(false)

  // Legenda: alleen de categorieën die in de huidige POI-lijst voorkomen, in
  // de vaste volgorde van CATEGORY_STYLES (onbekende categorie achteraan).
  const legendItems = useMemo(() => {
    const labelByKey = new Map()
    ;(pois || []).forEach((p) => {
      const key = p.categoryKey || null
      if (!labelByKey.has(key)) labelByKey.set(key, p.categoryLabel || 'Onbekende categorie')
    })
    const order = Object.keys(CATEGORY_STYLES)
    const rank = (key) => {
      const i = order.indexOf(key)
      return i === -1 ? order.length : i
    }
    return Array.from(labelByKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => rank(a.key) - rank(b.key))
  }, [pois])

  function fitToRouteIfPossible() {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || !needsFitRef.current) return
    if (container.clientHeight === 0) return
    if (!routeLayerRef.current) return
    map.fitBounds(routeLayerRef.current.getBounds(), { padding: [20, 20] })
    needsFitRef.current = false
  }

  // Lijndikte van de corridorstrook aanpassen aan corridorbreedte en zoom.
  function updateCorridorWidth() {
    const map = mapRef.current
    const band = corridorLayerRef.current
    if (!map || !band) return
    const meters = corridorMetersRef.current
    if (!Number.isFinite(meters) || meters <= 0 || routeLatRef.current === null) {
      band.setStyle({ opacity: 0 })
      return
    }
    const mpp = metersPerPixel(routeLatRef.current, map.getZoom())
    band.setStyle({ weight: (2 * meters) / mpp, opacity: CORRIDOR_OPACITY })
  }

  // Kaart één keer initialiseren.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM)
    mapRef.current = map
    poiLayerRef.current = L.layerGroup().addTo(map)
    map.on('zoomend', updateCorridorWidth)

    const ro = new ResizeObserver(() => {
      if (!mapRef.current) return
      mapRef.current.invalidateSize()
      fitToRouteIfPossible()
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
      tileLayerRef.current = null
      routeLayerRef.current = null
      corridorLayerRef.current = null
      poiLayerRef.current = null
    }
  }, [])

  // Tegellaag (OSM/SAT) wisselen.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current)
    // referrerPolicy: de OSM-tegelservers weigeren (HTTP 403 "Access
    // blocked") verzoeken zonder Referer-header. Sommige omgevingen — o.a.
    // de GitHub Codespace-preview — sturen die standaard niet mee. Deze
    // Leaflet-optie (sinds 1.9) zet het referrerpolicy-attribuut op elke
    // tegel-<img>, zodat de herkomst (alleen het domein, geen pad) altijd
    // wordt meegestuurd, conform het OSM Tile Usage Policy.
    tileLayerRef.current = L.tileLayer(MAP_TILES[tileKey].url, {
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map)
  }, [tileKey])

  // Routelijn en corridorstrook tekenen en (zodra zichtbaar) in beeld brengen.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    if (corridorLayerRef.current) {
      map.removeLayer(corridorLayerRef.current)
      corridorLayerRef.current = null
    }
    routeLatRef.current = null
    const valid = (routePoints || []).filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    )
    if (valid.length < 2) return
    const latlngs = valid.map((p) => [p.lat, p.lng])

    // noClip: Leaflet knipt lijnstukken buiten beeld weg, maar de brede
    // strook van zo'n stuk kan wél in beeld vallen. interactive: false,
    // zodat tikken op de strook gewoon de kaart bedient.
    corridorLayerRef.current = L.polyline(latlngs, {
      color: COLOR_CORRIDOR,
      weight: 1,
      opacity: 0,
      lineCap: 'round',
      lineJoin: 'round',
      noClip: true,
      interactive: false,
    }).addTo(map)
    routeLayerRef.current = L.polyline(latlngs, {
      color: COLOR_ROUTE,
      weight: 4,
      opacity: 0.85,
    }).addTo(map)
    routeLatRef.current = routeLayerRef.current.getBounds().getCenter().lat

    // Tekenvolgorde van onder naar boven: strook, routelijn, stippellijnen.
    // De POI-markers zelf staan in Leaflets markerPane, altijd daarboven.
    routeLayerRef.current.bringToBack()
    corridorLayerRef.current.bringToBack()
    updateCorridorWidth()

    needsFitRef.current = true
    fitToRouteIfPossible()
  }, [routePoints])

  // Corridorbreedte gewijzigd (slider): alleen de lijndikte bijwerken.
  useEffect(() => {
    updateCorridorWidth()
  }, [corridorMeters])

  // POI-markers en stippellijnen naar het triggerpunt op de route.
  useEffect(() => {
    const layer = poiLayerRef.current
    if (!layer) return
    layer.clearLayers()
    ;(pois || []).forEach((p) => {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return
      const style = getCategoryStyle(p.categoryKey)

      if (p.inCorridor && p.snapPoint) {
        L.polyline(
          [
            [p.lat, p.lng],
            [p.snapPoint.lat, p.snapPoint.lng],
          ],
          { color: style.color, weight: 2, opacity: 0.85, dashArray: '4 5' }
        ).addTo(layer)
      }

      const size = p.inCorridor ? MARKER_SIZE_IN : MARKER_SIZE_OUT
      // className eigen naam: voorkomt Leaflets standaardklasse
      // leaflet-div-icon (witte achtergrond met rand om het icoon).
      const icon = L.divIcon({
        className: 'wikipoi-marker',
        html: markerHtml(p.categoryKey, { sizePx: size, faded: !p.inCorridor }),
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      })

      const distanceText = Number.isFinite(p.distanceToRoute)
        ? `${Math.round(p.distanceToRoute)} m van de route`
        : 'Geen route geladen'
      const categoryText = p.categoryLabel ? `${escapeHtml(p.categoryLabel)}<br>` : ''
      L.marker([p.lat, p.lng], {
        icon,
        keyboard: false,
        // POI's binnen de corridor bovenop de vervaagde exemplaren.
        zIndexOffset: p.inCorridor ? 1000 : 0,
      })
        .bindPopup(
          `<strong>${escapeHtml(p.label || '(zonder naam)')}</strong><br>${categoryText}${distanceText}`
        )
        .addTo(layer)
    })
  }, [pois])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Legenda — linksonder, uitklapbaar */}
      {legendItems.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            zIndex: 1000,
            maxWidth: '70%',
            maxHeight: 'calc(100% - 60px)',
            overflowY: 'auto',
            background: 'rgba(255,255,255,0.88)',
            borderRadius: '10px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            color: '#1e293b',
            fontSize: '11px',
            textAlign: 'left',
          }}
        >
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            style={{
              display: 'block',
              width: '100%',
              padding: '4px 10px',
              border: 'none',
              background: 'transparent',
              fontSize: '11px',
              fontWeight: 800,
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {legendOpen ? 'Legenda ▾' : 'Legenda ▸'}
          </button>
          {legendOpen && (
            <ul style={{ listStyle: 'none', margin: 0, padding: '0 10px 6px' }}>
              {legendItems.map((item) => (
                <li
                  key={item.key || 'onbekend'}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}
                >
                  <span
                    style={{ flex: '0 0 auto' }}
                    dangerouslySetInnerHTML={{
                      __html: markerHtml(item.key, { sizePx: LEGEND_SWATCH_SIZE }),
                    }}
                  />
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Bronvermelding — rechtsonder */}
      <div
        style={{
          position: 'absolute',
          bottom: '8px',
          right: '8px',
          zIndex: 1000,
          pointerEvents: 'none',
          background: 'rgba(0,0,0,0.4)',
          padding: '2px 8px',
          borderRadius: '999px',
          fontSize: '9px',
          color: 'rgba(255,255,255,0.8)',
        }}
      >
        {MAP_TILES[tileKey].attribution}
      </div>

      {/* OSM/SAT-wissel — rechtsboven, zoals in EuroPoi */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          display: 'flex',
          background: 'rgba(255,255,255,0.7)',
          padding: '4px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {Object.keys(MAP_TILES).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTileKey(k)}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              cursor: 'pointer',
              background: tileKey === k ? '#2563eb' : 'transparent',
              color: tileKey === k ? '#ffffff' : 'rgba(30,30,30,0.75)',
            }}
          >
            {MAP_TILES[k].label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default RouteMap
