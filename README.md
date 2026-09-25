# WikiPoi

**WikiPoi** vindt automatisch bezienswaardigheden langs een fietsroute en zet ze om naar een CSV-bestand dat direct te importeren is in [EuroPoi](https://github.com/berkelblik/EuroPoi).

## Waarom dit project bestaat

EuroPoi is een GPS-triggered audio-POI-app: terwijl je fietst, leest de app een kort verhaal voor zodra je een monument, kerk of ander bezienswaardig punt passeert. Om dat te laten werken, moet er eerst een CSV met POI's (naam, locatie, verhaaltje) worden aangemaakt.

Voor gevorderde gebruikers is dat geen probleem — die verzamelen zelf POI's en zetten die om met de bestaande [`gpx2europoi`](https://www.europoi.nl/introduktie/bulk-poi-input/conversie-waypoint-gpx-csv)-tool.

**WikiPoi is er voor de rest.** Je laadt alleen een GPX-route in, en WikiPoi:

1. trekt een zoekstrook van ~400 meter aan weerszijden van de route,
2. zoekt via **Wikidata** en **OpenStreetMap** welke monumenten/bezienswaardigheden daarbinnen liggen,
3. haalt bij elke vondst een korte samenvatting op via de **Wikipedia REST API**,
4. zet het geheel om naar hetzelfde CSV-formaat dat EuroPoi al gebruikt.

Geen handmatig werk, geen technische voorkennis nodig — alleen een route.

## Verhouding tot EuroPoi

| | EuroPoi | WikiPoi |
|---|---|---|
| Rol | De app die onderweg de verhalen afspeelt | De voorbereidingstool die automatisch POI's vindt |
| Gebruiker | Fietser/wandelaar onderweg | Iedereen die snel een route wil "vullen" zonder zelf content te maken |
| Invoer | CSV (`lat;lng;pluscode;name;desc;category;radius;mp3`) | GPX-route |
| Uitvoer | Audio onderweg | Diezelfde CSV, klaar om in EuroPoi te importeren |

WikiPoi hergebruikt bewust de CSV/Plus Code-aanpak uit EuroPoi's bestaande `gpx2europoi`-tooling, zodat het resultaat zonder aanpassingen in EuroPoi werkt. Zie [`src/europoi-csv.js`](src/europoi-csv.js) voor de gedeelde module (Plus Code-encoder + CSV-writer, overgenomen en compatibel gehouden met de EuroPoi-referentie-export: UTF-8 BOM + CRLF).

## Status

🚧 Vroege ontwikkelfase. Eerste bouwsteen (CSV/Plus Code-module) is overgenomen uit EuroPoi. Wikidata/OSM-zoeklogica en Wikipedia-samenvatting volgen.

## Architectuur (voorlopig)

```
GPX-route
   │
   ▼
[ Route-buffer berekenen ]         ~400m aan weerszijden van de lijn (ruime
   │                               zoekstraal, proefondervindelijk te
   │                               verfijnen — zie "Twee afstandsbegrippen")
   ▼
[ Wikidata SPARQL-query ]          monumenten/POI's binnen de buffer
   │  (aangevuld met OpenStreetMap waar Wikidata leeg is)
   ▼
[ Wikipedia-samenvatting ophalen ] 2-3 zinnen per POI, via /page/summary/
   │
   ▼
[ Preview & trigger-afstand ]      gebruiker ziet gevonden punten + afstand
   │                               tot de route, stelt trigger-afstand in
   ▼
[ EuroPoi-CSV genereren ]          src/europoi-csv.js (hergebruikt);
   │                               category = routenaam, radius = trigger-afstand
   ▼
CSV klaar voor import in EuroPoi
```

### Twee afstandsbegrippen

WikiPoi onderscheidt bewust twee verschillende afstanden, die niet hetzelfde zijn:

| Parameter | Doel | Typische waarde |
|---|---|---|
| **Zoekstraal** | Hoe ver van de route Wikidata/OSM wordt doorzocht naar kandidaten | ~400m (ruim, om niets te missen) |
| **Trigger-afstand** | Vanaf welke afstand de audio in EuroPoi daadwerkelijk afspeelt | Door de gebruiker instelbaar, per POI meegegeven als `radius`-veld in de CSV |

Door ruim te zoeken (400m) maar de trigger-afstand apart en instelbaar te houden, kan de gebruiker na het zoeken — zonder opnieuw te hoeven zoeken — proefondervindelijk bepalen welke gevonden punten daadwerkelijk relevant genoeg zijn om onderweg te triggeren.

### Koppeling met EuroPoi's trigger-mechanisme

EuroPoi triggert een POI alleen wanneer het `category`-veld van die POI *exact* overeenkomt met de naam van de ingeladen route (GPX-bestand). Omdat WikiPoi de route al vooraf inleest, vult het automatisch `category` met de routenaam (uit de `<name>`-tag in de GPX, met de bestandsnaam als fallback) voor elke gevonden POI. Zo werkt de gegenereerde CSV meteen correct in EuroPoi, zonder dat de gebruiker dat handmatig hoeft aan te passen.

Voordat de definitieve CSV wordt gegenereerd, toont WikiPoi een **preview**: alle gevonden punten met hun afstand tot de route. De gebruiker stelt daar de trigger-afstand in en ziet direct welke punten daarmee wel of niet zouden triggeren.

## Bouwstenen (modulair, zoals ook EuroPoi is opgezet)

- **`src/europoi-csv.js`** — Plus Code-encoder + CSV-writer (overgenomen uit EuroPoi's `gpx2europoi.html`, ongewijzigd qua uitvoerformaat)
- **`src/route-buffer.js`** *(nog te bouwen)* — berekent een zoekgebied (~400m) rond een GPX-track
- **`src/wikidata-search.js`** *(nog te bouwen)* — SPARQL-query naar de Wikidata Query Service
- **`src/wikipedia-summary.js`** *(nog te bouwen)* — haalt en verkort Wikipedia-samenvattingen
- **`src/osm-fallback.js`** *(nog te bouwen)* — aanvullende zoekactie via OpenStreetMap/Overpass waar Wikidata niets oplevert
- **`src/trigger-preview.js`** *(nog te bouwen)* — toont gevonden punten met afstand tot de route en laat de gebruiker de trigger-afstand instellen

Elk blokje is losstaand testbaar en vervangbaar — als een van de externe bronnen (Wikidata, Wikipedia, OSM) van API verandert, hoeft alleen dat blokje aangepast te worden.

## Meewerken

Zie [`CONTRIBUTING.md`](CONTRIBUTING.md). Dit project is open-source; iedereen die kan programmeren mag meebouwen of verbeteren.

## Licentie

Copyright (C) 2026 Peter Drukker (en diens rechthebbenden).

WikiPoi is vrije software: je mag het verspreiden en/of aanpassen onder de voorwaarden van de **GNU General Public License**, zoals gepubliceerd door de Free Software Foundation, uitsluitend versie 3 (`GPL-3.0-only`). Wie een aangepaste versie verspreidt, moet die onder dezelfde licentie openbaar maken. WikiPoi wordt verspreid in de hoop dat het nuttig is, maar ZONDER ENIGE GARANTIE. Zie het bestand [`LICENSE`](LICENSE) voor de volledige tekst.

De Plus Code-encoder in `src/europoi-csv.js` is een poort van Google's officiële [Open Location Code](https://github.com/google/open-location-code)-implementatie (Apache License 2.0) en behoudt die licentie/copyright-notice. Apache 2.0-code mag in een GPL-3.0-project worden opgenomen.

### Gegevensbronnen

De licentie hierboven geldt voor de programmacode. Voor de gegevens die WikiPoi ophaalt, en dus voor de inhoud van de gemaakte CSV-bestanden, gelden de voorwaarden van de bronnen:

- **Wikidata** — [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (vrij te gebruiken)
- **Wikipedia**-samenvattingen — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (bronvermelding en gelijk delen)
- **OpenStreetMap** — [ODbL](https://www.openstreetmap.org/copyright) (bronvermelding: © OpenStreetMap-bijdragers)

Wie gemaakte CSV-bestanden openbaar deelt, vermeldt daarbij de bronnen.

## Gerelateerd

- [EuroPoi](https://github.com/berkelblik/EuroPoi) — de app zelf (PWA + AndroidLite)
- [www.europoi.nl](https://www.europoi.nl) — publieksgerichte site met de handmatige CSV-conversietool en gebruiksinstructies
