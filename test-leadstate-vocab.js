import { createHarness } from './test-helpers.js';
// ========================================
// test-leadstate-vocab.js — Appliance-grade LeadState vocabulary
// ========================================
// Step 1 of the appliance-grade checklist: rename LeadState values to the
// appliance-grade vocabulary, delete dead CLOSED_NO_RESPONSE, add
// WAITING_PHOTOS + BLOCKLISTED states.
//
// Verifies:
//   1. The full appliance-grade enum (NEW_LEAD, CONTACTING, COLLECTING_DATA,
//      WAITING_PHOTOS, NEEDS_HUMAN, CLOSED_*, BLOCKLISTED) — exact string values
//   2. CLOSED_NO_RESPONSE is GONE (was dead — no-response → CLOSED_TIMEOUT)
//   3. mark* transitions: NEW_LEAD → CONTACTING → COLLECTING_DATA →
//      WAITING_PHOTOS, terminal marks (success / not interested / timeout /
//      blocklisted), and markCollectingData (owner_back from photo wait)
//   4. isActive() includes the new WAITING_PHOTOS + CONTACTING states and
//      excludes every terminal state
//   5. Legacy normalization: v1 strings map to the new vocabulary on
//      deserialize (crash recovery survives the upgrade)
//   6. Persistence round-trip preserves the new state values
//
// Fully offline — no Groq calls.
//
// Run: node test-leadstate-vocab.js
// ========================================
import { LeadSession, LeadState, normalizeState } from './scheduler.js';
import { SessionStore } from './session-store.js';

const harness = createHarness();
const assert = harness.assert;



