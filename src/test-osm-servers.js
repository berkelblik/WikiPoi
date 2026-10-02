/**
 * test-osm-servers.js
 *
 * Geïsoleerde, netwerkloze test voor het doorschakelen tussen
 * Overpass-servers in osm-fallback.js#searchOverpass() (0.9.3). fetch()
 * wordt nagebootst, dus er gaat geen verzoek het internet op.
 *
 * Uitvoeren vanuit de map `src/` met:
 *   node test-osm-servers.js
 *
 * Slaagt (exit code 0) als alle scenario's kloppen; geeft anders per
 * mislukt scenario een duidelijke regel met verwacht vs. werkelijk
 * resultaat, en sluit af met exit code 1.
 */

const BBOX = { minLat: 52.1, maxLat: 52.2, minLng: 6.1, maxLng: 6.2 };
const FILTERS = [[{ key: 'historic', value: 'memorial' }]];
const ELEMENT = {
  type: 'node',
  id: 1,
  lat: 52.15,
  lon: 6.15,
  tags: { name: 'Testmonument', historic: 'memorial', description: 'Een gedenkteken.' },
};

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log('OK    ' + name);
  } else {
    failures++;
    console.log('FOUT  ' + name + (detail ? ' — ' + detail : ''));
  }
}

// Verse module per scenario, zodat de onthouden server niet doorlekt.
function freshModule() {
  delete require.cache[require.resolve('./osm-fallback.js')];
  return require('./osm-fallback.js');
}

// Nagebootste fetch: per servernaam een vaste uitkomst ('ok', een
// HTTP-status als getal, of 'netwerk'). Houdt bij welke URL's zijn
// aangeroepen.
function mockFetch(outcomeByHost) {
  const calls = [];
  global.fetch = async (url) => {
    const host = new URL(url).host;
    calls.push(host);
    const outcome = outcomeByHost[host];
    if (outcome === 'netwerk') throw new TypeError('Failed to fetch');
    if (outcome === 'ok') {
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ elements: [ELEMENT] }) };
    }
    return { ok: false, status: outcome, statusText: 'Fout', json: async () => ({}) };
  };
  return calls;
}

const PC = 'overpass.private.coffee';
const MAIN = 'overpass-api.de';

async function run() {
  // 1. Volgorde: Private.coffee eerst.
  {
    const osm = freshModule();
    const calls = mockFetch({ [PC]: 'ok', [MAIN]: 'ok' });
    const result = await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    check('1. eerste verzoek gaat naar Private.coffee', calls.join(',') === PC, 'aangeroepen: ' + calls.join(','));
    check('1. resultaat bevat het testmonument', result.length === 1, 'aantal: ' + result.length);
  }

  // 2. Private.coffee faalt (504) → hoofdserver; daarna direct hoofdserver.
  {
    const osm = freshModule();
    const calls = mockFetch({ [PC]: 504, [MAIN]: 'ok' });
    const result = await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    check('2. na 504 door naar hoofdserver', calls.join(',') === PC + ',' + MAIN, 'aangeroepen: ' + calls.join(','));
    check('2. resultaat via hoofdserver', result.length === 1, 'aantal: ' + result.length);
    calls.length = 0;
    await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    check('2. volgend verzoek begint bij de hoofdserver', calls.join(',') === MAIN, 'aangeroepen: ' + calls.join(','));
  }

  // 3. 429 en geen verbinding leiden ook tot doorschakelen.
  {
    const osm = freshModule();
    const calls = mockFetch({ [PC]: 'netwerk', [MAIN]: 'ok' });
    await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    check('3. geen verbinding → hoofdserver', calls.join(',') === PC + ',' + MAIN, 'aangeroepen: ' + calls.join(','));
    const osm2 = freshModule();
    const calls2 = mockFetch({ [PC]: 429, [MAIN]: 'ok' });
    await osm2.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    check('3. HTTP 429 → hoofdserver', calls2.join(',') === PC + ',' + MAIN, 'aangeroepen: ' + calls2.join(','));
  }

  // 4. Alle servers falen → één fout met per server de oorzaak.
  {
    const osm = freshModule();
    mockFetch({ [PC]: 504, [MAIN]: 429 });
    let message = '';
    try {
      await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    } catch (err) {
      message = err.message;
    }
    const expected = 'Overpass-query mislukt op alle servers (Private.coffee: HTTP 504; overpass-api.de: HTTP 429)';
    check('4. samenvattende foutmelding', message === expected, 'melding: ' + message);
  }

  // 5. HTTP 400 (ongeldige query) wordt meteen doorgegeven.
  {
    const osm = freshModule();
    const calls = mockFetch({ [PC]: 400, [MAIN]: 'ok' });
    let status = null;
    try {
      await osm.searchOverpass(BBOX, FILTERS, { maxRetries: 0 });
    } catch (err) {
      status = err.status;
    }
    check('5. HTTP 400 niet doorgeschakeld', status === 400 && calls.length === 1, 'status: ' + status + ', aanroepen: ' + calls.length);
  }

  console.log('');
  if (failures === 0) {
    console.log("ALLE SCENARIO'S GESLAAGD");
  } else {
    console.log(failures + ' SCENARIO(S) MISLUKT');
    process.exit(1);
  }
}

run();
