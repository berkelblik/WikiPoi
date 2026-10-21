/**
 * talen/en.js — English texts of the user interface (0.23.0).
 *
 * Same keys and {placeholders} as nl.js (test-vertaling.js). Plural:
 * { een, meer } (one / more). Bold: **text**. See vertaal.js.
 */
export default {
  decimaal: '.',
  meervoud: (n) => (n === 1 ? 'een' : 'meer'),
  telwoorden: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
  teksten: {
    // ---- General ----
    'alg.fout': 'Error: {bericht}',
    'alg.nietGeladen': 'Error: {bestand} did not load correctly.',
    'alg.bestandNietLezen': 'Error: could not read the file.',
    'alg.sluiten': 'Close',
    'alg.bekijken': 'View',
    'alg.later': 'Later',
    'alg.beta': 'beta',
    'alg.enNogAndere': { een: 'and {aantal} other', meer: 'and {aantal} others' },
    'alg.zonderNaam': '(no name)',
    'alg.onbekendeCategorie': 'Unknown category',
    'alg.eigenPoi': 'Own POI',
    'alg.afstandOnbekend': 'distance unknown',
    'alg.nietGeladenKort': '{bestand} did not load correctly.',
    'alg.eerstRoute': 'First choose a route in step 1.',
    'alg.eerstZoeken': 'First search for POIs in step 4.',

    // ---- Header and update notice ----
    'kop.ondertitel': 'Sights along your route',
    'kop.versie': 'version {versie} · beta',
    'kop.instellingen': 'Settings',
    'kop.over': 'About WikiPoi',
    'kop.overKort': 'About',
    'update.beschikbaar': 'Version {versie} of WikiPoi is available{beta}.',
    'update.beta': ' (beta)',

    // ---- Step 1 ----
    'stap1.titel': 'Route',
    'stap1.ander': 'Other route',
    'stap1.kiezen': 'Choose GPX',
    'stap1.punten': { een: '{aantal} route point', meer: '{aantal} route points' },
    'stap1.uitleg': 'Choose the GPX file of your cycling or walking route.',
    'stap1.geenPunten': 'No track or route points found in this GPX file.',

    // ---- Step 2 ----
    'stap2.titel': 'Sources',
    'stap2.zoekenIn': 'Search in',
    'stap2.bron.wiki': 'Wikidata/Wikipedia',
    'stap2.bron.wiki.uitleg': 'The categories of step 3; your own POIs are not included.',
    'stap2.bron.eigen': 'Own POIs only',
    'stap2.bron.eigen.uitleg': 'From your own CSV (below); no internet needed.',
    'stap2.bron.beide': 'Both',
    'stap2.bron.beide.uitleg': 'Wikidata/Wikipedia and your own POIs.',
    'stap2.voegCsvToe': 'Add a CSV below for your own POIs.',
    'stap2.taalTitel': 'Language of the texts',
    'stap2.automatisch': 'Automatic',
    'stap2.automatischUitleg':
      "{taal} (your phone's language), then the language of the route's country, then English, French and German.",
    'stap2.eigenVolgorde': 'Custom order',
    'stap2.eigenVolgordeUitleg': 'Choose the languages yourself (at most {max}) and their order.',
    'stap2.omhoog': '{taal} up',
    'stap2.omlaag': '{taal} down',
    'stap2.taalUitleg':
      'If a POI has no article in the first language, step 6 looks at the same location for an article in ' +
      'a language higher up the list. Changing this clears the search results.',
    'stap2.csvAnder': 'Other own POIs (CSV)',
    'stap2.csvToevoegen': 'Add own POIs (CSV)',
    'stap2.verwijderen': 'Remove',
    'stap2.csvUitleg':
      'Optional: a CSV in EuroPoi format (lat;lng;pluscode;name;desc;category;radius;mp3). A full plus ' +
      'code sets the location; lat/lng is the fallback. Your own POIs appear after searching. Then you can ' +
      'choose whether they always take part (up to {km} from the route) or only within the corridor.',
    'stap2.meldenTitel': 'Announce own POIs',
    'stap2.altijd': 'Always',
    'stap2.altijdUitleg':
      'Up to {km} from the route, also outside the corridor; there only announced at the POI itself.',
    'stap2.corridor': 'Only within the corridor',
    'stap2.corridorUitleg': 'Just like the POIs found (set the width in step 5).',
    'stap2.overgeslagen': { een: '{aantal} line skipped:', meer: '{aantal} lines skipped:' },
    'stap2.regel': 'line {regel}: {reden}',
    'stap2.csv.bijvRegel': ' (e.g. line {regel}: {reden})',
    'stap2.csv.geenBruikbaar': '{bestand}: no usable POIs found{reden}.',
    'stap2.csv.ingelezen': { een: '{bestand}: {aantal} POI read', meer: '{bestand}: {aantal} POIs read' },
    'stap2.csv.metLink': { een: ', {aantal} with an mp3 link', meer: ', {aantal} with an mp3 link' },
    'stap2.csv.samengevoegd': {
      een: ' {aantal} duplicate line merged ({lijst}).',
      meer: ' {aantal} duplicate lines merged ({lijst}).',
    },
    'stap2.csv.regelMet': 'line {regel} with {met}',
    'stap2.csv.geenLink': {
      een:
        " {aantal} mp3 reference is not an internet link and will not be played (local files: via 'Link audio files').",
      meer:
        " {aantal} mp3 references are not internet links and will not be played (local files: via 'Link audio files').",
    },
    'stap2.csv.afwijkend': ' Plus code and lat/lng differ (plus code used): {lijst}{meer}.',
    'stap2.csv.afwijkendRegel': 'line {regel} ({naam}) {afstand}',
    'stap2.csv.enNog': ' and {aantal} more',
    'stap2.audio.ander': 'Other audio files',
    'stap2.audio.koppelen': 'Link audio files',
    'stap2.audio.ontkoppelen': 'Unlink',
    'stap2.audio.uitleg':
      'Optional: mp3 or wav files on your phone, named after the plus code (e.g. 9F37M7RQ+2X.mp3), as in ' +
      'EuroPoi. You can choose several at once.',
    'stap2.audio.uitlegApp': ' They are stored in WikiPoi, so they also work without internet.',
    'stap2.audio.bewaren': 'Storing audio files…',
    'stap2.audio.bewarenMislukt': 'Storing audio files failed: {fout}',
    'stap2.audio.gekoppeld': {
      een: '{aantal} audio file linked to an own POI.',
      meer: '{aantal} audio files linked to own POIs.',
    },
    'stap2.audio.nietGekoppeld': {
      een: '{aantal} file does not match any own POI:',
      meer: '{aantal} files do not match any own POI:',
    },
    'stap2.audio.geenAudio': {
      een: '{aantal} file is not an mp3 or wav and was skipped.',
      meer: '{aantal} files are not mp3 or wav and were skipped.',
    },
    'stap2.audio.nietBewaard': {
      een: '{aantal} audio file could not be stored.',
      meer: '{aantal} audio files could not be stored.',
    },
    'stap2.audio.totaal': {
      een: 'Stored audio: {aantal} file, {grootte}.',
      meer: 'Stored audio: {aantal} files, {grootte}.',
    },
    'stap2.kopie.bezig': 'Saving mp3 links offline: {klaar} of {totaal}…',
    'stap2.kopie.resultaat': {
      een: 'Audio offline: {gelukt} of {aantal} mp3 link saved.',
      meer: 'Audio offline: {gelukt} of {aantal} mp3 links saved.',
    },
    'stap2.kopie.offline': 'No internet: the mp3 links will be downloaded when WikiPoi starts again with internet.',
    'stap2.kopie.nietGelukt': 'Failed (will be tried again via the link on the way, with internet):',

    // ---- Step 3 ----
    'stap3.titel': 'Categories',
    'stap3.nietNodig': 'Not needed: you are only searching your own POIs (step 2).',
    'stap3.verzamel': 'Collective categories',
    'stap3.max': '(max. {max} at a time)',
    'stap3.osm': 'Also search OpenStreetMap',
    'stap3.osmUitleg': 'Sometimes finds extra places, but makes searching slower.',

    // ---- Step 4 ----
    'stap4.titel': 'Search',
    'stap4.bezig': 'Searching…',
    'stap4.opnieuw': 'Search again',
    'stap4.zoeken': 'Search POIs',
    'stap4.kiesCategorie': 'Choose at least one category in step 3.',
    'stap4.kiesCategorieOf': "Choose at least one category in step 3, or choose 'Own POIs only' in step 2.",
    'stap4.landTaal': "Determining the country's language",
    'stap4.alleCategorieen': 'all categories',
    'stap4.voortgang': '{bron}: {wat} ({nr} of {totaal})',
    'stap4.osmNiet': 'Note: OpenStreetMap not available ({bericht}). Results without OpenStreetMap.',
    'stap4.osmDeels':
      'Note: OpenStreetMap partly: {categorie} failed ({bericht}).{overgeslagen} ' +
      'Results of the other OpenStreetMap categories are included.',
    'stap4.osmOvergeslagen': ' {lijst} skipped.',
    'stap4.gevonden': { een: '**{aantal}** POI found', meer: '**{aantal}** POIs found' },
    'stap4.inclusiefEigen': ', including {aantal} own',
    'stap4.vervangen': ', {aantal} replaced by an own POI',
    'stap4.samengevoegd': { een: ', {aantal} duplicate merged', meer: ', {aantal} duplicates merged' },
    'stap4.viaOsm': ', {aantal} of them via OpenStreetMap',
    'stap4.taal': 'Language of the texts: {volgorde}',
    'stap4.taalEigen': ' (custom order).',
    'stap4.taalLand': " (country's language: {taal}).",
    'stap4.taalLandFout': " (country's language not determined).",
    'stap4.teVer': {
      een: '{aantal} own POI is further than {km} from the route: visible on the map, but not included.',
      meer: '{aantal} own POIs are further than {km} from the route: visible on the map, but not included.',
    },

    // ---- Step 5 ----
    'stap5.titel': 'Map',
    'stap5.verbergen': 'Hide map',
    'stap5.tonen': 'Show map',
    'stap5.corridor': 'Corridor: {meters} m on either side of the route',
    'stap5.naZoeken': 'The POIs appear here after searching in step 4.',
    'stap5.geenEigen': 'No own POIs found.',
    'stap5.geenPois': 'No POIs found. Choose other categories in step 3.',
    'stap5.doenMee': { een: '**{mee}** of {aantal} POI included', meer: '**{mee}** of {aantal} POIs included' },
    'stap5.waarvanGekozen': ' ({aantal} chosen by you)',
    'stap5.nietOpgenomenAantal': '; {aantal} not included.',
    'stap5.ookBijRouteRegel': ', outside the corridor: at the POI itself and at the route',
    'stap5.zelfGekozen': ', chosen by you',
    'stap5.alleenBijPoi': ', outside the corridor: only at the POI itself',
    'stap5.geenArtikel': ', no article',
    'stap5.ookBijRoute': 'also announce at the route',
    'stap5.nietOpgenomen': 'Not included ({aantal}{aangevinkt})',
    'stap5.aangevinkt': ', {aantal} ticked',
    'stap5.nietOpgenomenUitleg':
      'Tick a POI to include it anyway. On the way it gets a circle that reaches across the route: it is ' +
      'read out as you approach the nearest point of the route, also if you ride between the route and ' +
      'the POI; if it is more than 300 m away, the announcement mentions the distance.',
    'stap5.inklappen': 'Collapse',
    'stap5.reden.buiten': 'outside the corridor',
    'stap5.reden.verder': 'further than {km}',
    'stap5.reden.geenTekst': 'no text',

    // ---- Step 6 ----
    'stap6.titel': 'Summaries',
    'stap6.nietNodig': 'Not needed: your own POIs have their own description.',
    'stap6.gevonden': {
      een: '**{gevonden}** of {aantal} POI within the corridor has a Wikipedia summary',
      meer: '**{gevonden}** of {aantal} POIs within the corridor have a Wikipedia summary',
    },
    'stap6.zinUitWikidata': { een: '; {aantal} got a sentence from Wikidata.', meer: '; {aantal} got a sentence from Wikidata.' },
    'stap6.liggingEen': {
      een: '{aantal} article in {taal} found via the location (Wikidata had none in that language).',
      meer: '{aantal} articles in {taal} found via the location (Wikidata had none in that language).',
    },
    'stap6.liggingMeer': '{aantal} articles found via the location: {lijst} (Wikidata had none in those languages).',
    'stap6.liggingTaal': '{aantal} in {taal}',
    'stap6.eigen': {
      een: '{aantal} own POI uses its own description (without a description: just the name).',
      meer: '{aantal} own POIs use their own description (without a description: just the name).',
    },
    'stap6.optioneel': 'Optional: when saving (step 7), missing summaries are fetched automatically.',
    'stap6.zonderTekst': 'Also announce POIs without text',
    'stap6.zonderTekstUitleg':
      'Without a Wikipedia summary or a sentence from Wikidata, only the name (or a short description) is read out.',
    'stap6.zonderTekstAantal': {
      een: '{aantal} POI without text is not included in On the way and the export',
      meer: '{aantal} POIs without text are not included in On the way and the export',
    },
    'stap6.naOphalen': '; this may change after fetching.',
    'stap6.bezig': 'Fetching…',
    'stap6.ophalen': 'Fetch summaries ({aantal})',
    'stap6.allesOpgehaald': 'All fetched',
    'stap6.foto': 'Photo: {bron}',
    'stap6.naamUitArtikel': 'Name from the article; in Wikidata: “{naam}”.',
    'stap6.samengesteld': 'No article. Composed from Wikidata:',
    'stap6.viaLigging': 'Found via the location{wikidata}.',
    'stap6.inWikidata': '; in Wikidata: “{naam}”',
    'stap6.geenArtikel': 'No Wikipedia article.',
    'stap6.geenTekstNietMee': 'No text: not included.',
    'stap6.omschrijving': 'The CSV uses the description: “{tekst}”.',
    'stap6.geenOmschrijving': 'There is no description either; only the name is included.',
    'stap6.geenSamenvatting': 'No summary ({reden})',
    'stap6.onbekendeReden': 'unknown reason',
    'stap6.wikidataOmschrijving': '; the CSV uses the Wikidata description.',
    'stap6.geenTekstPuntKomma': '; no text: not included.',

    // ---- Step 7 ----
    'stap7.titel': 'Export',
    'stap7.routenaam': 'Route name (category in EuroPoi)',
    'stap7.naamWijktAf':
      'Note: this name differs from the GPX file name "{naam}". In EuroPoi the category links the POIs to ' +
      'the route with the same name; with a different name they will not be linked to this route.',
    'stap7.bestandsnaam': 'Use file name',
    'stap7.eerstOphalen': {
      een: 'For {aantal} POI the summary is fetched first when saving.',
      meer: 'For {aantal} POIs the summary is fetched first when saving.',
    },
    'stap7.ophalen': 'Fetching summaries…',
    'stap7.delen': { een: 'Share or save CSV ({aantal} POI)', meer: 'Share or save CSV ({aantal} POIs)' },
    'stap7.opslaan': { een: 'Save CSV ({aantal} POI)', meer: 'Save CSV ({aantal} POIs)' },
    'stap7.geenNaam': 'Enter a route name; it becomes the category in EuroPoi.',
    'stap7.geenPois': 'There are no POIs within the corridor. Widen the strip in step 5.',
    'stap7.samenvattingMislukt': 'Fetching summaries failed ({fout}). Please try again.',
    'stap7.geenTekst':
      "None of the POIs within the corridor has a text. Turn on 'Also announce POIs without text' in step 6, " +
      'or widen the corridor.',
    'stap7.opgeslagen': { een: '{aantal} POI saved in "{bestand}".', meer: '{aantal} POIs saved in "{bestand}".' },
    'stap7.delenTitel': 'Share or save CSV',
    'stap7.aangeboden': {
      een: '"{bestand}" ({aantal} POI) is ready to share or save.',
      meer: '"{bestand}" ({aantal} POIs) is ready to share or save.',
    },
    'stap7.geannuleerd': 'Sharing cancelled. Press the button again to share the file after all.',

    // ---- Step 8 (header) ----
    'stap8.titel': 'On the way',
    'stap8.hint': 'First search for POIs in step 4; at least one POI must be within the corridor.',

    // ---- Step 8 On the way ----
    'vervoer.wandelaar': 'Walker',
    'vervoer.fietser': 'Cyclist',
    'vervoer.motorrijder': 'Motorcyclist',
    'onderweg.uitleg': 'Follows your GPS position along the route and reads out each POI once when you are nearby.',
    'onderweg.eerstOphalen': {
      een: 'For {aantal} POI the summary is fetched first when starting (internet needed).',
      meer: 'For {aantal} POIs the summary is fetched first when starting (internet needed).',
    },
    'onderweg.vervoerKnop': '{vervoer} — announces a POI {straal} m ahead',
    'onderweg.trackOpnemen': 'Record track (the way you travelled; pauses by itself when you stand still)',
    'onderweg.stoppen': 'Stop route',
    'onderweg.ophalen': 'Fetching summaries ({aantal})…',
    'onderweg.routeStarten': { een: 'Start route ({aantal} POI)', meer: 'Start route ({aantal} POIs)' },
    'onderweg.simulatieStarten': { een: 'Start simulation ({aantal} POI)', meer: 'Start simulation ({aantal} POIs)' },
    'onderweg.nuZonder': 'Start now without',
    'onderweg.achtergrondActief':
      'Background GPS active: the notification "{melding}" stays until you stop the route.',
    'onderweg.ecoScherm': 'Eco screen',
    'onderweg.wachtGps': 'Waiting for GPS position…',
    'onderweg.gpsStatus':
      'GPS: accuracy ± {nauwkeurigheid} m · heading: {richting} · read out: {voorgelezen} of {aantal}',
    'onderweg.richtingOnbekend': 'not yet known (first move ± 10 m)',
    'onderweg.voorlezen': 'Reading out: {naam}',
    'onderweg.stil': 'Quiet',
    'onderweg.opUur': ", at {uur} o'clock",
    'onderweg.later': 'Listen later ({aantal}):',
    'onderweg.duurUren': '{uur} h {min} min',
    'onderweg.sim.status': 'Simulation: km {km} of {lengte} · {snelheid} km/h × {versnelling}',
    'onderweg.sim.gepauzeerd': ' · paused',
    'onderweg.sim.einde': ' · end of route',
    'onderweg.sim.verder': 'Continue',
    'onderweg.sim.pauze': 'Pause',
    'onderweg.sim.volgende': 'To next POI',
    'onderweg.sim.geenVolgende': 'No next POI further along the route.',
    'onderweg.track.samenvatting': 'Track of last ride ({moment}): {delen}',
    'onderweg.track.onderweg': '{duur} on the way',
    'onderweg.track.nietAfgesloten': 'not closed',
    'onderweg.track.geenPauzes': 'no breaks',
    'onderweg.track.pauzes': { een: '{aantal} break ({duur})', meer: '{aantal} breaks ({duur})' },
    'onderweg.track.gepauzeerd': 'Track paused (standing still) — continues as soon as you move again.',
    'onderweg.track.opgenomen': 'Track: {afstand} recorded.',
    'onderweg.track.weggegooid': 'Track deleted.',
    'onderweg.track.opslaanTitel': 'Save track',
    'onderweg.track.aangeboden': '"{naam}" offered; choose e.g. "Save to Files" or Drive.',
    'onderweg.track.opgeslagen': '"{naam}" saved.',
    'onderweg.track.geannuleerd': 'Saving cancelled.',
    'onderweg.track.mislukt': 'Saving track failed: {bericht}',
    'onderweg.track.weggooienVraag': 'Delete track permanently?',
    'onderweg.track.weggooienJa': 'Yes, delete',
    'onderweg.track.weggooienNee': 'No, keep',
    'onderweg.track.opslaan': 'Save track (GPX)',
    'onderweg.track.weggooien': 'Delete track',
    'onderweg.logboek.delen': 'Share log',
    'onderweg.logboek.tonen': 'Show log',
    'onderweg.logboek.verbergen': 'Hide log',
    'onderweg.logboek.klembord': 'Sharing not available; the log has been copied to the clipboard.',
    'onderweg.logboek.nietBeschikbaar': 'Sharing not available. Choose "Show log" and copy the text.',
    'onderweg.test.titel': 'Testing',
    'onderweg.test.eerstStoppen': 'First stop the ride to choose simulation or background GPS.',
    'onderweg.test.simulatie': 'Simulation: ride along the route without GPS',
    'onderweg.test.achtergrond': 'Background GPS: keeps working with the screen off (trial, with a fixed notification)',
    'onderweg.test.filter':
      'Filter last ride: {posities} positions; measurements {metingen}, of which discarded {nauwkeurigheid} ' +
      '(accuracy) and {sprong} (jump).',
    'onderweg.test.logboek': 'Log of last ride: {samenvatting}',

    // ---- Fetching summaries at the start (samenvattingVoorStart.js) ----
    'ophalen.zonder': {
      een: '{aantal} POI without a summary: short description.',
      meer: '{aantal} POIs without a summary: short description.',
    },
    'ophalen.offline': {
      een: 'No connection: {aantal} POI with a short description.',
      meer: 'No connection: {aantal} POIs with a short description.',
    },
    'ophalen.fout': {
      een: 'Fetching summaries failed: {aantal} POI with a short description.',
      meer: 'Fetching summaries failed: {aantal} POIs with a short description.',
    },
    'ophalen.teLang': 'Summaries not in after {s} s; they will still be used on the way as soon as they arrive.',
    'ophalen.overgeslagen': 'Started without waiting; summaries will still be used on the way as soon as they arrive.',

    // ---- GPS (positieBron.js); always Dutch in the log ----
    'gps.melding': 'WikiPoi is following your route',
    'gps.fout': 'GPS error: {bericht}',
    'gps.geenToestemming': 'No permission for location. Allow this in the Android settings.',
    'gps.geenToestemmingNauwkeurig': 'No permission for precise location. Allow this in the Android settings.',

    // ---- Eco screen ----
    'eco.uur': "o'clock",
    'eco.opnieuw': 'Listen again',
    'eco.hint': '1 tap = bell · 3 quick taps = close',

    // ---- Choice window and spoken announcements (poiKeuze.js) ----
    'keuze.titel.ook': { een: 'Also a sight here', meer: 'Also {aantal} sights here' },
    'keuze.titel.pauze': 'Break — still to listen to',
    'keuze.titel.overlap': '{telwoord} sights here',
    'keuze.hint.overlap': 'Choose what you want to hear. No choice? The top one in {s} s.',
    'keuze.hint.ook': 'Tap to listen now (interrupts the current story). Otherwise it follows afterwards.',
    'keuze.hint.pauze': 'Tap to listen.',
    'keuze.allemaalLater': 'All later',
    'keuze.opsomming': '{lijst} and {laatste}',
    'keuze.enNog': '{lijst} and {telwoord} more',
    'keuze.aankondiging': 'Here are {telwoord} sights: {namen}.',
    'keuze.pauzeTekst': {
      een: 'You have one sight to listen to.',
      meer: 'You have {telwoord} sights to listen to.',
    },

    // ---- Map (RouteMap.jsx) ----
    'kaart.vanRoute': '{meters} m from the route',
    'kaart.geenRoute': 'No route loaded',
    'kaart.volgMij': 'Follow me',
    'kaart.legenda': 'Legend',

    // ---- Settings ----
    'inst.taal': 'Language',
    'inst.taalAuto': 'Automatic (phone)',
    'inst.grens': 'Limit for own POIs',
    'inst.grensUitleg':
      'Own POIs take part up to this distance from the route (with "always announce"). Outside the corridor ' +
      'they are only announced at the POI itself.',
    'inst.corridor': 'Corridor at the start',
    'inst.corridorWaarde': '{meters} m on either side of the route',
    'inst.zonderTekst': 'Include POIs without text by default',
    'inst.vervoer': 'Means of transport at the start',
    'inst.afteltijd': 'Countdown of the choice window',
    'inst.afteltijdUitleg': 'How long the window stays open when there are several POIs at once.',
    'inst.updates': 'Updates',
    'inst.updateAuto': 'Check for updates at start-up (at most once a day)',
    'inst.update.bezig': 'Checking…',
    'inst.update.knop': 'Check for update',
    'inst.update.nieuw': 'Version {versie} is available{beta}.',
    'inst.update.actueel': 'You have the latest version ({versie}).',
    'inst.update.geen': 'No release published yet.',
    'inst.update.fout': 'Checking failed: {reden}.',
    'inst.update.reden.geenFetch': 'no connection possible',
    'inst.update.reden.wachten': 'GitHub asks to wait a moment',
    'inst.update.reden.status': 'GitHub returned error {status}',
    'inst.update.reden.verbinding': 'no connection to GitHub',
    'inst.dezeVersie': 'This version: {versie}',
    'inst.laatst': ' · last checked {moment}',
    'inst.standaard': 'Restore defaults',

    // ---- Welcome message ----
    'welkom.titel': 'Welcome to WikiPoi',
    'welkom.intro': 'WikiPoi finds sights along your route and reads them out on the way.',
    'welkom.verkeer':
      "**Watch the traffic.** Don't look at the screen while on the move: WikiPoi is made for listening.",
    'welkom.eco':
      '**Eco screen:** a black screen that saves the battery and only shows something at a POI. ' +
      '**1 tap** = bicycle bell, **3 quick taps** = back to the normal screen.',
    'welkom.locatie':
      '**Location:** stays on your phone. Your route, track and log only leave it when you tap "Share" yourself.',
    'welkom.internet':
      '**Internet** is needed for searching and for the summaries (Wikidata, Wikipedia, OpenStreetMap).',
    'welkom.beta': '**Beta:** the texts come from Wikipedia and may contain errors.',
    'welkom.meer': 'More, such as licence and sources: tap ⓘ at the top right.',
    'welkom.begrepen': 'Got it',

    // ---- About WikiPoi and sources (over/bronnen.js) ----
    'over.versie': '**Version {versie}** · beta',
    'over.licentie': 'Licence',
    'over.licentieUitleg':
      'You may use, study, change and share WikiPoi under the same licence. WikiPoi comes without any warranty.',
    'over.broncode': 'Source code:',
    'over.bronnen': 'Sources',
    'over.privacy': 'Privacy',
    'over.privacyKort':
      'Your location, track and log stay on your phone. Nothing leaves it unless you tap "Share" yourself. ' +
      'For searching and the summaries, WikiPoi requests data from Wikidata, Wikipedia and OpenStreetMap ' +
      'for the area of your route; the map fetches tiles from OpenStreetMap or Esri for the part of the map ' +
      'you are viewing. For the update check, WikiPoi asks GitHub which versions exist; no personal ' +
      'information is sent (GitHub does see your IP address). You can turn this check off in Settings.',
    'over.welkomOpnieuw': 'Show welcome message again',
    'bron.wikidata': 'POIs, names and short descriptions',
    'bron.wikipedia': 'summaries (source: the article, in step 6)',
    'bron.commons': 'photos (author and licence per photo)',
    'bron.osm': 'map and POIs (© OpenStreetMap contributors)',
    'bron.esri': 'aerial photos (© Esri, Maxar, Earthstar Geographics)',
    'bron.leaflet': 'map display',
    'bron.capacitor': 'Android app',
    'bron.olc': 'plus codes',
    'bron.fietsbel': 'sound from Pixabay',
    'bron.fietsbelNaam': 'Bicycle bell',
    'bron.perFoto': 'per photo',
    'bron.esriVoorwaarden': 'Esri terms',

    // ---- Language names (taalvolgorde.js) ----
    'taal.nl': 'Dutch',
    'taal.en': 'English',
    'taal.de': 'German',
    'taal.fr': 'French',
    'taal.es': 'Spanish',
    'taal.it': 'Italian',
    'taal.pt': 'Portuguese',
    'taal.da': 'Danish',
    'taal.sv': 'Swedish',
    'taal.pl': 'Polish',
    'taal.no': 'Norwegian',
    'taal.nb': 'Norwegian',
    'taal.fi': 'Finnish',
    'taal.cs': 'Czech',
    'taal.sk': 'Slovak',
    'taal.sl': 'Slovenian',
    'taal.hr': 'Croatian',
    'taal.hu': 'Hungarian',
    'taal.ro': 'Romanian',
    'taal.bg': 'Bulgarian',
    'taal.el': 'Greek',
    'taal.et': 'Estonian',
    'taal.lv': 'Latvian',
    'taal.lt': 'Lithuanian',
    'taal.lb': 'Luxembourgish',
    'taal.ga': 'Irish',
    'taal.ca': 'Catalan',
    'taal.eu': 'Basque',
    'taal.fy': 'Frisian',
    'taal.ru': 'Russian',
    'taal.uk': 'Ukrainian',
    'taal.tr': 'Turkish',
  },
}
