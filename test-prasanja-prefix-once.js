// ============================================================
// test-prasanja-prefix-once.js — prašanja prefixes fire exactly ONCE
// ============================================================
// Reported (production log): Ana used the two collecting-phase prefixes —
// "Уште неколку прашања" and "Одлично, уште последниве информации и
// завршуваме" — on EVERY question, so the collecting phase sounded robotic:
//
//   PREVIOUSLY:  "Супер. Уште неколку прашања. Дали се дозволени миленици?"
//                "Добро. Уште неколку прашања. Колкава е квадратурата?"
//                ... then "Одлично, уште последниве информации и завршуваме."
//                on every remaining question.
//
// Required scheme (implemented in handlers/data-collection.js):
//   1. "Уште неколку прашања" fires EXACTLY ONCE — at the first question in
//      the usual zone (rent: the pets question; sale: the bedrooms question);
//   2. the NEXT 3 questions carry NO prašanja prefix (plain fillers);
//   3. the question after those fires "Одлично, уште последниве информации
//      и завршуваме." EXACTLY ONCE;
//   4. everything after that is plain fillers to the very end.
//
// This suite drives full rent + sale conversations to CLOSE and counts both
// prefixes over the ENTIRE session message history (greeting → close). It
// ALSO drives non-answer-heavy conversations (owner says "ne znam" for most
// fields → re-asks + skips): the once-per-conversation guarantee must hold
// even through re-asks, where the old code repeated prefixes most loudly.
// Runs fully offline.
// ============================================================
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHarness } from './test-helpers.js';

// Keep completed-conversation fixtures out of the repository's real property
// archive and CSV. Config is loaded by service.js, so set test paths before its
// dynamic import; clean the unique temporary tree when this suite exits.
process.env.ANA_OFFLINE_LLM = '1';
const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), 'ana-prasanja-test-'));
process.env.PROPERTY_ROOT = join(TEST_DATA_DIR, 'properties');
process.env.CSV_OUTPUT_PATH = join(TEST_DATA_DIR, 'collected-leads.csv');
process.on('exit', () => rmSync(TEST_DATA_DIR, { recursive: true, force: true }));

const { generateResponse } = await import('./service.js');
const { getNextMissingField } = await import('./workflow.js');

const harness = createHarness();
const assert = harness.assert;

const PREFIX_A = 'Уште неколку прашања';
const PREFIX_B = 'последниве информации и завршуваме';

// One scripted answer per field — each must extract on the FIRST ask so the
// flow advances one field per turn (any miss would re-ask and shift the
// prefix positions, failing the "exactly once" assertions).
const ANSWERS = {
  rent: {
    monthlyRent: '350 evra mesecno',
    availableFrom: 'od 1 juli e sloboden',
    tenantPreferences: 'SAKAM STUDENTI, MLADI BRACNI PAROVI, SAMCI VRABOTENI',
    petsAllowed: 'DA, MILENICI SE DOZVOLENI',
    totalSqm: '55 kvadrati',
    terraceSqm: 'ima terasa od 5 m2',
    bedrooms: '2 spalni',
    floor: '3 kat',
    totalFloors: '10 katnica',
    elevator: 'ima lift',
    heating: 'gradsko parno',        // full phrase — no "Какво парно?" follow-up
    ac: 'ima klima',
    parking: 'ima garaza',
    orientation: 'jugoistok',
    furnished: 'kompletno namesten',
    yearBuilt: '2015 godina',
    renovated: 'da, renoviran e 2020ta',
    documentationClean: 'cist imoten list',
    photos: 'da, imam sliki',
    ownerName: 'Petar Petrovski',
    address: 'ul. Partizanska 12, Skopje'
  },
  sale: {
    cleanPrice: '160000 evra',
    totalSqm: '74 kvadrati',
    terraceSqm: 'ima terasa od 3 m2',
    bedrooms: '2 spalni',
    floor: '4 kat',
    totalFloors: '10 katnica',
    elevator: 'ima lift',
    heating: 'gradsko parno',
    ac: 'ima klima',
    parking: 'ima garaza',
    orientation: 'jug',
    furnished: 'kompletno namesten',
    yearBuilt: '2015 godina',
    renovated: 'da, renoviran e',
    renovationYear: '2020 godina',
    documentationClean: 'cist imoten list',
    photos: 'da, imam sliki',
    ownerName: 'Petar Petrov',
    address: 'ul. Partizanska 12, Skopje'
  }
};

