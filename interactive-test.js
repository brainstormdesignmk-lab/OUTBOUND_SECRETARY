#!/usr/bin/env node
/**
 * interactive-test.js — ANA MULTI-LEAD INTERACTIVE TEST (TUI)
 *
 * Drives the REAL production pipeline (engine → generateResponse →
 * phase machine → extraction → close path) with MANY concurrent leads
 * loaded from scraper CSVs — the model Ana will use in production.
 *
 *   node interactive-test.js                          # sample leads
 *   node interactive-test.js ./leads/scraped.csv      # your scraper file
 *   ANA_SIM_TYPING_SCALE=0.05 node interactive-test.js # compressed delays
 *
 * Layout (blessed TUI):
 *   ┌────────────────────────┬─────────────────────────────┐
 *   │ LEADS (live)           │ CONVERSATION — <leadId>     │
 *   │  ⚪ 3571074 Aerodrom    │  ANA (magenta): Здраво...    │
 *   │  🟢 5540516 Urban ...   │  OWNER (cyan): Да, се продава │
 *   │  🟡 5502969 idle 4 min  │  ▸ [PHASE: DATA_COLLECTION]  │  ← phase info,
 *   ├────────────────────────┴─────────────────────────────┤    dim, inside chat
 *   │ Select lead: _          (ENTER empty = force next)    │
 *   └───────────────────────────────────────────────────────┘
 *
 * Keys (same in BOTH modes — you can switch leads at any time):
 *   ↑ / ↓              — move a HIGHLIGHT through the lead list (browse from
 *                        any mode, never stuck in a chat).
 *   SPACE (empty input)— ACTIVATE the highlighted lead: a not-started lead
 *                        gets its greeting started NOW (operator override);
 *                        an active one just resumes its chat (state kept).
 *                        With text in the input, SPACE types a space in the
 *                        owner reply — so replies with spaces still work.
 *   type + ENTER       — send that text as the OWNER's reply to the
 *                        currently selected lead. NUMBERS are replies too:
 *                        typing "3" answers "Колку спални соби?" with 3 —
 *                        it never switches leads (reported: "3" opened
 *                        lead 3 instead of answering the bedroom question).
 *   #N + ENTER         — legacy alias: also sends the number N as the reply
 *                        (kept for muscle memory; identical to typing N)
 *   ↑/↓ + SPACE        — switch leads from ANY mode: highlight with ↑/↓,
 *                        SPACE (empty input) activates it. Ctrl+L then a
 *                        number works from the list too.
 *   ENTER (empty)      — forceNext: instant bypass of every delay,
 *                        anti-ban gates + next lead greeting
 *   ENTER (during the  — SKIP Ana's real typing delay: the header shows a
 *   ANA countdown)       live "💬 ANA types in Ns" timer (restored from the
 *                        old campaign sim's "Thinking delay") and ENTER
 *                        makes her type INSTANTLY (engine.skipTyping()).
 *   follow-up window    — after an owner message Ana waits a grace window
 *                        for a follow-up (real owners send 2-3 in a row).
 *                        Header: "⌨️ owner can add a follow-up — Ana replies
 *                        in Ns". ENTER closes the window → Ana replies now.
 *   CTRL+L             — back to the lead selector
 *   q (in the lead list) / Esc / CTRL+C — quit
 *
 * NOTE: the input is a CUSTOM single-line buffer driven by ONE
 * program-level keypress listener — not a blessed textbox. Blessed's
 * textbox/inputOnFocus/readInput machinery re-attaches keypress
 * listeners on every focus cycle, which doubled typed characters
 * ("ima" → "iimmaa", "3" → "33"). With a plain box + buffer there is
 * no focus(), no grabKeys, no readInput — that bug class is gone.
 *
 * Colors: OWNER = cyan, ANA = magenta, pipeline phase lines = dim gray.
 * Anti-ban: real pacing (typing delays, 10-min idle gate, inter-contact
 * gap) — ENTER is the instant override (forceNext). The PRODUCTION
 * hourly/daily quotas are OFF by default (a single test conversation
 * sends 20+ messages, instantly exhausting the 15/hour cap and silently
 * blocking every later greeting — see the engine construction below);
 * set ANA_SIM_QUOTA=1 to re-enable them.
 *
 * CRITICAL: the production pipeline (service.js, handlers/*, extractor)
 * writes diagnostics to console.log ([PHASE], [INTENT], [MEMORY],
 * [EXTRACTION], ...). A blessed TUI owns the whole terminal, so those
 * raw writes are captured here and re-rendered as dim lines INSIDE the
 * selected lead's conversation panel — never printed to the raw screen
 * (which would corrupt the layout and the input line).
 */
