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
// All file paths default to the original production Linux paths; on local
// dev they should be pointed at local files via env.
// ========================================

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

export const config = {
  // === LLM ===
  MODEL: envStr('ANA_MODEL', "llama-3.3-70b-versatile"),
  TEMPERATURE: envFloat('ANA_TEMPERATURE', 0.2),
  MAX_TOKENS: envInt('ANA_MAX_TOKENS', 120),
  MAX_HISTORY: envInt('ANA_MAX_HISTORY', 20),

  // === COMMISSION ===
  SALE_COMMISSION_PERCENT: envInt('ANA_SALE_COMMISSION_PERCENT', 2),
  RENT_COMMISSION_PERCENT: envInt('ANA_RENT_COMMISSION_PERCENT', 50),

  // === TIMING (ms) ===
  REPLY_TIMEOUT: envInt('ANA_REPLY_TIMEOUT_MS', 30 * 60 * 1000),
  FOLLOWUP_TIMEOUT: envInt('ANA_FOLLOWUP_TIMEOUT_MS', 2 * 60 * 60 * 1000),
  GAP_BETWEEN_LEADS: envInt('ANA_GAP_BETWEEN_LEADS_MS', 10 * 60 * 1000),
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
  CSV_OUTPUT_PATH: envStr('CSV_OUTPUT_PATH', "/home/metropolis2/real-estate-atoms/data/collected-leads.csv"),
  LEADS_INPUT_PATH: envStr('LEADS_INPUT_PATH', "/home/metropolis2/real-estate-atoms/leads/today.csv"),

  // Session persistence — JSON file path for campaign recovery.
  SESSIONS_PATH: envStr('SESSIONS_PATH', "./data/sessions.json"),

  // Metrics — optional JSONL trail for live counters (metrics.js).
  METRICS_PATH: envStr('METRICS_PATH', "./data/metrics.jsonl"),

  // Structured audit log — JSONL event trail (logger.js, Task 9).
  // Set empty to run console-only (no file writes).
  LOG_PATH: envStr('LOG_PATH', "./data/audit.log.jsonl"),

  // Health-check HTTP server (health.js, Task 10) — 0/empty disables.
  HEALTH_PORT: envInt('HEALTH_PORT', 8081),

  // Readiness gate for /readyz — allow k8s to see "campaign finished".
  // If the campaign exits naturally this is fine; long-running daemons
  // should leave this true.
  READY_ON_FINISH: envBool('ANA_READY_ON_FINISH', true),

  // Human escalation: after a first service ERROR the bot waits this long
  // for the owner's next reply before recovering; a SECOND consecutive
  // error escalates the lead to a human (NEEDS_HUMAN). Kept well below
  // REPLY_TIMEOUT so a transient failure doesn't stall the whole campaign
  // waiting on a likely-non-responsive owner.
  SERVICE_ERROR_WAIT_MS: envInt('ANA_SERVICE_ERROR_WAIT_MS', 5 * 60 * 1000)
};
