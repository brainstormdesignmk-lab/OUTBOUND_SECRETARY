import { createHarness } from './test-helpers.js';
// ========================================
// test-awaiting-photos.js — AWAITING_PHOTOS phase (Layer 2)
// ========================================
// Verifies the AWAITING_PHOTOS phase lifecycle:
//   1. Entry: owner says "ke gi pratam podocna" during photo collection →
//      session.phase becomes AWAITING_PHOTOS (recovery branch emits
//      photos_send_later)
//   2. Resolve received: owner delivers photos → CLOSE + phase CLOSED
//   3. Resolve unavailable: owner can't send → CLOSE + phase CLOSED
//   4. owner_back: owner resumes talking → null + phase DATA_COLLECTION
//   5. Rollback edge: cooperation rolled back while awaiting → null + PERSUASION
//   6. Persistence round-trip preserves AWAITING_PHOTOS
//
// Fully offline: calls runComplexStatefulHandlers / runAwaitingPhotos /
// session-store directly — no Groq calls.
//
// Run: node test-awaiting-photos.js
// ========================================
import { runComplexStatefulHandlers } from './handlers/data-collection.js';
import { runAwaitingPhotos } from './handlers/awaiting-photos.js';
import { PHASES } from './handlers/state-machine.js';
import { SessionStore } from './session-store.js';
import { LeadSession } from './scheduler.js';

const harness = createHarness();
const assert = harness.assert;



// ========================================
// Session factory — in DATA_COLLECTION with all fields filled except photos
// ========================================
function createSession() {
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: [] // no scraper photos
    },
    collectedData: {
      cooperationAccepted: true,
      transactionType: 'sale',
      propertyType: 'apartment',
      cleanPrice: 120000,
      totalSqm: 60,
      terraceSqm: 0,
      hasTerrace: false,
      bedrooms: 2,
      floor: 3,
      totalFloors: 10,
      elevator: true,
      heating: 'district',
      ac: true,
      parking: 'garage',
      orientation: 'юг',
      furnished: true,
      yearBuilt: 2010,
      renovated: true,
      renovationYear: 2019,
      documentationClean: true
      // photos deliberately MISSING → nextField will be 'photos'
    },
    messages: [
      { role: 'model', text: 'Здраво...' },
      { role: 'user', text: 'moze' },
      { role: 'model', text: 'Која би била последната чиста цена за станот?' }
    ],
    phone: '+38970000001',
    phase: 'DATA_COLLECTION',
    pendingFollowUp: null,
    pendingConfirmation: null,
    questionAttempts: {}
  };
}

