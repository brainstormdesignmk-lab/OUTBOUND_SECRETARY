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
// Relative-date helpers — mirror _addDays/_addMonths (local-time getters +
// clamping to the target month's last day).
function fromTodayDays(n) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function fromTodayMonths(n) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetMonth = base.getMonth() + n;
  const lastDay = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  const d = new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDay));
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

// --- IMMEDIATE VOCABULARY EXTENSION (reported): "sloboden momentalno" was
// NOT registered even after the second attempt — the missing immediate words
// from the Macedonian vocabulary (momentalno, instant, za brzo, veke e
// sloboden).
assert('A28: "sloboden momentalno" → immediate (reported re-ask loop)',
  parseAvailableFromDate('sloboden momentalno') === 'immediate', `got ${parseAvailableFromDate('sloboden momentalno')}`);
assert('A29: "моментално" → immediate', parseAvailableFromDate('моментално') === 'immediate', `got ${parseAvailableFromDate('моментално')}`);
assert('A30: "instant" → immediate', parseAvailableFromDate('instant') === 'immediate', `got ${parseAvailableFromDate('instant')}`);
assert('A31: "za brzo" → immediate', parseAvailableFromDate('za brzo') === 'immediate', `got ${parseAvailableFromDate('za brzo')}`);
assert('A32: "veke e sloboden" → immediate', parseAvailableFromDate('veke e sloboden') === 'immediate', `got ${parseAvailableFromDate('veke e sloboden')}`);

// --- RELATIVE DATES (reported): "od utre" (tomorrow), "zadutre" (day after
// tomorrow), "za mesec dena" (in a month), "za dve nedeli" (in two weeks)
// and the other variations.
assert('A33: "od utre" → tomorrow', parseAvailableFromDate('od utre') === fromTodayDays(1), `got ${parseAvailableFromDate('od utre')}, want ${fromTodayDays(1)}`);
assert('A34: "zadutre" → day after tomorrow', parseAvailableFromDate('zadutre') === fromTodayDays(2), `got ${parseAvailableFromDate('zadutre')}, want ${fromTodayDays(2)}`);
assert('A35: "прекосутра" → day after tomorrow', parseAvailableFromDate('прекосутра') === fromTodayDays(2), `got ${parseAvailableFromDate('прекосутра')}`);
assert('A36: "za mesec dena" → +1 month', parseAvailableFromDate('za mesec dena') === fromTodayMonths(1), `got ${parseAvailableFromDate('za mesec dena')}, want ${fromTodayMonths(1)}`);
assert('A37: "za eden mesec" → +1 month', parseAvailableFromDate('za eden mesec') === fromTodayMonths(1), `got ${parseAvailableFromDate('za eden mesec')}`);
assert('A38: "за два месеца" → +2 months', parseAvailableFromDate('за два месеца') === fromTodayMonths(2), `got ${parseAvailableFromDate('за два месеца')}`);
assert('A39: "za edna nedela" → +1 week', parseAvailableFromDate('za edna nedela') === fromTodayDays(7), `got ${parseAvailableFromDate('za edna nedela')}`);
assert('A40: "za dve nedeli" → +2 weeks', parseAvailableFromDate('za dve nedeli') === fromTodayDays(14), `got ${parseAvailableFromDate('za dve nedeli')}, want ${fromTodayDays(14)}`);
assert('A41: "за три недели" → +3 weeks', parseAvailableFromDate('за три недели') === fromTodayDays(21), `got ${parseAvailableFromDate('за три недели')}`);
assert('A42: "slednata nedela" → +1 week', parseAvailableFromDate('slednata nedela') === fromTodayDays(7), `got ${parseAvailableFromDate('slednata nedela')}`);
assert('A43: "za nedela dena" → +1 week', parseAvailableFromDate('za nedela dena') === fromTodayDays(7), `got ${parseAvailableFromDate('za nedela dena')}`);
assert('A44: "за година дена" → +1 year', parseAvailableFromDate('за година дена') === fromTodayMonths(12), `got ${parseAvailableFromDate('за година дена')}`);
// Bare "nedela" (недела = Sunday, ambiguous with week) must NOT fire.
assert('A45: bare "недела" → null (Sunday/week ambiguity)',
  parseAvailableFromDate('недела') === null, `got ${parseAvailableFromDate('недела')}`);

