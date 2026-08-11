// ============================================================
// test-viber-ordinal-floors.js — Viber ordinal-suffix floors
// (reported, lead pz186272900): "THE WHOLE NUMBERS BATCH"
// ============================================================
// Reported (production log, lead pz186272900):
//
//   ANA: ...На кој кат се наоѓа станот?
//   OWNER: 5TI OD 13                → NOTHING collected ❌ (floor AND
//                                     totalFloors lost; re-ask loop)
//   OWNER: 5TI / 13TI / 7MI / 1VI   → NOTHING collected ❌
//
// Viber owners type digit+ordinal-suffix shorthand for floors:
//   5TI = 5-ти (5th), 1VI = 1-ви, 2RI = 2-ри, 7MI = 7-ми, 13TI = 13-ти...
// Root causes fixed:
//   A) extractCompoundFloor Pattern 2 parsed the floor word only as a word
//      ordinal or a PURE digit — "5ti" is neither → compound never fired
//      → floor=5 AND totalFloors=13 both lost.
//   B) extractFloor had no bare suffixed-ordinal path → "5TI"/"13TI"/"7MI"
//      answered the floor question with nothing → re-ask loop.
//   C) (bonus) countBedrooms read the "5" of "5TI OD 13" as bedrooms=5
//      phantom via extractFirstNumber.
//   D) (bonus) spaced "5 TI OD 13" — Viber owners also space the suffix.
//
// Guard invariants pinned by this suite:
//   - A bare suffixed ordinal ("9TI") is a FLOOR answer only — it must NEVER
//     fabricate totalFloors=9 (a suffixed ordinal is ordinal, not a total).
//   - Total-floors context ("zgradata ima 13 sprata") still wins over floor.
//
// Runs fully offline — the DATA_COLLECTION phase never calls the LLM.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { runGlobalExtraction, assessConfidence } from './data-collector.js';
import { countBedrooms } from './property-extractor.js';
import { generateResponse } from './service.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — compound "5TI OD 13" → floor 5 AND totalFloors 13
// ============================================================
console.log('\n========================================');
console.log('🧪 A: "5TI OD 13" → floor=5 AND totalFloors=13');
console.log('========================================\n');

