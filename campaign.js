import { config } from './config.js';
import { loadLeadsFromFile, createSessionFromLead, appendToCSV } from './lead-processor.js';
import { generateResponse } from './service.js';
import { LeadSession, LeadState } from './scheduler.js';
import { antiBan } from './anti-ban.js';
import { getFollowUpMessage, getNoResponseClose } from './deal-terms.js';
import { isNumberBlocked, addToBlocklist } from './offensive-filter.js';
import { isValidPhone, isValidMessage } from './retry-utils.js';
import { SessionStore, getSessionStore } from './session-store.js';
import { metrics } from './metrics.js';
import { logger } from './logger.js';
import { setHealthState } from './health.js';
import { PHASES, transition } from './handlers/state-machine.js';

export class Campaign {
  constructor() {
    this.sessions = [];
    this.currentIndex = 0;
    this.running = false;
    this.paused = false;
    this.sessionStore = getSessionStore();
  }

  /**
   * Load leads from file
   */
  loadLeads(filePath) {
    const leads = loadLeadsFromFile(filePath);
    console.log(`\n📋 Loaded ${leads.length} leads from ${filePath}\n`);
    metrics.set('leadsLoaded', leads.length);

    for (const lead of leads) {
      console.log(`   ${lead.phone} — ${lead.title.substring(0, 50)}...`);
    }

    // Create sessions for all leads
    for (const lead of leads) {
      try {
        const { session, firstMessage } = createSessionFromLead(lead);
        this.sessions.push(session);
        console.log(`\n📝 Session created for ${lead.phone}`);
        console.log(`   First message: "${firstMessage.substring(0, 80)}..."`);
      } catch (err) {
        console.error(`   ❌ Failed to create session for ${lead.phone}: ${err.message}`);
      }
    }

    // Save newly loaded sessions to disk (first snapshot)
    this.sessionStore.save(this.sessions);

    logger.info('leads_loaded', `Loaded ${this.sessions.length} leads from ${filePath}`, { count: this.sessions.length, file: filePath });
    setHealthState({ loaded: this.sessions.length });

    return this.sessions.length;
  }

  /**
   * Try to recover sessions from disk. Returns true if sessions were recovered.
   */
  async recoverSessions() {
    try {
      const savedSessions = await this.sessionStore.load();
      if (savedSessions.length > 0) {
        // Filter to only active (in-progress) sessions
        const activeSessions = savedSessions.filter(s => s.isActive());
        console.log(`\n🔄 RECOVERY: Found ${savedSessions.length} saved sessions (${activeSessions.length} active)`);

        if (activeSessions.length > 0) {
          this.sessions = activeSessions;
          metrics.set('sessionsRecovered', activeSessions.length);
          for (const s of activeSessions) {
            const msgCount = s.messages.length;
            const lastMsg = msgCount > 0 ? s.messages[msgCount - 1].text.substring(0, 60) : '(none)';
            console.log(`   ↪ ${s.phone}: ${s.state} [phase: ${s.phase || '?'}] (${msgCount} msgs, last: "${lastMsg}...")`);
          }
          return true;
        }
      }
    } catch (err) {
      console.warn(`[RECOVERY] Could not recover sessions: ${err.message}`);
    }
    return false;
  }

