// ============================================================
// test-llm-fallback.js — Groq → Gemini fallback chain (reported:
// Groq 429 TPD exhaustion froze persuasion)
// ============================================================
// Reported (production TUI):
//
//   429 {"error":{"message":"Rate limit reached for model
//   `llama-3.3-70b-versatile` ... on tokens per day (TPD): Limit 100000,
//   Used 98080, Requested 2290. Please try again in 5m19.68s.", ...}}
//
// The old code retried the 429 3× with 2s→4s→8s backoff (futile — the wait
// was 5m19s), then safe-fallback → 2nd consecutive error escalated a live
// lead to a human. Every message during a TPD exhaustion cost real leads.
//
// What this suite pins (llm-provider.js):
//   A. Groq succeeds → its text is used, Gemini never called.
//   B. Groq 429/TPD → CIRCUIT BREAKER: no retries (1 call), cascade to
//      Gemini immediately.
//   C. Groq transient timeout → retried (1 + N retries) then cascade.
//   D. All providers down → generateCompletion throws → the existing
//      createSafeFallback still produces the ERROR reply + escalation path.
//   E. isRateLimit / isTpdExhaustion unit checks.
//   F. buildProviderChain skips providers with missing keys.
//   G2/G3. buildGeminiPayload mapping + the thinking-model output budget
//      (gemini-2.5-flash reasoning counts against maxOutputTokens — the
//      150 persuasion budget floored at 256 amputated replies mid-word;
//      the floor now guarantees room) + parseGeminiResponse truncation
//      detection.
//   G. runPersuasion's ANA_OFFLINE_LLM seam still short-circuits (no
//      provider touched, battery stays offline).
//
// Fully offline — every provider below is a FAKE function; nothing hits a
// network. ANA_OFFLINE_LLM=1 is set so any accidental real-LLM path in
// runPersuasion degrades to the canned reply instead of hanging.
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import {
  generateCompletion,
  buildProviderChain,
  buildGeminiPayload,
  parseGeminiResponse,
  geminiOutputBudget,
  GEMINI_OUTPUT_BUDGET_FLOOR,
  isRateLimit,
  isTpdExhaustion,
  buildKeyPool,
  resetKeyPoolCache
} from './llm-provider.js';
import { createSafeFallback } from './retry-utils.js';
import { runPersuasion, tierForClassification, buildDeterministicPersuasion } from './handlers/persuasion-phase.js';

const harness = createHarness();
const assert = harness.assert;

// FAST retry options for tests — maxRetries per scenario, 1ms delays so
// retry-count assertions don't sleep the suite.
const FAST = { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 2 };

function tpd429Error() {
  const err = new Error(
    'Rate limit reached for model `llama-3.3-70b-versatile` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 100000, Used 98080, Requested 2290. Please try again in 5m19.68s.'
  );
  err.status = 429;
  return err;
}

// ============================================================
// PART A — Groq primary succeeds
// ============================================================
console.log('\n========================================');
console.log('🧪 A: Groq works → its reply wins, Gemini untouched');
console.log('========================================\n');

let geminiCalls = 0;
const geminiFake = {
  name: 'gemini',
  fn: async () => { geminiCalls++; return { text: 'gemini reply' }; }
};
const groqOk = { name: 'groq', fn: async () => ({ text: 'groq reply' }) };

let res = await generateCompletion({ messages: [] }, { providers: [groqOk, geminiFake], retry: FAST });
assert('A1: groq reply returned when groq works', res.text === 'groq reply', `got ${JSON.stringify(res.text)}`);
assert('A2: gemini never called', geminiCalls === 0, `got ${geminiCalls} calls`);

// ============================================================
// PART B — Groq 429 TPD → circuit breaker, immediate cascade
// ============================================================
console.log('\n========================================');
console.log('🧪 B: Groq TPD 429 → NO retries, immediate cascade to Gemini');
console.log('========================================\n');

let groqCalls = 0;
const groqTpd = {
  name: 'groq',
  fn: async () => { groqCalls++; throw tpd429Error(); }
};

// maxRetries: 5 proves the breaker — if rate limits were still retried this
// would call groq 6 times (~fast delays but the COUNT would show it).
geminiCalls = 0;
res = await generateCompletion({ messages: [] }, {
  providers: [groqTpd, geminiFake],
  retry: { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 2 }
});
assert('B1: Gemini takes over on Groq TPD 429', res.text === 'gemini reply', `got ${JSON.stringify(res.text)}`);
assert('B2: groq called EXACTLY once — circuit breaker skipped retries', groqCalls === 1, `got ${groqCalls} calls`);
assert('B3: gemini called once', geminiCalls === 1, `got ${geminiCalls} calls`);

