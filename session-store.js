// ========================================
// session-store.js — Campaign Session Persistence
// ========================================
// Provides an append-only journal + periodic snapshot for session
// persistence. This allows campaigns to survive process restarts
// (crash, deploy, server reboot) without losing in-progress
// conversations.
//
// Architecture:
//   1. Journal (append-only, no overwrites) — every state change
//      is appended as a JSON line. Crash-safe (fsync on every write).
//   2. Snapshot (periodic, compact) — full state written periodically
//      so recovery doesn't need to replay the entire journal.
//   3. Recovery — reads the latest snapshot, replays journal entries
//      on top to catch any entries after the last snapshot.
//
// Usage:
//   const store = new SessionStore('/path/to/sessions.json');
//   await store.save(sessions);  // Append to journal + snapshot every 5 saves
//   const sessions = await store.load(); // Restore from disk
// ========================================
import { config } from './config.js';
import { LeadSession, normalizeState } from './scheduler.js';
import fs from 'fs';
import path from 'path';

// ========================================
// File paths
// ========================================
// config.SESSIONS_PATH is always defined (envStr falls back to a
// project-root-relative default), so the old CWD-relative './data/...'
// fallbacks are gone — no second source of truth.
const SESSIONS_DIR = () => path.dirname(config.SESSIONS_PATH);
const JOURNAL_PATH = () => config.SESSIONS_PATH.replace('.json', '.journal.jsonl');
const SNAPSHOT_PATH = () => config.SESSIONS_PATH;

// ========================================
// Snapshot interval: save a compact snapshot every N journal writes
// ========================================
const SNAPSHOT_INTERVAL = 5;

// ========================================
// SessionStore class
// ========================================
export class SessionStore {
  /**
   * @param {string} [sessionsPath] — Path to session snapshot file
   */
  constructor(sessionsPath) {
    this.sessionsPath = sessionsPath || config.SESSIONS_PATH;
    this.journalPath = this.sessionsPath.replace('.json', '.journal.jsonl');
    this.snapshotPath = this.sessionsPath;
    this.writeCount = 0;
    this._writeQueue = Promise.resolve(); // Serialize writes via promise chain
    this._ensureDir();
  }

