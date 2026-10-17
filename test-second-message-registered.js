// ============================================================
// test-second-message-registered.js — "Second message not registered" regression
// ============================================================
// Reported bug (production log, lead 3571074):
//
//   OWNER: da
//   OWNER: uste ne sum go izdal
//   ▸ [COOPERATION: ACCEPTED (short positive: "da")]
//   ▸ [PHASE TRANSITION: PERSUASION → DATA_COLLECTION]
//   ▸ [QUESTION: Која е месечната кирија за станот?]
//
// TWO distinct layers, both fixed:
//
// LAYER 1 (this file's original scope): the first "da" moved the session
// into DATA_COLLECTION (cooperationAccepted = true). The second message
// ("I still haven't rented it out" = the property IS still available) was
// then never REGISTERED: the availability handler in early-responses.js is
// gated on !cooperationAccepted, and the message contains no extractable
// field, so Ana re-asked the rent question with ZERO acknowledgment of
// what the owner just said. Fixed by acknowledging a still-available
// confirmation during DATA_COLLECTION (prepend "Одлично, значи сè уште е
// достапен!", once per conversation) — tested in PART A (sequential turns).
//
// LAYER 2 (reported follow-up): the batch itself was WRONG. The greeting
// asks a DOUBLE question — "Дали е се уште достапен И дали сте
// заинтересирани за соработка?" — and "DA" + "DOSTAPEN E" in ONE
// quickfire batch answers only the AVAILABILITY half twice. Reading the
// bare "DA" as a cooperation acceptance jumped the session into
// DATA_COLLECTION and Ana demanded the rent from an owner who NEVER agreed
// to cooperate. Fixed: when the owner's current turn (any user message
// since Ana's last reply) confirms availability, a bare ambiguous positive
// (da/да/ok/ок/okej/океј) gets the availability template (which asks the
// cooperation question) instead of cooperation acceptance — tested in
// PART D (engine grace batches) and PART E (the exact reported "DA" +
// "DOSTAPEN E"). A SOLO "da" (no availability in the turn) keeps the
// short-positive → DATA_COLLECTION path (PART A).
//
// Runs fully offline — the DATA_COLLECTION phase never calls the LLM, and
// ANA_OFFLINE_LLM guards the PERSUASION tail (not reached here anyway).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { MultiLeadEngine } from './engine.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — sequential generateResponse path (the exact reported flow)
// ============================================================
console.log('\n========================================');
console.log('🧪 A: "da" then "uste ne sum go izdal" — second message registered');
console.log('========================================\n');

const rentSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38970123456'
};

// Turn 1: "da" → acceptance → DATA_COLLECTION → rent question
const r1 = await generateResponse(rentSession, 'da');
assert('A1: "da" → QUESTION with the rent field',
  r1.type === 'QUESTION' && r1.nextField === 'monthlyRent' && /кириј/.test(r1.text || ''),
  `got type=${r1.type} next=${r1.nextField} text=${JSON.stringify((r1.text || '').slice(0, 60))}`);
assert('A1: cooperation accepted',
  rentSession.collectedData.cooperationAccepted === true,
  `cooperationAccepted=${rentSession.collectedData.cooperationAccepted}`);

// Turn 2: "uste ne sum go izdal" — the SECOND message must be REGISTERED.
// Pre-fix: reply was the plain rent question again (second message swallowed).
// Post-fix: availability is acknowledged AND the rent question still asked.
const r2 = await generateResponse(rentSession, 'uste ne sum go izdal');
console.log('  Second-message reply:', r2.text);
assert('A2: second message registered — reply acknowledges still-available',
  r2.type === 'QUESTION' && /сè уште е достапен/.test(r2.text || ''),
  `got text=${JSON.stringify((r2.text || '').slice(0, 80))}`);
assert('A2: still asks the rent question',
  /кириј/.test(r2.text || ''),
  `got text=${JSON.stringify((r2.text || '').slice(0, 80))}`);