// --- NEGATION GUARD (reviewer finding): "моментално НЕ е слободен" says NOT
// free now — must NOT be immediate; a following date still wins, and a bare
// negation stays null (the date question re-asks).
assert('A46: "моментално не е слободен, од 1 јуни ќе биде" → June 1, NOT immediate (negation guard)',
  parseAvailableFromDate('моментално не е слободен, од 1 јуни ќе биде') === nextMonthDay(6, 1),
  `got ${parseAvailableFromDate('моментално не е слободен, од 1 јуни ќе биде')}`);
assert('A47: "не е слободен моментно" → null (negated now — re-ask, not immediate)',
  parseAvailableFromDate('не е слободен моментно') === null, `got ${parseAvailableFromDate('не е слободен моментно')}`);
assert('A48: "моментално е зафатен" → null (occupied now — not immediate)',
  parseAvailableFromDate('моментално е зафатен') === null, `got ${parseAvailableFromDate('моментално е зафатен')}`);
assert('A49: "sega ne e dostapen, za dve nedeli ke bide" → +14 days (negated now, relative future wins)',
  parseAvailableFromDate('sega ne e dostapen, za dve nedeli ke bide') === fromTodayDays(14),
  `got ${parseAvailableFromDate('sega ne e dostapen, za dve nedeli ke bide')}`);

// --- GENERIC DAY-COUNT RULES (reported): "ZA DVA DENA" (in 2 days) had NO
// rule at all — only month/week/year specifics — so the answer was never
// registered and Ana re-asked until the 4-attempt skip. "za N dena" with
// digit OR word number, singular/plural (den/dena/denovi).
assert('A50: "ZA DVA DENA" → +2 days (generic day count, reported re-ask loop)',
  parseAvailableFromDate('ZA DVA DENA') === fromTodayDays(2), `got ${parseAvailableFromDate('ZA DVA DENA')}`);
assert('A50b: "за три дена" → +3 days (Cyrillic)',
  parseAvailableFromDate('за три дена') === fromTodayDays(3), `got ${parseAvailableFromDate('за три дена')}`);
assert('A50c: "za 5 dena" → +5 days (digit)',
  parseAvailableFromDate('za 5 dena') === fromTodayDays(5), `got ${parseAvailableFromDate('za 5 dena')}`);
assert('A50d: "za eden den" → +1 day (singular)',
  parseAvailableFromDate('za eden den') === fromTodayDays(1), `got ${parseAvailableFromDate('za eden den')}`);
assert('A50e: "za deset denovi" → +10 days (denovi plural)',
  parseAvailableFromDate('za deset denovi') === fromTodayDays(10), `got ${parseAvailableFromDate('za deset denovi')}`);
assert('A50f: "za petnaeset dena" → +15 days (compound word number)',
  parseAvailableFromDate('za petnaeset dena') === fromTodayDays(15), `got ${parseAvailableFromDate('za petnaeset dena')}`);
assert('A50g: "za dvaeset dena" → +20 days',
  parseAvailableFromDate('za dvaeset dena') === fromTodayDays(20), `got ${parseAvailableFromDate('za dvaeset dena')}`);
// CONTROL: a bare "dva dena" without "za" is NOT a date answer (no marker)
assert('A50h: "dva dena" alone → null (no za/за marker)',
  parseAvailableFromDate('dva dena') === null, `got ${parseAvailableFromDate('dva dena')}`);

// --- DAY-COUNT RANGE (reported): "ZA DVA TRI DENA" (in 2-3 days) — memorize
// the LOWER bound (the earliest the property can be free). "tri cetiri" → 3.
// Same for weeks/months; digit and word numbers, space/hyphen separators.
assert('A51: "ZA DVA TRI DENA" → +2 days (LOWER bound, reported)',
  parseAvailableFromDate('ZA DVA TRI DENA') === fromTodayDays(2), `got ${parseAvailableFromDate('ZA DVA TRI DENA')}`);
assert('A51b: "за три четири дена" → +3 days (lower bound, Cyrillic)',
  parseAvailableFromDate('за три четири дена') === fromTodayDays(3), `got ${parseAvailableFromDate('за три четири дена')}`);
assert('A51c: "za 2 3 dena" → +2 days (digit range, space)',
  parseAvailableFromDate('za 2 3 dena') === fromTodayDays(2), `got ${parseAvailableFromDate('za 2 3 dena')}`);
assert('A51d: "za 4-5 dena" → +4 days (hyphen range)',
  parseAvailableFromDate('za 4-5 dena') === fromTodayDays(4), `got ${parseAvailableFromDate('za 4-5 dena')}`);
assert('A51e: "za dve tri nedeli" → +14 days (week range lower bound)',
  parseAvailableFromDate('za dve tri nedeli') === fromTodayDays(14), `got ${parseAvailableFromDate('za dve tri nedeli')}`);
