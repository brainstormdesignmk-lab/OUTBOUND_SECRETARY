// ============================================================
// test-rejection-goodbye.js — Lead 5502969 (rent) reported bugs
// ============================================================
// 1. "TI REKOV DEKA SAMA KE PROBAM" (I TOLD YOU I'll try myself) was
//    classified ACCEPTED 0.85 via the generic "ke probam" rule → wrong
//    transition into DATA_COLLECTION. It must be REJECTED (firm
//    reaffirmation of an earlier refusal).
// 2. "SAMA KE SI GI IZDADAM" / "SAMA KE PROBAM" (I'll do it myself) are
//    self-service refusals, not acceptance.
// 3. Escalation (user-approved): rejection 1 → one rebuttal; rejection 2 →
//    GIVE UP (no pitch, no question); rejection 3 → polite goodbye + CLOSED.
// 4. "PA PRVO KE RPOBAM MESEC DVA..." phantom-extracted floor=1 from the
//    adverb "prvo" (firstly). A bare ordinal without floor context must
//    not set floor.
// 5. "DOSADNA SI" (you're annoying) → mild strike AND a rejection;
//    "OTKACI SE" (buzz off) → a rejection.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { classifyIntent } from './classifier.js';
import { classifyOffensive } from './offensive-classifier.js';
import { runGlobalExtraction } from './data-collector.js';

const harness = createHarness();
const assert = harness.assert;

function freshSession({ transactionType = 'rent' } = {}) {
  const isRent = transactionType === 'rent';
  return {
    adMemory: {
      transactionType,
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: false
    },
    messages: [
      { role: 'model', text: isRent
        ? 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?'
        : 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: '+38970123456'
  };
}

async function sendMessage(session, userInput) {
  const result = await generateResponse(session, userInput);
  if (session.messages) {
    session.messages.push({ role: 'user', text: userInput });
    session.messages.push({ role: 'model', text: result.text });
  }
  return result;
}

// ------------------------------------------------------------
// PART A — Classifier: prior-refusal / self-service → REJECTED
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎯 PART A: Classifier — refusal reaffirmation vs acceptance');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const conv = 'ANA: Дали да почнеме со соработка?\nOWNER: NE MI TREBA AGENCIJA';

// The exact reported bug message — must be REJECTED, never ACCEPTED.
{
  const cl = classifyIntent('TI REKOV DEKA SAMA KE PROBAM', conv);
  console.log(`  "TI REKOV DEKA SAMA KE PROBAM" → ${cl.intent} ${cl.confidence} (${cl.reason})`);
  assert('A1: "TI REKOV DEKA SAMA KE PROBAM" → REJECTED', cl.intent === 'REJECTED', `got ${cl.intent}`);
  assert('A1: confidence > 0.7 (counts toward escalation)', cl.confidence > 0.7, `got ${cl.confidence}`);
}

// Self-service refusals (incl. singular object clitic "go" — reported:
// "SAMA KE SI GO IZDADAM" was slipping through as INTERESTED)
for (const [label, msg] of [
  ['A2', 'SAMA KE SI GI IZDADAM'],
  ['A3', 'SAMA KE PROBAM'],
  ['A4', 'KE PROBAM SAMA'],
  ['A5', 'САМА ЌЕ СИ ГИ ИЗДАДАМ'],
  ['A6', 'ТИ РЕКОВ ДЕКА САМА ЌЕ ПРОБАМ'],
  ['A7', 'SAMA KE SI GO IZDADAM'],
  ['A8', 'SAMA KE GO IZDADAM'],
  ['A9', 'САМА ЌЕ СИ ГО ИЗДАДАМ']
]) {
  const cl = classifyIntent(msg, conv);
  console.log(`  "${msg}" → ${cl.intent} ${cl.confidence} (${cl.reason})`);
  assert(`${label}: "${msg}" → REJECTED`, cl.intent === 'REJECTED', `got ${cl.intent}`);
}

// Buzz-off + frustration (reported trace)
for (const [label, msg] of [
  ['A10', 'OTKACI SE'],
  ['A11', 'NE SAKAM, OTKACI SE'],
  ['A12', 'OTKAZI SE'],
  ['A13', 'DOSADNA SI'],
  ['A14', 'СИ ДОСАДНА'],
  ['A15', 'DOSADNA, SI']
]) {
  const cl = classifyIntent(msg, conv);
  console.log(`  "${msg}" → ${cl.intent} ${cl.confidence} (${cl.reason})`);
  assert(`${label}: "${msg}" → REJECTED`, cl.intent === 'REJECTED', `got ${cl.intent}`);
}

// Controls — existing behavior must NOT change
for (const [label, msg, want] of [
  ['A15', 'ke probam', 'ACCEPTED'],
  ['A16', 'ke probame', 'ACCEPTED'],
  ['A17', '350 TI KAZAV', null],
  ['A18', '7 TI KAZAV', null],
  ['A19', 'ne ti rekov deka sakam sorabotka', 'REJECTED'],
  ['A20', 'TI REKOV DEKA KE PROBAME', null],
  ['A21', 'TI REKOV DEKA SAM ZADOVOLEN OD SORABOTKATA', null],
  ['A22', 'TI REKOV DEKA KE GO IZDADAM SAM', 'REJECTED'],
  ['A23', 'KE GO IZDADAM PO 350', null],
  // VERB-BOUNDARY CONTROLS (reviewer finding): "probam" (1sg) must not
  // prefix-match "probame" (1pl). "SAMA KE PROBAME ZAEDNO" (let's try
  // TOGETHER, with the owner in the "we") is cooperative, NOT a self-service
  // refusal — the self-service rule must not fire on it.
  ['A24', 'SAMA KE PROBAME ZAEDNO', null],
  ['A25', 'SAM KE PROBAME', null],
  ['A26', 'SAMA KE IZDADAME ZAEDNO', null]
]) {
  const cl = classifyIntent(msg, conv);
  console.log(`  "${msg}" → ${cl.intent} ${cl.confidence} (${cl.reason})`);
  if (want === 'ACCEPTED') {
    assert(`${label}: "${msg}" stays ACCEPTED`, cl.intent === 'ACCEPTED', `got ${cl.intent}`);
  } else if (want === 'REJECTED') {
    assert(`${label}: "${msg}" stays REJECTED (rollback)`, cl.intent === 'REJECTED', `got ${cl.intent}`);
  } else {
    assert(`${label}: "${msg}" is NOT REJECTED (data-collection answer)`, cl.intent !== 'REJECTED', `got ${cl.intent}`);
  }
}

// ------------------------------------------------------------
// PART B — Floor extraction: "prvo" adverb must not set floor=1
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🏢 PART B: Floor extraction — no phantom ordinal floors');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const [label, msg] of [
  ['B1', 'PA PRVO KE RPOBAM MESEC DVA PA KE VIDIME'],
  ['B2', 'NA PRVO MESTO KE IZDADAM'],
  ['B3', 'PA TRET PAT TI KAZUVAM'],
  ['B4', 'PRVO KE PROBAM SAMA'],
  // SHORT ADVERB FORM (reviewer finding): the reported "prvo" adverb bug
  // was fixed for long messages via the word-count threshold, but a SHORT
  // sentence ("PRVO KE PROBAM" = exactly 3 words) used to slip through the
  // ≤3-word direct-answer shortcut and phantom-set floor=1.
  ['B12', 'PRVO KE PROBAM'],
  ['B13', 'PRVA KE PROBAM']
]) {
  const r = runGlobalExtraction(msg, { transactionType: 'rent' }, undefined);
  console.log(`  "${msg}" → floor=${r.floor === undefined ? '(none)' : r.floor}`);
  assert(`${label}: "${msg}" does NOT set floor`, r.floor === undefined, `got floor=${r.floor}`);
}

