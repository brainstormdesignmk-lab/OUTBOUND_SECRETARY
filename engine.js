// ============================================================
// engine.js — MultiLeadEngine: event-driven multi-conversation core
// ============================================================
// The production model Ana should run under: MANY independent
// conversations at once, driven by a scheduler tick + inbound
// message events — NOT the sequential "finish lead 1, then lead 2"
// blocking loop in campaign.js.
//
//   Scrapers → lead-normalizer → engine.loadLeads()
//              │
//              ▼
//        MultiLeadEngine (this)
//              │  owns: sessions map (per-lead state), message
//              │        event queue, real/injected clock, shared
//              │        anti-ban budget, session-store persistence
//              │
//              ├─ tick() every tickMs:
//              │     • greet next pending lead when eligible
//              │       (10-min idle rule + anti-ban gates)
//              │     • fire follow-ups / timeouts per session
//              │
//              └─ onOwnerMessage(leadId, text)   ← Viber webhook later
//                    → generateResponse → send (anti-ban paced)
//                    → route response type → wait/close/escalate
//
// REUSED UNCHANGED: LeadSession + LeadState (scheduler.js),
// antiBan (anti-ban.js), generateResponse (service.js), session-store,
// appendToCSV, transition/PHASES, metrics, logger.
//
// Testability: the constructor accepts an injected clock (`now`),
// sleep fn, and anti-ban gates (canSendContact/recordSent/typingDelay)
// so the test suite can fast-forward minutes in milliseconds and stub
// the quota logic — while the interactive TUI runs on the real clock
// with the real anti-ban module.
//
// Anti-ban semantics (per user spec):
//   • New-lead greeting gate: 10 min since the LAST OWNER MESSAGE
//     anywhere (the "10MIN PAUSE FROM THE LAST OWNER CHAT" rule).
//     The very first lead of a campaign greets immediately.
//   • Global throttle: inter-contact gap + hourly/daily quotas +
//     active-hours windows, all via the existing anti-ban module.
//   • forceNext(): instant bypass — skip every delay and greet the
//     next pending lead now, even outside active hours (the ENTER key).
// ============================================================
import { config } from './config.js';
import { generateFirstMessage, generateResponse } from './service.js';
import { LeadSession, LeadState } from './scheduler.js';
import { antiBan } from './anti-ban.js';
import { getFollowUpMessage, getNoResponseClose } from './deal-terms.js';
import { isNumberBlocked, addToBlocklist } from './offensive-filter.js';
import { isValidMessage } from './retry-utils.js';
import { getSessionStore } from './session-store.js';
import { appendToCSV } from './lead-processor.js';
import { metrics } from './metrics.js';
import { logger } from './logger.js';
import { PHASES, transition } from './handlers/state-machine.js';
import { photosMessages } from './handlers/awaiting-photos.js';

// Optional typing-delay compressor for the interactive sim.
// 1.0 = full real delays (production-faithful); 0.05 = 5% (fast demo).
const TYPING_SCALE = Math.max(0, Number(process.env.ANA_SIM_TYPING_SCALE) || 1);

// Response types that end the conversation (used by the grace-window batch:
// these are routed immediately even if they arrive mid-batch, so a quickfire
// escalation is never dropped).
const TERMINAL_RESPONSE_TYPES = new Set(['TERMINATE', 'ESCALATE', 'CLOSE', 'CLOSED', 'NO_INTEREST']);

// STRIKE WARNING responses are ALSO routed immediately mid-batch (though
// they do NOT end the conversation and the batch keeps processing — see the
// WARNING branch in _processOwnerBatch). This is a DELIBERATE exception to
// the "only the LAST response is ever sent" rule: a warning must never be
// dropped by a quickfire follow-up, or an owner could be blocklisted on
// strike 3 having never seen a warning (reported). Do not remove that
// branch as "redundant" with this comment.

