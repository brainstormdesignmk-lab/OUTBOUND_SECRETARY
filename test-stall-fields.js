// ============================================================
// TEST: STALL-FIELD EXTRACTION THICKENING (totalSqm, floor, yearBuilt, docs)
// ============================================================
// The four fields that historically stall (asked twice → SKIPPED with
// null): real owner answers that no extractor caught. Each gap below is a
// reported/observed phrasing that used to die at the 2-attempt skip:
//
//   1. totalSqm  — APPROXIMATE "-тина" suffix: "60тина квадрати",
//                  "60-тина квадрати" (≈60 m²). The suffix between the
//                  digit and the sqm keyword broke the pattern.
//   2. floor     — BASEMENT/SOUTERRAIN: "во подрум", "сутерен е" — real
//                  floor answers (mapped to 0, like приземје).
//   3. yearBuilt — AGE-BASED answer: "пред 5 години" / "pred pet godini"
//                  (the building is N years old) — parseYearBuilt only
//                  knew explicit years. Guarded so "go kupiv pred 3
//                  godini" (I BOUGHT it 3 years ago) is never crowned.
//   4. docs      — "средена документација" / "се е средено" /
//                  "dokumentacijata e sredena" — the arranged-docs idiom
//                  family (positive) + "не е средена" (negative) that the
//                  documentation extractor and bare-yes map missed.
//
// Fully offline: extraction is pure code (no LLM).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { runGlobalExtraction } from './data-collector.js';
import { parseOrdinalFloor } from './property-extractor.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A: totalSqm — approximate "-тина" suffix
// ============================================================
console.log('\n=== A: totalSqm "-тина" approximation ===');

for (const [msg, expected] of [
  ['60тина квадрати', 60],
  ['60-тина квадрати', 60],
  ['околу 60тина квадрати', 60],
  ['има 85тина м2', 85]
]) {
  const r = runGlobalExtraction(msg, {}, 'totalSqm');
  assert(`totalSqm "${msg}" → ${expected}`, r.totalSqm === expected, `got ${JSON.stringify(r)}`);
}

// Plain digit answers still work (no regression)
assert('totalSqm "65 квадрати" → 65 (unchanged)', runGlobalExtraction('65 квадрати', {}, 'totalSqm').totalSqm === 65);

// ============================================================
// PART B: floor — сутерен / подрум
// ============================================================
console.log('\n=== B: floor сутерен / подрум ===');

assert('parseOrdinalFloor("во сутерен") → 0', parseOrdinalFloor('во сутерен') === 0);
assert('parseOrdinalFloor("podrum e") → 0', parseOrdinalFloor('podrum e') === 0);
assert('parseOrdinalFloor("на втор кат") → 2 (unchanged)', parseOrdinalFloor('на втор кат') === 2);
assert('parseOrdinalFloor("na prizemje") → 0 (unchanged)', parseOrdinalFloor('na prizemje') === 0);

const floorSuteren = runGlobalExtraction('vo suteren', {}, 'floor');
assert('extractFloor "vo suteren" → floor 0', floorSuteren.floor === 0, `got ${JSON.stringify(floorSuteren)}`);
const floorPodrum = runGlobalExtraction('во подрум', {}, 'floor');
assert('extractFloor "во подрум" → floor 0', floorPodrum.floor === 0, `got ${JSON.stringify(floorPodrum)}`);

// ============================================================
// PART C: yearBuilt — age-based answers
// ============================================================
console.log('\n=== C: yearBuilt "пред N години" age answers ===');

const currentYear = new Date().getFullYear();

for (const msg of ['пред 5 години', 'PRED 5 GODINI', 'изграден пред 5 години', 'граден е пред 5 години']) {
  const r = runGlobalExtraction(msg, {}, 'yearBuilt');
  assert(`yearBuilt "${msg}" → ${currentYear - 5}`, r.yearBuilt === currentYear - 5, `got ${JSON.stringify(r)}`);
}

// word-number age: "пред пет години"
const wordAge = runGlobalExtraction('пред пет години', {}, 'yearBuilt');
assert('yearBuilt "пред пет години" → currentYear − 5', wordAge.yearBuilt === currentYear - 5, `got ${JSON.stringify(wordAge)}`);

// GUARD: a purchase/ownership answer is NOT the construction year
const purchase = runGlobalExtraction('go kupiv pred 3 godini', {}, 'yearBuilt');
assert('yearBuilt "go kupiv pred 3 godini" → NOT crowned (bought ≠ built)', purchase.yearBuilt === undefined, `got ${JSON.stringify(purchase)}`);

// explicit years still win (no regression)
const explicit = runGlobalExtraction('izgradena 2015 godina', {}, 'yearBuilt');
assert('yearBuilt "izgradena 2015 godina" → 2015 (unchanged)', explicit.yearBuilt === 2015, `got ${JSON.stringify(explicit)}`);

// ============================================================
// PART D: documentationClean — "средена" idiom family
// ============================================================
console.log('\n=== D: documentationClean "средена" idioms ===');

for (const msg of [
  'sredena dokumentacija',
  'средена документација',
  'dokumentacijata e sredena',
  'документацијата е средена',
  'dokumentite se sredeni',
  'документите се средени',
  'se e sredeno so dokumentite',
  'се е средено со документите',
  'SE E SREDENO',
  'се е средено'
]) {
  const r = runGlobalExtraction(msg, {}, 'documentationClean');
  assert(`documentationClean "${msg}" → true`, r.documentationClean === true, `got ${JSON.stringify(r)}`);
}

// NEGATIVE mirror
for (const msg of ['ne e sredena', 'не е средена', 'ne se sredeni dokumentite', 'нема средена документација']) {
  const r = runGlobalExtraction(msg, {}, 'documentationClean');
  assert(`documentationClean "${msg}" → false`, r.documentationClean === false, `got ${JSON.stringify(r)}`);
}

// Guard: "sredena" is never a bare positive in GLOBAL discovery (no
// preferredField) — the compound-phrase-only rule holds
const globalSredena = runGlobalExtraction('sredena', {});
assert('documentationClean bare "sredena" (global) → NOT set (compound-only)', globalSredena.documentationClean === undefined, `got ${JSON.stringify(globalSredena)}`);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 STALL-FIELDS TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 STALL-FIELDS TESTS PASSED');
}
