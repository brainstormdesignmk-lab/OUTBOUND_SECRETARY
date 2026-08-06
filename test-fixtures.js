// ============================================================
// ANA Fixture Suite — Pure Function Tests
// ============================================================
// PURPOSE: Establish baseline pass/fail on all known bugs before
// any refactoring.
//
// CONSOLIDATION NOTE: These tests now import the REAL production
// functions from property-extractor.js / classifier.js / objections.js
// instead of stale verbatim copies (which drifted silently). The B16
// testHeatingPattern replica is kept because the runtime heating
// vocabulary lives inline in handlers/data-collection.js
// (runComplexStatefulHandlers) and is not exported as a function; the
// global extractHeating in data-collector.js has different semantics
// (centralno → district) and is covered by test-global-extraction.js.
//
// RULE: Every bug fix must rerun this FULL suite.
// RULE: Every refactoring step must rerun this FULL suite.
// RULE: Max 3 retries per bug before flagging.
// ============================================================
import { createHarness } from './test-helpers.js';
import {
  parseMacedonianNumber, parseNumberWords, extractPrice, parseYearBuilt,
  parseOrdinalFloor, extractFirstNumber, countBedrooms, extractTerraceNumber,
  isPositive, isNegative, parseOrientation
} from './property-extractor.js';
import { matchObjection } from './objections.js';
import { classifyIntent } from './classifier.js';

// ============================================================
// FIXTURE: assertIntentEqual (for cleanup/testing intent results)
// ============================================================
function assertIntentEqual(actual, expectedIntent, expectedConfidence, label) {
  const pass = actual && actual.intent === expectedIntent && actual.confidence >= expectedConfidence;
  harness.assert(
    `${label} → ${actual?.intent} (${actual?.confidence}, ${actual?.reason})`,
    pass,
    `expected ${expectedIntent} >=${expectedConfidence}, got ${actual?.intent} (${actual?.confidence})`
  );
}

// ============================================================
// TEST SUITE
// ============================================================

const harness = createHarness();

function assert(condition, label, expected, actual) {
  harness.assert(label, !!condition, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, label, expected, actual);
}

function assertNotNull(actual, label) {
  assert(actual !== null && actual !== undefined, label, 'not null', actual);
}

function assertNull(actual, label) {
  assert(actual === null || actual === undefined, label, 'null', actual);
}

// ============================================================
// TEST GROUP: parseMacedonianNumber
// ============================================================
console.log(`\n📦 GROUP: parseMacedonianNumber`);

// B3: "seeset" = 60 (now fixed with irregular tens)
assertEqual(parseMacedonianNumber("seeset"), 60, "B3: 'seeset' → 60 (fixed!)");

// B6/B10: substring issue — "dvanaeset" should be 12, not 2
assertEqual(parseMacedonianNumber("dvanaeset"), 12, "B6/B10: 'dvanaeset' → 12 (⚠ current: 2 — substring match bug!)");

assertEqual(parseMacedonianNumber("cetirinaeset"), 14, "B6: 'cetirinaeset' → 14 (⚠ current: 4)");  // B16: 2-digit year should NOT extract from floor/building-story context
  assertEqual(parseYearBuilt("zgradata ima 13 sprata"), null, "B16: 'zgradata ima 13 sprata' → null (floor context, not year)");
  assertEqual(parseYearBuilt("10 katnica"), null, "B16: '10 katnica' → null (building story context)");

  // Working cases
assertEqual(parseMacedonianNumber("dva"), 2, "dva → 2");
assertEqual(parseMacedonianNumber("tri"), 3, "tri → 3");
assertEqual(parseMacedonianNumber("pet"), 5, "pet → 5");
assertEqual(parseMacedonianNumber("devet"), 9, "devet → 9");
assertEqual(parseMacedonianNumber("deset"), 10, "deset → 10");
assertEqual(parseMacedonianNumber("trinaeset"), 13, "trinaeset → 13");
assertEqual(parseMacedonianNumber("petnaeset"), 15, "petnaeset → 15");

// ============================================================
// TEST GROUP: parseNumberWords
// ============================================================
console.log(`\n📦 GROUP: parseNumberWords (hundreds + tens)`);

assertEqual(parseNumberWords("petsto"), 500, "petsto → 500");
assertEqual(parseNumberWords("dvesto"), 200, "dvesto → 200");
assertEqual(parseNumberWords("dvaeset"), 20, "dvaeset → 20");
assertEqual(parseNumberWords("triest"), 30, "triest → 30");
assertEqual(parseNumberWords("pedeset"), 50, "pedeset → 50");

// Compound: "petstodvaeset" = 520
assertEqual(parseNumberWords("petstodvaeset"), 520, "petstodvaeset → 520");

// B1 critical — "stodvaesetipet" should be 125
assertEqual(parseNumberWords("stodvaesetipet"), 125, "B1: 'stodvaesetipet' → 125 (sto + dvaeset + i + pet)");

// "seeset" = 60 variant — NOW FIXED
assertEqual(parseNumberWords("seeset"), 60, "B2/B3: 'seeset' → 60 (fixed!)");

// B2: "seesetipet" = 65 (seeset=60 + i pet=5)
assertEqual(parseNumberWords("seesetipet"), 65, "B2: 'seesetipet' → 65 (seeset=60 + i pet=5)");

// ============================================================
// TEST GROUP: extractPrice
// ============================================================
console.log(`\n📦 GROUP: extractPrice`);

// B1: "stodvaesetipet iljadi" = 125000
const priceB1 = extractPrice("ZA MENE BARAM STODVAESETIPET ILJADI EVRA");
assertEqual(priceB1, 125000, "B1: 'STODVAESETIPET ILJADI EVRA' → 125000 (⚠ current: 20000)");

// Standard price cases
assertEqual(extractPrice("105000 evra"), 105000, "'105000 evra' → 105000");
assertEqual(extractPrice("baram 120000 evra"), 120000, "'baram 120000 evra' → 120000");
assertEqual(extractPrice("2 miliona"), 2000000, "'2 miliona' → 2000000");
assertEqual(extractPrice("98 iljadi"), 98000, "'98 iljadi' → 98000");
assertEqual(extractPrice("250 evra"), 250, "'250 evra' → 250");

// ============================================================
// TEST GROUP: parseYearBuilt
// ============================================================
console.log(`\n📦 GROUP: parseYearBuilt`);

