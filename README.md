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

✅ **Werkend.** WikiPoi bestaat uit een Android-app (React + Capacitor) en een opdrachtregelscript. Beide doorzoeken Wikidata (en optioneel OpenStreetMap) langs een GPX-route en leveren een CSV op die direct in EuroPoi te importeren is. De app is getest op Android; verdere verfijning volgt.

## Gebruik

### De app (Android)

De app leidt je in zes stappen van route naar CSV:

1. **Route** — kies een GPX-bestand (track of route).
2. **Categorieën** — vink aan wat je zoekt (bijv. kerken, molens, kastelen, oorlogsgeschiedenis); je hoeft niets van Wikidata te weten.
3. **Zoeken** — WikiPoi doorzoekt Wikidata (en waar nodig OpenStreetMap) binnen de zoekstrook, met een voortgangsmelding en teller.
4. **Kaart** — de route en de gevonden POI's op een kaart; met een schuifje stel je de breedte van de strook (corridor) in. Alleen POI's binnen die strook komen in de CSV.
5. **Samenvattingen** — per POI de korte Wikipedia-tekst die EuroPoi onderweg voorleest.
6. **Exporteren** — sla de CSV op en deel hem direct, bijvoorbeeld met EuroPoi.

POI's die (vrijwel) op dezelfde plek liggen — zoals twee Wikidata-items voor één pand — worden automatisch samengevoegd tot één POI met gecombineerde naam.

### Het script (Node.js)

Voor ontwikkelaars en voor het in bulk verwerken van routes:

```
node poc-gpx-naar-csv.js <invoer.gpx> [uitvoer] [zoekstraal_m] [trigger_afstand_m] [categorieën,komma,gescheiden] [osm_skip_drempel] [--preview]
```

Voorbeeld met de meegeleverde testroute:

```
node poc-gpx-naar-csv.js examples/voorbeeldroute-achterhoek.gpx /tmp/test.csv 400 400 kerken,molens,kastelen,oorlogsgeschiedenis
```

Het vierde argument (`trigger_afstand_m`) bepaalt welke gevonden POI's in de CSV komen: alleen punten binnen die afstand van de route gaan mee, net als de strook in de app. Het `radius`-veld in de CSV staat altijd op 0 (zie "Twee afstandsbegrippen").

Met `0` als zesde argument wordt de OpenStreetMap-aanvulling overgeslagen. Lukt de OSM-aanvulling niet (bijvoorbeeld omdat Overpass overbelast is), dan gaat het script door met alleen de Wikidata-resultaten.

## Architectuur

```
GPX-route
   │
   ▼
[ Route-buffer berekenen ]         zoekstrook (standaard ~400m) aan weerszijden
   │                               van de lijn — zie "Twee afstandsbegrippen"
   ▼
[ Wikidata SPARQL-query ]          POI's van de gekozen categorieën binnen de
   │                               strook; dichtbij elkaar liggende items
   │                               worden samengevoegd
   │  (aangevuld met OpenStreetMap)
   ▼
[ Wikipedia-samenvatting ophalen ] 2-3 zinnen per POI, via /page/summary/
   │
   ▼
[ Kaart / preview ]                gebruiker ziet gevonden punten + afstand
   │                               tot de route; app: strook instellen,
   │                               script: afstand als vierde argument
   ▼
[ EuroPoi-CSV genereren ]          src/europoi-csv.js (hergebruikt);
   │                               category = routenaam, radius = 0
   ▼
CSV klaar voor import in EuroPoi
```

### Twee afstandsbegrippen

WikiPoi onderscheidt bewust twee verschillende afstanden, die niet hetzelfde zijn:

| Parameter | Doel | Typische waarde |
|---|---|---|
| **Zoekstraal** | Hoe ver van de route Wikidata/OSM wordt doorzocht naar kandidaten | ~400m (ruim, om niets te missen) |
| **Strook (corridor)** | Welke gevonden punten in de CSV komen | App: schuifje bij stap 4 (50–500m); script: vierde argument |

Door ruim te zoeken maar de strook apart instelbaar te houden, kan de gebruiker na het zoeken — zonder opnieuw te hoeven zoeken — bepalen welke gevonden punten relevant genoeg zijn om mee te nemen.

De **triggerstraal** (vanaf welke afstand EuroPoi de audio afspeelt) bepaalt WikiPoi bewust niet: het `radius`-veld in de CSV staat altijd op 0. EuroPoi kiest dan zelf de juiste straal, op basis van de vervoerswijze en, in route-modus, de afstand van het punt tot de route.

### Koppeling met EuroPoi's trigger-mechanisme

EuroPoi triggert een POI alleen wanneer het `category`-veld van die POI *exact* overeenkomt met de naam van de ingeladen route (GPX-bestand). Omdat WikiPoi de route al vooraf inleest, vult het automatisch `category` met de routenaam (uit de `<name>`-tag in de GPX, met de bestandsnaam als fallback) voor elke gevonden POI. Zo werkt de gegenereerde CSV meteen correct in EuroPoi, zonder dat de gebruiker dat handmatig hoeft aan te passen.

Voordat de definitieve CSV wordt gegenereerd, toont WikiPoi een **preview**: alle gevonden punten met hun afstand tot de route. De gebruiker stelt daar de breedte van de strook in en ziet direct welke punten daarmee wel of niet in de CSV komen.

## Bouwstenen (modulair, zoals ook EuroPoi is opgezet)

De gedeelde modules staan in `src/` en worden zowel door het script als door de app gebruikt:

- **`src/route-buffer.js`** — leest een GPX-track of -route en bepaalt of een punt binnen de zoekstrook ligt
- **`src/poi-categories.js`** — de vaste, aanvinkbare categorieën met hun Wikidata-QID's en OSM-tags
- **`src/wikidata-search.js`** — SPARQL-query naar de Wikidata Query Service, met herhaalpogingen bij drukte en samenvoegen van items op dezelfde plek
- **`src/osm-fallback.js`** — aanvullende zoekactie via OpenStreetMap/Overpass
- **`src/wikipedia-summary.js`** — haalt Wikipedia-samenvattingen op en kort ze in
- **`src/europoi-csv.js`** — Plus Code-encoder + CSV-writer (overgenomen uit EuroPoi's `gpx2europoi.html`, ongewijzigd qua uitvoerformaat)
- **`src/preview-html.js`** — maakt een losse HTML-preview met kaart (optie `--preview` van het script)
- **`src/test-wikidata-dedupe.js`** en **`src/test-osm-dedupe.js`** — netwerkloze tests van het samenvoegen en ontdubbelen

Daarnaast:

- **`app/`** — de React/Capacitor-app (Android); de kaart staat in `app/src/components/RouteMap.jsx`
- **`poc-gpx-naar-csv.js`** — het opdrachtregelscript dat de modules tot één pijplijn verbindt
- **`examples/`** — GPX-testroutes

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
