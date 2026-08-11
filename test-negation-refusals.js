// ========================================
// NEGATION PROTOCOL (reported, lead 5436709)
// Ana failed to identify the owner's negations:
//   1. "NE SUM" → classified INTERESTED 0.5 → generic persuasion pitch.
//   2. "NE SAKAM SORABOTKA SO AGENCII" / "NE SAKAM SORABOTKA" → swallowed by
//      the commission explanation ("Разликата меѓу вашата чиста цена...")
//      because isAskingAboutCommission's bare "sorabotka" keyword matched
//      first — the rejection never reached the classifier, rejectionCount
//      never incremented, and Ana repeated the pitch forever.
//
// Fix:
//   - classifier.js: bare "NE SUM" (short answer) → REJECTED 0.85.
//   - handlers/early-responses.js: REFUSAL GUARD (persuasion-only, after the
//     cooperation-rollback check) routes clear refusals to the rejection
//     classifier — the rebuttal ladder (1 → rebuttal, 2 → give up,
//     3 → CLOSED) finally runs.
// Controls verified: commission QUESTIONS, commission-specific refusals
// ("ne sakam da platam provizija"), hesitation ("ne sum siguren"), and the
// still-available family ("uste ne sum go prodal") are untouched.
// ========================================
process.env.ANA_OFFLINE_LLM = '1';

import { generateResponse } from './service.js';
import { createHarness } from './test-helpers.js';

const { assert, summary, exit } = createHarness();

function freshSession(tt = 'sale') {
  return {
    adMemory: { transactionType: tt, propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { transactionType: tt, cooperationAccepted: false },
    messages: [{ role: 'model', text: 'Го добив вашиот број од огласот. Дали сте заинтересирани за соработка?' }],
    phone: '+38970000001',
    phase: 'PERSUASION',
    rejectionCount: 0
  };
}

const REBUTTAL_RE = /Агенцијата не зема|Агенцијата се грижи/;
const COMMISSION_RE = /чиста цена и постигнатата/;

// ========================================
// PART A — the exact reported messages route to the rejection ladder
// ========================================
console.log('\n========================================');
console.log('🧪 A: reported negations → REJECTED → rebuttal (not commission/pitch)');
console.log('========================================\n');

for (const [label, msg] of [
  ['A1', 'NE SUM'],
  ['A2', 'NE SUM, FALA'],
  ['A3', 'NE SAKAM SORABOTKA SO AGENCII'],
  ['A4', 'NE SAKAM SORABOTKA'],
  ['A5', 'NE MI TREBA AGENCIJA']
]) {
  const s = freshSession();
  const r = await generateResponse(s, msg);
  assert(`${label}: "${msg}" → rejectionCount incremented to 1`,
    s.rejectionCount === 1, `got rejCount=${s.rejectionCount}`);
  assert(`${label}: "${msg}" → rebuttal answer, NOT the commission explanation`,
    REBUTTAL_RE.test(r.text || '') && !COMMISSION_RE.test(r.text || ''),
    `reply: ${(r.text || '').slice(0, 80)}`);
  assert(`${label}: "${msg}" → still PERSUASION, cooperation NOT accepted`,
    s.collectedData.cooperationAccepted !== true, 'was accepted!');
}

// ========================================
// PART B — full escalation ladder on the reported lead shape
// ========================================
console.log('\n========================================');
console.log('🧪 B: rejection ladder — rebuttal → give up → CLOSED');
console.log('========================================\n');

{
  const s = freshSession();
  const r1 = await generateResponse(s, 'NE SAKAM SORABOTKA SO AGENCII');
  assert('B1: rejection 1 → one rebuttal', s.rejectionCount === 1 && REBUTTAL_RE.test(r1.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r1.text || '').slice(0, 60)}`);

  const r2 = await generateResponse(s, 'NE SAKAM SORABOTKA');
  assert('B2: rejection 2 → give-up (no pitch, no question)',
    s.rejectionCount === 2 && !/пробаме|провизија|соработк/.test(r2.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r2.text || '').slice(0, 60)}`);

  const r3 = await generateResponse(s, 'OSTAVI ME');
  assert('B3: rejection 3 → polite goodbye + CLOSED',
    r3.type === 'CLOSED', `got ${r3.type} — ${(r3.text || '').slice(0, 60)}`);
  assert('B3: cooperation stays false (never entered data collection)',
    s.collectedData.cooperationAccepted !== true, 'was accepted!');
}

