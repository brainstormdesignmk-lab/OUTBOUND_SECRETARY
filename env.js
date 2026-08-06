// ========================================
// env.js — Single env-file loader + fail-fast key checks
// ========================================
// Option C: the app reads secrets from process.env, with ONE optional
// fallback to a user-level env file OUTSIDE the project directory
// (~/.ana/ana.env). This completely sidesteps the freebuff-CLI statx()
// crash on kernel < 4.11, which is triggered by any `.env*` file living
// in the project CWD — here, no `.env*` file ever lives in the project.
//
// Why ~/.ana/ana.env (not .env):
//   - Freebuff CLI crashes on this machine whenever a .env* file exists
//     in the CWD (it calls statx(), missing on kernel < 4.11). Keeping
//     the env file in the user's home dir keeps the CWD clean.
//   - The same rule applies to the 32-bit Atom deploy boxes (antiX 21,
//     kernel 4.9): they also lack statx, so a .env* in the project dir
//     would crash Freebuff there too. ~/.ana/ana.env works everywhere.
//   - ~/.ana/ana.env lives outside the repo → never gets committed, no
//     .gitignore gymnastics needed.
//
// Precedence (dotenv never overrides an already-set variable):
//   1. Real environment (shell export, systemd/init script, Docker, CI)
//   2. ~/.ana/ana.env   (dev convenience, one place per user/machine)
//
// Usage:
//   import './env.js';                // side-effect: loads ~/.ana/ana.env
//   import { requireEnv } from './env.js';
//   const key = requireEnv('GROQ_API_KEY');
// ========================================
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';

// User-level env file — deliberately OUTSIDE the project directory so no
// `.env*` file ever appears in the CWD (see header comment).
export const USER_ENV_PATH = path.join(os.homedir(), '.ana', 'ana.env');

// Best-effort load of the user env file. dotenv never overrides existing
// process.env values, so real environment variables always win. A missing
// file returns { error } (never throws) — a missing dev convenience file
// must not crash the app, so we just return null for it.
export function loadUserEnv() {
  const result = dotenv.config({ path: USER_ENV_PATH, quiet: true });
  return result.error ? null : result.parsed;
}

// === Side-effect on import: make ~/.ana/ana.env available to every
// module that imports this file, regardless of import order. ===
loadUserEnv();

/**
 * Fail-fast secret accessor. Returns the value or throws a clear message
 * so missing configuration is caught at startup — NOT silently hours
 * into a campaign when the first LLM call fails.
 *
 * @param {string} name — env var name (e.g. 'GROQ_API_KEY')
 * @returns {string}
 */
export function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `MISSING REQUIRED ENV: ${name}\n` +
      `  Set it in ${USER_ENV_PATH} (see ana.env.example) or export it:\n` +
      `  export ${name}="your-value"\n`
    );
  }
  return v.trim();
}
