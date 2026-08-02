// ========================================
// handlers/awaiting-photos.js — AWAITING_PHOTOS phase handler
// ========================================
// Layer 2 phase: DATA_COLLECTION → AWAITING_PHOTOS → CLOSED
//
// The owner committed to sending photos on Viber later ("ke gi pratam
// podocna"). The conversation pauses in an async wait state. On the owner's
// next message, this handler resolves the wait:
//
//   photos_received    → CLOSED  (owner sent/confirmed photos now)
//   photos_unavailable → CLOSED  (owner definitively can't send — photography)
//   owner_back         → DATA_COLLECTION (owner resumed talking normally —
//                         resume the field flow, e.g. remaining fields/close)
//   (timeout)          → handled by campaign's no-response path
//
// Also handles the cooperation-rollback edge: if the owner challenges the
// cooperation while waiting for photos (runEarlyResponses reset
// cooperationAccepted=false), the session must return to PERSUASION — the
// orchestrator's AWAITING_PHOTOS dispatch returns null so detectPhase runs.
// ========================================
import { PHASES, transition, transitionTo } from './state-machine.js';

// ========================================
// PHOTOS RECEIVED — owner says they sent / have the photos now
// ========================================
const PHOTOS_RECEIVED_RE = /(?:evе|еве|evo|ево|eto|ето)\b|isprativ|испратив|isprativeni|испратени|prativeni|пратени|prateni|пратени|gi\s+isprativ|ги\s+испратив|gi\s+prativ|ги\s+пратив|sliki\s+se|слики\s+се|fotografi\s+se|фотографии\s+се|evе\s+se|еве\s+се|se\s+evе|се\s+еве/i;

// ========================================
// PHOTOS UNAVAILABLE — owner definitively can't send photos
// ========================================
const PHOTOS_UNAVAILABLE_RE = /nema\s+fotografi|нема\s+фотографии|nema\s+sliki|нема\s+слики|nema\s+da\s+pratam|нема\s+да\s+пратам|ne\s+mozam\s+da\s+ispratam|не\s+можам\s+да\s+испратам|ne\s+mozam\s+da\s+pratam|не\s+можам\s+да\s+пратам|ne\s+mozam|не\s+можам|ne\s+se\s+pri\s+raka|не\s+се\s+при\s+рака|nemam\s+sliki|немам\s+слики|nemam\s+fotografi|немам\s+фотографии|bez\s+sliki|без\s+слики|bez\s+fotografi|без\s+фотографии/i;

// ========================================
// Close messages (rotational, Macedonian) — mirrored from runDataCollectionFlow
// ========================================
const PHOTOS_RECEIVED_CLOSE = [
  'Ви благодарам за фотографиите.\n\nГи имам сите потребни информации.\n\nЌе ве контактирам кога ќе имаме заинтересиран клиент.',
  'Ви благодарам за сликите.\n\nСè е комплетно. Ќе ве известам штом имаме сериозен заинтересиран клиент.'
];

const PHOTOS_UNAVAILABLE_CLOSE = [
  'Разбирам. Во тој случај, ќе ве контактирам за да организираме фотографирање на имотот.\n\nПријатен ден.',
  'Не е проблем. Ќе ве контактираме за да организираме професионално фотографирање на имотот.\n\nВи благодарам.'
];

/**
 * Resolve the AWAITING_PHOTOS wait. Returns a response to send, or null
 * when the session should fall through to the normal flow (owner_back
 * resumed DATA_COLLECTION / rollback returned to PERSUASION).
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @returns {Object|null}
 */
export function runAwaitingPhotos({ u, session }) {
  // === COOPERATION ROLLBACK EDGE ===
  // If runEarlyResponses already rolled back cooperation (owner challenged it
  // while we were waiting for photos), return to PERSUASION and let the
  // orchestrator's detectPhase handle the persuasion flow.
  if (session.collectedData.cooperationAccepted === false) {
    transitionTo(session, PHASES.PERSUASION, 'cooperation_rollback');
    console.log(`[AWAITING_PHOTOS: cooperation rolled back → PERSUASION]`);
    return null;
  }

  // === 1. PHOTOS RECEIVED — owner sent / confirmed photos now ===
  if (PHOTOS_RECEIVED_RE.test(u)) {
    session.collectedData.photos = true;
    session.collectedData.photosPending = false;
    session.collectedData.photosStatus = 'VIBER_RECEIVED';
    console.log(`[PHOTOS: VIBER_RECEIVED — owner delivered photos]`);
    transition(session, 'photos_received'); // → CLOSED
    return {
      text: PHOTOS_RECEIVED_CLOSE[Math.floor(Math.random() * PHOTOS_RECEIVED_CLOSE.length)],
      type: "CLOSE"
    };
  }

  // === 2. PHOTOS UNAVAILABLE — owner definitively can't send ===
  if (PHOTOS_UNAVAILABLE_RE.test(u)) {
    session.collectedData.photos = false;
    session.collectedData.photosPending = false;
    session.collectedData.photosStatus = 'PHOTOGRAPHY_NEEDED';
    console.log(`[PHOTOS: PHOTOGRAPHY_NEEDED — owner can't provide photos]`);
    transition(session, 'photos_unavailable'); // → CLOSED
    return {
      text: PHOTOS_UNAVAILABLE_CLOSE[Math.floor(Math.random() * PHOTOS_UNAVAILABLE_CLOSE.length)],
      type: "CLOSE"
    };
  }

  // === 3. OWNER BACK — resumed talking normally ===
  // Resume DATA_COLLECTION: the field flow will ask remaining fields or
  // close if everything is already collected.
  transition(session, 'owner_back'); // → DATA_COLLECTION
  console.log(`[AWAITING_PHOTOS: owner back → resume DATA_COLLECTION]`);
  return null;
}
