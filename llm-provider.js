// ========================================
// llm-provider.js — LLM provider fallback chain (Groq → Gemini)
// ========================================
// Reported (production, live TUI): Groq hit its tokens-per-day cap —
//
//   429 {"error":{"message":"Rate limit reached for model
//   `llama-3.3-70b-versatile` ... on tokens per day (TPD): Limit 100000,
//   Used 98080, Requested 2290. Please try again in 5m19.68s.",
//   "type":"tokens","code":"rate_limit_exceeded"}}
//
// The old code retried the 429 three times with 2s→4s→8s backoff (futile —
// the wait was 5m19s), then fell through to service.js's safe fallback, and
// a SECOND consecutive error escalated a live lead to a human. Every owner
// message during a TPD exhaustion cost real leads.
//
// This module replaces the single hardcoded Groq call with an ORDERED
// provider chain (config.LLM_PROVIDERS, default "groq,gemini"):
//
//   Groq (primary) ──> Gemini 2.5 Flash (fallback) ──> service.js safe
//   fallback + human escalation (final net, unchanged)
//
// Why Gemini: an INDEPENDENT quota (free tier, no card, North Macedonia is
// not in the EU/UK/CH exclusion zone). OBSERVED on this account (live 429):
// the Gemini free tier is REQUEST-counted — "generate_content_free_tier_
// requests, limit: 20, model: gemini-2.5-flash" — and the bucket is PER
// PROJECT + PER MODEL, so Gemini capacity multiplies via more projects
// (GEMINI_API_KEYS list) and more models (GEMINI_MODEL_LITE routine tier).
//
// TIERED MODEL SPLIT (user-approved, see the pool section below): each
// Groq key carries BOTH model buckets — rebuttal → config.MODEL (70b),
// routine → config.MODEL_LITE (8b). The observed 429 was scoped "for model
// llama-3.3-70b-versatile" (per-model TPD in practice on this account),
// so the two tiers draw from separate daily buckets on one key. HEDGE: if
// the account enforces org-level buckets instead (Groq docs historically
// say org-level), the split is harmless but adds no capacity — verify at
// console.groq.com/settings/limits before relying on the multiplier.
//
// CIRCUIT BREAKER: rate-limit errors (429 / TPD / RPM) are NOT retried —
// they cascade to the next provider immediately. Retrying a 429 whose
// message says "try again in 5m19s" is pure waste. Only genuinely transient
// failures (timeout, 5xx, network, socket) get the exponential-backoff
// retry inside the current provider.
//
// Offline test battery stays untouched: ANA_OFFLINE_LLM=1 returns before
// any provider is reached (see handlers/persuasion-phase.js).
// ========================================
import Groq from "groq-sdk";
import axios from 'axios';
import { config } from './config.js';
import { withRetry, DEFAULT_RETRYABLE_ERRORS } from './retry-utils.js';

// ========================================
// RATE-LIMIT / TPD DETECTION
// ========================================
/**
 * True for ANY rate-limit class error (429 / rate_limit / TPD exhaustion).
 * These cascade to the next provider WITHOUT retrying — the backoff can't
 * out-wait a daily quota, and even a 30s RPM window is better served by the
 * fallback provider than by burning 3 retries.
 */
export function isRateLimit(err) {
  const status = err?.status || err?.statusCode || err?.response?.status || '';
  const text = `${err?.name || ''} ${err?.message || ''} ${status}`.toLowerCase();
  return /429|rate limit|rate_limit|too many requests|tokens per day|\btpd\b/.test(text);
}

/**
 * True specifically for the TPD/org-quota exhaustion class (used only for a
 * clearer console log — the cascade decision is isRateLimit's). Checks BOTH
 * plain SDK errors (err.status) and axios errors (err.response.status), plus
 * Gemini's own quota wording ("RESOURCE_EXHAUSTED" / "daily request limit")
 * so a Gemini fallback quota hit is logged as TPD, not a generic rate limit.
 */
export function isTpdExhaustion(err) {
  const status = err?.status || err?.statusCode || err?.response?.status || '';
  const text = `${err?.name || ''} ${err?.message || ''} ${status}`.toLowerCase();
  return /tokens per day|\btpd\b|try again in \d+m|resource_exhausted|daily request limit/.test(text);
}

