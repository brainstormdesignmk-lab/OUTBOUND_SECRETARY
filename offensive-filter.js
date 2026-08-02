// ========================================
// OFFENSIVE FILTER — 3-Strike Protocol (v2)
// ========================================
// v2: detection logic moved to offensive-classifier.js (normalizer + data-
// driven lexicon). This module keeps the public API surface used across the
// codebase (detectOffensive, getStrikeResponse, blocklist helpers) plus the
// STRIKE-DECAY state machine.
//
// Strike protocol (ALL responses in Macedonian, random rotation):
//   Strike 1 → professional rebuff (STRIKE_1_RESPONSES — e.g. "Ве молам, да ја
//              задржиме комуникацијата професионална.")
//   Strike 2 → final warning (STRIKE_2_RESPONSES — "...последна опомена...")
//   Strike 3 → TERMINATE_SESSION + add to blocklist
//
// STRIKE DECAY (user-approved):
//   - Strike 1 decays: if the NEXT message is normal (owner corrects himself),
//     the counter resets to 0 — a later offense starts from strike 1 again.
//   - Two CONSECUTIVE offenses reach strike 2 (final warning). After that the
//     counter NEVER decays: a normal message leaves it at 2, and any further
//     offense terminates the chat at strike 3.
// ========================================

import fs from 'fs';
import { classifyOffensive } from './offensive-classifier.js';

// Path to persistent blocklist file (same data directory as CSV)
export const BLOCKLIST_PATH = '/home/metropolis2/real-estate-atoms/data/blocked-numbers.json';

// ========================================
// DETECT OFFENSIVE — thin wrapper over the classifier
// ========================================
// Returns: {
//   isOffensive: boolean,
//   severity: 0 | 1 | 2 | 3,
//   category: string | null,
//   confidence: number,
//   reason: string | null
// }
export function detectOffensive(text) {
  return classifyOffensive(text);
}

// ========================================
// STRIKE DECAY STATE MACHINE
// ========================================
// Returns the new strike counter after a message:
//   - offensive message → counter + 1 (capped at 3)
//   - normal message after strike 1 → 0 (owner corrected — forgiveness)
//   - normal message after strike 2+ → unchanged (final warning never decays)
// ========================================
export function applyStrikeDecay(currentStrikes, messageWasOffensive) {
  const cur = currentStrikes || 0;
  if (messageWasOffensive) return Math.min(cur + 1, 3);
  if (cur === 1) return 0; // strike 1 resets on the next normal message
  return cur;              // strike 2 (and 3) never decay
}

// ========================================
// BLOCKLIST MANAGEMENT
// ========================================

export function loadBlocklist() {
  try {
    if (fs.existsSync(BLOCKLIST_PATH)) {
      const data = fs.readFileSync(BLOCKLIST_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`[BLOCKLIST] Error loading: ${err.message}`);
  }
  return [];
}

export function isNumberBlocked(phone) {
  if (!phone) return false;
  const blocklist = loadBlocklist();
  // Normalize: strip all non-digits, then remove leading zeros (handles Viber's
  // various number formats: +389, 00389, 389, 07 prefix, etc.)
  const normalized = phone.replace(/\D/g, '').replace(/^0+/, '');
  return blocklist.some(entry => entry.phone.replace(/\D/g, '').replace(/^0+/, '') === normalized);
}

export function addToBlocklist(phone, reason) {
  if (!phone) return;
  const blocklist = loadBlocklist();
  const normalized = phone.replace(/\D/g, '');

  // Don't duplicate
  if (blocklist.some(entry => entry.phone.replace(/\D/g, '') === normalized)) {
    console.log(`[BLOCKLIST] ${phone} already blocked`);
    return;
  }

  blocklist.push({
    phone: normalized,
    reason: reason || 'offensive_behavior',
    date: new Date().toISOString()
  });

  try {
    const dir = BLOCKLIST_PATH.substring(0, BLOCKLIST_PATH.lastIndexOf('/'));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify(blocklist, null, 2));
    console.log(`[BLOCKLIST] Added ${normalized} — ${reason}`);
  } catch (err) {
    console.error(`[BLOCKLIST] Error saving: ${err.message}`);
  }
}

// ========================================
// STRIKE RESPONSES — ALL in Macedonian, random rotation
// ========================================
// Strike 1 (first offense) — professional rebuff. Rotates randomly so Ana
// doesn't sound like a broken record. All variants keep the professional tone.
// Tests verify strike-1 rebuffs via membership in this exported array.
export const STRIKE_1_RESPONSES = [
  'Ве молам, да ја задржиме комуникацијата професионална.',
  'Господине, ве молам да одржуваме професионален тон во разговорот.',
  'Ве молам, да продолжиме професионално — ова е деловна комуникација.',
  'Господине, ќе ви бидам благодарна доколку комуницираме професионално.'
];

// Strike 2 (final warning) — last chance before termination. All variants keep
// the 'последна опомена' phrasing the tests assert on.
export const STRIKE_2_RESPONSES = [
  'Господине, ова е последна опомена. Доколку продолжите со ваков речник, ќе морам да го прекинам разговорот.',
  'Господине, ова е вашата последна опомена. Ако продолжите вака, ќе бидам принудена да го прекинам разговорот.',
  'Господине, последна опомена — доколку не се смирите, разговорот ќе биде прекинат.'
];

// Get the response text for a given strike level
export function getStrikeResponse(strikeCount, isRent) {
  if (strikeCount === 1) {
    return STRIKE_1_RESPONSES[Math.floor(Math.random() * STRIKE_1_RESPONSES.length)];
  }
  if (strikeCount === 2) {
    return STRIKE_2_RESPONSES[Math.floor(Math.random() * STRIKE_2_RESPONSES.length)];
  }
  // Strike 3 — protocol says output ONLY this string
  return "TERMINATE_SESSION";
}
