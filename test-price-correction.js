// ============================================================
// TEST: Mid-data-collection PRICE CORRECTIONS
// ============================================================
// Reported: the owner answers the monthlyRent question (or corrects a
// backfilled/extracted price) with a DIFFERENT number — "ne, 300 e" — and
// the stored price was SILENTLY KEPT (runGlobalExtraction never overwrites,
// so the 300 was extracted internally, dropped by the "already set" guard,
// and Ana moved on with the stale 350).
//
// Fix: an EXPLICIT price-correction gate (isExplicitPriceCorrection in
// data-collector.js) admits re-extraction + overwrite ONLY when the message
// is a clear correction:
//   1. correction verbs (promeni / izmeni / smeni / koregiraj / ispravi...)
//   2. leading negation ("ne, 300 e", "не 300", "ne, 100 iljadi")
//   3. an explicit rent noun ("kirijata e 300", "mesecno 300",
//      "300 evra za mesec")
// Unrelated numbers in other-field answers ("63 kvadrati", "3 kat", a
// parking "5000 evra") can NEVER clobber the price.
//
// Fully offline (hardcoded extraction paths — ANA_OFFLINE_LLM set so any
// accidental persuasion fall-through degrades gracefully).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { runGlobalExtraction, isExplicitPriceCorrection } from './data-collector.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A: isExplicitPriceCorrection gate (unit)
// ============================================================
console.log('\n=== A: correction gate ===');

const SHOULD_CORRECT = [
  'ne, 300 e',
  'ne, 300 evra',
  'не, 300 е',
  'ne 300',
  'не 300',
  'ne, 100 iljadi',
  'promeni na 300',
  'промени на 300',
  'izmeni na 300',
  'smeni na 300 evra',
  'koregiraj na 300',
  'kirijata e 300',
  'киријата е 300 евра',
  'kirija 300',
  'mesecno 300',
  'месечно 300',
  '300 evra za mesec',
  '300 евра за месец',
  '63 kvadrati, kirijata e 300 evra'
];
for (const q of SHOULD_CORRECT) {
  assert(`correction signal: "${q}"`, isExplicitPriceCorrection(q) === true);
}

const NOT_CORRECT = [
  '63 kvadrati',                 // sqm answer — no price signal
  '300 e',                       // bare number — ambiguous, not explicit
  '300 evra',                    // bare currency — could be anything
  '5000 evra',                   // parking price, not a correction
  '3 kat',                       // floor answer
  '2 spalni',                    // bedrooms answer
  'da',
  'ne',                          // bare negation — no number
  'ne znam',
  'kolku kvadrati?',
  // LEADING "ne" WITH A FAR-AWAY DIGIT (reviewer finding): the digit must
  // sit right after the negation for a correction. "ne treba povekje od
  // 300" (I don't need more than 300) and "ne znam, 300 evra" (I don't
  // know, maybe 300) are NOT price corrections — the number belongs to a
  // different thought and must never clobber the stored price.
  'ne treba povekje od 300',
  'NE TREBA POVEKJE OD 300 EVRA',
  'ne znam, 300 evra',
  'ne znam kolku e, ama mozebi 300 evra'
];
for (const q of NOT_CORRECT) {
  assert(`no correction signal: "${q}"`, isExplicitPriceCorrection(q) === false);
}

// ============================================================
// PART B: runGlobalExtraction re-extracts on correction (unit)
// ============================================================
console.log('\n=== B: extractor-level correction ===');

const rentData = { transactionType: 'rent', monthlyRent: 350, monthlyRentConfidence: 0.95 };

// Correction → the NEW number is returned as an update
let r = runGlobalExtraction('ne, 300 e', { ...rentData }, 'totalSqm');
assert('B1: "ne, 300 e" → monthlyRent=300 (correction)', r.monthlyRent === 300, `got ${JSON.stringify(r)}`);

// No signal → no update (still empty)
r = runGlobalExtraction('63 kvadrati', { ...rentData }, 'totalSqm');
assert('B2: "63 kvadrati" → no monthlyRent update (no clobber)', r.monthlyRent === undefined, `got ${JSON.stringify(r)}`);

r = runGlobalExtraction('300 e', { ...rentData }, 'totalSqm');
assert('B3: bare "300 e" → no monthlyRent update (ambiguous)', r.monthlyRent === undefined, `got ${JSON.stringify(r)}`);

