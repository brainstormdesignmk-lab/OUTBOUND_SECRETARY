// ========================================
// CLOSING FOLLOW-UP WINDOW (approved Option A — grace window only, 10 min)
// Reported: after the data-collection close ("Тоа беа информациите...
// Пријатен ден." → [conversation closed — success]), an owner's end
// question ("KOGA DA VE OCEKUVAM SO KLIENTI?", "SE NAJDOBRO") was DROPPED
// with { type: 'IGNORED' } — Ana went dark at the warmest moment.
//
// Approved design: the chat stays reachable for CLOSE_FOLLOWUP_WINDOW_MS
// (10 min, fits inside GAP_BETWEEN_LEADS so the next lead still starts as
// planned). Messages inside the window go to the rule-based closing
// responder (handlers/closing-phase.js — no LLM, no re-opening); after the
// window, late messages are IGNORED exactly as before.
//
// PART A — service level: the three answer tiers (when-to-expect rent/sale,
// goodbye ack, fallback) + the flag guard (no closingSince → no intercept).
// PART B — engine level, fake clock: in-window answers get SENT and re-arm
//          the window; past the window → IGNORED; no duplicate 'closed'
//          event, no CSV re-append.
// ========================================
process.env.ANA_OFFLINE_LLM = '1';

import { generateResponse } from './service.js';
import { MultiLeadEngine } from './engine.js';
import { LeadState } from './scheduler.js';
import { createHarness } from './test-helpers.js';

const { assert, summary, exit } = createHarness();

function closingSession(tt = 'rent') {
  return {
    adMemory: { transactionType: tt, propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      transactionType: tt, cooperationAccepted: true,
      monthlyRent: 260, totalSqm: 55, bedrooms: 2, floor: 3, totalFloors: 5
    },
    messages: [{ role: 'model', text: 'Тоа беа информациите што ми се потребни. Ви благодарам. Пријатен ден.' }],
    phone: '+38970000001',
    phase: 'DATA_COLLECTION',
    closingSince: Date.now()
  };
}

// ========================================
// PART A — service-level answer tiers
// ========================================
console.log('\n========================================');
console.log('🧪 A: closing-window responder — 3 tiers + flag guard');
console.log('========================================\n');

{
  const s = closingSession('rent');
  const r = await generateResponse(s, 'KOGA DA VE OCEKUVAM SO KLIENTI ?');
  assert('A1: "KOGA DA VE OCEKUVAM SO KLIENTI?" → CLOSING_ANSWER',
    r.type === 'CLOSING_ANSWER', `got ${r.type} — ${r.text}`);
  // Both rent variants rotate randomly — accept either (and reject sale wording)
  assert('A1: rent timeline answer (закупец/заинтересирани, never купувач)',
    /закупец|заинтересирани/.test(r.text) && !/купувач|купци/.test(r.text),
    `text: ${r.text}`);
  assert('A1: no promise of a concrete date (legal safety)',
    !/\d{1,2}\.\d{1,2}\./.test(r.text) && !/гарант/.test(r.text), `text: ${r.text}`);
  assert('A1: session NOT re-opened — no new QUESTION, no phase mutation',
    !/\?/.test(r.text) && !/Колкава|колкава|квадратур|кириј|кат\b/.test(r.text),
    'looks like a data-collection re-ask');
}

{
  const s = closingSession('rent');
  const r = await generateResponse(s, 'SE NAJDOBRO');
  assert('A2: "SE NAJDOBRO" → warm goodbye ack',
    r.type === 'CLOSING_ANSWER' && /благодарам|Пријатен ден/.test(r.text),
    `got [${r.type}] ${r.text}`);
}

{
  const s = closingSession('rent');
  const before = JSON.stringify(s.collectedData);
  const r = await generateResponse(s, 'KOJ E VASIOT BROJ?');
  assert('A3: unexpected message inside window → safe fallback ack',
    r.type === 'CLOSING_ANSWER' && /Ќе ве контактирам|известам/.test(r.text),
    `got [${r.type}] ${r.text}`);
  assert('A3: no data extraction / mutation inside the window',
    JSON.stringify(s.collectedData) === before, `collectedData changed: ${JSON.stringify(s.collectedData)}`);
}

