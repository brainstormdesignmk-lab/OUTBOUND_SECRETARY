// ============================================================
// test-sim-acceptance-e2e.js — LIVE end-to-end campaign simulation
// ============================================================
// PERMANENT REGRESSION SUITE: wired into the test battery via the
// test-*.js discovery pattern in run-tests.js (renamed from
// sim-acceptance-e2e.js). Runs with `npm test`, `npm test -- sim`,
// or standalone with `node test-sim-acceptance-e2e.js`.
// Confirms the acceptance fix moves a session from PERSUASION to
// DATA_COLLECTION correctly, using the EXACT bug message from the
// user's real campaign:
//
//   Owner: "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"
//   Before: [INTENT: INTERESTED, CONFIDENCE: 0.5] → stayed in PERSUASION
//           → LLM hallucinated a documents/meeting workflow (the bug)
//   After:  ACCEPTED >= 0.85 → DATA_COLLECTION → asks cleanPrice first
//
// Fully offline: the DATA_COLLECTION phase never calls the LLM. The
// PERSUASION-staying negative controls run through the REAL generateResponse
// pipeline with ANA_OFFLINE_LLM=1 set below — that env flag makes
// runPersuasion return a canned NORMAL reply instead of hitting the live
// Groq API (see handlers/persuasion-phase.js, call-time read, production
// never sets it). So the full early-responses → phase-detection →
// extraction → persuasion path is exercised without a GROQ_API_KEY.
//
// NOTE: Parts A/B/C/D are run inside the async runner at the bottom.
// Parts A, B-LIVE and D are async (generateResponse) and MUST be awaited —
// the earlier bug in this file had runPartA() defined but never called,
// silently skipping the entire core verification.
// ============================================================

// Offline-LLM test seam: read at call time inside runPersuasion, so setting
// it at module top-level (before the runner executes any generateResponse
// call) is sufficient. Only PERSUASION-staying paths ever reach it — Parts
// A/D (DATA_COLLECTION) never do.
process.env.ANA_OFFLINE_LLM = '1';

import { generateResponse } from './service.js';
import { detectPhase } from './handlers/persuasion-phase.js';
import { classifyIntent } from './classifier.js';
import { createHarness } from './test-helpers.js';

const harness = createHarness();
const assert = harness.assert;

