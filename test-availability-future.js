// ============================================================
// test-availability-future.js — FUTURE-AVAILABILITY spectrum
// ============================================================
// Reported (lead pz186272900): the owner answered the first message with
// "SLOBODEN KE BIDE OD SEPTEMVRI" (it WILL be free from September) and the
// availability acknowledgment never fired — the detector only knew the
// present tense ("sloboden e") and, by accident, the REVERSED order
// ("ke bide sloboden" via "e sloboden" inside "bide sloboden"). The
// reported word order and all other genders missed, so the LLM gave a
// generic (and factually off) reply instead of the availability ack.
//
// Covers:
//   1. Detection matrix — both word orders, all genders, Latin + Cyrillic
//   2. Negatives — "ne e sloboden" (NOT free) must never get the ack
//   3. SALE: future form → future-aware ack echoing the volunteered date
//   4. SALE: present tense → unchanged still-available ack
//   5. RENT: future form + date → temp-unavailable path, availableFrom captured
//   6. RENT: future form without date → "when free?" date question
//
// Fully offline — no LLM calls.
// Run: node test-availability-future.js
// ============================================================
import { createHarness } from './test-helpers.js';
import {
  isAvailabilityConfirmation,
  runEarlyResponses,
  AVAILABILITY_POSITIVE_RE,
  AVAILABILITY_FUTURE_RE
} from './handlers/early-responses.js';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// Session factory — pre-cooperation, PERSUASION
// ============================================================
function mkSession(isRent = false) {
  return {
    adMemory: {
      transactionType: isRent ? 'rent' : 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: false,
      transactionType: isRent ? 'rent' : 'sale'
    },
    messages: [],
    phone: '+38970000001',
    phase: 'PERSUASION',
    pendingFollowUp: null,
    pendingConfirmation: null,
    questionAttempts: {},
    rejectionCount: 0
  };
}

// ============================================================
// 1. DETECTION MATRIX — every future-availability form must confirm
// ============================================================
{
  const positives = [
    // Reported message + family (sloboden/dostapen FIRST, ke bide AFTER)
    'SLOBODEN KE BIDE OD SEPTEMVRI',
    'sloboden ke bide',
    'slobodna ke bide od septemvri',
    'slobodno ke bide od septemvri',
    'slobodni ke bide',
    'dostapen ke bide od septemvri',
    'dostapna ke bide',
    'dostapno ke bide',
    'dostapni ke bide',
    // ke bide FIRST
    'KE BIDE SLOBODEN OD SEPTEMVRI',
    'ke bide slobodna od septemvri',
    'ke bide slobodno',
    'ke bide slobodni',
    'ke bide dostapen od septemvri',
    'ke bide dostapna',
    'ke bide dostapno',
    'ke bide dostapni',
    // Cyrillic
    'СЛОБОДЕН ЌЕ БИДЕ ОД СЕПТЕМВРИ',
    'слободна ќе биде од септември',
    'ќе биде слободен од септември',
    'достапен ќе биде од септември'
  ];
  for (const m of positives) {
    assert(`positive: ${JSON.stringify(m)}`, isAvailabilityConfirmation(m), `got false`);
  }
}

// ============================================================
// 2. NEGATIVES — NOT-free statements must never get the ack
// ============================================================
{
  const negatives = [
    'ne e sloboden',                      // it's NOT free
    'ne e slobodna',
    'NE E SLOBODEN, AMA KE BIDE OD SEPTEMVRI', // not free now — temp unavailable
    'kolku kvadrati ima',
    'sakam da go prodadam brzo',
    'kade e brojot na agencijata'
  ];
  for (const m of negatives) {
    assert(`negative: ${JSON.stringify(m)}`, !isAvailabilityConfirmation(m), `got true`);
  }
}

// ============================================================
// 3. SALE — reported message → future-aware ack echoing the date
// ============================================================
{
  const session = mkSession(false);
  const resp = runEarlyResponses({ u: 'sloboden ke bide od septemvri', isRent: false, session });
  assert('sale future → returns a response', resp !== null, 'null');
  assert('sale future → NORMAL type', resp && resp.type === 'NORMAL', `got ${resp?.type}`);
  assert('sale future → future wording (ќе биде слободен)', /ќе биде слободен/.test(resp.text), resp.text);
  assert('sale future → echoes the volunteered date', /од септември/.test(resp.text), resp.text);
  assert('sale future → sale pitch without commission', /без провизија|без никакви давачки|без никакви обврски/.test(resp.text), resp.text);
  assert('sale future → marks availabilityAcknowledged', session.availabilityAcknowledged === true, 'not acked');
  assert('sale future → does NOT capture availableFrom (sale = rent-only by design)', session.collectedData.availableFrom === undefined, `got ${JSON.stringify(session.collectedData.availableFrom)}`);
}

