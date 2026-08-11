#!/usr/bin/env node
/**
 * sim-rent-conversation.js — full RENT conversation, end to end, live.
 *
 * Drives the REAL pipeline (generateResponse → early responses → phase
 * machine → global extraction → data-collection flow → close path) with a
 * scripted owner, fully offline (ANA_OFFLINE_LLM=1 — no Groq/Gemini key
 * needed; DATA_COLLECTION never calls the LLM anyway).
 *
 *   node sim-rent-conversation.js
 *
 * Prints the whole transcript: greeting → availability → cooperation →
 * monthlyRent → availableFrom → TENANT-PREFERENCES (the point of this
 * sim) → the remaining fields → close, then the collected tenant profile
 * and the generated broker comment.
 *
 * Also demonstrates the tenant-preferences question VARIANTS: the first
 * ask uses variant 0; a non-answer re-asks with the confirmatory phrasing
 * (and shows what every variant in the rotation sounds like).
 */
process.env.ANA_OFFLINE_LLM = '1';

import { generateResponse } from './service.js';
import { getNextMissingField } from './workflow.js';
import { buildBrokerComment } from './property-intelligence.js';

// ------------------------------------------------------------
// Fresh rent session (mirrors test-sim-acceptance-e2e factory)
// ------------------------------------------------------------
function freshSession() {
  return {
    adMemory: {
      transactionType: 'rent',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'reklama5',
      adUrl: 'https://reklama5.mk/stan/123',
      photoUrls: []
    },
    collectedData: {
      // NOTE: tenantPreferences deliberately NOT pre-seeded — production
      // sessions start without it, so the rentOrder field (position 3) gets
      // asked. (The test factories pre-seed it to skip the question — this
      // sim is the REAL flow.)
      cooperationAccepted: false
    },
    messages: [
      { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?' }
    ],
    phone: '+38970123456'
  };
}

async function sendMessage(session, userInput, tag = '') {
  const result = await generateResponse(session, userInput);
  session.messages.push({ role: 'user', text: userInput });
  session.messages.push({ role: 'model', text: result.text });
  const tagStr = tag ? ` (${tag})` : '';
  console.log(`\n👤 OWNER${tagStr}: ${userInput}`);
  console.log(`💬 ANA: ${result.text}`);
  return result;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  RENT CONVERSATION — LIVE SIMULATION (offline LLM)            ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const session = freshSession();
let res;
let step = 0;

// ---- Turn 1: greeting reply — availability confirmation
res = await sendMessage(session, 'DA, DOSTAPEN E', 'availability');

// ---- Turn 2: cooperation acceptance
res = await sendMessage(session, 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME', 'cooperation');

// ---- Turns 3+: walk the rent field order
const remaining = [
  { input: '350 evra mesecno', field: 'monthlyRent' },
  { input: 'od 1 juli e sloboden', field: 'availableFrom' },
  { input: 'NE SAKAM MILENICI I SAMOHRANI MAJKI', field: 'tenantPreferences' },
  { input: '55 kvadrati', field: 'totalSqm' },
  { input: 'ima terasa od 5 m2', field: 'terraceSqm' },
  { input: '2 spalni', field: 'bedrooms' },
  { input: '3 kat', field: 'floor' },
  { input: '10 katnica', field: 'totalFloors' },
  { input: 'ima lift', field: 'elevator' },
  { input: 'parno', field: 'heating' },
  { input: 'ima klima', field: 'ac' },
  { input: 'ima garaza', field: 'parking' },
  { input: 'jugoistok', field: 'orientation' },
  { input: 'kompletno namesten', field: 'furnished' },
  { input: '2015 godina', field: 'yearBuilt' },
  { input: 'da, renoviran e 2020ta', field: 'renovated' },
  { input: 'cist imoten list', field: 'documentationClean' },
  { input: 'da, imam sliki', field: 'photos' },
  { input: 'Petar Petrovski', field: 'ownerName' },
  { input: 'ul. Partizanska 12, Skopje', field: 'address' }
];

while (step < 40 && res.type !== 'CLOSE') {
  step++;
  const known = { ...session.adMemory, ...session.collectedData };
  const nextField = getNextMissingField(known);

  if (!nextField) {
    res = await sendMessage(session, 'Petar Petrovski', 'name');
    if (res.type !== 'CLOSE') res = await sendMessage(session, 'ul. Partizanska 12, Skopje', 'address');
    break;
  }

  // Heating follow-up ('parno' → 'gradsko')
  if (session.collectedData.heatingFollowUp && session.collectedData.heating === undefined) {
    res = await sendMessage(session, 'gradsko', 'heating follow-up');
    continue;
  }

  const answer = remaining.find(r => r.field === nextField)?.input || 'ne znam';
  res = await sendMessage(session, answer, nextField);
  if (res.type === 'ERROR') {
    console.log(`  ⚠️  ERROR at step ${step} (${nextField}): ${res.text}`);
    break;
  }
}

// ---- Summary: tenant profile + broker comment
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('WHAT WAS COLLECTED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const d = session.collectedData;
console.log(`phase: ${session.phase}  |  close type: ${res.type}`);
console.log(`monthlyRent: ${d.monthlyRent}  |  availableFrom: ${d.availableFrom}`);
console.log(`tenantPreferences: ${JSON.stringify(d.tenantPreferences)}`);
console.log('\n--- broker comment (Интерен коментар — agent-visible only) ---');
console.log(buildBrokerComment({ transactionType: 'rent', monthlyRent: d.monthlyRent, tenantPreferences: d.tenantPreferences }));

// ---- Variant demonstration
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('TENANT-PREFERENCES QUESTION VARIANTS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const { TENANT_PREF_QUESTIONS } = await import('./workflow.js');
TENANT_PREF_QUESTIONS.forEach((v, i) => console.log(`  variant ${i}: "${v}"`));

// ---- Re-ask demonstration: drive straight to the tenant question and give
// four non-answers, so the variant rotation is heard live — one fresh
// sentence per attempt (attempts are capped at the variant count).
console.log('\n--- re-ask demo: straight to the tenant question, four non-answers, then the real answer ---');
const s2 = freshSession();
await sendMessage(s2, 'DA, DOSTAPEN E', 'availability');
await sendMessage(s2, 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME', 'cooperation');
await sendMessage(s2, '350 evra mesecno', 'monthlyRent');
await sendMessage(s2, 'od 1 juli e sloboden', 'availableFrom');
// Four non-answers (no tenant category word) → variants 0,1,2,3 in order
await sendMessage(s2, 'KAKO KJE BIDE', 'tenant — non-answer 1');
await sendMessage(s2, 'KAKO KJE BIDE', 'tenant — non-answer 2');
await sendMessage(s2, 'KAKO KJE BIDE', 'tenant — non-answer 3');
await sendMessage(s2, 'KAKO KJE BIDE', 'tenant — non-answer 4');
// Real answer → captured by the skip-loop fallback extraction
await sendMessage(s2, 'NE SAKAM MILENICI I SAMOHRANI MAJKI', 'tenant — real answer');
console.log(`\nsecond session tenantPreferences: ${JSON.stringify(s2.collectedData.tenantPreferences)}`);