assert('A2: availabilityAcknowledged flag set (once-per-conversation gate)',
  rentSession.availabilityAcknowledged === true,
  `flag=${rentSession.availabilityAcknowledged}`);

// Turn 3: a repeated availability message must NOT double-acknowledge
const r3 = await generateResponse(rentSession, 'uste ne sum go izdal');
assert('A3: availability NOT acknowledged twice',
  !/сè уште е достапен/.test(r3.text || ''),
  `got text=${JSON.stringify((r3.text || '').slice(0, 80))}`);

// ============================================================
// PART B — sale variant
// ============================================================
console.log('\n========================================');
console.log('🧪 B: sale — "vazhi" then "uste ne sum go prodal"');
console.log('========================================\n');

const saleSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
  ],
  phone: '+38970123456'
};

const s1 = await generateResponse(saleSession, 'vazhi');
assert('B1: "vazhi" → QUESTION with the cleanPrice field',
  s1.type === 'QUESTION' && s1.nextField === 'cleanPrice',
  `got type=${s1.type} next=${s1.nextField}`);

const s2 = await generateResponse(saleSession, 'uste ne sum go prodal');
console.log('  Sale second-message reply:', s2.text);
assert('B2: sale still-available registered — ack + price question',
  s2.type === 'QUESTION' && /сè уште е достапен/.test(s2.text || '') && /цена/.test(s2.text || ''),
  `got text=${JSON.stringify((s2.text || '').slice(0, 80))}`);

// ============================================================
// PART C — negative control: availability phrase + guard word → NO ack
// ============================================================
console.log('\n========================================');
console.log('🧪 C: availability phrase with terrace/klima context → no ack');
console.log('========================================\n');

const rentSession2 = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent' },
  messages: [
    { role: 'model', text: 'Која е месечната кирија за станот?' }
  ],
  phone: '+38970123456'
};
const rc = await generateResponse(rentSession2, 'uste ne sum go izdal ama ima terasa i klima');
assert('C1: guard word (terasa/klima) suppresses the availability ack',
  !/сè уште е достапен/.test(rc.text || ''),
  `got text=${JSON.stringify((rc.text || '').slice(0, 80))}`);

// ============================================================
// PART D — engine grace batch: "da" + "uste ne sum go izdal" in ONE window
// ============================================================
console.log('\n========================================');
console.log('🧪 D: engine grace batch — both messages, ONE reply that registers both');
console.log('========================================\n');

const RENT_LEAD = {
  id: '3571074',
  title: 'SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM',
  phone: '+38978334393',
  url: 'https://reklama5.mk/AdDetails?ad=3571074'
};

function makeGraceEngine() {
  const sent = [];
  const engine = new MultiLeadEngine({
    now: () => 0,
    sleep: async () => {},
    tickMs: 1,
    typingDelay: () => 0,
    canSendContact: () => true,
    recordSent: () => {},
    ownerGraceMs: 40                       // short real window for the test
  });
  engine.on('ana-message', (p) => sent.push(p.text));
  engine.start();
  engine.loadLeads([RENT_LEAD]);
  return { engine, sent };
}

// ------------------------------------------------------------
// PART D — CORRECTED SEMANTICS: an availability-confirming batch is
// AVAILABILITY-ONLY. The greeting asks a DOUBLE question ("Дали е се уште
// достапен И дали сте заинтересирани за соработка?"), and "da" + "uste ne
// sum go izdal" in ONE batch answers only the availability half. The bare
// "da" must NOT be read as cooperation acceptance (reported follow-up, lead
// 3571074) — the batch must be answered with the availability template
// (which asks the cooperation question) and cooperation stays unaccepted.
// ------------------------------------------------------------