import './env.js'; // side-effect: load ~/.ana/ana.env (see env.js) — never a .env* file in CWD

import blessed from 'blessed';
import chalk from 'chalk';
import util from 'node:util';
import { config } from './config.js';
import { MultiLeadEngine } from './engine.js';
import { loadScraperLeads } from './lead-normalizer.js';
import { loadLeadsFromFile } from './lead-processor.js';

// ============================================================
// Lead source: explicit file, or sample with all 3 formats
// (fatal errors here still print to the REAL console — the capture
// below is installed only after the screen exists)
// ============================================================
const leadsArg = process.argv[2];
let leads = [];
if (leadsArg) {
  const path = leadsArg;
  try {
    leads = loadScraperLeads(path);
  } catch (e) {
    // Fall back to the legacy 4-col format if the scraper parser fails
    leads = loadLeadsFromFile(path);
  }
} else {
  try {
    leads = loadScraperLeads('./data/multi-leads-sample.csv');
  } catch (e) {
    leads = loadLeadsFromFile('./data/sim-leads-happy.csv');
  }
}

// ============================================================
// Engine (real clock, real pacing)
// ============================================================
// PRODUCTION QUOTA OPT-OUT — this is an INTERACTIVE TEST tool where the
// operator plays every role. A single full data-collection conversation
// sends 20+ messages, which instantly exhausts the PRODUCTION hourly
// quota (ANA_MAX_MSGS_PER_HOUR default 15). After that
// antiBan.canSendToContact() returns false for EVERY remaining lead and
// the scheduler's auto-greet gate never opens for the rest of the hour —
// the reported "after the first lead finished, the others won't start
// (not automatically)". The engine's OWN pacing gates stay fully on (the
// 10-min idle rule + inter-contact gap — both instantly bypassed by
// ENTER = forceNext); only the hourly/daily production quotas are
// dropped. Set ANA_SIM_QUOTA=1 to re-enable the real quotas.
const engine = new MultiLeadEngine({
  // Owner-follow-up grace: after an owner message, Ana waits this long for a
  // follow-up (or two) before replying — real owners often type several
  // messages in a row. The header shows a live countdown; ENTER ends it now.
  ownerGraceMs: config.OWNER_FOLLOWUP_GRACE_MS,
  canSendContact: process.env.ANA_SIM_QUOTA === '1' ? undefined : () => true
});
const loaded = engine.loadLeads(leads);
if (loaded === 0) {
  console.error('❌ No valid leads loaded (need id,title,phone,url per lead).');
  process.exit(1);
}

// ============================================================
// Blessed screen
// ============================================================
const screen = blessed.screen({
  smartCSR: true,
  title: 'ANA MULTI-LEAD TEST'
  // NOTE: ignoreLocked intentionally omitted — the custom input line uses
  // no input widget, so grabKeys is never set and every key reaches our
  // single program-level listener (see the KEYBOARD section).
});

const HEADER_H = 3;
const FOOTER_H = 3;
const HINT_H = 1;   // persistent key-map bar above the footer

// --- Header: live counters ---
const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: HEADER_H,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'gray' }, fg: 'white' },
  content: ''
});

// --- Left panel: live lead list (1/3 width) ---
const leadPanel = blessed.box({
  parent: screen,
  top: HEADER_H,
  left: 0,
  width: '33%',
  height: `100%-${HEADER_H + FOOTER_H + HINT_H}`,
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  wordWrap: false,          // never wrap: rows stay 1 line, overflow clips
  border: { type: 'line' },
  style: { border: { fg: 'cyan' }, fg: 'white' },
  content: ''
});

// --- Right panel: conversation of the selected lead (2/3 width) ---
const convPanel = blessed.log({
  parent: screen,
  top: HEADER_H,
  left: '33%',
  width: '67%',
  height: `100%-${HEADER_H + FOOTER_H + HINT_H}`,
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  mouse: true,
  wordWrap: false,
  border: { type: 'line' },
  style: { border: { fg: 'magenta' }, fg: 'white' },
  content: ''
});

// --- Hint bar: persistent key map (above the footer) ---
const hintBar = blessed.box({
  parent: screen,
  bottom: FOOTER_H,
  left: 0,
  width: '100%',
  height: HINT_H,
  tags: true,
  style: { fg: 'gray', bg: 'black' },
  content: chalk.gray('  ↑↓ + SPACE = switch leads   ·   type + ENTER = owner reply (numbers are replies — no # needed)   ·   ENTER = force next / skip timer / close follow-up window   ·   CTRL+L = list   ·   Esc/Ctrl+C = quit (q in list)')
});