// The exact reported input
let result = runGlobalExtraction('5TI OD 13', {}, 'floor');
assert('A1: floor=5 extracted (viber ordinal suffix "5TI")', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert('A2: totalFloors=13 extracted (compound total)', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// Lowercase variant
result = runGlobalExtraction('5ti od 13', {}, 'floor');
assert('A3: lowercase "5ti od 13" → floor=5', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert('A4: lowercase "5ti od 13" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// "na" prefix
result = runGlobalExtraction('NA 5TI OD 13', {}, 'floor');
assert('A5: "NA 5TI OD 13" → floor=5', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert('A6: "NA 5TI OD 13" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// Spaced suffix (Viber owners also type "5 TI")
result = runGlobalExtraction('5 ti od 13', {}, 'floor');
assert('A7: spaced "5 ti od 13" → floor=5 (suffix normalization)', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert('A8: spaced "5 ti od 13" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// Suffixed total too
result = runGlobalExtraction('5TI OD 13TI', {}, 'floor');
assert('A9: "5TI OD 13TI" → floor=5 (suffixed total handled)', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert('A10: "5TI OD 13TI" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// vkupno total
result = runGlobalExtraction('5TI OD vkupno 13', {}, 'floor');
assert('A11: "5TI OD vkupno 13" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);

// ============================================================
// PART B — bare viber ordinals: THE WHOLE NUMBERS BATCH
// ============================================================
console.log('\n========================================');
console.log('🧪 B: bare "5TI" / "13TI" / "7MI" / "1VI" / "2RI" → floor only');
console.log('========================================\n');

const bareBatch = [
  ['1VI', 1], ['2RI', 2], ['3TI', 3], ['4TI', 4], ['5TI', 5], ['6TI', 6],
  ['7MI', 7], ['8MI', 8], ['9TI', 9], ['10TI', 10], ['13TI', 13], ['18TI', 18], ['20TI', 20]
];
for (const [msg, expected] of bareBatch) {
  const r = runGlobalExtraction(msg, {}, 'floor');
  assert(`B: "${msg}" → floor=${expected}`, r.floor === expected, `got ${JSON.stringify(r.floor)}`);
  // CRITICAL: a bare suffixed ordinal is a FLOOR answer — it must NEVER
  // fabricate totalFloors (the "5th floor" is not "the building has 5
  // floors"). This was the bug in an early fix attempt.
  assert(`B: "${msg}" → NO phantom totalFloors`, r.totalFloors === undefined, `got totalFloors=${JSON.stringify(r.totalFloors)}`);
}

// "na" prefix + spaced + annoyed repeat
result = runGlobalExtraction('NA 5TI', {}, 'floor');
assert('B2: "NA 5TI" → floor=5', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
result = runGlobalExtraction('5 TI', {}, 'floor');
assert('B3: "5 TI" → floor=5 (spaced bare)', result.floor === 5, `got ${JSON.stringify(result.floor)}`);
result = runGlobalExtraction('5TI KAZAV', {}, 'floor');
assert('B4: "5TI KAZAV" → floor=5 (annoyed repeat)', result.floor === 5, `got ${JSON.stringify(result.floor)}`);

// Confidence: bare viber ordinal is a DIRECT floor answer — HIGH, no re-ask
assert('B5: "5TI" floor confidence HIGH', assessConfidence('floor', 5, '5TI') === 'HIGH', `got ${assessConfidence('floor', 5, '5TI')}`);
assert('B6: "13TI" floor confidence HIGH', assessConfidence('floor', 13, '13TI') === 'HIGH', `got ${assessConfidence('floor', 13, '13TI')}`);
assert('B7: "NA 5TI" floor confidence HIGH', assessConfidence('floor', 5, 'NA 5TI') === 'HIGH', `got ${assessConfidence('floor', 5, 'NA 5TI')}`);
assert('B8: "5TI KAZAV" floor confidence HIGH', assessConfidence('floor', 5, '5TI KAZAV') === 'HIGH', `got ${assessConfidence('floor', 5, '5TI KAZAV')}`);

// ============================================================
// PART C — countBedrooms phantom guard
// ============================================================
console.log('\n========================================');
console.log('🧪 C: countBedrooms must NOT grab "5" from "5TI OD 13"');
console.log('========================================\n');

assert('C1: countBedrooms("5TI OD 13") → null (compound floor, not bedrooms=5)', countBedrooms('5TI OD 13') === null, `got ${countBedrooms('5TI OD 13')}`);
assert('C2: countBedrooms("5TI") → null (bare ordinal floor)', countBedrooms('5TI') === null, `got ${countBedrooms('5TI')}`);
assert('C3: countBedrooms("13TI") → null (bare ordinal floor)', countBedrooms('13TI') === null, `got ${countBedrooms('13TI')}`);
assert('C4: countBedrooms("NA 5TI OD 13") → null', countBedrooms('NA 5TI OD 13') === null, `got ${countBedrooms('NA 5TI OD 13')}`);
assert('C5: countBedrooms("5 ti od 13") → null (spaced)', countBedrooms('5 ti od 13') === null, `got ${countBedrooms('5 ti od 13')}`);
assert('C6: countBedrooms("dve sobi") → 2 (real answers unaffected)', countBedrooms('dve sobi') === 2, `got ${countBedrooms('dve sobi')}`);
assert('C7: countBedrooms("tri") → 3 (real answers unaffected)', countBedrooms('tri') === 3, `got ${countBedrooms('tri')}`);

// ============================================================
// PART D — total-floors context guard
// ============================================================
console.log('\n========================================');
console.log('🧪 D: "zgradata ima 13 sprata" is a TOTAL, never a floor');
console.log('========================================\n');

result = runGlobalExtraction('zgradata ima 13 sprata', {}, 'floor');
assert('D1: "zgradata ima 13 sprata" → totalFloors=13', result.totalFloors === 13, `got ${JSON.stringify(result.totalFloors)}`);
assert('D2: "zgradata ima 13 sprata" → NO floor (13 is the total)', result.floor === undefined, `got floor=${JSON.stringify(result.floor)}`);

// Suffixed in total context ("ima 13TI sprata" — rare, but must not set floor=13)
result = runGlobalExtraction('ima 13TI sprata', {}, 'floor');
assert('D3: "ima 13TI sprata" → NO floor (total-floors context wins)', result.floor === undefined, `got floor=${JSON.stringify(result.floor)}`);

// DECADE INTERPLAY (reviewer): "90TI"/"80TI" are yearBuilt DECADES (90ti →
// 1995), never floors. The 0..50 range cap in parseViberOrdinalSuffix and the
// extractFloor block rejects 90 — pinned here so a future range widening can't
// silently turn "90TI" into floor=90 when the yearBuilt question is active.
result = runGlobalExtraction('90TI', {}, 'floor');
assert('D4: "90TI" → NO floor (90 > 50 range cap)', result.floor === undefined, `got floor=${JSON.stringify(result.floor)}`);
assert('D5: yearBuilt "90TI" stays HIGH (decade answer, not floor)', assessConfidence('yearBuilt', 1995, '90TI') === 'HIGH', `got ${assessConfidence('yearBuilt', 1995, '90TI')}`);

// ============================================================
// PART E — full generateResponse flow
// ============================================================
console.log('\n========================================');
console.log('🧪 E: full flow — "5TI OD 13" stores both fields, "5TI" stores floor only');
console.log('========================================\n');

function makeSession(extra = {}) {
  return {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      tenantPreferences: { preferred: [], excluded: [], notes: '' },
      petsAllowed: true,
      monthlyRent: 350, monthlyRentConfidence: 0.95,
      availableFrom: '2026-06-01', availableFromConfidence: 0.95,
      totalSqm: 63, totalSqmConfidence: 0.95,
      hasTerrace: true, terraceSqm: 2, terraceSqmConfidence: 0.95,
      bedrooms: 3, bedroomsConfidence: 0.95
    },
    messages: [
      { role: 'model', text: 'Супер. Уште неколку прашања. На кој кат се наоѓа станот?' }
    ],
    phone: '+38970123456',
    ...extra
  };
}

// The reported conversation: compound answer
const s1 = makeSession();
let res = await generateResponse(s1, '5TI OD 13');
console.log('  Reply:', res.text);
assert('E1: floor=5 stored', s1.collectedData.floor === 5, `got floor=${JSON.stringify(s1.collectedData.floor)}`);
assert('E2: totalFloors=13 stored in the SAME turn', s1.collectedData.totalFloors === 13, `got totalFloors=${JSON.stringify(s1.collectedData.totalFloors)}`);
assert('E3: flow moved on to elevator (no floor re-ask)', res.type === 'QUESTION' && res.nextField === 'elevator', `got type=${res.type} next=${res.nextField}`);

// Bare suffixed ordinal: floor only, totalFloors question stays pending
const s2 = makeSession();
res = await generateResponse(s2, '5TI');
console.log('  Reply:', res.text);
assert('E4: bare "5TI" → floor=5 stored', s2.collectedData.floor === 5, `got floor=${JSON.stringify(s2.collectedData.floor)}`);
assert('E5: bare "5TI" → totalFloors NOT fabricated', s2.collectedData.totalFloors === undefined, `got totalFloors=${JSON.stringify(s2.collectedData.totalFloors)}`);
assert('E6: stored at HIGH (no re-ask confirmation)', s2.collectedData.floorConfidence >= 0.95, `got ${s2.collectedData.floorConfidence}`);
assert('E7: next question is totalFloors (still needed), not a floor re-ask', res.type === 'QUESTION' && res.nextField === 'totalFloors' && !/кој кат|точно/.test(res.text || ''), `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 60))}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('VIBER-ORDINAL-FLOORS TESTS');
harness.exit();