// ========================================
// PART C — controls: nothing else is affected
// ========================================
console.log('\n========================================');
console.log('🧪 C: controls — commission Qs, hesitation, availability untouched');
console.log('========================================\n');

{
  const s = freshSession();
  const r = await generateResponse(s, 'kako rabotite bez provizija?');
  assert('C1: commission QUESTION still gets the commission explanation',
    s.rejectionCount === 0 && /провизиј|разликат/.test(r.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  const s = freshSession();
  const r = await generateResponse(s, 'ne sakam da platam provizija');
  assert('C2: commission-SPECIFIC refusal still gets the commission explanation (not the ladder)',
    s.rejectionCount === 0 && COMMISSION_RE.test(r.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  // Reviewer finding: the SHORT form too — "ne sakam provizija" (3 words,
  // has "ne sakam") must NOT be pulled from the commission explanation into
  // the rejection ladder (the rebuttal is a worse answer, esp. on rent).
  const s = freshSession();
  const r = await generateResponse(s, 'ne sakam provizija');
  assert('C6: short commission refusal "ne sakam provizija" keeps the commission explanation',
    s.rejectionCount === 0 && COMMISSION_RE.test(r.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  // Reviewer finding: the guard's bare-ne-sum tail is strict — a hedge
  // ("ne sum, ke vidime" = I'm not, we'll see) stays INTERESTED persuasion.
  const s = freshSession();
  const r = await generateResponse(s, 'ne sum, ke vidime');
  assert('C7: hedge "ne sum, ke vidime" stays persuasion — NOT rejected',
    s.rejectionCount === 0 && !/Агенцијата не зема|Агенцијата се грижи/.test(r.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  // Reviewer finding: rollback + guard chain — inside DATA_COLLECTION a
  // cooperation challenge rolls back (cooperationAccepted → false) and the
  // guard then routes it to the rejection ladder (rejCount 1, back to
  // PERSUASION with a rebuttal).
  const s = freshSession();
  s.collectedData.cooperationAccepted = true;
  s.phase = 'DATA_COLLECTION';
  s.rejectionCount = 3;
  const r = await generateResponse(s, 'ne sakam sorabotka');
  assert('C8: "ne sakam sorabotka" in DATA_COLLECTION → rollback + rejection ladder',
    s.collectedData.cooperationAccepted !== true && s.rejectionCount === 1 &&
      REBUTTAL_RE.test(r.text || ''),
    `accepted=${s.collectedData.cooperationAccepted} rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  const s = freshSession();
  const r = await generateResponse(s, 'ne sum siguren');
  assert('C3: "ne sum siguren" (I\'m not sure) stays hesitation — NOT rejected',
    s.rejectionCount === 0 && r.type !== 'CLOSED',
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  const s = freshSession();
  const r = await generateResponse(s, 'uste ne sum go prodal');
  assert('C4: "uste ne sum go prodal" (still available) → availability template, not rejection',
    s.rejectionCount === 0 && /Драго ми е/.test(r.text || ''),
    `rejCount=${s.rejectionCount} reply=${(r.text || '').slice(0, 60)}`);
}

{
  // DATA_COLLECTION safety: with cooperation already accepted, the guard is
  // skipped (the rollback block owns that vocabulary there).
  const s = freshSession();
  s.collectedData.cooperationAccepted = true;
  s.phase = 'DATA_COLLECTION';
  s.collectedData.monthlyRent = 260;
  const r = await generateResponse(s, 'ne sakam da platam provizija');
  assert('C5: inside DATA_COLLECTION the guard does NOT hijack the message',
    r.type !== 'CLOSED', `got ${r.type} — ${(r.text || '').slice(0, 60)}`);
}

const res = summary('NEGATION PROTOCOL TEST SUMMARY');
exit();
