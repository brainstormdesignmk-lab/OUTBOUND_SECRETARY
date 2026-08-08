// ============================================================
// test-hermes-integration.js — CLOSE FLOW → Hermes end-to-end
// ============================================================
// The full Ana → Hermes loop, offline: a REAL conversation is driven
// to CLOSE while a local mock HTTP server stands in for Hermes at
// config.HERMES_URL. Verifies that buildCloseResponse:
//   1. POSTs EXACTLY ONE request to /create-property (the path
//      hermes-client.js targets)
//   2. Sends the X-Hermes-Key header (HERMES_API_KEY)
//   3. Sends the EXACT normalized payload — deep-equal to
//      buildPropertyJson() output (the same object the close flow
//      mirrors onto session.collectedData.hermesPayload)
//   4. Sale: selling_price/owner_price computed, monthly_rent null
//   5. Rent: monthly_rent + tenant_preferences + blocked_until
//      (future availableFrom) carried in the payload
//
// This is the missing link between test-hermes-client.js (client in
// isolation) and test-hermes-server.js (endpoint in isolation): the
// REAL close flow wiring, end to end.
//
// Runs fully offline (localhost mock only). The DATA_COLLECTION phase
// never calls the LLM, so no ANA_OFFLINE_LLM guard is needed.
// ============================================================
import { createServer } from 'node:http';
import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { buildPropertyJson } from './property-intelligence.js';
import { config } from './config.js';

const harness = createHarness();
const assert = harness.assert;

const MOCK_KEY = 'mock-hermes-key';
const requests = []; // { method, url, headers, body }

// ------------------------------------------------------------
// Mock Hermes — records every request, answers 200 { id }
// ------------------------------------------------------------
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body ? JSON.parse(body) : null
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: `mock-${requests.length}` }));
  });
});
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const { port } = mock.address();

// Point the real client at the mock (read at call time by hermes-client).
const prevUrl = config.HERMES_URL;
const prevKey = config.HERMES_API_KEY;
config.HERMES_URL = `http://127.0.0.1:${port}`;
config.HERMES_API_KEY = MOCK_KEY;

// Deep equality — recursive, order-independent.
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

async function waitForRequests(minCount, timeoutMs = 8000) {
  const t0 = Date.now();
  while (requests.length < minCount && Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 25));
  }
}

// UNIQUE phone numbers per scenario: the battery shares the collected-
// leads CSV and suites locate their own rows BY PHONE — reusing a phone
// from another suite (e.g. test-csv-output's +38970222222) makes that
// suite find THIS suite's stale row and fail on misaligned columns.
function makeSession(transactionType) {
  return {
    adMemory: {
      transactionType,
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'mock-test',
      adUrl: 'https://mock.test/ad',
      photoUrls: [],
      title: transactionType === 'sale'
        ? 'Се продава стан во Центар, новоградба'
        : 'Се издава стан во Центар, наместен'
    },
    collectedData: {
      cooperationAccepted: true,
      transactionType,
      propertyType: 'apartment'
    },
    messages: [],
    phone: transactionType === 'sale' ? '+38976000001' : '+38976000002'
  };
}

async function send(session, u) {
  const r = await generateResponse(session, u);
  session.messages.push({ role: 'user', text: u }, { role: 'model', text: r.text || '' });
  return r;
}

// Shared answer sequence — both sale and rent flows ask the same fields
// (rent just adds monthlyRent/availableFrom/tenantPreferences up front).
const FLOW_ANSWERS = [
  '74 kvadrati',          // totalSqm
  'nema',                 // terraceSqm → no terrace
  '2 spalni',             // bedrooms
  '4 kat',                // floor
  '10 katnica',           // totalFloors
  'ima lift',             // elevator
  'gradsko parno',        // heating
  'ima klima',            // ac
  'garaza',               // parking (garage)
  'jug',                  // orientation
  'kompletno namesten',   // furnished
  '2020 godina',          // yearBuilt
  'ne',                   // renovated → false
  'da',                   // documentationClean
  'da imam sliki, ke gi ispratam', // photos
  'Goran Petrov',         // ownerName
  'Dame Gruev 12'         // address
];

// ============================================================
// SCENARIO 1 — SALE: per-sqm price → computed selling price, the
// exact payload POSTed, monthly_rent stays null
// ============================================================
console.log(`\n=== 1. SALE close → Hermes POST (exact payload) ===`);
const saleSession = makeSession('sale');
let r = await send(saleSession, '2000 e za m2');
assert('S1 pricePerSqm extracted', saleSession.collectedData.pricePerSqm === 2000, `got ${saleSession.collectedData.pricePerSqm}`);

for (const a of FLOW_ANSWERS) {
  r = await send(saleSession, a);
  if (r.type === 'CLOSE') break;
}
assert('S1 sale closes', r.type === 'CLOSE', `got ${r.type}`);

