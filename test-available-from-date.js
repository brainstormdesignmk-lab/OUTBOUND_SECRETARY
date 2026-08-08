// ============================================================
// test-available-from-date.js — Rent available-from date feature
// ============================================================
// Reported requirement (user decision): for RENT properties, Ana must learn
// WHEN the apartment becomes free:
//   - "ОД 1 ЈАНУАРИ Е СЛОБОДЕН" (free from January 1st) — the date question
//     must fire EVEN when the property is NOT available at the moment, so
//     the listing is HIDDEN until that date and shows on the customer page
//     when free.
//   - "не е достапен" alone (no date) is TEMPORARILY unavailable → ask the
//     date question — NOT the permanently-gone CLOSE.
//   - "го издадов веќе" (already rented, done) is PERMANENTLY gone → still
//     CLOSED.
//
// Coverage:
//   A. parseAvailableFromDate/formatAvailableFromDate unit tests (Macedonian
//      month words, day forms, numeric dates, immediate, roll-forward, and
//      the false positives that must stay null: years, floors, prices).
//   B. runGlobalExtraction — rent-only guard for availableFrom.
//   C. runEarlyResponses — temporarily-unavailable guard (GONE close must
//      NOT fire when a future date is present; the date question fires even
//      when unavailable; the awaiting marker captures a follow-up pure date
//      answer; sale behavior unchanged).
//   D. generateResponse — full DATA_COLLECTION flow: monthlyRent →
//      availableFrom → totalSqm (rent order now contains the date field).
// ============================================================
import { createHarness } from './test-helpers.js';
import { parseAvailableFromDate, formatAvailableFromDate, parseYearBuilt } from './property-extractor.js';
import { runGlobalExtraction } from './data-collector.js';
import { runEarlyResponses } from './handlers/early-responses.js';
import { generateResponse } from './service.js';

const harness = createHarness();
const assert = harness.assert;

