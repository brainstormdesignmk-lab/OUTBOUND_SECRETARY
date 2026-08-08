// ============================================================
// test-total-floors-direct.js — "TOTAL FLOORS NOT COLLECTED" regression
// ============================================================
// Reported (production log, lead 3571074):
//
//   ANA: ...На кој кат се наоѓа станот?
//   OWNER: NA VTORI OD 7          → floor=2 stored, totalFloors=7 LOST ❌
//   ANA: ...Колку спрата има вкупно зградата?
//   OWNER: 7 TI KAZAV             → NOT collected on first attempt ❌
//   OWNER: SEDUM                  → totalFloors=7 at 0.60 (PENDING) ❌
//   ANA: Дали точната вредност е 7? ...
//   OWNER: DA                     → only then accepted (2 re-asks!)
//
// Three root causes:
//   A) extractCompoundFloor Pattern 2 used (\S{2,}) for the total token — a
//      bare single digit "7" fails the 2-char minimum → compound never fires
//      → totalFloors=7 lost ("NA VTORI OD 7").
//   B) assessConfidence had NO bare-number rule for totalFloors (only the
//      ordinal rule for floor) → "SEDUM" hit the word-number branch → MEDIUM
//      (0.60) → needless confirmation re-ask.
//   C) extractTotalFloors' bare fallback required the ENTIRE message to be
//      just the number — the annoyed "TI KAZAV" suffix ("7, I told you")
//      broke it → "7 TI KAZAV" not collected at all.
//   D) (bonus, same message) countBedrooms substring-matched "vtor" inside
//      "NA VTORI OD 7" → phantom bedrooms=2.
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
// PART A — compound floor with single-digit total
// ============================================================
console.log('\n========================================');
console.log('🧪 A: "NA VTORI OD 7" → floor=2 AND totalFloors=7');
console.log('========================================\n');

let result = runGlobalExtraction('NA VTORI OD 7', {}, 'floor');
assert('A1: floor=2 extracted (ordinal "vtori")', result.floor === 2, `got ${JSON.stringify(result.floor)}`);
assert('A2: totalFloors=7 extracted (single-digit total in compound)', result.totalFloors === 7, `got ${JSON.stringify(result.totalFloors)}`);

// Cyrillic variant
result = runGlobalExtraction('на втори од 7', {}, 'floor');
assert('A3: Cyrillic "на втори од 7" → floor=2', result.floor === 2, `got ${JSON.stringify(result.floor)}`);
assert('A4: Cyrillic "на втори од 7" → totalFloors=7', result.totalFloors === 7, `got ${JSON.stringify(result.totalFloors)}`);

// Word-number total still works (regression guard)
result = runGlobalExtraction('na osmi od deset', {}, 'floor');
assert('A5: "na osmi od deset" → floor=8', result.floor === 8, `got ${JSON.stringify(result.floor)}`);
assert('A6: "na osmi od deset" → totalFloors=10', result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);

// Digit compound still works
result = runGlobalExtraction('na 8 od 10', {}, 'floor');
assert('A7: "na 8 od 10" → floor=8', result.floor === 8, `got ${JSON.stringify(result.floor)}`);
assert('A8: "na 8 od 10" → totalFloors=10', result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);

// ============================================================
// PART B — "SEDUM" / "7 TI KAZAV" bare direct answers
// ============================================================
console.log('\n========================================');
console.log('🧪 B: bare direct answers collect at HIGH (no re-ask)');
console.log('========================================\n');

result = runGlobalExtraction('SEDUM', {}, 'totalFloors');
assert('B1: "SEDUM" → totalFloors=7', result.totalFloors === 7, `got ${JSON.stringify(result.totalFloors)}`);

result = runGlobalExtraction('7 TI KAZAV', {}, 'totalFloors');
assert('B2: "7 TI KAZAV" → totalFloors=7 (annoyed repeat collected)', result.totalFloors === 7, `got ${JSON.stringify(result.totalFloors)}`);

// Cyrillic annoyed repeat
result = runGlobalExtraction('седум ти реков', {}, 'totalFloors');
assert('B3: "седум ти реков" → totalFloors=7', result.totalFloors === 7, `got ${JSON.stringify(result.totalFloors)}`);

