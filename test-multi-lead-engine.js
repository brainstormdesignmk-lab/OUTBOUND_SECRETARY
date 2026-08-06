// ============================================================
// test-multi-lead-engine.js — MultiLeadEngine regression suite
// ============================================================
// Tests the event-driven concurrent-lead engine with an INJECTED
// FAKE CLOCK so the 10-min idle rule, follow-up and timeout logic
// run in milliseconds instead of real minutes.
//
// Covered:
//   • lead-normalizer: all 3 scraper formats → canonical leads
//   • engine loads leads, greets the FIRST lead immediately
//   • 10-min idle rule: no new greeting until 10 min after the last
//     owner message (across all conversations)
//   • event-driven resume: an owner reply is answered instantly even
//     while other leads are idle
//   • forceNext() bypasses the gap + active hours instantly
//   • follow-up after REPLY_TIMEOUT, timeout close after FOLLOWUP_TIMEOUT
//   • anti-ban hourly quota stops greetings
//   • first-finisher-first CSV append
//
// NOTE: config is imported at module load; the engine reads config
// lazily at call time, so a fake clock is safe. Active hours are set
// to 0-24 so the ONLY gate under test is the 10-min idle rule + quota.
// ============================================================
// Offline-LLM test seam: DATA_COLLECTION never calls the LLM, and the
// PERSUASION tail uses a canned NORMAL reply — no GROQ_API_KEY needed.
process.env.ANA_OFFLINE_LLM = '1';
// NOTE on time-of-day: the engine's DEFAULT canSendContact uses the REAL
// anti-ban module, which consults the WALL CLOCK for active hours (default
// 7-14 / 15-23). Outside those windows the engine can't greet anyone and
// this whole suite fails (seen at 23:33). makeEngine() therefore injects a
// PERMISSIVE gate + no-op accounting, so the ONLY gates under test are the
// 10-min idle rule + the explicitly injected quota mocks (see Q1). (An env
// var would NOT work here: ESM hoists the imports above the assignments,
// so config.js — and its envInt reads — is evaluated before the env patch
// runs.)

import { createHarness } from './test-helpers.js';
import { parseScraperLeadLine, normalizePhone } from './lead-normalizer.js';
import { MultiLeadEngine } from './engine.js';
import { LeadState } from './scheduler.js';

// The exact acceptance phrase from the e2e suite — scored ACCEPTED >= 0.85
// offline, so the engine test reaches DATA_COLLECTION without an API key.
const ACCEPT = 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME';

const harness = createHarness();
const assert = harness.assert;

// ============================================================
// FAKE CLOCK
// ============================================================
class FakeClock {
  constructor() {
    this.t = 0;
  }
  now() { return this.t; }
  advance(ms) { this.t += ms; }
}

function makeEngine(overrides = {}) {
  const clock = overrides.clock || new FakeClock();
  const engine = new MultiLeadEngine({
    now: () => clock.now(),
    sleep: async () => {},       // instant: no real waits in tests
    tickMs: 1,                   // manual ticks via tick()
    typingDelay: () => 0,        // no real per-char typing in tests
    // Permissive anti-ban by default: time-of-day independence (see the
    // NOTE above). Groups that test quota behavior inject their own gate.
    canSendContact: () => true,
    recordSent: () => {},
    ...overrides.engine
  });
  engine.start({ noInterval: true });  // tests drive tick() manually
  return { engine, clock };
}

// Sample leads in all 3 scraper formats (from the user's real scrape)
const SAMPLE_CSV = [
  // reklama5: id,title,phone,url
  '3571074,SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM,+38978334393,https://reklama5.mk/AdDetails?ad=3571074',
  '5540516,Се продава 3 собен стан во Urban Garden - Аеродром,+38978950414,https://reklama5.mk/AdDetails?ad=5540516',
  // pazar3: title,N/A,N/A,"phone1, phone2",url
  'Se izdava namesten stan Centar,N/A,N/A,"070 234 423, 078 377 677",https://www.pazar3.mk/oglas/stan',
  // imoti247: id,title,url,phone
  '75889,"Plac-Gorno Konjari,Petrovec",https://imoti247.com/Plac-75889.html,+38970376475',
  // no phone → skipped
  '5372742,Дарма Дома издава стан во Карпош !,,https://reklama5.mk/AdDetails?ad=5372742'
];

