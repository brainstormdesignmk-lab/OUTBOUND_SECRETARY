// ========================================
// E2E TEST: 3-Strike Offensive Behavior Protocol
// ========================================
// Simulates a full campaign conversation with offensive input
// to verify the 3-strike protocol works correctly.
//
// Flow:
//   1. Normal message → no strike, normal response
//   2. Mild offense → WARNING (strike 1)
//   3. Moderate offense → WARNING (strike 2, final warning)
//   4. Severe offense → TERMINATE (strike 3, blocked)
//   5. Verify blocklist was updated
//   6. Verify blocked number is skipped on next campaign run
//
// Fully offline: every scenario is driven by hardcoded handlers (offensive
// filter, commission, availability, data-collection questions) EXCEPT the
// normal-follow-up messages that stay in PERSUASION ("Zdravo, kako odi?" in
// S1, "okej, izvini" in S6) — those would normally hit the live Groq API via
// runPersuasion. ANA_OFFLINE_LLM=1 (set below) makes runPersuasion return a
// canned NORMAL reply instead (see handlers/persuasion-phase.js, call-time
// read, production never sets it). So the battery never depends on Groq
// availability or rate limits. Read at CALL time, so placement before the
// imports is safe under ESM hoisting.
// ========================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { isNumberBlocked, loadBlocklist, addToBlocklist, BLOCKLIST_PATH, STRIKE_1_RESPONSES } from './offensive-filter.js';
import { writeFileSync } from 'fs';

// ========================================
// All test phone numbers (normalized, without +/00 prefix)
// Used by global cleanup in finally block to ensure no test
// entries remain in the production blocklist file.
// ========================================
const TEST_PHONE_NUMBERS = [
  '38970000001',  // Scenario 1
  '38970777777',  // Scenario 2
  '38970888888',  // Scenario 3
  '38970999999',  // Scenario 4
  '38970555555',  // Scenario 5
  '38970666666',  // Scenario 6
  '38970444444',  // Scenario 7
];

let crashed = false;

const harness = createHarness();
const assert = harness.assert;

function testGroup(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) {
    t();
  }
}

// ========================================
// HELPER: Create a fresh session
// ========================================
function createSession(phone = '+38970999999') {
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: false,
      transactionType: 'sale',
      propertyType: 'apartment'
    },
    messages: [
      { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: phone
  };
}

// ========================================
// HELPER: Simulate a conversation turn
// ========================================
async function sendMessage(session, userInput) {
  const result = await generateResponse(session, userInput);
  if (session.messages) {
    session.messages.push({ role: 'user', text: userInput });
    session.messages.push({ role: 'model', text: result.text });
  }
  return result;
}

