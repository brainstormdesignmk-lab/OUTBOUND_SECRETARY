// ============================================================
// TEST: Phantom AC + phantom terrace extraction (reported lead 5540516)
// ============================================================
// Reported: during data collection the owner sent a multi-field answer that
// included "KLIMA NEMA AMA ORIENTACIJATA MU E JUG TAKA DA NE TREBA" (no AC —
// it's south-facing so it doesn't need one) and later "ZGRADA OD 80TI"
// (the building is from the 80s). Two wrong extractions were stored:
//
//   1. ac:true  — extractAC matched the bare "klima" keyword and never saw
//      the trailing "nema" (negation-after-noun was not in the false set),
//      so an owner who explicitly said there is NO AC was recorded as having
//      one.
//   2. hasTerrace:true, terraceSqm:80 — extractTerraceNumber's Phase-3
//      fallback has no building/decade context in its hasOtherContext list,
//      so "80ti" fell through to the bare /\d+/ grab → a decade-year answer
//      was stored as an 80 m² terrace.
//
// Fixes: extractAC now checks negation FIRST with both word orders
// ("nema klima" / "klima nema", definite forms, "ne treba" family);
// extractTerraceNumber's Phase-3 other-context list now includes the
// building word ("zgrad") and decade forms ("80ti", "осумдесетти"...) so
// bare decade digits can never be read as a terrace size. Legit bare
// terrace answers ("pet", "5", "15m2") are unaffected.
//
// Fully offline (hardcoded extraction paths).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { runGlobalExtraction } from './data-collector.js';
import { extractTerraceNumber } from './property-extractor.js';

const harness = createHarness();
const assert = harness.assert;

const M1 = 'STO OSUMDESET I PET ILJADI EVRA MU BARAM SO GRAZA ZIDANA, PARNO GRADSKO , KLIMA NEMA AMA ORIENTACIJATA MU E JUG TAKA DA NE TREBA';
const M2 = 'ZGRADA OD 80TI';
const M3 = 'SO LIFT';
const M4 = 'PRAZEN ODI';

// ============================================================
// PART A: extractAC (unit)
// ============================================================
console.log('\n=== A: AC extraction ===');

let r = runGlobalExtraction(M1, { transactionType: 'sale' }, undefined);
assert('A1: "KLIMA NEMA ... TAKA DA NE TREBA" → ac:false (was true)', r.ac === false, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('inverter klima', {}, undefined);
assert('A2: "inverter klima" → ac:true (positive still works)', r.ac === true, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('nema klima', {}, undefined);
assert('A3: "nema klima" → ac:false', r.ac === false, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('klimata nema', {}, undefined);
assert('A4: "klimata nema" (definite form) → ac:false', r.ac === false, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('ne treba klima, ima dobra ventilacija', {}, undefined);
assert('A5: "ne treba klima" → ac:false', r.ac === false, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('klimata ne treba, jug e', {}, undefined);
assert('A6: "klimata ne treba" → ac:false', r.ac === false, `got ${JSON.stringify(r.ac)}`);

r = runGlobalExtraction('nema potreba od klima, ima odlicna ventilacija', {}, undefined);
assert('A7: "nema potreba od klima" → ac:false', r.ac === false, `got ${JSON.stringify(r.ac)}`);

// ============================================================
// PART B: extractTerraceNumber (unit)
// ============================================================
console.log('\n=== B: terrace number extraction ===');

assert('B1: "ZGRADA OD 80TI" → null (building year, NOT a terrace)',
  extractTerraceNumber('ZGRADA OD 80TI') === null,
  `got ${extractTerraceNumber('ZGRADA OD 80TI')}`);

assert('B2: bare "80ti" → null (decade year, NOT a terrace)',
  extractTerraceNumber('80ti') === null,
  `got ${extractTerraceNumber('80ti')}`);

assert('B3: "осумдесетти" → null (word decade)',
  extractTerraceNumber('осумдесетти') === null,
  `got ${extractTerraceNumber('осумдесетти')}`);

assert('B4: bare "pet" → 5 (legit follow-up answer unaffected)',
  extractTerraceNumber('pet') === 5, `got ${extractTerraceNumber('pet')}`);

assert('B5: bare "5" → 5', extractTerraceNumber('5') === 5, `got ${extractTerraceNumber('5')}`);

assert('B6: "15m2" → 15', extractTerraceNumber('15m2') === 15, `got ${extractTerraceNumber('15m2')}`);

assert('B7: "terasa 4" → 4 (terrace-word path unaffected)',
  extractTerraceNumber('terasa 4') === 4, `got ${extractTerraceNumber('terasa 4')}`);

// ============================================================
// PART C: e2e — the exact reported 4-message sequence
// ============================================================
console.log('\n=== C: e2e lead 5540516 sequence ===');

{
  const s = {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'sale' },
    messages: [{ role: 'model', text: 'Која би била последната чиста цена за станот?' }],
    phone: '+38970123456'
  };

  await generateResponse(s, M1);
  assert('C1: cleanPrice=185000', s.collectedData.cleanPrice === 185000, `got ${JSON.stringify(s.collectedData.cleanPrice)}`);
  assert('C1: ac:false (owner said no AC)', s.collectedData.ac === false, `got ${JSON.stringify(s.collectedData.ac)}`);
  assert('C1: heating=district (parno gradsko)', s.collectedData.heating === 'district', `got ${JSON.stringify(s.collectedData.heating)}`);
  assert('C1: orientation=jug', s.collectedData.orientation === 'jug', `got ${JSON.stringify(s.collectedData.orientation)}`);
  assert('C1: parking=true (graza zidana)', s.collectedData.parking === true, `got ${JSON.stringify(s.collectedData.parking)}`);

  await generateResponse(s, M2);
  assert('C2: yearBuilt=1985 (80ti → decade)', s.collectedData.yearBuilt === 1985, `got ${JSON.stringify(s.collectedData.yearBuilt)}`);
  assert('C2: NO phantom terrace — hasTerrace undefined', s.collectedData.hasTerrace === undefined, `got ${JSON.stringify(s.collectedData.hasTerrace)}`);
  assert('C2: NO phantom terrace — terraceSqm undefined (was 80)', s.collectedData.terraceSqm === undefined, `got ${JSON.stringify(s.collectedData.terraceSqm)}`);

  await generateResponse(s, M3);
  assert('C3: elevator=true (so lift)', s.collectedData.elevator === true, `got ${JSON.stringify(s.collectedData.elevator)}`);

  await generateResponse(s, M4);
  assert('C4: furnished=false (prazen)', s.collectedData.furnished === false, `got ${JSON.stringify(s.collectedData.furnished)}`);
}

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 PHANTOM-AC-TERRACE TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 PHANTOM-AC-TERRACE TESTS PASSED');
}
