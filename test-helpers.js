// ============================================================
// test-helpers.js — Shared assert harness for all test suites
// ============================================================
// Every test-*.js file previously redefined the same boilerplate:
//   let passed = 0; let failed = 0;
//   function assert(label, condition, detail) { ... }
//   console.log(`\n${passed}/${passed + failed} tests passed`);
//   if (failed > 0) process.exit(1);
//
// This module consolidates that into one implementation. Each suite
// creates its own harness instance so counters stay isolated:
//
//   import { createHarness } from './test-helpers.js';
//   const harness = createHarness();
//   const assert = harness.assert;
//   ... assert('label', condition, 'detail') ...
//   harness.summary('SUITE NAME');   // prints ✅/❌ totals
//   harness.exit();                  // exit 0 if all passed, 1 otherwise
//
// NOTE: harness.passed / harness.failed are LIVE getters — read them at
// the end of the suite (after all asserts) to get the final counts.
// ============================================================

export function createHarness() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  /**
   * Standard assertion. label = what is being tested, condition = the
   * boolean expectation, detail = optional extra info shown on failure.
   * Successful assertions print a ✅ line; failures print ❌ and are
   * collected for the summary.
   */
  function assert(label, condition, detail) {
    if (condition) {
      passed++;
      console.log(`  ✅ ${label}`);
    } else {
      failed++;
      const msg = `  ❌ ${label}${detail ? ' — ' + detail : ''}`;
      console.log(msg);
      failures.push(msg);
    }
  }

  /**
   * Print the standard pass/fail summary block.
   * @param {string} title — suite name shown in the banner (optional)
   * @returns {{passed:number, failed:number, total:number}}
   */
  function summary(title = 'TEST SUMMARY') {
    const total = passed + failed;
    console.log(`\n==================================================`);
    console.log(`${title}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total:  ${total}`);
    console.log(`==================================================\n`);
    if (failures.length > 0) {
      console.log(`⚠️  FAILURES:`);
      for (const f of failures) console.log(f);
      console.log();
    }
    return { passed, failed, total };
  }

  /**
   * Exit the process with CI-friendly code: 0 if every assertion passed,
   * 1 if any failed.
   */
  function exit() {
    process.exit(failed > 0 ? 1 : 0);
  }

  return {
    assert,
    summary,
    exit,
    get passed() { return passed; },
    get failed() { return failed; },
    get failures() { return failures; }
  };
}