// Plain RPM-style 429 (no TPD wording) also cascades without retries
groqCalls = 0;
const groqRpm = {
  name: 'groq',
  fn: async () => { groqCalls++; const e = new Error('Rate limit exceeded — 429'); e.status = 429; throw e; }
};
res = await generateCompletion({ messages: [] }, { providers: [groqRpm, geminiFake], retry: { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 2 } });
assert('B4: plain 429 also cascades immediately', res.text === 'gemini reply', `got ${JSON.stringify(res.text)}`);
assert('B5: plain 429 → groq called once (no retries)', groqCalls === 1, `got ${groqCalls} calls`);

// ============================================================
// PART C — Groq transient timeout → retried, then cascade
// ============================================================
console.log('\n========================================');
console.log('🧪 C: Groq transient timeout → retried (1 + 2) then Gemini');
console.log('========================================\n');

let timeoutCalls = 0;
const groqTimeout = {
  name: 'groq',
  fn: async () => { timeoutCalls++; const e = new Error('connect ETIMEDOUT'); e.name = 'Error'; throw e; }
};
geminiCalls = 0;
res = await generateCompletion({ messages: [] }, {
  providers: [groqTimeout, geminiFake],
  retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2 }
});
assert('C1: Gemini takes over after Groq timeouts', res.text === 'gemini reply', `got ${JSON.stringify(res.text)}`);
assert('C2: groq called 3 times (1 initial + 2 retries)', timeoutCalls === 3, `got ${timeoutCalls} calls`);
assert('C3: gemini called once', geminiCalls === 1, `got ${geminiCalls} calls`);

// ============================================================
// PART D — all providers down → throw → safe fallback survives
// ============================================================
console.log('\n========================================');
console.log('🧪 D: all providers down → throws → createSafeFallback ERROR');
console.log('========================================\n');

const bothDown = { name: 'groq', fn: async () => { throw tpd429Error(); } };
const geminiDown = { name: 'gemini', fn: async () => { throw new Error('ECONNREFUSED'); } };
let threw = null;
try {
  await generateCompletion({ messages: [] }, { providers: [bothDown, geminiDown], retry: FAST });
} catch (e) {
  threw = e;
}
assert('D1: generateCompletion throws when every provider fails', threw !== null, 'no error thrown');
assert('D2: throws the LAST provider error', threw instanceof Error && /ECONNREFUSED/.test(threw.message), `got ${threw?.message}`);

const fb = createSafeFallback(threw.message, { phone: '+38970123456' });
assert('D3: safe fallback is ERROR type (escalation path preserved)', fb.type === 'ERROR', `got ${fb.type}`);
assert('D4: safe fallback sends the technical-error line', /техничка грешка/.test(fb.text), `got ${JSON.stringify(fb.text)}`);

// Empty chain (all keys missing) → clear error, not a crash
let emptyErr = null;
try {
  await generateCompletion({ messages: [] }, { providers: [] });
} catch (e) {
  emptyErr = e;
}
assert('D5: empty chain throws a clear no-providers error', emptyErr !== null && /no providers/i.test(emptyErr.message), `got ${emptyErr?.message}`);

// ============================================================
// PART E — detection helpers
// ============================================================
console.log('\n========================================');
console.log('🧪 E: isRateLimit / isTpdExhaustion');
console.log('========================================\n');

assert('E1: TPD 429 detected as rate limit', isRateLimit(tpd429Error()) === true, 'not detected');
assert('E2: TPD 429 detected as TPD exhaustion', isTpdExhaustion(tpd429Error()) === true, 'not detected');
assert('E3: generic 429 detected as rate limit', isRateLimit(Object.assign(new Error('too many requests'), { status: 429 })) === true, 'not detected');
assert('E4: timeout NOT a rate limit', isRateLimit(new Error('connect ETIMEDOUT')) === false, 'misdetected');
assert('E5: timeout NOT TPD exhaustion', isTpdExhaustion(new Error('connect ETIMEDOUT')) === false, 'misdetected');
assert('E6: empty provider text is not a rate limit', isRateLimit(new Error('')) === false, 'misdetected');

