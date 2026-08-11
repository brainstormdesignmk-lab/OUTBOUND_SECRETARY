import { createHarness } from './test-helpers.js';
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

const harness = createHarness();
const assert = harness.assert;



// ========================================
// HELPER: Create a fresh session for testing
// ========================================
function createSession(scenario = 'sale', { preAccept = false } = {}) {
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
      cooperationAccepted: preAccept ? false : true,
      transactionType: isRent ? 'rent' : 'sale',
      propertyType: 'apartment',
      // tenantPreferences pre-filled so rent-flow suites keep their original
      // question sequences (the tenant-pref flow is covered by
      // test-property-intelligence.js); inert for sale leads.
      tenantPreferences: { preferred: [], excluded: [], notes: '' }
    },
    messages: preAccept ? [
      { role: 'model', text: isRent
        ? 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?'
        : 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?'
      }
    ] : [],
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

  // Turn 16: Documentation — photos is now the LAST field (reported order
  // fix: the AWAITING_PHOTOS pause must never strand ownerName/address), so
  // the next question is ownerName.
  res = await sendMessage(session, "cist imoten list");
  assert("S1-T16: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S1-T16: nextField=ownerName (photos is last)", res.nextField === "ownerName", `got ${res.nextField}`);
  assert("S1-T16: documentationClean=true", session.collectedData.documentationClean === true, `got ${session.collectedData.documentationClean}`);

  // Turn 16b: Owner name, then address, then photos
  res = await sendMessage(session, "Zoran Atanasov");
  assert("S1-T16b: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  res = await sendMessage(session, "Jane Sandanski 45");
  assert("S1-T16c: nextField=photos", res.nextField === "photos", `got ${res.nextField}`);

  // Turn 17: Photos — "da, imam sliki" → Viber pending. ownerName/address were
  // already collected (T16b/T16c — photos is the LAST field), so there is
  // nothing left to ask → the conversation CLOSES immediately (the reported
  // stranding bug fix).
  res = await sendMessage(session, "da, imam sliki");
  assert("S1-T17: type=CLOSE (photos last — nothing left to ask)", res.type === "CLOSE", `got ${res.type}`);
  assert("S1-T17: photos=VIBER_PENDING", session.collectedData.photosStatus === "VIBER_PENDING", `got ${session.collectedData.photosStatus}`);
  assert("S1-T17: ownerName=Zoran Atanasov", session.collectedData.ownerName === "Zoran Atanasov", `got ${session.collectedData.ownerName}`);
  assert("S1-T17: address=Jane Sandanski 45", session.collectedData.address === "Jane Sandanski 45", `got ${session.collectedData.address}`);

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

  // Turn 1: Price with explicit sqm keyword → BOTH extracted (bonus pass)
  // "120 iljadi, 55 m2" has price context (iljadi) + sqm context (m2).
  // The group pass extracts cleanPrice=120000. The bonus pass then safely
  // extracts totalSqm=55 because "55 m2" is unambiguous (sqm keyword present).
  // bedrooms/floor are NOT extracted (PRICE_SENSITIVE guards block them since
  // cleanPrice was already extracted from this message).
  res = await sendMessage(session, "120 iljadi, 55 m2");
  assert("S2-T1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S2-T1: cleanPrice=120000", session.collectedData.cleanPrice === 120000, `got ${session.collectedData.cleanPrice}`);
  // totalSqm IS bonus-extracted because "55 m2" clearly indicates sqm, not price
  assert("S2-T1: totalSqm bonus-extracted=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);
  // bedrooms and floor NOT extracted (PRICE_SENSITIVE guard: price was in same message)
  assert("S2-T1: bedrooms NOT extracted with price", session.collectedData.bedrooms === undefined, `got ${session.collectedData.bedrooms}`);
  assert("S2-T1: floor NOT extracted with price", session.collectedData.floor === undefined, `got ${session.collectedData.floor}`);
  // Next field should be terraceSqm (since totalSqm was bonus-extracted)
  assert("S2-T1: nextField=terraceSqm (sqm already filled)", res.nextField === "terraceSqm", `got ${res.nextField}`);

  // Turn 2: Total sqm (separate message, as current question)
  res = await sendMessage(session, "55 kvadrati");
  assert("S2-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S2-T2: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);
  // Terrace should NOT be extracted from generic sqm (no "terasa" keyword)
  assert("S2-T2: hasTerrace NOT set from generic sqm", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);
  // Next field should be terraceSqm
  assert("S2-T2: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);

  // Turn 3: Terrace + bedrooms + floor + totalFloors + elevator in one message
  // Note: terraceSqm has NO dedicated extractor in FIELD_TO_EXTRACTOR, so the
  // preferred field logic falls through to the full global extraction pass.
  // This means bedrooms, floor, totalFloors, elevator ARE bonus-extracted.
  res = await sendMessage(session, "ima terasa 15m2, 2 spalni, 3 kat, 10katnica, lift");
  assert("S2-T3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S2-T3: hasTerrace=true", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S2-T3: terraceSqm=15", session.collectedData.terraceSqm === 15, `got ${session.collectedData.terraceSqm}`);
  assert("S2-T3: bedrooms=2", session.collectedData.bedrooms === 2, `got ${session.collectedData.bedrooms}`);
  assert("S2-T3: floor=3", session.collectedData.floor === 3, `got ${session.collectedData.floor}`);
  assert("S2-T3: totalFloors=10", session.collectedData.totalFloors === 10, `got ${session.collectedData.totalFloors}`);
  assert("S2-T3: elevator=true", session.collectedData.elevator === true, `got ${session.collectedData.elevator}`);
  // Next: should be heating (not heatingFollowUp since "parno" not mentioned)
  assert("S2-T3: nextField=heating", res.nextField === "heating", `got ${res.nextField}`);

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
      if (res.type === "CLOSE") {
        assert("S2-END: close message received", true, "");
        break;
      }
    }
    if (res.type === "CLOSE") break;

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
    steps < 15 && res.type === "CLOSE",
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
  assert("S3-T1: nextField=availableFrom (rent order: monthlyRent → availableFrom → totalSqm)", res.nextField === "availableFrom", `got ${res.nextField}`);
  assert("S3-T1: monthlyRent=500", session.collectedData.monthlyRent === 500, `got ${session.collectedData.monthlyRent}`);
  assert("S3-T1: cleanPrice NOT extracted", session.collectedData.cleanPrice === undefined, `got ${session.collectedData.cleanPrice}`);

  // Turn 1b: Available-from date
  res = await sendMessage(session, "od 1.6.2026");
  assert("S3-T1b: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S3-T1b: nextField=totalSqm", res.nextField === "totalSqm", `got ${res.nextField}`);
  assert("S3-T1b: availableFrom=2026-06-01", session.collectedData.availableFrom === "2026-06-01", `got ${session.collectedData.availableFrom}`);

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
      assert("S3-END: close message", res.type === "CLOSE", `got ${res.type}`);
    } else {
      assert(`S3-T${10 + i}: ${remaining[i].field} extracted`, session.collectedData[remaining[i].field] === remaining[i].val,
        `${remaining[i].field}: got ${JSON.stringify(session.collectedData[remaining[i].field])}`);
    }
  }

  console.log(`   ✔ Scenario 3 complete: rent flow verified`);
}


// ========================================
// SCENARIO 4: Sale — "da" acceptance → price first (regression test)
// ========================================
// Simulates the exact broken scenario from the user's campaign:
// Owner was in PERSUASION phase and said "da" to accept.
// Before the fix, isPositive("da") triggered the terrace handler's
// follow-up question BEFORE the price question.
// After the fix, nextField gate prevents terrace interruption.
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 4: Sale — "da" accept → price first`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario4() {
  // Start during persuasion (preAccept=true, cooperationAccepted=false)
  const session = createSession('sale', { preAccept: true });
  let res;

  // Turn 1: Owner accepts with "da" → should transition to DATA_COLLECTION
  //         and ask about cleanPrice FIRST (not terrace!)
  console.log(`\n  === Turn 1: Owner says "da" ===`);
  res = await sendMessage(session, "da");
  assert("S4-T1: type=QUESTION (not terrace follow-up)", res.type === "QUESTION", `got ${res.type}`);
  assert("S4-T1: nextField=cleanPrice (first in workflow)", res.nextField === "cleanPrice", `got ${res.nextField}`);
  assert("S4-T1: response asks about price", /цена/i.test(res.text), `text: ${res.text.substring(0, 60)}`);
  assert("S4-T1: cooperationAccepted=true", session.collectedData.cooperationAccepted === true, 'was not set');
  assert("S4-T1: hasTerrace NOT set (nobody mentioned it)", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);
  assert("S4-T1: terraceSqm NOT set", session.collectedData.terraceSqm === undefined, `got ${session.collectedData.terraceSqm}`);

  // Turn 2: Owner answers price — "98 iljadi" should NOT trigger terrace
  console.log(`\n  === Turn 2: Owner says "98 iljadi evra" ===`);
  res = await sendMessage(session, "98 iljadi evra");
  assert("S4-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S4-T2: nextField=totalSqm", res.nextField === "totalSqm", `got ${res.nextField}`);
  assert("S4-T2: cleanPrice=98000", session.collectedData.cleanPrice === 98000, `got ${session.collectedData.cleanPrice}`);
  // "98 iljadi" should NOT set terrace (price context, not terrace)
  assert("S4-T2: hasTerrace NOT set from price", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);
  assert("S4-T2: terraceSqm NOT set from price", session.collectedData.terraceSqm === undefined, `got ${session.collectedData.terraceSqm}`);

  // Turn 3: Owner answers sqm
  console.log(`\n  === Turn 3: Owner says "55 kvadrati" ===`);
  res = await sendMessage(session, "55 kvadrati");
  assert("S4-T3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S4-T3: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);
  assert("S4-T3: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);
  // "55 kvadrati" should NOT set terrace (generic sqm without terrace context)
  assert("S4-T3: hasTerrace NOT set from generic sqm", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);

  // Turn 4: Owner answers terrace
  console.log(`\n  === Turn 4: Owner says "ima 15m2" ===`);
  res = await sendMessage(session, "ima 15m2");
  assert("S4-T4: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S4-T4: nextField=bedrooms", res.nextField === "bedrooms", `got ${res.nextField}`);
  assert("S4-T4: hasTerrace=true", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S4-T4: terraceSqm=15", session.collectedData.terraceSqm === 15, `got ${session.collectedData.terraceSqm}`);

  // Fast-forward through remaining fields
  console.log(`\n  === Fast-forward remaining fields ===`);
  const remaining = [
    { input: "2 spalni", field: "bedrooms", val: 2 },
    { input: "3 kat", field: "floor", val: 3 },
    { input: "10katnica", field: "totalFloors", val: 10 },
    { input: "ima lift", field: "elevator", val: true },
  ];

  for (let i = 0; i < remaining.length; i++) {
    res = await sendMessage(session, remaining[i].input);
    assert(`S4-T${5 + i}: ${remaining[i].field}=${remaining[i].val}`, session.collectedData[remaining[i].field] === remaining[i].val,
      `${remaining[i].field}: got ${JSON.stringify(session.collectedData[remaining[i].field])}`);
  }

  // Verify final state: elevator was collected, no false positives
  assert("S4-END: elevator=true (last field checked)", session.collectedData.elevator === true, `got ${session.collectedData.elevator}`);
  assert("S4-END: hasTerrace correctly true", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S4-END: terraceSqm correctly 15", session.collectedData.terraceSqm === 15, `got ${session.collectedData.terraceSqm}`);
  assert("S4-END: res is QUESTION (not ERROR)", res.type === "QUESTION", `got ${res.type}`);
  console.log(`   ✔ Scenario 4 complete: "da" → price first, no terrace false positives`);
}

// ========================================
// SCENARIO 5: Terrace follow-up — "ne znam" with other info (regression test)
// ========================================
// Simulates the exact bug from the user's campaign:
// Ana asks: "Дали знаете колку квадрати е терасата?"
// Owner: "ne znam ama zgradata ima 13 sprata"
//
// Before the fix:
//   - Global extraction set totalFloors=13 (from "13 sprata")
//   - Global extraction set yearBuilt=2013 (from "13")
//   - extractTerraceNumber grabbed "13" from "13 sprata" → terraceSqm=13
//   - "ne znam" check never fired (terraceSqm was already 13)
//
// After the fix:
//   - pendingFollowUp='terraceSqm' → global extraction skipped
//   - "ne znam" check runs FIRST → hasTerrace=true, terraceSqm=null
//   - totalFloors, yearBuilt NOT extracted
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 5: Terrace follow-up — "ne znam" with other info`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario5() {
  const session = createSession('sale');
  let res;

  // Turn 1: Price
  console.log(`\n  === Turn 1: "120 iljadi evra" ===`);
  res = await sendMessage(session, "120 iljadi evra");
  assert("S5-T1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S5-T1: nextField=totalSqm", res.nextField === "totalSqm", `got ${res.nextField}`);
  assert("S5-T1: cleanPrice=120000", session.collectedData.cleanPrice === 120000, `got ${session.collectedData.cleanPrice}`);

  // Turn 2: Total sqm
  console.log(`\n  === Turn 2: "55 kvadrati" ===`);
  res = await sendMessage(session, "55 kvadrati");
  assert("S5-T2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S5-T2: nextField=terraceSqm", res.nextField === "terraceSqm", `got ${res.nextField}`);
  assert("S5-T2: totalSqm=55", session.collectedData.totalSqm === 55, `got ${session.collectedData.totalSqm}`);

  // Turn 3: "ima terasa" → triggers follow-up (sets pendingFollowUp='terraceSqm')
  console.log(`\n  === Turn 3: "ima terasa" → triggers terrace follow-up ===`);
  res = await sendMessage(session, "ima terasa");
  assert("S5-T3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S5-T3: asks about terrace size", res.text.includes("колку квадрати") || res.text.includes("m2"), `text: ${res.text.substring(0, 40)}`);
  assert("S5-T3: pendingFollowUp=terraceSqm", session.pendingFollowUp === 'terraceSqm', `got ${session.pendingFollowUp}`);
  // hasTerrace should still be undefined (we asked follow-up, haven't answered yet)
  assert("S5-T3: hasTerrace still undefined", session.collectedData.hasTerrace === undefined, `got ${session.collectedData.hasTerrace}`);

  // Turn 4: "ne znam ama zgradata ima 13 sprata" → THE BUG REPRODUCTION
  // Before fix: totalFloors=13, yearBuilt=2013, terraceSqm=13 (ALL WRONG)
  // After fix: hasTerrace=true, terraceSqm=null, no other fields extracted
  console.log(`\n  === Turn 4: "ne znam ama zgradata ima 13 sprata" ===`);
  res = await sendMessage(session, "ne znam ama zgradata ima 13 sprata");
  assert("S5-T4: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S5-T4: nextField=bedrooms (next after terrace)", res.nextField === "bedrooms", `got ${res.nextField}`);
  // Critical: terrace should be "yes, size unknown"
  assert("S5-T4: hasTerrace=true (from 'ne znam' check)", session.collectedData.hasTerrace === true, `got ${session.collectedData.hasTerrace}`);
  assert("S5-T4: terraceSqm=null", session.collectedData.terraceSqm === null, `got ${session.collectedData.terraceSqm}`);
  // Critical: should NOT extract from "13 sprata"
  assert("S5-T4: totalFloors NOT extracted (global skipped)", session.collectedData.totalFloors === undefined, `got ${session.collectedData.totalFloors}`);
  assert("S5-T4: yearBuilt NOT extracted (global skipped)", session.collectedData.yearBuilt === undefined, `got ${session.collectedData.yearBuilt}`);
  // pendingFollowUp should be cleared
  assert("S5-T4: pendingFollowUp cleared", session.pendingFollowUp === null, `got ${session.pendingFollowUp}`);

  console.log(`   ✔ Scenario 5 complete: "ne znam" with unrelated info handled correctly`);
}

// ========================================
// SCENARIO 6: ownerName chatty-tail truncation (regression test)
// ========================================
// Owner replies to "Како да ве запишам?" with chatty text appended after
// the name (e.g. "GORAN I BI SAKALDA DA SE ZAPOZNAEME" = "Goran, and I would
// like to get to know you"). Only the actual name must be stored.
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📋 SCENARIO 6: ownerName chatty-tail truncation`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

async function runScenario6() {
  // Each truncation case runs on a FRESH session. Once ownerName is stored,
  // nextField moves to address — a second name message on the same session
  // would be blindly captured by the address handler (nextField === 'address'),
  // which broke the original sequential version of this test.
  const nameSession = () => {
    const session = createSession('sale');
    // Pre-fill all fields except ownerName/address so nextField=ownerName
    session.collectedData = {
      cooperationAccepted: true,
      transactionType: 'sale',
      propertyType: 'apartment',
      cleanPrice: 183000,
      totalSqm: 58,
      hasTerrace: true,
      terraceSqm: 10,
      bedrooms: 4,
      floor: 6,
      totalFloors: 10,
      elevator: true,
      heating: 'district',
      heatingType: 'district',
      ac: true,
      parking: true,
      orientation: 'jug-zapad',
      furnished: true,
      furnishedLevel: 'full',
      yearBuilt: 1985,
      renovated: false,
      documentationClean: false,
      documentationIssues: 'ostavinska',
      photosStatus: 'VIBER_PENDING',
      photos: true,
      photosPermission: true,
      photosSource: 'VIBER_PENDING'
    };
    return session;
  };

  let session;
  let res;

  // Case 1: Chatty tail after name → only "Goran" stored
  session = nameSession();
  res = await sendMessage(session, "GORAN I BI SAKALDA DA SE ZAPOZNAEME");
  assert("S6-C1: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S6-C1: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C1: ownerName=Goran (tail truncated)", session.collectedData.ownerName === "Goran", `got ${session.collectedData.ownerName}`);

  // Case 2: Punctuation-truncated name — "Zoran Atanasov. Ke se javam utre"
  session = nameSession();
  res = await sendMessage(session, "ZORAN ATANASOV. KE SE JAVAM UTRE");
  assert("S6-C2: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S6-C2: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C2: ownerName=Zoran Atanasov (period cut)", session.collectedData.ownerName === "Zoran Atanasov", `got ${session.collectedData.ownerName}`);

  // Case 3: Plain name — no chatty tail, stored as-is
  session = nameSession();
  res = await sendMessage(session, "MARINA STOJANOVA");
  assert("S6-C3: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S6-C3: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C3: ownerName=Marina Stojanova", session.collectedData.ownerName === "Marina Stojanova", `got ${session.collectedData.ownerName}`);

  // Case 4: Surname containing "mislam" must NOT be truncated (letter-boundary guard)
  session = nameSession();
  res = await sendMessage(session, "STOJAN MISLAMOV");
  assert("S6-C4: type=QUESTION", res.type === "QUESTION", `got ${res.type}`);
  assert("S6-C4: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C4: ownerName=Stojan Mislamov (surname preserved)", session.collectedData.ownerName === "Stojan Mislamov", `got ${session.collectedData.ownerName}`);

  // Case 5: "Mislamovski" surname also preserved
  session = nameSession();
  res = await sendMessage(session, "ZORAN MISLAMOVSKI");
  assert("S6-C5: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C5: ownerName=Zoran Mislamovski (surname preserved)", session.collectedData.ownerName === "Zoran Mislamovski", `got ${session.collectedData.ownerName}`);

  // Case 6: Comma + conversational tail → name only, trailing comma stripped
  session = nameSession();
  res = await sendMessage(session, "GORAN, MISLAM DEKA SI DOBRA");
  assert("S6-C6: nextField=address", res.nextField === "address", `got ${res.nextField}`);
  assert("S6-C6: ownerName=Goran (comma + tail stripped)", session.collectedData.ownerName === "Goran", `got ${session.collectedData.ownerName}`);

  // Final: address → CLOSE (continues the Case 6 session)
  // NOTE: the address handler stores the raw trimmed input (no title-casing),
  // so the message is sent title-cased to match the stored value exactly.
  res = await sendMessage(session, "Jane Sandanski 45");
  assert("S6-FINAL: type=CLOSE", res.type === "CLOSE", `got ${res.type}`);
  assert("S6-FINAL: address=Jane Sandanski 45", session.collectedData.address === "Jane Sandanski 45", `got ${session.collectedData.address}`);

  console.log(`   ✔ Scenario 6 complete: ownerName truncation verified`);
}

// ========================================
// RUN ALL SCENARIOS
// ========================================
(async () => {
  try {
    console.log(`\n================================================================`);
    console.log(`🎭 E2E CAMPAIGN SIMULATION`);
    console.log(`================================================================`);

    await runScenario1();
    await runScenario2();
    await runScenario3();
    await runScenario4();
    await runScenario5();
    await runScenario6();

    // SUMMARY
    console.log(`\n=======================================================`);
    console.log(`📊 E2E CAMPAIGN TEST SUMMARY:`);
    console.log(`   ✅ Passed: ${harness.passed}`);
    console.log(`   ❌ Failed: ${harness.failed}`);
    console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
    console.log(`=======================================================`);

    if (harness.failed > 0) {
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