// 2-message batch: "da" + "uste ne sum go izdal"
const { engine: e1, sent: sent1 } = makeGraceEngine();
await e1.tick();                            // greet lead1 (rent ad)
await e1.onOwnerMessage('3571074', 'da');
await e1.onOwnerMessage('3571074', 'uste ne sum go izdal');
await new Promise(r => setTimeout(r, 90));  // window elapses → batch processes
console.log('  Batch reply:', sent1[sent1.length - 1]);
assert('D1: exactly ONE Ana reply for the batch (greeting + reply)',
  sent1.length === 2,
  `got ${sent1.length} messages: ${JSON.stringify(sent1)}`);
assert('D1: the single reply is the AVAILABILITY template (NOT the rent question)',
  /Драго ми е што станот е сè уште достапен/.test(sent1[1]) && !/кириј/.test(sent1[1]),
  `got reply=${JSON.stringify(sent1[1])}`);
assert('D1: cooperation NOT accepted (availability-only batch)',
  e1.getSession('3571074').collectedData?.cooperationAccepted !== true,
  'cooperation was wrongly accepted in the batch');
assert('D1: availabilityAcknowledged set through the batch',
  e1.getSession('3571074').availabilityAcknowledged === true,
  'availability not acknowledged');

// 3-message batch: "da" + "uste ne sum go izdal" + "350 evra mesecno"
// Still an availability-only turn (no cooperation acceptance), but the
// volunteered rent IS extracted during persuasion so it is never lost.
const { engine: e2, sent: sent2 } = makeGraceEngine();
await e2.tick();                            // greet lead1
await e2.onOwnerMessage('3571074', 'da');
await e2.onOwnerMessage('3571074', 'uste ne sum go izdal');
await e2.onOwnerMessage('3571074', '350 evra mesecno');
await new Promise(r => setTimeout(r, 90));
console.log('  3-message batch reply:', sent2[sent2.length - 1]);
assert('D2: exactly ONE Ana reply for the 3-message batch',
  sent2.length === 2,
  `got ${sent2.length} messages: ${JSON.stringify(sent2)}`);
assert('D2: rent extracted from the batch (350 — volunteered, never lost)', 
  e2.getSession('3571074').collectedData?.monthlyRent === 350,
  `monthlyRent=${JSON.stringify(e2.getSession('3571074').collectedData?.monthlyRent)}`);
assert('D2: cooperation NOT accepted (availability-only turn despite the price)',
  e2.getSession('3571074').collectedData?.cooperationAccepted !== true,
  'cooperation was wrongly accepted in the batch');
assert('D2: no rent QUESTION asked (Ana stays in persuasion, asks cooperation)',
  !/кириј/.test(sent2[1]),
  `got reply=${JSON.stringify(sent2[1])}`);

// REVERSE-ORDER batch: availability message BEFORE the bare positive. The
// intermediate "uste ne sum go izdal" hits the availability template (and
// gets rolled back on drop); the visible reply comes from the "da" — which
// must STILL be answered with the availability template, not cooperation
// acceptance, because the turn confirms availability.
const { engine: e3, sent: sent3 } = makeGraceEngine();
await e3.tick();                            // greet lead1
await e3.onOwnerMessage('3571074', 'uste ne sum go izdal');
await e3.onOwnerMessage('3571074', 'da');
await new Promise(r => setTimeout(r, 90));
console.log('  Reverse-order batch reply:', sent3[sent3.length - 1]);
assert('D3: exactly ONE Ana reply for the reverse-order batch',
  sent3.length === 2,
  `got ${sent3.length} messages: ${JSON.stringify(sent3)}`);
assert('D3: visible reply is the AVAILABILITY template (not cooperation accept)',
  /Драго ми е што станот е сè уште достапен/.test(sent3[1]) && !/кириј/.test(sent3[1]),
  `got reply=${JSON.stringify(sent3[1])}`);
assert('D3: cooperation NOT accepted (reverse-order availability batch)',
  e3.getSession('3571074').collectedData?.cooperationAccepted !== true,
  'cooperation was wrongly accepted in the batch');