  /**
   * Start the campaign
   */
  async start() {
    if (this.sessions.length === 0) {
      console.log('❌ No sessions to run. Load leads first.');
      return;
    }

    // Save sessions at start (establishes recovery point)
    await this.sessionStore.save(this.sessions);

    this.running = true;
    this.currentIndex = 0;

    console.log(`\n========================================`);
    console.log(`🚀 CAMPAIGN STARTED — ${this.sessions.length} leads`);
    console.log(`========================================\n`);

    logger.info('campaign_start', `Campaign started with ${this.sessions.length} leads`, { count: this.sessions.length });
    setHealthState({ running: true, loaded: this.sessions.length, currentIndex: 0, startedAt: new Date().toISOString(), lastError: null });

    for (let i = 0; i < this.sessions.length; i++) {
      if (!this.running) {
        console.log('⏹️ Campaign stopped.');
        break;
      }

      const session = this.sessions[i];
      this.currentIndex = i;

      await this.processLead(session, i);

      // Gap before next lead (except for last one). INTERACTIVE SKIP: the
      // operator runs this campaign interactively (ana-cli TTY); a bare ENTER
      // during the gap starts the next lead NOW (sleepWithEnterSkip — same
      // mechanism as the typing-delay skip). Reported: "after the first lead
      // finished, the others won't start... not manually" — the old plain
      // sleep ignored ENTER entirely, so the only way forward was waiting out
      // the full 10-min gap. Non-TTY runs (production daemon, tests) just do
      // the plain sleep — zero behavior change there.
      if (i < this.sessions.length - 1 && this.running) {
        const gap = antiBan.getLeadGap();
        console.log(`\n⏳ Waiting ${Math.round(gap / 1000 / 60)} min before next lead... (ENTER = start now)\n`);
        if (await this.sleepWithEnterSkip(gap)) {
          console.log(`   ⏩ gap skipped — starting next lead now`);
        }
      }
    }

    this.running = false;

    // Final save before finishing
    await this.sessionStore.save(this.sessions);

    console.log(`\n========================================`);
    console.log(`🏁 CAMPAIGN FINISHED`);
    console.log(`========================================\n`);
    logger.info('campaign_end', 'Campaign finished', { total: this.sessions.length });
    setHealthState({ running: false });
    this.printSummary();
  }

  /**
   * Validate a session before processing. Returns error message or null.
   */
  validateSession(session, index) {
    if (!session) {
      return `Session ${index + 1} is null/undefined`;
    }
    if (!session.phone) {
      return `Session ${index + 1} has no phone number`;
    }
    if (!isValidPhone(session.phone)) {
      return `Session ${index + 1} has invalid phone: ${session.phone}`;
    }
    if (!session.messages || session.messages.length === 0) {
      return `Session ${index + 1} (${session.phone}) has no messages`;
    }
    if (!session.messages[0] || !session.messages[0].text) {
      return `Session ${index + 1} (${session.phone}) has empty first message`;
    }
    return null; // Valid
  }