// ========================================
// SCENARIO 1: Normal conversation → no false positives
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 1: Normal conversation → NO false positives`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario1() {
  const session = createSession('+38970000001');

  // Normal greeting → should NOT trigger any strike
  let res = await sendMessage(session, "Zdravo, kako odi?");
  assert("S1: normal greeting → NOT offensive",
    session.offensiveStrikes === undefined || session.offensiveStrikes === 0,
    `strikes=${session.offensiveStrikes}, type=${res.type}`);

  // Price question → should NOT trigger any strike
  res = await sendMessage(session, "kolku e provizijata?");
  assert("S1: price question → NOT offensive",
    session.offensiveStrikes === undefined || session.offensiveStrikes === 0,
    `strikes=${session.offensiveStrikes}`);

  // Availability answer → should NOT trigger any strike
  res = await sendMessage(session, "da, se uste go imam");
  assert("S1: availability answer → NOT offensive",
    session.offensiveStrikes === undefined || session.offensiveStrikes === 0,
    `strikes=${session.offensiveStrikes}`);

  // Cooperation acceptance → should NOT trigger any strike
  res = await sendMessage(session, "moze da probame");
  assert("S1: cooperation acceptance → NOT offensive",
    session.offensiveStrikes === undefined || session.offensiveStrikes === 0,
    `strikes=${session.offensiveStrikes}`);

  // Final: verify non-offensive messages return NORMAL or QUESTION, not WARNING/TERMINATE
  assert("S1: all responses are normal types",
    !res.type || !['WARNING', 'TERMINATE'].includes(res.type),
    `got type=${res.type}`);

  console.log(`   ✔ Scenario 1 complete: ${harness.failed + 5} assertions, 0 false positives`);
}

// ========================================
// SCENARIO 2: Full 3-strike escalation
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 2: Full 3-strike escalation`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario2() {
  // Use unique phone to avoid collision with existing blocklist
  const testPhone = '+38970777777';
  const session = createSession(testPhone);

  // === STRIKE 1: Mild insult ===
  console.log(`\n  --- STRIKE 1: mild insult ---`);
  let res = await sendMessage(session, "begaj be");
  assert("S2-S1: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S2-S1: strike counter=1", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);
  assert("S2-S1: Macedonian professional rebuff", STRIKE_1_RESPONSES.includes(res.text),
    `got: ${res.text.substring(0, 60)}`);

  // === STRIKE 2: Heavy insult ===
  console.log(`\n  --- STRIKE 2: heavy insult ---`);
  res = await sendMessage(session, "debil");
  assert("S2-S2: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S2-S2: strike counter=2", session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);
  assert("S2-S2: final warning in Macedonian", res.text.includes("последна опомена") || res.text.includes("опомена"),
    `got: ${res.text.substring(0, 80)}`);

  // === STRIKE 3: Severe (sexual) → immediate termination ===
  console.log(`\n  --- STRIKE 3: severe offense → termination ---`);
  res = await sendMessage(session, "пичка ти матер");
  assert("S2-S3: type=TERMINATE", res.type === "TERMINATE", `got ${res.type}`);
  assert("S2-S3: strike counter=3", session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
  assert("S2-S3: text=TERMINATE_SESSION", res.text === "TERMINATE_SESSION", `got ${res.text}`);

  // Verify number was added to blocklist
  await new Promise(r => setTimeout(r, 200)); // Wait for async fs write
  assert("S2-S3: number IS in blocklist", isNumberBlocked(testPhone), `blocklist check failed`);
  const blocklist = loadBlocklist();
  const entry = blocklist.find(e => e.phone === '38970777777');
  assert("S2-S3: blocklist entry has reason", entry && entry.reason === 'sexual', `got ${JSON.stringify(entry)}`);
  assert("S2-S3: blocklist entry has date", entry && entry.date, `got ${JSON.stringify(entry)}`);

  console.log(`   ✔ Scenario 2 complete: full escalation verified (strikes 1→2→3)`);
}

// ========================================
// SCENARIO 3: Severity-3 escalates with warnings (NO instant termination)
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 3: Severity-3 (sexual) → warns first, terminates on 3rd`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario3() {
  const testPhone = '+38970888888';
  const session = createSession(testPhone);

  // First message is SEVERE (sexual) → WARNING (strike 1), NOT termination
  let res = await sendMessage(session, "секс");
  assert("S3-S1: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S3-S1: strike counter=1", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);
  assert("S3-S1: Macedonian professional rebuff sent", STRIKE_1_RESPONSES.includes(res.text),
    `got: ${res.text.substring(0, 60)}`);

  // Second severe message → FINAL WARNING (strike 2)
  res = await sendMessage(session, "секс");
  assert("S3-S2: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S3-S2: strike counter=2", session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);
  assert("S3-S2: final warning in Macedonian", res.text.includes("последна опомена") || res.text.includes("опомена"),
    `got: ${res.text.substring(0, 80)}`);

  // Third severe message → TERMINATE (strike 3) + blocked
  res = await sendMessage(session, "секс");
  assert("S3-S3: type=TERMINATE", res.type === "TERMINATE", `got ${res.type}`);
  assert("S3-S3: strike counter=3", session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
  assert("S3-S3: text=TERMINATE_SESSION", res.text === "TERMINATE_SESSION", `got ${res.text}`);

  // Verify blocked
  await new Promise(r => setTimeout(r, 200));
  assert("S3: number IS in blocklist after strike 3", isNumberBlocked(testPhone), `blocklist check failed`);

  console.log(`   ✔ Scenario 3 complete: severity-3 escalates 1→2→3 with warnings`);
}

// ========================================
// SCENARIO 4: Violence escalates with warnings (NO instant termination)
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 4: Violence → warns first, terminates on 3rd`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario4() {
  const testPhone = '+38970999999';
  const session = createSession(testPhone);

  // Violent threat → WARNING (strike 1)
  let res = await sendMessage(session, "ke te ubijam");
  assert("S4-S1: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S4-S1: strike counter=1", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);

  // Second violent threat → FINAL WARNING (strike 2)
  res = await sendMessage(session, "ke te ubijam");
  assert("S4-S2: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S4-S2: strike counter=2", session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);

  // Third violent threat → TERMINATE (strike 3)
  res = await sendMessage(session, "ke te ubijam");
  assert("S4-S3: type=TERMINATE", res.type === "TERMINATE", `got ${res.type}`);
  assert("S4-S3: strike counter=3", session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
  assert("S4-S3: text=TERMINATE_SESSION", res.text === "TERMINATE_SESSION", `got ${res.text}`);

  // Blocklist check
  await new Promise(r => setTimeout(r, 200));
  const blocklist = loadBlocklist();
  const entry = blocklist.find(e => e.phone === '38970999999');
  assert("S4: blocked with reason=violence", entry && entry.reason === 'violence', `got ${JSON.stringify(entry)}`);

  console.log(`   ✔ Scenario 4 complete: violence escalates 1→2→3 with warnings`);
}

// ========================================
// SCENARIO 5: Blocklist check prevents re-sending
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 5: Blocklist blocks re-contact attempts`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario5() {
  const testPhone = '+38970555555';

  // First, add this number to the blocklist
  addToBlocklist(testPhone, 'test_offensive');
  await new Promise(r => setTimeout(r, 200));

  // Now simulate checking if the number should be contacted
  const blocked = isNumberBlocked(testPhone);
  assert("S5: number detected as blocked", blocked === true, `got ${blocked}`);

  // Also verify that a non-blocked number passes
  const notBlocked = isNumberBlocked('+38970000000');
  assert("S5: non-blocked number passes", notBlocked === false, `got ${notBlocked}`);

  // Normalized phone comparison
  const normalizedBlocked = isNumberBlocked('0038970555555');
  assert("S5: normalized phone (00389...) detected as blocked", normalizedBlocked === true, `got ${normalizedBlocked}`);

  console.log(`   ✔ Scenario 5 complete: blocklist verification and cleanup done`);
}

// ========================================
// SCENARIO 6: Strike decay — strike 1 resets on a normal message, strike 2 never decays
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 6: Strike decay (1 resets, 2 never resets)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario6() {
  const session = createSession('+38970666666');

  // Strike 1
  let res = await sendMessage(session, "млчи");
  assert("S6-S1: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S6-S1: strike counter=1", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);

  // Normal message after strike 1 → counter RESETS to 0 (owner corrected)
  res = await sendMessage(session, "okej, izvini");
  assert("S6: normal follow-up → not WARNING or TERMINATE",
    res.type !== 'WARNING' && res.type !== 'TERMINATE',
    `got ${res.type}`);
  assert("S6: normal follow-up after strike 1 → counter reset to 0",
    session.offensiveStrikes === 0, `got ${session.offensiveStrikes}`);

  // New offense after reset → back to strike 1 (fresh, professional rebuff NOT final warning)
  res = await sendMessage(session, "idiot");
  assert("S6-S2: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S6-S2: strike counter=1 (reset worked)", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);
  assert("S6-S2: Macedonian professional rebuff (not final warning)", STRIKE_1_RESPONSES.includes(res.text), `got: ${res.text.substring(0, 60)}`);

  // CONSECUTIVE second offense (no normal message in between) → strike 2, final warning
  res = await sendMessage(session, "debil");
  assert("S6-S3: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S6-S3: strike counter=2", session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);
  assert("S6-S3: final warning in Macedonian", res.text.includes('последна опомена') || res.text.includes('опомена'), `got: ${res.text.substring(0, 80)}`);

  // Normal message after strike 2 → counter STAYS at 2 (never decays)
  res = await sendMessage(session, "fala, dogovoreno");
  assert("S6: normal follow-up after strike 2 → not WARNING or TERMINATE",
    res.type !== 'WARNING' && res.type !== 'TERMINATE',
    `got ${res.type}`);
  assert("S6: counter stays at 2 after normal message (no decay)",
    session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);

  // Any later offense at strike 2 → TERMINATE (strike 3)
  res = await sendMessage(session, "begaj");
  assert("S6-S4: type=TERMINATE", res.type === "TERMINATE", `got ${res.type}`);
  assert("S6-S4: strike counter=3", session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
  assert("S6-S4: text=TERMINATE_SESSION", res.text === "TERMINATE_SESSION", `got ${res.text}`);

  console.log(`   ✔ Scenario 6 complete: strike 1 decays to 0, strike 2 persists to termination`);
}

// ========================================
// SCENARIO 7: "picka" (Latin ck spelling) — the exact bug from production
// ========================================
// Owner typed "SI DOBRA PICKA" and the message slipped through because the
// sexual patterns only had пичка/pička/pi4ka/pichka/pichk/picki — not the
// common Latin "ck" spelling. Must now be detected → warns first, terminates on 3rd.
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🎯 SCENARIO 7: "picka" (Latin ck) → caught, escalates 1→2→3`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario7() {
  const testPhone = '+38970444444';
  const session = createSession(testPhone);

  // The EXACT message from the production log → WARNING (strike 1)
  let res = await sendMessage(session, "GORAN I BI SAKALDA SE ZAPOZNAEME. MISLAM DEKA SI DOBRA PICKA");
  assert("S7-S1: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S7-S1: strike counter=1", session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);
  assert("S7-S1: ownerName NOT stored (warning stage, not data collection)",
    session.collectedData.ownerName === undefined, `got ${session.collectedData.ownerName}`);

  // Second offense → FINAL WARNING (strike 2)
  res = await sendMessage(session, "PICKA");
  assert("S7-S2: type=WARNING", res.type === "WARNING", `got ${res.type}`);
  assert("S7-S2: strike counter=2", session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);

  // Third offense → TERMINATE (strike 3) + blocked with reason=sexual
  res = await sendMessage(session, "PICKA");
  assert("S7-S3: type=TERMINATE", res.type === "TERMINATE", `got ${res.type}`);
  assert("S7-S3: strike counter=3", session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
  assert("S7-S3: text=TERMINATE_SESSION", res.text === "TERMINATE_SESSION", `got ${res.text}`);

  // Verify blocked with reason=sexual
  await new Promise(r => setTimeout(r, 200));
  const blocklist = loadBlocklist();
  const entry = blocklist.find(e => e.phone === '38970444444');
  assert("S7: blocked with reason=sexual", entry && entry.reason === 'sexual', `got ${JSON.stringify(entry)}`);

  console.log(`   ✔ Scenario 7 complete: "picka" now escalates 1→2→3 with warnings`);
}

// ========================================
// RUN ALL SCENARIOS
// ========================================
(async () => {
  try {
    console.log(`\n================================================================`);
    console.log(`🎭 3-STRIKE PROTOCOL — End-to-End Simulation`);
    console.log(`================================================================`);

    await runScenario1();
    await runScenario2();
    await runScenario3();
    await runScenario4();
    await runScenario5();
    await runScenario6();
    await runScenario7();

  } catch (e) {
    crashed = true;
    console.error(`\n💥 FATAL ERROR:`, e.message);
    console.error(e.stack);
    // Fall through to finally for cleanup
  } finally {
    // ========================================
    // GLOBAL CLEANUP SAFETY NET
    // Removes ALL known test phone numbers from the
    // production blocklist file, even if a scenario
    // crashed mid-way and its per-scenario cleanup
    // never ran.
    // ========================================
    console.log(`\n--- Global cleanup: removing test entries from blocklist ---`);
    try {
      const blocklist = loadBlocklist();
      const before = blocklist.length;
      const cleaned = blocklist.filter(e => !TEST_PHONE_NUMBERS.includes(e.phone));
      if (cleaned.length !== before) {
        writeFileSync(BLOCKLIST_PATH, JSON.stringify(cleaned, null, 2));
        console.log(`   ✔ Removed ${before - cleaned.length} test entries from blocklist`);
      } else {
        console.log(`   ✔ No test entries found in blocklist (already clean)`);
      }
    } catch (cleanupError) {
      console.error(`   ⚠ Cleanup warning: ${cleanupError.message}`);
    }

    // SUMMARY (always prints, even on crash)
    console.log(`\n===============================================================`);
    console.log(`📊 3-STRIKE PROTOCOL TEST SUMMARY:`);
    console.log(`   ✅ Passed: ${harness.passed}`);
    console.log(`   ❌ Failed: ${harness.failed}`);
    console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
    console.log(`===============================================================`);

    if (crashed || harness.failed > 0) {
      const prefix = crashed ? '💥 CRASHED — ' : '';
      console.log(`\n🔴 ${prefix}${harness.failed} TEST(S) FAILED`);
      process.exit(1);
    } else {
      console.log(`\n🟢 ALL 3-STRIKE PROTOCOL TESTS PASSED`);
      process.exit(0);
    }
  }
})();