function freshSession(transactionType) {
  const rent = transactionType === 'rent';
  return {
    adMemory: {
      transactionType,
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'reklama5',
      adUrl: 'https://reklama5.mk/stan/123',
      photoUrls: []
    },
    collectedData: { cooperationAccepted: false },
    messages: [{
      role: 'model',
      text: rent
        ? 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?'
        : 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка?'
    }],
    phone: '+38970123456'
  };
}

/**
 * Drive a conversation. Modes:
 *   full  — answer every field so the flow walks the whole collecting phase
 *           and reaches CLOSE;
 *   nonanswer — answer only the first `realFields` fields, then "ne znam"
 *           for everything else → re-asks, rotating variants and the
 *           2-attempt skip cap — the realistic messy conversation.
 *
 * Returns the whole session (its message history is the authoritative record
 * of the conversation) plus whether it closed.
 */
async function runConversation(transactionType, { nonanswer = false, realFields = 2 } = {}) {
  const session = freshSession(transactionType);
  const answers = ANSWERS[transactionType];

  async function send(u) {
    const res = await generateResponse(session, u);
    session.messages.push({ role: 'user', text: u });
    session.messages.push({ role: 'model', text: res.text });
    return res;
  }

  console.log(`\n——— ${transactionType.toUpperCase()} (${nonanswer ? 'NON-ANSWER' : 'FULL'}) ———`);
  await send('DA, DOSTAPEN E');
  await send('SUPER, KAZI MI STO TI TREBA PA DA POCNEME');

  let res;
  let realAsked = 0;
  let guard = 0;
  while (guard++ < 80) {
    const known = { ...session.adMemory, ...session.collectedData };
    const nextField = getNextMissingField(known);
    if (!nextField) break;
    const answering = nonanswer && realAsked >= realFields ? false : Boolean(answers[nextField]);
    if (answering) realAsked++;
    res = await send(answering ? answers[nextField] : 'ne znam');
    if (res.type === 'CLOSE') break;
  }
  return { session, closed: res?.type === 'CLOSE' };
}

/** All Ana texts across the ENTIRE conversation (greeting included). */
function allAnaTexts(session) {
  return session.messages.filter(m => m.role === 'model').map(m => m.text || '');
}

/**
 * Full-conversation scheme: each prefix exactly once, in order, with exactly
 * 3 plain questions between, and no prefix in the tail. Counts run over the
 * complete session history — not just collected replies — so "во цела
 * конверзација" is taken literally.
 */
