import { createHarness } from './test-helpers.js';
// ========================================
// test-phase-tracking.js — Persisted session.phase field
// ========================================
// Middle-ground formalization: the derived phase (PERSUASION vs
// DATA_COLLECTION) is now mirrored onto a persisted session.phase field.
//
// Verifies:
//   1. Acceptance ("moze") → session.phase === 'DATA_COLLECTION'
//   2. Persuasion continuation → session.phase === 'PERSUASION'
//   3. Cooperation rollback (challenge after accept) → back to 'PERSUASION'
//   4. Persistence round-trip: serialize → deserialize preserves phase,
//      and missing phase defaults to 'PERSUASION'
//   5. Per-phase metrics counters are incremented (phaseEntered, phase_*)
//
// Fully offline: acceptance goes through generateResponse (short-positive →
// DATA_COLLECTION → offline QUESTION). Persuasion and rollback call
// detectPhase()/runEarlyResponses() DIRECTLY so no LLM call is ever made —
// the persuasion flow would otherwise fall through to runPersuasion (real
// Groq call), which would violate this suite's offline convention.
// ========================================
import { generateResponse } from './service.js';
import { detectPhase } from './handlers/persuasion-phase.js';
import { runEarlyResponses } from './handlers/early-responses.js';
import { SessionStore } from './session-store.js';
import { LeadSession } from './scheduler.js';
import { metrics } from './metrics.js';

const harness = createHarness();
const assert = harness.assert;



