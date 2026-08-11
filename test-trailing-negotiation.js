// ============================================================
// test-trailing-negotiation.js — "she starts collecting but owner is
// still negotiating" regression
// ============================================================
// Reported (production log, lead 3571074):
//
//   OWNER: mozeme da probame
//   OWNER: ama dali klientite vi se provereni ?
//   OWNER: ozbilni ?
//   ▸ [INTENT: ACCEPTED, CONFIDENCE: 0.9]
//   ▸ [COOPERATION: ACCEPTED (conf=0.9)]
//   ▸ [PHASE TRANSITION: PERSUASION → DATA_COLLECTION (phase_detected)]
//   ▸ [QUESTION: Која е месечната кирија за станот?]
//
// The owner accepted CONDITIONALLY — "we can try, BUT are your clients
// verified? serious?" — and Ana jumped into data collection, asking for
// the rent while the owner was still extracting promises about the
// clientele. TWO layers, both fixed:
//
// LAYER 1 (objections.js + early-responses.js): a client-QUALITY /
// verification concern — "dali klientite vi se provereni ?", the bare
// follow-up "ozbilni ?" (referent resolved from the same-turn context),
// "sakam ozbilni klienti ne nekoj salabajzeri" — gets a hardcoded
// reassurance answer ANY time it appears, in ANY phase, so it is never
// swallowed by a data-collection question.
//
// LAYER 2 (persuasion-phase.js): when an acceptance message is followed
// (in the SAME turn) by a trailing client-quality concern, the
// PERSUASION → DATA_COLLECTION transition is HELD — the acceptance was
// conditional. Ana stays in persuasion, answers the concern, and the
// owner re-confirms cleanly (next turn) before data collection begins.
// A declarative preference fused into an acceptance ("dobro, sakam
// ozbilni klienti, ajde probame") does NOT block — that IS a commitment.
//
// Runs fully offline (ANA_OFFLINE_LLM — the persuasion tail, if ever
// reached, is a canned reply).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import { MultiLeadEngine } from './engine.js';
import {
  isAskingAboutClientQuality,
  isClientQualityConcern,
  CLIENT_QUALITY_RESPONSES_SALE,
  CLIENT_QUALITY_RESPONSES_RENT
} from './objections.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// PART A — unit gates: isAskingAboutClientQuality (broad) vs
// isClientQualityConcern (strict — only probing forms block an acceptance)
// ============================================================
console.log('\n========================================');
console.log('🧪 A: client-quality gates');
console.log('========================================\n');

const shouldMatchQuality = [
  'ama dali klientite vi se provereni ?',          // THE reported message
  'dali klientite vi se provereni ?',
  'дали клиентите ви се проверени?',                // Cyrillic
  'dali klientite se ozbilni?',
  'дали клиентите се озбилни?',
  'SAKAM OZBILNI KLIENTI NE NEKOJ SALABAJZERI',    // reported earlier lead
  'kakvi klienti imate?',
  'dali imate provereni klienti?',
  'kakvi se klientite?'               // what are the clients like
];
for (const q of shouldMatchQuality) {
  assert(`A1 quality-match: "${q}"`, isAskingAboutClientQuality(q), `no match for ${q}`);
}

// Bare follow-ups resolve the referent from recent context (the whole
// quickfire batch is visible — same trick as the who-pays-the-notary gate).
const BATCH_CTX = 'mozeme da probame ama dali klientite vi se provereni ? ozbilni ?';
assert('A2: bare "ozbilni ?" + client in context → quality', isAskingAboutClientQuality('ozbilni ?', BATCH_CTX), 'bare ozbilni must match with context');
assert('A2: bare "ozbilni li se ?" + client in context → quality', isAskingAboutClientQuality('ozbilni li se ?', BATCH_CTX), 'bare ozbilni li se must match');
assert('A2: bare "provereni ?" + client in context → quality', isAskingAboutClientQuality('provereni ?', BATCH_CTX), 'bare provereni must match');
assert('A2: bare "ozbilni ?" withOUT client context → NOT quality', !isAskingAboutClientQuality('ozbilni ?', ''), 'no referent must not match');
assert('A2: Cyrillic bare "озбилни ?" + клиентите in context → quality', isAskingAboutClientQuality('озбилни ?', 'можеме да пробаме ама дали клиентите ви се проверени ? озбилни ?'), 'cyrillic bare must match');

const shouldNotMatchQuality = [
  'dobro probame',                 // plain acceptance
  'kako rabotite?',                // workflow question
  'kolku e provizijata?',          // commission question
  'ne znam',                       // hedge
  'klientot ke dojde utre',        // statement about a client, no quality word
  'ozbilno mislam',                // adverb form, NOT the client plural
  'proverena dokumentacija',       // adjective about docs, not clients
  'dali e ozbilna agencijata?',    // agency quality, not client quality
  'dali imate kupci?',             // isAskingAboutClients territory, not quality
  'ne sum zainteresiran'           // rejection
];
for (const q of shouldNotMatchQuality) {
  assert(`A3 quality-no-match: "${q}"`, !isAskingAboutClientQuality(q), `false positive for ${q}`);
}

