import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Commission-Explanation + Agency-Workflow hardcoded responses
// ========================================
// Two user-approved answer families:
//
//   1. COMMISSION EXPLANATION — when the owner asks how the no-commission
//      model works ("kako zarabotuvate bez provizija?", "kako funkcionira
//      bez provizija?", "od sto zarabotuvate?"), Ana answers with the
//      commission-difference explanation (V1 = the exact production answer
//      the user wants hardcoded): "Разликата меѓу вашата чиста цена и
//      постигнатата купопродажна цена е провизија за агенцијата."
//
//   2. AGENCY WORKFLOW — when the owner asks how the agency manages his
//      property ("kako ke mi pomognete vo prodazbata?", "kako ke go
//      prodadete?"), Ana answers with the workflow text + the small change
//      the user requested ("без провизија за вас") in rotating variants.
//
// Runs fully offline — both are handled by hardcoded handlers BEFORE any
// LLM call, so no GROQ_API_KEY needed.
// ========================================
import { generateResponse } from './service.js';
import {
  isAskingHowCommissionWorks,
  COMMISSION_NO_PROVISION_RESPONSES_SALE,
  COMMISSION_NO_PROVISION_RESPONSES_RENT,
  AGENCY_WORKFLOW_RESPONSES_SALE,
  AGENCY_WORKFLOW_RESPONSES_RENT
} from './objections.js';

const harness = createHarness();
const assert = harness.assert;



function createSession(transactionType = 'sale') {
  return {
    adMemory: { transactionType, propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: { cooperationAccepted: false, transactionType, propertyType: 'apartment' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970000004'
  };
}

console.log('=== TEST: isAskingHowCommissionWorks regex (offline) ===');

// Questions that MUST match (production messages + common variants)
const shouldMatchCommission = [
  'kako zarabotuvate bez provizija ?',        // production log message
  'OD STO ZARABOTUVATE AKO NE ZEMATE PROVIZIJA ?',
  'kako funkcionira bez provizija',
  'како функционира без провизија',
  'како заработувате без провизија?',
  'od sto zarabotuvate?',
  'kako se naplakjate?',
  'како се наплаќате?'
];
console.log(`\n  Commission matching (${shouldMatchCommission.length}):`);
for (const q of shouldMatchCommission) {
  const r = isAskingHowCommissionWorks(q.toLowerCase());
  assert(`match: "${q}"`, r === true);
}

// Questions that MUST NOT match the commission handler
// (they belong to the workflow handler or are legit business questions)
const shouldNotMatchCommission = [
  'kako ke mi pomognete vo prodazbata?',     // workflow, NOT commission
  'kako ke go prodadete mojot stan?',         // workflow
  'kako rabotite voopsto?',                   // generic how-you-work (no provizija)
  'kako e provizijata za izdavanje?',         // covered by other commission handlers
  'kolku e provizijata?'
];
console.log(`\n  Commission non-matching (${shouldNotMatchCommission.length}):`);
for (const q of shouldNotMatchCommission) {
  const r = isAskingHowCommissionWorks(q.toLowerCase());
  assert(`no-match: "${q}"`, r === false);
}

console.log('\n=== TEST: generateResponse end-to-end (offline, hardcoded handlers) ===');

// SALE — commission explanation
const saleSession = createSession('sale');
for (const q of ['kako zarabotuvate bez provizija ?', 'OD STO ZARABOTUVATE AKO NE ZEMATE PROVIZIJA ?']) {
  const res = await generateResponse(saleSession, q);
  assert(`e2e sale commission "${q}" → NORMAL + approved explanation`, res.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// SALE — agency workflow ("kako ke mi pomognete vo prodazbata?")
const workflowSession = createSession('sale');
for (const q of ['kako ke mi pomognete vo prodazbata?', 'kako ke go prodadete mojot stan?', 'kako funkcionira procesot?']) {
  const res = await generateResponse(workflowSession, q);
  assert(`e2e sale workflow "${q}" → NORMAL + workflow text`, res.type === 'NORMAL' && AGENCY_WORKFLOW_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// CRITICAL: "kako funkcionira bez provizija" must hit COMMISSION (not workflow)
const criticalSession = createSession('sale');
const critRes = await generateResponse(criticalSession, 'kako funkcionira bez provizija');
assert(`CRITICAL: "kako funkcionira bez provizija" → COMMISSION explanation (not workflow)`, critRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(critRes.text), `got [${critRes.type}] "${(critRes.text || '').substring(0, 80)}"`);

// RENT — commission explanation
const rentSession = createSession('rent');
const rentComRes = await generateResponse(rentSession, 'kako zarabotuvate bez provizija ?');
assert(`e2e rent commission → NORMAL + rent explanation`, rentComRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_RENT.includes(rentComRes.text), `got [${rentComRes.type}] "${(rentComRes.text || '').substring(0, 80)}"`);

// RENT — agency workflow
const rentWorkflowSession = createSession('rent');
const rentWorkflowRes = await generateResponse(rentWorkflowSession, 'kako ke mi pomognete so izdavanjeto?');
assert(`e2e rent workflow → NORMAL + rent workflow text`, rentWorkflowRes.type === 'NORMAL' && AGENCY_WORKFLOW_RESPONSES_RENT.includes(rentWorkflowRes.text), `got [${rentWorkflowRes.type}] "${(rentWorkflowRes.text || '').substring(0, 80)}"`);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 COMMISSION/WORKFLOW TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 COMMISSION/WORKFLOW TESTS PASSED');
}
