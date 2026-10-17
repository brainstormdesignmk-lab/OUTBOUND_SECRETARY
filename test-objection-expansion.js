// ============================================================
// TEST: OBJECTION LIBRARY EXPANSION (15 new categories)
// ============================================================
// The objection library grew from ~28 to ~43 distinct question categories.
// These are real owner questions that used to fall through every hardcoded
// gate into the LLM (or the generic persuasion ladder) — including the
// reported "KAKOV TIP NA KLIENTI NUDITE ?" (lead 3571074) and the
// property-gone close bug: "STO AKO NE SE PRODADE ?" / "KOGA KE SE PRODADE
// MOJOT STAN ?" contain the bare "se prodade" alternative of
// PROPERTY_GONE_RE, which used to CLOSE the lead as already-sold.
//
// Fully offline: every asserted path is a hardcoded early-response handler
// (no LLM call). ANA_OFFLINE_LLM=1 is set so a regression that lets a
// message slip to runPersuasion degrades gracefully instead of hanging.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { generateResponse } from './service.js';
import {
  isAskingAboutClientType,
  isAskingAboutTimeline,
  isAskingWhatIfNotSold,
  isAskingAboutMarketing,
  isAskingAboutExclusivity,
  isAskingAboutContractTerms,
  isAskingAboutPaymentTiming,
  isAskingAboutNextStep,
  isAskingAboutValuation,
  isAskingAboutDocuments,
  isAskingAboutDiscount,
  isAskingAboutOfficeVisit,
  isAskingAboutWorkingHours,
  isAskingHowClientsVerified,
  isAskingWhoHandlesProperty,
  CLIENT_TYPE_RESPONSES_SALE,
  CLIENT_TYPE_RESPONSES_RENT,
  TIMELINE_RESPONSES_SALE,
  TIMELINE_RESPONSES_RENT,
  WHAT_IF_NOT_SOLD_RESPONSES_SALE,
  WHAT_IF_NOT_SOLD_RESPONSES_RENT,
  MARKETING_RESPONSES_SALE,
  MARKETING_RESPONSES_RENT,
  EXCLUSIVITY_RESPONSES_SALE,
  EXCLUSIVITY_RESPONSES_RENT,
  CONTRACT_TERMS_RESPONSES_SALE,
  CONTRACT_TERMS_RESPONSES_RENT,
  PAYMENT_TIMING_RESPONSES_SALE,
  PAYMENT_TIMING_RESPONSES_RENT,
  NEXT_STEP_RESPONSES_SALE,
  NEXT_STEP_RESPONSES_RENT,
  VALUATION_RESPONSES_SALE,
  VALUATION_RESPONSES_RENT,
  DOCUMENTS_RESPONSES_SALE,
  DOCUMENTS_RESPONSES_RENT,
  DISCOUNT_RESPONSES_SALE,
  DISCOUNT_RESPONSES_RENT,
  OFFICE_VISIT_RESPONSES_SALE,
  OFFICE_VISIT_RESPONSES_RENT,
  WORKING_HOURS_RESPONSES_SALE,
  WORKING_HOURS_RESPONSES_RENT,
  CLIENT_VERIFICATION_RESPONSES_SALE,
  CLIENT_VERIFICATION_RESPONSES_RENT,
  WHO_HANDLES_RESPONSES_SALE,
  WHO_HANDLES_RESPONSES_RENT,
  isStandardTermsAck,
  getRandomStandardTermsResponse,
  STANDARD_TERMS_RESPONSES_SALE,
  STANDARD_TERMS_RESPONSES_RENT
} from './objections.js';

const harness = createHarness();
const assert = harness.assert;

