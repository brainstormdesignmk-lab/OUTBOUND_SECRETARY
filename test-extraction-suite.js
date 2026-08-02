import { createHarness } from './test-helpers.js';
// ========================================
// test-extraction-suite.js
// Automated tests for the 5 critical extraction patterns.
// These tests MUST pass before a new release.
//
// Test cases:
// 1. Compound floor: "na 6 od 12" → floor=6, totalFloors=12
// 2. Bedroom counting: "dve pomali i edna bracna" → bedrooms=3
// 3. Terrace separation: "68 kvadrati i terasa 4" → totalSqm=68, terraceSqm=4
// 4. Year built + renovation: "osumdesti graden renoviran pred 3 godini"
//    → yearBuilt=1985, renovated=true, renovationYear=(currentYear-3)
// 5. Multi-field: "lift, klima, jug, parking" → elevator, ac, orientation, parking
// ========================================

import { runGlobalExtraction } from './data-collector.js';

const harness = createHarness();
const assert = harness.assert;

const currentYear = new Date().getFullYear();


// ========================================
// TEST 1: Compound floor extraction
// ========================================
console.log('\n📦 Test 1: Compound floor');
let result = runGlobalExtraction('na 6 od 12', {});
assert('floor=6', result.floor === 6, `got ${result.floor}`);
assert('totalFloors=12', result.totalFloors === 12, `got ${result.totalFloors}`);

result = runGlobalExtraction('8/10', {});
assert('bare 8/10 → floor=8', result.floor === 8, `got ${result.floor}`);
assert('bare 8/10 → totalFloors=10', result.totalFloors === 10, `got ${result.totalFloors}`);

result = runGlobalExtraction('na osmi od deset', {});
assert('na osmi od deset → floor=8', result.floor === 8, `got ${result.floor}`);
assert('na osmi od deset → totalFloors=10', result.totalFloors === 10, `got ${result.totalFloors}`);

// Priority 9: Quick numeric compound — "4 od 8"
result = runGlobalExtraction('4 od 8', {});
assert('4 od 8 → floor=4', result.floor === 4, `got ${result.floor}`);
assert('4 od 8 → totalFloors=8', result.totalFloors === 8, `got ${result.totalFloors}`);

result = runGlobalExtraction('4 od 8', {}, 'floor');
assert('4 od 8 pref=floor → floor=4', result.floor === 4, `got ${result.floor}`);
assert('4 od 8 pref=floor → totalFloors=8', result.totalFloors === 8, `got ${result.totalFloors}`);

// ========================================
// TEST 2: Bedroom counting
// ========================================
console.log('\n📦 Test 2: Bedroom counting');
result = runGlobalExtraction('dve pomali i edna bracna', {});
assert('bedrooms=3', result.bedrooms === 3, `got ${result.bedrooms}`);

result = runGlobalExtraction('dve pomali i edna pogolema', {});
assert('dve pomali i edna pogolema → bedrooms=3', result.bedrooms === 3, `got ${result.bedrooms}`);

result = runGlobalExtraction('edna detska i edna bracna', {});
assert('edna detska i edna bracna → bedrooms=2', result.bedrooms === 2, `got ${result.bedrooms}`);

result = runGlobalExtraction('dve detski i edna bracna', {});
assert('dve detski i edna bracna → bedrooms=3', result.bedrooms === 3, `got ${result.bedrooms}`);

result = runGlobalExtraction('tri spalni', {});
assert('tri spalni → bedrooms=3', result.bedrooms === 3, `got ${result.bedrooms}`);

result = runGlobalExtraction('edna spalna', {});
assert('edna spalna → bedrooms=1', result.bedrooms === 1, `got ${result.bedrooms}`);

result = runGlobalExtraction('spalna plus detska', {});
assert('spalna plus detska → bedrooms=2', result.bedrooms === 2, `got ${result.bedrooms}`);

// ========================================
// TEST 3: Terrace separation
// ========================================
console.log('\n📦 Test 3: Terrace separation');
result = runGlobalExtraction('68 kvadrati i terasa 4', {});
assert('totalSqm=68', result.totalSqm === 68, `got ${result.totalSqm}`);
assert('terraceSqm=4', result.terraceSqm === 4, `got ${result.terraceSqm}`);
assert('hasTerrace=true', result.hasTerrace === true, `got ${result.hasTerrace}`);

