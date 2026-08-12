// ============================================================
// test-repeat-sqm-price.js — ANNOYED_REPEAT strip extended to
// totalSqm and price repeats ("86 TI KAZAV", "350 TI KAZAV")
// ============================================================
// Reported (same re-ask loop as the totalFloors "7 TI KAZAV" bug):
//
//   ANA: ...Колкава е вкупната квадратура?
//   OWNER: 86 TI KAZAV            → totalSqm NOT collected on first attempt ❌
//                                  (no bare-number fallback in extractTotalSqm)
//   OWNER: 86                     → MEDIUM → "Дали точната вредност е 86?"
//
//   ANA: ...Која е месечната кирија?
//   OWNER: TI KAZAV 350           → extracted at 0.60 (PENDING) → re-ask ❌
//   OWNER: DA                     → only then collected
//
// Fixes under test:
//   1. ANNOYED_REPEAT_RE now strips BOTH word orders ("350 TI KAZAV" and
//      "TI KAZAV 350") with punctuation tolerance ("350, TI KAZAV!").
//   2. extractTotalSqm gets a BARE DIRECT-ANSWER fallback ("86 TI KAZAV" →
//      86 AND a plain bare "86" answering the totalSqm question → 86 —
//      reported lead 5531598: "SEDUMDESE I PET" (75) was skipped because the
//      old STRIP-GATED fallback needed an annoyed marker). Global discovery
//      still never guesses (STEP 2 NUMBER_SNIFFING guard) and the
//      pure-number-phrase guard still blocks the history-scan rent-420 bleed.
//   3. assessConfidence: totalSqm bare digits 10-999 are HIGH (direct sqm
//      answers), and PRICE repeats (cleanPrice/monthlyRent) are HIGH ONLY
//      when the strip fires — a bare "350" stays MEDIUM (RT3d4 preserved).
//   4. The STEP 2 isBareNumber guard uses the strip so a repeat during a
//      DIFFERENT question cannot cross-contaminate numeric fields.
//
// Runs fully offline — the DATA_COLLECTION phase never calls the LLM.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { runGlobalExtraction, assessConfidence } from './data-collector.js';
import { generateResponse } from './service.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — extractTotalSqm strip-gated bare-number fallback
// ============================================================
console.log('\n========================================');
console.log('🧪 A: "86 TI KAZAV" → totalSqm=86 (annoyed repeat collected)');
console.log('========================================\n');

let result = runGlobalExtraction('86 TI KAZAV', {}, 'totalSqm');
assert('A1: "86 TI KAZAV" → totalSqm=86', result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);

// Cyrillic annoyed repeat
result = runGlobalExtraction('осумдесет и шест ти реков', {}, 'totalSqm');
assert('A2: "осумдесет и шест ти реков" → totalSqm=86', result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);

// Punctuation-tolerant phrase-last form
result = runGlobalExtraction('86, TI KAZAV!', {}, 'totalSqm');
assert('A3: "86, TI KAZAV!" (punctuation) → totalSqm=86', result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);

// Plain bare number IS the direct answer to the just-asked totalSqm
// question — collected now (reported lead 5531598). The old strict gate
// ("no guess without annoyed marker") caused "SEDUMDESE I PET" → skipped.
result = runGlobalExtraction('86', {}, 'totalSqm');
assert('A4: plain bare "86" with preferredField=totalSqm → totalSqm=86 (direct answer)',
  result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);
// GLOBAL DISCOVERY still never guesses — no preferredField → bare number
// hits the STEP 2 NUMBER_SNIFFING guard, so extractTotalSqm is skipped.
result = runGlobalExtraction('86', {});
assert('A4b: plain bare "86" WITHOUT preferredField → NO totalSqm (global no-guess preserved)',
  result.totalSqm === undefined, `got ${JSON.stringify(result.totalSqm)}`);
