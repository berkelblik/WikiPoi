# Voorbeelden

`voorbeeld-route.gpx` — een korte testroute (track, geen waypoints) in de
Achterhoek, te gebruiken om de route-buffer- en Wikidata-zoeklogica tegen te
testen zodra die modules er zijn.

Let op het verschil met `gpx2europoi`'s eigen testbestanden: die verwachten
een GPX met *waypoints* (`<wpt>`), omdat een gebruiker daar zelf POI's in
heeft gezet. WikiPoi werkt andersom: het leest een *track* (`<trk>`/`<trkseg>`)
— de fietsroute zelf — en zoekt daar zelfstandig POI's omheen.
