// ============================================================
// POTKROVJE DEFERRAL — Test Suite
// ============================================================
// Reported: the owner answered the floor question with "NA POTKROVJE"
// (attic) and Ana stored floor=7 from a fabricated (totalFloors || 6)
// default — WRONG. The attic sits ABOVE the last floor: floor =
// totalFloors + 1. When totalFloors is unknown, Ana must ask the
// totalFloors question FIRST, then derive floor = totalFloors + 1.
// ============================================================
import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { runGlobalExtraction } from './data-collector.js';

const harness = createHarness();
const assert = harness.assert;

// ------------------------------------------------------------
// PART A: extraction-level behavior
// ------------------------------------------------------------
console.log('\n=== A: extraction-level potkrovje ===');

// A1: bare potkrovje, no totalFloors anywhere → NO floor guess
{
  const r = runGlobalExtraction('NA POTKROVJE', {}, 'floor');
  assert('A1: bare potkrovje, no totalFloors → no floor guess', r.floor === undefined, `got ${JSON.stringify(r.floor)}`);
}

// A2: totalFloors already collected → immediate derivation
{
  const r = runGlobalExtraction('NA POTKROVJE', { totalFloors: 10 }, 'floor');
  assert('A2: potkrovje + totalFloors=10 → floor=11', r.floor === 11, `got ${JSON.stringify(r.floor)}`);
}

// A3: "potkrovje od 10" — compound-phrase hint derives both
{
  const r = runGlobalExtraction('na potkrovje od 10', {}, 'floor');
  assert('A3: "na potkrovje od 10" → floor=11', r.floor === 11, `got ${JSON.stringify(r.floor)}`);
  assert('A3: "na potkrovje od 10" → totalFloors=10', r.totalFloors === 10, `got ${JSON.stringify(r.totalFloors)}`);
}

// A4: same-message katnica hint (existing cross-rule path preserved)
{
  const r = runGlobalExtraction('potkrovje, 10katnica', {}, 'potkrovje, 10katnica');
  assert('A4: "potkrovje, 10katnica" → floor=11 (cross-rule hint)', r.floor === 11, `got ${JSON.stringify(r.floor)}`);
  assert('A4: "potkrovje, 10katnica" → totalFloors=10', r.totalFloors === 10, `got ${JSON.stringify(r.totalFloors)}`);
}

// A5: ordinary floor answers stay untouched
{
  const r = runGlobalExtraction('na peti od dvanaese', {}, 'floor');
  assert('A5: "na peti od dvanaese" → floor=5', r.floor === 5, `got ${JSON.stringify(r.floor)}`);
  assert('A5: "na peti od dvanaese" → totalFloors=12', r.totalFloors === 12, `got ${JSON.stringify(r.totalFloors)}`);
}

// ------------------------------------------------------------
// PART B: e2e generateResponse — defer, ask totalFloors, derive
// ------------------------------------------------------------
console.log('\n=== B: e2e potkrovje deferral flow ===');

function freshSaleSession() {
  return {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true,
      transactionType: 'sale',
      tenantPreferences: { preferred: [], excluded: [], notes: '' },
      cleanPrice: 280000, cleanPriceConfidence: 0.95,
      totalSqm: 75, totalSqmConfidence: 0.95,
      hasTerrace: true, hasTerraceConfidence: 0.95, terraceSqm: 6, terraceSqmConfidence: 0.95,
      bedrooms: 3, bedroomsConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Одлично, уште последниве информации и завршуваме. На кој кат се наоѓа станот?' }],
    phone: '+38970123456'
  };
}

// B1: "NA POTKROVJE" → NO floor stored, flag set, asks totalFloors FIRST
{
  const s = freshSaleSession();
  const res = await generateResponse(s, 'NA POTKROVJE');
  assert('B1: floor NOT stored yet (no guess)', s.collectedData.floor === undefined, `got ${JSON.stringify(s.collectedData.floor)}`);
  assert('B1: deferral flag set', s.collectedData.floorPendingPotkrovje === true, `got ${JSON.stringify(s.collectedData.floorPendingPotkrovje)}`);
  assert('B1: asks the totalFloors question with explanatory phrasing',
    res.type === 'QUESTION' && /поткровје/.test(res.text || '') && /спрата/.test(res.text || ''),
    `got [${res.type}] "${(res.text || '').substring(0, 140)}"`);
}