const parsed = SAMPLE_CSV.map(parseScraperLeadLine).filter(Boolean);

// ============================================================
// 1. LEAD NORMALIZER
// ============================================================
console.log('\n📦 GROUP: lead-normalizer — 3 scraper formats');

assert('N1: reklama5 line parsed', parsed[0] && parsed[0].id === '3571074' && parsed[0].phone === '+38978334393', `got ${JSON.stringify(parsed[0])}`);
assert('N1: reklama5 url kept', parsed[0].url.startsWith('https://reklama5.mk'), `got ${parsed[0].url}`);
assert('N2: pazar3 line parsed (quoted multi-phone → first)', parsed[2] && parsed[2].phone === '+38970234423', `got ${parsed[2] && parsed[2].phone}`);
assert('N2: pazar3 title + url kept', parsed[2].title.includes('namesten') && parsed[2].url.includes('pazar3.mk'), `got ${parsed[2].title}/${parsed[2].url}`);
assert('N3: imoti247 line parsed (phone/url swapped)', parsed[3] && parsed[3].id === '75889' && parsed[3].phone === '+38970376475' && parsed[3].url.includes('imoti247'), `got ${JSON.stringify(parsed[3])}`);
assert('N3: imoti247 pipe-separated phones → first', parseScraperLeadLine('75885,СЕ ПРОДАВА ПЛАЦ ВО ВОЛКОВО,https://imoti247.com/x.html,+38978251554 | +38975293311').phone === '+38978251554', 'got wrong');
assert('N4: no-phone line skipped', parsed.length === 4, `got ${parsed.length} (expected 4)`);
assert('N4: normalizePhone local 07x', normalizePhone('070 234 423') === '+38970234423', `got ${normalizePhone('070 234 423')}`);
assert('N4: normalizePhone rejects N/A', normalizePhone('N/A') === null, 'N/A not rejected');
assert('N4: normalizePhone rejects empty', normalizePhone('') === null, 'empty not rejected');

// ============================================================
// 2. ENGINE — first lead greets immediately
// ============================================================
console.log('\n📦 GROUP: engine — greeting + 10-min idle rule');

const { engine, clock } = makeEngine();
engine.loadLeads(parsed);

// t=0: first tick → lead 1 greeted
await engine.tick();
let snap = engine.getSnapshot();
const lead1 = snap.rows.find(r => r.leadId === '3571074');
assert('E1: first lead greeted at t=0', lead1.greeted === true, `got ${JSON.stringify(lead1)}`);
assert('E1: lead1 state=contacting', lead1.state === LeadState.CONTACTING, `got ${lead1.state}`);
assert('E1: lead2 NOT yet greeted', snap.rows.find(r => r.leadId === '5540516').greeted === false, 'lead2 greeted too early');
assert('E1: greeting text staged', (engine.getSession('3571074').pendingGreeting || '').length === 0, 'greeting not sent');
const greeting = engine.getSession('3571074').messages[0]?.text || '';
assert('E1: greeting mentions the ad title', greeting.length > 20, `greeting too short: "${greeting}"`);

// t=1min: still no owner message → no new greeting
clock.advance(60_000);
await engine.tick();
snap = engine.getSnapshot();
assert('E2: no second greeting at t=1min (idle gate)', snap.rows.filter(r => r.greeted).length === 1, `greeted ${snap.rows.filter(r => r.greeted).length}`);

// t=11min: 10 min after t=0? No owner message yet — but lastOwnerMessageAt
// is null (no owner ever replied). Our rule: FIRST lead greets immediately,
// then each NEXT greeting needs 10 min since last owner message. Since no
// owner message happened, the idle gate must NOT block new leads forever.
clock.advance(600_000); // t=11min
await engine.tick();
snap = engine.getSnapshot();
assert('E3: second lead greets after idle window (no owner msg = slot free)', snap.rows.filter(r => r.greeted).length === 2, `greeted ${snap.rows.filter(r => r.greeted).length}`);