// Confidence: bare cardinal word / digit / annoyed repeat all HIGH
assert('B4: "SEDUM" totalFloors confidence HIGH', assessConfidence('totalFloors', 7, 'SEDUM') === 'HIGH', `got ${assessConfidence('totalFloors', 7, 'SEDUM')}`);
assert('B5: "7 TI KAZAV" totalFloors confidence HIGH', assessConfidence('totalFloors', 7, '7 TI KAZAV') === 'HIGH', `got ${assessConfidence('totalFloors', 7, '7 TI KAZAV')}`);
assert('B6: bare "7" totalFloors confidence HIGH', assessConfidence('totalFloors', 7, '7') === 'HIGH', `got ${assessConfidence('totalFloors', 7, '7')}`);
assert('B7: "na vtori od 7" floor confidence HIGH', assessConfidence('floor', 2, 'NA VTORI OD 7') === 'HIGH', `got ${assessConfidence('floor', 2, 'NA VTORI OD 7')}`);

// NON-LEAK INVARIANTS (reviewer): a bare digit/word typed during a DIFFERENT
// question must NOT surface as floor/totalFloors. The extraction-level guards
// (NUMBER_SNIFFING in STEP 2 + preferredField groups in STEP 1) enforce this;
// these assertions pin it so the bare-number HIGH rule can't be abused later.
assert('B8: bare "7" during monthlyRent question → no totalFloors',
  runGlobalExtraction('7', {}, 'monthlyRent').totalFloors === undefined,
  `got ${JSON.stringify(runGlobalExtraction('7', {}, 'monthlyRent').totalFloors)}`);
assert('B9: bare "SEDUM" during totalSqm question → no totalFloors',
  runGlobalExtraction('SEDUM', {}, 'totalSqm').totalFloors === undefined,
  `got ${JSON.stringify(runGlobalExtraction('SEDUM', {}, 'totalSqm').totalFloors)}`);
assert('B10: bare "7" in global discovery → no totalFloors',
  runGlobalExtraction('7', {}).totalFloors === undefined,
  `got ${JSON.stringify(runGlobalExtraction('7', {}).totalFloors)}`);

// ============================================================
// PART C — countBedrooms phantom guard
// ============================================================
console.log('\n========================================');
console.log('🧪 C: countBedrooms must NOT grab "vtor" from "na vtori od 7"');
console.log('========================================\n');

assert('C1: countBedrooms("NA VTORI OD 7") → null (compound floor, not bedrooms)', countBedrooms('NA VTORI OD 7') === null, `got ${countBedrooms('NA VTORI OD 7')}`);
assert('C1b: countBedrooms("на втори од 7") → null (Cyrillic compound floor)', countBedrooms('на втори од 7') === null, `got ${countBedrooms('на втори од 7')}`);
assert('C2: countBedrooms("na vtori kat") → null (ordinal floor still guarded)', countBedrooms('na vtori kat') === null, `got ${countBedrooms('na vtori kat')}`);
assert('C3: countBedrooms("dve sobi") → 2 (real answers unaffected)', countBedrooms('dve sobi') === 2, `got ${countBedrooms('dve sobi')}`);
assert('C4: countBedrooms("tri spalni") → 3 (real answers unaffected)', countBedrooms('tri spalni') === 3, `got ${countBedrooms('tri spalni')}`);

// ============================================================
// PART D — full generateResponse flow (the reported conversation)
// ============================================================
console.log('\n========================================');
console.log('🧪 D: full flow — "NA VTORI OD 7" stores BOTH fields, skips re-ask');
console.log('========================================\n');

const rentSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true, transactionType: 'rent',
    tenantPreferences: { preferred: [], excluded: [], notes: '' },
    monthlyRent: 350, monthlyRentConfidence: 0.95,
    availableFrom: '2026-06-01', availableFromConfidence: 0.95,
    totalSqm: 63, totalSqmConfidence: 0.95,
    hasTerrace: true, terraceSqm: 2, terraceSqmConfidence: 0.95,
    bedrooms: 2, bedroomsConfidence: 0.95
  },
  messages: [
    { role: 'model', text: 'Супер. Уште неколку прашања. На кој кат се наоѓа станот?' }
  ],
  phone: '+38970123456'
};