// B2: owner answers "10" → floor=11 derived, totalFloors=10, flow advances
{
  const s = freshSaleSession();
  await generateResponse(s, 'NA POTKROVJE');
  const res = await generateResponse(s, '10');
  assert('B2: totalFloors=10 stored', s.collectedData.totalFloors === 10, `got ${JSON.stringify(s.collectedData.totalFloors)}`);
  assert('B2: floor=11 derived (10+1)', s.collectedData.floor === 11, `got ${JSON.stringify(s.collectedData.floor)}`);
  assert('B2: floor confidence HIGH', s.collectedData.floorConfidence === 0.95, `got ${JSON.stringify(s.collectedData.floorConfidence)}`);
  assert('B2: deferral flag cleared', s.collectedData.floorPendingPotkrovje === undefined, `got ${JSON.stringify(s.collectedData.floorPendingPotkrovje)}`);
  assert('B2: next question is elevator', res.type === 'QUESTION' && /лифт/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 140)}"`);
}

// B3: totalFloors already known at floor-question time → immediate derivation
{
  const s = freshSaleSession();
  s.collectedData.totalFloors = 10;
  s.collectedData.totalFloorsConfidence = 0.95;
  const res = await generateResponse(s, 'NA POTKROVJE');
  assert('B3: floor=11 stored immediately', s.collectedData.floor === 11, `got ${JSON.stringify(s.collectedData.floor)}`);
  assert('B3: no deferral flag', s.collectedData.floorPendingPotkrovje === undefined, `got ${JSON.stringify(s.collectedData.floorPendingPotkrovje)}`);
  assert('B3: next question is elevator', res.type === 'QUESTION' && /лифт/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 140)}"`);
}

// B5: no-clobber guard — owner answers the redirected totalFloors question
// with a REAL floor word ("na vtor kat"), then gives a number later: the
// derived totalFloors+1 must NOT overwrite the real floor answer.
{
  const s = freshSaleSession();
  await generateResponse(s, 'NA POTKROVJE');
  await generateResponse(s, 'na vtor kat');
  const res = await generateResponse(s, '10');
  assert('B5: real floor answer kept (floor=2)', s.collectedData.floor === 2, `got ${JSON.stringify(s.collectedData.floor)}`);
  assert('B5: totalFloors=10 stored', s.collectedData.totalFloors === 10, `got ${JSON.stringify(s.collectedData.totalFloors)}`);
  assert('B5: deferral flag cleared', s.collectedData.floorPendingPotkrovje === undefined, `got ${JSON.stringify(s.collectedData.floorPendingPotkrovje)}`);
  assert('B5: flow continues', res.type === 'QUESTION', `got [${res.type}] "${(res.text || '').substring(0, 140)}"`);
}

// B4: same-message hint on the floor question → immediate, no deferral needed
{
  const s = freshSaleSession();
  const res = await generateResponse(s, 'na potkrovje od 10');
  assert('B4: "na potkrovje od 10" → totalFloors=10', s.collectedData.totalFloors === 10, `got ${JSON.stringify(s.collectedData.totalFloors)}`);
  assert('B4: "na potkrovje od 10" → floor=11', s.collectedData.floor === 11, `got ${JSON.stringify(s.collectedData.floor)}`);
  assert('B4: no deferral flag', s.collectedData.floorPendingPotkrovje === undefined, `got ${JSON.stringify(s.collectedData.floorPendingPotkrovje)}`);
  assert('B4: next question is elevator', res.type === 'QUESTION' && /лифт/i.test(res.text || ''), `got [${res.type}] "${(res.text || '').substring(0, 140)}"`);
}

// ------------------------------------------------------------
// SUMMARY
// ------------------------------------------------------------
console.log(`\n=======================================================`);
console.log(`📊 POTKROVJE DEFERRAL TEST SUMMARY:`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
console.log(`=======================================================`);

if (harness.failed > 0) process.exit(1);
console.log('\n🟢 ALL POTKROVJE DEFERRAL TESTS PASSED');