// ------------------------------------------------------------
// Helpers — mirror the SEMANTICS (roll-forward to next occurrence),
// not the parser's implementation.
// ------------------------------------------------------------
function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function nextMonthDay(month, day) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let c = new Date(today.getFullYear(), month - 1, day);
  if (c < now) c = new Date(today.getFullYear() + 1, month - 1, day);
  return iso(c.getFullYear(), c.getMonth() + 1, c.getDate());
}
function nextDay(day) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let c = new Date(today.getFullYear(), today.getMonth(), day);
  if (c < now) c = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return iso(c.getFullYear(), c.getMonth() + 1, c.getDate());
}
function firstOfNextMonth() {
  // new Date(y, monthIndex+1, 1) is LOCAL — extract via getters so the ISO
  // string matches the parser's local-time _isoDate (a UTC toISOString()
  // here would shift the day for timezones west of UTC).
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function rentPersuasionSession(extra = {}) {
  return {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' } },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970123456',
    ...extra
  };
}

console.log('\n========================================');
console.log('🧪 A: parseAvailableFromDate / formatAvailableFromDate');
console.log('========================================\n');

// --- Immediate ---
assert('A1: "одма" → immediate', parseAvailableFromDate('одма') === 'immediate', `got ${parseAvailableFromDate('одма')}`);
assert('A2: "сега" → immediate', parseAvailableFromDate('сега') === 'immediate', `got ${parseAvailableFromDate('сега')}`);
assert('A3: "vednash" → immediate', parseAvailableFromDate('vednash') === 'immediate', `got ${parseAvailableFromDate('vednash')}`);

// --- Month words (roll forward) ---
const nextJan1 = nextMonthDay(1, 1);
assert('A4: "ОД 1 ЈАНУАРИ Е СЛОБОДЕН" → next Jan 1', parseAvailableFromDate('ОД 1 ЈАНУАРИ Е СЛОБОДЕН') === nextJan1, `got ${parseAvailableFromDate('ОД 1 ЈАНУАРИ Е СЛОБОДЕН')}, want ${nextJan1}`);
assert('A5: "od mart" → next Mar 1', parseAvailableFromDate('od mart') === nextMonthDay(3, 1), `got ${parseAvailableFromDate('od mart')}`);
assert('A6: "1vi јануари" → next Jan 1', parseAvailableFromDate('1vi јануари') === nextJan1, `got ${parseAvailableFromDate('1vi јануари')}`);
assert('A7: "15ти март" → next Mar 15', parseAvailableFromDate('15ти март') === nextMonthDay(3, 15), `got ${parseAvailableFromDate('15ти март')}`);

// --- Day only ---
const next15 = nextDay(15);
assert('A8: "od 15ti" (Latin suffix) → next day 15', parseAvailableFromDate('od 15ti') === next15, `got ${parseAvailableFromDate('od 15ti')}, want ${next15}`);
assert('A9: "од 15-ти" (Cyrillic suffix) → next day 15', parseAvailableFromDate('од 15-ти') === next15, `got ${parseAvailableFromDate('од 15-ти')}`);
assert('A10: "од 15" → next day 15', parseAvailableFromDate('од 15') === next15, `got ${parseAvailableFromDate('од 15')}`);

// --- Numeric dates ---
assert('A11: "од 1.6.2026" → 2026-06-01 (explicit year respected)',
  parseAvailableFromDate('од 1.6.2026') === '2026-06-01', `got ${parseAvailableFromDate('од 1.6.2026')}`);
assert('A12: "od 15.09." → next Sep 15', parseAvailableFromDate('od 15.09.') === nextMonthDay(9, 15), `got ${parseAvailableFromDate('od 15.09.')}`);

// --- Next month ---
assert('A13: "sledniot mesec" → 1st of next month', parseAvailableFromDate('sledniot mesec') === firstOfNextMonth(), `got ${parseAvailableFromDate('sledniot mesec')}, want ${firstOfNextMonth()}`);

// --- False positives stay null ---
assert('A14: "го издадов веќе" → null (permanent gone, not a date)',
  parseAvailableFromDate('го издадов веќе') === null, `got ${parseAvailableFromDate('го издадов веќе')}`);
assert('A15: "izdaden e" → null', parseAvailableFromDate('izdaden e') === null, `got ${parseAvailableFromDate('izdaden e')}`);
assert('A16: "од 2026" → null (a year, not a date)', parseAvailableFromDate('од 2026') === null, `got ${parseAvailableFromDate('од 2026')}`);
assert('A17: "8/10" → null (a floor, not a date)', parseAvailableFromDate('8/10') === null, `got ${parseAvailableFromDate('8/10')}`);
assert('A18: "250 evra za mesec" → null (a price)', parseAvailableFromDate('250 evra za mesec') === null, `got ${parseAvailableFromDate('250 evra za mesec')}`);
assert('A19: "63 kvadrati" → null (sqm)', parseAvailableFromDate('63 kvadrati') === null, `got ${parseAvailableFromDate('63 kvadrati')}`);

// --- Quantity phrases must NEVER become dates (reviewer finding: global
// extraction runs on every rent message — "тераса од 3 m2" would otherwise
// phantom availableFrom=next-3rd, corrupting blocked_until in the CSV) ---
assert('A23: "тераса од 3 m2" → null (terrace size, not a date)', parseAvailableFromDate('тераса од 3 m2') === null, `got ${parseAvailableFromDate('тераса од 3 m2')}`);
assert('A24: "има тераса од 3.5 м2" → null (decimal terrace size)', parseAvailableFromDate('има тераса од 3.5 м2') === null, `got ${parseAvailableFromDate('има тераса од 3.5 м2')}`);
assert('A25: "од 12 месеци минимално" → null (rent term)', parseAvailableFromDate('од 12 месеци минимално') === null, `got ${parseAvailableFromDate('од 12 месеци минимално')}`);
assert('A26: "од 2 спрата" → null (floors)', parseAvailableFromDate('од 2 спрата') === null, `got ${parseAvailableFromDate('од 2 спрата')}`);
assert('A27: "350 evra, има тераса од 3 м2" → null (volunteered multi-field)', parseAvailableFromDate('350 evra, има тераса од 3 м2') === null, `got ${parseAvailableFromDate('350 evra, има тераса од 3 м2')}`);

// --- Formatting ---
assert('A20: format 2027-01-01 → "1 јануари 2027"', formatAvailableFromDate('2027-01-01') === '1 јануари 2027', `got ${formatAvailableFromDate('2027-01-01')}`);
assert('A21: format immediate → "веднаш"', formatAvailableFromDate('immediate') === 'веднаш', `got ${formatAvailableFromDate('immediate')}`);
assert('A22: format 2026-06-01 → "1 јуни 2026"', formatAvailableFromDate('2026-06-01') === '1 јуни 2026', `got ${formatAvailableFromDate('2026-06-01')}`);

console.log('\n========================================');
console.log('🧪 B: runGlobalExtraction — rent-only availableFrom');
console.log('========================================\n');

const b1 = runGlobalExtraction('od 1 januari', { transactionType: 'rent' }, 'availableFrom');
assert('B1: rent + date → availableFrom captured',
  b1.availableFrom === nextJan1, `got ${JSON.stringify(b1.availableFrom)}, want ${nextJan1}`);

const b2 = runGlobalExtraction('od 1 januari', { transactionType: 'sale' }, 'availableFrom');
assert('B2: sale + date → NO availableFrom (rent-only guard)',
  b2.availableFrom === undefined, `got ${JSON.stringify(b2.availableFrom)}`);

const b3 = runGlobalExtraction('od 15ti', { transactionType: 'rent', availableFrom: '2026-06-01' }, 'availableFrom');
assert('B3: already set → not overwritten',
  b3.availableFrom === undefined, `got ${JSON.stringify(b3.availableFrom)}`);

console.log('\n========================================');
console.log('🧪 C: runEarlyResponses — temporary-unavailable guard + date question');
console.log('========================================\n');

// C1: "не е достапен, од 1 јануари е слободен" — temporarily unavailable with a
// date → captured, NORMAL reply (NOT CLOSED), availability half acknowledged.
const c1 = rentPersuasionSession();
const c1res = runEarlyResponses({ u: 'не е достапен, од 1 јануари е слободен', isRent: true, session: c1 });
assert('C1: NOT closed (date present) — NORMAL reply',
  c1res && c1res.type === 'NORMAL', `got ${JSON.stringify(c1res && c1res.type)}`);
assert('C1: reply mentions the free date',
  c1res && /слободен од 1 јануари/.test(c1res.text || ''), `got text=${JSON.stringify((c1res && c1res.text || '').slice(0, 80))}`);
assert('C1: availableFrom captured in session',
  c1.collectedData.availableFrom === nextJan1, `got ${JSON.stringify(c1.collectedData.availableFrom)}`);
assert('C1: availability acknowledged (half answered with a date)',
  c1.availabilityAcknowledged === true, 'not acknowledged');

// C2: bare "ОД 1 ЈАНУАРИ Е СЛОБОДЕН" (availability-word context) → captured.
const c2 = rentPersuasionSession();
const c2res = runEarlyResponses({ u: 'од 1 јануари е слободен', isRent: true, session: c2 });
assert('C2: date-with-availability-word → NORMAL + captured',
  c2res && c2res.type === 'NORMAL' && c2.collectedData.availableFrom === nextJan1,
  `got type=${c2res && c2res.type}, availableFrom=${JSON.stringify(c2.collectedData.availableFrom)}`);

// C3: "не е достапен" without a date → the DATE QUESTION fires (even when not
// available now), and the awaiting marker is set so a follow-up pure date
// answer is captured.
const c3 = rentPersuasionSession();
const c3res = runEarlyResponses({ u: 'не е достапен', isRent: true, session: c3 });
assert('C3: not available + no date → QUESTION (date question fires)',
  c3res && c3res.type === 'QUESTION' && c3res.nextField === 'availableFrom',
  `got type=${c3res && c3res.type}, next=${c3res && c3res.nextField}`);
assert('C3: awaiting marker set',
  c3.awaitingAvailableFrom === true, 'marker not set');

const c3b = runEarlyResponses({ u: 'od 15ti', isRent: true, session: c3 });
assert('C3b: follow-up pure date answer captured via marker',
  c3b && c3b.type === 'NORMAL' && c3.collectedData.availableFrom === next15,
  `got type=${c3b && c3b.type}, availableFrom=${JSON.stringify(c3.collectedData.availableFrom)}`);
assert('C3b: awaiting marker consumed',
  c3.awaitingAvailableFrom === false, 'marker not cleared');

// C4: "го издадов веќе" (permanent, done) → STILL CLOSED.
const c4 = rentPersuasionSession();
const c4res = runEarlyResponses({ u: 'го издадов веќе', isRent: true, session: c4 });
assert('C4: permanently gone (rent) → CLOSED unchanged',
  c4res && c4res.type === 'CLOSED', `got ${c4res && c4res.type}`);

// C5: SALE — "не е достапен" still CLOSES (the guard is rent-only).
const c5 = rentPersuasionSession(); // same shape; isRent=false flips behavior
const c5res = runEarlyResponses({ u: 'не е достапен', isRent: false, session: c5 });
assert('C5: sale not available → CLOSED (rent-only guard)',
  c5res && c5res.type === 'CLOSED', `got ${c5res && c5res.type}`);

// C6: SALE — "не е достапен, од 1 јануари е слободен" still CLOSES.
const c6 = rentPersuasionSession();
const c6res = runEarlyResponses({ u: 'не е достапен, од 1 јануари е слободен', isRent: false, session: c6 });
assert('C6: sale + date → CLOSED (guard rent-only)',
  c6res && c6res.type === 'CLOSED', `got ${c6res && c6res.type}`);

// C7: phone-context "brojot ne e dostapen" (the PHONE NUMBER isn't reachable)
// → the property-gone CLOSE must NOT fire, and the date branch must NOT fire.
// (The pre-existing phone-origin handler still replies NORMAL — that's a
// separate, pre-existing path; the point here is the gone/date guards.)
const c7 = rentPersuasionSession();
const c7res = runEarlyResponses({ u: 'brojot ne e dostapen', isRent: true, session: c7 });
assert('C7: phone-number unavailable → NOT closed',
  c7res !== null && c7res.type !== 'CLOSED', `got ${JSON.stringify(c7res && c7res.type)}`);
assert('C7: phone-number unavailable → NOT the date question',
  c7res === null || c7res.nextField !== 'availableFrom', `got next=${JSON.stringify(c7res && c7res.nextField)}`);
assert('C7: no availableFrom captured',
  c7.collectedData.availableFrom === undefined, `got ${JSON.stringify(c7.collectedData.availableFrom)}`);

console.log('\n========================================');
console.log('🧪 D: generateResponse — DATA_COLLECTION flow with the date field');
console.log('========================================\n');

// D1: rent data collection — monthlyRent answer advances to availableFrom,
// then the date answer advances to totalSqm.
const d1 = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' } },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38970123456'
};
const d1r1 = await generateResponse(d1, '250 evra');
assert('D1: monthlyRent=250 stored', d1.collectedData.monthlyRent === 250, `got ${JSON.stringify(d1.collectedData.monthlyRent)}`);
assert('D1: next question is availableFrom (rent order)',
  d1r1.type === 'QUESTION' && d1r1.nextField === 'availableFrom',
  `got type=${d1r1.type} next=${d1r1.nextField} "${(d1r1.text || '').slice(0, 60)}"`);

