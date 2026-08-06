import { createHarness } from './test-helpers.js';
// ========================================
// TEST: Script-consistency guards (mixed Latin/Cyrillic + dangling conjunctions)
// ========================================
// Reproduces the reported LLM anomaly:
//   "Нашата услуга се состои од промоција на имотот кај голем број
//    клиенти и потencijални и. Како ви звучи ова?"
//   - "потencijални" — mixed Latin/Cyrillic script (пот + encij + ални)
//   - trailing "и" — dangling duplicated conjunction
//   - truncated phrase
// ========================================

import {
  hasMixedScript,
  fixMixedScript,
  hasDanglingConjunction,
  stripDanglingConjunction,
  cleanResponse
} from './guardrails.js';
import { postProcessPersuasionResponse, buildPersuasionPrompt } from './persuasion.js';

const harness = createHarness();
const assert = harness.assert;



console.log('\n========================================');
console.log('🧪 SCRIPT-GUARD: mixed Latin/Cyrillic detection');
console.log('========================================\n');

// --- hasMixedScript ---
assert('"потencijални" detected as mixed script',
  hasMixedScript('потencijални') === true,
  'потencijални should be flagged');

assert('"Нашата услуга ... клиенти и потencijални и." detected',
  hasMixedScript('Нашата услуга се состои од промоција на имотот кај голем број клиенти и потencijални и.') === true,
  'full reported sentence should be flagged');

assert('pure Cyrillic NOT flagged',
  hasMixedScript('Драго ми е што станот е сè уште достапен') === false,
  'pure Cyrillic must not be flagged');

assert('pure Latin NOT flagged',
  hasMixedScript('This is a test message') === false,
  'pure Latin must not be flagged');

assert('short words (1 letter) NOT flagged',
  hasMixedScript('а') === false,
  'single-letter words must not be flagged');

assert('empty text NOT flagged',
  hasMixedScript('') === false,
  'empty string returns false');

// --- fixMixedScript ---
assert('"потencijални" → "потенцијални"',
  fixMixedScript('потencijални') === 'потенцијални',
  `Got: ${fixMixedScript('потencijални')}`);

assert('"клиенти и потencijални и" → "клиенти и потенцијални и" (script fixed, conj intact for now)',
  fixMixedScript('клиенти и потencijални и') === 'клиенти и потенцијални и',
  `Got: ${fixMixedScript('клиенти и потencijални и')}`);

assert('pure Cyrillic unchanged by fixMixedScript',
  fixMixedScript('Драго ми е') === 'Драго ми е',
  'pure text must pass through unchanged');

console.log('\n========================================');
console.log('🧪 SCRIPT-GUARD: dangling conjunction detection');
console.log('========================================\n');

// --- hasDanglingConjunction ---
assert('"клиенти и потенцијални и." — trailing "и" duplicated earlier → dangling',
  hasDanglingConjunction('клиенти и потенцијални и.') === true,
  'duplicate и at end should be flagged');

assert('"...и потencijални и" (with mixed script, after fix) → dangling',
  hasDanglingConjunction('Нашата услуга се состои од промоција на имотот кај голем број клиенти и потенцијални и.') === true,
  'the reported pattern should be flagged');

assert('normal sentence NOT dangling',
  hasDanglingConjunction('Драго ми е што станот е сè уште достапен.') === false,
  'normal sentence must not be flagged');

assert('single "и" mid-sentence NOT dangling',
  hasDanglingConjunction('Вие ја добивате вашата цена, а ние додаваме над неа.') === false,
  'mid-sentence conjunctions must not be flagged');

// --- stripDanglingConjunction ---
assert('"клиенти и потенцијални и." → "клиенти и потенцијални."',
  stripDanglingConjunction('клиенти и потенцијални и.') === 'клиенти и потенцијални.',
  `Got: ${stripDanglingConjunction('клиенти и потенцијални и.')}`);

assert('normal sentence unchanged by stripDanglingConjunction',
  stripDanglingConjunction('Драго ми е што станот е сè уште достапен.') === 'Драго ми е што станот е сè уште достапен.',
  'normal sentence must pass through unchanged');

console.log('\n========================================');
console.log('🧪 SCRIPT-GUARD: end-to-end postProcessPersuasionResponse');
console.log('========================================\n');

// --- postProcessPersuasionResponse end-to-end ---
// The exact reported anomaly — should come out as clean Macedonian.
const reported = 'Нашата услуга се состои од промоција на имотот кај голем број клиенти и потencijални и.';
const fixed = postProcessPersuasionResponse(reported, false);
console.log(`  Fixed response: "${fixed}"`);

assert('no mixed script in final output',
  hasMixedScript(fixed) === false,
  `Got: ${fixed}`);

assert('no dangling conjunction in final output',
  hasDanglingConjunction(fixed) === false,
  `Got: ${fixed}`);

assert('final output is non-empty Macedonian text',
  fixed.length > 10 && /[а-ја-з]/.test(fixed),
  `Got: "${fixed}"`);

// Second reported phrasing variant
const variant = 'Имаме голем број клиенти и потencijални и. Како ви звучи ова?';
const fixed2 = postProcessPersuasionResponse(variant, false);
console.log(`  Fixed variant: "${fixed2}"`);
assert('variant: no mixed script',
  hasMixedScript(fixed2) === false,
  `Got: ${fixed2}`);
assert('variant: no dangling conjunction',
  hasDanglingConjunction(fixed2) === false,
  `Got: ${fixed2}`);

