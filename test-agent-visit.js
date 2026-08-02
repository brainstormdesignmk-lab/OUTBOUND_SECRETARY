import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Agent-Visit Hardcoded Response
// ========================================
// When the owner asks whether ANA PERSONALLY will come to the property,
// bring clients, show the apartment, or be present at the viewing,
// she must reply that it is NOT her personal obligation — a colleague
// agent will handle the case.
//
//   User request: "on the questions like will you come to show the
//   property she must say: Toa ne e moja obvrska vo Agencijata. Nekoj
//   od kolegite Agenti ke se pogrizi za vasiot slucaj."
//
// Runs fully offline — the matched questions are handled by the
// hardcoded handler BEFORE any LLM call, so no GROQ_API_KEY needed.
// ========================================
import { generateResponse } from './service.js';
import { isAskingAboutAgentVisit, AGENT_VISIT_RESPONSES } from './objections.js';

const harness = createHarness();
const assert = harness.assert;



// The 3 approved rotating variants (user reviewed & approved these) —
// pulled from the source-of-truth array in objections.js so the test
// stays in sync automatically if a text is ever edited.
//   1. "Тоа не е моја обврска..." (original)
//   2. "Посетите не се моја обврска..." (variant A)
//   3. "Прикажувањето на имотот го вршат моите колеги Агенти..." (variant B)
const EXPECTED = AGENT_VISIT_RESPONSES;

console.log('=== TEST: isAskingAboutAgentVisit regex (offline) ===');

// Questions that MUST match (production messages + common variants)
const shouldMatch = [
  'DALI TI KE DOAGJAS SO MUSTERII NA POSETA ?',  // exact production message
  'TI KE GI NOSIS KLIENTITE KAJ MENE VO STAN ?', // exact production message
  'dali ti ke dojdes da go pokazes?',
  'ke dojdes li na poseta?',
  'ke doagjas li na poseta?',
  'ke bides li prisutna?',
  'дали ти ќе бидеш присутна на посетата?',
  'ке бидеш ли присутна на посетата?',           // unaccented ке typo must also match
  'ќе бидеш ли присутна на посетата?',           // correct accented ќе
  'ke dojdes li da ja pokazes?'
];
console.log(`\n  Matching questions (${shouldMatch.length}):`);
for (const q of shouldMatch) {
  const r = isAskingAboutAgentVisit(q.toLowerCase());
  assert(`match: "${q}"`, r === true);
}

// Questions that MUST NOT match (false-positive guards)
const shouldNotMatch = [
  'dali ti ke mi pomognes?',           // any "will you help me" — must NOT match
  'kolku e provizijata?',
  'imate klienti zainteresirani?',
  'koj plakja advokat?',
  'dali imate kupci za mojot stan?'
];
console.log(`\n  Non-matching questions (${shouldNotMatch.length}):`);
for (const q of shouldNotMatch) {
  const r = isAskingAboutAgentVisit(q.toLowerCase());
  assert(`no-match: "${q}"`, r === false);
}

console.log('\n=== TEST: generateResponse end-to-end (offline, hardcoded handler) ===');

const session = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
  collectedData: { cooperationAccepted: false, transactionType: 'sale', propertyType: 'apartment' },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970000001'
};

for (const q of ['DALI TI KE DOAGJAS SO MUSTERII NA POSETA ?', 'TI KE GI NOSIS KLIENTITE KAJ MENE VO STAN ?']) {
  const res = await generateResponse(session, q);
  assert(`e2e "${q}" → NORMAL + approved text`, res.type === 'NORMAL' && EXPECTED.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// Normal (non-visit) question must NOT hit the agent-visit response.
// Also assert type === 'NORMAL' so the test proves it stayed in the
// hardcoded client-question handler — if it fell through to the LLM
// (which would fail offline), the offline guarantee would be silently broken.
const resOther = await generateResponse(session, 'dali imate kupci za mojot stan?');
assert(`non-visit question → NORMAL (hardcoded handler, offline-safe)`, resOther.type === 'NORMAL', `got type "${resOther.type}"`);
assert(`non-visit question does NOT return agent-visit text`, !EXPECTED.includes(resOther.text), `got "${(resOther.text || '').substring(0, 80)}"`);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 AGENT-VISIT TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 AGENT-VISIT TESTS PASSED');
}
