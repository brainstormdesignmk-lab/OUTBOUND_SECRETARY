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
// SUMMARY
// ============================================================
harness.summary('SECOND-MESSAGE-REGISTERED TESTS');
harness.exit();