// ========================================
// 1. ENTRY — photos recovery branch → AWAITING_PHOTOS
// ========================================
{
  const session = createSession();
  const resp = runComplexStatefulHandlers({
    u: 'ke gi pratam podocna',
    userInput: 'ke gi pratam podocna',
    session,
    nextField: 'photos',
    hasScraperPhotos: false
  });
  assert('entry returns a QUESTION (recovery question)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('entry sets photosStatus=RECOVERY_ASKED', session.collectedData.photosStatus === 'RECOVERY_ASKED', `got ${session.collectedData.photosStatus}`);
  assert('entry transitions phase → AWAITING_PHOTOS', session.phase === PHASES.AWAITING_PHOTOS, `got "${session.phase}"`);
}

// ========================================
// 2. RESOLVE RECEIVED — owner delivers photos → CLOSE + CLOSED
// ========================================
{
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  const resp = runAwaitingPhotos({ u: 'evе, gi isprativ na viber', session });
  assert('received resolves to CLOSE', resp && resp.type === 'CLOSE', `got ${resp?.type}`);
  assert('received sets photosStatus=VIBER_RECEIVED', session.collectedData.photosStatus === 'VIBER_RECEIVED', `got ${session.collectedData.photosStatus}`);
  assert('received transitions phase → CLOSED', session.phase === PHASES.CLOSED, `got "${session.phase}"`);
  assert('received sets photos=true', session.collectedData.photos === true, 'photos not true');
}

// ========================================
// 3. RESOLVE UNAVAILABLE — owner can't send → CLOSE + CLOSED
// ========================================
{
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  const resp = runAwaitingPhotos({ u: 'ne mozam da ispratam, nemam sliki', session });
  assert('unavailable resolves to CLOSE', resp && resp.type === 'CLOSE', `got ${resp?.type}`);
  assert('unavailable sets photosStatus=PHOTOGRAPHY_NEEDED', session.collectedData.photosStatus === 'PHOTOGRAPHY_NEEDED', `got ${session.collectedData.photosStatus}`);
  assert('unavailable transitions phase → CLOSED', session.phase === PHASES.CLOSED, `got "${session.phase}"`);
}

// ========================================
// 3b. SENDING QUESTION — owner asks where/how to send the photos
//     → answered with QUESTION ack, stays in AWAITING_PHOTOS
//     (reported: "NA OVOJ BROJ DA GI PRATAM?" got owner_back → CLOSE
//     without ever being answered)
// ========================================
{
  const variants = [
    'na ovoj broj da gi pratam ?',
    'NA OVOJ BROJ DA GI PRATAM ?',  // exact reported message
    'kade da gi pratam?',
    'na koj broj da gi ispratam?',
    'dali da gi pratam na viber?',
    'tuka da gi pratam?',
    'mozam da gi pratam na viber?',
    'kade da gi isprajam?',
    'na koja adresa da gi pratam?'
  ];
  for (const v of variants) {
    const session = createSession();
    session.phase = PHASES.AWAITING_PHOTOS;
    const resp = runAwaitingPhotos({ u: v, session });
    assert(`sending question "${v}" → QUESTION ack`, resp && resp.type === 'QUESTION', `got ${resp?.type}`);
    assert(`sending question "${v}" stays in AWAITING_PHOTOS`, session.phase === PHASES.AWAITING_PHOTOS, `got "${session.phase}"`);
    assert(`sending question "${v}" ack mentions sending`, /испратете|испратете|ги очекувам|Viber/i.test(resp?.text || ''), `got ${resp?.text}`);
  }
}

{
  // Past-tense delivery must still resolve as RECEIVED (branch 1), not the
  // question ack — the new regex must not hijack deliveries.
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  const resp = runAwaitingPhotos({ u: 'eve, gi isprativ na viber', session });
  assert('past delivery still resolves to CLOSE (not question ack)', resp && resp.type === 'CLOSE', `got ${resp?.type}`);
  assert('past delivery still transitions → CLOSED', session.phase === PHASES.CLOSED, `got "${session.phase}"`);
}

// ========================================
// 4. OWNER BACK — owner resumes talking → null + DATA_COLLECTION
// ========================================
{
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  const resp = runAwaitingPhotos({ u: 'zaboraviv da kazam deka ima parking', session });
  assert('owner_back returns null (fall through)', resp === null, `got ${JSON.stringify(resp)}`);
  assert('owner_back transitions phase → DATA_COLLECTION', session.phase === PHASES.DATA_COLLECTION, `got "${session.phase}"`);
}

// ========================================
// 5. ROLLBACK EDGE — cooperation rolled back while awaiting → null + PERSUASION
// ========================================
{
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  session.collectedData.cooperationAccepted = false; // e.g. runEarlyResponses rollback fired
  const resp = runAwaitingPhotos({ u: 'ne sum rekol deka sakam sorabotka', session });
  assert('rollback returns null (fall through)', resp === null, `got ${JSON.stringify(resp)}`);
  assert('rollback transitions phase → PERSUASION', session.phase === PHASES.PERSUASION, `got "${session.phase}"`);
}

// ========================================
// 6. PERSISTENCE — AWAITING_PHOTOS survives serialize/deserialize
// ========================================
{
  const store = new SessionStore('./data/test-awaiting-photos-sessions.json');
  const lead = { phone: '+38970000003', title: 'Стан', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
  const session = new LeadSession(lead);
  session.phase = PHASES.AWAITING_PHOTOS;
  session.collectedData.cooperationAccepted = true;
  session.collectedData.photosStatus = 'RECOVERY_ASKED';
  session.addSentMessage('test');

  const serialized = store._serializeSession(session);
  assert('serialize includes AWAITING_PHOTOS', serialized.phase === PHASES.AWAITING_PHOTOS, `got "${serialized.phase}"`);

  const restored = store._deserializeSession(serialized);
  assert('deserialize preserves AWAITING_PHOTOS', restored.phase === PHASES.AWAITING_PHOTOS, `got "${restored.phase}"`);
  assert('deserialize preserves photosStatus', restored.collectedData.photosStatus === 'RECOVERY_ASKED', `got ${restored.collectedData.photosStatus}`);

  try { store.clear(); } catch (e) {}
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} awaiting-photos tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 AWAITING-PHOTOS TESTS PASSED`);