const d1r2 = await generateResponse(d1, 'od 1.6.2026');
assert('D1: availableFrom=2026-06-01 captured (explicit year)',
  d1.collectedData.availableFrom === '2026-06-01', `got ${JSON.stringify(d1.collectedData.availableFrom)}`);
assert('D1: next question is totalSqm',
  d1r2.type === 'QUESTION' && d1r2.nextField === 'totalSqm',
  `got type=${d1r2.type} next=${d1r2.nextField} "${(d1r2.text || '').slice(0, 60)}"`);

// D2: sale control — the sale order is unchanged (no availableFrom question).
const d2 = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale' },
  messages: [{ role: 'model', text: 'Која би била последната чиста цена за станот?' }],
  phone: '+38970123456'
};
const d2r1 = await generateResponse(d2, 'baram 98 iljadi evra');
assert('D2: sale cleanPrice=98000 stored', d2.collectedData.cleanPrice === 98000, `got ${JSON.stringify(d2.collectedData.cleanPrice)}`);
assert('D2: sale next question is totalSqm (sale order unchanged)',
  d2r1.type === 'QUESTION' && d2r1.nextField === 'totalSqm',
  `got type=${d2r1.type} next=${d2r1.nextField}`);
assert('D2: sale never sets availableFrom',
  d2.collectedData.availableFrom === undefined, `got ${JSON.stringify(d2.collectedData.availableFrom)}`);