// Sale correction
const saleData = { transactionType: 'sale', cleanPrice: 120000, cleanPriceConfidence: 0.95 };
r = runGlobalExtraction('ne, 100 iljadi', { ...saleData }, 'totalSqm');
assert('B4: sale "ne, 100 iljadi" → cleanPrice=100000', r.cleanPrice === 100000, `got ${JSON.stringify(r)}`);

// Correction + the current-field answer in ONE message
r = runGlobalExtraction('63 kvadrati, mesecno 300 evra', { ...rentData }, 'totalSqm');
assert('B5: "63 kvadrati, mesecno 300 evra" → totalSqm=63 + monthlyRent=300',
  r.totalSqm === 63 && r.monthlyRent === 300, `got ${JSON.stringify(r)}`);

// Same value repeated is NOT a correction
r = runGlobalExtraction('ne, 350 e', { ...rentData }, 'totalSqm');
assert('B6: "ne, 350 e" (same value) → no update', r.monthlyRent === undefined, `got ${JSON.stringify(r)}`);

// Rent lead: cleanPrice never set from the correction
r = runGlobalExtraction('ne, 300 e', { ...rentData }, 'totalSqm');
assert('B7: rent correction → cleanPrice untouched', r.cleanPrice === undefined, `got ${JSON.stringify(r)}`);

// ============================================================
// PART C: e2e generateResponse — stored price updated on correction
// ============================================================
console.log('\n=== C: e2e price correction ===');

function freshRentSession() {
  return {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, monthlyRent: 350, monthlyRentConfidence: 0.95, availableFrom: '2026-06-01', availableFromConfidence: 0.95 },
    messages: [{ role: 'model', text: 'Одлично. Колкава е вкупната квадратура по имотен лист?' }],
    phone: '+38970123456'
  };
}

