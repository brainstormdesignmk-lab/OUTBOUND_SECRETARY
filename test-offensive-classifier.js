import { createHarness } from './test-helpers.js';
// ========================================
// TESTS: offensive-classifier.js
// ========================================
// Tests the new normalizer (transliteration folding) and the data-driven
// lexicon engine. detectOffensive() in offensive-filter.js is a thin wrapper
// over classifyOffensive(), so the full 135-assertion test-offensive-filter.js
// suite already re-verifies the lexicon end-to-end; this file focuses on:
//   1. normalize() — the new transliteration/leetspeak folding layer
//   2. classifyOffensive() — direct lexicon matches + guards + metadata
//
// Run: node test-offensive-classifier.js
// ========================================

import { normalize, classifyOffensive } from './offensive-classifier.js';

const harness = createHarness();
const assert = harness.assert;



function testGroup(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) {
    t();
  }
}

// ========================================
// GROUP 1: normalize() — transliteration folding
// ========================================
testGroup('normalize() — canonical casual Viber Latin folding', [
  // Latin input is already canonical (identity pass)
  () => assert('picka → picka (identity)', normalize('picka') === 'picka', `got "${normalize('picka')}"`),
  () => assert('pichka → picka (ch→c h-drop)', normalize('pichka') === 'picka', `got "${normalize('pichka')}"`),
  () => assert('pi4ka → picka (leetspeak 4=c)', normalize('pi4ka') === 'picka', `got "${normalize('pi4ka')}"`),
  () => assert('devojce → devojce (identity)', normalize('devojce') === 'devojce', `got "${normalize('devojce')}"`),
  () => assert('DALI SE EBETE ZA PROVIZIJA ? → dali se ebete za provizija',
    normalize('DALI SE EBETE ZA PROVIZIJA ?') === 'dali se ebete za provizija', `got "${normalize('DALI SE EBETE ZA PROVIZIJA ?')}"`),
  () => assert('ke te ubijam → ke te ubijam (identity)', normalize('ke te ubijam') === 'ke te ubijam', `got "${normalize('ke te ubijam')}"`),
  // Cyrillic folds INTO the same canonical Latin form
  () => assert('пичка → picka', normalize('пичка') === 'picka', `got "${normalize('пичка')}"`),
  () => assert('ке те убијам → ke te ubijam (ј→j)', normalize('ке те убијам') === 'ke te ubijam', `got "${normalize('ке те убијам')}"`),
  () => assert('ќе бидеш ли фино девојче за мене → kje bides li fino devojce za mene',
    normalize('ќе бидеш ли фино девојче за мене') === 'kje bides li fino devojce za mene', `got "${normalize('ќе бидеш ли фино девојче за мене')}"`),
  // Diacritics + digraph folds
  () => assert('zamolchi → zamolci (ch→c h-drop)', normalize('zamolchi') === 'zamolci', `got "${normalize('zamolchi')}"`),
  () => assert('замолчи → zamolci', normalize('замолчи') === 'zamolci', `got "${normalize('замолчи')}"`),
  () => assert('kjuti → kjuti (identity)', normalize('kjuti') === 'kjuti', `got "${normalize('kjuti')}"`),
  () => assert('ќути → kjuti (ќ→kj)', normalize('ќути') === 'kjuti', `got "${normalize('ќути')}"`),
  () => assert('marš → mars (š→s)', normalize('marš') === 'mars', `got "${normalize('marš')}"`),
  () => assert('женски → zenski (ж→z, ш→s)', normalize('женски') === 'zenski', `got "${normalize('женски')}"`),
  () => assert('elena 2000 → elena 2000 (digits preserved)', normalize('elena 2000') === 'elena 2000', `got "${normalize('elena 2000')}"`),
  () => assert('dojdes kaj mene → dojdes kaj mene (identity)', normalize('dojdes kaj mene') === 'dojdes kaj mene', `got "${normalize('dojdes kaj mene')}"`),
  () => assert('колку години имаш → kolku godini imas (ш→s)', normalize('колку години имаш') === 'kolku godini imas', `got "${normalize('колку години имаш')}"`),
  () => assert('pomines kaj mene vecerva → pomines kaj mene vecerva (identity)', normalize('pomines kaj mene vecerva') === 'pomines kaj mene vecerva', `got "${normalize('pomines kaj mene vecerva')}"`),
  () => assert('kje pomines → kje pomines (identity)', normalize('kje pomines') === 'kje pomines', `got "${normalize('kje pomines')}"`),
  () => assert('пушење → pusenje (њ→nj)', normalize('пушење') === 'pusenje', `got "${normalize('пушење')}"`),
  () => assert('да ми пушиш → da mi pusis', normalize('да ми пушиш') === 'da mi pusis', `got "${normalize('да ми пушиш')}"`),
  () => assert('empty input → empty string', normalize('') === '', `got "${normalize('')}"`),
  () => assert('whitespace input → empty string', normalize('   ') === '', `got "${normalize('   ')}"`),
]);