console.log('\n========================================');
console.log('🧪 E: yearBuilt must never be backfilled from the available-from date');
console.log('========================================\n');

// scanHistoryForField joins ALL owner messages and re-runs the yearBuilt
// extractor — the owner's date answer ("od 1.6.2026") must NOT become the
// construction year, or the yearBuilt question gets silently skipped.
assert('E1: "od 1.6.2026" → no yearBuilt (date year ≠ construction year)',
  parseYearBuilt('od 1.6.2026') === null, `got ${parseYearBuilt('od 1.6.2026')}`);
assert('E2: "15/03/2027" → no yearBuilt',
  parseYearBuilt('15/03/2027') === null, `got ${parseYearBuilt('15/03/2027')}`);
assert('E3: "od 15.09." (day.month, trailing dot) → no yearBuilt',
  parseYearBuilt('od 15.09.') === null, `got ${parseYearBuilt('od 15.09.')}`);
assert('E4: "2015 godina" still extracts 2015 (construction-year answer unaffected)',
  parseYearBuilt('2015 godina') === 2015, `got ${parseYearBuilt('2015 godina')}`);
assert('E5: "2015 godina, renoviran 2020ta" → 2015',
  parseYearBuilt('2015 godina, renoviran 2020ta') === 2015, `got ${parseYearBuilt('2015 godina, renoviran 2020ta')}`);
