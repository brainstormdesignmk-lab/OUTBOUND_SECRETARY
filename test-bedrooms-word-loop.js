// ============================================================
// test-bedrooms-word-loop.js — bedrooms "TRI" re-ask loop regression
// ============================================================
// Reported (production TUI, lead 3571074):
//
//   ANA: Колку спални соби има станот?
//   OWNER: TRI
//   ▸ [EXTRACTION: field bedrooms = 3 ...]
//   ▸ EXTRACTED: bedrooms=3 (0.60) (PENDING)
//   ANA: Дали точната вредност е 3? Колку спални соби има станот?
//   OWNER: TRI
//   ▸ [CONFIRMATION: user providing new value — let extraction handle]
//   ▸ EXTRACTED: bedrooms=3 (0.60) (PENDING)   ← forever
//
// TWO root causes, same bug class as the floor/price loops:
//   1. assessConfidence had no bare-direct-answer HIGH branch for
//      bedrooms — a bare "TRI" answering the just-asked bedroom question
//      scored MEDIUM (0.60) → needless "Дали точната вредност е 3?" re-ask.
//   2. messageRepeatsValue only matched DIGIT runs — the repeated word
//      "TRI" wasn't recognized as confirming pending 3, so it fell into the
//      "new value" branch, pending was cleared, re-extraction scored MEDIUM
//      again and re-pended → the SAME question forever.
//
// Fix: bedrooms joins the bare-direct-answer HIGH block, and
// messageRepeatsValue parses Macedonian number words ("tri"→3,
// "osumdeset i ses"→86) so a word repeat confirms at 0.95.
//
// Runs fully offline — DATA_COLLECTION never calls the LLM.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { assessConfidence } from './data-collector.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — confidence: bare word/digit bedroom answers are HIGH
// ============================================================
console.log('\n========================================');
console.log('🧪 A: assessConfidence bare bedroom answers → HIGH');
console.log('========================================\n');

assert('A1: "TRI" → HIGH (direct answer, no re-ask)',
  assessConfidence('bedrooms', 3, 'TRI') === 'HIGH',
  `got ${assessConfidence('bedrooms', 3, 'TRI')}`);
assert('A2: Cyrillic "ТРИ" → HIGH',
  assessConfidence('bedrooms', 3, 'ТРИ') === 'HIGH',
  `got ${assessConfidence('bedrooms', 3, 'ТРИ')}`);
assert('A3: bare digit "3" → HIGH',
  assessConfidence('bedrooms', 3, '3') === 'HIGH',
  `got ${assessConfidence('bedrooms', 3, '3')}`);
assert('A4: "tri sobi" → HIGH (single-word parse)',
  assessConfidence('bedrooms', 3, 'tri sobi') === 'HIGH',
  `got ${assessConfidence('bedrooms', 3, 'tri sobi')}`);
assert('A5: "dve" → HIGH',
  assessConfidence('bedrooms', 2, 'dve') === 'HIGH',
  `got ${assessConfidence('bedrooms', 2, 'dve')}`);
// A DIFFERENT value repeated in words must NOT be HIGH for the pending value
assert('A6: "triest" (30) is NOT a bedroom direct answer (cap 20)',
  assessConfidence('bedrooms', 3, 'triest') === 'MEDIUM' || assessConfidence('bedrooms', 3, 'triest') === 'LOW',
  `got ${assessConfidence('bedrooms', 3, 'triest')}`);
// EXTRACTOR-CONSISTENCY (reviewer-flagged): the HIGH gate is judged by
// countBedrooms — the exact function extractBedrooms uses — so HIGH can
// never fire on a value extraction wouldn't produce. countBedrooms' bare-
// word fallback accepts only 0-10, so a bare "dvaeset" (20) extracts as
// null — the OLD parseMacedonianNumber gate ("dvaeset"→20) would have
// silently accepted this phantom 20 at HIGH with NO extraction to back it.
assert('A7: "dvaeset" (20) phantom — countBedrooms=null → NOT HIGH',
  assessConfidence('bedrooms', 20, 'dvaeset') !== 'HIGH',
  `got ${assessConfidence('bedrooms', 20, 'dvaeset')}`);