// B11: "dveiljadiidvanaesta" = 2012 (but this is Cyrillic Macedonian)
// The text "dveiljadiidvanaesta" means "2012" in Macedonian words
assertEqual(parseYearBuilt("2012"), 2012, "'2012' → 2012");
assertEqual(parseYearBuilt("70ti posle zemjotresot"), 1975, "'70ti posle zemjotresot' → 1975");
assertEqual(parseYearBuilt("90ta"), 1990, "'90ta' → 1990");
assertEqual(parseYearBuilt("2000ta"), 2000, "'2000ta' → 2000");  // B11: Word-based years
  assertEqual(parseYearBuilt("dveiljadiidvanaesta"), 2012, "B11: 'dveiljadiidvanaesta' → 2012");
  assertEqual(parseYearBuilt("dveidvanaesta mislam"), 2012, "B11: 'dveidvanaesta mislam' → 2012");

  // B18: Decade word spelling variants (single-t vs double-t, Latin + Cyrillic)
  assertEqual(parseYearBuilt("osumdesti"), 1985, "B18: 'osumdesti' → 1985");
  assertEqual(parseYearBuilt("osumdeseti"), 1985, "B18: 'osumdeseti' (single-t) → 1985");
  assertEqual(parseYearBuilt("osumdesetti"), 1985, "B18: 'osumdesetti' (double-t) → 1985");
  assertEqual(parseYearBuilt("осумдесети"), 1985, "B18: 'осумдесети' (Cyrillic single-т) → 1985");
  assertEqual(parseYearBuilt("осумдесетти"), 1985, "B18: 'осумдесетти' (Cyrillic double-т) → 1985");
  assertEqual(parseYearBuilt("OSUMDESETI NEKADE"), 1985, "B18: 'OSUMDESETI NEKADE' (real Viber, uppercase) → 1985");
  assertEqual(parseYearBuilt("osumdesti nekade, ne znam tocno"), 1985, "B18: full real-world phrase → 1985");
  assertEqual(parseYearBuilt("osumdeseta"), 1980, "B18: 'osumdeseta' (-a form) → 1980");
  assertEqual(parseYearBuilt("deveeseti"), 1995, "B18: 'deveeseti' (single-t) → 1995");
  assertEqual(parseYearBuilt("девеесети"), 1995, "B18: 'девеесети' (Cyrillic single-т) → 1995");
  assertEqual(parseYearBuilt("deveeseta"), 1990, "B18: 'deveeseta' (-a form) → 1990");
  assertEqual(parseYearBuilt("sedumdeseti"), 1975, "B18: 'sedumdeseti' (single-t) → 1975");
  assertEqual(parseYearBuilt("седумдесети"), 1975, "B18: 'седумдесети' (Cyrillic single-т) → 1975");
  assertEqual(parseYearBuilt("sedumdeseta"), 1970, "B18: 'sedumdeseta' (-a form) → 1970");
  // 50s/60s decade lines (previously entirely missing)
  assertEqual(parseYearBuilt("pedeseti"), 1955, "B18: 'pedeseti' (50s single-t) → 1955");
  assertEqual(parseYearBuilt("педесети"), 1955, "B18: 'педесети' (Cyrillic 50s single-т) → 1955");
  assertEqual(parseYearBuilt("peesetti"), 1955, "B18: 'peesetti' (50s) → 1955");
  assertEqual(parseYearBuilt("pedeseta"), 1950, "B18: 'pedeseta' (50s -a form) → 1950");
  assertEqual(parseYearBuilt("peeseta"), 1950, "B18: 'peeseta' (50s -a form) → 1950");
  assertEqual(parseYearBuilt("seeseti"), 1965, "B18: 'seeseti' (60s single-t) → 1965");
  assertEqual(parseYearBuilt("шеесети"), 1965, "B18: 'шеесети' (Cyrillic 60s single-т) → 1965");
  assertEqual(parseYearBuilt("seesetti"), 1965, "B18: 'seesetti' (60s) → 1965");
  assertEqual(parseYearBuilt("seeseta"), 1960, "B18: 'seeseta' (60s -a form) → 1960");
  // Bare Latin decade words via dual-\b blocks
  assertEqual(parseYearBuilt("osumdeset"), 1980, "B18: bare 'osumdeset' (80s Latin) → 1980");
  assertEqual(parseYearBuilt("osumdeset nekade"), 1985, "B18: bare 'osumdeset nekade' → 1985");
  assertEqual(parseYearBuilt("devedeset"), 1990, "B18: bare 'devedeset' (90s Latin) → 1990");
  assertEqual(parseYearBuilt("sedumdeset"), 1970, "B18: bare 'sedumdeset' (70s Latin) → 1970");

// ============================================================
// TEST GROUP: parseOrdinalFloor
// ============================================================
console.log(`\n📦 GROUP: parseOrdinalFloor`);

assertEqual(parseOrdinalFloor("na vtor kat"), 2, "'na vtor kat' → 2");
assertEqual(parseOrdinalFloor("prizemje"), 0, "'prizemje' → 0");
assertEqual(parseOrdinalFloor("cetvrt kat"), 4, "'cetvrt kat' → 4");
assertEqual(parseOrdinalFloor("na potkrovje"), null, "'na potkrovje' → null (не е ordinal)");

// ============================================================
// TEST GROUP: isPositive
// ============================================================
console.log(`\n📦 GROUP: isPositive`);

assert(isPositive("da"), true, "'da' → true");
assert(isPositive("ima"), true, "'ima' → true");
assert(isPositive("DA"), true, "'DA' → true");
assert(isPositive("normalno"), true, "'normalno' → true");
assert(isPositive("ke ispratam"), true, "'ke ispratam' → true");
assert(isPositive("moze"), true, "'moze' → true");

// B4: "IMA" should be positive
assert(isPositive("IMA"), true, "B4: 'IMA' → true");
assert(isPositive("ima 3 kvadrata"), true, "'ima 3 kvadrata e' → true");

// Edge cases — should not false positive
assert(isPositive("dava pare"), false, "'dava pare' → false (not positive)");
assert(isPositive("dali"), false, "'dali' → false (not positive)");

// ============================================================
// TEST GROUP: isNegative
// ============================================================
console.log(`\n📦 GROUP: isNegative`);

assert(isNegative("ne"), true, "'ne' → true");
assert(isNegative("nema"), true, "'nema' → true");
assert(isNegative("NEMA"), true, "'NEMA' → true");
assert(isNegative("nemam sliki"), true, "'nemam sliki' → true");
assert(isNegative("ne moze"), true, "'ne moze' → true");
assert(isNegative("bez"), true, "'bez' → true");

// ============================================================
// TEST GROUP: matchObjection
// ============================================================
console.log(`\n📦 GROUP: matchObjection`);

const obj1 = matchObjection("kako mislis bez provizija");
assert(obj1 !== null, "'kako mislis bez provizija' → matched");
assert(obj1?.key === 'commission', "'kako mislis bez provizija' → 'commission'");

const obj2 = matchObjection("ne veruvam na agencii");
assert(obj2 !== null, "'ne veruvam na agencii' → matched");
assert(obj2?.key === 'trust', "'ne veruvam na agencii' → 'trust'");

