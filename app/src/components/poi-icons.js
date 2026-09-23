/**
 * poi-icons.js
 *
 * Kleur en icoon per POI-categorie, voor de markers en de legenda op de
 * routekaart (RouteMap.jsx) en de lijst onder de kaart (App.jsx).
 *
 * Bewust NIET in poi-categories.js: dat bestand beschrijft de zoeklogica
 * (QID's, OSM-tags) en wordt ook door de Node-scripts gebruikt, die geen
 * kleuren of iconen nodig hebben. Presentatie staat zo los van de zoeklogica.
 * De sleutels hieronder zijn dezelfde `key`-waarden als in poi-categories.js.
 *
 * Iconen: eigen, eenvoudige SVG-vormen op een raster van 24 × 24, in wit
 * getekend op een gekleurd rondje. Geen externe bibliotheek of afbeeldingen,
 * dus ook offline en in de Android-app overal hetzelfde. Kleuren vermijden
 * geel (routelijn) en paars (corridorstrook).
 */

export const CATEGORY_STYLES = {
  kerken: { color: '#1d4ed8', icon: 'church' },
  molens: { color: '#0d9488', icon: 'windmill' },
  musea: { color: '#c026d3', icon: 'museum' },
  kastelen: { color: '#ea580c', icon: 'castle' },
  oorlogsgeschiedenis: { color: '#991b1b', icon: 'swords' },
  archeologie: { color: '#92400e', icon: 'amphora' },
  natuur: { color: '#15803d', icon: 'tree' },
  gebouwd_erfgoed: { color: '#db2777', icon: 'gable' },
  prehistorie_archeologie: { color: '#57534e', icon: 'dolmen' },
  waterstaat_infrastructuur: { color: '#0284c7', icon: 'lighthouse' },
  kunst_gedenktekens: { color: '#4f46e5', icon: 'statue' },
}

// Voor POI's zonder (bekende) categorie, bijv. uit een oudere zoekopdracht.
export const FALLBACK_STYLE = { color: '#475569', icon: 'pin' }

const STROKE = 'fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round"'

// Binnenkant van elk icoon (zonder <svg>-omhulling). Gatenvormen (deuren,
// ramen) werken via fill-rule="evenodd" op de omhullende <svg>.
const ICON_SHAPES = {
  church:
    '<path d="M11 1h2v3h3v2h-3v2.5l6 4.5v10h-5v-5a2 2 0 0 0-4 0v5H5V13l6-4.5V6H8V4h3z"/>',
  windmill:
    '<path d="M10.5 11h3l2 12h-7z"/>' +
    `<path ${STROKE} stroke-width="2.6" d="M5 2l14 14M19 2L5 16"/>` +
    '<circle cx="12" cy="9" r="1.8"/>',
  museum:
    '<path d="M12 2l10 5v2H2V7zM4 10h2.5v9H4zM8.5 10H11v9H8.5zM13 10h2.5v9H13zM17.5 10H20v9h-2.5zM2 20h20v2H2z"/>',
  castle:
    '<path d="M5 2h3v2h2V2h4v2h2V2h3v6l-2 2v12H7V10L5 8zM10 22v-4a2 2 0 0 1 4 0v4z"/>',
  swords:
    `<path ${STROKE} stroke-width="2.4" d="M4 4l13 13M20 4L7 17M14 20l6-6M4 14l6 6M17 17l3.5 3.5M7 17l-3.5 3.5"/>`,
  amphora:
    '<path d="M9 2h6v2h-1v2c4 2 5 6 3 11l-2 4h-4l-2-4C5 12 6 8 10 6V4H9z"/>' +
    `<path ${STROKE} stroke-width="1.6" d="M10 7.5C6.5 6.5 6 10 8 11.5M14 7.5c3.5-1 4 2.5 2 4"/>` +
    '<path d="M10 21.5h4V23h-4z"/>',
  tree:
    '<circle cx="12" cy="9" r="7"/><path d="M10.8 14h2.4v7h-2.4zM8 21h8v1.5H8z"/>',
  gable:
    '<path d="M4 22V12h2V9h2V6h2V3h4v3h2v3h2v3h2v10h-5v-5h-4v5zM10.5 8h3v3h-3z"/>',
  dolmen:
    '<path d="M3 9c1-3 5-4 9-4s8 1 9 4c0 2-4 3-9 3S3 11 3 9z"/>' +
    '<path d="M5 13h4l1 7.5H4zM15 13h4l1 7.5h-6zM2 21h20v1.5H2z"/>',
  lighthouse:
    '<path d="M10 2h4v2h1v3h-1l1.5 13h-7L10 7H9V4h1zM6 20.5h12V23H6z"/>' +
    `<path ${STROKE} stroke-width="1.6" d="M7 4.5L4 3M7 6.5L4 8M17 4.5L20 3M17 6.5L20 8"/>`,
  statue:
    '<circle cx="12" cy="4" r="2.2"/>' +
    '<path d="M9 7h6l1 7h-2v4h-4v-4H8zM6 18.5h12v1.5H6zM5 20.5h14V23H5z"/>',
  pin:
    '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zM12 6.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z"/>',
}

/** Kleur en icoonnaam voor een categorie-key; onbekend → FALLBACK_STYLE. */
export function getCategoryStyle(categoryKey) {
  return CATEGORY_STYLES[categoryKey] || FALLBACK_STYLE
}

/** Volledige <svg> van een icoon, wit, op de gevraagde grootte in pixels. */
export function iconSvg(iconName, sizePx) {
  const shape = ICON_SHAPES[iconName] || ICON_SHAPES.pin
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sizePx}" ` +
    `height="${sizePx}" fill="#ffffff" fill-rule="evenodd" aria-hidden="true" ` +
    `style="display:block">${shape}</svg>`
  )
}

/**
 * HTML voor een rond categorie-icoon: gekleurd rondje met witte rand en wit
 * icoon. Met faded: true kleiner zichtbaar gemaakt door de aanroeper (grootte)
 * en hier halfdoorzichtig met lichtere rand en zachtere schaduw — gebruikt
 * voor POI's buiten de corridor.
 *
 * @param {string|null} categoryKey
 * @param {{sizePx:number, faded?:boolean}} options
 * @returns {string}
 */
export function markerHtml(categoryKey, { sizePx, faded = false }) {
  const style = getCategoryStyle(categoryKey)
  const iconSize = Math.round(sizePx * 0.62)
  return (
    `<div style="width:${sizePx}px;height:${sizePx}px;box-sizing:border-box;` +
    `border-radius:50%;background:${style.color};` +
    `border:2px solid ${faded ? '#e2e8f0' : '#ffffff'};` +
    `box-shadow:0 1px 4px rgba(0,0,0,${faded ? 0.2 : 0.45});` +
    `display:flex;align-items:center;justify-content:center;` +
    `opacity:${faded ? 0.45 : 1};">${iconSvg(style.icon, iconSize)}</div>`
  )
}