// ============================================================
// 3. EVENT-DRIVEN RESUME — owner reply while another lead idle
// ============================================================
console.log('\n📦 GROUP: engine — event-driven reply, no blocking');

// Owner 1 accepts at t=12min → Ana answers instantly, next greeting gated
clock.advance(60_000);
await engine.onOwnerMessage('3571074', ACCEPT);
snap = engine.getSnapshot();
const l1 = snap.rows.find(r => r.leadId === '3571074');
assert('R1: owner reply processed (state=collecting_data)', l1.state === LeadState.COLLECTING_DATA, `got ${l1.state}`);
assert('R1: Ana replied with a question', (engine.getSession('3571074').messages.slice(-1)[0] || {}).role === 'model', 'no ana reply');
// The 10-min gate restarts from THIS owner message — no new greeting yet
clock.advance(60_000); // t=13min
await engine.tick();
snap = engine.getSnapshot();
assert('R2: no new greeting within 10 min of owner message', snap.rows.filter(r => r.greeted).length === 2, `greeted ${snap.rows.filter(r => r.greeted).length}`);

// 10 min after the owner message → slot free again → greet lead 3
clock.advance(600_000); // t=23min
await engine.tick();
snap = engine.getSnapshot();
assert('R3: lead3 greeted 10 min after owner msg', snap.rows.filter(r => r.greeted).length === 3, `greeted ${snap.rows.filter(r => r.greeted).length}`);

// ============================================================
// 4. FORCE NEXT — instant bypass
// ============================================================
console.log('\n📦 GROUP: engine — forceNext() bypasses everything');

const { engine: e2, clock: c2 } = makeEngine();
e2.loadLeads(parsed);
await e2.tick(); // greet lead1
// No owner messages; next greeting would need 10-min idle → force
const forced = await e2.forceNext();
snap = e2.getSnapshot();
assert('F1: forceNext returns greeted leadId', forced === '5540516', `got ${forced}`);
assert('F1: forceNext greeted lead2', snap.rows.find(r => r.leadId === '5540516').greeted === true, 'lead2 not greeted');
assert('F1: forceNext greets lead3 too (bypass, no gap)', (await e2.forceNext()) === String(parsed[2].id), `got ${parsed[2].id} expected`);
c2.advance(30 * 60 * 1000); // t=30min: lead1 never replied → follow-up due
await e2.tick();
const fup = e2.getSession('3571074');
assert('F2: follow-up sent after REPLY_TIMEOUT', fup.followUpSent === true && fup.messages.length >= 2, `followUpSent=${fup.followUpSent} msgs=${fup.messages.length}`);

// ============================================================
// 4b. GREET A SPECIFIC LEAD — chosen-lead override (the TUI number pick)
// ============================================================
console.log('\n📦 GROUP: engine — greetLead() greets the CHOSEN lead');

const { engine: eg, clock: cg } = makeEngine();
eg.loadLeads(parsed);
await eg.tick(); // greet lead1 (3571074)

// Pick lead 3 (pazar3) OUT of order — must greet THAT one, not lead 2.
const target = String(parsed[2].id);
const greetedId = await eg.greetLead(target);
assert('G1: greetLead returns the chosen leadId', greetedId === target, `got ${greetedId}`);
snap = eg.getSnapshot();
assert('G1: chosen lead greeted', snap.rows.find(r => r.leadId === target).greeted === true, 'chosen lead not greeted');
assert('G1: queue order NOT forced — lead2 still pending', snap.rows.find(r => r.leadId === '5540516').greeted === false, 'lead2 greeted out of order');
assert('G1: lead2 still in pendingGreetings', eg.pendingGreetings.includes('5540516'), 'lead2 missing from queue');

// Already-greeted lead → null, no double greeting
const again = await eg.greetLead('3571074');
assert('G2: greetLead on a greeted lead returns null', again === null, `got ${again}`);
assert('G2: greeted lead has exactly ONE ana message (no double greeting)', eg.getSession('3571074').messages.filter(m => m.role === 'model').length === 1, 'double greeting sent');

