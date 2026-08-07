// ============================================================
// REGRESSION: "VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2"
// ============================================================
// Reported lead 5540516: the owner answered the totalSqm question with
// "VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2" (= 86 m² total + 3 m² terrace).
//
// Three bugs on that message:
//   1) parseNumberWords("osumdeset i ses") = 80, not 86 — the "i {unit}"
//      connector only matched when the unit was the ENTIRE tail (\s*$), and
//      the truncated Viber form "ses" (shorthand for "sest"/6) was unknown.
//   2) extractTotalSqm had no "vkupno" (total) context — the only m2 keyword
//      in the message belongs to the terrace ("3 M2"), so totalSqm=86 was
//      MISSED and Ana re-asked the question.
//   3) extractTerraceNumber tie-broke to "ses" (6) instead of "3 M2" (3), and
//      parseYearBuilt read "osumdeset" as the 1980s decade (phantom 1980).
//
// All offline — no LLM calls.
// ============================================================

process.env.ANA_OFFLINE_LLM = '1';

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra !== undefined ? `— got: ${JSON.stringify(extra)}` : ''}`); }
}

const REPORTED = 'VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2';

const { parseNumberWords, parseMacedonianNumber, parseYearBuilt, extractTerraceNumber, extractPrice } = await import('./property-extractor.js');
const { runGlobalExtraction } = await import('./data-collector.js');

console.log('\n🧪 A: parseNumberWords — "osumdeset i ses" (86)');
console.log('  --- the exact reported message');
assert('A1: full message parses to 86', parseNumberWords(REPORTED) === 86, parseNumberWords(REPORTED));
assert('A2: "osumdeset i ses" → 86', parseNumberWords('osumdeset i ses') === 86, parseNumberWords('osumdeset i ses'));
assert('A3: Cyrillic "осумдесет и шес" → 86', parseNumberWords('осумдесет и шес') === 86, parseNumberWords('осумдесет и шес'));
console.log('  --- no regression on existing forms');
assert('A4: "seeset i pet" → 65', parseNumberWords('seeset i pet') === 65, parseNumberWords('seeset i pet'));
assert('A5: "seeset i pet kvadrati" → 65', parseNumberWords('seeset i pet kvadrati') === 65, parseNumberWords('seeset i pet kvadrati'));
assert('A6: "osumdeset" alone → 80', parseNumberWords('osumdeset') === 80, parseNumberWords('osumdeset'));
assert('A7: "osumdeset i pol" (80 and a half) → 80, not a false +5', parseNumberWords('osumdeset i pol') === 80, parseNumberWords('osumdeset i pol'));

console.log('\n🧪 B: extractTotalSqm via runGlobalExtraction — total + terrace from one message');
const g = runGlobalExtraction(REPORTED, { transactionType: 'sale' }, undefined);
assert('B1: totalSqm=86', g.totalSqm === 86, g.totalSqm);
assert('B2: hasTerrace=true', g.hasTerrace === true, g.hasTerrace);
assert('B3: terraceSqm=3 (the "3 M2", not 6/80)', g.terraceSqm === 3, g.terraceSqm);
assert('B4: NO phantom yearBuilt', g.yearBuilt === undefined, g.yearBuilt);

console.log('\n🧪 C: extractTerraceNumber — unit-adjacency beats the bare "ses"');
assert('C1: reported message → 3', extractTerraceNumber(REPORTED) === 3, extractTerraceNumber(REPORTED));
assert('C2: "terasa od 3 m2" → 3', extractTerraceNumber('terasa od 3 m2') === 3, extractTerraceNumber('terasa od 3 m2'));
assert('C3: "terasa 4" → 4 (bare still works)', extractTerraceNumber('terasa 4') === 4, extractTerraceNumber('terasa 4'));
assert('C4: far-away "68 M2" is the TOTAL, not the terrace → null', extractTerraceNumber('ima terasa, stanot e 68 M2') === null, extractTerraceNumber('ima terasa, stanot e 68 M2'));

console.log('\n🧪 D: parseYearBuilt — "osumdeset i ses" is a QUANTITY, not a decade');
assert('D1: reported message → null (no phantom 1980)', parseYearBuilt(REPORTED) === null, parseYearBuilt(REPORTED));
assert('D2: "osumdeset i ses" → null', parseYearBuilt('osumdeset i ses') === null, parseYearBuilt('osumdeset i ses'));
console.log('  --- decade answers still work');
assert('D3: "ZGRADA OD 80TI" → 1985', parseYearBuilt('ZGRADA OD 80TI') === 1985, parseYearBuilt('ZGRADA OD 80TI'));
assert('D4: "osumdeset godini" → 1980', parseYearBuilt('osumdeset godini') === 1980, parseYearBuilt('osumdeset godini'));
assert('D5: "осумдесетти" → 1985', parseYearBuilt('осумдесетти') === 1985, parseYearBuilt('осумдесетти'));
console.log('  --- digit compound quantities (80 i ses = 86, not 1980)');
assert('D6: "VKUPNO IMA 80 I SES" → null', parseYearBuilt('VKUPNO IMA 80 I SES') === null, parseYearBuilt('VKUPNO IMA 80 I SES'));
assert('D7: Cyrillic "VKUPNO IMA 80 И ШЕС" → null', parseYearBuilt('VKUPNO IMA 80 И ШЕС') === null, parseYearBuilt('VKUPNO IMA 80 И ШЕС'));
assert('D8: "90 i pet kvadrati" → null', parseYearBuilt('90 i pet kvadrati') === null, parseYearBuilt('90 i pet kvadrati'));

console.log('\n🧪 E: e2e — generateResponse on the totalSqm question');
const { generateResponse } = await import('./service.js');
const s = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 185000, cleanPriceConfidence: 0.95 },
  messages: [{ role: 'model', text: 'Одлично, уште последниве информации и завршуваме. Колкава е вкупната квадратура по имотен лист?' }],
  phone: '+38970123456'
};
const r = await generateResponse(s, REPORTED);
assert('E1: totalSqm=86 collected', s.collectedData.totalSqm === 86, s.collectedData.totalSqm);
assert('E2: totalSqmConfidence=0.95 (no re-ask)', s.collectedData.totalSqmConfidence === 0.95, s.collectedData.totalSqmConfidence);
assert('E3: terraceSqm=3', s.collectedData.terraceSqm === 3, s.collectedData.terraceSqm);
assert('E4: no phantom yearBuilt', s.collectedData.yearBuilt === undefined, s.collectedData.yearBuilt);
assert('E5: advances to the NEXT question (bedrooms), not re-asking sqm',
  r.type === 'QUESTION' && !/квадратур|квадратура|кв\.? м/i.test(r.text || ''), r.text);

console.log('\n🧪 F: digit totals under vkupno');
const g2 = runGlobalExtraction('VKUPNO IMA 86 SO TERASA OD 3 M2', { transactionType: 'sale' }, undefined);
assert('F1: "VKUPNO IMA 86 SO TERASA 3 M2" → totalSqm=86', g2.totalSqm === 86, g2.totalSqm);
assert('F2: terraceSqm=3', g2.terraceSqm === 3, g2.terraceSqm);

console.log('\n🧪 G: vkupno NOT sqm — price/floor/year guards');
const g3 = runGlobalExtraction('VKUPNO 350 EVRA', { transactionType: 'sale' }, undefined);
assert('G1: "VKUPNO 350 EVRA" is a PRICE — totalSqm stays undefined', g3.totalSqm === undefined, g3.totalSqm);
const g4 = runGlobalExtraction('VKUPNO IMA 7 SPRAta', { transactionType: 'sale' }, undefined);
assert('G2: "VKUPNO 7 SPRAta" is floors — totalSqm stays undefined', g4.totalSqm === undefined, g4.totalSqm);
const g5 = runGlobalExtraction('VKUPNO OSUMDESET GODINA', { transactionType: 'sale' }, undefined);
assert('G3: "VKUPNO OSUMDESET GODINA" is a year — totalSqm stays undefined', g5.totalSqm === undefined, g5.totalSqm);

console.log('\n🧪 H2: "ses"/"шес" boundary — 16 must NOT read as 6 (reviewer finding)');
// parseMacedonianNumber sorts its word map LONGEST-FIRST ('sesnaeset':16
// beats 'ses':6), and parseNumberWords only matches 'ses' via exact-trim or
// the Cyrillic-aware iBrojMatch boundary — so the truncated 6-form can never
// corrupt 16 ("sesnaeset"/"шеснаесет").
assert('H2-1: parseMacedonianNumber("sesnaeset") → 16', parseMacedonianNumber('sesnaeset') === 16, parseMacedonianNumber('sesnaeset'));
assert('H2-2: parseMacedonianNumber("шеснаесет") → 16', parseMacedonianNumber('шеснаесет') === 16, parseMacedonianNumber('шеснаесет'));
assert('H2-3: parseMacedonianNumber("ses") → 6 (truncated form still works)', parseMacedonianNumber('ses') === 6, parseMacedonianNumber('ses'));
assert('H2-4: parseNumberWords("i sesnaeset") does not read "ses" as 6', parseNumberWords('i sesnaeset') !== 6, parseNumberWords('i sesnaeset'));

console.log('\n🧪 H: price path regression — "i {unit}" mid-sentence must not corrupt iljadi parsing');
assert('H1: extractPrice("stodvaeset i pet iljadi") → 125000', extractPrice('stodvaeset i pet iljadi') === 125000, extractPrice('stodvaeset i pet iljadi'));
assert('H2: extractPrice("osumdeset i pet iljadi") → 85000', extractPrice('osumdeset i pet iljadi') === 85000, extractPrice('osumdeset i pet iljadi'));

console.log(`\n${'='.repeat(50)}`);
console.log(`Total: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('ALL CHECKS PASSED');
