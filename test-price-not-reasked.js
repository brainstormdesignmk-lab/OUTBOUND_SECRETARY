// ============================================================
// test-price-not-reasked.js — "Owner clearly said 350, Ana re-asks" regression
// ============================================================
// Reported (production log, lead 3571074):
//
//   ANA: ...Која е месечната кирија за станот?
//   OWNER: BARAM 350 EVRA ZA MESEC
//   OWNER: EDNA KIRIJA
//   OWNER: DEPOZIT KIRIJA
//   OWNER: ODNAPRED
//   ▸ [MEMORY: { ..., "mentionedPrice": 350 }]      ← monthlyRent NEVER stored
//   ▸ [QUESTION ATTEMPT 2: monthlyRent]             ← re-ask
//   OWNER: TI KAZAV 350
//   ▸ EXTRACTED: monthlyRent=350 (0.60) (PENDING)   ← third ask
//   OWNER: DA                                       ← only then collected
//
// Root cause: the price-quote early response ("baram 350 evra" =
// priceQuoteMatch) fired even during DATA_COLLECTION, stored ONLY
// mentionedPrice and returned the persuasion pitch — the message never
// reached the extraction pass, so monthlyRent stayed empty and Ana re-asked.
//
// Fixes under test:
//   1. priceQuoteMatch is gated on !cooperationAccepted → a price answer
//      during DATA_COLLECTION flows to the extraction pass (monthlyRent/
//      cleanPrice stored HIGH).
//   2. mentionedPrice (quoted during persuasion) is backfilled into the
//      price field so acceptance never re-asks for it.
//   3. Rent/payment talk ("EDNA KIRIJA") no longer phantom-extracts a
//      terrace.
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
// PART A — the exact reported flow (sequential): price answered in DATA_COLLECTION
// ============================================================
console.log('\n========================================');
console.log('🧪 A: rent DATA_COLLECTION — "BARAM 350 EVRA ZA MESEC" must be stored, not re-asked');
console.log('========================================\n');

const rentSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent' },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38970123456'
};

const r1 = await generateResponse(rentSession, 'BARAM 350 EVRA ZA MESEC');
console.log('  Reply:', r1.text);
assert('A1: monthlyRent=350 stored (not just mentionedPrice)',
  rentSession.collectedData.monthlyRent === 350,
  `got monthlyRent=${JSON.stringify(rentSession.collectedData.monthlyRent)}`);
assert('A1: stored at HIGH confidence (no confirmation round-trip)',
  rentSession.collectedData.monthlyRentConfidence === 0.95,
  `got conf=${JSON.stringify(rentSession.collectedData.monthlyRentConfidence)}`);
assert('A1: no pending confirmation left behind',
  rentSession.pendingConfirmation === null || rentSession.pendingConfirmation === undefined,
  `got pending=${JSON.stringify(rentSession.pendingConfirmation)}`);
assert('A1: reply moves ON to availableFrom (rent order) — NOT a monthlyRent re-ask',
  r1.type === 'QUESTION' && r1.nextField === 'availableFrom' && !/кириј/.test(r1.text || ''),
  `got type=${r1.type} next=${r1.nextField} text=${JSON.stringify((r1.text || '').slice(0, 70))}`);
assert('A1: no commission pitch in the reply',
  !/барате/.test(r1.text || ''),
  `got text=${JSON.stringify((r1.text || '').slice(0, 70))}`);

// ============================================================
// PART B — sale variant
// ============================================================
console.log('\n========================================');
console.log('🧪 B: sale DATA_COLLECTION — "baram 98 iljadi evra" → cleanPrice');
console.log('========================================\n');

const saleSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale' },
  messages: [{ role: 'model', text: 'Која би била последната чиста цена за станот?' }],
  phone: '+38970123456'
};

const s1 = await generateResponse(saleSession, 'baram 98 iljadi evra');
console.log('  Reply:', s1.text);
assert('B1: cleanPrice=98000 stored',
  saleSession.collectedData.cleanPrice === 98000,
  `got cleanPrice=${JSON.stringify(saleSession.collectedData.cleanPrice)}`);
assert('B1: reply moves on to totalSqm (no cleanPrice re-ask)',
  s1.type === 'QUESTION' && s1.nextField === 'totalSqm' && !/цена/.test(s1.text || ''),
  `got type=${s1.type} next=${s1.nextField} text=${JSON.stringify((s1.text || '').slice(0, 70))}`);

// ============================================================
// PART C — persuasion behavior PRESERVED (price quote still gets the pitch)
// ============================================================
console.log('\n========================================');
console.log('🧪 C: persuasion — "baram 500 evra" still gets the commission pitch');
console.log('========================================\n');

const freshRent = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false, transactionType: 'rent' },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970123456'
};
const c1 = await generateResponse(freshRent, 'baram 500 evra');
console.log('  Persuasion reply:', c1.text);
assert('C1: persuasion price quote still gets the rent commission pitch',
  c1.type === 'NORMAL' && /50% од една месечна кирија/.test(c1.text || ''),
  `got type=${c1.type} text=${JSON.stringify((c1.text || '').slice(0, 90))}`);
