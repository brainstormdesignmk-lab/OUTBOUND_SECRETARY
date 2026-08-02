// ========================================
// metrics.js — Live campaign metrics counters
// ========================================
// Task 6: "Add metrics counters (console + optional file) — know what's happening."
//
// A lightweight counter registry that:
//   1. Tracks named counters in memory (metrics.inc('x'))
//   2. Prints a human-readable summary to the console (metrics.print())
//   3. Optionally appends each increment as a JSONL event to a file
//      (config.METRICS_PATH) so long-running campaigns leave an
//      auditable trail that survives restarts.
//
// Usage:
//   import { metrics } from './metrics.js';
//   metrics.inc('messagesSent');
//   metrics.inc('warnings');
//   metrics.print();
// ========================================
import { config } from './config.js';
import fs from 'fs';
import path from 'path';

class Metrics {
  constructor() {
    this.counters = {};       // name -> count
    this.events = [];         // in-memory event trail (bounded)
    this.filePath = config.METRICS_PATH || null;
    this._ensureDir();
  }

  /**
   * Ensure the metrics file directory exists (best-effort).
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
   * Increment a named counter by n (default 1).
   * Optionally appends an event line to the JSONL file.
   *
   * @param {string} name — counter name (e.g. 'messagesSent')
   * @param {number} [n=1]
   * @param {Object} [meta] — optional event metadata for the JSONL trail
   */
  inc(name, n = 1, meta = null) {
    if (!name) return;
    this.counters[name] = (this.counters[name] || 0) + n;

    // Optional file trail
    if (this.filePath) {
      try {
        const event = {
          t: new Date().toISOString(),
          type: 'increment',
          counter: name,
          delta: n,
          total: this.counters[name],
          ...(meta || {})
        };
        // Bounded in-memory trail (last 500 events)
        this.events.push(event);
        if (this.events.length > 500) {
          this.events = this.events.slice(-500);
        }
        fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
      } catch (e) {
        // File write failed — keep counting in memory only
      }
    }
  }

  /**
   * Set a named counter to an absolute value.
   */
  set(name, value) {
    if (!name) return;
    this.counters[name] = value;
  }

  /**
   * Get the current value of a counter (0 if never incremented).
   */
  get(name) {
    return this.counters[name] || 0;
  }

  /**
   * Print a human-readable summary of all counters to the console.
   */
  print(label = 'METRICS') {
    const names = Object.keys(this.counters);
    if (names.length === 0) {
      console.log(`\n📊 ${label}: (no activity recorded)`);
      return;
    }
    console.log(`\n📊 ${label}:`);
    const sorted = names.sort((a, b) => this.counters[b] - this.counters[a]);
    for (const name of sorted) {
      console.log(`   ${name}: ${this.counters[name]}`);
    }
  }

  /**
   * Snapshot all counters to the metrics file as a single event
   * (useful at campaign end / restart points).
   */
  snapshot(label = 'snapshot') {
    if (!this.filePath) return;
    try {
      const event = {
        t: new Date().toISOString(),
        type: label,
        counters: { ...this.counters }
      };
      fs.appendFileSync(this.filePath, JSON.stringify(event) + '\n');
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Reset all counters (for tests / new campaign).
   */
  reset() {
    this.counters = {};
    this.events = [];
  }
}

// Singleton shared across the app
export const metrics = new Metrics();
