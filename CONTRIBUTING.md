# Bijdragen aan WikiPoi

Fijn dat je wilt meehelpen! WikiPoi is bewust modulair opgezet zodat je aan één onderdeel kunt bijdragen zonder de rest te hoeven begrijpen.

## Snel starten

1. Fork de repo en clone je fork lokaal (of open een GitHub Codespace direct vanuit deze repo).
2. Elk bestand in `src/` is een losstaand blokje — zie de tabel in de README voor wat elk blokje doet.
3. Test je wijziging tegen een echte GPX-route (voorbeelden in `examples/`) voordat je een pull request opent.

## Waar hulp welkom is

- **`src/wikidata-search.js`** — SPARQL-query's tegen de Wikidata Query Service, geometrische buffer rond een route
- **`src/wikipedia-summary.js`** — samenvattingen ophalen en netjes inkorten tot 2-3 zinnen
- **`src/osm-fallback.js`** — Overpass-API-query's als aanvulling op Wikidata
- **Documentatie** — voorbeelden, uitleg, vertalingen
- **Testroutes** — GPX-bestanden uit verschillende landen/regio's om dekking te testen

## Spelregels

- **Compatibiliteit met EuroPoi's CSV-formaat is een harde eis.** Wijzig `src/europoi-csv.js` niet zonder overleg — de uitvoer moet exact aansluiten op wat de EuroPoi-app verwacht (`lat;lng;pluscode;name;desc;category;radius;mp3`, UTF-8 BOM, CRLF-regeleindes).
- **Complete bestanden, geen fragmenten** in pull requests — lever werkende, volledige modules aan.
- **Wees zuinig op externe bronnen**: cache waar mogelijk, en houd rekening met rate limits van Wikidata/Wikipedia/OSM-API's.
- Beschrijf in je pull request kort *wat* en *waarom*, in het Nederlands of Engels — beide zijn welkom.

## Vragen?

Open een issue, of stuur een bericht naar de projectbeheerder via de contactgegevens op [www.europoi.nl](https://www.europoi.nl).