// Axios-style errors: status lives on err.response, not err.status
const axiosQuota = Object.assign(new Error('429 RESOURCE_EXHAUSTED ... daily request limit exceeded.'), {
  response: { status: 429 }
});
assert('E7: axios-style 429 detected as rate limit', isRateLimit(axiosQuota) === true, 'not detected');
assert('E8: axios-style quota detected as TPD exhaustion', isTpdExhaustion(axiosQuota) === true, 'not detected');
assert('E9: isRateLimit uses err.response.status', isRateLimit(Object.assign(new Error('quota'), { response: { status: 429 } })) === true, 'not detected');

// ============================================================
// PART F — buildProviderChain key-based skip
// ============================================================
console.log('\n========================================');
console.log('🧪 F: buildProviderChain skips providers with missing keys');
console.log('========================================\n');

process.env.GROQ_API_KEY = 'test-groq-key';
process.env.GEMINI_API_KEY = 'test-gemini-key';
let chain = buildProviderChain();
assert('F1: both keys set → chain = groq,gemini', chain.map(p => p.name).join(',') === 'groq,gemini', `got ${chain.map(p => p.name).join(',')}`);
assert('F2: chain order preserved (groq first)', chain[0]?.name === 'groq', `got ${chain[0]?.name}`);

// Unknown provider names are skipped, not fatal (orderOverride exercises the
// skip without re-importing config — config.LLM_PROVIDERS is read at load)
chain = buildProviderChain('groq,doesnotexist,gemini');
assert('F3: unknown provider skipped via orderOverride', chain.map(p => p.name).join(',') === 'groq,gemini', `got ${chain.map(p => p.name).join(',')}`);

// Key-based skip: no Gemini key → gemini dropped, groq stays
delete process.env.GEMINI_API_KEY;
chain = buildProviderChain();
assert('F4: no Gemini key → gemini skipped, groq only', chain.map(p => p.name).join(',') === 'groq', `got ${chain.map(p => p.name).join(',')}`);
delete process.env.GROQ_API_KEY;

// ============================================================
// PART G2 — buildGeminiPayload pure mapping (no network)
// ============================================================
console.log('\n========================================');
console.log('🧪 G2: buildGeminiPayload maps messages → generateContent payload');
console.log('========================================\n');

const payload = buildGeminiPayload(
  [
    { role: 'system', content: 'Ти си Ана.' },
    { role: 'user', content: 'prompt' },
    { role: 'assistant', content: 'Здраво.' },
    { role: 'user', content: 'DA' }
  ],
  { model: 'gemini-2.5-flash', temperature: 0.2, top_p: 0.75, max_tokens: 150 }
);
assert('G2a: URL targets the configured model', payload.url.includes('/models/gemini-2.5-flash:generateContent'), `got ${payload.url}`);
assert('G2b: system message → systemInstruction', payload.body.systemInstruction?.parts?.[0]?.text === 'Ти си Ана.', `got ${JSON.stringify(payload.body.systemInstruction)}`);
assert('G2c: system message NOT duplicated into contents', payload.body.contents.length === 3, `got ${payload.body.contents.length}`);
assert('G2d: assistant role mapped to model', payload.body.contents[1].role === 'model', `got ${payload.body.contents[1]?.role}`);
assert('G2e: user roles preserved', payload.body.contents[0].role === 'user' && payload.body.contents[2].role === 'user', 'role mismatch');
assert('G2f: generationConfig carries temperature/topP/maxOutputTokens',
  payload.body.generationConfig.temperature === 0.2 &&
  payload.body.generationConfig.topP === 0.75 &&
  payload.body.generationConfig.maxOutputTokens === 150,
  `got ${JSON.stringify(payload.body.generationConfig)}`);

// No system message → no systemInstruction key
const noSys = buildGeminiPayload([{ role: 'user', content: 'x' }], { model: 'm', temperature: 0.2, top_p: 0.75, max_tokens: 150 });
assert('G2g: no system message → no systemInstruction', noSys.body.systemInstruction === undefined, `got ${JSON.stringify(noSys.body.systemInstruction)}`);

// ============================================================
// PART G3 — thinking-model output budget (reported: Gemini replies cut
// mid-word — gemini-2.5-flash reasoning tokens count against
// maxOutputTokens, so the 150-token persuasion budget floored at 256 let
// thinking consume the budget and amputate the visible reply).
// ============================================================
console.log('\n========================================');
console.log('🧪 G3: geminiOutputBudget floors output so thinking can\'t starve the reply');
console.log('========================================\n');

