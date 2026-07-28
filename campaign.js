import { config } from './config.js';
import { loadLeadsFromFile, createSessionFromLead, appendToCSV } from './lead-processor.js';
import { generateResponse } from './service.js';
import { LeadSession, LeadState } from './scheduler.js';
import { antiBan } from './anti-ban.js';
import { getFollowUpMessage, getNoResponseClose } from './deal-terms.js';

export class Campaign {
  constructor() {
    this.sessions = [];
    this.currentIndex = 0;
    this.running = false;
    this.paused = false;
  }

  /**
   * Load leads from file
   */
  loadLeads(filePath) {
    const leads = loadLeadsFromFile(filePath);
    console.log(`\n📋 Loaded ${leads.length} leads from ${filePath}\n`);

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

    return this.sessions.length;
  }

  /**
   * Start the campaign
   */
  async start() {
    if (this.sessions.length === 0) {
      console.log('❌ No sessions to run. Load leads first.');
      return;
    }

    this.running = true;
    this.currentIndex = 0;

    console.log(`\n========================================`);
    console.log(`🚀 CAMPAIGN STARTED — ${this.sessions.length} leads`);
    console.log(`========================================\n`);

    for (let i = 0; i < this.sessions.length; i++) {
      if (!this.running) {
        console.log('⏹️ Campaign stopped.');
        break;
      }

      const session = this.sessions[i];
      this.currentIndex = i;

      await this.processLead(session, i);

      // Gap before next lead (except for last one)
      if (i < this.sessions.length - 1 && this.running) {
        const gap = antiBan.getLeadGap();
        console.log(`\n⏳ Waiting ${Math.round(gap / 1000 / 60)} min before next lead...\n`);
        await this.sleep(gap);
      }
    }

    this.running = false;
    console.log(`\n========================================`);
    console.log(`🏁 CAMPAIGN FINISHED`);
    console.log(`========================================\n`);
    this.printSummary();
  }