const obj3 = matchObjection("daj primer");
assert(obj3 !== null, "'daj primer' → matched");
assert(obj3?.key === 'example', "'daj primer' → 'example'");

const obj4 = matchObjection("kolku procenti zemate");
assert(obj4 !== null, "'kolku procenti zemate' → matched");
assert(obj4?.key === 'percentage', "'kolku procenti zemate' → 'percentage'");

const obj5 = matchObjection("kako vie pobrzo bi go prodale");
assert(obj5 !== null, "'kako vie pobrzo bi go prodale' → matched");
assert(obj5?.key === 'faster_sale', "→ 'faster_sale'");

// ============================================================
// TEST GROUP: classifyIntent (B12 FSM)
// ============================================================
console.log(`\n📦 GROUP: classifyIntent`);

// REJECTED cases
assertIntentEqual(classifyIntent("ne"), "REJECTED", 0.9, "'ne' → REJECTED");
assertIntentEqual(classifyIntent("ne sakam"), "REJECTED", 0.9, "B12: 'ne sakam' → REJECTED");
assertIntentEqual(classifyIntent("ne mi treba"), "REJECTED", 0.9, "'ne mi treba' → REJECTED");
assertIntentEqual(classifyIntent("ne sum zainteresiran"), "REJECTED", 0.9, "'ne sum zainteresiran' → REJECTED");
assertIntentEqual(classifyIntent("ne me interesira"), "REJECTED", 0.9, "'ne me interesira' → REJECTED");
assertIntentEqual(classifyIntent("ostavi me"), "REJECTED", 0.9, "'ostavi me' → REJECTED");
assertIntentEqual(classifyIntent("izvini, ne"), "REJECTED", 0.9, "'izvini, ne' → REJECTED");

// ACCEPTED cases
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.6, "'da' → ACCEPTED (real: standalone da = 0.6 low-confidence; 0.9 only with cooperation-question context)");
assertIntentEqual(classifyIntent("ajde"), "ACCEPTED", 0.8, "'ajde' → ACCEPTED");
assertIntentEqual(classifyIntent("moze"), "ACCEPTED", 0.65, "'moze' → ACCEPTED (real: standalone moze = 0.65 weak acceptance)");
assertIntentEqual(classifyIntent("dobro"), "ACCEPTED", 0.8, "'dobro' → ACCEPTED");
assertIntentEqual(classifyIntent("probame"), "ACCEPTED", 0.8, "'probame' → ACCEPTED");
assertIntentEqual(classifyIntent("sorabotuvame"), "ACCEPTED", 0.9, "'sorabotuvame' → ACCEPTED");
assertIntentEqual(classifyIntent("vo red"), "ACCEPTED", 0.8, "'vo red' → ACCEPTED");
assertIntentEqual(classifyIntent("zosto da ne"), "ACCEPTED", 0.8, "'zosto da ne' → ACCEPTED");
assertIntentEqual(classifyIntent("se soglasuvam"), "ACCEPTED", 0.9, "'se soglasuvam' → ACCEPTED");
assertIntentEqual(classifyIntent("prifakjam"), "ACCEPTED", 0.9, "'prifakjam' → ACCEPTED");

// INTERESTED cases
assertIntentEqual(classifyIntent("kako raboti?"), "INTERESTED", 0.7, "'kako raboti?' → INTERESTED");
assertIntentEqual(classifyIntent("koi se uslovite"), "INTERESTED", 0.7, "'koi se uslovite' → INTERESTED");
assertIntentEqual(classifyIntent("mozebi"), "INTERESTED", 0.6, "'mozebi' → INTERESTED");
assertIntentEqual(classifyIntent("ke razmislam"), "INTERESTED", 0.6, "'ke razmislam' → INTERESTED");
assertIntentEqual(classifyIntent("ne sum siguren"), "INTERESTED", 0.6, "'ne sum siguren' → INTERESTED");
assertIntentEqual(classifyIntent("interesno"), "INTERESTED", 0.7, "'interesno' → INTERESTED");
assertIntentEqual(classifyIntent("ne veruvam na agencii"), "INTERESTED", 0.5, "'ne veruvam na agencii' → INTERESTED");
assertIntentEqual(classifyIntent("kako vie bi go prodale"), "INTERESTED", 0.7, "'kako vie bi go prodale' → INTERESTED");
assertIntentEqual(classifyIntent("daj primer"), "INTERESTED", 0.7, "'daj primer' → INTERESTED");

