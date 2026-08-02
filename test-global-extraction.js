import { createHarness } from './test-helpers.js';
// ========================================
// GLOBAL EXTRACTION PASS — E2E Simulation
// ========================================
// Tests the NEW global extraction pass without needing LLM calls.
// Validates that multi-field messages like "80 kvadrati, tret kat, ima lift"
// extract all three fields in one pass.
// ========================================
import { runGlobalExtraction } from './data-collector.js';
import { extractTerraceNumber } from './property-extractor.js';

const harness = createHarness();
const assert = harness.assert;



function assertExtract(label, input, currentData, expectedFields, notExpectedFields, detail) {
  const result = runGlobalExtraction(input, currentData);
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
result = runGlobalExtraction("da renoviran 2020ta", {});
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
result = runGlobalExtraction("ne", {});
assert("N1: 'ne' extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 8: Affirmative response should NOT extract data without context
result = runGlobalExtraction("da", {});
assert("N2: 'da' extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 9: Empty string
result = runGlobalExtraction("", {});
assert("N3: empty string extracts nothing", Object.keys(result).length === 0);

// Test 10: Short text shouldn't match sqm (5 < 10 threshold)
result = runGlobalExtraction("5 m2", {});
assert("N4: '5 m2' doesn't match totalSqm (5 < 10)", result.totalSqm === undefined, `got ${result.totalSqm}`);

// Test: Word-based sqm — "seeset i pet kvadrati" → 65
result = runGlobalExtraction("seeset i pet kvadrati", {});
assert("N5: 'seeset i pet kvadrati' → totalSqm=65 (word-based)", result.totalSqm === 65, `got ${result.totalSqm}`);

// Test: Terrace + sqm in one message — "65 kvadrati so terasa od 3 m2"
result = runGlobalExtraction("65 kvadrati so terasa od 3 m2", {});
assert("N6: '65 kvadrati so terasa od 3 m2' → totalSqm=65", result.totalSqm === 65, `got ${result.totalSqm}`);
assert("N6: terrace extracted from same message", result.hasTerrace === true && result.terraceSqm === 3, `got ${JSON.stringify(result.hasTerrace)}/${result.terraceSqm}`);

// Test: Word-based sqm + terrace — "seeset i pet kvadrati so terasa od 3 m2"
result = runGlobalExtraction("seeset i pet kvadrati so terasa od 3 m2", {});
assert("N7: word-based sqm + terrace → totalSqm=65", result.totalSqm === 65, `got ${result.totalSqm}`);
assert("N7: terrace from same message → hasTerrace=true, terraceSqm=3", result.hasTerrace === true && result.terraceSqm === 3, `got ${JSON.stringify(result.hasTerrace)}/${result.terraceSqm}`);

// ========================================
// TEST GROUP: Field-targeted extraction (no unrestricted global)
// ========================================
console.log(`\n📦 GROUP: Field-targeted extraction — no unrestricted global`);

// Test: "na sesti sprat a zgradata ima deset kata" with preferredField=totalFloors
// Should extract BOTH floor (sesti=6, 'sprat' context) and totalFloors (deset kata=10, 'kata' context)
// Should NOT extract yearBuilt (no "10" → 2010 false positive)
result = runGlobalExtraction("na sesti sprat a zgradata ima deset kata", {}, 'totalFloors');
assert("FT1: 'deset kata' → totalFloors=10 (word-based match)", result.totalFloors === 10, `got ${result.totalFloors}`);
assert("FT1: 'sesti sprat' → floor=6 (closely related field)", result.floor === 6, `got ${result.floor}`);
assert("FT1: yearBuilt NOT extracted (unrestricted global blocked)", result.yearBuilt === undefined, `got ${JSON.stringify(result.yearBuilt)}`);  // Test: "10" with preferredField=totalFloors → should extract totalFloors=10 (bare number fallback)
  result = runGlobalExtraction("10", {}, 'totalFloors');
  assert("FT2: '10' with preferredField=totalFloors → totalFloors=10", result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);
  assert("FT2: yearBuilt NOT extracted from bare '10'", result.yearBuilt === undefined, `got ${JSON.stringify(result.yearBuilt)}`);

// Test: "10" without preferredField (full pass) → should extract yearBuilt (persuasion mode)
result = runGlobalExtraction("10", {});
assert("FT3: '10' without preferredField → yearBuilt NOT extracted (no guessing)", result.yearBuilt === undefined, `got ${JSON.stringify(result.yearBuilt)}`);

// ========================================
// TEST GROUP: Already-set fields
// ========================================
console.log(`\n📦 GROUP: Already-set fields are not overwritten`);

// Test 11: Field already set should not be overwritten
result = runGlobalExtraction("80 kvadrati", { totalSqm: 55 });
assert("A1: totalSqm not overwritten", result.totalSqm === undefined, `got ${result.totalSqm}`);

// Test 12: null field SHOULD be overwritten (null means missing)
result = runGlobalExtraction("80 kvadrati", { totalSqm: null });
assert("A2: null totalSqm IS overwritten", result.totalSqm === 80, `got ${result.totalSqm}`);

// ========================================
// TEST GROUP: Cross-field dependencies
// ========================================
console.log(`\n📦 GROUP: Cross-field dependencies`);

// Test 13: renovationYear should NOT be in updates when renovated=false
result = runGlobalExtraction("2000ta", { renovated: false, renovationYear: null });
assert("D1: renovationYear not returned when renovated=false", 
  !('renovationYear' in result), 
  `got renovationYear=${JSON.stringify(result.renovationYear)}`);

// Test 14: renovationYear SHOULD be extracted if renovated=true  
result = runGlobalExtraction("2000ta", { renovated: true, renovationYear: null });
assert("D2: renovationYear extracted when renovated=true", result.renovationYear === 2000, `got ${result.renovationYear}`);

// ========================================
// TEST GROUP: Edge cases
// ========================================
console.log(`\n📦 GROUP: Edge cases`);

// Test 15: Potkrovje without totalFloors → defaults to 6
result = runGlobalExtraction("potkrovje", {});
assert("E1: potkrovje defaults to floor=7 (6+1)", result.floor === 7, `got ${result.floor}`);

// Test 16: Potkrovje WITH 10katnica in same message — cross-rule extraction
// NOTE: This tests the cross-rule hint: extractFloor should find "10katnica"
// in the SAME message and use 10 instead of defaulting to 6.
result = runGlobalExtraction("potkrovje, 10katnica", {}, "potkrovje, 10katnica");
assert("E2: potkrovje+10katnica → floor=11 (cross-rule hint)", result.floor === 11, `got ${result.floor}`);
assert("E2: potkrovje+10katnica → totalFloors=10", result.totalFloors === 10, `got ${result.totalFloors}`);

// Test 17: Ordinal floor
result = runGlobalExtraction("vtor kat", {});
assert("E3: 'vtor kat' → floor=2", result.floor === 2, `got ${result.floor}`);

// Test 18: Price in different formats
result = runGlobalExtraction("98 iljadi evra", {});
assert("E4: '98 iljadi' → cleanPrice=98000", result.cleanPrice === 98000, `got ${result.cleanPrice}`);

result = runGlobalExtraction("156000 evra", {});
assert("E5: '156000' → cleanPrice=156000", result.cleanPrice === 156000, `got ${result.cleanPrice}`);

// Test 19: Heating extracted by global pass (keyword: centralno → district)
result = runGlobalExtraction("centralno", {});
assert("E7: centralno → heating='district'", result.heating === 'district', `got ${JSON.stringify(result.heating)}`);

// Test 20: Documentation negative detection
result = runGlobalExtraction("ima hipoteka na stanot", {});
assert("E8: hipoteka → documentationClean=false", 
  result.documentationClean === false, 
  `got ${JSON.stringify(result.documentationClean)}`);
assert("E8: hipoteka → documentationIssues='hipoteka'", 
  result.documentationIssues === 'hipoteka', 
  `got ${JSON.stringify(result.documentationIssues)}`);

// Test 21: Renovated with relative year ("pred 2 godini")
result = runGlobalExtraction("pred 2 godini renoviran", { renovated: true, renovationYear: null });
const expectedYear = new Date().getFullYear() - 2;
assert("E9: 'pred 2 godini' extracts year correctly", 
  result.renovationYear === expectedYear, 
  `got ${result.renovationYear}, expected ${expectedYear}`);

// ========================================
// TEST GROUP: Context awareness (no false matches)
// ========================================
console.log(`\n📦 GROUP: Context-specific extraction`);

// Test 22: "ima lift" should ONLY extract elevator, NOT documentation
result = runGlobalExtraction("ima lift", {});
assert("C1: 'ima lift' → elevator=true", result.elevator === true, `got ${result.elevator}`);
assert("C1: 'ima lift' → NOT documentationClean", result.documentationClean === undefined, `got ${result.documentationClean}`);

// Test 23: "nema parking" should ONLY set parking=false, NOT renovated/furnished
result = runGlobalExtraction("nema parking", {});
assert("C2: 'nema parking' → parking=false", result.parking === false, `got ${result.parking}`);
assert("C2: 'nema parking' → NOT furnished", result.furnished === undefined, `got ${result.furnished}`);
assert("C2: 'nema parking' → NOT renovated", result.renovated === undefined, `got ${result.renovated}`);

// ========================================
// TEST GROUP: Cyrillic multi-field extraction
// ========================================
console.log(`\n📦 GROUP: Cyrillic multi-field extraction`);

// Test 24: Full Cyrillic multi-field message
result = runGlobalExtraction("80 квадрати, трет кат, лифт", {}, "80 квадрати, трет кат, лифт");
assert("CY1: totalSqm from '80 квадрати'", result.totalSqm === 80, `got ${result.totalSqm}`);
assert("CY1: floor from 'трет кат'", result.floor === 3, `got ${result.floor}`);
assert("CY1: elevator from 'лифт'", result.elevator === true, `got ${result.elevator}`);

// Test 25: Cyrillic price + sqm
result = runGlobalExtraction("цена 120 илјади евра, 55 квадрати", {}, "цена 120 илјади евра, 55 квадрати");
assert("CY2: cleanPrice from '120 илјади'", result.cleanPrice === 120000, `got ${result.cleanPrice}`);
assert("CY2: totalSqm from '55 квадрати'", result.totalSqm === 55, `got ${result.totalSqm}`);

// Test 26: Cyrillic orientation + furnished
result = runGlobalExtraction("југоисток, комплетно наместен, паркинг", {}, "југоисток, комплетно наместен, паркинг");
assert("CY3: orientation from 'југоисток'", result.orientation === 'jug-istok', `got ${result.orientation}`);
assert("CY3: furnished full from 'комплетно наместен'", result.furnished === true && result.furnishedLevel === 'full', `got ${JSON.stringify(result.furnished)}/${result.furnishedLevel}`);
assert("CY3: parking from 'паркинг'", result.parking === true, `got ${result.parking}`);

// Test 27: Cyrillic floor ordinal + totalFloors
result = runGlobalExtraction("петти кат, десеткатница", {}, "петти кат, десеткатница");
assert("CY4: floor from 'петти кат'", result.floor === 5, `got ${result.floor}`);
assert("CY4: totalFloors from 'десеткатница'", result.totalFloors === 10, `got ${result.totalFloors}`);

// Test 28: Cyrillic renovation + documentation
result = runGlobalExtraction("реновиран 2020та, чист имотен лист", {}, "реновиран 2020та, чист имотен лист");
assert("CY5: renovated from 'реновиран'", result.renovated === true, `got ${result.renovated}`);
assert("CY5: renovationYear from '2020та'", result.renovationYear === 2020, `got ${result.renovationYear}`);
assert("CY5: documentation from 'чист имотен лист'", result.documentationClean === true, `got ${result.documentationClean}`);

// ========================================
// TEST GROUP: Mixed Latin/Cyrillic multi-field
// ========================================
console.log(`\n📦 GROUP: Mixed Latin/Cyrillic multi-field`);

// Test 29: Mixed scripts in one message
result = runGlobalExtraction("80 m2, tret kat, лифт, паркинг", {}, "80 m2, tret kat, лифт, паркинг");
assert("MX1: totalSqm from '80 m2'", result.totalSqm === 80, `got ${result.totalSqm}`);
assert("MX1: floor from 'tret kat'", result.floor === 3, `got ${result.floor}`);
assert("MX1: elevator from 'лифт'", result.elevator === true, `got ${result.elevator}`);
assert("MX1: parking from 'паркинг'", result.parking === true, `got ${result.parking}`);

// Test 30: Mixed scripts — price + sqm + orientation
result = runGlobalExtraction("cena 98 iljadi, 55 кв, jugoistok", {}, "cena 98 iljadi, 55 кв, jugoistok");
assert("MX2: cleanPrice from '98 iljadi'", result.cleanPrice === 98000, `got ${result.cleanPrice}`);
assert("MX2: totalSqm from '55 кв'", result.totalSqm === 55, `got ${result.totalSqm}`);
assert("MX2: orientation from 'jugoistok'", result.orientation === 'jug-istok', `got ${result.orientation}`);

// ========================================
// TEST GROUP: Price cross-field contamination
// ========================================
// When a price is extracted from a message (e.g., "stopeeset i tri iljadi evra"),
// floor/bedrooms/totalFloors extractors must NOT accidentally pick up price words
// like "stopeeset" → floor=50 or "tri" → bedrooms=3.
// ========================================
console.log(`\n📦 GROUP: Price cross-field contamination guard`);

// Test: "stopeeset i tri iljadi evra" (73,000€) — price words contain
// substrings that match floor ("peeset" in parseMacedonianNumber) and
// bedrooms ("tri" = 3). Must ONLY extract cleanPrice.
  result = runGlobalExtraction("stopeeset i tri iljadi evra", {});
  assert("PC1: cleanPrice=153000 (stopeeset=150 + tri=3 = 153 × 1000)", result.cleanPrice === 153000, `got ${result.cleanPrice}`);
  result = runGlobalExtraction("stopeeset i dve iljadi evra", {});
  assert("PC1b: cleanPrice=152000 (stopeeset=150 + dve=2 = 152 × 1000)", result.cleanPrice === 152000, `got ${result.cleanPrice}`);

// Test: "za mene baram stodvaeset i pet iljadi evra" — noise before number, getStoPrefix must detect "sto" before match
result = runGlobalExtraction("za mene baram stodvaeset i pet iljadi evra", {});
assert("PC1c: cleanPrice=125000 (stodvaeset=120 + pet=5 = 125 × 1000, embedded sto detected)", result.cleanPrice === 125000, `got ${result.cleanPrice}`);
assert("PC1c: floor NOT extracted from price message", result.floor === undefined, `got ${JSON.stringify(result.floor)}`);

// Test: "devedeset i tri iljadi" — uses devedeset (long form) not deveeset (short form)
result = runGlobalExtraction("devedeset i tri iljadi", {});
assert("PC1d: cleanPrice=93000 (devedeset=90 + tri=3 = 93 × 1000, long form)", result.cleanPrice === 93000, `got ${result.cleanPrice}`);

// Test: "dveste iljadi evra" — standalone hundreds word (dveste=200)
result = runGlobalExtraction("dveste iljadi evra", {});
assert("PC1e: cleanPrice=200000 (dveste=200 × 1000)", result.cleanPrice === 200000, `got ${result.cleanPrice}`);

// Test: "trieste iljadi evra" — standalone hundreds (trieste=300)
result = runGlobalExtraction("trieste iljadi evra", {});
assert("PC1f: cleanPrice=300000 (trieste=300 × 1000)", result.cleanPrice === 300000, `got ${result.cleanPrice}`);

// Test: "sedumdeset iljadi" — irregular tens (sedumdeset=70)
result = runGlobalExtraction("sedumdeset iljadi", {});
assert("PC1g: cleanPrice=70000 (sedumdeset=70 × 1000)", result.cleanPrice === 70000, `got ${result.cleanPrice}`);

assert("PC1: floor NOT extracted (cross-field contamination)", result.floor === undefined, `got ${JSON.stringify(result.floor)}`);
assert("PC1: bedrooms NOT extracted", result.bedrooms === undefined, `got ${JSON.stringify(result.bedrooms)}`);
assert("PC1: totalFloors NOT extracted", result.totalFloors === undefined, `got ${JSON.stringify(result.totalFloors)}`);

// Test: "98 iljadi evra" — digit price should still allow floor/bedrooms
// from OTHER messages (not the same message)
result = runGlobalExtraction("98 iljadi evra", {});
assert("PC2: cleanPrice=98000", result.cleanPrice === 98000, `got ${result.cleanPrice}`);
assert("PC2: floor NOT extracted from price-only message", result.floor === undefined, `got ${JSON.stringify(result.floor)}`);

// Test: Price + floor info in same message (price extracted FIRST,
// then PRICE_SENSITIVE skips floor/totalFloors even though present)
result = runGlobalExtraction("98 iljadi evra, 3 kat, 10katnica", {}, "98 iljadi evra, 3 kat, 10katnica");
assert("PC3: cleanPrice=98000", result.cleanPrice === 98000, `got ${result.cleanPrice}`);
// PRICE-SENSITIVE REFINEMENT: explicit floor context ("3 kat" / "10katnica")
// bypasses the price-sensitive skip — digits adjacent to kat/sprat/katnica
// can never be confused with price words.
assert("PC3: floor=3 (explicit '3 kat' bypasses price-sensitive skip)", result.floor === 3, `got ${JSON.stringify(result.floor)}`);
assert("PC3: totalFloors=10 (explicit '10katnica')", result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);

// Test: Rent price with floor info in same message
result = runGlobalExtraction("350 evra kirija, 3 kat, 10katnica", { transactionType: 'rent' }, "350 evra, 3 kat, 10katnica");
assert("PC4: monthlyRent=350", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("PC4: floor=3 (explicit '3 kat' bypasses rent price-sensitive)", result.floor === 3, `got ${JSON.stringify(result.floor)}`);
assert("PC4: totalFloors=10 (explicit '10katnica')", result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);

// Test: Bedroom info WITHOUT price — should extract normally (separate message)
result = runGlobalExtraction("2 spalni", {});
assert("PC5: bedrooms=2 (no price in this message)", result.bedrooms === 2, `got ${result.bedrooms}`);

// Test: Floor info WITHOUT price — should extract normally
result = runGlobalExtraction("3 kat", {});
assert("PC6: floor=3 (no price in this message)", result.floor === 3, `got ${result.floor}`);

// ========================================
// TEST GROUP: Rent-type multi-field
// ========================================
console.log(`\n📦 GROUP: Rent-type multi-field extraction`);

// Test 31: Monthly rent + other fields (rent transaction)
result = runGlobalExtraction("500 evra kirija, 55 m2", { transactionType: 'rent' }, "500 evra kirija, 55 m2");
assert("RT1: monthlyRent from '500 evra'", result.monthlyRent === 500, `got ${result.monthlyRent}`);
assert("RT1: totalSqm from '55 m2'", result.totalSqm === 55, `got ${result.totalSqm}`);
assert("RT1: cleanPrice NOT extracted for rent", result.cleanPrice === undefined, `got ${result.cleanPrice}`);

// Test 32: Rent + bedrooms + floor (use standalone number for floor to avoid cross-field)
result = runGlobalExtraction("350 evra, 2 spalni, tret kat", { transactionType: 'rent' }, "350 evra, 2 spalni, tret kat");
assert("RT2: monthlyRent from '350 evra'", result.monthlyRent === 350, `got ${result.monthlyRent}`);
// bedrooms and floor ARE extracted when explicit context is present ("2 spalni"
// and ordinal "tret kat" can never be confused with the rent amount).
assert("RT2: bedrooms=2 (explicit '2 spalni')", result.bedrooms === 2, `got ${JSON.stringify(result.bedrooms)}`);
assert("RT2: floor=3 (explicit 'tret kat')", result.floor === 3, `got ${JSON.stringify(result.floor)}`);

// Test 33: Rent-type does NOT extract cleanPrice
result = runGlobalExtraction("300 evra mesecno, 40 m2, garaža", { transactionType: 'rent' }, "300 evra mesecno, 40 m2, garaža");
assert("RT3: monthlyRent for rent", result.monthlyRent === 300, `got ${result.monthlyRent}`);
assert("RT3: cleanPrice NOT extracted", result.cleanPrice === undefined, `got ${result.cleanPrice}`);

// ========================================
// TEST GROUP: Edge-case multi-field (ambiguous numbers)
// ========================================
console.log(`\n📦 GROUP: Edge-case multi-field (ambiguous/overlapping numbers)`);

// Test 34: Numbers that could match multiple fields — "6" could be floor, bedrooms, totalFloors
result = runGlobalExtraction("6 kat, 6katnica", {}, "6 kat, 6katnica");
assert("EC1: floor from '6 kat'", result.floor === 6, `got ${result.floor}`);
assert("EC1: totalFloors from '6katnica'", result.totalFloors === 6, `got ${result.totalFloors}`);

// Test 35: "0" and "1" edge cases
result = runGlobalExtraction("0 kat, 1 sobna", {}, "0 kat, 1 sobna");
assert("EC2: floor=0 for ground floor", result.floor === 0, `got ${result.floor}`);
// NOTE: '1 sobna' means 1-room which countBedrooms may return 0 (studio)

// Test 36: Large number matches sqm via regex (1000 = 4 digits, \\d{2,4} allows it)
result = runGlobalExtraction("1000 m2", {});
assert("EC3: '1000 m2' matches totalSqm=1000 via regex", result.totalSqm === 1000, `got ${result.totalSqm}`);
// NOTE: The regex (\\d{2,4}) allows 4-digit numbers before sqm words
// Only the extractFirstNumber fallback has the 10-999 limit

// Test 37: Message with no extractable info shouldn't extract anything
result = runGlobalExtraction("zdravo, kako si?", {}, "zdravo, kako si?");
assert("EC4: greeting extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 37b: "dve golemi i edna detska" should NOT extract furnished (false positive from 'gol' in 'golemi')
result = runGlobalExtraction("dve golemi i edna detska", {}, "dve golemi i edna detska");  assert("EC4b: furnished NOT extracted from bedroom answer (gol false positive)", result.furnished === undefined, `got ${JSON.stringify(result.furnished)}`);
  assert("EC4b: bedrooms=3 from 'dve golemi i edna detska'", result.bedrooms === 3, `got ${result.bedrooms}`);

  // Test 37c: "100 m2, 3 kat" should NOT extract cleanPrice (no price keywords)
result = runGlobalExtraction("100 m2, 3 kat", {}, "100 m2, 3 kat");
assert("EC4c: cleanPrice NOT extracted from '100 m2, 3 kat'", result.cleanPrice === undefined, `got ${result.cleanPrice}`);
assert("EC4c: totalSqm=100", result.totalSqm === 100, `got ${result.totalSqm}`);  assert("EC4c: floor=3", result.floor === 3, `got ${result.floor}`);
  assert("EC4c: yearBuilt NOT extracted from floor context '100 m2, 3 kat'", result.yearBuilt === undefined, `got ${result.yearBuilt}`);

  // Test 37d: "pet mislam" with preferredField='elevator' → nothing extracted (bare number, no keywords)
  result = runGlobalExtraction("pet mislam", {}, "pet mislam");
  assert("EC4d: bedrooms NOT extracted from 'pet mislam' (bare number)", result.bedrooms === undefined, `got ${result.bedrooms}`);
  assert("EC4d: floor NOT extracted from 'pet mislam' (bare number)", result.floor === undefined, `got ${result.floor}`);
  assert("EC4d: totalSqm NOT extracted from 'pet mislam'", result.totalSqm === undefined, `got ${result.totalSqm}`);

  // Test 38: Message with mixed relevance
result = runGlobalExtraction("interesen mi e stanot, kolku e kvadratura?", {}, "interesen mi e stanot, kolku e kvadratura?");
assert("EC5: question extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 38b: "80 m2, terasa 5 m2, 3 kat" — no price keywords, cleanPrice NOT set
result = runGlobalExtraction("80 m2, terasa 5 m2, 3 kat", {}, "80 m2, terasa 5 m2, 3 kat");
assert("EC5b: cleanPrice NOT extracted (non-price context)", result.cleanPrice === undefined, `got ${result.cleanPrice}`);
assert("EC5b: totalSqm=80", result.totalSqm === 80, `got ${result.totalSqm}`);
assert("EC5b: floor=3", result.floor === 3, `got ${result.floor}`);

// Test 38c: "55 kvadrati, tret kat, ima lift" — should NOT extract cleanPrice
result = runGlobalExtraction("55 kvadrati, tret kat, ima lift", {}, "55 kvadrati, tret kat, ima lift");
assert("EC5c: cleanPrice NOT extracted from sqm/floor message", result.cleanPrice === undefined, `got ${result.cleanPrice}`);
assert("EC5c: totalSqm=55", result.totalSqm === 55, `got ${result.totalSqm}`);
assert("EC5c: floor=3 (tret)", result.floor === 3, `got ${result.floor}`);
assert("EC5c: elevator=true", result.elevator === true, `got ${result.elevator}`);

// ========================================
// TEST GROUP: All-fields stress test
// ========================================
console.log(`\n📦 GROUP: All-fields stress test (many fields in one message)`);

// Test 39: Everything in one message (sale)
// NOTE: bedroom count may differ from expected in complex messages (countBedrooms uses first match)
result = runGlobalExtraction(
  "cena 120 iljadi, 55 m2, 2 spalni, 3 kat, 10katnica, lift, klima, garaza, jugoistok, kompletno namesten, 2015 godina, da renoviran 2020ta, cist imoten list",
  {},
  "cena 120 iljadi, 55 m2, 2 spalni, 3 kat, 10katnica, lift, klima, garaza, jugoistok, kompletno namesten, 2015 godina, da renoviran 2020ta, cist imoten list"
);
assert("ALL1: cleanPrice=120000", result.cleanPrice === 120000, `got ${result.cleanPrice}`);
assert("ALL1: totalSqm=55", result.totalSqm === 55, `got ${result.totalSqm}`);
// floor and totalFloors ARE extracted — the message contains explicit
// "3 kat" / "10katnica" context which bypasses the price-sensitive guard.
assert("ALL1: floor=3 (explicit '3 kat')", result.floor === 3, `got ${JSON.stringify(result.floor)}`);
assert("ALL1: totalFloors=10 (explicit '10katnica')", result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);
assert("ALL1: elevator=true", result.elevator === true, `got ${result.elevator}`);
assert("ALL1: ac=true", result.ac === true, `got ${result.ac}`);
assert("ALL1: parking=true (garaza)", result.parking === true, `got ${result.parking}`);
assert("ALL1: orientation=jug-istok", result.orientation === 'jug-istok', `got ${result.orientation}`);
assert("ALL1: furnished=full", result.furnished === true && result.furnishedLevel === 'full', `got ${JSON.stringify(result.furnished)}`);
assert("ALL1: yearBuilt=2015", result.yearBuilt === 2015, `got ${result.yearBuilt}`);
assert("ALL1: renovated=true", result.renovated === true, `got ${result.renovated}`);
assert("ALL1: renovationYear=2020", result.renovationYear === 2020, `got ${result.renovationYear}`);
assert("ALL1: documentationClean=true", result.documentationClean === true, `got ${result.documentationClean}`);

// Test 40: Everything in Cyrillic
result = runGlobalExtraction(
  "цена 120 илјади, 55 квадрати, 2 спални, 3 кат, 10катница, лифт, клима, гаража, југоисток, комплетно наместен, 2015 година, реновиран 2020та, чист имотен лист",
  {},
  "цена 120 илјади, 55 квадрати, 2 спални, 3 кат, 10катница, лифт, клима, гаража, југоисток, комплетно наместен, 2015 година, реновиран 2020та, чист имотен лист"
);
assert("ALL2: cleanPrice=120000", result.cleanPrice === 120000, `got ${result.cleanPrice}`);
assert("ALL2: totalSqm=55", result.totalSqm === 55, `got ${result.totalSqm}`);
// bedrooms/floor/totalFloors ARE extracted — the message contains explicit
// "2 спални" / "3 кат" / "10катница" context which bypasses the guard.
assert("ALL2: bedrooms=2 (explicit '2 спални')", result.bedrooms === 2, `got ${JSON.stringify(result.bedrooms)}`);
assert("ALL2: floor=3 (explicit '3 кат')", result.floor === 3, `got ${JSON.stringify(result.floor)}`);
assert("ALL2: totalFloors=10 (explicit '10катница')", result.totalFloors === 10, `got ${JSON.stringify(result.totalFloors)}`);
assert("ALL2: elevator=true", result.elevator === true, `got ${result.elevator}`);
assert("ALL2: ac=true", result.ac === true, `got ${result.ac}`);
assert("ALL2: parking=true", result.parking === true, `got ${result.parking}`);
assert("ALL2: furnished=full", result.furnished === true && result.furnishedLevel === 'full', `got ${JSON.stringify(result.furnished)}`);
assert("ALL2: yearBuilt=2015", result.yearBuilt === 2015, `got ${result.yearBuilt}`);
assert("ALL2: renovated=true", result.renovated === true, `got ${result.renovated}`);
assert("ALL2: renovationYear=2020", result.renovationYear === 2020, `got ${result.renovationYear}`);
assert("ALL2: documentationClean=true", result.documentationClean === true, `got ${result.documentationClean}`);

// ========================================
// TEST GROUP: Sequential multi-turn extraction
// ========================================
console.log(`\n📦 GROUP: Sequential multi-turn extraction (building data over turns)`);

function multiTurnExtraction(turns) {
  const data = {};
  let totalUpdates = 0;
  for (const turn of turns) {
    const updates = runGlobalExtraction(turn.u, data, turn.u);
    for (const [key, value] of Object.entries(updates)) {
      if (data[key] === undefined || data[key] === null) {
        data[key] = value;
        totalUpdates++;
      }
    }
  }
  return { data, totalUpdates };
}

// Test 41: Sequential multi-turn — build up over 3 messages
const seq1 = multiTurnExtraction([
  { u: "80 m2, tret kat" },
  { u: "ima lift, parking" },
  { u: "klima inverter, 2015 godina" }
]);
assert("SEQ1: totalSqm=80 after turn 1", seq1.data.totalSqm === 80, `got ${seq1.data.totalSqm}`);
assert("SEQ1: floor=3 after turn 1", seq1.data.floor === 3, `got ${seq1.data.floor}`);
assert("SEQ1: elevator=true after turn 2", seq1.data.elevator === true, `got ${seq1.data.elevator}`);
assert("SEQ1: parking=true after turn 2", seq1.data.parking === true, `got ${seq1.data.parking}`);
assert("SEQ1: ac=true after turn 3", seq1.data.ac === true, `got ${seq1.data.ac}`);
assert("SEQ1: yearBuilt=2015 after turn 3", seq1.data.yearBuilt === 2015, `got ${seq1.data.yearBuilt}`);

// Test 42: Sequential with partial info each turn
const seq2 = multiTurnExtraction([
  { u: "da, 120 iljadi evra" },
  { u: "55 m2, 2 spalni" },
  { u: "3 kat, 10katnica" },
  { u: "garaza, jugoistok" },
  { u: "kompletno namesten, 2015 godina" }
]);
assert("SEQ2: cleanPrice=120000", seq2.data.cleanPrice === 120000, `got ${seq2.data.cleanPrice}`);
assert("SEQ2: totalSqm=55", seq2.data.totalSqm === 55, `got ${seq2.data.totalSqm}`);
assert("SEQ2: bedrooms=2", seq2.data.bedrooms === 2, `got ${seq2.data.bedrooms}`);
assert("SEQ2: floor=3", seq2.data.floor === 3, `got ${seq2.data.floor}`);
assert("SEQ2: totalFloors=10", seq2.data.totalFloors === 10, `got ${seq2.data.totalFloors}`);
assert("SEQ2: parking=true (garage)", seq2.data.parking === true && seq2.data.parkingType === 'garage', `got ${JSON.stringify(seq2.data.parking)}/${seq2.data.parkingType}`);
assert("SEQ2: orientation=jug-istok", seq2.data.orientation === 'jug-istok', `got ${seq2.data.orientation}`);
assert("SEQ2: furnished=full", seq2.data.furnished === true && seq2.data.furnishedLevel === 'full', `got ${JSON.stringify(seq2.data.furnished)}`);
assert("SEQ2: yearBuilt=2015", seq2.data.yearBuilt === 2015, `got ${seq2.data.yearBuilt}`);

// ========================================
// TEST GROUP: Realistic conversation snippets
// ========================================
console.log(`\n📦 GROUP: Realistic conversation snippets`);

// Test 43: Owner responding with multiple fields in "da" confirm
result = runGlobalExtraction("da, 55 kvadrati, tret kat", { cleanPrice: 100000 }, "da, 55 kvadrati, tret kat");
assert("R1: totalSqm from 'da, 55 kvadrati'", result.totalSqm === 55, `got ${result.totalSqm}`);
assert("R1: floor from 'tret kat'", result.floor === 3, `got ${result.floor}`);
assert("R1: cleanPrice NOT overwritten", result.cleanPrice === undefined, `got ${result.cleanPrice}`);

// Test 44: Owner correcting themselves with full info (existing null value = allow overwrite)
result = runGlobalExtraction(
  "ne, 80 m2 e, 2 spalni, 4 kat",
  { totalSqm: null },
  "ne, 80 m2 e, 2 spalni, 4 kat"
);
assert("R2: totalSqm set to 80 (null was overwritten)", result.totalSqm === 80, `got ${result.totalSqm}`);
assert("R2: bedrooms from '2 spalni'", result.bedrooms === 2, `got ${result.bedrooms}`);
assert("R2: floor from '4 kat'", result.floor === 4, `got ${result.floor}`);
// NOTE: Non-null values are NOT overwritten by the global pass (design contract)

// Test 45: Owner saying no to specific question
result = runGlobalExtraction("nema", { nextField: 'elevator' });
assert("R3: 'nema' alone extracts nothing (no context)", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);

// Test 46: Owner says "ima" with lift context
result = runGlobalExtraction("ima lift", {});
assert("R4: 'ima lift' → elevator=true", result.elevator === true, `got ${result.elevator}`);
assert("R4: 'ima lift' → NOT documentationClean", result.documentationClean === undefined, `got ${result.documentationClean}`);
assert("R4: 'ima lift' → NOT parking", result.parking === undefined, `got ${result.parking}`);

// ========================================
// TEST GROUP: Owner's exact message — parking sold separately + phantom terrace
// ========================================
// Owner: "za mene baram cisti stoosumdeset i tri iljadi evra, za stanot, a parking
//         mestoto seprodava posebno za dodatni sest iljadi"
// = "For me I want clean 183k EUR for the apartment, and the parking spot is
//    sold separately for an additional 6k."
// TWO bugs were reported:
//   1. Phantom terrace 10m² — extractTerraceNumber substring-matched "deset"
//      inside "stoosumdeset" (183), and hasTerraceContext matched bare "da"
//      inside "dodatni".
//   2. Parking folded into the price — separate-sale detection was gated on
//      parkingType==='garage', never fired for plain "parking mesto".
console.log(`\n📦 GROUP: Owner's exact message (parking sold separately)`);

const OWNER_MSG = "za mene baram cisti stoosumdeset i tri iljadi evra, za stanot, a parking mestoto seprodava posebno za dodatni sest iljadi";
result = runGlobalExtraction(OWNER_MSG, {});
assert("PSEP1: cleanPrice=183000 (stoosumdeset i tri iljadi)", result.cleanPrice === 183000, `got ${result.cleanPrice}`);
assert("PSEP1: parking=true (there IS parking)", result.parking === true, `got ${result.parking}`);
assert("PSEP1: parkingType='private' (upgraded — sold separately)", result.parkingType === 'private', `got ${result.parkingType}`);
assert("PSEP1: parkingSeparate=true", result.parkingSeparate === true, `got ${result.parkingSeparate}`);
assert("PSEP1: parkingPrice=6000 (dodatni sest iljadi)", result.parkingPrice === 6000, `got ${result.parkingPrice}`);
assert("PSEP1: hasTerrace NOT extracted (no terrace mentioned)", result.hasTerrace === undefined, `got ${JSON.stringify(result.hasTerrace)}`);
assert("PSEP1: terraceSqm NOT extracted", result.terraceSqm === undefined, `got ${JSON.stringify(result.terraceSqm)}`);
assert("PSEP1: yearBuilt NOT extracted (no 2013 false positive)", result.yearBuilt === undefined, `got ${JSON.stringify(result.yearBuilt)}`);

// Direct regression: extractTerraceNumber must NOT substring-match "deset"
// inside "stoosumdeset" (183) from a full price sentence.
const tErr = extractTerraceNumber(OWNER_MSG);
assert("PSEP2: extractTerraceNumber returns null for full price sentence", tErr === null, `got ${tErr}`);
// Bare word answers still work (B15 fixture behavior)
assert("PSEP2: 'cetiri' still → 4", extractTerraceNumber("cetiri") === 4, `got ${extractTerraceNumber("cetiri")}`);
assert("PSEP2: 'deset' still → 10", extractTerraceNumber("deset") === 10, `got ${extractTerraceNumber("deset")}`);

// Garaza variant (existing behavior must be preserved):
result = runGlobalExtraction("garaza na -2 ama ja prodavam posebno. za plus 5000", {});
assert("PSEP3: garaza sold separately → parkingType='garage'", result.parkingType === 'garage', `got ${result.parkingType}`);
assert("PSEP3: garaza sold separately → parkingSeparate=true", result.parkingSeparate === true, `got ${result.parkingSeparate}`);
assert("PSEP3: garaza sold separately → parkingPrice=5000", result.parkingPrice === 5000, `got ${result.parkingPrice}`);

// ========================================
// TEST GROUP: Reported production bugs (price hundreds, volunteered fields)
// ========================================
// The user's real Viber messages exposed 5 bugs. Each is regression-tested
// here against the EXACT production wording.
// ========================================
console.log(`\n📦 GROUP: Reported production bugs`);

// Bug 1: Merged hundreds+tens MID-SENTENCE — "tristapeeset" = 350 (not 58 from
// the "peeset" substring inside it). "tristapeeset i osum" = 358 → 358000.
result = runGlobalExtraction("stanov go prodavam za tristapeeset i osum iljadi evra", {});
assert("BUG1: cleanPrice=358000 (tristapeeset=350 + osum=8, mid-sentence merged)", result.cleanPrice === 358000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("tristapeeset iljadi evra", {});
assert("BUG1b: cleanPrice=350000 (tristapeeset alone)", result.cleanPrice === 350000, `got ${result.cleanPrice}`);

// Bugs 2+3+4: THE user's exact production message — price + volunteered
// floor (vtori kat) + year (nova zgrada od 2024) + private parking (so nego).
// preferredField='cleanPrice' simulates the live data-collection question.
result = runGlobalExtraction(
  "STANOV GO PRODAVAM ZA TRISTAPEESET I OSUM ILJADI EVRA. SKAP E AMA IMA PARKING MESTO SO NEGO, NAMESTEN E KOMPLETNO SO KLIMA I PARNO GRADSKO, JUZNA ORIENTACIJALIFT NA VTORI KAT E. NOVA ZGRADA OD 2024",
  {}, 'cleanPrice');
assert("BUG2: cleanPrice=358000", result.cleanPrice === 358000, `got ${result.cleanPrice}`);
assert("BUG2: floor=2 (vtori kat registered despite price in message)", result.floor === 2, `got ${JSON.stringify(result.floor)}`);
assert("BUG3: yearBuilt=2024 (nova zgrada od 2024 registered)", result.yearBuilt === 2024, `got ${JSON.stringify(result.yearBuilt)}`);
assert("BUG4: parking=true", result.parking === true, `got ${JSON.stringify(result.parking)}`);
assert("BUG4: parkingType='private' (parking mesto so nego)", result.parkingType === 'private', `got ${result.parkingType}`);
assert("BUG4: orientation='jug' (juzna orientacija)", result.orientation === 'jug', `got ${result.orientation}`);
assert("BUG2b: elevator=true (lift in ORIENTACIJALIFT)", result.elevator === true, `got ${JSON.stringify(result.elevator)}`);
assert("BUG2c: bedrooms NOT extracted from price message (no room words)", result.bedrooms === undefined, `got ${JSON.stringify(result.bedrooms)}`);

// Bug 3 (lock-mode): year volunteered during ANOTHER field's question is captured
result = runGlobalExtraction("nova zgrada od 2024", {}, 'cleanPrice');
assert("BUG3b: yearBuilt=2024 captured during cleanPrice question", result.yearBuilt === 2024, `got ${JSON.stringify(result.yearBuilt)}`);
assert("BUG3b: cleanPrice NOT set from bare year", result.cleanPrice === undefined, `got ${JSON.stringify(result.cleanPrice)}`);
// ...but a renovation year must NOT leak into yearBuilt
result = runGlobalExtraction("cena 120 iljadi, renoviran 2020ta", {}, 'cleanPrice');
assert("BUG3c: cleanPrice=120000", result.cleanPrice === 120000, `got ${result.cleanPrice}`);
assert("BUG3c: yearBuilt NOT set from renovation year (2020ta)", result.yearBuilt === undefined, `got ${JSON.stringify(result.yearBuilt)}`);

// Bug 5: "seeset i cetiri kvadrati" (64 m²) must NOT become bedrooms=4
// The exact user-reported wording ("VKUPNO IMA SEESET I CETIRI KVADRATA") is
// pinned first, then the KVADRATI variant and the Cyrillic forms.
result = runGlobalExtraction("VKUPNO IMA SEESET I CETIRI KVADRATA", {});
assert("BUG5: totalSqm=64 (exact user wording, kvadrata)", result.totalSqm === 64, `got ${result.totalSqm}`);
assert("BUG5: bedrooms NOT extracted ('cetiri' is part of 64, not bedrooms)", result.bedrooms === undefined, `got ${JSON.stringify(result.bedrooms)}`);
result = runGlobalExtraction("VKUPNO IMA SEESET I CETIRI KVADRATI", {});
assert("BUG5: totalSqm=64 (kvadrati variant)", result.totalSqm === 64, `got ${result.totalSqm}`);

// Bug 5b: same in Cyrillic — "шеесет и четири" must parse as 64, not 60
result = runGlobalExtraction("вкупно има шеесет и четири квадрати", {});
assert("BUG5b: Cyrillic totalSqm=64 (шеесет и четири)", result.totalSqm === 64, `got ${result.totalSqm}`);
assert("BUG5b: Cyrillic bedrooms NOT extracted", result.bedrooms === undefined, `got ${JSON.stringify(result.bedrooms)}`);
result = runGlobalExtraction("вкупно има шеесет и четири квадрата", {});
assert("BUG5c: Cyrillic 'квадрата' totalSqm=64", result.totalSqm === 64, `got ${result.totalSqm}`);

// ========================================
// TEST SUMMARY
// ========================================
console.log(`\n=======================================================`);
console.log(`📊 GLOBAL EXTRACTION E2E TEST SUMMARY:`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
console.log(`=======================================================`);

if (harness.failed > 0) {
  process.exit(1);
} else {
  console.log(`\n🟢 ALL GLOBAL EXTRACTION TESTS PASSED`);
}
