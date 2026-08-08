// ============================================================
// hermes-server.js — RUNNABLE Hermes create-property endpoint
// ============================================================
// The spec's property-database layer: "POST /properties → validate →
// store → return id. No calculations. No AI. No enrichment. No
// business decisions." This is the runnable Node/Express counterpart
// of the reference Supabase edge function (hermes/create-property/
// index.ts) — same contract, same auth, same validation, same
// automation_log — but it runs anywhere Ana runs (no Supabase needed)
// and persists to local JSONL files (the repo's data/*.jsonl pattern).
//
// What hermes-client.js (Ana side) POSTs:
//   POST {HERMES_URL}/create-property          ← primary path
//   POST {HERMES_URL}/properties               ← spec-name alias
//   headers: { "Content-Type": "application/json",
//              "X-Hermes-Key": "<HERMES_API_KEY>" }
//   body:    buildPropertyJson() output
//   → 200 { id, property_id }        stored (or already existed — idempotent)
//   → 401 invalid/missing key        → 503 kill switch off
//   → 400 validation failed          → 405 wrong method
//
// Storage:
//   HERMES_STORE_DIR (default ./data/hermes)
//     properties.jsonl   — one property per line { id, ...row, created_at }
//     automation-log.jsonl — { action, entity_type, entity_id, payload,
//                             source, created_at } (write-only audit)
//   Idempotent by property_id: a repeat POST of the same property_id
//   returns the ORIGINAL id instead of duplicating the row.
//
// Start:  node hermes-server.js            (HERMES_PORT, default 8787)
//         HERMES_ENABLED=true HERMES_API_KEY=... node hermes-server.js
// ============================================================
import express from 'express';
import fs from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { randomUUID } from 'crypto';

const HERMES_ENABLED = (process.env.HERMES_ENABLED || '').toLowerCase() === 'true';
const HERMES_API_KEY = process.env.HERMES_API_KEY || '';
const HERMES_PORT = Number(process.env.HERMES_PORT || 8787);
const DEFAULT_STORE_DIR = process.env.HERMES_STORE_DIR || './data/hermes';

// ============================================================
// Whitelist + validation — MUST stay in lockstep with
// hermes/create-property/index.ts (the Supabase deployment).
// ============================================================
const ALLOWED_LISTING_TYPES = new Set(['sale', 'rent']);
const ALLOWED_FIELDS = new Set([
  'listing_type', 'available', 'blocked_until',
  'city', 'municipality',
  'sqm', 'floor', 'heating', 'elevator', 'garage', 'garage_price',
  'owner_price_per_sqm', 'owner_price', 'agency_percent', 'selling_price', 'price_warning', 'monthly_rent',
  'description_public', 'broker_comment', 'tenant_preferences',
  'property_id', 'lead_phone', 'source_portal', 'source_ad_url'
]);

// Minimal schema validation — range sanity only, NEVER value rewriting
// (all business rules already ran on Ana's side).
function validate(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') {
    return ['body must be a JSON object'];
  }
  if (!ALLOWED_LISTING_TYPES.has(payload.listing_type)) {
    problems.push("listing_type must be 'sale' or 'rent'");
  }
  if (payload.sqm !== null && payload.sqm !== undefined &&
      (!Number.isFinite(payload.sqm) || payload.sqm <= 0 || payload.sqm > 100000)) {
    problems.push('sqm must be a positive number ≤ 100000');
  }
  for (const f of ['owner_price', 'selling_price', 'monthly_rent']) {
    const v = payload[f];
    if (v !== null && v !== undefined && (!Number.isFinite(v) || v <= 0)) {
      problems.push(`${f} must be a positive number when present`);
    }
  }
  if (payload.blocked_until !== null && payload.blocked_until !== undefined) {
    const d = new Date(payload.blocked_until);
    if (Number.isNaN(d.getTime())) problems.push('blocked_until must be an ISO date');
  }
  return problems;
}

// ============================================================
// JSONL store helpers (append-only; a line is one JSON object)
// ============================================================
function ensureStore(storeDir) {
  fs.mkdirSync(storeDir, { recursive: true });
}

function appendLine(storeDir, file, obj) {
  ensureStore(storeDir);
  fs.appendFileSync(join(storeDir, file), JSON.stringify(obj) + '\n');
}