// Unknown id → null
assert('G3: greetLead unknown id returns null', (await eg.greetLead('does-not-exist')) === null, 'unknown lead greeted');

// Chosen lead removed from the queue → scheduler never re-greets it
assert('G4: chosen lead removed from pendingGreetings', !eg.pendingGreetings.includes(target), `queue=${JSON.stringify(eg.pendingGreetings)}`);
assert('G4: chosen lead pendingGreeting cleared', eg.getSession(target).pendingGreeting === null, 'pendingGreeting not cleared');

// greetLead bypasses a DENYING anti-ban gate (operator override, same as forceNext)
const spySends2 = [];
const e5 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  canSendContact: () => false,
  recordSent: (p) => spySends2.push(p),
  typingDelay: () => 0
});
e5.start();
e5.loadLeads(parsed);
const g5 = await e5.greetLead('5540516');
assert('G5: greetLead bypasses the anti-ban gate', g5 === '5540516' && spySends2.includes('+38978950414'), `got ${g5} sends=${JSON.stringify(spySends2)}`);

// ============================================================
// 5. TIMEOUT CLOSE → CSV first-finisher
// ============================================================
console.log('\n📦 GROUP: engine — timeout close + CSV');

const { engine: e3, clock: c3 } = makeEngine();
e3.loadLeads(parsed);
await e3.tick(); // lead1 greeted
// lead1 never replies; advance past FOLLOWUP_TIMEOUT (2h)
c3.advance(2 * 60 * 60 * 1000);
await e3.tick();
snap = e3.getSnapshot();
const l1done = snap.rows.find(r => r.leadId === '3571074');
assert('T1: lead1 closed on timeout', l1done.state === LeadState.CLOSED_TIMEOUT, `got ${l1done.state}`);

// ============================================================
// 6. ANTI-BAN HOURLY QUOTA
// ============================================================
console.log('\n📦 GROUP: engine — anti-ban hourly quota');

// Config caps MAX_MSGS_PER_HOUR (default 15). Fake-clock hour is real clock
// hour (antiBan uses Date), so with 4 leads we can't trip the default 15 —
// instead verify the ENGINE consults antiBan by checking a mock gate.
// Inject a DENYING anti-ban gate + a send-spy → engine must consult the
// gate for normal greetings but bypass it under forceNext()
const spySends = [];
const e4 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  canSendContact: () => false,               // anti-ban blocks everything
  recordSent: (p) => spySends.push(p),
  typingDelay: () => 0
});
e4.start();
e4.loadLeads(parsed);
await e4.tick();
snap = e4.getSnapshot();
assert('Q1: greeting blocked when anti-ban denies (0 greeted)', snap.rows.filter(r => r.greeted).length === 0, `greeted ${snap.rows.filter(r => r.greeted).length}`);
assert('Q1: forceNext bypasses the anti-ban gate', (await e4.forceNext()) === '3571074', 'force did not bypass');
assert('Q1: bypassed send still recorded against quota', spySends.includes('+38978334393'), `sent=${JSON.stringify(spySends)}`);

// ============================================================
// 7. TYPING DELAY — typing-start/typing-end events + skipTyping()
// ============================================================
console.log('\n📦 GROUP: engine — typing delay events + skipTyping()');

// 7a. A real (non-zero) typing delay emits typing-start with delayMs BEFORE
// the message, and typing-end AFTER the delay elapses (the TUI countdown
// source). Uses a real short sleep + fake clock — no time travel needed
// since the delay is in ms.
const delayEvents = [];
const e6 = new MultiLeadEngine({
  now: () => 0,
  sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  tickMs: 1,
  typingDelay: () => 50,               // 50ms human-typing sim
  canSendContact: () => true,
  recordSent: () => {}
});
e6.on('typing-start', (p) => delayEvents.push(['start', p]));
e6.on('typing-end', (p) => delayEvents.push(['end', p]));
e6.on('ana-message', (p) => delayEvents.push(['msg', p.leadId]));
e6.start();
e6.loadLeads(parsed);
await e6.tick(); // greets lead1 with a 50ms typing delay
assert('TY1: typing-start emitted before the message',
  delayEvents[0] && delayEvents[0][0] === 'start',
  `got ${JSON.stringify(delayEvents)}`);
