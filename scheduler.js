import { config } from './config.js';

export const LeadState = {
  AWAITING_GREETING: 'awaiting_greeting',
  AWAITING_PITCH_RESPONSE: 'awaiting_pitch_response',
  COLLECTING_DATA: 'collecting_data',
  CLOSED_SUCCESS: 'closed_success',
  CLOSED_NO_RESPONSE: 'closed_no_response',
  CLOSED_NOT_INTERESTED: 'closed_not_interested',
  CLOSED_TIMEOUT: 'closed_timeout'
};

export class LeadSession {
  constructor(lead) {
    this.leadId = lead.id || lead.phone || Date.now();
    this.phone = lead.phone;
    this.adTitle = lead.title || '';
    this.adUrl = lead.url || '';
    this.adMemory = lead.memory || {};

    this.state = LeadState.AWAITING_GREETING;
    this.messages = [];       // { role, text, timestamp }
    this.collectedData = { ...this.adMemory };

    this.firstMessageSentAt = null;
    this.lastMessageSentAt = null;
    this.lastReplyAt = null;

    this.followUpSent = false;
    this.timer = null;
  }

  // === MESSAGE TRACKING ===
  addSentMessage(text) {
    const now = Date.now();
    this.messages.push({ role: 'model', text, timestamp: now });
    this.lastMessageSentAt = now;
    if (!this.firstMessageSentAt) this.firstMessageSentAt = now;
  }

  addReply(text) {
    const now = Date.now();
    this.messages.push({ role: 'user', text, timestamp: now });
    this.lastReplyAt = now;
  }

  // === TIMING ===
  getTimeSinceLastReply() {
    if (!this.lastReplyAt) return null;
    return Date.now() - this.lastReplyAt;
  }

  getTimeSinceFirstMessage() {
    if (!this.firstMessageSentAt) return null;
    return Date.now() - this.firstMessageSentAt;
  }

  // === STATE TRANSITIONS ===
  markGreetingSent() {
    this.state = LeadState.AWAITING_PITCH_RESPONSE;
  }

  markOwnerInterested() {
    this.state = LeadState.COLLECTING_DATA;
    // Reset reply timer since they just replied
    this.lastReplyAt = Date.now();
  }

  markClosed(success = true) {
    this.state = success ? LeadState.CLOSED_SUCCESS : LeadState.CLOSED_NOT_INTERESTED;
  }

  markTimedOut() {
    this.state = LeadState.CLOSED_TIMEOUT;
  }

  // === DECISION HELPERS ===
  shouldSendFollowUp() {
    if (this.followUpSent) return false;
    if (this.lastReplyAt) return false; // Already got a reply
    if (!this.firstMessageSentAt) return false;

    const elapsed = Date.now() - this.firstMessageSentAt;
    return elapsed >= config.REPLY_TIMEOUT && !this.followUpSent;
  }

  shouldTimeout() {
    if (!this.firstMessageSentAt) return false;
    if (this.state === LeadState.CLOSED_SUCCESS) return false;
    if (this.state === LeadState.CLOSED_NOT_INTERESTED) return false;

    const elapsed = Date.now() - this.firstMessageSentAt;
    return elapsed >= config.FOLLOWUP_TIMEOUT;
  }

  isActive() {
    return this.state === LeadState.AWAITING_GREETING ||
           this.state === LeadState.AWAITING_PITCH_RESPONSE ||
           this.state === LeadState.COLLECTING_DATA;
  }

  // === CSV OUTPUT ===
  toCSVRow() {
    const d = this.collectedData;
    const row = [
      d.cleanPrice || '',
      d.ownerName || '',
      (d.phone || '').replace(/^\+?389/, '').replace(/(\d{3})(\d{3})(\d{3})/, '$1/$2-$3'),
      d.address || '',
      d.naselba || '',
      d.transactionType || '',
      d.propertyType || '',
      d.yearBuilt || '',
      d.totalSqm || '',
      d.netoSqm || '',
      d.terraceSqm || '',
      d.bedrooms !== null && d.bedrooms !== undefined ? d.bedrooms : '',
      d.furnished || '',
      d.floor !== null && d.floor !== undefined ? d.floor : '',
      d.elevator === true ? 'да' : d.elevator === false ? 'не' : '',
      d.heating || '',
      d.parking || '',
      d.ac === true ? 'да' : d.ac === false ? 'не' : '',
      d.orientation || '',
      d.documentationClean === true ? 'да' : d.documentationClean === false ? 'не' : '',
      d.description || (this.adTitle || ''),
      d.photos === true ? 'да' : d.photos === false ? 'не' : d.photos === 'need_photographer' ? 'треба фотограф' : '',
      this.state,
      new Date(this.firstMessageSentAt).toISOString()
    ];
    return row.join(',');
  }

  static getCSVHeader() {
    return 'clean_price,owner_name,phone,address,naselba,transaction_type,property_type,year_built,total_sqm,neto_sqm,terrace_sqm,bedrooms,furnished,floor,elevator,heating,parking,ac,orientation,documentation_clean,description,photos,status,contacted_at';
  }
}
