import { createHarness } from './test-helpers.js';
// ========================================
// test-csv-retry.js — CSV write resilience
// ========================================
// Verifies the "wrap CSV write in retry + fallback-to-console" task:
//   1. withRetrySync retries transient harness.failures with backoff and succeeds.
//   2. withRetrySync does NOT retry non-retryable errors (TypeError etc).
//   3. withRetrySync throws after exhausting all retries.
//   4. appendToCSV never throws and falls back to console output when
//      the CSV path is unwritable — collected data is never lost.
// ========================================
import { withRetrySync } from './retry-utils.js';
import { appendToCSV } from './lead-processor.js';
import { config } from './config.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const harness = createHarness();
const assert = harness.assert;



// ========================================
// 1. withRetrySync: retries transient error, then succeeds
// ========================================
{
  let calls = 0;
  const result = withRetrySync(() => {
    calls++;
    if (calls < 3) {
      const err = new Error('ECONNRESET socket hang up');
      throw err;
    }
    return 'ok';
  }, { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 30 });

  assert('retry succeeds after 2 transient harness.failures', result === 'ok' && calls === 3, `result=${result} calls=${calls}`);
}

// ========================================
// 2. withRetrySync: non-retryable error fails immediately (no retry)
// ========================================
{
  let calls = 0;
  let threw = false;
  try {
    withRetrySync(() => {
      calls++;
      throw new TypeError('programming error');
    }, { maxRetries: 3, baseDelayMs: 10 });
  } catch (e) {
    threw = true;
  }
  assert('TypeError is NOT retried', threw && calls === 1, `calls=${calls}`);
}

// ========================================
// 3. withRetrySync: throws after exhausting all retries
// ========================================
{
  let calls = 0;
  let threw = false;
  let lastMsg = '';
  try {
    withRetrySync(() => {
      calls++;
      const err = new Error('ECONNRESET persistent');
      throw err;
    }, { maxRetries: 2, baseDelayMs: 5, maxDelayMs: 10 });
  } catch (e) {
    threw = true;
    lastMsg = e.message;
  }
  assert('throws after max retries exhausted', threw && calls === 3, `calls=${calls}`);
  assert('rethrows the last error', lastMsg.includes('persistent'), lastMsg);
}

// ========================================
// 4. appendToCSV: fallback-to-console when path is unwritable
// ========================================
{
  // Point CSV_OUTPUT_PATH at a path whose parent is an existing FILE,
  // so mkdirSync throws ENOENT/EEXIST on every attempt (unwritable).
  const tmpDir = os.tmpdir();
  const blockerFile = path.join(tmpDir, `csv-retry-blocker-${Date.now()}`);
  fs.writeFileSync(blockerFile, 'blocker');
  const impossiblePath = path.join(blockerFile, 'sub', 'collected-leads.csv');

  const originalPath = config.CSV_OUTPUT_PATH;
  config.CSV_OUTPUT_PATH = impossiblePath;

  // Capture console output to verify fallback row is printed
  const originalLog = console.log;
  const originalError = console.error;
  let captured = '';
  console.log = (...args) => { captured += args.join(' ') + '\n'; };
  console.error = (...args) => { captured += args.join(' ') + '\n'; };

  let threw = false;
  try {
    const fakeSession = {
      phone: '+38970123456',
      toCSVRow: () => 'retry-test-row,preserved'
    };
    appendToCSV(fakeSession);
  } catch (e) {
    threw = true;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    config.CSV_OUTPUT_PATH = originalPath;
    try { fs.unlinkSync(blockerFile); } catch (e) {}
  }

  assert('appendToCSV does NOT throw on unwritable path', !threw, 'appendToCSV threw!');
  assert('fallback marker printed', captured.includes('[CSV FAILED]'), `captured="${captured.substring(0, 100)}"`);
  assert('fallback row preserved to console', captured.includes('retry-test-row,preserved'), `captured="${captured.substring(0, 100)}"`);
}

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 CSV RETRY TESTS PASSED`);