  /**
   * Ensure the directory for session files exists.
   */
  _ensureDir() {
    const dir = path.dirname(this.sessionsPath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        // Ignore if directory already exists or can't be created
      }
    }
  }

  /**
   * Serialize a LeadSession to a plain JSON-safe object.
   * Strips runtime-only properties (timer) while preserving all data.
   *
   * @param {LeadSession} session
   * @returns {Object}
   */
  _serializeSession(session) {
    return {
      leadId: session.leadId,
      phone: session.phone,
      adTitle: session.adTitle,
      adUrl: session.adUrl,
      adMemory: session.adMemory,
      state: session.state,
      phase: session.phase,
      messages: session.messages,
      collectedData: session.collectedData,
      firstMessageSentAt: session.firstMessageSentAt,
      lastMessageSentAt: session.lastMessageSentAt,
      lastReplyAt: session.lastReplyAt,
      followUpSent: session.followUpSent,
      commissionExplained: session.commissionExplained,
      rejectionCount: session.rejectionCount,
      pendingFollowUp: session.pendingFollowUp,
      pendingConfirmation: session.pendingConfirmation,
      questionAttempts: session.questionAttempts,
      offensiveStrikes: session.offensiveStrikes,
      availabilityAcknowledged: session.availabilityAcknowledged,
      escalationReason: session.escalationReason,
      serviceErrorCount: session.serviceErrorCount,
      // CLOSING FOLLOW-UP WINDOW anchor — persisted so a restart inside the
      // 10-min window keeps answering end questions (reviewer finding).
      closingSince: session.closingSince ?? null
    };
  }

  /**
   * Deserialize a plain object back into a LeadSession.
   *
   * @param {Object} data
   * @returns {LeadSession}
   */
  _deserializeSession(data) {
    // Create a minimal lead-like object to pass to LeadSession constructor
    const lead = {
      phone: data.phone,
      title: data.adTitle,
      url: data.adUrl,
      memory: data.adMemory
    };
    const session = new LeadSession(lead);

    // Overwrite default constructor values with persisted state
    // Legacy state strings (pre-appliance-grade rename) are normalized
    // so crash recovery survives upgrades.
    session.leadId = data.leadId || session.leadId;
    session.state = normalizeState(data.state) || session.state;
    session.phase = data.phase || 'PERSUASION';
    session.messages = data.messages || [];
    session.collectedData = data.collectedData || { ...data.adMemory };
    session.firstMessageSentAt = data.firstMessageSentAt || null;
    session.lastMessageSentAt = data.lastMessageSentAt || null;
    session.lastReplyAt = data.lastReplyAt || null;
    session.followUpSent = data.followUpSent || false;
    session.commissionExplained = data.commissionExplained || false;
    session.rejectionCount = data.rejectionCount || 0;
    session.pendingFollowUp = data.pendingFollowUp || null;
    session.pendingConfirmation = data.pendingConfirmation || null;
    session.questionAttempts = data.questionAttempts || {};
    session.offensiveStrikes = data.offensiveStrikes || 0;
    session.availabilityAcknowledged = data.availabilityAcknowledged || false;
    session.escalationReason = data.escalationReason || null;
    session.serviceErrorCount = data.serviceErrorCount || 0;
    // CLOSING FOLLOW-UP WINDOW anchor (reviewer finding): survive a restart.
    session.closingSince = typeof data.closingSince === 'number' ? data.closingSince : null;

    return session;
  }

  /**
   * Perform the actual sync save (journal + optional snapshot).
   * This is a sync operation (blocks event loop briefly).
   *
   * @param {LeadSession[]} sessions
   */
  _saveSync(sessions) {
    if (!sessions || sessions.length === 0) return;

    this.writeCount++;
    const timestamp = Date.now();

    try {
      // === 1. Append to journal (crash-safe, sync) ===
      // Each line is a complete JSON entry for one session.
      // Uses fsync to ensure data is on disk before proceeding.
      const journalLines = sessions.map(s => JSON.stringify({
        t: timestamp,
        phone: s.phone,
        data: this._serializeSession(s)
      }));

      const fd = fs.openSync(this.journalPath, 'a');
      try {
        for (const line of journalLines) {
          fs.writeSync(fd, line + '\n');
        }
        fs.fsyncSync(fd); // Crash-safe: ensure data is on disk
      } finally {
        fs.closeSync(fd);
      }

      // === 2. Snapshot every N writes + rotate journal ===
      if (this.writeCount % SNAPSHOT_INTERVAL === 0) {
        const snapshotData = {
          version: 1,
          savedAt: timestamp,
          sessionCount: sessions.length,
          sessions: sessions.map(s => this._serializeSession(s))
        };
        const tmpPath = this.snapshotPath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(snapshotData, null, 2));
        fs.renameSync(tmpPath, this.snapshotPath); // Atomic replace

        // === 3. Truncate journal after snapshot ===
        // Journal entries before the snapshot are no longer needed for recovery.
        // Truncating prevents unbounded journal growth over long campaigns.
        // Write a single "snapshot taken" marker line to the truncated journal.
        fs.writeFileSync(this.journalPath, JSON.stringify({
          t: timestamp,
          type: 'snapshot',
          sessionCount: sessions.length
        }) + '\n');

        console.log(`[SESSION STORE] Snapshot saved + journal rotated: ${sessions.length} sessions`);
      }
    } catch (err) {
      console.error(`[SESSION STORE] Save error: ${err.message}`);
    }
  }

  /**
   * Save sessions: append to journal, optionally create snapshot.
   * Writes are serialized via a promise chain to prevent concurrent
   * file access (which could interleave writes and corrupt the journal).
   *
   * @param {LeadSession[]} sessions
   * @returns {Promise<void>}
   */
  save(sessions) {
    // Chain writes sequentially via promise queue
    this._writeQueue = this._writeQueue.then(() => {
      this._saveSync(sessions);
    }).catch(err => {
      console.error(`[SESSION STORE] Save queue error: ${err.message}`);
    });
    return this._writeQueue;
  }

  /**
   * Load sessions from disk. Recovery strategy:
   * 1. Read the latest snapshot (if exists)
   * 2. Read journal entries AFTER the snapshot timestamp
   * 3. Replay journal entries on top of snapshot (newer wins)
   *
   * @returns {Promise<LeadSession[]>}
   */
  async load() {
    const sessions = new Map(); // phone → session

    try {
      // === Step 1: Load snapshot (compact baseline) ===
      let snapshotTime = 0;
      if (fs.existsSync(this.snapshotPath)) {
        try {
          const raw = fs.readFileSync(this.snapshotPath, 'utf-8');
          const snapshot = JSON.parse(raw);
          snapshotTime = snapshot.savedAt || 0;

          if (snapshot.sessions && Array.isArray(snapshot.sessions)) {
            for (const data of snapshot.sessions) {
              try {
                const session = this._deserializeSession(data);
                sessions.set(session.phone, session);
              } catch (e) {
                console.warn(`[SESSION STORE] Skipping corrupt session in snapshot: ${e.message}`);
              }
            }
          }
          console.log(`[SESSION STORE] Loaded ${sessions.size} sessions from snapshot (saved at ${new Date(snapshotTime).toISOString()})`);
        } catch (e) {
          console.warn(`[SESSION STORE] Corrupt snapshot, recovering from journal only: ${e.message}`);
        }
      }

      // === Step 2: Replay journal entries after snapshot ===
      if (fs.existsSync(this.journalPath)) {
        try {
          const journalRaw = fs.readFileSync(this.journalPath, 'utf-8');
          const lines = journalRaw.split('\n').filter(l => l.trim());

          let replayedCount = 0;
          for (const line of lines) {
            try {
              const entry = JSON.parse(line);
              // Only replay entries AFTER the snapshot timestamp
              if (entry.t > snapshotTime) {
                try {
                  const session = this._deserializeSession(entry.data);
                  sessions.set(session.phone, session);
                  replayedCount++;
                } catch (e) {
                  console.warn(`[SESSION STORE] Skipping corrupt journal entry: ${e.message}`);
                }
              }
            } catch (e) {
              // Skip malformed lines
            }
          }

          if (replayedCount > 0) {
            console.log(`[SESSION STORE] Replayed ${replayedCount} journal entries after snapshot`);
          }
        } catch (e) {
          console.warn(`[SESSION STORE] Corrupt journal, continuing with snapshot only: ${e.message}`);
        }
      }

      // === Step 3: Update write count from journal for snapshot scheduling ===
      if (fs.existsSync(this.journalPath)) {
        const journalRaw = fs.readFileSync(this.journalPath, 'utf-8');
        const lines = journalRaw.split('\n').filter(l => l.trim());
        this.writeCount = lines.length;
      }

    } catch (err) {
      console.error(`[SESSION STORE] Load error: ${err.message}`);
    }

    return Array.from(sessions.values());
  }

  /**
   * Clear all persisted session data (useful for testing / fresh start).
   */
  async clear() {
    try {
      if (fs.existsSync(this.journalPath)) {
        fs.unlinkSync(this.journalPath);
      }
      if (fs.existsSync(this.snapshotPath)) {
        fs.unlinkSync(this.snapshotPath);
      }
      this.writeCount = 0;
      console.log('[SESSION STORE] Cleared all persisted session data');
    } catch (err) {
      console.error(`[SESSION STORE] Clear error: ${err.message}`);
    }
  }
}

// ========================================
// Singleton instance (shared across the app)
// ========================================
let _instance = null;

/**
 * Get or create the singleton SessionStore instance.
 * Uses config.SESSIONS_PATH if available.
 *
 * @returns {SessionStore}
 */
export function getSessionStore() {
  if (!_instance) {
    _instance = new SessionStore();
  }
  return _instance;
}

/**
 * Set the session store instance (for testing / dependency injection).
 *
 * @param {SessionStore} store
 */
export function setSessionStore(store) {
  _instance = store;
}