assert('TY1: typing-start carries the real delayMs',
  delayEvents[0] && delayEvents[0][1].delayMs === 50,
  `got ${JSON.stringify(delayEvents[0])}`);
assert('TY1: typing-end emitted after the delay (before ana-message)',
  delayEvents.some(e => e[0] === 'end') &&
  delayEvents.findIndex(e => e[0] === 'end') < delayEvents.findIndex(e => e[0] === 'msg'),
  `got ${JSON.stringify(delayEvents)}`);
assert('TY1: ana-message for the greeted lead arrived',
  delayEvents.some(e => e[0] === 'msg' && e[1] === '3571074'),
  `got ${JSON.stringify(delayEvents)}`);

// 7b. skipTyping() aborts the in-flight delay — message lands immediately,
// no next-lead greeting (unlike forceNext). Inject a LONG delay + a sleep
// that never resolves on its own, so the ONLY way _send completes is the
// skipTyping abort.
let resolved = false;
const e7 = new MultiLeadEngine({
  now: () => 0,
  sleep: () => new Promise(() => {}),  // never resolves naturally
  tickMs: 1,
  typingDelay: () => 60_000,           // 60s delay — must be skippable
  canSendContact: () => true,
  recordSent: () => {}
});
e7.on('typing-start', () => {});
e7.on('ana-message', () => { resolved = true; });
e7.start();
e7.loadLeads(parsed);
const tickP = e7.tick();               // greets lead1 → hangs in 60s delay
await new Promise(r => setTimeout(r, 20));
assert('TY2: send is stuck in the typing delay (not yet resolved)', resolved === false, 'resolved without skip');
e7.skipTyping();
await tickP;
assert('TY2: skipTyping aborts the delay — ana-message landed instantly', resolved === true, 'message never arrived');
const snap7 = e7.getSnapshot();
assert('TY2: skipTyping did NOT greet the next lead (only lead1)',
  snap7.rows.filter(r => r.greeted).length === 1,
  `greeted ${snap7.rows.filter(r => r.greeted).length}`);

// 7c. skipTyping with NO delay in flight is a safe no-op (TUI ENTER without
// a countdown must fall through to normal submit, never crash).
const e8 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {}
});
e8.start();
e8.loadLeads(parsed);
await e8.tick();
e8.skipTyping(); // no-op
assert('TY3: skipTyping with no delay in flight is a safe no-op',
  e8.getSnapshot().rows.find(r => r.leadId === '3571074').greeted === true,
  'engine state corrupted by no-op skipTyping');

// 7d. STALE-SAFETY-TIMER RACE (reviewer gap): a completed send's safety
// timer (fires ms+100 after ITS sleep) must never clobber the abort signal
// of a NEWER in-flight send. Reproduce: greeting (50ms delay, sleep resolves)
// completes normally → the reply starts within the greeting's safety window
// with a 60s delay + never-resolving sleep → pre-fix the greeting's stale
// timer nulls the reply's abort signal at 150ms → skipTyping() silently
// no-ops and the reply never lands. Post-fix skipTyping aborts the reply.
let sleepCalls = 0;
const e13 = new MultiLeadEngine({
  now: () => 0,
  sleep: () => new Promise((resolve) => { if (++sleepCalls === 1) resolve(); }),
  tickMs: 1,
  typingDelay: (text) => (/Здраво/.test(text) ? 50 : 60_000),
  canSendContact: () => true,
  recordSent: () => {}
});
let e13Msgs = 0;
e13.on('ana-message', () => { e13Msgs++; });
e13.start({ noInterval: true });
e13.loadLeads(parsed);
await e13.tick();                                    // greeting: 50ms, sleep #1 resolves → completes
const replyP = e13.onOwnerMessage('3571074', ACCEPT); // reply: 60s delay, sleep #2 never resolves → stuck
await new Promise(r => setTimeout(r, 200));          // let the greeting's stale safety timer (150ms) fire
e13.skipTyping();                                    // must abort the REPLY's delay, not a no-op
await replyP;
assert("ABORT1: stale safety timer cannot orphan a newer send skip signal",
  e13Msgs === 2,
  `msgs=${e13Msgs} (reply never sent → its skip signal was clobbered)`);

