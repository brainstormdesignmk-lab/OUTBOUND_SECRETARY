import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Commission-Explanation + Agency-Workflow hardcoded responses
// ========================================
// Two user-approved answer families:
//
//   1. COMMISSION EXPLANATION — when the owner asks how the no-commission
//      model works ("kako zarabotuvate bez provizija?", "kako funkcionira
//      bez provizija?", "od sto zarabotuvate?"), Ana answers with the
//      commission-difference explanation (V1 = the exact production answer
//      the user wants hardcoded): "Разликата меѓу вашата чиста цена и
//      постигнатата купопродажна цена е провизија за агенцијата."
//
//   2. AGENCY WORKFLOW — when the owner asks how the agency manages his
//      property ("kako ke mi pomognete vo prodazbata?", "kako ke go
//      prodadete?"), Ana answers with the workflow text + the small change
//      the user requested ("без провизија за вас") in rotating variants.
//
// Runs fully offline — both are handled by hardcoded handlers BEFORE any
// LLM call, so no GROQ_API_KEY needed.
// ========================================
import { generateResponse } from './service.js';
import {
  isAskingHowCommissionWorks,
  COMMISSION_NO_PROVISION_RESPONSES_SALE,
  COMMISSION_NO_PROVISION_RESPONSES_RENT,
  AGENCY_WORKFLOW_RESPONSES_SALE,
  AGENCY_WORKFLOW_RESPONSES_RENT,
  OWNER_PAYS_RESPONSES_SALE,
  isAskingAboutNoAgencyExperience,
  NO_AGENCY_EXPERIENCE_RESPONSES_SALE,
  NO_AGENCY_EXPERIENCE_RESPONSES_RENT,
  matchObjection
} from './objections.js';
import { getFollowUpMessage } from './deal-terms.js';

const harness = createHarness();
const assert = harness.assert;



