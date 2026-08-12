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
import { config } from '../config.js';

// ========================================
// PHOTOS MARKETING FOLLOW-UP (reported requirement)
// When the owner has NO photos ("NEMAM"), Ana asks if he could MAKE them
// himself and send them on Viber — the photos are needed for marketing.
// Rotational variants so the bot never repeats itself verbatim.
// ========================================
const PHOTOS_MAKE_QUESTIONS = [
  'Разбирам. Фотографиите се многу важни за маркетингот на огласот. Дали би можеле сами да ги направите и да ни ги испратите на Viber?',
  'Не е проблем. За да го промовираме имотот подобро, ни се потребни фотографии. Дали би можеле да направите неколку и да ни ги испратите на Viber?',
  'Разбирам дека немате фотографии. Дали би можеле да ги фотографирате со телефон и да ни ги испратите на Viber? Така огласот ќе биде многу попривлечен.'
];

const PHOTOS_MAKE_YES_ACK = [
  'Одлично! Ќе ги очекувам фотографиите на Viber.',
  'Супер! Испратете ни ги фотографиите на Viber кога ќе бидат готови.',
  'Благодарам! Ги очекувам фотографиите на Viber за да можеме да го промовираме имотот.'
];

// ========================================
// PROFESSIONAL PHOTOGRAPHY OFFER (from our agents)
// Sent when the owner CANNOT make photos himself. If he accepts, the
// lead becomes PHOTOGRAPHY_NEEDED (our photographers handle it).
// ========================================
const PHOTOS_PHOTOGRAPHY_OFFER = [
  'Доколку сакате, нашите соработници можат професионално да го фотографираат имотот. Дали сте заинтересирани?',
  'Доколку не можете сами, можеме да организираме професионално фотографирање од наша страна. Дали сакате?',
  'Доколку ви треба помош со фотографиите, нашите фотографи можат да го направат тоа професионално. Дали да организираме?'
];

const PHOTOS_PHOTOGRAPHY_YES_ACK = [
  'Одлично! Ќе ве контактираме за да организираме фотографирање на имотот.',
  'Супер! Нашите соработници ќе ве контактираат за фотографирањето.'
];

// ========================================
// REMINDER LADDER (2 days / 5 days) — the owner committed to sending
// photos on Viber but hasn't. Sent by the engine's AWAITING_PHOTOS timer.
// ========================================
const PHOTOS_REMINDER_1 = [
  'Здраво! Само да ве потсетам за фотографиите на имотот — доколку сте успеале да ги направите, испратете ни ги на Viber.',
  'Здраво, да ве потсетам — ги очекуваме фотографиите на имотот на Viber за да го промовираме огласот.'
];

