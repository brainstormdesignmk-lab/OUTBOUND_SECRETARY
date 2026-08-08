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

let lastSubmitAttempt = 0;
const SUBMIT_MIN_INTERVAL_MS = 500; // debounce runaway test loops

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

  // Debounce: skip if a submit just happened (protects the close path from
  // firing a burst when several leads close back-to-back).
  const now = Date.now();
  if (now - lastSubmitAttempt < SUBMIT_MIN_INTERVAL_MS) {
    return { submitted: false, reason: 'debounced' };
  }
  lastSubmitAttempt = now;

  try {
    const res = await axios.post(`${String(url).replace(/\/+$/, '')}/properties`, payload, {
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`[HERMES: property ${payload.property_id} submitted — status ${res.status}]`);
    return { submitted: true, response: res.data };
  } catch (err) {
    // Property is already persisted locally — a Hermes failure is logged,
    // never fatal (the spec keeps CRUD in Hermes, but Ana never blocks on it).
    console.error(`[HERMES: submit failed for property ${payload.property_id}: ${err.message}]`);
    return { submitted: false, reason: err.message };
  }
}