function createSession(transactionType = 'sale') {
  return {
    adMemory: { transactionType, propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: { cooperationAccepted: false, transactionType, propertyType: 'apartment' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970000004'
  };
}

console.log('=== TEST: isAskingHowCommissionWorks regex (offline) ===');

// Questions that MUST match (production messages + common variants)
const shouldMatchCommission = [
  'kako zarabotuvate bez provizija ?',        // production log message
  'OD STO ZARABOTUVATE AKO NE ZEMATE PROVIZIJA ?',
  'kako funkcionira bez provizija',
  // colloquial "odi" phrasing from the live TUI (plot lead 75889):
  // "kako odi toa bez provizija?" (how does THAT go without commission?)
  'kako odi toa bez provizija',
  'kako odi toa bez provizija?',
  'kako ke odi toa bez provizija?',
  'како ќе оди тоа без провизија?',
  'како оди тоа без провизија',
  'како оди тоа без провизија?',
  'како функционира без провизија',
  'како заработувате без провизија?',
  'od sto zarabotuvate?',
  'kako se naplakjate?',
  'како се наплаќате?',
  // "rabotite besplatno?" family — the production bug: owner asks "do you
  // work for free?" and previously got the generic "imame golem broj
  // klienti" persuasion pitch instead of the commission explanation.
  'vie rabotite besplatno?',
  'dali rabotite besplatno?',
  'rabotite li besplatno?',
  'vie rabotite za darmo?',
  'rabotite gratis?',
  'дали работите бесплатно?',
  'вие работите бесплатно?',
  'rabotite li besplatno',
  'dali vashata agencija raboti besplatno?',
  // "dzabe/џабе" family — "for free" in colloquial Macedonian
  'rabotite li za dzabe?',
  'vie rabotite za dzabe?',
  'za dzabe rabotite?',
  'rabotite dzabe?',
  'дали работите за џабе?',
  'вие работите за џабе?',
  'за џабе работите?'
];
console.log(`\n  Commission matching (${shouldMatchCommission.length}):`);
for (const q of shouldMatchCommission) {
  const r = isAskingHowCommissionWorks(q.toLowerCase());
  assert(`match: "${q}"`, r === true);
}

// Questions that MUST NOT match the commission handler
// (they belong to the workflow handler or are legit business questions)
const shouldNotMatchCommission = [
  'kako ke mi pomognete vo prodazbata?',     // workflow, NOT commission
  'kako ke go prodadete mojot stan?',         // workflow
  'kako rabotite voopsto?',                   // generic how-you-work (no provizija)
  'kako odi toa?',                            // "how does that go?" — NO provizija → NOT commission
  'како оди тоа?',                            // Cyrillic: no provizija → NOT commission
  'kako odi prodazbata?',                     // "how does the sale go?" — no provizija → NOT commission
  'kako odi stanot?',                         // "how is the apartment doing?" — no provizija → NOT commission
  'kako e provizijata za izdavanje?',         // covered by other commission handlers
  'kolku e provizijata?',
  'nie rabotime za dzabe',                    // "we work for free" (about ourselves) — not the owner asking
  'ke vi prodadam nesto',                     // "will I sell you something?" — different verb
  'koga treba da vi platam?'                  // rent-timing, NOT "must I pay" — stays with the timing handler
];
console.log(`\n  Commission non-matching (${shouldNotMatchCommission.length}):`);
for (const q of shouldNotMatchCommission) {
  const r = isAskingHowCommissionWorks(q.toLowerCase());
  assert(`no-match: "${q}"`, r === false);
}

console.log('\n=== TEST: generateResponse end-to-end (offline, hardcoded handlers) ===');

// SALE — commission explanation
const saleSession = createSession('sale');
for (const q of ['kako zarabotuvate bez provizija ?', 'OD STO ZARABOTUVATE AKO NE ZEMATE PROVIZIJA ?', 'kako odi toa bez provizija?']) {
  const res = await generateResponse(saleSession, q);
  assert(`e2e sale commission "${q}" → NORMAL + approved explanation`, res.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// SALE — "rabotite besplatno?" family: must hit the SAME hardcoded
// commission-difference explanation, NOT the generic LLM persuasion pitch.
const besplatnoSession = createSession('sale');
for (const q of ['vie rabotite besplatno?', 'dali rabotite besplatno?', 'rabotite li besplatno?', 'дали работите бесплатно?', 'rabotite gratis?', 'dali vashata agencija raboti besplatno?']) {
  const res = await generateResponse(besplatnoSession, q);
  assert(`e2e sale "${q}" → NORMAL + commission explanation (NOT persuasion pitch)`, res.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// GUARD: a genuine agency question must STILL get the agency answer
// (not be hijacked by the commission-work check moved above it).
const agencyGuardSession = createSession('sale');
const agencyGuardRes = await generateResponse(agencyGuardSession, 'koja agencija ste?');
assert(`e2e sale agency guard "koja agencija ste?" → NORMAL + agency answer (not commission)`, agencyGuardRes.type === 'NORMAL' && /Metropolis/.test(agencyGuardRes.text), `got [${agencyGuardRes.type}] "${(agencyGuardRes.text || '').substring(0, 80)}"`);

// SALE — "dzabe" family: same commission-difference explanation.
const dzabeSession = createSession('sale');
for (const q of ['rabotite li za dzabe?', 'vie rabotite za dzabe?', 'дали работите за џабе?']) {
  const res = await generateResponse(dzabeSession, q);
  assert(`e2e sale "${q}" → NORMAL + commission explanation`, res.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// SALE — "ke vi platam li nesto?" family: must hit the no-obligations
// answer (owner keeps their clean price), NOT the generic persuasion pitch.
const ownerPaySession = createSession('sale');
for (const q of ['ke vi platam li nesto?', 'dali ke vi platam nesto?', 'ke vi dolzam nesto?', 'dali imam nesto da vi platam?']) {
  const res = await generateResponse(ownerPaySession, q);
  assert(`e2e sale "${q}" → NORMAL + no-obligations answer`, res.type === 'NORMAL' && OWNER_PAYS_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// RENT — "ke vi platam li nesto?" must get the RENT commission rule
// (owner DOES pay 50% on rent), never the sale no-obligations line.
const ownerPayRentSession = createSession('rent');
const ownerPayRentRes = await generateResponse(ownerPayRentSession, 'ke vi platam li nesto?');
assert(`e2e rent "ke vi platam li nesto?" → NORMAL + rent commission rule`, ownerPayRentRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_RENT.includes(ownerPayRentRes.text), `got [${ownerPayRentRes.type}] "${(ownerPayRentRes.text || '').substring(0, 80)}"`);

// SALE — "koj ve plakja vas?" family (who pays you?): the who_pays objection
// must fire — the gate isAskingAboutCommission now includes "koj ve plakja" /
// "кој ве плаќа" (with the direct-object "ve" between koj and plakja),
// previously the gate failed and the LLM gave the generic "imame golem broj
// klienti" pitch instead of the commission-difference answer.
const whoPaysSession = createSession('sale');
for (const q of ['KOJ VE PLAKJA VAS ?', 'koj ve plakja?', 'кој ве плаќа вас?', 'кој ве плаќа?']) {
  const res = await generateResponse(whoPaysSession, q);
  assert(`e2e sale "${q}" → NORMAL + commission-difference answer`, res.type === 'NORMAL' && /Разликата меѓу вашата чиста цена/.test(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// RENT — same question → rent commission rule (the matchObjection who_pays
// rent branch appends "Дали ви е појасно?", so assert on the rule content).
const whoPaysRentSession = createSession('rent');
const whoPaysRentRes = await generateResponse(whoPaysRentSession, 'KOJ VE PLAKJA VAS ?');
assert(`e2e rent "KOJ VE PLAKJA VAS ?" → NORMAL + rent commission rule`, whoPaysRentRes.type === 'NORMAL' && /50% од месечната кирија/.test(whoPaysRentRes.text), `got [${whoPaysRentRes.type}] "${(whoPaysRentRes.text || '').substring(0, 80)}"`);

// ========================================
// NO-AGENCY-EXPERIENCE family: "ne sum sorabotuval so agencii do sega"
// (never worked with an agency before). Must get the user-approved
// reassurance (3 rotating variants per type), NOT the generic LLM empathy
// line AND NOT the generic agency pitch.
// ========================================
console.log('=== TEST: isAskingAboutNoAgencyExperience regex (offline) ===');
const shouldMatchNoExp = [
  'ne znam ne sum sorabotuval so agencii do sega',  // production log message
  'ne sum sorabotuval so agencija',
  'ne sum rabotel so agencija',
  'nemam iskustvo so agencii',
  'prv pat sorabotuvam so agencija',
  'nikogas ne sum rabotel so agencija',
  'не сум соработувал со агенции до сега',
  'немам искуство со агенции',
  'прв пат соработувам со агенција'
];
for (const q of shouldMatchNoExp) {
  const r = isAskingAboutNoAgencyExperience(q.toLowerCase());
  assert(`no-exp match: "${q}"`, r === true);
}
const shouldNotMatchNoExp = [
  'koja agencija ste?',           // genuine agency question → agency pitch
  'kade vi e kancelarijata?',      // agency question
  'kolku godini rabotite?',        // agency tenure question
  'ne veruvam na agencii',         // trust objection → trust handler
  'kako rabotat agenciite?'        // how-it-works → workflow/commission
];
for (const q of shouldNotMatchNoExp) {
  const r = isAskingAboutNoAgencyExperience(q.toLowerCase());
  assert(`no-exp no-match: "${q}"`, r === false);
}

// SALE — no-experience → reassurance (rotating SALE variants)
const noExpSaleSession = createSession('sale');
for (const q of ['ne znam ne sum sorabotuval so agencii do sega', 'nemam iskustvo so agencii', 'не сум соработувал со агенции до сега']) {
  const res = await generateResponse(noExpSaleSession, q);
  assert(`e2e sale no-exp "${q}" → NORMAL + sale reassurance`, res.type === 'NORMAL' && NO_AGENCY_EXPERIENCE_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// RENT — no-experience → reassurance (rotating RENT variants)
const noExpRentSession = createSession('rent');
const noExpRentRes = await generateResponse(noExpRentSession, 'ne sum sorabotuval so agencii do sega');
assert(`e2e rent no-exp → NORMAL + rent reassurance`, noExpRentRes.type === 'NORMAL' && NO_AGENCY_EXPERIENCE_RESPONSES_RENT.includes(noExpRentRes.text), `got [${noExpRentRes.type}] "${(noExpRentRes.text || '').substring(0, 80)}"`);

// GUARD: genuine agency question must STILL get the agency pitch
const noExpAgencyGuard = createSession('sale');
const noExpAgencyGuardRes = await generateResponse(noExpAgencyGuard, 'koja agencija ste?');
assert(`e2e sale agency guard after no-exp handler "koja agencija ste?" → agency answer`, noExpAgencyGuardRes.type === 'NORMAL' && /Metropolis/.test(noExpAgencyGuardRes.text), `got [${noExpAgencyGuardRes.type}] "${(noExpAgencyGuardRes.text || '').substring(0, 80)}"`);

// SALE — agency workflow ("kako ke mi pomognete vo prodazbata?")
const workflowSession = createSession('sale');
for (const q of ['kako ke mi pomognete vo prodazbata?', 'kako ke go prodadete mojot stan?', 'kako funkcionira procesot?']) {
  const res = await generateResponse(workflowSession, q);
  assert(`e2e sale workflow "${q}" → NORMAL + workflow text`, res.type === 'NORMAL' && AGENCY_WORKFLOW_RESPONSES_SALE.includes(res.text), `got [${res.type}] "${(res.text || '').substring(0, 80)}"`);
}

// CRITICAL: "kako funkcionira bez provizija" must hit COMMISSION (not workflow)
const criticalSession = createSession('sale');
const critRes = await generateResponse(criticalSession, 'kako funkcionira bez provizija');
assert(`CRITICAL: "kako funkcionira bez provizija" → COMMISSION explanation (not workflow)`, critRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_SALE.includes(critRes.text), `got [${critRes.type}] "${(critRes.text || '').substring(0, 80)}"`);

// RENT — commission explanation
const rentSession = createSession('rent');
const rentComRes = await generateResponse(rentSession, 'kako zarabotuvate bez provizija ?');
assert(`e2e rent commission → NORMAL + rent explanation`, rentComRes.type === 'NORMAL' && COMMISSION_NO_PROVISION_RESPONSES_RENT.includes(rentComRes.text), `got [${rentComRes.type}] "${(rentComRes.text || '').substring(0, 80)}"`);

// RENT — agency workflow
const rentWorkflowSession = createSession('rent');
const rentWorkflowRes = await generateResponse(rentWorkflowSession, 'kako ke mi pomognete so izdavanjeto?');
assert(`e2e rent workflow → NORMAL + rent workflow text`, rentWorkflowRes.type === 'NORMAL' && AGENCY_WORKFLOW_RESPONSES_RENT.includes(rentWorkflowRes.text), `got [${rentWorkflowRes.type}] "${(rentWorkflowRes.text || '').substring(0, 80)}"`);

// ========================================
// RENT RULES REGRESSION — "без провизија за вас" must NEVER reach rent owners.
// The approved rent rule (lib/commission.js): the OWNER pays 50% of one
// month's rent (100% if rent > €1000), the tenant pays 50%, on signing day.
// Any hardcoded string claiming "без провизија / без давачки / без обврски /
// не зема ништо / без надокнада" is a SALE-only line and is WRONG for rent.
// ========================================
console.log('\n=== TEST: RENT RULES — no "bez provizija za vas" for rent owners ===');

const FORBIDDEN_RENT_CLAIMS = /без провизија|без никакви давачки|без никакви обврски|без надокнада|не зема ништо|работиме без провизија|без провизија од ваша страна|ние додаваме над неа/i;

// 1. Follow-up nudges (deal-terms.js) — transaction-aware
let rentFollowUpClean = true;
let rentFollowUpSeen = '';
for (let i = 0; i < 50; i++) {
  const f = getFollowUpMessage('rent');
  rentFollowUpSeen = f;
  if (FORBIDDEN_RENT_CLAIMS.test(f)) { rentFollowUpClean = false; break; }
}
assert(`rent follow-up never claims 'без провизија' (50 tries): "${rentFollowUpSeen}"`, rentFollowUpClean);
const saleFollowUps = [];
for (let i = 0; i < 30; i++) saleFollowUps.push(getFollowUpMessage('sale'));
assert('sale follow-up still offers the approved "без провизија за вас" variant', saleFollowUps.some(f => /без провизија за вас/.test(f)));

// 2. Availability reply ("uste go imam" on a rent lead)
const rentAvailSession = createSession('rent');
const availRes = await generateResponse(rentAvailSession, 'uste go imam');
assert(`rent availability → NORMAL + no forbidden claims`, availRes.type === 'NORMAL' && !FORBIDDEN_RENT_CLAIMS.test(availRes.text), `got "${(availRes.text || '').substring(0, 100)}"`);

// 3. Phone-origin question on a rent lead
const rentPhoneSession = createSession('rent');
const phoneRes = await generateResponse(rentPhoneSession, 'od kade go dobivte brojot?');
assert(`rent phone-origin → no 'без провизија' claim`, phoneRes.type === 'NORMAL' && !FORBIDDEN_RENT_CLAIMS.test(phoneRes.text), `got "${(phoneRes.text || '').substring(0, 100)}"`);

// 4. Price quote on a rent lead ("baram 500 evra" = monthly rent)
const rentPriceSession = createSession('rent');
const priceRes = await generateResponse(rentPriceSession, 'baram 500 evra');
assert(`rent price-quote → states the 50% rent rule, NOT 'ние додаваме над неа'`, priceRes.type === 'NORMAL' && /50% од една месечна кирија/.test(priceRes.text) && !/ние додаваме над неа/.test(priceRes.text), `got "${(priceRes.text || '').substring(0, 140)}"`);

// 5. Obligations objection on a rent lead ("imam li drugi obvrski kon vas?")
const rentObligSession = createSession('rent');
const obligRes = await generateResponse(rentObligSession, 'imam li drugi obvrski kon vas?');
assert(`rent obligations → states the 50% rent rule first`, obligRes.type === 'NORMAL' && /50% од една месечна кирија/.test(obligRes.text), `got "${(obligRes.text || '').substring(0, 140)}"`);

// 6. Trust objection — hardcoded backstop (matchObjection) must use the rent
// rule, never the sale "без провизија од ваша страна" line.
const trustMatch = matchObjection('ne veruvam na agencii', true);
assert(`rent trust objection → rent rule, no 'без провизија од ваша страна'`, trustMatch && trustMatch.key === 'trust' && /50% од една месечна кирија/.test(trustMatch.response) && !/без провизија од ваша страна/.test(trustMatch.response), `got ${JSON.stringify(trustMatch)}`);

// 7. "how do I get paid" objection — hardcoded backstop must use the rent rule.
const howMatch = matchObjection('kako ja dobivam provizijata?', true);
assert(`rent how_do_i_get → rent rule, no 'Ние додаваме процент' sale line`, howMatch && howMatch.key === 'how_do_i_get' && /50% од една месечна кирија/.test(howMatch.response), `got ${JSON.stringify(howMatch)}`);

// 7b. "od kade se parite?" — must get the rent rule, NEVER the sale answer
// about the buyer ("Купувачот ја плаќа конечната цена...").
const fromWhosePocketMatch = matchObjection('od koj dzeb se parite?', true);
assert(`rent from_whose_pocket → rent rule, no 'Купувачот' sale answer`, fromWhosePocketMatch && fromWhosePocketMatch.key === 'from_whose_pocket' && /50% од една месечна кирија/.test(fromWhosePocketMatch.response) && !/Купувачот/.test(fromWhosePocketMatch.response), `got ${JSON.stringify(fromWhosePocketMatch)}`);

// 7c. E2E: "od kade se parite?" must reach the from_whose_pocket objection —
// NOT the phone-origin handler ("Го добив вашиот број од огласот..."). The
// money-origin phrases must open the commission gate BEFORE the phone handler.
const moneySaleSession = createSession('sale');
for (const q of ['OD KADE SE PARITE ?', 'ZNAM AMA OD KADE SE PARIYE ?', 'od koj dzeb se parite?', 'od kade vi se parite?', 'kade se parite?']) {
  const res = await generateResponse(moneySaleSession, q);
  assert(`e2e sale "${q}" → from_whose_pocket money answer, NOT phone-origin`, res.type === 'NORMAL' && /Купувачот ја плаќа конечната цена/.test(res.text) && !/Го добив вашиот број/.test(res.text), `got "${(res.text || '').substring(0, 100)}"`);
}
const moneyRentSession = createSession('rent');
const moneyRentRes = await generateResponse(moneyRentSession, 'od kade se parite?');
assert(`e2e rent "od kade se parite?" → rent rule, NOT phone-origin`, moneyRentRes.type === 'NORMAL' && /50% од една месечна кирија/.test(moneyRentRes.text) && !/Го добив вашиот број/.test(moneyRentRes.text), `got "${(moneyRentRes.text || '').substring(0, 100)}"`);

// 7d. Guard: a genuine phone-origin question still gets the phone answer.
const phoneOriginSession = createSession('sale');
const phoneOriginRes = await generateResponse(phoneOriginSession, 'od kade go dobivte brojot?');
assert(`e2e sale phone-origin "od kade go dobivte brojot?" → phone answer (not money objection)`, phoneOriginRes.type === 'NORMAL' && /Го добив вашиот број/.test(phoneOriginRes.text), `got "${(phoneOriginRes.text || '').substring(0, 100)}"`);

// 8. Sale sanity — sale availability KEEPS the approved no-commission phrasing
// (rotates "без провизија за вас" / "без никакви давачки" / "без никакви
// обврски" — the exact opposite of the rent rule).
const saleAvailSession = createSession('sale');
const saleAvailRes = await generateResponse(saleAvailSession, 'uste go imam');
assert(`sale availability → keeps no-commission phrasing`, saleAvailRes.type === 'NORMAL' && FORBIDDEN_RENT_CLAIMS.test(saleAvailRes.text), `got "${(saleAvailRes.text || '').substring(0, 100)}"`);

console.log(`\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\n🟥 COMMISSION/WORKFLOW TESTS FAILED');
  process.exit(1);
} else {
  console.log('\n🟢 COMMISSION/WORKFLOW TESTS PASSED');
}
