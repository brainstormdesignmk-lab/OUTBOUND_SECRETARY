// ============================================================
// SMOKE TEST: Ana conversation (consolidated)
// ============================================================
// Two smoke checks merged from the former test-ana.js
// and test-full-conversation.js (duplicate live-API suites):
//
//   1. Direct generateResponse() greeting (former test-ana.js)
//   2. AnaClient multi-turn flow (former test-full-conversation.js)
//
// Fully offline: ANA_OFFLINE_LLM=1 (set below) makes runPersuasion
// return a canned NORMAL reply instead of hitting the live Groq API
// (see handlers/persuasion-phase.js, call-time read, production never
// sets it). The battery must never depend on Groq availability or
// rate limits. To run this as a genuine live smoke test, temporarily
// remove the flag below (requires a real GROQ_API_KEY in the env or
// ~/.ana/ana.env — see env.js).
// ============================================================
process.env.ANA_OFFLINE_LLM = '1';

import './env.js'; // side-effect: load ~/.ana/ana.env if present (see env.js)
import { generateResponse } from './service.js';
import { AnaClient } from './ana-client.js';

async function testDirectGreeting() {
  console.log("🧪 [1/2] Direct generateResponse (offline seam)...\n");

  const conversation = {
    messages: [],
    extractedData: { title: "Стан на Аеродром 60м2" }
  };

  const response = await generateResponse(conversation, "Здраво, видов го огласот.");
  console.log("Ana's Reply:\n");
  console.log(response.text);

  if (!response || !response.text) {
    throw new Error('Empty response from generateResponse');
  }
}

async function testFullConversation() {
  console.log("\n🔄 [2/2] AnaClient multi-turn (Ana v2.6)...\n");

  const ana = new AnaClient();

  const msgs = [
    "Здраво, видов го огласот за станот на Аеродром.",
    "Да, се согласувам.",
    "На трет кат е, има гаража.",
    "Греењето е на струја.",
    "Имам слики."
  ];

  for (let msg of msgs) {
    console.log(`User: ${msg}`);
    const res = await ana.sendMessage(msg);
    if (!res || !res.text) throw new Error(`Empty response for: ${msg}`);
    console.log(`Ana: ${res.text}\n`);
  }
}

async function main() {
  try {
    await testDirectGreeting();
    await testFullConversation();
    console.log("\n🟢 SMOKE TESTS PASSED");
    process.exit(0);
  } catch (err) {
    console.error(`\n🔴 SMOKE TEST FAILED: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