// HESITATION GUARD — affirmative start + hesitation should be INTERESTED, not ACCEPTED
assertIntentEqual(classifyIntent("da da, jasnomi e ama sepak se mislam"), "INTERESTED", 0.6, "H1: 'da da, ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("da ama ne sum siguren"), "INTERESTED", 0.6, "H2: 'da ama ne sum siguren' → INTERESTED");
assertIntentEqual(classifyIntent("da sepak ne znam"), "INTERESTED", 0.6, "H3: 'da sepak ne znam' → INTERESTED");
assertIntentEqual(classifyIntent("da mozebi ke probame"), "INTERESTED", 0.6, "H4: 'da mozebi ke probame' → INTERESTED (mozebi hesitation downgrades via HESITATION_GUARD_WORDS)");
assertIntentEqual(classifyIntent("ajde ama sepak"), "INTERESTED", 0.6, "H5: 'ajde ama sepak' → INTERESTED");
assertIntentEqual(classifyIntent("da ke vidime"), "INTERESTED", 0.6, "H6: 'da ke vidime' → INTERESTED");
assertIntentEqual(classifyIntent("da ne sum rabotel so agencii"), "INTERESTED", 0.6, "H7: 'da ne sum rabotel so agencii' → INTERESTED");
assertIntentEqual(classifyIntent("dobro ama sepak se mislam"), "INTERESTED", 0.6, "H8: 'dobro ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("moze ama sepak"), "INTERESTED", 0.6, "H9: 'moze ama sepak' → INTERESTED");
assertIntentEqual(classifyIntent("da da, ke razmislam uste malce"), "INTERESTED", 0.6, "H10: 'da da, ke razmislam' → INTERESTED");

// Separately: standalone "sepak" should be INTERESTED (not ignored)
assertIntentEqual(classifyIntent("sepak ne sum siguren"), "INTERESTED", 0.5, "H11: 'sepak ne sum siguren' → INTERESTED");

// Confirm pure affirmatives still work correctly (no regression)
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.6, "REGRESSION: 'da' still → ACCEPTED (real: 0.6 standalone)");
assertIntentEqual(classifyIntent("da probame"), "ACCEPTED", 0.8, "REGRESSION: 'da probame' → ACCEPTED");
assertIntentEqual(classifyIntent("da sorabotuvame"), "ACCEPTED", 0.8, "REGRESSION: 'da sorabotuvame' → ACCEPTED");
assertIntentEqual(classifyIntent("ajde ajde"), "ACCEPTED", 0.8, "REGRESSION: 'ajde ajde' → ACCEPTED");  assertIntentEqual(classifyIntent("dobro. javete se"), "ACCEPTED", 0.8, "REGRESSION: 'dobro. javete se' → ACCEPTED");

// ============================================================
// CONTEXT-AWARE (B21) — classifyIntent with conversation history
// ============================================================
console.log(`  ── Context-aware rules (B21)`);

// Helper: build conv string with Ana's last message
function convWithAna(text) {
  return `Ана: Здраво, јас сум Ана од Metropolis - Агенција за Недвижности.
  Сопственик: KAKVI SE USLOVITE?
  Ана: ${text}`;
}

// Helper: build conv string with the last user message showing engagement
function convWithUserQuestion(userMsg) {
  return `Ана: Здраво, јас сум Ана од Metropolis - Агенција за Недвижности.
  Сопственик: ${userMsg}
  Ана: Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?`;
}

// Helper: build conv with previous user hesitation
function convWithHesitation(hesitationMsg) {
  return `Ана: Здраво, јас сум Ана од Metropolis - Агенција за Недвижности.
  Сопственик: ${hesitationMsg}
  Ана: Ве разбирам, имаме голем број клиенти заинтересирани. Дали сте расположени да соработуваме?
  Сопственик: da
Ана: Одлично! Која би била последната чиста цена за станот?`;
}

// RULE A: Objection context boost — Ana explaining commission should boost INTERESTED
assertIntentEqual(
  classifyIntent("kazete mi poveke", convWithAna("Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата.")),
  "INTERESTED", 0.6,
  "B21-A1: ambiguous reply → INTERESTED with commission context"
);

// RULE B: Previous user engagement → standalone "ne" downgraded from REJECTED
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KAKVI SE USLOVITE?")),
  "INTERESTED", 0.6,
  "B21-B1: 'ne' → INTERESTED when user previously asked a question"
);
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KOLKU PROVZIJA ZEMATE?")),
  "INTERESTED", 0.6,
  "B21-B2: 'ne' → INTERESTED when user asked about commission"
);
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KAKO RABOTI TOA?")),
  "INTERESTED", 0.6,
  "B21-B3: 'ne' → INTERESTED when user asked 'how does it work?'"
);

// RULE B (control): Without conversation context, standalone "ne" is still REJECTED
assertIntentEqual(
  classifyIntent("ne", ""),
  "REJECTED", 0.9,
  "B21-B4: 'ne' without context → still REJECTED"
);

// RULE C: Previous hesitation → standalone "da" downgraded to INTERESTED
assertIntentEqual(
  classifyIntent("da", convWithHesitation("mozebi ke probam ama ne sum siguren")),
  "INTERESTED", 0.5,
  "B21-C1: 'da' → INTERESTED when user previously hesitated"
);
assertIntentEqual(
  classifyIntent("da", convWithHesitation("se mislam uste")),
  "INTERESTED", 0.5,
  "B21-C2: 'da' → INTERESTED when user said 'se mislam'"
);

// RULE C (control): Without previous hesitation, "da" is still ACCEPTED
assertIntentEqual(
  classifyIntent("da", ""),
  "ACCEPTED", 0.6,
  "B21-C3: 'da' without hesitation context → still ACCEPTED (real: 0.6 standalone)"
);

// RULE C (control): Strong explicit acceptance overrides hesitation context
assertIntentEqual(
  classifyIntent("da sorabotuvame", convWithHesitation("mozebi")),
  "ACCEPTED", 0.8,
  "B21-C4: 'da sorabotuvame' → ACCEPTED regardless of context"
);

// NEW OBJECTION PATTERNS — expanded guard catches questions, other agencies, conditions, etc.
assertIntentEqual(classifyIntent("dobro zvuci. a sto ke pravime so toa sto jas vekje sorabotuvam so edna druga agencija?"), "INTERESTED", 0.6, "H12: 'dobro zvuci. a sto ke pravime so druga agencija?' → INTERESTED");
assertIntentEqual(classifyIntent("da, a kako ke funkcionira toa?"), "INTERESTED", 0.6, "H13: 'da, a kako ke funkcionira?' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, imam dogovor so druga agencija"), "INTERESTED", 0.6, "H14: 'dobro, imam dogovor so druga agencija' → INTERESTED");
assertIntentEqual(classifyIntent("da, vekje sorabotuvam so edna agencija"), "INTERESTED", 0.6, "H15: 'da, vekje sorabotuvam so agencija' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, sto ke pravime so garazata?"), "INTERESTED", 0.6, "H16: 'dobro, sto ke pravime?' → INTERESTED");
assertIntentEqual(classifyIntent("da, treba da prasam uste nesto"), "INTERESTED", 0.6, "H17: 'da, treba da prasam uste nesto' → INTERESTED");
assertIntentEqual(classifyIntent("moze, samo da proveram nesto"), "INTERESTED", 0.6, "H18: 'moze, samo da proveram nesto' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, prvo sakam da prasam nesto"), "INTERESTED", 0.6, "H19: 'dobro, prvo sakam da prasam' → INTERESTED");
assertIntentEqual(classifyIntent("dobro zvuci. vekje sorabotuvam so druga agencija"), "INTERESTED", 0.6, "H20: 'dobro zvuci. vekje sorabotuvam so druga' → INTERESTED");
assertIntentEqual(classifyIntent("ajde, ama sepak se mislam deka"), "INTERESTED", 0.6, "H21: 'ajde, ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("da, a dali moze da se dogovorime?"), "INTERESTED", 0.6, "H22: 'da, a dali moze da se dogovorime?' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, kako ke odi celiot proces?"), "INTERESTED", 0.6, "H23: 'dobro, kako ke odi procesot?' → INTERESTED");
assertIntentEqual(classifyIntent("da, sepak se mislam uste"), "INTERESTED", 0.6, "H24: 'da, sepak se mislam' → INTERESTED");

// Confirm pure affirmatives still work after new patterns (no regression)
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.6, "REGRESSION H: 'da' still → ACCEPTED (real: 0.6 standalone)");
assertIntentEqual(classifyIntent("dobro"), "ACCEPTED", 0.8, "REGRESSION H: 'dobro' still → ACCEPTED");
assertIntentEqual(classifyIntent("da probame"), "ACCEPTED", 0.8, "REGRESSION H: 'da probame' → ACCEPTED");

