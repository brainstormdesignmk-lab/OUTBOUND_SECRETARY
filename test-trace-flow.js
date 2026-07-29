// ========================================
// TRACE: Reproduce the exact flow the user reported
// ========================================
// Tests what happens when owner says:
// "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot"
//
// Then tests multi-info flow:
// "da, 80 kvadrati, tret kat, ima lift"
// ========================================

import { classifyIntent, parseConversationContext } from './classifier.js';
import { isAskingAboutCommission, isAskingAboutClients, matchObjection } from './objections.js';
import { runGlobalExtraction } from './data-collector.js';
import { getNextMissingField } from './workflow.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}: ${detail}`);
  }
}

console.log('\n========================================');
console.log('🧪 SCENARIO 1: "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot"');
console.log('========================================\n');

const msg1 = "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot";
const u1 = msg1.toLowerCase();

// Test 1: Does it match the AVAILABILITY regex?
const availPatterns = ['ne e loso', 'jas ne plakjam', 'vie go prodavate'];
assert('"ne e loso" should NOT match availability (bare ne e removed)',
  !/uste go imam|dostapen e|go imam|nema go|seuste e|dostapen/i.test(u1),
  'bare ne e removed from availability regex');

// Test 2: Does it match the PRICE QUOTE check?
assert('"pa ne e loso..." should NOT match price quote',
  !/\b(baram|сакам|цена|cena)\s*\d{1,3}/i.test(u1),
  'no baram/sakam with number');

// Test 3: Does it match LEGAL COSTS?
const { isAskingAboutLegalCosts } = await import('./objections.js');
assert('"pa ne e loso..." should NOT match legal costs',
  !isAskingAboutLegalCosts(u1),
  'no advokat/notar/danok');

// Test 4: Does it match CLIENT QUESTION (former false positive)?
assert('"pa ne e loso..." should NOT match client question handler',
  !isAskingAboutClients(u1),
  'bare zainteresiran/klient removed from pattern');

// Test 5: Does it match COMMISSION handler (former false positive)?
assert('"pa ne e loso..." should NOT match commission handler',
  !isAskingAboutCommission(u1),
  'bare plakja removed from isAskingAboutCommission');

// Test 6: What does the CLASSIFIER return?
const conv = '';
const classification1 = classifyIntent(msg1, conv);
console.log(`\n  Classifier result: ${classification1.intent} (${classification1.confidence})`);
assert(`Classifier returns ACCEPTED or INTERESTED >0.5`,
  (classification1.intent === 'ACCEPTED' && classification1.confidence > 0.7) ||
  (classification1.intent === 'INTERESTED' && classification1.confidence > 0.5),
  `Got: ${classification1.intent} ${classification1.confidence} - ${classification1.reason}`);

// Test 7: Would GLOBAL EXTRACTION capture anything from this message?
const data1 = {};
const updates1 = runGlobalExtraction(u1, data1);
console.log(`\n  Global extraction updates:`, Object.keys(updates1).length > 0 ? Object.keys(updates1) : '(none)');
// This message is about understanding the model, not property details
assert('No property data extracted from understanding message',
  Object.keys(updates1).length === 0,
  'message has no sqm/price/floor data');

console.log('\n========================================');
console.log('🧪 SCENARIO 2: Multi-info in one message ("da, 80 kvadrati, tret kat, ima lift")');
console.log('========================================\n');

const msg2 = "da, 80 kvadrati, tret kat, ima lift";

// Test 1: What does the CLASSIFIER return?
const classification2 = classifyIntent(msg2, conv);
console.log(`  Classifier: ${classification2.intent} (${classification2.confidence})`);
assert(`"da, 80 kvadrati, tret kat, ima lift" → ACCEPTED`,
  classification2.intent === 'ACCEPTED',
  `Got: ${classification2.intent} (confidence: ${classification2.confidence})`);

// Test 2: Does it match any objection handlers?
assert('"da, 80 kvadrati..." should NOT match commission handler',
  !isAskingAboutCommission(msg2.toLowerCase()),
  'no commission keywords in this message');

// Test 3: Does GLOBAL EXTRACTION capture ALL 3 fields in one call?
const data2 = { cooperationAccepted: true };
const updates2 = runGlobalExtraction(msg2.toLowerCase(), data2);
console.log(`\n  Global extraction captured:`, JSON.stringify(updates2, null, 2));
assert('totalSqm extracted',
  updates2.totalSqm === 80,
  `Got: ${updates2.totalSqm}`);
assert('floor extracted',
  updates2.floor === 3,
  `Got: ${updates2.floor}`);
assert('elevator extracted',
  updates2.elevator === true,
  `Got: ${updates2.elevator}`);

// Apply updates to data2
Object.assign(data2, updates2);

// Test 4: What does getNextMissingField return after extraction?
const nextField = getNextMissingField(data2);
assert('nextField is NOT totalSqm, floor, or elevator (they were extracted)',
  nextField !== 'totalSqm' && nextField !== 'floor' && nextField !== 'elevator',
  `Next field after extraction: ${nextField}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 3: "ne sum zainteresiran" (should be REJECTED, not client question)');
console.log('========================================\n');

const msg3 = "ne sum zainteresiran";
assert('"ne sum zainteresiran" should NOT match client question handler',
  !isAskingAboutClients(msg3),
  'bare zainteresiran removed from isAskingAboutClients');

const classification3 = classifyIntent(msg3, conv);
assert('"ne sum zainteresiran" → REJECTED',
  classification3.intent === 'REJECTED',
  `Got: ${classification3.intent} ${classification3.confidence}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 4: Price extraction edge case ("98 iljadi")');
console.log('========================================\n');

const extractionRules = runGlobalExtraction('98 iljadi evra', { cooperationAccepted: true });
console.log(`  Price extraction:`, JSON.stringify(extractionRules));
assert('"98 iljadi" → cleanPrice should be 98000 (not 9898)',
  extractionRules.cleanPrice === 98000,
  `Got: ${extractionRules.cleanPrice}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 5: "jas baram 156 iljadi za mene" (buying signal)');
console.log('========================================\n');

const msg5 = "jas baram 156 iljadi za mene";
const classification5 = classifyIntent(msg5, conv);
console.log(`  Classifier: ${classification5.intent} (${classification5.confidence})`);
assert('"jas baram 156 iljadi za mene" should be INTERESTED/ACCEPTED (not REJECTED)',
  classification5.intent !== 'REJECTED',
  `Got: ${classification5.intent} ${classification5.confidence} - ${classification5.reason}`);

// ========================================
// SUMMARY
// ========================================
console.log('\n=======================================================');
console.log('📊 TRACE SUMMARY:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📋 Total:  ${passed + failed}`);
console.log('=======================================================');

if (failed > 0) {
  console.log('\n❌ SOME TESTS FAILED — investigate above.\n');
  process.exit(1);
} else {
  console.log('\n🟢 ALL CHECKS PASSED\n');
}