function readLines(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  return raw.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// Idempotency: a stored property with the same property_id → original id.
function findExisting(storeDir, propertyId) {
  if (!propertyId) return null;
  return readLines(join(storeDir, 'properties.jsonl')).find((p) => p.property_id === propertyId) || null;
}

// ============================================================
// Request handler — identical semantics to the edge function.
// Options resolved once per app (factory) so tests can spin up
// multiple variants (kill-switch on/off, isolated store dirs)
// in one process.
// ============================================================
function makeHandler({ enabled, apiKey, storeDir }) {
  return function handleCreateProperty(req, res) {
    // Kill switch — instant 503, nothing written (Ana keeps working offline).
    if (!enabled) {
      return res.status(503).json({ error: 'hermes_disabled' });
    }

    // API-key auth — timing-safe compare against the configured secret.
    if (!apiKey || !safeKeyEqual(req.headers['x-hermes-key'], apiKey)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const payload = req.body;
    const problems = validate(payload);
    if (problems.length > 0) {
      return res.status(400).json({ error: 'validation_failed', details: problems });
    }

    // Idempotent by property_id — a retry must not create a duplicate row.
    const existing = findExisting(storeDir, payload.property_id);
    if (existing) {
      return res.status(200).json({ id: existing.id, property_id: payload.property_id ?? null });
    }

    // Whitelist the incoming payload to the allowed columns.
    const row = {};
    for (const k of Object.keys(payload)) {
      if (ALLOWED_FIELDS.has(k)) row[k] = payload[k];
    }

    const id = randomUUID();
    const record = { id, ...row, created_at: new Date().toISOString() };
    appendLine(storeDir, 'properties.jsonl', record);

    // Append to automation_log (write-only; support/audit only).
    appendLine(storeDir, 'automation-log.jsonl', {
      action: 'property.created',
      entity_type: 'property',
      entity_id: id,
      payload: row,
      source: 'ana',
      created_at: record.created_at
    });

    console.log(`[HERMES] property ${payload.property_id || id} stored → ${id}`);
    return res.status(200).json({ id, property_id: payload.property_id ?? null });
  };
}

// Timing-safe key compare (constant-time over the key length) — the
// header is attacker-controlled, a plain !== can leak timing on match.
function safeKeyEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ============================================================
// App factory — exported so tests can mount it on an ephemeral
// port without the module auto-starting.
//   createHermesApp({ enabled, apiKey, storeDir }) — all optional,
//   defaults come from the process env (HERMES_ENABLED,
//   HERMES_API_KEY, HERMES_STORE_DIR).
// ============================================================
export function createHermesApp(opts = {}) {
  const options = {
    enabled: opts.enabled !== undefined ? opts.enabled : HERMES_ENABLED,
    apiKey: opts.apiKey !== undefined ? opts.apiKey : HERMES_API_KEY,
    storeDir: opts.storeDir !== undefined ? opts.storeDir : (process.env.HERMES_STORE_DIR || DEFAULT_STORE_DIR)
  };
  const app = express();
  app.use(express.json());
  const handler = makeHandler(options);

  // Method guard + dispatch in ONE route per path — parity with the edge
  // function (405 for non-POST). POST → handler; everything else → 405.
  const guard = (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed', details: 'use POST' });
    }
    return handler(req, res);
  };
  app.all('/create-property', guard);
  app.all('/properties', guard); // spec-name alias
  app.get('/health', (req, res) => res.json({ status: 'Hermes OK' }));

  // Malformed-JSON bodies → body-parser error → Express's default HTML 400.
  // Return the same JSON contract as the edge function (invalid_json).
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'payload_too_large' });
    }
    console.error('[HERMES] unhandled error:', err && err.message);
    return res.status(500).json({ error: 'internal_error' });
  });
  return app;
}

// Auto-start when run directly (node hermes-server.js)
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createHermesApp();
  app.listen(HERMES_PORT, '0.0.0.0', () => {
    console.log(`[HERMES] 🚀 create-property endpoint on :${HERMES_PORT}`);
    console.log(`[HERMES] ${HERMES_ENABLED ? 'enabled' : 'DISABLED (kill switch — set HERMES_ENABLED=true)'}`);
    console.log(`[HERMES] store: ${process.env.HERMES_STORE_DIR || DEFAULT_STORE_DIR}`);
  });
}