function makeLead(phone = '+38970000001') {
  return { phone, title: 'Стан на Аеродром', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
}

// ========================================
// 1. Enum vocabulary — exact values
// ========================================
{
  assert('LeadState.NEW_LEAD === "new_lead"', LeadState.NEW_LEAD === 'new_lead', `got ${LeadState.NEW_LEAD}`);
  assert('LeadState.CONTACTING === "contacting"', LeadState.CONTACTING === 'contacting', `got ${LeadState.CONTACTING}`);
  assert('LeadState.COLLECTING_DATA === "collecting_data"', LeadState.COLLECTING_DATA === 'collecting_data', `got ${LeadState.COLLECTING_DATA}`);
  assert('LeadState.WAITING_PHOTOS === "waiting_photos"', LeadState.WAITING_PHOTOS === 'waiting_photos', `got ${LeadState.WAITING_PHOTOS}`);
  assert('LeadState.NEEDS_HUMAN === "needs_human"', LeadState.NEEDS_HUMAN === 'needs_human', `got ${LeadState.NEEDS_HUMAN}`);
  assert('LeadState.CLOSED_SUCCESS === "closed_success"', LeadState.CLOSED_SUCCESS === 'closed_success', `got ${LeadState.CLOSED_SUCCESS}`);
  assert('LeadState.CLOSED_NOT_INTERESTED === "closed_not_interested"', LeadState.CLOSED_NOT_INTERESTED === 'closed_not_interested', `got ${LeadState.CLOSED_NOT_INTERESTED}`);
  assert('LeadState.CLOSED_TIMEOUT === "closed_timeout"', LeadState.CLOSED_TIMEOUT === 'closed_timeout', `got ${LeadState.CLOSED_TIMEOUT}`);
  assert('LeadState.BLOCKLISTED === "blocklisted"', LeadState.BLOCKLISTED === 'blocklisted', `got ${LeadState.BLOCKLISTED}`);
}

// ========================================
// 2. Dead CLOSED_NO_RESPONSE is deleted
// ========================================
{
  assert('CLOSED_NO_RESPONSE is GONE', LeadState.CLOSED_NO_RESPONSE === undefined, `got ${LeadState.CLOSED_NO_RESPONSE}`);
  assert('old AWAITING_GREETING is GONE', LeadState.AWAITING_GREETING === undefined, `got ${LeadState.AWAITING_GREETING}`);
  assert('old AWAITING_PITCH_RESPONSE is GONE', LeadState.AWAITING_PITCH_RESPONSE === undefined, `got ${LeadState.AWAITING_PITCH_RESPONSE}`);
}

// ========================================
// 3. Transitions
// ========================================
{
  const s = new LeadSession(makeLead());
  assert('initial state is NEW_LEAD', s.state === LeadState.NEW_LEAD, `got ${s.state}`);

  s.markGreetingSent();
  assert('markGreetingSent → CONTACTING', s.state === LeadState.CONTACTING, `got ${s.state}`);

  s.markOwnerInterested();
  assert('markOwnerInterested → COLLECTING_DATA', s.state === LeadState.COLLECTING_DATA, `got ${s.state}`);

  s.markWaitingPhotos();
  assert('markWaitingPhotos → WAITING_PHOTOS', s.state === LeadState.WAITING_PHOTOS, `got ${s.state}`);

  // owner_back from the photo wait → back to collecting data
  s.markCollectingData();
  assert('markCollectingData → COLLECTING_DATA', s.state === LeadState.COLLECTING_DATA, `got ${s.state}`);

  s.markClosed(true);
  assert('markClosed(true) → CLOSED_SUCCESS', s.state === LeadState.CLOSED_SUCCESS, `got ${s.state}`);

  const s2 = new LeadSession(makeLead('+38970000002'));
  s2.markGreetingSent();
  s2.markOwnerInterested();
  s2.markClosed(false);
  assert('markClosed(false) → CLOSED_NOT_INTERESTED', s2.state === LeadState.CLOSED_NOT_INTERESTED, `got ${s2.state}`);

  const s3 = new LeadSession(makeLead('+38970000003'));
  s3.markTimedOut();
  assert('markTimedOut → CLOSED_TIMEOUT', s3.state === LeadState.CLOSED_TIMEOUT, `got ${s3.state}`);

  const s4 = new LeadSession(makeLead('+38970000004'));
  s4.markBlocklisted();
  assert('markBlocklisted → BLOCKLISTED', s4.state === LeadState.BLOCKLISTED, `got ${s4.state}`);

  const s5 = new LeadSession(makeLead('+38970000005'));
  s5.escalationReason = 'owner_requested_human';
  s5.markNeedsHuman();
  assert('markNeedsHuman → NEEDS_HUMAN', s5.state === LeadState.NEEDS_HUMAN, `got ${s5.state}`);
  assert('markNeedsHuman keeps escalationReason', s5.escalationReason === 'owner_requested_human', `got ${s5.escalationReason}`);

  const s6 = new LeadSession(makeLead('+38970000006'));
  s6.markNeedsHuman();
  assert('markNeedsHuman defaults reason', s6.escalationReason === 'owner_requested_human', `got ${s6.escalationReason}`);
}

// ========================================
// 4. isActive() — recovery scope
// ========================================
{
  const activeStates = [LeadState.NEW_LEAD, LeadState.CONTACTING, LeadState.COLLECTING_DATA, LeadState.WAITING_PHOTOS];
  for (const st of activeStates) {
    const s = new LeadSession(makeLead());
    s.state = st;
    assert(`isActive() true for ${st}`, s.isActive() === true, 'expected active');
  }
  const terminalStates = [LeadState.CLOSED_SUCCESS, LeadState.CLOSED_NOT_INTERESTED, LeadState.CLOSED_TIMEOUT, LeadState.BLOCKLISTED, LeadState.NEEDS_HUMAN];
  for (const st of terminalStates) {
    const s = new LeadSession(makeLead());
    s.state = st;
    assert(`isActive() false for ${st}`, s.isActive() === false, 'expected inactive');
  }
}

// ========================================
// 5. Legacy normalization (v1 → appliance-grade)
// ========================================
{
  assert('normalizeState("awaiting_greeting") → new_lead', normalizeState('awaiting_greeting') === 'new_lead', `got ${normalizeState('awaiting_greeting')}`);
  assert('normalizeState("awaiting_pitch_response") → contacting', normalizeState('awaiting_pitch_response') === 'contacting', `got ${normalizeState('awaiting_pitch_response')}`);
  assert('normalizeState("closed_no_response") → closed_timeout', normalizeState('closed_no_response') === 'closed_timeout', `got ${normalizeState('closed_no_response')}`);
  assert('normalizeState("collecting_data") unchanged', normalizeState('collecting_data') === 'collecting_data', `got ${normalizeState('collecting_data')}`);
  assert('normalizeState(undefined) → undefined', normalizeState(undefined) === undefined, `got ${normalizeState(undefined)}`);
}

// ========================================
// 6. Persistence round-trip preserves new values
// ========================================
{
  const store = new SessionStore('./data/test-leadstate-sessions.json');

  const s = new LeadSession(makeLead());
  s.markGreetingSent();
  s.markOwnerInterested();
  s.markWaitingPhotos();
  s.addSentMessage('test');

  const serialized = store._serializeSession(s);
  assert('serialize keeps waiting_photos', serialized.state === 'waiting_photos', `got ${serialized.state}`);

  const restored = store._deserializeSession(serialized);
  assert('deserialize keeps waiting_photos', restored.state === 'waiting_photos', `got ${restored.state}`);
  assert('restored isActive (photo wait survives recovery)', restored.isActive() === true, 'expected active');

  // NEEDS_HUMAN round-trip (human escalation survives recovery as a parked
  // terminal state — the operator picks it up from the CSV status column)
  const sEsc = new LeadSession(makeLead('+38970000007'));
  sEsc.markGreetingSent();
  sEsc.escalationReason = 'repeated_service_errors';
  sEsc.serviceErrorCount = 3;
  sEsc.markNeedsHuman();
  const escSerialized = store._serializeSession(sEsc);
  assert('serialize keeps needs_human', escSerialized.state === 'needs_human', `got ${escSerialized.state}`);
  assert('serialize keeps escalationReason', escSerialized.escalationReason === 'repeated_service_errors', `got ${escSerialized.escalationReason}`);
  assert('serialize keeps serviceErrorCount', escSerialized.serviceErrorCount === 3, `got ${escSerialized.serviceErrorCount}`);
  const escRestored = store._deserializeSession(escSerialized);
  assert('deserialize keeps needs_human', escRestored.state === 'needs_human', `got ${escRestored.state}`);
  assert('deserialize keeps escalationReason', escRestored.escalationReason === 'repeated_service_errors', `got ${escRestored.escalationReason}`);
  assert('deserialize keeps serviceErrorCount', escRestored.serviceErrorCount === 3, `got ${escRestored.serviceErrorCount}`);
  assert('restored isActive (NEEDS_HUMAN is terminal)', escRestored.isActive() === false, 'expected inactive');

  // Legacy persisted payload → normalized on load
  const legacy = store._deserializeSession({ phone: '+38970000009', adTitle: 'x', memory: {}, state: 'awaiting_greeting' });
  assert('legacy payload normalized on load', legacy.state === 'new_lead', `got ${legacy.state}`);
  assert('legacy payload is active', legacy.isActive() === true, 'expected active');

  try { store.clear(); } catch (e) {}
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} leadstate-vocab tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 LEADSTATE-VOCAB TESTS PASSED`);
