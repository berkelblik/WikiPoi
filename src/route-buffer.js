/**
 * route-buffer.js
 *
 * Leest een GPX-routebestand (track of route) en biedt functies om te
 * bepalen of een kandidaat-punt (bijv. een Wikidata/OSM-resultaat) binnen
 * een instelbare zoekstraal van die route ligt.
 *
 * WikiPoi is bedoeld voor zowel fietsers als wandelaars. EuroPoi accepteert
 * zelf zowel track- als routebestanden als invoer, dus deze module doet dat
 * ook:
 *   - <trk>/<trkseg>/<trkpt>  (track — meestal een opgenomen of geplande rit)
 *   - <rte>/<rtept>           (route — vaak geëxporteerd door routeplanners)
 * Als beide aanwezig zijn heeft de track voorrang; anders wordt de route
 * gebruikt.
 *
 * Werkt zowel als CommonJS-module (Node) als los <script> in de browser,
 * naar analogie van europoi-csv.js.
 */

(function (root, factory) {
  // BELANGRIJK: beide toewijzingen gebeuren hier onvoorwaardelijk, niet als
  // elkaars if/else-tak — zie europoi-csv.js en wikidata-search.js voor de
  // achtergrond van deze fix (Vite/Rollup injecteert soms een nep-`module`-
  // object voor CommonJS-compatibiliteit, waardoor een "else"-tak met de
  // root-toewijzing wordt overgeslagen).
  const mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.WikiPoiRouteBuffer = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EARTH_RADIUS_M = 6371000; // gemiddelde straal aarde in meters

  /**
   * Zet graden om naar radialen.
   */
  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  /**
   * Haversine-afstand tussen twee lat/lng-punten, in meters.
   */
  function haversineDistance(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);

    const h =
      sinDLat * sinDLat +
      Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_M * c;
  }

  /**
   * Projecteert punt p op segment a-b (in een lokale, vlakke benadering
   * rond het segment) en geeft zowel de kortste afstand in meters als het
   * dichtstbijzijnde punt op het segment (als lat/lng) terug.
   *
   * Voor de afstanden die hier relevant zijn (segmenten van een fiets-/
   * wandelroute, doorgaans enkele tientallen meters lang, zoekstraal
   * ~honderden meters) is een vlakke equirectangular-benadering rond het
   * segment nauwkeurig genoeg en veel goedkoper dan een echte sferische
   * projectie.
   *
   * @returns {{ distance: number, point: {lat:number,lng:number} }}
   */
  function closestPointOnSegment(p, a, b) {
    // Referentiebreedtegraad voor de lengtegraad-correctie (vlakke aarde
    // lokaal rond dit segment).
    const refLat = toRad((a.lat + b.lat) / 2);
    const cosRefLat = Math.cos(refLat);

    // Zet lat/lng om naar lokale meters (equirectangular), met a als
    // oorsprong.
    const toXY = (pt) => ({
      x: toRad(pt.lng - a.lng) * cosRefLat * EARTH_RADIUS_M,
      y: toRad(pt.lat - a.lat) * EARTH_RADIUS_M,
    });

    const A = { x: 0, y: 0 };
    const B = toXY(b);
    const P = toXY(p);

    const abx = B.x - A.x;
    const aby = B.y - A.y;
    const lengthSq = abx * abx + aby * aby;

    let t;
    if (lengthSq === 0) {
      // Segment heeft lengte 0 (a === b); afstand tot punt a.
      t = 0;
    } else {
      t = ((P.x - A.x) * abx + (P.y - A.y) * aby) / lengthSq;
      t = Math.max(0, Math.min(1, t)); // clamp op het segment
    }

    const closest = { x: A.x + t * abx, y: A.y + t * aby };
    const dx = P.x - closest.x;
    const dy = P.y - closest.y;

    // Lokale meters terug naar lat/lng (inverse van toXY hierboven).
    const degPerRad = 180 / Math.PI;
    const point = {
      lat: a.lat + (closest.y / EARTH_RADIUS_M) * degPerRad,
      lng:
        cosRefLat === 0
          ? a.lng
          : a.lng + (closest.x / (EARTH_RADIUS_M * cosRefLat)) * degPerRad,
    };

    return { distance: Math.sqrt(dx * dx + dy * dy), point: point };
  }

  /**
   * Kortste afstand (in meters) van punt p tot segment a-b. Dunne wrapper
   * rond closestPointOnSegment(), behouden voor bestaande aanroepen.
   */
  function distancePointToSegment(p, a, b) {
    return closestPointOnSegment(p, a, b).distance;
  }

  /**
   * Heel eenvoudige, afhankelijkheidsvrije GPX-parser: haalt lat/lng uit
   * <trkpt>- of <rtept>-elementen. Geen volledige XML-parser nodig, want
   * GPX-coördinaten staan altijd als attributen lat="" lon="" op het punt-
   * element.
   */
  function extractPoints(gpxText, tagName) {
    const points = [];
    const regex = new RegExp(
      `<${tagName}\\b[^>]*\\blat="(-?[0-9.]+)"[^>]*\\blon="(-?[0-9.]+)"`,
      'gi'
    );
    // lat/lon kunnen ook in omgekeerde volgorde staan (lon vóór lat).
    const regexAlt = new RegExp(
      `<${tagName}\\b[^>]*\\blon="(-?[0-9.]+)"[^>]*\\blat="(-?[0-9.]+)"`,
      'gi'
    );

    let match;
    while ((match = regex.exec(gpxText)) !== null) {
      points.push({ lat: parseFloat(match[1]), lng: parseFloat(match[2]) });
    }
    if (points.length === 0) {
      while ((match = regexAlt.exec(gpxText)) !== null) {
        points.push({ lat: parseFloat(match[2]), lng: parseFloat(match[1]) });
      }
    }
    return points;
  }

  /**
   * Haalt de naam van de route/track op uit <trk><name> of <rte><name>,
   * met de GPX-<metadata><name> en tot slot null als fallback (de
   * aanroeper kan dan zelf terugvallen op de bestandsnaam).
   */
  function extractRouteName(gpxText) {
    const patterns = [
      /<trk\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i,
      /<rte\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i,
      /<metadata\b[^>]*>[\s\S]*?<name>([\s\S]*?)<\/name>/i,
    ];
    for (const re of patterns) {
      const m = gpxText.match(re);
      if (m && m[1].trim()) {
        return m[1].trim();
      }
    }
    return null;
  }

  /**
   * Parseert een GPX-bestand (als string) naar een lijnstuk-reeks van
   * {lat, lng}-punten. Track heeft voorrang boven route; als beide
   * ontbreken wordt een lege array teruggegeven.
   *
   * @param {string} gpxText - inhoud van het GPX-bestand
   * @returns {{ points: Array<{lat:number,lng:number}>, source: 'track'|'route'|'none', name: string|null }}
   */
  function parseGpxLineString(gpxText) {
    const trackPoints = extractPoints(gpxText, 'trkpt');
    if (trackPoints.length > 0) {
      return {
        points: trackPoints,
        source: 'track',
        name: extractRouteName(gpxText),
      };
    }

    const routePoints = extractPoints(gpxText, 'rtept');
    if (routePoints.length > 0) {
      return {
        points: routePoints,
        source: 'route',
        name: extractRouteName(gpxText),
      };
    }

    return { points: [], source: 'none', name: extractRouteName(gpxText) };
  }

  /**
   * Kortste afstand (in meters) van punt p tot de volledige lijnstuk-reeks
   * routePoints (opeenvolgende segmenten tussen elk paar punten).
   */
  function distanceToRoute(p, routePoints) {
    if (!routePoints || routePoints.length === 0) {
      return Infinity;
    }
    if (routePoints.length === 1) {
      return haversineDistance(p, routePoints[0]);
    }

    let min = Infinity;
    for (let i = 0; i < routePoints.length - 1; i++) {
      const d = distancePointToSegment(p, routePoints[i], routePoints[i + 1]);
      if (d < min) min = d;
    }
    return min;
  }

  /**
   * Zoekt het punt op de route dat het dichtst bij p ligt, plus de afstand
   * daarnaartoe in meters. Dit is het punt waar EuroPoi een route-gekoppelde
   * POI aankondigt (zie EuroPoi src/hooks/useTrigger.js → distanceToPolyline);
   * de routekaart in de app tekent er een stippellijn naartoe.
   *
   * @returns {{ distance: number, point: {lat:number,lng:number}|null }}
   */
  function closestPointOnRoute(p, routePoints) {
    if (!routePoints || routePoints.length === 0) {
      return { distance: Infinity, point: null };
    }
    if (routePoints.length === 1) {
      return {
        distance: haversineDistance(p, routePoints[0]),
        point: { lat: routePoints[0].lat, lng: routePoints[0].lng },
      };
    }

    let best = { distance: Infinity, point: null };
    for (let i = 0; i < routePoints.length - 1; i++) {
      const r = closestPointOnSegment(p, routePoints[i], routePoints[i + 1]);
      if (r.distance < best.distance) best = r;
    }
    return best;
  }

  /**
   * Geeft true terug als punt p binnen radiusMeters van de route ligt.
   * Handig als snelle filter; gebruik distanceToRoute() als de exacte
   * afstand ook nodig is (bijv. voor de preview-stap).
   */
  function isWithinBuffer(p, routePoints, radiusMeters) {
    return distanceToRoute(p, routePoints) <= radiusMeters;
  }

  /**
   * Berekent een grove bounding box (met marge van radiusMeters) rond de
   * route. Nuttig om de Wikidata/Overpass-zoekopdracht vooraf te
   * beperken tot een relevant gebied, voordat per punt de exacte
   * afstand tot de route wordt getoetst.
   */
  function getBoundingBox(routePoints, radiusMeters) {
    if (!routePoints || routePoints.length === 0) {
      return null;
    }

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    for (const pt of routePoints) {
      if (pt.lat < minLat) minLat = pt.lat;
      if (pt.lat > maxLat) maxLat = pt.lat;
      if (pt.lng < minLng) minLng = pt.lng;
      if (pt.lng > maxLng) maxLng = pt.lng;
    }

    // Marge omrekenen naar graden: meters per breedtegraad afgeleid van
    // dezelfde EARTH_RADIUS_M als de afstandsfuncties hierboven (~111.195
    // m), zodat bbox en afstandsberekening exact op elkaar aansluiten; voor
    // lengtegraad gecorrigeerd met de cosinus van de breedtegraad die het
    // verst van de evenaar ligt. Daar is een lengtegraad het kortst in
    // meters, dus de marge in graden het grootst — zo is de marge langs de
    // héle route minimaal radiusMeters (met de gemiddelde breedtegraad zou
    // hij bij een lange noord-zuidroute aan het poolwaartse uiteinde
    // enkele meters te krap uitvallen).
    const extremeLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
    const metersPerDegree = (EARTH_RADIUS_M * Math.PI) / 180;
    const latMargin = radiusMeters / metersPerDegree;
    const lngMargin =
      radiusMeters / (metersPerDegree * Math.max(0.01, Math.cos(toRad(extremeLat))));

    return {
      minLat: minLat - latMargin,
      maxLat: maxLat + latMargin,
      minLng: minLng - lngMargin,
      maxLng: maxLng + lngMargin,
    };
  }

  return {
    parseGpxLineString,
    distanceToRoute,
    closestPointOnRoute,
    isWithinBuffer,
    getBoundingBox,
    haversineDistance, // los bruikbaar, bijv. voor sortering in de preview
    extractRouteName,
  };
});