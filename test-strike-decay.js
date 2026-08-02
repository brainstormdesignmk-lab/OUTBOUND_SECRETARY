import { createHarness } from './test-helpers.js';
// ========================================
// TESTS: strike decay state machine
// ========================================
// Unit tests for applyStrikeDecay() in offensive-filter.js.
//
// User-approved semantics:
//   - After strike 1, if the next message is NORMAL (owner corrects himself),
//     the counter resets to 0 — a later offense restarts from strike 1.
//   - Two CONSECUTIVE offenses reach strike 2 (final warning).
//   - After strike 2 the counter NEVER decays: normal messages leave it at 2,
//     and any later offense → strike 3 → TERMINATE.
//
// Run: node test-strike-decay.js
// ========================================

import { applyStrikeDecay } from './offensive-filter.js';

const harness = createHarness();
const assert = harness.assert;



function testGroup(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) {
    t();
  }
}

// ========================================
// GROUP 1: Offensive message → counter increments (consecutive offenses escalate)
// ========================================
testGroup('Offense → increment (escalation 1→2→3)', [
  () => assert('(0, offense) → 1', applyStrikeDecay(0, true) === 1, `got ${applyStrikeDecay(0, true)}`),
  () => assert('(1, offense) → 2 (consecutive second offense = final warning)', applyStrikeDecay(1, true) === 2, `got ${applyStrikeDecay(1, true)}`),
  () => assert('(2, offense) → 3 (terminate)', applyStrikeDecay(2, true) === 3, `got ${applyStrikeDecay(2, true)}`),
  () => assert('(3, offense) → 3 (capped)', applyStrikeDecay(3, true) === 3, `got ${applyStrikeDecay(3, true)}`),
  () => assert('(undefined, offense) → 1 (fresh session)', applyStrikeDecay(undefined, true) === 1, `got ${applyStrikeDecay(undefined, true)}`),
]);

// ========================================
// GROUP 2: Normal message → strike 1 DECAYS to 0 (forgiveness)
// ========================================
testGroup('Normal message → strike 1 resets to 0', [
  () => assert('(1, normal) → 0 (owner corrected)', applyStrikeDecay(1, false) === 0, `got ${applyStrikeDecay(1, false)}`),
  () => assert('(0, normal) → 0 (no-op)', applyStrikeDecay(0, false) === 0, `got ${applyStrikeDecay(0, false)}`),
  () => assert('(undefined, normal) → 0 (no-op)', applyStrikeDecay(undefined, false) === 0, `got ${applyStrikeDecay(undefined, false)}`),
]);

// ========================================
// GROUP 3: Normal message → strike 2 NEVER decays
// ========================================
testGroup('Normal message → strike 2+ never decays', [
  () => assert('(2, normal) → 2 (persists)', applyStrikeDecay(2, false) === 2, `got ${applyStrikeDecay(2, false)}`),
  () => assert('(3, normal) → 3 (persists)', applyStrikeDecay(3, false) === 3, `got ${applyStrikeDecay(3, false)}`),
]);

// ========================================
// GROUP 4: Full lifecycle simulation (the exact user scenario)
// ========================================
testGroup('Lifecycle: offense → decay → fresh → escalate → persist → terminate', [
  () => {
    // Owner sends offense #1 → strike 1
    let s = applyStrikeDecay(0, true);
    assert('offense #1 → strike 1', s === 1, `got ${s}`);
    // Owner apologizes (normal) → strike resets to 0
    s = applyStrikeDecay(s, false);
    assert('apology → reset to 0', s === 0, `got ${s}`);
    // Later, another offense → back to strike 1 (not strike 2)
    s = applyStrikeDecay(s, true);
    assert('later offense → strike 1 again', s === 1, `got ${s}`);
    // Consecutive second offense → strike 2 (final warning)
    s = applyStrikeDecay(s, true);
    assert('consecutive offense #2 → strike 2', s === 2, `got ${s}`);
    // Owner behaves normally → counter STAYS at 2
    s = applyStrikeDecay(s, false);
    assert('normal after strike 2 → stays 2', s === 2, `got ${s}`);
    s = applyStrikeDecay(s, false);
    assert('normal again → still 2', s === 2, `got ${s}`);
    // Any further offense → strike 3 → TERMINATE
    s = applyStrikeDecay(s, true);
    assert('offense after strike 2 → strike 3 (terminate)', s === 3, `got ${s}`);
  },
]);

// ========================================
// SUMMARY
// ========================================
console.log(`\n==================================================`);
const total = harness.passed + harness.failed;
const pct = total > 0 ? Math.round(harness.passed / total * 100) : 0;
const status = harness.failed === 0 ? '🟢 ALL TESTS PASSED' : `🔴 ${harness.failed} TEST(S) FAILED`;
console.log(`\n${status}`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${total}`);
console.log(`   📊 Score:  ${pct}%`);
console.log(`==================================================\n`);
process.exit(harness.failed > 0 ? 1 : 0);
