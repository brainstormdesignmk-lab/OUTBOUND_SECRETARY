// ============================================================
// test-terrace-of-which.js — "Terrace collected 3 instead of 2" regression
// ============================================================
// Reported (production log, lead 3571074):
//
//   OWNER: VKUPNO IMA SEESET I TRI KVADRATA OD KOI 2 SE TERASA
//          (63 sqm total, of which 2 are terrace)
//   ▸ EXTRACTED: totalSqm=63 (0.95)      ✅ correct
//   ▸ [TERRACE: 3m2]                     ❌ WRONG — should be 2
//
// Root cause: extractTerraceNumber's proximity/context scan treated the
// TOTAL-sqm numbers ("seeset"→60, "tri"→3) as terrace candidates because
// "kvadrata" sits between them and "terasa" — and the closest context number
// ("tri") won over the actual terrace number ("2 SE TERASA"). The number
// BOUND to terasa by the copula ("X se terasa" / "од кои X се тераса") is
// the terrace size and must win.
//
// Fix under test: extractTerraceNumber checks the copula-bound number FIRST
// (singular terrace forms only — the plural "ima 2 terasi" stays a COUNT,
// guarded by the existing plural logic).
//
// Runs fully offline — the DATA_COLLECTION phase never calls the LLM.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { extractTerraceNumber } from './property-extractor.js';
import { generateResponse } from './service.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — extractTerraceNumber unit checks
// ============================================================
console.log('\n========================================');
console.log('🧪 A: extractTerraceNumber — "of which X are terrace" copula');
console.log('========================================\n');

const TERRA = [
  // The exact reported message (word-number total, digit terrace)
  ['VKUPNO IMA SEESET I TRI KVADRATA OD KOI 2 SE TERASA', 2],
  // Digit total + digit terrace
  ['63 kvadrata od koi 2 se terasa', 2],
  // Cyrillic
  ['вкупно 63 квадрати, од кои 2 се тераса', 2],
  // Comma variant without "od koi" (copula alone)
  ['63 kvadrata, 2 se terasa', 2],
  // Number-word terrace ("dve" = 2)
  ['od koi dve se terasa od 63', 2],
  // No "se" copula, still "of which"
  ['63 kvadrata od koi 2 terasa', 2],
  // "vkupno ... od koi" ordering
  ['vkusno 63 kvadrata od koi 2 se terasa', 2]
];
for (const [msg, expected] of TERRA) {
  const got = extractTerraceNumber(msg);
  assert(`"${msg}" → ${expected} (not the total-sqm number)`, got === expected, `got ${got}`);
}

// Guard: the fix must NOT change legit terrace answers
assert('A2: "ima terasa 5m2" still → 5', extractTerraceNumber('ima terasa 5m2') === 5, `got ${extractTerraceNumber('ima terasa 5m2')}`);
assert('A2: "terasa 5 m2" still → 5', extractTerraceNumber('terasa 5 m2') === 5, `got ${extractTerraceNumber('terasa 5 m2')}`);
assert('A2: "nema terasa" still → null', extractTerraceNumber('nema terasa') === null, `got ${extractTerraceNumber('nema terasa')}`);
assert('A2: "ima 3 kvadrata e" still → 3', extractTerraceNumber('ima 3 kvadrata e') === 3, `got ${extractTerraceNumber('ima 3 kvadrata e')}`);
// TOTAL-SQM PHRASE GUARD (reported): "seese i osum kvadrata so terasa golema"
// = 68 m² total with a large terrace — NO terrace size given. The total-sqm
// number words ("seese"=60, "osum"=8) must NEVER be read as the terrace
// size: "osum" is glued to the total-sqm keyword "kvadrata", and "seese"
// sits before that keyword (the whole "seese i osum kvadrata" is the total).
assert('A2: total-sqm phrase + bare "terasa golema" → null (no phantom 60/8)',
  extractTerraceNumber('seese i osum kvadrata so terasa golema') === null,
  `got ${extractTerraceNumber('seese i osum kvadrata so terasa golema')}`);
assert('A2: "osum kvadrata i terasa" → null (number glued to kvadrata is the total)',
  extractTerraceNumber('osum kvadrata i terasa') === null,
  `got ${extractTerraceNumber('osum kvadrata i terasa')}`);
// CONTROL: an explicit terrace size with its own unit is still extracted
// even when a total-sqm phrase precedes it (the reported lead 5540516 case).
assert('A2: "VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2" → 3 (own unit wins)',
  extractTerraceNumber('VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2') === 3,
  `got ${extractTerraceNumber('VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2')}`);

// Guard: the PLURAL count construction must stay a COUNT (null), not a size
assert('A2: "ima 2 terasi" still → null (plural count, not size)',
  extractTerraceNumber('ima 2 terasi') === null,
  `got ${extractTerraceNumber('ima 2 terasi')}`);
assert('A2: "od koi 2 se terasi" still → null (plural count, not size)',
  extractTerraceNumber('od koi 2 se terasi') === null,
  `got ${extractTerraceNumber('od koi 2 se terasi')}`);

// ============================================================
// PART B — full generateResponse path (the exact reported message)
// ============================================================
console.log('\n========================================');
console.log('🧪 B: full flow — totalSqm=63 AND terraceSqm=2 from one message');
console.log('========================================\n');

const rentSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent', tenantPreferences: { preferred: [], excluded: [], notes: '' }, monthlyRent: 350, monthlyRentConfidence: 0.95, availableFrom: '2026-06-01', availableFromConfidence: 0.95 },
  messages: [
    { role: 'model', text: 'Одлично. Ќе ми бидат потребни неколку информации за внес на вашата недвижност во системот. Колкава е вкупната квадратура по имотен лист?' }
  ],
  phone: '+38970123456'
};

const res = await generateResponse(rentSession, 'VKUPNO IMA SEESET I TRI KVADRATA OD KOI 2 SE TERASA');
console.log('  Reply:', res.text);
assert('B1: totalSqm=63 extracted',
  rentSession.collectedData.totalSqm === 63,
  `got totalSqm=${JSON.stringify(rentSession.collectedData.totalSqm)}`);
assert('B1: terraceSqm=2 extracted (NOT 3 from the 63 phrase)',
  rentSession.collectedData.terraceSqm === 2,
  `got terraceSqm=${JSON.stringify(rentSession.collectedData.terraceSqm)}`);
assert('B1: hasTerrace=true',
  rentSession.collectedData.hasTerrace === true,
  `got hasTerrace=${JSON.stringify(rentSession.collectedData.hasTerrace)}`);
assert('B1: flow moved on — next question is bedrooms (not terrace/totalSqm re-ask)',
  res.type === 'QUESTION' && res.nextField === 'bedrooms' && !/терас/.test(res.text || ''),
  `got type=${res.type} next=${res.nextField} text=${JSON.stringify((res.text || '').slice(0, 70))}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('TERRACE-OF-WHICH TESTS');
harness.exit();