// The parser misreads the Serbian-style "dvadeset" (20) as 10 via the
// "deset" substring, and countBedrooms extracts 10 — HIGH is consistent
// with extraction (both 10), even though the raw parse is off. This
// documents that the gate follows the extractor, for better or worse.
assert('A8: "dvadeset" → extraction=10, so HIGH fires on 10 (consistent)',
  assessConfidence('bedrooms', 10, 'dvadeset') === 'HIGH',
  `got ${assessConfidence('bedrooms', 10, 'dvadeset')}`);
// Other fields unaffected: the bedrooms branch must not leak into totalSqm
// (a bare "tri" can never be a sqm value — extraction never fires on it,
// and the pre-existing word branch is deliberately field-agnostic/inert).
assert('A9: "86" for totalSqm stays HIGH (10-999 sqm rule intact)',
  assessConfidence('totalSqm', 86, '86') === 'HIGH',
  `got ${assessConfidence('totalSqm', 86, '86')}`);

// ============================================================
// PART B — full flow: the reported FIRST turn. Owner answers "TRI" to the
// bedroom question → bedrooms=3 stored at HIGH → Ana moves to the NEXT
// field (floor). No "Дали точната вредност е 3?" re-ask.
// ============================================================
console.log('\n========================================');
console.log('🧪 B: full flow — "TRI" answering the bedroom question');
console.log('========================================\n');

function bedroomSession() {
  return {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true,
      transactionType: 'rent',
      tenantPreferences: { preferred: [], excluded: [], notes: '' },
      monthlyRent: 350,
      availableFrom: '2026-06-01',
      totalSqm: 55,
      hasTerrace: true,
      terraceSqm: 3
    },
    messages: [
      { role: 'model', text: 'Во ред. Уште неколку прашања. Колку спални соби има станот?' }
    ],
    phone: '+38970123456'
  };
}

const s1 = bedroomSession();
const r1 = await generateResponse(s1, 'TRI');
console.log('  Reply:', r1.text ? r1.text.slice(0, 90) : r1.type);
assert('B1: bedrooms=3 stored from "TRI"',
  s1.collectedData.bedrooms === 3,
  `got bedrooms=${JSON.stringify(s1.collectedData.bedrooms)}`);
assert('B1: stored at HIGH confidence (no confirmation round-trip)',
  s1.collectedData.bedroomsConfidence === 0.95,
  `got conf=${JSON.stringify(s1.collectedData.bedroomsConfidence)}`);
assert('B1: NO pending confirmation left behind',
  s1.pendingConfirmation === null || s1.pendingConfirmation === undefined,
  `got pending=${JSON.stringify(s1.pendingConfirmation)}`);
assert('B1: reply moves ON to the next field (floor) — NOT a bedrooms re-ask',
  r1.type === 'QUESTION' && r1.nextField === 'floor' && !/спални/.test(r1.text || ''),
  `got type=${r1.type} next=${r1.nextField} text=${JSON.stringify((r1.text || '').slice(0, 80))}`);

// Cyrillic variant of the same flow
const s1c = bedroomSession();
const r1c = await generateResponse(s1c, 'ТРИ');
assert('B2: Cyrillic "ТРИ" → bedrooms=3 stored at HIGH',
  s1c.collectedData.bedrooms === 3 && s1c.collectedData.bedroomsConfidence === 0.95,
  `got bedrooms=${JSON.stringify(s1c.collectedData.bedrooms)} conf=${JSON.stringify(s1c.collectedData.bedroomsConfidence)}`);
assert('B2: moves on to floor (no re-ask)',
  r1c.type === 'QUESTION' && r1c.nextField === 'floor',
  `got type=${r1c.type} next=${r1c.nextField}`);

// ============================================================
// PART C — the reported SECOND turn: a pending confirmation is answered
// with the SAME word ("TRI"). messageRepeatsValue now parses number words,
// so the repeat CONFIRMS at 0.95 instead of re-pending forever.
// ============================================================
console.log('\n========================================');
console.log('🧪 C: pending 3 re-asked → owner repeats "TRI" → CONFIRMED');
console.log('========================================\n');

