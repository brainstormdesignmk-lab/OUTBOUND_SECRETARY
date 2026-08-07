// ============================================================
// TEST: "OD KOGO ZEMATE PARI" family + rotating objection responses
// ============================================================
// Reported production bug (lead 5540516): the owner pressed on the money
// theme — "OD KOGO ZEMATE PARI AKO NE SE OD MENE ?" then "PA KAZI OD KOGO?"
// — and Ana repeated the SAME sentence verbatim ("Ве разбирам дека имате
// сомнежи, но нашата заработувачка е разликата...") like a bot.
//
// Root causes fixed:
//   1. Neither message matched the isAskingAboutCommission gate nor any
//      objection pattern → they fell through to the LLM persuasion call,
//      which repeated itself. Now the whole "od kogo" money family routes
//      to the from_whose_pocket objection.
//   2. "PA KAZI OD KOGO?" would have matched the 'example' objection
//      (bare "kazi") and got the "120.000 евра пример" reply — the wrong
//      answer. from_whose_pocket (iterated before 'example') now wins.
//   3. who_pays / from_whose_pocket responses were SINGLE static strings,
//      so even hardcoded repeats read as a bot. Both families now rotate
//      (3 variants each, sale + rent), same as legal costs / agent visit.
//   4. The persuasion LLM prompt now carries an explicit no-verbatim-repeat
//      rule as a second safety net for any future fall-through.
//
// Fully offline: every asserted path is a hardcoded early-response handler
// (no LLM call). ANA_OFFLINE_LLM=1 is set anyway so a regression that lets
// a message slip to runPersuasion degrades gracefully instead of hanging.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import {
  isAskingAboutCommission,
  matchObjection,
  WHO_PAYS_RESPONSES_SALE,
  WHO_PAYS_RESPONSES_RENT,
  getRandomWhoPaysResponse,
  FROM_WHOSE_POCKET_RESPONSES_SALE,
  FROM_WHOSE_POCKET_RESPONSES_RENT,
  getRandomFromWhosePocketResponse,
  COMMISSION_NO_PROVISION_RESPONSES_RENT
} from './objections.js';
import { buildPersuasionPrompt } from './persuasion.js';

const harness = createHarness();
const assert = harness.assert;

// The exact reported production messages
const REPORTED_MSGS = [
  'OD KOGO ZEMATE PARI AKO NE SE OD MENE ?',
  'PA KAZI OD KOGO?'
];