assert('C1: mentionedPrice tracked during persuasion',
  freshRent.collectedData.mentionedPrice === 500,
  `got mentionedPrice=${JSON.stringify(freshRent.collectedData.mentionedPrice)}`);

const freshSale = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false, transactionType: 'sale' },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970123456'
};
const c2 = await generateResponse(freshSale, 'baram 120000');
assert('C2: sale persuasion price quote still gets the clean-price pitch',
  c2.type === 'NORMAL' && /чиста цена/.test(c2.text || ''),
  `got type=${c2.type} text=${JSON.stringify((c2.text || '').slice(0, 90))}`);

// ============================================================
// PART D — mentionedPrice backfill (price quoted during persuasion, then accepted)
// ============================================================
console.log('\n========================================');
console.log('🧪 D: mentionedPrice backfilled into monthlyRent on acceptance');
console.log('========================================\n');

const backfillRent = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  // Owner quoted 350 during persuasion → priceQuoteMatch stored mentionedPrice
  collectedData: { cooperationAccepted: false, transactionType: 'rent', mentionedPrice: 350 },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
  phone: '+38970123456'
};
const d1 = await generateResponse(backfillRent, 'da');
assert('D1: "da" accepts cooperation',
  backfillRent.collectedData.cooperationAccepted === true,
  'not accepted');
assert('D1: monthlyRent backfilled from mentionedPrice (no price re-ask)',
  backfillRent.collectedData.monthlyRent === 350,
  `got monthlyRent=${JSON.stringify(backfillRent.collectedData.monthlyRent)}`);
assert('D1: next question is availableFrom (rent order), NOT a monthlyRent re-ask',
  d1.type === 'QUESTION' && d1.nextField === 'availableFrom' && !/кириј/.test(d1.text || ''),
  `got type=${d1.type} next=${d1.nextField} text=${JSON.stringify((d1.text || '').slice(0, 70))}`);

// Backfill must never overwrite an already-collected price
const noClobber = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent', mentionedPrice: 350, monthlyRent: 250, monthlyRentConfidence: 0.95 },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38970123456'
};
await generateResponse(noClobber, 'zdravo');
assert('D2: backfill never overwrites an existing price',
  noClobber.collectedData.monthlyRent === 250,
  `got monthlyRent=${JSON.stringify(noClobber.collectedData.monthlyRent)}`);

// ============================================================
// PART E — engine grace batch: the EXACT reported 4-message log
// ============================================================
console.log('\n========================================');
console.log('🧪 E: engine grace batch — "BARAM 350..." + payment terms → ONE reply, rent stored');
console.log('========================================\n');

const RENT_LEAD = {
  id: '3571074',
  title: 'SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM',
  phone: '+38978334393',
  url: 'https://reklama5.mk/AdDetails?ad=3571074'
};

const sent = [];
const engine = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 40
});
engine.on('ana-message', (p) => sent.push(p.text));
engine.start();
engine.loadLeads([RENT_LEAD]);
await engine.tick();                            // greet lead1 (rent ad)

// Turn 1: accept → batch asks the rent question
await engine.onOwnerMessage('3571074', 'da');
await new Promise(r => setTimeout(r, 90));
assert('E1: accept batch asked the rent question',
  sent.length === 2 && /кириј/.test(sent[1]),
  `got ${sent.length} msgs: ${JSON.stringify(sent)}`);

// Turn 2: the exact reported 4-message batch
await engine.onOwnerMessage('3571074', 'BARAM 350 EVRA ZA MESEC');
await engine.onOwnerMessage('3571074', 'EDNA KIRIJA');
await engine.onOwnerMessage('3571074', 'DEPOZIT KIRIJA');
await engine.onOwnerMessage('3571074', 'ODNAPRED');
await new Promise(r => setTimeout(r, 90));

const s = engine.getSession('3571074');
console.log('  Batch reply:', sent[sent.length - 1]);
assert('E1: exactly ONE Ana reply for the 4-message batch',
  sent.length === 3,
  `got ${sent.length} msgs: ${JSON.stringify(sent)}`);
assert('E1: monthlyRent=350 stored from the batch (owner clearly said it)',
  s.collectedData.monthlyRent === 350,
  `got monthlyRent=${JSON.stringify(s.collectedData.monthlyRent)}`);
assert('E1: visible reply asks availableFrom (rent order) — NOT a monthlyRent re-ask',
  /слободен/.test(sent[2]) && !/кириј/.test(sent[2]),
  `got reply=${JSON.stringify(sent[2])}`);
assert('E1: no commission pitch in the reply',
  !/барате/.test(sent[2]),
  `got reply=${JSON.stringify(sent[2])}`);
assert('E1: "EDNA KIRIJA" did NOT phantom-extract a terrace',
  s.collectedData.terraceSqm === undefined,
  `got terraceSqm=${JSON.stringify(s.collectedData.terraceSqm)}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('PRICE-NOT-REASKED TESTS');
harness.exit();
