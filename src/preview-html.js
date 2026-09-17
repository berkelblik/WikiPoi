/**
 * preview-html.js
 *
 * Genereert een zelfstandige HTML-preview-pagina met een Leaflet-kaart:
 * toont de GPX-route, de gevonden kandidaten (Wikidata + OSM) als markers,
 * en een schuifje waarmee de trigger-afstand live wordt aangepast zodat
 * meteen zichtbaar is welke kandidaten binnen bereik komen.
 *
 * Verwacht kandidaat-objecten met minimaal:
 *   { id, label, description, lat, lng, wikipediaUrl, source?, language?,
 *     distanceToRouteMeters, summary?, summaryError? }
 * (source ontbreekt bij Wikidata-resultaten -> wordt hier behandeld als
 * 'wikidata'; osm-fallback.js zet altijd source: 'osm').
 *
 * Werkt als CommonJS-module (Node), naar analogie van de andere
 * src/-modules (route-buffer.js, europoi-csv.js, ...).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WikiPoiPreviewHtml = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function candidateSource(candidate) {
    return candidate.source || 'wikidata';
  }

  function candidateSummaryText(candidate) {
    if (candidate.summary && candidate.summary.extractShort) {
      return candidate.summary.extractShort;
    }
    if (candidate.description) {
      return candidate.description;
    }
    return '(geen samenvatting beschikbaar)';
  }

  /**
   * Bouwt de HTML-preview-pagina.
   *
   * @param {Object} opts
   * @param {string} opts.routeName
   * @param {Array<{lat:number,lng:number}>} opts.routePoints
   * @param {Array<Object>} opts.candidates - moeten al distanceToRouteMeters hebben
   * @param {number} [opts.initialTriggerMeters=50]
   * @param {number} [opts.maxSliderMeters] - standaard: max(400, hoogste afstand naar boven afgerond)
   * @returns {string} volledige HTML-pagina als string
   */
  function generatePreviewHtml(opts) {
    opts = opts || {};
    const routeName = opts.routeName || '(naamloze route)';
    const routePoints = opts.routePoints || [];
    const candidates = opts.candidates || [];
    const initialTriggerMeters =
      opts.initialTriggerMeters != null ? opts.initialTriggerMeters : 50;

    const highestDistance = candidates.reduce(
      (max, c) => Math.max(max, c.distanceToRouteMeters || 0),
      0
    );
    const maxSliderMeters =
      opts.maxSliderMeters || Math.max(400, Math.ceil(highestDistance / 50) * 50);

    const routeLatLngs = routePoints.map((p) => [p.lat, p.lng]);

    const markerData = candidates.map((c) => ({
      id: c.id,
      label: c.label || '(zonder naam)',
      source: candidateSource(c),
      lat: c.lat,
      lng: c.lng,
      distance: Math.round(c.distanceToRouteMeters || 0),
      wikipediaUrl: c.wikipediaUrl || null,
      summaryText: candidateSummaryText(c),
      attribution: (c.summary && c.summary.attribution) || null,
      thumbnailUrl: (c.summary && c.summary.thumbnailUrl) || null,
    }));

    const centerLat =
      routeLatLngs.length > 0
        ? routeLatLngs.reduce((s, p) => s + p[0], 0) / routeLatLngs.length
        : markerData.length > 0
        ? markerData[0].lat
        : 52.0;
    const centerLng =
      routeLatLngs.length > 0
        ? routeLatLngs.reduce((s, p) => s + p[1], 0) / routeLatLngs.length
        : markerData.length > 0
        ? markerData[0].lng
        : 5.5;

    return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>WikiPoi trigger-afstand preview — ${escapeHtml(routeName)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, sans-serif; }
  #map { position: absolute; top: 64px; bottom: 0; left: 0; right: 0; }
  #controls {
    position: absolute; top: 0; left: 0; right: 0; height: 64px;
    background: #1f2937; color: white; display: flex; align-items: center;
    gap: 16px; padding: 0 16px; box-sizing: border-box; z-index: 1000;
    flex-wrap: wrap;
  }
  #controls label { font-size: 14px; white-space: nowrap; }
  #trigger-slider { flex: 1; max-width: 400px; min-width: 120px; }
  #trigger-value { font-weight: bold; min-width: 60px; }
  #counter { margin-left: auto; font-size: 14px; white-space: nowrap; }
  .wikipoi-dot {
    width: 16px; height: 16px; border-radius: 50%; border: 2px solid white;
    box-shadow: 0 0 2px rgba(0,0,0,0.5);
  }
  .wikipoi-dot.src-wikidata { background: #2563eb; }
  .wikipoi-dot.src-osm { background: #ea580c; }
  .wikipoi-dot.out-of-range { opacity: 0.25; }
  .wikipoi-popup img { max-width: 200px; display: block; margin-bottom: 6px; }
  .wikipoi-popup .attribution { font-size: 11px; color: #666; margin-top: 4px; }
  .wikipoi-popup .distance { font-size: 12px; color: #444; margin-top: 4px; }
  .wikipoi-popup .source-badge {
    display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 4px;
    color: white; margin-bottom: 4px;
  }
  .badge-wikidata { background: #2563eb; }
  .badge-osm { background: #ea580c; }
</style>
</head>
<body>
<div id="controls">
  <strong>${escapeHtml(routeName)}</strong>
  <label for="trigger-slider">Trigger-afstand:</label>
  <input type="range" id="trigger-slider" min="0" max="${maxSliderMeters}" step="10" value="${initialTriggerMeters}">
  <span id="trigger-value">${initialTriggerMeters} m</span>
  <span id="counter"></span>
</div>
<div id="map"></div>
<script>
  const routeLatLngs = ${JSON.stringify(routeLatLngs)};
  const candidates = ${JSON.stringify(markerData)};

  const map = L.map('map');
  // De gratis tile.openstreetmap.org-testserver blokkeert al snel apps die
  // er structureel gebruik van maken (met een "403 Access blocked" pagina
  // i.p.v. kaarttegels) — zeker vanaf een gedeeld IP-adres zoals een
  // GitHub Codespace. CartoDB's basiskaart is geschikt voor dit soort
  // licht, niet-commercieel ontwikkelgebruik en toont de attributie aan
  // OpenStreetMap correct door.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-medewerkers &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  if (routeLatLngs.length > 1) {
    L.polyline(routeLatLngs, { color: '#16a34a', weight: 4, opacity: 0.8 }).addTo(map);
  }

  function makeIcon(source, inRange) {
    const srcClass = source === 'osm' ? 'src-osm' : 'src-wikidata';
    const rangeClass = inRange ? '' : ' out-of-range';
    return L.divIcon({
      className: '',
      html: '<div class="wikipoi-dot ' + srcClass + rangeClass + '"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }

  const markers = candidates.map((c) => {
    const marker = L.marker([c.lat, c.lng], { icon: makeIcon(c.source, true) });
    const badgeClass = c.source === 'osm' ? 'badge-osm' : 'badge-wikidata';
    const badgeLabel = c.source === 'osm' ? 'OSM' : 'Wikidata';
    let html = '<div class="wikipoi-popup">';
    html += '<span class="source-badge ' + badgeClass + '">' + badgeLabel + '</span>';
    html += '<br><strong>' + c.label + '</strong><br>';
    if (c.thumbnailUrl) {
      html += '<img src="' + c.thumbnailUrl + '">';
    }
    html += '<div>' + c.summaryText + '</div>';
    if (c.wikipediaUrl) {
      html += '<a href="' + c.wikipediaUrl + '" target="_blank" rel="noopener">Wikipedia-artikel</a><br>';
    }
    if (c.attribution) {
      html += '<div class="attribution">' + c.attribution + '</div>';
    }
    html += '<div class="distance">Afstand tot route: ' + c.distance + ' m</div>';
    html += '</div>';
    marker.bindPopup(html);
    marker.addTo(map);
    return marker;
  });

  const bounds = [];
  routeLatLngs.forEach((p) => bounds.push(p));
  candidates.forEach((c) => bounds.push([c.lat, c.lng]));
  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [30, 30] });
  } else {
    map.setView([${centerLat}, ${centerLng}], 13);
  }

  const slider = document.getElementById('trigger-slider');
  const valueLabel = document.getElementById('trigger-value');
  const counter = document.getElementById('counter');

  function applyTriggerDistance(triggerMeters) {
    let inRangeCount = 0;
    candidates.forEach((c, i) => {
      const inRange = c.distance <= triggerMeters;
      if (inRange) inRangeCount++;
      markers[i].setIcon(makeIcon(c.source, inRange));
    });
    counter.textContent = inRangeCount + ' van ' + candidates.length + ' binnen bereik';
  }

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10);
    valueLabel.textContent = v + ' m';
    applyTriggerDistance(v);
  });

  applyTriggerDistance(${initialTriggerMeters});
</script>
</body>
</html>`;
  }

  return {
    generatePreviewHtml,
  };
});
