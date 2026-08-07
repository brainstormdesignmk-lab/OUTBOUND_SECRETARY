import { createHarness } from './test-helpers.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ========================================
// test-config-env.js — Config via environment variables (Task 11)
// ========================================
// Verifies:
//   1. Env vars override defaults (ANA_* + deployment path vars)
//   2. Values are cast to the right types (int / float / bool)
//   3. Invalid numeric values fall back to defaults
//   4. Empty env values fall back to defaults
//   5. All original keys still exist with the same names (no breaking renames)
//
// Run: node test-config-env.js
// ========================================

const harness = createHarness();
const assert = harness.assert;

// config.js derives file-path defaults from the project root (no hardcoded
// /home/<user> paths after the Linux migration). This test file lives in the
// same directory as config.js, so the expected defaults are the same computed
// paths — assert against them rather than machine-specific strings.
const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_DEFAULT_CSV = path.join(PROJECT_DIR, 'data', 'collected-leads.csv');
const EXPECTED_DEFAULT_PROPERTY_ROOT = path.join(PROJECT_DIR, 'data', 'properties');
const EXPECTED_DEFAULT_BLOCKLIST = path.join(PROJECT_DIR, 'data', 'blocked-numbers.json');


// All env vars the config reads — cleared before each test block so no
// overrides leak between tests (and shell-exported ANA_* vars can't break
// the default-value assertions).
const CONFIG_ENV_VARS = [
  'ANA_MODEL', 'ANA_TEMPERATURE', 'ANA_MAX_TOKENS', 'ANA_MAX_HISTORY',
  'ANA_LLM_PROVIDERS', 'ANA_GEMINI_MODEL',
  'ANA_SALE_COMMISSION_PERCENT', 'ANA_RENT_COMMISSION_PERCENT',
  'ANA_REPLY_TIMEOUT_MS', 'ANA_FOLLOWUP_TIMEOUT_MS', 'ANA_GAP_BETWEEN_LEADS_MS',
  'ANA_TYPING_CHAR_MIN', 'ANA_TYPING_CHAR_MAX',
  'ANA_MESSAGE_PAUSE_MIN_MS', 'ANA_MESSAGE_PAUSE_MAX_MS',
  'ANA_MAX_MSGS_PER_HOUR', 'ANA_MAX_MSGS_PER_DAY_PER_CONTACT', 'ANA_MAX_MSGS_PER_DAY_TOTAL',
  'ANA_ACTIVE_HOURS_START', 'ANA_ACTIVE_HOURS_END',
  'ANA_ACTIVE_HOURS_AFTERNOON_START', 'ANA_ACTIVE_HOURS_AFTERNOON_END',
  'ANA_NO_MESSAGE_DAY', 'ANA_READY_ON_FINISH', 'ANA_SERVICE_ERROR_WAIT_MS',
  'CSV_OUTPUT_PATH', 'LEADS_INPUT_PATH', 'PROPERTY_ROOT', 'BLOCKLIST_PATH',
  'SESSIONS_PATH', 'METRICS_PATH', 'LOG_PATH', 'HEALTH_PORT'
];

function clearConfigEnv() {
  for (const k of CONFIG_ENV_VARS) {
    delete process.env[k];
  }
}

// Snapshot original env at suite start so it can be restored at the end
// (this suite deliberately clears/mutates these vars — undo it before exit
// so the mutation can't leak into any in-process runner).
const ENV_SNAPSHOT = {};
for (const k of CONFIG_ENV_VARS) {
  ENV_SNAPSHOT[k] = process.env[k];
}

function importConfig(envPatch) {
  clearConfigEnv(); // clean slate — no leakage between test blocks
  for (const [k, v] of Object.entries(envPatch)) {
    process.env[k] = v;
  }
  // Cache-busting import — config.js reads process.env at module load
  return import('./config.js?test=' + Date.now() + Math.random());
}