// ============================================================
// PART E — the EXACT reported case (lead 3571074): "DA" + "DOSTAPEN E"
// The pasted production log shows exactly this batch being answered with a
// rent question after [COOPERATION: ACCEPTED (short positive: "da")]. Per
// the reported rule "DA + DOSTAPEN E signals availability, NOT cooperation
// acceptance", Ana must answer with the availability template and STAY in
// persuasion — the rent question must never appear.
// ============================================================
console.log('\n========================================');
console.log('🧪 E: the exact reported batch — "DA" + "DOSTAPEN E"');
console.log('========================================\n');

const { engine: e4, sent: sent4 } = makeGraceEngine();
await e4.tick();                            // greet lead1 (rent ad)
await e4.onOwnerMessage('3571074', 'DA');
await e4.onOwnerMessage('3571074', 'DOSTAPEN E');
await new Promise(r => setTimeout(r, 90));  // window elapses → batch processes
console.log('  Reported batch reply:', sent4[sent4.length - 1]);
assert('E1: exactly ONE Ana reply for the reported batch',
  sent4.length === 2,
  `got ${sent4.length} messages: ${JSON.stringify(sent4)}`);
assert('E1: reply is the availability template — NOT the rent question',
  /Драго ми е што станот е сè уште достапен/.test(sent4[1]) && !/кириј/.test(sent4[1]),
  `got reply=${JSON.stringify(sent4[1])}`);
assert('E1: NO [COOPERATION: ACCEPTED] — cooperation stays false',
  e4.getSession('3571074').collectedData?.cooperationAccepted !== true,
  'the reported batch wrongly accepted cooperation');
assert('E1: phase stays PERSUASION (no DATA_COLLECTION entry)',
  e4.getSession('3571074').phase !== 'DATA_COLLECTION',
  `phase=${e4.getSession('3571074').phase}`);
assert('E1: availability acknowledged',
  e4.getSession('3571074').availabilityAcknowledged === true,
  'availability not acknowledged');

// ============================================================
// PART F — NEXT-TURN SOLO "DA" STILL ACCEPTS COOPERATION
// The availability-batch guard only fires while the owner's CURRENT turn
// confirms availability. Once Ana has replied (the availability template is
// a model message), a later solo "DA" is the owner answering the
// cooperation question — it must enter DATA_COLLECTION. This locks in the
// hasRecentAvailabilityConfirmation scan stopping at Ana's last reply.
// ============================================================
console.log('\n========================================');
console.log('🧪 F: availability in turn 1, then solo "DA" in turn 2 → cooperation');
console.log('========================================\n');

const { engine: e5, sent: sent5 } = makeGraceEngine();
await e5.tick();                            // greet lead1 (rent ad)
// Turn 1: solo availability confirmation → availability template, NO cooperation
await e5.onOwnerMessage('3571074', 'DOSTAPEN E');
await new Promise(r => setTimeout(r, 90));
console.log('  Turn 1 reply:', sent5[sent5.length - 1]);
assert('F1: solo availability → availability template (greeting + reply)',
  sent5.length === 2 && /Драго ми е што станот е сè уште достапен/.test(sent5[1]),
  `got ${JSON.stringify(sent5)}`);
assert('F1: cooperation NOT accepted on the availability turn',
  e5.getSession('3571074').collectedData?.cooperationAccepted !== true,
  'cooperation accepted too early');
assert('F1: availability acknowledged',
  e5.getSession('3571074').availabilityAcknowledged === true,
  'availability not acknowledged');

// Turn 2: solo "DA" — Ana's template reply is now a model message, so the
// batch-scan stops there and finds NO availability in this turn → "DA" is
// the cooperation answer → DATA_COLLECTION → rent question.
await e5.onOwnerMessage('3571074', 'DA');
await new Promise(r => setTimeout(r, 90));
console.log('  Turn 2 reply:', sent5[sent5.length - 1]);
assert('F2: exactly ONE more Ana reply',
  sent5.length === 3,
  `got ${sent5.length}: ${JSON.stringify(sent5)}`);
