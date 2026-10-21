/**
 * talen/nl.js — Nederlandse teksten van de bediening (0.23.0).
 *
 * Brontaal: elke sleutel staat hier; de andere talen hebben dezelfde
 * sleutels en dezelfde {plaatshouders} (test-vertaling.js). Meervoud:
 * { een, meer }. Vet: **tekst**. Zie vertaal.js.
 */
export default {
  decimaal: ',',
  meervoud: (n) => (n === 1 ? 'een' : 'meer'),
  telwoorden: ['nul', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien'],
  teksten: {
    // ---- Algemeen ----
    'alg.fout': 'Fout: {bericht}',
    'alg.nietGeladen': 'Fout: {bestand} is niet correct geladen.',
    'alg.bestandNietLezen': 'Fout: kon het bestand niet lezen.',
    'alg.sluiten': 'Sluiten',
    'alg.bekijken': 'Bekijken',
    'alg.later': 'Later',
    'alg.beta': 'bèta',
    'alg.enNogAndere': 'en nog {aantal} andere',
    'alg.zonderNaam': '(zonder naam)',
    'alg.onbekendeCategorie': 'Onbekende categorie',
    'alg.eigenPoi': 'Eigen POI',
    'alg.afstandOnbekend': 'afstand onbekend',

    'alg.nietGeladenKort': '{bestand} is niet correct geladen.',
    'alg.eerstRoute': 'Kies eerst een route bij stap 1.',
    'alg.eerstZoeken': "Zoek eerst POI's bij stap 4.",

    // ---- Kopregel en updatemelding ----
    'kop.ondertitel': 'Beziens­waardig­heden langs je route',
    'kop.versie': 'versie {versie} · bèta',
    'kop.instellingen': 'Instellingen',
    'kop.over': 'Over WikiPoi',
    'kop.overKort': 'Over',
    'update.beschikbaar': 'Versie {versie} van WikiPoi is beschikbaar{beta}.',
    'update.beta': ' (bèta)',

    // ---- Stap 1 ----
    'stap1.titel': 'Route',
    'stap1.ander': 'Andere route',
    'stap1.kiezen': 'GPX kiezen',
    'stap1.punten': '{aantal} routepunten',
    'stap1.uitleg': 'Kies het GPX-bestand van je fiets- of wandelroute.',
    'stap1.geenPunten': 'Geen track- of routepunten gevonden in dit GPX-bestand.',

    // ---- Stap 2 ----
    'stap2.titel': 'Bronnen',
    'stap2.zoekenIn': 'Zoeken in',
    'stap2.bron.wiki': 'Wikidata/Wikipedia',
    'stap2.bron.wiki.uitleg': "De categorieën van stap 3; eigen POI's doen niet mee.",
    'stap2.bron.eigen': "Alleen eigen POI's",
    'stap2.bron.eigen.uitleg': 'Uit je eigen CSV (hieronder); geen internet nodig.',
    'stap2.bron.beide': 'Beide',
    'stap2.bron.beide.uitleg': "Wikidata/Wikipedia én de eigen POI's.",
    'stap2.voegCsvToe': "Voeg hieronder een CSV toe voor eigen POI's.",
    'stap2.taalTitel': 'Taal van de teksten',
    'stap2.automatisch': 'Automatisch',
    'stap2.automatischUitleg':
      '{taal} (taal van je telefoon), dan de taal van het land van de route, dan Engels, Frans en Duits.',
    'stap2.eigenVolgorde': 'Eigen volgorde',
    'stap2.eigenVolgordeUitleg': 'Kies zelf de talen (hoogstens {max}) en hun volgorde.',
    'stap2.omhoog': '{taal} omhoog',
    'stap2.omlaag': '{taal} omlaag',
    'stap2.taalUitleg':
      'Heeft een POI geen artikel in de eerste taal, dan zoekt stap 6 op dezelfde plek naar een artikel in ' +
      'een taal die hoger in de lijst staat. Een andere keuze wist de zoekresultaten.',
    'stap2.csvAnder': "Andere eigen POI's (CSV)",
    'stap2.csvToevoegen': "Eigen POI's toevoegen (CSV)",
    'stap2.verwijderen': 'Verwijderen',
    'stap2.csvUitleg':
      'Optioneel: een CSV in EuroPoi-formaat (lat;lng;pluscode;name;desc;category;radius;mp3). Een ' +
      "volledige pluscode bepaalt de plek; lat/lng is de reserve. Eigen POI's verschijnen na het zoeken. " +
      'Daarna kun je kiezen of ze altijd meedoen (tot {km} van de route) of alleen binnen de corridor.',
    'stap2.meldenTitel': "Eigen POI's melden",
    'stap2.altijd': 'Altijd',
    'stap2.altijdUitleg': 'Tot {km} van de route, ook buiten de corridor; daar alleen gemeld bij de POI zelf.',
    'stap2.corridor': 'Alleen binnen de corridor',
    'stap2.corridorUitleg': "Net als de gevonden POI's (breedte instellen bij stap 5).",
    'stap2.overgeslagen': { een: '{aantal} regel overgeslagen:', meer: '{aantal} regels overgeslagen:' },
    'stap2.regel': 'regel {regel}: {reden}',
    'stap2.csv.bijvRegel': ' (bijv. regel {regel}: {reden})',
    'stap2.csv.geenBruikbaar': "{bestand}: geen bruikbare POI's gevonden{reden}.",
    'stap2.csv.ingelezen': "{bestand}: {aantal} POI's ingelezen",
    'stap2.csv.metLink': ', waarvan {aantal} met mp3-link',
    'stap2.csv.samengevoegd': {
      een: ' {aantal} dubbele regel samengevoegd ({lijst}).',
      meer: ' {aantal} dubbele regels samengevoegd ({lijst}).',
    },
    'stap2.csv.regelMet': 'regel {regel} met {met}',
    'stap2.csv.geenLink': {
      een:
        " {aantal} mp3-verwijzing is geen internetlink en wordt niet afgespeeld (lokale bestanden: via 'Audiobestanden koppelen').",
      meer:
        " {aantal} mp3-verwijzingen zijn geen internetlink en wordt niet afgespeeld (lokale bestanden: via 'Audiobestanden koppelen').",
    },
    'stap2.csv.afwijkend': ' Pluscode en lat/lng wijken af (pluscode gebruikt): {lijst}{meer}.',
    'stap2.csv.afwijkendRegel': 'regel {regel} ({naam}) {afstand}',
    'stap2.csv.enNog': ' en nog {aantal}',
    'stap2.audio.ander': 'Andere audiobestanden',
    'stap2.audio.koppelen': 'Audiobestanden koppelen',
    'stap2.audio.ontkoppelen': 'Ontkoppelen',
    'stap2.audio.uitleg':
      'Optioneel: mp3- of wav-bestanden op de telefoon, met de pluscode als bestandsnaam (bijv. ' +
      '9F37M7RQ+2X.mp3), zoals in EuroPoi. Meerdere tegelijk kiezen mag.',
    'stap2.audio.uitlegApp': ' Ze worden in WikiPoi bewaard, zodat ze ook zonder internet werken.',
    'stap2.audio.bewaren': 'Audiobestanden bewaren…',
    'stap2.audio.bewarenMislukt': 'Audiobestanden bewaren mislukt: {fout}',
    'stap2.audio.gekoppeld': {
      een: '{aantal} audiobestand gekoppeld aan een eigen POI.',
      meer: "{aantal} audiobestanden gekoppeld aan eigen POI's.",
    },
    'stap2.audio.nietGekoppeld': {
      een: '{aantal} bestand past bij geen enkele eigen POI:',
      meer: '{aantal} bestanden passen bij geen enkele eigen POI:',
    },
    'stap2.audio.geenAudio': {
      een: '{aantal} bestand is geen mp3 of wav en is overgeslagen.',
      meer: '{aantal} bestanden zijn geen mp3 of wav en zijn overgeslagen.',
    },
    'stap2.audio.nietBewaard': {
      een: '{aantal} audiobestand kon niet worden bewaard.',
      meer: '{aantal} audiobestanden konden niet worden bewaard.',
    },
    'stap2.audio.totaal': {
      een: 'Opgeslagen audio: {aantal} bestand, {grootte}.',
      meer: 'Opgeslagen audio: {aantal} bestanden, {grootte}.',
    },
    'stap2.kopie.bezig': 'Mp3-links offline opslaan: {klaar} van {totaal}…',
    'stap2.kopie.resultaat': {
      een: 'Audio offline: {gelukt} van {aantal} mp3-link opgeslagen.',
      meer: 'Audio offline: {gelukt} van {aantal} mp3-links opgeslagen.',
    },
    'stap2.kopie.offline': 'Geen internet: de mp3-links worden gedownload zodra WikiPoi met internet opnieuw start.',
    'stap2.kopie.nietGelukt': 'Niet gelukt (wordt onderweg met internet nog via de link geprobeerd):',

    // ---- Stap 3 ----
    'stap3.titel': 'Categorieën',
    'stap3.nietNodig': "Niet nodig: je zoekt alleen in je eigen POI's (stap 2).",
    'stap3.verzamel': 'Verzamelcategorieën',
    'stap3.max': '(max. {max} tegelijk)',
    'stap3.osm': 'Ook OpenStreetMap doorzoeken',
    'stap3.osmUitleg': 'Vindt soms extra punten, maar maakt het zoeken trager.',

    // ---- Stap 4 ----
    'stap4.titel': 'Zoeken',
    'stap4.bezig': 'Bezig met zoeken…',
    'stap4.opnieuw': 'Opnieuw zoeken',
    'stap4.zoeken': "POI's zoeken",
    'stap4.kiesCategorie': 'Kies minimaal één categorie bij stap 3.',
    'stap4.kiesCategorieOf': "Kies minimaal één categorie bij stap 3, of kies bij stap 2 'Alleen eigen POI's'.",
    'stap4.landTaal': 'Taal van het land bepalen',
    'stap4.alleCategorieen': 'alle categorieën',
    'stap4.voortgang': '{bron}: {wat} ({nr} van {totaal})',
    'stap4.osmNiet': 'Let op: OpenStreetMap niet beschikbaar ({bericht}). Resultaten zonder OpenStreetMap.',
    'stap4.osmDeels':
      'Let op: OpenStreetMap gedeeltelijk: {categorie} niet gelukt ({bericht}).{overgeslagen} ' +
      'Resultaten van de overige OpenStreetMap-categorieën zijn wel meegenomen.',
    'stap4.osmOvergeslagen': ' {lijst} overgeslagen.',
    'stap4.gevonden': "**{aantal}** POI's gevonden",
    'stap4.inclusiefEigen': ', inclusief {aantal} eigen',
    'stap4.vervangen': ', {aantal} vervangen door een eigen POI',
    'stap4.samengevoegd': ', {aantal} dubbele samengevoegd',
    'stap4.viaOsm': ', waarvan {aantal} via OpenStreetMap',
    'stap4.taal': 'Taal van de teksten: {volgorde}',
    'stap4.taalEigen': ' (eigen volgorde).',
    'stap4.taalLand': ' (taal van het land: {taal}).',
    'stap4.taalLandFout': ' (taal van het land niet bepaald).',
    'stap4.teVer': {
      een: '{aantal} eigen POI ligt verder dan {km} van de route: zichtbaar op de kaart, maar doet niet mee.',
      meer: "{aantal} eigen POI's liggen verder dan {km} van de route: zichtbaar op de kaart, maar doen niet mee.",
    },

    // ---- Stap 5 ----
    'stap5.titel': 'Kaart',
    'stap5.verbergen': 'Kaart verbergen',
    'stap5.tonen': 'Kaart tonen',
    'stap5.corridor': 'Corridor: {meters} m aan weerszijden van de route',
    'stap5.naZoeken': "Na het zoeken bij stap 4 verschijnen hier de POI's.",
    'stap5.geenEigen': "Geen eigen POI's gevonden.",
    'stap5.geenPois': "Geen POI's gevonden. Kies andere categorieën bij stap 3.",
    'stap5.doenMee': "**{mee}** van {aantal} POI's doen mee",
    'stap5.waarvanGekozen': ' (waarvan {aantal} zelf gekozen)',
    'stap5.nietOpgenomenAantal': '; {aantal} niet opgenomen.',
    'stap5.ookBijRouteRegel': ', buiten de corridor: bij de POI zelf en bij de route',
    'stap5.zelfGekozen': ', zelf gekozen',
    'stap5.alleenBijPoi': ', buiten de corridor: alleen bij de POI zelf',
    'stap5.geenArtikel': ', geen artikel',
    'stap5.ookBijRoute': 'ook bij de route melden',
    'stap5.nietOpgenomen': 'Niet opgenomen ({aantal}{aangevinkt})',
    'stap5.aangevinkt': ', {aantal} aangevinkt',
    'stap5.nietOpgenomenUitleg':
      'Vink een POI aan om hem toch mee te nemen. Onderweg krijgt hij een cirkel die tot over de route ' +
      'reikt: hij wordt voorgelezen als je het dichtstbijzijnde punt van de route nadert, ook als je ' +
      'tussen route en POI rijdt; ligt hij verder dan 300 m weg, dan noemt de aankondiging de afstand.',
    'stap5.inklappen': 'Inklappen',
    'stap5.reden.buiten': 'buiten de corridor',
    'stap5.reden.verder': 'verder dan {km}',
    'stap5.reden.geenTekst': 'geen tekst',

    // ---- Stap 6 ----
    'stap6.titel': 'Samenvattingen',
    'stap6.nietNodig': "Niet nodig: eigen POI's hebben hun eigen beschrijving.",
    'stap6.gevonden': "**{gevonden}** van {aantal} POI's binnen de corridor hebben een Wikipedia-samenvatting",
    'stap6.zinUitWikidata': '; {aantal} kregen een zin uit Wikidata.',
    'stap6.liggingEen': {
      een: '{aantal} artikel in het {taal} gevonden via de ligging (Wikidata had er geen in die taal).',
      meer: '{aantal} artikelen in het {taal} gevonden via de ligging (Wikidata had er geen in die taal).',
    },
    'stap6.liggingMeer': '{aantal} artikelen gevonden via de ligging: {lijst} (Wikidata had er geen in die talen).',
    'stap6.liggingTaal': '{aantal} in het {taal}',
    'stap6.eigen': "{aantal} eigen POI's gebruiken hun eigen beschrijving (zonder beschrijving: alleen de naam).",
    'stap6.optioneel': 'Optioneel: bij opslaan (stap 7) worden ontbrekende samenvattingen automatisch opgehaald.',
    'stap6.zonderTekst': "Ook POI's zonder tekst melden",
    'stap6.zonderTekstUitleg':
      'Zonder Wikipedia-samenvatting of zin uit Wikidata wordt alleen de naam (of een korte omschrijving) voorgelezen.',
    'stap6.zonderTekstAantal': {
      een: '{aantal} POI zonder tekst doet niet mee in Onderweg en de export',
      meer: "{aantal} POI's zonder tekst doen niet mee in Onderweg en de export",
    },
    'stap6.naOphalen': '; na het ophalen kan dat nog veranderen.',
    'stap6.bezig': 'Bezig met ophalen…',
    'stap6.ophalen': 'Samenvattingen ophalen ({aantal})',
    'stap6.allesOpgehaald': 'Alles opgehaald',
    'stap6.foto': 'Foto: {bron}',
    'stap6.naamUitArtikel': 'Naam uit het artikel; in Wikidata: „{naam}”.',
    'stap6.samengesteld': 'Geen artikel. Samengesteld uit Wikidata:',
    'stap6.viaLigging': 'Gevonden via de ligging{wikidata}.',
    'stap6.inWikidata': '; in Wikidata: „{naam}”',
    'stap6.geenArtikel': 'Geen Wikipedia-artikel.',
    'stap6.geenTekstNietMee': 'Geen tekst: doet niet mee.',
    'stap6.omschrijving': 'De CSV gebruikt de omschrijving: „{tekst}”.',
    'stap6.geenOmschrijving': 'Er is ook geen omschrijving; alleen de naam gaat mee.',
    'stap6.geenSamenvatting': 'Geen samenvatting ({reden})',
    'stap6.onbekendeReden': 'onbekende reden',
    'stap6.wikidataOmschrijving': '; de CSV gebruikt de Wikidata-omschrijving.',
    'stap6.geenTekstPuntKomma': '; geen tekst: doet niet mee.',

    // ---- Stap 7 ----
    'stap7.titel': 'Exporteren',
    'stap7.routenaam': 'Routenaam (categorie in EuroPoi)',
    'stap7.naamWijktAf':
      'Let op: deze naam wijkt af van de GPX-bestandsnaam "{naam}". In EuroPoi koppelt de categorie de ' +
      "POI's aan de route met dezelfde naam; bij een andere naam worden ze niet aan deze route gekoppeld.",
    'stap7.bestandsnaam': 'Bestandsnaam gebruiken',
    'stap7.eerstOphalen': "Voor {aantal} POI's wordt de samenvatting bij opslaan eerst opgehaald.",
    'stap7.ophalen': 'Samenvattingen ophalen…',
    'stap7.delen': "CSV delen of opslaan ({aantal} POI's)",
    'stap7.opslaan': "CSV opslaan ({aantal} POI's)",
    'stap7.geenNaam': 'Vul een routenaam in; die wordt de categorie in EuroPoi.',
    'stap7.geenPois': "Er liggen geen POI's binnen de corridor. Verbreed de strook bij stap 5.",
    'stap7.samenvattingMislukt': 'Samenvattingen ophalen mislukt ({fout}). Probeer het opnieuw.',
    'stap7.geenTekst':
      "Geen van de POI's binnen de corridor heeft een tekst. Zet bij stap 6 'Ook POI's zonder tekst melden' " +
      'aan, of verbreed de corridor.',
    'stap7.opgeslagen': "{aantal} POI's opgeslagen in \"{bestand}\".",
    'stap7.delenTitel': 'CSV delen of opslaan',
    'stap7.aangeboden': "\"{bestand}\" ({aantal} POI's) is aangeboden om te delen of op te slaan.",
    'stap7.geannuleerd': 'Delen geannuleerd. Druk opnieuw op de knop om het bestand alsnog te delen.',

    // ---- Stap 8 (kop) ----
    'stap8.titel': 'Onderweg',
    'stap8.hint': "Zoek eerst POI's bij stap 4; er moet minstens één POI binnen de corridor liggen.",

    // ---- Stap 8 Onderweg ----
    'vervoer.wandelaar': 'Wandelaar',
    'vervoer.fietser': 'Fietser',
    'vervoer.motorrijder': 'Motorrijder',
    'onderweg.uitleg':
      'Volgt je GPS-positie langs de route en leest elke POI één keer voor zodra je in de buurt bent.',
    'onderweg.eerstOphalen': {
      een: 'Voor {aantal} POI wordt bij het starten eerst de samenvatting opgehaald (internet nodig).',
      meer: "Voor {aantal} POI's wordt bij het starten eerst de samenvatting opgehaald (internet nodig).",
    },
    'onderweg.vervoerKnop': '{vervoer} — meldt een POI {straal} m vooraf',
    'onderweg.trackOpnemen': 'Track opnemen (je afgelegde weg; pauzeert vanzelf als je stilstaat)',
    'onderweg.stoppen': 'Route stoppen',
    'onderweg.ophalen': 'Samenvattingen ophalen ({aantal})…',
    'onderweg.routeStarten': "Route starten ({aantal} POI's)",
    'onderweg.simulatieStarten': "Simulatie starten ({aantal} POI's)",
    'onderweg.nuZonder': 'Nu starten zonder',
    'onderweg.achtergrondActief': 'Achtergrond-GPS actief: de melding "{melding}" blijft staan tot u de route stopt.',
    'onderweg.ecoScherm': 'Eco-scherm',
    'onderweg.wachtGps': 'Wachten op GPS-positie…',
    'onderweg.gpsStatus':
      'GPS: nauwkeurigheid ± {nauwkeurigheid} m · rijrichting: {richting} · voorgelezen: {voorgelezen} van {aantal}',
    'onderweg.richtingOnbekend': 'nog onbekend (eerst ± 10 m verplaatsen)',
    'onderweg.voorlezen': 'Voorlezen: {naam}',
    'onderweg.stil': 'Stil',
    'onderweg.opUur': ', op {uur} uur',
    'onderweg.later': 'Later beluisteren ({aantal}):',
    'onderweg.duurUren': '{uur} u {min} min',
    'onderweg.sim.status': 'Simulatie: km {km} van {lengte} · {snelheid} km/u × {versnelling}',
    'onderweg.sim.gepauzeerd': ' · gepauzeerd',
    'onderweg.sim.einde': ' · einde route',
    'onderweg.sim.verder': 'Verder',
    'onderweg.sim.pauze': 'Pauze',
    'onderweg.sim.volgende': 'Naar volgende POI',
    'onderweg.sim.geenVolgende': 'Geen volgende POI meer verderop langs de route.',
    'onderweg.track.samenvatting': 'Track laatste rit ({moment}): {delen}',
    'onderweg.track.onderweg': '{duur} onderweg',
    'onderweg.track.nietAfgesloten': 'niet afgesloten',
    'onderweg.track.geenPauzes': 'geen pauzes',
    'onderweg.track.pauzes': { een: '{aantal} pauze ({duur})', meer: '{aantal} pauzes ({duur})' },
    'onderweg.track.gepauzeerd': 'Track gepauzeerd (stilstand) — gaat verder zodra je weer beweegt.',
    'onderweg.track.opgenomen': 'Track: {afstand} opgenomen.',
    'onderweg.track.weggegooid': 'Track weggegooid.',
    'onderweg.track.opslaanTitel': 'Track opslaan',
    'onderweg.track.aangeboden': '"{naam}" aangeboden; kies bijv. "Opslaan in Bestanden" of Drive.',
    'onderweg.track.opgeslagen': '"{naam}" opgeslagen.',
    'onderweg.track.geannuleerd': 'Opslaan geannuleerd.',
    'onderweg.track.mislukt': 'Track opslaan mislukt: {bericht}',
    'onderweg.track.weggooienVraag': 'Track definitief weggooien?',
    'onderweg.track.weggooienJa': 'Ja, weggooien',
    'onderweg.track.weggooienNee': 'Nee, bewaren',
    'onderweg.track.opslaan': 'Track opslaan (GPX)',
    'onderweg.track.weggooien': 'Track weggooien',
    'onderweg.logboek.delen': 'Logboek delen',
    'onderweg.logboek.tonen': 'Logboek tonen',
    'onderweg.logboek.verbergen': 'Logboek verbergen',
    'onderweg.logboek.klembord': 'Delen niet beschikbaar; het logboek staat op het klembord.',
    'onderweg.logboek.nietBeschikbaar': 'Delen niet beschikbaar. Kies "Logboek tonen" en kopieer de tekst.',
    'onderweg.test.titel': 'Testen',
    'onderweg.test.eerstStoppen': 'Stop eerst de rit om simulatie of achtergrond-GPS te kiezen.',
    'onderweg.test.simulatie': 'Simulatie: rit langs de route zonder GPS',
    'onderweg.test.achtergrond': 'Achtergrond-GPS: blijft werken met het scherm uit (proef, met vaste melding)',
    'onderweg.test.filter':
      'Filter laatste rit: {posities} posities; metingen {metingen}, waarvan weggegooid {nauwkeurigheid} ' +
      '(nauwkeurigheid) en {sprong} (sprong).',
    'onderweg.test.logboek': 'Logboek laatste rit: {samenvatting}',

    // ---- Samenvattingen ophalen bij de start (samenvattingVoorStart.js) ----
    'ophalen.zonder': {
      een: '{aantal} POI zonder samenvatting: korte omschrijving.',
      meer: "{aantal} POI's zonder samenvatting: korte omschrijving.",
    },
    'ophalen.offline': {
      een: 'Geen verbinding: {aantal} POI met korte omschrijving.',
      meer: "Geen verbinding: {aantal} POI's met korte omschrijving.",
    },
    'ophalen.fout': {
      een: 'Samenvattingen ophalen lukte niet: {aantal} POI met korte omschrijving.',
      meer: "Samenvattingen ophalen lukte niet: {aantal} POI's met korte omschrijving.",
    },
    'ophalen.teLang':
      'Samenvattingen nog niet binnen na {s} s; ze worden onderweg nog gebruikt zodra ze er zijn.',
    'ophalen.overgeslagen': 'Gestart zonder te wachten; samenvattingen worden onderweg nog gebruikt zodra ze er zijn.',

    // ---- GPS (positieBron.js); in het logboek altijd Nederlands ----
    'gps.melding': 'WikiPoi volgt uw route',
    'gps.fout': 'GPS-fout: {bericht}',
    'gps.geenToestemming': 'Geen toestemming voor locatie. Sta dit toe in de Android-instellingen.',
    'gps.geenToestemmingNauwkeurig':
      'Geen toestemming voor nauwkeurige locatie. Sta dit toe in de Android-instellingen.',

    // ---- Eco-scherm ----
    'eco.uur': 'uur',
    'eco.opnieuw': 'Opnieuw beluisteren',
    'eco.hint': '1× tikken = bel · 3× snel tikken = sluiten',

    // ---- Keuzevenster en gesproken aankondigingen (poiKeuze.js) ----
    'keuze.titel.ook': {
      een: 'Ook hier een bezienswaardigheid',
      meer: 'Ook hier {aantal} bezienswaardigheden',
    },
    'keuze.titel.pauze': 'Pauze — nog te beluisteren',
    'keuze.titel.overlap': '{telwoord} bezienswaardigheden hier',
    'keuze.hint.overlap': 'Kies wat je wilt horen. Geen keuze? Over {s} s de bovenste.',
    'keuze.hint.ook': 'Tik om nu te luisteren (onderbreekt het huidige verhaal). Anders volgt hij daarna.',
    'keuze.hint.pauze': 'Tik om te luisteren.',
    'keuze.allemaalLater': 'Allemaal later',
    'keuze.opsomming': '{lijst} en {laatste}',
    'keuze.enNog': '{lijst} en nog {telwoord}',
    'keuze.aankondiging': 'Hier {telwoord} bezienswaardigheden: {namen}.',
    'keuze.pauzeTekst': {
      een: 'Je hebt één bezienswaardigheid om te beluisteren.',
      meer: 'Je hebt {telwoord} bezienswaardigheden om te beluisteren.',
    },

    // ---- Kaart (RouteMap.jsx) ----
    'kaart.vanRoute': '{meters} m van de route',
    'kaart.geenRoute': 'Geen route geladen',
    'kaart.volgMij': 'Volg mij',
    'kaart.legenda': 'Legenda',

    // ---- Instellingen ----
    'inst.taal': 'Taal · Language',
    'inst.taalAuto': 'Automatisch (telefoon)',
    'inst.grens': "Grens eigen POI's",
    'inst.grensUitleg':
      'Eigen POI\'s doen mee tot deze afstand van de route (bij "altijd melden"). Buiten de corridor worden ' +
      'ze alleen bij de POI zelf gemeld.',
    'inst.corridor': 'Corridor bij de start',
    'inst.corridorWaarde': '{meters} m aan weerszijden van de route',
    'inst.zonderTekst': "Ook POI's zonder tekst standaard meenemen",
    'inst.vervoer': 'Vervoerwijze bij de start',
    'inst.afteltijd': 'Afteltijd keuzevenster',
    'inst.afteltijdUitleg': "Zo lang blijft het venster staan als er meer POI's tegelijk zijn.",
    'inst.updates': 'Updates',
    'inst.updateAuto': 'Bij het opstarten op updates controleren (hoogstens één keer per dag)',
    'inst.update.bezig': 'Bezig met controleren…',
    'inst.update.knop': 'Controleren op update',
    'inst.update.nieuw': 'Versie {versie} is beschikbaar{beta}.',
    'inst.update.actueel': 'Je hebt de nieuwste versie ({versie}).',
    'inst.update.geen': 'Nog geen release gepubliceerd.',
    'inst.update.fout': 'Controleren lukte niet: {reden}.',
    'inst.update.reden.geenFetch': 'geen verbinding mogelijk',
    'inst.update.reden.wachten': 'GitHub vraagt even te wachten',
    'inst.update.reden.status': 'GitHub gaf fout {status}',
    'inst.update.reden.verbinding': 'geen verbinding met GitHub',
    'inst.dezeVersie': 'Deze versie: {versie}',
    'inst.laatst': ' · laatst gecontroleerd {moment}',
    'inst.standaard': 'Standaardwaarden terugzetten',

    // ---- Welkomstmelding ----
    'welkom.titel': 'Welkom bij WikiPoi',
    'welkom.intro': 'WikiPoi zoekt bezienswaardigheden langs je route en leest ze onderweg voor.',
    'welkom.verkeer':
      '**Let op het verkeer.** Kijk onderweg niet naar het scherm: WikiPoi is gemaakt om te luisteren.',
    'welkom.eco':
      '**Eco-scherm:** een zwart scherm dat de accu spaart en alleen bij een POI iets toont. ' +
      '**1× tikken** = fietsbel, **3× snel tikken** = terug naar het gewone scherm.',
    'welkom.locatie':
      '**Locatie:** blijft op je telefoon. Je route, track en logboek gaan alleen weg als je zelf op ' +
      '"Delen" tikt.',
    'welkom.internet':
      '**Internet** is nodig voor het zoeken en de samenvattingen (Wikidata, Wikipedia, OpenStreetMap).',
    'welkom.beta': '**Bèta:** de teksten komen uit Wikipedia en kunnen fouten bevatten.',
    'welkom.meer': 'Meer, zoals licentie en bronnen: tik op ⓘ rechtsboven.',
    'welkom.begrepen': 'Begrepen',

    // ---- Over WikiPoi en bronnen (over/bronnen.js) ----
    'over.versie': '**Versie {versie}** · bèta',
    'over.licentie': 'Licentie',
    'over.licentieUitleg':
      'Je mag WikiPoi gebruiken, bestuderen, aanpassen en verder verspreiden onder dezelfde licentie. ' +
      'WikiPoi wordt geleverd zonder enige garantie.',
    'over.broncode': 'Broncode:',
    'over.bronnen': 'Bronnen',
    'over.privacy': 'Privacy',
    'over.privacyKort':
      'Je locatie, track en logboek blijven op je telefoon. Er gaat alleen iets weg als jij zelf op ' +
      '"Delen" tikt. Voor het zoeken en de samenvattingen vraagt WikiPoi gegevens op bij Wikidata, ' +
      'Wikipedia en OpenStreetMap voor het gebied van je route; de kaart haalt tegels op bij ' +
      'OpenStreetMap of Esri voor het stuk kaart dat je bekijkt. Bij de updatecontrole vraagt WikiPoi ' +
      'bij GitHub welke versies er zijn; daarbij gaat geen persoonlijke informatie mee (GitHub ziet wel ' +
      'je IP-adres). Die controle kun je uitzetten bij Instellingen.',
    'over.welkomOpnieuw': 'Welkomstmelding opnieuw tonen',
    'bron.wikidata': "POI's, namen en korte omschrijvingen",
    'bron.wikipedia': 'samenvattingen (bron: het artikel, bij stap 6)',
    'bron.commons': "foto's (maker en licentie per foto)",
    'bron.osm': "kaart en POI's (© OpenStreetMap-bijdragers)",
    'bron.esri': "luchtfoto's (© Esri, Maxar, Earthstar Geographics)",
    'bron.leaflet': 'kaartweergave',
    'bron.capacitor': 'Android-app',
    'bron.olc': 'pluscodes',
    'bron.fietsbel': 'geluid van Pixabay',
    'bron.fietsbelNaam': 'Fietsbel',
    'bron.perFoto': 'per foto',
    'bron.esriVoorwaarden': 'Esri-voorwaarden',

    // ---- Namen van talen (taalvolgorde.js) ----
    'taal.nl': 'Nederlands',
    'taal.en': 'Engels',
    'taal.de': 'Duits',
    'taal.fr': 'Frans',
    'taal.es': 'Spaans',
    'taal.it': 'Italiaans',
    'taal.pt': 'Portugees',
    'taal.da': 'Deens',
    'taal.sv': 'Zweeds',
    'taal.pl': 'Pools',
    'taal.no': 'Noors',
    'taal.nb': 'Noors',
    'taal.fi': 'Fins',
    'taal.cs': 'Tsjechisch',
    'taal.sk': 'Slowaaks',
    'taal.sl': 'Sloveens',
    'taal.hr': 'Kroatisch',
    'taal.hu': 'Hongaars',
    'taal.ro': 'Roemeens',
    'taal.bg': 'Bulgaars',
    'taal.el': 'Grieks',
    'taal.et': 'Estisch',
    'taal.lv': 'Lets',
    'taal.lt': 'Litouws',
    'taal.lb': 'Luxemburgs',
    'taal.ga': 'Iers',
    'taal.ca': 'Catalaans',
    'taal.eu': 'Baskisch',
    'taal.fy': 'Fries',
    'taal.ru': 'Russisch',
    'taal.uk': 'Oekraïens',
    'taal.tr': 'Turks',
  },
}
