// ========================================
// E2E CAMPAIGN SIMULATION — Full Data Collection Flow
// ========================================
// Tests generateResponse in DATA_COLLECTION phase (no Groq API needed)
// by setting cooperationAccepted=true in the initial session.
//
// 3 scenarios:
//   1. Sale (sequential) — one field per message
//   2. Sale (bulk) — multi-field messages (global extraction pass)
//   3. Rent (sequential) — rent-specific fields and flow
//
// Verifies:
//   - Global extraction extracts fields from every message
//   - Complex handlers (terrace, heating, photos) work correctly
//   - Question generation asks for the right nextField
//   - Micro-social glue (fillers, prefixes) adapts based on field count
//   - Close message is returned when all fields collected
// ========================================
import { generateResponse } from './service.js';

let passed = 0;
let failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ========================================
// HELPER: Create a fresh session for testing
// ========================================
function createSession(scenario = 'sale') {
  const isRent = scenario === 'rent';
  return {
    adMemory: {
      transactionType: isRent ? 'rent' : 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
      cooperationAccepted: true,
      transactionType: isRent ? 'rent' : 'sale',
      propertyType: 'apartment'
    },
    messages: [],
    phone: '+38970123456'
  };
}

// ========================================
// HELPER: Simulate a conversation turn
// ========================================
async function sendMessage(session, userInput) {
  const result = await generateResponse(session, userInput);
  if (session.messages) {
    session.messages.push({ role: 'user', text: userInput });
    session.messages.push({ role: 'model', text: result.text });
  }
  return result;
}

// ========================================
// HELPER: Verify all expected fields were collected
// ========================================
function verifyFields(data, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (data[key] !== value) {
      return `${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(data[key])}`;
    }
  }
  return null;
}


