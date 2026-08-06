import { createHarness } from './test-helpers.js';
// ========================================
// TRACE: Reproduce the exact flow the user reported
// ========================================
// Tests what happens when owner says:
// "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot"
//
// Then tests multi-info flow:
// "da, 80 kvadrati, tret kat, ima lift"
// ========================================

import { classifyIntent, parseConversationContext } from './classifier.js';
import { isAskingAboutCommission, isAskingAboutClients, matchObjection } from './objections.js';
import { runGlobalExtraction, assessConfidence } from './data-collector.js';
import { getNextMissingField } from './workflow.js';

const harness = createHarness();
const assert = harness.assert;



console.log('\n========================================');
console.log('🧪 SCENARIO 1: "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot"');
console.log('========================================\n');

const msg1 = "pa ne e loso, jas ne plakjam nisto, vie go prodavate stanot";
const u1 = msg1.toLowerCase();

// Test 1: Does it match the AVAILABILITY regex?
const availPatterns = ['ne e loso', 'jas ne plakjam', 'vie go prodavate'];
assert('"ne e loso" should NOT match availability (bare ne e removed)',
  !/uste go imam|dostapen e|go imam|nema go|seuste e|dostapen/i.test(u1),
  'bare ne e removed from availability regex');

// Test 2: Does it match the PRICE QUOTE check?
assert('"pa ne e loso..." should NOT match price quote',
  !/\b(baram|сакам|цена|cena)\s*\d{1,3}/i.test(u1),
  'no baram/sakam with number');

// Test 3: Does it match LEGAL COSTS?
const { isAskingAboutLegalCosts } = await import('./objections.js');
assert('"pa ne e loso..." should NOT match legal costs',
  !isAskingAboutLegalCosts(u1),
  'no advokat/notar/danok');

// Test 4: Does it match CLIENT QUESTION (former false positive)?
assert('"pa ne e loso..." should NOT match client question handler',
  !isAskingAboutClients(u1),
  'bare zainteresiran/klient removed from pattern');

// Test 5: Does it match COMMISSION handler (former false positive)?
assert('"pa ne e loso..." should NOT match commission handler',
  !isAskingAboutCommission(u1),
  'bare plakja removed from isAskingAboutCommission');

// Test 6: What does the CLASSIFIER return?
const conv = '';
const classification1 = classifyIntent(msg1, conv);
console.log(`\n  Classifier result: ${classification1.intent} (${classification1.confidence})`);
assert(`Classifier returns ACCEPTED or INTERESTED >0.5`,
  (classification1.intent === 'ACCEPTED' && classification1.confidence > 0.7) ||
  (classification1.intent === 'INTERESTED' && classification1.confidence > 0.5),
  `Got: ${classification1.intent} ${classification1.confidence} - ${classification1.reason}`);

// Test 7: Would GLOBAL EXTRACTION capture anything from this message?
const data1 = {};
const updates1 = runGlobalExtraction(u1, data1);
console.log(`\n  Global extraction updates:`, Object.keys(updates1).length > 0 ? Object.keys(updates1) : '(none)');
// This message is about understanding the model, not property details
assert('No property data extracted from understanding message',
  Object.keys(updates1).length === 0,
  'message has no sqm/price/floor data');

console.log('\n========================================');
console.log('🧪 SCENARIO 2: Multi-info in one message ("da, 80 kvadrati, tret kat, ima lift")');
console.log('========================================\n');

const msg2 = "da, 80 kvadrati, tret kat, ima lift";

// Test 1: What does the CLASSIFIER return?
const classification2 = classifyIntent(msg2, conv);
console.log(`  Classifier: ${classification2.intent} (${classification2.confidence})`);
assert(`"da, 80 kvadrati, tret kat, ima lift" → ACCEPTED`,
  classification2.intent === 'ACCEPTED',
  `Got: ${classification2.intent} (confidence: ${classification2.confidence})`);

// Test 2: Does it match any objection handlers?
assert('"da, 80 kvadrati..." should NOT match commission handler',
  !isAskingAboutCommission(msg2.toLowerCase()),
  'no commission keywords in this message');

// Test 3: Does GLOBAL EXTRACTION capture ALL 3 fields in one call?
const data2 = { cooperationAccepted: true };
const updates2 = runGlobalExtraction(msg2.toLowerCase(), data2);
console.log(`\n  Global extraction captured:`, JSON.stringify(updates2, null, 2));
assert('totalSqm extracted',
  updates2.totalSqm === 80,
  `Got: ${updates2.totalSqm}`);
assert('floor extracted',
  updates2.floor === 3,
  `Got: ${updates2.floor}`);
assert('elevator extracted',
  updates2.elevator === true,
  `Got: ${updates2.elevator}`);

// Apply updates to data2
Object.assign(data2, updates2);

// Test 4: What does getNextMissingField return after extraction?
const nextField = getNextMissingField(data2);
assert('nextField is NOT totalSqm, floor, or elevator (they were extracted)',
  nextField !== 'totalSqm' && nextField !== 'floor' && nextField !== 'elevator',
  `Next field after extraction: ${nextField}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 3: "ne sum zainteresiran" (should be REJECTED, not client question)');
console.log('========================================\n');

const msg3 = "ne sum zainteresiran";
assert('"ne sum zainteresiran" should NOT match client question handler',
  !isAskingAboutClients(msg3),
  'bare zainteresiran removed from isAskingAboutClients');

const classification3 = classifyIntent(msg3, conv);
assert('"ne sum zainteresiran" → REJECTED',
  classification3.intent === 'REJECTED',
  `Got: ${classification3.intent} ${classification3.confidence}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 4: Price extraction edge case ("98 iljadi")');
console.log('========================================\n');

const extractionRules = runGlobalExtraction('98 iljadi evra', { cooperationAccepted: true });
console.log(`  Price extraction:`, JSON.stringify(extractionRules));
assert('"98 iljadi" → cleanPrice should be 98000 (not 9898)',
  extractionRules.cleanPrice === 98000,
  `Got: ${extractionRules.cleanPrice}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 5: "jas baram 156 iljadi za mene" (buying signal)');
console.log('========================================\n');

const msg5 = "jas baram 156 iljadi za mene";
const classification5 = classifyIntent(msg5, conv);
console.log(`  Classifier: ${classification5.intent} (${classification5.confidence})`);
assert('"jas baram 156 iljadi za mene" should be INTERESTED/ACCEPTED (not REJECTED)',
  classification5.intent !== 'REJECTED',
  `Got: ${classification5.intent} ${classification5.confidence} - ${classification5.reason}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 6: "uste ne sum go prodal" (still available answer)');
console.log('========================================\n');

// Owner answers the greeting's availability question with "I haven't sold it yet".
// This is a POSITIVE availability signal — should trigger the HARDCODED
// availability templates ("Драго ми е што станот е сè уште достапен..."),
// NOT a generic LLM response.
const { generateResponse } = await import('./service.js');

const availSession = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: false
  },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
  ],
  phone: '+38970123456'
};

const availRes = await generateResponse(availSession, "uste ne sum go prodal");

console.log(`  Response type: ${availRes.type}`);
console.log(`  Response text: "${availRes.text}"`);

assert('"uste ne sum go prodal" → NORMAL (hardcoded template, not ERROR)',
  availRes.type === 'NORMAL',
  `Got: ${availRes.type} — "${availRes.text}"`);

assert('Response uses one of the hardcoded availability templates',
  /Драго ми е што станот е сè уште достапен/.test(availRes.text || '') &&
  /понудиме на нашите клиенти|продадеме во најкраток|погрижи за професионална продажба/.test(availRes.text || ''),
  `Got: "${availRes.text}"`);

assert('availabilityAcknowledged set to true',
  availSession.availabilityAcknowledged === true,
  'not acknowledged');

// Same message with rent context
const rentSession = {
  adMemory: {
    transactionType: 'rent',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: false
  },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38970123456'
};

// All three rent templates contain one of: издавање / издадеме (the third uses издавање).
// Match either verb form so the random template pick always passes.
const RENT_TEMPLATE_RE = /издава|издадеме/;
const rentRes = await generateResponse(rentSession, "uste ne sum go izdal");
assert('rent: "uste ne sum go izdal" → NORMAL (hardcoded rent template)',
  rentRes.type === 'NORMAL' && RENT_TEMPLATE_RE.test(rentRes.text || ''),
  `Got: ${rentRes.type} — "${rentRes.text}"`);

// iznajmil variant (another correct Macedonian form)
const rentRes2 = await generateResponse(rentSession, "uste ne sum go iznajmil");
assert('rent: "uste ne sum go iznajmil" → NORMAL (hardcoded rent template)',
  rentRes2.type === 'NORMAL' && RENT_TEMPLATE_RE.test(rentRes2.text || ''),
  `Got: ${rentRes2.type} — "${rentRes2.text}"`);

console.log('\n========================================');
console.log('🧪 SCENARIO 7: "imate vekje zainteresirani kupci ?" (client question)');
console.log('========================================\n');

// Owner asks if the agency already has interested buyers.
// The client-question regex previously missed "kupci" (plural) and
// "imate vekje ..." phrasings, so this fell through to the LLM.
// Now it must hit the hardcoded property-type-aware response.

// --- Unit checks on isAskingAboutClients ---
assert('"imate vekje zainteresirani kupci" → client question',
  isAskingAboutClients('imate vekje zainteresirani kupci'),
  'kupci plural + imate vekje must match');

assert('"dali imate kupci" → client question',
  isAskingAboutClients('dali imate kupci'),
  'dali imate kupci must match');

assert('"imame kupci" → client question',
  isAskingAboutClients('imame kupci'),
  'imame kupci must match');

assert('"imate kupci" → client question',
  isAskingAboutClients('imate kupci'),
  'imate kupci must match');

// --- "imate nekoj zainteresiran" family (the user's reported miss) ---
// Owner asks "do you (the agency) have ANYONE interested?" — the old pattern
// required klient/kupci/kupuvac words, so "nekoj zainteresiran" (anyone
// interested) fell through to the LLM and got a wrong generic answer.
assert('"imate nekoj zainteresiran" → client question',
  isAskingAboutClients('imate nekoj zainteresiran'),
  'nekoj zainteresiran must match');

assert('"ve prasuvam dali vie imate nekoj zainteresiran" → client question',
  isAskingAboutClients('ve prasuvam dali vie imate nekoj zainteresiran'),
  'longer question framing must match');

assert('"ima li nekoj zainteresiran" → client question',
  isAskingAboutClients('ima li nekoj zainteresiran'),
  'ima li nekoj zainteresiran must match');

assert('"imate nekoj kupuvac" → client question',
  isAskingAboutClients('imate nekoj kupuvac'),
  'nekoj kupuvac must match');

assert('Cyrillic "имате некој заинтересиран" → client question',
  isAskingAboutClients('имате некој заинтересиран'),
  'Cyrillic nekoj zainteresiran must match');

// --- bare "imate zainteresirani" family (no "nekoj") — the second reported miss ---
// The user's run showed these still falling through to the LLM: "imate
// zainteresirani?", "dali imate zainteresirani?", "imate li zainteresirani?"
// (all = "do you have interested (people)?"). These must hit the SAME
// hardcoded "Постојано имаме заинтересирани клиенти..." response.
assert('"imate zainteresirani" → client question (bare, no nekoj)',
  isAskingAboutClients('imate zainteresirani'),
  'bare imate zainteresirani must match');

assert('"dali imate zainteresirani?" → client question',
  isAskingAboutClients('dali imate zainteresirani?'),
  'dali imate zainteresirani must match');

assert('"imate li zainteresirani?" → client question',
  isAskingAboutClients('imate li zainteresirani?'),
  'imate li zainteresirani must match');

assert('Cyrillic "имате ли заинтересирани?" → client question',
  isAskingAboutClients('имате ли заинтересирани?'),
  'Cyrillic imate li zainteresirani must match');

assert('"zainteresirani zakupci" (rent tenants) → client question',
  isAskingAboutClients('imate zainteresirani zakupci'),
  'rent zakupci must match');

