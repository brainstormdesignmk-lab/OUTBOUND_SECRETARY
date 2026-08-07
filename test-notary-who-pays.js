import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Who-pays-the-NOTARY follow-up (reported, lead 3571074)
// ========================================
// Production log:
//   OWNER: SAKAM DOGOVOR NA NOTAR          (I want a notary contract)
//   OWNER: KOJ GO PLAKJA NEGO ?            (who pays HIM/it? — the notary)
//   ANA:   Ве разбирам, провизијата за издавање се плаќа на денот...  ❌ GENERIC
//
// The follow-up's masculine clitic "go"/"nego" refers back to the notary
// mentioned in the PREVIOUS message of the same quickfire batch. But the
// hardcoded gates all missed it:
//   - isAskingAboutLegalCosts needs "notar" IN THIS MESSAGE (none here)
//   - the who_pays objection needs "koj plakja" ADJACENT — the clitic "GO"
//     between them breaks the pattern (KOJ GO PLAKJA ≠ koj plakja)
//   → the message fell through to the LLM, which answered with the generic
//     rent commission pitch instead of who-pays-the-notary.
//
// Fix: isAskingWhoPaysForLegalCosts — a context-aware gate that matches
// the who-pays question shape with a masculine/plural clitic (go/nego/gi)
// AND resolves the referent from the recent conversation (the batch). The
// legal-costs handler in early-responses.js now fires on it.
// ========================================
import { generateResponse } from './service.js';
import { isAskingWhoPaysForLegalCosts, matchObjection } from './objections.js';

const harness = createHarness();
const assert = harness.assert;