// Persuasion sends max_tokens 150 → the floor must lift it well above the
// reasoning footprint (live probe: 256 budget → 241 thinking tokens + 11
// visible → MAX_TOKENS mid-word cut; 1024 → complete STOP reply).
const persuasionBudget = geminiOutputBudget(150);
assert('G3a: persuasion budget (150) floored above reasoning footprint',
  persuasionBudget >= 1024,
  `got ${persuasionBudget}`);
assert('G3b: floor is exported and sane (>= 1024)',
  GEMINI_OUTPUT_BUDGET_FLOOR >= 1024,
  `got ${GEMINI_OUTPUT_BUDGET_FLOOR}`);
assert('G3c: a larger explicit budget is never shrunk',
  geminiOutputBudget(4096) === 4096,
  `got ${geminiOutputBudget(4096)}`);
assert('G3d: undefined/0 budgets fall back to the floor',
  geminiOutputBudget(undefined) === GEMINI_OUTPUT_BUDGET_FLOOR &&
  geminiOutputBudget(0) === GEMINI_OUTPUT_BUDGET_FLOOR,
  `got ${geminiOutputBudget(undefined)}/${geminiOutputBudget(0)}`);

// End-to-end: the floor feeds buildGeminiPayload's maxOutputTokens
const floored = buildGeminiPayload(
  [{ role: 'user', content: 'x' }],
  { model: 'gemini-2.5-flash', temperature: 0.2, top_p: 0.75, max_tokens: persuasionBudget }
);
assert('G3e: payload maxOutputTokens uses the floored budget',
  floored.body.generationConfig.maxOutputTokens === persuasionBudget,
  `got ${floored.body.generationConfig.maxOutputTokens}`);

// ============================================================
// PART G4 — parseGeminiResponse: MAX_TOKENS truncation detection
// (reported: amputated replies must never ship silently)
// ============================================================
console.log('\n========================================');
console.log('🧪 G4: parseGeminiResponse flags MAX_TOKENS truncation');
console.log('========================================\n');

const completeResp = parseGeminiResponse({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Ве разбирам, работиме. Дали сте расположени?' }] } }]
});
assert('G4a: STOP response parsed, not truncated',
  completeResp.text === 'Ве разбирам, работиме. Дали сте расположени?' && completeResp.truncated === false,
  `got ${JSON.stringify(completeResp)}`);

const truncatedResp = parseGeminiResponse({
  candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'Ве разбирам, нашата агенција работи иск' }] } }]
});
assert('G4b: MAX_TOKENS response flagged as truncated',
  truncatedResp.text === 'Ве разбирам, нашата агенција работи иск' && truncatedResp.truncated === true,
  `got ${JSON.stringify(truncatedResp)}`);

const multiPart = parseGeminiResponse({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'А' }, { text: 'Б' }, { text: 'В' }] } }]
});
assert('G4c: multiple visible parts joined in order', multiPart.text === 'АБВ' && multiPart.truncated === false, `got ${JSON.stringify(multiPart)}`);

const emptyResp = parseGeminiResponse({});
assert('G4d: empty response → empty text, not truncated',
  emptyResp.text === '' && emptyResp.truncated === false,
  `got ${JSON.stringify(emptyResp)}`);

// ============================================================
// PART G — runPersuasion offline seam (battery stays offline)
// ============================================================
console.log('\n========================================');
console.log('🧪 G: ANA_OFFLINE_LLM seam still short-circuits runPersuasion');
console.log('========================================\n');

const r = await runPersuasion({
  conv: 'Ана: Здраво.\nСопственик: DA',
  userInput: 'da',
  classification: { intent: 'INTERESTED', confidence: 0.6 },
  isRent: false
});
assert('G1: NORMAL reply from offline seam (intent-aware ladder)',
  r.type === 'NORMAL' && /соработк|почнеме/.test(r.text || '') && r.text.length > 20,
  `got ${JSON.stringify(r)}`);

// ============================================================
// PART I — DETERMINISTIC PERSUASION LADDER (the LLM-free floor —
// intent-aware lines keyed on the classifier, rent/sale-aware, so an
// outage never sends "техничка грешка" to an owner)
// ============================================================
console.log('\n========================================');
console.log('🧪 I: deterministic persuasion ladder — intent-aware, rent/sale-aware');
console.log('========================================\n');

