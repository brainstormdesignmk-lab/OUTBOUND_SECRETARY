import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Age-Deflection Hardcoded Response
// ========================================
// When the owner asks Ana's personal age ("kolku godini imas ana?",
// "kolku si stara?", "koja godina si rodena?"), she NEVER answers with
// her age — she deflects professionally to her experience, using the
// rotating variants the user approved (the exact deflection from the
// production log, plus 2 more).
//
//   User request: "i liked this answer she gave on the howold ...
//   i would like this hardcoded with a few more variants"
//   Liked answer: "Имам доволно години искуство во агенцијата за да
//   знам како да го продадем вашиот стан брзо и ефикасно. Дали да
//   продолжиме?"
//
// Runs fully offline — the age question is handled by the hardcoded
// handler BEFORE any LLM call, so no GROQ_API_KEY needed.
//
// IMPORTANT: the age question is NOT an offensive strike anymore (C1 was
// removed from the classifier) — it gets this professional deflection.
// ========================================
import { generateResponse } from './service.js';
import { isAskingAboutAge, AGE_DEFLECTION_RESPONSES_SALE, AGE_DEFLECTION_RESPONSES_RENT } from './objections.js';

const harness = createHarness();
const assert = harness.assert;



console.log('=== TEST: isAskingAboutAge regex (offline) ===');

// Questions that MUST match (production message + common variants)
const shouldMatch = [
  'KOLKU GODINI IMAS ANA ?',                 // exact production message
  'kolku godini imas?',
  'колку години имаш ана?',
  'kolku godini ima ana?',
  'kolku si stara?',
  'колку си стара?',
  'kolku godini si?',
  'која година си родена?',
  'koga si rodena?',
  'кога си родена?',
  'kolku godini e ana?'
];
console.log(`\n  Matching questions (${shouldMatch.length}):`);
for (const q of shouldMatch) {
  const r = isAskingAboutAge(q.toLowerCase());
  assert(`match: "${q}"`, r === true);
}

// Questions that MUST NOT match (false-positive guards)
const shouldNotMatch = [
  'kolku godini imas iskustvo vo agencija?',  // years of experience — NOT age
  'kolku godini imas rabotno iskustvo?',      // work experience
  'kolku godini imas vo agencijata?',         // tenure at the agency
  'kolku godini e zgradata?',                 // building age
  'kolku godini e stanot?',                   // property age
  'kolku godini rabotite?',                   // how long do you work (agency question)
  'koga mozam da dojdeme na poseta?',         // when can we visit
  'koj plakja advokat?',                      // legal costs
  'dali imate kupci za mojot stan?'           // clients
];
console.log(`\n  Non-matching questions (${shouldNotMatch.length}):`);
for (const q of shouldNotMatch) {
  const r = isAskingAboutAge(q.toLowerCase());
  assert(`no-match: "${q}"`, r === false);
}

console.log('\n=== TEST: generateResponse end-to-end (offline, hardcoded handler) ===');

const session = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
  collectedData: { cooperationAccepted: false, transactionType: 'sale', propertyType: 'apartment' },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970000002'
};

// Sale session: age question → NORMAL + one of the SALE deflection texts,
// and zero strikes recorded (NOT an offense anymore).
for (const q of ['KOLKU GODINI IMAS ANA ?', 'kolku si stara?', 'koja godina si rodena?']) {
  const res = await generateResponse(session, q);
  assert(`e2e sale "${q}" → NORMAL + approved deflection`, res.type === 'NORMAL' && AGE_DEFLECTION_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
  assert(`e2e sale "${q}" → zero strikes`, (session.offensiveStrikes || 0) === 0, `got strikes=${session.offensiveStrikes}`);
}

// Rent session: deflection must use the RENT variants (да го издадем).
const rentSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
  collectedData: { cooperationAccepted: false, transactionType: 'rent', propertyType: 'apartment' },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970000003'
};
const rentRes = await generateResponse(rentSession, 'kolku godini imas ana?');
assert(`e2e rent → NORMAL + RENT deflection`, rentRes.type === 'NORMAL' && AGE_DEFLECTION_RESPONSES_RENT.includes(rentRes.text), `got [${rentRes.type}] "${(rentRes.text || '').substring(0, 80)}"`);

// Experience question must NOT hit the age deflection (goes to agency/other handler).
// Only assert it does NOT return an age-deflection text (offline-safe via agency handler).
const expRes = await generateResponse(session, 'kolku godini imas iskustvo vo agencija?');
assert(`experience question → NOT age-deflection text`, !AGE_DEFLECTION_RESPONSES_SALE.includes(expRes.text), `got "${(expRes.text || '').substring(0, 80)}"`);
assert(`experience question → no strike`, (session.offensiveStrikes || 0) === 0, `got strikes=${session.offensiveStrikes}`);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 AGE-DEFLECTION TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 AGE-DEFLECTION TESTS PASSED');
}