// Controls — genuine floor answers still work
for (const [label, msg, wantFloor] of [
  ['B5', 'NA VTORI OD 7', 2],
  ['B6', 'VTORI', 2],
  ['B7', 'STANOT E NA VTORI IMA LIFT', 2],
  ['B8', 'na vtori kat', 2],
  ['B9', 'НА ВТОРИ КАТ', 2],
  ['B10', 'VTORI, IMA LIFT I KLIMA', 2],
  ['B11', 'VTORI, IMA LIFT I KLIMA I PARKING', 2]
]) {
  const r = runGlobalExtraction(msg, { transactionType: 'rent' }, undefined);
  console.log(`  "${msg}" → floor=${r.floor === undefined ? '(none)' : r.floor}`);
  assert(`${label}: "${msg}" → floor=${wantFloor}`, r.floor === wantFloor, `got floor=${r.floor}`);
}

// ------------------------------------------------------------
// PART C — e2e: rebuttal → give up → goodbye (user-approved cadence)
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('👋 PART C: e2e — rebuttal → give up → polite goodbye CLOSED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

{
  const session = freshSession({ transactionType: 'rent' });

  // Turn 1: first firm rejection → ONE rebuttal (persuasion attempt)
  const r1 = await sendMessage(session, 'NE SAKAM TI REKOV');
  console.log(`  T1 "NE SAKAM TI REKOV" → ${r1.type}: ${(r1.text || '').substring(0, 55)}`);
  assert('C1: turn1 type=NORMAL (rebuttal)', r1.type === 'NORMAL', `got ${r1.type}`);
  assert('C1: cooperationAccepted stays false', session.collectedData.cooperationAccepted !== true, 'was accepted');
  assert('C1: phase stays PERSUASION', session.phase === 'PERSUASION', `got ${session.phase}`);
  assert('C1: rejectionCount = 1', session.rejectionCount === 1, `got ${session.rejectionCount}`);

  // Turn 2: self-service refusal (singular "go") → SECOND rejection → GIVE UP
  const r2 = await sendMessage(session, 'SAMA KE SI GO IZDADAM');
  console.log(`  T2 "SAMA KE SI GO IZDADAM" → ${r2.type}: ${(r2.text || '').substring(0, 70)}`);
  assert('C2: turn2 NOT closed yet (goodbye comes on the 3rd)', r2.type !== 'CLOSED', `got ${r2.type}`);
  assert('C2: rejectionCount = 2', session.rejectionCount === 2, `got ${session.rejectionCount}`);
  assert('C2: give-up — NO sales pitch, NO cooperation question',
    !/пробаме|провизија|соработк/i.test(r2.text || ''), `text: ${r2.text}`);
  assert('C2: give-up — short acknowledgement', ((r2.text || '').length < 80), `len=${(r2.text || '').length}`);

  // Turn 3: hedged deferral — stays in persuasion, does NOT reset the count
  const r3 = await sendMessage(session, 'PA PRVO KE RPOBAM MESEC DVA PA KE VIDIME');
  console.log(`  T3 "PA PRVO KE RPOBAM MESEC DVA PA KE VIDIME" → ${r3.type}: ${(r3.text || '').substring(0, 55)}`);
  assert('C3: turn3 NOT closed (conversation continues)', r3.type !== 'CLOSED', `got ${r3.type}`);
  assert('C3: no phantom floor collected', session.collectedData.floor === undefined, `got floor=${session.collectedData.floor}`);
  assert('C3: hedge does NOT reset rejectionCount', session.rejectionCount === 2, `got ${session.rejectionCount}`);

  // Turn 4: firm rejection (non-offensive — "OTKACI SE" would fire the
  // strike WARNING instead) → THIRD rejection → polite goodbye + CLOSED
  const r4 = await sendMessage(session, 'OSTAVI ME');
  console.log(`  T4 "OSTAVI ME" → ${r4.type}: ${(r4.text || '').substring(0, 70)}`);
  assert('C4: turn4 type=CLOSED (polite goodbye)', r4.type === 'CLOSED', `got ${r4.type}`);
  assert('C4: cooperationAccepted stays false (NOT data collection)', session.collectedData.cooperationAccepted !== true, 'was accepted!');
  assert('C4: phase NOT DATA_COLLECTION', session.phase !== 'DATA_COLLECTION', `got ${session.phase}`);
  assert('C4: rejectionCount = 3', session.rejectionCount === 3, `got ${session.rejectionCount}`);
  const goodbyes = ['пробате сами', 'почитувам', 'до слушање', 'не ве притискам'];
  assert('C4: text is one of the polite-goodbye variants', goodbyes.some(g => (r4.text || '').includes(g)), `text: ${r4.text}`);
}

// ------------------------------------------------------------
// PART D — "DOSADNA SI" registers a mild offensive strike
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('😤 PART D: "DOSADNA SI" → mild offensive strike');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const [label, msg] of [
  ['D1', 'DOSADNA SI'],
  ['D2', 'SI DOSADNA'],
  ['D3', 'ДОСАДНА СИ']
]) {
  const o = classifyOffensive(msg);
  console.log(`  "${msg}" → offensive=${o.isOffensive} cat=${o.category} sev=${o.severity}`);
  assert(`${label}: "${msg}" → mild strike`, o.isOffensive && o.category === 'mild' && o.severity === 1, `got ${JSON.stringify(o)}`);
}

// Control — a non-insult "dosadna" usage stays clean
{
  const o = classifyOffensive('nemam dosadna situacija');
  console.log(`  "nemam dosadna situacija" → offensive=${o.isOffensive}`);
  assert('D4: non-insult dosadna usage stays clean', o.isOffensive === false, `got ${JSON.stringify(o)}`);
}

// "OTKACI SE" also registers a mild strike (user-approved "Both")
for (const [label, msg] of [
  ['D5', 'OTKACI SE'],
  ['D6', 'NE SAKAM, OTKACI SE'],
  ['D7', 'ОТКАЧИ СЕ']
]) {
  const o = classifyOffensive(msg);
  console.log(`  "${msg}" → offensive=${o.isOffensive} cat=${o.category} sev=${o.severity}`);
  assert(`${label}: "${msg}" → mild strike`, o.isOffensive && o.category === 'mild' && o.severity === 1, `got ${JSON.stringify(o)}`);
}

// ------------------------------------------------------------
// Summary
// ------------------------------------------------------------
console.log('\n');
harness.summary('TEST REJECTION-GOODBYE');
harness.exit();