// ========================================
// 1. Defaults unchanged when no env set
// ========================================
{
  const { config } = await importConfig({});
  assert('default MODEL preserved', config.MODEL === 'llama-3.3-70b-versatile', `got ${config.MODEL}`);
  assert('default LLM_PROVIDERS preserved', config.LLM_PROVIDERS === 'groq,gemini', `got ${config.LLM_PROVIDERS}`);
  assert('default GEMINI_MODEL preserved', config.GEMINI_MODEL === 'gemini-2.5-flash', `got ${config.GEMINI_MODEL}`);
  assert('default REPLY_TIMEOUT preserved', config.REPLY_TIMEOUT === 30 * 60 * 1000, `got ${config.REPLY_TIMEOUT}`);
  assert('default CSV path is project data/collected-leads.csv', config.CSV_OUTPUT_PATH === EXPECTED_DEFAULT_CSV, `got ${config.CSV_OUTPUT_PATH}`);
  assert('default PROPERTY_ROOT is project data/properties', config.PROPERTY_ROOT === EXPECTED_DEFAULT_PROPERTY_ROOT, `got ${config.PROPERTY_ROOT}`);
  assert('default BLOCKLIST_PATH is project data/blocked-numbers.json', config.BLOCKLIST_PATH === EXPECTED_DEFAULT_BLOCKLIST, `got ${config.BLOCKLIST_PATH}`);
  assert('LOG_PATH has a default', typeof config.LOG_PATH === 'string' && config.LOG_PATH.length > 0, `got ${config.LOG_PATH}`);
  assert('HEALTH_PORT has a default', typeof config.HEALTH_PORT === 'number' && config.HEALTH_PORT > 0, `got ${config.HEALTH_PORT}`);
  assert('SERVICE_ERROR_WAIT_MS default is 5 min', config.SERVICE_ERROR_WAIT_MS === 5 * 60 * 1000, `got ${config.SERVICE_ERROR_WAIT_MS}`);
}

// ========================================
// 2. Env overrides + type casting
// ========================================
{
  const { config } = await importConfig({
    ANA_MODEL: 'llama-4-test',
    ANA_TEMPERATURE: '0.5',
    ANA_REPLY_TIMEOUT_MS: '5000',
    ANA_MAX_MSGS_PER_HOUR: '3',
    ANA_READY_ON_FINISH: 'false',
    ANA_SERVICE_ERROR_WAIT_MS: '15000',
    CSV_OUTPUT_PATH: '/tmp/test-leads.csv',
    LEADS_INPUT_PATH: '/tmp/test-input.csv',
    HEALTH_PORT: '9999',
    LOG_PATH: '/tmp/test-audit.log.jsonl'
  });
  assert('ANA_MODEL overridden', config.MODEL === 'llama-4-test', `got ${config.MODEL}`);
  assert('ANA_TEMPERATURE cast to float', config.TEMPERATURE === 0.5, `got ${config.TEMPERATURE} (${typeof config.TEMPERATURE})`);
  assert('ANA_REPLY_TIMEOUT_MS cast to int', config.REPLY_TIMEOUT === 5000, `got ${config.REPLY_TIMEOUT} (${typeof config.REPLY_TIMEOUT})`);
  assert('ANA_MAX_MSGS_PER_HOUR cast to int', config.MAX_MSGS_PER_HOUR === 3, `got ${config.MAX_MSGS_PER_HOUR}`);
  assert('ANA_READY_ON_FINISH cast to bool false', config.READY_ON_FINISH === false, `got ${config.READY_ON_FINISH}`);
  assert('ANA_SERVICE_ERROR_WAIT_MS cast to int', config.SERVICE_ERROR_WAIT_MS === 15000, `got ${config.SERVICE_ERROR_WAIT_MS}`);
  assert('CSV_OUTPUT_PATH overridden', config.CSV_OUTPUT_PATH === '/tmp/test-leads.csv', `got ${config.CSV_OUTPUT_PATH}`);
  assert('LEADS_INPUT_PATH overridden', config.LEADS_INPUT_PATH === '/tmp/test-input.csv', `got ${config.LEADS_INPUT_PATH}`);
  assert('HEALTH_PORT overridden', config.HEALTH_PORT === 9999, `got ${config.HEALTH_PORT}`);
  assert('LOG_PATH overridden', config.LOG_PATH === '/tmp/test-audit.log.jsonl', `got ${config.LOG_PATH}`);
}

// ========================================
// 3. Invalid numeric env → fall back to default
// ========================================
{
  const { config } = await importConfig({ ANA_REPLY_TIMEOUT_MS: 'not-a-number' });
  assert('invalid int falls back to default', config.REPLY_TIMEOUT === 30 * 60 * 1000, `got ${config.REPLY_TIMEOUT}`);
}