assert('F2: solo DA accepts cooperation → DATA_COLLECTION rent question',
  e5.getSession('3571074').collectedData?.cooperationAccepted === true &&
  /кириј/.test(sent5[2]),
  `reply=${JSON.stringify(sent5[2])} coop=${e5.getSession('3571074').collectedData?.cooperationAccepted}`);
assert('F2: phase entered DATA_COLLECTION',
  e5.getSession('3571074').phase === 'DATA_COLLECTION',
  `phase=${e5.getSession('3571074').phase}`);

// ============================================================
// PART G — reported lead 5436709: docs follow-up "IMA HIPOTEKA" must NOT
// become the owner name, must CORRECT documentationClean, and the address
// question must NOT carry the availability ack (a docs answer "DA IMAM" is
// not an availability statement).
// ============================================================
console.log('\n========================================');
console.log('🧪 G: docs follow-up "IMA HIPOTEKA" → correction, never name, no ack');
console.log('========================================\n');

const G_SESSION = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
  collectedData: {
    cooperationAccepted: true, transactionType: 'sale', propertyType: 'apartment',
    cleanPrice: 98000, cleanPriceConfidence: 0.95,
    totalSqm: 55, totalSqmConfidence: 0.95,
    terraceSqm: 0, terraceSqmConfidence: 0.95,
    bedrooms: 2, bedroomsConfidence: 0.95,
    floor: 3, floorConfidence: 0.95,
    totalFloors: 10, totalFloorsConfidence: 0.95,
    elevator: true, elevatorConfidence: 0.95,
    heating: 'district', heatingConfidence: 0.95,
    ac: true, acConfidence: 0.95,
    parking: true, parkingConfidence: 0.95,
    orientation: 'jug', orientationConfidence: 0.95,
    furnished: true, furnishedConfidence: 0.95,
    yearBuilt: 2015, yearBuiltConfidence: 0.95,
    renovated: true, renovatedConfidence: 0.95,
    renovationYear: 2020, renovationYearConfidence: 0.95
  },
  messages: [{ role: 'model', text: 'Во ред. Дали имате чист имотен лист?' }],
  phone: '+38970999999'
};

// Turn 1: "DA IMAM" → docs clean (bare yes), then Turn 2: "IMA HIPOTEKA"
const g1 = await generateResponse(G_SESSION, 'DA IMAM');
assert('G1: "DA IMAM" → documentationClean=true (bare yes)',
  G_SESSION.collectedData.documentationClean === true, `got ${G_SESSION.collectedData.documentationClean}`);
const g2 = await generateResponse(G_SESSION, 'IMA HIPOTEKA');
assert('G2: "IMA HIPOTEKA" CORRECTS documentationClean → false',
  G_SESSION.collectedData.documentationClean === false, `got ${G_SESSION.collectedData.documentationClean}`);
assert('G2b: correction records the issue',
  G_SESSION.collectedData.documentationIssues === 'hipoteka', `got ${JSON.stringify(G_SESSION.collectedData.documentationIssues)}`);
assert('G2c: "IMA HIPOTEKA" NEVER becomes the owner name',
  G_SESSION.collectedData.ownerName === undefined, `got ${JSON.stringify(G_SESSION.collectedData.ownerName)}`);
assert('G2d: the name is re-asked, not skipped',
  g2 && g2.type === 'QUESTION' && g2.nextField === 'ownerName', `got ${JSON.stringify(g2 && { type: g2.type, nextField: g2.nextField })}`);