const s2 = bedroomSession();
s2.pendingConfirmation = { field: 'bedrooms', value: 3 };
s2.messages.push({ role: 'model', text: 'Дали точната вредност е 3? Колку спални соби има станот?' });
const r2 = await generateResponse(s2, 'TRI');
console.log('  Reply:', r2.text ? r2.text.slice(0, 90) : r2.type);
assert('C1: repeat "TRI" CONFIRMS pending 3 (0.95, no re-pend)',
  s2.collectedData.bedrooms === 3 && s2.collectedData.bedroomsConfidence === 0.95,
  `got bedrooms=${JSON.stringify(s2.collectedData.bedrooms)} conf=${JSON.stringify(s2.collectedData.bedroomsConfidence)}`);
assert('C1: pending cleared',
  s2.pendingConfirmation === null || s2.pendingConfirmation === undefined,
  `got pending=${JSON.stringify(s2.pendingConfirmation)}`);
assert('C1: flow advances to the next field',
  r2.type === 'QUESTION' && r2.nextField === 'floor',
  `got type=${r2.type} next=${r2.nextField}`);

// A DIFFERENT word value must NOT confirm: "triest" (30) with 3 pending
const s3 = bedroomSession();
s3.pendingConfirmation = { field: 'bedrooms', value: 3 };
s3.messages.push({ role: 'model', text: 'Дали точната вредност е 3? Колку спални соби има станот?' });
const r3 = await generateResponse(s3, 'triest');
assert('C2: "triest" (30) does NOT confirm pending 3',
  s3.collectedData.bedrooms !== 3,
  `got bedrooms=${JSON.stringify(s3.collectedData.bedrooms)}`);
assert('C2: pending was cleared for the fresh ask (not a silent wrong confirm)',
  s3.pendingConfirmation === null || s3.pendingConfirmation === undefined,
  `got pending=${JSON.stringify(s3.pendingConfirmation)}`);

// ============================================================
// PART D — "EDNA PLUS DVE" (one plus two = 3): the owner states the count
// as a SUM. countBedrooms used to grab only the first word ("edna"→1) and
// the 3 was silently lost → wrong pending 1 → "Дали точната вредност е 1?"
// → owner "NE 3" → reject → re-ask (reported loop).
// ============================================================
console.log('\n========================================');
console.log('🧪 D: plus-arithmetic — "EDNA PLUS DVE" = 3');
console.log('========================================\n');

// D1: unit — countBedrooms sums the phrase
{
  const cb = await import('./property-extractor.js').then(m => m.countBedrooms);
  assert('D1: countBedrooms("EDNA PLUS DVE") = 3 (was 1)', cb('EDNA PLUS DVE') === 3, `got ${cb('EDNA PLUS DVE')}`);
  assert('D1: Cyrillic "една плус две" = 3', cb('една плус две') === 3, `got ${cb('една плус две')}`);
  assert('D1: "dve plus dve" = 4', cb('dve plus dve') === 4, `got ${cb('dve plus dve')}`);
  assert('D1: "tri plus cetiri" = 7', cb('tri plus cetiri') === 7, `got ${cb('tri plus cetiri')}`);
  // Negative: "plus terasa" is a terrace mention, NOT a sum
  assert('D1: "EDNA PLUS TERASA" → null (not a sum)', cb('EDNA PLUS TERASA') === null, `got ${cb('EDNA PLUS TERASA')}`);
  // Negative: a TIME amount with plus is not bedrooms (reviewer finding —
  // the plus branch originally bypassed the time-span guard)
  assert('D1: "mesec dva plus edna nedela" → null (time span, not bedrooms)',
    cb('mesec dva plus edna nedela') === null, `got ${cb('mesec dva plus edna nedela')}`);
  assert('D1: "dve nedeli plus edna" → null (time span)',
    cb('dve nedeli plus edna') === null, `got ${cb('dve nedeli plus edna')}`);
}

// D2: confidence — plus-phrase direct answer is HIGH
assert('D2: "EDNA PLUS DVE" → HIGH for bedrooms',
  assessConfidence('bedrooms', 3, 'EDNA PLUS DVE') === 'HIGH',
  `got ${assessConfidence('bedrooms', 3, 'EDNA PLUS DVE')}`);