// --- Footer: custom input line (plain box — see KEYBOARD section) ---
const inputLine = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: FOOTER_H,
  tags: true,
  border: { type: 'line' },
  style: { border: { fg: 'yellow' }, fg: 'white' },
  content: ''
});

// ============================================================
// PIPELINE LOG CAPTURE
// ============================================================
// The engine → service.js → handlers → extractor pipeline writes its
// diagnostics through console.log/error. In a raw CLI (run-live-sim)
// those print to the terminal; here they would corrupt the TUI. We
// capture them and re-render them as dim lines in the conversation
// panel of whichever lead is currently being processed.
const realLog = console.log.bind(console);
const realError = console.error.bind(console);

let currentDebugLead = null;      // leadId whose generateResponse is running
const syslog = [];                // captured lines with no lead context (cap)

function fmtArg(a) {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.message;
  try { return util.inspect(a, { depth: 2, colors: false, breakLength: 120 }); }
  catch { return String(a); }
}

console.log = (...args) => {
  const line = args.map(fmtArg).join(' ').trim();
  if (line) routePipelineLine(line);
};
console.warn = console.log;
console.error = (...args) => {
  const line = args.map(fmtArg).join(' ').trim();
  if (line) routePipelineLine(line);       // engine errors surface in the chat too
};

function routePipelineLine(line) {
  if (currentDebugLead) {
    appendDebug(currentDebugLead, line);   // dim line inside that lead's chat
  } else {
    syslog.push(line);                     // engine-level noise (greeting timers…)
    if (syslog.length > 300) syslog.shift();
  }
}

// ============================================================
// TUI state
// ============================================================
let mode = 'LIST';                 // LIST = pick lead | CHAT = type owner msg
let selectedId = null;             // currently viewed lead (scraper id)
let positionToId = [];             // display position → leadId
let listCursor = 0;                // highlighted row in the lead list (↑/↓)
                                   // SPACE on the empty input activates it

// Per-lead transcript cache (so switching leads shows its own chat)
const transcripts = new Map();     // leadId -> string[]

function getTranscript(id) {
  if (!transcripts.has(id)) transcripts.set(id, []);
  return transcripts.get(id);
}

function trunc(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ============================================================
// Rendering
// ============================================================
function statusDot(row) {
  const st = row.state;
  if (st === 'closed_success') return chalk.green('✅');
  if (st === 'closed_not_interested') return chalk.red('❌');
  if (st === 'closed_timeout') return chalk.yellow('⏰');
  if (st === 'blocklisted') return chalk.red('🚫');
  if (st === 'needs_human') return chalk.yellow('🤝');
  if (!row.greeted) return chalk.white('⚪');          // not started
  if (row.lastReplyAt && row.idleMin !== null && row.idleMin < 10) return chalk.green('🟢');
  if (row.idleMin !== null) return chalk.yellow('🟡');
  return chalk.green('🟢');
}

function leadLabel(row, idx) {
  const dot = statusDot(row);
  const st = row.state;
  let detail;
  if (st === 'closed_success') detail = 'closed ✅';
  else if (st === 'closed_not_interested') detail = 'closed ❌';
  else if (st === 'closed_timeout') detail = 'timeout';
  else if (st === 'blocklisted') detail = 'blocked';
  else if (st === 'needs_human') detail = '→ human';
  else if (!row.greeted) detail = 'not started';
  else if (row.lastReplyAt && row.idleMin !== null && row.idleMin < 10) detail = 'active';
  else if (row.idleMin !== null) detail = `idle ${row.idleMin} min`;
  else detail = 'waiting reply';
  const sel = selectedId === row.leadId ? chalk.bold.inverse('▶') : ' ';
  const title = trunc((row.title || '').replace(/,/g, ' '), 14) || row.phone;
  // Keep the whole row short enough to fit 1/3 of the screen (no wrap)
  return `${sel} ${dot} ${chalk.cyan(String(idx + 1).padStart(2))}) ${chalk.bold(trunc(row.leadId, 12))} ${trunc(title, 14)} ${chalk.gray('· ' + trunc(detail, 11))}`;
}

// Transient status line (shown in the header for ~4s). Kept OUT of the
// textbox value — a status written into the input box would be re-submitted
// as an owner reply on the next ENTER (observed in testing).
let statusMsg = '';
let statusTimer = null;

function setStatus(msg) {
  statusMsg = msg;
  renderHeader();
  screen.render();
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (statusMsg === msg) { statusMsg = ''; renderHeader(); screen.render(); }
  }, 4000);
}

