// ========================================
// retry-utils.js — Retry with Exponential Backoff
// ========================================
// Provides robust retry logic for LLM API calls and other
// unreliable operations. Prevents a single transient failure
// (network blip, rate limit, 5xx) from crashing the entire
// conversation or campaign.
//
// Usage:
//   const result = await withRetry(() => groq.chat.completions.create({...}), {
//     maxRetries: 3,
//     baseDelayMs: 1000,
//     onRetry: (err, attempt) => console.log(`Retry ${attempt}: ${err.message}`)
//   });
// ========================================

/**
 * Sleep for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Shared list of retryable error patterns.
 * Used by BOTH the async (withRetry) and sync (withRetrySync) retry
 * helpers so transient failures (network blips, rate limits, 5xx,
 * busy/EMFILE file handles) behave consistently everywhere.
 */
export const DEFAULT_RETRYABLE_ERRORS = [
  'timeout',
  'rate_limit',
  'rate limit',
  '429',
  '50',
  'network',
  'socket',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'internal server error',
  'service unavailable',
  'bad gateway',
  'server error',
  'too many requests',
  'request timed out',
  'read timed out',
  'connect ETIMEDOUT',
  'connect ECONNREFUSED',
  'connect ECONNRESET',
  'Client network socket',
  'socket hang up',
  'eacces',
  'ebusy',
  'emfile',
  'enoent',
  'enospc',
  'eperm'
];

/**
 * Default retry configuration.
 */
const DEFAULT_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 15000,
  retryableErrors: DEFAULT_RETRYABLE_ERRORS
};

/**
 * Check if an error is retryable based on its message.
 * Returns true if the error matches any retryable pattern.
 *
 * @param {Error} err
 * @param {string[]} retryableErrors
 * @returns {boolean}
 */
export function isRetryable(err, retryableErrors) {
  const message = (err.message || '').toLowerCase();
  const name = (err.name || '').toLowerCase();
  const statusCode = err.status || err.statusCode || '';
  const fullText = `${name} ${message} ${statusCode}`;

  // Non-retryable errors (programming errors)
  if (/syntaxerror|typeerror|referenceerror|rangeerror|evalerror/i.test(name)) {
    return false;
  }

  // Check if any retryable pattern matches
  return retryableErrors.some(pattern =>
    fullText.includes(pattern.toLowerCase())
  );
}

/**
 * Execute an async function with retry logic (exponential backoff).
 *
 * @param {Function} fn — Async function to execute (must return a promise)
 * @param {Object} [options] — Configuration overrides
 * @param {number} [options.maxRetries=3] — Max retry attempts after first failure
 * @param {number} [options.baseDelayMs=1000] — Initial delay before first retry (ms)
 * @param {number} [options.maxDelayMs=15000] — Maximum delay between retries (ms)
 * @param {Function} [options.onRetry] — Callback on each retry: (err, attempt) => {}
 * @param {string[]} [options.retryableErrors] — Custom retryable error patterns
 * @returns {Promise<any>} — The result of the successful fn call
 * @throws {Error} — The last error if all retries fail
 */
export async function withRetry(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors, onRetry } = opts;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // On the last attempt, don't retry — throw the error
      if (attempt >= maxRetries) {
        break;
      }

      // Check if this error is retryable
      if (!isRetryable(err, retryableErrors)) {
        throw err; // Non-retryable — fail immediately
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt),
        maxDelayMs
      ) + Math.random() * 500; // Add up to 500ms jitter

      if (onRetry) {
        try { onRetry(err, attempt + 1); } catch (e) { /* ignore onRetry errors */ }
      }

      console.log(`[RETRY ${attempt + 1}/${maxRetries}] Waiting ${Math.round(delay)}ms after: ${err.message}`);
      await sleep(delay);
    }
  }

  // All retries exhausted — throw the last error
  throw lastError;
}

/**
 * Synchronous sleep (blocks the event loop briefly).
 * Uses Atomics.wait on a SharedArrayBuffer — the only standard
 * synchronous sleep available in Node.js. Used by withRetrySync
 * for small backoff delays between CSV/file write retries.
 *
 * @param {number} ms
 */
function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
}

/**
 * Execute a SYNCHRONOUS function with retry logic (exponential backoff).
 * Same semantics as withRetry, but for sync operations that cannot be
 * made async (e.g. appendFileSync CSV writes called fire-and-forget).
 *
 * IMPORTANT: the backoff sleeps block the event loop. Keep delays short
 * (milliseconds-to-low-seconds) — this is for file-write retries where a
 * brief pause is acceptable, NOT for long network retries (use withRetry).
 *
 * @param {Function} fn — Sync function to execute (may throw)
 * @param {Object} [options] — Same shape as withRetry options
 * @param {number} [options.maxRetries=3] — Max retry attempts after first failure
 * @param {number} [options.baseDelayMs=1000] — Initial delay before first retry (ms)
 * @param {number} [options.maxDelayMs=15000] — Maximum delay between retries (ms)
 * @param {Function} [options.onRetry] — Callback on each retry: (err, attempt) => {}
 * @param {string[]} [options.retryableErrors] — Custom retryable error patterns
 * @returns {any} — The result of the successful fn call
 * @throws {Error} — The last error if all retries fail
 */
export function withRetrySync(fn, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, baseDelayMs, maxDelayMs, retryableErrors, onRetry } = opts;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn();
    } catch (err) {
      lastError = err;

      // On the last attempt, don't retry — throw the error
      if (attempt >= maxRetries) {
        break;
      }

      // Check if this error is retryable
      if (!isRetryable(err, retryableErrors)) {
        throw err; // Non-retryable — fail immediately
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt),
        maxDelayMs
      ) + Math.random() * 200; // Add up to 200ms jitter

      if (onRetry) {
        try { onRetry(err, attempt + 1); } catch (e) { /* ignore onRetry errors */ }
      }

      console.log(`[RETRY-SYNC ${attempt + 1}/${maxRetries}] Waiting ${Math.round(delay)}ms after: ${err.message}`);
      sleepSync(delay);
    }
  }

  // All retries exhausted — throw the last error
  throw lastError;
}

/**
 * Validate a phone number. Returns true if the number is valid.
 * Accepts: +38970123456, 070123456, 0038970123456
 *
 * @param {string} phone
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+?389|0)?[7-9]\d{7,8}$/.test(cleaned);
}

/**
 * Validate a message string. Returns true if valid.
 * Prevents empty, whitespace-only, or excessively long messages.
 *
 * @param {string} message
 * @param {number} [maxLength=5000]
 * @returns {boolean}
 */
export function isValidMessage(message, maxLength = 5000) {
  if (!message || typeof message !== 'string') return false;
  const trimmed = message.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > maxLength) return false;
  return true;
}

/**
 * Create a safe fallback response when generateResponse encounters
 * an unrecoverable error. Preserves the session state so the
 * conversation can continue on retry.
 *
 * @param {string} errorMessage — The original error message (for logging)
 * @param {Object} session — Current session object
 * @returns {Object} — Safe response { text, type }
 */
export function createSafeFallback(errorMessage, session) {
  console.error(`[SAFE FALLBACK] Error in generateResponse: ${errorMessage}`);
  console.error(`[SAFE FALLBACK] Session ${session?.phone || 'unknown'} preserved — conversation continues`);

  // Return a generic continuation response
  // Uses Macedonian because the bot communicates in Macedonian
  return {
    text: 'Извинете, имав техничка грешка. Да продолжиме од каде што застанавме?',
    type: 'ERROR',
    error: errorMessage
  };
}