const PHOTOS_REMINDER_2 = [
  'Здраво! Се уште ги очекуваме фотографиите на имотот. Доколку имате некаква потешкотија, пишете ни — ќе најдеме решение.',
  'Здраво, само да проверам за фотографиите. Доколку не можете сами да ги направите, можеме да организираме професионално фотографирање.'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const photosMessages = {
  makeQuestion: () => pick(PHOTOS_MAKE_QUESTIONS),
  makeYesAck: () => pick(PHOTOS_MAKE_YES_ACK),
  photographyOffer: () => pick(PHOTOS_PHOTOGRAPHY_OFFER),
  photographyYesAck: () => pick(PHOTOS_PHOTOGRAPHY_YES_ACK),
  reminder: (n) => pick(n === 2 ? PHOTOS_REMINDER_2 : PHOTOS_REMINDER_1)
};

/**
 * "IF THE PROPERTY IS WORTH IT — MANAGER REVIEWS THEM": a NO_PHOTOS lead
 * whose price meets the transaction-specific threshold (config) is flagged
 * photosManagerReview=true so the ops team reviews it. Rent vs sale use
 * different thresholds (monthlyRent vs cleanPrice).
 */
export function isPhotosWorthManagerReview(session) {
  const d = session?.collectedData || {};
  if (d.transactionType === 'rent') {
    return typeof d.monthlyRent === 'number' && d.monthlyRent >= config.PHOTOS_MANAGER_REVIEW_MIN_RENT;
  }
  return typeof d.cleanPrice === 'number' && d.cleanPrice >= config.PHOTOS_MANAGER_REVIEW_MIN_SALE_PRICE;
}

// ========================================
// PHOTOS RECEIVED — owner says they sent / have the photos now
// ========================================
const PHOTOS_RECEIVED_RE = /(?:evе|еве|evo|ево|eto|ето)\b|isprativ|испратив|isprativeni|испратени|prativeni|пратени|prateni|пратени|gi\s+isprativ|ги\s+испратив|gi\s+prativ|ги\s+пратив|sliki\s+se|слики\s+се|fotografi\s+se|фотографии\s+се|evе\s+se|еве\s+се|se\s+evе|се\s+еве/i;

// ========================================
// PHOTOS UNAVAILABLE — owner definitively can't send photos
// ========================================
const PHOTOS_UNAVAILABLE_RE = /nema\s+fotografi|нема\s+фотографии|nema\s+sliki|нема\s+слики|nema\s+da\s+pratam|нема\s+да\s+пратам|ne\s+mozam\s+da\s+ispratam|не\s+можам\s+да\s+испратам|ne\s+mozam\s+da\s+pratam|не\s+можам\s+да\s+пратам|ne\s+mozam|не\s+можам|ne\s+se\s+pri\s+raka|не\s+се\s+при\s+рака|nemam\s+sliki|немам\s+слики|nemam\s+fotografi|немам\s+фотографии|bez\s+sliki|без\s+слики|bez\s+fotografi|без\s+фотографии/i;

// ========================================
// PHOTOS SENDING QUESTION — the owner asks where/how to send the photos
// ("NA OVOJ BROJ DA GI PRATAM?", "KADE DA GI PRATAM?", "NA KOJ BROJ?",
// "DALI DA GI PRATAM NA VIBER?"). Answer it and KEEP waiting.
// ========================================
// First-person present/future sending forms ("da/ке gi pratam",
// "ispratam", "isprajam") OR an address/place context + sending verb
// ("na ovoj broj", "na koj broj/adresa", "kade", "tuka", "ovde",
// "viber"). Past-tense deliveries ("isprativ", "gi prativ") are handled
// by PHOTOS_RECEIVED_RE above and must never land here.
// Alt 3 (place words) requires the "gi" object — a reflexive non-photos
// phrase like "kade da se pratam" (where do I go/report) must not get the
// photos ack. "na viber" alone strongly implies the photos context, so it
// keeps the flexible form.
const PHOTOS_SENDING_QUESTION_RE = /(?:da\s+li|дали)?(?:da|ке|ќе|treba|треба|mozam|можам)\s+gi\s+(?:pratam|пратам|ispratam|испратам|isprajam|испраќам)|(?:na\s+)?(?:ovoj|кој|koj|ova|ова)\s+(?:broj|adresa|адреса|adres|адрес)[^\n]{0,30}?(?:pratam|пратам|ispratam|испратам|isprajam|испраќам)|(?:kade|каде|кај|tuka|тука|ovde|овде)[^\n]{0,30}?gi\s+(?:pratam|пратам|ispratam|испратам|isprajam|испраќам)|na\s+viber[^\n]{0,40}?(?:pratam|пратам|ispratam|испратам|isprajam|испраќам)/i;

const PHOTOS_SENDING_QUESTION_ACK = [
  'Да, испратете ги на Viber на овој број. Ќе ги очекувам!',
  'Секако! Испратете ги на Viber на овој број кога ќе бидат готови.',
  'Да, точно така — на Viber на овој број. Ви благодарам!'
];

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

  // === 2.5 PHOTOS SENDING QUESTION — owner asks where/how to send the photos ===
  // ("NA OVOJ BROJ DA GI PRATAM?", "KADE DA GI PRATAM?", "NA KOJ BROJ?").
  // Answer the question and KEEP waiting — a question is never a reason to
  // close. Reported: owner asked "NA OVOJ BROJ DA GI PRATAM?" and Ana
  // closed without answering, because the message fell through to owner_back
  // and, with all fields already collected, the resumed flow closed
  // immediately. No transition → phase stays AWAITING_PHOTOS.
  if (PHOTOS_SENDING_QUESTION_RE.test(u)) {
    console.log(`[PHOTOS: sending question — answered, staying in AWAITING_PHOTOS]`);
    return {
      text: PHOTOS_SENDING_QUESTION_ACK[Math.floor(Math.random() * PHOTOS_SENDING_QUESTION_ACK.length)],
      type: "QUESTION"
    };
  }

  // === 3. OWNER BACK — resumed talking normally ===
  // Resume DATA_COLLECTION: the field flow will ask remaining fields or
  // close if everything is already collected.
  transition(session, 'owner_back'); // → DATA_COLLECTION
  console.log(`[AWAITING_PHOTOS: owner back → resume DATA_COLLECTION]`);
  return null;
}
