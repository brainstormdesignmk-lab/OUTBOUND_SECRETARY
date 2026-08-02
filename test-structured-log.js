import { createHarness } from './test-helpers.js';
// ========================================
// test-structured-log.js — Structured JSONL logger (Task 9)
// ========================================
// Verifies the logger:
//   1. Emits valid JSON lines to the configured file (JSONL format)
//   2. Each line has the stable shape { t, level, event, message, ...meta }
//   3. info/warn/error levels are distinguishable in the file
//   4. meta fields are preserved verbatim
//   5. Missing directory is auto-created (best-effort)
//
// Run: node test-structured-log.js
// ========================================
import fs from 'fs';
import path from 'path';
import os from 'os';

const harness = createHarness();
const assert = harness.assert;



// ========================================
// Use a temp log path (isolated from production)
// ========================================
const TEST_DIR = path.join(os.tmpdir(), 'ana-log-test-' + Date.now());
const TEST_LOG = path.join(TEST_DIR, 'audit.log.jsonl');

// The logger reads config at import time, so set the env BEFORE importing.
// (Config module is cached by the import system; we set env then import fresh
// via a cache-busting query param — standard ESM test pattern.)
// Snapshot original env values first so they can be restored at the end.
const ENV_SNAPSHOT = {};
for (const k of ['LOG_PATH', 'METRICS_PATH', 'SESSIONS_PATH']) {
  ENV_SNAPSHOT[k] = process.env[k];
}
process.env.LOG_PATH = TEST_LOG;
process.env.METRICS_PATH = path.join(TEST_DIR, 'metrics.jsonl');
process.env.SESSIONS_PATH = path.join(TEST_DIR, 'sessions.json');

const { logger } = await import('./logger.js?test=' + Date.now());

// ========================================
// 1. info event → valid JSONL line with stable shape
// ========================================
logger.info('campaign_start', 'Campaign started', { count: 12 });
logger.info('lead_started', 'Processing lead', { phone: '+38970000001', index: 0 });
logger.warn('strike_warning', 'Warning issued', { phone: '+38970000001', strike: 1 });
logger.error('reply_error', 'Error handling reply', { phone: '+38970000001', error: 'boom' });

assert('log file was created', fs.existsSync(TEST_LOG), `missing ${TEST_LOG}`);

const lines = fs.readFileSync(TEST_LOG, 'utf-8').trim().split('\n');
assert('four events written', lines.length === 4, `got ${lines.length}`);

// ========================================
// 2. Each line is valid JSON with the stable shape
// ========================================
const parsed = lines.map(l => JSON.parse(l));

assert('all lines parse as JSON', parsed.every(p => p && typeof p === 'object'));

assert('all lines have t (ISO timestamp)', parsed.every(p => /^\d{4}-\d{2}-\d{2}T/.test(p.t)), `first t=${parsed[0]?.t}`);
assert('all lines have level', parsed.every(p => ['info', 'warn', 'error'].includes(p.level)));
assert('all lines have event', parsed.every(p => typeof p.event === 'string' && p.event.length > 0));
assert('all lines have message', parsed.every(p => typeof p.message === 'string' && p.message.length > 0));

// ========================================
// 3. Levels distinguishable
// ========================================
assert('first event is info', parsed[0].level === 'info');
assert('third event is warn', parsed[2].level === 'warn');
assert('fourth event is error', parsed[3].level === 'error');

// ========================================
// 4. Meta fields preserved verbatim
// ========================================
const leadEvent = parsed.find(p => p.event === 'lead_started');
assert('meta.phone preserved', leadEvent.phone === '+38970000001', `got ${leadEvent?.phone}`);
assert('meta.index preserved as number', leadEvent.index === 0, `got ${leadEvent?.index}`);
assert('meta.count preserved', parsed.find(p => p.event === 'campaign_start').count === 12);
assert('meta.error preserved', parsed.find(p => p.event === 'reply_error').error === 'boom');

// ========================================
// 5. Auto-creates missing directory
// ========================================
assert('temp dir auto-created', fs.existsSync(TEST_DIR), `missing ${TEST_DIR}`);

// ========================================
// Cleanup
// ========================================
try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch (e) {}

// Restore original env values (undo the suite's process.env mutation)
for (const [k, v] of Object.entries(ENV_SNAPSHOT)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} structured-log tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 STRUCTURED-LOG TESTS PASSED`);