// C1: the reported "ne, 300 e" → monthlyRent updated to 300 at HIGH
{
  const s = freshRentSession();
  const res = await generateResponse(s, 'ne, 300 e');
  assert('C1: monthlyRent=300 (not silently kept 350)', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('C1: confidence=0.95 (explicit correction → HIGH)', s.collectedData.monthlyRentConfidence === 0.95, `got ${JSON.stringify(s.collectedData.monthlyRentConfidence)}`);
  assert('C1: flow continues to totalSqm (NO price re-ask)', res.type === 'QUESTION' && /квадратур/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// C1b: Cyrillic correction
{
  const s = freshRentSession();
  const res = await generateResponse(s, 'не, 300 е');
  assert('C1b: Cyrillic "не, 300 е" → monthlyRent=300', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('C1b: continues to totalSqm', res.type === 'QUESTION' && /квадратур/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// C2: correction verb
{
  const s = freshRentSession();
  await generateResponse(s, 'promeni na 300 evra');
  assert('C2: "promeni na 300 evra" → monthlyRent=300', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// C3: volunteered rent correction while answering the sqm question
// (NOTE: "kirijata e 300" phrasing is intercepted earlier by the rent-rules
// early handler — the price is still corrected there via the E-series
// pass-through (see E2), but the sqm answer is consumed by the early reply,
// so this test uses the "mesecno 300 evra" form which reaches extraction.)
{
  const s = freshRentSession();
  const res = await generateResponse(s, '63 kvadrati, mesecno 300 evra');
  assert('C3: totalSqm=63 AND monthlyRent corrected to 300', s.collectedData.totalSqm === 63 && s.collectedData.monthlyRent === 300,
    `got sqm=${JSON.stringify(s.collectedData.totalSqm)}, rent=${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('C3: next question is terraceSqm (both fields consumed)', res.type === 'QUESTION' && /терас/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// C4: NO clobber — plain sqm answer leaves the price alone
{
  const s = freshRentSession();
  await generateResponse(s, '63 kvadrati');
  assert('C4: "63 kvadrati" → monthlyRent stays 350', s.collectedData.monthlyRent === 350, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('C4: totalSqm=63 still collected', s.collectedData.totalSqm === 63, `got ${JSON.stringify(s.collectedData.totalSqm)}`);
}

// C5: bare "300 e" (no explicit correction signal) → price NOT clobbered
{
  const s = freshRentSession();
  await generateResponse(s, '300 e');
  assert('C5: bare "300 e" → monthlyRent stays 350', s.collectedData.monthlyRent === 350, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// C6: sale correction
{
  const s = {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 120000, cleanPriceConfidence: 0.95 },
    messages: [{ role: 'model', text: 'Одлично. Колкава е вкупната квадратура?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'ne, 100 iljadi');
  assert('C6: sale cleanPrice 120000 → 100000', s.collectedData.cleanPrice === 100000, `got ${JSON.stringify(s.collectedData.cleanPrice)}`);
  assert('C6: continues to totalSqm', res.type === 'QUESTION' && /квадратур/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// C7: pending-confirmation contract preserved — a pending value rejected with
// a NEW number still re-asks (the pending value was never stored; extraction
// on the next turn collects the new number). "ne, 400 e" must NOT confirm 350
// and must NOT silently store anything either.
{
  const s = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' } },
    questionAttempts: {},
    pendingFollowUp: null,
    pendingConfirmation: { field: 'monthlyRent', value: 350 },
    messages: [{ role: 'model', text: 'Дали точната вредност е 350? Која е месечната кирија за станот?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'ne, 400 e');
  assert('C7: pending "ne, 400 e" → re-ask (QUESTION, not silent store)', res.type === 'QUESTION' && /прашам повторно/.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('C7: monthlyRent still undefined', s.collectedData.monthlyRent === undefined, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('C7: pending cleared for the fresh ask', s.pendingConfirmation === null || s.pendingConfirmation === undefined, `got ${JSON.stringify(s.pendingConfirmation)}`);
}

// C8: the correction must not leave a stale pendingConfirmation behind
{
  const s = freshRentSession();
  await generateResponse(s, 'ne, 300 e');
  assert('C8: no pendingConfirmation after correction', !s.pendingConfirmation, `got ${JSON.stringify(s.pendingConfirmation)}`);
}

// ============================================================
// PART D: correction while a DIFFERENT field's confirmation is pending
// (pass-through — the re-ask must not swallow the price correction)
// ============================================================
console.log('\n=== D: correction during another field\'s pending confirmation ===');

// D1: monthlyRent=350 stored, totalSqm confirmation pending, owner rejects
// the sqm confirmation AND corrects the price in one message → price
// updated, sqm re-asked (the re-ask no longer silently keeps the stale 350)
{
  const s = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, monthlyRent: 350, monthlyRentConfidence: 0.95, availableFrom: '2026-06-01', availableFromConfidence: 0.95 },
    questionAttempts: {},
    pendingFollowUp: null,
    pendingConfirmation: { field: 'totalSqm', value: 63 },
    messages: [{ role: 'model', text: 'Дали точната вредност е 63? Колкава е вкупната квадратура?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'ne, 300 e');
  assert('D1: monthlyRent corrected 350 → 300 (not swallowed by the re-ask)', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('D1: confidence=0.95', s.collectedData.monthlyRentConfidence === 0.95, `got ${JSON.stringify(s.collectedData.monthlyRentConfidence)}`);
  assert('D1: totalSqm still re-asked (pending reject contract preserved)', res.type === 'QUESTION' && /прашам повторно/.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('D1: pending cleared for the fresh ask', !s.pendingConfirmation, `got ${JSON.stringify(s.pendingConfirmation)}`);
}

// D2: sale variant, Cyrillic — cleanPrice corrected while sqm pending
{
  const s = {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 120000, cleanPriceConfidence: 0.95 },
    questionAttempts: {},
    pendingFollowUp: null,
    pendingConfirmation: { field: 'totalSqm', value: 63 },
    messages: [{ role: 'model', text: 'Дали точната вредност е 63? Колкава е вкупната квадратура?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'не, 100 илјади');
  assert('D2: sale cleanPrice corrected 120000 → 100000', s.collectedData.cleanPrice === 100000, `got ${JSON.stringify(s.collectedData.cleanPrice)}`);
  assert('D2: totalSqm re-asked', res.type === 'QUESTION' && /прашам повторно/.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// D3: correction pass-through must NOT clobber the price without a signal —
// a plain sqm rejection ("ne, 65 kvadrati") while price is stored leaves
// the price untouched
{
  const s = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, monthlyRent: 350, monthlyRentConfidence: 0.95, availableFrom: '2026-06-01', availableFromConfidence: 0.95 },
    questionAttempts: {},
    pendingFollowUp: null,
    pendingConfirmation: { field: 'totalSqm', value: 63 },
    messages: [{ role: 'model', text: 'Дали точната вредност е 63? Колкава е вкупната квадратура?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'ne, 65 kvadrati');
  assert('D3: "ne, 65 kvadrati" → monthlyRent stays 350', s.collectedData.monthlyRent === 350, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('D3: totalSqm re-asked', res.type === 'QUESTION' && /прашам повторно/.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// ============================================================
// PART E: OTHER EARLY RESPONSES DURING DATA COLLECTION — same swallow
// pattern. runEarlyResponses runs BEFORE the extraction pass and returns a
// canned answer (commission, rent rules, agency...) for any message that
// matches a known question pattern — the whole message, including an
// explicit price correction in it, used to be lost. The service.js guard
// now applies the correction before the canned response is handed back.
// ============================================================
console.log('\n=== E: early responses during data collection ===');

// E1: commission question + correction in ONE message (the reported case)
{
  const s = freshRentSession();
  const res = await generateResponse(s, 'kako zemate provizija? kirijata e 300');
  assert('E1: commission answer returned (NORMAL, not a data question)', res.type === 'NORMAL', `got [${res.type}]`);
  assert('E1: monthlyRent corrected 350 → 300 (not swallowed by the commission reply)', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
  assert('E1: confidence=0.95', s.collectedData.monthlyRentConfidence === 0.95, `got ${JSON.stringify(s.collectedData.monthlyRentConfidence)}`);
}

// E2: rent-rules swallow — "kirijata e 300" matches isAskingAboutRentRules
// (bare "kirija" stem), so the rent-rules answer used to swallow the price
// correction entirely. Now the correction is applied first.
{
  const s = freshRentSession();
  const res = await generateResponse(s, 'kirijata e 300');
  assert('E2: rent-rules answer returned', res.type === 'NORMAL' && /кириј|депозит/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('E2: monthlyRent corrected 350 → 300', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// E2b: Cyrillic variant of the rent-rules swallow
{
  const s = freshRentSession();
  await generateResponse(s, 'киријата е 300');
  assert('E2b: Cyrillic "киријата е 300" → monthlyRent=300', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// E3: sale from_whose_pocket question + correction in one message
{
  const s = {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 120000, cleanPriceConfidence: 0.95 },
    messages: [{ role: 'model', text: 'Одлично. Колкава е вкупната квадратура?' }],
    phone: '+38970123456'
  };
  const res = await generateResponse(s, 'ne, 100 iljadi, od kogo zemate pari?');
  assert('E3: commission answer returned (money origin)', res.type === 'NORMAL' && /куп|пари|земаме/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('E3: cleanPrice corrected 120000 → 100000', s.collectedData.cleanPrice === 100000, `got ${JSON.stringify(s.collectedData.cleanPrice)}`);
}

// E4: negative control — a commission question WITHOUT a correction signal
// leaves the price untouched (no false clobber)
{
  const s = freshRentSession();
  const res = await generateResponse(s, 'kako zemate provizija?');
  assert('E4: commission answer returned', res.type === 'NORMAL', `got [${res.type}]`);
  assert('E4: monthlyRent stays 350 (no correction signal)', s.collectedData.monthlyRent === 350, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// E5: complex-handler swallow — a price correction in a message consumed by
// the heating follow-up re-ask (pendingFollowUp skips the extraction pass;
// the guard catches it at the complex-handler return)
{
  const s = freshRentSession();
  s.collectedData.heatingFollowUp = true;
  s.pendingFollowUp = 'heating';
  const res = await generateResponse(s, 'parno, promeni na 300 evra');
  assert('E5: heating follow-up re-asked', res.type === 'QUESTION' && /парно/.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('E5: monthlyRent corrected 350 → 300 (not swallowed by the follow-up)', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

// E6: follow-up RESOLUTION gap — pendingFollowUp skips the extraction pass,
// then the message RESOLVES the follow-up inside the complex handler (which
// clears pendingFollowUp and returns null), so the correction is only caught
// at the runDataCollectionFlow return (the final guard site)
{
  const s = freshRentSession();
  s.collectedData.heatingFollowUp = true;
  s.pendingFollowUp = 'heating';
  const res = await generateResponse(s, 'gradsko, promeni na 300 evra');
  assert('E6: heating resolved to district, flow continues', res.type === 'QUESTION' && /квадратур/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert('E6: heating=district stored', s.collectedData.heating === 'district', `got ${JSON.stringify(s.collectedData.heating)}`);
  assert('E6: monthlyRent corrected 350 → 300 (not lost at the next-question return)', s.collectedData.monthlyRent === 300, `got ${JSON.stringify(s.collectedData.monthlyRent)}`);
}

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 PRICE-CORRECTION TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 PRICE-CORRECTION TESTS PASSED');
}
