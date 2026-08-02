// ========================================
// handlers/human-escalation.js — Human escalation (NEEDS_HUMAN)
// ========================================
// The bot's handoff trigger. When the owner explicitly asks to speak
// with a real person (or the campaign hits repeated unrecoverable
// service failures), the conversation must leave the bot and go to a
// human operator.
//
// Layer placement: this fires in service.js BEFORE the hardcoded early
// responses and phase detection, so an escalation request is never
// swallowed by a canned objection/agency answer.
//
// What happens:
//   1. runHumanEscalation() detects an explicit request (Latin AND
//      Cyrillic phrase list — Macedonian Viber owners type both).
//   2. It returns { text: <handoff message>, type: 'ESCALATE' }.
//   3. campaign.js sends the handoff text, then parks the session:
//      markNeedsHuman() → LeadState.NEEDS_HUMAN, metrics + audit log,
//      appendToCSV (the row's status column carries 'needs_human' so
//      the operator can pick the lead up).
//
// The bot never resumes a NEEDS_HUMAN session (isActive() = false), so
// the handoff is final until a human takes over out-of-band.
// ========================================

// ========================================
// EXPLICIT HUMAN-REQUEST PHRASES
// Substring matching on the lowercased input (both scripts).
// Deliberately NOT bare words ("agent", "covek") — those appear in
// normal real-estate conversation ("ima li agent za ovoj stan?").
// Only full request phrases escalate.
// ========================================
const ESCALATION_PHRASES = [
  // === Latin script ===
  'sakam da zboram so covek',
  'sakam da pricam so covek',
  'sakam da razgovaram so covek',
  'sakam da zboram so vraboten',
  'sakam da pricam so vraboten',
  'sakam da razgovaram so vraboten',
  'sakam so vraboten',
  'sakam so covek',
  'sakam so vistinski covek',
  'sakam vistinski covek',
  'sakam da zboram so ziv covek',
  'sakam ziv covek',
  'vistinski covek',
  'sakam covek',
  'sakam vraboten',
  'dajte mi vraboten',
  'daj mi vraboten',
  'dajte mi covek',
  'daj mi covek',
  'dajte mi vistinski covek',
  'sakam da zboram so nekoj od agencijata',
  'sakam da pricam so nekoj od agencijata',
  'sakam da zboram so agent',
  'sakam da pricam so agent',
  'sakam agent',
  'sakam da se vidime licno',
  'sakam da dojdam vo kancelarija',
  'sakam telefonski kontakt',
  'sakam da me kontaktira vraboten',
  'sakam da me kontaktira covek',
  'sakam da zboram so ziv chovek',
  'dali moze da zboram so covek',
  'moze li da zboram so covek',
  'moze li da pricam so covek',
  // NOTE: NO bare "povikaj me" / "повикај ме" (call me) — owners routinely
  // say "повикајте ме кога ќе имате клиент" (call me when you have a client),
  // which is a NORMAL cooperative statement, NOT a request for a human.
  'kontaktirajte me licno',
  'kontaktirajte me vraboten',
  'ne sakam da zboram so bot',
  'ne sakam da pricam so bot',
  'ne sakam so bot',
  'ne sakam da zboram so robot',
  'ti si bot',
  'dali si bot',
  'dali si robot',
  'iskluci go botot',
  'isklucete go botot',
  // English (owner occasionally switches)
  'live agent',
  'real person',
  'human agent',
  'talk to a human',
  'talk to an agent',
  'speak to a human',
  'i want to talk to a real person',
  'i want a human',

  // === Cyrillic script ===
  'сакам да зборам со човек',
  'сакам да причам со човек',
  'сакам да разговарам со човек',
  'сакам да зборам со вработен',
  'сакам да причам со вработен',
  'сакам да разговарам со вработен',
  'сакам со вработен',
  'сакам со човек',
  'сакам со вистински човек',
  'сакам вистински човек',
  'сакам да зборам со жив човек',
  'сакам жив човек',
  'вистински човек',
  'сакам човек',
  'сакам вработен',
  'дајте ми вработен',
  'дај ми вработен',
  'дајте ми човек',
  'дај ми човек',
  'дајте ми вистински човек',
  'сакам да зборам со некој од агенцијата',
  'сакам да причам со некој од агенцијата',
  'сакам да зборам со агент',
  'сакам да причам со агент',
  'сакам агент',
  'сакам да се видиме лично',
  'сакам да дојдам во канцеларија',
  'сакам телефонски контакт',
  'сакам да ме контактира вработен',
  'сакам да ме контактира човек',
  'дали може да зборам со човек',
  'може ли да зборам со човек',
  'може ли да причам со човек',
  'контактирајте ме лично',
  'контактирајте ме вработен',
  'не сакам да зборам со бот',
  'не сакам да причам со бот',
  'не сакам со бот',
  'не сакам да зборам со робот',
  'ти си бот',
  'дали си бот',
  'дали си робот',
  'исклучи го ботот',
  'исклучете го ботот'
];

/**
 * Detect an explicit request to speak with a real person.
 * Lowercase + trim the input first; matches any full phrase.
 *
 * @param {string} u — lowercased trimmed user input
 * @returns {boolean}
 */
export function isHumanEscalationRequest(u) {
  if (!u || typeof u !== 'string') return false;
  const normalized = u.toLowerCase().trim();
  return ESCALATION_PHRASES.some(phrase => normalized.includes(phrase));
}

// ========================================
// HANDOFF MESSAGES (Macedonian, rotational)
// Sent to the owner before the session is parked in NEEDS_HUMAN.
// ========================================
const ESCALATION_MESSAGES = [
  'Разбирам. Ќе ве контактира некој од нашата агенција за да ви помогне. Ви благодарам.',
  'Разбирам дека сакате да разговарате со некого лично. Ќе ве контактира вработен од агенцијата што е можно поскоро. Ви благодарам.',
  'Ви благодарам за трпението. Вашето барање е проследено до нашиот тим — ќе ве контактираат лично.'
];

/**
 * Pick a random handoff message.
 * @returns {string}
 */
export function getHumanEscalationMessage() {
  return ESCALATION_MESSAGES[Math.floor(Math.random() * ESCALATION_MESSAGES.length)];
}

/**
 * Run the human-escalation check. Returns a handoff response when the
 * owner explicitly asked for a real person, or null to continue the
 * normal flow.
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @returns {{text:string, type:string}|null}
 */
export function runHumanEscalation({ u }) {
  if (isHumanEscalationRequest(u)) {
    console.log('[HUMAN ESCALATION: owner requested a real person]');
    return {
      text: getHumanEscalationMessage(),
      type: 'ESCALATE'
    };
  }
  return null;
}