assert('"dali ste zainteresirani?" still NOT a client question (are YOU interested?)',
  !isAskingAboutClients('dali ste zainteresirani'),
  'ste (copula) must not match');

assert('"ne ste zainteresirani" still NOT a client question',
  !isAskingAboutClients('ne ste zainteresirani'),
  'negative copula must not match');

// PHONE-ORIGIN GUARD: bare "najdovte" (found) must NOT match — "kade najdovte
// go oglasot?" (where did you find the ad?) is a phone/ad-origin question,
// NOT a client question. Only "najdovte klient/kupuvac" (found a client/
// buyer) is a real client question. (Bare najdovte used to be in the inline
// copy and would answer "kade najdovte go oglasot?" with the client line.)
assert('"kade najdovte go oglasot?" NOT a client question (phone-origin guard)',
  !isAskingAboutClients('kade najdovte go oglasot'),
  'bare najdovte must not match');

assert('"dali najdovte klient?" still a client question (found a client)',
  isAskingAboutClients('dali najdovte klient'),
  'najdovte klient must match');

assert('"najdovte kupuvac" still a client question (found a buyer)',
  isAskingAboutClients('najdovte kupuvac'),
  'najdovte kupuvac must match');

assert('"ne sum zainteresiran" still NOT a client question',
  !isAskingAboutClients('ne sum zainteresiran'),
  'negative must not match');

assert('"nekoj drug" (someone else) still NOT a client question',
  !isAskingAboutClients('ima li nekoj drug stan'),
  'bare nekoj without zainteresiran/klient/kupuvac must not match');

// --- End-to-end via generateResponse (apartment, sale) ---
const clientSession = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: false
  },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
  ],
  phone: '+38970123456'
};

// --- End-to-end: "imate nekoj zainteresiran" hits the SAME hardcoded response ---
const clientResNekoj = await generateResponse(clientSession, "imate nekoj zainteresiran");
console.log(`  "imate nekoj zainteresiran" → "${clientResNekoj.text}"`);
assert('"imate nekoj zainteresiran" → NORMAL (hardcoded, not ERROR)',
  clientResNekoj.type === 'NORMAL',
  `Got: ${clientResNekoj.type}`);
assert('"imate nekoj zainteresiran" response mentions "Постојано имаме заинтересирани клиенти"',
  /Постојано имаме заинтересирани клиенти/.test(clientResNekoj.text || ''),
  `Got: "${clientResNekoj.text}"`);
assert('"imate nekoj zainteresiran" response ends with cooperation question',
  /Дали да почнеме со соработка\?/.test(clientResNekoj.text || ''),
  `Got: "${clientResNekoj.text}"`);

const clientResNekoj2 = await generateResponse(clientSession, "ve prasuvam dali vie imate nekoj zainteresiran");
assert('"ve prasuvam dali vie imate nekoj zainteresiran" → NORMAL (hardcoded)',
  clientResNekoj2.type === 'NORMAL' && /Постојано имаме заинтересирани клиенти/.test(clientResNekoj2.text || ''),
  `Got: ${clientResNekoj2.type} — "${clientResNekoj2.text}"`);

// --- End-to-end: bare "imate zainteresirani?" variants hit the SAME response ---
for (const bareMsg of ['imate zainteresirani?', 'dali imate zainteresirani?', 'imate li zainteresirani?', 'имате ли заинтересирани?']) {
  const bareRes = await generateResponse(clientSession, bareMsg);
  assert(`e2e "${bareMsg}" → NORMAL (hardcoded, not LLM)`, bareRes.type === 'NORMAL',
    `Got: ${bareRes.type} — "${bareRes.text}"`);
  assert(`e2e "${bareMsg}" mentions "Постојано имаме заинтересирани клиенти"`, /Постојано имаме заинтересирани клиенти/.test(bareRes.text || ''),
    `Got: "${bareRes.text}"`);
}

// --- End-to-end: rent lead, "imate nekoj zainteresiran" → hardcoded (rent-safe wording) ---
const rentClientSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false, transactionType: 'rent' },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38970123456'
};
const rentClientRes = await generateResponse(rentClientSession, "imate nekoj zainteresiran");
console.log(`  rent "imate nekoj zainteresiran" → "${rentClientRes.text}"`);
assert('rent "imate nekoj zainteresiran" → NORMAL (hardcoded)',
  rentClientRes.type === 'NORMAL' && /Постојано имаме заинтересирани клиенти/.test(rentClientRes.text || ''),
  `Got: ${rentClientRes.type} — "${rentClientRes.text}"`);

const clientRes = await generateResponse(clientSession, "imate vekje zainteresirani kupci ?");
console.log(`  Response: "${clientRes.text}"`);

assert('client question → NORMAL (hardcoded, not ERROR)',
  clientRes.type === 'NORMAL',
  `Got: ${clientRes.type}`);

assert('response mentions property type "за таков стан"',
  /за таков стан/.test(clientRes.text || ''),
  `Got: "${clientRes.text}"`);

assert('response ends with cooperation question',
  /Дали да почнеме со соработка\?/.test(clientRes.text || ''),
  `Got: "${clientRes.text}"`);

// --- house variant ---
const houseSession = {
  ...clientSession,
  adMemory: { ...clientSession.adMemory, propertyType: 'house', propertyLabel: 'куќата' }
};
const houseRes = await generateResponse(houseSession, "imate vekje zainteresirani kupci ?");
assert('house: response mentions "за таква куќа"',
  /за таква куќа/.test(houseRes.text || ''),
  `Got: "${houseRes.text}"`);

console.log('\n========================================');
console.log('🧪 SCENARIO 8: "dobro mi zvuci" / "da razgovarame" must NOT trigger cooperation');
console.log('========================================\n');

// The user reported "confirmation too fast":
//   Ana: "Да, имаме голем број клиенти заинтересирани. Како ви звучи ова?"
//   Owner: "dobro mi zvuci" → was ACCEPTED 0.9 (WRONG — rhetorical acknowledgment)
//   Owner: "da razgovarame ana" → was ACCEPTED 0.9 (WRONG — conversation continuation)
// Both must now stay INTERESTED (PERSUASION).

// --- Case A: "dobro mi zvuci" (rhetorical acknowledgment) ---
const resA = classifyIntent('dobro mi zvuci', '');
console.log(`  "dobro mi zvuci" → ${resA.intent} (${resA.confidence}) - ${resA.reason}`);
assert('"dobro mi zvuci" → INTERESTED (not ACCEPTED)',
  resA.intent === 'INTERESTED',
  `Got: ${resA.intent} (${resA.confidence})`);

// --- Case B: "dobro mi zvuci" after rhetorical closer "Како ви звучи ова?" ---
const convRhetorical = 'Ана: Да, имаме голем број клиенти заинтересирани. Како ви звучи ова?';
const resB = classifyIntent('dobro mi zvuci', convRhetorical);
console.log(`  "dobro mi zvuci" (after "Како ви звучи ова?") → ${resB.intent} (${resB.confidence})`);
assert('"dobro mi zvuci" after rhetorical closer → INTERESTED',
  resB.intent === 'INTERESTED',
  `Got: ${resB.intent} (${resB.confidence})`);

// --- Case C: bare "moze" after rhetorical closer "Како ви звучи ова?" ---
const resC = classifyIntent('moze', convRhetorical);
console.log(`  "moze" (after "Како ви звучи ова?") → ${resC.intent} (${resC.confidence})`);
assert('"moze" after rhetorical closer → INTERESTED (acknowledgment, not cooperation)',
  resC.intent === 'INTERESTED',
  `Got: ${resC.intent} (${resC.confidence})`);

// --- Case D: "da razgovarame ana" (conversation continuation) ---
const resD = classifyIntent('da razgovarame ana', '');
console.log(`  "da razgovarame ana" → ${resD.intent} (${resD.confidence}) - ${resD.reason}`);
assert('"da razgovarame ana" → INTERESTED (conversation continuation)',
  resD.intent === 'INTERESTED',
  `Got: ${resD.intent} (${resD.confidence}) - ${resD.reason}`);

// --- Case E: "da razgovarame ana" after Ana asks "Дали сте расположени да разговараме подетално?" ---
const convTalk = 'Ана: Драго ми е што дознав дека имотот сè уште е слободен. Дали сте расположени да разговараме подетално?';
const resE = classifyIntent('da razgovarame ana', convTalk);
console.log(`  "da razgovarame ana" (after "Дали сте расположени да разговараме?") → ${resE.intent} (${resE.confidence})`);
assert('"da razgovarame ana" after talk-question → INTERESTED',
  resE.intent === 'INTERESTED',
  `Got: ${resE.intent} (${resE.confidence})`);

// --- Control: real cooperation question still accepts ---
const convCoopQ = 'Ана: Дали да почнеме со соработка?';
const resCtrl1 = classifyIntent('moze ana', convCoopQ);
console.log(`  "moze ana" (after "Дали да почнеме со соработка?") → ${resCtrl1.intent} (${resCtrl1.confidence})`);
assert('CONTROL: "moze ana" after real cooperation question → ACCEPTED >=0.85',
  resCtrl1.intent === 'ACCEPTED' && resCtrl1.confidence >= 0.85,
  `Got: ${resCtrl1.intent} (${resCtrl1.confidence})`);

const resCtrl2 = classifyIntent('ajde da probame', convRhetorical);
console.log(`  "ajde da probame" (after "Како ви звучи ова?") → ${resCtrl2.intent} (${resCtrl2.confidence})`);
assert('CONTROL: "ajde da probame" → ACCEPTED even after rhetorical closer (strong signal)',
  resCtrl2.intent === 'ACCEPTED',
  `Got: ${resCtrl2.intent} (${resCtrl2.confidence})`);

const resCtrl3 = classifyIntent('sakam sorabotka', convRhetorical);
console.log(`  "sakam sorabotka" (after "Како ви звучи ова?") → ${resCtrl3.intent} (${resCtrl3.confidence})`);
assert('CONTROL: "sakam sorabotka" → ACCEPTED even after rhetorical closer (explicit)',
  resCtrl3.intent === 'ACCEPTED',
  `Got: ${resCtrl3.intent} (${resCtrl3.confidence})`);

// --- Control: zvuci guard must NOT suppress strong acceptance combined in one message ---
const resCtrl4 = classifyIntent('dobro zvuci, ajde da probame', convRhetorical);
console.log(`  "dobro zvuci, ajde da probame" → ${resCtrl4.intent} (${resCtrl4.confidence})`);
assert('CONTROL: "dobro zvuci, ajde da probame" → ACCEPTED (strong signal wins over zvuci guard)',
  resCtrl4.intent === 'ACCEPTED',
  `Got: ${resCtrl4.intent} (${resCtrl4.confidence})`);

console.log('\n========================================');
console.log('🧪 SCENARIO 8b: "da jasno mi e" (clear-understanding) must NOT trigger cooperation');
console.log('========================================\n');

// Reported: after the commission EXAMPLE
//   Ana: "На пример, ако вие барате 120.000 евра, а ние најдеме купувач за
//        122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е
//        наша провизија. Дали ви помогна примерот?"
//   Owner: "da jasno mi e" → was ACCEPTED 0.9 (WRONG) → phase jumped to
//   DATA_COLLECTION ("collecting phase triggered / wrong").
// "jasno mi e" answers the example question (it's clear to me) — it is NOT
// a cooperation commitment. Must stay INTERESTED (PERSUASION).

// --- Case A: the exact reported message, no context (understanding guard) ---
const res8bA = classifyIntent('da jasno mi e', '');
console.log(`  "da jasno mi e" → ${res8bA.intent} (${res8bA.confidence}) - ${res8bA.reason}`);
assert('"da jasno mi e" → INTERESTED (not ACCEPTED)',
  res8bA.intent === 'INTERESTED',
  `Got: ${res8bA.intent} (${res8bA.confidence})`);