assert('A51f: "за два три месеца" → +2 months (month range lower bound)',
  parseAvailableFromDate('за два три месеца') === fromTodayMonths(2), `got ${parseAvailableFromDate('за два три месеца')}`);
// CONTROL: single-number month/week rules are untouched (specific beats range)
assert('A51g: "za dve nedeli" still → +14 days (single-week rule)',
  parseAvailableFromDate('za dve nedeli') === fromTodayDays(14), `got ${parseAvailableFromDate('za dve nedeli')}`);
assert('A51h: "za mesec dena" still → +1 month (month rule)',
  parseAvailableFromDate('za mesec dena') === fromTodayMonths(1), `got ${parseAvailableFromDate('za mesec dena')}`);

// --- US-STYLE MONTH.DAY DATES (reported): "OD 7.15.2026" = July 15, 2026 —
// the owner types the American month.day order. Only fires when day.month is
// impossible (second number > 12, so "7.15" can't be day 7 month 15).
// Separators: dot/slash/dash/space, with or without the od/од marker when a
// year is present.
assert('A52: "OD 7.15.2026" → 2026-07-15 (US month.day, reported)',
  parseAvailableFromDate('OD 7.15.2026') === '2026-07-15', `got ${parseAvailableFromDate('OD 7.15.2026')}`);
assert('A52b: "7.15.2026" (bare, no od) → 2026-07-15',
  parseAvailableFromDate('7.15.2026') === '2026-07-15', `got ${parseAvailableFromDate('7.15.2026')}`);
assert('A52c: "07 15 2026" (space separators) → 2026-07-15',
  parseAvailableFromDate('07 15 2026') === '2026-07-15', `got ${parseAvailableFromDate('07 15 2026')}`);
assert('A52d: "od 7 15 2026" → 2026-07-15 (od + spaces)',
  parseAvailableFromDate('od 7 15 2026') === '2026-07-15', `got ${parseAvailableFromDate('od 7 15 2026')}`);
assert('A52e: "od 07.15.2026" → 2026-07-15 (leading-zero month)',
  parseAvailableFromDate('od 07.15.2026') === '2026-07-15', `got ${parseAvailableFromDate('od 07.15.2026')}`);
assert('A52f: "od 7/15/2026" → 2026-07-15 (slash)',
  parseAvailableFromDate('od 7/15/2026') === '2026-07-15', `got ${parseAvailableFromDate('od 7/15/2026')}`);
assert('A52g: "od 7-15-2026" → 2026-07-15 (dash)',
  parseAvailableFromDate('od 7-15-2026') === '2026-07-15', `got ${parseAvailableFromDate('od 7-15-2026')}`);
// CONTROL: Macedonian day.month stays day.month when both valid
assert('A52h: "od 1.6.2026" still → 2026-06-01 (day.month wins when valid)',
  parseAvailableFromDate('od 1.6.2026') === '2026-06-01', `got ${parseAvailableFromDate('od 1.6.2026')}`);
assert('A52i: "od 15.09." → next Sep 15 (day.month roll-forward unchanged)',
  parseAvailableFromDate('od 15.09.') === nextMonthDay(9, 15), `got ${parseAvailableFromDate('od 15.09.')}`);

// --- BARE US-STYLE MONTH.DAY WITHOUT YEAR/od (reported variants "7 15",
// "07.15", "07 15"): only fires when the second number > 12, making the
// month.day reading unambiguous (month 15 can't be a Macedonian month).
assert('A53: "7 15" (bare, no year, space) → next Jul 15',
  parseAvailableFromDate('7 15') === nextMonthDay(7, 15), `got ${parseAvailableFromDate('7 15')}`);
assert('A53b: "07.15" (bare, no year, dot) → next Jul 15',
  parseAvailableFromDate('07.15') === nextMonthDay(7, 15), `got ${parseAvailableFromDate('07.15')}`);
assert('A53c: "07 15" (bare, no year) → next Jul 15',
  parseAvailableFromDate('07 15') === nextMonthDay(7, 15), `got ${parseAvailableFromDate('07 15')}`);
assert('A53d: "12.31" (bare) → next Dec 31',
  parseAvailableFromDate('12.31') === nextMonthDay(12, 31), `got ${parseAvailableFromDate('12.31')}`);