// ============================================================
// QUESTION-STATE SNAPSHOT/RESTORE (owner-follow-up grace batches)
// ============================================================
// _processOwnerBatch runs EVERY message in a grace window through
// generateResponse, but only the LAST response is ever sent. The data
// extracted from intermediate messages must persist (Ana read them), but
// question-state — the per-field attempt counter, pending confirmation /
// follow-up, and the max-2-attempts skip markers — only makes sense for
// questions the owner actually SAW. Without the rollback, an owner's quick
// follow-up silently consumed a question attempt on a field they never saw:
// reported "[SKIP: totalSqm — max 2 attempts reached]" with NO visible asks
// — the 2nd ask happened inside a dropped intermediate response. Snapshot
// before each intermediate message, restore when its response is dropped.
function _captureQuestionState(session) {
  return {
    questionAttempts: { ...(session.questionAttempts || {}) },
    // Shallow-clone: handlers REPLACE pendingConfirmation (set null / fresh
    // object), but a by-reference snapshot would silently restore an
    // in-place-mutated object if a handler ever mutates instead of replacing.
    pendingConfirmation: session.pendingConfirmation ? { ...session.pendingConfirmation } : session.pendingConfirmation,
    pendingFollowUp: session.pendingFollowUp,
    heatingFollowUp: session.collectedData?.heatingFollowUp,
    // The heating follow-up's re-ask counter — an unrelated message that got
    // a DROPPED response must not burn one of the max-2 re-asks on a question
    // the owner never saw (same phantom-attempt principle as GR11).
    heatingFollowUpAttempts: session.collectedData?.heatingFollowUpAttempts,
    // The still-available acknowledgment gates a PREFIX on the next field
    // question (data-collection.js). An acknowledgment attached to a question
    // the owner never SAW (intermediate message, response dropped) must not
    // be consumed — roll it back so the visible reply still registers the
    // availability message.
    availabilityAcknowledged: session.availabilityAcknowledged,
    // The photos MARKETING sub-state (MAKE_ASKED / PHOTOGRAPHY_ASKED) and its
    // reminder anchor: a dropped intermediate response must not consume the
    // make/offer answer the owner never saw, and must not start the 2-day
    // reminder clock early. Same phantom-attempt principle as the others.
    photosStatus: session.collectedData?.photosStatus,
    photosPendingSince: session.collectedData?.photosPendingSince,
    photosManagerReview: session.collectedData?.photosManagerReview,
    skippedKeys: Object.keys(session.collectedData || {}).filter(k => k.endsWith('Skipped'))
  };
}