// ========================================
// 4. Empty env value → fall back to default (envStr keys)
// ========================================
{
  const { config } = await importConfig({ ANA_MODEL: '' });
  assert('empty string falls back to default', config.MODEL === 'llama-3.3-70b-versatile', `got "${config.MODEL}"`);
}

// ========================================
// 4b. Empty LOG_PATH/METRICS_PATH → DISABLED (console-only), NOT the default.
// envPath (unlike envStr) preserves '' so logger.js/metrics.js see a falsy
// path and skip file writes — the documented "Set empty to run console-only".
// ========================================
{
  const { config } = await importConfig({ LOG_PATH: '', METRICS_PATH: '' });
  assert('LOG_PATH empty disables file writes', config.LOG_PATH === '', `got "${config.LOG_PATH}"`);
  assert('METRICS_PATH empty disables file trail', config.METRICS_PATH === '', `got "${config.METRICS_PATH}"`);
}

// ========================================
// 4c. Empty SESSIONS_PATH → still falls back to default (only LOG_PATH,
// METRICS_PATH and HEALTH_PORT support a disabled mode; session
// persistence is required).
// ========================================
{
  const { config } = await importConfig({ SESSIONS_PATH: '' });
  assert('SESSIONS_PATH empty falls back to default', typeof config.SESSIONS_PATH === 'string' && config.SESSIONS_PATH.length > 0, `got "${config.SESSIONS_PATH}"`);
}

// ========================================
// 4d. Empty HEALTH_PORT → DISABLED (falsy → health.js skips the server),
// matching the documented "0/empty disables" — envIntOrEmpty preserves ''
// instead of envInt's fallback-to-default behavior.
// ========================================
{
  const { config } = await importConfig({ HEALTH_PORT: '' });
  assert('HEALTH_PORT empty disables server', config.HEALTH_PORT === '', `got "${config.HEALTH_PORT}"`);
  assert('HEALTH_PORT empty is falsy', !config.HEALTH_PORT, `got "${config.HEALTH_PORT}"`);
}

// ========================================
// 4e. HEALTH_PORT='0' → DISABLED too (parseInt('0') → 0 → falsy), matching
// the documented "0/empty disables". Explicitly locked in so the '0' branch
// can't silently regress to the default port.
// ========================================
{
  const { config } = await importConfig({ HEALTH_PORT: '0' });
  assert('HEALTH_PORT 0 disables server', config.HEALTH_PORT === 0, `got "${config.HEALTH_PORT}"`);
  assert('HEALTH_PORT 0 is falsy', !config.HEALTH_PORT, `got "${config.HEALTH_PORT}"`);
}

// ========================================
// 5. All original keys still present (no renames)
// ========================================
{
  const { config } = await importConfig({});
  const requiredKeys = [
    'MODEL', 'TEMPERATURE', 'MAX_TOKENS', 'MAX_HISTORY',
    'SALE_COMMISSION_PERCENT', 'RENT_COMMISSION_PERCENT',
    'REPLY_TIMEOUT', 'FOLLOWUP_TIMEOUT', 'GAP_BETWEEN_LEADS',
    'TYPING_CHAR_MIN', 'TYPING_CHAR_MAX', 'MESSAGE_PAUSE_MIN', 'MESSAGE_PAUSE_MAX',
    'MAX_MSGS_PER_HOUR', 'MAX_MSGS_PER_DAY_PER_CONTACT', 'MAX_MSGS_PER_DAY_TOTAL',
    'ACTIVE_HOURS_START', 'ACTIVE_HOURS_END', 'ACTIVE_HOURS_AFTERNOON_START', 'ACTIVE_HOURS_AFTERNOON_END',
    'NO_MESSAGE_DAY', 'CSV_OUTPUT_PATH', 'LEADS_INPUT_PATH', 'PROPERTY_ROOT',
    'BLOCKLIST_PATH', 'SESSIONS_PATH', 'METRICS_PATH'
  ];
  const missing = requiredKeys.filter(k => !(k in config));
  assert('all original keys present', missing.length === 0, `missing: ${missing.join(', ')}`);
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} config-env tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);

// Restore original env values (undo the suite's clear/mutate cycle)
for (const [k, v] of Object.entries(ENV_SNAPSHOT)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 CONFIG-ENV TESTS PASSED`);