// Clean response should still work normally
assert('cleanResponse unaffected',
  cleanResponse('  Здраво   ,  Ана  ') === 'Здраво , Ана',
  `Got: ${cleanResponse('  Здраво   ,  Ана  ')}`);

console.log('\n========================================');
console.log('🧪 SCRIPT-GUARD: "как" → "како" (standard Macedonian, not truncated)');
console.log('========================================\n');

// Reported: Ana replied "сакате да знаете как ќе го промовираме имотот" —
// the LLM used the truncated colloquial "как" instead of the standard "како".
// The post-processor must guarantee "како" while never touching real words
// that merely CONTAIN "как" (каква, какви, каков, како, секако, така...).

const kakReported = 'Ве разбирам, сакате да знаете как ќе го промовираме имотот. Имаме голем број клиенти заинтересирани и го промовираме преку различни канали. Што мислите?';
const kakFixed = postProcessPersuasionResponse(kakReported, false);
console.log(`  Fixed: "${kakFixed}"`);

assert('reported sentence: no standalone "как" remains',
  !/(^|[^a-zA-Zа-яА-Я])как($|[^a-zA-Zа-яА-Я])/i.test(kakFixed),
  `Got: "${kakFixed}"`);
assert('reported sentence: "како ќе го промовираме" present',
  /како ќе го промовираме/.test(kakFixed),
  `Got: "${kakFixed}"`);

assert('"как ќе го промовираме" → "како ќе го промовираме"',
  postProcessPersuasionResponse('сакате да знаете как ќе го промовираме имотот', false)
    .startsWith('сакате да знаете како ќе го промовираме имотот'),
  `Got: "${postProcessPersuasionResponse('сакате да знаете как ќе го промовираме имотот', false)}"`);

assert('Latin "kak" → "kako"',
  postProcessPersuasionResponse('sakate da znaete kak ke go promovirame', false)
    .includes('kako ke go promovirame'),
  `Got: "${postProcessPersuasionResponse('sakate da znaete kak ke go promovirame', false)}"`);

assert('uppercase "КАК" → "КАКО"',
  postProcessPersuasionResponse('КАК ЌЕ ГО ПРОМОВИРАМЕ ИМОТОТ', false).includes('КАКО ЌЕ ГО ПРОМОВИРАМЕ'),
  `Got: "${postProcessPersuasionResponse('КАК ЌЕ ГО ПРОМОВИРАМЕ ИМОТОТ', false)}"`);

assert('title-case "Как" → "Како"',
  postProcessPersuasionResponse('Как ќе го промовираме', false).startsWith('Како ќе го промовираме'),
  `Got: "${postProcessPersuasionResponse('Как ќе го промовираме', false)}"`);

// Words that merely CONTAIN "как" must be untouched:
const kakContaining = 'Каква квадратура, какви соби, каков стан, како и секако, така, вака — сè е во ред.';
const kakContainingFixed = postProcessPersuasionResponse(kakContaining, false);
assert('substring words preserved (каква/какви/каков/како/секако/така/вака)',
  kakContainingFixed.includes('Каква') && kakContainingFixed.includes('какви') &&
  kakContainingFixed.includes('каков') && kakContainingFixed.includes('како и секако') &&
  kakContainingFixed.includes('така') && kakContainingFixed.includes('вака'),
  `Got: "${kakContainingFixed}"`);

// ALL-CAPS Cyrillic containing-words must stay intact (boundaries exclude
// uppercase Cyrillic explicitly — never rely on engine case folding):
assert('uppercase Cyrillic "КАКВА КВАДРАТУРА" stays intact',
  postProcessPersuasionResponse('КАКВА КВАДРАТУРА', false).includes('КАКВА'),
  `Got: "${postProcessPersuasionResponse('КАКВА КВАДРАТУРА', false)}"`);
assert('uppercase Cyrillic "СЕКАКО" stays intact',
  postProcessPersuasionResponse('СЕКАКО', false).includes('СЕКАКО'),
  `Got: "${postProcessPersuasionResponse('СЕКАКО', false)}"`);
assert('uppercase Cyrillic "КАКОВ СТАН" stays intact',
  postProcessPersuasionResponse('КАКОВ СТАН', false).includes('КАКОВ'),
  `Got: "${postProcessPersuasionResponse('КАКОВ СТАН', false)}"`);

// Latin containing-words must stay intact too:
assert('Latin "kakva" stays intact',
  postProcessPersuasionResponse('kakva e kvadratura', false).includes('kakva'),
  `Got: "${postProcessPersuasionResponse('kakva e kvadratura', false)}"`);

// The prompt itself must teach the LLM the rule AND no longer contain the
// stray JS snippet that was accidentally embedded in the template literal.
const prompt = buildPersuasionPrompt('', 'test', '', false);
assert('prompt contains the "как"→"како" rule',
  /НИКОГАШ не пишувај "как"/.test(prompt),
  'rule missing from prompt');
assert('prompt no longer contains stray "const propertyLabel" JS snippet',
  !/const propertyLabel/.test(prompt),
  'stray JS line still embedded in prompt');

// ========================================
// SUMMARY
// ========================================
console.log('\n=======================================================');
console.log('📊 SCRIPT-GUARD SUMMARY:');
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
console.log('=======================================================');

if (harness.failed > 0) {
  console.log('\n❌ SOME TESTS FAILED — investigate above.\n');
  process.exit(1);
} else {
  console.log('\n🟢 ALL CHECKS PASSED — script-mixing and dangling-conjunction artifacts are repaired.\n');
}