// ============================================================
// ANA TYPING COUNTDOWN — the old campaign sim printed
// "💬 Thinking delay: Ns" before each Ana message so you always
// knew how long to wait before she types. Restored here as a LIVE
// countdown in the header while Ana's real anti-ban typing delay
// runs — and ENTER during the countdown SKIPS it (engine
// skipTyping()), so you can make Ana type instantly if you like.
// ============================================================
let typing = null;          // { leadId, delayMs, startedAt }
let typingTimer = null;     // interval that refreshes the header countdown

// OWNER FOLLOW-UP GRACE — after an owner message Ana waits for a possible
// follow-up before replying (real owners often type 2-3 in a row). Header
// shows a live countdown; ENTER closes the window so Ana replies now.
// NOTE: windows are tracked PER-LEAD (concurrent leads can have overlapping
// windows — the engine keeps them in a Map keyed by leadId). The header
// renders the MOST RECENTLY started window; ENTER closes that one.
const graceWindows = new Map(); // leadId -> { leadId, graceMs, startedAt }
let grace = null;           // the currently RENDERED window (most recent)
let graceTimer = null;      // interval that refreshes the header countdown

function startTyping({ leadId, delayMs }) {
  typing = { leadId, delayMs, startedAt: Date.now() };
  if (typingTimer) clearInterval(typingTimer);
  typingTimer = setInterval(() => {
    renderHeader();
    screen.render();
  }, 200);
  renderHeader();
  screen.render();
}

function stopTyping() {
  typing = null;
  if (typingTimer) clearInterval(typingTimer);
  typingTimer = null;
  renderHeader();
  screen.render();
}

function renderHeader() {
  const snap = engine.getSnapshot();
  const base =
    ` ${chalk.bold('ANA MULTI-LEAD TEST')}   ·   ${chalk.cyan('OWNER')}=cyan ${chalk.magenta('ANA')}=magenta` +
    `   ·   leads ${chalk.bold(snap.rows.length)}   active ${chalk.green(snap.active)}` +
    `   ·   sends ${chalk.bold(snap.totalSends)}` +
    (statusMsg ? `   ${statusMsg}` : '');
  let extra = '';
  if (grace) {
    const elapsed = Date.now() - grace.startedAt;
    const remainMs = Math.max(0, grace.graceMs - elapsed);
    const secs = Math.ceil(remainMs / 1000);
    const tag = grace.leadId === selectedId ? '' : ` (${grace.leadId})`;
    extra += chalk.cyan(`   ⌨️ owner${tag} can add a follow-up — Ana replies in ${secs}s (ENTER = reply now)`);
  }
  if (typing) {
    const elapsed = Date.now() - typing.startedAt;
    const remainMs = Math.max(0, typing.delayMs - elapsed);
    const secs = Math.ceil(remainMs / 1000);
    const tag = typing.leadId === selectedId ? '' : ` (${typing.leadId})`;
    extra += chalk.magenta(`   💬 ANA${tag} types in ${secs}s — ENTER to skip`);
  }
  header.setContent(base + extra);
}

function pickMostRecentGrace() {
  let best = null;
  for (const w of graceWindows.values()) {
    if (!best || w.startedAt > best.startedAt) best = w;
  }
  return best;
}

function startGrace({ leadId, graceMs }) {
  graceWindows.set(leadId, { leadId, graceMs, startedAt: Date.now() });
  grace = pickMostRecentGrace();
  if (graceTimer) clearInterval(graceTimer);
  graceTimer = setInterval(() => {
    renderHeader();
    screen.render();
  }, 200);
  renderHeader();
  screen.render();
}

function stopGrace(leadId) {
  // Called from owner-grace-end (engine) AND the ENTER handler — idempotent.
  if (leadId) graceWindows.delete(String(leadId));
  // Re-pick: if another lead's window is still open, keep showing it.
  const next = pickMostRecentGrace();
  if (next) {
    grace = next;
    if (!graceTimer) {
      graceTimer = setInterval(() => {
        renderHeader();
        screen.render();
      }, 200);
    }
  } else {
    grace = null;
    if (graceTimer) clearInterval(graceTimer);
    graceTimer = null;
  }
  renderHeader();
  screen.render();
}