// Now the owner gives the name, then the address question must NOT carry the
// availability ack (a docs answer "DA IMAM" is not an availability statement).
const g3 = await generateResponse(G_SESSION, 'Goran Petrov');
assert('G3: name stored', G_SESSION.collectedData.ownerName === 'Goran Petrov', `got ${JSON.stringify(G_SESSION.collectedData.ownerName)}`);
assert('G3b: address question WITHOUT the availability ack',
  g3 && g3.type === 'QUESTION' && g3.nextField === 'address' && !/сè уште е достапен/.test(g3.text || ''),
  `got ${JSON.stringify(g3 && g3.text)}`);
assert('G3c: availability NOT marked acknowledged by a docs answer',
  G_SESSION.availabilityAcknowledged !== true, `flag=${G_SESSION.availabilityAcknowledged}`);

// Grace-batch variant: BOTH messages in one window — the docs correction
// still lands and no availability ack leaks into the next question.
const G_SESSION2 = JSON.parse(JSON.stringify(G_SESSION));
G_SESSION2.messages = [{ role: 'model', text: 'Во ред. Дали имате чист имотен лист?' }];
G_SESSION2.collectedData.documentationClean = undefined;
delete G_SESSION2.collectedData.documentationClean;
delete G_SESSION2.collectedData.documentationIssues;
delete G_SESSION2.collectedData.ownerName;
G_SESSION2.messages.push({ role: 'user', text: 'DA IMAM' });
G_SESSION2.messages.push({ role: 'user', text: 'IMA HIPOTEKA' });
const gb = await generateResponse(G_SESSION2, 'IMA HIPOTEKA');
assert('G4: batch [DA IMAM, IMA HIPOTEKA] → docs corrected to false',
  G_SESSION2.collectedData.documentationClean === false, `got ${G_SESSION2.collectedData.documentationClean}`);
assert('G4b: batch → name NEVER stored',
  G_SESSION2.collectedData.ownerName === undefined, `got ${JSON.stringify(G_SESSION2.collectedData.ownerName)}`);
assert('G4c: batch reply is the name question, no availability ack',
  gb && gb.type === 'QUESTION' && gb.nextField === 'ownerName' && !/сè уште е достапен/.test(gb.text || ''),
  `got ${JSON.stringify(gb && gb.text)}`);

// DIRECT-ANSWER variant (verification request): "IMA HIPOTEKA" as the FIRST
// and ONLY answer to the docs question — no prior "DA IMAM". The issue must
// be extracted directly (STEP-1 group pass) at HIGH, and the flow moves on.
const G_DIRECT = JSON.parse(JSON.stringify(G_SESSION));
G_DIRECT.messages = [{ role: 'model', text: 'Во ред. Дали имате чист имотен лист?' }];
// G_SESSION was mutated by earlier PART G turns (g3 stored ownerName), so
// strip it — the direct-answer session must be pristine (docs → name next).
delete G_DIRECT.collectedData.ownerName;
delete G_DIRECT.collectedData.ownerNameConfidence;
delete G_DIRECT.collectedData.documentationClean;
delete G_DIRECT.collectedData.documentationIssues;
delete G_DIRECT.collectedData.documentationCleanConfidence;
const gd = await generateResponse(G_DIRECT, 'IMA HIPOTEKA');
assert('G6: direct "IMA HIPOTEKA" (no prior DA IMAM) → documentationClean=false',
  G_DIRECT.collectedData.documentationClean === false, `got ${G_DIRECT.collectedData.documentationClean}`);
assert('G6b: direct answer records the issue',
  G_DIRECT.collectedData.documentationIssues === 'hipoteka', `got ${JSON.stringify(G_DIRECT.collectedData.documentationIssues)}`);
assert('G6c: direct answer stored at HIGH (no confirmation re-ask)',
  G_DIRECT.collectedData.documentationCleanConfidence === 0.95, `got ${G_DIRECT.collectedData.documentationCleanConfidence}`);
assert('G6d: direct answer never becomes the name; flow moved to ownerName',
  gd && gd.type === 'QUESTION' && gd.nextField === 'ownerName' && G_DIRECT.collectedData.ownerName === undefined,
  `got ${JSON.stringify(gd && { type: gd.type, nextField: gd.nextField })}`);