  /**
   * Process a single lead through its lifecycle
   */
  async processLead(session, index) {
    console.log(`\n--- Lead ${index + 1}: ${session.phone} ---`);

    if (!antiBan.canSendToContact(session.phone)) {
      console.log(`   ⏭️ Skipping — anti-ban limits reached or outside active hours`);
      return;
    }

    // === STEP 1: Send first message ===
    const firstMsg = session.messages[0];
    console.log(`\n   📤 [${this.getTime()}] Sending to ${session.phone}:`);
    console.log(`   "${firstMsg.text}"`);

    antiBan.recordSent(session.phone);

    // Wait for typing simulation
    const typingDelay = antiBan.getTypingDelay(firstMsg.text);
    console.log(`   💬 Typing delay: ${Math.round(typingDelay / 1000)}s`);
    await this.sleep(typingDelay);

    // === STEP 2: Wait for reply (30 min) ===
    console.log(`   ⏳ Waiting up to ${config.REPLY_TIMEOUT / 1000 / 60} min for reply...`);
    const reply1 = await this.waitForReply(session, config.REPLY_TIMEOUT);

    if (reply1) {
      console.log(`   📩 Reply received: "${reply1.substring(0, 80)}..."`);
      await this.handleReply(session, reply1);
    } else {
      // === STEP 3: Send follow-up ===
      const followUp = getFollowUpMessage();
      session.addSentMessage(followUp);
      session.followUpSent = true;
      antiBan.recordSent(session.phone);

      const typingDelay2 = antiBan.getTypingDelay(followUp);
      console.log(`   📤 Follow-up: "${followUp}"`);
      await this.sleep(typingDelay2);

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
        session.markTimedOut();
        console.log(`   ⏰ No response. Closing: "${closeMsg}"`);

        // Append to CSV with no-response status
        appendToCSV(session);
      }
    }
  }

  /**
   * Wait for a reply (simulated — in real mode this polls)
   * For test mode, reads from stdin with timeout
   */
  async waitForReply(session, timeoutMs) {
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
  async handleReply(session, replyText) {
    try {
      const response = await generateResponse(session, replyText);

      if (!response || !response.text) {
        console.log('   ❌ Empty response from service');
        return;
      }

      const delay = antiBan.getTypingDelay(response.text);
      console.log(`   💬 Thinking delay: ${Math.round(delay / 1000)}s`);
      await this.sleep(delay);

      console.log(`   📤 Ana: "${response.text}"`);
      session.addSentMessage(response.text);

      if (response.type === 'QUESTION') {
        session.markOwnerInterested();
        // Wait for next reply
        console.log(`   ⏳ Waiting for next reply...`);
        const nextReply = await this.waitForReply(session, config.REPLY_TIMEOUT);

        if (nextReply) {
          console.log(`   📩 Reply: "${nextReply.substring(0, 80)}..."`);
          await this.handleReply(session, nextReply);
        } else {
          const followUp = getFollowUpMessage();
          session.addSentMessage(followUp);
          session.followUpSent = true;
          antiBan.recordSent(session.phone);
          console.log(`   📤 Follow-up: "${followUp}"`);

          const nextReply2 = await this.waitForReply(session, config.FOLLOWUP_TIMEOUT - config.REPLY_TIMEOUT);

          if (nextReply2) {
            await this.handleReply(session, nextReply2);
          } else {
            session.markTimedOut();
            console.log(`   ⏰ No response. Closing.`);
            appendToCSV(session);
          }
        }
      } else if (response.type === 'CLOSE') {
        session.markClosed(true);
        appendToCSV(session);
        console.log(`   ✅ Lead closed successfully.`);
      } else if (response.type === 'NO_INTEREST') {
        session.markClosed(false);
        appendToCSV(session);
        console.log(`   ❌ Owner not interested.`);
      } else if (response.type === 'TERMS_EXPLANATION') {
        // Owner asked for terms, wait for their response to the terms
        console.log(`   ⏳ Waiting for owner's response to terms...`);
        const termsReply = await this.waitForReply(session, config.REPLY_TIMEOUT);

        if (termsReply) {
          console.log(`   📩 Reply: "${termsReply.substring(0, 80)}..."`);
          await this.handleReply(session, termsReply);
        } else {
          const followUp = getFollowUpMessage();
          session.addSentMessage(followUp);
          console.log(`   📤 Follow-up: "${followUp}"`);
          const termsReply2 = await this.waitForReply(session, 60000 * 10);
          if (termsReply2) {
            await this.handleReply(session, termsReply2);
          } else {
            session.markTimedOut();
            appendToCSV(session);
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
          session.markTimedOut();
          appendToCSV(session);
          console.log(`   ⏰ No response. Closing.`);
        }

      } else if (response.type === 'ERROR') {
        console.log(`   ❌ Service error. Continuing...`);
        session.markTimedOut();
        appendToCSV(session);
      }

    } catch (err) {
      console.error(`   ❌ Error handling reply: ${err.message}`);
    }
  }

  /**
   * Print campaign summary
   */
  printSummary() {
    let success = 0, noResponse = 0, notInterested = 0, timeout = 0;

    for (const s of this.sessions) {
      switch (s.state) {
        case LeadState.CLOSED_SUCCESS: success++; break;
        case LeadState.CLOSED_NO_RESPONSE: noResponse++; break;
        case LeadState.CLOSED_NOT_INTERESTED: notInterested++; break;
        case LeadState.CLOSED_TIMEOUT: timeout++; break;
      }
    }

    console.log(`📊 Campaign Summary:`);
    console.log(`   ✅ Successfully closed: ${success}`);
    console.log(`   ❌ Not interested: ${notInterested}`);
    console.log(`   ⏰ No response: ${noResponse}`);
    console.log(`   ⏳ Timed out: ${timeout}`);
    console.log(`   📁 CSV saved to: ${config.CSV_OUTPUT_PATH}`);
  }

  getTime() {
    return new Date().toLocaleTimeString('mk-MK', { hour: '2-digit', minute: '2-digit' });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
