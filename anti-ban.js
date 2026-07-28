import { config } from './config.js';

export class AntiBan {
  constructor() {
    this.hourlyCount = new Map();   // hour -> count
    this.dailyContactCount = new Map(); // phone -> count
    this.totalDailyCount = 0;
    this.lastMessageTime = null;
  }

  // === TIME WINDOW CHECK ===
  isWithinActiveHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Sunday check
    if (day === config.NO_MESSAGE_DAY) return false;

    // Active windows: 9-12 or 15-18
    return (hour >= config.ACTIVE_HOURS_START && hour < config.ACTIVE_HOURS_END) ||
           (hour >= config.ACTIVE_HOURS_AFTERNOON_START && hour < config.ACTIVE_HOURS_AFTERNOON_END);
  }

  // === QUOTA CHECKS ===
  canSendToContact(phone) {
    if (!this.isWithinActiveHours()) return false;

    // Total daily limit
    if (this.totalDailyCount >= config.MAX_MSGS_PER_DAY_TOTAL) return false;

    // Per-contact daily limit
    const contactCount = this.dailyContactCount.get(phone) || 0;
    if (contactCount >= config.MAX_MSGS_PER_DAY_PER_CONTACT) return false;

    // Per-hour limit
    const hour = new Date().getHours();
    const hourCount = this.hourlyCount.get(hour) || 0;
    if (hourCount >= config.MAX_MSGS_PER_HOUR) return false;

    return true;
  }

  // === RECORD SENT MESSAGE ===
  recordSent(phone) {
    const hour = new Date().getHours();
    this.hourlyCount.set(hour, (this.hourlyCount.get(hour) || 0) + 1);
    this.dailyContactCount.set(phone, (this.dailyContactCount.get(phone) || 0) + 1);
    this.totalDailyCount++;
    this.lastMessageTime = Date.now();
  }

  // === GET TYPING DELAY (simulates human typing) ===
  getTypingDelay(message) {
    if (!message) return 500;
    const charCount = message.length;
    // 80-250ms per character
    const perChar = config.TYPING_CHAR_MIN + Math.random() * (config.TYPING_CHAR_MAX - config.TYPING_CHAR_MIN);
    const baseDelay = charCount * perChar;

    // Add random pauses (simulating thinking between sentences)
    const sentenceCount = (message.match(/[.!?]/g) || []).length;
    const pauseDelay = sentenceCount * (config.MESSAGE_PAUSE_MIN + Math.random() * (config.MESSAGE_PAUSE_MAX - config.MESSAGE_PAUSE_MIN));

    return Math.floor(baseDelay + pauseDelay);
  }

  // === GET PAUSE BEFORE NEXT MESSAGE ===
  getInterMessageDelay() {
    // 30-60 seconds between messages to same person
    return 30000 + Math.random() * 30000;
  }

  // === GET GAP BETWEEN DIFFERENT LEADS ===
  getLeadGap() {
    // config.GAP_BETWEEN_LEADS ± 20% random variation
    const base = config.GAP_BETWEEN_LEADS;
    const variation = base * 0.2;
    return Math.floor(base - variation + Math.random() * variation * 2);
  }

  // === RESET DAILY COUNTS (call at midnight) ===
  resetDaily() {
    this.hourlyCount.clear();
    this.dailyContactCount.clear();
    this.totalDailyCount = 0;
  }

  // === SHOULD PAUSE? (returns delay in ms or 0) ===
  getRequiredPause(phone) {
    if (!this.canSendToContact(phone)) {
      return -1; // Cannot send at all
    }

    // If we just sent a message, wait
    if (this.lastMessageTime) {
      const elapsed = Date.now() - this.lastMessageTime;
      const minGap = this.getInterMessageDelay();
      if (elapsed < minGap) {
        return minGap - elapsed;
      }
    }

    return 0; // No pause needed
  }
}

// Singleton
export const antiBan = new AntiBan();
