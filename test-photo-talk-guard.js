import { createHarness } from './test-helpers.js';
// ========================================
// test-photo-talk-guard.js — Pure photo-talk must never be stored as
// ownerName / address (reported bug: "IMAM KE VI ISPRATAM / NA OVOJ BROJ
// TREBA" — \"[I'll send them] to this number\" — got stored as the owner
// name instead of being treated as photo-delivery talk).
// ========================================
// The ownerName/address handlers previously stored ANY non-empty reply.
// Now a PURE photo-talk message ("NA OVOJ BROJ TREBA", "IMAM KE VI
// ISPRATAM", "KE VI PRATAM NA VIBER", a bare phone number) is detected
// BEFORE storage:
//   - photos is acknowledged as VIBER_PENDING (owner promised delivery)
//   - the name/address question is RE-ASKED (never stored as junk)
// A name + photo-talk combo ("GORAN KE VI ISPRATAM SLIKI") still extracts
// the name via the tail-strip — only PURE photo-talk is intercepted.
//
// Fully offline: calls runComplexStatefulHandlers directly — no Groq calls.
//
// Run: node test-photo-talk-guard.js
// ========================================
import { runComplexStatefulHandlers } from './handlers/data-collection.js';

const harness = createHarness();
const assert = harness.assert;

// ========================================
// Session factory — DATA_COLLECTION with all fields filled except
// ownerName/address, so nextField can be forced per-test.
// ========================================
function createSession({ nextField }) {
  const collectedData = {
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
    orientation: 'jug',
    furnished: true,
    yearBuilt: 2010,
    renovated: true,
    renovationYear: 2019,
    documentationClean: true,
    // photos already resolved as VIBER_PENDING (owner said they have them)
    photosPermission: true,
    photosSource: 'VIBER_PENDING',
    photosStatus: 'VIBER_PENDING',
    photos: true,
    photosPending: false
    // ownerName / address deliberately MISSING
  };
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData,
    messages: [
      { role: 'model', text: 'Здраво...' },
      { role: 'user', text: 'moze' },
      { role: 'model', text: 'Дали имате фотографии?' }
    ],
    phone: '+38970000001',
    phase: 'DATA_COLLECTION',
    pendingFollowUp: null,
    pendingConfirmation: null,
    questionAttempts: { [nextField]: 1 }  // already asked once
  };
}

// ========================================
// 1. PURE PHOTO-TALK — ownerName question, photo-delivery message
// ========================================
{
  // Exact reported message pair. First part ("IMAM KE VI ISPRATAM") resolved
  // photos=VIBER_PENDING; the SECOND message ("NA OVOJ BROJ TREBA") arrived
  // while Ana was asking the name and was previously stored as ownerName.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'na ovoj broj treba',
    userInput: 'NA OVOJ BROJ TREBA',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT1: photo-talk while asking name returns a QUESTION', resp && resp.type === 'QUESTION', `got ${JSON.stringify(resp)}`);
  assert('PT1: re-asks the name question', resp && resp.nextField === 'ownerName', `got ${resp && resp.nextField}`);
  assert('PT1: ownerName NOT stored', session.collectedData.ownerName === undefined, `got ${JSON.stringify(session.collectedData.ownerName)}`);
  assert('PT1: photos stays VIBER_PENDING', session.collectedData.photosStatus === 'VIBER_PENDING', `got ${session.collectedData.photosStatus}`);
}

// ========================================
// 2. PURE PHOTO-TALK — "IMAM KE VI ISPRATAM" as the WHOLE name answer
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'imam ke vi ispratam',
    userInput: 'IMAM KE VI ISPRATAM',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT2: "IMAM KE VI ISPRATAM" → QUESTION, not stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 3. PURE PHOTO-TALK — bare phone number as the name answer
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: '070 123 456',
    userInput: '070 123 456',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT3: phone number → QUESTION, not stored as name', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 4. PURE PHOTO-TALK — Cyrillic "на вајбер" delivery target
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ke vi pratam na viber',
    userInput: 'KE VI PRATAM NA VIBER',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT4: "KE VI PRATAM NA VIBER" → QUESTION, not stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 5. NAME + PHOTO-TALK — tail-strip extracts the name, guard does NOT fire
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'GORAN KE VI ISPRATAM SLIKI',
    userInput: 'GORAN KE VI ISPRATAM SLIKI',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT5: "GORAN KE VI ISPRATAM SLIKI" → name extracted (tail-strip)', resp === null && session.collectedData.ownerName === 'Goran', `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 6. NORMAL NAME — still stored as before
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ZORAN ATANASOV',
    userInput: 'ZORAN ATANASOV',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT6: "ZORAN ATANASOV" → stored as name', resp === null && session.collectedData.ownerName === 'Zoran Atanasov', `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 7. PHOTO-TALK while asking ADDRESS — same guard
