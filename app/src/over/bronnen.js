/**
 * bronnen.js
 *
 * Licentie, broncode en gegevensbronnen van WikiPoi (0.21.0, onderwerp 4),
 * op één plek, zodat het scherm "Over WikiPoi" en later de handleiding
 * (onderwerp 9) dezelfde tekst gebruiken. Zie ook README.md, "Licentie".
 *
 * Sinds 0.23.0 staan de omschrijvingen in talen/*.js: over.licentieUitleg,
 * bron.<sleutel> (wat de bron levert), over.privacyKort, en bij een
 * licentie die vertaald moet worden licentieSleutel.
 */

export const BRONCODE_URL = 'https://github.com/berkelblik/WikiPoi'

export const LICENTIE = {
  naam: 'GPL-3.0-only',
  url: 'https://www.gnu.org/licenses/gpl-3.0.html',
  houder: 'Copyright © 2026 Peter Drukker',
}

/** Gegevensbronnen en onderdelen: { naam, sleutel, licentie, licentieSleutel?, url }. */
export const BRONNEN = [
  {
    naam: 'Wikidata',
    sleutel: 'wikidata',
    licentie: 'CC0',
    url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  },
  {
    naam: 'Wikipedia',
    sleutel: 'wikipedia',
    licentie: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.nl',
  },
  {
    naam: 'Wikimedia Commons',
    sleutel: 'commons',
    licentie: 'per foto',
    licentieSleutel: 'bron.perFoto',
    url: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
  },
  {
    naam: 'OpenStreetMap',
    sleutel: 'osm',
    licentie: 'ODbL',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    naam: 'Esri World Imagery',
    sleutel: 'esri',
    licentie: 'Esri-voorwaarden',
    licentieSleutel: 'bron.esriVoorwaarden',
    url: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
  },
  {
    naam: 'Leaflet',
    sleutel: 'leaflet',
    licentie: 'BSD-2-Clause',
    url: 'https://leafletjs.com/',
  },
  {
    naam: 'Capacitor',
    sleutel: 'capacitor',
    licentie: 'MIT',
    url: 'https://capacitorjs.com/',
  },
  {
    naam: 'Open Location Code',
    sleutel: 'olc',
    licentie: 'Apache 2.0',
    url: 'https://github.com/google/open-location-code',
  },
  {
    naam: 'Fietsbel',
    sleutel: 'fietsbel',
    naamSleutel: 'bron.fietsbelNaam',
    licentie: 'Pixabay Content License',
    url: 'https://pixabay.com/service/license-summary/',
  },
]