result = runGlobalExtraction('vkupno ima seesetiosum kvadrati i terasa so cetiri', {});
assert('seesetiosum + terasa so cetiri → totalSqm=68', result.totalSqm === 68, `got ${result.totalSqm}`);
assert('seesetiosum + terasa so cetiri → terraceSqm=4', result.terraceSqm === 4, `got ${result.terraceSqm}`);

result = runGlobalExtraction('65m2 so terasa od 3 m2', {});
assert('65m2 + terasa od 3 m2 → totalSqm=65', result.totalSqm === 65, `got ${result.totalSqm}`);
assert('65m2 + terasa od 3 m2 → terraceSqm=3', result.terraceSqm === 3, `got ${result.terraceSqm}`);

result = runGlobalExtraction('3 m2 terasa', {});
assert('3 m2 terasa → totalSqm=null or not set', () => !result.totalSqm || result.totalSqm === undefined);
assert('3 m2 terasa → terraceSqm=3', result.terraceSqm === 3, `got ${result.terraceSqm}`);

// Test "terasi" (inflected form — "se terasi" instead of "terasa")
result = runGlobalExtraction('vkupno ima deveesetitri kvadrata a 5 kvadrati se terasi ima 2', {});
assert('terasi: totalSqm=93', result.totalSqm === 93, `got ${result.totalSqm}`);
assert('terasi: hasTerrace=true', result.hasTerrace === true, `got ${result.hasTerrace}`);
assert('terasi: terraceSqm=5', result.terraceSqm === 5, `got ${result.terraceSqm}`);

// Test "terase" (another inflected form)
result = runGlobalExtraction('70 kvadrati so terase od 6 m2', {});
assert('terase: totalSqm=70', result.totalSqm === 70, `got ${result.totalSqm}`);
assert('terase: hasTerrace=true', result.hasTerrace === true, `got ${result.hasTerrace}`);
assert('terase: terraceSqm=6', result.terraceSqm === 6, `got ${result.terraceSqm}`);

// ========================================
// TEST 4: Year built + renovation
// ========================================
console.log('\n📦 Test 4: Year built + renovation');
result = runGlobalExtraction('osumdesti graden renoviran pred 3 godini', {});
const expectedRenovYear = currentYear - 3;
assert('yearBuilt=1985', result.yearBuilt === 1985, `got ${result.yearBuilt}`);
assert('renovated=true', result.renovated === true, `got ${result.renovated}`);
assert(`renovationYear=${expectedRenovYear}`, result.renovationYear === expectedRenovYear, `got ${result.renovationYear}`);
assert('no false bedrooms', !result.bedrooms, `got bedrooms=${result.bedrooms}`);

result = runGlobalExtraction('2015ta e gradeno', {});
assert('2015ta → yearBuilt=2015', result.yearBuilt === 2015, `got ${result.yearBuilt}`);

result = runGlobalExtraction('80ti e graden', {});
assert('80ti → yearBuilt=1985', result.yearBuilt === 1985, `got ${result.yearBuilt}`);

result = runGlobalExtraction('renoviran, ne znam koja godina', {});
assert('renoviran without year → renovated=true', result.renovated === true, `got ${result.renovated}`);
assert('renoviran without year → no year extracted', result.renovationYear === null || result.renovationYear === undefined, `got ${result.renovationYear}`);

// ========================================
// TEST 6: Priority 10 — 5-message rapid-fill scenario
// Extracts ALL fields from voluminous messages in order,
// with zero repeated questions.
// ========================================
console.log('\n📦 Test 6: Priority 10 — 5-message rapid-fill');

// Simulate sequential messages as they arrive in a real conversation
var dataP10 = { transactionType: 'sale', propertyType: 'apartment' };

// Message 1: "125 iljadi" → cleanPrice
result = runGlobalExtraction('125 iljadi', dataP10, 'cleanPrice');
Object.assign(dataP10, result);
assert('P10 Msg1: cleanPrice=125000', dataP10.cleanPrice === 125000, `got ${dataP10.cleanPrice}`);
assert('P10 Msg1: no side-effect fields', Object.keys(result).length === 1, `got extra: ${Object.keys(result).filter(k => k !== 'cleanPrice').join(',')}`);

