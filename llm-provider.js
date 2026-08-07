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
// Why Gemini: an INDEPENDENT quota (1,500 RPD free tier, no card, North
// Macedonia is not in the EU/UK/CH exclusion zone). Groq model rotation
// would NOT help — its free-tier TPD limit is applied at the organization
// level, shared across all models and keys.
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

// --- Groq (primary) — lazy client, same semantics as the old code ---
let _groqClient = null;
function getGroqClient() {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groqClient;
}

function groqProvider({ messages, temperature, top_p, frequency_penalty, max_tokens }) {
  return getGroqClient().chat.completions
    .create({
      messages,
      model: config.MODEL,
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

function geminiProvider({ messages, temperature, top_p, max_tokens }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !key.trim()) {
    return Promise.reject(new Error('GEMINI_API_KEY missing — Gemini fallback unavailable (add to ~/.ana/ana.env)'));
  }

  // THINKING-MODEL OUTPUT FLOOR (observed): gemini-2.5-flash burns output
  // tokens on reasoning before visible text — with the persuasion budget of
  // 150 tokens an involved objection could exhaust it and return EMPTY parts
  // (finishReason MAX_TOKENS → my empty-content error → spurious cascade).
  // Floor at 256 so a normal 1-2 sentence reply always has room. Free-tier
  // RPD quota counts REQUESTS, not output tokens — this costs nothing.
  const outputFloor = Math.max(Number(max_tokens) || 0, 256);
  const { url, body } = buildGeminiPayload(messages, {
    model: config.GEMINI_MODEL,
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
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
      if (!text) throw new Error('Gemini returned empty content');
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
// GENERATE COMPLETION — walk the chain
// ========================================
const DEFAULT_CHAIN_RETRY = { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 20000 };

/**
 * Run a chat completion through the provider chain (Groq → Gemini by
 * default). Each provider gets its own transient-retry window; rate-limit
 * errors skip retries and cascade immediately (circuit breaker). When every
 * provider fails, the LAST error is thrown so the existing service.js safe
 * fallback / human escalation still apply.
 *
 * @param {Object} params — { messages, temperature, top_p, frequency_penalty, max_tokens }
 * @param {Object} [opts]
 * @param {Array<{name, fn}>} [opts.providers] — override the chain (tests)
 * @param {Object} [opts.retry] — override per-provider retry options (tests)
 * @returns {Promise<{text: string}>}
 */
export async function generateCompletion(params, opts = {}) {
  const providers = opts.providers || buildProviderChain();
  if (providers.length === 0) {
    throw new Error('LLM: no providers configured (ANA_LLM_PROVIDERS empty or all API keys missing)');
  }

  const retry = {
    maxRetries: opts.retry?.maxRetries ?? DEFAULT_CHAIN_RETRY.maxRetries,
    baseDelayMs: opts.retry?.baseDelayMs ?? DEFAULT_CHAIN_RETRY.baseDelayMs,
    maxDelayMs: opts.retry?.maxDelayMs ?? DEFAULT_CHAIN_RETRY.maxDelayMs
  };

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