function createSession(transactionType = 'sale') {
  return {
    adMemory: { transactionType, propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: { cooperationAccepted: false, transactionType, propertyType: 'apartment' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970000005'
  };
}

// ============================================================
// PART A: matcher gates — positives AND negative guards
// ============================================================
console.log('\n=== A: matcher gates ===');

// --- client_type ---
for (const q of [
  'KAKOV TIP NA KLIENTI NUDITE ?',
  'каков тип на клиенти нудите?',
  'kakov profil na klienti imate?',
  'каков профил на клиенти имате?',
  'KAKOV KLIENT NUDITE?'
]) {
  assert(`client_type admits "${q}"`, isAskingAboutClientType(q) === true);
}
assert('client_type rejects quality question (kakvi se klientite)', isAskingAboutClientType('kakvi se klientite?') === false);
assert('client_type rejects bare "klienti" mention', isAskingAboutClientType('imame klienti za vas') === false);
assert('client_type rejects "kakov klient vi treba"', isAskingAboutClientType('kakov klient vi treba?') === false);

// --- timeline ---
for (const q of [
  'KOLKU VREME KE TRAE PRODAZBATA ?',
  'колку време ќе трае продажбата?',
  'kolku brzo ke se prodade?',
  'KOGA KE SE PRODADE MOJOT STAN ?',
  'кога ќе се издаде станот?',
  'DALI KE SE PRODADE BRZO ?',
  'kolku dolgo ke trae izdavanjeto?'
]) {
  assert(`timeline admits "${q}"`, isAskingAboutTimeline(q) === true);
}
assert('timeline rejects "kolku vreme rabotite" (agency tenure)', isAskingAboutTimeline('kolku vreme rabotite?') === false);
assert('timeline rejects age question', isAskingAboutTimeline('kolku godini imas ana?') === false);
assert('timeline rejects factual gone-statement', isAskingAboutTimeline('veke prodaden e') === false);

// --- what_if_not_sold ---
for (const q of [
  'STO AKO NE SE PRODADE ?',
  'што ако не се продаде?',
  'ako ne se izdade?',
  'АКО НЕ НАЈДЕТЕ КЛИЕНТ ?',
  'sto ako ne najdete zakupac?',
  'DALI KE OSTANE NEPRODADEN ?'
]) {
  assert(`what_if_not_sold admits "${q}"`, isAskingWhatIfNotSold(q) === true);
}
assert('what_if_not_sold rejects "ne se prodava" (still available)', isAskingWhatIfNotSold('uste se prodava') === false);
assert('what_if_not_sold rejects factual "veke prodaden"', isAskingWhatIfNotSold('veke prodaden e') === false);
assert('what_if_not_sold rejects "ne e prodaden" (not sold yet)', isAskingWhatIfNotSold('ne e prodaden uste') === false);

// --- marketing ---
for (const q of [
  'KADE KE GO OBJAVITE ?',
  'каде ќе го објавите?',
  'koi portali koristite?',
  'како ќе го промовирате имотот?',
  'IMATE LI SAJT ?',
  'kade ke bide objaven stanot?'
]) {
  assert(`marketing admits "${q}"`, isAskingAboutMarketing(q) === true);
}
assert('marketing rejects photo-sending question', isAskingAboutMarketing('kade da vi pratam sliki?') === false);

// --- exclusivity ---
for (const q of [
  'DALI MOZE I SAM DA GO PRODAVAM ?',
  'дали можам и сам да го издавам?',
  'dali e ekskluzivno?',
  'ексклузивна ли е соработката?',
  'samo kaj vas e imotot?',
  'DALI IMAM PRAVO SAM DA GO PRODAVAM ?'
]) {
  assert(`exclusivity admits "${q}"`, isAskingAboutExclusivity(q) === true);
}
assert('exclusivity rejects refusal "ke go prodadam sam"', isAskingAboutExclusivity('ke go prodadam sam') === false);

// --- contract_terms ---
for (const q of [
  'KAKOV DOGOVOR KE POTPISEME ?',
  'каков договор ќе потпишеме?',
  'kolku e dolg dogovorot?',
  'dali ima dogovor?',
  'дали може да се раскине договорот?'
]) {
  assert(`contract_terms admits "${q}"`, isAskingAboutContractTerms(q) === true);
}
assert('contract_terms rejects "kakva sorabotka"', isAskingAboutContractTerms('kakva sorabotka e toa?') === false);

// --- payment_timing ---
for (const q of [
  'KAKO KE MI ISPLATITE ?',
  'како ќе ми ги исплатите парите?',
  'koga ke gi dobijam parite?',
  'кога ќе ми ја исплатите цената?'
]) {
  assert(`payment_timing admits "${q}"`, isAskingAboutPaymentTiming(q) === true);
}
assert('payment_timing rejects owner-must-pay (they pay us)', isAskingAboutPaymentTiming('ke vi platam li nesto?') === false);
assert('payment_timing rejects rent-timing (when do I pay)', isAskingAboutPaymentTiming('koga treba da vi platam provizija?') === false);

// --- next_step ---
for (const q of [
  'STO E SLEDNIOT CEKOR ?',
  'што е следниот чекор?',
  'koga ke pocneme?',
  'кога ќе почнеме?',
  'kako ke odi ponatamu?',
  'sto ponatamu?'
]) {
  assert(`next_step admits "${q}"`, isAskingAboutNextStep(q) === true);
}
assert('next_step rejects how-it-works', isAskingAboutNextStep('kako ke mi pomognete vo prodazbata?') === false);

// --- valuation ---
for (const q of [
  'KOLKU VREDI MOJOT STAN ?',
  'колку вреди мојот стан?',
  'kolku mozam da dobijam za imotot?',
  'дали може проценка?',
  'kolku bi se prodal mojot stan?'
]) {
  assert(`valuation admits "${q}"`, isAskingAboutValuation(q) === true);
}
assert('valuation rejects percentage question', isAskingAboutValuation('kolku procenti zimate?') === false);
assert('valuation rejects age question', isAskingAboutValuation('kolku godini imas?') === false);

// --- documents ---
for (const q of [
  'KOI DOKUMENTI MI TREBAAT ?',
  'кои документи ми требаат?',
  'kakvi hartii treba?',
  'дали ми требаат документи?'
]) {
  assert(`documents admits "${q}"`, isAskingAboutDocuments(q) === true);
}
assert('documents rejects "ne mi treba" refusal', isAskingAboutDocuments('ne mi treba agencija') === false);

// --- discount ---
for (const q of [
  'MOZE LI POMALA PROVIZIJA ?',
  'може ли помала провизија?',
  'dali moze popust?',
  'дали може да се договори провизијата?',
  'kolku e minimalnata provizija?'
]) {
  assert(`discount admits "${q}"`, isAskingAboutDiscount(q) === true);
}
assert('discount rejects plain commission question', isAskingAboutDiscount('kako funkcionira provizijata?') === false);

// --- office_visit ---
for (const q of [
  'DALI TREBA DA DOJDAM KAJ VAS ?',
  'дали треба да дојдам кај вас?',
  'dali mora da odam vo kancelarija?',
  'каде треба да дојдам?'
]) {
  assert(`office_visit admits "${q}"`, isAskingAboutOfficeVisit(q) === true);
}
assert('office_visit rejects viewing question', isAskingAboutOfficeVisit('kade treba da dojdam na poseta?') === false);

// --- working_hours ---
for (const q of [
  'KOE E RABOTNOTO VREME ?',
  'кое е работното време?',
  'do kolku rabotite?',
  'кога работите?',
  'dali rabotite vikend?'
]) {
  assert(`working_hours admits "${q}"`, isAskingAboutWorkingHours(q) === true);
}
assert('working_hours rejects tenure question', isAskingAboutWorkingHours('kolku vreme rabotite?') === false);

// --- how_verified ---
for (const q of [
  'KAKO GI PROVERUVATE KLIENTITE ?',
  'како ги проверувате клиентите?',
  'kako proveruvate dali klientot e ozbilen?',
  'како знаете дали клиентот е озбилен?'
]) {
  assert(`how_verified admits "${q}"`, isAskingHowClientsVerified(q) === true);
}
assert('how_verified rejects quality statement', isAskingHowClientsVerified('dali klientite vi se provereni?') === false);

// --- who_handles ---
for (const q of [
  'KOJ KE RABOTI SO MOJOT IMOT ?',
  'кој ќе работи со мојот имот?',
  'koj ke go vodi mojot slucaj?',
  'кој агент ќе работи?'
]) {
  assert(`who_handles admits "${q}"`, isAskingWhoHandlesProperty(q) === true);
}
assert('who_handles rejects who-pays (commission)', isAskingWhoHandlesProperty('koj ke go plakja notarot?') === false);

// --- standard_terms_ack ---
for (const q of [
  'standard',
  'STANDARD',
  'standardna procedura',
  'стандардна процедура',
  'standardno e',
  'ok standard',
  'toa e standard',
  'sve e standardno',
  'стандард',
  'standard, ok'
]) {
  assert(`standard_terms admits "${q}"`, isStandardTermsAck(q) === true);
}
assert('standard_terms rejects question form (dali e standardna?)', isStandardTermsAck('dali e standardna procedura?') === false);
assert('standard_terms rejects how-question', isStandardTermsAck('kako funkcionira standardno?') === false);
assert('standard_terms rejects negation', isStandardTermsAck('ne e standard') === false);
assert('standard_terms rejects Cyrillic negation', isStandardTermsAck('не е стандардна процедура') === false);
assert('standard_terms rejects unrelated short message', isStandardTermsAck('ne znam') === false);

// ============================================================
// PART B: response libraries — >=3 distinct variants, sale+rent,
// and rent variants never leak sale-only claims
// ============================================================
console.log('\n=== B: response libraries ===');

const families = [
  ['CLIENT_TYPE', CLIENT_TYPE_RESPONSES_SALE, CLIENT_TYPE_RESPONSES_RENT],
  ['TIMELINE', TIMELINE_RESPONSES_SALE, TIMELINE_RESPONSES_RENT],
  ['WHAT_IF_NOT_SOLD', WHAT_IF_NOT_SOLD_RESPONSES_SALE, WHAT_IF_NOT_SOLD_RESPONSES_RENT],
  ['MARKETING', MARKETING_RESPONSES_SALE, MARKETING_RESPONSES_RENT],
  ['EXCLUSIVITY', EXCLUSIVITY_RESPONSES_SALE, EXCLUSIVITY_RESPONSES_RENT],
  ['CONTRACT_TERMS', CONTRACT_TERMS_RESPONSES_SALE, CONTRACT_TERMS_RESPONSES_RENT],
  ['PAYMENT_TIMING', PAYMENT_TIMING_RESPONSES_SALE, PAYMENT_TIMING_RESPONSES_RENT],
  ['NEXT_STEP', NEXT_STEP_RESPONSES_SALE, NEXT_STEP_RESPONSES_RENT],
  ['VALUATION', VALUATION_RESPONSES_SALE, VALUATION_RESPONSES_RENT],
  ['DOCUMENTS', DOCUMENTS_RESPONSES_SALE, DOCUMENTS_RESPONSES_RENT],
  ['DISCOUNT', DISCOUNT_RESPONSES_SALE, DISCOUNT_RESPONSES_RENT],
  ['OFFICE_VISIT', OFFICE_VISIT_RESPONSES_SALE, OFFICE_VISIT_RESPONSES_RENT],
  ['WORKING_HOURS', WORKING_HOURS_RESPONSES_SALE, WORKING_HOURS_RESPONSES_RENT],
  ['CLIENT_VERIFICATION', CLIENT_VERIFICATION_RESPONSES_SALE, CLIENT_VERIFICATION_RESPONSES_RENT],
  ['WHO_HANDLES', WHO_HANDLES_RESPONSES_SALE, WHO_HANDLES_RESPONSES_RENT],
  ['STANDARD_TERMS', STANDARD_TERMS_RESPONSES_SALE, STANDARD_TERMS_RESPONSES_RENT]
];

const FORBIDDEN_RENT_CLAIMS = /без провизија|без никакви давачки|без никакви обврски|не зема ништо|ние додаваме над неа|разликата меѓу вашата чиста цена|купопродажна цена|купувачот ја плаќа конечната цена/i;

for (const [name, sale, rent] of families) {
  assert(`${name} sale has >= 3 distinct variants`, new Set(sale).size >= 3);
  assert(`${name} rent has >= 3 distinct variants`, new Set(rent).size >= 3);
  let leak = '';
  for (const t of rent) {
    if (FORBIDDEN_RENT_CLAIMS.test(t)) { leak = t; break; }
  }
  assert(`${name} rent never leaks sale-only claims (leak: "${leak.slice(0, 60)}")`, leak === '');
}

// ============================================================
// PART C: E2E — every new category answers hardcoded, no LLM,
// no property-gone close, no generic persuasion ladder
// ============================================================
console.log('\n=== C: e2e generateResponse ===');

async function e2e(q, transactionType, mustMatch, mustNotMatch = []) {
  const res = await generateResponse(createSession(transactionType), q);
  const bad = mustNotMatch.filter(re => re.test(res.text));
  return { res, bad };
}

// THE reported question — client types (sale + rent)
for (const [tt, pattern] of [['sale', /проверени купувачи|купувачи/], ['rent', /проверени закупци|закупци/]]) {
  const { res, bad } = await e2e('KAKOV TIP NA KLIENTI NUDITE ?', tt, pattern);
  assert(`e2e ${tt} "KAKOV TIP NA KLIENTI NUDITE ?" → NORMAL + client profiles`, res.type === 'NORMAL' && pattern.test(res.text), `got [${res.type}] "${(res.text || '').substring(0, 100)}"`);
  assert(`e2e ${tt} "KAKOV TIP..." → not the persuasion ladder`, bad.length === 0, bad.join('; '));
}

// THE reported ack — owner says "standard" after the terms explanation
// (rent: the exact reported lead; sale: same ack). Must get the rotating
// standard-terms confirmation (never the LLM client pitch).
for (const [tt, pattern] of [['sale', /стандардна процедура|стандардната процедура|стандард/i], ['rent', /стандардна процедура|стандардната процедура|стандард/i]]) {
  for (const ack of ['standard', 'standardna procedura', 'стандардна процедура']) {
    const { res, bad } = await e2e(ack, tt, pattern);
    assert(`e2e ${tt} "${ack}" → NORMAL + standard-terms confirmation`, res.type === 'NORMAL' && pattern.test(res.text), `got [${res.type}] "${(res.text || '').substring(0, 100)}"`);
    assert(`e2e ${tt} "${ack}" → from the standard-terms rotation`, STANDARD_TERMS_RESPONSES_SALE.concat(STANDARD_TERMS_RESPONSES_RENT).includes(res.text), `got "${(res.text || '').substring(0, 100)}"`);
    assert(`e2e ${tt} "${ack}" → not the generic LLM client pitch`, bad.length === 0, bad.join('; '));
  }
}
// controls: a question and a negation about the terms must NOT be crowned
// as the ack (they keep their own paths — question → commission gate,
// negation → rejection ladder).
for (const notAck of ['dali e standardna procedura?', 'ne e standard', 'не е стандардна процедура']) {
  const res = await generateResponse(createSession('rent'), notAck);
  assert(`e2e rent "${notAck}" → NOT the standard-terms rotation`, !STANDARD_TERMS_RESPONSES_SALE.concat(STANDARD_TERMS_RESPONSES_RENT).includes(res.text), `got "${(res.text || '').substring(0, 100)}"`);
}
// rotation sanity: the reported ack varies across fresh sessions
const stdDistinct = new Set();
for (let i = 0; i < 20; i++) {
  const r = await generateResponse(createSession('rent'), 'standard');
  stdDistinct.add(r.text);
}
assert(`e2e standard-terms varies across sessions (${stdDistinct.size} distinct)`, stdDistinct.size >= 2);

// property-gone close bug: hypothetical questions must NOT close the lead
for (const q of ['STO AKO NE SE PRODADE ?', 'KOGA KE SE PRODADE MOJOT STAN ?']) {
  const { res } = await e2e(q, 'sale', /обврски|продажба|неколку недели|месеци/i);
  assert(`e2e sale "${q}" → NORMAL (never CLOSED)`, res.type === 'NORMAL', `got [${res.type}] "${(res.text || '').substring(0, 100)}"`);
}
const rentGone = await e2e('STO AKO NE SE IZDADE ?', 'rent', /закупец|неиздаден|давачки/);
assert(`e2e rent "STO AKO NE SE IZDADE ?" → NORMAL + rent rule`, rentGone.res.type === 'NORMAL' && /закупец|неиздаден|давачки/.test(rentGone.res.text), `got [${rentGone.res.type}] "${(rentGone.res.text || '').substring(0, 100)}"`);

// factual gone-statement still closes (behavior preserved)
const stillGone = await generateResponse(createSession('sale'), 'VEKE PRODADEN E');
assert(`e2e "VEKE PRODADEN E" still CLOSED (preserved)`, stillGone.type === 'CLOSED', `got [${stillGone.type}]`);

// one e2e per remaining family (sale)
const saleChecks = [
  ['KADE KE GO OBJAVITE ?', /портали|објавуваме/i],
  ['DALI MOZE I SAM DA GO PRODAVAM ?', /ексклузивн|сами да го продавате|сами да го издавате/i],
  ['KAKOV DOGOVOR KE POTPISEME ?', /договор/i],
  ['KAKO KE MI ISPLATITE ?', /добивате|исплаќа|плаќа/i],
  ['STO E SLEDNIOT CEKOR ?', /следниот чекор|Прво|Следно/i],
  ['KOLKU VREDI MOJOT STAN ?', /проценк/i],
  ['KOI DOKUMENTI MI TREBAAT ?', /имот(?:ен|ниот) лист/i],
  ['MOZE LI POMALA PROVIZIJA ?', /разликат|вашата цена|барана цена/i],
  ['DALI TREBA DA DOJDAM KAJ VAS ?', /канцелариј|Viber/i],
  ['KOE E RABOTNOTO VREME ?', /9 до 17|недела/i],
  ['KAKO GI PROVERUVATE KLIENTITE ?', /проверк|проверува/i],
  ['KOJ KE RABOTI SO MOJOT IMOT ?', /агент/i],
  ['KOLKU VREME KE TRAE PRODAZBATA ?', /неколку недели|месеци/i]
];
for (const [q, pattern] of saleChecks) {
  const { res, bad } = await e2e(q, 'sale', pattern);
  assert(`e2e sale "${q}" → NORMAL + hardcoded answer`, res.type === 'NORMAL' && pattern.test(res.text), `got [${res.type}] "${(res.text || '').substring(0, 100)}"`);
  assert(`e2e sale "${q}" → not generic ladder`, bad.length === 0, bad.join('; '));
}

// rent discount must restate the standard rule, never promise a discount
const rentDiscount = await e2e('MOZE LI POMALA PROVIZIJA ?', 'rent', /50% од една месечна кирија/);
assert(`e2e rent discount → standard 50% rule (no discount promised)`, rentDiscount.res.type === 'NORMAL' && /50% од една месечна кирија/.test(rentDiscount.res.text), `got "${(rentDiscount.res.text || '').substring(0, 100)}"`);
assert(`e2e rent discount → never sale "разлика" line`, !/разликат|чиста цена/.test(rentDiscount.res.text), `got "${(rentDiscount.res.text || '').substring(0, 100)}"`);

// rotation sanity: the reported question varies across fresh sessions
const distinct = new Set();
for (let i = 0; i < 20; i++) {
  const r = await generateResponse(createSession('sale'), 'KAKOV TIP NA KLIENTI NUDITE ?');
  distinct.add(r.text);
}
assert(`e2e client-type varies across sessions (${distinct.size} distinct)`, distinct.size >= 2);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 OBJECTION-EXPANSION TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 OBJECTION-EXPANSION TESTS PASSED');
}