function renderLeads() {
  const snap = engine.getSnapshot();
  positionToId = snap.rows.map(r => r.leadId);
  // Clamp the ↑/↓ cursor into the current list (rows can close/shift).
  if (listCursor >= snap.rows.length) listCursor = Math.max(0, snap.rows.length - 1);
  const lines = snap.rows.map((r, i) => {
    const label = leadLabel(r, i);
    // The ↑/↓ cursor row is inverted; the ▶ marker still shows the active chat.
    return i === listCursor ? chalk.inverse(label) : label;
  });
  leadPanel.setContent(lines.join('\n'));
  // Keep the cursor row visible (scroll the left panel if needed).
  leadPanel.scrollTo(Math.max(0, listCursor - 3));
  renderHeader();
  screen.render();
}

// CUSTOM INPUT BUFFER — appended by the single keypress listener, rendered
// by renderInput() into the inputLine box (see the KEYBOARD section).
let inputBuffer = '';

function renderInput() {
  const label = mode === 'LIST'
    ? ' Select lead (or ENTER = force next): '
    : ` Owner reply (${selectedId}) — numbers are replies (↑↓+SPACE = switch): `;
  // Defense-in-depth: blessed parseContent does not strip \x0d (see the
  // keypress listener's printable-char note). Never let a control char
  // reach the rendered line — it would corrupt the TUI.
  const shownRaw = inputBuffer.length > 60 ? '…' + inputBuffer.slice(-60) : inputBuffer;
  const shown = shownRaw.replace(/[\x00-\x1f\x7f]/g, '');
  inputLine.setContent(label + shown + '▌');
  screen.render();
}

function scrollConvBottom() {
  convPanel.scrollTo(convPanel.getScrollHeight());
}

function appendToConv(leadId, role, text) {
  const t = getTranscript(leadId);
  const who = role === 'owner' ? chalk.cyan(`OWNER (${leadId})`)
    : role === 'debug' ? chalk.gray('▸ ')
    : role === 'system' ? chalk.gray('· ')
    : chalk.magenta(`ANA (${leadId})`);
  t.push(`${who}${role === 'debug' || role === 'system' ? '' : ': '}${text}`);
  if (t.length > 600) t.splice(0, t.length - 600);
  if (leadId === selectedId) {
    convPanel.add(`${who}${role === 'debug' || role === 'system' ? '' : ': '}${text}`);
    scrollConvBottom();
  }
}