// Cyrillic variants (B12 critical — patterns must support both scripts)
assertIntentEqual(classifyIntent("ne sakam"), "REJECTED", 0.9, "B12 Cyrillic: 'ne sakam' (Latin) → REJECTED");
assertIntentEqual(classifyIntent("не сакам"), "REJECTED", 0.9, "B12 Cyrillic: 'не сакам' (Cyrillic) → REJECTED");
assertIntentEqual(classifyIntent("да"), "ACCEPTED", 0.6, "Cyrillic: 'да' (Cyrillic) → ACCEPTED (real: 0.6 standalone)");
assertIntentEqual(classifyIntent("не верувам на агенции"), "INTERESTED", 0.5, "Cyrillic: 'не верувам на агенции' → INTERESTED");
assertIntentEqual(classifyIntent("како работи?"), "INTERESTED", 0.7, "Cyrillic: 'како работи?' → INTERESTED");

// AMBIGUOUS default
const amb = classifyIntent("dali") || {};
assert(amb.intent === "INTERESTED" && amb.confidence === 0.5, "'dali' → INTERESTED 0.5 default", "INTERESTED 0.5", amb.intent + " " + amb.confidence);

// ============================================================
// TEST GROUP: extractTerraceNumber
// ============================================================
console.log(`\n📦 GROUP: extractTerraceNumber`);

assertEqual(extractTerraceNumber("ima 3 kvadrata e"), 3, "'ima 3 kvadrata e' → 3");
assertEqual(extractTerraceNumber("terasa 5 m2"), 5, "'terasa 5 m2' → 5");
assertEqual(extractTerraceNumber("nema"), null, "'nema' → null");

// ============================================================
// TEST GROUP: extractFirstNumber
// ============================================================
console.log(`\n📦 GROUP: extractFirstNumber`);

assertEqual(extractFirstNumber("105000 evra"), 1050, "'105000 evra' → 1050 (returns first 4 digits)");
assertEqual(extractFirstNumber("3 kvadrata"), 3, "'3 kvadrata' → 3");
assertEqual(extractFirstNumber("65m2"), 65, "'65m2' → 65");
assertEqual(extractFirstNumber("nema broj"), null, "'nema broj' → null");

// ============================================================
// TEST GROUP: countBedrooms
// ============================================================
console.log(`\n📦 GROUP: countBedrooms`);

// B5: "една голема спална и една детска" = 2
assertEqual(countBedrooms("EDNA GOLEMA SPALNA I EDNA DETSKA"), 2, "B5: 'EDNA GOLEMA SPALNA I ENA DETSKA' → 2");

// Known apartment types
assertEqual(countBedrooms("garsonjera"), 0, "garsonjera → 0");
assertEqual(countBedrooms("dvosoben stan"), 1, "dvosoben stan → 1");
assertEqual(countBedrooms("trisoben"), 2, "trisoben → 2");

// Simple number-based (handled by parseMacedonianNumber/extractFirstNumber fallback)
assertEqual(countBedrooms("2 spalni"), 2, "'2 spalni' → 2");
assertEqual(countBedrooms("tri spalni"), 3, "'tri spalni' → 3");

// Single bedroom word (roomCount=1, no number → returns 1)
assertEqual(countBedrooms("ima edna spalna"), 1, "'ima edna spalna' → 1");

// Compound: spalni doesn't match 'spalna', detska matches once → roomCount=1 < 2
// Falls through to parseMacedonianNumber: 'dve'=2 → returns 2
assertEqual(countBedrooms("dve spalni i detska"), 2, "'dve spalni i detska' → 2 (dve=2 via fallback)");

// Fallback to number word
assertEqual(countBedrooms("cetiri"), 4, "'cetiri' → 4 (fallback)");

// Multiple room-words: спална + детска = 2 (caught by roomCount >= 2)
assertEqual(countBedrooms("edna spalna i edna detska"), 2, "'edna spalna i edna detska' → 2 (room words)");  assertEqual(countBedrooms("spalna, detska i gostinska"), 3, "'spalna, detska i gostinska' → 3 (3 room words)");

  // Multi-room list parser: number-word + adjective + room-word patterns
  assertEqual(countBedrooms("dve golemi i edna detska"), 3, "'dve golemi i edna detska' → 3 (dve=2 + edna=1 via multi-room parser)");
  assertEqual(countBedrooms("tri golemi spalni i edna detska"), 4, "'tri golemi spalni i edna detska' → 4 (tri=3 + edna=1)");
  assertEqual(countBedrooms("dve golemi"), 2, "'dve golemi' → 2 (single segment falls through, handled by fallback)");
  assertEqual(countBedrooms("55 m2, 3 kat, ima lift"), null, "'55 m2, 3 kat, ima lift' → null (no room context in any segment)");

  // Additional multi-room patterns: Cyrillic/Latin variants, 3+ way splits
  assertEqual(countBedrooms("dva spalni i edna detska i edna gostinska"), 4, "'dva spalni i edna detska i edna gostinska' → 4 (dva=2 + edna=1 + edna=1)");
  assertEqual(countBedrooms("cetiri spalni i dve detski"), 6, "'cetiri spalni i dve detski' → 6 (cetiri=4 + dve=2)");
  assertEqual(countBedrooms("5 sobi"), 5, "'5 sobi' → 5 (digit + sobi via extractFirstNumber fallback)");

  // ============================================================
  // TIME-SPAN GUARD — "mesec dva" (a month or two) is TIME, not bedrooms
  // Reported: "PA AKO MOZE DA SE PRODADE ZA MESEC DVA BI BILO SUPER" logged
  // a confusing "REJECTED: bedrooms=2 (context mismatch)" — countBedrooms
  // grabbed "dva" from "mesec dva". Worse, "...mesec dva, golem e" would
  // have stored bedrooms=2 at HIGH (golem is a bedroom keyword).
  // ============================================================
  assertEqual(countBedrooms("pa ako moze da se prodade za mesec dva bi bilo super"), null, "reported: 'PA AKO MOZE DA SE PRODADE ZA MESEC DVA BI BILO SUPER' → null (time span, not bedrooms)");
  assertEqual(countBedrooms("mesec dva"), null, "'mesec dva' → null");
  assertEqual(countBedrooms("месец два"), null, "Cyrillic 'месец два' → null");
  assertEqual(countBedrooms("dva meseca"), null, "'dva meseca' → null");
  assertEqual(countBedrooms("za tri meseci"), null, "'za tri meseci' → null");
  assertEqual(countBedrooms("ke se prodade za nedela dve"), null, "'nedela dve' → null");
  assertEqual(countBedrooms("za dva dena ke vi pratam sliki"), null, "'dva dena' → null (two days, not bedrooms)");
  assertEqual(countBedrooms("ke prodadam za dve godini"), null, "'dve godini' → null (years, not bedrooms)");
  // Digit variant: "mesec 2" must also be guarded
  assertEqual(countBedrooms("da se prodade za mesec 2"), null, "'mesec 2' (digit) → null");
  // Controls — genuine bedroom answers still extract (no regression)
  assertEqual(countBedrooms("dve sobi"), 2, "CONTROL: 'dve sobi' → 2 (bedroom answer, no time span)");
  assertEqual(countBedrooms("2 spalni"), 2, "CONTROL: '2 spalni' → 2");
  assertEqual(countBedrooms("dve spalni i detska"), 2, "CONTROL: 'dve spalni i detska' → 2");
  assertEqual(countBedrooms("ima dve spalni, ke vi pratam sliki"), 2, "CONTROL: 'ima dve spalni, ke vi pratam sliki' → 2 (bedroom answer with mention of sending photos)");

  // ============================================================
  // stopeeset (сто+педесет=150) + i (and) + dve (2) = 152 × 1000 = 152000
  // ============================================================
  assertEqual(countBedrooms("stopeeset i dve iljadi"), null, "'stopeeset i dve iljadi' → null (not a bedroom message)");

  // ============================================================
  // TEST GROUP: parseOrientation