// CONTROL: the genuine availability statement STILL acks once (pinned A2)
const G_SESSION3 = JSON.parse(JSON.stringify(G_SESSION));
G_SESSION3.messages = [{ role: 'model', text: 'Во ред. Дали имате чист имотен лист?' }];
G_SESSION3.collectedData.documentationClean = undefined;
delete G_SESSION3.collectedData.documentationClean;
const g4 = await generateResponse(G_SESSION3, 'uste ne sum go prodal');
assert('G5: genuine availability statement still acks',
  /сè уште е достапен/.test(g4.text || ''), `got ${JSON.stringify((g4.text || '').slice(0, 80))}`);

// ============================================================
// PART H — binary correction audit (mirror of DCC for ALL binary fields):
// the owner answers a binary question with a bare "DA" (→ true), then the
// NEXT message reveals the real state ("NEMA LIFT", "NE E RENOVIRAN",
// "PRAZEN E") — the stored true must be corrected to false mid-collection
// (the same late-correction dead-end documentationClean had, now fixed for
// every binary field).
// ============================================================
console.log('\n========================================');
console.log('🧪 H: late binary corrections — bare-yes then negative follow-up');
console.log('========================================\n');

// Base H session: ALL earlier-order fields already filled, so the NEXT missing
// field is whichever binary field the test targets (bare-yes "DA" maps to the
// current question via getNextMissingField, not the last message text).
function makeHSession() {
  return {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: {
      cooperationAccepted: true, transactionType: 'sale', propertyType: 'apartment',
      cleanPrice: 98000, cleanPriceConfidence: 0.95,
      totalSqm: 55, totalSqmConfidence: 0.95,
      terraceSqm: 0, terraceSqmConfidence: 0.95,
      bedrooms: 2, bedroomsConfidence: 0.95,
      floor: 3, floorConfidence: 0.95,
      totalFloors: 10, totalFloorsConfidence: 0.95,
      elevator: true, elevatorConfidence: 0.95,
      heating: 'district', heatingConfidence: 0.95,
      ac: true, acConfidence: 0.95,
      parking: true, parkingConfidence: 0.95,
      orientation: 'jug', orientationConfidence: 0.95,
      furnished: true, furnishedConfidence: 0.95,
      yearBuilt: 2015, yearBuiltConfidence: 0.95,
      renovated: true, renovatedConfidence: 0.95,
      renovationYear: 2020, renovationYearConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Во ред. Дали има лифт во зградата?' }],
    phone: '+38970888888'
  };
}

// Elevator: bare-yes "DA" → true, then "NEMA LIFT" corrects it.
const H_SESSION = makeHSession();
delete H_SESSION.collectedData.elevator;
delete H_SESSION.collectedData.elevatorConfidence;
const h1 = await generateResponse(H_SESSION, 'DA');
assert('H1: "DA" to elevator question → elevator=true (bare yes)',
  H_SESSION.collectedData.elevator === true, `got ${H_SESSION.collectedData.elevator}`);
const h2 = await generateResponse(H_SESSION, 'NEMA LIFT');
assert('H2: "NEMA LIFT" CORRECTS elevator=true → false',
  H_SESSION.collectedData.elevator === false, `got ${H_SESSION.collectedData.elevator}`);

// Renovated: bare-yes "DA" → true, then "NE E RENOVIRAN" corrects + clears year.
const H_SESSION2 = makeHSession();
delete H_SESSION2.collectedData.renovated;
delete H_SESSION2.collectedData.renovatedConfidence;
delete H_SESSION2.collectedData.renovationYear;
delete H_SESSION2.collectedData.renovationYearConfidence;
H_SESSION2.messages = [{ role: 'model', text: 'Дали е реновиран?' }];
const h3 = await generateResponse(H_SESSION2, 'DA');
assert('H3: "DA" to renovated question → renovated=true',
  H_SESSION2.collectedData.renovated === true, `got ${H_SESSION2.collectedData.renovated}`);
const h4 = await generateResponse(H_SESSION2, 'NE E RENOVIRAN');
assert('H4: "NE E RENOVIRAN" CORRECTS renovated=true → false',
  H_SESSION2.collectedData.renovated === false, `got ${H_SESSION2.collectedData.renovated}`);

// Furnished: bare-yes "DA" → true, then "PRAZEN E" corrects + sets level empty.
const H_SESSION3 = makeHSession();
delete H_SESSION3.collectedData.furnished;
delete H_SESSION3.collectedData.furnishedConfidence;
H_SESSION3.messages = [{ role: 'model', text: 'Дали е наместен?' }];
const h5 = await generateResponse(H_SESSION3, 'DA');
assert('H5: "DA" to furnished question → furnished=true',
  H_SESSION3.collectedData.furnished === true, `got ${H_SESSION3.collectedData.furnished}`);
const h6 = await generateResponse(H_SESSION3, 'PRAZEN E');
assert('H6: "PRAZEN E" CORRECTS furnished=true → false',
  H_SESSION3.collectedData.furnished === false, `got ${H_SESSION3.collectedData.furnished}`);

// AC: bare-yes "DA" → true, then "NEMA KLIMA" corrects.
const H_SESSION4 = makeHSession();
delete H_SESSION4.collectedData.ac;
delete H_SESSION4.collectedData.acConfidence;
H_SESSION4.messages = [{ role: 'model', text: 'Дали има клима?' }];
const h7 = await generateResponse(H_SESSION4, 'DA');
assert('H7: "DA" to ac question → ac=true',
  H_SESSION4.collectedData.ac === true, `got ${H_SESSION4.collectedData.ac}`);
const h8 = await generateResponse(H_SESSION4, 'NEMA KLIMA');
assert('H8: "NEMA KLIMA" CORRECTS ac=true → false',
  H_SESSION4.collectedData.ac === false, `got ${H_SESSION4.collectedData.ac}`);

// Parking: bare-yes "DA" → true, then "NEMA PARKING" corrects.
const H_SESSION5 = makeHSession();
delete H_SESSION5.collectedData.parking;
delete H_SESSION5.collectedData.parkingConfidence;
delete H_SESSION5.collectedData.parkingType;
H_SESSION5.messages = [{ role: 'model', text: 'Каков е паркингот? Гаража, приватен или јавен?' }];
const h9 = await generateResponse(H_SESSION5, 'DA');
assert('H9: "DA" to parking question → parking=true',
  H_SESSION5.collectedData.parking === true, `got ${H_SESSION5.collectedData.parking}`);
const h10 = await generateResponse(H_SESSION5, 'NEMA PARKING');
assert('H10: "NEMA PARKING" CORRECTS parking=true → false',
  H_SESSION5.collectedData.parking === false, `got ${H_SESSION5.collectedData.parking}`);

// CONTROL: a stored false (owner already said "NE") is never flipped by a
// later negative — no flip-flop in the same field.
const H_SESSION6 = makeHSession();
delete H_SESSION6.collectedData.elevator;
delete H_SESSION6.collectedData.elevatorConfidence;
H_SESSION6.messages = [{ role: 'model', text: 'Во ред. Дали има лифт во зградата?' }];
const h11 = await generateResponse(H_SESSION6, 'NE');
assert('H11: "NE" to elevator question → elevator=false',
  H_SESSION6.collectedData.elevator === false, `got ${H_SESSION6.collectedData.elevator}`);
const h12 = await generateResponse(H_SESSION6, 'NEMA LIFT');
assert('H12: stored elevator=false stays false (no flip-flop)',
  H_SESSION6.collectedData.elevator === false, `got ${H_SESSION6.collectedData.elevator}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('SECOND-MESSAGE-REGISTERED TESTS');
harness.exit();
