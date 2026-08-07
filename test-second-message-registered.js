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
// The first "da" moved the session into DATA_COLLECTION (cooperationAccepted
// = true). The second message ("I still haven't rented it out" = the
// property IS still available) was then never REGISTERED: the availability
// handler in early-responses.js is gated on !cooperationAccepted, and the
// message contains no extractable field, so Ana re-asked the rent question
// with ZERO acknowledgment of what the owner just said.
//
// Fix under test: during DATA_COLLECTION, a still-available confirmation is
// acknowledged by prepending "Одлично, значи сè уште е достапен!" to the
// next field question (once per conversation). The engine grace batch must
// not consume that acknowledgment on a DROPPED intermediate response.
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
assert('D1: the single reply registers BOTH — ack + rent question',
  /сè уште е достапен/.test(sent1[1]) && /кириј/.test(sent1[1]),
  `got reply=${JSON.stringify(sent1[1])}`);
assert('D1: cooperation persisted through the batch',
  e1.getSession('3571074').collectedData?.cooperationAccepted === true,
  'acceptance lost in the batch');

// 3-message batch: "da" + "uste ne sum go izdal" + "350 evra mesecno"
// The ack lands on the LAST (visible) response — it must NOT be consumed by
// the dropped intermediate "uste ne sum go izdal" response.
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
assert('D2: rent extracted from the batch (350)', 
  e2.getSession('3571074').collectedData?.monthlyRent === 350,
  `monthlyRent=${JSON.stringify(e2.getSession('3571074').collectedData?.monthlyRent)}`);
assert('D2: visible reply = ack + totalSqm question (ack not consumed by dropped intermediate)',
  /сè уште е достапен/.test(sent2[1]) && /квадратур/.test(sent2[1]),
  `got reply=${JSON.stringify(sent2[1])}`);

// REVERSE-ORDER batch: availability message BEFORE acceptance. The
// intermediate "uste ne sum go izdal" hits the persuasion availability
// template (cooperation not yet accepted) and sets the flag — that response
// is DROPPED, so the engine rolls the flag back, and the visible reply
// (from the "da") must still register the availability via the recent-
// message scan.
const { engine: e3, sent: sent3 } = makeGraceEngine();
await e3.tick();                            // greet lead1
await e3.onOwnerMessage('3571074', 'uste ne sum go izdal');
await e3.onOwnerMessage('3571074', 'da');
await new Promise(r => setTimeout(r, 90));
console.log('  Reverse-order batch reply:', sent3[sent3.length - 1]);
assert('D3: exactly ONE Ana reply for the reverse-order batch',
  sent3.length === 2,
  `got ${sent3.length} messages: ${JSON.stringify(sent3)}`);
assert('D3: visible reply still registers the availability + asks rent',
  /сè уште е достапен/.test(sent3[1]) && /кириј/.test(sent3[1]),
  `got reply=${JSON.stringify(sent3[1])}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('SECOND-MESSAGE-REGISTERED TESTS');
harness.exit();