// ============================================================
console.log(`\n📦 GROUP: parseOrientation`);

const or1 = parseOrientation("sever");
assert(or1 !== null, "'sever' → parsed");
assert(or1?.includes('sever'), "'sever' contains 'sever'");

const or2 = parseOrientation("severistok");
assert(or2 !== null, "'severistok' → parsed");
assert(or2?.includes('sever'), "'severistok' contains 'sever'");
assert(or2?.includes('istok'), "'severistok' contains 'istok'");

const or3 = parseOrientation("jug");
assert(or3 !== null, "'jug' → parsed");
assert(or3?.includes('jug'), "'jug' contains 'jug'");

// ============================================================
// TEST GROUP: B13 — Multi-word price thousand parsing
// ============================================================
console.log(`\n📦 GROUP: B13 — Multi-word price thousand parsing`);

// The core bug: "stodvaeset i pet iljadi" = 125000
assertEqual(extractPrice("stodvaeset i pet iljadi"), 125000, "B13: 'stodvaeset i pet iljadi' → 125000");

// All variants of number phrases before iljadi
assertEqual(extractPrice("sto iljadi evra"), 100000, "B13: 'sto iljadi evra' → 100000");
assertEqual(extractPrice("dvesto iljadi"), 200000, "B13: 'dvesto iljadi' → 200000");
assertEqual(extractPrice("petstodvaeset iljadi"), 520000, "B13: 'petstodvaeset iljadi' → 520000");
assertEqual(extractPrice("dvaeset iljadi"), 20000, "B13: 'dvaeset iljadi' → 20000");
assertEqual(extractPrice("triest iljadi"), 30000, "B13: 'triest iljadi' → 30000");
// Viber spelling "trieset" (30) + spaced hundreds — reported production bug:
// "DVESTA TRIESET I OSUM ILJADI EVRA" was parsed as 200000 (stopped at "dvesta").
assertEqual(parseNumberWords("trieset"), 30, "B13: 'trieset' (Viber spelling) → 30");
assertEqual(parseNumberWords("триесет"), 30, "B13: 'триесет' (Cyrillic) → 30");
assertEqual(parseNumberWords("dvesta trieset i osum"), 238, "B13: 'dvesta trieset i osum' → 238");
assertEqual(extractPrice("dvesta trieset i osum iljadi evra"), 238000, "B13: 'dvesta trieset i osum iljadi evra' → 238000");
assertEqual(extractPrice("pedeset iljadi"), 50000, "B13: 'pedeset iljadi' → 50000");
assertEqual(extractPrice("seeset iljadi"), 60000, "B13: 'seeset iljadi' → 60000");
assertEqual(extractPrice("sedumdeset iljadi"), 70000, "B13: 'sedumdeset iljadi' → 70000");
assertEqual(extractPrice("trieste iljadi"), 300000, "B13: 'trieste iljadi' → 300000");// Multi-word with "i": stodvaeset i X iljadi
  assertEqual(extractPrice("stodvaeset i pet iljadi"), 125000, "B13: 'stodvaeset i pet iljadi' → 125000");

  // Priority 8 — Regression: irregular+number i X iljadi
  assertEqual(extractPrice("stopeeset i dve iljadi"), 152000, "B13: 'stopeeset i dve iljadi' → 152000");
  assertEqual(extractPrice("peeset i osum iljadi"), 58000, "B13: 'peeset i osum iljadi' → 58000");
  assertEqual(extractPrice("deveeset i tri iljadi"), 93000, "B13: 'deveeset i tri iljadi' → 93000");
assertEqual(extractPrice("stodvaeset i tri iljadi"), 123000, "B13: 'stodvaeset i tri iljadi' → 123000");
assertEqual(extractPrice("stotriest i cetiri iljadi"), 134000, "B13: 'stotriest i cetiri iljadi' → 134000");

// Regular single-word before iljadi (should still work)
assertEqual(extractPrice("pet iljadi"), 5000, "B13: 'pet iljadi' → 5000");
assertEqual(extractPrice("deset iljadi"), 10000, "B13: 'deset iljadi' → 10000");

// ============================================================
// TEST GROUP: B14 — Bedroom count variants
// ============================================================
console.log(`\n📦 GROUP: B14 — Bedroom count with plural + number+room`);

// Core bug: "dve spalni. edna pogolema drugata mala" = 2
assertEqual(countBedrooms("dve spalni. edna pogolema drugata mala"), 2, "B14: 'dve spalni. edna pogolema drugata mala' → 2");

// All number words + plural spalni
assertEqual(countBedrooms("edna spalni"), 1, "B14: 'edna spalni' → 1");
assertEqual(countBedrooms("dve spalni"), 2, "B14: 'dve spalni' → 2");
assertEqual(countBedrooms("tri spalni"), 3, "B14: 'tri spalni' → 3");
assertEqual(countBedrooms("cetiri spalni"), 4, "B14: 'cetiri spalni' → 4");
assertEqual(countBedrooms("pet spalni"), 5, "B14: 'pet spalni' → 5");
assertEqual(countBedrooms("sest spalni"), 6, "B14: 'sest spalni' → 6");assertEqual(countBedrooms("sedum spalni"), 7, "B14: 'sedum spalni' → 7");
  assertEqual(countBedrooms("osum spalni"), 8, "B14: 'osum spalni' → 8");

  // Semantic room-word counting (Priority 4 — room types without explicit numbers)
  assertEqual(countBedrooms("roditelska i detska"), 2, "B14: 'roditelska i detska' → 2 (room words)");
  assertEqual(countBedrooms("edna pogolema drugata pomala"), 2, "B14: 'edna pogolema drugata pomala' → 2 (room words)");

  // Plural room words should be matched
