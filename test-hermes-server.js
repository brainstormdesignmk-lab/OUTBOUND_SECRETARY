// ============================================================
// test-hermes-server.js — Hermes create-property ENDPOINT
// ============================================================
// Exercises the RUNNABLE Hermes server (hermes-server.js) — the
// property-database layer of the Ana → Lovable integration:
//   POST /create-property (and the spec-name alias /properties):
//   validate → store → return id. No calculations, no AI.
//
// Coverage (all offline — express app mounted on an ephemeral port,
// storage in a throwaway temp dir):
//   1. Kill switch (HERMES_ENABLED=false) → 503, nothing written
//   2. Auth — missing/wrong X-Hermes-Key → 401
//   3. Method guard — GET → 405
//   4. Validation — bad listing_type / sqm / blocked_until → 400
//      with details; valid payload passes
//   5. Store → 200 { id, property_id }; row persisted (JSONL)
//   6. Idempotency — repeat POST of the same property_id returns the
//      ORIGINAL id, no duplicate row
//   7. automation_log append (property.created)
//   8. Unknown fields are whitelist-dropped (never stored), matching
//      the edge function
//   9. /properties alias behaves identically
// ============================================================
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { createHarness } from './test-helpers.js';
import { createHermesApp } from './hermes-server.js';

const harness = createHarness();
const assert = harness.assert;

const KEY = 'test-hermes-key';
const SAMPLE = {
  listing_type: 'sale',
  available: true,
  blocked_until: null,
  city: 'Skopje',
  municipality: 'Centar',
  sqm: 74,
  floor: 1,
  heating: 'district',
  elevator: true,
  garage: true,
  garage_price: 15000,
  owner_price_per_sqm: 2500,
  owner_price: 200000,
  agency_percent: 2,
  selling_price: 204000,
  monthly_rent: null,
  description_public: 'Се продава стан во центар.',
  broker_comment: 'Сопственик бара: 2500€/м²',
  tenant_preferences: { preferred: ['families'], excluded: [], notes: '...' },
  property_id: 'pz-test-1',
  lead_phone: '+38970000001',
  source_portal: 'reklama5',
  source_ad_url: 'https://x',
  unknown_field_should_be_dropped: 'x'
};

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// axios, not global fetch — the repo deliberately avoids bare fetch for
// Node 16 compat (the Atom boxes), see the webhook-migration commit.
async function post(server, path, body, headers = {}) {
  const { port } = server.address();
  try {
    const res = await axios.post(`http://127.0.0.1:${port}${path}`, body, {
      headers: { 'Content-Type': 'application/json', ...headers },
      validateStatus: () => true // observe 4xx/5xx instead of throwing
    });
    return { status: res.status, json: res.data };
  } catch (err) {
    return { status: 0, json: { error: err.message } };
  }
}

// ============================================================
// 1. KILL SWITCH — disabled app → 503, store stays empty
// ============================================================
const disabledDir = mkdtempSync(join(tmpdir(), 'hermes-disabled-'));
const disabledApp = createHermesApp({ enabled: false, apiKey: KEY, storeDir: disabledDir });
const disabledServer = await listen(disabledApp);
{
  const r = await post(disabledServer, '/create-property', SAMPLE, { 'X-Hermes-Key': KEY });
  assert('kill switch → 503 hermes_disabled', r.status === 503 && r.json?.error === 'hermes_disabled', JSON.stringify(r));
  assert('kill switch → nothing written', !existsSync(join(disabledDir, 'properties.jsonl')));
}
await new Promise((res) => disabledServer.close(res));

// ============================================================
// 2–9. ENABLED app — auth, method guard, validation, store,
//      idempotency, automation log, whitelist, alias
// ============================================================
const storeDir = mkdtempSync(join(tmpdir(), 'hermes-'));
const app = createHermesApp({ enabled: true, apiKey: KEY, storeDir });
const server = await listen(app);

// 2. Auth
{
  const noKey = await post(server, '/create-property', SAMPLE);
  assert('missing key → 401', noKey.status === 401 && noKey.json?.error === 'unauthorized', JSON.stringify(noKey));
  const wrongKey = await post(server, '/create-property', SAMPLE, { 'X-Hermes-Key': 'wrong' });
  assert('wrong key → 401', wrongKey.status === 401 && wrongKey.json?.error === 'unauthorized', JSON.stringify(wrongKey));
}

