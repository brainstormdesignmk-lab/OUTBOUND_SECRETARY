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

const currentYear = new Date().getFullYear();
let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: ${detail}`);
    failed++;
  }
}

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
const total = passed + failed;
console.log(`\n${failed === 0 ? '🟢' : '🔴'} RESULTS: ${passed}/${total} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