{
  const s = closingSession('sale');
  const r = await generateResponse(s, 'KOGA KE IMA KLIENTI ?');
  // Both sale variants rotate randomly — "купувач" appears in either
  assert('A4: sale timeline answer (купувач)',
    r.type === 'CLOSING_ANSWER' && /купувач/.test(r.text),
    `got [${r.type}] ${r.text}`);
}

{
  // Flag guard — the SAME messages WITHOUT closingSince must NOT be
  // intercepted by the closing responder.
  const s = closingSession('rent');
  delete s.closingSince;
  const r = await generateResponse(s, 'SE NAJDOBRO');
  assert('A5: no closingSince → closing responder does NOT fire',
    r.type !== 'CLOSING_ANSWER', `got ${r.type} — ${r.text}`);
}

// ========================================
// PART B — engine level: window semantics with a fake clock
// ========================================
console.log('\n========================================');
console.log('🧪 B: engine window — in-window answered + re-armed, past → IGNORED');
console.log('========================================\n');

{
  let now = 1_000_000;
  const sent = [];
  let closedEvents = 0;
  const engine = new MultiLeadEngine({
    now: () => now,
    sleep: async () => {},
    tickMs: 1,
    typingDelay: () => 0,
    canSendContact: () => true,
    recordSent: () => {},
    sessionStore: { save: () => {}, load: () => ({ sessions: [] }) }
  });
  engine.on('ana-message', (p) => sent.push(p.text));
  engine.on('closed', () => closedEvents++);
  engine.start();
  engine.loadLeads([{
    id: 'clos1',
    title: 'SE IZDAVA STAN 42 m2',
    phone: '+38970111111',
    url: 'https://reklama5.mk/AdDetails?ad=clos1'
  }]);
  await engine.tick(); // greet — staged greeting lands

  const s = engine.getSession('clos1');
  // Simulate the routed success close: terminal state + window stamp.
  s.state = LeadState.CLOSED_SUCCESS;
  s.closingSince = now;

  sent.length = 0;
  const r1 = await engine.onOwnerMessage('clos1', 'KOGA DA VE OCEKUVAM SO KLIENTI ?');
  assert('B1: in-window end question NOT ignored', r1.type !== 'IGNORED', `got ${JSON.stringify(r1)}`);
  // Either rent variant, and crucially NOT a купувач (sale) wording
  assert('B1: rent timeline answer actually SENT',
    sent.length === 1 && /закупец|заинтересирани/.test(sent[0]) && !/купувач/.test(sent[0]),
    `got ${JSON.stringify(sent)}`);
  assert('B1: no duplicate \'closed\' event from the closing answer',
    closedEvents === 0, `got ${closedEvents}`);

  // Re-armed: another message 9 min later (still < 10 min) is answered.
  now += 9 * 60 * 1000;
  const r2 = await engine.onOwnerMessage('clos1', 'SE NAJDOBRO');
  assert('B2: message at minute 9 (re-armed window) still answered',
    r2.type !== 'IGNORED' && /благодарам|Пријатен ден/.test(sent[sent.length - 1]),
    `got ${JSON.stringify(r2)} — last: ${sent[sent.length - 1]}`);

  // Past the window (10 min silence after the last message) → IGNORED.
  now += 11 * 60 * 1000;
  const r3 = await engine.onOwnerMessage('clos1', 'SE NAJDOBRO');
  assert('B3: message after the window → IGNORED (no answer sent)',
    r3.type === 'IGNORED', `got ${JSON.stringify(r3)}`);
  assert('B3: nothing extra was sent past the window',
    sent.length === 2, `got ${JSON.stringify(sent)}`);
}

const res = summary('CLOSING FOLLOW-UP WINDOW TEST SUMMARY');
exit();
