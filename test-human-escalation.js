import { createHarness } from './test-helpers.js';
// ========================================
// test-human-escalation.js — Human escalation (NEEDS_HUMAN)
// ========================================
// Verifies the full human-escalation feature end to end:
//   1. LeadState.NEEDS_HUMAN vocabulary + markNeedsHuman() (default reason)
//   2. isHumanEscalationRequest detection — positive cases
//      (Latin + Cyrillic + English owner phrasing)
//   3. Detection negative cases — normal messages must NOT escalate
//   4. runHumanEscalation returns an ESCALATE handoff response
//   5. service.js generateResponse returns ESCALATE for a request
//      (fully offline — the escalation check fires before any LLM call)
//   6. Already-parked NEEDS_HUMAN sessions stay parked (never resumed)
//   7. campaign.handleReply ESCALATE → markNeedsHuman + summary count
//
// Fully offline — no Groq calls.
//
// Run: node test-human-escalation.js
// ========================================
import { LeadSession, LeadState } from './scheduler.js';
import { isHumanEscalationRequest, runHumanEscalation, getHumanEscalationMessage } from './handlers/human-escalation.js';
import { generateResponse } from './service.js';
import { Campaign } from './campaign.js';

const harness = createHarness();
const assert = harness.assert;



function makeSession(phone = '+38970111111') {
  const lead = {
    phone,
    title: 'Стан на Аеродром 60м2',
    url: 'https://example.com/ad',
    memory: { transactionType: 'sale', propertyType: 'apartment' }
  };
  const s = new LeadSession(lead);
  s.addSentMessage('Здраво, јас сум Ана од Metropolis...');
  return s;
}

// ========================================
// 1. Vocabulary + markNeedsHuman
// ========================================
{
  assert('LeadState.NEEDS_HUMAN === "needs_human"', LeadState.NEEDS_HUMAN === 'needs_human', `got ${LeadState.NEEDS_HUMAN}`);

  const s = makeSession();
  s.markNeedsHuman();
  assert('markNeedsHuman → NEEDS_HUMAN', s.state === LeadState.NEEDS_HUMAN, `got ${s.state}`);
  assert('markNeedsHuman defaults reason to owner_requested_human', s.escalationReason === 'owner_requested_human', `got ${s.escalationReason}`);
  assert('NEEDS_HUMAN is NOT active (bot never resumes)', s.isActive() === false, 'expected inactive');

  const s2 = makeSession('+38970222222');
  s2.escalationReason = 'repeated_service_errors';
  s2.markNeedsHuman();
  assert('markNeedsHuman preserves explicit reason', s2.escalationReason === 'repeated_service_errors', `got ${s2.escalationReason}`);
}

// ========================================
// 2. Detection — POSITIVE (must escalate)
// ========================================
{
  const positives = [
    // Latin script
    'sakam da zboram so covek',
    'sakam da pricam so vraboten',
    'dajte mi vraboten',
    'sakam agent',
    'sakam da zboram so agent',
    'sakam da se vidime licno',
    'sakam da dojdam vo kancelarija',
    'ne sakam da zboram so bot',
    'ne sakam da pricam so bot',
    'ti si bot',
    'dali si bot',
    'iskluci go botot',
    'sakam vistinski covek',
    'sakam da zboram so nekoj od agencijata',
    'live agent',
    'talk to a human',
    // Cyrillic script
    'сакам да зборам со човек',
    'сакам да причам со вработен',
    'дајте ми вработен',
    'сакам агент',
    'сакам да зборам со агент',
    'сакам да се видиме лично',
    'сакам да дојдам во канцеларија',
    'не сакам да зборам со бот',
    'ти си бот',
    'дали си бот',
    'исклучи го ботот',
    'сакам вистински човек',
    'сакам да зборам со некој од агенцијата',
    'може ли да зборам со човек',
    // Mixed casing / embedded in a sentence
    'OK sakam da zboram so Covek',
    'Здраво, сакам да зборам со човек, благодарам'
  ];
  for (const msg of positives) {
    assert(`detect POSITIVE: "${msg}"`, isHumanEscalationRequest(msg) === true, 'expected escalation');
  }
}

// ========================================
// 3. Detection — NEGATIVE (must NOT escalate)
// ========================================
{
  const negatives = [
    // Normal real-estate conversation
    'uste go imam stanot',
    'dali e dostapen?',
    'kako funkcionira provizijata?',
    'kolku % vi e provizijata?',
    'sakam da prodadam brzo',
    'sakam da iznaemam',
    'ima li agent za ovoj stan?',          // bare "agent" question — NOT a request to talk to one
    'kako vi e imeto?',                     // "kako vi e" — no escalation
    'moze li poevtino?',                    // "moze li" alone — no escalation
    'dali imate klienti?',
    'kolku e cena?',
    'dali ti ke dojdes na poseta?',         // agent-visit objection — NOT escalation
    'ke dojdes li da ja pokazes?',
    'koja e adresata?',
    'koj plakja notar?',
    'kade vi e kancelarijata?',             // agency location — NOT escalation
    'sakam da znam poveke',                 // "sakam" + generic — no human noun
    'moze da mi ispratite poveke info',
    'sakam da pricam so vasiot tim',        // borderline: "tim" not in phrase list (deliberate)
    'повикајте ме кога ќе имате клиент',    // "call me when you have a client" — NORMAL, no escalation
    'povikaj me koga ke imate klient'       // same in Latin script — NORMAL, no escalation
  ];
  for (const msg of negatives) {
    assert(`detect NEGATIVE: "${msg}"`, isHumanEscalationRequest(msg) === false, 'expected NO escalation');
  }
}

