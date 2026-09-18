// Wegwerp-testscript — ref:rce wildcard-ondersteuning
const { buildOverpassQuery, searchOverpass } = require('./src/osm-fallback.js');
const { osmTagFiltersForKeys } = require('./src/poi-categories.js');

function assert(cond, msg) {
  console.log((cond ? 'OK: ' : 'FAIL: ') + msg);
}

const bbox = { minLat: 52.15, minLng: 6.40, maxLat: 52.17, maxLng: 6.44 };

const q1 = buildOverpassQuery(bbox, [[{ key: 'ref:rce' }]]);
assert(q1.includes('["ref:rce"]'), 'presence-only filter geeft ["ref:rce"] op');
assert(!q1.includes('="'), 'geen "=" wanneer alle tags presence-only zijn');

const q3 = buildOverpassQuery(bbox, [[{ key: 'heritage', value: '2' }]]);
assert(q3.includes('["heritage"="2"]'), 'gewone key/value-filters blijven werken');

const groups = osmTagFiltersForKeys(['gebouwd_erfgoed']);
assert(groups.some((g) => g.some((t) => t.key === 'ref:rce')), "gebouwd_erfgoed bevat nu de ref:rce-filter");

(async () => {
  console.log('\nLive Overpass-call rond Zutphen, op ref:rce (presence-only)...');
  const candidates = await searchOverpass(bbox, [[{ key: 'ref:rce' }]], { maxRetries: 2 });
  console.log('Gevonden kandidaten met een ref:rce-tag: ' + candidates.length);
  if (candidates[0]) console.log('Voorbeeld:', JSON.stringify(candidates[0]));
})();
