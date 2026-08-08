// ============================================================
// test-webhook-adapter.js — Viber webhook → MultiLeadEngine adapter
// ============================================================
// Exercises webhook-adapter.js end-to-end WITHOUT any network or
// real Viber token: the sendMessage transport is injected and every
// outbound is captured. The engine runs on a fake clock with the
// anti-ban gates stubbed (same seam as test-price-not-reasked.js).
//
// Covered:
//   A. phoneKeys normalization — every written form of one number
//      (070123456 / 38970123456 / +38970123456 / spaced) resolves to
//      the SAME lead; different numbers never collide.
//   B. Greeting flow — engine.start() greets the staged lead and the
//      greeting is delivered via the injected transport.
//   C. Inbound 'message' event → lead resolution → engine reply sent
//      back to the Viber chat id (sender.id), not the raw phone.
//   D. Full data-collection conversation THROUGH the webhook
//      (accept → rent question → price answer → monthlyRent stored).
//   E. Unknown sender / non-message / malformed events are ignored
//      (handled:false) and never produce an outbound.
//   F. Single-send guarantee: greeting/followup events must NOT
//      double-send (ana-message is the only send trigger).
//
// Runs fully offline: DATA_COLLECTION never calls the LLM, and
// ANA_OFFLINE_LLM guards any persuasion tail (not reached).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import { createHarness } from './test-helpers.js';
import { createWebhookAdapter, phoneKeys } from './webhook-adapter.js';

const harness = createHarness();
const assert = harness.assert;

const flush = () => new Promise((r) => setTimeout(r, 25));

// Fake in-memory session store — the adapter/engine must never write
// to the real data/ directory during a test run.
const fakeStore = { save: async () => {}, load: async () => [] };

const LEAD = {
  id: '1',
  title: 'SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM',
  phone: '+38970123456',
  url: 'https://reklama5.mk/AdDetails?ad=1'
};

// ============================================================
// A — phoneKeys normalization + lead resolution
// ============================================================
console.log('\n========================================');
console.log('🧪 A: phoneKeys — every form of one number resolves to the same lead');
console.log('========================================\n');

const a = createWebhookAdapter({ leads: [LEAD], sendMessage: async () => {}, sessionStore: fakeStore });
assert('A1: local form "070123456" → lead 1',
  a.findLeadIdByPhone('070123456') === '1', `got ${a.findLeadIdByPhone('070123456')}`);
assert('A2: international w/o + "38970123456" → lead 1',
  a.findLeadIdByPhone('38970123456') === '1', `got ${a.findLeadIdByPhone('38970123456')}`);
assert('A3: full "+38970123456" → lead 1',
  a.findLeadIdByPhone('+38970123456') === '1', `got ${a.findLeadIdByPhone('+38970123456')}`);
assert('A4: spaced "389 70 123 456" → lead 1',
  a.findLeadIdByPhone('389 70 123 456') === '1', `got ${a.findLeadIdByPhone('389 70 123 456')}`);
assert('A5: unknown "0999999999" → null',
  a.findLeadIdByPhone('0999999999') === null, `got ${a.findLeadIdByPhone('0999999999')}`);
assert('A6: empty → null', a.findLeadIdByPhone('') === null && a.findLeadIdByPhone(null) === null, 'not null');

// Purity: two different numbers share no key.
const keysA = phoneKeys('070123456');
const keysB = phoneKeys('078377677');
let shared = 0;
for (const k of keysA) if (keysB.has(k)) shared++;
assert('A7: different numbers share NO normalized key',
  shared === 0, `shared ${shared} key(s): ${[...keysA].filter(k => keysB.has(k)).join(',')}`);
a.stop();

// ============================================================
// B — greeting flow: staged lead greeted through the transport
// ============================================================
console.log('\n========================================');
console.log('🧪 B: greeting — engine.start() delivers the greeting via the adapter');
console.log('========================================\n');

const sentB = [];
const b = createWebhookAdapter({
  leads: [LEAD],
  sessionStore: fakeStore,
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  sendMessage: async (p) => { sentB.push(p); }
});
b.start({ noInterval: true });
await flush();

assert('B1: greeting was delivered (one ana-message outbound)',
  sentB.length === 1, `got ${sentB.length} outbound(s): ${JSON.stringify(sentB)}`);
assert('B2: greeting receiver is the lead phone (+38970123456)',
  sentB[0] && sentB[0].receiver === '+38970123456', `got ${JSON.stringify(sentB[0] && sentB[0].receiver)}`);
assert('B3: greeting text is Ana\'s Macedonian opener',
  sentB[0] && /Здраво/.test(sentB[0].text), `got ${JSON.stringify(sentB[0] && sentB[0].text)}`);
assert('B4: exactly ONE outbound — greeting/followup events did NOT double-send',
  sentB.length === 1, `got ${sentB.length}: ${JSON.stringify(sentB.map(p => p.text && p.text.slice(0, 20)))}`);
b.stop();

// ============================================================
// C — inbound webhook 'message' event → engine reply
// ============================================================
console.log('\n========================================');
console.log('🧪 C: inbound — "da" through the webhook → rent question reply');
console.log('========================================\n');

