// ============================================================
// TEST: Strike WARNINGs must not be swallowed by owner-follow-up
// grace batches (reported lead 5540516)
// ============================================================
// Reported: the owner sent an insult ("PA LAZES KUCKO GLUPA" — strike 2/3)
// followed quickly by a normal sentence ("NIKOJ NE RABOTI BEZ PARI") in the
// SAME owner-follow-up grace window. The engine processed BOTH messages but
// only the LAST response is ever sent — so the strike-2 final warning was
// silently dropped and the owner received only the follow-up's normal reply.
// The strikes counter still incremented (2/3), meaning an owner could be
// blocklisted on strike 3 having NEVER seen a warning.
//
// Fix (engine.js _processOwnerBatch): WARNING responses are routed
// IMMEDIATELY mid-batch (like terminal responses) while the batch keeps
// processing — a later offense still escalates to TERMINATE, and a normal
// follow-up still gets its answer.
//
// Fully offline (ANA_OFFLINE_LLM=1 — the persuasion tail is a canned reply).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { MultiLeadEngine } from './engine.js';
import { isNumberBlocked, loadBlocklist, BLOCKLIST_PATH } from './offensive-filter.js';
import { writeFileSync } from 'fs';

// Unique test phones (normalized, no +/00) — one per scenario so a
// blocklist write in one test can never poison the next; all removed in the
// global cleanup.
const TEST_PHONES = ['38970000009', '38970000010', '38970000011', '38970000012'];

const harness = createHarness();
const assert = harness.assert;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const OFFENSE_1 = 'MISLAM DEKA ME LAZES';     // mild, conf 0.8 (strike 1)
const OFFENSE_2 = 'PA LAZES KUCKO GLUPA';     // heavy_insult, conf 0.9 (strike 2/3)
const FOLLOWUP = 'NIKOJ NE RABOTI BEZ PARI';  // normal follow-up sentence

function leadFor(phone) {
  return { id: '5540516', title: 'Продажба на стан', phone, url: 'http://x' };
}

function makeEngine() {
  const sent = [];
  const engine = new MultiLeadEngine({
    now: () => 0,
    sleep: async () => {},
    tickMs: 1,
    typingDelay: () => 0,
    canSendContact: () => true,
    recordSent: () => {},
    ownerGraceMs: 40            // short real window for the test
  });
  engine.on('ana-message', (p) => sent.push(p.text));
  engine.start();
  return { engine, sent };
}

async function greetAndClear(engine, sent, phone) {
  engine.loadLeads([leadFor(phone)]);
  await engine.tick();          // greet lead1
  sent.length = 0;
}

console.log('\n=== T1: the reported case — strike-2 warning must survive the follow-up batch ===');

{
  const { engine, sent } = makeEngine();
  await greetAndClear(engine, sent, '+38970000009');

  // Message 1: offense 1 (single-message batch) → strike-1 warning sent.
  await engine.onOwnerMessage('5540516', OFFENSE_1);
  await sleep(80);
  // strike responses are random — match any variant (професионалн* / молам)
  assert('T1: strike-1 warning sent (single-message batch)',
    sent.length === 1 && /професионалн|молам/i.test(sent[0] || ''),
    `got ${sent.length} msg(s): ${(sent[0] || '').substring(0, 60)}`);
  assert('T1: strikes=1 after offense 1', engine.getSession('5540516').offensiveStrikes === 1,
    `got ${engine.getSession('5540516').offensiveStrikes}`);
  sent.length = 0;

  // Messages 2+3: offense 2 + follow-up sentence in the SAME grace batch.
  // BEFORE the fix only the follow-up's reply was sent — the strike-2
  // warning was dropped (the reported bug).
  await engine.onOwnerMessage('5540516', OFFENSE_2);
  await sleep(10);
  await engine.onOwnerMessage('5540516', FOLLOWUP);
  await sleep(80);

  assert('T1: the strike-2 WARNING was sent (not swallowed by the follow-up)',
    sent.some(t => /опомен/i.test(t || '')),
    `got ${sent.length} msg(s): ${JSON.stringify(sent.map(t => (t || '').substring(0, 40)))}`);
  assert('T1: the follow-up sentence was ALSO answered (batch keeps processing)',
    // The deterministic persuasion ladder (ANA_OFFLINE_LLM seam) ends every
    // line with a cooperation ask — any of its closing phrasings counts.
    sent.some(t => /соработуваме|соработк|пробаме|почнеме/i.test(t || '')),
    `got ${JSON.stringify(sent.map(t => (t || '').substring(0, 40)))}`);
  assert('T1: strikes=2 persisted through the batch',
    engine.getSession('5540516').offensiveStrikes === 2,
    `got ${engine.getSession('5540516').offensiveStrikes}`);
  engine.stop();
}