/**
 * Retryable-error list for provider calls: everything DEFAULT_RETRYABLE_ERRORS
 * considers transient EXCEPT rate-limit patterns (see circuit-breaker note).
 *
 * The shared list's bare '50' substring (meant to catch 5xx status codes) is
 * deliberately DROPPED here: any rate-limit message containing "50" — e.g. a
 * future "Limit 150000" or a token count — would otherwise match it and get
 * three futile backoff retries, undermining the breaker. Named 5xx patterns
 * (internal server error, bad gateway, service unavailable, server error)
 * still retry; a bare "500" cascades to the next provider, which is fine.
 */
const RETRYABLE_NO_RATE_LIMIT = DEFAULT_RETRYABLE_ERRORS.filter(p =>
  !['rate_limit', 'rate limit', '429', 'too many requests', '50'].includes(p.toLowerCase())
);

// ========================================
// PROVIDERS (each returns Promise<{ text: string }>)
// ========================================

/**
 * Gemini's output-token budget, floored so the thinking model's reasoning
 * tokens (which count against maxOutputTokens) can never starve the visible
 * reply. Never shrinks a larger explicitly-requested budget.
 *
 * @param {number|string|undefined} maxTokens — requested max output tokens
 * @returns {number}
 */
export const GEMINI_OUTPUT_BUDGET_FLOOR = 2048;
export function geminiOutputBudget(maxTokens) {
  return Math.max(Number(maxTokens) || 0, GEMINI_OUTPUT_BUDGET_FLOOR);
}

// --- Groq (primary) — lazy clients, one per API key (multi-key rotation) ---
const _groqClients = new Map();
function getGroqClient(apiKey) {
  if (!_groqClients.has(apiKey)) {
    _groqClients.set(apiKey, new Groq({ apiKey }));
  }
  return _groqClients.get(apiKey);
}

// overrides = { key, model } — the pool passes the entry's key/model so one
// key can rotate across BOTH Groq model buckets (70b rebuttal + 8b routine;
// per-model TPD quotas are independent). Without overrides (legacy chain
// path) it falls back to the env key + config.MODEL exactly as before.
function groqProvider(params, overrides = {}) {
  const key = overrides.key || process.env.GROQ_API_KEY;
  const model = overrides.model || config.MODEL;
  const { messages, temperature, top_p, frequency_penalty, max_tokens } = params;
  return getGroqClient(key).chat.completions
    .create({
      messages,
      model,
      temperature,
      top_p,
      frequency_penalty,
      max_tokens
    })
    .then(result => ({ text: result?.choices?.[0]?.message?.content?.trim() || '' }));
}

// --- Gemini 2.5 Flash (fallback) — raw REST via axios (already a dep) ---
// Free-tier quota is INDEPENDENT of Groq's — this is the whole point of the
// fallback. System prompt is mapped to Gemini's systemInstruction (the old
// Groq call sent it as a "system" role message); frequency_penalty is not
// supported by Gemini's generateContent and is omitted.
//
// buildGeminiPayload is a PURE mapping (exported for unit tests — no network
// needed to pin the payload shape).
/**
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} gen — { model, temperature, top_p, max_tokens }
 * @returns {{url: string, body: Object}} — generateContent endpoint + body
 */
