import { classifyIntent, hasStandaloneNegation } from './classifier.js';
import { createHarness } from './test-helpers.js';

const tests = [
  // Current acceptance patterns (should still work)
  ['ajde da probame', {intent:'ACCEPTED', minConf:0.90}],
  ['moze da probame', {intent:'ACCEPTED', minConf:0.90}],
  ['da probame', {intent:'ACCEPTED', minConf:0.90}],
  ['vazhi', {intent:'ACCEPTED', minConf:0.85}],
  ['dogovoreno', {intent:'ACCEPTED', minConf:0.90}],
  ['vo red', {intent:'ACCEPTED', minConf:0.85}],
  ['se soglasuvam', {intent:'ACCEPTED', minConf:0.90}],
  ['prifakjam', {intent:'ACCEPTED', minConf:0.90}],
  ['probame', {intent:'ACCEPTED', minConf:0.85}],
  ['sorabotuvame', {intent:'ACCEPTED', minConf:0.90}],
  ['zosto da ne', {intent:'ACCEPTED', minConf:0.85}],
  ['ke probam', {intent:'ACCEPTED', minConf:0.80}],
  ['dogovor', {intent:'ACCEPTED', minConf:0.85}],

  // NEW acceptance patterns (were broken before)
  ['moze ana', {intent:'ACCEPTED', minConf:0.85}],
  ['moze ane', {intent:'ACCEPTED', minConf:0.85}],
  ['sakam', {intent:'ACCEPTED', minConf:0.80}],
  ['sakam sorabotka', {intent:'ACCEPTED', minConf:0.90}],
  ['sakam da sorabotuvame', {intent:'ACCEPTED', minConf:0.90}],
  ['da sum', {intent:'ACCEPTED', minConf:0.80}],
  ['probaj', {intent:'ACCEPTED', minConf:0.80}],
  ['probajte', {intent:'ACCEPTED', minConf:0.80}],
  ['ok', {intent:'ACCEPTED', minConf:0.75}],
  ['okej', {intent:'ACCEPTED', minConf:0.75}],

  // REJECTED should still work
  ['ne', {intent:'REJECTED', minConf:0.85}],
  ['ne sum zainteresiran', {intent:'REJECTED', minConf:0.85}],
  ['ne sakam', {intent:'REJECTED', minConf:0.85}],
  ['ostavi me', {intent:'REJECTED', minConf:0.85}],

  // INTERESTED should still work
  ['kako raboti?', {intent:'INTERESTED', minConf:0.70}],
  ['sto znaci toa', {intent:'INTERESTED', minConf:0.70}],
  ['primer?', {intent:'INTERESTED', minConf:0.70}],

  // Doubt guard should still downgrade
  ['moze, ama koja agencija ste?', {intent:'INTERESTED', minConf:0.60}],
  ['da, ama kako rabotite?', {intent:'INTERESTED', minConf:0.60}],
  ['ajde ama kako funkcionira?', {intent:'INTERESTED', minConf:0.60}],

  // THE PRODUCTION BUG (reported): owner said "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"
  // (super, tell me what you need and let's start) — a clear acceptance that was
  // classified INTERESTED 0.5 because the aorist "pocneme"/"почнеме" was missing
  // from every rule. Must now be ACCEPTED >= 0.85 so the session enters
  // DATA_COLLECTION instead of the LLM hallucinating a documents workflow.
  ['SUPER, KAZI MI STO TI TREBA PA DA POCNEME', {intent:'ACCEPTED', minConf:0.85}],
  ['super, kazi mi sto ti treba pa da pocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['да почнеме', {intent:'ACCEPTED', minConf:0.85}],
  ['da pocneme so sorabotka', {intent:'ACCEPTED', minConf:0.85}],
  ['да почнеме со соработка', {intent:'ACCEPTED', minConf:0.85}],
  ['pocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['започнеме', {intent:'ACCEPTED', minConf:0.85}],
  ['da zapocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['ok, kazi mi sto ti treba', {intent:'ACCEPTED', minConf:0.85}],
  // Trailing punctuation must still match the aorist rule
  ['pocneme!', {intent:'ACCEPTED', minConf:0.85}],
  ['започнеме.', {intent:'ACCEPTED', minConf:0.85}],
  ['да почнеме!', {intent:'ACCEPTED', minConf:0.85}],
  // Go-ahead with hesitation ("tell me what you need SO I CAN DECIDE") is NOT acceptance
  ['кажи ми што ти треба за да одлучам', {intent:'INTERESTED', minConf:0.50}],
  // Latin-script diacritic variant: "nešto" (something) is NOT a negation
  ['kazi mi nešto pa da pocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['кажи ми нешто па да почнеме', {intent:'ACCEPTED', minConf:0.85}],
  // Negation/doubt must NOT accept
  ['ne sakam da pocneme', {intent:'REJECTED', minConf:0.85}],
  ['koga da pocneme?', {intent:'INTERESTED', minConf:0.60}],
  // "da ne pocneme" / "да не почнеме" ("let's not start") is a DECLINE — must not
  // be accepted via the affirmative-start catch-all (which previously caught
  // "da ne pocneme" at 0.90 because it starts with "da ").
  ['da ne pocneme', {intent:'INTERESTED', minConf:0.50}],
  ['да не почнеме', {intent:'INTERESTED', minConf:0.50}],
  // Negated-affirmatives ARE acceptance: "да, не е проблем" ("yes, it's not a
  // problem") — the decline guard must be TARGETED (ne + decline verb), not a
  // broad standalone-ne check, or these genuine acceptances would be lost.
  ['da, ne e problem', {intent:'ACCEPTED', minConf:0.85}],
  ['да, не е проблем', {intent:'ACCEPTED', minConf:0.85}],
  ['da ne e problem', {intent:'ACCEPTED', minConf:0.85}],
  ['да не е проблем', {intent:'ACCEPTED', minConf:0.85}],
  // "ajde ne" ("come on, no") is a decline — targeted guard must catch it
  ['ajde ne', {intent:'INTERESTED', minConf:0.50}],
  ['dobro ne', {intent:'INTERESTED', minConf:0.50}],

  // "da ne probame" ("let's NOT try") must NOT be accepted — the strong
  // "da probame" rule uses greedy .* which previously swallowed the negation.
  ['da ne probame', {intent:'INTERESTED', minConf:0.50}],
  ['да не пробаме', {intent:'INTERESTED', minConf:0.50}],
  // The decline guard's AJDE branch with probame ("ajde ne probame" =
  // "come on, let's NOT try") must also stay INTERESTED — covered explicitly
  // because the ajde catch-all rule would otherwise accept it at 0.90.
  ['ajde ne probame', {intent:'INTERESTED', minConf:0.50}],

  // HEDGED "da ... probame" — "da mozebi ke probame" (yes, maybe we'll try)
  // and "da razmislam pa ke probame" (let me think, then we'll try) are NOT
  // commitments — hesitation words downgrade to INTERESTED.
  ['da mozebi ke probame', {intent:'INTERESTED', minConf:0.60}],
  ['да можеби ќе пробаме', {intent:'INTERESTED', minConf:0.60}],
  ['da razmislam pa ke probame', {intent:'INTERESTED', minConf:0.60}],
  ['da ke probame, mozebi', {intent:'INTERESTED', minConf:0.60}],
  // Same hesitation disease via SIBLING rules (reviewer round-2 finding):
  // 'mozebi, moze da probame' and 'moze da probame, ke vidime' previously
  // slipped through the moze-da-probame rule, and 'mozebi ke probame'
  // (maybe I'll try) through the ke-probam rule.
  ['mozebi, moze da probame', {intent:'INTERESTED', minConf:0.60}],
  ['moze da probame, ke vidime', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi ke probame', {intent:'INTERESTED', minConf:0.60}],

  // ============================================================
  // AUDIT (other acceptance verb families): the SAME hesitation/negation
  // gaps fixed in probame were audited across pocneme / ke probam / sakam
  // and the catch-alls. All hedged/negated variants must stay INTERESTED,
  // all clean controls must stay ACCEPTED.
  // ============================================================

  // --- pocneme (aorist) family — hesitation downgrades ---
  ['da mozebi ke pocneme', {intent:'INTERESTED', minConf:0.60}],
  ['да можеби ќе почнеме', {intent:'INTERESTED', minConf:0.60}],
  ['da razmislam pa ke pocneme', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi ke pocneme', {intent:'INTERESTED', minConf:0.60}],
  // 'sakam da razmislam pa ke pocneme' — bare "razmislam" is now in the
  // INTERESTED razmisluvam fallback (reviewer finding), so it lands at 0.70.
  ['sakam da razmislam pa ke pocneme', {intent:'INTERESTED', minConf:0.60}],
  // --- pocneme (aorist) family — clean controls still ACCEPTED ---
  ['da pocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['да почнеме', {intent:'ACCEPTED', minConf:0.85}],
  ['pocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['da zapocneme', {intent:'ACCEPTED', minConf:0.85}],
  ['започнеме', {intent:'ACCEPTED', minConf:0.85}],
  ['pocneme!', {intent:'ACCEPTED', minConf:0.85}],

  // --- pochnuvame (present) family — hesitation downgrades ---
  ['mozebi pochnuvame', {intent:'INTERESTED', minConf:0.60}],
  // --- pochnuvame family — negation via decline guard ---
  ['da ne pochnuvame', {intent:'INTERESTED', minConf:0.50}],
  // --- pochnuvame family — clean controls ACCEPTED (incl. ne-prefix word) ---
  ['pochnuvame', {intent:'ACCEPTED', minConf:0.85}],
  ['da pochnuvame', {intent:'ACCEPTED', minConf:0.85}],
  // 'nema problem, pochnuvame' ("it's no problem, let's start") — "nema"
  // contains "ne" as a PREFIX but is NOT a standalone negation; the old bare
  // /(ne|не)/ guard wrongly downgraded it to INTERESTED (false negative).
  ['nema problem, pochnuvame', {intent:'ACCEPTED', minConf:0.85}],

  // --- ke probam family — negation downgrades ("I/we won't try") ---
  ['ne ke probam', {intent:'INTERESTED', minConf:0.50}],
  ['не ќе пробам', {intent:'INTERESTED', minConf:0.50}],
  ['ne ke probame', {intent:'INTERESTED', minConf:0.50}],
  ['не ќе пробаме', {intent:'INTERESTED', minConf:0.50}],
  // --- ke probam family — clean controls ACCEPTED (incl. ne-prefix words) ---
  ['ke probam', {intent:'ACCEPTED', minConf:0.80}],
  ['ke probame', {intent:'ACCEPTED', minConf:0.80}],
  ['da ke probame', {intent:'ACCEPTED', minConf:0.85}],
  // 'ke probame nesto novo' (we'll try something new) / 'ke probame nego'
  // (we'll try it) — ne-PREFIX words, NOT negations, must stay ACCEPTED.
  ['ke probame nesto novo', {intent:'ACCEPTED', minConf:0.80}],
  ['ke probame nego', {intent:'ACCEPTED', minConf:0.80}],

  // --- sakam family — hesitation downgrades ---
  ['mozebi sakam sorabotka', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi sakam da sorabotuvame', {intent:'INTERESTED', minConf:0.60}],
  // --- sakam family — clean controls still ACCEPTED ---
  ['sakam sorabotka', {intent:'ACCEPTED', minConf:0.90}],
  ['sakam da sorabotuvame', {intent:'ACCEPTED', minConf:0.90}],
  ['sakam', {intent:'ACCEPTED', minConf:0.80}],
  ['ne sakam sorabotka', {intent:'REJECTED', minConf:0.85}],

  // --- catch-alls — hesitation downgrades (audit finding) ---
  ['mozebi sorabotuvame', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi dogovoreno', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi dogovor', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi se soglasuvam', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi prifakjam', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi vo red', {intent:'INTERESTED', minConf:0.60}],
  // --- catch-alls — NEGATION downgrades (reviewer round-2 finding):
  // 'ne se soglasuvam'/'ne sorabotuvame'/'ne prifakjam' etc. previously matched
  // the catch-alls and were accepted at 0.90-0.95 — same disease as probame.
  ['ne se soglasuvam', {intent:'INTERESTED', minConf:0.50}],
  ['не се согласувам', {intent:'INTERESTED', minConf:0.50}],
  ['ne sorabotuvame', {intent:'INTERESTED', minConf:0.50}],
  ['не соработуваме', {intent:'INTERESTED', minConf:0.50}],
  ['ne prifakjam', {intent:'INTERESTED', minConf:0.50}],
  ['не прифаќам', {intent:'INTERESTED', minConf:0.50}],
  ['ne dogovor', {intent:'INTERESTED', minConf:0.50}],
  ['ne dogovoreno', {intent:'INTERESTED', minConf:0.50}],
  ['ne vo red', {intent:'INTERESTED', minConf:0.50}],
  // --- catch-alls — clean controls still ACCEPTED (incl. ne-prefix words) ---
  ['sorabotuvame', {intent:'ACCEPTED', minConf:0.90}],
  ['dogovoreno', {intent:'ACCEPTED', minConf:0.90}],
  ['dogovor', {intent:'ACCEPTED', minConf:0.85}],
  ['se soglasuvam', {intent:'ACCEPTED', minConf:0.90}],
  ['prifakjam', {intent:'ACCEPTED', minConf:0.90}],
  ['vo red', {intent:'ACCEPTED', minConf:0.85}],
  // 'nema problem, se soglasuvam' ("it's no problem, I agree") — "nema" is a
  // ne-PREFIX word, not a standalone negation — must stay ACCEPTED.
  ['nema problem, se soglasuvam', {intent:'ACCEPTED', minConf:0.90}],

  // --- ajde catch-all — negation/hesitation guards (reviewer finding) ---
  // 'ajde, nema problem' ("come on, no problem") contains "ne" inside the
  // ne-PREFIX word "nema" — a bare /(ne|не)/ test wrongly downgraded it.
  // NOTE: these must NOT start with da/ajde/dobro/moze — those are caught by
  // the EARLIER affirmative-start / comprehensive guards, which would mask the
  // ajde catch-all path. 'super, ajde, ...' forces the ajde catch-all to decide.
  ['super, ajde, nema problem', {intent:'ACCEPTED', minConf:0.85}],
  ['ok, ajde, nema problem', {intent:'ACCEPTED', minConf:0.85}],
  ['ajde ne', {intent:'INTERESTED', minConf:0.50}],  // "come on, no" — decline
  ['super, ajde, mozebi', {intent:'INTERESTED', minConf:0.60}],  // hedged

  // --- zosto da ne family — hesitation downgrades (reviewer round-2 finding) ---
  // 'mozebi zosto da ne' (maybe why not) / 'zosto da ne, mozebi' (trailing
  // maybe) are hedged, not committed — previously ACCEPTED 0.9.
  ['mozebi zosto da ne', {intent:'INTERESTED', minConf:0.60}],
  ['можеби зошто да не', {intent:'INTERESTED', minConf:0.60}],
  ['zosto da ne, mozebi', {intent:'INTERESTED', minConf:0.60}],
  // --- zosto da ne family — clean controls ACCEPTED (incl. Cyrillic da) ---
  // 'зошто да не' (Cyrillic "да") previously fell to the ambiguous default
  // because the pattern only matched Latin "da" — probe finding, now fixed.
  ['zosto da ne', {intent:'ACCEPTED', minConf:0.85}],
  ['зошто да не', {intent:'ACCEPTED', minConf:0.85}],

  // --- ako e taka moze family — hedge + moze-inside-mozebi SUBSTRING trap ---
  // 'mozebi ako e taka' (maybe if it's so) contains "moze" as a PREFIX of
  // "mozebi" — the bare /(moze|може)/ test wrongly accepted the hedge;
  // 'ako e taka, ke vidime' (if it's so, we'll see) is hedged too.
  ['mozebi ako e taka', {intent:'INTERESTED', minConf:0.60}],
  ['можеби ако е така', {intent:'INTERESTED', minConf:0.60}],
  ['mozebi ako e taka moze', {intent:'INTERESTED', minConf:0.60}],
  ['ako e taka ke vidime', {intent:'INTERESTED', minConf:0.60}],
  ['ako e taka, mozebi ke probame', {intent:'INTERESTED', minConf:0.60}],
  // --- ako e taka moze family — clean controls still ACCEPTED ---
  ['ako e taka moze', {intent:'ACCEPTED', minConf:0.80}],
  ['ако е така може', {intent:'ACCEPTED', minConf:0.80}],
  // 'mozeli ako e taka' ("they could, if it's so") — "mozeli" contains "moze"
  // as a PREFIX but is NOT a standalone "moze" — the standalone-word boundary
  // check (same \P{L} technique as hasStandaloneNegation) blocks this, so it
  // must NOT be ACCEPTED (reviewer edge finding, same substring family).
  ['mozeli ako e taka', {intent:'INTERESTED', minConf:0.50}],
  ['можели ако е така', {intent:'INTERESTED', minConf:0.50}],
  // 'ne plakjam nisto, ke vidime' ("I pay nothing — we'll see") — the ke vidime
  // hedge must downgrade the model-understanding acceptance too (reviewer
  // round-2 finding, resolved by the da/ke vidime INTERESTED fallback).
  ['ne plakjam nisto, ke vidime', {intent:'INTERESTED', minConf:0.60}],
  ['vie go prodavate, ke vidime', {intent:'INTERESTED', minConf:0.60}],

  // PRIOR-AGREEMENT ACKNOWLEDGMENT (new): the owner says "I already said that" —
  // they are confirming they already expressed agreement. Must be ACCEPTED >= 0.85
  // WITHOUT needing the exact cooperation-question context.
  // THE PRODUCTION MESSAGE (reported): owner replied "PA TOAGO REKOV I JAS"
  // (well, that's what I said too) and got a disconnected canned persuasion line.
  ['PA TOAGO REKOV I JAS', {intent:'ACCEPTED', minConf:0.85}],
  ['pa toa go rekov i jas', {intent:'ACCEPTED', minConf:0.85}],
  ['тоа го реков и јас', {intent:'ACCEPTED', minConf:0.85}],
  ['истото го реков', {intent:'ACCEPTED', minConf:0.85}],
  ['jas istoto go rekov', {intent:'ACCEPTED', minConf:0.85}],
  ['веке реков', {intent:'ACCEPTED', minConf:0.85}],  // Cyrillic diacritic-free typo for веќе
  ['веќе реков', {intent:'ACCEPTED', minConf:0.85}],
  ['реков дека сакам', {intent:'ACCEPTED', minConf:0.85}],
  ['реков дека sakam', {intent:'ACCEPTED', minConf:0.85}],  // mixed Cyrillic/Latin
  ['тоа го реков', {intent:'ACCEPTED', minConf:0.85}],
  // Negation/refusal guards must NOT accept these
  ['jas rekov deka nemam vreme', {intent:'INTERESTED', minConf:0.50}],
  ['jas rekov deka nemam iskustvo', {intent:'INTERESTED', minConf:0.50}],
  ['тоа го реков дека немам тераса', {intent:'INTERESTED', minConf:0.50}],
  ['jas rekov deka sakam da se javam', {intent:'INTERESTED', minConf:0.50}],  // delay signal
  ['реков дека не сакам', {intent:'REJECTED', minConf:0.85}],
  ['не ти реков дека сакам соработка', {intent:'REJECTED', minConf:0.85}],
  ['jas kazav deka nemam vreme', {intent:'INTERESTED', minConf:0.50}],
];

const harness = createHarness();

// ==========================================
// hasStandaloneNegation unit tests
// Matches "ne"/"не" ONLY as a standalone word, NOT as a substring of
// another word ("pocneme" contains "ne" inside it; "nešto"/"нејасно" are
// single words that merely start with "ne" but are NOT negations).
// ==========================================
const negationCases = [
  // [input, expected]
  ['pocneme', false],            // po-cne-me — substring, not standalone
  ['започнеме', false],          // Cyrillic — substring не inside
  ['zapocneme', false],
  ['zapochneme', false],
  ['ne sakam', true],            // standalone ne at start
  ['sakam ne', true],            // standalone ne at end
  ['da ne pocneme', true],       // standalone ne in middle
  ['ne, pocneme', true],         // ne followed by comma
  ['nema', false],               // "nema" is a word, ne is a prefix (not standalone)
  ['nešto', false],              // Latin š — single word starting with ne
  ['нејасно', false],            // Cyrillic ј — single word starting with не
  ['ne', true],                  // bare ne
  ['', false],
];
for (const [input, expected] of negationCases) {
  const got = hasStandaloneNegation(input);
  harness.assert(`hasStandaloneNegation(${JSON.stringify(input)}) -> ${expected}`, got === expected, `got ${got}`);
}

for (const t of tests) {
  const result = classifyIntent(t[0], '');
  const ok = result.intent === t[1].intent && result.confidence >= t[1].minConf;
  harness.assert(`"${t[0]}" -> ${t[1].intent} >=${t[1].minConf}`, ok, `got ${result.intent} ${result.confidence.toFixed(2)}`);
}

// Test with cooperation question context
const convWithCoopQ = 'Ана: Дали да почнеме со соработка?';

// "da moze" should remain conversation continuation, not ACCEPTED
const ctxResult = classifyIntent('da moze', convWithCoopQ);
harness.assert('"da moze" with coop context -> INTERESTED (conversation continuation)', ctxResult.intent === 'INTERESTED', `got ${ctxResult.intent} ${ctxResult.confidence.toFixed(2)}`);

// "moze ana" with coop context -> ACCEPTED
const ctxResult2 = classifyIntent('moze ana', convWithCoopQ);
harness.assert('"moze ana" with coop context -> ACCEPTED >=0.85', ctxResult2.intent === 'ACCEPTED' && ctxResult2.confidence >= 0.85, `got ${ctxResult2.intent} ${ctxResult2.confidence.toFixed(2)}`);

// "moze ana" without context -> ACCEPTED (via moze+name pattern at 0.90)
const aloneResult = classifyIntent('moze ana', '');
harness.assert('"moze ana" without context -> ACCEPTED >=0.85', aloneResult.intent === 'ACCEPTED' && aloneResult.confidence >= 0.85, `got ${aloneResult.intent} ${aloneResult.confidence.toFixed(2)}`);

// "moze" standalone with coop context -> ACCEPTED 0.90 (boosted via CONTEXT RULE C3)
const mozeCoop = classifyIntent('moze', convWithCoopQ);
harness.assert('"moze" with coop context -> ACCEPTED 0.90 (CONTEXT RULE C3)', mozeCoop.intent === 'ACCEPTED' && mozeCoop.confidence >= 0.85, `got ${mozeCoop.intent} ${mozeCoop.confidence.toFixed(2)}`);

// "da" with coop context -> ACCEPTED 0.90 (boosted via CONTEXT RULE C1, not 0.60)
const daCoop = classifyIntent('da', convWithCoopQ);
harness.assert('"da" with coop context -> ACCEPTED 0.90 (CONTEXT RULE C1)', daCoop.intent === 'ACCEPTED' && daCoop.confidence >= 0.85, `got ${daCoop.intent} ${daCoop.confidence.toFixed(2)}`);

// "da" without context -> ACCEPTED 0.60 (no boost)
const daAlone = classifyIntent('da', '');
harness.assert('"da" without context -> ACCEPTED 0.60 (no boost)', daAlone.intent === 'ACCEPTED' && daAlone.confidence === 0.60, `got ${daAlone.intent} ${daAlone.confidence.toFixed(2)}`);

// "тоа го реков" (bare, that's what I said) after a PRIOR REJECTION must NOT accept —
// the owner is pointing back at their earlier refusal ("не сум заинтересиран").
const priorRejConv = 'Ана: Дали сте расположени да соработуваме?\nСопственик: не сум заинтересиран';
const priorRejResult = classifyIntent('тоа го реков', priorRejConv);
harness.assert('"тоа го реков" after prior rejection -> INTERESTED (prior-rejection guard)', priorRejResult.intent === 'INTERESTED', `got ${priorRejResult.intent} ${priorRejResult.confidence.toFixed(2)}`);

// "kako sto rekov" (as I said) with coop-question context stays ACCEPTED via CONTEXT RULE D
// (proves the new rule does not interfere with the existing context boost)
const kakoStoRekov = classifyIntent('kako sto rekov', convWithCoopQ);
harness.assert('"kako sto rekov" with coop context -> ACCEPTED (CONTEXT RULE D)', kakoStoRekov.intent === 'ACCEPTED' && kakoStoRekov.confidence >= 0.85, `got ${kakoStoRekov.intent} ${kakoStoRekov.confidence.toFixed(2)}`);

harness.summary('ACCEPTANCE CLASSIFIER');
harness.exit();