// ========================================
// GROUP 2: classifyOffensive — lexicon matches (parity spot-checks)
// ========================================
testGroup('classifyOffensive() — lexicon matches', [
  () => {
    const r = classifyOffensive('si dobra picka');
    assert('picka → severity 3 sexual', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('DALI SE EBETE ZA PROVIZIJA ?');
    assert('DALI SE EBETE... → severity 3 sexual', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('ми требам');
    assert('ми требам → NOT offensive (ебам boundary)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('SAKAM DA MI BIDES DEVOJKA');
    assert('S1 → severity 3 sexual', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('DALI KJE POMINES KAJ MENE VECERVA ?');
    assert('S7 → severity 3 sexual (vecerva)', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('ke dojdes kaj mene da go vidis stanot');
    assert('bare viewing invite → NOT offensive (S7 needs vecer)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('ke te ubijam');
    assert('ke te ubijam → severity 3 violence', r.isOffensive && r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('KOLKU GODINI IMAS ANA ?');
    assert('C1 (age question) → NOT offensive (deflected via objections.js, not struck)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('kolku godini imas iskustvo vo agencija?');
    assert('years of experience → NOT offensive (C1 exclude)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('EDVAJ CEKAM DA TE ZAPOZNAAM');
    assert('C12 → severity 2 creepy', r.isOffensive && r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('sakam da te zapoznaam so klientot');
    assert('introduce you TO the client → NOT offensive (C12 excludeAfter)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('ZAMOLCHI VECHE');
    assert('O1 → severity 1 mild', r.isOffensive && r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('TUPO DEVOJCE');
    assert('O2 → severity 2 heavy_insult', r.isOffensive && r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('tup agol ima sobata');
    assert('tup agol (obtuse angle) → NOT offensive', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('imam dozvola za gradba');
    assert('dozvola → NOT offensive (vol boundary)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('vol eden, be');
    assert('standalone vol → heavy_insult', r.isOffensive && r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('elena 2000');
    assert('elena 2000 → severity 3 sexual (digits required)', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('elena e moja sestra');
    assert('elena without digits → NOT offensive', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('dali ima gratis pusenje so toa ?');
    assert('PRODUCTION MISS → severity 3 sexual (gratis pusenje)', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('pusi mi');
    assert('pusi mi → severity 3 sexual', r.isOffensive && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('dali smee pusenje vo stanot?');
    assert('smoking allowed? → NOT offensive (exclude)', !r.isOffensive, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('Здраво, како сте?');
    assert('normal greeting → NOT offensive', !r.isOffensive, JSON.stringify(r));
  },
]);

// ========================================
// GROUP 3: classifyOffensive — metadata (confidence + reason)
// ========================================
testGroup('classifyOffensive() — metadata', [
  () => {
    const r = classifyOffensive('ебам');
    assert('confidence present for sexual', typeof r.confidence === 'number' && r.confidence > 0.9, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('KJUTI');
    assert('reason string present', typeof r.reason === 'string' && r.reason.length > 0, JSON.stringify(r));
  },
  () => {
    const r = classifyOffensive('kako odi so prodazbata?');
    assert('clean message → confidence 0, reason null', r.confidence === 0 && r.reason === null, JSON.stringify(r));
  },
]);

// ========================================
// SUMMARY
// ========================================
console.log(`\n==================================================`);
const total = harness.passed + harness.failed;
const pct = total > 0 ? Math.round(harness.passed / total * 100) : 0;
const status = harness.failed === 0 ? '🟢 ALL TESTS PASSED' : `🔴 ${harness.failed} TEST(S) FAILED`;
console.log(`\n${status}`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${total}`);
console.log(`   📊 Score:  ${pct}%`);
console.log(`==================================================\n`);
process.exit(harness.failed > 0 ? 1 : 0);
