import { createHarness } from './test-helpers.js';
// ========================================
// GLOBAL EXTRACTION PASS — E2E Simulation
// ========================================
// Tests the NEW global extraction pass without needing LLM calls.
// Validates that multi-field messages like "80 kvadrati, tret kat, ima lift"
// extract all three fields in one pass.
// ========================================
import { runGlobalExtraction, assessConfidence, scanHistoryForField } from './data-collector.js';
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

// Test: THE reported message — "seese i osum kvadrata so terasa golema"
// (68 m² total with a large terrace, "seese" = Viber-shortened "seeset" = 60).
// THREE bugs were reported on this exact message:
//   1. totalSqm NOT registered — parseNumberWords didn't know the truncated
//      tens form "seese" (60), so the compound "seese i osum" (60+8=68)
//      never parsed.
//   2. bedrooms=8 phantom — countBedrooms' roomSegments branch split on
//      " i " and read the loose "osum" from "osum kvadrata" as a bedroom.
//   3. terraceSqm=8 phantom — extractTerraceNumber crowned "osum" (total
//      sqm, glued to "kvadrata") as the "best context" terrace candidate.
result = runGlobalExtraction("seese i osum kvadrata so terasa golema", {});
assert("N8: 'seese i osum kvadrata so terasa golema' → totalSqm=68 (seese=60 + osum=8)", result.totalSqm === 68, `got ${result.totalSqm}`);
assert("N8: bedrooms NOT extracted from the sqm phrase", result.bedrooms === undefined, `got ${JSON.stringify(result.bedrooms)}`);
assert("N8: hasTerrace NOT extracted (no terrace SIZE given)", result.hasTerrace === undefined, `got ${JSON.stringify(result.hasTerrace)}`);
assert("N8: terraceSqm NOT extracted", result.terraceSqm === undefined, `got ${JSON.stringify(result.terraceSqm)}`);
// Truncated-tens family — "seese i osum" alone, and its Cyrillic/full cousins
result = runGlobalExtraction("seese i osum kvadrati", {});
assert("N8b: 'seese i osum kvadrati' → totalSqm=68", result.totalSqm === 68, `got ${result.totalSqm}`);
result = runGlobalExtraction("peese i pet kvadrati", {});
assert("N8c: 'peese i pet kvadrati' → totalSqm=55 (peese=50 + pet=5)", result.totalSqm === 55, `got ${result.totalSqm}`);
result = runGlobalExtraction("dvaese i tri kvadrati", {});
assert("N8d: 'dvaese i tri kvadrati' → totalSqm=23 (dvaese=20 + tri=3)", result.totalSqm === 23, `got ${result.totalSqm}`);
// CONTROLS — the truncated form must NOT substring-match inside full forms or
// unrelated words:
//   a) "seese" ⊂ "seesetipet" — the full merged form keeps 65, not 65+60.
//   b) "ese" must never fire inside "trinaese" — no phantom 60 (→ null, and
//      with no sqm keyword match the field stays unset).
//   c) "seeset kvadrati" keeps 60 (full form unaffected).
result = runGlobalExtraction("seesetipet kvadrati", {});
assert("N8e: 'seesetipet kvadrati' → totalSqm=65 (merged form, no truncated double-count)", result.totalSqm === 65, `got ${result.totalSqm}`);
// TRUNCATED TEENS (reported, lead 3571074: "na peti od dvanaese" →
// totalFloors=2 because "dvanaese" (12) was missing from the parsers and the
// substring scan fell through to "dva"→2). The whole teens family now
// parses, so "trinaese kvadrati" (13 m²) extracts 13 — while the phantom
// "ese"→60 leak stays blocked (the exact teens match runs first).
result = runGlobalExtraction("trinaese kvadrati", {});
assert("N8e2: 'trinaese kvadrati' → totalSqm=13 (truncated teen parses, NOT 60)", result.totalSqm === 13, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("seeset kvadrati", {});
assert("N8f: 'seeset kvadrati' → totalSqm=60 (full form unaffected)", result.totalSqm === 60, `got ${result.totalSqm}`);

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

// BOUND-PHRASE DIGIT FIX (reported): "pred 4 godini" (4 years ago) must use
// the digit bound to "pred" — NOT the first digit anywhere in the message.
// The HISTORY-SCAN path (scanHistoryForField joins ALL owner messages) feeds
// the extractor joined text like "260 evra | pred 4 godini"; the old
// `u.match(/\d+/)` grabbed "260" (the rent price) and computed
// currentYear−260 → an absurd year (1766), so the owner's "pred 4 godini"
// answer to the renovation-year question was stored WRONG (reported: year
// caught wrong). Both extractRenovated and extractRenovationYear now capture
// the number inside the pred/pri phrase itself.
const relYear = new Date().getFullYear() - 4;
result = runGlobalExtraction("260 evra | pred 4 godini", { transactionType: 'rent' });
assert("E9b: joined history '260 evra | pred 4 godini' → renovationYear = currentYear−4 (bound digit, not 260)",
  result.renovationYear === relYear, `got ${result.renovationYear}, expected ${relYear}`);
// The renovationYear fallback path (renovated already true — the reported
// two-message exchange "da" then "pred 4 godini"): joined history must also
// use the bound digit.
result = runGlobalExtraction("260 evra | pred 4 godini", { transactionType: 'rent', renovated: true });
assert("E9c: renovationYear fallback with joined history also uses the bound digit",
  result.renovationYear === relYear, `got ${result.renovationYear}, expected ${relYear}`);
// Cyrillic bound-digit form: "пред 4 години" after a rent price.
result = runGlobalExtraction("260 евра | пред 4 години", { transactionType: 'rent' });
assert("E9d: Cyrillic 'пред 4 години' joined → currentYear−4",
  result.renovationYear === relYear, `got ${result.renovationYear}, expected ${relYear}`);

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

// Test 33b: THE reported bug — "go izdavam za 350 evra so parking e, klima i parno"
// (I rent it for 350€ with parking, AC and heating). Two fixes:
//   1. monthlyRent=350 must be HIGH confidence (0.95) — the rent verb "izdavam"
//      was NOT in the monthlyRent keyword list, so a clear direct answer scored
//      MEDIUM (0.60) and triggered an unnecessary "Само да потврдам" re-ask.
//   2. parkingType must be 'private' — "so parking" (parking comes WITH the
//      unit/rent, i.e. a dedicated spot for the apartment, not street parking)
//      previously defaulted to public.
result = runGlobalExtraction("go izdavam za 350 evra so parking e, klima i parno", { transactionType: 'rent' }, "go izdavam za 350 evra so parking e, klima i parno");
assert("RT3b: monthlyRent=350 (izdavam verb)", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("RT3b: cleanPrice NOT extracted for rent", result.cleanPrice === undefined, `got ${result.cleanPrice}`);
assert("RT3b: parking=true (so parking)", result.parking === true, `got ${JSON.stringify(result.parking)}`);
assert("RT3b: parkingType='private' (parking comes with the unit)", result.parkingType === 'private', `got ${result.parkingType}`);
assert("RT3b: ac=true (klima)", result.ac === true, `got ${JSON.stringify(result.ac)}`);
// Confidence fixes:
assert("RT3b: monthlyRent confidence HIGH (izdavam = clear rent verb)",
  assessConfidence('monthlyRent', 350, 'go izdavam za 350 evra so parking e, klima i parno') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, 'go izdavam za 350 evra so parking e, klima i parno')}`);
assert("RT3b: parkingType confidence HIGH (derived sub-key)",
  assessConfidence('parkingType', 'private', 'go izdavam za 350 evra so parking e') === 'HIGH',
  `got ${assessConfidence('parkingType', 'private', 'go izdavam za 350 evra so parking e')}`);

// Cyrillic variants of the same rent-verb + with-parking fix
result = runGlobalExtraction("го издавам за 350 евра со паркинг, клима и парно", { transactionType: 'rent' }, "го издавам за 350 евра со паркинг, клима и парно");
assert("RT3c: Cyrillic monthlyRent=350 (издавам)", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("RT3c: Cyrillic parkingType='private' (со паркинг)", result.parkingType === 'private', `got ${result.parkingType}`);
assert("RT3c: Cyrillic ac=true (клима)", result.ac === true, `got ${JSON.stringify(result.ac)}`);
assert("RT3c: Cyrillic monthlyRent confidence HIGH",
  assessConfidence('monthlyRent', 350, 'го издавам за 350 евра со паркинг') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, 'го издавам за 350 евра со паркинг')}`);

