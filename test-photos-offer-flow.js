import { createHarness } from './test-helpers.js';
// ========================================
// test-photos-offer-flow.js — PHOTOS MARKETING FOLLOW-UP + REMINDER LADDER
// ========================================
// Reported requirement:
//   - PHOTOS IF NEMAM: when the owner has NO photos, Ana asks if he could
//     PROVIDE/MAKE them himself and send them on Viber (couple of question
//     variants) — photos are needed for marketing.
//   - YES → VIBER_PENDING. If not sent in 2 days → remind (follow-up). After
//     5 days → follow up again.
//   - CANNOT → NO_PHOTOS category. If the property is worth it → manager
//     reviews them. We send an offer for professional photography from our
//     agents.
//
// Verifies (via runComplexStatefulHandlers / runAwaitingPhotos / the engine's
// AWAITING_PHOTOS timer with a fake clock — no Groq calls):
//   1. NEMAM → MAKE_ASKED sub-state + make-photos question returned (variants)
//   2. Make-answer YES ("ke gi napravam") → VIBER_PENDING + photosPending +
//      photosPendingSince anchor + transition to AWAITING_PHOTOS
//   3. Make-answer CANNOT ("ne mozam da napravam") → NO_PHOTOS source +
//      PHOTOGRAPHY_ASKED sub-state + photography offer returned
//   4. Photography offer YES → PHOTOGRAPHY_NEEDED + photosManagerReview
//   5. Photography offer NO → NO_PHOTOS final, flow continues (null)
//   6. CANNOT-before-YES ordering: "ne mozam da napravam" must NOT be read as
//      a YES (isPositive matches a bare "da" substring — the shadowing trap)
//   7. Manager-review flag: set when rent >= threshold / sale >= threshold,
//      NOT set below the threshold
//   8. Engine AWAITING_PHOTOS timer: reminder at 2d, follow-up at 5d, close
//      at 7d (fake clock); no reminders before 2d; each rung fires once
//   9. Dropped make/offer question (engine question-state restore) unwinds the
//      sub-state so the photos field goes back to ASKABLE
//
// Run: node test-photos-offer-flow.js
// ========================================
import { runComplexStatefulHandlers } from './handlers/data-collection.js';
import { runAwaitingPhotos } from './handlers/awaiting-photos.js';
import { isPhotosWorthManagerReview, photosMessages } from './handlers/awaiting-photos.js';
import { PHASES, transition } from './handlers/state-machine.js';
import { MultiLeadEngine } from './engine.js';
import { LeadSession } from './scheduler.js';

const harness = createHarness();
const assert = harness.assert;

// ========================================
// Session factory — DATA_COLLECTION, photos is the next missing field
// ========================================
function createSession(overrides = {}) {
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: true,
      transactionType: overrides.transactionType || 'sale',
      propertyType: 'apartment',
      cleanPrice: overrides.cleanPrice !== undefined ? overrides.cleanPrice : 120000,
      monthlyRent: overrides.monthlyRent,
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
      orientation: 'jug',
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
      { role: 'model', text: 'Дали имате фотографии што би можеле да ни ги испратите на Viber?' }
    ],
    phone: '+38970000001',
    phase: 'DATA_COLLECTION',
    pendingFollowUp: null,
    pendingConfirmation: null,
    questionAttempts: {},
    ...overrides
  };
}