// ========================================
// 4. runHumanEscalation returns handoff response
// ========================================
{
  const res = runHumanEscalation({ u: 'sakam da zboram so covek' });
  assert('runHumanEscalation returns a response', res !== null && typeof res === 'object', 'got null');
  assert('runHumanEscalation type === ESCALATE', res?.type === 'ESCALATE', `got ${res?.type}`);
  assert('runHumanEscalation has non-empty handoff text', typeof res?.text === 'string' && res.text.length > 10, `got ${res?.text}`);

  const none = runHumanEscalation({ u: 'dali e dostapen stanot?' });
  assert('runHumanEscalation returns null for normal msg', none === null, 'expected null');

  const msg = getHumanEscalationMessage();
  assert('getHumanEscalationMessage returns a string', typeof msg === 'string' && msg.length > 10, `got ${msg}`);
}

// ========================================
// 5. service.js integration (offline — no LLM)
// ========================================
{
  const s = makeSession();
  const res = await generateResponse(s, 'sakam da zboram so covek');
  assert('generateResponse → ESCALATE for human request', res.type === 'ESCALATE', `got ${res.type}`);
  assert('ESCALATE response has text', typeof res.text === 'string' && res.text.length > 10, `got ${res.text}`);
  // Session must NOT have been mutated into data collection by the request
  assert('session not marked cooperating', s.collectedData.cooperationAccepted !== true, 'expected no cooperation flag');
}

// ========================================
// 6. Already-parked session stays parked
// ========================================
{
  const s = makeSession('+38970333333');
  s.markNeedsHuman();
  const res = await generateResponse(s, 'dali e dostapen?'); // normal message
  assert('parked NEEDS_HUMAN session returns ESCALATE', res.type === 'ESCALATE', `got ${res.type}`);
  assert('parked session state unchanged', s.state === LeadState.NEEDS_HUMAN, `got ${s.state}`);
}

// ========================================
// 6b. Parked-session guard beats the strike protocol
// The parked guard MUST run BEFORE the offensive protocol: a stray
// offensive message on an already-parked NEEDS_HUMAN session must return
// ESCALATE (never WARNING/TERMINATE, which campaign maps to
// markBlocklisted and would overwrite the escalation).
// ========================================
{
  const s = makeSession('+38970666666');
  s.markNeedsHuman();
  const res = await generateResponse(s, 'ti si kurva'); // offensive input
  assert('parked session beats strike protocol (ESCALATE, not WARNING/TERMINATE)', res.type === 'ESCALATE', `got ${res.type}`);
  assert('parked session state unchanged after offensive input', s.state === LeadState.NEEDS_HUMAN, `got ${s.state}`);
}

// ========================================
// 7. Service-error escalation path (repeated consecutive errors)
// ========================================
{
  const campaign = new Campaign();
  const s = makeSession('+38970555555');

  // First error → keep conversation going (no escalation yet)
  const escalate1 = campaign.shouldEscalateServiceError(s);
  assert('1st service error does NOT escalate', escalate1 === false, `got ${escalate1}`);
  assert('serviceErrorCount tracks to 1', s.serviceErrorCount === 1, `got ${s.serviceErrorCount}`);

  // Second consecutive error → escalate
  const escalate2 = campaign.shouldEscalateServiceError(s);
  assert('2nd consecutive service error escalates', escalate2 === true, `got ${escalate2}`);
  assert('serviceErrorCount tracks to 2', s.serviceErrorCount === 2, `got ${s.serviceErrorCount}`);

  // Persistence: count survives a round-trip (crash recovery continuity)
  const { SessionStore } = await import('./session-store.js');
  const store = new SessionStore('./data/test-human-escalation-sessions.json');
  const serialized = store._serializeSession(s);
  assert('serialize keeps serviceErrorCount', serialized.serviceErrorCount === 2, `got ${serialized.serviceErrorCount}`);
  const restored = store._deserializeSession(serialized);
  assert('deserialize keeps serviceErrorCount', restored.serviceErrorCount === 2, `got ${restored.serviceErrorCount}`);
  assert('restored isActive (not yet escalated)', restored.isActive() === true, 'expected active');
  try { await store.clear(); } catch (e) {}

  // Escalated-after-errors → terminal + reason recorded
  s.escalationReason = 'repeated_service_errors';
  s.markNeedsHuman();
  assert('service-error escalation marks NEEDS_HUMAN', s.state === LeadState.NEEDS_HUMAN, `got ${s.state}`);
  assert('repeated_service_errors reason recorded', s.escalationReason === 'repeated_service_errors', `got ${s.escalationReason}`);
  assert('escalated session is inactive', s.isActive() === false, 'expected inactive');
}

// ========================================
// 8. campaign.handleReply ESCALATE → markNeedsHuman + summary
// ========================================
{
  const campaign = new Campaign();
  // Stub the sleep so the test doesn't wait through the typing delay
  campaign.sleep = async () => {};

  const s = makeSession('+38970444444');
  campaign.sessions = [s];

  await campaign.handleReply(s, 'sakam da zboram so covek');

  assert('handleReply marks session NEEDS_HUMAN', s.state === LeadState.NEEDS_HUMAN, `got ${s.state}`);
  assert('handleReply sets default escalationReason', s.escalationReason === 'owner_requested_human', `got ${s.escalationReason}`);
  assert('handoff text was recorded in session messages', s.messages.some(m => m.role === 'model' && m.text.length > 10), 'no handoff message');

  const counts = campaign.countSummary();
  assert('countSummary counts needsHuman = 1', counts.needsHuman === 1, `got ${counts.needsHuman}`);
  assert('countSummary others are 0', counts.success === 0 && counts.timeout === 0, `got ${JSON.stringify(counts)}`);
}

// ========================================
// Summary
// ========================================
console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} human-escalation tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 HUMAN-ESCALATION TESTS PASSED`);