  /**
   * Process a single lead through its lifecycle
   */
  async processLead(session, index) {
    // Never leak an early-typed reply (ENTER-skip stash) across leads.
    this._earlyReply = null;
    console.log(`\n--- Lead ${index + 1}: ${session.phone || 'unknown'} ---`);
    logger.info('lead_started', `Processing lead ${index + 1}`, { phone: session.phone, index });
    setHealthState({ currentIndex: index });

    // === INPUT VALIDATION ===
    const validationError = this.validateSession(session, index);
    if (validationError) {
      console.error(`   ❌ ${validationError}`);
      logger.error('lead_invalid', validationError, { phone: session.phone });
      return;
    }

    // === BLOCKLIST CHECK ===
    if (isNumberBlocked(session.phone)) {
      console.log(`   ⏭️ Skipping ${session.phone} — number is blocked`);
      logger.warn('lead_blocked', 'Number is blocklisted', { phone: session.phone });
      return;
    }

    if (!antiBan.canSendToContact(session.phone)) {
      console.log(`   ⏭️ Skipping — anti-ban limits reached or outside active hours`);
      logger.warn('lead_skipped_antiban', 'Anti-ban limits reached or outside active hours', { phone: session.phone });
      return;
    }

    // === STEP 1: Send first message ===
    const firstMsg = session.messages[0];
    console.log(`\n   📤 [${this.getTime()}] Sending to ${session.phone}:`);
    console.log(`   "${firstMsg.text}"`);

    antiBan.recordSent(session.phone);

    // Wait for typing simulation — a bare ENTER skips it (see
    // sleepWithEnterSkip; the old sim's "Thinking delay" you had to wait out).
    const typingDelay = antiBan.getTypingDelay(firstMsg.text);
    console.log(`   💬 Typing delay: ${Math.round(typingDelay / 1000)}s (ENTER = skip)`);
    if (await this.sleepWithEnterSkip(typingDelay)) {
      console.log(`   ⏩ typing delay skipped — Ana types now`);
    }

    // === STEP 2: Wait for reply (30 min) ===
    console.log(`   ⏳ Waiting up to ${config.REPLY_TIMEOUT / 1000 / 60} min for reply...`);
    const reply1 = await this.waitForReply(session, config.REPLY_TIMEOUT);

    if (reply1) {
      console.log(`   📩 Reply received: "${reply1.substring(0, 80)}..."`);
      logger.info('reply_received', 'Reply to first message', { phone: session.phone, text: reply1.substring(0, 120) });
      await this.handleReply(session, reply1);
    } else {
      // === STEP 3: Send follow-up ===
      const followUp = getFollowUpMessage(session.adMemory?.transactionType || session.collectedData?.transactionType);
      session.addSentMessage(followUp);
      session.followUpSent = true;
      antiBan.recordSent(session.phone);

      const typingDelay2 = antiBan.getTypingDelay(followUp);
      console.log(`   📤 Follow-up: "${followUp}"`);
      await this.sleepWithEnterSkip(typingDelay2);

      // === STEP 4: Wait 2 hours ===
      console.log(`   ⏳ Waiting ${config.FOLLOWUP_TIMEOUT / 1000 / 60} min for reply after follow-up...`);
      const reply2 = await this.waitForReply(session, config.FOLLOWUP_TIMEOUT - config.REPLY_TIMEOUT);

      if (reply2) {
        console.log(`   📩 Reply received: "${reply2.substring(0, 80)}..."`);
        await this.handleReply(session, reply2);
      } else {
        // === STEP 5: Close no response ===
        const closeMsg = getNoResponseClose();
        session.addSentMessage(closeMsg);
        console.log(`   ⏰ No response. Closing: "${closeMsg}"`);
        logger.warn('lead_no_response', 'No response — closing', { phone: session.phone });
        this.closeNoResponse(session);
      }
    }
  }

