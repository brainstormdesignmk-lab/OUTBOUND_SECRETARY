// ========================================
// handlers/state-machine.js — Phase transition table
// ========================================
// The formal home of the conversation phase machine (Layer 2 of the
// three-layer architecture: LeadState / Phase / Strike).
//
// PHASES: PERSUASION → DATA_COLLECTION → AWAITING_PHOTOS → CLOSED
//
// This module centralizes every phase transition in ONE place:
//   1. PHASES — the canonical phase enum (string values persisted in
//      session.phase, so values must stay stable for crash recovery).
//   2. TRANSITIONS — the (state, event) → { next, guard? } table. Adding a
//      new phase = adding an enum value + rows + a dispatch in service.js.
//   3. transition() / transitionTo() — the single chokepoint where the
//      phase is applied: sets session.phase, logs the transition, and
//      records per-phase metrics. This absorbs what mirrorPhase() used to do.
//
// The PERSUASION/DATA_COLLECTION transitions are driven by the rule-based
// guards in detectPhase() (handlers/persuasion-phase.js), which call
// transitionTo(). AWAITING_PHOTOS is fully table-driven via transition().
// ========================================
import { metrics } from '../metrics.js';

export const PHASES = {
  PERSUASION: 'PERSUASION',
  DATA_COLLECTION: 'DATA_COLLECTION',
  AWAITING_PHOTOS: 'AWAITING_PHOTOS',
  CLOSED: 'CLOSED'
};

// ========================================
// TRANSITIONS TABLE
// (state, event) → { next, guard? }
// ========================================
// NOTE: The PERSUASION rows (accept_cooperation, reject_1/2/3, low_interest)
// are implemented inside detectPhase() using the existing confidence gates
// and rejection escalation — they call transitionTo() at each exit point.
// The rows below document the TABLE-driven subset (AWAITING_PHOTOS) plus
// the DATA_COLLECTION → AWAITING_PHOTOS entry used by the photos handler.
// ========================================
export const TRANSITIONS = {
  [PHASES.DATA_COLLECTION]: {
    photos_send_later: { next: PHASES.AWAITING_PHOTOS }
  },
  [PHASES.AWAITING_PHOTOS]: {
    photos_received:    { next: PHASES.CLOSED },
    photos_unavailable: { next: PHASES.CLOSED },
    owner_back:         { next: PHASES.DATA_COLLECTION },
    timeout:            { next: PHASES.CLOSED }
  }
};

/**
 * Apply a table-driven transition. No-op (returns null) if the
 * (session.phase, event) pair has no row.
 *
 * @param {Object} session — LeadSession (mutated: session.phase)
 * @param {string} event — transition event name (e.g. 'photos_received')
 * @param {Object} [ctx] — optional context for guards
 * @returns {string|null} — the next phase, or null if no transition
 */
export function transition(session, event, ctx = {}) {
  const row = TRANSITIONS[session.phase]?.[event];
  if (!row) return null;
  if (row.guard && !row.guard(ctx)) return null;
  applyPhase(session, row.next, event);
  return row.next;
}

/**
 * Move a session to a specific phase (used by detectPhase's rule-based
 * exits). Logs the transition + metrics; no-op if already in that phase.
 *
 * @param {Object} session
 * @param {string} phase — one of PHASES
 * @param {string} [event='phase_set']
 */
export function transitionTo(session, phase, event = 'phase_set') {
  applyPhase(session, phase, event);
}

// Shared chokepoint — the ONLY place session.phase is mutated.
function applyPhase(session, phase, event) {
  const prev = session.phase;
  if (prev === phase) return;
  session.phase = phase;
  console.log(`[PHASE TRANSITION: ${prev || '(none)'} → ${phase} (${event})]`);
  metrics.inc('phaseEntered', 1, { phase });
  metrics.inc('phase_' + phase, 1);
}