// ========================================
// SCENARIO 1: Sale (sequential)
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 1: Sale — Sequential fields`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario1() {
  const session = createSession('sale');
  let res;

  // Turn 1: Price
  res = await sendMessage(session, "120 iljadi evra");
  assert("S1-T1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T1: nextField=totalSqm", res.nextField === "totalSqm", `got ${res.nextField}`);
  assert("S1-T1: cleanPrice=120000", session.collectedData.cleanPrice === 120000, `got ${session.collectedData.cleanPrice}`);

  // Turn 2: Total sqm (no longer triggers terrace handler — only totalSqm extracted)
  res = await sendMessage(session, "55 kvadrati");
  assert("S1-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T2: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);
  assert("S1-T2: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);
  // Terrace should NOT be auto-extracted from "55 kvadrati" (no terrace-specific word)
  assert("S1-T2: hasTerrace NOT set", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);

  // Turn 3: Terrace — "ima 15m2" (terrace-specific word triggers handler)
  res = await sendMessage(session, "ima 15m2");
  assert("S1-T3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T3: nextField=bedrooms", res.nextField === "bedrooms", `got ${res.nextField}`);
  assert("S1-T3: hasTerrace=true", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S1-T3: terraceSqm=15", session.collectedData.terraceSqm === 15, `got ${session.collectedData.terraceSqm}`);

  // Turn 4: Bedrooms
  res = await sendMessage(session, "2 spalni");
  assert("S1-T4: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T4: nextField=floor", res.nextField === "floor", `got ${res.nextField}`);
  assert("S1-T4: bedrooms=2", session.collectedData.bedrooms === 2, `got ${session.collectedData.bedrooms}`);

  // Turn 5: Floor
  res = await sendMessage(session, "3 kat");
  assert("S1-T5: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T5: nextField=totalFloors", res.nextField === "totalFloors", `got ${res.nextField}`);
  assert("S1-T5: floor=3", session.collectedData.floor === 3, `got ${session.collectedData.floor}`);

  // Turn 6: Total floors
  res = await sendMessage(session, "10katnica");
  assert("S1-T6: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T6: nextField=elevator", res.nextField === "elevator", `got ${res.nextField}`);
  assert("S1-T6: totalFloors=10", session.collectedData.totalFloors === 10, `got ${session.collectedData.totalFloors}`);

  // Turn 7: Elevator
  res = await sendMessage(session, "ima lift");
  assert("S1-T7: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T7: nextField=heating", res.nextField === "heating", `got ${res.nextField}`);
  assert("S1-T7: elevator=true", session.collectedData.elevator === true, `got ${session.collectedData.elevator}`);

  // Turn 8: Heating — "parno" triggers follow-up
  res = await sendMessage(session, "parno");
  assert("S1-T8: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T8: follow-up question (not normal field)", res.text.includes("Какво парно") || res.text.includes("градско"), `got ${res.text.substring(0, 40)}`);
  assert("S1-T8: heatingFollowUp=true", session.collectedData.heatingFollowUp === true, `got ${session.collectedData.heatingFollowUp}`);

  // Turn 9: Heating follow-up — "gradsko"
  res = await sendMessage(session, "gradsko");
  assert("S1-T9: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T9: nextField=ac", res.nextField === "ac", `got ${res.nextField}`);
  assert("S1-T9: heating=district", session.collectedData.heating === "district" && session.collectedData.heatingType === "district", `got ${session.collectedData.heating}/${session.collectedData.heatingType}`);

  // Turn 10: AC
  res = await sendMessage(session, "klima inverter");
  assert("S1-T10: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T10: nextField=parking", res.nextField === "parking", `got ${res.nextField}`);
  assert("S1-T10: ac=true", session.collectedData.ac === true, `got ${session.collectedData.ac}`);

  // Turn 11: Parking
  res = await sendMessage(session, "garaza");
  assert("S1-T11: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T11: nextField=orientation", res.nextField === "orientation", `got ${res.nextField}`);
  assert("S1-T11: parking=true", session.collectedData.parking === true, `got ${session.collectedData.parking}`);

  // Turn 12: Orientation
  res = await sendMessage(session, "jugoistok");
  assert("S1-T12: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T12: nextField=furnished", res.nextField === "furnished", `got ${res.nextField}`);
  assert("S1-T12: orientation=jug-istok", session.collectedData.orientation === 'jug-istok', `got ${session.collectedData.orientation}`);

  // Turn 13: Furnished
  res = await sendMessage(session, "kompletno namesten");
  assert("S1-T13: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T13: nextField=yearBuilt", res.nextField === "yearBuilt", `got ${res.nextField}`);
  assert("S1-T13: furnished=true", session.collectedData.furnished === true && session.collectedData.furnishedLevel === 'full', `got ${session.collectedData.furnished}`);

  // Turn 14: Year built
  res = await sendMessage(session, "2015 godina");
  assert("S1-T14: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T14: nextField=renovated", res.nextField === "renovated", `got ${res.nextField}`);
  assert("S1-T14: yearBuilt=2015", session.collectedData.yearBuilt === 2015, `got ${session.collectedData.yearBuilt}`);
  // "2015 godina" should NOT trigger renovated (no renovation word)
  assert("S1-T14: renovated NOT auto-set", session.collectedData.renovated === undefined, `got ${session.collectedData.renovated}`);

  // Turn 15: Renovated (with year embedded)
  res = await sendMessage(session, "da renoviran 2020ta");
  assert("S1-T15: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T15: nextField=documentationClean", res.nextField === "documentationClean", `got ${res.nextField}`);
  assert("S1-T15: renovated=true", session.collectedData.renovated === true, `got ${session.collectedData.renovated}`);
  assert("S1-T15: renovationYear=2020", session.collectedData.renovationYear === 2020, `got ${session.collectedData.renovationYear}`);

  // Turn 16: Documentation
  res = await sendMessage(session, "cist imoten list");
  assert("S1-T16: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T16: nextField=photos", res.nextField === "photos", `got ${res.nextField}`);
  assert("S1-T16: documentationClean=true", session.collectedData.documentationClean === true, `got ${session.collectedData.documentationClean}`);

  // Turn 17: Photos — "da, imam sliki" → Viber pending
  res = await sendMessage(session, "da, imam sliki");
  assert("S1-T17: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T17: nextField=ownerName", res.nextField === "ownerName", `got ${res.nextField}`);
  assert("S1-T17: photos=VIBER_PENDING", session.collectedData.photosStatus === "VIBER_PENDING", `got ${session.collectedData.photosStatus}`);

  // Turn 18: Owner name
  res = await sendMessage(session, "Zoran Atanasov");
  assert("S1-T18: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T18: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S1-T18: ownerName=Zoran Atanasov", session.collectedData.ownerName === "Zoran Atanasov", `got ${session.collectedData.ownerName}`);

  // Turn 19: Address → CLOSED
  res = await sendMessage(session, "Jane Sandanski 45");
  assert("S1-T19: type=CLOSED", res.type === "CLOSED", `got ${res.type}`);
  assert("S1-T19: address=Jane Sandanski 45", session.collectedData.address === "Jane Sandanski 45", `got ${session.collectedData.address}`);

  // Verify all fields collected
  const expected = {
    cooperationAccepted: true,
    transactionType: 'sale',
    propertyType: 'apartment',
    cleanPrice: 120000,
    totalSqm: 55,
    hasTerrace: true,
    terraceSqm: 15,
    bedrooms: 2,
    floor: 3,
    totalFloors: 10,
    elevator: true,
    heating: 'district',
    heatingType: 'district',
    ac: true,
    parking: true,
    orientation: 'jug-istok',
    furnished: true,
    furnishedLevel: 'full',
    yearBuilt: 2015,
    renovated: true,
    renovationYear: 2020,
    documentationClean: true,
    photosStatus: 'VIBER_PENDING',
    photos: true,
    photosPermission: true,
    photosSource: 'VIBER_PENDING',
    ownerName: 'Zoran Atanasov',
    address: 'Jane Sandanski 45'
  };
  const mismatch = verifyFields(session.collectedData, expected);
  assert("S1-T19: all fields correct", !mismatch, mismatch);

  console.log(`   ✔ Scenario 1 complete: 19 turns, all fields correct`);
}

// ========================================
// SCENARIO 2: Sale (bulk — multi-field extraction)
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 2: Sale — Bulk multi-field extraction`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario2() {
  const session = createSession('sale');
  let res;

  // Turn 1: Price + sqm + bedrooms + floor all in one message
  res = await sendMessage(session, "120 iljadi, 55 m2, 2 spalni, 3 kat");
  assert("S2-T1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S2-T1: cleanPrice=120000", session.collectedData.cleanPrice === 120000, `got ${session.collectedData.cleanPrice}`);
  assert("S2-T1: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);
  assert("S2-T1: bedrooms=2", session.collectedData.bedrooms === 2, `got ${session.collectedData.bedrooms}`);
  assert("S2-T1: floor=3", session.collectedData.floor === 3, `got ${session.collectedData.floor}`);
  // Next field should be terraceSqm (terrace-specific word NOT present in input)
  assert("S2-T1: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);

  // Turn 2: Terrace + totalFloors in one message (+ lift for elevator)
  res = await sendMessage(session, "ima terasa 15m2, 10katnica, lift");
  assert("S2-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S2-T2: hasTerrace=true", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S2-T2: terraceSqm=15", session.collectedData.terraceSqm === 15, `got ${session.collectedData.terraceSqm}`);
  assert("S2-T2: totalFloors=10", session.collectedData.totalFloors === 10, `got ${session.collectedData.totalFloors}`);
  assert("S2-T2: elevator=true", session.collectedData.elevator === true, `got ${session.collectedData.elevator}`);
  // Next: should be heating (not heatingFollowUp since "parno" not mentioned)
  assert("S2-T2: nextField=heating", res.nextField === "heating", `got ${res.nextField}`);

  // Turn 3: Heating + ac + parking all in one (and tell parno is gradsko)
  res = await sendMessage(session, "parno gradsko, klima, garaza");
  // "parno" triggers follow-up
  if (session.collectedData.heatingFollowUp) {
    // Answer the follow-up
    res = await sendMessage(session, "gradsko");
  }
  // After heating resolved, check ac and parking
  // (global extraction already extracted them)
  let steps = 0;
  while (steps < 15) {
    steps++;
    const known = { ...session.adMemory, ...session.collectedData };
    const { getNextMissingField } = await import('./workflow.js');
    const nextField = getNextMissingField(known);
    if (!nextField) {
      // All fields collected — close
      res = await sendMessage(session, "Zoran Atanasov, Jane Sandanski 45");
      if (res.type !== "CLOSED" && res.nextField === 'ownerName') {
        res = await sendMessage(session, "Zoran Atanasov");
      }
      if (res.type !== "CLOSED" && res.nextField === 'address') {
        res = await sendMessage(session, "Jane Sandanski 45");
      }
      if (res.type === "CLOSED") {
        assert("S2-END: close message received", true, "");
        break;
      }
    }
    if (res.type === "CLOSED") break;

    const answers = {
      'ac': "klima",
      'parking': "garaza",
      'orientation': "jugoistok",
      'furnished': "kompletno namesten",
      'yearBuilt': "2015",
      'renovated': "da renoviran 2020ta",
      'documentationClean': "cist imoten list",
      'photos': "da imam",
      'ownerName': "Zoran Atanasov",
      'address': "Jane Sandanski 45"
    };
    const answer = answers[nextField] || "ne znam";
    res = await sendMessage(session, answer);
  }

  assert("S2-END: all fields collected",
    steps < 15 && res.type === "CLOSED",
    `steps=${steps}, type=${res.type}`);

  console.log(`   ✔ Scenario 2 complete: bulk extraction verified`);
}

// ========================================
// SCENARIO 3: Rent (sequential)
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 3: Rent — Sequential fields`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario3() {
  const session = createSession('rent');
  let res;

  // Turn 1: Monthly rent
  res = await sendMessage(session, "500 evra mesecno");
  assert("S3-T1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T1: nextField=totalSqm", res.nextField === "totalSqm", `got ${res.nextField}`);
  assert("S3-T1: monthlyRent=500", session.collectedData.monthlyRent === 500, `got ${session.collectedData.monthlyRent}`);
  assert("S3-T1: cleanPrice NOT extracted", session.collectedData.cleanPrice === undefined, `got ${session.collectedData.cleanPrice}`);

  // Turn 2: Total sqm
  res = await sendMessage(session, "55 kvadrati");
  assert("S3-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T2: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);
  assert("S3-T2: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);

  // Turn 3: Terrace — "nema" → no terrace
  res = await sendMessage(session, "nema");
  assert("S3-T3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T3: nextField=bedrooms", res.nextField === "bedrooms", `got ${res.nextField}`);
  assert("S3-T3: hasTerrace=false", session.collectedData.hasTerrace === false && session.collectedData.terraceSqm === 0, `got ${session.collectedData.hasTerrace}/${session.collectedData.terraceSqm}`);

  // Turn 4: Bedrooms
  res = await sendMessage(session, "2 spalni");
  assert("S3-T4: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T4: nextField=floor", res.nextField === "floor", `got ${res.nextField}`);
  assert("S3-T4: bedrooms=2", session.collectedData.bedrooms === 2, `got ${session.collectedData.bedrooms}`);

  // Turn 5: Floor
  res = await sendMessage(session, "4 kat");
  assert("S3-T5: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T5: nextField=totalFloors", res.nextField === "totalFloors", `got ${res.nextField}`);
  assert("S3-T5: floor=4", session.collectedData.floor === 4, `got ${session.collectedData.floor}`);

  // Turn 6: Total floors
  res = await sendMessage(session, "10katnica");
  assert("S3-T6: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T6: nextField=elevator", res.nextField === "elevator", `got ${res.nextField}`);
  assert("S3-T6: totalFloors=10", session.collectedData.totalFloors === 10, `got ${session.collectedData.totalFloors}`);

  // Turn 7: Elevator
  res = await sendMessage(session, "ima lift");
  assert("S3-T7: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T7: nextField=heating", res.nextField === "heating", `got ${res.nextField}`);
  assert("S3-T7: elevator=true", session.collectedData.elevator === true, `got ${session.collectedData.elevator}`);

  // Turn 8: Heating — "parno" triggers follow-up
  res = await sendMessage(session, "parno");
  assert("S3-T8: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T8: follow-up question", res.text.includes("Какво") || res.text.includes("парно"), `got ${res.text.substring(0, 30)}`);

  // Turn 9: Heating follow-up answer
  res = await sendMessage(session, "gradsko");
  assert("S3-T9: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T9: nextField=ac", res.nextField === "ac", `got ${res.nextField}`);
  assert("S3-T9: heating=district", session.collectedData.heating === "district", `got ${session.collectedData.heating}`);

  // Fast forward through remaining fields
  const remaining = [
    { input: "klima", field: "ac", val: true },
    { input: "garaza", field: "parking", val: true },
    { input: "jugoistok", field: "orientation", val: 'jug-istok' },
    { input: "kompletno namesten", field: "furnished", val: true },
    { input: "2015 godina", field: "yearBuilt", val: 2015 },
    { input: "da renoviran 2020ta", field: "renovated", val: true },
    { input: "cist imoten list", field: "documentationClean", val: true },
    { input: "da imam", field: "photosStatus", val: "VIBER_PENDING" },
    { input: "Zoran Atanasov", field: "ownerName", val: "Zoran Atanasov" },
    { input: "Jane Sandanski 45", field: "address", val: "Jane Sandanski 45" },
  ];

  for (let i = 0; i < remaining.length; i++) {
    res = await sendMessage(session, remaining[i].input);
    const isLast = i === remaining.length - 1;
    if (isLast) {
      assert("S3-END: close message", res.type === "CLOSED", `got ${res.type}`);
    } else {
      assert(`S3-T${10 + i}: ${remaining[i].field} extracted`, session.collectedData[remaining[i].field] === remaining[i].val,
        `${remaining[i].field}: got ${JSON.stringify(session.collectedData[remaining[i].field])}`);
    }
  }

  console.log(`   ✔ Scenario 3 complete: rent flow verified`);
}


// ========================================
// RUN ALL SCENARIOS
// ========================================
(async () => {
  try {
    console.log(`\n================================================================`);
    console.log(`🎭 E2E CAMPAIGN SIMULATION`);
    console.log(`================================================================`);
    console.log(`Testing generateResponse() in DATA_COLLECTION phase`);
    console.log(`(no Groq API needed — cooperationAccepted=true)`);

    await runScenario1();
    await runScenario2();
    await runScenario3();

    // SUMMARY
    console.log(`\n=======================================================`);
    console.log(`📊 E2E CAMPAIGN TEST SUMMARY:`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📋 Total:  ${passed + failed}`);
    console.log(`=======================================================`);

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log(`\n🟢 ALL E2E CAMPAIGN TESTS PASSED`);
    }
  } catch (e) {
    console.error(`\n💥 FATAL ERROR:`, e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
