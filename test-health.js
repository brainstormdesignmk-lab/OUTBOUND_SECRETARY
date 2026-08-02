import { createHarness } from './test-helpers.js';
// ========================================
// test-health.js — Health-check HTTP endpoint (Task 10)
// ========================================
// Verifies:
//   1. /healthz → 200 alive (liveness probe)
//   2. /readyz → 200 ready when campaign is running; 503 when not
//   3. /metrics → JSON counter snapshot
//   4. Unknown route → 404
//   5. setHealthState() updates the reported readiness
//
// NOTE: HEALTH_PORT=0 means "disabled" in health.js, so this test uses a
// random high port (ephemeral-ish, collision-unlikely) rather than 0.
//
// Run: node test-health.js
// ========================================
import http from 'http';

const harness = createHarness();
const assert = harness.assert;



// Isolate config from production (random high port + empty file trails)
// Snapshot original env values first so they can be restored at the end
// (hygiene: this suite mutates process.env, which would leak into any
// in-process runner).
const ENV_SNAPSHOT = {};
for (const k of ['HEALTH_PORT', 'LOG_PATH', 'METRICS_PATH', 'SESSIONS_PATH']) {
  ENV_SNAPSHOT[k] = process.env[k];
}
const TEST_PORT = 20000 + Math.floor(Math.random() * 10000);
process.env.HEALTH_PORT = String(TEST_PORT);
process.env.LOG_PATH = '';
process.env.METRICS_PATH = '';
process.env.SESSIONS_PATH = '';

const { startHealthServer, stopHealthServer, setHealthState } = await import('./health.js?test=' + Date.now());

const server = startHealthServer();
assert('server started on port ' + TEST_PORT, server !== null, 'startHealthServer returned null');

// `listening` is set asynchronously after listen() — wait for the event
// before asserting (the HTTP requests below are the real functional proof).
await new Promise((resolve, reject) => {
  if (server.listening) return resolve();
  const onError = (err) => reject(err);
  server.once('listening', resolve);
  server.once('error', onError);
  // Once resolved, drop the error listener so it can't fire on a settled promise
  server.once('listening', () => server.removeListener('error', onError));
});
assert('server is listening', server.listening === true, 'not listening');

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: TEST_PORT, path }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
  });
}

// ========================================
// 1. /healthz → 200 alive
// ========================================
{
  const r = await fetchUrl('/healthz');
  assert('/healthz returns 200', r.status === 200, `got ${r.status}`);
  assert('/healthz reports alive', r.body.status === 'alive', `got ${r.body.status}`);
}

// ========================================
// 2. /readyz → 503 while not running (no startedAt)
// ========================================
{
  const r = await fetchUrl('/readyz');
  assert('/readyz returns 503 when not started', r.status === 503, `got ${r.status}`);
  assert('/readyz reports not_ready', r.body.status === 'not_ready', `got ${r.body.status}`);
}

// ========================================
// 3. setHealthState(running) → /readyz 200
// ========================================
{
  setHealthState({ running: true, loaded: 12, currentIndex: 0 });
  const r = await fetchUrl('/readyz');
  assert('/readyz returns 200 when running', r.status === 200, `got ${r.status}`);
  assert('/readyz reports ready', r.body.status === 'ready', `got ${r.body.status}`);
  assert('/readyz reports loaded=12', r.body.loaded === 12, `got ${r.body.loaded}`);
}

// ========================================
// 4. /metrics → JSON snapshot with counters + state
// ========================================
{
  const r = await fetchUrl('/metrics');
  assert('/metrics returns 200', r.status === 200, `got ${r.status}`);
  assert('/metrics includes counters object', r.body.counters && typeof r.body.counters === 'object', `got ${typeof r.body.counters}`);
  assert('/metrics includes state object', r.body.state && typeof r.body.state === 'object', `got ${typeof r.body.state}`);
  assert('/metrics state.running reflects setHealthState', r.body.state.running === true, `got ${r.body.state.running}`);
}

// ========================================
// 5. Unknown route → 404
// ========================================
{
  const r = await fetchUrl('/nope');
  assert('unknown route returns 404', r.status === 404, `got ${r.status}`);
}

// ========================================
// 6. Cleanup
// ========================================
stopHealthServer();

// Restore original env values (undo the suite's process.env mutation)
for (const [k, v] of Object.entries(ENV_SNAPSHOT)) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} health-check tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 HEALTH-CHECK TESTS PASSED`);
