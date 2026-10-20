/**
 * bronnen.js
 *
 * Licentie, broncode en gegevensbronnen van WikiPoi (0.21.0, onderwerp 4),
 * op één plek, zodat het scherm "Over WikiPoi" en later de handleiding
 * (onderwerp 9) dezelfde tekst gebruiken. Zie ook README.md, "Licentie".
 */

export const BRONCODE_URL = 'https://github.com/berkelblik/WikiPoi'

export const LICENTIE = {
  naam: 'GPL-3.0-only',
  url: 'https://www.gnu.org/licenses/gpl-3.0.html',
  houder: 'Copyright © 2026 Peter Drukker',
  uitleg:
    'Je mag WikiPoi gebruiken, bestuderen, aanpassen en verder verspreiden onder dezelfde licentie. ' +
    'WikiPoi wordt geleverd zonder enige garantie.',
}

/** Gegevensbronnen en onderdelen: { naam, wat, licentie, url }. */
export const BRONNEN = [
  {
    naam: 'Wikidata',
    wat: 'POI\'s, namen en korte omschrijvingen',
    licentie: 'CC0',
    url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  },
  {
    naam: 'Wikipedia',
    wat: 'samenvattingen (bron: het artikel, bij stap 6)',
    licentie: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/deed.nl',
  },
  {
    naam: 'Wikimedia Commons',
    wat: 'foto\'s (maker en licentie per foto)',
    licentie: 'per foto',
    url: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
  },
  {
    naam: 'OpenStreetMap',
    wat: 'kaart en POI\'s (© OpenStreetMap-bijdragers)',
    licentie: 'ODbL',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    naam: 'Esri World Imagery',
    wat: 'luchtfoto\'s (© Esri, Maxar, Earthstar Geographics)',
    licentie: 'Esri-voorwaarden',
    url: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
  },
  {
    naam: 'Leaflet',
    wat: 'kaartweergave',
    licentie: 'BSD-2-Clause',
    url: 'https://leafletjs.com/',
  },
  {
    naam: 'Capacitor',
    wat: 'Android-app',
    licentie: 'MIT',
    url: 'https://capacitorjs.com/',
  },
  {
    naam: 'Open Location Code',
    wat: 'pluscodes',
    licentie: 'Apache 2.0',
    url: 'https://github.com/google/open-location-code',
  },
  {
    naam: 'Fietsbel',
    wat: 'geluid van Pixabay',
    licentie: 'Pixabay Content License',
    url: 'https://pixabay.com/service/license-summary/',
  },
]

export const PRIVACY_KORT =
  'Je locatie, track en logboek blijven op je telefoon. Er gaat alleen iets weg als jij zelf op ' +
  '"Delen" tikt. Voor het zoeken en de samenvattingen vraagt WikiPoi gegevens op bij Wikidata, ' +
  'Wikipedia en OpenStreetMap voor het gebied van je route; de kaart haalt tegels op bij ' +
  'OpenStreetMap of Esri voor het stuk kaart dat je bekijkt. Bij de updatecontrole vraagt WikiPoi ' +
  'bij GitHub welke versies er zijn; daarbij gaat geen persoonlijke informatie mee (GitHub ziet wel ' +
  'je IP-adres). Die controle kun je uitzetten bij Instellingen.'
