// ============================================================
// test-public-properties.js — PHASE 3: blocked_until visibility
// ============================================================
// The public listings query hides properties whose available-from date
// is in the future and shows them again once it passes. Covers the 3
// concrete cases from LOVABLE_HERMES_INTEGRATION_PLAN.txt:
//
//   1. property free today (blocked_until is null)          → SHOWN
//   2. blocked_until in the future                          → HIDDEN
//   3. blocked_until already passed                         → SHOWN again
//
// Plus boundary cases the risk plan flags as the usual breakage:
//   - same-day blocked_until (<= vs <) → SHOWN immediately (>=/<= used
//     consistently so a same-day availability must show)
//   - timezone proofing: blocked_until is a calendar `date`, compared
//     to the calendar day — no UTC off-by-one
//   - PUBLIC_FIELDS only: broker_comment / price_warning / lead_phone /
//     tenant_preferences never leak to the customer page
//   - listing_type / city filters
//
// Tests the runnable endpoint (hermes-server.js GET /public-properties)
// which mirrors the reference edge function hermes/public-properties/
// index.ts. Fully offline (localhost + temp store dir).
// ============================================================
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import axios from 'axios';
import { createHarness } from './test-helpers.js';
import { createHermesApp, isPropertyVisible } from './hermes-server.js';

const harness = createHarness();
const assert = harness.assert;

// ------------------------------------------------------------
// Store seeds — one property per visibility case
// ------------------------------------------------------------
function record(id, blockedUntil, extra = {}) {
  return {
    id: `id-${id}`,
    listing_type: 'sale',
    available: !blockedUntil,
    blocked_until: blockedUntil ?? null,
    city: 'Skopje',
    municipality: 'Centar',
    sqm: 74,
    description_public: `опис ${id}`,
    broker_comment: 'СОПСТВЕНИК БАРА: 2500€/м² — ИНТЕРНО, НЕ СМЕЕ ДА ИСТЕЧЕ',
    price_warning: true,
    lead_phone: '+38976000001',
    tenant_preferences: { preferred: ['families'], excluded: [], notes: 'СЕКРЕТНА БЕЛЕШКА' },
    source_portal: 'reklama5',
    created_at: '2026-01-01T00:00:00.000Z',
    ...extra
  };
}

const TODAY = '2026-08-08';
const rows = [
  record('free', null),                                    // case 1: shown
  record('future', '2030-01-01'),                          // case 2: hidden
  record('passed', '2026-01-01'),                          // case 3: shown again
  record('same-day', TODAY),                               // boundary: shown today
  record('rent', null, { listing_type: 'rent', city: 'Bitola' }), // filter target
  record('no-city', null, { city: 'Ohrid' })               // filter target
];

// ============================================================
// 1. PURE FUNCTION — the 3 cases + boundary
// ============================================================
console.log(`\n=== 1. isPropertyVisible (pure) ===`);
assert('case 1: null blocked_until → visible', isPropertyVisible(null, TODAY) === true, '');
assert('case 2: future date → HIDDEN', isPropertyVisible('2030-01-01', TODAY) === false, '');
assert('case 3: passed date → visible again', isPropertyVisible('2026-01-01', TODAY) === true, '');
assert('boundary: same-day → visible (<= not <)', isPropertyVisible(TODAY, TODAY) === true, '');
assert('boundary: tomorrow → hidden', isPropertyVisible('2026-08-09', TODAY) === false, '');
assert('boundary: yesterday → visible', isPropertyVisible('2026-08-07', TODAY) === true, '');

// ============================================================
// 2. ENDPOINT — GET /public-properties with injected today
// ============================================================
const storeDir = mkdtempSync(join(tmpdir(), 'hermes-public-'));
writeFileSync(join(storeDir, 'properties.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const app = createHermesApp({ enabled: true, apiKey: 'k', storeDir });
const server = createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function get(path) {
  const res = await axios.get(`${base}${path}`, { validateStatus: () => true });
  return res.data;
}

console.log(`\n=== 2. GET /public-properties ===`);
const all = await get(`/public-properties?today=${TODAY}`);
assert('endpoint returns array', Array.isArray(all.properties), '');
assert('each row carries its public id (deep-link to detail view)', all.properties.every((p) => typeof p.id === 'string' && p.id.length > 0),
  JSON.stringify(all.properties.map((p) => p.id)));
assert('case 1 shown', all.properties.some((p) => p.description_public === 'опис free'), '');
assert('case 2 HIDDEN', !all.properties.some((p) => p.description_public === 'опис future'), JSON.stringify(all.properties.map((p) => p.description_public)));
assert('case 3 shown again', all.properties.some((p) => p.description_public === 'опис passed'), '');
assert('boundary same-day shown', all.properties.some((p) => p.description_public === 'опис same-day'), '');

// PUBLIC_FIELDS leak guard
for (const p of all.properties) {
  assert('no broker_comment leak', p.broker_comment === undefined, `leaked: ${JSON.stringify(p)}`);
  assert('no price_warning leak', p.price_warning === undefined, '');
  assert('no lead_phone leak', p.lead_phone === undefined, '');
  assert('no tenant_preferences leak', p.tenant_preferences === undefined, '');
  assert('no source_portal leak', p.source_portal === undefined, '');
  assert('public description kept', p.description_public !== undefined, '');
}

// Filters
const saleOnly = await get(`/public-properties?today=${TODAY}&listing_type=sale`);
assert('listing_type=sale excludes rent rows', saleOnly.properties.every((p) => p.listing_type === 'sale'), '');
// Parity with the edge function: an INVALID listing_type is ignored (full
// list returned), not an empty list.
const bogusType = await get(`/public-properties?today=${TODAY}&listing_type=bogus`);
assert('invalid listing_type ignored (parity with edge fn)', bogusType.properties.length === all.properties.length,
  `got ${bogusType.properties.length}, expected ${all.properties.length}`);
const cityFilter = await get(`/public-properties?today=${TODAY}&city=Bitola`);
assert('city=Bitola returns only Bitola', cityFilter.properties.length >= 1 && cityFilter.properties.every((p) => p.city === 'Bitola'),
  JSON.stringify(cityFilter.properties));
assert('city filter case-insensitive', (await get(`/public-properties?today=${TODAY}&city=bitola`)).properties.length === cityFilter.properties.length, '');

// Invalid today → default (UTC today, no crash)
const badToday = await get('/public-properties?today=not-a-date');
assert('invalid ?today falls back to real today (no crash)', Array.isArray(badToday.properties), '');

// ============================================================
// Cleanup + summary
// ============================================================
await new Promise((resolve) => server.close(resolve));
rmSync(storeDir, { recursive: true, force: true });

harness.summary('PUBLIC-PROPERTIES SUITE (Phase 3 blocked_until visibility)');
harness.exit();