// --- Case B: the exact reported Ana message as context (rhetorical closer + guard) ---
const convExample = 'Ана: На пример, ако вие барате 120.000 евра, а ние најдеме купувач за 122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е наша провизија. Дали ви помогна примерот?';
const res8bB = classifyIntent('da jasno mi e', convExample);
console.log(`  "da jasno mi e" (after "Дали ви помогна примерот?") → ${res8bB.intent} (${res8bB.confidence}) - ${res8bB.reason}`);
assert('"da jasno mi e" after the commission-example question → INTERESTED',
  res8bB.intent === 'INTERESTED',
  `Got: ${res8bB.intent} (${res8bB.confidence})`);

// --- Case C: word-order / script variants of the understanding family ---
for (const [phrase, label] of [
  ['jasno mi e', 'bare jasno mi e'],
  ['mi e jasno', 'mi e jasno'],
  ['da, mi e jasno', 'comma + mi e jasno'],
  ['да јасно ми е', 'Cyrillic jasno mi e'],
  ['da jasno', 'short da jasno'],
  ['se e jasno', 'se e jasno (everything clear)'],
  ['razbrav', 'razbrav (I understood)'],
  ['da razbiram', 'da razbiram (yes I understand)']
]) {
  const r = classifyIntent(phrase, '');
  console.log(`  "${phrase}" → ${r.intent} (${r.confidence})`);
  assert(`understanding "${phrase}" (${label}) → INTERESTED`, r.intent === 'INTERESTED', `Got: ${r.intent} (${r.confidence})`);
}

// --- Case D: "da pomogna" (yes it helped) after the example question → INTERESTED ---
// (the D3 rhetorical-closer extension — answering the example question is an
// acknowledgment, not a cooperation commitment)
for (const phrase of ['da pomogna', 'pomogna', 'da, pomogna primerot']) {
  const r = classifyIntent(phrase, convExample);
  console.log(`  "${phrase}" (after example question) → ${r.intent} (${r.confidence})`);
  assert(`"${phrase}" after example question → INTERESTED (D3 closer)`, r.intent === 'INTERESTED', `Got: ${r.intent} (${r.confidence})`);
}

// --- Controls: strong acceptances still win even with understanding language ---
const res8bC1 = classifyIntent('da jasno mi e, ajde da probame', '');
console.log(`  "da jasno mi e, ajde da probame" → ${res8bC1.intent} (${res8bC1.confidence})`);
assert('CONTROL: "da jasno mi e, ajde da probame" → ACCEPTED (strong wins)',
  res8bC1.intent === 'ACCEPTED',
  `Got: ${res8bC1.intent} (${res8bC1.confidence})`);

const res8bC2 = classifyIntent('jasno mi e, ke sorabotuvame', '');
console.log(`  "jasno mi e, ke sorabotuvame" → ${res8bC2.intent} (${res8bC2.confidence})`);
assert('CONTROL: "jasno mi e, ke sorabotuvame" → ACCEPTED (explicit)',
  res8bC2.intent === 'ACCEPTED',
  `Got: ${res8bC2.intent} (${res8bC2.confidence})`);

const res8bC3 = classifyIntent('da', '');
assert('CONTROL: standalone "da" still ACCEPTED',
  res8bC3.intent === 'ACCEPTED',
  `Got: ${res8bC3.intent} (${res8bC3.confidence})`);

// --- Controls: cooperation-VERB commitment escape. "sorabotuvame" (we
// cooperate) is an EXPLICIT commitment — the acknowledgment guards must NOT
// downgrade it after a rhetorical closer or an understanding phrase. Only
// "vekje ... druga agencija" (already cooperating with ANOTHER agency) stays
// an acknowledgment.
const res8bC4 = classifyIntent('sorabotuvame', convExample);
console.log(`  "sorabotuvame" (after example question) → ${res8bC4.intent} (${res8bC4.confidence})`);
assert('CONTROL: "sorabotuvame" after example question → ACCEPTED (commitment verb escapes D3)',
  res8bC4.intent === 'ACCEPTED',
  `Got: ${res8bC4.intent} (${res8bC4.confidence})`);

const res8bC5 = classifyIntent('jasno mi e, sorabotuvame', '');
console.log(`  "jasno mi e, sorabotuvame" → ${res8bC5.intent} (${res8bC5.confidence})`);
assert('CONTROL: "jasno mi e, sorabotuvame" → ACCEPTED (commitment verb escapes understanding guard)',
  res8bC5.intent === 'ACCEPTED',
  `Got: ${res8bC5.intent} (${res8bC5.confidence})`);

const res8bC6 = classifyIntent('vekje sorabotuvam so druga agencija', convExample);
console.log(`  "vekje sorabotuvam so druga agencija" (after example question) → ${res8bC6.intent} (${res8bC6.confidence})`);
assert('CONTROL: "vekje sorabotuvam so druga agencija" → INTERESTED (already cooperating elsewhere, NOT acceptance)',
  res8bC6.intent === 'INTERESTED',
  `Got: ${res8bC6.intent} (${res8bC6.confidence})`);

// --- Case E: PHASE LEVEL — the exact reported symptom. The full detectPhase
// gate must keep the session in PERSUASION (no DATA_COLLECTION jump). ---
const { detectPhase } = await import('./handlers/persuasion-phase.js');
const s8b = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [],
  phone: '+38970123456'
};
const det8b = detectPhase({ u: 'da jasno mi e', conv: convExample, session: s8b, isRent: false });
console.log(`  detectPhase → ${det8b.phase} (${det8b.classification?.intent}/${det8b.classification?.confidence})`);
assert('detectPhase: "da jasno mi e" stays PERSUASION (no wrong DATA_COLLECTION)',
  det8b.phase === 'PERSUASION' && s8b.collectedData.cooperationAccepted !== true,
  `got phase=${det8b.phase}, accepted=${s8b.collectedData.cooperationAccepted}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 9: Phantom terrace + parking sold separately (owner exact message)');
console.log('========================================\n');

// Owner (during DATA_COLLECTION, nextField=cleanPrice):
//   "za mene baram cisti stoosumdeset i tri iljadi evra, za stanot, a parking
//    mestoto seprodava posebno za dodatni sest iljadi"
// = "clean 183k EUR for the apartment, parking sold separately for +6k".
// TWO reported bugs:
//   1. Phantom terrace 10m² — extractTerraceNumber substring-matched "deset"
//      inside "stoosumdeset" AND hasTerraceContext matched bare "da" inside
//      "dodatni" → hasTerrace=true, terraceSqm=10 (from nowhere).
//   2. Parking folded into apartment price — separate-sale detection was gated
//      on parkingType==='garage', never fired for plain "parking mesto".

const ownerMsg9 = "za mene baram cisti stoosumdeset i tri iljadi evra, za stanot, a parking mestoto seprodava posebno za dodatni sest iljadi";

const session9 = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale'
  },
  messages: [
    { role: 'model', text: 'Одлично. Која би била последната чиста цена за станот?' }
  ],
  phone: '+38970123456'
};

const res9 = await generateResponse(session9, ownerMsg9);
console.log(`  Response type: ${res9.type}`);
console.log(`  CollectedData:`, JSON.stringify(session9.collectedData));

// Bug 1: NO phantom terrace
assert('NO phantom terrace — hasTerrace NOT set',
  session9.collectedData.hasTerrace === undefined,
  `Got: ${JSON.stringify(session9.collectedData.hasTerrace)}`);

assert('NO phantom terrace — terraceSqm NOT set',
  session9.collectedData.terraceSqm === undefined,
  `Got: ${JSON.stringify(session9.collectedData.terraceSqm)}`);

// Bug 2: parking captured correctly with separate price
assert('cleanPrice=183000',
  session9.collectedData.cleanPrice === 183000,
  `Got: ${JSON.stringify(session9.collectedData.cleanPrice)}`);

assert('parking=true',
  session9.collectedData.parking === true,
  `Got: ${JSON.stringify(session9.collectedData.parking)}`);

assert('parkingType upgraded to private (sold separately)',
  session9.collectedData.parkingType === 'private',
  `Got: ${JSON.stringify(session9.collectedData.parkingType)}`);

assert('parkingSeparate=true',
  session9.collectedData.parkingSeparate === true,
  `Got: ${JSON.stringify(session9.collectedData.parkingSeparate)}`);

assert('parkingPrice=6000 (za dodatni sest iljadi)',
  session9.collectedData.parkingPrice === 6000,
  `Got: ${JSON.stringify(session9.collectedData.parkingPrice)}`);

// The flow should continue to the next missing field (a QUESTION), not stall
assert('Response is a QUESTION (flow continues)',
  res9.type === 'QUESTION',
  `Got: ${res9.type} — "${res9.text}"`);

console.log('\n========================================');
console.log('🧪 SCENARIO 10: Volunteered "parno" while another field is the current question');
console.log('========================================\n');

// Owner (during DATA_COLLECTION, nextField=elevator):
//   "IMA LIFT,KLIMA , PARNO , NAMESTEN"
// Reported bug: HEATING NOT COLLECTED. The heating follow-up handler was gated
// on nextField==='heating', so bare "parno" (which extractHeating deliberately
// leaves to the follow-up) was silently lost when the owner volunteered it in
// a multi-info message about another field.
//
// Expected behavior:
//   - elevator=true, ac=true, furnished=true extracted immediately
//   - bare "parno" triggers the follow-up question "Какво парно? Градско или сопствено?"
//   - owner answers "gradsko" → heating='district', heatingType='district'
//   - klima does NOT steal heating (parno wins — klima is the AC)

const session10 = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 183000,
    totalSqm: 58,
    hasTerrace: false,
    terraceSqm: 0,
    bedrooms: 4,
    floor: 6,
    totalFloors: 10
  },
  messages: [
    { role: 'model', text: 'Одлично, уште последниве информации и завршуваме. Дали зградата има лифт?' }
  ],
  phone: '+38970123456'
};

const res10 = await generateResponse(session10, "IMA LIFT,KLIMA , PARNO , NAMESTEN");
console.log(`  Response: ${res10.type} — "${res10.text}"`);
console.log(`  CollectedData:`, JSON.stringify(session10.collectedData));

// Multi-info fields extracted in the same turn:
assert('elevator=true extracted',
  session10.collectedData.elevator === true,
  `Got: ${JSON.stringify(session10.collectedData.elevator)}`);

assert('ac=true extracted (klima)',
  session10.collectedData.ac === true,
  `Got: ${JSON.stringify(session10.collectedData.ac)}`);

assert('furnished=true extracted (namesten)',
  session10.collectedData.furnished === true,
  `Got: ${JSON.stringify(session10.collectedData.furnished)}`);

// Bare "parno" must NOT be silently lost — it must trigger the follow-up:
assert('"parno" → heating follow-up question asked',
  res10.type === 'QUESTION' && /Какво парно/.test(res10.text || ''),
  `Got: ${res10.type} — "${res10.text}"`);

assert('heating NOT yet set (follow-up pending)',
  session10.collectedData.heating === undefined,
  `Got: ${JSON.stringify(session10.collectedData.heating)}`);

// klima must NOT steal heating (parno wins):
assert('heating is NOT inverter (klima did not steal it)',
  session10.collectedData.heating !== 'inverter' &&
  session10.collectedData.heating !== 'electric',
  `Got: ${JSON.stringify(session10.collectedData.heating)}`);

// Owner answers the follow-up with "gradsko":
const res10b = await generateResponse(session10, "gradsko");
console.log(`  Follow-up reply → ${JSON.stringify(session10.collectedData.heating)} / ${JSON.stringify(session10.collectedData.heatingType)}`);

assert('"gradsko" → heating=district',
  session10.collectedData.heating === 'district',
  `Got: ${JSON.stringify(session10.collectedData.heating)}`);

assert('"gradsko" → heatingType=district',
  session10.collectedData.heatingType === 'district',
  `Got: ${JSON.stringify(session10.collectedData.heatingType)}`);

assert('heatingFollowUp cleared after answer',
  session10.collectedData.heatingFollowUp === false || session10.collectedData.heatingFollowUp === undefined,
  `Got: ${JSON.stringify(session10.collectedData.heatingFollowUp)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 10b: bare "parno" as bonus info → follow-up preserved, unrelated msg never defaults to unknown');
console.log('========================================\n');

// Reported: the owner volunteered "ima parno" as BONUS info (the current
// question was cleanPrice) and then sent "parking mesto na -1 vo centar".
// Before the fix the follow-up "Какво парно?" got pending, the unrelated
// parking message was consumed as a heating non-answer, and heating was
// wrongly stored as parno_unknown/unknown WITHOUT the owner being asked.
// Expected: "ima parno" → follow-up question; the parking message → RE-ASK
// (heating stays unset); "gradsko" resolves; only an explicit "ne znam"
// defaults to parno_unknown.

const session10b = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 168000,
    furnished: true
  },
  messages: [
    { role: 'model', text: 'Одлично. Која би била последната чиста цена за станот?' }
  ],
  phone: '+38970123456'
};