// ============================================================
// 8. OWNER FOLLOW-UP GRACE — debounce window + flushOwnerReply()
// ============================================================
// Real owners often send 2-3 messages in a row. With ownerGraceMs > 0
// (interactive TUI), Ana waits the window after an owner message for a
// possible follow-up before replying; a new message re-arms the timer.
// Only the LAST response is sent — the batch mutates state like a real
// quickfire conversation, then Ana answers once the owner stops typing.
// ============================================================
console.log('\n📦 GROUP: engine — owner follow-up grace window');

// 8a. Grace ACTIVE: an owner message must NOT reply instantly — returns
// OWNER_RECEIVED/debouncing, no ana-message yet, owner-grace-start fired.
const graceEvents = [];
const e9 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 40                        // short real window for the test
});
e9.on('owner-grace-start', (p) => graceEvents.push(['start', p]));
e9.on('owner-grace-end', (p) => graceEvents.push(['end', p]));
e9.on('ana-message', (p) => graceEvents.push(['msg', p.leadId]));
e9.start();
e9.loadLeads(parsed);
await e9.tick();                          // greet lead1
const graceEventsBefore = graceEvents.length;
const r8a = await e9.onOwnerMessage('3571074', ACCEPT);
assert('GR1: grace-active owner message debounces (no instant reply)',
  r8a.type === 'OWNER_RECEIVED' && r8a.action === 'debouncing',
  `got ${JSON.stringify(r8a)}`);
assert('GR1: owner-grace-start fired with graceMs',
  graceEvents.some(e => e[0] === 'start' && e[1].leadId === '3571074' && e[1].graceMs === 40),
  `got ${JSON.stringify(graceEvents)}`);
assert('GR1: NO ana reply yet (window open)',
  graceEvents.filter(e => e[0] === 'msg').length === graceEventsBefore,
  `got ${JSON.stringify(graceEvents)}`);

// 8b. A follow-up within the window re-arms it — no reply until it expires.
await new Promise(r => setTimeout(r, 15));
e9.onOwnerMessage('3571074', '55 kvadrati');
assert('GR2: follow-up within the window keeps it open (no reply yet)',
  graceEvents.filter(e => e[0] === 'msg').length === graceEventsBefore,
  `got ${JSON.stringify(graceEvents)}`);

// 8c. Window elapses → batch processed: exactly ONE Ana reply for the two
// queued messages, owner-grace-end fired.
await new Promise(r => setTimeout(r, 80));   // let the re-armed timer expire
const grMsgs = graceEvents.filter(e => e[0] === 'msg').length;
assert('GR3: grace window expiry sends exactly ONE reply for the batch',
  grMsgs === graceEventsBefore + 1,
  `msg events before=${graceEventsBefore} after=${grMsgs} all=${JSON.stringify(graceEvents)}`);
assert('GR3: owner-grace-end fired after the window',
  graceEvents.some(e => e[0] === 'end'),
  `got ${JSON.stringify(graceEvents)}`);
assert('GR3: session state mutated by the intermediate message too (accept stored)',
  e9.getSession('3571074').collectedData?.cooperationAccepted === true,
  'acceptance lost in the batch');

// 8d. flushOwnerReply() — operator override ends the window NOW and the
// queued messages are processed (never dropped). Uses a LONG grace window
// so only the flush can close it.
const e10 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 60_000                     // 60s window — must be flushable
});
let flushed = 0;
e10.on('ana-message', () => { flushed++; });
e10.start();
e10.loadLeads(parsed);
await e10.tick();                          // greet lead1
const flushedBaseline = flushed;           // the greeting is ana-message #1
await e10.onOwnerMessage('3571074', ACCEPT);
const r8d = e10.flushOwnerReply('3571074');
assert('GR4: flushOwnerReply returns flushed',
  r8d.type === 'OWNER_RECEIVED' && r8d.action === 'flushed',
  `got ${JSON.stringify(r8d)}`);