console.log('\n=== T2: escalation THROUGH a batch — warning then TERMINATE ===');

{
  const { engine, sent } = makeEngine();
  await greetAndClear(engine, sent, '+38970000010');

  // Strike 1 first (single message).
  await engine.onOwnerMessage('5540516', OFFENSE_1);
  await sleep(80);
  sent.length = 0;

  // Batch: offense 2 (strike 2 → warning) + offense 3 (strike 3 → TERMINATE
  // → blocklist). BEFORE the fix the strike-2 warning was dropped AND the
  // owner was blocklisted with no warning ever shown.
  await engine.onOwnerMessage('5540516', OFFENSE_2);
  await sleep(10);
  await engine.onOwnerMessage('5540516', OFFENSE_2);
  await sleep(80);

  assert('T2: strike-2 warning sent mid-batch',
    sent.some(t => /опомен/i.test(t || '')),
    `got ${JSON.stringify(sent.map(t => (t || '').substring(0, 40)))}`);
  assert('T2: strike 3 still reached inside the batch (TERMINATE not skipped)',
    engine.getSession('5540516').offensiveStrikes === 3,
    `got ${engine.getSession('5540516').offensiveStrikes}`);
  assert('T2: number blocklisted after the batch',
    isNumberBlocked('+38970000010') === true, 'not blocked');
  engine.stop();
}

console.log('\n=== T3: control — normal batches still send exactly ONE reply ===');

{
  const { engine, sent } = makeEngine();
  await greetAndClear(engine, sent, '+38970000011');

  // Two normal messages in one window → exactly one reply (pre-existing
  // grace-batch invariant must be preserved).
  await engine.onOwnerMessage('5540516', 'da');
  await sleep(10);
  await engine.onOwnerMessage('5540516', 'uste go imam');
  await sleep(80);
  assert('T3: normal 2-message batch → exactly ONE Ana reply',
    sent.length === 1,
    `got ${sent.length}: ${JSON.stringify(sent.map(t => (t || '').substring(0, 40)))}`);
  engine.stop();
}

console.log('\n=== T4: last-message WARNING is routed exactly once ===');

{
  const { engine, sent } = makeEngine();
  await greetAndClear(engine, sent, '+38970000012');

  await engine.onOwnerMessage('5540516', OFFENSE_1); // strike 1
  await sleep(80);
  sent.length = 0;

  // A single-message batch that IS the last message and produces a WARNING —
  // must be routed exactly ONCE (the isLast branch, not the mid-batch branch).
  await engine.onOwnerMessage('5540516', OFFENSE_2); // strike 2
  await sleep(80);
  assert('T4: last-message warning routed exactly once',
    sent.length === 1 && /опомен/i.test(sent[0] || ''),
    `got ${sent.length}: ${JSON.stringify(sent.map(t => (t || '').substring(0, 40)))}`);
  engine.stop();
}

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);

// Global cleanup: remove the test phones from the production blocklist file.
try {
  const blocklist = loadBlocklist();
  const cleaned = blocklist.filter(e => !TEST_PHONES.includes(e.phone));
  if (cleaned.length !== blocklist.length) {
    writeFileSync(BLOCKLIST_PATH, JSON.stringify(cleaned, null, 2));
    console.log(`\n--- Cleanup: removed test entries from blocklist ---`);
  }
} catch (cleanupError) {
  console.error(`   ⚠ Cleanup warning: ${cleanupError.message}`);
}

if (harness.failed > 0) {
  console.log('\n🟥 STRIKE-BATCH TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 STRIKE-BATCH TESTS PASSED');
}