// ============================================================
// 4. SALE — present tense still uses the still-available ack
// ============================================================
{
  const session = mkSession(false);
  const resp = runEarlyResponses({ u: 'sloboden e', isRent: false, session });
  assert('sale present → returns a response', resp !== null, 'null');
  assert('sale present → still-available wording', /сè уште достапен/.test(resp.text), resp.text);
  assert('sale present → NOT future wording', !/ќе биде слободен/.test(resp.text), resp.text);
}

// ============================================================
// 5. RENT — future form + date → temp-unavailable, availableFrom captured
// ============================================================
{
  const session = mkSession(true);
  const resp = runEarlyResponses({ u: 'sloboden ke bide od septemvri', isRent: true, session });
  assert('rent future+date → returns a response', resp !== null, 'null');
  assert('rent future+date → captures availableFrom', typeof session.collectedData.availableFrom === 'string' && session.collectedData.availableFrom.length > 0, `got ${JSON.stringify(session.collectedData.availableFrom)}`);
  assert('rent future+date → reply mentions the date', /септември|9/i.test(resp.text), resp.text);
  assert('rent future+date → reply mentions free-from', /слободен|слободна/.test(resp.text), resp.text);
}

// ============================================================
// 6. RENT — future form without a date → "when free?" question
// ============================================================
{
  const session = mkSession(true);
  const resp = runEarlyResponses({ u: 'sloboden ke bide', isRent: true, session });
  assert('rent future no-date → QUESTION (when free?)', resp && resp.type === 'QUESTION', `got ${resp?.type}`);
  assert('rent future no-date → marks awaitingAvailableFrom', session.awaitingAvailableFrom === true, 'not marked');
}

// ============================================================
// 7a. SALE — dotted-date variants echo whole ("OD 7.15.2026" → "од 7.15.2026",
//     never the truncated "од 7")
// ============================================================
{
  for (const [m, tail] of [
    ['sloboden ke bide od 7.15.2026', '7.15.2026'],
    ['ke bide sloboden od 07.15.2026', '07.15.2026'],
    ['sloboden ke bide od 15ti septemvri', '15ti септември']
  ]) {
    const session = mkSession(false);
    const resp = runEarlyResponses({ u: m, isRent: false, session });
    assert(`sale dotted-date "${m}" → echoes "${tail}"`, resp && resp.text.includes(tail), resp?.text);
  }
}

// ============================================================
// 7b. DRIFT GUARD — the ke-bide family must stay embedded in the
//     detector literals (AVAILABILITY_POSITIVE_RE / RENT_TEMP_UNAVAIL_RE)
//     so the shared AVAILABILITY_FUTURE_RE can never silently diverge
// ============================================================
{
  const family = AVAILABILITY_FUTURE_RE.source;
  assert('drift: AVAILABILITY_POSITIVE_RE embeds the full future family',
    AVAILABILITY_POSITIVE_RE.source.includes(family), 'family missing from AVAILABILITY_POSITIVE_RE');
}

// ============================================================
// 7. SALE — reversed-order variants all get the ack too
// ============================================================
{
  const variants = [
    'KE BIDE SLOBODEN OD SEPTEMVRI',
    'ke bide slobodna od septemvri',
    'dostapen ke bide od septemvri',
    'СЛОБОДЕН ЌЕ БИДЕ ОД СЕПТЕМВРИ'
  ];
  for (const v of variants) {
    const session = mkSession(false);
    const resp = runEarlyResponses({ u: v, isRent: false, session });
    assert(`sale variant "${v}" → NORMAL ack`, resp && resp.type === 'NORMAL', `got ${resp?.type}`);
    assert(`sale variant "${v}" → future wording`, /ќе биде слободен/.test(resp.text), resp.text);
    // Cyrillic message must still echo the date (JS \b is ASCII-only — the
    // od/од anchor is whitespace-based, so Cyrillic input is covered too)
    if (/[а-я]/i.test(v)) {
      assert(`sale variant "${v}" → echoes date in Cyrillic too`, /од септември/.test(resp.text), resp.text);
    }
  }
}

console.log(`\n==================================================`);
console.log(harness.failed > 0 ? `   ❌ Failed: ${harness.failed}` : `   ✅ All ${harness.passed} availability-future tests passed`);
console.log(`   📋 Total: ${harness.passed + harness.failed}`);
console.log(`==================================================`);
if (harness.failed > 0) process.exit(1);
console.log(`\n🟢 AVAILABILITY-FUTURE TESTS PASSED`);