// 1. Owner volunteers bare "parno" → follow-up question asked, heating NOT stored
const res10b1 = await generateResponse(session10b, "ima parno");
console.log(`  "ima parno" → ${res10b1.type} — "${res10b1.text}"`);
assert('"ima parno" (bonus info) → "Какво парно?" follow-up asked',
  res10b1.type === 'QUESTION' && /Какво парно/.test(res10b1.text || ''),
  `Got: ${res10b1.type} — "${res10b1.text}"`);
assert('heating NOT set while follow-up pending',
  session10b.collectedData.heating === undefined,
  `Got: ${JSON.stringify(session10b.collectedData.heating)}`);

// 2. Unrelated message while the follow-up is pending → RE-ASK, never default
const res10b2 = await generateResponse(session10b, "parking mesto na -1 vo centar");
console.log(`  "parking mesto na -1 vo centar" → ${res10b2.type} — "${res10b2.text}"`);
assert('unrelated msg while follow-up pending → follow-up RE-ASKED',
  res10b2.type === 'QUESTION' && /Какво парно/.test(res10b2.text || ''),
  `Got: ${res10b2.type} — "${res10b2.text}"`);
assert('heating NOT defaulted to parno_unknown',
  session10b.collectedData.heating === undefined && session10b.collectedData.heatingType === undefined,
  `Got: ${JSON.stringify(session10b.collectedData.heating)}/${JSON.stringify(session10b.collectedData.heatingType)}`);

// 3. Owner answers the follow-up → heating stored, flow advances
const res10b3 = await generateResponse(session10b, "gradsko");
console.log(`  "gradsko" → ${res10b3.type} — "${res10b3.text}"`);
assert('"gradsko" → heating=district (follow-up resolved)',
  session10b.collectedData.heating === 'district' && session10b.collectedData.heatingType === 'district',
  `Got: ${JSON.stringify(session10b.collectedData.heating)}/${JSON.stringify(session10b.collectedData.heatingType)}`);
assert('flow advanced to the next field question',
  res10b3.type === 'QUESTION',
  `Got: ${res10b3.type} — "${res10b3.text}"`);

// 4. Explicit non-answer still defaults to parno_unknown (H17 e2e). NOTE: a
// FRESH session — session10b already resolved heating to district in step 3.
const session10c = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 168000,
    furnished: true
  },
  messages: [{ role: 'model', text: 'Одлично. Која би била последната чиста цена за станот?' }],
  phone: '+38970123456'
};
await generateResponse(session10c, "ima parno");
const res10c2 = await generateResponse(session10c, "ne znam");
console.log(`  "ne znam" → heating=${JSON.stringify(session10c.collectedData.heating)}/${JSON.stringify(session10c.collectedData.heatingType)}`);
assert('"ne znam" (explicit non-answer) → parno_unknown',
  session10c.collectedData.heating === 'parno_unknown' && session10c.collectedData.heatingType === 'unknown',
  `Got: ${JSON.stringify(session10c.collectedData.heating)}/${JSON.stringify(session10c.collectedData.heatingType)}`);

// 5. RE-ASK CAP — after 2 unanswered re-asks, the 3rd unrelated message
// defaults to parno_unknown so the conversation can never pin on heating.
const session10d = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 168000, furnished: true },
  messages: [{ role: 'model', text: 'Одлично. Која би била последната чиста цена за станот?' }],
  phone: '+38970123456'
};
await generateResponse(session10d, "ima parno");
const res10d1 = await generateResponse(session10d, "parking mesto na -1 vo centar");
const res10d2 = await generateResponse(session10d, "ima garaza");
console.log(`  unrelated #1 → ${res10d1.type} · unrelated #2 → ${res10d2.type}`);
assert('cap: first two unrelated msgs still re-ask (2/2)',
  res10d1.type === 'QUESTION' && /Какво парно/.test(res10d1.text || '') &&
  res10d2.type === 'QUESTION' && /Какво парно/.test(res10d2.text || ''),
  `Got: ${res10d1.type} "${res10d1.text}" / ${res10d2.type} "${res10d2.text}"`);
const res10d3 = await generateResponse(session10d, "ul. partizanska 12");
console.log(`  unrelated #3 → ${res10d3.type} — heating=${JSON.stringify(session10d.collectedData.heating)}`);
assert('cap: 3rd unrelated msg → parno_unknown (max re-asks reached)',
  session10d.collectedData.heating === 'parno_unknown' && session10d.collectedData.heatingType === 'unknown',
  `Got: ${JSON.stringify(session10d.collectedData.heating)}/${JSON.stringify(session10d.collectedData.heatingType)}`);