  /**
   * Wait for a reply (simulated — in real mode this polls)
   * For test mode, reads from stdin with timeout
   */
  async waitForReply(session, timeoutMs) {
    // The operator may have typed their reply DURING the previous typing
    // delay (the ENTER-skip listener stashed it). Serve it immediately,
    // exactly as if it had arrived at this prompt.
    if (this._earlyReply) {
      const input = this._earlyReply;
      this._earlyReply = null;
      session.addReply(input);
      console.log(`   ⌨️  (reply typed during typing delay: "${input}")`);
      return input;
    }
    return new Promise((resolve) => {
      let resolved = false;

      // In test mode, prompt user for input
      console.log(`   ⌨️  Type owner's reply (or press Enter for no reply):`);

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, timeoutMs);

      const stdin = process.stdin;
      const onData = (data) => {
        if (!resolved) {
          resolved = true;
          const input = data.toString().trim();
          clearTimeout(timeout);
          stdin.removeListener('data', onData);
          if (input) {
            session.addReply(input);
            resolve(input);
          } else {
            resolve(null);
          }
        }
      };

      stdin.on('data', onData);
    });
  }

  /**
   * Handle a reply from the owner
   */
  async handleReply(session, replyText, invalidAttempts = 0) {
    try {
      // === INPUT VALIDATION ===
      if (!isValidMessage(replyText, 10000)) {
        console.log(`   ❌ Invalid reply text (empty or too long)`);
        // Guard against infinite loop: max 3 retry attempts for invalid input
        if (invalidAttempts >= 3) {
          console.log(`   ⛔ Max invalid reply attempts reached (${invalidAttempts}). Closing.`);
          this.closeNoResponse(session);
          return;
        }
        // Ask again with a gentle prompt
        const retryMsg = 'Ве молам, испратете валидна порака.';
        session.addSentMessage(retryMsg);
        console.log(`   📤 Ana: "${retryMsg}"`);
        // Wait for a proper reply (increment counter)
        const retryReply = await this.waitForReply(session, config.REPLY_TIMEOUT);
        if (retryReply) {
          await this.handleReply(session, retryReply, invalidAttempts + 1);
        } else {
          this.closeNoResponse(session);
        }
        return;
      }

      metrics.inc('repliesReceived');
      const response = await generateResponse(session, replyText);

      if (!response || !response.text) {
        console.log('   ❌ Empty response from service');
        metrics.inc('emptyResponses');
        logger.error('empty_response', 'Empty response from service', { phone: session.phone });
        return;
      }

      const delay = antiBan.getTypingDelay(response.text);
      console.log(`   💬 Thinking delay: ${Math.round(delay / 1000)}s (ENTER = skip)`);
      if (await this.sleepWithEnterSkip(delay)) {
        console.log(`   ⏩ thinking delay skipped — Ana types now`);
      }

      // TERMINATE responses should NOT be sent to the owner (strike 3 protocol)
      if (response.type === 'TERMINATE') {
        console.log(`   🚫 SESSION TERMINATED — offensive behavior (strike 3)`);
        metrics.inc('terminated', 1, { phone: session.phone });
        logger.warn('lead_terminated', 'Session terminated — offensive behavior (strike 3)', { phone: session.phone });
        addToBlocklist(session.phone, 'offensive_behavior_strike3');
        session.markBlocklisted(); // appliance-grade: BLOCKLISTED is its own terminal state
        appendToCSV(session);
        this.sessionStore.save(this.sessions); // persist the terminal state (crash-safe)
        console.log(`   ❌ Lead terminated due to offensive behavior.`);
        return;
      }

      console.log(`   📤 Ana: "${response.text}"`);
      session.addSentMessage(response.text);
      metrics.inc('messagesSent');

      if (response.type === 'QUESTION') {
        session.markOwnerInterested();
        // Wait for next reply
        console.log(`   ⏳ Waiting for next reply...`);
        const nextReply = await this.waitForReply(session, config.REPLY_TIMEOUT);

        if (nextReply) {
          console.log(`   📩 Reply: "${nextReply.substring(0, 80)}..."`);
          await this.handleReply(session, nextReply);
        } else {
          const followUp = getFollowUpMessage(session.adMemory?.transactionType || session.collectedData?.transactionType);
          session.addSentMessage(followUp);
          session.followUpSent = true;
          antiBan.recordSent(session.phone);
          console.log(`   📤 Follow-up: "${followUp}"`);
          logger.info('followup_sent', 'Follow-up message sent', { phone: session.phone });

          const nextReply2 = await this.waitForReply(session, config.FOLLOWUP_TIMEOUT - config.REPLY_TIMEOUT);

          if (nextReply2) {
            await this.handleReply(session, nextReply2);
          } else {
            console.log(`   ⏰ No response. Closing.`);
            this.closeNoResponse(session);
          }
        }
      } else if (response.type === 'CLOSE') {
        session.markClosed(true);
        metrics.inc('closedSuccess');
        appendToCSV(session);
        logger.info('lead_closed', 'Lead closed successfully', { phone: session.phone });
        console.log(`   ✅ Lead closed successfully.`);
      } else if (response.type === 'CLOSED') {
        // Rejection or unsuccessful close (no data collected)
        session.markClosed(false);
        metrics.inc('closedNotInterested');
        appendToCSV(session);
        logger.info('lead_closed_not_interested', 'Owner not interested', { phone: session.phone });
        console.log(`   ❌ Owner not interested.`);
      } else if (response.type === 'NO_INTEREST') {
        session.markClosed(false);
        metrics.inc('closedNotInterested');
        appendToCSV(session);
        logger.info('lead_closed_not_interested', 'Owner not interested', { phone: session.phone });
        console.log(`   ❌ Owner not interested.`);
      } else if (response.type === 'ESCALATE') {
        // HUMAN ESCALATION — the owner explicitly asked for a real person
        // (handoff text already sent above). Park the session for the
        // operator: NEEDS_HUMAN is a terminal LeadState, the CSV row's
        // status column carries 'needs_human', and isActive() = false so
        // the bot never resumes it automatically. Persist BEFORE the
        // early return so the escalation survives a crash.
        const reason = session.escalationReason || 'owner_requested_human';
        // Guard: a session that is ALREADY parked (defensive path — e.g.
        // service.js parked-session guard returned ESCALATE for a session
        // that was somehow re-processed) must not append a duplicate CSV
        // row or re-emit the escalation event. Recovery filters NEEDS_HUMAN
        // sessions out, so this is belt-and-braces only. NOTE: the generic
        // send step above has already appended this handoff text to
        // session.messages — the owner may see a second handoff, but no
        // duplicate CSV row is written. Acceptable for a defensive path.
        if (session.state === LeadState.NEEDS_HUMAN) {
          console.log(`   🤝 ${session.phone} already escalated to human — skipping duplicate`);
          return;
        }
        session.markNeedsHuman();
        metrics.inc('escalatedToHuman', 1, { phone: session.phone, reason });
        logger.warn('lead_escalated', 'Lead escalated to human operator', { phone: session.phone, reason });
        appendToCSV(session);
        this.sessionStore.save(this.sessions);
        console.log(`   🤝 ESCALATED TO HUMAN — ${session.phone}`);
        return;
      } else if (response.type === 'WARNING') {
        // Warning issued (strike 1 or 2) — continue conversation
        metrics.inc('warnings');
        logger.warn('strike_warning', `Warning issued (strike ${session.offensiveStrikes}/3)`, { phone: session.phone, strike: session.offensiveStrikes });
        console.log(`   ⚠️  WARNING issued (strike ${session.offensiveStrikes}/3)`);
        // Do NOT send the warning text? Actually we already printed it above.
        // The message is already logged as "Ana: ..." above.
        // Wait for next reply
        console.log(`   ⏳ Waiting for next reply...`);
        const nextReply = await this.waitForReply(session, config.REPLY_TIMEOUT);
        if (nextReply) {
          console.log(`   📩 Reply: "${nextReply.substring(0, 80)}..."`);
          await this.handleReply(session, nextReply);
        } else {
          console.log(`   ⏰ No response. Closing.`);
          logger.warn('lead_no_response', 'No response after warning — closing', { phone: session.phone });
          this.closeNoResponse(session);
        }
      } else if (response.type === 'TERMINATE') {
        // TERMINATE is now handled BEFORE the Ana message is printed/sent.
        // This is a safety fallback in case TERMINATE reaches the type-switch.
        // Log and close without sending any message.
        console.log(`   🚫 Lead ${session.phone} terminated.`);
      } else if (response.type === 'TERMS_EXPLANATION') {
        // Owner asked for terms, wait for their response to the terms
        console.log(`   ⏳ Waiting for owner's response to terms...`);
        const termsReply = await this.waitForReply(session, config.REPLY_TIMEOUT);

        if (termsReply) {
          console.log(`   📩 Reply: "${termsReply.substring(0, 80)}..."`);
          await this.handleReply(session, termsReply);
        } else {
          const followUp = getFollowUpMessage(session.adMemory?.transactionType || session.collectedData?.transactionType);
          session.addSentMessage(followUp);
          console.log(`   📤 Follow-up: "${followUp}"`);
          const termsReply2 = await this.waitForReply(session, 60000 * 10);
          if (termsReply2) {
            await this.handleReply(session, termsReply2);
          } else {
            this.closeNoResponse(session);
          }
        }
      } else if (response.type === 'PITCH' || response.type === 'NORMAL') {

        console.log(`   ⏳ Waiting for next reply...`);

        const nextReply = await this.waitForReply(
          session,
          config.REPLY_TIMEOUT
        );

        if (nextReply) {
          console.log(`   📩 Reply: "${nextReply.substring(0, 80)}..."`);
          await this.handleReply(session, nextReply);
        } else {
          console.log(`   ⏰ No response. Closing.`);
          this.closeNoResponse(session);
        }

      } else if (response.type === 'ERROR') {
        // SERVICE-ERROR ESCALATION: an ERROR response means the bot could
        // not serve this owner (LLM/network failure — generateResponse's
        // safe fallback already sent the owner a technical-error text).
        // The FIRST error keeps the conversation open so it can recover;
        // a SECOND consecutive error hands the lead to a human instead of
        // silently dropping it.
        metrics.inc('serviceErrors');
        if (this.shouldEscalateServiceError(session)) {
          session.escalationReason = 'repeated_service_errors';
          session.markNeedsHuman();
          metrics.inc('escalatedToHuman', 1, { phone: session.phone, reason: 'repeated_service_errors' });
          logger.error('service_error', 'Repeated service errors — escalated to human', { phone: session.phone, errors: session.serviceErrorCount });
          appendToCSV(session);
          this.sessionStore.save(this.sessions);
          console.log(`   ❌ Service error (x${session.serviceErrorCount}) — ESCALATED TO HUMAN ${session.phone}`);
          return;
        }
        // First error: fallback text already sent — wait briefly for the
        // owner's next reply so the conversation can recover. Uses the
        // dedicated short SERVICE_ERROR_WAIT_MS (NOT the 30-min
        // REPLY_TIMEOUT) so a transient failure doesn't stall the whole
        // campaign waiting on a likely-non-responsive owner.
        console.log(`   ❌ Service error (1). Waiting for next reply...`);
        logger.error('service_error', 'Service error — waiting for next reply', { phone: session.phone, errors: session.serviceErrorCount });
        const nextReply = await this.waitForReply(session, config.SERVICE_ERROR_WAIT_MS);
        if (nextReply) {
          await this.handleReply(session, nextReply);
        } else {
          this.closeNoResponse(session);
        }
      }

      // LeadState ↔ Phase sync (appliance-grade guarantee 3: only
      // campaign.js mutates LeadState). When the phase machine parked
      // the session in AWAITING_PHOTOS, mirror it to the LeadState; when
      // it leaves (owner_back → DATA_COLLECTION), move back.
      if (session.phase === PHASES.AWAITING_PHOTOS && session.state === LeadState.COLLECTING_DATA) {
        session.markWaitingPhotos();
      } else if (session.phase !== PHASES.AWAITING_PHOTOS && session.state === LeadState.WAITING_PHOTOS) {
        session.markCollectingData();
      }

      // PERSIST: Save sessions after ALL state changes in this turn.
      // Placed at the end of the switch block so all markClosed(),
      // markTimedOut(), addSentMessage(), etc. are captured.
      // Uses non-blocking save (promise chain) so the conversation
      // flow continues without waiting for disk I/O.
      // If a crash occurs, the next load() will replay from the
      // last successful save — at worst losing one reply's state.
      this.sessionStore.save(this.sessions);

    } catch (err) {
      console.error(`   ❌ Error handling reply: ${err.message}`);
      logger.error('reply_error', 'Error handling reply', { phone: session.phone, error: err.message });
      setHealthState({ lastError: err.message });
    }
  }

  /**
   * Track consecutive service errors and decide whether to escalate.
   * Returns true from the 2nd consecutive ERROR onward. The count is
   * persisted on the session (session-store) so it survives restarts.
   *
   * @param {Object} session
   * @returns {boolean} — true when the lead should be handed to a human
   */
  shouldEscalateServiceError(session) {
    session.serviceErrorCount = (session.serviceErrorCount || 0) + 1;
    return session.serviceErrorCount >= 2;
  }

  /**
   * Close a session on no-response/timeout.
   * Fires the phase-layer timeout transition (AWAITING_PHOTOS → CLOSED) if
   * applicable, then the LeadState close + CSV append. Kept DRY because
   * every no-reply branch in handleReply/processLead uses this pattern.
   */
  closeNoResponse(session) {
    if (session.phase === PHASES.AWAITING_PHOTOS) {
      transition(session, 'timeout'); // AWAITING_PHOTOS → CLOSED (phase layer)
    }
    session.markTimedOut();
    appendToCSV(session);
  }

  /**
   * Tally the final LeadState distribution across all sessions.
   * Separated from printSummary so it can be unit-tested.
   *
   * @returns {Object} counts keyed by outcome
   */
  countSummary() {
    const counts = {
      success: 0,
      notInterested: 0,
      timeout: 0,
      blocklisted: 0,
      waitingPhotos: 0,
      needsHuman: 0
    };
    for (const s of this.sessions) {
      switch (s.state) {
        case LeadState.CLOSED_SUCCESS: counts.success++; break;
        case LeadState.CLOSED_NOT_INTERESTED: counts.notInterested++; break;
        case LeadState.CLOSED_TIMEOUT: counts.timeout++; break;
        case LeadState.BLOCKLISTED: counts.blocklisted++; break;
        case LeadState.WAITING_PHOTOS: counts.waitingPhotos++; break;
        case LeadState.NEEDS_HUMAN: counts.needsHuman++; break;
      }
    }
    return counts;
  }

  /**
   * Print campaign summary
   */
  printSummary() {
    const c = this.countSummary();

    console.log(`📊 Campaign Summary:`);
    console.log(`   ✅ Successfully closed: ${c.success}`);
    console.log(`   ❌ Not interested: ${c.notInterested}`);
    console.log(`   ⏳ Timed out: ${c.timeout}`);
    console.log(`   🚫 Blocklisted: ${c.blocklisted}`);
    console.log(`   📸 Waiting for photos: ${c.waitingPhotos}`);
    console.log(`   🤝 Escalated to human: ${c.needsHuman}`);
    console.log(`   📁 CSV saved to: ${config.CSV_OUTPUT_PATH}`);

    // === METRICS (Task 6) — live counters + optional file trail ===
    metrics.snapshot('campaign_end');
    metrics.print();
  }

  getTime() {
    return new Date().toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Typing-delay sleep that the OPERATOR can skip with a bare ENTER — the
   * old sim made you wait out the full anti-ban typing delay ("💬 Thinking
   * delay: Ns"); now a bare ENTER during the countdown makes Ana type
   * instantly, and typing a REAL reply during the delay stashes it so the
   * next waitForReply() returns it immediately (you can pre-type your next
   * answer while Ana "thinks"). The skipped ENTER is CONSUMED — it must
   * NOT fall through to waitForReply as an empty reply (which would be read
   * as "no reply" → follow-up). NOTE: cooked-mode stdin delivers per line,
   * so only the FIRST line of a multi-line paste is stashed; later lines
   * arrive as separate messages to the next waitForReply. Non-interactive
   * runs (piped stdin, tests) just do the plain sleep; this.sleep stays
   * the single override point.
   *
   * @param {number} ms — real anti-ban typing delay
   * @returns {Promise<boolean>} true when the delay was skipped via stdin
   */
  async sleepWithEnterSkip(ms) {
    if (!process.stdin.isTTY) return this.sleep(ms);
    return new Promise((resolve) => {
      let done = false;
      const finish = (skipped) => {
        if (done) return;
        done = true;
        process.stdin.removeListener('data', onData);
        resolve(skipped);
      };
      const onData = (chunk) => {
        // Cooked-mode stdin delivers per line, but a PASTED multi-line block
        // can arrive as ONE chunk — only the first line is stashed (the rest
        // arrive as separate messages to the next waitForReply).
        const text = chunk.toString().split('\n')[0].trim();
        if (text === '') {
          finish(true);                        // bare ENTER → skip the delay
        } else {
          this._earlyReply = text;             // pre-typed reply → stash
          finish(true);
        }
      };
      process.stdin.on('data', onData);
      // this.sleep honors test stubs and the real delay in production.
      // .catch: a hostile stub could reject — never leak the listener.
      this.sleep(ms).then(() => finish(false)).catch(() => finish(false));
    });
  }
}