let res = await generateResponse(rentSession, 'NA VTORI OD 7');
console.log('  Reply:', res.text);
assert('D1: floor=2 stored', rentSession.collectedData.floor === 2, `got floor=${JSON.stringify(rentSession.collectedData.floor)}`);
assert('D2: totalFloors=7 stored in the SAME turn (no re-ask)', rentSession.collectedData.totalFloors === 7, `got totalFloors=${JSON.stringify(rentSession.collectedData.totalFloors)}`);
assert('D3: flow moved on to elevator (not totalFloors re-ask)',
  res.type === 'QUESTION' && res.nextField === 'elevator' && !/спрата/.test(res.text || ''),
  `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 70))}`);

// The SEDUM path (when floor was already set but totalFloors wasn't)
const rentSession2 = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true, transactionType: 'rent',
    tenantPreferences: { preferred: [], excluded: [], notes: '' },
    monthlyRent: 350, monthlyRentConfidence: 0.95,
    availableFrom: '2026-06-01', availableFromConfidence: 0.95,
    totalSqm: 63, totalSqmConfidence: 0.95,
    hasTerrace: true, terraceSqm: 2, terraceSqmConfidence: 0.95,
    bedrooms: 2, bedroomsConfidence: 0.95,
    floor: 2, floorConfidence: 0.95
  },
  messages: [
    { role: 'model', text: 'Одлично, уште последниве информации и завршуваме. Колку спрата има вкупно зградата?' }
  ],
  phone: '+38970123456'
};

res = await generateResponse(rentSession2, 'SEDUM');
console.log('  Reply:', res.text);
assert('D4: "SEDUM" → totalFloors=7 stored', rentSession2.collectedData.totalFloors === 7, `got totalFloors=${JSON.stringify(rentSession2.collectedData.totalFloors)}`);
assert('D5: stored at HIGH confidence (no pending confirmation, no re-ask)', rentSession2.collectedData.totalFloorsConfidence >= 0.95, `got ${rentSession2.collectedData.totalFloorsConfidence}`);
assert('D6: next question is elevator (not a totalFloors re-ask)',
  res.type === 'QUESTION' && res.nextField === 'elevator' && !/спрата|точно/.test(res.text || ''),
  `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 70))}`);
assert('D7: no pendingConfirmation was set', !rentSession2.pendingConfirmation, 'pendingConfirmation should be null');

// The "7 TI KAZAV" path — first attempt, no re-ask
const rentSession3 = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true, transactionType: 'rent',
    tenantPreferences: { preferred: [], excluded: [], notes: '' },
    monthlyRent: 350, monthlyRentConfidence: 0.95,
    availableFrom: '2026-06-01', availableFromConfidence: 0.95,
    totalSqm: 63, totalSqmConfidence: 0.95,
    hasTerrace: true, terraceSqm: 2, terraceSqmConfidence: 0.95,
    bedrooms: 2, bedroomsConfidence: 0.95,
    floor: 2, floorConfidence: 0.95
  },
  messages: [
    { role: 'model', text: 'Одлично, уште последниве информации и завршуваме. Колку спрата има вкупно зградата?' }
  ],
  phone: '+38970123456'
};

res = await generateResponse(rentSession3, '7 TI KAZAV');
console.log('  Reply:', res.text);
assert('D8: "7 TI KAZAV" → totalFloors=7 stored on FIRST attempt', rentSession3.collectedData.totalFloors === 7, `got totalFloors=${JSON.stringify(rentSession3.collectedData.totalFloors)}`);
assert('D9: stored at HIGH (no re-ask)', rentSession3.collectedData.totalFloorsConfidence >= 0.95, `got ${rentSession3.collectedData.totalFloorsConfidence}`);
assert('D10: no pendingConfirmation set', !rentSession3.pendingConfirmation, 'pendingConfirmation should be null');

// ============================================================
// SUMMARY
// ============================================================
harness.summary('TOTAL-FLOORS-DIRECT TESTS');
harness.exit();
