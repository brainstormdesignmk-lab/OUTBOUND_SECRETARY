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
  isRateLimit,
  isTpdExhaustion
} from './llm-provider.js';
import { createSafeFallback } from './retry-utils.js';
import { runPersuasion } from './handlers/persuasion-phase.js';

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
assert('G1: canned NORMAL reply from offline seam', r.type === 'NORMAL' && /соработуваме/.test(r.text || ''), `got ${JSON.stringify(r)}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('LLM-FALLBACK TESTS');
harness.exit();