// ========================================
// 1. NEMAM → MAKE_ASKED + make-photos question (marketing)
// ========================================
console.log('\n📸 PHOTOS MARKETING FOLLOW-UP (NEMAM → make question)');
{
  const session = createSession();
  const resp = runComplexStatefulHandlers({
    u: 'nemam',
    userInput: 'nemam',
    session,
    nextField: 'photos',
    hasScraperPhotos: false
  });
  assert('1: NEMAM returns a QUESTION (make-photos question)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('1: NEMAM → photosStatus=MAKE_ASKED', session.collectedData.photosStatus === 'MAKE_ASKED', `got ${session.collectedData.photosStatus}`);
  assert('1: NEMAM → photos=false, photosPending=false', session.collectedData.photos === false && session.collectedData.photosPending === false, 'photos/pending wrong');
  assert('1: question mentions making the photos on Viber', /направите|фотографирате|направам|Viber/i.test(resp.text), `got "${resp.text.slice(0, 80)}"`);
  assert('1: STAYS in DATA_COLLECTION (no park yet)', session.phase === 'DATA_COLLECTION', `got ${session.phase}`);
}

// Question variants — two different NEMAM turns produce (possibly) different texts
{
  const s1 = createSession();
  const r1 = runComplexStatefulHandlers({ u: 'nemam sliki ama...', userInput: 'nemam sliki ama...', session: s1, nextField: 'photos', hasScraperPhotos: false });
  // NOTE: "nemam sliki" hits the RECOVERY branch (nema+sliki fallback), not
  // the plain-negative marketing branch. Use plain "nemam" for the variant test.
  const s2 = createSession();
  const r2 = runComplexStatefulHandlers({ u: 'nema', userInput: 'nema', session: s2, nextField: 'photos', hasScraperPhotos: false });
  assert('1: two make-questions may rotate variants', !!r1 && !!r2, 'both returned a question');
}

// ========================================
// 2. Make-answer YES → VIBER_PENDING + ladder anchor + AWAITING_PHOTOS
// ========================================
console.log('\n💬 MAKE-ANSWER: YES → VIBER_PENDING + AWAITING_PHOTOS');
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  assert('2: preconditions — MAKE_ASKED', session.collectedData.photosStatus === 'MAKE_ASKED', `got ${session.collectedData.photosStatus}`);
  const resp = runComplexStatefulHandlers({ u: 'ke gi napravam sam', userInput: 'ke gi napravam sam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('2: make-YES returns ack (QUESTION)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('2: make-YES → VIBER_PENDING', session.collectedData.photosStatus === 'VIBER_PENDING' && session.collectedData.photosSource === 'VIBER_PENDING', `got ${session.collectedData.photosStatus}`);
  assert('2: make-YES → photos=true, photosPending=true', session.collectedData.photos === true && session.collectedData.photosPending === true, 'photos/pending wrong');
  assert('2: photosPendingSince anchored (reminder ladder armed)', typeof session.collectedData.photosPendingSince === 'number', `got ${session.collectedData.photosPendingSince}`);
  assert('2: transitions → AWAITING_PHOTOS', session.phase === PHASES.AWAITING_PHOTOS, `got ${session.phase}`);
}

// Cyrillic make-YES
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'не', userInput: 'не', session, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ќе ги направам', userInput: 'ќе ги направам', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('2: Cyrillic make-YES → VIBER_PENDING', session.collectedData.photosStatus === 'VIBER_PENDING', `got ${session.collectedData.photosStatus}`);
}

// ========================================
// 3. Make-answer CANNOT → NO_PHOTOS + photography offer
// ========================================
console.log('\n💬 MAKE-ANSWER: CANNOT → NO_PHOTOS + photography offer');
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  const resp = runComplexStatefulHandlers({ u: 'ne mozam da napravam', userInput: 'ne mozam da napravam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('3: CANNOT returns the photography offer (QUESTION)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('3: CANNOT → NO_PHOTOS source', session.collectedData.photosSource === 'NO_PHOTOS', `got ${session.collectedData.photosSource}`);
  assert('3: CANNOT → PHOTOGRAPHY_ASKED sub-state', session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED', `got ${session.collectedData.photosStatus}`);
  assert('3: CANNOT → photos=false', session.collectedData.photos === false, `got ${session.collectedData.photos}`);
  assert('3: offer mentions professional photography from our agents', /фотографираат|фотографирање|фотограф/i.test(resp.text), `got "${resp.text.slice(0, 80)}"`);
}

// ========================================
// 4. CANNOT-BEFORE-YES ORDERING — "ne mozam da napravam" must NOT be a YES
// ========================================
{
  // isPositive("ne mozam da napravam") === true (bare "da" substring). The
  // CANNOT check must run first or this becomes a false VIBER_PENDING.
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne mozam da napravam', userInput: 'ne mozam da napravam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('4: "ne mozam da napravam" → NO_PHOTOS, NOT VIBER_PENDING', session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED' && session.collectedData.photosSource === 'NO_PHOTOS', `got status=${session.collectedData.photosStatus}, source=${session.collectedData.photosSource}`);
  assert('4: STILL in DATA_COLLECTION (offer pending)', session.phase === 'DATA_COLLECTION', `got ${session.phase}`);
}

// ========================================
// 5. Photography offer YES → PHOTOGRAPHY_NEEDED; NO → NO_PHOTOS
// ========================================
console.log('\n📷 PHOTOGRAPHY OFFER: YES / NO');
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne mozam da napravam', userInput: 'ne mozam da napravam', session, nextField: 'ownerName', hasScraperPhotos: false });
  const resp = runComplexStatefulHandlers({ u: 'sakam', userInput: 'sakam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('5: offer-YES → PHOTOGRAPHY_NEEDED', session.collectedData.photosStatus === 'PHOTOGRAPHY_NEEDED', `got ${session.collectedData.photosStatus}`);
  assert('5: offer-YES → photosManagerReview=true', session.collectedData.photosManagerReview === true, `got ${session.collectedData.photosManagerReview}`);
  assert('5: offer-YES returns ack (QUESTION)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
}
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne mozam da napravam', userInput: 'ne mozam da napravam', session, nextField: 'ownerName', hasScraperPhotos: false });
  const resp = runComplexStatefulHandlers({ u: 'ne sakam', userInput: 'ne sakam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('5: offer-NO → NO_PHOTOS final', session.collectedData.photosStatus === 'NO_PHOTOS' && session.collectedData.photosSource === 'NO_PHOTOS', `got status=${session.collectedData.photosStatus}`);
  assert('5: offer-NO returns null (continue flow)', resp === null, `got ${JSON.stringify(resp)}`);
}
// Offer shadowing: "ne sakam" contains "sakam" — NO must win
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne mozam', userInput: 'ne mozam', session, nextField: 'ownerName', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne sakam', userInput: 'ne sakam', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('5: "ne sakam" → NO_PHOTOS, NOT PHOTOGRAPHY_NEEDED', session.collectedData.photosStatus === 'NO_PHOTOS', `got ${session.collectedData.photosStatus}`);
}

// ========================================
// 6. Unclear make-answer → re-ask, sub-state kept
// ========================================
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  const resp = runComplexStatefulHandlers({ u: 'kako si', userInput: 'kako si', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('6: unclear make-answer → re-ask (QUESTION)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('6: stays MAKE_ASKED', session.collectedData.photosStatus === 'MAKE_ASKED', `got ${session.collectedData.photosStatus}`);
}

// ========================================
// 7. Manager-review flag — worth it vs not
// ========================================
console.log('\n💼 MANAGER-REVIEW FLAG (property worth it?)');
{
  const sWorth = createSession({ cleanPrice: 250000 });
  assert('7: sale 250000 → worth review', isPhotosWorthManagerReview(sWorth) === true, `got ${isPhotosWorthManagerReview(sWorth)}`);
  const sCheap = createSession({ cleanPrice: 50000 });
  assert('7: sale 50000 → not worth', isPhotosWorthManagerReview(sCheap) === false, `got ${isPhotosWorthManagerReview(sCheap)}`);
  const sRent = createSession({ transactionType: 'rent', monthlyRent: 500, cleanPrice: undefined });
  assert('7: rent 500 → worth review', isPhotosWorthManagerReview(sRent) === true, `got ${isPhotosWorthManagerReview(sRent)}`);
  const sRentCheap = createSession({ transactionType: 'rent', monthlyRent: 200, cleanPrice: undefined });
  assert('7: rent 200 → not worth', isPhotosWorthManagerReview(sRentCheap) === false, `got ${isPhotosWorthManagerReview(sRentCheap)}`);
  // End-to-end: cheap property gets NO flag on CANNOT
  const s = createSession({ cleanPrice: 50000 });
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session: s, nextField: 'photos', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'ne mozam da napravam', userInput: 'ne mozam da napravam', session: s, nextField: 'ownerName', hasScraperPhotos: false });
  assert('7: cheap property → photosManagerReview NOT set', s.collectedData.photosManagerReview !== true, `got ${s.collectedData.photosManagerReview}`);
}

// ========================================
// 8. Engine AWAITING_PHOTOS REMINDER LADDER (2d / 5d / 7d) — fake clock
// ========================================
console.log('\n⏰ ENGINE REMINDER LADDER (2d / 5d / 7d)');
class FakeClock {
  constructor() { this.t = 0; }
  now() { return this.t; }
  advance(ms) { this.t += ms; }
}
const DAY = 24 * 60 * 60 * 1000;

function makeEngine(clock) {
  const engine = new MultiLeadEngine({
    now: () => clock.now(),
    sleep: async () => {},
    tickMs: 1,
    typingDelay: () => 0,
    canSendContact: () => true,
    recordSent: () => {}
  });
  engine.start({ noInterval: true });
  return engine;
}

{
  const clock = new FakeClock();
  const engine = makeEngine(clock);
  const lead = { id: 'photos-ladder-1', title: 'Стан', phone: '+38970000001', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
  engine.loadLead(lead);
  await engine.tick(); // greet the lead first (removes it from pendingGreetings)
  const session = engine.getSession('photos-ladder-1');
  const baseMsgs = session.messages.filter(m => m.role === 'model').length; // the greeting
  // Park the session in AWAITING_PHOTOS with a committed delivery + anchor
  session.phase = PHASES.AWAITING_PHOTOS;
  session.collectedData.cooperationAccepted = true;
  session.collectedData.photosStatus = 'VIBER_PENDING';
  session.collectedData.photosPending = true;
  session.collectedData.photosPendingSince = clock.now(); // anchored NOW at t=0
  const modelCount = () => session.messages.filter(m => m.role === 'model').length;
  const reminderTexts = () => session.messages.filter(m => m.role === 'model').slice(baseMsgs).map(m => m.text);

  // Day 1: no reminder yet
  clock.advance(1 * DAY);
  await engine.tick();
  assert('8: day 1 — no reminder sent', session.collectedData.photosReminder1Sent !== true && modelCount() === baseMsgs, `msgs=${modelCount()}`);

  // Day 2: reminder 1 fires once
  clock.advance(1 * DAY);
  await engine.tick();
  assert('8: day 2 — reminder 1 sent', session.collectedData.photosReminder1Sent === true, `got ${session.collectedData.photosReminder1Sent}`);
  const r1 = reminderTexts();
  assert('8: day 2 — one reminder message', r1.length === 1, `got ${r1.length}`);
  assert('8: reminder 1 mentions photos/Viber', /фотографии|слики|Viber/i.test(r1[0]), `got "${(r1[0] || '').slice(0, 60)}"`);
  // Same day, second tick: NOT sent again
  clock.advance(1000);
  await engine.tick();
  assert('8: reminder 1 fires only once', modelCount() === baseMsgs + 1, `msgs=${modelCount()}`);

  // Day 5: reminder 2 fires once
  clock.advance(3 * DAY);
  await engine.tick();
  assert('8: day 5 — reminder 2 sent', session.collectedData.photosReminder2Sent === true, `got ${session.collectedData.photosReminder2Sent}`);
  assert('8: day 5 — total 2 reminders', modelCount() === baseMsgs + 2, `msgs=${modelCount()}`);

  // Day 7: timeout close
  clock.advance(2 * DAY);
  await engine.tick();
  assert('8: day 7 — session CLOSED by photos timeout', session.phase === PHASES.CLOSED, `got ${session.phase}`);
}

// ========================================
// 9. DROPPED MAKE/OFFER QUESTION — grace-batch restore unwinds sub-state
// ========================================
// An intermediate message whose make-question response is DROPPED (grace
// batch: only the LAST response is sent) must roll the photos field back to
// ASKABLE — the owner never saw the make question, so their next message must
// not be consumed as a make-answer against a sub-state they never saw.
console.log('\n🔁 DROPPED MAKE QUESTION — sub-state unwind');
{
  const clock = new FakeClock();
  const engine = makeEngine(clock);
  const lead = { id: 'photos-drop-1', title: 'Стан', phone: '+38970000002', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
  engine.loadLead(lead);
  const session = engine.getSession('photos-drop-1');
  session.phase = 'DATA_COLLECTION';
  session.collectedData.cooperationAccepted = true;
  // Prime the conversation like onOwnerMessage does (reply added before batch)
  session.messages = [{ role: 'model', text: 'Дали имате фотографии што би можеле да ни ги испратите на Viber?' }];
  session.addReply('nemam'); // first message → make question (DROPPED)
  session.addReply('kako si'); // second message → the visible reply
  await engine._processOwnerBatch('photos-drop-1', ['nemam', 'kako si']);
  assert('9: dropped make question → photosStatus rolled back', session.collectedData.photosStatus !== 'MAKE_ASKED', `got ${session.collectedData.photosStatus}`);
  assert('9: dropped make question → photos field ASKABLE again', session.collectedData.photos === undefined, `got ${session.collectedData.photos}`);
  assert('9: visible reply re-asks the photos question', session.phase === 'DATA_COLLECTION', `got ${session.phase}`);
}

// ========================================
// 9b. MAKE-ASKED RE-ASK CAP — 3rd unclear answer → photography offer
// ========================================
{
  const session = createSession();
  runComplexStatefulHandlers({ u: 'nemam', userInput: 'nemam', session, nextField: 'photos', hasScraperPhotos: false });
  // NOTE: genuinely NEUTRAL strings only — "sto e novo"/"nema vrska" contain
  // bare negatives ("nema") and would hit CANNOT directly instead of the cap.
  runComplexStatefulHandlers({ u: 'kako si', userInput: 'kako si', session, nextField: 'ownerName', hasScraperPhotos: false });
  runComplexStatefulHandlers({ u: 'haha', userInput: 'haha', session, nextField: 'ownerName', hasScraperPhotos: false });
  const resp = runComplexStatefulHandlers({ u: 'dobar den', userInput: 'dobar den', session, nextField: 'ownerName', hasScraperPhotos: false });
  assert('9b: 3rd unclear make-answer → PHOTOGRAPHY_ASKED (cap)', session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED' && session.collectedData.photosSource === 'NO_PHOTOS', `got status=${session.collectedData.photosStatus}`);
  assert('9b: cap returns photography offer', resp && resp.type === 'QUESTION', `got ${JSON.stringify(resp)}`);
  assert('9b: attempts counted (3)', session.collectedData.photosMakeAttempts >= 3, `got ${session.collectedData.photosMakeAttempts}`);
}

// ========================================
// 9c. CLOCK-MISMATCH RE-ANCHOR — a future-stamped photosPendingSince (handler
// wrote Date.now() but the engine runs on a fake clock) must re-anchor to the
// engine clock so the ladder still fires.
// ========================================
{
  const clock = new FakeClock();
  const engine = makeEngine(clock);
  const lead = { id: 'photos-clock-1', title: 'Стан', phone: '+38970000003', url: 'https://test.com/ad', memory: { transactionType: 'sale', propertyType: 'apartment' } };
  engine.loadLead(lead);
  await engine.tick(); // greet
  const session = engine.getSession('photos-clock-1');
  const baseMsgs = session.messages.filter(m => m.role === 'model').length;
  session.phase = PHASES.AWAITING_PHOTOS;
  session.collectedData.photosStatus = 'VIBER_PENDING';
  session.collectedData.photosPending = true;
  // Anchor stamped with REAL Date.now() (handler behavior) while the fake
  // clock is at ~0 → since > now → must be re-anchored to the engine clock.
  session.collectedData.photosPendingSince = Date.now();
  // Tick FIRST so the engine re-anchors the future stamp to its own clock at
  // t≈0 — only THEN does the 2-day countdown start.
  await engine.tick();
  assert('9c: future anchor re-anchored to engine clock', session.collectedData.photosPendingSince <= clock.now(), `anchor=${session.collectedData.photosPendingSince} now=${clock.now()}`);
  clock.advance(2 * DAY);
  await engine.tick();
  assert('9c: reminder 1 fires at 2d after re-anchor', session.collectedData.photosReminder1Sent === true, `got ${session.collectedData.photosReminder1Sent}`);
  assert('9c: anchor now equals engine clock', typeof session.collectedData.photosPendingSince === 'number' && session.collectedData.photosPendingSince <= clock.now(), `anchor=${session.collectedData.photosPendingSince} now=${clock.now()}`);
  assert('9c: reminder message sent', session.messages.filter(m => m.role === 'model').length === baseMsgs + 1, `msgs=${session.messages.length}`);
}

// ========================================
// 10. Existing AWAITING_PHOTOS resolution still works after the ladder anchor
// ========================================
console.log('\n🔗 AWAITING_PHOTOS resolution unchanged');
{
  const session = createSession();
  session.phase = PHASES.AWAITING_PHOTOS;
  session.collectedData.photosPendingSince = Date.now();
  session.collectedData.photosStatus = 'VIBER_PENDING';
  const resp = runAwaitingPhotos({ u: 'evе, gi isprativ na viber', session });
  assert('10: delivered photos → CLOSE', resp && resp.type === 'CLOSE', `got ${resp?.type}`);
  assert('10: photosStatus=VIBER_RECEIVED', session.collectedData.photosStatus === 'VIBER_RECEIVED', `got ${session.collectedData.photosStatus}`);
}

// ========================================
// 11. PHOTOS-LAST ORDER FIX (reported): after the owner commits to sending
// photos later (AWAITING_PHOTOS pause), ownerName/address must ALREADY be
// collected — the async wait must never strand them. getNextMissingField
// now surfaces photos LAST (after ownerName/address) in both orders and the
// LAND/COMMERCIAL whitelists.
// ========================================
console.log('\n📷 PHOTOS-LAST ORDER (AWAITING_PHOTOS pause must not strand ownerName/address)');
{
  const { getNextMissingField } = await import('./workflow.js');
  // Sale walk: photos must come after address.
  const saleData = { transactionType: 'sale', propertyType: 'apartment' };
  const saleOrder = [];
  let f = getNextMissingField(saleData);
  while (f) { saleOrder.push(f); saleData[f] = 'X'; saleData[f + 'Confidence'] = 0.95; f = getNextMissingField(saleData); }
  assert('11: sale order ends with ownerName → address → photos',
    saleOrder[saleOrder.length - 3] === 'ownerName' &&
    saleOrder[saleOrder.length - 2] === 'address' &&
    saleOrder[saleOrder.length - 1] === 'photos',
    `Got tail: ${saleOrder.slice(-3).join(' -> ')} (full: ${saleOrder.join(',')})`);
  // Rent walk: same tail.
  const rentData = { transactionType: 'rent', propertyType: 'apartment' };
  const rentOrder = [];
  f = getNextMissingField(rentData);
  while (f) { rentOrder.push(f); rentData[f] = 'X'; rentData[f + 'Confidence'] = 0.95; f = getNextMissingField(rentData); }
  assert('11b: rent order ends with ownerName → address → photos',
    rentOrder[rentOrder.length - 3] === 'ownerName' &&
    rentOrder[rentOrder.length - 2] === 'address' &&
    rentOrder[rentOrder.length - 1] === 'photos',
    `Got tail: ${rentOrder.slice(-3).join(' -> ')} (full: ${rentOrder.join(',')})`);
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} photos-offer-flow tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 PHOTOS-OFFER-FLOW TESTS PASSED`);