assert('E6: "izgradena 2015" still extracts 2015',
  parseYearBuilt('izgradena 2015') === 2015, `got ${parseYearBuilt('izgradena 2015')}`);

// E2e regression: a rent flow that answers the available-from date must STILL
// ask the yearBuilt question later (it must not be pre-filled from the date).
{
  const s = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      tenantPreferences: { preferred: [], excluded: [], notes: '' },
      monthlyRent: 500, monthlyRentConfidence: 0.95,
      availableFrom: '2026-06-01', availableFromConfidence: 0.95,
      totalSqm: 55, totalSqmConfidence: 0.95,
      hasTerrace: false, terraceSqm: 0,
      bedrooms: 2, bedroomsConfidence: 0.95,
      floor: 4, floorConfidence: 0.95,
      totalFloors: 10, totalFloorsConfidence: 0.95,
      elevator: true, elevatorConfidence: 0.95,
      heating: 'district', heatingType: 'district',
      ac: true, acConfidence: 0.95,
      parking: true, parkingType: 'garage', parkingConfidence: 0.95,
      orientation: 'jug-istok', orientationConfidence: 0.95,
      furnished: true, furnishedConfidence: 0.95
    },
    messages: [
      { role: 'user', text: 'od 1.6.2026' },   // the availableFrom answer in history
      { role: 'model', text: 'Одлично. Која година е граден?' }
    ],
    phone: '+38970123456'
  };
  const r = await generateResponse(s, '2015 godina');
  // If the date had pre-filled yearBuilt, "2015 godina" could NOT overwrite it
  // (extractors never overwrite) — it would stay 2026. Storing 2015 proves the
  // construction-year question was still asked (not silently skipped).
  assert('E7: date answer did NOT pre-fill yearBuilt (construction year still asked → 2015)',
    s.collectedData.yearBuilt === 2015, `got yearBuilt=${JSON.stringify(s.collectedData.yearBuilt)}`);
  assert('E7: flow advanced past yearBuilt to renovated',
    r.type === 'QUESTION' && r.nextField === 'renovated', `got ${r.type} next=${r.nextField}`);
}

// ------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------
console.log('\n===============================================================');
const summary = harness.summary('📅 AVAILABLE-FROM DATE TEST SUMMARY');
console.log('===============================================================\n');
if (summary.failed > 0) {
  console.log(`🔴 ${summary.failed} TEST(S) FAILED`);
  process.exit(1);
}
console.log('🟢 ALL AVAILABLE-FROM DATE TESTS PASSED');
process.exit(0);
