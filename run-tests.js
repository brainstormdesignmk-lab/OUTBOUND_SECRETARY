#!/usr/bin/env node
/**
 * run-tests.js — Runs the ENTIRE test battery (every test-*.js suite) in one command.
 *
 * Usage:
 *   npm test                      # run every test-*.js suite
 *   npm test -- <filter>           # run only suites whose filename contains <filter>
 *   npm test -- --list             # list suites without running them
 *   TEST_TIMEOUT_MS=900000 npm test   # override per-suite timeout (default 600s)
 *
 * Exit code 0 if every suite passed, 1 otherwise (CI-friendly).
 * Suites run sequentially (not in parallel) because several write shared
 * artifacts (CSV output, data/ journals) and must not race each other.
 */
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 10 min/suite default (e2e is the slowest). Guard against a non-numeric env
// var: Number('abc') → NaN would make setTimeout fire immediately.
const _timeoutRaw = Number(process.env.TEST_TIMEOUT_MS);
const PER_TEST_TIMEOUT_MS = Number.isFinite(_timeoutRaw) && _timeoutRaw > 0 ? _timeoutRaw : 600_000;

const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith('--'));
const listOnly = args.includes('--list');

// Discover suites deterministically (alphabetical). test-helpers.js matches
// the test-* pattern but is a shared assert harness, not a runnable suite —
// running it standalone exits 0 as a silent no-op, inflating the battery
// count with a fake PASS. Exclude it so the summary is honest.
const suites = readdirSync(__dirname)
  .filter((f) => /^test-.*\.js$/.test(f) && f !== 'test-helpers.js')
  .sort();

if (listOnly) {
  for (const s of suites) console.log(s);
  process.exit(0);
}

const selected = filter ? suites.filter((f) => f.includes(filter)) : suites;

if (selected.length === 0) {
  console.error(`\n❌ No test suites matched filter "${filter}".\n`);
  process.exit(1);
}

console.log(`\n🧪 TEST BATTERY — ${selected.length} suite${selected.length === 1 ? '' : 's'}${filter ? ` (filter: "${filter}")` : ''}\n`);
for (const s of selected) console.log(`   ▶ ${s}`);
console.log();

const results = [];

for (const file of selected) {
  const t0 = Date.now();
  const code = await runSuite(file);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const ok = code === 0;
  results.push({ file, ok, code, secs });
  console.log(`${ok ? '✅' : '❌'} ${file} — ${ok ? 'PASS' : `FAIL (exit ${code})`} (${secs}s)`);
}

const passed = results.filter((r) => r.ok).length;
console.log('\n' + '='.repeat(60));
console.log(`📊 TEST BATTERY SUMMARY: ${passed}/${results.length} passed`);
for (const r of results) {
  if (!r.ok) console.log(`   ❌ ${r.file} (exit ${r.code})`);
}
console.log('='.repeat(60));
process.exit(passed === results.length ? 0 : 1);

/**
 * Run one suite with inherited stdio (its own output shows through) and a
 * hard kill timer so a hung suite can never block the battery forever.
 */
function runSuite(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit', cwd: __dirname });
    const timer = setTimeout(() => {
      console.error(`\n⏰ TIMEOUT after ${PER_TEST_TIMEOUT_MS / 1000}s — killing ${file}`);
      child.kill('SIGKILL');
    }, PER_TEST_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      console.error(`\n❌ Failed to launch ${file}: ${err.message}`);
      resolve(1);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}
