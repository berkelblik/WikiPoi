/**
 * test-commons-foto.js
 *
 * Netwerkloze test voor commons-foto.js: URL's en bestandsnamen, HTML naar
 * platte tekst, API-respons parseren, bronvermelding en de hoofdfunctie
 * met een nagebootste fetch.
 *
 * Uitvoeren vanuit src/:  node test-commons-foto.js
 */

'use strict';

const assert = require('assert');
const C = require('./commons-foto.js');

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log('OK  ' + name);
}

/** Pagina zoals de Commons-API (formatversion=2) hem levert. */
function pagina(titel, artist, licentie) {
  const extmetadata = {};
  if (artist !== undefined) extmetadata.Artist = { value: artist, source: 'commons-desc-page' };
  if (licentie !== undefined) extmetadata.LicenseShortName = { value: licentie, source: 'commons-desc-page' };
  return { ns: 6, title: titel, imageinfo: [{ extmetadata }] };
}

async function main() {
  await test('fotoUrl: FilePath met breedte, spaties als liggend streepje', () => {
    assert.strictEqual(
      C.fotoUrl('Église de Dun.jpg'),
      'https://commons.wikimedia.org/wiki/Special:FilePath/%C3%89glise_de_Dun.jpg?width=320'
    );
    assert.strictEqual(C.fotoUrl('File:A b.png', 640), 'https://commons.wikimedia.org/wiki/Special:FilePath/A_b.png?width=640');
    assert.strictEqual(C.fotoUrl(''), null);
    assert.strictEqual(C.fotoUrl(null), null);
  });

  await test('bestandsnaam uit upload-URL: thumb, origineel, svg; lokaal niet', () => {
    assert.strictEqual(
      C.bestandUitUploadUrl(
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/%C3%89glise_de_Dun.jpg/320px-%C3%89glise_de_Dun.jpg'
      ),
      'Église de Dun.jpg'
    );
    assert.strictEqual(
      C.bestandUitUploadUrl('https://upload.wikimedia.org/wikipedia/commons/3/3f/Kerk_Almen.JPG'),
      'Kerk Almen.JPG'
    );
    assert.strictEqual(
      C.bestandUitUploadUrl('https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Wapen.svg/320px-Wapen.svg.png'),
      'Wapen.svg'
    );
    assert.strictEqual(
      C.bestandUitUploadUrl('https://upload.wikimedia.org/wikipedia/fr/thumb/1/12/Logo.png/320px-Logo.png'),
      null
    );
    assert.strictEqual(C.bestandUitUploadUrl(null), null);
  });

  await test('platte tekst en maker: tags, entiteiten, witruimte, afkappen', () => {
    assert.strictEqual(
      C.platteTekst('<a href="//commons.wikimedia.org/wiki/User:X">Jean&nbsp;Dupont</a> &amp; <span>Marie</span>'),
      'Jean Dupont & Marie'
    );
    assert.strictEqual(C.platteTekst('&#201;mile &#xE9;t&#233;'), 'Émile été');
    assert.strictEqual(C.platteTekst('a &onbekend; b'), 'a &onbekend; b');
    assert.strictEqual(C.makerTekst('  '), null);
    const lang = C.makerTekst('x'.repeat(200));
    assert.strictEqual(lang.length, C.MAX_TEKENS_MAKER);
    assert.ok(lang.endsWith('…'));
  });

  await test('verzoek-URL: titels met File:, origin=*, alleen Artist en licentie', () => {
    const url = C.buildInfoUrl(['A b.jpg', 'Église.jpg']);
    assert.ok(url.startsWith('https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*'));
    assert.ok(url.includes('iiextmetadatafilter=Artist%7CLicenseShortName'));
    assert.ok(url.endsWith('&titles=' + encodeURIComponent('File:A b.jpg|File:Église.jpg')));
  });

  await test('parseren: genormaliseerde titel, ontbrekend bestand, alleen licentie', () => {
    const json = {
      query: {
        normalized: [{ from: 'File:kerk.jpg', to: 'File:Kerk.jpg' }],
        pages: [
          pagina('File:Kerk.jpg', '<a href="x">Jan Jansen</a>', 'CC BY-SA 4.0'),
          { ns: 6, title: 'File:Weg.jpg', missing: true },
          pagina('File:Oud.jpg', undefined, 'Public domain'),
          pagina('File:Leeg.jpg', '', ''),
        ],
      },
    };
    const r = C.parseInfo(json, ['kerk.jpg', 'Weg.jpg', 'Oud.jpg', 'Leeg.jpg']);
    assert.deepStrictEqual(r, {
      'kerk.jpg': { maker: 'Jan Jansen', licentie: 'CC BY-SA 4.0' },
      'Oud.jpg': { maker: null, licentie: 'Public domain' },
    });
    assert.deepStrictEqual(C.parseInfo(null, ['a.jpg']), {});
  });

  await test('bronvermelding: maker en licentie, één van beide, geen', () => {
    assert.strictEqual(C.bronTekst({ maker: 'Jan', licentie: 'CC BY 4.0' }), 'Foto: Jan, CC BY 4.0');
    assert.strictEqual(C.bronTekst({ maker: null, licentie: 'Public domain' }), 'Foto: Public domain');
    assert.strictEqual(C.bronTekst({ maker: 'Jan', licentie: null }), 'Foto: Jan');
    assert.strictEqual(C.bronTekst({ url: 'x' }), null);
    assert.strictEqual(C.bronTekst(null), null);
  });

  await test('hoofdfunctie: blokken, dubbel en File: eruit, samengevoegd', async () => {
    const verzoeken = [];
    const fetchImpl = async (url) => {
      const titels = decodeURIComponent(url.split('&titles=')[1]).split('|');
      verzoeken.push(titels);
      return {
        ok: true,
        json: async () => ({ query: { pages: titels.map((t) => pagina(t, 'Maker ' + t.slice(5), 'CC0')) } }),
      };
    };
    const r = await C.haalFotoInfo(['A.jpg', 'File:B.jpg', 'A.jpg', 'C_d.jpg', ''], {
      fetchImpl,
      blokGrootte: 2,
      retryDelayMs: 0,
    });
    assert.deepStrictEqual(verzoeken, [['File:A.jpg', 'File:B.jpg'], ['File:C d.jpg']]);
    assert.deepStrictEqual(Object.keys(r), ['A.jpg', 'B.jpg', 'C d.jpg']);
    assert.strictEqual(r['C d.jpg'].maker, 'Maker C d.jpg');
    assert.deepStrictEqual(await C.haalFotoInfo([], { fetchImpl }), {});
    assert.strictEqual(verzoeken.length, 2);
  });

  await test('hoofdfunctie: 503 → tweede poging; 400 → fout zonder tweede poging', async () => {
    let n = 0;
    const eerstDruk = async () => {
      n += 1;
      if (n === 1) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ query: { pages: [pagina('File:A.jpg', 'Jan', 'CC0')] } }) };
    };
    const r = await C.haalFotoInfo(['A.jpg'], { fetchImpl: eerstDruk, retryDelayMs: 0 });
    assert.strictEqual(n, 2);
    assert.strictEqual(r['A.jpg'].maker, 'Jan');

    let m = 0;
    const fout = async () => {
      m += 1;
      return { ok: false, status: 400 };
    };
    await assert.rejects(() => C.haalFotoInfo(['A.jpg'], { fetchImpl: fout, retryDelayMs: 0 }), /HTTP 400/);
    assert.strictEqual(m, 1);
  });

  console.log('\nAlle ' + passed + ' tests geslaagd.');
}

main().catch((err) => {
  console.error('MISLUKT:', err);
  process.exit(1);
});