// INTERESTED high conf (sale) — value pitch, ends with a cooperation ask
const hiSale = buildDeterministicPersuasion({ intent: 'INTERESTED', confidence: 0.7 }, false);
assert('I1: high-conf INTERESTED (sale) — value pitch with cooperation ask',
  /соработк|почнеме/.test(hiSale) && !/техничка грешка/.test(hiSale),
  `got ${JSON.stringify(hiSale)}`);

// INTERESTED high conf (rent) — must NEVER claim "без провизија"
const hiRent = buildDeterministicPersuasion({ intent: 'INTERESTED', confidence: 0.7 }, true);
assert('I2: high-conf INTERESTED (rent) — no "без провизија" claim (rent owner pays the fee)',
  !/без провизија|немате никакви обврски/i.test(hiRent),
  `got ${JSON.stringify(hiRent)}`);

// Low-conf INTERESTED — gentle, no pressure
const low = buildDeterministicPersuasion({ intent: 'INTERESTED', confidence: 0.3 }, false);
assert('I3: low-conf INTERESTED — gentle tone (Разбирам/Нема брзање/Нема притисок)',
  /Разбирам|Нема брзање|Нема притисок/.test(low),
  `got ${JSON.stringify(low)}`);

// REJECTED (sale) — may use the "не зема ништо" benefit
const rejSale = buildDeterministicPersuasion({ intent: 'REJECTED', confidence: 0.6 }, false);
assert('I4: REJECTED (sale) — benefit line allowed (не зема ништо / без обврски)',
  /не зема ништо|немате никакви обврски|видливост|бараната цена/.test(rejSale),
  `got ${JSON.stringify(rejSale)}`);

// REJECTED (rent) — the sale-only claim must NEVER leak to a rent owner
const rejRent = buildDeterministicPersuasion({ intent: 'REJECTED', confidence: 0.6 }, true);
assert('I5: REJECTED (rent) — no sale-only "без провизија/немате обврски" claim',
  !/не зема ништо|немате никакви обврски|без провизија/i.test(rejRent),
  `got ${JSON.stringify(rejRent)}`);

// Fallback (unclassified) — generic cooperation ask, still ends with a question
const fbLine = buildDeterministicPersuasion(null, false);
assert('I6: unclassified fallback — generic cooperation ask',
  /соработуваме|соработк|расположени/.test(fbLine) && /\?/.test(fbLine),
  `got ${JSON.stringify(fbLine)}`);

// ============================================================
// PART J — runPersuasion LLM-free floor: every provider DOWN (or no keys
// at all) → the owner gets the deterministic ladder, NEVER the
// "техничка грешка" fallback. (ANA_OFFLINE_LLM is unset so the real
// provider path runs — with zero keys it throws "no providers" → caught.)
// ============================================================
console.log('\n========================================');
console.log('🧪 J: runPersuasion with every LLM down → deterministic floor reply');
console.log('========================================\n');

delete process.env.ANA_OFFLINE_LLM;
delete process.env.GROQ_API_KEYS;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEYS;
delete process.env.GEMINI_API_KEY;
const floor = await runPersuasion({
  conv: 'Ана: Здраво.\nСопственик: Hm, ne znam.',
  userInput: 'hm, ne znam',
  classification: { intent: 'INTERESTED', confidence: 0.4 },
  isRent: false
});
assert('J1: all providers down → NORMAL (not ERROR), deterministic line',
  floor.type === 'NORMAL' && /соработк|Разбирам|Нема/.test(floor.text || ''),
  `got ${JSON.stringify(floor)}`);
assert('J2: never the technical-error line to an owner',
  !/техничка грешка/.test(floor.text || ''),
  `got ${JSON.stringify(floor)}`);
process.env.ANA_OFFLINE_LLM = '1'; // restore — the rest of the suite expects the offline seam

// TIER ROUTING MAP (the offline seam returns before the LLM call, so the
// classification → tier mapping is pinned directly): skeptical/soft-rejection
// turns get the SMART tier (70b/flash), everything else the ROUTINE tier
// (8b/flash-lite).
assert('G5: REJECTED intent → rebuttal tier (smart model)',
  tierForClassification({ intent: 'REJECTED', confidence: 0.6 }) === 'rebuttal',
  `got ${tierForClassification({ intent: 'REJECTED', confidence: 0.6 })}`);