// ------------------------------------------------------------
// Session factory — fresh PERSUASION session (cooperationAccepted=false)
// Parametrized by transactionType ('sale' | 'rent') so both flows can be
// simulated end-to-end with the correct greeting and field order.
// ------------------------------------------------------------
function freshSession({ transactionType = 'sale' } = {}) {
  const isRent = transactionType === 'rent';
  return {
    adMemory: {
      transactionType,
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: false,
      tenantPreferences: { preferred: [], excluded: [], notes: '' },
      petsAllowed: true
    },
    messages: [
      { role: 'model', text: isRent
        ? 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?'
        : 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: '+38970123456'
  };
}

async function sendMessage(session, userInput) {
  const result = await generateResponse(session, userInput);
  if (session.messages) {
    session.messages.push({ role: 'user', text: userInput });
    session.messages.push({ role: 'model', text: result.text });
  }
  return result;
}

// ------------------------------------------------------------
// PART A — LIVE full-flow: the exact bug message → DATA_COLLECTION → CLOSE
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART A: LIVE e2e — "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function runPartA() {
  const session = freshSession();
  let res;

  // ---- Pre-check: classifier must score the bug message ACCEPTED >= 0.85
  console.log('\n  === Pre-check: classifyIntent on the bug message ===');
  const cls = classifyIntent('super, kazi mi sto ti treba pa da pocneme', '');
  console.log(`  [INTENT: ${cls.intent}, CONFIDENCE: ${cls.confidence}, reason: ${cls.reason}]`);
  assert('A0: classifier returns ACCEPTED', cls.intent === 'ACCEPTED', `got ${cls.intent}`);
  assert('A0: confidence >= 0.85 (acceptance gate threshold)', cls.confidence >= 0.85, `got ${cls.confidence}`);

  // ---- Turn 1: the exact owner message from the bug report
  console.log('\n  === Turn 1: Owner says "SUPER, KAZI MI STO TI TREBA PA DA POCNEME" ===');
  res = await sendMessage(session, 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME');

  assert('A1: cooperationAccepted=true', session.collectedData.cooperationAccepted === true, 'was not set');
  assert('A1: session.phase mirrored to DATA_COLLECTION', session.phase === 'DATA_COLLECTION', `got "${session.phase}"`);
  assert('A1: response type=QUESTION (data collection, not LLM)', res.type === 'QUESTION', `got ${res.type}`);
  assert('A1: nextField=cleanPrice (first field in workflow)', res.nextField === 'cleanPrice', `got ${res.nextField}`);
  assert('A1: response asks about price, NOT documents (no hallucination)',
    /цена/i.test(res.text) && !/документ/i.test(res.text),
    `text: ${res.text.substring(0, 80)}`);
  console.log(`  ➡  Ana: "${res.text}"`);

  // ---- Turn 2+: complete the whole data-collection flow to CLOSE
  console.log('\n  === Continuing full data-collection flow to CLOSE ===');
  const { getNextMissingField } = await import('./workflow.js');
  // field = workflow field name (as returned by getNextMissingField)
  // NOTE: heating is answered with 'parno' via the 'heating' entry; the
  // heatingFollowUp branch below then supplies 'gradsko' on the next pass.
  const remaining = [
    { input: '98 iljadi evra', field: 'cleanPrice' },
    { input: '55 kvadrati', field: 'totalSqm' },
    { input: 'ima terasa 15m2', field: 'terraceSqm' },
    { input: '2 spalni', field: 'bedrooms' },
    { input: '3 kat', field: 'floor' },
    { input: '10katnica', field: 'totalFloors' },
    { input: 'ima lift', field: 'elevator' },
    { input: 'parno', field: 'heating' },
  ];

  let step = 0;
  while (step < 25 && res.type !== 'CLOSE') {
    step++;
    const known = { ...session.adMemory, ...session.collectedData };
    const nextField = getNextMissingField(known);

    if (!nextField) {
      // All fields collected — feed name + address to trigger close
      res = await sendMessage(session, 'Zoran Atanasov');
      if (res.type !== 'CLOSE') res = await sendMessage(session, 'Jane Sandanski 45');
      break;
    }

    // Heating follow-up answer if pending
    if (session.collectedData.heatingFollowUp && session.collectedData.heating === undefined) {
      res = await sendMessage(session, 'gradsko');
      continue;
    }

    const answer = remaining.find(r => r.field === nextField)?.input
      || { ac: 'klima', parking: 'garaza', orientation: 'jugoistok', furnished: 'kompletno namesten', yearBuilt: '2015 godina', renovated: 'da renoviran 2020ta', documentationClean: 'cist imoten list', photos: 'da, imam sliki', ownerName: 'Zoran Atanasov', address: 'Jane Sandanski 45' }[nextField]
      || 'ne znam';

    res = await sendMessage(session, answer);
    if (res.type === 'ERROR') {
      console.log(`  ⚠️  ERROR at step ${step} (nextField=${nextField}): ${res.text}`);
      break;
    }
  }

  assert('A2: flow completed with CLOSE (not stuck in PERSUASION)',
    res.type === 'CLOSE', `got ${res.type} after ${step} steps`);
  assert('A2: phase never fell back to PERSUASION',
    session.phase === 'DATA_COLLECTION' || session.phase === 'CLOSED',
    `got "${session.phase}"`);
  assert('A2: cleanPrice survived the whole flow', session.collectedData.cleanPrice === 98000,
    `got ${session.collectedData.cleanPrice}`);
  // The heating follow-up path ('parno' → 'gradsko') must have ACTUALLY run,
  // not been silently skipped via the 'ne znam' fallback (reviewer round-2
  // finding: the previous run passed 10/10 despite heating never being asked).
  assert('A2: heating follow-up executed (heating=district, not null)',
    session.collectedData.heating === 'district' && session.collectedData.heatingType === 'district',
    `got heating=${JSON.stringify(session.collectedData.heating)}, heatingType=${JSON.stringify(session.collectedData.heatingType)}`);
  console.log(`  ➡  Completed in ${step} steps, type=${res.type}, phase=${session.phase}`);
}

// ------------------------------------------------------------
// PART B — OFFLINE negative controls: hesitation/negation stay in PERSUASION
// (detectPhase directly — offline; a PERSUASION result would hit the LLM)
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART B: Negative controls — hesitation/negation STAY in PERSUASION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function offlineDetect(msg) {
  const session = freshSession();
  const detection = detectPhase({ u: msg.toLowerCase().trim(), conv: '', session, isRent: false });
  return { detection, session };
}

const negativeCases = [
  ['da mozebi ke probame', 'hedged "maybe we\'ll try"'],
  ['da ne probame', 'negated "let\'s NOT try"'],
  ['da razmislam pa ke probame', 'hesitation "let me think"'],
  ['mozebi ke probame', 'bare "maybe we\'ll try"'],
  ['da ke vidime', '"we\'ll see"'],
];

function runPartB() {
  for (const [msg, label] of negativeCases) {
    const { detection, session } = offlineDetect(msg);
    assert(`B: "${msg}" (${label}) stays PERSUASION`,
      session.phase === 'PERSUASION' && session.collectedData.cooperationAccepted !== true,
      `got phase=${session.phase}, accepted=${session.collectedData.cooperationAccepted}, intent=${detection.classification?.intent}/${detection.classification?.confidence}`);
  }
}

// ------------------------------------------------------------
// PART B-LIVE — audited hedge families through generateResponse
// The audited families (zosto da ne, ako e taka moze, mozebi sakam
// sorabotka, mozebi ke probame) must NOT be accepted through the FULL
// live service path, not just detectPhase(). Each runs generateResponse
// on a fresh session with ANA_OFFLINE_LLM=1 so the persuasion tail is a
// canned NORMAL reply.
//
// NOTE: 'mozebi sakam sorabotka' contains the literal word "sorabotka",
// which the COMMISSION early-response handler (isAskingAboutCommission)
// matches — it is intercepted BEFORE phase detection, so session.phase
// stays undefined for that message. That is CORRECT live behavior (a
// hardcoded NORMAL reply, no acceptance, no DATA_COLLECTION entry). The
// guarantee asserted is therefore: no acceptance + never entered
// DATA_COLLECTION + got a NORMAL reply (not a QUESTION/CLOSE, which would
// mean the pipeline wrongly accepted).
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART B-LIVE: Audited hedge families NOT accepted (via generateResponse)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const liveNegativeCases = [
  ['mozebi zosto da ne', 'hedged "maybe why not"'],
  ['mozebi ako e taka', 'hedged "maybe if so" (moze-inside-mozebi trap)'],
  ['mozebi sakam sorabotka', 'hedged "maybe I want cooperation" (commission handler intercepts)'],
  ['mozebi ke probame', 'hedged "maybe we\'ll try"'],
  ['da jasno mi e', 'clear-understanding acknowledgment (reported: after the commission example)'],
];

async function runPartBLive() {
  for (const [msg, label] of liveNegativeCases) {
    const session = freshSession();
    const res = await sendMessage(session, msg);
    // No cooperation acceptance + never entered DATA_COLLECTION. phase may be
    // 'PERSUASION' (detectPhase mirrored it) or undefined (early-response
    // short-circuit before phase detection — see NOTE above); both are safe.
    assert(`B-LIVE: "${msg}" (${label}) NOT accepted via generateResponse`,
      session.collectedData.cooperationAccepted !== true && session.phase !== 'DATA_COLLECTION',
      `got phase=${session.phase}, accepted=${session.collectedData.cooperationAccepted}, res.type=${res.type}`);
    assert(`B-LIVE: "${msg}" returns NORMAL (not QUESTION/CLOSE — no wrong acceptance)`,
      res.type === 'NORMAL',
      `got ${res.type} — pipeline wrongly accepted into data collection?`);
  }
}

// ------------------------------------------------------------
// PART C — OFFLINE positive controls: strong acceptances still enter
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART C: Positive controls — strong acceptances STILL enter DATA_COLLECTION');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const positiveCases = [
  ['vazhi', 'strong single word'],
  ['ajde da probame', 'strong ajde-probame'],
  ['da probame', 'strong da-probame'],
  ['dogovoreno', 'agreed'],
  ['kazi mi sto ti treba pa da pocneme', 'go-ahead (bug message, lowercased)'],
];

function runPartC() {
  for (const [msg, label] of positiveCases) {
    const { session } = offlineDetect(msg);
    assert(`C: "${msg}" (${label}) enters DATA_COLLECTION`,
      session.phase === 'DATA_COLLECTION' && session.collectedData.cooperationAccepted === true,
      `got phase=${session.phase}, accepted=${session.collectedData.cooperationAccepted}`);
  }
}

// ------------------------------------------------------------
// PART D — LIVE rent full-flow: bug message → DATA_COLLECTION → monthlyRent → CLOSE
// Mirrors Part A but with transactionType='rent': the workflow's rentOrder
// starts with monthlyRent (NOT cleanPrice), and the rent extractor must not
// set cleanPrice. Covers the rent data-collection path end-to-end.
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART D: LIVE e2e (RENT) — "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function runPartD() {
  const session = freshSession({ transactionType: 'rent' });
  let res;

  // ---- Pre-check: classifier must score the bug message ACCEPTED >= 0.85
  console.log('\n  === Pre-check: classifyIntent on the bug message (rent) ===');
  const cls = classifyIntent('super, kazi mi sto ti treba pa da pocneme', '');
  console.log(`  [INTENT: ${cls.intent}, CONFIDENCE: ${cls.confidence}, reason: ${cls.reason}]`);
  assert('D0: classifier returns ACCEPTED (rent)', cls.intent === 'ACCEPTED', `got ${cls.intent}`);
  assert('D0: confidence >= 0.85 (acceptance gate threshold)', cls.confidence >= 0.85, `got ${cls.confidence}`);

  // ---- Turn 1: the exact owner message from the bug report (rent transaction)
  console.log('\n  === Turn 1: Owner says "SUPER, KAZI MI STO TI TREBA PA DA POCNEME" (rent) ===');
  res = await sendMessage(session, 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME');

  assert('D1: cooperationAccepted=true (rent)', session.collectedData.cooperationAccepted === true, 'was not set');
  assert('D1: session.phase mirrored to DATA_COLLECTION (rent)', session.phase === 'DATA_COLLECTION', `got "${session.phase}"`);
  assert('D1: response type=QUESTION (data collection, not LLM)', res.type === 'QUESTION', `got ${res.type}`);
  assert('D1: nextField=monthlyRent (rent first field, NOT cleanPrice)', res.nextField === 'monthlyRent', `got ${res.nextField}`);
  assert('D1: response asks about rent, NOT documents (no hallucination)',
    /кириј/i.test(res.text) && !/документ/i.test(res.text),
    `text: ${res.text.substring(0, 80)}`);
  console.log(`  ➡  Ana: "${res.text}"`);

  // ---- Turn 2+: complete the whole rent data-collection flow to CLOSE
  console.log('\n  === Continuing full rent data-collection flow to CLOSE ===');
  const { getNextMissingField } = await import('./workflow.js');
  // Rent order starts with monthlyRent; the remaining fields match sale.
  const remaining = [
    { input: '500 evra mesecno', field: 'monthlyRent' },
    { input: '55 kvadrati', field: 'totalSqm' },
    { input: 'ima terasa 15m2', field: 'terraceSqm' },
    { input: '2 spalni', field: 'bedrooms' },
    { input: '3 kat', field: 'floor' },
    { input: '10katnica', field: 'totalFloors' },
    { input: 'ima lift', field: 'elevator' },
    { input: 'parno', field: 'heating' },
  ];

  let step = 0;
  while (step < 25 && res.type !== 'CLOSE') {
    step++;
    const known = { ...session.adMemory, ...session.collectedData };
    const nextField = getNextMissingField(known);

    if (!nextField) {
      // All fields collected — feed name + address to trigger close
      res = await sendMessage(session, 'Zoran Atanasov');
      if (res.type !== 'CLOSE') res = await sendMessage(session, 'Jane Sandanski 45');
      break;
    }

    // Heating follow-up answer if pending
    if (session.collectedData.heatingFollowUp && session.collectedData.heating === undefined) {
      res = await sendMessage(session, 'gradsko');
      continue;
    }

    const answer = remaining.find(r => r.field === nextField)?.input
      || { ac: 'klima', parking: 'garaza', orientation: 'jugoistok', furnished: 'kompletno namesten', yearBuilt: '2015 godina', renovated: 'da renoviran 2020ta', documentationClean: 'cist imoten list', photos: 'da, imam sliki', ownerName: 'Zoran Atanasov', address: 'Jane Sandanski 45' }[nextField]
      || 'ne znam';

    res = await sendMessage(session, answer);
    if (res.type === 'ERROR') {
      console.log(`  ⚠️  ERROR at step ${step} (nextField=${nextField}): ${res.text}`);
      break;
    }
  }

  assert('D2: flow completed with CLOSE (rent)', res.type === 'CLOSE', `got ${res.type} after ${step} steps`);
  assert('D2: phase never fell back to PERSUASION (rent)',
    session.phase === 'DATA_COLLECTION' || session.phase === 'CLOSED',
    `got "${session.phase}"`);
  assert('D2: monthlyRent survived the whole flow', session.collectedData.monthlyRent === 500,
    `got ${session.collectedData.monthlyRent}`);
  assert('D2: cleanPrice NOT extracted (rent flow)', session.collectedData.cleanPrice === undefined,
    `got ${session.collectedData.cleanPrice}`);
  assert('D2: heating follow-up executed (heating=district, not null)',
    session.collectedData.heating === 'district' && session.collectedData.heatingType === 'district',
    `got heating=${JSON.stringify(session.collectedData.heating)}, heatingType=${JSON.stringify(session.collectedData.heatingType)}`);
  console.log(`  ➡  Completed in ${step} steps, type=${res.type}, phase=${session.phase}`);
}

// ------------------------------------------------------------
// PART E — LIVE rent price routing: "250 evra" must land in monthlyRent,
// NEVER cleanPrice, even before cooperation is accepted.
//
// Reported bug: "250 evra not registered as a price for rent". Root cause:
// transactionType is derived from the ad title into adMemory, but collectedData
// only gets the copy on cooperation ACCEPT (persuasion-phase.js). The price
// extractors (data-collector.js) read ONLY collectedData, and extractCleanPrice
// fires whenever collectedData.transactionType !== 'rent' — so a rent owner's
// price volunteered during persuasion was stored as cleanPrice (the SALE price
// field) at 0.95 confidence. Fix: service.js backfills
// collectedData.transactionType from adMemory at the top of generateResponse.
//
// Three live controls:
//   E1: rent owner volunteers "250 evra" during PERSUASION → monthlyRent=250,
//       cleanPrice undefined.
//   E2: rent session in DATA_COLLECTION whose collectedData.transactionType is
//       missing (e.g. loaded from a stale persisted session) → "250 evra"
//       still routes to monthlyRent (evra price scores HIGH → stored on the
//       first turn, no confirmation round-trip).
//   E3: sale control — "98 iljadi evra" volunteered during persuasion stays
//       cleanPrice=98000 (backfill must not break the sale path).
// ------------------------------------------------------------
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎭 PART E: LIVE rent-price routing — "250 evra" → monthlyRent (never cleanPrice)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

async function runPartE() {
  // E1: rent owner volunteers the price BEFORE accepting cooperation.
  console.log('\n  === E1: RENT persuasion — owner volunteers "250 evra" before accepting ===');
  const e1 = freshSession({ transactionType: 'rent' });
  await sendMessage(e1, '250 evra');
  assert('E1: transactionType backfilled into collectedData (rent)',
    e1.collectedData.transactionType === 'rent',
    `got ${JSON.stringify(e1.collectedData.transactionType)}`);
  assert('E1: monthlyRent=250 stored (rent price)',
    e1.collectedData.monthlyRent === 250,
    `got ${JSON.stringify(e1.collectedData.monthlyRent)}`);
  assert('E1: cleanPrice NOT set (must never be the SALE field for rent)',
    e1.collectedData.cleanPrice === undefined,
    `got ${JSON.stringify(e1.collectedData.cleanPrice)}`);

  // E2: rent DATA_COLLECTION session whose collectedData.transactionType is
  // missing (stale persisted session) — backfill must repair the routing.
  console.log('\n  === E2: RENT DATA_COLLECTION — collectedData.transactionType missing (stale session) ===');
  const e2 = freshSession({ transactionType: 'rent' });
  e2.collectedData.cooperationAccepted = true;
  delete e2.collectedData.transactionType; // simulate stale persisted session
  e2.messages.push({ role: 'user', text: 'DA' });
  e2.messages.push({ role: 'model', text: 'Која е месечната кирија за станот?' });
  const e2res1 = await sendMessage(e2, '250 evra');
  // "250 evra" carries the currency marker "evra" → HIGH (0.95) → stored
  // immediately, NO confirmation round-trip (was MEDIUM 0.60 → "Дали точната
  // вредност е 250?" — the reported unnecessary re-ask). The reply is still a
  // QUESTION — the NEXT field (totalSqm) — proving the flow advanced.
  assert('E2: first reply advances to the next field (evra price = HIGH, no confirm re-ask)',
    e2res1.type === 'QUESTION' && e2res1.nextField === 'availableFrom',
    `got ${e2res1.type} — nextField=${e2res1.nextField} — "${e2res1.text}"`);
  assert('E2: monthlyRent stored on first turn (no confirmation pending)',
    e2.collectedData.monthlyRent === 250 && !e2.pendingConfirmation,
    `got monthlyRent=${JSON.stringify(e2.collectedData.monthlyRent)}, pending=${JSON.stringify(e2.pendingConfirmation)}`);
  // availableFrom sits right after monthlyRent in the rent field order —
  // answer the date question, then the flow advances to totalSqm.
  const e2resDate = await sendMessage(e2, 'od 1 januari');
  assert('E2: availableFrom captured after rent answer (rent order → totalSqm)',
    e2.collectedData.availableFrom === '2027-01-01' &&
      e2resDate.type === 'QUESTION' && e2resDate.nextField === 'totalSqm',
    `got availableFrom=${JSON.stringify(e2.collectedData.availableFrom)}, next=${e2resDate.nextField}, "${(e2resDate.text || '').slice(0, 60)}"`);
  const e2res2 = await sendMessage(e2, 'da');
  assert('E2: flow advanced after first turn (not stuck)',
    e2res2.type === 'QUESTION',
    `got ${e2res2.type}`);
  assert('E2: monthlyRent=250 stored after confirmation',
    e2.collectedData.monthlyRent === 250,
    `got ${JSON.stringify(e2.collectedData.monthlyRent)}`);
  assert('E2: cleanPrice NOT set for rent',
    e2.collectedData.cleanPrice === undefined,
    `got ${JSON.stringify(e2.collectedData.cleanPrice)}`);

  // E3: sale control — backfill must not break the sale path.
  console.log('\n  === E3: SALE persuasion — owner volunteers "98 iljadi evra" (control) ===');
  const e3 = freshSession(); // sale
  await sendMessage(e3, '98 iljadi evra');
  assert('E3: transactionType backfilled (sale)',
    e3.collectedData.transactionType === 'sale',
    `got ${JSON.stringify(e3.collectedData.transactionType)}`);
  assert('E3: cleanPrice=98000 stored (sale price)',
    e3.collectedData.cleanPrice === 98000,
    `got ${JSON.stringify(e3.collectedData.cleanPrice)}`);
  assert('E3: monthlyRent NOT set (sale)',
    e3.collectedData.monthlyRent === undefined,
    `got ${JSON.stringify(e3.collectedData.monthlyRent)}`);
}

// ------------------------------------------------------------
// RUNNER — awaits Parts A, B-LIVE, D and E (async), runs B and C, then summary
// ------------------------------------------------------------
(async () => {
  try {
    await runPartA();
    runPartB();
    await runPartBLive();
    runPartC();
    await runPartD();
    await runPartE();

    const summary = harness.summary('🎯 LIVE E2E ACCEPTANCE SIMULATION');
    if (harness.failed > 0) {
      console.log('❌ SIMULATION FAILED\n');
      process.exit(1);
    }
    console.log('\n🟢 ALL CHECKS PASSED — acceptance fix moves PERSUASION → DATA_COLLECTION correctly\n');
  } catch (e) {
    console.error('\n💥 FATAL ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