// 3. Method guard
{
  const res = await axios.get(`http://127.0.0.1:${server.address().port}/create-property`, {
    validateStatus: () => true
  });
  assert('GET → 405 method_not_allowed', res.status === 405, `got ${res.status}`);
}

// 3b. Malformed JSON body → JSON 400 (contract parity with the edge
// function — Express's default HTML error must not leak).
{
  try {
    await axios.post(`http://127.0.0.1:${server.address().port}/create-property`, '{not-json', {
      headers: { 'Content-Type': 'application/json', 'X-Hermes-Key': KEY },
      validateStatus: () => true
    }).then((res) => {
      assert('malformed JSON → 400 invalid_json', res.status === 400 && res.data?.error === 'invalid_json',
        `got ${res.status} ${JSON.stringify(res.data)}`);
    });
  } catch (err) {
    assert('malformed JSON → 400 invalid_json', false, err.message);
  }
}

// 4. Validation
{
  const badType = await post(server, '/create-property', { ...SAMPLE, listing_type: 'lease' }, { 'X-Hermes-Key': KEY });
  assert('bad listing_type → 400', badType.status === 400 && badType.json?.error === 'validation_failed', JSON.stringify(badType));
  const badSqm = await post(server, '/create-property', { ...SAMPLE, sqm: -5 }, { 'X-Hermes-Key': KEY });
  assert('negative sqm → 400', badSqm.status === 400, JSON.stringify(badSqm));
  const badDate = await post(server, '/create-property', { ...SAMPLE, blocked_until: 'not-a-date' }, { 'X-Hermes-Key': KEY });
  assert('bad blocked_until → 400', badDate.status === 400, JSON.stringify(badDate));
}

// 5. Store + 8. whitelist drop
{
  const r = await post(server, '/create-property', SAMPLE, { 'X-Hermes-Key': KEY });
  assert('valid → 200 { id, property_id }', r.status === 200 && !!r.json?.id && r.json.property_id === 'pz-test-1', JSON.stringify(r));
  const rows = readFileSync(join(storeDir, 'properties.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert('row persisted', rows.length === 1 && rows[0].property_id === 'pz-test-1', JSON.stringify(rows));
  assert('unknown field whitelist-dropped', rows[0].unknown_field_should_be_dropped === undefined, JSON.stringify(rows[0]));
  assert('payload fields preserved', rows[0].selling_price === 204000 && rows[0].sqm === 74, '');
  const firstId = r.json.id;

  // 6. Idempotency — same property_id → same id, no duplicate row
  const r2 = await post(server, '/create-property', SAMPLE, { 'X-Hermes-Key': KEY });
  assert('repeat property_id → original id', r2.status === 200 && r2.json.id === firstId, JSON.stringify(r2));
  const rows2 = readFileSync(join(storeDir, 'properties.jsonl'), 'utf8').split('\n').filter(Boolean);
  assert('no duplicate row', rows2.length === 1, `rows=${rows2.length}`);
}

// 7. Automation log
{
  const logRows = readFileSync(join(storeDir, 'automation-log.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert('automation_log appended', logRows.length === 1 && logRows[0].action === 'property.created', JSON.stringify(logRows));
  assert('automation_log source=ana', logRows[0].source === 'ana', '');
}

// 9. /properties alias
{
  const r = await post(server, '/properties', { ...SAMPLE, property_id: 'pz-alias-1', sqm: 50 }, { 'X-Hermes-Key': KEY });
  assert('/properties alias stores', r.status === 200 && !!r.json?.id, JSON.stringify(r));
  const rows = readFileSync(join(storeDir, 'properties.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert('alias row persisted', rows.some((p) => p.property_id === 'pz-alias-1' && p.sqm === 50), '');
}

// 10. Rent payload with monthly_rent
{
  const r = await post(server, '/create-property', {
    listing_type: 'rent', sqm: 63, monthly_rent: 500, property_id: 'pz-rent-1'
  }, { 'X-Hermes-Key': KEY });
  assert('rent payload stores', r.status === 200 && !!r.json?.id, JSON.stringify(r));
  const rows = readFileSync(join(storeDir, 'properties.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const rentRow = rows.find((p) => p.property_id === 'pz-rent-1');
  assert('monthly_rent preserved', rentRow?.monthly_rent === 500, JSON.stringify(rentRow));
}

await new Promise((res) => server.close(res));
rmSync(storeDir, { recursive: true, force: true });
rmSync(disabledDir, { recursive: true, force: true });

harness.summary('HERMES-SERVER SUITE');
harness.exit();