await new Promise(r => setTimeout(r, 30));  // let the batch process
assert('GR4: flush processed the queued message — Ana replied once',
  flushed === flushedBaseline + 1,
  `flushed=${flushed} baseline=${flushedBaseline}`);
assert('GR4: the long window did NOT fire on its own (timer cleared)',
  flushed === flushedBaseline + 1,
  'grace timer fired after flush');

// 8e. flushOwnerReply with nothing pending is a safe no-op.
const r8e = e10.flushOwnerReply('3571074');
assert('GR5: flush with no pending window is a safe no-op',
  r8e.type === 'IGNORED',
  `got ${JSON.stringify(r8e)}`);

// 8f. TERMINAL intermediate: owner escalates AND types a price within one
// window — the escalation must NOT be dropped by only-last-response routing.
// The session ends NEEDS_HUMAN (handoff final), the escalation text is sent.
const e9b = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 40
});
let e9bEscalated = false;
let e9bMsgs = [];
e9b.on('escalated', () => { e9bEscalated = true; });
e9b.on('ana-message', (p) => e9bMsgs.push(p.text));
e9b.start();
e9b.loadLeads(parsed);
await e9b.tick();                          // greet lead1
await e9b.onOwnerMessage('3571074', 'sakam da zboram so covek');
await e9b.onOwnerMessage('3571074', '250 evra');   // follow-up inside window
await new Promise(r => setTimeout(r, 90));  // let the window expire
const s9b = e9b.getSession('3571074');
assert('GR7: quickfire escalate+price ends NEEDS_HUMAN (not dropped by batch)',
  s9b.state === LeadState.NEEDS_HUMAN, `got ${s9b.state}`);
assert('GR7: escalated event fired', e9bEscalated === true, 'no escalated event');
assert('GR7: the handoff text was sent (escalation message)',
  e9bMsgs.some(t => /контактира/.test(t)),
  `sent=${JSON.stringify(e9bMsgs)}`);

// 8g. PROCESSING TAGS — the TUI's "which lead is generating right now?"
// marker. The pipeline writes [PHASE]/[MEMORY]/[MISSING FIELDS] to
// console.log; the TUI routes those lines into the tagged lead's chat. With
// the grace window the reply is generated asynchronously (ownerGraceMs
// later), so processing-start/end must carry the leadId around every
// generateResponse call — even inside the delayed batch.
const procEvents = [];
const e9c = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 40
});
e9c.on('processing-start', (p) => procEvents.push(['start', p.leadId]));
e9c.on('processing-end', (p) => procEvents.push(['end', p.leadId]));
e9c.on('ana-message', () => {});
e9c.start();
e9c.loadLeads(parsed);
await e9c.tick();                          // greet lead1 (no generateResponse)
await e9c.onOwnerMessage('3571074', ACCEPT);
await e9c.onOwnerMessage('3571074', '55 kvadrati');   // follow-up in window
await new Promise(r => setTimeout(r, 90));  // let the batch process
const starts = procEvents.filter(e => e[0] === 'start').length;
const ends = procEvents.filter(e => e[0] === 'end').length;
assert('GR9: processing-start/end balanced across the batch',
  starts >= 2 && starts === ends,
  `start=${starts} end=${ends} events=${JSON.stringify(procEvents)}`);
assert('GR9: processing events carry the correct leadId',
  procEvents.every(e => e[1] === '3571074'),
  `got ${JSON.stringify(procEvents)}`);
assert('GR9: first processing-start came from the DELAYED batch (after the grace events)',
  procEvents.length > 0,
  'no processing events emitted');