// STRICT vs BROAD — the guard must only hold the transition on PROBING
// forms. A declarative preference inside an acceptance is a commitment.
assert('A4: "ama dali klientite vi se provereni ?" → concern (strict)', isClientQualityConcern('ama dali klientite vi se provereni ?'), 'question form must be a concern');
assert('A4: "ozbilni ?" (ctx) → concern (strict)', isClientQualityConcern('ozbilni ?', BATCH_CTX), 'bare follow-up must be a concern');
assert('A4: "sakam ozbilni klienti ne nekoj salabajzeri" → broad but NOT strict concern', !isClientQualityConcern('SAKAM OZBILNI KLIENTI NE NEKOJ SALABAJZERI'), 'declarative statement must not block');
assert('A4: "dobro, sakam ozbilni klienti, ajde probame" → NOT strict concern', !isClientQualityConcern('dobro, sakam ozbilni klienti, ajde probame'), 'acceptance with preference must not block');
assert('A4: "mozeme da probame" → NOT strict concern', !isClientQualityConcern('mozeme da probame'), 'plain acceptance must not block');

// ============================================================
// PART B — single-turn persuasion: the concern gets the reassurance
// ============================================================
console.log('\n========================================');
console.log('🧪 B: concern answered in persuasion (before cooperation)');
console.log('========================================\n');

const persSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38976000001'
};
const b1 = await generateResponse(persSession, 'ama dali klientite vi se provereni ?');
console.log('  Reply:', b1.text);
assert('B1: type NORMAL (reassurance, not a data question)', b1.type === 'NORMAL', `got ${b1.type}`);
assert('B1: reply is a client-quality reassurance (rent variant)', CLIENT_QUALITY_RESPONSES_RENT.includes(b1.text), `got "${(b1.text || '').slice(0, 80)}"`);
assert('B1: cooperation NOT accepted', persSession.collectedData.cooperationAccepted !== true, 'cooperation must stay false');

// Sale variant
const persSale = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis. Дали е се уште достапен станот?' }],
  phone: '+38976000001'
};
const b2 = await generateResponse(persSale, 'dali klientite vi se provereni ?');
assert('B2: sale reassurance variant', b2.type === 'NORMAL' && CLIENT_QUALITY_RESPONSES_SALE.includes(b2.text), `got "${(b2.text || '').slice(0, 80)}"`);

// ============================================================
// PART C — concern during DATA_COLLECTION: still the reassurance,
// never a data-collection question (the visible-reply fix)
// ============================================================
console.log('\n========================================');
console.log('🧪 C: concern in DATA_COLLECTION → reassurance, not the rent question');
console.log('========================================\n');

const dcSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent' },
  messages: [{ role: 'model', text: 'Која е месечната кирија за станот?' }],
  phone: '+38976000001',
  phase: 'DATA_COLLECTION'
};
const c1 = await generateResponse(dcSession, 'dali klientite vi se provereni ?');
console.log('  Reply:', c1.text);
assert('C1: reassurance (NOT the rent question)', c1.type === 'NORMAL' && CLIENT_QUALITY_RESPONSES_RENT.includes(c1.text), `got [${c1.type}] "${(c1.text || '').slice(0, 80)}"`);
assert('C1: no rent question asked', !/кириј/.test(c1.text || ''), `text: ${(c1.text || '').slice(0, 80)}`);

// ============================================================
// PART D — control: a solo strong acceptance still enters DATA_COLLECTION
// ============================================================
console.log('\n========================================');
console.log('🧪 D: solo "mozeme da probame" → cooperation accepted (no over-block)');
console.log('========================================\n');

const soloSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38976000001'
};
const d1 = await generateResponse(soloSession, 'mozeme da probame');
console.log('  Reply:', d1.text);
assert('D1: cooperation accepted', soloSession.collectedData.cooperationAccepted === true, `coop=${soloSession.collectedData.cooperationAccepted}`);
assert('D1: DATA_COLLECTION rent question', d1.type === 'QUESTION' && d1.nextField === 'monthlyRent', `got type=${d1.type} next=${d1.nextField}`);

// ============================================================
// PART E — engine grace batch: the EXACT reported 3-message flow.
// Message 1 accepts, but the turn ends with a client-quality concern →
// the transition is HELD, the visible reply answers the concern, and no
// rent question is ever sent.
// ============================================================
console.log('\n========================================');
console.log('🧪 E: engine batch — "mozeme da probame" + "ama dali klientite vi se provereni ?" + "ozbilni ?"');
console.log('========================================\n');

const RENT_LEAD = {
  id: '3571074',
  title: 'SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM',
  phone: '+38976000001',
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
    ownerGraceMs: 40
  });
  engine.on('ana-message', (p) => sent.push(p.text));
  engine.start();
  engine.loadLeads([RENT_LEAD]);
  return { engine, sent };
}

