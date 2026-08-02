import { config } from './config.js';

// ========================================
// LeadState — the appliance-grade LeadState enum (Layer 1 of the
// three-layer architecture: LeadState / Phase / Strike).
//
// Vocabulary: NEW_LEAD → CONTACTING → COLLECTING_DATA → WAITING_PHOTOS,
// then one of the terminal states (CLOSED_* / BLOCKLISTED / NEEDS_HUMAN).
// PERSUASION lives in the Phase layer (handlers/state-machine.js) and
// stays orthogonal — a session in PERSUASION is still LeadState CONTACTING
// (or COLLECTING_DATA if data collection began).
// NEEDS_HUMAN is the human-escalation terminal state: the bot recognized
// the conversation must be handed off (owner explicitly asks for a real
// person, or repeated service failures make the bot unreliable). The
// session is parked so the operator can pick it up (CSV state column),
// and the bot never resumes it automatically (isActive() = false).
//
// INVARIANTS (appliance-grade guarantees 1-3):
//   - Only campaign.js mutates session.state (via these mark* methods).
//   - The Phase and Strike machines NEVER touch LeadState.
//   - String values are persisted (session-store / CSV), so they must
//     stay stable. Legacy values are normalized on load (normalizeState).
// ========================================
export const LeadState = {
  NEW_LEAD: 'new_lead',
  CONTACTING: 'contacting',
  COLLECTING_DATA: 'collecting_data',
  WAITING_PHOTOS: 'waiting_photos',
  NEEDS_HUMAN: 'needs_human',
  CLOSED_SUCCESS: 'closed_success',
  CLOSED_NOT_INTERESTED: 'closed_not_interested',
  CLOSED_TIMEOUT: 'closed_timeout',
  BLOCKLISTED: 'blocklisted'
};

// ========================================
// LEGACY STATE NORMALIZATION
// Maps pre-rename state strings (v1) to the appliance-grade vocabulary
// so crash recovery survives the upgrade. Applied on deserialize.
// 'closed_no_response' was never actually set (no-response → timeout).
// ========================================
const LEGACY_STATE_MAP = {
  'awaiting_greeting': LeadState.NEW_LEAD,
  'awaiting_pitch_response': LeadState.CONTACTING,
  'closed_no_response': LeadState.CLOSED_TIMEOUT
};

export function normalizeState(state) {
  return LEGACY_STATE_MAP[state] || state;
}

export class LeadSession {
  constructor(lead) {
    this.leadId = lead.id || lead.phone || Date.now();
    this.phone = lead.phone;
    this.adTitle = lead.title || '';
    this.adUrl = lead.url || '';
    this.adMemory = lead.memory || {};

    this.state = LeadState.NEW_LEAD;
    this.phase = 'PERSUASION';  // mirror of cooperation state (persisted)
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
  // Appliance-grade guarantee 3: these are the ONLY places session.state
  // is mutated, and only campaign.js calls them.
  markGreetingSent() {
    this.state = LeadState.CONTACTING;
  }

  markOwnerInterested() {
    this.state = LeadState.COLLECTING_DATA;
    // Reset reply timer since they just replied
    this.lastReplyAt = Date.now();
  }

  markWaitingPhotos() {
    this.state = LeadState.WAITING_PHOTOS;
  }

  markCollectingData() {
    this.state = LeadState.COLLECTING_DATA;
  }

  markBlocklisted() {
    this.state = LeadState.BLOCKLISTED;
  }

  markNeedsHuman() {
    this.state = LeadState.NEEDS_HUMAN;
    // Remember WHY so the operator picking this up has context
    this.escalationReason = this.escalationReason || 'owner_requested_human';
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
    return this.state === LeadState.NEW_LEAD ||
           this.state === LeadState.CONTACTING ||
           this.state === LeadState.COLLECTING_DATA ||
           this.state === LeadState.WAITING_PHOTOS;
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