function _restoreQuestionState(session, snap) {
  session.questionAttempts = snap.questionAttempts;
  session.pendingConfirmation = snap.pendingConfirmation;
  session.pendingFollowUp = snap.pendingFollowUp;
  session.availabilityAcknowledged = snap.availabilityAcknowledged;
  if (session.collectedData) {
    // The heating handler's "Какво парно?" marker — a follow-up question the
    // owner never saw must not keep the next message in a phantom heating
    // context. (Extractions / phase transitions are NOT rolled back — Ana
    // genuinely read those messages.) KNOWN LIMITATION: the photos recovery
    // path also calls transition(session, 'photos_send_later') inside a
    // dropped response, parking the session in AWAITING_PHOTOS for a question
    // the owner never saw. Pre-existing (intermediate messages always mutated
    // phase); rolling phase back here could desync detectPhase, so it stays.
    if (snap.heatingFollowUp !== undefined) {
      session.collectedData.heatingFollowUp = snap.heatingFollowUp;
    }
    if (snap.heatingFollowUpAttempts !== undefined) {
      session.collectedData.heatingFollowUpAttempts = snap.heatingFollowUpAttempts;
    }
    // Photos marketing sub-state (reported requirement): a make/offer question
    // the owner never SAW (intermediate message, response dropped) must not
    // keep the session in a sub-state that would consume the next message as
    // the make/offer answer, and the reminder anchor must not start early.
    // The AWAITING_PHOTOS phase transition is deliberately NOT rolled back
    // (same known limitation as the photos recovery path above).
    if (snap.photosStatus !== undefined) {
      session.collectedData.photosStatus = snap.photosStatus;
    }
    if (snap.photosPendingSince !== undefined) {
      session.collectedData.photosPendingSince = snap.photosPendingSince;
    }
    if (snap.photosManagerReview !== undefined) {
      session.collectedData.photosManagerReview = snap.photosManagerReview;
    }
    // STRANDED-SUB-STATE UNWIND: if a dropped response entered a photos
    // sub-state (MAKE_ASKED / PHOTOGRAPHY_ASKED) that the snapshot had NOT
    // (the photos question was unanswered before the batch), the field must
    // go back to ASKABLE — otherwise photos=false+MAKE_ASKED would silently
    // strand the flow (nextField skips photos, the make question is never
    // re-asked). Delete the whole photos field so the visible reply gets the
    // photos question again.
    const droppedIntoSubState = (session.collectedData.photosStatus === 'MAKE_ASKED' ||
                                  session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED') &&
                                  snap.photosStatus !== 'MAKE_ASKED' &&
                                  snap.photosStatus !== 'PHOTOGRAPHY_ASKED';
    if (droppedIntoSubState) {
      for (const k of ['photos', 'photosPermission', 'photosSource', 'photosStatus',
                       'photosPending', 'photosPendingSince', 'photosManagerReview']) {
        delete session.collectedData[k];
      }
      console.log('[PHOTOS: dropped make/offer question — photos field rolled back to ASKABLE]');
    }
    // Remove ANY new max-2-attempts skip marker a dropped response added —
    // a field skipped by an unseen question must stay askable.
    for (const k of Object.keys(session.collectedData)) {
      if (k.endsWith('Skipped') && !snap.skippedKeys.includes(k)) {
        delete session.collectedData[k];
      }
    }
  }
}

export class MultiLeadEngine {
  /**
   * @param {Object} opts
   * @param {Function} [opts.now]              — clock, default Date.now
   * @param {Function} [opts.sleep]            — sleep fn, default setTimeout
   * @param {number}   [opts.tickMs]           — scheduler cadence, default 2000
   * @param {Object}   [opts.sessionStore]
   * @param {Function} [opts.canSendContact]   — anti-ban gate (phone)=>bool
   * @param {Function} [opts.recordSent]       — anti-ban accounting (phone)
   * @param {Function} [opts.typingDelay]      — (text)=>ms human-typing sim
   */
  constructor(opts = {}) {
    this.clock = opts.now || (() => Date.now());
    this.sleepFn = opts.sleep || ((ms) => new Promise(r => setTimeout(r, ms)));
    this.tickMs = opts.tickMs ?? 2000;
    this.sessionStore = opts.sessionStore || getSessionStore();
    this.canSendContact = opts.canSendContact || ((phone) => antiBan.canSendToContact(phone));
    this.recordSent = opts.recordSent || ((phone) => antiBan.recordSent(phone));
    this.typingDelay = opts.typingDelay || ((text) => antiBan.getTypingDelay(text));
    // OWNER FOLLOW-UP GRACE: real owners often send 1-2 more messages right
    // after the first. When ownerGraceMs > 0 (interactive TUI), Ana waits
    // that window after an owner message before replying; a follow-up
    // re-arms the timer. 0 = reply immediately (default — tests, campaign).
    this.ownerGraceMs = opts.ownerGraceMs ?? 0;

    this.sessions = new Map();        // leadId -> LeadSession
    this._pendingOwner = new Map();   // leadId -> { texts: [], timer } (grace)
    this.pendingGreetings = [];       // leadIds in file order, not yet greeted
    this.lastOwnerMessageAt = null;   // newest owner message across ALL leads
    this.lastOutboundAt = null;       // newest Ana send across ALL leads
    this._sending = false;            // one outbound at a time (anti-ban realism)
    this._started = false;
    this._tickTimer = null;
    this._abortSleep = null;          // forceNext() aborts the current sleep
    this._abortTimer = null;
    this._listeners = new Map();
    this.totalSends = 0;
    this._engineSent = new WeakSet(); // sessions the engine already sent to
  }

  // ============================================================
  // Events (TUI / Viber relay subscribe)
  // ============================================================
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return this;
  }

  emit(event, payload) {
    const fns = this._listeners.get(event);
    if (fns) for (const fn of fns) fn(payload);
  }

  // ============================================================
  // Lead loading
  // ============================================================
  /** Add one canonical lead ({id,title,phone,url}). Staged — not sent. */
  loadLead(lead) {
    const id = String(lead.id);
    if (this.sessions.has(id)) return false;
    const firstMsg = generateFirstMessage(lead);
    const session = new LeadSession(lead);
    session.adMemory = firstMsg.memory;
    session.pendingGreeting = firstMsg.text;   // staged, scheduler decides send
    this.sessions.set(id, session);
    this.pendingGreetings.push(id);
    return true;
  }

  /** Add many canonical leads. Returns count loaded. */
  loadLeads(leads) {
    let n = 0;
    for (const lead of leads) if (this.loadLead(lead)) n++;
    return n;
  }

  get leadIds() {
    return [...this.sessions.keys()];
  }

  getSession(leadId) {
    return this.sessions.get(String(leadId)) || null;
  }

  // ============================================================
  // Scheduler lifecycle
  // ============================================================
  /**
   * Begin the scheduler.
   * @param {Object} [opts]
   * @param {boolean} [opts.noInterval] — skip the real setInterval loop
   *   (tests drive tick() manually with a fake clock).
   */
  start(opts = {}) {
    if (this._started) return;
    this._started = true;
    this.sessionStore.save([...this.sessions.values()]);
    if (!opts.noInterval) {
      this._tickTimer = setInterval(() => { this.tick().catch(err => this._onError(err)); }, this.tickMs);
    }
    this.emit('started', { leadCount: this.sessions.size });
    // First tick immediately: greet the first lead at once.
    this.tick().catch(err => this._onError(err));
  }

  stop() {
    this._started = false;
    if (this._tickTimer) clearInterval(this._tickTimer);
    this._tickTimer = null;
    // Clear any armed owner-follow-up grace timers.
    for (const p of this._pendingOwner.values()) if (p.timer) clearTimeout(p.timer);
    this._pendingOwner.clear();
    this._abortSleepNow();
    this.emit('stopped', {});
  }

  _onError(err) {
    console.error(`[ENGINE ERROR] ${err.message}`);
    if (logger && typeof logger.error === 'function') logger.error('engine_error', err.message, { stack: err.stack });
    this.emit('error', { message: err.message });
  }

  // ============================================================
  // SCHEDULER TICK — decide who may be contacted right now
  // ============================================================
  async tick() {
    if (!this._started) return;

    // 1. Greet the next pending lead if eligible (10-min idle + anti-ban).
    await this._tryGreetNextLead();

    // 2. Per-session timers: follow-up → timeout → close. Each session is
    // isolated — one session's timer failure (e.g. a CSV write error) must
    // never starve the rest of the queue for this tick.
    for (const session of this.sessions.values()) {
      if (!session.isActive()) continue;
      try {
        if (isNumberBlocked(session.phone)) {
          session.markBlocklisted();
          appendToCSV(session);
          this.emit('closed', { leadId: session.leadId, outcome: 'blocklisted' });
          continue;
        }
        await this._checkSessionTimers(session);
      } catch (err) {
        this._onError(err);
      }
    }

    this.emit('status', this.getSnapshot());
  }

  /**
   * Greet the next pending lead when eligible (or a specific target lead
   * when `targetId` is given — the operator's chosen-lead override).
   * Returns leadId or null.
   */
  async _tryGreetNextLead(force = false, targetId = null) {
    if (this._sending) return null;
    const nextId = targetId || this.pendingGreetings[0];
    if (!nextId) return null;
    const session = this.sessions.get(nextId);
    if (!session || !session.pendingGreeting) {
      // Chosen lead isn't pending anymore (already greeted/closed) → done.
      if (targetId) return null;
      this.pendingGreetings.shift();
      return this._tryGreetNextLead(force);
    }

    // Anti-ban gates (skipped when force — the ENTER override).
    if (!force) {
      if (!this.canSendContact(session.phone)) return null; // hours/quota
      // GLOBAL INTER-CONTACT GAP: at least GAP_BETWEEN_LEADS between ANY two
      // outbounds, so we never burst 3 greetings in 60 seconds. NOTE: check
      // `!== null` — lastOutboundAt may legitimately be 0 (fake-clock tests
      // start at t=0) and 0 is falsy, which would skip the gate entirely.
      if (this.lastOutboundAt !== null && this.clock() - this.lastOutboundAt < config.GAP_BETWEEN_LEADS) return null;
      // 10-MIN IDLE RULE: no owner message anywhere for 10 min → slot free.
      // First lead of a campaign (lastOwnerMessageAt null) greets immediately.
      if (this.lastOwnerMessageAt !== null && this.clock() - this.lastOwnerMessageAt < config.GAP_BETWEEN_LEADS) return null;
    }

    if (targetId) {
      this.pendingGreetings = this.pendingGreetings.filter(x => x !== targetId);
    } else {
      this.pendingGreetings.shift();
    }
    await this._sendGreeting(session);
    return nextId;
  }

  async _sendGreeting(session) {
    session.markGreetingSent();
    await this._send(session, session.pendingGreeting, { typed: true });
    session.pendingGreeting = null;
    this.emit('greeting', { leadId: session.leadId });
  }

  /** Send a text as Ana with typing delay + anti-ban accounting. */
  async _send(session, text, { typed = true } = {}) {
    this._sending = true;
    try {
      const delay = typed ? this.typingDelay(text) * TYPING_SCALE : 0;
      if (delay > 0) {
        // TYPING COUNTDOWN: announce the delay BEFORE sleeping so the TUI can
        // render a live "ANA types in Ns — ENTER to skip" timer and offer
        // skipTyping() to abort it (the old campaign sim printed the same
        // delay as "💬 Thinking delay: Ns").
        this.emit('typing-start', { leadId: session.leadId, delayMs: delay });
        await this._abortableSleep(delay);
        this.emit('typing-end', { leadId: session.leadId });
      }
      session.addSentMessage(text);
      // Re-stamp with the ENGINE clock: LeadSession.addSentMessage uses real
      // Date.now(), which would break fake-clock tests and any injected clock.
      // firstMessageSentAt must keep the FIRST send's engine time, so track
      // engine-sent sessions explicitly instead of trusting the real stamp.
      session.lastMessageSentAt = this.clock();
      if (!this._engineSent.has(session)) {
        this._engineSent.add(session);
        session.firstMessageSentAt = this.clock();
      }
      this.recordSent(session.phone);
      this.lastOutboundAt = this.clock();
      this.totalSends++;
      this.emit('ana-message', { leadId: session.leadId, text });
    } finally {
      this._sending = false;
    }
  }

  /** Per-session follow-up / timeout / photos-timeout logic. */
  async _checkSessionTimers(session) {
    const now = this.clock();

    // AWAITING_PHOTOS: two modes.
    //   1. REMINDER LADDER (reported requirement) — when the owner COMMITTED to
    //      sending photos (photosPendingSince anchored by the photos handler):
    //      remind at PHOTOS_REMINDER_1_MS (2 days), follow up again at
    //      PHOTOS_REMINDER_2_MS (5 days), close after PHOTOS_TIMEOUT_MS
    //      (7 days). Each rung fires ONCE (photosReminder1Sent / 2Sent flags),
    //      and sending a reminder re-stamps lastMessageSentAt so the close
    //      rung is measured from the LAST send, not the commitment.
    //   2. LEGACY — sessions parked in AWAITING_PHOTOS without an anchor keep
    //      the old close-after-REPLY_TIMEOUT behavior.
    if (session.phase === PHASES.AWAITING_PHOTOS) {
      let since = session.collectedData?.photosPendingSince;
      if (typeof since === 'number') {
        // CLOCK-MISMATCH RE-ANCHOR: the photos handler anchors with real
        // Date.now(), but the engine may run on an injected clock (tests) or a
        // restarted process where real time moved on. A future-stamped anchor
        // (since > now) would compute a negative elapsed and silently never
        // fire the ladder. Re-anchor to the engine clock so the ladder is
        // measured from the engine's present — production (both Date.now())
        // is unaffected since since is never in the future there.
        if (since > now) {
          session.collectedData.photosPendingSince = now;
          since = now;
        }
        const elapsed = now - since;
        if (!session.collectedData.photosReminder1Sent && elapsed >= config.PHOTOS_REMINDER_1_MS) {
          session.collectedData.photosReminder1Sent = true;
          await this._send(session, photosMessages.reminder(1), { typed: true });
          this.emit('followup', { leadId: session.leadId });
          return;
        }
        if (!session.collectedData.photosReminder2Sent && elapsed >= config.PHOTOS_REMINDER_2_MS) {
          session.collectedData.photosReminder2Sent = true;
          await this._send(session, photosMessages.reminder(2), { typed: true });
          this.emit('followup', { leadId: session.leadId });
          return;
        }
        if (elapsed >= config.PHOTOS_TIMEOUT_MS) {
          transition(session, 'timeout'); // AWAITING_PHOTOS → CLOSED
          session.markTimedOut();
          appendToCSV(session);
          this.emit('closed', { leadId: session.leadId, outcome: 'timeout' });
        }
        return;
      }
      const lastSent = session.lastMessageSentAt !== null && session.lastMessageSentAt !== undefined
        ? session.lastMessageSentAt
        : session.firstMessageSentAt;
      if (lastSent !== null && lastSent !== undefined && now - lastSent >= config.REPLY_TIMEOUT) {
        transition(session, 'timeout'); // AWAITING_PHOTOS → CLOSED
        session.markTimedOut();
        appendToCSV(session);
        this.emit('closed', { leadId: session.leadId, outcome: 'timeout' });
      }
      return;
    }

    // Last activity = owner reply, or the greeting if never replied.
    // NOTE: strict null checks — firstMessageSentAt may legitimately be 0
    // (fake-clock tests start at t=0) and 0 is falsy.
    const lastActivity = session.lastReplyAt !== null && session.lastReplyAt !== undefined
      ? session.lastReplyAt
      : session.firstMessageSentAt;
    if (lastActivity === null || lastActivity === undefined) return;
    const elapsed = now - lastActivity;

    // Follow-up: silent for REPLY_TIMEOUT → one follow-up (not yet sent).
    if (!session.followUpSent && elapsed >= config.REPLY_TIMEOUT) {
      session.followUpSent = true;
      // Same transaction fallback as campaign.js: adMemory is set from the ad
      // title at greeting, but collectedData carries the confirmed type.
      const followUp = getFollowUpMessage(session.adMemory?.transactionType || session.collectedData?.transactionType);
      await this._send(session, followUp, { typed: true });
      this.emit('followup', { leadId: session.leadId });
    }

    // Hard timeout: silent for FOLLOWUP_TIMEOUT → close no-response. NOTE:
    // measured from lastActivity (the greeting/reply), NOT from the follow-up
    // — campaign.js waits REPLY_TIMEOUT then FOLLOWUP_TIMEOUT - REPLY_TIMEOUT,
    // i.e. a total of FOLLOWUP_TIMEOUT from the start (30 min + 90 min = 2h
    // with defaults). Keeping the same total keeps the engine's lifecycle
    // identical to the sequential campaign.
    if (elapsed >= config.FOLLOWUP_TIMEOUT) {
      session.addSentMessage(getNoResponseClose());
      session.markTimedOut();
      appendToCSV(session);
      this.emit('closed', { leadId: session.leadId, outcome: 'timeout' });
    }
  }

  // ============================================================
  // INBOUND — event-driven owner message (Viber webhook later)
  // ============================================================
  /**
   * Handle one owner message for a lead. Non-blocking: returns the
   * response type; the scheduler owns all waiting/timeouts.
   * @returns {Promise<{type:string, action:string, text?:string}>}
   */
  async onOwnerMessage(leadId, text) {
    const session = this.sessions.get(String(leadId));
    if (!session) return { type: 'IGNORED', action: 'ignored' };
    if (!session.isActive()) return { type: 'IGNORED', action: 'ignored' };
    if (!isValidMessage(text, 10000)) {
      return { type: 'ERROR', action: 'error', text: 'Ве молам, испратете валидна порака.' };
    }

    this.lastOwnerMessageAt = this.clock();
    session.addReply(text);
    // Re-stamp with the ENGINE clock (see _send note — addReply uses Date.now).
    session.lastReplyAt = this.clock();
    this.emit('owner-message', { leadId: session.leadId, text });

    // OWNER FOLLOW-UP GRACE: with ownerGraceMs > 0 (interactive TUI), don't
    // reply instantly — wait the grace window so a quick follow-up message
    // (or two) can arrive first, exactly like real owners do. A new message
    // re-arms the window. When 0 (default: tests / campaign), the reply is
    // generated and sent immediately, exactly as before.
    if (this.ownerGraceMs <= 0) {
      return this._processOwnerMessage(session, text);
    }
    return this._armOwnerGrace(session, text);
  }

  /** Immediate reply path (ownerGraceMs === 0) — the original behavior. */
  async _processOwnerMessage(session, text) {
    // PROCESSING TAG: the pipeline (service.js → handlers → extractor) writes
    // its [PHASE]/[MEMORY]/[EXTRACTION] diagnostics via console.log, which the
    // TUI captures and shows INSIDE the right lead's chat. It needs to know
    // WHICH lead is being processed — and with the grace window the reply is
    // generated asynchronously (up to 15s later), so the TUI can't rely on
    // the calling frame. These events carry the leadId for the whole call.
    this.emit('processing-start', { leadId: session.leadId });
    let response;
    try {
      response = await generateResponse(session, text);
    } catch (err) {
      this._onError(err);
      this.emit('processing-end', { leadId: session.leadId });
      return { type: 'ERROR', action: 'error', text: 'Техничка грешка.' };
    }
    this.emit('processing-end', { leadId: session.leadId });

    const outcome = await this._routeResponse(session, response);

    // LeadState ↔ Phase sync (mirrors campaign.js guarantee 3).
    if (session.phase === PHASES.AWAITING_PHOTOS && session.state === LeadState.COLLECTING_DATA) {
      session.markWaitingPhotos();
    } else if (session.phase !== PHASES.AWAITING_PHOTOS && session.state === LeadState.WAITING_PHOTOS) {
      session.markCollectingData();
    }

    this.sessionStore.save([...this.sessions.values()]);
    return outcome;
  }

  /**
   * Arm (or re-arm) the owner follow-up window for a lead. The text is queued
   * and, when the window elapses with no new owner message, the whole batch is
   * processed — but only the LAST response is sent (intermediate messages
   * still mutate session state like a real quickfire conversation would).
   */
  _armOwnerGrace(session, text) {
    const leadId = session.leadId;
    const pending = this._pendingOwner.get(leadId) || { texts: [], timer: null };
    pending.texts.push(text);
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      this._pendingOwner.delete(leadId);
      this.emit('owner-grace-end', { leadId });
      // Pass the texts explicitly: the map entry is already deleted here, so
      // _processOwnerBatch must NOT re-read it (it would see undefined and
      // drop the queued messages).
      this._processOwnerBatch(leadId, pending.texts).catch(err => this._onError(err));
    }, this.ownerGraceMs);
    this._pendingOwner.set(leadId, pending);
    this.emit('owner-grace-start', { leadId, graceMs: this.ownerGraceMs });
    return { type: 'OWNER_RECEIVED', action: 'debouncing' };
  }

  /**
   * Operator override (TUI ENTER during the grace window): end the follow-up
   * window NOW and process whatever the owner has sent so far.
   */
  flushOwnerReply(leadId) {
    const id = String(leadId);
    const pending = this._pendingOwner.get(id);
    if (!pending) return { type: 'IGNORED', action: 'ignored' };
    if (pending.timer) clearTimeout(pending.timer);
    this._pendingOwner.delete(id);
    this.emit('owner-grace-end', { leadId: id });
    // Texts passed explicitly (see the timer path above — the map entry is
    // already gone, so the batch must not re-read it).
    this._processOwnerBatch(id, pending.texts).catch(err => this._onError(err));
    return { type: 'OWNER_RECEIVED', action: 'flushed' };
  }

  /**
   * Process ALL owner messages queued in the grace window. Each text runs
   * through generateResponse (state mutates naturally), but only the LAST
   * response is routed/sent — Ana answers once the owner stops typing.
   * Terminal responses (ESCALATE/TERMINATE/CLOSE/NO_INTEREST) end the
   * conversation and are routed immediately even mid-batch (see loop).
   */
  async _processOwnerBatch(leadId, texts) {
    const session = this.sessions.get(String(leadId));
    if (!session || !session.isActive()) return { type: 'IGNORED', action: 'ignored' };
    texts = texts || [];
    if (texts.length === 0) return { type: 'IGNORED', action: 'ignored' };

    let outcome = { type: 'NORMAL', action: 'wait' };
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const isLast = i === texts.length - 1;
      // PROCESSING TAG — see _processOwnerMessage: the grace window delays
      // this loop by up to ownerGraceMs, so the TUI needs the explicit
      // leadId to route the pipeline's console.log diagnostics correctly.
      this.emit('processing-start', { leadId: session.leadId });
      // QUESTION-STATE SNAPSHOT: intermediate messages in a grace batch are
      // READ by Ana (volunteered data is extracted) but their RESPONSE is
      // never sent. Attempt counters / pending confirmations / skip markers
      // only make sense for questions the owner actually SEES — an unseen
      // "Колкава е квадратурата?" must not consume an attempt or permanently
      // skip the field (reported phantom "[SKIP: totalSqm — max 2 attempts
      // reached]" with NO visible asks). Roll back after a dropped response.
      const questionState = isLast ? null : _captureQuestionState(session);
      let response;
      try {
        response = await generateResponse(session, text);
      } catch (err) {
        this._onError(err);
        response = { type: 'ERROR', action: 'error', text: 'Техничка грешка.' };
      } finally {
        this.emit('processing-end', { leadId: session.leadId });
      }
      if (questionState && !TERMINAL_RESPONSE_TYPES.has(response.type)) {
        _restoreQuestionState(session, questionState);
      }
      // STRIKE WARNING ROUTING (reported): the only-last-response rule used
      // to DROP a mid-batch strike warning — the follow-up sentence's reply
      // replaced it, so the owner never saw the strike-2 final warning (and
      // could be blocklisted on strike 3 having never been warned). Route
      // WARNING responses IMMEDIATELY like terminal responses, but KEEP
      // processing the rest of the batch: a later offense still escalates to
      // TERMINATE (routed + break below), and a normal follow-up still gets
      // its answer (the isLast branch below).
      if (response.type === 'WARNING' && !isLast) {
        await this._routeResponse(session, response);
      }
      // Terminal responses end the conversation — route them IMMEDIATELY
      // even if they're intermediate in the batch, so a quickfire escalation
      // ("sakam da zboram so covek" then "250 evra") is never silently
      // dropped. The remaining queued texts are moot once the session is
      // closed/parked. (Array is a module-level const — see top of file.)
      if (TERMINAL_RESPONSE_TYPES.has(response.type)) {
        outcome = await this._routeResponse(session, response);
        break;
      }
      if (isLast) {
        outcome = await this._routeResponse(session, response);
      }
      // Other non-last responses are NOT sent — only the final answer goes
      // out, but their generateResponse still mutated session state.
    }

    // LeadState ↔ Phase sync (mirrors campaign.js guarantee 3).
    if (session.phase === PHASES.AWAITING_PHOTOS && session.state === LeadState.COLLECTING_DATA) {
      session.markWaitingPhotos();
    } else if (session.phase !== PHASES.AWAITING_PHOTOS && session.state === LeadState.WAITING_PHOTOS) {
      session.markCollectingData();
    }

    this.sessionStore.save([...this.sessions.values()]);
    return outcome;
  }

  /** Route a generateResponse result → send text + decide next action. */
  async _routeResponse(session, response) {
    const { text, type } = response || {};

    // TERMINATE: never sent to the owner (strike-3 protocol).
    if (type === 'TERMINATE') {
      addToBlocklist(session.phone, 'offensive_behavior_strike3');
      session.markBlocklisted();
      appendToCSV(session);
      this.emit('closed', { leadId: session.leadId, outcome: 'terminated' });
      return { type, action: 'terminated' };
    }

    if (text) {
      await this._send(session, text, { typed: true });
    }

    switch (type) {
      case 'QUESTION':
        session.markOwnerInterested();
        return { type, action: 'wait' };
      case 'CLOSE':
        session.markClosed(true);
        appendToCSV(session);
        this.emit('closed', { leadId: session.leadId, outcome: 'success' });
        return { type, action: 'closed' };
      case 'CLOSED':
      case 'NO_INTEREST':
        session.markClosed(false);
        appendToCSV(session);
        this.emit('closed', { leadId: session.leadId, outcome: 'not_interested' });
        return { type, action: 'closed' };
      case 'ESCALATE': {
        if (session.state === LeadState.NEEDS_HUMAN) {
          return { type, action: 'already_escalated' };
        }
        session.markNeedsHuman();
        appendToCSV(session);
        this.emit('escalated', { leadId: session.leadId, reason: session.escalationReason });
        return { type, action: 'escalated' };
      }
      case 'ERROR': {
        if (metrics && typeof metrics.inc === 'function') metrics.inc('serviceErrors');
        session.serviceErrorCount = (session.serviceErrorCount || 0) + 1;
        if (session.serviceErrorCount >= 2) {
          session.markNeedsHuman();
          session.escalationReason = session.escalationReason || 'repeated_service_errors';
          appendToCSV(session);
          this.emit('escalated', { leadId: session.leadId, reason: 'repeated_service_errors' });
          return { type, action: 'escalated' };
        }
        return { type, action: 'wait' };
      }
      case 'WARNING':
      case 'PITCH':
      case 'NORMAL':
      case 'TERMS_EXPLANATION':
      default:
        return { type, action: 'wait' };
    }
  }

  // ============================================================
  // ENTER OVERRIDE — instant bypass of every delay + anti-ban gate
  // ============================================================
  /**
   * forceNext(): abort any pending typing delay and start the next
   * pending lead's greeting NOW, bypassing the 10-min idle rule, the
   * inter-contact gap, AND the active-hours window (but still records
   * the send against the daily/hourly quotas). Returns the leadId
   * greeted, or null if nothing is pending.
   */
  async forceNext() {
    this._abortSleepNow();
    // Wait for any in-flight send to finish so we don't interleave.
    while (this._sending) await this.sleepFn(50);
    if (this.pendingGreetings.length === 0) return null;
    const id = await this._tryGreetNextLead(true);
    this.emit('force', { leadId: id });
    return id;
  }

  /**
   * skipTyping(): abort the CURRENT in-flight typing delay so Ana's message
   * lands immediately — the ENTER-to-skip during the TUI countdown. Unlike
   * forceNext() it does NOT advance to the next lead: the in-flight send
   * completes instantly (still recorded against the anti-ban quota), and
   * nothing else happens. No-op when no typing delay is in flight.
   */
  skipTyping() {
    this._abortSleepNow();
  }

  /**
   * greetLead(id): start the greeting for a SPECIFIC pending lead NOW —
   * the operator picked it by number from the TUI. Same instant override
   * as forceNext() (bypasses the idle rule, inter-contact gap, and active
   * hours) but greets the CHOSEN lead, not the queue head. This lets the
   * operator play ANY lead out of order: picking an inactive lead starts
   * its greeting, picking an active one just resumes the existing chat
   * (greetLead returns null for an already-greeted lead). Returns the
   * greeted leadId or null.
   */
  async greetLead(leadId) {
    const id = String(leadId);
    const session = this.sessions.get(id);
    if (!session) return null;
    if (!session.pendingGreeting) return null;   // already greeted/closed
    this._abortSleepNow();
    // Wait for any in-flight send to finish so we don't interleave.
    while (this._sending) await this.sleepFn(50);
    const greeted = await this._tryGreetNextLead(true, id);
    this.emit('force', { leadId: greeted });
    return greeted;
  }

  // ============================================================
  // Abortable sleep (ENTER cancels the current typing delay)
  // ============================================================
  _abortableSleep(ms) {
    // Race the injected sleep (instant in tests, real timer in TUI) against
    // an abort signal so forceNext() cancels the current typing delay. The
    // race is cleaned up in .finally: the safety timer is cleared and the
    // abort signal is IDENTITY-GUARDED so nothing can clobber a NEWER
    // in-flight send's signal — a stale safety timer from a COMPLETED send
    // must never orphan the next send's ENTER-to-skip (pre-fix, a second
    // send starting within 100ms of the first one's completion lost its
    // skip signal).
    let myTimer = null;
    let myResolve = null;
    const abortSignal = new Promise((resolve) => {
      myResolve = resolve;
      // Safety net: never leak a pending abort signal. Identity-guarded so
      // a stale timer from a completed send can't touch newer bookkeeping.
      myTimer = setTimeout(() => {
        if (this._abortSleep === resolve) this._abortSleep = null;
        if (this._abortTimer === myTimer) this._abortTimer = null;
        resolve();
      }, ms + 100);
      this._abortTimer = myTimer;
      this._abortSleep = resolve;
    });
    return Promise.race([this.sleepFn(ms), abortSignal]).finally(() => {
      if (myTimer !== null) {
        clearTimeout(myTimer);
        if (this._abortTimer === myTimer) this._abortTimer = null;
        myTimer = null;
      }
      if (this._abortSleep === myResolve) this._abortSleep = null;
    });
  }

  _abortSleepNow() {
    if (this._abortSleep) {
      const r = this._abortSleep;
      this._abortSleep = null;
      if (this._abortTimer) { clearTimeout(this._abortTimer); this._abortTimer = null; }
      r(); // resolve early → send completes instantly
    }
  }

  // ============================================================
  // Snapshot for the TUI / tests
  // ============================================================
  getSnapshot() {
    const now = this.clock();
    const rows = [];
    for (const id of this.sessions.keys()) {
      const s = this.sessions.get(id);
      const lastActivity = s.lastReplyAt !== null && s.lastReplyAt !== undefined
        ? s.lastReplyAt
        : s.firstMessageSentAt;
      const idleMin = lastActivity !== null && lastActivity !== undefined
        ? Math.max(0, Math.floor((now - lastActivity) / 60000))
        : null;
      rows.push({
        leadId: s.leadId,
        phone: s.phone,
        title: s.adTitle,
        state: s.state,
        phase: s.phase,
        greeted: s.firstMessageSentAt !== null && s.firstMessageSentAt !== undefined,
        pendingGreeting: !!s.pendingGreeting,
        idleMin,
        lastReplyAt: s.lastReplyAt,
        lastOutboundAt: s.lastMessageSentAt,
        messages: s.messages.length,
        followedUp: s.followUpSent
      });
    }
    return {
      now,
      totalSends: this.totalSends,
      active: rows.filter(r => ['new_lead', 'contacting', 'collecting_data', 'waiting_photos'].includes(r.state)).length,
      rows
    };
  }
}
