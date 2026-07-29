// ========================================
// TEST: Owner says "da" → should ask price first, not terrace
// ========================================
// This simulates the EXACT broken scenario from the user's campaign:
// Owner accepts with "da", and Ana should ask about price (cleanPrice)
// NOT about terrace (terraceSqm).
//
// Before the fix (23aa808), isPositive("da") returned true which
// triggered the terrace handler's follow-up question.
// After the fix, nextField === 'terraceSqm' gate prevents this.
//
// No Groq API needed because after ACCEPTED classification,
// the flow goes to DATA_COLLECTION phase which doesn't call the LLM.
// ========================================

import { generateResponse } from './service.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}: ${detail}`);
    failed++;
  }
}

console.log('\n========================================');
console.log('🧪 TEST: "da" accept → price first, not terrace');
console.log('========================================\n');

async function runTest() {
  // Session starts during PERSUASION phase (cooperationAccepted=false)
  const session = {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот'
    },
    collectedData: {
      cooperationAccepted: false
    },
    messages: [
      { role: 'model', text: 'Здраво, јас сум Ана од Metropolis. Ве контактирам за огласот за станот што се продава. Дали е сѐ уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: '+38970123456'
  };

  // Owner says "da" — simple acceptance
  const result = await generateResponse(session, "da");
  
  console.log('\n  Response type:', result.type);
  console.log('  Next field:', result.nextField);
  console.log('  Response text:', result.text.substring(0, 80));
  console.log('  Cooperation accepted:', session.collectedData.cooperationAccepted);
  console.log('  Has terrace set:', session.collectedData.hasTerrace);
  console.log('  Terrace sqm set:', session.collectedData.terraceSqm);
  console.log('  CleanPrice set:', session.collectedData.cleanPrice);

  // Critical checks
  assert('Response type is QUESTION (not terrace follow-up)',
    result.type === 'QUESTION',
    `got ${result.type}`);

  assert('nextField is cleanPrice (first field in workflow)',
    result.nextField === 'cleanPrice',
    `got ${result.nextField}`);

  assert('Response text asks about price',
    /цена/i.test(result.text),
    `text: ${result.text.substring(0, 60)}`);

  // Ensure terrace was NOT set (nobody mentioned it)
  assert('hasTerrace is NOT set',
    session.collectedData.hasTerrace === undefined,
    `got ${session.collectedData.hasTerrace}`);

  assert('terraceSqm is NOT set',
    session.collectedData.terraceSqm === undefined,
    `got ${session.collectedData.terraceSqm}`);

  // Cooperation was accepted
  assert('cooperationAccepted is true',
    session.collectedData.cooperationAccepted === true,
    'was not set to true');

  // =========================================
  // SECOND TURN: Owner answers price
  // =========================================
  console.log('\n  --- Turn 2: Owner answers price ---');
  const result2 = await generateResponse(session, "98 iljadi evra");
  
  console.log('  Response type:', result2.type);
  console.log('  Next field:', result2.nextField);
  console.log('  CleanPrice collected:', session.collectedData.cleanPrice);

  assert('Turn 2: type=QUESTION',
    result2.type === 'QUESTION',
    `got ${result2.type}`);

  assert('Turn 2: nextField=totalSqm (after price)',
    result2.nextField === 'totalSqm',
    `got ${result2.nextField}`);

  assert('Turn 2: cleanPrice=98000',
    session.collectedData.cleanPrice === 98000,
    `got ${session.collectedData.cleanPrice}`);

  // =========================================
  // THIRD TURN: Owner answers sqm, volunteers terrace
  // =========================================
  console.log('\n  --- Turn 3: Owner says "55 kvadrati" ---');
  const result3 = await generateResponse(session, "55 kvadrati");
  
  console.log('  Response type:', result3.type);
  console.log('  Next field:', result3.nextField);
  console.log('  TotalSqm collected:', session.collectedData.totalSqm);
  console.log('  HasTerrace set:', session.collectedData.hasTerrace);

  assert('Turn 3: type=QUESTION',
    result3.type === 'QUESTION',
    `got ${result3.type}`);

  assert('Turn 3: nextField=terraceSqm (terrace is next after sqm)',
    result3.nextField === 'terraceSqm',
    `got ${result3.nextField}`);

  assert('Turn 3: totalSqm=55',
    session.collectedData.totalSqm === 55,
    `got ${session.collectedData.totalSqm}`);

  // terrace should NOT be auto-set from "55 kvadrati" (no terrace context)
  assert('Turn 3: hasTerrace NOT auto-set from generic sqm',
    session.collectedData.hasTerrace === undefined,
    `got ${session.collectedData.hasTerrace}`);

  // =========================================
  // FOURTH TURN: Owner answers terrace question
  // =========================================
  console.log('\n  --- Turn 4: Owner says "ima 15m2" (terrace context) ---');
  const result4 = await generateResponse(session, "ima 15m2");
  
  console.log('  Response type:', result4.type);
  console.log('  Next field:', result4.nextField);
  console.log('  HasTerrace set:', session.collectedData.hasTerrace);
  console.log('  TerraceSqm set:', session.collectedData.terraceSqm);

  assert('Turn 4: type=QUESTION',
    result4.type === 'QUESTION',
    `got ${result4.type}`);

  assert('Turn 4: nextField=bedrooms (terrace done, next in workflow)',
    result4.nextField === 'bedrooms',
    `got ${result4.nextField}`);

  assert('Turn 4: hasTerrace=true',
    session.collectedData.hasTerrace === true,
    `got ${session.collectedData.hasTerrace}`);

  assert('Turn 4: terraceSqm=15',
    session.collectedData.terraceSqm === 15,
    `got ${session.collectedData.terraceSqm}`);

  // =========================================
  // SUMMARY
  // =========================================
  console.log('\n=======================================================');
  console.log('📊 TEST SUMMARY:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📋 Total:  ${passed + failed}`);
  console.log('=======================================================');

  if (failed > 0) {
    console.log('\n❌ TEST FAILED\n');
    process.exit(1);
  } else {
    console.log('\n🟢 ALL CHECKS PASSED — "da" now correctly asks price first, not terrace\n');
  }
}

runTest().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