function createSession(transactionType = 'rent') {
  return {
    adMemory: { transactionType, propertyType: 'apartment', propertyLabel: 'станот', sourcePortal: 'test', adUrl: 'https://test.com/ad', photoUrls: [] },
    collectedData: { cooperationAccepted: false, transactionType, propertyType: 'apartment' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis.' }],
    phone: '+38970000004'
  };
}

console.log('\\n=== A: isAskingWhoPaysForLegalCosts — unit gate ===');

// MUST match: who-pays shape + legal-costs referent in context
const shouldMatch = [
  ['KOJ GO PLAKJA NEGO ?', 'SAKAM DOGOVOR NA NOTAR'],        // reported production batch
  ['KOJ GO PLAKJA NEGO ?', 'sakam dogovor na notar'],
  ['koj go plakja?', 'notarot ke se plakja od nas'],
  ['ko gi plakja?', 'dogovor na notar'],
  ['КОЈ ГО ПЛАЌА НЕГО?', 'сакам договор на нотар'],          // Cyrillic
  ['koj plakja nego?', 'sakam dogovor na notar'],            // trailing pronoun form
  ['KOJ GO PLAKJA NEGO ?', 'sakam dogovor na advokat'],      // lawyer referent
  ['KOJ GO PLAKJA NEGO ?', 'danokot e vash'],                // tax referent
  // CYRILLIC TENSE VARIANTS (requested): the "ke"/"treba da" markers
  // must work with the Cyrillic "да" conjunction — the old pattern had
  // only Latin "da" and silently missed "КОЈ ТРЕБА ДА ГО ПЛАЌА?".
  ['КОЈ ЌЕ ГО ПЛАЌА?', 'сакам договор на нотар'],
  ['КОЈ ТРЕБА ДА ГО ПЛАЌА?', 'сакам договор на нотар'],
  ['КОЈ ЌЕ ГО ПЛАЌА НЕГО?', 'сакам договор на нотар'],
  // EXPLICIT LEGAL OBJECT (requested): verb + "za" + notary/lawyer/tax —
  // the referent is IN the message, no context needed.
  ['КОЈ ПЛАЌА ЗА НОТАРОТ?', ''],
  ['КОЈ ЌЕ ПЛАЌА ЗА НОТАРОТ?', ''],
  ['КОЈ ТРЕБА ДА ПЛАЌА ЗА НОТАРОТ?', ''],
  ['КОЈ ПЛАЌА ЗА АДВОКАТОТ?', ''],
  ['КОЈ ПЛАЌА ЗА ДАНОКОТ?', ''],
  ['KOJ PLAKJA ZA NOTAROT?', ''],
  // pronoun follow-up with "za": "кој плаќа за него?" (who pays for
  // him/it) — referent resolved from context
  ['кој плаќа за него?', 'сакам договор на нотар'],
  ['кој ќе плаќа за него?', 'сакам договор на нотар']
];
for (const [u, ctx] of shouldMatch) {
  const r = isAskingWhoPaysForLegalCosts(u, ctx);
  assert(`match: "${u}" ctx:"${ctx.slice(0, 30)}"`, r === true);
}

// MUST NOT match: no legal referent, rent/utility objects, or non-who-pays shapes
const shouldNotMatch = [
  ['KOJ GO PLAKJA NEGO ?', ''],                               // no notary in context
  ['KOJ GO PLAKJA NEGO ?', 'kako rabotite so provizija'],     // commission context, no legal
  ['koj go plakja depozitot?', 'sakam dogovor na notar'],     // deposit = rent economics
  ['koj ja plakja kirijata?', 'sakam dogovor na notar'],      // rent (ja = feminine)
  ['koj ja plakja provizijata?', 'sakam dogovor na notar'],   // commission (ja = feminine)
  ['koj gi plakja smetkite?', 'sakam dogovor na notar'],      // utilities (gi)
  ['koga ke go plakja?', 'sakam dogovor na notar'],           // WHEN, not WHO
  ['kako ke go plakja?', 'sakam dogovor na notar'],           // HOW, not WHO
  // REGRESSION (code review): "него" (him) is a common word — a message
  // that merely CONTAINS "него" without a who-pays construction must never
  // match, even with a notary in context (the old trailing "|него"
  // alternation matched ANY message containing "него").
  ['Сакам него да го издадам', 'sakam dogovor na notar'],
  ['sakam nego da go izdadam', 'sakam dogovor na notar'],
  ['nego ke go izdadam sam', 'sakam dogovor na notar'],
  // Non-legal objects with the new "за" branch: "за стан", "за кирија",
  // "за провизија", "за депозит" are NOT the notary.
  ['кој плаќа за стан?', 'sakam dogovor na notar'],
  ['кој плаќа за кирија?', 'sakam dogovor na notar'],
  ['кој плаќа за провизија?', 'sakam dogovor na notar'],
  ['КОЈ ПЛАЌА ЗА ДЕПОЗИТОТ?', 'сакам договор на нотар'],
  // HOW/WHEN with the explicit object must NOT match either.
  ['како ќе плаќа за нотарот?', ''],
  ['кога ќе плаќа за нотарот?', '']
];
for (const [u, ctx] of shouldNotMatch) {
  const r = isAskingWhoPaysForLegalCosts(u, ctx);
  assert(`no-match: "${u}" ctx:"${ctx.slice(0, 30)}"`, r === false);
}

// The classic "koj plakja" (adjacent, no clitic) must stay with the who_pays
// COMMISSION objection — this gate must NOT hijack it.
assert('adjacent "koj plakja" is NOT the legal-costs follow-up gate',
  isAskingWhoPaysForLegalCosts('koj plakja?', 'sakam dogovor na notar') === false);
assert('adjacent "koj plakja" still matches the commission objection',
  matchObjection('koj plakja?', true)?.key === 'who_pays');

console.log('\\n=== B: end-to-end through generateResponse ===');

// RENT batch (reported): "SAKAM DOGOVOR NA NOTAR" + "KOJ GO PLAKJA NEGO ?"
// The engine appends every owner text to session.messages at receipt, so by
// the time the follow-up is processed the whole batch is visible. Mirror that
// by pre-seeding session.messages before the second generateResponse call.
const rentSession = createSession('rent');
rentSession.messages.push({ role: 'user', text: 'SAKAM DOGOVOR NA NOTAR' });
const rentRes = await generateResponse(rentSession, 'KOJ GO PLAKJA NEGO ?');
assert(`e2e rent batch "KOJ GO PLAKJA NEGO ?" → NORMAL + who-pays-the-notary (half-half)`,
  rentRes.type === 'NORMAL' && /Адвокат|Нотар|адвокат|нотар/.test(rentRes.text) && /половина|по договор/.test(rentRes.text),
  `got [${rentRes.type}] "${(rentRes.text || '').substring(0, 140)}"`);
assert(`e2e rent batch → NOT the generic commission pitch`,
  !/провизијата за издавање се плаќа на денот/.test(rentRes.text),
  `got "${(rentRes.text || '').substring(0, 140)}"`);

// SALE batch: the same follow-up → the BUYER pays (sale legal-costs answer)
const saleSession = createSession('sale');
saleSession.messages.push({ role: 'user', text: 'SAKAM DOGOVOR NA NOTAR' });
const saleRes = await generateResponse(saleSession, 'KOJ GO PLAKJA NEGO ?');
assert(`e2e sale batch "KOJ GO PLAKJA NEGO ?" → NORMAL + buyer pays legal costs`,
  saleRes.type === 'NORMAL' && /Купувач/.test(saleRes.text) && /Адвокат|Нотар|адвокат|нотар/.test(saleRes.text),
  `got [${saleRes.type}] "${(saleRes.text || '').substring(0, 140)}"`);

// The FIRST message alone already answers: "SAKAM DOGOVOR NA NOTAR" contains
// "notar" → the plain legal-costs handler fires even before the follow-up.
const firstMsgRes = await generateResponse(createSession('rent'), 'SAKAM DOGOVOR NA NOTAR');
assert(`"SAKAM DOGOVOR NA NOTAR" alone → NORMAL + legal-costs answer`,
  firstMsgRes.type === 'NORMAL' && /Адвокат|Нотар|адвокат|нотар/.test(firstMsgRes.text),
  `got [${firstMsgRes.type}] "${(firstMsgRes.text || '').substring(0, 140)}"`);

// CYRILLIC explicit-object variant (requested): "КОЈ ПЛАЌА ЗА НОТАРОТ?"
// names the notary directly — must get the legal-costs answer, never the
// generic commission pitch.
const cyrNotarSession = createSession('rent');
const cyrNotarRes = await generateResponse(cyrNotarSession, 'КОЈ ПЛАЌА ЗА НОТАРОТ?');
assert(`e2e rent "КОЈ ПЛАЌА ЗА НОТАРОТ?" → NORMAL + who-pays-the-notary`, 
  cyrNotarRes.type === 'NORMAL' && /Адвокат|Нотар|адвокат|нотар/.test(cyrNotarRes.text) && /половина|по договор/.test(cyrNotarRes.text),
  `got [${cyrNotarRes.type}] "${(cyrNotarRes.text || '').substring(0, 140)}"`);

// CYRILLIC tense variant (requested): "КОЈ ТРЕБА ДА ГО ПЛАЌА?" — the
// referent (notary) is only in the batch context; the Cyrillic "да"
// conjunction used to be missed (Latin-only "da").
const cyrTenseSession = createSession('rent');
cyrTenseSession.messages.push({ role: 'user', text: 'SAKAM DOGOVOR NA NOTAR' });
const cyrTenseRes = await generateResponse(cyrTenseSession, 'КОЈ ТРЕБА ДА ГО ПЛАЌА?');
assert(`e2e rent batch "КОЈ ТРЕБА ДА ГО ПЛАЌА?" → NORMAL + who-pays-the-notary`, 
  cyrTenseRes.type === 'NORMAL' && /Адвокат|Нотар|адвокат|нотар/.test(cyrTenseRes.text),
  `got [${cyrTenseRes.type}] "${(cyrTenseRes.text || '').substring(0, 140)}"`);

// GUARD: a bare "KOJ GO PLAKJA NEGO ?" with NO notary context must NOT be
// forced into the legal-costs answer. With the clitic-tolerant who_pays
// change, it now routes to the COMMISSION objection (the rent rule) — never
// the notary half-half line, never the LLM's generic pitch.
const noCtxSession = createSession('rent');
const noCtxRes = await generateResponse(noCtxSession, 'KOJ GO PLAKJA NEGO ?');
assert(`no-context "KOJ GO PLAKJA NEGO ?" → NOT the legal-costs answer`,
  !/половина|по договор/.test(noCtxRes.text),
  `got "${(noCtxRes.text || '').substring(0, 140)}"`);
assert(`no-context "KOJ GO PLAKJA NEGO ?" → commission rent rule (clitic who_pays)`,
  /50% од (?:една )?месечна(?:та)? кирија/.test(noCtxRes.text),
  `got "${(noCtxRes.text || '').substring(0, 140)}"`);

// GUARD (strengthened): the SAME shape in a notary batch must pick the
// legal-costs answer — the context referent wins over the commission path.
const ctxWinsSession = createSession('rent');
ctxWinsSession.messages.push({ role: 'user', text: 'SAKAM DOGOVOR NA NOTAR' });
const ctxWinsRes = await generateResponse(ctxWinsSession, 'KOJ GO PLAKJA NEGO ?');
assert(`notary-batch "KOJ GO PLAKJA NEGO ?" → legal-costs answer (context wins over commission)`,
  ctxWinsRes.type === 'NORMAL' && /Адвокат|Нотар|адвокат|нотар/.test(ctxWinsRes.text) && /половина|по договор/.test(ctxWinsRes.text),
  `got "${(ctxWinsRes.text || '').substring(0, 140)}"`);

// GUARD: rent-economics follow-up in a notary batch must NOT be hijacked.
// "koj ja plakja kirijata?" (who pays the RENT?) stays on the rent path.
const rentGuardSession = createSession('rent');
rentGuardSession.messages.push({ role: 'user', text: 'SAKAM DOGOVOR NA NOTAR' });
const rentGuardRes = await generateResponse(rentGuardSession, 'koj ja plakja kirijata?');
assert(`"koj ja plakja kirijata?" in notary batch → NOT legal-costs answer`,
  !/половина|по договор/.test(rentGuardRes.text),
  `got "${(rentGuardRes.text || '').substring(0, 140)}"`);

console.log(`\\n==================================================`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) {
  console.log('\\n🟥 NOTARY WHO-PAYS TESTS FAILED');
  process.exit(1);
} else {
  console.log('\\n🟢 NOTARY WHO-PAYS TESTS PASSED');
}