assert('cap: follow-up cleared after default',
  session10d.collectedData.heatingFollowUp === false,
  `Got: ${JSON.stringify(session10d.collectedData.heatingFollowUp)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 10c: "imaima terasi 2" — terrace COUNT is not the m² size (reported)');
console.log('========================================\n');

// Reported: Ana asked "Дали има тераса и колку м2 е?" → owner replied
// "imaima terasi 2" (there are 2 terraces). Before the fix the handler
// stored terraceSqm=2 (the NUMBER OF TERRACES as if it were the m² size)
// AND countBedrooms leaked bedrooms=2 through the firstNum fallback (the
// digit fallback only skipped the singular "terasa", not the plural
// "terasi"). Expected: the count is NOT a size → the follow-up for the m²
// is asked; a second count answer resolves as "has terrace, size unknown"
// (like "ne znam") with NO re-ask loop; bedrooms stays unset.

const session10e = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 168000,
    cleanPriceConfidence: 0.95,
    totalSqm: 64,
    totalSqmConfidence: 0.95
  },
  messages: [{ role: 'model', text: 'Одлично. Дали има тераса и колку м2 е?' }],
  phone: '+38970123456'
};

// 1. "imaima terasi 2" → the count is NOT stored as terraceSqm; the m²
// follow-up is asked (terrace exists, size still needed).
const res10e1 = await generateResponse(session10e, "imaima terasi 2");
console.log(`  "imaima terasi 2" → ${res10e1.type} — "${res10e1.text}"`);
assert('count answer → m² follow-up asked, NOT stored as terraceSqm=2',
  res10e1.type === 'QUESTION' && /квадрати/.test(res10e1.text || ''),
  `Got: ${res10e1.type} — "${res10e1.text}"`);
assert('terraceSqm NOT set to the count',
  session10e.collectedData.terraceSqm === undefined && session10e.collectedData.hasTerrace === undefined,
  `Got: sqm=${JSON.stringify(session10e.collectedData.terraceSqm)}, hasTerrace=${JSON.stringify(session10e.collectedData.hasTerrace)}`);
assert('no phantom bedrooms from the terrace count',
  session10e.collectedData.bedrooms === undefined,
  `Got: bedrooms=${JSON.stringify(session10e.collectedData.bedrooms)}`);

// 2. Owner answers the follow-up with the SAME count → resolved as "has
// terrace, size unknown" — no re-ask loop, flow advances to the next field.
const res10e2 = await generateResponse(session10e, "imaima terasi 2");
console.log(`  "imaima terasi 2" (follow-up) → ${res10e2.type} — "${res10e2.text}"`);
assert('count answer to the m² follow-up → hasTerrace=true, size unknown',
  session10e.collectedData.hasTerrace === true && session10e.collectedData.terraceSqm === null,
  `Got: hasTerrace=${JSON.stringify(session10e.collectedData.hasTerrace)}, sqm=${JSON.stringify(session10e.collectedData.terraceSqm)}`);
assert('NO terrace re-ask loop (flow advanced to the next field)',
  res10e2.type === 'QUESTION' && !/тераса|квадрати/i.test(res10e2.text || ''),
  `Got: ${res10e2.type} — "${res10e2.text}"`);

// 3. Parking-level message can never leak bedrooms (phantom regression, e2e).
const res10e3 = await generateResponse(session10e, "parking mesto na -1 vo centar");
console.log(`  "parking mesto na -1 vo centar" → ${res10e3.type}; bedrooms=${JSON.stringify(session10e.collectedData.bedrooms)}, parking=${JSON.stringify(session10e.collectedData.parking)}`);
assert('parking level → NO phantom bedrooms',
  session10e.collectedData.bedrooms === undefined,
  `Got: bedrooms=${JSON.stringify(session10e.collectedData.bedrooms)}`);
assert('parking level → parking still extracted (garage)',
  session10e.collectedData.parking === true && session10e.collectedData.parkingType === 'garage',
  `Got: parking=${JSON.stringify(session10e.collectedData.parking)}, type=${JSON.stringify(session10e.collectedData.parkingType)}`);

// 4. Control — a genuine m² answer to the follow-up still stores the size.
const session10f = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 168000,
    cleanPriceConfidence: 0.95,
    totalSqm: 64,
    totalSqmConfidence: 0.95
  },
  messages: [{ role: 'model', text: 'Одлично. Дали има тераса и колку м2 е?' }],
  phone: '+38970123456'
};
await generateResponse(session10f, "imaima terasi 2");   // count → follow-up
const res10f2 = await generateResponse(session10f, "5");  // real m² answer
console.log(`  "5" (follow-up) → ${res10f2.type}; terraceSqm=${JSON.stringify(session10f.collectedData.terraceSqm)}`);
assert('control: real m² answer to the follow-up → terraceSqm=5',
  session10f.collectedData.hasTerrace === true && session10f.collectedData.terraceSqm === 5,
  `Got: hasTerrace=${JSON.stringify(session10f.collectedData.hasTerrace)}, sqm=${JSON.stringify(session10f.collectedData.terraceSqm)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 11: "TI KAZAV NA VTORI" (ordinal floor must be HIGH confidence)');
console.log('========================================\n');

// Reported bug: Ana asked "На кој кат се наоѓа станот?" → owner replied
// "TI KAZAV NA VTORI" (ALL-CAPS) → extraction found floor=2, but
// assessConfidence returned LOW (bare ordinal "vtori" matches no kat/sprat
// keyword, no digit, no Latin cardinal fragment) → REJECTED as context
// mismatch → question re-asked forever → owner insulted Ana → strikes.
// Fix: assessConfidence awards HIGH when parseOrdinalFloor finds an ordinal.

const conf1 = assessConfidence('floor', 2, 'ti kazav na vtori');
console.log(`  assessConfidence('floor', 2, "ti kazav na vtori") → ${conf1}`);
assert('"ti kazav na vtori" → floor confidence HIGH',
  conf1 === 'HIGH',
  `Got: ${conf1}`);

const conf2 = assessConfidence('floor', 2, 'na vtori');
console.log(`  assessConfidence('floor', 2, "na vtori") → ${conf2}`);
assert('"na vtori" → floor confidence HIGH',
  conf2 === 'HIGH',
  `Got: ${conf2}`);

const conf3 = assessConfidence('floor', 2, 'ти кажав на втори');
console.log(`  assessConfidence('floor', 2, "ти кажав на втори") → ${conf3}`);
assert('Cyrillic "ти кажав на втори" → floor confidence HIGH',
  conf3 === 'HIGH',
  `Got: ${conf3}`);

const conf4 = assessConfidence('floor', 3, 'na tret kat');
console.log(`  assessConfidence('floor', 3, "na tret kat") → ${conf4}`);
assert('"na tret kat" → floor confidence HIGH',
  conf4 === 'HIGH',
  `Got: ${conf4}`);

// End-to-end: the extraction pass must now STORE floor (not reject it)
const e2eSession11 = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 358000,
    totalSqm: 64,
    hasTerrace: true,
    terraceSqm: null
  },
  questionAttempts: { floor: 1 },
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [
    { role: 'model', text: 'Одлично, уште последниве информации и завршуваме. На кој кат се наоѓа станот?' }
  ],
  phone: '+38970123456'
};
const { runGlobalExtractionPass } = await import('./handlers/data-collection.js');
const res11 = runGlobalExtractionPass({
  u: 'ti kazav na vtori',
  userInput: 'TI KAZAV NA VTORI',
  session: e2eSession11,
  nextField: 'floor'
});
console.log(`  Pass result: ${JSON.stringify(res11)}`);
console.log(`  floor stored: ${JSON.stringify(e2eSession11.collectedData.floor)}`);
assert('runGlobalExtractionPass stores floor=2 (was rejected as context mismatch)',
  e2eSession11.collectedData.floor === 2,
  `Got: ${JSON.stringify(e2eSession11.collectedData.floor)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 12: Skip loop must terminate (getNextMissingField honors Skipped marker)');
console.log('========================================\n');

// Reported bug: after 2 harness.failed attempts on floor, the skip loop stores
// floor=null + floorConfidence=0.10, but getNextMissingField treated null
// AND confidence<0.7 as missing → returned floor again → while-loop spun
// forever printing "[SKIP: floor ...]" (8+ times in the user's log).
// Fix: the skip loop sets floorSkipped=true; getNextMissingField must
// never re-surface a Skipped field.

// Fixture base: all fields BEFORE floor in the sale order are filled
// (cleanPrice, totalSqm, terraceSqm, bedrooms) so that getNextMissingField
// genuinely lands on floor — otherwise terraceSqm would be returned first
// and the skip loop would never run on floor.
const baseSkipData = {
  transactionType: 'sale',
  propertyType: 'apartment',
  cleanPrice: 358000,
  totalSqm: 64,
  terraceSqm: 5,
  bedrooms: 3
};

const skipData = {
  ...baseSkipData,
  floor: null,
  floorConfidence: 0.10,
  floorSkipped: true
};
const nextAfterSkip = getNextMissingField(skipData);
console.log(`  next after skipping floor: ${nextAfterSkip}`);
assert('skipped floor is NOT re-surfaced (loop would spin forever)',
  nextAfterSkip !== 'floor',
  `Got: ${nextAfterSkip}`);
assert('workflow advances to the next missing field (totalFloors)',
  nextAfterSkip === 'totalFloors',
  `Got: ${nextAfterSkip}`);

// Sanity check: WITHOUT the Skipped marker, floor IS still missing
// (proves the marker is what stops the loop, not the null value).
const noMarkerData = { ...baseSkipData, floor: null, floorConfidence: 0.10 };
const nextNoMarker = getNextMissingField(noMarkerData);
console.log(`  next without Skipped marker: ${nextNoMarker}`);
assert('without marker, floor is still considered missing (marker is the fix)',
  nextNoMarker === 'floor',
  `Got: ${nextNoMarker}`);

// Fallback path: value found at 0.30 confidence + Skipped marker
// (the SKIP FALLBACK branch also sets the marker — 0.30 < 0.7 would
// otherwise be treated as missing and loop).
const fallbackData = {
  ...baseSkipData,
  floor: 2,
  floorConfidence: 0.30,
  floorSkipped: true
};
const nextFallback = getNextMissingField(fallbackData);
console.log(`  next after fallback-skip (0.30 conf): ${nextFallback}`);
assert('fallback-skipped field (0.30 conf) is NOT re-surfaced',
  nextFallback !== 'floor',
  `Got: ${nextFallback}`);

// The full skip loop must terminate — simulate what runDataCollectionFlow
// does: 2+ attempts on floor, then the skip sets null+0.10+marker, then
// getNextMissingField must move past it and never come back to floor.
const { runDataCollectionFlow } = await import('./handlers/data-collection.js');
const loopSession = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 358000,
    totalSqm: 64,
    terraceSqm: 5,
    bedrooms: 3
  },
  questionAttempts: { floor: 2 },
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [
    { role: 'model', text: 'Само да потврдам, на кој кат се наоѓа станот?' }
  ],
  phone: '+38970123456'
};
const loopRes = runDataCollectionFlow({
  u: 'ke se smiram ama bidi tuka so pametot, citaj sto ti pisuvam',
  userInput: 'KE SE SMIRAM AMA BIDI TUKA SO PAMETOT, CITAJ STO TI PISUVAM',
  session: loopSession,
  adMemory: loopSession.adMemory,
  hasScraperPhotos: false
});
console.log(`  Skip-loop result type: ${loopRes && loopRes.type}`);
console.log(`  floor after skip: ${JSON.stringify(loopSession.collectedData.floor)}, skipped=${loopSession.collectedData.floorSkipped}`);
console.log(`  nextField asked: ${loopRes && loopRes.nextField}`);
assert('skip loop sets floorSkipped=true (no infinite loop)',
  loopSession.collectedData.floorSkipped === true,
  `Got: ${JSON.stringify(loopSession.collectedData.floorSkipped)}`);
assert('skip loop advances to totalFloors (not floor)',
  loopRes && loopRes.nextField === 'totalFloors',
  `Got nextField: ${loopRes && loopRes.nextField}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 13: "PO TRET PAT" (third time) must NOT parse as floor=3');
console.log('========================================\n');

// Reported quirk (pre-existing): "po tret pat" (for the third TIME) contains
// the ordinal "tret" which parseOrdinalFloor substring-matches → floor=3,
// even though the owner is counting occurrences, not floors.
// Fix: extractFloor strips ordinal+time-count phrases (tret pat, vtor den,
// трет пат...) BEFORE ordinal parsing — while still extracting real floors.

// --- Case A: pure time-count, no floor word → NO floor ---
const tcA = runGlobalExtraction('po tret pat ti kazuvam', {}, 'floor');
console.log(`  "po tret pat ti kazuvam" → floor=${JSON.stringify(tcA.floor)}`);
assert('"po tret pat ti kazuvam" → NO floor (was floor=3)',
  tcA.floor === undefined,
  `Got: ${JSON.stringify(tcA.floor)}`);

// --- Case B: time-count + real floor word → floor=2 still extracted ---
const tcB = runGlobalExtraction('po tret pat ti kazuvam na vtori', {}, 'floor');
console.log(`  "po tret pat ... na vtori" → floor=${JSON.stringify(tcB.floor)}`);
assert('"po tret pat ... na vtori" → floor=2 (real floor survives the strip)',
  tcB.floor === 2,
  `Got: ${JSON.stringify(tcB.floor)}`);

// --- Case C: genuine floor ordinal still works ---
const tcC = runGlobalExtraction('na tret kat', {}, 'floor');
console.log(`  "na tret kat" → floor=${JSON.stringify(tcC.floor)}`);
assert('"na tret kat" → floor=3 (kat is NOT a time-count word)',
  tcC.floor === 3,
  `Got: ${JSON.stringify(tcC.floor)}`);

// --- Case D: Cyrillic time-count ---
const tcD = runGlobalExtraction('по трет пат ти кажувам', {}, 'floor');
console.log(`  "по трет пат ти кажувам" → floor=${JSON.stringify(tcD.floor)}`);
assert('Cyrillic "по трет пат" → NO floor',
  tcD.floor === undefined,
  `Got: ${JSON.stringify(tcD.floor)}`);

// --- Case E: "vtor den" (second day) is not a floor ---
const tcE = runGlobalExtraction('na vtor den ke vi pratam sliki', {}, 'floor');
console.log(`  "na vtor den ..." → floor=${JSON.stringify(tcE.floor)}`);
assert('"vtor den" → NO floor (day-count, not floor)',
  tcE.floor === undefined,
  `Got: ${JSON.stringify(tcE.floor)}`);

// --- Case F: inflected time-count "вториот ден" (the second day) ---
const tcF = runGlobalExtraction('на вториот ден ќе дојдам', {}, 'floor');
console.log(`  "на вториот ден ..." → floor=${JSON.stringify(tcF.floor)}`);
assert('inflected "вториот ден" → NO floor',
  tcF.floor === undefined,
  `Got: ${JSON.stringify(tcF.floor)}`);

// --- Case G: "denes" (today) must NOT trigger the den guard ---
// 'den' inside 'denes' is NOT followed by \s or $, so the time-count regex
// must fail to match → no strip → parseOrdinalFloor finds 'vtor' → floor=2.
// Pinning floor===2 (NOT undefined) proves the (?:\s|$) boundary works:
// if the guard wrongly stripped 'vtor denes', parseOrdinalFloor would
// return null and floor would be undefined.
const tcG = runGlobalExtraction('vtor denes e', {}, 'floor');
console.log(`  "vtor denes e" → floor=${JSON.stringify(tcG.floor)}`);
assert('"denes" (today) does NOT trigger den-guard → floor=2 (boundary works)',
  tcG.floor === 2,
  `Got: ${JSON.stringify(tcG.floor)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 14: All fields skipped → session closes cleanly (CLOSE, not null)');
console.log('========================================\n');

// Reported issue: when the max-2-attempts loop skips EVERY remaining field
// (owner not answering), nextField became null and runDataCollectionFlow
// returned null → service.js fell through to the PERSUASION phase (an LLM
// pitch) even though the owner already accepted cooperation.
// Fix: the all-skipped path now returns buildCloseResponse(session) — the
// same property-folder + CSV + CLOSE message as the natural close path.

// NOTE: runDataCollectionFlow is already imported above (Scenario 12).
// buildCloseResponse writes a real property folder + CSV row on disk
// (same as test-e2e-campaign's CLOSE path) — accepted side effect.
//
// PRISTINE BASE: the first runDataCollectionFlow call MUTATES the session's
// collectedData (adds orientationSkipped..addressSkipped). Both fixtures
// must spread THIS base object (not the already-mutated session), otherwise
// the partial-skip fixture would inherit all Skipped markers and close
// prematurely instead of asking photos.
const baseSkipCollectedData = {
  cooperationAccepted: true,
  transactionType: 'sale',
  cleanPrice: 358000,
  totalSqm: 64,
  terraceSqm: 5,
  bedrooms: 3,
  floor: 2,
  totalFloors: 10,
  elevator: true,
  heating: 'district',
  ac: true,
  parking: true
};

const fullSkipSession = {
  adMemory: {
    transactionType: 'sale',
    propertyType: 'apartment',
    propertyLabel: 'станот'
  },
  collectedData: { ...baseSkipCollectedData },
  // Every REMAINING field has already been asked 2+ times (e.g. the owner
  // kept replying "ke se smiram ama bidi tuka so pametot" instead of
  // answering). The skip loop must exhaust orientation→furnished→yearBuilt
  // →...→address and then CLOSE instead of returning null.
  questionAttempts: {
    orientation: 2, furnished: 2, yearBuilt: 2, renovated: 2,
    renovationYear: 2, documentationClean: 2, photos: 2, ownerName: 2, address: 2
  },
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [
    { role: 'model', text: 'Која е ориентацијата?' }
  ],
  phone: '+38970123456'
};

const fullSkipRes = runDataCollectionFlow({
  u: 'ke se smiram ama bidi tuka so pametot, citaj sto ti pisuvam',
  userInput: 'KE SE SMIRAM AMA BIDI TUKA SO PAMETOT, CITAJ STO TI PISUVAM',
  session: fullSkipSession,
  adMemory: fullSkipSession.adMemory,
  hasScraperPhotos: false
});
console.log(`  All-skipped result type: ${fullSkipRes && fullSkipRes.type}`);
assert('fully-skipped session → CLOSE (not null, not persuasion fallthrough)',
  fullSkipRes && fullSkipRes.type === 'CLOSE',
  `Got: ${JSON.stringify(fullSkipRes)}`);

assert('CLOSE message is the standard thank-you template',
  fullSkipRes && fullSkipRes.text && /Ви благодарам/.test(fullSkipRes.text),
  `Got: ${JSON.stringify(fullSkipRes && fullSkipRes.text)}`);

// The skipped fields must carry their Skipped markers (persisted state)
assert('orientation marked Skipped',
  fullSkipSession.collectedData.orientationSkipped === true,
  `Got: ${JSON.stringify(fullSkipSession.collectedData.orientationSkipped)}`);
assert('address marked Skipped (last field in order)',
  fullSkipSession.collectedData.addressSkipped === true,
  `Got: ${JSON.stringify(fullSkipSession.collectedData.addressSkipped)}`);
assert('no QUESTION was asked after skipping everything',
  fullSkipRes.nextField === undefined,
  `Got nextField: ${JSON.stringify(fullSkipRes.nextField)}`);

// Sanity: a session where SOME fields still have attempts < 2 must still
// ask a question (skip loop must NOT close prematurely).
const partialSkipSession = {
  ...fullSkipSession,
  // Fresh copy of the PRISTINE base — the full-skip call above added
  // Skipped markers to fullSkipSession.collectedData; spreading that would
  // make getNextMissingField treat every field as done and close early.
  collectedData: { ...baseSkipCollectedData },
  questionAttempts: {
    orientation: 2, furnished: 2, yearBuilt: 2, renovated: 2,
    renovationYear: 2, documentationClean: 2
    // photos, ownerName, address have 0 attempts → must be asked
  }
};
const partialSkipRes = runDataCollectionFlow({
  u: 'ne sakam da odgovoram',
  userInput: 'NE SAKAM DA ODGOVORAM',
  session: partialSkipSession,
  adMemory: partialSkipSession.adMemory,
  hasScraperPhotos: false
});
console.log(`  Partial-skip result: type=${partialSkipRes && partialSkipRes.type}, nextField=${partialSkipRes && partialSkipRes.nextField}`);
assert('partially-skipped session → QUESTION (photos not yet asked)',
  partialSkipRes && partialSkipRes.type === 'QUESTION' && partialSkipRes.nextField === 'photos',
  `Got: ${JSON.stringify(partialSkipRes)}`);

console.log('\n========================================');
console.log('🧪 SCENARIO 15: "350 TI REKOV DA" must CONFIRM the pending price (not loop)');
console.log('========================================\n');

// Reported stuck loop: Ana asks "Дали точната вредност е 350? Која е месечната
// кирија за станот?" → owner (frustrated) replies "350 TI REKOV DA" → the
// pending-confirmation handler treated it as a NEW value (digit branch) →
// re-extraction scored MEDIUM (no confidence keyword in "350 TI REKOV DA") →
// re-pended → the exact same confirmation question forever.
// Fixes: (1) repeating the pending value IS a confirmation; (2) the extraction
// pass never re-pends a field that already has a value (stale nextField after
// a confirm in the same turn).

const { runPendingConfirmation } = await import('./handlers/data-collection.js');

function pendingSession(value = 350) {
  return {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent' },
    questionAttempts: {},
    pendingFollowUp: null,
    pendingConfirmation: { field: 'monthlyRent', value },
    messages: [
      { role: 'model', text: 'Дали точната вредност е 350? Која е месечната кирија за станот?' }
    ],
    phone: '+38970123456'
  };
}

// --- Direct runPendingConfirmation checks ---
const cases15 = [
  ['350 ti rekov da', true, 'the exact reported message'],
  ['350', true, 'bare number'],
  ['350 e', true, 'number + copula'],
  ['kazav ti 350', true, 'I told you 350'],
  ['350 e kirijata', true, 'number with context'],
  ['3500', false, 'different value (3500 ≠ 350)'],
  ['1350', false, 'different value (1350 ≠ 350)'],
  ['400 e', false, 'different value (400 ≠ 350)']
];
for (const [msg, shouldConfirm, label] of cases15) {
  const s = pendingSession();
  const resp = runPendingConfirmation({ u: msg, session: s });
  const confirmed = s.collectedData.monthlyRent === 350 && s.pendingConfirmation === null;
  assert(`repeat-value "${msg}" (${label}) ${shouldConfirm ? 'confirms' : 'does NOT confirm'}`,
    confirmed === shouldConfirm,
    `confirmed=${confirmed}, resp=${JSON.stringify(resp)}`);
}

// Negation guards — corrections must NOT confirm the pending value.
// Includes the bare-word shadowing cases: confirm's unanchored "tocno"/
// "taka"/"tok" used to match inside "ne e tocno"/"ne e taka"/"ne tok"
// and wrongly confirm (reject branch ran second). Reject now runs first.
for (const msg of ['ne, 400 e', '350 ne e tocno', '350 ne e taka', 'ne e 350', 'ne tok', 'greska 350']) {
  const s = pendingSession();
  const resp = runPendingConfirmation({ u: msg, session: s });
  assert(`negation "${msg}" does NOT confirm (returns re-ask response)`,
    s.collectedData.monthlyRent === undefined && resp !== null && resp.type === 'QUESTION',
    `monthlyRent=${JSON.stringify(s.collectedData.monthlyRent)}, resp=${JSON.stringify(resp)}`);
}

// --- End-to-end via generateResponse: the exact reported conversation ---
const priceLoopSession = {
  adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: true, transactionType: 'rent' },
  messages: [
    { role: 'model', text: 'Одлично. Која е месечната кирија за станот?' }
  ],
  phone: '+38970123456'
};

const t1 = await generateResponse(priceLoopSession, '350');
console.log(`  Turn 1 ("350") → ${t1.type}: "${t1.text}"`);
assert('turn1 "350" → confirmation question (MEDIUM pending)',
  t1.type === 'QUESTION' && /Дали точната вредност е 350/.test(t1.text || ''),
  `Got: ${t1.type} — "${t1.text}"`);
assert('turn1 pendingConfirmation=monthlyRent/350',
  priceLoopSession.pendingConfirmation && priceLoopSession.pendingConfirmation.field === 'monthlyRent' && priceLoopSession.pendingConfirmation.value === 350,
  `Got: ${JSON.stringify(priceLoopSession.pendingConfirmation)}`);

const t2 = await generateResponse(priceLoopSession, '350 TI REKOV DA');
console.log(`  Turn 2 ("350 TI REKOV DA") → ${t2.type}: "${t2.text}"`);
assert('turn2 monthlyRent=350 stored (was stuck before the fix)',
  priceLoopSession.collectedData.monthlyRent === 350,
  `Got: ${JSON.stringify(priceLoopSession.collectedData.monthlyRent)}`);
assert('turn2 monthlyRentConfidence=0.95 (confirmed, not 0.60 pending)',
  priceLoopSession.collectedData.monthlyRentConfidence === 0.95,
  `Got: ${JSON.stringify(priceLoopSession.collectedData.monthlyRentConfidence)}`);
assert('turn2 NOT the same confirm question (loop broken)',
  !/Дали точната вредност е 350/.test(t2.text || ''),
  `Got: "${t2.text}"`);
assert('turn2 pendingConfirmation cleared',
  priceLoopSession.pendingConfirmation === null || priceLoopSession.pendingConfirmation === undefined,
  `Got: ${JSON.stringify(priceLoopSession.pendingConfirmation)}`);
assert('turn2 advances to next field (totalSqm, rent order)',
  t2.type === 'QUESTION' && t2.nextField === 'totalSqm',
  `Got: ${t2.type} — nextField=${t2.nextField} — "${t2.text}"`);

console.log('\n========================================');
console.log('🧪 SCENARIO 16: LAND leads ask price/sqm/documentation/photos/name/address (not the whole batch)');
console.log('========================================\n');

// Reported: "plac, niva, and other terms for land property need only price /
// sqm / documentation / name / adress. not the whole batch." A land lead
// (no building) was previously pumped through nearly the FULL apartment
// question batch — only floor/totalFloors/elevator/ac/furnished were
// skipped, so terrace, bedrooms, heating, parking, orientation, yearBuilt,
// renovated, renovationYear and photos were still asked one by one.
// Fix: getNextMissingField whitelists exactly
//   cleanPrice|monthlyRent → totalSqm → documentationClean → photos →
//   ownerName → address
// for land and NEVER surfaces any building-only field. PHOTOS IS IN THE
// WHITELIST (later reported): a land owner may send a drawing/sketch of the
// plot or a photo of the land — the plot itself is the listing's visual, so
// photos is as essential for land as for buildings.

// --- Case A: land sale — walk the whole field order ---
const landSale = { propertyType: 'land', transactionType: 'sale' };
const landSaleOrder = [];
let f16 = getNextMissingField(landSale);
while (f16) {
  landSaleOrder.push(f16);
  landSale[f16] = 'X';
  landSale[f16 + 'Confidence'] = 0.95;
  f16 = getNextMissingField(landSale);
}
console.log(`  land sale order: ${landSaleOrder.join(' -> ')}`);
assert('land sale asks ONLY the whitelisted fields (price/sqm/doc/photos/name/address), in order',
  JSON.stringify(landSaleOrder) === JSON.stringify(['cleanPrice', 'totalSqm', 'documentationClean', 'photos', 'ownerName', 'address']),
  `Got: ${landSaleOrder.join(' -> ')}`);
assert('land sale: building-only fields (terrace/bedrooms/floor/heating/...) NEVER surface',
  !landSaleOrder.some(f => ['terraceSqm', 'bedrooms', 'floor', 'totalFloors', 'elevator', 'heating', 'ac', 'parking', 'orientation', 'furnished', 'yearBuilt', 'renovated', 'renovationYear'].includes(f)),
  `Got: ${landSaleOrder.join(' -> ')}`);

// --- Case B: land rent — same whitelist, monthlyRent instead of cleanPrice ---
const landRent = { propertyType: 'land', transactionType: 'rent' };
const landRentOrder = [];
f16 = getNextMissingField(landRent);
while (f16) {
  landRentOrder.push(f16);
  landRent[f16] = 'X';
  landRent[f16 + 'Confidence'] = 0.95;
  f16 = getNextMissingField(landRent);
}
console.log(`  land rent order: ${landRentOrder.join(' -> ')}`);
assert('land rent asks ONLY the whitelisted fields (monthlyRent first, photos included)',
  JSON.stringify(landRentOrder) === JSON.stringify(['monthlyRent', 'totalSqm', 'documentationClean', 'photos', 'ownerName', 'address']),
  `Got: ${landRentOrder.join(' -> ')}`);

// --- Case C: building-only fields are NEVER surfaced for land, even if the
// owner volunteers a value that would make them "missing" (e.g. a mention
// of "terasa" must not put terraceSqm in the queue). ---
const landWithTerraceMention = { propertyType: 'land', transactionType: 'sale', hasTerrace: undefined };
const fTerrace = getNextMissingField(landWithTerraceMention);
assert('land: terraceSqm never surfaced even when hasTerrace is unset',
  fTerrace === 'cleanPrice' && !['terraceSqm', 'bedrooms', 'floor', 'heating', 'parking'].includes(fTerrace),
  `Got: ${fTerrace}`);

// --- Case D: title detection — the full land vocabulary classifies as land. ---
const { generateFirstMessage } = await import('./service.js');
const LAND_TITLES = [
  'Se prodava niva vo s.Volkovo',        // niva (field)
  'НИВА ВО ОРЕШАНИ',                     // Cyrillic niva
  'Плац во Орешани',                     // plac
  'GRADEZNO ZEMJISHTE VO VIZBEGOVO',     // zemjishte (land)
  'се продава парцела погодна за куќа', // parcela (REPORTED — real lead, was house)
  'Продажба на земјоделско земјиште',    // земјоделско земјиште (agricultural land)
  'vinograd vo Tikves',                  // vinograd (vineyard)
  'продажба на градина',                 // gradina (garden)
  'oranica vo Bitola',                   // oranica (arable land)
  'земја за продажба',                   // земја (land)
  'Plac/Niva',                           // compound
  'Livada vo Prespa'                     // livada (meadow)
];
for (const title of LAND_TITLES) {
  const pt = generateFirstMessage({ title }).memory.propertyType;
  console.log(`  "${title}" → ${pt}`);
  assert(`land title "${title.substring(0, 40)}" → land`, pt === 'land', `Got: ${pt}`);
}

// --- Case E: NON-land titles must NOT be misclassified as land. ---
const NON_LAND_TITLES = [
  'СЕ ПРОДАВА СТАН ВО ЦЕНТАР',       // stan (apartment)
  'KUKJA VO GRADINA',                 // house in the village Gradina
  'villa belvista',                   // villa (house)
  'Се издава локал во центар',        // локал (commercial — Cyrillic, was apartment)
  'lokal za izdavanje',               // commercial
  'Куќа со градина'                   // house WITH a garden → house, not land
];
for (const title of NON_LAND_TITLES) {
  const pt = generateFirstMessage({ title }).memory.propertyType;
  console.log(`  "${title}" → ${pt}`);
  assert(`non-land title "${title.substring(0, 40)}" is NOT land (got ${pt})`, pt !== 'land', `Got: ${pt}`);
}

// --- Case F2: "Градежна фирма" (construction COMPANY) must NOT classify as
// land — only градежно+земјиште/парцела is construction LAND. ---
for (const title of ['Градежна фирма продава стан', 'Grazdezhna firma prodava stan', 'Градежно земјиште во Куманово', 'градежна парцела']) {
  const pt = generateFirstMessage({ title }).memory.propertyType;
  console.log(`  "${title}" → ${pt}`);
  assert(`title "${title.substring(0, 40)}" → ${title.includes('стан') || title.includes('firma') ? 'NOT land' : 'land'} (got ${pt})`,
    (title.includes('стан') || title.includes('firma')) ? pt !== 'land' : pt === 'land',
    `Got: ${pt}`);
}

// --- Case F: END-TO-END — a land lead's first accepted message advances to
// cleanPrice (the first whitelisted field), never to a building field. ---
const landSession = {
  adMemory: { transactionType: 'sale', propertyType: 'land', propertyLabel: 'плацот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale' },
  messages: [
    { role: 'model', text: 'Здраво, јас сум Ана од Metropolis. Ве контактирам за огласот за плацот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
  ],
  phone: '+38970123456'
};
const landRes = await generateResponse(landSession, 'da');
console.log(`  land "da" → ${landRes.type} nextField=${landRes.nextField} — "${landRes.text}"`);
assert('land e2e: first question after acceptance is cleanPrice (not a building field)',
  landRes.type === 'QUESTION' && landRes.nextField === 'cleanPrice' && /чиста цена/.test(landRes.text || ''),
  `Got: ${landRes.type} nextField=${landRes.nextField} — "${landRes.text}"`);

// --- Case F2: LAND PHOTOS (reported) — the land whitelist includes photos
// (a land owner may send a drawing/sketch of the plot or a photo of the
// land), and the photos question explicitly offers the sketch/drawing
// option. Verify the wording + that photos is in the land walk. ---
const { getQuestion } = await import('./workflow.js');
const landPhotosQ = getQuestion('photos', 'land', false);
console.log(`  land photos question: "${landPhotosQ}"`);
assert('land photos: question mentions sketch/drawing (скица/цртеж) of the plot',
  /скица\/цртеж/.test(landPhotosQ) && /плацот/.test(landPhotosQ),
  `Got: "${landPhotosQ}"`);
const aptPhotosQ = getQuestion('photos', 'apartment', false);
assert('apartment photos: unchanged generic wording (no sketch mention)',
  !/скица\/цртеж/.test(aptPhotosQ),
  `Got: "${aptPhotosQ}"`);
assert('land photos: getNextMissingField surfaces photos after documentationClean',
  landSaleOrder.includes('photos') &&
  landSaleOrder.indexOf('photos') === landSaleOrder.indexOf('documentationClean') + 1,
  `Got order: ${landSaleOrder.join(' -> ')}`);

// --- Case F3: END-TO-END through generateResponse — fill a land lead up to
// the photos step and verify the actual asked question carries the sketch
// wording (proves the nextField==='photos' handler wiring, not just the
// question factory). ---
// NOTE: do NOT pre-fill documentationClean — the owner's "da" must answer the
// documentation question so the FOLLOW-UP response is the photos question
// (if documentationClean were already filled, the "da" would be read as the
// photos answer and the flow would skip to ownerName).
const landPhotosSession = {
  adMemory: { transactionType: 'sale', propertyType: 'land', propertyLabel: 'плацот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 350000, cleanPriceConfidence: 0.95,
    totalSqm: 1200, totalSqmConfidence: 0.95
  },
  questionAttempts: {},
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [{ role: 'model', text: 'Дали имате чист имотен лист?' }],
  phone: '+38970123456'
};
const landPhotosRes = await generateResponse(landPhotosSession, 'da');
console.log(`  land e2e at photos step → ${landPhotosRes.type} nextField=${landPhotosRes.nextField} — "${(landPhotosRes.text || '').substring(0, 70)}"`);
assert('land e2e: reaches the photos question with sketch wording after documentationClean',
  landPhotosRes.type === 'QUESTION' && landPhotosRes.nextField === 'photos' && /скица\/цртеж/.test(landPhotosRes.text || ''),
  `Got: ${landPhotosRes.type} nextField=${landPhotosRes.nextField} — "${landPhotosRes.text}"`);

// --- Case G: PHANTOM BUILDING DATA GUARD — a land owner answering a bare
// number with no price/sqm context must NOT get a phantom terrace/heating
// stored (the complex stateful handlers' extraction branches are NOT
// nextField-gated; the LAND GUARD skips them for land leads). ---
const landPhantomSession = {
  adMemory: { transactionType: 'sale', propertyType: 'land', propertyLabel: 'плацот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 350000,
    cleanPriceConfidence: 0.95
  },
  questionAttempts: {},
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [{ role: 'model', text: 'Колкава е вкупната квадратура по имотен лист?' }],
  phone: '+38970123456'
};
// Bare "60" (no "kvadrati" unit) is not extracted as totalSqm for ANY
// property type — but the reported phantom-terrace bug class was that a bare
// number like "60" would still be picked up by extractTerraceNumber in the
// complex stateful handler and stored as terraceSqm=60. For LAND the LAND
// GUARD must prevent that entirely.
const landPhantomRes = await generateResponse(landPhantomSession, '60');
console.log(`  land bare "60" → ${landPhantomRes.type} nextField=${landPhantomRes.nextField}; hasTerrace=${JSON.stringify(landPhantomSession.collectedData.hasTerrace)}, terraceSqm=${JSON.stringify(landPhantomSession.collectedData.terraceSqm)}, heating=${JSON.stringify(landPhantomSession.collectedData.heating)}`);
assert('land: bare "60" → NO phantom terrace (LAND GUARD skips terrace handler)',
  landPhantomSession.collectedData.hasTerrace === undefined &&
  landPhantomSession.collectedData.terraceSqm === undefined,
  `Got: hasTerrace=${JSON.stringify(landPhantomSession.collectedData.hasTerrace)}, terraceSqm=${JSON.stringify(landPhantomSession.collectedData.terraceSqm)}`);

// Companion: "60 kvadrati" (with unit) DOES extract totalSqm for land — and
// still no phantom terrace.
const landSqmSession = {
  adMemory: { transactionType: 'sale', propertyType: 'land', propertyLabel: 'плацот' },
  collectedData: {
    cooperationAccepted: true,
    transactionType: 'sale',
    cleanPrice: 350000,
    cleanPriceConfidence: 0.95
  },
  questionAttempts: {},
  pendingFollowUp: null,
  pendingConfirmation: null,
  messages: [{ role: 'model', text: 'Колкава е вкупната квадратура по имотен лист?' }],
  phone: '+38970123456'
};
const landSqmRes = await generateResponse(landSqmSession, '60 kvadrati');
console.log(`  land "60 kvadrati" → ${landSqmRes.type} nextField=${landSqmRes.nextField}; totalSqm=${JSON.stringify(landSqmSession.collectedData.totalSqm)}, hasTerrace=${JSON.stringify(landSqmSession.collectedData.hasTerrace)}, terraceSqm=${JSON.stringify(landSqmSession.collectedData.terraceSqm)}`);
assert('land: "60 kvadrati" → totalSqm=60 stored, NO phantom terrace',
  landSqmSession.collectedData.totalSqm === 60 &&
  landSqmSession.collectedData.hasTerrace === undefined &&
  landSqmSession.collectedData.terraceSqm === undefined,
  `Got: totalSqm=${JSON.stringify(landSqmSession.collectedData.totalSqm)}, hasTerrace=${JSON.stringify(landSqmSession.collectedData.hasTerrace)}, terraceSqm=${JSON.stringify(landSqmSession.collectedData.terraceSqm)}`);

// Direct handler check: "ima parno" on a land lead must NOT create a heating
// follow-up or store heating (the LAND GUARD skips the branch entirely).
const { runComplexStatefulHandlers } = await import('./handlers/data-collection.js');
const landParno = {
  adMemory: { transactionType: 'sale', propertyType: 'land', propertyLabel: 'плацот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 350000, cleanPriceConfidence: 0.95 },
  pendingFollowUp: null
};
const parnoResp = runComplexStatefulHandlers({ u: 'ima parno', userInput: 'ima parno', session: landParno, nextField: 'totalSqm', hasScraperPhotos: false });
console.log(`  land "ima parno" → ${parnoResp ? parnoResp.type : 'null'}; heating=${JSON.stringify(landParno.collectedData.heating)}`);
assert('land: "ima parno" → NO heating follow-up, NO heating stored',
  parnoResp === null && landParno.collectedData.heating === undefined && landParno.pendingFollowUp === null,
  `Got: ${JSON.stringify(parnoResp)}, heating=${JSON.stringify(landParno.collectedData.heating)}, pendingFollowUp=${JSON.stringify(landParno.pendingFollowUp)}`);

// ========================================
// SCENARIO 17: Property SOLD / GONE closes gracefully — never cooperation
// (REPORTED: owner said "go prodadov pred dva dena" then answered Ana's
// future-cooperation question with "sekako / ke ve kontaktiram / ubav den"
// and the bot treated it as ACCEPTED 0.85 → asked the SOLD apartment's price)
// ========================================
console.log('\n========================================');
console.log('🧪 SCENARIO 17: SOLD property + future-cooperation reply → NO acceptance');
console.log('========================================\n');

// generateResponse + detectPhase already imported above (lines 158/584).

// --- Case A: the reported "go prodadov pred dva dena" → graceful CLOSED. ---
const soldSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [{ role: 'model', text: 'Здраво... Дали е се уште достапен?' }],
  phone: '+38970999999'
};
const soldResp = await generateResponse(soldSession, 'go prodadov pred dva dena');
console.log(`  "go prodadov pred dva dena" → ${soldResp.type}: "${(soldResp.text || '').substring(0, 55)}..."`);
assert('sold: "go prodadov pred dva dena" → CLOSED (graceful, no data collection)',
  soldResp.type === 'CLOSED' && /Честитам/.test(soldResp.text),
  `Got: ${soldResp.type} — "${soldResp.text}"`);
assert('sold: propertySold flag set for operator traceability',
  soldSession.propertySold === true,
  'propertySold not set');

// --- Case B: the whole gone-family closes; still-available family does NOT. ---
const GONE = ['go nema', 'ne e dostapen', 'veke prodaden', 'se prodade', 'go povlekov', 'go izdadov'];
for (const goneMsg of GONE) {
  const s = {
    adMemory: { transactionType: goneMsg === 'go izdadov' ? 'rent' : 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: false },
    messages: [{ role: 'model', text: 'Здраво... Дали е се уште достапен?' }],
    phone: '+38970111111'
  };
  const r = await generateResponse(s, goneMsg);
  console.log(`  "${goneMsg}" → ${r.type}`);
  assert(`gone-family: "${goneMsg}" → CLOSED`, r.type === 'CLOSED', `Got: ${r.type}`);
}
for (const stillMsg of ['ne sum go prodal', 'uste go imam', 'dostapen e', 'uste se prodava']) {
  const s = {
    adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: false },
    messages: [{ role: 'model', text: 'Здраво... Дали е се уште достапен?' }],
    phone: '+38970222222'
  };
  const r = await generateResponse(s, stillMsg);
  console.log(`  "${stillMsg}" → ${r.type}`);
  assert(`still-available: "${stillMsg}" is NOT closed (goes to availability)`, r.type !== 'CLOSED', `Got: ${r.type}`);
}

// --- Case C: classifier — short positives after a FUTURE-cooperation question
// are INTERESTED, not ACCEPTED. ---
const futureConv = 'Ана: Честитам за успешната продажба на имотот. Дали сте расположени да соработуваме во иднина, ако имате друг имот за продажба?';
for (const fare of ['sekako', 'ke ve kontaktiram', 'ubav den']) {
  const cl = classifyIntent(fare, futureConv);
  console.log(`  future-coop + "${fare}" → ${cl.intent} ${cl.confidence}`);
  assert(`future-coop: "${fare}" is NOT ACCEPTED (polite goodbye)`, cl.intent !== 'ACCEPTED', `Got: ${cl.intent} ${cl.confidence}`);
}

// --- Case C2: "moze ana" after a FUTURE-coop question must NOT accept
// (reviewer-found hole: the moze{name} 0.90 rule bypassed the future gate). ---
const mozeAnaFuture = classifyIntent('moze ana', futureConv);
console.log(`  future-coop + "moze ana" → ${mozeAnaFuture.intent} ${mozeAnaFuture.confidence}`);
assert('future-coop: "moze ana" is NOT ACCEPTED (future question, not commitment)',
  mozeAnaFuture.intent !== 'ACCEPTED',
  `Got: ${mozeAnaFuture.intent} ${mozeAnaFuture.confidence}`);

// --- Case C3: "brojot ne e dostapen" (phone number unreachable) is NOT the
// property being gone — must not close, must not say "glad it's available". ---
const phoneSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [{ role: 'model', text: 'Здраво... Дали е се уште достапен?' }],
  phone: '+38970444444'
};
for (const phoneMsg of ['brojot ne e dostapen', 'ne e dostapen brojot']) {
  const pr = await generateResponse(phoneSession, phoneMsg);
  console.log(`  "${phoneMsg}" → ${pr.type}`);
  assert(`phone-context: "${phoneMsg}" is NOT CLOSED (number unreachable ≠ property gone)`,
    pr.type !== 'CLOSED',
    `Got: ${pr.type}`);
}

// --- Case D: PRESENT-tense cooperation question still accepts normally. ---
const presentConv = 'Ана: Дали да почнеме со соработка?';
for (const yes of ['sekako', 'da', 'moze']) {
  const cl = classifyIntent(yes, presentConv);
  console.log(`  present-coop + "${yes}" → ${cl.intent} ${cl.confidence}`);
  assert(`present-coop: "${yes}" still ACCEPTS`, cl.intent === 'ACCEPTED', `Got: ${cl.intent} ${cl.confidence}`);
}

// --- Case E: detectPhase short-positive path is gated on future-cooperation. ---
const phaseSession = {
  adMemory: { transactionType: 'sale' },
  collectedData: { cooperationAccepted: false },
  rejectionCount: 0
};
const dp = detectPhase({ u: 'ok', conv: 'Сопственик: jas\nАна: Дали сте расположени да соработуваме во иднина, ако имате друг имот за продажба?', session: phaseSession, isRent: false });
console.log(`  detectPhase(future-coop + "ok") → phase=${dp.phase}, accepted=${phaseSession.collectedData.cooperationAccepted}`);
assert('detectPhase: bare "ok" after future-coop question does NOT enter DATA_COLLECTION',
  dp.phase === 'PERSUASION' && phaseSession.collectedData.cooperationAccepted === false,
  `Got phase=${dp.phase}, accepted=${phaseSession.collectedData.cooperationAccepted}`);

// --- Case F: end-to-end — "ok" after future-coop question must NOT ask the
// sold apartment's price (the reported absurdity). ---
const e2eSession = {
  adMemory: { transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот' },
  collectedData: { cooperationAccepted: false },
  messages: [{ role: 'model', text: 'Честитам... Дали сте расположени да соработуваме во иднина, ако имате друг имот за продажба?' }],
  phone: '+38970333333'
};
const e2eResp = await generateResponse(e2eSession, 'ok');
console.log(`  e2e future-coop + "ok" → ${e2eResp.type}; accepted=${e2eSession.collectedData.cooperationAccepted}`);
assert('e2e: "ok" after future-coop question stays PERSUASION (no price question)',
  e2eSession.collectedData.cooperationAccepted === false && !/цена|price/i.test(e2eResp.text || ''),
  `Got accepted=${e2eSession.collectedData.cooperationAccepted}, resp=${(e2eResp.text || '').substring(0, 60)}`);

// ========================================
// SCENARIO 18: BUSINESS/COMMERCIAL properties ask the business field set
// (price/sqm/floor/totalFloors/heating/ac/parking/orientation/furnished/
// yearBuilt/renovated/renovationYear/documentation/photos/name/address) —
// NOT terrace, NOT bedrooms, NOT elevator (reported request).
// ========================================
console.log('\n========================================');
console.log('🧪 SCENARIO 18: COMMERCIAL field whitelist — no terrace/bedrooms/elevator');
console.log('========================================\n');

// --- Case A: full sale walk — exactly the reported business list. ---
const COMMERCIAL_SALE_ORDER =
  'cleanPrice,totalSqm,floor,totalFloors,heating,ac,parking,orientation,furnished,yearBuilt,renovated,renovationYear,documentationClean,photos,ownerName,address';
const commSaleData = { propertyType: 'commercial', transactionType: 'sale' };
let cf = getNextMissingField(commSaleData);
const commSaleOrder = [];
while (cf) {
  commSaleOrder.push(cf);
  commSaleData[cf] = 'X';
  commSaleData[cf + 'Confidence'] = 0.95;
  cf = getNextMissingField(commSaleData);
}
console.log(`  commercial sale order: ${commSaleOrder.join(' -> ')}`);
assert('commercial sale: exact business field order (no terrace/bedrooms/elevator)',
  commSaleOrder.join(',') === COMMERCIAL_SALE_ORDER,
  `Got: ${commSaleOrder.join(',')}`);
assert('commercial sale: terraceSqm never asked', !commSaleOrder.includes('terraceSqm'), 'terraceSqm in order');
assert('commercial sale: bedrooms never asked', !commSaleOrder.includes('bedrooms'), 'bedrooms in order');
assert('commercial sale: elevator never asked', !commSaleOrder.includes('elevator'), 'elevator in order');

// --- Case B: rent walk uses monthlyRent as the price field. ---
const commRentData = { propertyType: 'commercial', transactionType: 'rent' };
cf = getNextMissingField(commRentData);
const commRentOrder = [];
while (cf) {
  commRentOrder.push(cf);
  commRentData[cf] = 'X';
  commRentData[cf + 'Confidence'] = 0.95;
  cf = getNextMissingField(commRentData);
}
console.log(`  commercial rent order: ${commRentOrder.join(' -> ')}`);
assert('commercial rent: starts with monthlyRent, same business set after',
  commRentOrder[0] === 'monthlyRent' &&
  commRentOrder.slice(1).join(',') === COMMERCIAL_SALE_ORDER.split(',').slice(1).join(','),
  `Got: ${commRentOrder.join(',')}`);

// --- Case C: apartment control — terrace/bedrooms/elevator STILL asked for
// residential (the whitelist must not leak). ---
const aptControlData = { propertyType: 'apartment', transactionType: 'sale' };
cf = getNextMissingField(aptControlData);
const aptControlOrder = [];
while (cf) {
  aptControlOrder.push(cf);
  aptControlData[cf] = 'X';
  aptControlData[cf + 'Confidence'] = 0.95;
  cf = getNextMissingField(aptControlData);
}
console.log(`  apartment control order: ${aptControlOrder.join(' -> ')}`);
assert('apartment control: terrace/bedrooms/elevator still asked for residential',
  aptControlOrder.includes('terraceSqm') && aptControlOrder.includes('bedrooms') && aptControlOrder.includes('elevator'),
  `Got: ${aptControlOrder.join(',')}`);

// --- Case D: phantom-terrace guard — a commercial owner answering the sqm
// question with a bare number must NOT store residential terrace data. ---
const commPhantom = {
  adMemory: { transactionType: 'sale', propertyType: 'commercial', propertyLabel: 'локалот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 350000, cleanPriceConfidence: 0.95 },
  pendingFollowUp: null
};
const commPhantomResp = runComplexStatefulHandlers({ u: '60', userInput: '60', session: commPhantom, nextField: 'totalSqm', hasScraperPhotos: false });
console.log(`  commercial bare "60" → ${commPhantomResp ? commPhantomResp.type : 'null'}; hasTerrace=${JSON.stringify(commPhantom.collectedData.hasTerrace)}`);
assert('commercial: bare "60" → NO phantom terrace (COMMERCIAL GUARD skips terrace branch)',
  commPhantomResp === null && commPhantom.collectedData.hasTerrace === undefined && commPhantom.collectedData.terraceSqm === undefined,
  `Got: ${JSON.stringify(commPhantomResp)}, hasTerrace=${JSON.stringify(commPhantom.collectedData.hasTerrace)}`);

// --- Case E: commercial leads STILL get the building fields (heating stays
// active — a business unit has heating) — the parno follow-up must work. ---
const commParno = {
  adMemory: { transactionType: 'sale', propertyType: 'commercial', propertyLabel: 'локалот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', cleanPrice: 350000, cleanPriceConfidence: 0.95, totalSqm: 120, totalSqmConfidence: 0.95, floor: 1, floorConfidence: 0.95, totalFloors: 3, totalFloorsConfidence: 0.95 },
  pendingFollowUp: null
};
const commParnoResp = runComplexStatefulHandlers({ u: 'ima parno', userInput: 'ima parno', session: commParno, nextField: 'heating', hasScraperPhotos: false });
console.log(`  commercial "ima parno" → ${commParnoResp ? commParnoResp.type : 'null'}: ${(commParnoResp?.text || '').substring(0, 40)}`);
assert('commercial: "ima parno" → heating follow-up STILL fires (heating is in the whitelist)',
  commParnoResp && commParnoResp.type === 'QUESTION' && /парно/.test(commParnoResp.text),
  `Got: ${JSON.stringify(commParnoResp)}`);

// --- Case F: end-to-end — a commercial lead's first accepted message advances
// to cleanPrice (price first), then sqm — never terrace. ---
const commSession = {
  adMemory: { transactionType: 'sale', propertyType: 'commercial', propertyLabel: 'локалот' },
  collectedData: { cooperationAccepted: true, transactionType: 'sale' },
  messages: [],
  phone: '+38970555555',
  addSentMessage() {}
};
const commFirst = await generateResponse(commSession, 'da');
const firstField = commFirst.nextField;
console.log(`  commercial e2e first question: ${firstField} — "${(commFirst.text || '').substring(0, 45)}"`);
assert('commercial e2e: first question after acceptance is cleanPrice (not terrace/bedrooms)',
  firstField === 'cleanPrice',
  `Got: ${firstField}`);

// --- Case G: title detection — business/commercial titles classify as
// commercial and their label is 'локалот'. ---
const COMMERCIAL_TITLES = [
  'Се издава локал во центар',
  'lokal za izdavanje',
  'Продажба на деловен простор',
  'office space za prodazba',
  'МАГАЦИН ВО КУМАНОВО',
  'restoran za izdavanje',
  'продавница во ГТЦ'
];
for (const title of COMMERCIAL_TITLES) {
  const fm = generateFirstMessage({ title });
  console.log(`  "${title}" → ${fm.memory.propertyType}`);
  assert(`commercial title "${title.substring(0, 35)}" → commercial`, fm.memory.propertyType === 'commercial', `Got: ${fm.memory.propertyType}`);
}

// ========================================
// SUMMARY
// ========================================
console.log('\n=======================================================');
console.log('📊 TRACE SUMMARY:');
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
console.log('=======================================================');

if (harness.failed > 0) {
  console.log('\n❌ SOME TESTS FAILED — investigate above.\n');
  process.exit(1);
} else {
  console.log('\n🟢 ALL CHECKS PASSED\n');
}
