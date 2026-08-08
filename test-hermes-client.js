// ============================================================
// test-hermes-client.js — Hermes/Lovable submission client
// ============================================================
// Tests the Ana → Hermes property-database handoff (spec item #6/#7:
// "Hermes create-property endpoint" + "Lovable auto-insert"):
//
//   1. HERMES_URL unset  → silent no-op (Ana stays fully offline, the
//      whole pipeline runs without a network — CI-safe).
//   2. Payload validation → empty payload refused before any network.
//   3. Debounce → runaway close loops can't burst the endpoint.
//   4. API-key header → X-Hermes-Key sent to the edge function.
//   5. Real POST round-trip → a localhost HTTP mock proves the client
//      hits the /create-property path with the exact payload and treats
//      a 200 as submitted:true (no external network needed).
//   6. Server error → submit fails gracefully (submitted:false, reason),
//      never throws — property is already persisted locally.
//
// Runs fully offline (localhost mock only).
// ============================================================
import { createServer } from 'node:http';
import { createHarness } from './test-helpers.js';
import { config } from './config.js';
import { submitPropertyToHermes } from './hermes-client.js';

const harness = createHarness();
const assert = harness.assert;
const SAMPLE_PAYLOAD = {
  listing_type: 'sale',
  available: true,
  blocked_until: null,
  sqm: 74,
  owner_price: 200000,
  agency_percent: 2,
  selling_price: 204000,
  description_public: 'Се продава стан во центар.',
  broker_comment: 'Сопственик бара: 2500€/м²',
  tenant_preferences: { preferred: ['families'], excluded: [], notes: '...' },
  property_id: 'pz-test-1',
  lead_phone: '+38970000001'
};

// 1. Env-gated no-op — with HERMES_URL unset the client must refuse
//    without touching the network (returns a reason, never throws).
async function testNoUrl() {
  const prev = config.HERMES_URL;
  config.HERMES_URL = '';
  try {
    const r = await submitPropertyToHermes(SAMPLE_PAYLOAD);
    assert('no HERMES_URL → silent no-op', r.submitted === false && r.reason === 'HERMES_URL not configured', JSON.stringify(r));
  } finally {
    config.HERMES_URL = prev;
  }
}

// 2. Payload validation — refused before any network attempt.
async function testEmptyPayload() {
  const prev = config.HERMES_URL;
  config.HERMES_URL = 'http://127.0.0.1:1'; // unreachable — must NOT be hit
  try {
    const r = await submitPropertyToHermes(null);
    assert('null payload → refused', r.submitted === false && r.reason === 'empty payload', JSON.stringify(r));
    const r2 = await submitPropertyToHermes('not-an-object');
    assert('non-object payload → refused', r2.submitted === false && r2.reason === 'empty payload', JSON.stringify(r2));
  } finally {
    config.HERMES_URL = prev;
  }
}

// 3+4+5+6. Real round-trip against a localhost mock that records the
//    request (method, path, headers, body) and answers 200.
async function testRoundTrip() {
  let received = null;
  let hitCount = 0;
  const server = createServer((req, res) => {
    hitCount++;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received = { method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 'prop-123', property_id: SAMPLE_PAYLOAD.property_id }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const prevUrl = config.HERMES_URL;
  const prevKey = config.HERMES_API_KEY;
  config.HERMES_URL = `http://127.0.0.1:${port}`;
  config.HERMES_API_KEY = 'test-secret-key';
  try {
    // 5. Successful round-trip
    const r = await submitPropertyToHermes(SAMPLE_PAYLOAD);
    assert('POST success → submitted:true', r.submitted === true, JSON.stringify(r));
    assert('hit the /create-property path', received && received.url === '/create-property', received && received.url);
    assert('method is POST', received && received.method === 'POST', received && received.method);
    assert('4. X-Hermes-Key header sent', received && received.headers['x-hermes-key'] === 'test-secret-key', JSON.stringify(received && received.headers));
    assert('payload body preserved exactly', received && JSON.stringify(received.body) === JSON.stringify(SAMPLE_PAYLOAD), JSON.stringify(received && received.body));

    // 3. Dedup — an immediate REPEAT of the same property_id must be
    //    skipped (test loops / double-fired close events), but a DIFFERENT
    //    property closing right after must still go through (back-to-back
    //    batch closes are normal — a global debounce would drop them).
    const r2 = await submitPropertyToHermes(SAMPLE_PAYLOAD);
    assert('dedup → immediate repeat of same property skipped', r2.submitted === false && r2.reason === 'duplicate property_id recently submitted', JSON.stringify(r2));
    assert('mock hit exactly once', hitCount === 1, `hitCount=${hitCount}`);
    const r3 = await submitPropertyToHermes({ ...SAMPLE_PAYLOAD, property_id: 'pz-test-2' });
    assert('different property NOT blocked by dedup', r3.submitted === true, JSON.stringify(r3));
    assert('mock hit twice (both properties submitted)', hitCount === 2, `hitCount=${hitCount}`);
  } finally {
    config.HERMES_URL = prevUrl;
    config.HERMES_API_KEY = prevKey;
    await new Promise((resolve) => server.close(resolve));
  }
}

// 6. Server failure — 500/connection error → graceful submitted:false.
async function testServerError() {
  let errorServerHit = false;
  const server = createServer((req, res) => {
    errorServerHit = true;
    req.resume();
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'store_failed' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const prevUrl = config.HERMES_URL;
  config.HERMES_URL = `http://127.0.0.1:${port}`;
  try {
    // Distinct property_id (not yet deduped) so this genuinely reaches the
    // 500 server instead of being skipped as a duplicate.
    const r = await submitPropertyToHermes({ ...SAMPLE_PAYLOAD, property_id: 'pz-test-3' });
    assert('server 500 → submitted:false (never throws)', r.submitted === false && r.reason !== 'duplicate property_id recently submitted' && typeof r.reason === 'string', JSON.stringify(r));
    assert('error server really received the request', errorServerHit === true);
  } finally {
    config.HERMES_URL = prevUrl;
    await new Promise((resolve) => server.close(resolve));
  }
}

await testNoUrl();
await testEmptyPayload();
await testRoundTrip();
await testServerError();

harness.summary('HERMES-CLIENT SUITE');
harness.exit();
