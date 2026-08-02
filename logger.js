// ========================================
// logger.js — Structured JSONL audit logging
// ========================================
// Task 9: "Add structured logging (JSON lines to file) — debugging, audit trail."
//
// A minimal structured logger that:
//   1. Emits every event as a single JSON line (JSONL) to config.LOG_PATH,
//      so log aggregators (filebeat/loki/Splunk) can parse it directly.
//   2. Mirrors a human-readable line to the console so interactive runs
//      stay readable.
//   3. Levels: info / warn / error — each maps to a distinct console prefix
//      so production severity is visible at a glance.
//
// Every event carries a stable shape:
//   { t, level, event, message, ...meta }
//
//   t       — ISO timestamp
//   level   — info | warn | error
//   event   — machine-readable event name (e.g. 'campaign_start',
//             'lead_started', 'strike', 'phase_transition')
//   message — short human-readable summary
//   meta    — caller-supplied structured context (phone, phase, index...)
//
// Usage:
//   import { logger } from './logger.js';
//   logger.info('campaign_start', 'Campaign started', { leads: 12 });
//   logger.warn('strike', 'Offensive message', { phone, strike: 1 });
// ========================================
import { config } from './config.js';
import fs from 'fs';
import path from 'path';

class Logger {
  constructor() {
    this.filePath = config.LOG_PATH || null;
    this._ensureDir();
  }

  /**
   * Ensure the log file directory exists (best-effort).
   */
  _ensureDir() {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {
      // Non-fatal — console-only mode
    }
  }

  /**
   * Core emit — write one structured JSONL event + console mirror.
   *
   * @param {string} level — 'info' | 'warn' | 'error'
   * @param {string} event — machine-readable event name
   * @param {string} message — short human-readable summary
   * @param {Object} [meta={}] — structured context
   */
  _emit(level, event, message, meta = {}) {
    const entry = {
      t: new Date().toISOString(),
      level,
      event,
      message,
      ...meta
    };

    // 1. File trail (JSONL) — best-effort, never throws
    if (this.filePath) {
      try {
        fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
      } catch (e) {
        // File write failed — keep logging to console only
      }
    }

    // 2. Console mirror — color-free (works in any terminal), prefixed by level
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    if (level === 'error') {
      console.error(`[${level.toUpperCase()}] ${event}: ${message}${metaStr}`);
    } else if (level === 'warn') {
      console.warn(`[${level.toUpperCase()}] ${event}: ${message}${metaStr}`);
    } else {
      console.log(`[${level.toUpperCase()}] ${event}: ${message}${metaStr}`);
    }
  }

  info(event, message, meta) { this._emit('info', event, message, meta); }
  warn(event, message, meta) { this._emit('warn', event, message, meta); }
  error(event, message, meta) { this._emit('error', event, message, meta); }
}

// Singleton shared across the app
export const logger = new Logger();
