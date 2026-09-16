# WikiPoi

**WikiPoi** vindt automatisch bezienswaardigheden langs een fietsroute en zet ze om naar een CSV-bestand dat direct te importeren is in [EuroPoi](https://github.com/berkelblik/EuroPoi).

## Waarom dit project bestaat

EuroPoi is een GPS-triggered audio-POI-app: terwijl je fietst, leest de app een kort verhaal voor zodra je een monument, kerk of ander bezienswaardig punt passeert. Om dat te laten werken, moet er eerst een CSV met POI's (naam, locatie, verhaaltje) worden aangemaakt.

Voor gevorderde gebruikers is dat geen probleem — die verzamelen zelf POI's en zetten die om met de bestaande [`gpx2europoi`](https://www.europoi.nl/introduktie/bulk-poi-input/conversie-waypoint-gpx-csv)-tool.

**WikiPoi is er voor de rest.** Je laadt alleen een GPX-route in, en WikiPoi:

1. trekt een zoekstrook van ~100 meter aan weerszijden van de route,
2. zoekt via **Wikidata** en **OpenStreetMap** welke monumenten/bezienswaardigheden daarbinnen liggen,
3. haalt bij elke vondst een korte samenvatting op via de **Wikipedia REST API**,
4. zet het geheel om naar hetzelfde CSV-formaat dat EuroPoi al gebruikt.

Geen handmatig werk, geen technische voorkennis nodig — alleen een route.

## Verhouding tot EuroPoi

| | EuroPoi | WikiPoi |
|-