function assertPrefixScheme(flow, { session, closed }) {
  const texts = allAnaTexts(session);

  assert(`${flow}: conversation reached CLOSE (whole flow walked)`,
    closed === true,
    `last model text: ${JSON.stringify((texts[texts.length - 1] || '').slice(0, 60))}`);

  const countA = texts.filter(t => t.includes(PREFIX_A)).length;
  const countB = texts.filter(t => t.includes(PREFIX_B)).length;

  assert(`${flow}: „Уште неколку прашања“ appears EXACTLY ONCE in the whole history`,
    countA === 1,
    `got ${countA}`);
  assert(`${flow}: „последниве информации и завршуваме“ appears EXACTLY ONCE in the whole history`,
    countB === 1,
    `got ${countB}`);

  const iA = texts.findIndex(t => t.includes(PREFIX_A));
  const iB = texts.findIndex(t => t.includes(PREFIX_B));

  assert(`${flow}: „Уште неколку прашања“ comes BEFORE „последниве“`,
    iA !== -1 && iB !== -1 && iA < iB,
    `iA=${iA} iB=${iB}`);

  if (iA !== -1 && iB !== -1 && iA < iB) {
    // "KEEP THE NEXT 3 WITHOUT": exactly 3 messages between the two prefixed
    // questions, none carrying either prefix (they are the plain fillers).
    const between = texts.slice(iA + 1, iB);
    assert(`${flow}: exactly 3 plain questions between the two prefixes`,
      between.length === 3,
      `got ${between.length} → ${JSON.stringify(between)}`);
    const prefixedInGap = between.filter(t => t.includes(PREFIX_A) || t.includes(PREFIX_B));
    assert(`${flow}: no prašanja prefix inside the 3-question gap`,
      prefixedInGap.length === 0,
      JSON.stringify(prefixedInGap));
    // "TILL THE END": nothing after последниве carries either prefix.
    const tailHits = texts.slice(iB + 1).filter(t => t.includes(PREFIX_A) || t.includes(PREFIX_B));
    assert(`${flow}: no prašanja prefix after „последниве“ till the end`,
      tailHits.length === 0,
      JSON.stringify(tailHits));
    // The two prefixes never share a message.
    assert(`${flow}: the two prefixes never appear in the same message`,
      texts.every(t => !(t.includes(PREFIX_A) && t.includes(PREFIX_B))),
      JSON.stringify(texts.filter(t => t.includes(PREFIX_A) && t.includes(PREFIX_B))));
  }
}

/**
 * Messy conversations (re-asks, skips): the once-per-conversation guarantee.
 * No CLOSE assert here — a "ne znam"-heavy flow legitimately parks in the
 * async AWAITING_PHOTOS wait state at the photos question; the point is that
 * the once-per-conversation guarantee holds through all the re-asks/skips
 * (exactly where the old code repeated prefixes the loudest).
 */
function assertOnceEvenWithNonAnswers(flow, { session }) {
  const texts = allAnaTexts(session);
  const countA = texts.filter(t => t.includes(PREFIX_A)).length;
  const countB = texts.filter(t => t.includes(PREFIX_B)).length;
  assert(`${flow}: „Уште неколку прашања“ still EXACTLY ONCE through re-asks/skips`,
    countA === 1,
    `got ${countA} → ${JSON.stringify(texts.filter(t => t.includes(PREFIX_A)))}`);
  assert(`${flow}: „последниве информации и завршуваме“ still EXACTLY ONCE through re-asks/skips`,
    countB === 1,
    `got ${countB} → ${JSON.stringify(texts.filter(t => t.includes(PREFIX_B)))}`);
  assert(`${flow}: „Уште неколку прашања“ comes BEFORE „последниве“`,
    texts.findIndex(t => t.includes(PREFIX_A)) !== -1 &&
    texts.findIndex(t => t.includes(PREFIX_A)) < texts.findIndex(t => t.includes(PREFIX_B)),
    'intro must precede the final-questions prefix');
}

// ============================================================
// FULL flows — rent + sale: the complete scheme
// ============================================================
const rent = await runConversation('rent');
assertPrefixScheme('RENT', rent);

const sale = await runConversation('sale');
assertPrefixScheme('SALE', sale);

// ============================================================
// NON-ANSWER flows — rent + sale: owner says "ne znam" for most
// fields → re-asks + skips — the once-per-conversation guarantee holds
// ============================================================
const rentNa = await runConversation('rent', { nonanswer: true });
assertOnceEvenWithNonAnswers('RENT-NON-ANSWER', rentNa);

const saleNa = await runConversation('sale', { nonanswer: true });
assertOnceEvenWithNonAnswers('SALE-NON-ANSWER', saleNa);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('PRASANJA-PREFIX-ONCE TESTS');
harness.exit();