// The reported lead 5531598 phrasing — 75 in WORDS, no m2 keyword, no marker
result = runGlobalExtraction('SEDUMDESE I PET', {}, 'totalSqm');
assert('A4c: "SEDUMDESE I PET" → totalSqm=75 (word direct answer, truncated tens)',
  result.totalSqm === 75, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction('седумдесе и пет', {}, 'totalSqm');
assert('A4d: Cyrillic "седумдесе и пет" → totalSqm=75',
  result.totalSqm === 75, `got ${JSON.stringify(result.totalSqm)}`);

// Out-of-range digit must not fire
result = runGlobalExtraction('3 TI KAZAV', {}, 'totalSqm');
assert('A5: "3 TI KAZAV" → NO totalSqm (1-digit is never a sqm value)',
  result.totalSqm === undefined, `got ${JSON.stringify(result.totalSqm)}`);

// ============================================================
// PART B — assessConfidence: totalSqm bare answers HIGH
// ============================================================
console.log('\n========================================');
console.log('🧪 B: totalSqm direct answers collect at HIGH (no re-ask)');
console.log('========================================\n');

assert('B1: "86 TI KAZAV" totalSqm confidence HIGH',
  assessConfidence('totalSqm', 86, '86 TI KAZAV') === 'HIGH',
  `got ${assessConfidence('totalSqm', 86, '86 TI KAZAV')}`);
assert('B2: bare "86" totalSqm confidence HIGH (direct sqm answer)',
  assessConfidence('totalSqm', 86, '86') === 'HIGH',
  `got ${assessConfidence('totalSqm', 86, '86')}`);
assert('B3: word "osumdeset i sest" totalSqm confidence HIGH',
  assessConfidence('totalSqm', 86, 'osumdeset i sest') === 'HIGH',
  `got ${assessConfidence('totalSqm', 86, 'osumdeset i sest')}`);
assert('B4: small "3" totalSqm stays MEDIUM (not a sqm value)',
  assessConfidence('totalSqm', 3, '3') === 'MEDIUM',
  `got ${assessConfidence('totalSqm', 3, '3')}`);

// ============================================================
// PART C — PRICE repeats ("350 TI KAZAV" / "TI KAZAV 350") HIGH
// ============================================================
console.log('\n========================================');
console.log('🧪 C: price repeats collect at HIGH; bare "350" stays MEDIUM');
console.log('========================================\n');

// Rent repeats
assert('C1: "350 TI KAZAV" monthlyRent confidence HIGH',
  assessConfidence('monthlyRent', 350, '350 TI KAZAV') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350 TI KAZAV')}`);
assert('C2: "TI KAZAV 350" (phrase-first, exact reported) monthlyRent confidence HIGH',
  assessConfidence('monthlyRent', 350, 'TI KAZAV 350') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, 'TI KAZAV 350')}`);
assert('C3: Cyrillic "350 ти реков" monthlyRent confidence HIGH',
  assessConfidence('monthlyRent', 350, '350 ти реков') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350 ти реков')}`);
