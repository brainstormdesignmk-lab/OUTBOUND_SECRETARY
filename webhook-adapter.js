// ============================================================
// webhook-adapter.js — Viber webhook → MultiLeadEngine adapter
// ============================================================
// The production seam the engine header comment always promised:
//   onOwnerMessage(leadId, text)   ← Viber webhook later
//
// This module owns:
//   1. A MultiLeadEngine instance (real clock, real anti-ban, real
//      session-store persistence by default — all injectable for tests).
//   2. The phone → leadId index. Viber sender.id is a numeric chat id
//      that is USUALLY the owner's phone, but arrives in many shapes:
//      "070123456", "38970123456", "+38970123456", "7 01 234 567"...
//      The index is keyed by EVERY candidate form of the lead phone
//      (via phoneKeys + normalizePhone from lead-normalizer.js), and
//      inbound resolution tries every candidate form of the sender id,
//      so a match is found whenever the two numbers are the same
//      number written differently.
//   3. Event wiring: engine 'ana-message' events are delivered to the
//      owner over Viber. The 'greeting' and 'followup' events are ALSO
//      subscribed — as LOGGING hooks only. Do NOT add sending there:
//      every outbound (greeting, follow-up, reply) already flows
//      through _send → 'ana-message', so sending on greeting/followup
//      would DOUBLE-SEND. They exist for observability.
//   4. handleWebhookEvent(event) — the Viber webhook entry point.
//
// Deliberately does NOT import express or ws: the receiver
// (viber-server.cjs) owns the HTTP/WS shell; this module is pure
// logic + engine, which is why it's directly testable offline.
// ============================================================
import { MultiLeadEngine } from './engine.js';
import { normalizePhone } from './lead-normalizer.js';
import { sendViberMessage } from './viber-send.js';

// ============================================================
// phoneKeys — every recognizable written form of one phone number
// ============================================================
// Used on BOTH sides of the index: index the lead phone under all its
// keys, resolve the inbound sender id by trying all ITS keys. Any two
// numbers that are really the same number share at least one key.
export function phoneKeys(phone) {
  const keys = new Set();
  if (!phone) return keys;

  const raw = String(phone).trim();
  keys.add(raw);

  const norm = normalizePhone(raw);
  if (norm) keys.add(norm);

  const digits = raw.replace(/\D/g, '');
  if (digits) keys.add(digits);
  if (norm) keys.add(norm.replace(/\D/g, ''));           // +38970123456 → 38970123456
  if (/^07\d{7,9}$/.test(digits)) keys.add('389' + digits.slice(1)); // 070123456 → 38970123456

  return keys;
}

// ============================================================
// createWebhookAdapter — boot an engine + wire Viber transport
// ============================================================
export function createWebhookAdapter(options = {}) {
  const {
    leads = [],
    token,
    sendMessage,
    sessionStore,
    log = (...a) => console.log('[WEBHOOK-ADAPTER]', ...a)
  } = options;

  const engine = new MultiLeadEngine({
    // Production defaults come from the engine (real clock, anti-ban,
    // session-store singleton, typing delay). Tests inject every one.
    now: options.now,
    sleep: options.sleep,
    tickMs: options.tickMs,
    sessionStore,
    canSendContact: options.canSendContact,
    recordSent: options.recordSent,
    typingDelay: options.typingDelay,
    // Webhook replies are IMMEDIATE by default (0). The TUI's 15s
    // owner-follow-up grace window would make every Viber reply 15s
    // late for a single-message owner; operators who want quickfire
    // batching can pass ownerGraceMs explicitly.
    ownerGraceMs: options.ownerGraceMs ?? 0
  });

  // ---- phone → leadId index (all candidate forms of every lead phone)
  const phoneIndex = new Map();
  function indexLead(lead) {
    const id = String(lead.id);
    for (const key of phoneKeys(lead.phone)) {
      if (!phoneIndex.has(key)) phoneIndex.set(key, id);
    }
  }
  for (const lead of leads) {
    engine.loadLead(lead);
    for (const key of phoneKeys(lead.phone)) {
      // FIRST-WINS on a shared phone: log the shadow so the operator
      // knows a lead is unreachable via that number (both leads stay
      // loaded, but inbound messages resolve to the first index entry).
      if (phoneIndex.has(key)) {
        log(`phone key ${key} already indexed to lead ${phoneIndex.get(key)} — ${lead.id} shadowed for inbound`);
      }
    }
    indexLead(lead);
  }

  // ---- Viber chat id remembered per lead (reply goes to the chat id)
  const viberIdByLead = new Map();

  // ---- outbound delivery: the ONE place Ana's text becomes a Viber send
  const deliver = options.sendMessage
    ? options.sendMessage
    : ({ receiver, text }) => sendViberMessage({ token, receiver, text });

  engine.on('ana-message', ({ leadId, text }) => {
    const session = engine.getSession(leadId);
    if (!session) return;
    const receiver = viberIdByLead.get(leadId) || session.phone;
    if (!receiver) return;
    // Wrap the CALL in try/catch too: .catch() only guards the returned
    // promise, but an injected sendMessage that THROWS synchronously
    // (before returning a promise) would otherwise escape the emit loop
    // and crash the engine's event dispatch.
    try {
      deliver({ receiver, text, leadId, phone: session.phone })
        .then(() => log(`SENT ${receiver}: ${String(text).slice(0, 60)}`))
        .catch((err) => log(`SEND FAILED to ${receiver}: ${err.message}`));
    } catch (err) {
      log(`SEND FAILED to ${receiver}: ${err.message}`);
    }
  });

  // Observability hooks ONLY — see the header comment: never send here.
  engine.on('greeting', ({ leadId }) => log(`greeting → lead ${leadId}`));
  engine.on('followup', ({ leadId }) => log(`followup → lead ${leadId}`));

  // ---- inbound resolution
  function findLeadIdByPhone(phone) {
    if (!phone) return null;
    for (const key of phoneKeys(phone)) {
      const id = phoneIndex.get(key);
      if (id) return id;
    }
    return null;
  }

  /**
   * Viber webhook entry point. Handles ONLY 'message' events; every
   * other event (subscribed, unsubscribed, conversation_started,
   * delivered, seen, failed) is acknowledged and ignored — the engine's
   * scheduler owns greetings/follow-ups, not webhook lifecycle events.
   *
   * @returns {Promise<{handled:boolean, leadId?:string, outcome?:Object, reason?:string}>}
   */
  async function handleWebhookEvent(event) {
    if (!event || event.event !== 'message') {
      return { handled: false, reason: event && event.event ? `unsupported:${event.event}` : 'no-event' };
    }
    const senderId = event.sender && event.sender.id;
    const text = event.message && event.message.text;
    if (!senderId || typeof text !== 'string' || !text.trim()) {
      return { handled: false, reason: 'malformed-message' };
    }

    const leadId = findLeadIdByPhone(senderId);
    if (!leadId) {
      log(`unknown sender ${senderId} — no lead with that phone`);
      return { handled: false, reason: 'unknown-sender', senderId };
    }

    // Remember the chat id so replies always land on this exact thread.
    viberIdByLead.set(leadId, senderId);

    const outcome = await engine.onOwnerMessage(leadId, text);
    return { handled: true, leadId, senderId, outcome };
  }

  return {
    engine,
    handleWebhookEvent,
    findLeadIdByPhone,
    phoneKeys,
    start: (opts) => engine.start(opts),
    stop: () => engine.stop(),
    getSnapshot: () => engine.getSnapshot()
  };
}