assertEqual(countBedrooms("dve detski"), 2, "B14: 'dve detski' → 2");
assertEqual(countBedrooms("edna gostinska i edna spalna"), 2, "B14: 'edna gostinska i edna spalna' → 2");  assertEqual(countBedrooms("dve spalni i edna detska"), 3, "B14: 'dve spalni i edna detska' → 3 (dve=2 + edna=1 via multi-room parser)");

// ============================================================
// TEST GROUP: B15 — Terrace word-based numbers
// ============================================================
console.log(`\n📦 GROUP: B15 — Terrace word-based numbers`);

// Core bug: "cetiri" (word-based) should work
assertEqual(extractTerraceNumber("cetiri"), 4, "B15: 'cetiri' → 4");

// All Macedonian number words for terrace size
assertEqual(extractTerraceNumber("edna"), 1, "B15: 'edna' → 1");
assertEqual(extractTerraceNumber("dve"), 2, "B15: 'dve' → 2");
assertEqual(extractTerraceNumber("tri"), 3, "B15: 'tri' → 3");
assertEqual(extractTerraceNumber("cetiri"), 4, "B15: 'cetiri' → 4");
assertEqual(extractTerraceNumber("pet"), 5, "B15: 'pet' → 5");
assertEqual(extractTerraceNumber("sest"), 6, "B15: 'sest' → 6");
assertEqual(extractTerraceNumber("sedum"), 7, "B15: 'sedum' → 7");
assertEqual(extractTerraceNumber("osum"), 8, "B15: 'osum' → 8");
assertEqual(extractTerraceNumber("devet"), 9, "B15: 'devet' → 9");
assertEqual(extractTerraceNumber("deset"), 10, "B15: 'deset' → 10");

// Cyrillic variants
assertEqual(extractTerraceNumber("четири"), 4, "B15: 'четири' → 4 (Cyrillic)");
assertEqual(extractTerraceNumber("пет"), 5, "B15: 'пет' → 5 (Cyrillic)");

// Digit variants still work
assertEqual(extractTerraceNumber("4"), 4, "B15: '4' → 4");
assertEqual(extractTerraceNumber("5 m2"), 5, "B15: '5 m2' → 5");
assertEqual(extractTerraceNumber("nema"), null, "B15: 'nema' → null");

// ============================================================
// TEST GROUP: B16 — Heating type detection patterns (COMPREHENSIVE)
// ============================================================
console.log(`\n📦 GROUP: B16 — Heating type detection patterns (comprehensive)`);

// Replica of the runtime heating vocabulary in handlers/data-collection.js
// (runComplexStatefulHandlers, "heating (FIXED — parno follow-up, B16)").
// Kept here because that handler is not exported; the global extractHeating
// in data-collector.js has different semantics and is tested separately.
// District: /gradsko|граѓско|dalinsko|toplovod|beg|centralno|централно|central/i
//   (centralno/central = централно парно = градско, NOT private — reported bug)
// Private central: /sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i
// Inverter: /klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i
// Electric: /struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i
// Solid_fuel/oil: /drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i
//   Sub-check: /drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i → wood_pellets, else → oil
function testHeatingPattern(u) {
  if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg|centralno|централно|central/i.test(u)) return "district";
  if (/sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) return "private_central";
  if (/klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u)) return "inverter";
  if (/struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i.test(u)) return "electric";
  if (/drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i.test(u)) {
    if (/drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i.test(u)) return "wood_pellets";
    return "oil";
  }
  if (/parno|парно/i.test(u)) return "parno_bare";
  return null;
}

// ── DISTRICT tests ──
console.log(`  ── District variants`);
assertEqual(testHeatingPattern("gradsko"), "district", "B16: 'gradsko' → district");
assertEqual(testHeatingPattern("dalinsko"), "district", "B16: 'dalinsko' → district");
assertEqual(testHeatingPattern("dalecno"), "district", "B16: 'dalecno' (alternate) → district");
assertEqual(testHeatingPattern("toplovod"), "district", "B16: 'toplovod' → district");
assertEqual(testHeatingPattern("beg"), "district", "B16: 'beg' → district");
assertEqual(testHeatingPattern("gradsko parno"), "district", "B16: 'gradsko parno' → district");