// CONTROLS: ambiguous both-≤-12 stays day.month-null (no marker to pin it);
// the compound-FLOOR slash form stays null (A17 "8/10" → null); and
// unit-bound forms stay null (terrace m2, price evra).
assert('A53e: "3.5" (both ≤ 12, no marker) → null (ambiguous, no od)',
  parseAvailableFromDate('3.5') === null, `got ${parseAvailableFromDate('3.5')}`);
assert('A53f: "5/15" (slash — compound floor, not a date) → null',
  parseAvailableFromDate('5/15') === null, `got ${parseAvailableFromDate('5/15')}`);
assert('A53g: "7.15 m2" (terrace size) → null',
  parseAvailableFromDate('7.15 m2') === null, `got ${parseAvailableFromDate('7.15 m2')}`);
assert('A53h: "7.15 evra" (price) → null',
  parseAvailableFromDate('7.15 evra') === null, `got ${parseAvailableFromDate('7.15 evra')}`);
assert('A53i: "7.15 2026" (no od, no leading 0, year present) → 2026-07-15',
  parseAvailableFromDate('7.15 2026') === '2026-07-15', `got ${parseAvailableFromDate('7.15 2026')}`);

// --- BARE-brzo FALSE-POSITIVE GUARD (reviewer finding): "ke ti odgovoram
// brzo" (I'll reply quickly) is NOT an availability answer — only the "za
// brzo" phrase the user asked for may fire.
assert('A50: "ke ti odgovoram brzo" → null (bare brzo excluded — not availability)',
  parseAvailableFromDate('ke ti odgovoram brzo') === null, `got ${parseAvailableFromDate('ke ti odgovoram brzo')}`);
assert('A51: "ke vi ispratam sliki brzo" → null',
  parseAvailableFromDate('ke vi ispratam sliki brzo') === null, `got ${parseAvailableFromDate('ke vi ispratam sliki brzo')}`);
assert('A52: "sloboden ke bide za brzo" → immediate (the za-brzo phrase still fires)',
  parseAvailableFromDate('sloboden ke bide za brzo') === 'immediate', `got ${parseAvailableFromDate('sloboden ke bide za brzo')}`);

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

// D3: e2e regression — the reported "sloboden momentalno" must be captured
// on the FIRST attempt (no re-ask loop): monthlyRent → availableFrom question
// → "sloboden momentalno" → availableFrom=immediate → advances to totalSqm.
{
  const d3 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    // NOTE: tenantPreferences deliberately NOT pre-seeded — the real rent
    // order is monthlyRent → availableFrom → tenantPreferences, so the
    // "advances" assert below checks the true next field (mirrors
    // sim-rent-conversation.js; the D1 fixture above pre-seeds it and skips
    // the tenant question by design).
    collectedData: { cooperationAccepted: true, transactionType: 'rent' },
    messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
    phone: '+38970123457'
  };
  const d3r1 = await generateResponse(d3, '260 evra');
  assert('D3: monthlyRent=260 stored', d3.collectedData.monthlyRent === 260, `got ${JSON.stringify(d3.collectedData.monthlyRent)}`);
  assert('D3: next question is availableFrom (rent order)',
    d3r1.type === 'QUESTION' && d3r1.nextField === 'availableFrom',
    `got type=${d3r1.type} next=${d3r1.nextField}`);

  const d3r2 = await generateResponse(d3, 'sloboden momentalno');
  assert('D3: "sloboden momentalno" captured on FIRST attempt (reported re-ask loop fixed)',
    d3.collectedData.availableFrom === 'immediate',
    `got ${JSON.stringify(d3.collectedData.availableFrom)}`);
  assert('D3: no re-ask — advances to tenantPreferences (rent order)',
    d3r2.type === 'QUESTION' && d3r2.nextField === 'tenantPreferences',
    `got type=${d3r2.type} next=${d3r2.nextField} "${(d3r2.text || '').slice(0, 60)}"`);
}

// D4: e2e regression — "za dve nedeli" (in two weeks) computes a real date.
{
  const d4 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent' },
    messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
    phone: '+38970123458'
  };
  await generateResponse(d4, '260 evra');
  const d4r2 = await generateResponse(d4, 'ke bide sloboden za dve nedeli');
  assert('D4: "za dve nedeli" → +14 days computed',
    d4.collectedData.availableFrom === fromTodayDays(14),
    `got ${JSON.stringify(d4.collectedData.availableFrom)}, want ${fromTodayDays(14)}`);
  assert('D4: advances to tenantPreferences',
    d4r2.type === 'QUESTION' && d4r2.nextField === 'tenantPreferences',
    `got type=${d4r2.type} next=${d4r2.nextField}`);
}

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