await waitForRequests(1);
assert('S1 exactly ONE POST to mock', requests.length === 1, `got ${requests.length}`);
const s1req = requests[0];
assert('S1 POSTs to /create-property', s1req.url === '/create-property', `got ${s1req.url}`);
assert('S1 method POST', s1req.method === 'POST', `got ${s1req.method}`);
assert('S1 X-Hermes-Key header sent', s1req.headers['x-hermes-key'] === MOCK_KEY, `got ${s1req.headers['x-hermes-key']}`);

// The EXACT normalized payload — NON-CIRCULAR: rebuild the expected
// payload from the session state (the mirror onto collectedData is the
// same object the close flow passed to axios, so comparing against it
// would only prove a serialization round-trip). Rebuilding via
// buildPropertyJson(collectedData, adMemory, phone, propertyId) proves
// what went over the wire is exactly what the intelligence layer
// produces from the collected data + ad memory.
const rebuiltPayload = buildPropertyJson(saleSession.collectedData, saleSession.adMemory, saleSession.phone, s1req.body.property_id);
assert('S1 EXACT payload (== buildPropertyJson(collectedData, adMemory, phone, id))',
  deepEqual(s1req.body, rebuiltPayload),
  `body=${JSON.stringify(s1req.body).slice(0, 200)} expected=${JSON.stringify(rebuiltPayload).slice(0, 200)}`);
assert('S1 listing_type=sale', s1req.body.listing_type === 'sale', `got ${s1req.body.listing_type}`);
assert('S1 selling_price=151000 (74×2000×1.02 → 151000)', s1req.body.selling_price === 151000, `got ${s1req.body.selling_price}`);
assert('S1 owner_price=148000', s1req.body.owner_price === 148000, `got ${s1req.body.owner_price}`);
assert('S1 monthly_rent null for sale', s1req.body.monthly_rent === null, `got ${s1req.body.monthly_rent}`);
assert('S1 sqm=74', s1req.body.sqm === 74, `got ${s1req.body.sqm}`);
assert('S1 available=true (no blocked date)', s1req.body.available === true, '');
assert('S1 source_portal from adMemory', s1req.body.source_portal === 'mock-test', `got ${s1req.body.source_portal}`);
assert('S1 lead_phone preserved', s1req.body.lead_phone === '+38976000001', `got ${s1req.body.lead_phone}`);
assert('S1 property_id is a number (Ana folder id)', typeof s1req.body.property_id === 'number', `got ${typeof s1req.body.property_id}`);

// ============================================================
// SCENARIO 2 — RENT: monthly_rent + tenant_preferences +
// blocked_until (future availableFrom) in the payload
// ============================================================
console.log(`\n=== 2. RENT close → Hermes POST (rent fields) ===`);
const rentSession = makeSession('rent');
rentSession.collectedData.availableFrom = '2030-01-01';   // future → blocked_until
rentSession.collectedData.tenantPreferences = {
  preferred: ['families'],
  excluded: ['pets'],
  notes: 'Сопственикот изјави: BEZ MILENICI, SEMEJSTVA SE OK'
};
r = await send(rentSession, '500 evra');
assert('S2 monthlyRent extracted', rentSession.collectedData.monthlyRent === 500, `got ${rentSession.collectedData.monthlyRent}`);

for (const a of FLOW_ANSWERS) {
  r = await send(rentSession, a);
  if (r.type === 'CLOSE') break;
}
assert('S2 rent closes', r.type === 'CLOSE', `got ${r.type}`);

await waitForRequests(2);
assert('S2 total TWO POSTs (one per close)', requests.length === 2, `got ${requests.length}`);
const s2req = requests[1];
const rebuiltRent = buildPropertyJson(rentSession.collectedData, rentSession.adMemory, rentSession.phone, s2req.body.property_id);
assert('S2 payload == buildPropertyJson(collectedData, ...)', deepEqual(s2req.body, rebuiltRent),
  `body=${JSON.stringify(s2req.body).slice(0, 200)}`);
assert('S2 listing_type=rent', s2req.body.listing_type === 'rent', `got ${s2req.body.listing_type}`);
assert('S2 monthly_rent=500', s2req.body.monthly_rent === 500, `got ${s2req.body.monthly_rent}`);
assert('S2 available=false (future availableFrom)', s2req.body.available === false, `got ${s2req.body.available}`);
assert('S2 blocked_until=2030-01-01', s2req.body.blocked_until === '2030-01-01', `got ${s2req.body.blocked_until}`);
assert('S2 tenant_preferences.preferred=[families]', JSON.stringify(s2req.body.tenant_preferences?.preferred) === JSON.stringify(['families']),
  `got ${JSON.stringify(s2req.body.tenant_preferences)}`);
assert('S2 tenant_preferences.excluded=[pets]', JSON.stringify(s2req.body.tenant_preferences?.excluded) === JSON.stringify(['pets']), '');
assert('S2 tenant notes preserved', s2req.body.tenant_preferences?.notes.includes('BEZ MILENICI'), '');

// ------------------------------------------------------------
// Cleanup + summary
// ------------------------------------------------------------
config.HERMES_URL = prevUrl;
config.HERMES_API_KEY = prevKey;
await new Promise((resolve) => mock.close(resolve));

harness.summary('HERMES INTEGRATION SUITE (close flow → mock Hermes)');
harness.exit();