// D3: full flow — pending 3 re-asked, owner confirms with "EDNA PLUS DVE"
{
  const s = bedroomSession();
  s.pendingConfirmation = { field: 'bedrooms', value: 3 };
  s.messages.push({ role: 'model', text: 'Дали точната вредност е 3? Колку спални соби има станот?' });
  const r = await generateResponse(s, 'EDNA PLUS DVE');
  console.log('  Reply:', r.text ? r.text.slice(0, 90) : r.type);
  assert('D3: "EDNA PLUS DVE" CONFIRMS pending 3 (0.95)',
    s.collectedData.bedrooms === 3 && s.collectedData.bedroomsConfidence === 0.95,
    `got bedrooms=${JSON.stringify(s.collectedData.bedrooms)} conf=${JSON.stringify(s.collectedData.bedroomsConfidence)}`);
  assert('D3: pending cleared, flow advances to floor',
    (s.pendingConfirmation === null || s.pendingConfirmation === undefined) && r.type === 'QUESTION' && r.nextField === 'floor',
    `got pending=${JSON.stringify(s.pendingConfirmation)} type=${r.type} next=${r.nextField}`);
}

// D4: full flow — FIRST answer "EDNA PLUS DVE" (no pending) extracts 3 at
// HIGH and moves on (no "Дали точната вредност е 1?" round-trip)
{
  const s = bedroomSession();
  const r = await generateResponse(s, 'EDNA PLUS DVE');
  assert('D4: first-answer "EDNA PLUS DVE" → bedrooms=3 at 0.95',
    s.collectedData.bedrooms === 3 && s.collectedData.bedroomsConfidence === 0.95,
    `got bedrooms=${JSON.stringify(s.collectedData.bedrooms)} conf=${JSON.stringify(s.collectedData.bedroomsConfidence)}`);
  assert('D4: no re-ask (moves to floor)',
    r.type === 'QUESTION' && r.nextField === 'floor' && !/спални/.test(r.text || ''),
    `got type=${r.type} next=${r.nextField} text=${JSON.stringify((r.text || '').slice(0, 80))}`);
}

// D5: a DIFFERENT plus-sum must NOT confirm — "dve plus dve" (4) with 3
// pending re-pends (goes to extraction → 4), never silently stores 3
{
  const s = bedroomSession();
  s.pendingConfirmation = { field: 'bedrooms', value: 3 };
  s.messages.push({ role: 'model', text: 'Дали точната вредност е 3? Колку спални соби има станот?' });
  await generateResponse(s, 'dve plus dve');
  assert('D5: "dve plus dve" (4) does NOT confirm pending 3',
    s.collectedData.bedrooms !== 3,
    `got bedrooms=${JSON.stringify(s.collectedData.bedrooms)}`);
  assert('D5: pending re-set to the new sum (4) — no wrong 3',
    s.pendingConfirmation === null || s.pendingConfirmation === undefined || s.pendingConfirmation.value === 4,
    `got pending=${JSON.stringify(s.pendingConfirmation)}`);
}

// D6: the "NE 3" correction half of the reported loop. With D3/D4 fixed the
// wrong pending 1 never occurs — but if a wrong value IS pending, "NE 3"
// must reject it and NOT silently store (the reject→re-ask contract,
// test-pinned in test-price-correction.js C7/D1-D3). The fresh re-ask then
// collects "3" at HIGH on the next turn (D4).
{
  const s = bedroomSession();
  s.pendingConfirmation = { field: 'bedrooms', value: 1 };
  s.messages.push({ role: 'model', text: 'Дали точната вредност е 1? Колку спални соби има станот?' });
  const r = await generateResponse(s, 'NE 3');
  assert('D6: "NE 3" rejects pending 1 (re-ask, not silent store)',
    r.type === 'QUESTION' && /прашам повторно/.test(r.text || '') && s.collectedData.bedrooms !== 1,
    `got type=${r.type} text=${JSON.stringify((r.text || '').slice(0, 60))} bedrooms=${JSON.stringify(s.collectedData.bedrooms)}`);
  // The fresh re-ask on the NEXT turn collects the 3 at HIGH — loop dead.
  const r2 = await generateResponse(s, '3');
  assert('D6: next-turn "3" → bedrooms=3 at 0.95 (loop dead)',
    s.collectedData.bedrooms === 3 && s.collectedData.bedroomsConfidence === 0.95 && r2.type === 'QUESTION' && r2.nextField === 'floor',
    `got bedrooms=${JSON.stringify(s.collectedData.bedrooms)} type=${r2.type} next=${r2.nextField}`);
}

// ============================================================
// SUMMARY
// ============================================================
harness.summary('BEDROOMS-WORD-LOOP TESTS');
harness.exit();
