// ========================================
// GLOBAL EXTRACTION PASS — E2E Simulation
// ========================================
// Tests the NEW global extraction pass without needing LLM calls.
// Validates that multi-field messages like "80 kvadrati, tret kat, ima lift"
// extract all three fields in one pass.
// ========================================
import { runGlobalExtraction } from './data-collector.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function assertExtract(label, input, currentData, expectedFields, notExpectedFields, detail) {
  const result = runGlobalExtraction(input, currentData, input);
  let allMatch = true;
  const mismatches = [];

  // Check expected fields are present with correct values
  for (const [key, value] of Object.entries(expectedFields)) {
    if (result[key] !== value) {
      allMatch = false;
      mismatches.push(`${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(result[key])}`);
    }
  }

  // Check fields that should NOT be extracted
  for (const key of notExpectedFields) {
    if (key in result) {
      allMatch = false;
      mismatches.push(`${key} should NOT be extracted but got ${JSON.stringify(result[key])}`);
    }
  }

  assert(label, allMatch, mismatches.join(', ') + (detail ? ` (${detail})` : ''));
}

// ========================================
// TEST GROUP: Multi-field extraction
// ========================================
console.log(`\n📦 GROUP: Multi-field extraction (single message, multiple fields)`);

// Test 1: Classic multi-field message — all three key fields extracted
let result = runGlobalExtraction("80 kvadrati, tret kat, ima lift", {}, "80 kvadrati, tret kat, ima lift");
assert("M1: totalSqm extracted from '80 kvadrati'", result.totalSqm === 80, `got ${result.totalSqm}`);
assert("M1: floor extracted from 'tret kat'", result.floor === 3, `got ${result.floor}`);
assert("M1: elevator extracted from 'ima lift'", result.elevator === true, `got ${result.elevator}`);
// NOTE: other fields may also be extracted (elevator=true), that's expected behavior

// Test 2: Price + sqm + orientation
result = runGlobalExtraction("cena 120 iljadi evra, 55 m2, jugoistok", {}, "cena 120 iljadi evra, 55 m2, jugoistok");
assert("M2: cleanPrice extracted from '120 iljadi'", result.cleanPrice === 120000, `got ${result.cleanPrice}`);
assert("M2: totalSqm extracted from '55 m2'", result.totalSqm === 55, `got ${result.totalSqm}`);
assert("M2: orientation extracted from 'jugoistok'", result.orientation === 'jug-istok', `got ${result.orientation}`);

// Test 3: bedrooms + floor + totalFloors
result = runGlobalExtraction("2 spalni, 3 kat, 10katnica", {}, "2 spalni, 3 kat, 10katnica");
assert("M3: bedrooms extracted from '2 spalni'", result.bedrooms === 2, `got ${result.bedrooms}`);
assert("M3: totalFloors extracted from '10katnica'", result.totalFloors === 10, `got ${result.totalFloors}`);