export function buildGeminiPayload(messages, gen) {
  const systemText = (messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = (messages || [])
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${gen.model}:generateContent`,
    body: {
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      contents,
      generationConfig: {
        temperature: gen.temperature,
        topP: gen.top_p,
        maxOutputTokens: gen.max_tokens
      }
    }
  };
}

/**
 * Extract the visible reply from a raw Gemini generateContent response.
 * PURE (no network) — exported for offline tests.
 *
 * gemini-2.5-flash returns reasoning in usageMetadata (counted toward
 * maxOutputTokens) and only the visible text in content.parts — so parts are
 * joined as-is. When finishReason is MAX_TOKENS the budget was exhausted and
 * the visible reply may be cut mid-word (reported incomplete replies); the
 * caller gets { truncated: true } so it can decide (warn + ship the partial
 * reply rather than throw — a cut sentence beats the technical-error
 * escalation).
 *
 * @param {Object} data — raw API response
 * @returns {{text: string, truncated: boolean}}
 */
export function parseGeminiResponse(data) {
  const finishReason = data?.candidates?.[0]?.finishReason;
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
  return { text, truncated: finishReason === 'MAX_TOKENS' };
}

function geminiProvider(params, overrides = {}) {
  const key = (overrides.key || process.env.GEMINI_API_KEY || '').trim();
  const model = overrides.model || config.GEMINI_MODEL;
  if (!key) {
    return Promise.reject(new Error('GEMINI_API_KEY missing — Gemini fallback unavailable (add to ~/.ana/ana.env)'));
  }
  const { messages, temperature, top_p, max_tokens } = params;

  // THINKING-MODEL OUTPUT BUDGET (proven by live probe, reported incomplete
  // replies): gemini-2.5-flash is a THINKING model — reasoning tokens count
  // against maxOutputTokens. With the persuasion budget (150) floored to 256,
  // the probe showed finishReason MAX_TOKENS: 241 thinking tokens consumed the
  // budget and left ~11 for the visible reply → sentences cut mid-word
  // ("...клиен Дали", "...работи иск"). At 1024 the same call finished STOP
  // with a complete reply (442 thinking + 34 visible). The free-tier RPD
  // quota counts REQUESTS, not output tokens — a generous budget costs
  // nothing, and the prompt's "max 1-2 sentences" rule makes the model stop
  // early anyway. 2048 leaves ~4x headroom for longer reasoning runs.
  const outputFloor = geminiOutputBudget(max_tokens);
  const { url, body } = buildGeminiPayload(messages, {
    model,
    temperature,
    top_p,
    max_tokens: outputFloor
  });
  return axios
    .post(
      url,
      body,
      { params: { key }, timeout: 30000 }
    )
    .then(({ data }) => {
      const { text, truncated } = parseGeminiResponse(data);
      if (!text) throw new Error('Gemini returned empty content');
      if (truncated) {
        // Budget exhausted — the visible reply may be cut mid-word. The 2048
        // floor makes this rare; surface it for ops instead of silently
        // shipping an amputated sentence to an owner (reported).
        console.warn(`[LLM gemini(${model}): MAX_TOKENS — reply possibly truncated (${text.length} chars, budget ${outputFloor})]`);
      }
      return { text };
    })
    .catch(err => {
      // Enrich axios errors with the API's human-readable message so the
      // cascade detection (429/TPD) sees the real reason.
      const apiMsg = err?.response?.data?.error?.message;
      if (apiMsg) err.message = apiMsg;
      throw err;
    });
}

// ========================================
// CHAIN CONSTRUCTION
// ========================================
const PROVIDER_IMPLS = { groq: groqProvider, gemini: geminiProvider };

// Once-per-process guard for the chain-composition log (ops visibility).
let _loggedChain = false;

/**
 * Build the ordered provider chain from config.LLM_PROVIDERS
 * ("groq,gemini"). Providers whose API key is missing are skipped with a
 * warning (fail-soft: with only GROQ_API_KEY set, behavior is exactly the
 * old single-provider behavior). An empty chain makes generateCompletion
 * throw — caught by service.js's outer recovery → safe fallback.
 *
 * @param {string} [orderOverride] — comma-separated provider order, used
 *   instead of config.LLM_PROVIDERS (tests exercise the unknown-name skip
 *   without re-importing config).
 * @returns {Array<{name: string, fn: Function}>}
 */
export function buildProviderChain(orderOverride) {
  const order = String(orderOverride || config.LLM_PROVIDERS || 'groq,gemini')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const chain = [];
  for (const name of order) {
    if (!PROVIDER_IMPLS[name]) {
      console.warn(`[LLM: unknown provider "${name}" in ANA_LLM_PROVIDERS — skipped]`);
      continue;
    }
    const keyName = name === 'groq' ? 'GROQ_API_KEY' : name === 'gemini' ? 'GEMINI_API_KEY' : null;
    if (keyName && !process.env[keyName]) {
      console.warn(`[LLM: ${keyName} not set — "${name}" fallback disabled]`);
      continue;
    }
    chain.push({ name, fn: PROVIDER_IMPLS[name] });
  }

  // Ops visibility: log the composed chain ONCE per process so a TPD event's
  // fallback order is verifiable in the logs.
  if (!_loggedChain && orderOverride === undefined) {
    _loggedChain = true;
    console.log(`[LLM chain: ${chain.map(p => p.name).join(' → ') || '(none)'}]`);
  }
  return chain;
}

// ========================================
// TIERED KEY/MODEL POOL — the production path (user-approved)
// ========================================
// The pool multiplies free-tier capacity WITHOUT any new infrastructure:
//   - MODEL SPLIT inside one key: each Groq key carries BOTH model buckets
//     (rebuttal → config.MODEL = 70b, routine → config.MODEL_LITE = 8b).
//     Groq quotas are PER-MODEL (the observed 429 was "for model
//     llama-3.3-70b-versatile ... TPD: Limit 100000"), so exhausting one
//     model never touches the other — one key ≈ 600K TPD ≈ 250 calls/day.
//   - KEY LIST: GROQ_API_KEYS / GEMINI_API_KEYS accept comma-separated
//     keys. Groq quota is ORG-level (each listed key must be a SEPARATE
//     account to gain anything); Gemini quota is PER-PROJECT, so each
//     listed Gemini key genuinely adds its own ~20 RPD bucket.
//   - GEMINI MODEL SPLIT: the same tier logic — smart → GEMINI_MODEL
//     (2.5-flash), routine → GEMINI_MODEL_LITE (2.5-flash-lite, its own
//     per-model bucket).
//   - 429 COOLDOWN: a rate-limited entry is PARKED (cooldown from
//     Retry-After / "try again in 5m19s" / 60s fallback) and the call
//     cascades to the next entry — no futile retries (circuit breaker).
//   - ROTATION: the first-tried key rotates per call within each
//     (provider, tier) group, so N projects drain evenly instead of
//     one bucket absorbing all traffic then blocking for its window.
// ========================================
function keyList(pluralVar, singularVar) {
  const raw = process.env[pluralVar] || process.env[singularVar] || '';
  return String(raw).split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

/**
 * Build the tiered pool entries. Cached once per process (cooldowns must
 * survive across calls); pass { fresh: true } to rebuild (tests).
 */
export function buildKeyPool(opts = {}) {
  if (!opts.fresh && _poolCache) return _poolCache;
  const order = String(config.LLM_PROVIDERS || 'groq,gemini')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const pool = [];
  if (order.includes('groq')) {
    keyList('GROQ_API_KEYS', 'GROQ_API_KEY').forEach((key, i) => {
      pool.push({ provider: 'groq', key, model: config.MODEL, tier: 'rebuttal', keyIndex: i, cooldownUntil: 0 });
      pool.push({ provider: 'groq', key, model: config.MODEL_LITE, tier: 'routine', keyIndex: i, cooldownUntil: 0 });
    });
  }
  if (order.includes('gemini')) {
    keyList('GEMINI_API_KEYS', 'GEMINI_API_KEY').forEach((key, i) => {
      pool.push({ provider: 'gemini', key, model: config.GEMINI_MODEL, tier: 'rebuttal', keyIndex: i, cooldownUntil: 0 });
      pool.push({ provider: 'gemini', key, model: config.GEMINI_MODEL_LITE, tier: 'routine', keyIndex: i, cooldownUntil: 0 });
    });
  }
  if (!opts.fresh) _poolCache = pool;
  if (!_loggedPool && opts.fresh === undefined) {
    _loggedPool = true;
    console.log(`[LLM pool: ${pool.map(e => `${e.provider}(${e.model} ${e.tier})`).join(' → ') || '(none)'}]`);
  }
  return pool;
}

/** Reset the cached pool AND the rotation start indices (tests that mutate
 * env between calls need deterministic ordering). */
export function resetKeyPoolCache() {
  _poolCache = null;
  _loggedPool = false;
  _rrStart.clear();
}

let _poolCache = null;
let _loggedPool = false;

/**
 * Order pool entries for a call: the requested tier on the primary provider
 * first, then the other tier on the same keys (model rotation inside one
 * key), then the fallback provider's tiers. Rotates the start index within
 * each (provider, tier) group so multiple keys drain evenly.
 */
const _rrStart = new Map();
function orderPoolEntries(pool, tier) {
  const other = tier === 'rebuttal' ? 'routine' : 'rebuttal';
  const groups = [
    pool.filter(e => e.provider === 'groq' && e.tier === tier),
    pool.filter(e => e.provider === 'groq' && e.tier === other),
    pool.filter(e => e.provider !== 'groq' && e.tier === tier),
    pool.filter(e => e.provider !== 'groq' && e.tier === other)
  ];
  const out = [];
  for (const g of groups) {
    if (g.length === 0) continue;
    const groupKey = `${g[0].provider}:${g[0].tier}`;
    const start = _rrStart.get(groupKey) || 0;
    _rrStart.set(groupKey, (start + 1) % g.length);
    out.push(...[...g.slice(start), ...g.slice(0, start)]);
  }
  return out;
}

/**
 * Cooldown for a rate-limited entry: prefer the API's "try again in X" from
 * the error message (observed Groq: "try again in 5m19.68s"; Gemini:
 * "Please retry in 26.05s"), then the Retry-After header, then a 60s
 * fallback. Capped so a daily-exhausted entry doesn't block forever — the
 * pool just never finds a working key and the safe fallback takes over.
 */
const MAX_COOLDOWN_MS = 15 * 60 * 1000;
function cooldownMs(err, fallbackMs = 60000) {
  const m = String(err?.message || '').match(/try again in (?:(\d+)m\s*)?(\d+(?:\.\d+)?)s/i);
  if (m) {
    const mins = m[1] ? parseInt(m[1], 10) : 0;
    return Math.min((mins * 60 + parseFloat(m[2])) * 1000, MAX_COOLDOWN_MS);
  }
  const h = err?.headers || err?.response?.headers || {};
  const ra = parseFloat(h['retry-after'] || h['Retry-After']);
  if (!Number.isNaN(ra) && ra >= 0) return Math.min(ra * 1000, MAX_COOLDOWN_MS);
  return fallbackMs;
}

/** Wrap a pool entry into a callable (injectable fns for offline tests). */
function entryCallFn(entry, fns) {
  if (fns && fns[entry.provider]) {
    return (params) => fns[entry.provider](params, { key: entry.key, model: entry.model });
  }
  const impl = PROVIDER_IMPLS[entry.provider];
  return (params) => impl(params, { key: entry.key, model: entry.model });
}

// ========================================
// GENERATE COMPLETION — walk the chain
// ========================================
const DEFAULT_CHAIN_RETRY = { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 20000 };

function buildRetry(opts) {
  return {
    maxRetries: opts.retry?.maxRetries ?? DEFAULT_CHAIN_RETRY.maxRetries,
    baseDelayMs: opts.retry?.baseDelayMs ?? DEFAULT_CHAIN_RETRY.baseDelayMs,
    maxDelayMs: opts.retry?.maxDelayMs ?? DEFAULT_CHAIN_RETRY.maxDelayMs
  };
}

/**
 * LEGACY CHAIN WALK (explicit provider list — tests + external callers).
 * Each provider gets its own transient-retry window; rate-limit errors skip
 * retries and cascade immediately (circuit breaker). When every provider
 * fails, the LAST error is thrown.
 */
async function walkChain(params, providers, retry) {
  let lastError = null;
  for (let i = 0; i < providers.length; i++) {
    const p = providers[i];
    try {
      const result = await withRetry(() => p.fn(params), {
        maxRetries: retry.maxRetries,
        baseDelayMs: retry.baseDelayMs,
        maxDelayMs: retry.maxDelayMs,
        retryableErrors: RETRYABLE_NO_RATE_LIMIT,
        onRetry: (err, attempt) => {
          console.log(`[LLM ${p.name} RETRY ${attempt}/${retry.maxRetries}] ${String(err.message).substring(0, 100)}`);
        }
      });
      console.log(`[LLM: ${p.name} responded]`);
      return result;
    } catch (err) {
      lastError = err;
      const kind = isTpdExhaustion(err)
        ? 'TPD/RPM rate limit — circuit breaker, no retry'
        : isRateLimit(err)
          ? 'rate limit — circuit breaker, no retry'
          : 'error';
      const next = i < providers.length - 1 ? '→ next provider' : '→ ALL PROVIDERS FAILED';
      console.log(`[LLM ${p.name}: ${kind} — ${String(err.message).substring(0, 140)}] ${next}`);
    }
  }
  throw lastError;
}

/**
 * Run a chat completion. Two paths:
 *
 * 1. POOL PATH (production default): tiered key/model rotation — the
 *    requested tier's model first (routine → 8b/flash-lite, rebuttal →
 *    70b/flash), then the other model on the same keys, then the fallback
 *    provider's tiers. 429s park the entry (cooldown) and cascade to the
 *    next entry — no futile retries. All entries failed → LAST error
 *    thrown so service.js's safe fallback / human escalation still apply.
 *
 * 2. LEGACY CHAIN PATH (opts.providers — tests/external callers): the
 *    original Groq → Gemini chain semantics, unchanged.
 *
 * @param {Object} params — { messages, temperature, top_p, frequency_penalty, max_tokens }
 * @param {Object} [opts]
 * @param {string} [opts.tier] — 'routine' | 'rebuttal' (pool path)
 * @param {Object} [opts.pool] — { fresh, fns } pool overrides (tests)
 * @param {Array<{name, fn}>} [opts.providers] — legacy chain override (tests)
 * @param {Object} [opts.retry] — override retry options (tests)
 * @returns {Promise<{text: string}>}
 */
export async function generateCompletion(params, opts = {}) {
  const retry = buildRetry(opts);

  // === LEGACY CHAIN PATH (explicit provider list) ===
  if (opts.providers) {
    if (opts.providers.length === 0) {
      throw new Error('LLM: no providers configured (ANA_LLM_PROVIDERS empty or all API keys missing)');
    }
    return walkChain(params, opts.providers, retry);
  }

  // === POOL PATH (production default) ===
  const tier = opts.tier === 'rebuttal' ? 'rebuttal' : 'routine';
  const pool = buildKeyPool(opts.pool);
  if (pool.length === 0) {
    throw new Error('LLM: no providers configured (ANA_LLM_PROVIDERS empty or all API keys missing)');
  }
  const ordered = orderPoolEntries(pool, tier);
  const fns = opts.pool?.fns;
  let lastError = null;
  let attempted = 0;
  for (const entry of ordered) {
    if (Date.now() < (entry.cooldownUntil || 0)) continue; // parked after a 429
    attempted++;
    const callFn = entryCallFn(entry, fns);
    const label = `${entry.provider}(${entry.model}) key${entry.keyIndex + 1}`;
    try {
      const result = await withRetry(() => callFn(params), {
        maxRetries: retry.maxRetries,
        baseDelayMs: retry.baseDelayMs,
        maxDelayMs: retry.maxDelayMs,
        retryableErrors: RETRYABLE_NO_RATE_LIMIT,
        onRetry: (err, attemptN) => {
          console.log(`[LLM ${label} RETRY ${attemptN}/${retry.maxRetries}] ${String(err.message).substring(0, 100)}`);
        }
      });
      console.log(`[LLM ${label}: responded]`);
      return result;
    } catch (err) {
      lastError = err;
      if (isRateLimit(err)) {
        entry.cooldownUntil = Date.now() + cooldownMs(err);
        console.log(`[LLM ${label}: rate limit — circuit breaker, parked ${Math.round(cooldownMs(err) / 1000)}s → next pool entry]`);
      } else {
        console.log(`[LLM ${label}: ${String(err.message).substring(0, 140)} → next pool entry]`);
      }
    }
  }
  if (attempted === 0) {
    console.log('[LLM: ALL POOL ENTRIES PARKED (cooldown) — nothing attempted]');
    // Clear error, never `throw null` (a parked pool has no lastError).
    throw new Error('LLM: all pool entries parked (cooldown) — no provider attempted');
  }
  console.log(`[LLM: ALL POOL ENTRIES FAILED — ${String(lastError?.message || '').substring(0, 140)}]`);
  throw lastError;
}