// ========================================
{
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'na ovoj broj treba',
    userInput: 'NA OVOJ BROJ TREBA',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT7: photo-talk while asking address → QUESTION, not stored', resp && resp.type === 'QUESTION' && resp.nextField === 'address' && session.collectedData.address === undefined, `got resp=${JSON.stringify(resp)} address=${JSON.stringify(session.collectedData.address)}`);
}

// ========================================
// 8. REAL ADDRESS — still stored as before
// ========================================
{
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'UL. PARTIZANSKA 12, SKOPJE',
    userInput: 'UL. PARTIZANSKA 12, SKOPJE',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT8: real address → stored', resp === null && session.collectedData.address === 'UL. PARTIZANSKA 12, SKOPJE', `got resp=${JSON.stringify(resp)} address=${JSON.stringify(session.collectedData.address)}`);
}

// ========================================
// 9. PHOTOS NOT YET RESOLVED — photo-talk while asking name sets VIBER_PENDING
// (e.g. photos was skipped via max-2-attempts, then the owner finally
// volunteers delivery while the name question is live)
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  // simulate photos having been skipped earlier
  delete session.collectedData.photosPermission;
  delete session.collectedData.photosSource;
  delete session.collectedData.photosStatus;
  delete session.collectedData.photos;
  delete session.collectedData.photosPending;
  session.collectedData.photosSkipped = true;
  const resp = runComplexStatefulHandlers({
    u: 'imam sliki, ke vi ispratam na ovoj broj',
    userInput: 'IMAM SLIKI, KE VI ISPRATAM NA OVOJ BROJ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT9: photo-talk re-promises photos → VIBER_PENDING set', session.collectedData.photosStatus === 'VIBER_PENDING', `got ${JSON.stringify(session.collectedData.photosStatus)}`);
  assert('PT9: still re-asks the name, nothing stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 10. GUARD DOES NOT BLOCK NORMAL NAME ANSWERS in batch
//     (quick regression: prefix-strip + tail-strip still work end to end)
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'PIShI ME KAKO GORAN',
    userInput: 'ПИШИ МЕ КАКО ГОРАН',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT10: "ПИШИ МЕ КАКО ГОРАН" → name=Горан (prefix strip intact)', resp === null && session.collectedData.ownerName === 'Горан', `got ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 11. NAME + TRAILING PHONE NUMBER → tail-strip cuts the number
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'GORAN 070123456',
    userInput: 'GORAN 070123456',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT11: "GORAN 070123456" → name=Goran (phone tail stripped)', resp === null && session.collectedData.ownerName === 'Goran', `got ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 12. FALSE-POSITIVE GUARD — real names must NEVER be intercepted, even
//     when they start with a photo-affirmative token ("da", "ima", "se").
//     The strip regex is anchored + exact, so DAVID/IMAN/SEVDALIN survive.
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'DAVID',
    userInput: 'DAVID',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT12: "DAVID" → stored as name (strip leaves "vid", no photo-talk)', resp === null && session.collectedData.ownerName === 'David', `got ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'IMAN',
    userInput: 'IMAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT12b: "IMAN" → stored as name (strip leaves "n")', resp === null && session.collectedData.ownerName === 'Iman', `got ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'SEVDALIN',
    userInput: 'SEVDALIN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT12c: "SEVDALIN" → stored as name (strip leaves "vdalin")', resp === null && session.collectedData.ownerName === 'Sevdalin', `got ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 13. FALSE-POSITIVE GUARD — "na viber"-prefixed street/name-like phrases
//     must NOT be intercepted (letter-boundary guard)
// ========================================
{
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'NA VIBEROVA ULICA 5',
    userInput: 'NA VIBEROVA ULICA 5',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT13: "NA VIBEROVA ULICA 5" → stored as address ("viber"+letter blocked)', resp === null && session.collectedData.address === 'NA VIBEROVA ULICA 5', `got address=${JSON.stringify(session.collectedData.address)}`);
}

// ========================================
// 14. DEFINITE-ARTICLE TARGETS — "na brojot" / "na viberot" (to the
//     number / on Viber) are photo-delivery targets too (reviewer gap)
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'na brojot 070 123 456',
    userInput: 'NA BROJOT 070 123 456',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT14: "NA BROJOT 070 123 456" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'na viberot',
    userInput: 'NA VIBEROT',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT14b: "NA VIBEROT" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 15. CYRILLIC PHOTO-TALK VARIANTS
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'на овој број',
    userInput: 'НА ОВОЈ БРОЈ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT15: Cyrillic "НА ОВОЈ БРОЈ" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ќе ви испратам',
    userInput: 'ЌЕ ВИ ИСПРАТАМ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT15b: Cyrillic "ЌЕ ВИ ИСПРАТАМ" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Two-pronoun Cyrillic commitment — the second-pronoun variant that the
  // repeatable (0-2) pronoun group was added for.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ќе ви ги испратам',
    userInput: 'ЌЕ ВИ ГИ ИСПРАТАМ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT15c: Cyrillic "ЌЕ ВИ ГИ ИСПРАТАМ" (2 pronouns) → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Single-pronoun Cyrillic "ke gi pratam" — the other 2-pronoun-fix motivation.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ќе ги пратам',
    userInput: 'ЌЕ ГИ ПРАТАМ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT15d: Cyrillic "ЌЕ ГИ ПРАТАМ" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 16. +389 PHONE FORMAT — international delivery target
// ========================================
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: '+38970123456',
    userInput: '+38970123456',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT16: "+38970123456" → photo-talk, NOT stored', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} ownerName=${JSON.stringify(session.collectedData.ownerName)}`);
}

// ========================================
// 17. COMPOSITE MULTI-PART MESSAGES — photo-talk + volunteered name/address
//     in ONE message. The guards must COMPOSE: photo-talk acked as
//     VIBER_PENDING, name/address extracted cleanly, and NO re-ask when the
//     answer IS present. (Probe showed these were broken before the fix:
//     "IMAM SLIKI, ZEMI MI NA VIBER, IME: GORAN" stored "Imam".)
// ========================================
{
  // The exact reported composition: photo-talk first, labeled name last.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'imam sliki, zemi mi na viber, ime: goran',
    userInput: 'IMAM SLIKI, ZEMI MI NA VIBER, IME: GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17: "IMAM SLIKI, ZEMI MI NA VIBER, IME: GORAN" → name=Goran (label wins)', resp === null && session.collectedData.ownerName === 'Goran', `got resp=${JSON.stringify(resp)} name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Same composition but photos NOT yet resolved — the photo-talk part must
  // ack VIBER_PENDING while the name is still extracted.
  const session = createSession({ nextField: 'ownerName' });
  for (const k of ['photosPermission', 'photosSource', 'photosStatus', 'photos', 'photosPending']) delete session.collectedData[k];
  session.collectedData.photosSkipped = true;
  const resp = runComplexStatefulHandlers({
    u: 'imam sliki, zemi mi na viber, ime: goran',
    userInput: 'IMAM SLIKI, ZEMI MI NA VIBER, IME: GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17b: composite acks photos=VIBER_PENDING', session.collectedData.photosStatus === 'VIBER_PENDING', `got ${JSON.stringify(session.collectedData.photosStatus)}`);
  assert('PT17b: composite still extracts name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Name FIRST, photo-talk after (with "imam sliki" mid-message). The
  // tail-strip must cut at "imam" so the name is clean.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'goran, imam sliki ke vi gi pratam na viber',
    userInput: 'GORAN, IMAM SLIKI KE VI GI PRATAM NA VIBER',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17c: "GORAN, IMAM SLIKI KE VI GI PRATAM NA VIBER" → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Self-introduction "se vikam" + photo-talk tail.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'se vikam goran, sliki ke vi ispratam na viber',
    userInput: 'SE VIKAM GORAN, SLIKI KE VI ISPRATAM NA VIBER',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17d: "SE VIKAM GORAN, ..." → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // PURE "zemi mi na viber" (no name) while asking the name → re-ask.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'zemi mi na viber',
    userInput: 'ZEMI MI NA VIBER',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17e: "ZEMI MI NA VIBER" → photo-talk, NOT stored as name', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // MULTI-LINE: photo-talk commitment on line 1, labeled name on line 2.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'ke vi ispratam na viber\nime: goran',
    userInput: 'KE VI ISPRATAM NA VIBER\nIME: GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17f: multi-line "KE VI ISPRATAM NA VIBER\\nIME: GORAN" → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // ADDRESS composite: address first, photo-talk tail after the comma.
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'ul. partizanska 12, imam sliki ke vi pratam na viber',
    userInput: 'UL. PARTIZANSKA 12, IMAM SLIKI KE VI PRATAM NA VIBER',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT17g: address composite → address="UL. PARTIZANSKA 12"', resp === null && session.collectedData.address === 'UL. PARTIZANSKA 12', `got address=${JSON.stringify(session.collectedData.address)}`);
}
{
  // Labeled address + photo-talk tail.
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'adresa: ul. partizanska 12, sliki ke vi gi ispratam',
    userInput: 'ADRESA: UL. PARTIZANSKA 12, SLIKI KE VI GI ISPRATAM',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT17h: "ADRESA: UL. PARTIZANSKA 12, ..." → address cleaned', resp === null && session.collectedData.address === 'UL. PARTIZANSKA 12', `got address=${JSON.stringify(session.collectedData.address)}`);
}
{
  // Photo-talk on BOTH sides of a labeled name.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'imam sliki, ime: goran, zemi gi na viber',
    userInput: 'IMAM SLIKI, IME: GORAN, ZEMI GI NA VIBER',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17i: "IMAM SLIKI, IME: GORAN, ZEMI GI NA VIBER" → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // "моето име е" form + conjunction cut ("И" = and).
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'moeto ime e goran i sakam da zapoznaeme',
    userInput: 'МОЕТО ИМЕ Е ГОРАН И САКАМ ДА ЗАПОЗНАЕМЕ',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17j: "МОЕТО ИМЕ Е ГОРАН И ..." → name=Горан (conjunction cut)', resp === null && session.collectedData.ownerName === 'Горан', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // NEGATED photos in a composite — "nema sliki" must NOT ack VIBER_PENDING.
  const session = createSession({ nextField: 'ownerName' });
  for (const k of ['photosPermission', 'photosSource', 'photosStatus', 'photos', 'photosPending']) delete session.collectedData[k];
  session.collectedData.photosSkipped = true;
  const resp = runComplexStatefulHandlers({
    u: 'nema sliki, ime: goran',
    userInput: 'NEMA SLIKI, IME: GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17k: "NEMA SLIKI, IME: GORAN" → name=Goran, photos NOT acked', resp === null && session.collectedData.ownerName === 'Goran' && session.collectedData.photosStatus === undefined, `got name=${JSON.stringify(session.collectedData.ownerName)} photosStatus=${JSON.stringify(session.collectedData.photosStatus)}`);
}
{
  // STOPLIST — "jas sum zainteresiran" (I am interested) must NEVER store
  // "Zainteresiran" as the owner name (reviewer gap: the "jas sum" marker
  // is ambiguous — often followed by a statement, not a name).
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'jas sum zainteresiran',
    userInput: 'JAS SUM ZAINTERESIRAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17l: "JAS SUM ZAINTERESIRAN" → re-ask, NOT stored as name', resp && resp.type === 'QUESTION' && resp.nextField === 'ownerName' && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // DEFINTE-ARTICLE FORM — "slikite" (the photos) must ack VIBER_PENDING in
  // a composite (reviewer gap: "sliki"+letter boundary failed on "slikite").
  const session = createSession({ nextField: 'ownerName' });
  for (const k of ['photosPermission', 'photosSource', 'photosStatus', 'photos', 'photosPending']) delete session.collectedData[k];
  session.collectedData.photosSkipped = true;
  const resp = runComplexStatefulHandlers({
    u: 'goran, slikite ke vi gi pratam na viberot',
    userInput: 'GORAN, SLIKITE KE VI GI PRATAM NA VIBEROT',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('PT17m: "GORAN, SLIKITE ... NA VIBEROT" → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
  assert('PT17m: definite forms ack photos=VIBER_PENDING', session.collectedData.photosStatus === 'VIBER_PENDING', `got ${JSON.stringify(session.collectedData.photosStatus)}`);
}
{
  // ADDRESS with a period in it — "UL." must survive (the address sentence
  // split excludes period; street abbreviations are ubiquitous).
  const session = createSession({ nextField: 'address' });
  const resp = runComplexStatefulHandlers({
    u: 'ul. partizanska 12, skopje',
    userInput: 'UL. PARTIZANSKA 12, SKOPJE',
    session,
    nextField: 'address',
    hasScraperPhotos: false
  });
  assert('PT17n: "UL. PARTIZANSKA 12, SKOPJE" → address kept whole', resp === null && session.collectedData.address === 'UL. PARTIZANSKA 12, SKOPJE', `got address=${JSON.stringify(session.collectedData.address)}`);
}

// ========================================
// 18. NAMING-PREFIX LEXICON — "PISI GORAN" must store ONLY "Goran", not the
//     prefix words (pisi, zapisi me, jas sum, ...). Reported: only "pishi"
//     (with the h) was in the strip list, so the common Viber spelling
//     "PISI GORAN" kept its prefix and stored "Pisi Goran".
// ========================================
{
  // THE reported message.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'pisi goran',
    userInput: 'PISI GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP1: "PISI GORAN" → name=Goran (Viber pisi without h stripped)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'zapisi me goran',
    userInput: 'ZAPISI ME GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP2: "ZAPISI ME GORAN" → name=Goran (zapisi me without kako)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'pisi me kako goran',
    userInput: 'PISI ME KAKO GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP3: "PISI ME KAKO GORAN" → name=Goran (h-less pisi me kako)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'zapisi me kako goran',
    userInput: 'ZAPISI ME KAKO GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP4: "ZAPISI ME KAKO GORAN" → name=Goran', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // 1st-person copula — already worked via the label path; pinned as a guard.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'jas sum goran',
    userInput: 'JAS SUM GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP5: "JAS SUM GORAN" → name=Goran (label path)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Chained prefixes — the double-strip + separator cleanup.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'jas sum, pisi goran',
    userInput: 'JAS SUM, PISI GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP6: "JAS SUM, PISI GORAN" → name=Goran (chained prefixes)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Cyrillic forms.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'пиши горан',
    userInput: 'ПИШИ ГОРАН',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP7: "ПИШИ ГОРАН" → name=Горан', resp === null && session.collectedData.ownerName === 'Горан', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'запишете ме како горан',
    userInput: 'ЗАПИШЕТЕ МЕ КАКО ГОРАН',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP8: "ЗАПИШЕТЕ МЕ КАКО ГОРАН" → name=Горан (polite запишете ме)', resp === null && session.collectedData.ownerName === 'Горан', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'може да ме запишете како горан',
    userInput: 'МОЖЕ ДА МЕ ЗАПИШЕТЕ КАКО ГОРАН',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP9: "МОЖЕ ДА МЕ ЗАПИШЕТЕ КАКО ГОРАН" → name=Горан', resp === null && session.collectedData.ownerName === 'Горан', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // FALSE-POSITIVE GUARD — a surname containing a prefix word must survive
  // ("PISIMOV" — "pisi" + "mov" — no letter boundary after "pisi").
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'pisimov goran',
    userInput: 'PISIMOV GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP10: "PISIMOV GORAN" → name=Pisimov Goran (prefix-in-surname safe)', resp === null && session.collectedData.ownerName === 'Pisimov Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // PURE prefix (no name) must NOT store junk — re-ask instead.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'pisi',
    userInput: 'PISI',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP11: bare "PISI" → nothing stored (re-ask, not a name)', resp === null && session.collectedData.ownerName === undefined, `got resp=${JSON.stringify(resp)} name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // Polite h-less "zapisete" family.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'zapisete me kako goran',
    userInput: 'ZAPISETE ME KAKO GORAN',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP12: "ZAPISETE ME KAKO GORAN" → name=Goran (h-less zapisete)', resp === null && session.collectedData.ownerName === 'Goran', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // OVER-MATCH GUARD — a bare leading "kako" WITHOUT a naming verb must NOT
  // be consumed. "KAKO BILO" ("however") is not a naming answer; a
  // standalone "kako" prefix pattern would strip it and store "Bilo" as a
  // name (reviewer-flagged). The kako word survives intact.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'kako bilo',
    userInput: 'KAKO BILO',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP13: "KAKO BILO" → name NOT mangled to "Bilo" (bare kako never fires alone)', resp === null && session.collectedData.ownerName === 'Kako Bilo', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}
{
  // "може да ... запишете" WITHOUT the "како" clause still strips — the
  // optional-како group is exactly that: optional.
  const session = createSession({ nextField: 'ownerName' });
  const resp = runComplexStatefulHandlers({
    u: 'може да ме запишете горан',
    userInput: 'МОЖЕ ДА МЕ ЗАПИШЕТЕ ГОРАН',
    session,
    nextField: 'ownerName',
    hasScraperPhotos: false
  });
  assert('NP14: "МОЖЕ ДА МЕ ЗАПИШЕТЕ ГОРАН" (no како) → name=Горан', resp === null && session.collectedData.ownerName === 'Горан', `got name=${JSON.stringify(session.collectedData.ownerName)}`);
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} photo-talk-guard tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 PHOTO-TALK GUARD TESTS PASSED`);