// Message 2: "93 kvadrati so 2 terasi od 5m2" → totalSqm + terrace
result = runGlobalExtraction('93 kvadrati so 2 terasi od 5m2', dataP10, 'totalSqm');
Object.assign(dataP10, result);
assert('P10 Msg2: totalSqm=93', dataP10.totalSqm === 93, `got ${dataP10.totalSqm}`);
assert('P10 Msg2: hasTerrace=true', dataP10.hasTerrace === true, `got ${dataP10.hasTerrace}`);
assert('P10 Msg2: terraceSqm=5', dataP10.terraceSqm === 5, `got ${dataP10.terraceSqm}`);

// Message 3: "4 od 8" → floor + totalFloors
result = runGlobalExtraction('4 od 8', dataP10, 'floor');
Object.assign(dataP10, result);
assert('P10 Msg3: floor=4', dataP10.floor === 4, `got ${dataP10.floor}`);
assert('P10 Msg3: totalFloors=8', dataP10.totalFloors === 8, `got ${dataP10.totalFloors}`);

// Message 4: "ima lift" → elevator
result = runGlobalExtraction('ima lift', dataP10, 'elevator');
Object.assign(dataP10, result);
assert('P10 Msg4: elevator=true', dataP10.elevator === true, `got ${dataP10.elevator}`);
assert('P10 Msg4: no false bedrooms', !result.bedrooms, `got bedrooms=${result.bedrooms}`);

// Message 5: "inverter" → ac=true (inverter AC is standard AC field in Macedonian context)
result = runGlobalExtraction('inverter', dataP10, 'ac');
Object.assign(dataP10, result);
assert('P10 Msg5: ac=true', dataP10.ac === true, `got ${dataP10.ac}`);

// Verify complete state
assert('P10 Complete: cleanPrice=125000', dataP10.cleanPrice === 125000, `got ${dataP10.cleanPrice}`);
assert('P10 Complete: totalSqm=93', dataP10.totalSqm === 93, `got ${dataP10.totalSqm}`);
assert('P10 Complete: hasTerrace=true', dataP10.hasTerrace === true, `got ${dataP10.hasTerrace}`);
assert('P10 Complete: terraceSqm=5', dataP10.terraceSqm === 5, `got ${dataP10.terraceSqm}`);
assert('P10 Complete: floor=4', dataP10.floor === 4, `got ${dataP10.floor}`);
assert('P10 Complete: totalFloors=8', dataP10.totalFloors === 8, `got ${dataP10.totalFloors}`);
assert('P10 Complete: elevator=true', dataP10.elevator === true, `got ${dataP10.elevator}`);
assert('P10 Complete: ac=true', dataP10.ac === true, `got ${dataP10.ac}`);

// ========================================
// TEST 5: Multi-field extraction
// ========================================
console.log('\n📦 Test 5: Multi-field extraction');
result = runGlobalExtraction('lift, klima, jug, parking', {});
assert('elevator=true', result.elevator === true, `got ${result.elevator}`);
assert('ac=true', result.ac === true, `got ${result.ac}`);
assert('orientation=jug', result.orientation === 'jug', `got ${result.orientation}`);
assert('parking=true', result.parking === true, `got ${result.parking}`);

result = runGlobalExtraction('se ima nova zgrada e : lift, juzen pogled, sloboden parking pred zgrada, klima', {});
assert('multi: elevator=true', result.elevator === true, `got ${result.elevator}`);
assert('multi: ac=true', result.ac === true, `got ${result.ac}`);
assert('multi: orientation=jug', result.orientation === 'jug', `got ${result.orientation}`);
assert('multi: parking=true', result.parking === true, `got ${result.parking}`);
assert('multi: no false renovated from "nova"', !result.renovated, `got renovated=${result.renovated}`);

// ========================================
// SUMMARY
// ========================================
console.log(`\n${'='.repeat(50)}`);
const total = harness.passed + harness.failed;
console.log(`\n${harness.failed === 0 ? '🟢' : '🔴'} RESULTS: ${harness.passed}/${total} passed, ${harness.failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(harness.failed > 0 ? 1 : 0);