function appendDebug(leadId, line) {
  // Long diagnostics (the [MEMORY] JSON dump, [MISSING FIELDS] lists) are
  // single lines that would clip at the panel edge. Split them at ~80 chars
  // so the whole payload is readable in the chat — the debug info you use
  // to spot extraction bugs at a glance.
  const MAX_DEBUG_CHARS = 80;
  if (line.length <= MAX_DEBUG_CHARS) {
    appendToConv(leadId, 'debug', line);
    return;
  }
  // Break on spaces (fall back to hard cut for unbroken runs like JSON keys).
  let rest = line;
  while (rest.length > MAX_DEBUG_CHARS) {
    let cut = rest.lastIndexOf(' ', MAX_DEBUG_CHARS);
    if (cut < MAX_DEBUG_CHARS * 0.5) cut = MAX_DEBUG_CHARS; // unbroken token
    appendToConv(leadId, 'debug', rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) appendToConv(leadId, 'debug', rest);
}

// ============================================================
// Engine event wiring → live TUI updates
// ============================================================
engine.on('owner-message', ({ leadId, text }) => {
  appendToConv(leadId, 'owner', text);
  renderLeads();
});

engine.on('ana-message', ({ leadId, text }) => {
  appendToConv(leadId, 'ana', text);
  // Backstop: _send always emits ana-message right after the typing sleep, so
  // if typing-end is ever missed (sleep rejection, early return) the countdown
  // still clears here instead of sticking at "types in 0s" forever.
  stopTyping();
  renderLeads();
});

// PROCESSING TAG: the pipeline (service.js → handlers → extractor) writes
// its [PHASE]/[MEMORY]/[MISSING FIELDS]/[EXTRACTION] diagnostics via
// console.log. Those must land as dim lines INSIDE the right lead's chat —
// and with the follow-up grace window the reply is generated asynchronously
// (up to ownerGraceMs later), long after sendOwnerReply() has returned. The
// engine emits processing-start/end with the leadId so the captured lines
// are attributed correctly instead of being swallowed into the hidden
// syslog (the "I'm blind" bug: without these, you can't see what Ana
// collects, misses, or misreads).
engine.on('processing-start', ({ leadId }) => {
  currentDebugLead = leadId;
});

engine.on('processing-end', () => {
  currentDebugLead = null;
});

// Owner-follow-up grace window: shown when Ana is waiting for a possible
// follow-up message before replying (real owners often send 2-3 in a row).
engine.on('owner-grace-start', ({ leadId, graceMs }) => {
  startGrace({ leadId, graceMs });
});

engine.on('owner-grace-end', ({ leadId }) => {
  stopGrace(leadId);
});

// Ana's real anti-ban typing delay → live "ANA types in Ns" countdown in
// the header (restored from the old campaign sim's "💬 Thinking delay").
// ENTER while it runs = skip (engine.skipTyping()).
engine.on('typing-start', ({ leadId, delayMs }) => {
  startTyping({ leadId, delayMs });
});

engine.on('typing-end', () => {
  stopTyping();
});

engine.on('greeting', ({ leadId }) => {
  renderLeads();
});

engine.on('followup', ({ leadId }) => {
  appendToConv(leadId, 'ana', '(follow-up sent)');
  renderLeads();
});

engine.on('closed', ({ leadId, outcome }) => {
  appendToConv(leadId, 'system', `[conversation closed — ${outcome}]`);
  // Affordance: the remaining leads sit behind the 10-min idle gate — a
  // bare ENTER (forceNext) starts the next one immediately. Shown only
  // when something is actually pending.
  if (engine.pendingGreetings.length > 0) {
    appendToConv(leadId, 'system', '[ENTER = start the next lead now]');
  }
  renderLeads();
});

engine.on('escalated', ({ leadId, reason }) => {
  appendToConv(leadId, 'system', `[escalated to human — ${reason}]`);
  renderLeads();
});

engine.on('error', ({ message }) => {
  const id = currentDebugLead || selectedId;
  if (id) appendToConv(id, 'system', `[⚠️ engine error: ${message}]`);
  renderLeads();
});

engine.on('status', renderLeads);

// ============================================================
// Keyboard handling — ONE enter path (textbox submit), no global
// enter key, so a reply is never sent twice and forceNext never
// double-fires.
// ============================================================
function quit() {
  engine.stop();
  if (typingTimer) clearInterval(typingTimer);   // free the countdown intervals
  typingTimer = null;
  if (graceTimer) clearInterval(graceTimer);
  graceTimer = null;
  graceWindows.clear();
  try { screen.destroy(); } catch {}
  process.exit(0);
}

function showLead(id) {
  selectedId = id;
  mode = 'CHAT';
  // The ↑/↓ highlight follows the lead being viewed (so SPACE feels
  // natural when you come back to a chat).
  const idx = positionToId.indexOf(id);
  if (idx >= 0) listCursor = idx;
  convPanel.setContent(getTranscript(id).join('\n'));
  convPanel.setLabel(` Conversation — ${id} (scraper id)`);
  scrollConvBottom();
  inputBuffer = '';
  renderLeads();
  renderInput();
}

/**
 * Select a lead by list position. If the chosen lead has NOT been greeted
 * yet (inactive), start its greeting NOW (operator override — same bypass
 * as ENTER-forceNext). If it's already active, just view/continue it —
 * its conversation state is preserved, so replies resume the chat.
 */
async function selectLead(pos) {
  const id = positionToId[Number(pos) - 1];
  if (!id) {
    setStatus(`❌ no lead #${pos} — pick 1-${positionToId.length}`);
    return;
  }
  const row = engine.getSnapshot().rows.find(r => r.leadId === id);
  // Greet ONLY leads that have an actually-staged greeting (never-sent).
  // Source of truth is pendingGreeting, not the firstMessageSentAt
  // timestamp (row.greeted) — a FINISHED (closed) lead must simply re-open
  // its transcript, never re-attempt a greeting. Reported: "I can't go back
  // and see the content of the first lead; when I press on it it tries to
  // start like a new lead" — a closed lead has greeted=true, but the
  // pendingGreeting check makes the re-open path immune to any timestamp
  // quirk and impossible to mis-fire into a greet attempt. The `!row.greeted`
  // half is belt-and-suspenders: if a greeting's _send ever throws AFTER
  // markGreetingSent() (e.g. a TUI rendering error in the ana-message
  // listener), pendingGreeting would be stuck true on an already-greeted
  // lead — without this, select would double-send the greeting.
  if (row && row.pendingGreeting && !row.greeted) {
    setStatus(`⏩ greeting ${id}…`);
    const greeted = await engine.greetLead(id);
    if (greeted) setStatus(`⏩ greeted ${id} now (bypass)`);
  }
  showLead(id);
  screen.render();
}

/** Send a text as the OWNER's reply to a lead (routes through the real
 * pipeline; pipeline logs land as dim lines in that lead's chat). */
async function sendOwnerReply(id, value) {
  inputBuffer = '';
  currentDebugLead = id;
  let result;
  try {
    result = await engine.onOwnerMessage(id, value);
  } finally {
    currentDebugLead = null;
  }
  if (result && result.type === 'ERROR') {
    appendToConv(id, 'system', `[⚠️ ${result.text}]`);
  }
  if (result && result.type === 'IGNORED') {
    appendToConv(id, 'system', '[conversation not active]');
  }
  screen.render();
}

/** Move the ↑/↓ list highlight (clamped). Works in BOTH modes. */
function moveCursor(delta) {
  if (positionToId.length === 0) return;
  listCursor = Math.min(positionToId.length - 1, Math.max(0, listCursor + delta));
  renderLeads();
}

/**
 * Activate the highlighted lead (SPACE on empty input). Same semantics as
 * typing its number + ENTER: a not-started lead gets its greeting started
 * NOW (operator override), an active one just resumes its chat.
 */
async function activateCursorLead() {
  if (positionToId.length === 0) return;
  await selectLead(listCursor + 1);
}

async function handleCommand(value) {
  if (mode === 'LIST') {
    if (/^\d+$/.test(value)) {
      await selectLead(parseInt(value, 10));
    } else if (value === '') {
      // ENTER empty in LIST mode → force the next lead's greeting
      setStatus('⏩ force next lead…');
      const id = await engine.forceNext();
      if (id) {
        // Jump into the new lead's conversation, THEN show the confirmation.
        showLead(id);
        setStatus(`⏩ greeted ${id} now (bypass)`);
      } else {
        setStatus('(no pending leads)');
        renderLeads();
      }
      screen.render();
    } else {
      setStatus('❌ enter a lead number (e.g. 1) or ENTER for force-next');
      screen.render();
    }
    return;
  }

  // CHAT mode
  if (value === '') {
    setStatus('⏩ force next lead…');
    const id = await engine.forceNext();
    if (id) {
      showLead(id);
      setStatus(`⏩ greeted ${id} now (bypass)`);
    } else {
      setStatus('(no pending leads)');
      renderLeads();
    }
    screen.render();
    return;
  }

  // PURE NUMBER → send it as the OWNER's reply to the selected lead.
  // Reported (live TUI): typing "3" as the answer to "Колку спални соби
  // има станот?" OPENED lead 3 — the old CHAT-mode number-switch swallowed
  // it. Nearly every data-collection answer is numeric (bedrooms, price,
  // sqm, floor...), so bare numbers in a chat MUST be replies. Lead
  // switching is still one keystroke away: ↑/↓ + SPACE activates the
  // highlighted lead from ANY mode, and Ctrl+L → <number> switches from
  // the list.
  if (/^\d+$/.test(value)) {
    await sendOwnerReply(selectedId, value);
    return;
  }

  // #N → legacy alias (kept for muscle memory): strip the # and send N —
  // identical to typing the bare number now. Never collides with the
  // bare-number branch above (starts with #). A lone "#" falls through.
  if (/^#\d+$/.test(value)) {
    await sendOwnerReply(selectedId, value.slice(1));
    return;
  }

  // Anything else → send as the OWNER's reply to the selected lead.
  await sendOwnerReply(selectedId, value);
}

function submitInput() {
  const value = inputBuffer.trim();
  inputBuffer = '';
  renderInput();
  handleCommand(value);
}

/** Back to the lead selector (Ctrl+L). */
function toList() {
  mode = 'LIST';
  selectedId = null;
  inputBuffer = '';
  convPanel.setContent('');
  convPanel.setLabel(' Conversation ');
  renderLeads();
  renderInput();
}

// ============================================================
// KEYBOARD — ONE program-level keypress listener.
// Deliberately NOT blessed's textbox/inputOnFocus widgets: their
// readInput() machinery re-attaches keypress listeners on every
// focus/rewind cycle, which doubled typed characters once the TUI
// had been running a while ("ima" → "iimmaa", "3" → "33", whole
// sentences ×2/×4). Here ALL keys flow through this single
// listener into a plain buffer — no focus(), no grabKeys, no
// readInput — so the doubling bug class is structurally
// impossible. Unicode (incl. Macedonian Cyrillic) arrives via the
// raw `ch` carried by each keypress event.
// ============================================================
screen.program.on('keypress', (ch, key) => {
  const name = key && key.name;

  // Global keys — always available, even mid-reply.
  if (key && key.ctrl && name === 'c') return quit();   // Ctrl+C
  if (name === 'escape') return quit();                 // Esc
  if (key && key.ctrl && name === 'l') return toList(); // Ctrl+L

  // ↑/↓ — move the lead-list highlight (browse from any mode). The list
  // cursor is independent of the input buffer, so it never interferes
  // with typing an owner reply.
  if (name === 'up') return moveCursor(-1);
  if (name === 'down') return moveCursor(1);

  // SPACE on an EMPTY input activates the highlighted lead (↑/↓ first).
  // With text in the buffer it is a normal space for typing a reply
  // ("IMA TERASA 5 M2"). This is the arrow-navigation you asked for:
  // ↑/↓ to pick, SPACE to open, no numbers needed, ENTER untouched.
  if (ch === ' ' && !key.ctrl && !key.meta) {
    if (inputBuffer === '') {
      activateCursorLead();
      return;
    }
    // else fall through — a space inside a reply being typed
  }

  if (name === 'enter') {
    // ENTER during Ana's typing countdown = SKIP the delay (Ana types now),
    // NOT a submit — so a reply typed while she "types" is never sent as
    // an owner message by accident.
    if (typing) {
      engine.skipTyping();
      stopTyping();
      setStatus('⏩ typing delay skipped — Ana types now');
      return;
    }
    // ENTER during the owner-follow-up grace window:
    //   • EMPTY buffer  → CLOSE the window now (Ana replies to what's sent).
    //   • non-empty    → submit the typed FOLLOW-UP as an owner message
    //                    (falls through to submitInput, which re-arms the
    //                    window via _armOwnerGrace) — real owners type 2-3
    //                    in a row and expect each Enter to SEND, not close.
    if (inputBuffer.trim() === '') {
      // Windows are tracked PER-LEAD and can overlap (concurrent chats each
      // get their own). Prefer the SELECTED lead's open window — ENTER must
      // act on the conversation you're viewing; fall back to the most-recent
      // window when the selected lead has none open. Capture the id BEFORE
      // the flush: flushOwnerReply synchronously emits owner-grace-end → the
      // handler stopGrace(leadId) nulls the global `grace` — dereferencing
      // grace.leadId afterwards would crash.
      const graceLeadId = (selectedId && graceWindows.has(String(selectedId)))
        ? String(selectedId)
        : (grace && grace.leadId);
      if (graceLeadId) {
        engine.flushOwnerReply(graceLeadId);
        stopGrace(graceLeadId);
        setStatus('⏩ follow-up window closed — Ana replies now');
        return;
      }
    }
    return submitInput();
  }
  if (name === 'backspace') {                           // ← delete last char
    inputBuffer = inputBuffer.slice(0, -1);
    renderInput();
    return;
  }
  if (key && key.ctrl && name === 'u') {                // Ctrl+U clear line
    inputBuffer = '';
    renderInput();
    return;
  }

  // 'q' quits ONLY from the lead list with an EMPTY input (a stray 'q'
  // after digits is a typo and should just append). While chatting, 'q'
  // is a letter — an owner reply may legitimately start with 'q'
  // (e.g. "qade e cenata?"). Esc / Ctrl+C quit from anywhere.
  if (mode === 'LIST' && ch === 'q' && !key.ctrl && inputBuffer === '') return quit();

  // Printable characters (incl. Cyrillic) — `ch` carries the raw char.
  // CRITICAL: blessed 0.1.81 double-emits Enter — once as key.name='enter'
  // (handled above) and once as ch='\r'/name='return'. Accepting the stray
  // '\r' here injects a raw carriage return into the input buffer, which
  // blessed's parseContent does NOT strip (its control-char regex gaps
  // \x0d) — it clobbers the input-line drawing and freezes the display
  // ("cannot type owner reply" bug). Only accept true printables: ch >= ' ',
  // and exclude the 'return' key by name.
  if (ch && ch >= ' ' && ch !== '\x7f' && !key.ctrl && !key.meta && name !== 'tab' && name !== 'return') {
    inputBuffer += ch;
    renderInput();
    return;
  }

  // Everything else (arrows, function keys, modifiers…) — ignored.
});

// Belt-and-suspenders: if a raw-mode terminal swallows C-c as a signal
// instead of delivering it to blessed, catch it here too.
process.on('SIGINT', () => quit());

// ============================================================
// Boot
// ============================================================
renderLeads();
renderInput();
engine.start();

// Auto-show the first lead's conversation so the greeting is visible
// immediately (matches the one-lead test look).
if (positionToId.length > 0) {
  showLead(positionToId[0]);
}

screen.render();

// Keep the process alive + surface engine errors. Restore the real
// console so the crash message reaches the user after screen teardown.
process.on('uncaughtException', (err) => {
  console.log = realLog;
  console.error = realError;
  try { screen.destroy(); } catch {}
  realError('\n💥 TUI crash:', err.message);
  realError(err.stack);
  process.exit(1);
});