// Test 4: Fully furnished + garage + inverter + year
result = runGlobalExtraction("kompletno namesten, garaza, inverter klima, 2015 godina", {}, "kompletno namesten, garaza, inverter klima, 2015 godina");
assert("M4: furnished extracted", result.furnished === true && result.furnishedLevel === 'full', `got ${JSON.stringify(result.furnished)}/${result.furnishedLevel}`);
assert("M4: parking extracted", result.parking === true && result.parkingType === 'garage', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
assert("M4: ac extracted", result.ac === true, `got ${result.ac}`);
assert("M4: yearBuilt extracted", result.yearBuilt === 2015, `got ${result.yearBuilt}`);

// Test 5: Renovation with embedded year
result = runGlobalExtraction("da renoviran 2020ta", {}, "da renoviran 2020ta");
assert("M5: renovated extracted", result.renovated === true, `got ${result.renovated}`);
assert("M5: renovationYear extracted from same message", result.renovationYear === 2020, `got ${result.renovationYear}`);

// Test 6: Documentation
result = runGlobalExtraction("cist imoten list, imam sliki", {}, "cist imoten list, imam sliki");
assert("M6: documentation extracted", result.documentationClean === true, `got ${result.documentationClean}`);
// NOTE: ownerName is now gated by nextField in service.js, not extracted globally

// ========================================
// TEST GROUP: No false positives
// ========================================
console.log(`\n📦 GROUP: No false positives on bare answers`);

// Test 7: Negative response should NOT extract field-specific data
result = runGlobalExtraction("ne", {}, "ne");
assert("N1: 'ne' extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 8: Affirmative response should NOT extract data without context
result = runGlobalExtraction("da", {}, "da");
assert("N2: 'da' extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 9: Empty string
result = runGlobalExtraction("", {}, "");
assert("N3: empty string extracts nothing", Object.keys(result).length === 0);

// Test 10: Short text shouldn't match sqm (5 < 10 threshold)
result = runGlobalExtraction("5 m2", {}, "5 m2");
assert("N4: '5 m2' doesn't match totalSqm (5 < 10)", result.totalSqm === undefined, `got ${result.totalSqm}`);

// ========================================
// TEST GROUP: Already-set fields
// ========================================
console.log(`\n📦 GROUP: Already-set fields are not overwritten`);

// Test 11: Field already set should not be overwritten
result = runGlobalExtraction("80 kvadrati", { totalSqm: 55 }, "80 kvadrati");
assert("A1: totalSqm not overwritten", result.totalSqm === undefined, `got ${result.totalSqm}`);

// Test 12: null field SHOULD be overwritten (null means missing)
result = runGlobalExtraction("80 kvadrati", { totalSqm: null }, "80 kvadrati");
assert("A2: null totalSqm IS overwritten", result.totalSqm === 80, `got ${result.totalSqm}`);

// ========================================
// TEST GROUP: Cross-field dependencies
// ========================================
console.log(`\n📦 GROUP: Cross-field dependencies`);

// Test 13: renovationYear should NOT be in updates when renovated=false
result = runGlobalExtraction("2000ta", { renovated: false, renovationYear: null }, "2000ta");
assert("D1: renovationYear not returned when renovated=false", 
  !('renovationYear' in result), 
  `got renovationYear=${JSON.stringify(result.renovationYear)}`);

// Test 14: renovationYear SHOULD be extracted if renovated=true  
result = runGlobalExtraction("2000ta", { renovated: true, renovationYear: null }, "2000ta");
assert("D2: renovationYear extracted when renovated=true", result.renovationYear === 2000, `got ${result.renovationYear}`);

// ========================================
// TEST GROUP: Edge cases
// ========================================
console.log(`\n📦 GROUP: Edge cases`);

// Test 15: Potkrovje without totalFloors → defaults to 6
result = runGlobalExtraction("potkrovje", {}, "potkrovje");
assert("E1: potkrovje defaults to floor=7 (6+1)", result.floor === 7, `got ${result.floor}`);

// Test 16: Potkrovje WITH totalFloors in currentData → correct floor
result = runGlobalExtraction("potkrovje, 10katnica", { totalFloors: 10 }, "potkrovje, 10katnica");
assert("E2: potkrovje with totalFloors=10 → floor=11", result.floor === 11, `got ${result.floor}`);

// Test 17: Ordinal floor
result = runGlobalExtraction("vtor kat", {}, "vtor kat");
assert("E3: 'vtor kat' → floor=2", result.floor === 2, `got ${result.floor}`);

// Test 18: Price in different formats
result = runGlobalExtraction("98 iljadi evra", {}, "98 iljadi evra");
assert("E4: '98 iljadi' → cleanPrice=98000", result.cleanPrice === 98000, `got ${result.cleanPrice}`);

result = runGlobalExtraction("156000 evra", {}, "156000 evra");
assert("E5: '156000' → cleanPrice=156000", result.cleanPrice === 156000, `got ${result.cleanPrice}`);

// Test 19: Heating NOT extracted by global pass (complex handler in service.js)
result = runGlobalExtraction("centralno", {}, "centralno");
assert("E7: heating NOT extracted by global pass", result.heating === undefined, `got ${result.heating}`);

// Test 20: Documentation negative detection
result = runGlobalExtraction("ima hipoteka na stanot", {}, "ima hipoteka na stanot");
assert("E8: hipoteka → documentationClean=false", 
  result.documentationClean === false, 
  `got ${JSON.stringify(result.documentationClean)}`);
assert("E8: hipoteka → documentationIssues='hipoteka'", 
  result.documentationIssues === 'hipoteka', 
  `got ${JSON.stringify(result.documentationIssues)}`);

// Test 21: Renovated with relative year ("pred 2 godini")
result = runGlobalExtraction("pred 2 godini renoviran", { renovated: true, renovationYear: null }, "pred 2 godini renoviran");
const expectedYear = new Date().getFullYear() - 2;
assert("E9: 'pred 2 godini' extracts year correctly", 
  result.renovationYear === expectedYear, 
  `got ${result.renovationYear}, expected ${expectedYear}`);

// ========================================
// TEST GROUP: Context awareness (no false matches)
// ========================================
console.log(`\n📦 GROUP: Context-specific extraction`);

// Test 22: "ima lift" should ONLY extract elevator, NOT documentation
result = runGlobalExtraction("ima lift", {}, "ima lift");
assert("C1: 'ima lift' → elevator=true", result.elevator === true, `got ${result.elevator}`);
assert("C1: 'ima lift' → NOT documentationClean", result.documentationClean === undefined, `got ${result.documentationClean}`);

// Test 23: "nema parking" should ONLY set parking=false, NOT renovated/furnished
result = runGlobalExtraction("nema parking", {}, "nema parking");
assert("C2: 'nema parking' → parking=false", result.parking === false, `got ${result.parking}`);
assert("C2: 'nema parking' → NOT furnished", result.furnished === undefined, `got ${result.furnished}`);
assert("C2: 'nema parking' → NOT renovated", result.renovated === undefined, `got ${result.renovated}`);

// ========================================
// TEST SUMMARY
// ========================================
console.log(`\n=======================================================`);
console.log(`📊 GLOBAL EXTRACTION E2E TEST SUMMARY:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📋 Total:  ${passed + failed}`);
console.log(`=======================================================`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log(`\n🟢 ALL GLOBAL EXTRACTION TESTS PASSED`);
}