// Test 33d: THE reported message — "350 evra + reziski trosoci" (350€ + utility
// bills) is a CLEAR direct answer to "Која е месечната кирија?", but scored
// MEDIUM (0.60) because "evra"/"reziski" were NOT in the monthlyRent keyword
// list → Ana asked "Дали точната вредност е 350?" despite the clear answer.
// Fix: currency (evra/евра/evro/евро/eur) and utilities (reziski/режиски)
// words are unambiguous rent markers → HIGH (0.95), stored immediately.
result = runGlobalExtraction("350 evra + reziski trosoci", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3d: monthlyRent=350 from '350 evra + reziski trosoci'", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("RT3d: cleanPrice NOT extracted for rent", result.cleanPrice === undefined, `got ${result.cleanPrice}`);
assert("RT3d: monthlyRent confidence HIGH (evra = clear currency marker)",
  assessConfidence('monthlyRent', 350, '350 evra + reziski trosoci') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350 evra + reziski trosoci')}`);
// Cyrillic: "350 евра + режиски трошоци"
result = runGlobalExtraction("350 евра + режиски трошоци", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3d2: Cyrillic monthlyRent=350", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("RT3d2: Cyrillic monthlyRent confidence HIGH",
  assessConfidence('monthlyRent', 350, '350 евра + режиски трошоци') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350 евра + режиски трошоци')}`);
// Utilities-only variant (no currency word): "350 reziski" is still a rent answer
assert("RT3d3: '350 reziski' confidence HIGH (reziski = utilities)",
  assessConfidence('monthlyRent', 350, '350 reziski') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, '350 reziski')}`);
// CONTROL: a bare number without currency stays MEDIUM → confirmation re-ask preserved
assert("RT3d4: bare '350' stays MEDIUM (confirmation preserved)",
  assessConfidence('monthlyRent', 350, '350') === 'MEDIUM',
  `got ${assessConfidence('monthlyRent', 350, '350')}`);

// Test 33e2: COMPRESSED HUNDRED-WORD RENT (reported): the owner answered the
// rent question with "CETRSTOPEESET" — the compressed Viber form of
// "четиристо пеесет" (400 + 50 = 450), dropping the i's from "четиристо".
// parseNumberWords previously read the "stopeeset" substring (150) inside it
// and extractPrice had no bare word-number path at all → monthlyRent was
// never extracted and the field was SKIPPED after the 2-attempt cap ("SKIP:
// monthlyRent — max attempts reached (2), owner not providing answer,
// storing null"). Now: 450 extracted, MEDIUM confidence (confirmation net
// preserved for a genuinely new price, like bare "350").
result = runGlobalExtraction("CETRSTOPEESET", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f: monthlyRent=450 from compressed 'CETRSTOPEESET' (четирсто пеесет)", result.monthlyRent === 450, `got ${JSON.stringify(result.monthlyRent)}`);
assert("RT3f: cleanPrice NOT extracted for rent", result.cleanPrice === undefined, `got ${JSON.stringify(result.cleanPrice)}`);
assert("RT3f: compressed word rent scores MEDIUM (confirmation preserved)",
  assessConfidence('monthlyRent', 450, 'CETRSTOPEESET') === 'MEDIUM',
  `got ${assessConfidence('monthlyRent', 450, 'CETRSTOPEESET')}`);
// Variant spellings of the 400 root (dropped-i, h-initial, Cyrillic compressed)
result = runGlobalExtraction("cetiristotini", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f2: monthlyRent=400 from 'cetiristotini'", result.monthlyRent === 400, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("chetiristotini", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f3: monthlyRent=400 from h-initial 'chetiristotini'", result.monthlyRent === 400, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("четирсто пеесет", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f4: monthlyRent=450 from Cyrillic compressed 'четирсто пеесет'", result.monthlyRent === 450, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("cetrsto", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f5: monthlyRent=400 from bare compressed 'cetrsto'", result.monthlyRent === 400, `got ${JSON.stringify(result.monthlyRent)}`);
// With currency the compressed form scores HIGH like any evra-bound price
assert("RT3f6: 'cetrstopeeset evra' scores HIGH (currency marker)",
  assessConfidence('monthlyRent', 450, 'cetrstopeeset evra') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 450, 'cetrstopeeset evra')}`);
// SAFETY: small bare word-numbers must NOT become prices (bedrooms/floors
// answering the rent question would be nonsense)
result = runGlobalExtraction("tri", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f7: bare 'tri' NOT extracted as rent", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("sedum", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3f8: bare 'sedum' NOT extracted as rent", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
// GUARDS (code review): the bare word-price path must NEVER shadow an
// explicit digit price nor misread a word number that belongs to another
// field (sqm/rooms) even when a price keyword appears in the sentence.
result = runGlobalExtraction("300 evra, dvesta", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3g: '300 evra, dvesta' → 300 (digit price wins, word NOT shadowing)", result.monthlyRent === 300, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("kirijata e dogovor, ima dvesta kvadrati", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3g2: 'kirijata e dogovor, ima dvesta kvadrati' → NOT extracted (dvesta is sqm)", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("go izdavam za dvesta evra", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3g3: 'go izdavam za dvesta evra' → 200 (real word rent with keyword)", result.monthlyRent === 200, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("dvesta spalni", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3g4: 'dvesta spalni' NOT extracted as rent (room count)", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);

// Test 33h: CURRENCY-BOUND WORD PRICE (reported, lead 3571074): the owner
// answered "Колкава е месечната кирија?" with "cetrsto dvaeset evra +
// davacki , parking poc" (420€ + fees, POC parking) — a clear word price with
// VOLUNTEERED extras. The global hasNonPriceContext guard ("parking" is a
// non-price word) used to block the bare word-price path entirely, so the
// FIRST ask collected nothing → confirmatory re-ask ("Само да потврдам,
// колкава е месечната кирија?") → owner annoyed ("ti kazav cetrsto dvaeset
// evra mesecno"). A number-word phrase DIRECTLY followed by a currency word
// is an unambiguous price and extracts BEFORE the guard.
result = runGlobalExtraction("cetrsto dvaeset evra + davacki , parking poc", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h: 'cetrsto dvaeset evra + davacki , parking poc' → monthlyRent=420 (currency-bound word price)", result.monthlyRent === 420, `got ${JSON.stringify(result.monthlyRent)}`);
assert("RT3h: cleanPrice NOT extracted for rent", result.cleanPrice === undefined, `got ${JSON.stringify(result.cleanPrice)}`);
assert("RT3h: monthlyRent confidence HIGH (evra currency marker → no re-ask)",
  assessConfidence('monthlyRent', 420, 'cetrsto dvaeset evra + davacki , parking poc') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 420, 'cetrsto dvaeset evra + davacki , parking poc')}`);
// Cyrillic twin — "четирсто дваесет евра + давачки , паркинг"
result = runGlobalExtraction("четирсто дваесет евра + давачки , паркинг", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h2: Cyrillic 'четирсто дваесет евра + давачки , паркинг' → monthlyRent=420", result.monthlyRent === 420, `got ${JSON.stringify(result.monthlyRent)}`);
assert("RT3h2: Cyrillic monthlyRent confidence HIGH",
  assessConfidence('monthlyRent', 420, 'четирсто дваесет евра + давачки , паркинг') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 420, 'четирсто дваесет евра + давачки , паркинг')}`);
// The volunteer extras still extract normally (parking keyword → true)
assert("RT3h3: parking=true volunteered in the same message", result.parking === true, `got ${JSON.stringify(result.parking)}`);
// GUARD: a non-price noun immediately BEFORE the word phrase binds the number
// to that noun — "terasa e cetrsto evra" (the terrace is 400€) is a TERRACE
// price, never a rent; the currency-bound reading must reject it. The
// definite-article forms ("terasata e cetrsto evra" = THE terrace is 400€)
// are listed in the noun guard too, so they reject identically.
result = runGlobalExtraction("terasa e cetrsto evra", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h4: 'terasa e cetrsto evra' NOT extracted as rent (terrace price, noun-bound)", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
result = runGlobalExtraction("terasata e cetrsto evra", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h4b: 'terasata e cetrsto evra' NOT extracted (definite-article terrace form)", result.monthlyRent === undefined, `got ${JSON.stringify(result.monthlyRent)}`);
// CONTRAST CONTROL (reviewer finding): the RENT noun ("kirijata") is NOT a
// non-price noun — "kirijata e cetrsto evra" (the rent IS 400€) is a genuine
// direct rent answer and MUST extract 400. If someone later adds kirija to
// the noun guard, this test pins the regression.
result = runGlobalExtraction("kirijata e cetrsto evra", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h5: 'kirijata e cetrsto evra' → monthlyRent=400 (rent noun NOT blocked)", result.monthlyRent === 400, `got ${JSON.stringify(result.monthlyRent)}`);
// Dialectal currency plural "evri"/"еври" unlocks the same currency-bound path
result = runGlobalExtraction("cetrsto evri + parking", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3h6: 'cetrsto evri + parking' → monthlyRent=400 (dialectal evri currency)", result.monthlyRent === 400, `got ${JSON.stringify(result.monthlyRent)}`);

// Test 33e: UTILITIES-FIRST GUARD — "reziski se 50 evra, kirijata 350"
// (utilities are 50€, the rent is 350). extractPrice grabs the FIRST number,
// and "evra" now scores the result HIGH — without a strip, monthlyRent=50
// would be stored at 0.95 with no confirmation net. extractMonthlyRent must
// remove the utilities clause before extracting so the RENT number wins.
result = runGlobalExtraction("reziski se 50 evra, kirijata 350", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3e: monthlyRent=350 (utilities 50 NOT grabbed as rent)", result.monthlyRent === 350, `got ${result.monthlyRent}`);
assert("RT3e: monthlyRent confidence HIGH (evra present)",
  assessConfidence('monthlyRent', 350, 'reziski se 50 evra, kirijata 350') === 'HIGH',
  `got ${assessConfidence('monthlyRent', 350, 'reziski se 50 evra, kirijata 350')}`);
// Cyrillic: "режиски се 50 евра, киријата 350"
result = runGlobalExtraction("режиски се 50 евра, киријата 350", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3e2: Cyrillic monthlyRent=350 (utilities 50 NOT grabbed)", result.monthlyRent === 350, `got ${result.monthlyRent}`);
// Number-before-utilities: "350 + reziski 50 evra" → rent 350, utilities 50 stripped
result = runGlobalExtraction("350 + reziski 50 evra", { transactionType: 'rent' }, 'monthlyRent');
assert("RT3e3: monthlyRent=350 ('+ reziski 50 evra' stripped)", result.monthlyRent === 350, `got ${result.monthlyRent}`);

// ========================================
// TEST GROUP: Rent "IMA I PARKING" — the parking comes WITH the apartment
// ========================================
// Reported: in a RENT conversation, when the owner answers the parking
// question with "IMA I PARKING" ("there's also parking"), that spot belongs
// to the apartment in question — the tenant's private spot, NOT public
// street parking. Previously the bare "parking" keyword fell through to the
// "public" default. Same "comes with the unit" semantics as "so parking"
// (RT3b), expressed with the "i" ("also") construction. Rent-gated: in a
// SALE listing a bare "ima i parking" may describe the area, so the
// conservative public default stays there.
console.log(`\n📦 GROUP: Rent "IMA I PARKING" → parkingType=private`);

result = runGlobalExtraction("IMA I PARKING", { transactionType: 'rent' }, "IMA I PARKING");
assert("PK1: rent 'IMA I PARKING' → parking=true", result.parking === true, `got ${JSON.stringify(result.parking)}`);
assert("PK1: rent 'IMA I PARKING' → parkingType='private' (the spot belongs to the apartment)", result.parkingType === 'private', `got ${result.parkingType}`);

// Cyrillic + parkiranje variants
result = runGlobalExtraction("ИМА И ПАРКИНГ", { transactionType: 'rent' }, "ИМА И ПАРКИНГ");
assert("PK2: Cyrillic 'ИМА И ПАРКИНГ' → parkingType='private'", result.parkingType === 'private', `got ${result.parkingType}`);
result = runGlobalExtraction("ima i parkiranje", { transactionType: 'rent' }, "ima i parkiranje");
assert("PK2b: 'ima i parkiranje' → parkingType='private'", result.parkingType === 'private', `got ${result.parkingType}`);

// Definite-article form: "ima i parkingot" (there's also THE parking)
result = runGlobalExtraction("IMA I PARKINGOT", { transactionType: 'rent' }, "IMA I PARKINGOT");
assert("PK2c: 'IMA I PARKINGOT' (definite) → parkingType='private'", result.parkingType === 'private', `got ${result.parkingType}`);

// CONTROL: the SAME phrase in a SALE listing keeps the conservative public
// default (the rent-gated rule must NOT leak into sale).
result = runGlobalExtraction("IMA I PARKING", { transactionType: 'sale' }, "IMA I PARKING");
assert("PK3: sale 'IMA I PARKING' stays parkingType='public' (rent-gated)", result.parkingType === 'public', `got ${result.parkingType}`);

// CONTROL: no transaction type known → conservative public default preserved.
result = runGlobalExtraction("IMA I PARKING", {}, "IMA I PARKING");
assert("PK3b: unknown-type 'IMA I PARKING' stays 'public'", result.parkingType === 'public', `got ${result.parkingType}`);

// CONTROL: the pinned free/street-parking phrase stays public even in rent.
result = runGlobalExtraction("slobodno parkiranje", { transactionType: 'rent' }, "slobodno parkiranje");
assert("PK4: 'slobodno parkiranje' stays public even in rent", result.parkingType === 'public', `got ${result.parkingType}`);

// CONTROL (reviewer): the "nema i parking" negative construction contains
// " i parking" but NOT the "ima i parking" substring — the private rule must
// never fire on it (parking stays untyped-public, never 'private').
result = runGlobalExtraction("nema i parking", { transactionType: 'rent' }, "nema i parking");
assert("PK5: 'nema i parking' NOT classified private (no 'ima' substring)", result.parkingType !== 'private', `got ${result.parkingType}`);

// ========================================
// TEST GROUP: Decade-year answers — "90TI" / "80TI" (reported)
// ========================================
// Owner answers "Која година е граден?" with a DECADE: "90TI E ZGRADATA
// TOCNO NEZNAM" (it's from the 90s, I don't know exactly). parseYearBuilt
// maps the decade to a memorized mid-decade year (90ti → 1995), but the
// "neznam" uncertainty word scored it MEDIUM (0.60) → Ana re-asked "Дали
// точната вредност е 1995?" — redundant, because a decade answer already
// means the owner does NOT know the exact year. Decade answers must score
// HIGH and be stored without confirmation.
console.log(`\n📦 GROUP: Decade-year answers (90TI/80TI — no confirmation re-ask)`);

result = runGlobalExtraction("90TI E ZGRADATA TOCNO NEZNAM", {}, 'yearBuilt');
assert("DEC1: '90TI ... TOCNO NEZNAM' → yearBuilt=1995 (decade → mid-decade)", result.yearBuilt === 1995, `got ${result.yearBuilt}`);
assert("DEC1: decade answer scores HIGH (no confirmation re-ask)",
  assessConfidence('yearBuilt', 1995, '90ti e zgradata tocno neznam') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1995, '90ti e zgradata tocno neznam')}`);

// The user's second example — 80ti → 1985
result = runGlobalExtraction("80TI E ZGRADATA TOCNO NEZNAM", {}, 'yearBuilt');
assert("DEC2: '80TI ... TOCNO NEZNAM' → yearBuilt=1985", result.yearBuilt === 1985, `got ${result.yearBuilt}`);
assert("DEC2: 80ti decade answer scores HIGH",
  assessConfidence('yearBuilt', 1985, '80ti e zgradata tocno neznam') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1985, '80ti e zgradata tocno neznam')}`);

// Cyrillic word forms and the -ta decade family
assert("DEC3: 'осумдесетти ... ne znam' scores HIGH (Cyrillic word form)",
  assessConfidence('yearBuilt', 1985, 'осумдесетти e zgradata, tocno ne znam') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1985, 'осумдесетти e zgradata, tocno ne znam')}`);
assert("DEC3b: '90-ти ... ne znam' scores HIGH (-ти spaced form)",
  assessConfidence('yearBuilt', 1995, '90-ти e zgradata, ne znam tocno') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1995, '90-ти e zgradata, ne znam tocno')}`);
assert("DEC3c: '2000ta ... ne znam' scores HIGH (2000s decade)",
  assessConfidence('yearBuilt', 2000, '2000ta e zgradata, ne znam tocno') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 2000, '2000ta e zgradata, ne znam tocno')}`);

// COMPACT DECADE FORMS (reported: "SEESTI" answering "Која година е
// граден?" was NOT collected — silently null, then a re-ask). Compact =
// medial "е" dropped (шеесет → шеест → SEESTI). parseYearBuilt must map it
// AND it must score HIGH like the full forms (no confirmation re-ask).
result = runGlobalExtraction("SEESTI E ZGRADATA TOCNO NEZNAM", {}, 'yearBuilt');
assert("DEC6: 'SEESTI ... TOCNO NEZNAM' → yearBuilt=1965 (60s compact decade)",
  result.yearBuilt === 1965, `got ${result.yearBuilt}`);
assert("DEC6: compact decade answer scores HIGH (no confirmation re-ask)",
  assessConfidence('yearBuilt', 1965, 'seesti e zgradata tocno neznam') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1965, 'seesti e zgradata tocno neznam')}`);

// Other compact decades — whole-spectre coverage (the user's full list)
result = runGlobalExtraction("PEESTI E ZGRADATA", {}, 'yearBuilt');
assert("DEC7: 'PEESTI' → yearBuilt=1955 (50s compact)",
  result.yearBuilt === 1955, `got ${result.yearBuilt}`);
assert("DEC7a: 'осумдести ... ne znam' scores HIGH (80s compact Cyrillic)",
  assessConfidence('yearBuilt', 1985, 'осумдести e zgradata, tocno ne znam') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1985, 'осумдести e zgradata, tocno ne znam')}`);
assert("DEC7b: 'девеести' scores HIGH (90s compact Cyrillic)",
  assessConfidence('yearBuilt', 1995, 'девеести e zgradata, ne znam tocno') === 'HIGH',
  `got ${assessConfidence('yearBuilt', 1995, 'девеести e zgradata, ne znam tocno')}`);

// CONTROL: an EXACT 2-digit year ("92") is NOT a decade answer → uncertainty
// words still downgrade to MEDIUM → confirmation preserved.
assert("DEC4: exact '92 ... ne znam' stays MEDIUM (not a decade answer)",
  assessConfidence('yearBuilt', 1992, '92 e graden, tocno ne znam') === 'MEDIUM',
  `got ${assessConfidence('yearBuilt', 1992, '92 e graden, tocno ne znam')}`);

// renovationYear decade path — same semantics: renovated in the 90s, doesn't
// know exactly → 1995 is the memorized year, no confirmation.
assert("DEC5: 'renoviran vo 90tite, tocno ne znam' → renovationYear HIGH",
  assessConfidence('renovationYear', 1995, 'renoviran vo 90tite, tocno ne znam') === 'HIGH',
  `got ${assessConfidence('renovationYear', 1995, 'renoviran vo 90tite, tocno ne znam')}`);

// COMPACT-FORM renovationYear path (reviewer finding): the decade→renovationYear
// combined extractor now covers the compact forms too — "renoviran vo seestite"
// (renovated in the 60s) must yield renovated:true + renovationYear:1965, same
// as the digit forms ("90tite" → 1995) always did.
result = runGlobalExtraction("RENOVIRAN VO SEESTITE, TOCNO NE ZNAM", {}, 'renovationYear');
assert("DEC8: 'renoviran vo seestite' → renovated:true + renovationYear=1965 (compact decade)",
  result.renovated === true && result.renovationYear === 1965,
  `got renovated=${result.renovated} renovationYear=${result.renovationYear}`);
assert("DEC8: compact renovationYear decade scores HIGH",
  assessConfidence('renovationYear', 1965, 'renoviran vo seestite, tocno ne znam') === 'HIGH',
  `got ${assessConfidence('renovationYear', 1965, 'renoviran vo seestite, tocno ne znam')}`);

// NEGATIVE CONTROL (reviewer gap): "50-iljadi evra" is a PRICE — parseYearBuilt's
// bare "50-i" substring maps it to 1955, so with uncertainty present it must
// STAY MEDIUM (confirmation net preserved). The letter-boundary anchored digit
// pattern blocks the "50-i" false match — only the word-form check could fire.
assert("DEC6: '50-iljadi evra, tocno ne znam' NOT a decade → stays MEDIUM",
  assessConfidence('yearBuilt', 1955, '50-iljadi evra, tocno ne znam') === 'MEDIUM',
  `got ${assessConfidence('yearBuilt', 1955, '50-iljadi evra, tocno ne znam')}`);

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

// Bug 1c: MERGED HUNDREDS+TENS+CONNECTOR+UNIT — "tristaseesetiosum" =
// "trista seeset i osum" (300+60+8 = 368). Reported, lead 5502969: the owner
// typed the WHOLE number as one merged word and the parser dropped the
// "trista" prefix — the mergedHT tens boundary rejected "seeset" because the
// connector "i" followed it directly (letter), then the !tensFound fallback
// skipped "trista" (nextCh 's' is a letter too), so only "seeset" (60)
// survived via irregularTens → cleanPrice=68000 instead of 368000.
result = runGlobalExtraction("TRISTASEESETIOSUM ILJADI", {});
assert("BUG1c: cleanPrice=368000 (tristaseesetiosum = trista+seeset+i+osum, merged connector)", result.cleanPrice === 368000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("dvestaseesetiosum iljadi", {});
assert("BUG1d: cleanPrice=268000 (dvestaseesetiosum = 200+60+8)", result.cleanPrice === 268000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("tristaseesetidevet iljadi", {});
assert("BUG1e: cleanPrice=369000 (tristaseesetidevet = 300+60+9)", result.cleanPrice === 369000, `got ${result.cleanPrice}`);

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
// TEST GROUP: Reported production bugs (238k price, CENTRALNO heating, parking type)
// ========================================
// The user's real Viber session exposed THREE extraction bugs:
//   1. "DVESTA TRIESET I OSUM ILJADI EVRA" = 238000 — parser stopped at
//      "dvesta" (200) because the Viber spelling "trieset" (30) wasn't in
//      the tens vocabulary → 200000.
//   2. Owner answered the heating follow-up with "CENTRALNO" — централно
//      парно = градско (district), but the follow-up handler mapped it to
//      private_central (the extractor and the handler disagreed).
//   3. "PARKING MESTO VO CENATA" (parking spot included in the price) is
//      PRIVATE parking, but defaulted to public. "SLOBODNO PARKIRANJE"
//      (street/free parking) is PUBLIC.
// ========================================
console.log(`\n📦 GROUP: Reported production bugs (238k price / CENTRALNO / parking type)`);

// ── 1. Price: "dvesta trieset i osum iljadi" = 238,000 ──
result = runGlobalExtraction("DVESTA TRIESET I OSUM ILJADI EVRA. TOA STAN VO ZGRADA OD 2025, SO LIFT I PARKING MESTO VO CENATA. SEVERNA ORIENTACIJA, SO PARNO I KLIMA", {});
assert("R238: cleanPrice=238000 (dvesta=200 + trieset=30 + osum=8)", result.cleanPrice === 238000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("dvesta trieset i osum iljadi", {});
assert("R238b: cleanPrice=238000 (lowercase variant)", result.cleanPrice === 238000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("dvesta trieset iljadi", {});
assert("R238c: cleanPrice=230000 (dvesta + trieset, no units)", result.cleanPrice === 230000, `got ${result.cleanPrice}`);
result = runGlobalExtraction("trieset i osum iljadi", {});
assert("R238d: cleanPrice=38000 (trieset=30 + osum=8, no hundreds)", result.cleanPrice === 38000, `got ${result.cleanPrice}`);

// ── 2. Heating: centralno / централно = district (gradsko) ──
result = runGlobalExtraction("parno centralno", {});
assert("RH1: 'parno centralno' → heating=district", result.heating === 'district', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("централно парно", {});
assert("RH2: 'централно парно' → heating=district (Cyrillic)", result.heating === 'district', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("sopstveno parno", {});
assert("RH3: 'sopstveno parno' → heating=private (own boiler, unchanged)", result.heating === 'private', `got ${JSON.stringify(result.heating)}`);
// ── 2b. "I installed it myself" + etazno private heating (reported): the owner
// answered "Какво парно? Градско или сопствено?" with "JAS GO STAVIV" (I put
// it in myself = private heating) — the private branch only knew sopstveno, so
// the answer was never collected. Bare "moe"/"licno" stay parno/греење-bound
// in global discovery ("toa e moe" = "that's mine" is NOT a heating answer).
result = runGlobalExtraction("JAS GO STAVIV", {});
assert("RH4: 'JAS GO STAVIV' → heating=private", result.heating === 'private', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("jas sum go stavil", {});
assert("RH5: 'jas sum go stavil' → heating=private", result.heating === 'private', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("ETAZNO PARNO", {});
assert("RH6: 'ETAZNO PARNO' → heating=private (floor-level own)", result.heating === 'private', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("MOE PARNO", {});
assert("RH7: 'MOE PARNO' → heating=private", result.heating === 'private', `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("TOA E MOE, NE E NA PRODAZBA", {});
assert("RH8: 'TOA E MOE' (that's mine) → heating stays null (no parno context)", result.heating === undefined, `got ${JSON.stringify(result.heating)}`);
// Bare "go staviv" (I posted it) must NOT fire in global discovery — only the
// 1st-person "jas/sam/licno go staviv" family is unambiguous (reviewer-caught
// false-positive vector: "GO STAVIV OGLASOT" = "I posted the ad", not heating).
result = runGlobalExtraction("GO STAVIV OGLASOT ZA PRODAZBA", {});
assert("RH8b: 'GO STAVIV OGLASOT' (I posted the ad) → heating stays null", result.heating === undefined, `got ${JSON.stringify(result.heating)}`);
result = runGlobalExtraction("go staviv da se prodava", {});
assert("RH8c: 'go staviv da se prodava' → heating stays null", result.heating === undefined, `got ${JSON.stringify(result.heating)}`);
// Date answers to the availableFrom question must NEVER leak into a price:
result = runGlobalExtraction("OD 7.15.2026", { transactionType: 'rent' });
assert("RH9: 'OD 7.15.2026' → no phantom monthlyRent", result.monthlyRent === undefined, `got ${JSON.stringify(result)}`);

// ── 3. Parking: "vo cenata" = private, "slobodno parkiranje" = public ──
result = runGlobalExtraction("PARKING MESTO VO CENATA", {});
assert("RP1: 'parking mesto vo cenata' → parking=true, type=private", result.parking === true && result.parkingType === 'private', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("ima parkiranje vo cenata", {});
assert("RP1b: 'parkiranje vo cenata' → parking=true, type=private", result.parking === true && result.parkingType === 'private', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("slobodno parkiranje", {});
assert("RP2: 'slobodno parkiranje' → parking=true, type=public", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("слободно паркирање", {});
assert("RP2b: 'слободно паркирање' → parking=true, type=public (Cyrillic)", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("nema parkiranje", {});
assert("RP3: 'nema parkiranje' → parking=false", result.parking === false, `got ${JSON.stringify(result.parking)}`);
// Negative "not included in price" → sold separately, NOT folded into the price
result = runGlobalExtraction("parking mestoto ne e vkluceno vo cena", {});
assert("RP3b: 'ne e vkluceno vo cena' → parkingSeparate=true (not folded in)", result.parking === true && result.parkingSeparate === true, `got ${JSON.stringify(result.parking)}/${result.parkingSeparate}`);
// Genuine garage/private/street distinctions preserved
result = runGlobalExtraction("garaza na -1", {});
assert("RP4: 'garaza' → parkingType=garage (unchanged)", result.parkingType === 'garage', `got ${result.parkingType}`);
result = runGlobalExtraction("ima parking", {});
assert("RP5: bare 'ima parking' → parkingType=public (unchanged)", result.parkingType === 'public', `got ${result.parkingType}`);
// ── POC resident sticker = PUBLIC parking (reported) ──
// "SO POC" / "SO POC NALEPNICA" — the ПОЦ resident parking-permit sticker
// (Паркирање Од Центар). The owner parks on PUBLIC street wherever a spot is
// free using the sticker issued to the address — NOT a garage, NOT private.
result = runGlobalExtraction("SO POC ILI SO POC NALEPNICA", {});
assert("RP6: 'SO POC ILI SO POC NALEPNICA' → parking=true, type=public", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("SO POC", {});
assert("RP6b: 'SO POC' → parking=true, type=public", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("СО ПОЦ", {});
assert("RP6c: 'СО ПОЦ' (Cyrillic) → parking=true, type=public", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
result = runGlobalExtraction("PARKING SO NALEPNICA", {});
assert("RP6d: 'PARKING SO NALEPNICA' (parking sticker) → parking=true, type=public", result.parking === true && result.parkingType === 'public', `got ${JSON.stringify(result.parking)}/${result.parkingType}`);
// Bare "nalepnica" alone is NOT parking — could be an energy label or
// municipal decal in global discovery (reviewer finding); only co-occurring
// with poc/parking context signals public parking.
result = runGlobalExtraction("IMA NALEPNICA", {});
assert("RP6g: bare 'IMA NALEPNICA' (no poc/parking context) → parking stays null", result.parking === undefined, `got ${JSON.stringify(result.parking)}`);
result = runGlobalExtraction("ENERGETSKA NALEPNICA ZA STANOT", {});
assert("RP6h: 'ENERGETSKA NALEPNICA' (energy label) → parking stays null", result.parking === undefined, `got ${JSON.stringify(result.parking)}`);
// Word-boundary guard: "pocetok" (beginning) / "pocnuva" (starts) are NOT poc
result = runGlobalExtraction("POCETOK NA GRADBA", {});
assert("RP6e: 'POCETOK NA GRADBA' (beginning) → parking stays null", result.parking === undefined, `got ${JSON.stringify(result.parking)}`);
result = runGlobalExtraction("pocne od septemvri", {});
assert("RP6f: 'pocne od septemvri' (starts) → parking stays null", result.parking === undefined, `got ${JSON.stringify(result.parking)}`);

// ========================================
// TEST GROUP: Reported production bugs (renovation flow)
// ========================================
// The user's real Viber session exposed THREE renovation-flow bugs:
//   1. "NOV E 2025" (it's new, built 2025) — a new-build/first-hand apartment
//      is NOT renovated, but nothing was extracted → Ana re-asked twice and
//      then SKIPPED the field.
//   2. Bare answers to the current question ("NE E", "da", "nema") weren't
//      mapped to the boolean field being asked → same re-ask loop.
//   3. After "renovated=false" Ana still asked "Која година е реновиран?"
//      (workflow guard exists but never fired — renovated was never false).
// ========================================
console.log(`\n📦 GROUP: Reported production bugs (renovation flow)`);

// ── 1. New-build / first-hand → renovated=false ──
result = runGlobalExtraction("NOV E 2025", {}, 'renovated');
assert("RN1: 'NOV E 2025' → renovated=false (new build, not renovated)", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("НОВ Е 2025", {}, 'renovated');
assert("RN1b: 'НОВ Е 2025' → renovated=false (Cyrillic)", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("nova gradba", {}, 'renovated');
assert("RN2: 'nova gradba' → renovated=false", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("novogradba", {}, 'renovated');
assert("RN2b: 'novogradba' → renovated=false (merged)", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("новоградба", {}, 'renovated');
assert("RN2c: 'новоградба' → renovated=false (Cyrillic merged)", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("prva raka", {}, 'renovated');
assert("RN3: 'prva raka' → renovated=false (first hand)", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);

// ── 2. Bare yes/no answers to the CURRENT question ──
result = runGlobalExtraction("NE E", {}, 'renovated');
assert("RN4: bare 'NE E' to renovated question → renovated=false", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("ne", {}, 'renovated');
assert("RN4b: bare 'ne' to renovated question → renovated=false", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("da", {}, 'renovated');
assert("RN4c: bare 'da' to renovated question → renovated=true", result.renovated === true, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("nema", {}, 'renovated');
assert("RN4d: bare 'nema' to renovated question → renovated=false", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("ne", {}, 'elevator');
assert("RN4e: bare 'ne' to elevator question → elevator=false", result.elevator === false, `got ${JSON.stringify(result.elevator)}`);
result = runGlobalExtraction("ne", {}, 'furnished');
assert("RN4f: bare 'ne' to furnished question → furnished=false", result.furnished === false, `got ${JSON.stringify(result.furnished)}`);
result = runGlobalExtraction("da", {}, 'parking');
assert("RN4g: bare 'da' to parking question → parking=true", result.parking === true, `got ${JSON.stringify(result.parking)}`);

// ── 1b. NEW-BUILD NEGATION GUARD (reviewer gap) ──
// A negated new-build claim is NOT a "renovated=false" answer.
// "NE E NOVOGRADBA, NO E RENOVIRAN 2019" (it's NOT new construction, but it
// IS renovated in 2019) previously matched the bare "novogradba" keyword
// first → renovated=false, clobbering the owner's explicit positive. The
// branch must be skipped so the renovation answer falls through. And "ne e
// nova zgrada" (it's not a new building) tells us nothing about renovation
// → null (Ana re-asks), never a false negative.
result = runGlobalExtraction("NE E NOVOGRADBA, NO E RENOVIRAN 2019", {}, 'renovated');
assert("RN5a: 'NE E NOVOGRADBA, NO E RENOVIRAN 2019' → renovated=true (negated new-build must not clobber)", result.renovated === true, `got ${JSON.stringify(result.renovated)}`);
assert("RN5a: renovationYear=2019 kept", result.renovationYear === 2019, `got ${JSON.stringify(result.renovationYear)}`);
result = runGlobalExtraction("ne e novogradba, no e renoviran 2019", {}, 'renovated');
assert("RN5b: lowercase variant → renovated=true, 2019", result.renovated === true && result.renovationYear === 2019, `got ${JSON.stringify(result.renovated)}/${result.renovationYear}`);
result = runGlobalExtraction("не е новоградба, ама е реновиран 2019", {}, 'renovated');
assert("RN5c: Cyrillic 'не е новоградба' → renovated=true, 2019", result.renovated === true && result.renovationYear === 2019, `got ${JSON.stringify(result.renovated)}/${result.renovationYear}`);
result = runGlobalExtraction("ne e nova zgrada", {}, 'renovated');
assert("RN5d: 'ne e nova zgrada' → renovated NOT set (unknown, re-ask)", result.renovated === undefined, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("NE E NOVOGRADBA", {}, 'renovated');
assert("RN5e: bare 'NE E NOVOGRADBA' → renovated NOT set (unknown, re-ask)", result.renovated === undefined, `got ${JSON.stringify(result.renovated)}`);
// Existing new-build positives MUST still fire (no regression)
result = runGlobalExtraction("novogradba", {}, 'renovated');
assert("RN5f: bare 'novogradba' still → renovated=false", result.renovated === false, `got ${JSON.stringify(result.renovated)}`);

// ── 2b. Documentation direct answers — "SE E CISTO" (reported) ──
// The global extractor refuses bare "cist"/"cisto" (matches "cist vozduh",
// "cista cena" — never documentation), so a DIRECT answer to the current
// documentationClean question needs its own field-specific bare-yes mapping.
// Reported: "SE E CISTO" was not registered as positive → Ana re-asked with
// confirmatory phrasing ("Само да потврдам, дали имате чист имотен лист?").
result = runGlobalExtraction("SE E CISTO", {}, 'documentationClean');
assert("RN4h: 'SE E CISTO' to documentationClean question → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("cisto e", {}, 'documentationClean');
assert("RN4i: 'cisto e' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("се е чисто", {}, 'documentationClean');
assert("RN4j: 'се е чисто' (Cyrillic) → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("CISTO", {}, 'documentationClean');
assert("RN4k: bare 'CISTO' to documentationClean question → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("ne e cisto", {}, 'documentationClean');
assert("RN4l: 'ne e cisto' → documentationClean=false (extractor negative branch)", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
// Direct-answer boolean scores HIGH → stored immediately, no confirmation re-ask
assert("RN4m: documentationClean direct answer scores HIGH",
  assessConfidence('documentationClean', true, 'SE E CISTO') === 'HIGH',
  `got ${assessConfidence('documentationClean', true, 'SE E CISTO')}`);

// ── 2c. "NEMA PROBLEMI" — positive idiom (reported) ──
// The negative branch's bare "problem"/"komplikacii" used to swallow
// "NEMA PROBLEMI" / "nema komplikacii" (no problems — docs are fine) and
// store documentationClean=false. Fixed with nema/nemam/bez lookbehinds;
// the positive answer maps via the field-specific bare-yes idioms.
result = runGlobalExtraction("NEMA PROBLEMI", {}, 'documentationClean');
assert("RN4n: 'NEMA PROBLEMI' → documentationClean=true (was wrongly false)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("nemam problemi", {}, 'documentationClean');
assert("RN4o: 'nemam problemi' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("СЕ Е ВО РЕД", {}, 'documentationClean');
assert("RN4p: 'СЕ Е ВО РЕД' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("IMA PROBLEM SO DOKUMENTITE", {}, 'documentationClean');
assert("RN4q: 'IMA PROBLEM SO DOKUMENTITE' → documentationClean=false (still negative)", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
// Past-tense positives ("I've never had problems") — the lookbehind must
// block "ne sum imal"/"не сум имал" before "problem". Reviewer gap: without
// it "NE SUM IMAL PROBLEMI" wrongly set documentationClean=false. The answer
// is left unknown (re-ask) rather than misread as a docs issue.
result = runGlobalExtraction("NE SUM IMAL PROBLEMI", {}, 'documentationClean');
assert("RN4q2: 'NE SUM IMAL PROBLEMI' → NOT set (past-tense positive, was wrongly false)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("не сум имал проблеми", {}, 'documentationClean');
assert("RN4q3: Cyrillic 'не сум имал проблеми' → NOT set", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
// Intensifier forms ("no problems AT ALL") — the lookbehind must block
// "nikakvi"/"vekje" between the negation and "problem" (was wrongly false).
result = runGlobalExtraction("NEMA NIKAKVI PROBLEMI", {}, 'documentationClean');
assert("RN4r: 'NEMA NIKAKVI PROBLEMI' → documentationClean=true (intensifier, was false)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("NEMAM NIKAKVI PROBLEMI", {}, 'documentationClean');
assert("RN4s: 'NEMAM NIKAKVI PROBLEMI' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
// Combined/qualified positive answers (common real phrasings)
result = runGlobalExtraction("SE E CISTO, NEMA PROBLEMI", {}, 'documentationClean');
assert("RN4t: 'SE E CISTO, NEMA PROBLEMI' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("nema problemi so dokumentite", {}, 'documentationClean');
assert("RN4u: 'nema problemi so dokumentite' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
// "ne e problem" (it's not a problem) is a POSITIVE idiom elsewhere in the
// codebase (photos handler, acceptance classifier) — must NOT be negative here.
result = runGlobalExtraction("NE E PROBLEM", {}, 'documentationClean');
assert("RN4v: 'NE E PROBLEM' → NOT false (positive idiom, conservative re-ask)", result.documentationClean !== false, `got ${JSON.stringify(result.documentationClean)}`);

// ── 2d. OWNERSHIP/POSSESSION ANSWERS (reported) ──
// "IMAM NA MOE IME" (I have the deed in my name) and "TI REKOV DEKA IMAM"
// (I told you I have it) are CLEAR positives to "Дали имате чист имотен
// лист?", but were NOT memorized → re-asked twice → max-2-attempts SKIP
// stored null (data lost). The field-specific map now covers ownership
// assertions when the documentation question is CURRENT.
result = runGlobalExtraction("IMAM NA MOE IME", {}, 'documentationClean');
assert("DOC1: 'IMAM NA MOE IME' → documentationClean=true (exact reported)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("TI REKOV DEKA IMAM", {}, 'documentationClean');
assert("DOC2: 'TI REKOV DEKA IMAM' → documentationClean=true (exact reported)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
// Cyrillic + da-prefixed + bare variants
result = runGlobalExtraction("имам на мое име", {}, 'documentationClean');
assert("DOC3: Cyrillic 'имам на мое име' → documentationClean=true", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("DA, IMAM NA MOE IME", {}, 'documentationClean');
assert("DOC4: 'DA, IMAM NA MOE IME' → documentationClean=true (da-prefix stripped)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("da imam", {}, 'documentationClean');
assert("DOC5: 'da imam' → documentationClean=true (da-prefix + bare imam)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("на мое име", {}, 'documentationClean');
assert("DOC6: 'на мое име' → documentationClean=true (in my name)", result.documentationClean === true, `got ${JSON.stringify(result.documentationClean)}`);
// Ownership assertions score HIGH (binary field) → stored, no confirmation
assert("DOC7: 'imam na moe ime' scores HIGH (no confirmation re-ask)",
  assessConfidence('documentationClean', true, 'imam na moe ime') === 'HIGH',
  `got ${assessConfidence('documentationClean', true, 'imam na moe ime')}`);
// CONTROL: multi-content messages stay unmapped (anchor keeps them safe)
result = runGlobalExtraction("imam dva stana", {}, 'documentationClean');
assert("DOC8: 'imam dva stana' NOT treated as docs answer (extra content)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
// CONTROL: ownership idioms do NOT fire in global discovery (no preferredField)
result = runGlobalExtraction("imam na moe ime", {});
assert("DOC9: 'imam na moe ime' with NO preferredField → NOT extracted (discovery guard)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
// CONTROL: 1st-person imam answers OTHER binary questions too (generic positive)
result = runGlobalExtraction("imam", {}, 'parking');
assert("DOC10: bare 'imam' to parking question → parking=true (generic possession)", result.parking === true, `got ${JSON.stringify(result.parking)}`);
result = runGlobalExtraction("imam", {}, 'elevator');
assert("DOC11: bare 'imam' to elevator question → elevator=true", result.elevator === true, `got ${JSON.stringify(result.elevator)}`);

// ── 2e. NEGATIVE MIRROR (reviewer gap) — "NEMAM" must map to false ──
// "imam" was added to the bare-yes map, so its 1st-person negation
// "nemam" (I don't have) must map to false — otherwise "Дали имате чист
// имотен лист?" → "NEMAM" → re-ask twice → max-2-attempts SKIP stores
// null (data lost), the exact mirror of the reported "IMAM NA MOE IME" bug.
result = runGlobalExtraction("NEMAM", {}, 'documentationClean');
assert("NEG1: 'NEMAM' → documentationClean=false", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("NEMAM NA MOE IME", {}, 'documentationClean');
assert("NEG2: 'NEMAM NA MOE IME' → documentationClean=false", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("NE E NA MOE IME", {}, 'documentationClean');
assert("NEG3: 'NE E NA MOE IME' → documentationClean=false", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("немам на мое име", {}, 'documentationClean');
assert("NEG4: Cyrillic 'немам на мое име' → documentationClean=false", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("NEMA IMOTEN LIST", {}, 'documentationClean');
assert("NEG5: 'NEMA IMOTEN LIST' → documentationClean=false", result.documentationClean === false, `got ${JSON.stringify(result.documentationClean)}`);
assert("NEG5b: 'nemam' scores HIGH (no confirmation re-ask)",
  assessConfidence('documentationClean', false, 'nemam') === 'HIGH',
  `got ${assessConfidence('documentationClean', false, 'nemam')}`);
// CONTROL: bare 'nemam' answers other binary questions negatively too
result = runGlobalExtraction("nemam", {}, 'parking');
assert("NEG6: bare 'nemam' to parking question → parking=false", result.parking === false, `got ${JSON.stringify(result.parking)}`);
// CONTROL: negation idioms do NOT fire in global discovery (no preferredField)
result = runGlobalExtraction("nemam na moe ime", {});
assert("NEG7: 'nemam na moe ime' with NO preferredField → NOT extracted", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);

// ── Bare answers ONLY work when the field is being asked (discovery guard) ──
result = runGlobalExtraction("ne", {});
assert("RN5: bare 'ne' with NO preferredField extracts nothing", Object.keys(result).length === 0, `got ${Object.keys(result).join(', ')}`);
// The field-specific idiom is guarded the same way: only fires for its OWN
// question, never in discovery mode or for a different field.
result = runGlobalExtraction("SE E CISTO", {});
assert("RN5d: 'SE E CISTO' with NO preferredField → NOT extracted (discovery guard)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("SE E CISTO", {}, 'elevator');
assert("RN5e: 'SE E CISTO' during elevator question → documentationClean NOT set (field-specific)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("NEMA PROBLEMI", {});
assert("RN5f: 'NEMA PROBLEMI' with NO preferredField → NOT extracted (cooperation-speak must not leak)", result.documentationClean === undefined, `got ${JSON.stringify(result.documentationClean)}`);
result = runGlobalExtraction("ne, 55 kvadrati", {}, 'renovated');
assert("RN5b: 'ne, 55 kvadrati' NOT treated as bare answer (extra content)", result.renovated === undefined, `got ${JSON.stringify(result.renovated)}`);
result = runGlobalExtraction("ne znam", {}, 'renovated');
assert("RN5c: 'ne znam' NOT treated as bare no (uncertain)", result.renovated === undefined, `got ${JSON.stringify(result.renovated)}`);

// ── No-overwrite contract still holds for bare answers ──
result = runGlobalExtraction("da", { renovated: false }, 'renovated');
assert("RN6: bare 'da' does NOT overwrite existing renovated=false", result.renovated === undefined, `got ${JSON.stringify(result.renovated)}`);

// ── renovationYear not leaked (renovated=false) and no cleanPrice from year ──
result = runGlobalExtraction("renoviran 2020", {}, 'renovated');
assert("RN7: 'renoviran 2020' → renovated=true", result.renovated === true, `got ${JSON.stringify(result.renovated)}`);
assert("RN7: 'renoviran 2020' → renovationYear=2020", result.renovationYear === 2020, `got ${JSON.stringify(result.renovationYear)}`);
assert("RN7: 'renoviran 2020' → cleanPrice NOT extracted from year", result.cleanPrice === undefined, `got ${JSON.stringify(result.cleanPrice)}`);
result = runGlobalExtraction("2000ta", { renovated: false, renovationYear: null });
assert("RN8: renovationYear not extracted when renovated=false", !('renovationYear' in result), `got ${JSON.stringify(result.renovationYear)}`);

// ========================================
// SQM HISTORY-SCAN FALSE-POSITIVE (reported, lead 3571074): the owner's rent
// answer "ti kazav cetrsto dvaeset evra mesecno" (420 €/month, annoyed
// repeat) was crowned as totalSqm=420 by scanHistoryForField's greedy
// parseNumberWords over the JOINED owner messages — the sqm question was
// never asked and the wrong value stored. The annoyed-repeat fallbacks in
// extractTotalSqm + assessConfidence now require a PURE NUMBER PHRASE.
// ========================================

result = runGlobalExtraction("ti kazav cetrsto dvaeset evra mesecno", { transactionType: 'rent' }, 'totalSqm');
assert("SQH1: rent repeat 'ti kazav cetrsto dvaeset evra mesecno' → totalSqm NOT extracted", result.totalSqm === undefined, `got ${JSON.stringify(result.totalSqm)}`);
assert("SQH1: ... but monthlyRent STILL extracts 420", result.monthlyRent === 420, `got ${JSON.stringify(result.monthlyRent)}`);

const sqhMsgs = [
  { role: 'user', text: 'da probame' },
  { role: 'user', text: 'ti kazav cetrsto dvaeset evra mesecno' },
  { role: 'user', text: 'sloboden momentalno' },
  { role: 'user', text: 'ne sakam turci i albanci' },
  { role: 'user', text: 'nikako milenici, se mi e novo' },
];
const sqhScan = scanHistoryForField('totalSqm', sqhMsgs, {});
assert("SQH2: history scan does NOT crown totalSqm=420 from joined messages", sqhScan === null, `got ${JSON.stringify(sqhScan)}`);

const sqhConf = assessConfidence('totalSqm', 420, 'ti kazav cetrsto dvaeset evra mesecno');
assert("SQH3: assessConfidence(totalSqm, 420, rent repeat) NOT HIGH", sqhConf !== 'HIGH', `got ${sqhConf}`);

// KEEP: legit bare repeats still extract (pure number phrases)
result = runGlobalExtraction("86 TI KAZAV", {}, 'totalSqm');
assert("SQH4: '86 TI KAZAV' → totalSqm=86 (legit bare repeat preserved)", result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("OSUMDESET TI REKOV", {}, 'totalSqm');
assert("SQH5: 'OSUMDESET TI REKOV' → totalSqm=80", result.totalSqm === 80, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("OSUMDESET I SEST TI KAZAV", {}, 'totalSqm');
assert("SQH6: 'OSUMDESET I SEST TI KAZAV' → totalSqm=86", result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);

// ========================================
// TRUNCATED TEENS IN COMPOUND FLOOR (reported, lead 3571074): "na peti od
// dvanaese" (5th of 12) collected totalFloors=2 — "dvanaese" is the Viber-
// truncated дванаесет (12), which was missing from both number parsers so
// the substring scan fell through to "dva"→2. The full teens family now
// parses in parseMacedonianNumber + parseNumberWords (Latin + Cyrillic,
// full + truncated forms).
// ========================================
result = runGlobalExtraction("na peti od dvanaese", {});
assert("TEEN1: 'na peti od dvanaese' → floor=5 (peti ordinal)", result.floor === 5, `got ${JSON.stringify(result.floor)}`);
assert("TEEN1: 'na peti od dvanaese' → totalFloors=12 (was 2)", result.totalFloors === 12, `got ${JSON.stringify(result.totalFloors)}`);
result = runGlobalExtraction("na vtori od trinaese", {});
assert("TEEN2: 'na vtori od trinaese' → floor=2 totalFloors=13", result.floor === 2 && result.totalFloors === 13, `got ${JSON.stringify(result)}`);
result = runGlobalExtraction("na sesti od osumnaese", {});
assert("TEEN3: 'na sesti od osumnaese' → floor=6 totalFloors=18", result.floor === 6 && result.totalFloors === 18, `got ${JSON.stringify(result)}`);
// Cyrillic compound
result = runGlobalExtraction("на петти од дванаесе", {});
assert("TEEN4: Cyrillic 'на петти од дванаесе' → floor=5 totalFloors=12", result.floor === 5 && result.totalFloors === 12, `got ${JSON.stringify(result)}`);
// Teens as bare sqm repeats and word-sqm answers
result = runGlobalExtraction("dvanaese ti kazav", {}, 'totalSqm');
assert("TEEN5: 'dvanaese ti kazav' → totalSqm=12 (bare teen repeat)", result.totalSqm === 12, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("petnaese kvadrati", {});
assert("TEEN6: 'petnaese kvadrati' → totalSqm=15 (teen word-sqm)", result.totalSqm === 15, `got ${JSON.stringify(result.totalSqm)}`);

// KEEP: keyword paths unaffected by the pure-phrase guard
result = runGlobalExtraction("seese i osum kvadrata so terasa golema", {});
assert("SQH7: 'seese i osum kvadrata so terasa golema' → totalSqm=68 (keyword path)", result.totalSqm === 68, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2", {});
assert("SQH8: vkupno context → totalSqm=86 (windowed parse preserved)", result.totalSqm === 86, `got ${JSON.stringify(result.totalSqm)}`);
result = runGlobalExtraction("OSUMDESET SE VKUPNO", {}, 'totalSqm');
assert("SQH9: number BEFORE vkupno marker → totalSqm=80 (bidirectional window)", result.totalSqm === 80, `got ${JSON.stringify(result.totalSqm)}`);

// Other fields stay safe over the SAME joined rent text (reviewer check:
// the NUMBER_SNIFFING STEP-2 guard does NOT apply to history scans, so
// confirm bedrooms/floor/totalFloors can't crown the rent number either)
const sqhOther = scanHistoryForField('bedrooms', sqhMsgs, {});
assert("SQH10: history scan of bedrooms → null (rent number not crowned)", sqhOther === null, `got ${JSON.stringify(sqhOther)}`);
const sqhFloor = scanHistoryForField('floor', sqhMsgs, {});
assert("SQH11: history scan of floor → null", sqhFloor === null, `got ${JSON.stringify(sqhFloor)}`);
const sqhTotFloors = scanHistoryForField('totalFloors', sqhMsgs, {});
assert("SQH12: history scan of totalFloors → null", sqhTotFloors === null, `got ${JSON.stringify(sqhTotFloors)}`);

// ========================================
// PRICE-PER-SQM PHANTOM GUARD (reported, lead 75889 Плац): a whole-message
// "N m2" answering the totalSqm question on a 4000 m² plot must extract
// totalSqm ONLY — the same number must NEVER phantom as pricePerSqm. The
// bare form is rejected by extractPricePerSqm's marker requirement; the
// copula form ("4000 е м2" = it IS 4000 m²) is suppressed by the
// preferredField=totalSqm context guard in extractPricePerSqmField.
// ========================================
{
  const r = runGlobalExtraction('4000 m2', { transactionType: 'sale' }, 'totalSqm');
  assert('PPSQ1: "4000 m2" answering totalSqm → totalSqm=4000', r.totalSqm === 4000, `got ${JSON.stringify(r)}`);
  assert('PPSQ1: ... → NO pricePerSqm', r.pricePerSqm === undefined, `got ${JSON.stringify(r)}`);
}
{
  // The copula "е" is ambiguous ("it IS 4000 m²" vs "4000 per m²") — the
  // guard's job is only to make sure the sqm answer never becomes a PRICE.
  // (extractTotalSqm itself does not parse the copula form — pre-existing
  // limitation, unchanged.)
  const r = runGlobalExtraction('4000 е м2', { transactionType: 'sale' }, 'totalSqm');
  assert('PPSQ2: "4000 е м2" answering totalSqm → NO pricePerSqm (context guard)', r.pricePerSqm === undefined, `got ${JSON.stringify(r)}`);
  const r2 = runGlobalExtraction('4000 е кв', { transactionType: 'sale' }, 'totalSqm');
  assert('PPSQ2b: "4000 е кв" answering totalSqm → NO pricePerSqm (unit-list guard)', r2.pricePerSqm === undefined, `got ${JSON.stringify(r2)}`);
}
{
  // Price-context control: a per-m² quote answering the PRICE question still extracts
  const r = runGlobalExtraction('2000 e za m2', { transactionType: 'sale' }, 'cleanPrice');
  assert('PPSQ3: "2000 e za m2" answering price → pricePerSqm=2000', r.pricePerSqm === 2000, `got ${JSON.stringify(r)}`);
}
{
  // Discovery-mode control: bare "4000 m2" → totalSqm only, no phantom price
  const r = runGlobalExtraction('4000 m2', { transactionType: 'sale' });
  assert('PPSQ4: discovery "4000 m2" → totalSqm=4000, no pricePerSqm', r.totalSqm === 4000 && r.pricePerSqm === undefined, `got ${JSON.stringify(r)}`);
}
{
  // REPORTED (lead 75885, plot): the owner answered the totalSqm question
  // with the WORD form "5000 kvadrata" — same phantom as "4000 m2", the
  // number must never be crowned pricePerSqm. Covers the Latin and Cyrillic
  // word units the guard's unit list carries.
  const r = runGlobalExtraction('5000 kvadrata', { transactionType: 'sale' }, 'totalSqm');
  assert('PPSQ5: "5000 kvadrata" answering totalSqm → totalSqm=5000', r.totalSqm === 5000, `got ${JSON.stringify(r)}`);
  assert('PPSQ5: ... → NO pricePerSqm', r.pricePerSqm === undefined, `got ${JSON.stringify(r)}`);
  const r2 = runGlobalExtraction('5000 квадрата', { transactionType: 'sale' }, 'totalSqm');
  assert('PPSQ6: "5000 квадрата" answering totalSqm → totalSqm=5000, no pricePerSqm', r2.totalSqm === 5000 && r2.pricePerSqm === undefined, `got ${JSON.stringify(r2)}`);
}

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