const { engine: e1, sent: sent1 } = makeGraceEngine();
await e1.tick();                            // greet lead1 (rent ad)
await e1.onOwnerMessage('3571074', 'mozeme da probame');
await e1.onOwnerMessage('3571074', 'ama dali klientite vi se provereni ?');
await e1.onOwnerMessage('3571074', 'ozbilni ?');
await new Promise(r => setTimeout(r, 90));  // window elapses → batch processes
console.log('  Batch reply:', sent1[sent1.length - 1]);
const sess1 = e1.getSession('3571074');
assert('E1: exactly ONE Ana reply for the batch (greeting + reply)', sent1.length === 2, `got ${sent1.length}: ${JSON.stringify(sent1)}`);
assert('E1: the single reply is the client-quality reassurance (NOT the rent question)', CLIENT_QUALITY_RESPONSES_RENT.includes(sent1[1]) && !/кириј/.test(sent1[1]), `got "${(sent1[1] || '').slice(0, 80)}"`);
assert('E1: cooperation NOT accepted (conditional acceptance held)', sess1.collectedData?.cooperationAccepted !== true, `coop=${sess1.collectedData?.cooperationAccepted}`);
assert('E1: phase stays PERSUASION (no DATA_COLLECTION entry)', sess1.phase !== 'DATA_COLLECTION', `phase=${sess1.phase}`);

// ============================================================
// PART F — after the concern is answered, a clean re-confirmation enters
// DATA_COLLECTION (next turn — Ana's reassurance is now a model message)
// ============================================================
console.log('\n========================================');
console.log('🧪 F: next-turn "da probame" → cooperation accepted → data collection');
console.log('========================================\n');

await e1.onOwnerMessage('3571074', 'da probame');
await new Promise(r => setTimeout(r, 90));
console.log('  Turn-2 reply:', sent1[sent1.length - 1]);
assert('F1: exactly ONE more Ana reply', sent1.length === 3, `got ${sent1.length}: ${JSON.stringify(sent1)}`);
assert('F1: cooperation accepted on clean re-confirmation', e1.getSession('3571074').collectedData?.cooperationAccepted === true, `coop=${e1.getSession('3571074').collectedData?.cooperationAccepted}`);
assert('F1: DATA_COLLECTION rent question sent', /кириј/.test(sent1[2]) && e1.getSession('3571074').phase === 'DATA_COLLECTION', `reply="${(sent1[2] || '').slice(0, 60)}" phase=${e1.getSession('3571074').phase}`);

// ============================================================
// PART G — control engine batch: acceptance WITHOUT a trailing concern
// enters DATA_COLLECTION immediately (the guard never over-blocks)
// ============================================================
console.log('\n========================================');
console.log('🧪 G: control batch — solo "mozeme da probame" via engine → data collection');
console.log('========================================\n');

const { engine: e2, sent: sent2 } = makeGraceEngine();
await e2.tick();                            // greet lead1
await e2.onOwnerMessage('3571074', 'mozeme da probame');
await new Promise(r => setTimeout(r, 90));
console.log('  Reply:', sent2[1]);
assert('G1: exactly ONE reply', sent2.length === 2, `got ${sent2.length}: ${JSON.stringify(sent2)}`);
assert('G1: rent question sent (acceptance NOT held)', /кириј/.test(sent2[1] || ''), `got "${(sent2[1] || '').slice(0, 60)}"`);
assert('G1: cooperation accepted + DATA_COLLECTION', e2.getSession('3571074').collectedData?.cooperationAccepted === true && e2.getSession('3571074').phase === 'DATA_COLLECTION', `coop=${e2.getSession('3571074').collectedData?.cooperationAccepted} phase=${e2.getSession('3571074').phase}`);

// ============================================================
// PART H — ORDERING SEMANTICS: concern BEFORE acceptance in the same
// batch must NOT hold the transition — the owner asked, then accepted
// (reviewer finding: the fused-message unit test alone didn't lock the
// two-message batch ordering).
// ============================================================
console.log('\n========================================');
console.log('🧪 H: engine batch — concern first, then "da probame" → data collection');
console.log('========================================\n');

const { engine: e3, sent: sent3 } = makeGraceEngine();
await e3.tick();                            // greet lead1
await e3.onOwnerMessage('3571074', 'dali klientite vi se provereni ?');
await e3.onOwnerMessage('3571074', 'da probame');
await new Promise(r => setTimeout(r, 90));
console.log('  Batch reply:', sent3[1]);
assert('H1: exactly ONE Ana reply', sent3.length === 2, `got ${sent3.length}: ${JSON.stringify(sent3)}`);
assert('H1: acceptance stands — DATA_COLLECTION rent question sent', /кириј/.test(sent3[1] || ''), `got "${(sent3[1] || '').slice(0, 60)}"`);
assert('H1: cooperation accepted + DATA_COLLECTION (concern-first order not held)',
  e3.getSession('3571074').collectedData?.cooperationAccepted === true && e3.getSession('3571074').phase === 'DATA_COLLECTION',
  `coop=${e3.getSession('3571074').collectedData?.cooperationAccepted} phase=${e3.getSession('3571074').phase}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('TRAILING-NEGOTIATION TESTS');
harness.exit();
