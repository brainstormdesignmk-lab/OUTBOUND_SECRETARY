// ========================================
// config.js — Central configuration (env-overridable)
// ========================================
// Task 11: "Config via environment variables — deploy to any environment."
// Every value can be overridden via environment variables, so the same
// codebase runs in dev (local paths), test (CI temp paths), and production
// (Docker/k8s) without edits. Defaults are the current production values.
//
// Override convention:
//   ANA_ prefix for app-specific knobs (ANA_MODEL, ANA_REPLY_TIMEOUT_MS...)
//   PLAIN names for deployment concerns (CSV_OUTPUT_PATH, LEADS_INPUT_PATH,
//   SESSIONS_PATH, METRICS_PATH, LOG_PATH, HEALTH_PORT)
//
// FILE-PATH DEFAULTS are derived from the project root (never a hardcoded
// /home/<user> path), so the codebase runs on any machine after a migration.
// Point them elsewhere via env when needed (e.g. PROPERTY_ROOT at an
// external archive location in production).
// ========================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// === PATH HELPERS — project-relative defaults (portable across machines) ===
const PROJECT_ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

// === ENV HELPERS (all values validated + cast) ===
function envStr(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function envInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function envFloat(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

function envBool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

// Path-style helper where an EXPLICIT empty value means "disabled"
// (console-only / no file writes — see LOG_PATH, METRICS_PATH). Undefined
// still falls back to the default, so unset vars behave exactly as before;
// only a deliberate `VAR=''` opts out. Use this ONLY for paths that support
// a disabled mode — not for required paths (envStr semantics).
function envPath(name, fallback) {
  const v = process.env[name];
  return v === undefined ? fallback : v;
}

// Int variant with the same "explicit empty disables" semantics (HEALTH_PORT).
// Undefined → default; '' → preserved as '' so health.js's falsy check
// disables the server (matching the documented "0/empty disables"); a valid
// number string is parsed; anything else → default.
function envIntOrEmpty(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  if (v === '') return '';
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  // === LLM ===
  // TIERED MODELS (user-approved split): MODEL = the SMART tier for
  // skeptical/rebuttal persuasion turns; MODEL_LITE = the ROUTINE tier for
  // the bulk of persuasion replies. Both models have SEPARATE Groq
  // per-model quota buckets (the observed 70b 429 was "for model
  // llama-3.3-70b-versatile ... TPD: Limit 100000" — exhausting one model
  // does not touch the other), so the split multiplies daily capacity
  // inside a single key. Free-tier reality (Aug 2026): 70b = 100K TPD
  // (~41 calls/day at ~2.4K tokens/call), 8b = 500K TPD (~208 calls/day).
  MODEL: envStr('ANA_MODEL', "llama-3.3-70b-versatile"),
  MODEL_LITE: envStr('ANA_MODEL_LITE', "llama-3.1-8b-instant"),
  // PROVIDER FALLBACK CHAIN (reported: Groq TPD exhaustion froze the
  // persuasion phase). Ordered comma-separated provider names walked by
  // llm-provider.js — Groq primary, then Gemini (independent free-tier
  // quota), cascading on rate limits/outages. The safe fallback + human
  // escalation remain the final net. "groq" alone restores old behavior.
  LLM_PROVIDERS: envStr('ANA_LLM_PROVIDERS', 'groq,gemini'),
  // Gemini fallback model (AI Studio free tier). OBSERVED on this account
  // (live 429): "generate_content_free_tier_requests, limit: 20, model:
  // gemini-2.5-flash" — the free tier is REQUEST-counted (~20/day), NOT
  // token-counted, so shortening prompts does NOT multiply Gemini capacity
  // (only Groq, which is TPD-bound, benefits from fewer tokens). Gemini
  // capacity multiplies via: (a) more PROJECTS (quota is per-project, not
  // per-key — GEMINI_API_KEYS comma-list), (b) more MODELS (flash-lite has
  // its own per-model bucket — the ROUTINE tier). gemini-2.5-flash = smart
  // tier; gemini-2.5-flash-lite = routine tier (cheaper/higher throughput).
  GEMINI_MODEL: envStr('ANA_GEMINI_MODEL', 'gemini-2.5-flash'),
  GEMINI_MODEL_LITE: envStr('ANA_GEMINI_MODEL_LITE', 'gemini-2.5-flash-lite'),
  TEMPERATURE: envFloat('ANA_TEMPERATURE', 0.2),
  MAX_TOKENS: envInt('ANA_MAX_TOKENS', 120),
  // Conversation turns fed to the persuasion prompt. INPUT tokens count
  // toward every provider's daily quota — 20 turns + the system prompt was
  // ~2,300 tokens/call (reported 429: Requested 2290), and the full history
  // was being sent regardless (MAX_HISTORY was defined but never consumed).
  // 8 turns keeps recent context while nearly doubling daily capacity.
  MAX_HISTORY: envInt('ANA_MAX_HISTORY', 8),

  // === COMMISSION ===
  SALE_COMMISSION_PERCENT: envInt('ANA_SALE_COMMISSION_PERCENT', 2),
  RENT_COMMISSION_PERCENT: envInt('ANA_RENT_COMMISSION_PERCENT', 50),

  // === HERMES / LOVABLE ===
  // Property-database endpoint (the spec's POST /properties). When unset,
  // the hermes-client is a silent no-op (Ana still persists property.json
  // + CSV locally) — HERMES_URL is only set in deployments that have the
  // Hermes/Lovable property database reachable. No port default: the URL
  // must be a full base URL (https://hermes.example.com).
  HERMES_URL: envStr('HERMES_URL', ''),
  // API key for the Hermes create-property edge function (X-Hermes-Key
  // header). Optional — when unset the client POSTs without auth (useful
  // against a local mock; production Hermes deployments require it).
  HERMES_API_KEY: envStr('HERMES_API_KEY', ''),

  // === TIMING (ms) ===
  REPLY_TIMEOUT: envInt('ANA_REPLY_TIMEOUT_MS', 30 * 60 * 1000),
  FOLLOWUP_TIMEOUT: envInt('ANA_FOLLOWUP_TIMEOUT_MS', 2 * 60 * 60 * 1000),
  GAP_BETWEEN_LEADS: envInt('ANA_GAP_BETWEEN_LEADS_MS', 10 * 60 * 1000),
  // Owner-follow-up grace window (interactive TUI): after an owner message
  // Ana waits this long for a possible follow-up (or two) before replying —
  // real owners often type several messages in a row. A new message re-arms
  // the window; 0 = reply instantly (campaign/tests). 30s gives a slower
  // owner time to fire a 2nd message while keeping the test snappy
  // (reported: "some of them are slow"). Used by the interactive TUI
  // (engine ownerGraceMs).
  OWNER_FOLLOWUP_GRACE_MS: envInt('ANA_OWNER_FOLLOWUP_GRACE_MS', 30000),
  // CLOSING FOLLOW-UP WINDOW (reported, approved Option A — grace window
  // only): after a successful data-collection close, the chat stays
  // reachable for this long so an owner's end questions ("KOGA DA VE
  // OCEKUVAM SO KLIENTI?", "SE NAJDOBRO") still get answered by the
  // rule-based closing responder (handlers/closing-phase.js). A message
  // inside the window re-arms it ("10 min of silence" semantics); after it
  // expires, late messages are IGNORED exactly as before. Fits inside the
  // existing GAP_BETWEEN_LEADS, so it never delays the next lead.
  CLOSE_FOLLOWUP_WINDOW_MS: envInt('ANA_CLOSE_FOLLOWUP_WINDOW_MS', 10 * 60 * 1000),
  TYPING_CHAR_MIN: envInt('ANA_TYPING_CHAR_MIN', 80),
  TYPING_CHAR_MAX: envInt('ANA_TYPING_CHAR_MAX', 250),
  MESSAGE_PAUSE_MIN: envInt('ANA_MESSAGE_PAUSE_MIN_MS', 2000),
  MESSAGE_PAUSE_MAX: envInt('ANA_MESSAGE_PAUSE_MAX_MS', 5000),

  // === ANTI-BAN LIMITS ===
  MAX_MSGS_PER_HOUR: envInt('ANA_MAX_MSGS_PER_HOUR', 15),
  MAX_MSGS_PER_DAY_PER_CONTACT: envInt('ANA_MAX_MSGS_PER_DAY_PER_CONTACT', 30),
  MAX_MSGS_PER_DAY_TOTAL: envInt('ANA_MAX_MSGS_PER_DAY_TOTAL', 50),
  ACTIVE_HOURS_START: envInt('ANA_ACTIVE_HOURS_START', 7),
  ACTIVE_HOURS_END: envInt('ANA_ACTIVE_HOURS_END', 14),
  ACTIVE_HOURS_AFTERNOON_START: envInt('ANA_ACTIVE_HOURS_AFTERNOON_START', 15),
  ACTIVE_HOURS_AFTERNOON_END: envInt('ANA_ACTIVE_HOURS_AFTERNOON_END', 23),
  NO_MESSAGE_DAY: envInt('ANA_NO_MESSAGE_DAY', 0),

  // === FILE PATHS (deployment concerns — plain env names) ===
  // Defaults are relative to the project root — no hardcoded /home/<user>
  // paths (that was the Linux-migration breakage). Override via env to point
  // anywhere (CI temp dirs, production archive volumes, etc.).
  CSV_OUTPUT_PATH: envStr('CSV_OUTPUT_PATH', path.join(DATA_DIR, 'collected-leads.csv')),
  LEADS_INPUT_PATH: envStr('LEADS_INPUT_PATH', path.join(PROJECT_ROOT, 'leads', 'today.csv')),

  // Property archive root — per-property folders (photos/documents/history
  // + property.json). Was hardcoded to Documents/NEKRETNINI_EVBR on the
  // old machine; now defaults into the project data dir, env-overridable.
  PROPERTY_ROOT: envStr('PROPERTY_ROOT', path.join(DATA_DIR, 'properties')),

  // Persistent blocklist of terminated leads (3-strike protocol).
  BLOCKLIST_PATH: envStr('BLOCKLIST_PATH', path.join(DATA_DIR, 'blocked-numbers.json')),

  // Session persistence — JSON file path for campaign recovery.
  SESSIONS_PATH: envStr('SESSIONS_PATH', path.join(DATA_DIR, 'sessions.json')),

  // Metrics — optional JSONL trail for live counters (metrics.js).
  // Set empty to disable the file trail (in-memory only).
  METRICS_PATH: envPath('METRICS_PATH', path.join(DATA_DIR, 'metrics.jsonl')),

  // Structured audit log — JSONL event trail (logger.js, Task 9).
  // Set empty to run console-only (no file writes) — envPath preserves
  // the empty value instead of falling back to the default.
  LOG_PATH: envPath('LOG_PATH', path.join(DATA_DIR, 'audit.log.jsonl')),

  // Health-check HTTP server (health.js, Task 10) — 0/empty disables.
  // envIntOrEmpty preserves '' so health.js's falsy check turns the server
  // off (envInt would have silently forced the default port).
  HEALTH_PORT: envIntOrEmpty('HEALTH_PORT', 8081),

  // Readiness gate for /readyz — allow k8s to see "campaign finished".
  // If the campaign exits naturally this is fine; long-running daemons
  // should leave this true.
  READY_ON_FINISH: envBool('ANA_READY_ON_FINISH', true),

  // Human escalation: after a first service ERROR the bot waits this long
  // for the owner's next reply before recovering; a SECOND consecutive
  // error escalates the lead to a human (NEEDS_HUMAN). Kept well below
  // REPLY_TIMEOUT so a transient failure doesn't stall the whole campaign
  // waiting on a likely-non-responsive owner.
  SERVICE_ERROR_WAIT_MS: envInt('ANA_SERVICE_ERROR_WAIT_MS', 5 * 60 * 1000),

  // === PHOTOS (marketing follow-up + reminder ladder + manager review) ===
  // When the owner has NO photos ("NEMAM"), Ana asks if he could make them
  // himself and send them on Viber (marketing value). If YES → VIBER_PENDING
  // with a reminder ladder: remind at 2 days, follow up again at 5 days,
  // close after PHOTOS_TIMEOUT_MS of silence (reported requirement).
  PHOTOS_REMINDER_1_MS: envInt('ANA_PHOTOS_REMINDER_1_MS', 2 * 24 * 60 * 60 * 1000),
  PHOTOS_REMINDER_2_MS: envInt('ANA_PHOTOS_REMINDER_2_MS', 5 * 24 * 60 * 60 * 1000),
  PHOTOS_TIMEOUT_MS: envInt('ANA_PHOTOS_TIMEOUT_MS', 7 * 24 * 60 * 60 * 1000),
  // "If the property is worth it — manager reviews them": a NO_PHOTOS lead
  // whose price meets the transaction-specific threshold is flagged
  // photosManagerReview=true for the ops team (the owner also gets a
  // professional-photography offer from our agents).
  PHOTOS_MANAGER_REVIEW_MIN_SALE_PRICE: envInt('ANA_PHOTOS_MANAGER_REVIEW_MIN_SALE_PRICE', 100000),
  PHOTOS_MANAGER_REVIEW_MIN_RENT: envInt('ANA_PHOTOS_MANAGER_REVIEW_MIN_RENT', 400)
};