const sentC = [];
const c = createWebhookAdapter({
  leads: [LEAD],
  sessionStore: fakeStore,
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  sendMessage: async (p) => { sentC.push(p); }
});
c.start({ noInterval: true });
await flush();
sentC.length = 0; // clear the greeting — focus on the reply

const evt = { event: 'message', sender: { id: '070123456' }, message: { text: 'da' } };
const r1 = await c.handleWebhookEvent(evt);
await flush();

assert('C1: handled=true for a known sender',
  r1.handled === true, `got ${JSON.stringify(r1)}`);
assert('C2: resolved leadId is the lead id',
  r1.leadId === '1', `got ${r1.leadId}`);
assert('C3: owner "da" accepted cooperation',
  c.engine.getSession('1').collectedData.cooperationAccepted === true, 'not accepted');
assert('C4: reply asks the rent question (data collection started)',
  sentC.length === 1 && /кириј/.test(sentC[0].text), `got ${sentC.length}: ${JSON.stringify(sentC.map(p => p.text))}`);
assert('C5: reply receiver is the VIBER CHAT ID (sender.id), not the raw lead phone',
  sentC[0] && sentC[0].receiver === '070123456', `got ${JSON.stringify(sentC[0] && sentC[0].receiver)}`);
c.stop();

// ============================================================
// D — full data-collection conversation THROUGH the webhook
// ============================================================
console.log('\n========================================');
console.log('🧪 D: end-to-end — accept → price answer → monthlyRent stored via webhook');
console.log('========================================\n');

const sentD = [];
const d = createWebhookAdapter({
  leads: [LEAD],
  sessionStore: fakeStore,
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  sendMessage: async (p) => { sentD.push(p); }
});
d.start({ noInterval: true });
await flush();
sentD.length = 0;

// Owner accepts (webhook from the chat id).
await d.handleWebhookEvent({ event: 'message', sender: { id: '070123456' }, message: { text: 'da' } });
await flush();
// Owner answers the rent question (reported phrasing).
await d.handleWebhookEvent({ event: 'message', sender: { id: '070123456' }, message: { text: 'BARAM 350 EVRA ZA MESEC' } });
await flush();

const sess = d.engine.getSession('1');
assert('D1: monthlyRent=350 stored from the webhook answer',
  sess.collectedData.monthlyRent === 350, `got ${JSON.stringify(sess.collectedData.monthlyRent)}`);
assert('D2: reply moved on to availableFrom (no rent re-ask)',
  sentD[sentD.length - 1] && /слободен/.test(sentD[sentD.length - 1].text),
  `got ${JSON.stringify(sentD[sentD.length - 1] && sentD[sentD.length - 1].text)}`);
assert('D3: Viber chat id remembered for later replies',
  sentD[sentD.length - 1].receiver === '070123456', `got ${JSON.stringify(sentD[sentD.length - 1] && sentD[sentD.length - 1].receiver)}`);
d.stop();

// ============================================================
// E — unknown / non-message / malformed events
// ============================================================
console.log('\n========================================');
console.log('🧪 E: rejection of unknown, non-message, and malformed events');
console.log('========================================\n');

const sentE = [];
const e = createWebhookAdapter({
  leads: [LEAD],
  sessionStore: fakeStore,
  now: () => 0,
  sleep: async () => {},
  tickMs: 1,
  typingDelay: () => 0,
  canSendContact: () => true,
  recordSent: () => {},
  sendMessage: async (p) => { sentE.push(p); }
});
e.start({ noInterval: true });
await flush();
sentE.length = 0;

const e1 = await e.handleWebhookEvent({ event: 'message', sender: { id: '0999999999' }, message: { text: 'zdravo' } });
assert('E1: unknown sender → handled:false (unknown-sender)',
  e1.handled === false && e1.reason === 'unknown-sender', `got ${JSON.stringify(e1)}`);

const e2 = await e.handleWebhookEvent({ event: 'subscribed', user: { id: '070123456' } });
assert('E2: non-message event (subscribed) → handled:false',
  e2.handled === false, `got ${JSON.stringify(e2)}`);

const e3 = await e.handleWebhookEvent({ event: 'message', sender: { id: '070123456' }, message: {} });
assert('E3: message without text → handled:false',
  e3.handled === false && e3.reason === 'malformed-message', `got ${JSON.stringify(e3)}`);

const e4 = await e.handleWebhookEvent({ event: 'message', message: { text: 'zdravo' } });
assert('E4: message without sender → handled:false',
  e4.handled === false && e4.reason === 'malformed-message', `got ${JSON.stringify(e4)}`);

const e5 = await e.handleWebhookEvent(null);
assert('E5: null event → handled:false (no-event)',
  e5.handled === false && e5.reason === 'no-event', `got ${JSON.stringify(e5)}`);

assert('E6: none of the rejected events produced an outbound',
  sentE.length === 0, `got ${sentE.length} outbound(s)`);
e.stop();

// ============================================================
// SUMMARY
// ============================================================
harness.summary('WEBHOOK-ADAPTER TESTS');
harness.exit();