assert('C4: "350, TI KAZAV!" (punctuation) monthlyRent confidence HIGH',
  assessConfidence('monthlyRent', 350, '350, TI KAZAV!') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350, TI KAZAV!')}`);
// CONTROL (RT3d4 pin): a bare number without the marker stays MEDIUM
assert('C5: bare "350" monthlyRent stays MEDIUM (confirmation preserved)',
  assessConfidence('monthlyRent', 350, '350') === 'MEDIUM',
  `got ${assessConfidence('monthlyRent', 350, '350')}`);

// Sale repeats
assert('C6: "TI KAZAV 98000" cleanPrice confidence HIGH',
  assessConfidence('cleanPrice', 98000, 'TI KAZAV 98000') === 'HIGH',
  `got ${assessConfidence('cleanPrice', 98000, 'TI KAZAV 98000')}`);
assert('C7: bare "98000" cleanPrice stays MEDIUM',
  assessConfidence('cleanPrice', 98000, '98000') === 'MEDIUM',
  `got ${assessConfidence('cleanPrice', 98000, '98000')}`);
// CONTROL: an annoyed marker on a NON-price context still does not clobber
// the keyword-based HIGH path
assert('C8: "go izdavam za 350 evra" still HIGH (keyword path unaffected)',
  assessConfidence('monthlyRent', 350, 'go izdavam za 350 evra') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, 'go izdavam za 350 evra')}`);

// ============================================================
// PART D — NON-LEAK: a repeat during a DIFFERENT question must not
// contaminate other numeric fields (isBareNumber strip guard)
// ============================================================
console.log('\n========================================');
console.log('🧪 D: repeats during other questions do not leak');
console.log('========================================\n');

// "86 TI KAZAV" typed while the PRICE question is current → NO totalSqm
result = runGlobalExtraction('86 TI KAZAV', { transactionType: 'rent' }, 'monthlyRent');
assert('D1: "86 TI KAZAV" during monthlyRent question → NO totalSqm',
  result.totalSqm === undefined, `got ${JSON.stringify(result.totalSqm)}`);
assert('D1: "86 TI KAZAV" during monthlyRent question → NO totalFloors',
  result.totalFloors === undefined, `got ${JSON.stringify(result.totalFloors)}`);

// "350 TI KAZAV" typed while the totalSqm question is current → NO price
result = runGlobalExtraction('350 TI KAZAV', { transactionType: 'rent' }, 'totalSqm');
assert('D2: "350 TI KAZAV" during totalSqm question → NO monthlyRent',
  result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
assert('D2: "350 TI KAZAV" during totalSqm question → NO totalFloors',
  result.totalFloors === undefined, `got ${JSON.stringify(result.totalFloors)}`);

// "7 TI KAZAV" during totalSqm question → NO totalFloors (existing pin, re-verified)
result = runGlobalExtraction('7 TI KAZAV', {}, 'totalSqm');
assert('D3: "7 TI KAZAV" during totalSqm question → NO totalFloors',
  result.totalFloors === undefined, `got ${JSON.stringify(result.totalFloors)}`);

// ============================================================
// PART E — full generateResponse flows (the reported conversations)
// ============================================================
console.log('\n========================================');
console.log('🧪 E: flow — "86 TI KAZAV" stores totalSqm at HIGH on first attempt');
console.log('========================================\n');

const sqmSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true, transactionType: 'rent',
    tenantPreferences: { preferred: [], excluded: [], notes: '' }, petsAllowed: true,
    monthlyRent: 350, monthlyRentConfidence: 0.95,
    availableFrom: '2026-06-01', availableFromConfidence: 0.95
  },
  messages: [{ role: 'model', text: 'Одлично. Колкава е вкупната квадратура по имотен лист?' }],
  phone: '+38970123456'
};

let res = await generateResponse(sqmSession, '86 TI KAZAV');
console.log('  Reply:', res.text);
assert('E1: "86 TI KAZAV" → totalSqm=86 stored on FIRST attempt',
  sqmSession.collectedData.totalSqm === 86,
  `got totalSqm=${JSON.stringify(sqmSession.collectedData.totalSqm)}`);
assert('E2: stored at HIGH confidence (no confirmation re-ask)',
  sqmSession.collectedData.totalSqmConfidence >= 0.95,
  `got ${JSON.stringify(sqmSession.collectedData.totalSqmConfidence)}`);
assert('E3: no pendingConfirmation set',
  !sqmSession.pendingConfirmation, `got ${JSON.stringify(sqmSession.pendingConfirmation)}`);
assert('E4: flow moves to next field (terraceSqm — next in rent order, no re-ask)',
  res.type === 'QUESTION' && res.nextField === 'terraceSqm' && !/квадратур|точно/.test(res.text || ''),
  `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 70))}`);

// Price repeat flow — the exact reported phrasing
console.log('\n========================================');
console.log('🧪 E: flow — "TI KAZAV 350" stores monthlyRent at HIGH (no re-ask loop)');
console.log('========================================\n');

const priceSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, petsAllowed: true },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38970123456'
};

res = await generateResponse(priceSession, 'TI KAZAV 350');
console.log('  Reply:', res.text);
assert('E5: "TI KAZAV 350" → monthlyRent=350 stored on FIRST attempt',
  priceSession.collectedData.monthlyRent === 350,
  `got monthlyRent=${JSON.stringify(priceSession.collectedData.monthlyRent)}`);
assert('E6: stored at HIGH (no confirmation round-trip)',
  priceSession.collectedData.monthlyRentConfidence === 0.95,
  `got conf=${JSON.stringify(priceSession.collectedData.monthlyRentConfidence)}`);
assert('E7: no pendingConfirmation left behind',
  priceSession.pendingConfirmation === null || priceSession.pendingConfirmation === undefined,
  `got pending=${JSON.stringify(priceSession.pendingConfirmation)}`);
assert('E8: reply moves ON to availableFrom (rent order) — NOT a monthlyRent re-ask',
  res.type === 'QUESTION' && res.nextField === 'availableFrom' && !/кириј|точно/.test(res.text || ''),
  `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 70))}`);

// "350 TI KAZAV" (number-first order) behaves identically
const priceSession2 = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, petsAllowed: true },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38970123456'
};
res = await generateResponse(priceSession2, '350 TI KAZAV');
assert('E9: "350 TI KAZAV" → monthlyRent=350 at HIGH',
  priceSession2.collectedData.monthlyRent === 350 && priceSession2.collectedData.monthlyRentConfidence === 0.95,
  `got ${JSON.stringify(priceSession2.collectedData.monthlyRent)}/${JSON.stringify(priceSession2.collectedData.monthlyRentConfidence)}`);

// Sale price repeat
const salePriceSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale' },
  messages: [{ role: 'model', text: 'Која би била последната чиста цена за станот?' }],
  phone: '+38970123456'
};
res = await generateResponse(salePriceSession, 'TI KAZAV 98000');
assert('E10: sale "TI KAZAV 98000" → cleanPrice=98000 at HIGH',
  salePriceSession.collectedData.cleanPrice === 98000 && salePriceSession.collectedData.cleanPriceConfidence === 0.95,
  `got ${JSON.stringify(salePriceSession.collectedData.cleanPrice)}/${JSON.stringify(salePriceSession.collectedData.cleanPriceConfidence)}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('REPEAT-SQM-PRICE TESTS');
harness.exit();