assert('G6: INTERESTED → routine tier',
  tierForClassification({ intent: 'INTERESTED', confidence: 0.7 }) === 'routine',
  `got ${tierForClassification({ intent: 'INTERESTED', confidence: 0.7 })}`);
assert('G7: gated ACCEPTED → routine tier',
  tierForClassification({ intent: 'ACCEPTED', confidence: 0.8 }) === 'routine',
  `got ${tierForClassification({ intent: 'ACCEPTED', confidence: 0.8 })}`);
assert('G8: unclassified → routine tier',
  tierForClassification(null) === 'routine' && tierForClassification(undefined) === 'routine',
  `got ${tierForClassification(null)}`);

// ============================================================
// PART H — TIERED KEY/MODEL POOL (user-approved rotation: 8b routine +
// 70b rebuttals, model rotation inside one key, Gemini multi-project keys)
// ============================================================
console.log('\n========================================');
console.log('🧪 H: tiered key/model pool — tier routing, model rotation, multi-key, cooldown');
console.log('========================================\n');

// Config reads env at MODULE LOAD, so tier models come from the committed
// defaults (70b rebuttal / 8b routine / flash smart / flash-lite routine).
// Key LISTS are read at call time (keyList) — settable here.

// --- H1: pool composition from env ---
process.env.GROQ_API_KEYS = 'gsk-a,gsk-b';
process.env.GEMINI_API_KEYS = 'AIza-1';
const pool = buildKeyPool({ fresh: true });
assert('H1a: 2 groq keys × 2 tiers + 1 gemini key × 2 tiers = 6 entries',
  pool.length === 6, `got ${pool.length}: ${pool.map(e => e.provider + '/' + e.tier).join(', ')}`);
const groqReb = pool.find(e => e.provider === 'groq' && e.tier === 'rebuttal');
const groqRou = pool.find(e => e.provider === 'groq' && e.tier === 'routine');
const gemReb = pool.find(e => e.provider === 'gemini' && e.tier === 'rebuttal');
const gemRou = pool.find(e => e.provider === 'gemini' && e.tier === 'routine');
assert('H1b: groq rebuttal tier → MODEL (70b)', groqReb.model === 'llama-3.3-70b-versatile', `got ${groqReb.model}`);
assert('H1c: groq routine tier → MODEL_LITE (8b)', groqRou.model === 'llama-3.1-8b-instant', `got ${groqRou.model}`);
assert('H1d: gemini rebuttal tier → GEMINI_MODEL (flash)', gemReb.model === 'gemini-2.5-flash', `got ${gemReb.model}`);
assert('H1e: gemini routine tier → GEMINI_MODEL_LITE (flash-lite)', gemRou.model === 'gemini-2.5-flash-lite', `got ${gemRou.model}`);
assert('H1f: both groq keys present', pool.filter(e => e.provider === 'groq').length === 4 &&
  new Set(pool.filter(e => e.provider === 'groq').map(e => e.key)).size === 2,
  'expected 2 distinct groq keys');

// Backward compat: plural var absent → singular GROQ_API_KEY still builds the pool
process.env.GROQ_API_KEY = 'gsk-single';
delete process.env.GROQ_API_KEYS;
delete process.env.GEMINI_API_KEYS;
delete process.env.GEMINI_API_KEY;
const poolSingle = buildKeyPool({ fresh: true });
assert('H1g: single GROQ_API_KEY → 2 entries (both tiers, one key)',
  poolSingle.length === 2 && poolSingle[0].key === 'gsk-single' && poolSingle[1].key === 'gsk-single',
  `got ${poolSingle.map(e => e.key).join(',')}`);

// --- H2: tier routing picks the right model FIRST ---
resetKeyPoolCache();
process.env.GROQ_API_KEYS = 'gsk-a';
delete process.env.GROQ_API_KEY;
let seen = [];
const routeFns = {
  groq: async (params, o) => { seen.push(o.model); return { text: 'ok ' + o.model }; },
  gemini: async () => { seen.push('gemini'); return { text: 'g' }; }
};
res = await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fresh: true, fns: routeFns } });
assert('H2a: routine tier tries MODEL_LITE (8b) first', seen[0] === 'llama-3.1-8b-instant', `got ${seen[0]}`);
assert('H2b: routine reply returned', /^ok /.test(res.text), `got ${JSON.stringify(res.text)}`);

