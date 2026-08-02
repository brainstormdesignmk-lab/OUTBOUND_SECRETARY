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

assert('"ne sum zainteresiran" still NOT a client question',
  !isAskingAboutClients('ne sum zainteresiran'),
  'negative must not match');

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