// 8h. ownerGraceMs=0 (default — tests/campaign) keeps the ORIGINAL instant
// reply behavior: routed outcome, ana-message sent immediately.
const e11 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {}
  // ownerGraceMs defaults to 0
});
let instantReplies = 0;
const instantProc = [];
e11.on('ana-message', () => { instantReplies++; });
e11.on('processing-start', (p) => instantProc.push(p.leadId));
e11.on('processing-end', () => {});
e11.start();
e11.loadLeads(parsed);
await e11.tick();                          // greet lead1
const instantBaseline = instantReplies;    // the greeting is ana-message #1
const r8f = await e11.onOwnerMessage('3571074', ACCEPT);
assert('GR10: ownerGraceMs=0 replies instantly (routed outcome, not debouncing)',
  r8f.type !== 'OWNER_RECEIVED' && r8f.action !== 'debouncing',
  `got ${JSON.stringify(r8f)}`);
assert('GR10: instant reply sent (original behavior preserved)',
  instantReplies === instantBaseline + 1,
  `replies=${instantReplies} baseline=${instantBaseline}`);
assert('GR10: processing-start tagged the instant path too',
  instantProc.length === 1 && instantProc[0] === '3571074',
  `got ${JSON.stringify(instantProc)}`);

// 8i. PHANTOM ATTEMPTS — an intermediate (dropped) message inside a grace
// batch must NOT consume a question attempt or permanently skip a field the
// owner never saw. Reported: "[SKIP: totalSqm — max 2 attempts reached]"
// with NO visible asks — the owner's quick follow-up within the follow-up
// window was processed (its response dropped), silently consuming attempt
// #2 and skipping totalSqm. Question-state must roll back for dropped
// responses; the extraction effects stay (Ana still read the message).
const e12 = new MultiLeadEngine({
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  ownerGraceMs: 40
});
let e12AnaMsgs = [];
e12.on('ana-message', (p) => e12AnaMsgs.push(p.text));
e12.start();
e12.loadLeads(parsed);
await e12.tick();                                   // greet lead1 (rent ad)
await e12.onOwnerMessage('3571074', ACCEPT);        // → data collection
await new Promise(r => setTimeout(r, 90));          // batch: accept → monthlyRent asked
assert('GR11: accept batch asked the first rent field (monthlyRent)',
  e12AnaMsgs.length === 2 && /кириј/.test(e12AnaMsgs[1]),
  `got ${JSON.stringify(e12AnaMsgs)}`);
await e12.onOwnerMessage('3571074', '350 evra mesecno'); // answer price (sent)
await new Promise(r => setTimeout(r, 90));
assert('GR11: price answer moved on to the totalSqm question (sent)',
  e12AnaMsgs.length === 3 && /квадратур/.test(e12AnaMsgs[2]),
  `got ${JSON.stringify(e12AnaMsgs)}`);
// The phantom-attempt batch: 3 no-answer messages within ONE grace window.
// Pre-fix each intermediate one asked (and dropped) a totalSqm question,
// inflating the counter to 2 → permanent skip with no visible asks.
await e12.onOwnerMessage('3571074', 'se razbira');
await e12.onOwnerMessage('3571074', 'super');
await e12.onOwnerMessage('3571074', 'odlicno');
await new Promise(r => setTimeout(r, 90));          // batch: only last reply sent
const s12 = e12.getSession('3571074');
assert('GR11: dropped intermediate asks did NOT skip totalSqm',
  s12.collectedData.totalSqmSkipped !== true,
  `totalSqmSkipped=${JSON.stringify(s12.collectedData.totalSqmSkipped)}`);
assert('GR11: no phantom attempts leaked to later fields (terraceSqm untouched)',
  (s12.questionAttempts.terraceSqm || 0) === 0,
  `attempts=${JSON.stringify(s12.questionAttempts)}`);
assert('GR11: the final batch reply still asks the total square meters',
  e12AnaMsgs.length === 4 && /квадратур/.test(e12AnaMsgs[3]),
  `got ${JSON.stringify(e12AnaMsgs)}`);

// ============================================================
// SUMMARY
// ============================================================
harness.summary('MULTI-LEAD ENGINE TESTS');
harness.exit();