// ========================================
// Test session factory (sale, persuasion phase)
// ========================================
function createSession() {
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: { cooperationAccepted: false, transactionType: 'sale', propertyType: 'apartment' },
    messages: [
      { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: '+38970000001',
    phase: 'PERSUASION'
  };
}

// ========================================
// 1. Acceptance → DATA_COLLECTION phase mirrored
// ========================================
{
  const session = createSession();
  const res = await generateResponse(session, 'moze');
  // "moze" is a short positive → DATA_COLLECTION → asks a question offline
  assert('acceptance returns a question (offline DC)', res.type === 'QUESTION' || res.type === 'NORMAL', `got ${res.type}`);
  assert('acceptance mirrors phase=DATA_COLLECTION', session.phase === 'DATA_COLLECTION', `got "${session.phase}"`);
  assert('cooperationAccepted set', session.collectedData.cooperationAccepted === true, 'not accepted');
}

// ========================================
// 2. Persuasion continuation → PERSUASION phase (offline: detectPhase directly)
// ========================================
{
  const session = createSession();
  detectPhase({ u: 'interesno', conv: '', session, isRent: false });
  assert('persuasion mirrors phase=PERSUASION', session.phase === 'PERSUASION', `got "${session.phase}"`);
}

// ========================================
// 2b. PRODUCTION BUG REGRESSION — "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"
// (reported live): the owner gave a crystal-clear acceptance ("super, tell me
// what you need and let's start") but the bot logged [INTENT: INTERESTED, 0.5]
// and stayed in PERSUASION, so the LLM hallucinated a documents/meeting
// workflow nobody asked for. Root cause was TWO layers:
//   (a) the aorist "pocneme/почнеме" was missing from every acceptance rule;
//   (b) even after adding it, a bare /(ne|не)/ negation guard matched the
//       "ne" substring INSIDE "pocneme" (po-cne-me) and self-blocked it.
// This test locks the fix at the detectPhase boundary (the layer where the
// bug actually manifested) — not just classifyIntent in isolation — so a
// future regression in early-responses, context rules, or the acceptance
// gate (0.85) can never silently re-introduce the PERSUASION stall.
// ========================================
{
  const session = createSession();
  const detection = detectPhase({ u: 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME', conv: '', session, isRent: false });
  assert('production message classified ACCEPTED >= 0.85',
    detection.classification && detection.classification.intent === 'ACCEPTED' && detection.classification.confidence >= 0.85,
    `got ${detection.classification?.intent} ${detection.classification?.confidence}`);
  assert('production message enters DATA_COLLECTION phase', detection.phase === 'DATA_COLLECTION', `got "${detection.phase}"`);
  assert('production message mirrors phase=DATA_COLLECTION on session', session.phase === 'DATA_COLLECTION', `got "${session.phase}"`);
  assert('production message sets cooperationAccepted', session.collectedData.cooperationAccepted === true, 'not accepted');
}

// ========================================
// 2c. Decline regression — "da ne pocneme" ("let's not start") must stay
// PERSUASION, never DATA_COLLECTION. The targeted decline guard on the
// affirmative-start catch-all (and the aorist rule's own hasStandaloneNegation)
// must catch it — while still allowing genuine negated-affirmatives like
// "да, не е проблем" ("yes, it's not a problem" = acceptance).
// ========================================
{
  const session = createSession();
  const detection = detectPhase({ u: 'da ne pocneme', conv: '', session, isRent: false });
  assert('decline "da ne pocneme" stays PERSUASION', detection.phase === 'PERSUASION', `got "${detection.phase}"`);
  assert('decline does not set cooperationAccepted', session.collectedData.cooperationAccepted === false, 'accepted!');
}
{
  const session = createSession();
  const detection = detectPhase({ u: 'да, не е проблем', conv: '', session, isRent: false });
  assert('negated-affirmative "да, не е проблем" enters DATA_COLLECTION', detection.phase === 'DATA_COLLECTION', `got "${detection.phase}"`);
}

// ========================================
// 3. Cooperation rollback → back to PERSUASION (offline: runEarlyResponses + detectPhase)
// ========================================
{
  const session = createSession();
  session.collectedData.cooperationAccepted = true;
  session.phase = 'DATA_COLLECTION';
  // The rollback lives in runEarlyResponses (sets cooperationAccepted=false);
  // detectPhase then derives PERSUASION and mirrors it.
  runEarlyResponses({ u: 'ne sum rekol deka sakam sorabotka', isRent: false, session });
  detectPhase({ u: 'ne sum rekol deka sakam sorabotka', conv: '', session, isRent: false });
  assert('rollback mirrors phase back to PERSUASION', session.phase === 'PERSUASION', `got "${session.phase}"`);
  assert('rollback clears cooperationAccepted', session.collectedData.cooperationAccepted === false, 'still accepted');
}

// ========================================
// 3b. Cooperation rollback — CYRILLIC variant (regression guard)
// The REJECTED classifier rule must also match the Cyrillic script
// ("не сум рекол дека сакам соработка" with Cyrillic сум/рекол).
// The Latin-only regex would fall through to ACCEPTED 0.95 and
// re-accept cooperation immediately after the rollback.
// ========================================
{
  const session = createSession();
  session.collectedData.cooperationAccepted = true;
  session.phase = 'DATA_COLLECTION';
  runEarlyResponses({ u: 'не сум рекол дека сакам соработка', isRent: false, session });
  detectPhase({ u: 'не сум рекол дека сакам соработка', conv: '', session, isRent: false });
  assert('cyrillic rollback mirrors phase back to PERSUASION', session.phase === 'PERSUASION', `got "${session.phase}"`);
  assert('cyrillic rollback clears cooperationAccepted', session.collectedData.cooperationAccepted === false, 'still accepted');
}

// ========================================
// 3c. Cooperation rollback — "siguren" variant (regression guard)
// "не сум сигурен дека сакам соработка" (I'm not sure I want to
// cooperate) is a common rollback phrasing. Without "siguren" in the
// classifier's negation alternation, this would fall through to the
// ACCEPTED "sakam sorabotka" rule (0.95) and re-accept immediately
// after the rollback.
// ========================================
{
  const session = createSession();
  session.collectedData.cooperationAccepted = true;
  session.phase = 'DATA_COLLECTION';
  runEarlyResponses({ u: 'ne sum siguren deka sakam sorabotka', isRent: false, session });
  detectPhase({ u: 'ne sum siguren deka sakam sorabotka', conv: '', session, isRent: false });
  assert('siguren rollback mirrors phase back to PERSUASION', session.phase === 'PERSUASION', `got "${session.phase}"`);
  assert('siguren rollback clears cooperationAccepted', session.collectedData.cooperationAccepted === false, 'still accepted');
}

// ========================================
// 3d. AWAITING_PHOTOS phase — persisted + metrics (Layer 2 slotting)
// DATA_COLLECTION → AWAITING_PHOTOS → CLOSED. The entry path is tested in
// test-awaiting-photos.js; here we verify the phase mirroring + persistence
// + metrics integration through the state-machine chokepoint.
// ========================================
{
  const session = createSession();
  session.phase = 'AWAITING_PHOTOS'; // e.g. after photos_send_later
  const serialized = new SessionStore('./data/test-phase-sessions.json')._serializeSession(session);
  assert('AWAITING_PHOTOS serializes', serialized.phase === 'AWAITING_PHOTOS', `got "${serialized.phase}"`);

  const restored = new SessionStore('./data/test-phase-sessions.json')._deserializeSession(serialized);
  assert('AWAITING_PHOTOS round-trips', restored.phase === 'AWAITING_PHOTOS', `got "${restored.phase}"`);

  // Phase-agnostic metrics: transition FROM DATA_COLLECTION so a real
  // transition fires (transitionTo to the same phase is a no-op).
  const beforeAP = metrics.get('phase_AWAITING_PHOTOS');
  const { transitionTo } = await import('./handlers/state-machine.js?test=' + Date.now());
  session.phase = 'DATA_COLLECTION';
  transitionTo(session, 'AWAITING_PHOTOS', 'test');
  assert('phase_AWAITING_PHOTOS counter increments', metrics.get('phase_AWAITING_PHOTOS') > beforeAP, `before=${beforeAP} after=${metrics.get('phase_AWAITING_PHOTOS')}`);
  assert('transitionTo applied the phase', session.phase === 'AWAITING_PHOTOS', `got "${session.phase}"`);
}

// ========================================
// 4. Persistence round-trip preserves phase + default
// ========================================
{
  const store = new SessionStore('./data/test-phase-sessions.json');

  // Build a REAL LeadSession (has addSentMessage/markOwnerInterested)
  const lead = { phone: '+38970000003', title: 'Стан на Аеродром', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
  const session = new LeadSession(lead);
  session.phase = 'DATA_COLLECTION';
  session.collectedData.cooperationAccepted = true;
  session.addSentMessage('test message');
  session.markOwnerInterested();

  const serialized = store._serializeSession(session);
  assert('serialize includes phase', serialized.phase === 'DATA_COLLECTION', `got "${serialized.phase}"`);

  const restored = store._deserializeSession(serialized);
  assert('deserialize preserves phase', restored.phase === 'DATA_COLLECTION', `got "${restored.phase}"`);
  assert('deserialize preserves state', restored.state === 'collecting_data', `got "${restored.state}"`);

  // Missing phase defaults to PERSUASION
  const legacy = store._deserializeSession({ phone: '+38970000002', adTitle: 'x', memory: {} });
  assert('missing phase defaults to PERSUASION', legacy.phase === 'PERSUASION', `got "${legacy.phase}"`);

  // Clean up test file
  try { store.clear(); } catch (e) {}
}

// ========================================
// 5. Per-phase metrics incremented
// ========================================
{
  const beforeEntered = metrics.get('phaseEntered');
  const beforeDC = metrics.get('phase_DATA_COLLECTION');

  const session = createSession();
  await generateResponse(session, 'moze'); // → DATA_COLLECTION
  assert('phaseEntered counter increased', metrics.get('phaseEntered') > beforeEntered, `before=${beforeEntered} after=${metrics.get('phaseEntered')}`);
  assert('phase_DATA_COLLECTION counter increased', metrics.get('phase_DATA_COLLECTION') > beforeDC, `before=${beforeDC} after=${metrics.get('phase_DATA_COLLECTION')}`);
}

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 PHASE-TRACKING TESTS PASSED`);