// ── PRIVATE CENTRAL tests ──
console.log(`  ── Private central variants`);
assertEqual(testHeatingPattern("centralno"), "district", "B16: 'centralno' → district (централно парно = градско)");
assertEqual(testHeatingPattern("central"), "district", "B16: 'central' → district");
assertEqual(testHeatingPattern("централно"), "district", "B16: 'централно' (Cyrillic) → district");
assertEqual(testHeatingPattern("sopstveno"), "private_central", "B16: 'sopstveno' → private_central");
assertEqual(testHeatingPattern("сопствено"), "private_central", "B16: 'сопствено' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("individualno"), "private_central", "B16: 'individualno' → private_central");
assertEqual(testHeatingPattern("индивидуално"), "private_central", "B16: 'индивидуално' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("svoja"), "private_central", "B16: 'svoja' → private_central");
assertEqual(testHeatingPattern("kotel"), "private_central", "B16: 'kotel' → private_central");
assertEqual(testHeatingPattern("kotlarnica"), "private_central", "B16: 'kotlarnica' → private_central");
assertEqual(testHeatingPattern("sopstvena"), "private_central", "B16: 'sopstvena' → private_central");
assertEqual(testHeatingPattern("moe"), "private_central", "B16: 'moe' → private_central");
assertEqual(testHeatingPattern("nase"), "private_central", "B16: 'nase' → private_central");
assertEqual(testHeatingPattern("licno"), "private_central", "B16: 'licno' → private_central");
assertEqual(testHeatingPattern("zgradata"), "private_central", "B16: 'zgradata' → private_central");
assertEqual(testHeatingPattern("na zgradata"), "private_central", "B16: 'na zgradata' → private_central");

// ── PRIVATE CENTRAL: compound phrases ──
console.log(`  ── Private central: compound phrases`);
assertEqual(testHeatingPattern("moe parno"), "private_central", "B16: 'moe parno' → private_central");
assertEqual(testHeatingPattern("мое парно"), "private_central", "B16: 'мое парно' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("nase parno"), "private_central", "B16: 'nase parno' → private_central");
assertEqual(testHeatingPattern("наше парно"), "private_central", "B16: 'наше парно' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("licno parno"), "private_central", "B16: 'licno parno' → private_central");
assertEqual(testHeatingPattern("parno moe"), "private_central", "B16: 'parno moe' → private_central");
assertEqual(testHeatingPattern("parno nase"), "private_central", "B16: 'parno nase' → private_central");
assertEqual(testHeatingPattern("parno licno"), "private_central", "B16: 'parno licno' → private_central");
assertEqual(testHeatingPattern("parno na zgradata"), "private_central", "B16: 'parno na zgradata' → private_central");
assertEqual(testHeatingPattern("sopstveno parno"), "private_central", "B16: 'sopstveno parno' → private_central");
assertEqual(testHeatingPattern("сопствено парно"), "private_central", "B16: 'сопствено парно' (Cyrillic) → private_central");

// ── INVERTER tests ──
console.log(`  ── Inverter variants`);
assertEqual(testHeatingPattern("klima"), "inverter", "B16: 'klima' → inverter");
assertEqual(testHeatingPattern("inverter"), "inverter", "B16: 'inverter' → inverter");
assertEqual(testHeatingPattern("split"), "inverter", "B16: 'split' → inverter");
assertEqual(testHeatingPattern("invertor"), "inverter", "B16: 'invertor' (alternate) → inverter");
assertEqual(testHeatingPattern("klima inverter"), "inverter", "B16: 'klima inverter' → inverter");
assertEqual(testHeatingPattern("термопумпа"), "inverter", "B16: 'термопумпа' → inverter");
assertEqual(testHeatingPattern("toplotna"), "inverter", "B16: 'toplotna' → inverter");
assertEqual(testHeatingPattern("na klima"), "inverter", "B16: 'na klima' → inverter");
assertEqual(testHeatingPattern("se gream"), "inverter", "B16: 'se gream' → inverter");

// ── ELECTRIC tests ──
console.log(`  ── Electric variants`);
assertEqual(testHeatingPattern("struja"), "electric", "B16: 'struja' → electric");
assertEqual(testHeatingPattern("electric"), "electric", "B16: 'electric' → electric");
assertEqual(testHeatingPattern("термо"), "electric", "B16: 'термо' → electric");
assertEqual(testHeatingPattern("termo"), "electric", "B16: 'termo' → electric");
assertEqual(testHeatingPattern("radijatori"), "electric", "B16: 'radijatori' → electric");
assertEqual(testHeatingPattern("kalorifer"), "electric", "B16: 'kalorifer' → electric");

// ── SOLID FUEL / WOOD PELLETS tests ──
console.log(`  ── Solid fuel / wood pellets variants`);
assertEqual(testHeatingPattern("drva"), "wood_pellets", "B16: 'drva' → wood_pellets");
assertEqual(testHeatingPattern("na drva"), "wood_pellets", "B16: 'na drva' → wood_pellets");
assertEqual(testHeatingPattern("peleti"), "wood_pellets", "B16: 'peleti' → wood_pellets");
assertEqual(testHeatingPattern("pellet"), "wood_pellets", "B16: 'pellet' → wood_pellets");
assertEqual(testHeatingPattern("ogrev"), "wood_pellets", "B16: 'ogrev' → wood_pellets");

// ── OIL tests ──
console.log(`  ── Oil variants`);
assertEqual(testHeatingPattern("nafta"), "oil", "B16: 'nafta' → oil");
assertEqual(testHeatingPattern("loz"), "oil", "B16: 'loz' → oil");
assertEqual(testHeatingPattern("jaglen"), "oil", "B16: 'jaglen' → oil");
assertEqual(testHeatingPattern("uglen"), "oil", "B16: 'uglen' → oil");

// ── BARE PARNO (triggers follow-up) ──
console.log(`  ── Bare parno (triggers follow-up)`);
assertEqual(testHeatingPattern("parno"), "parno_bare", "B16: bare 'parno' → triggers follow-up");
assertEqual(testHeatingPattern("парно"), "parno_bare", "B16: bare 'парно' (Cyrillic) → triggers follow-up");

// ── DISTINCTNESS: ensure district and private_central don't overlap ──
console.log(`  ── Distinctness checks`);
// 'gradsko' should NOT match private_central
assertEqual(testHeatingPattern("gradsko"), "district", "B16: 'gradsko' → district (not private_central)");
// 'centralno' now IS district (reported bug: owner answers 'CENTRALNO' → gradsko)
assertEqual(testHeatingPattern("centralno"), "district", "B16: 'centralno' → district (не private_central)");
// Compound with both should resolve by order: district patterns checked first
assertEqual(testHeatingPattern("gradsko centralno"), "district", "B16: 'gradsko centralno' → district (matches first)");
// Even with centralno first, gradsko in string still matches district (first pattern wins)
assertEqual(testHeatingPattern("centralno gradsko"), "district", "B16: 'centralno gradsko' → district (district checked first, gradsko found)");

// ============================================================
// TEST GROUP: B17 — Renovation year word-based relative years
// ============================================================
console.log(`\n📦 GROUP: B17 — Word-based relative years (pred X godini)`);

// Verify parseMacedonianNumber works for all relative year number words
assertEqual(parseMacedonianNumber("pred edna godina"), 1, "B17: 'edna' found in 'pred edna godina'");
assertEqual(parseMacedonianNumber("pred dve godini"), 2, "B17: 'dve' found in 'pred dve godini'");
assertEqual(parseMacedonianNumber("pred tri godini"), 3, "B17: 'tri' found in 'pred tri godini'");
assertEqual(parseMacedonianNumber("pred cetiri godini"), 4, "B17: 'cetiri' found in 'pred cetiri godini'");
assertEqual(parseMacedonianNumber("pred pet godini"), 5, "B17: 'pet' found in 'pred pet godini'");
assertEqual(parseMacedonianNumber("pred sest godini"), 6, "B17: 'sest' found in 'pred sest godini'");
assertEqual(parseMacedonianNumber("pred sedum godini"), 7, "B17: 'sedum' found in 'pred sedum godini'");
assertEqual(parseMacedonianNumber("pred osum godini"), 8, "B17: 'osum' found in 'pred osum godini'");
assertEqual(parseMacedonianNumber("pred devet godini"), 9, "B17: 'devet' found in 'pred devet godini'");
assertEqual(parseMacedonianNumber("pred deset godini"), 10, "B17: 'deset' found in 'pred deset godini'");

// Cyrillic variants
assertEqual(parseMacedonianNumber("пред две години"), 2, "B17: 'две' found in Cyrillic");
assertEqual(parseMacedonianNumber("пред три години"), 3, "B17: 'три' found in Cyrillic");
assertEqual(parseMacedonianNumber("пред четири години"), 4, "B17: 'четири' found in Cyrillic");

// Digits are handled by a separate code path (not parseMacedonianNumber)

// ============================================================
// SUMMARY
// ============================================================
const summary = harness.summary('ANA FIXTURE SUITE');
console.log(`\n${summary.failed === 0 ? '🟢' : '🔴'} ${summary.failed === 0 ? 'ALL TESTS PASSED' : summary.failed + ' TEST(S) FAILED'} — this is the BASELINE.`);
harness.exit();