seen = [];
res = await generateCompletion({ messages: [] }, { tier: 'rebuttal', pool: { fresh: true, fns: routeFns } });
assert('H2c: rebuttal tier tries MODEL (70b) first', seen[0] === 'llama-3.3-70b-versatile', `got ${seen[0]}`);

// --- H3: MODEL ROTATION inside one key — routine 429 → rebuttal model on
// the SAME key serves, Gemini never touched ---
resetKeyPoolCache();
process.env.GROQ_API_KEYS = 'gsk-only';
seen = [];
const rotFns = {
  groq: async (params, o) => {
    seen.push(o.model);
    if (o.model === 'llama-3.1-8b-instant') throw tpd429Error(); // routine 8b exhausted
    return { text: 'smart saved it' };                          // rebuttal 70b has its own bucket
  },
  gemini: async () => { seen.push('gemini'); return { text: 'g' }; }
};
res = await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fresh: true, fns: rotFns } });
assert('H3a: routine 429 → same key rebuttal model serves (per-model buckets)',
  res.text === 'smart saved it', `got ${JSON.stringify(res.text)}`);
assert('H3b: gemini fallback NOT reached', !seen.includes('gemini'), `got ${JSON.stringify(seen)}`);

// --- H4: MULTI-KEY rotation — key1 429 → key2 serves ---
resetKeyPoolCache();
process.env.GROQ_API_KEYS = 'gsk-a,gsk-b';
seen = [];
const multiFns = {
  groq: async (params, o) => {
    seen.push(o.key);
    if (o.key === 'gsk-a') throw tpd429Error();
    return { text: 'key2 wins' };
  },
  gemini: async () => { seen.push('gemini'); return { text: 'g' }; }
};
res = await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fresh: true, fns: multiFns } });
assert('H4a: key1 429 → key2 serves', res.text === 'key2 wins', `got ${JSON.stringify(res.text)}`);
assert('H4b: key2 tried after key1',
  seen.indexOf('gsk-a') !== -1 && seen.indexOf('gsk-a') < seen.indexOf('gsk-b'),
  `got ${JSON.stringify(seen)}`);

// --- H5: 429 COOLDOWN — an exhausted entry is PARKED; a later call with all
// entries still parked throws the clear parked error (and the next call after
// the cooldown window would retry — covered by H3/H4's fresh entries) ---
resetKeyPoolCache();
process.env.GROQ_API_KEYS = 'gsk-c';
process.env.GEMINI_API_KEYS = 'AIza-2';
let exhausted = 0;
const parkFns = {
  groq: async () => { exhausted++; throw tpd429Error(); },          // 5m19s cooldown parsed from message
  gemini: async () => { exhausted++; const e = new Error('429 too many requests'); e.status = 429; throw e; }
};
let poolErr = null;
// FIRST call builds + CACHES the pool (no fresh) and attempts every entry
// (all fresh) — each 429 parks its entry; the LAST error surfaces.
try {
  await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fns: parkFns } });
} catch (e) {
  poolErr = e;
}
assert('H5a: first call — every fresh entry attempted, last 429 thrown',
  poolErr !== null && /429|too many requests|rate limit/i.test(poolErr.message), `got ${poolErr?.message}`);
assert('H5b: entries attempted exactly once (429 = no retries, then parked)',
  exhausted === 4, `got ${exhausted}`);

// Second call within the cooldown window: the CACHED pool's entries are all
// parked (cooldown persisted) → zero attempts, clear parked error.
exhausted = 0;
let poolErr2 = null;
try {
  await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fns: parkFns } });
} catch (e) {
  poolErr2 = e;
}
assert('H5c: parked entries stay parked across calls (cooldown persisted)',
  poolErr2 !== null && /parked/i.test(poolErr2.message) && exhausted === 0,
  `got ${poolErr2?.message}, attempts=${exhausted}`);

// --- H6: no keys at all → empty pool → clear no-providers error ---
delete process.env.GROQ_API_KEYS;
delete process.env.GROQ_API_KEY;
delete process.env.GEMINI_API_KEYS;
delete process.env.GEMINI_API_KEY;
let noKeyErr = null;
try {
  await generateCompletion({ messages: [] }, { tier: 'routine', pool: { fresh: true } });
} catch (e) {
  noKeyErr = e;
}
assert('H6: empty pool throws no-providers error',
  noKeyErr !== null && /no providers/i.test(noKeyErr.message), `got ${noKeyErr?.message}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('LLM-FALLBACK TESTS');
harness.exit();
