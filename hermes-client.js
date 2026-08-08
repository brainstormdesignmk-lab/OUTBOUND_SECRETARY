// ============================================================
// hermes-client.js — Property database submission (Hermes/Lovable)
// ============================================================
// The spec: "Lovable/Hermes = property database layer. Receives payload,
// stores payload, updates payload, displays payload. POST /properties →
// validate, store, return id. No calculations. No AI. No enrichment.
// No business decisions."
//
// This client sends the NORMALIZED property JSON built by the Ana
// intelligence layer (property-intelligence.js buildPropertyJson) to the
// configured Hermes endpoint. Env-gated: without HERMES_URL the module is
// a silent no-op (never hits the network in CI/tests — the whole pipeline
// runs offline; HERMES_URL is set only in a deployment that has Hermes).
//
// Fire-and-forget by design: property persistence (property.json + CSV)
// has already happened locally; a Hermes outage must never block the close
// flow. Failures are logged, not thrown.
// ============================================================
import axios from 'axios';
import { config } from './config.js';

// Per-property dedup: skip only an IMMEDIATE REPEAT of the SAME
// property_id (test loops / double-fired close events). Different
// properties closing back-to-back (normal in batch mode) must ALL be
// submitted — a global 500ms debounce used to silently drop the second
// one (code-review finding).
const lastSubmitByProperty = new Map();
const DEDUP_WINDOW_MS = 10_000;

// Hermes endpoint path — see hermes/create-property/index.ts (Supabase
// edge function). Kept in one place so the URL and path stay in lockstep
// with the reference deployment.
const HERMES_CREATE_PATH = '/create-property';

/**
 * POST a normalized property payload to Hermes (fire-and-forget).
 * @param {Object} payload — buildPropertyJson() output (or any object)
 * @returns {Promise<{submitted: boolean, reason?: string, response?: Object}>}
 */
export async function submitPropertyToHermes(payload) {
  const url = config.HERMES_URL;
  if (!url || !String(url).trim()) {
    return { submitted: false, reason: 'HERMES_URL not configured' };
  }
  if (!payload || typeof payload !== 'object') {
    return { submitted: false, reason: 'empty payload' };
  }

  // Dedup: skip an immediate repeat of the SAME property (a test loop or a
  // double-fired close event). A fresh property_id is never blocked.
  const now = Date.now();
  const propKey = String(payload.property_id || 'anonymous');
  const lastAt = lastSubmitByProperty.get(propKey);
  if (lastAt !== undefined && now - lastAt < DEDUP_WINDOW_MS) {
    return { submitted: false, reason: 'duplicate property_id recently submitted' };
  }
  lastSubmitByProperty.set(propKey, now);
  // Prune stale entries so the map can't grow unbounded.
  if (lastSubmitByProperty.size > 200) {
    for (const [k, t] of lastSubmitByProperty) {
      if (now - t >= DEDUP_WINDOW_MS) lastSubmitByProperty.delete(k);
    }
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    // API-key auth — matches the Hermes edge function's X-Hermes-Key check.
    // Only sent when HERMES_API_KEY is configured (dev/no-key deployments
    // can still test against a local mock that skips auth).
    if (config.HERMES_API_KEY) headers['X-Hermes-Key'] = config.HERMES_API_KEY;
    const res = await axios.post(
      `${String(url).replace(/\/+$/, '')}${HERMES_CREATE_PATH}`,
      payload,
      { timeout: 15000, headers }
    );
    console.log(`[HERMES: property ${payload.property_id} submitted — status ${res.status}]`);
    return { submitted: true, response: res.data };
  } catch (err) {
    // Property is already persisted locally — a Hermes failure is logged,
    // never fatal (the spec keeps CRUD in Hermes, but Ana never blocks on it).
    console.error(`[HERMES: submit failed for property ${payload.property_id}: ${err.message}]`);
    return { submitted: false, reason: err.message };
  }
}