function createSession(transactionType = 'sale') {
  return {
    adMemory: { transactionType, propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: { cooperationAccepted: false, transactionType, propertyType: 'apartment' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970000005'
  };
}

// ============================================================
// PART A: Gate + router routing (offline unit)
// ============================================================
console.log('\n=== A: gate + router routing ===');

// 1. The gate must now admit the reported family (both scripts).
for (const q of [
  ...REPORTED_MSGS,
  'OD KOGO ZEMATE PARI ?',
  'od kogo zemate pari ako ne se od mene?',
  'од кого земате пари?',
  'PA KAZI OD KOGO?',
  'па кажи од кого?',
  'кажи ми од кого земате пари',
  'од кого се парите?',
  'PA OD KOGO?'
]) {
  assert(`gate admits "${q}"`, isAskingAboutCommission(q) === true);
}

// 2. Router: both reported messages → from_whose_pocket (NOT 'example').
for (const q of REPORTED_MSGS) {
  const m = matchObjection(q, false);
  assert(`matchObjection("${q}") → from_whose_pocket`, m && m.key === 'from_whose_pocket', `got ${JSON.stringify(m)}`);
}
// "PA KAZI OD KOGO?" must NEVER get the example 120.000 answer.
for (const q of REPORTED_MSGS) {
  const m = matchObjection(q, false);
  assert(`"${q}" is NOT the example objection (no 120.000)`, m && !/120\.000/.test(m.response), `got ${JSON.stringify(m)}`);
}

// 3. Negative guard: a phone/ad-origin "od kogo" question is NOT money.
assert('gate rejects "od kogo e oglasot?"', isAskingAboutCommission('od kogo e oglasot?') === false);
assert('matchObjection("od kogo e oglasot?") → null', matchObjection('od kogo e oglasot?', false) === null);

// 4. Rent routing: same family → rent rule (never the sale buyer line,
//    never "без провизија").
for (const q of REPORTED_MSGS) {
  const m = matchObjection(q, true);
  assert(`rent matchObjection("${q}") → from_whose_pocket + rent rule`, m && m.key === 'from_whose_pocket' && /50% од една месечна кирија/.test(m.response) && !/Купувачот/.test(m.response) && !/без провизија/.test(m.response), `got ${JSON.stringify(m)}`);
}

// ============================================================
// PART B: Rotation — variants exist and actually vary
// ============================================================
console.log('\n=== B: rotating response families ===');

assert('WHO_PAYS sale has >= 3 distinct variants', new Set(WHO_PAYS_RESPONSES_SALE).size >= 3);
assert('WHO_PAYS rent has >= 3 distinct variants', new Set(WHO_PAYS_RESPONSES_RENT).size >= 3);
assert('FROM_WHOSE_POCKET sale has >= 3 distinct variants', new Set(FROM_WHOSE_POCKET_RESPONSES_SALE).size >= 3);
assert('FROM_WHOSE_POCKET rent has >= 3 distinct variants', new Set(FROM_WHOSE_POCKET_RESPONSES_RENT).size >= 3);

function distinctOverCalls(getter, n = 30) {
  const seen = new Set();
  for (let i = 0; i < n; i++) seen.add(getter());
  return seen.size;
}

assert('getRandomWhoPaysResponse(sale) varies', distinctOverCalls(() => getRandomWhoPaysResponse(false)) >= 2);
assert('getRandomWhoPaysResponse(rent) varies', distinctOverCalls(() => getRandomWhoPaysResponse(true)) >= 2);
assert('getRandomFromWhosePocketResponse(sale) varies', distinctOverCalls(() => getRandomFromWhosePocketResponse(false)) >= 2);
assert('getRandomFromWhosePocketResponse(rent) varies', distinctOverCalls(() => getRandomFromWhosePocketResponse(true)) >= 2);

// Rent variants must never leak sale-only phrasing.
const FORBIDDEN_RENT_CLAIMS = /без провизија|без никакви давачки|без никакви обврски|не зема ништо|ние додаваме над неа/i;
let rentLeak = '';
let rentVariantsClean = true;
for (const t of [...WHO_PAYS_RESPONSES_RENT, ...FROM_WHOSE_POCKET_RESPONSES_RENT]) {
  if (FORBIDDEN_RENT_CLAIMS.test(t)) { rentVariantsClean = false; rentLeak = t; break; }
}
assert(`rent rotating variants never claim 'без провизија' (leak: "${rentLeak}")`, rentVariantsClean);

// ============================================================
// PART C: E2E — reported messages get a hardcoded objection answer,
// NOT the repeated LLM persuasion sentence
// ============================================================
console.log('\n=== C: e2e generateResponse ===');

const BOT_SENTENCE = /Ве разбирам дека имате сомнежи/;

// SALE — first message
const saleSession1 = createSession('sale');
const saleRes1 = await generateResponse(saleSession1, REPORTED_MSGS[0]);
assert(`e2e sale "${REPORTED_MSGS[0]}" → NORMAL + money answer`, saleRes1.type === 'NORMAL' && /конечната цена|разликат|барана цена/i.test(saleRes1.text), `got [${saleRes1.type}] "${(saleRes1.text || '').substring(0, 100)}"`);
assert(`e2e sale "${REPORTED_MSGS[0]}" → NOT the repeated LLM sentence`, !BOT_SENTENCE.test(saleRes1.text), `got "${(saleRes1.text || '').substring(0, 100)}"`);
assert(`e2e sale "${REPORTED_MSGS[0]}" → NOT phone-origin`, !/Го добив вашиот број/.test(saleRes1.text), `got "${(saleRes1.text || '').substring(0, 100)}"`);

// SALE — follow-up "PA KAZI OD KOGO?" must NOT give the example 120.000
const saleSession2 = createSession('sale');
const saleRes2 = await generateResponse(saleSession2, REPORTED_MSGS[1]);
assert(`e2e sale "${REPORTED_MSGS[1]}" → NORMAL + money answer`, saleRes2.type === 'NORMAL' && /конечната цена|разликат|барана цена/i.test(saleRes2.text), `got [${saleRes2.type}] "${(saleRes2.text || '').substring(0, 100)}"`);
assert(`e2e sale "${REPORTED_MSGS[1]}" → NOT the example 120.000 answer`, !/120\.000/.test(saleRes2.text), `got "${(saleRes2.text || '').substring(0, 100)}"`);
assert(`e2e sale "${REPORTED_MSGS[1]}" → NOT the repeated LLM sentence`, !BOT_SENTENCE.test(saleRes2.text), `got "${(saleRes2.text || '').substring(0, 100)}"`);

// RENT — both messages must state the 50% rent rule, never the buyer line
for (const q of REPORTED_MSGS) {
  const rentSession = createSession('rent');
  const rentRes = await generateResponse(rentSession, q);
  assert(`e2e rent "${q}" → NORMAL + rent rule`, rentRes.type === 'NORMAL' && /50% од (?:една )?месечна(?:та)? кирија/.test(rentRes.text), `got [${rentRes.type}] "${(rentRes.text || '').substring(0, 100)}"`);
  assert(`e2e rent "${q}" → no buyer line / no forbidden claims`, !/Купувачот/.test(rentRes.text) && !FORBIDDEN_RENT_CLAIMS.test(rentRes.text), `got "${(rentRes.text || '').substring(0, 100)}"`);
  assert(`e2e rent "${q}" → NOT the repeated LLM sentence`, !BOT_SENTENCE.test(rentRes.text), `got "${(rentRes.text || '').substring(0, 100)}"`);
}

// RENT — CYRILLIC variant: "ОД КОГО ЗЕМАТЕ ПАРИ" contains "земате", which
// hits the rent-specific gate branch (BEFORE matchObjection). That branch
// must now rotate through the approved rent variants too — never the old
// single static sentence.
const cyrRentRes = await generateResponse(createSession('rent'), 'ОД КОГО ЗЕМАТЕ ПАРИ?');
assert(`e2e rent Cyrillic "ОД КОГО ЗЕМАТЕ ПАРИ?" → rotating rent rule`, cyrRentRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_RENT.includes(cyrRentRes.text), `got [${cyrRentRes.type}] "${(cyrRentRes.text || '').substring(0, 100)}"`);

// SALE — repeated pressing must NOT produce the same sentence every time
// (rotation): across fresh sessions the same question yields >= 2 distinct
// replies. (Astronomically unlikely to flake: 3 variants.)
const saleDistinct = new Set();
for (let i = 0; i < 20; i++) {
  const s = createSession('sale');
  const r = await generateResponse(s, REPORTED_MSGS[0]);
  saleDistinct.add(r.text);
}
assert(`e2e sale "${REPORTED_MSGS[0]}" varies across sessions (${saleDistinct.size} distinct)`, saleDistinct.size >= 2);

// ============================================================
// PART D: persuasion prompt carries the no-verbatim-repeat rule
// ============================================================
console.log('\n=== D: persuasion prompt no-repeat rule ===');
const prompt = buildPersuasionPrompt('[РАЗГОВОР]', 'nekoj input', '', false);
assert('persuasion prompt has the no-verbatim-repeat rule', /ИСТАТА РЕЧЕНИЦА/.test(prompt) && /НЕ ЈА ПОВТОРУВАЈ БУКВАЛНО/.test(prompt));

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 OBJECTION-VARIATIONS TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 OBJECTION-VARIATIONS TESTS PASSED');
}
