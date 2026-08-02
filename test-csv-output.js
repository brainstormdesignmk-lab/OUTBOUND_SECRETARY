import { createHarness } from './test-helpers.js';
// ========================================
// E2E TEST: parkingSeparate / parkingPrice in CSV + property.json output
// ========================================
// Verifies that when an owner says the parking is sold separately
// (e.g. "+6000 parking"), the two derived fields:
//   1. Appear as dedicated COLUMNS in the collected-leads CSV (with correct
//      values in the row written for this lead), and
//   2. Appear in the generated property.json for that property folder.
//
// Also verifies the CSV HEADER MIGRATION path used when the CSV file already
// exists with the pre-migration 32/40-column layout:
//   - old sale rows (32 cols) get two empty fields inserted after parkingType
//   - rows containing a comma inside a value are left untouched (not misaligned)
//   - an empty-but-existing file must NOT get a leading blank line
//
// Robust to parallel runs: the CSV row is located by the unique test phone
// number (not by "last line"), and the property folder by leadPhone match.
// The shared CSV is backed up at start and restored in the finally block.
// ========================================
import { generateResponse } from './service.js';
import fs from 'fs';
import { config } from './config.js';

const harness = createHarness();
const assert = harness.assert;

// Paths come from config (project-root-relative, env-overridable) — NOT
// hardcoded /home/metropolis2/... paths from the old machine (migration fix).
const CSV_PATH = config.CSV_OUTPUT_PATH;
const PROPERTY_ROOT = config.PROPERTY_ROOT;

// Pre-migration headers (what saveToCSV wrote before the two new columns)
const OLD_SALE_HEADER = 'phone,formattedPhone,propertyId,transactionType,price,sqm,hasTerrace,terraceSqm,bedrooms,floor,totalFloors,elevator,heating,heatingType,ac,parking,parkingType,orientation,orientationPrimary,orientationSecondary,furnished,furnishedLevel,yearBuilt,renovated,renovationYear,documentationClean,documentationIssues,photosPermission,photosSource,photosStatus,ownerName,address';

// A well-formed old sale row (exactly 32 fields)
const OLD_SALE_ROW = '+38970123456,+38970123456,101,sale,183000,58,true,10,4,6,10,true,district,district,true,true,private,jug-zapad,,,true,full,1985,false,,false,ostavinska,true,VIBER_PENDING,VIBER_PENDING,Old Owner,Old Address';

// A row whose address contains a comma (splits into > 32 parts) — must be left untouched
const OLD_SALE_ROW_COMMA = '+38970123457,+38970123457,102,sale,120000,65,false,0,3,4,8,true,district,district,true,true,garage,istok,,,false,,2015,false,,true,,true,,,Old Comma,User, Address With, Comma';



// ========================================
// HELPER: Create a fully-collected session (all fields filled → immediate CLOSE)
// ========================================
function createSession(phone) {
  return {
    adMemory: {
      transactionType: 'sale',
      propertyType: 'apartment',
      propertyLabel: 'станот',
      sourcePortal: 'test',
      adUrl: 'https://test.com/ad',
      photoUrls: []
    },
    collectedData: {
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
      parkingType: 'private',
      parkingSeparate: true,
      parkingPrice: 6000,
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
      photosSource: 'VIBER_PENDING',
      ownerName: 'Goran Petrov',
      address: 'Jane Sandanski 45'
    },
    messages: [],
    phone: phone
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
// RUN
// ========================================
(async () => {
  console.log(`\n================================================================`);
  console.log(`🎯 CSV + property.json OUTPUT — parkingSeparate/parkingPrice`);
  console.log(`================================================================`);

  // Back up the shared CSV so this test is non-destructive
  let csvBackup = null;
  if (fs.existsSync(CSV_PATH)) {
    csvBackup = fs.readFileSync(CSV_PATH, 'utf8');
  }

  try {
    // ========================================
    // SCENARIO A: normal flow → CSV row + property.json contain the fields
    // ========================================
    console.log(`\n--- Scenario A: normal CLOSE → CSV + property.json ---`);
    const sessionA = createSession('+38970222222');
    const resA = await sendMessage(sessionA, "fala mnogu, dogovoreno");
    assert("A: type=CLOSE (all fields collected)", resA.type === "CLOSE", `got ${resA.type}`);

    if (!fs.existsSync(CSV_PATH)) {
      assert(`A: CSV exists at ${CSV_PATH}`, false, 'file not found');
    } else {
      const content = fs.readFileSync(CSV_PATH, 'utf8');
      const lines = content.trim().split('\n');
      const header = lines[0].split(',');
      const idxSep = header.indexOf('parkingSeparate');
      const idxPrice = header.indexOf('parkingPrice');

      assert("A: CSV header contains 'parkingSeparate' column", idxSep > 0, `index=${idxSep}`);
      assert("A: CSV header contains 'parkingPrice' column", idxPrice > 0, `index=${idxPrice}`);

      const myRow = lines.slice(1).map(l => l.split(',')).find(r => r[0] === '+38970222222');
      assert("A: row written for the test phone", !!myRow, `not found in ${lines.length - 1} data rows`);
      if (myRow) {
        assert("A: CSV parkingSeparate=true", myRow[idxSep] === 'true', `got ${myRow[idxSep]}`);
        assert("A: CSV parkingPrice=6000", myRow[idxPrice] === '6000', `got ${myRow[idxPrice]}`);
        const idxType = header.indexOf('parkingType');
        const idxOrient = header.indexOf('orientation');
        assert("A: CSV parkingType='private' intact", myRow[idxType] === 'private', `got ${myRow[idxType]}`);
        assert("A: CSV orientation='jug-zapad' intact", myRow[idxOrient] === 'jug-zapad', `got ${myRow[idxOrient]}`);
      }
    }

    // property.json check
    if (!fs.existsSync(PROPERTY_ROOT)) {
      assert("A: PROPERTY_ROOT exists", false, 'folder not found');
    } else {
      const folders = fs.readdirSync(PROPERTY_ROOT).filter(f => /^\d+$/.test(f));
      let found = false;
      for (const folder of folders) {
        try {
          const pjPath = `${PROPERTY_ROOT}/${folder}/property.json`;
          if (!fs.existsSync(pjPath)) continue;
          const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
          if (pj.leadPhone === '+38970222222') {
            found = true;
            assert(`A: property folder ${folder} found for test phone`, true, '');
            assert("A: property.json parkingSeparate=true", pj.parkingSeparate === true, `got ${JSON.stringify(pj.parkingSeparate)}`);
            assert("A: property.json parkingPrice=6000", pj.parkingPrice === 6000, `got ${JSON.stringify(pj.parkingPrice)}`);
            assert("A: property.json parking=true intact", pj.parking === true, `got ${pj.parking}`);
            assert("A: property.json parkingType='private' intact", pj.parkingType === 'private', `got ${pj.parkingType}`);
            break;
          }
        } catch (e) { /* skip unrelated folders */ }
      }
      assert("A: property folder found for test phone (leadPhone match)", found, 'not found in any folder');
    }

    // ========================================
    // SCENARIO B: header migration on an existing OLD-format CSV
    // ========================================
    console.log(`\n--- Scenario B: migration of existing old-format CSV ---`);
    fs.writeFileSync(CSV_PATH, OLD_SALE_HEADER + '\n' + OLD_SALE_ROW + '\n' + OLD_SALE_ROW_COMMA + '\n');
    const sessionB = createSession('+38970222223');
    const resB = await sendMessage(sessionB, "fala");
    assert("B: type=CLOSE", resB.type === "CLOSE", `got ${resB.type}`);

    const linesB = fs.readFileSync(CSV_PATH, 'utf8').trim().split('\n');
    const headerB = linesB[0].split(',');
    assert("B: header migrated → has parkingSeparate", headerB.includes('parkingSeparate'), `got ${linesB[0].substring(0, 80)}`);
    assert("B: header migrated → has parkingPrice", headerB.includes('parkingPrice'), '');

    const migratedRow = linesB[1].split(',');
    // The old 32-col sale row is re-mapped BY NAME into the new header —
    // parkingSeparate, parkingPrice AND photosPending (which the on-disk
    // file also predates) all become empty; known columns keep their values.
    assert("B: old row re-mapped to header column count", migratedRow.length === headerB.length, `got ${migratedRow.length}, header ${headerB.length}`);
    assert("B: parkingSeparate column empty in old row", migratedRow[headerB.indexOf('parkingSeparate')] === '', '');
    assert("B: parkingPrice column empty in old row", migratedRow[headerB.indexOf('parkingPrice')] === '', '');
    assert("B: photosPending column empty in old row (predates column)", migratedRow[headerB.indexOf('photosPending')] === '', '');
    assert("B: orientation preserved by name", migratedRow[headerB.indexOf('orientation')] === 'jug-zapad', `got ${migratedRow[headerB.indexOf('orientation')]}`);
    assert("B: ownerName preserved by name", migratedRow[headerB.indexOf('ownerName')] === 'Old Owner', `got ${migratedRow[headerB.indexOf('ownerName')]}`);
    assert("B: address preserved by name", migratedRow[headerB.indexOf('address')] === 'Old Address', `got ${migratedRow[headerB.indexOf('address')]}`);
    assert("B: totalSqm preserved by name", migratedRow[headerB.indexOf('sqm')] === '58', `got ${migratedRow[headerB.indexOf('sqm')]}`);

    const commaRow = linesB[2].split(',');
    // The comma row splits into more parts than the old header's 32, so the
    // migration guard must leave it untouched — same part count as written.
    const commaPartsExpected = OLD_SALE_ROW_COMMA.split(',').length;
    assert("B: comma-containing row NOT migrated (byte-identical part count)",
      commaRow.length === commaPartsExpected, `got ${commaRow.length}, expected ${commaPartsExpected}`);

    // The new row appended after migration has correct values
    const newRowB = linesB[linesB.length - 1].split(',');
    assert("B: new row has parkingSeparate=true", newRowB[headerB.indexOf('parkingSeparate')] === 'true', '');
    assert("B: new row has parkingPrice=6000", newRowB[headerB.indexOf('parkingPrice')] === '6000', '');

    // ========================================
    // SCENARIO C: empty-but-existing CSV must not get a leading blank line
    // ========================================
    console.log(`\n--- Scenario C: empty existing CSV ---`);
    fs.writeFileSync(CSV_PATH, '');
    const sessionC = createSession('+38970222224');
    const resC = await sendMessage(sessionC, "fala");
    assert("C: type=CLOSE", resC.type === "CLOSE", `got ${resC.type}`);
    const linesC = fs.readFileSync(CSV_PATH, 'utf8').split('\n');
    assert("C: line 0 is the header (no leading blank line)", linesC[0].includes('parkingSeparate'), `line0=${JSON.stringify(linesC[0].substring(0, 40))}`);
    assert("C: header + 1 data row", linesC.length === 2 || (linesC[2] === undefined || linesC[2] === ''), `lines=${linesC.length}`);
    const rowC = linesC[1].split(',');
    assert("C: new row parkingSeparate=true", rowC[linesC[0].split(',').indexOf('parkingSeparate')] === 'true', '');
    assert("C: new row parkingPrice=6000", rowC[linesC[0].split(',').indexOf('parkingPrice')] === '6000', '');

  } catch (e) {
    console.error(`\n💥 FATAL ERROR:`, e.message);
    console.error(e.stack);
    harness.assert('csv test completed without fatal error', false, e.message);
  } finally {
    // Restore the shared CSV to its pre-test state (non-destructive)
    try {
      if (csvBackup !== null) {
        fs.writeFileSync(CSV_PATH, csvBackup);
        console.log(`\n   ✔ CSV restored to pre-test state (${csvBackup.split('\n').length} lines)`);
      }
    } catch (restoreError) {
      console.error(`   ⚠ Restore warning: ${restoreError.message}`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log(`\n===============================================================`);
    console.log(`📊 CSV OUTPUT TEST SUMMARY:`);
    console.log(`   ✅ Passed: ${harness.passed}`);
    console.log(`   ❌ Failed: ${harness.failed}`);
    console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
    console.log(`===============================================================`);

    if (harness.failed > 0) {
      console.log(`\n🔴 ${harness.failed} TEST(S) FAILED`);
      process.exit(1);
    } else {
      console.log(`\n🟢 ALL CSV OUTPUT TESTS PASSED`);
      process.exit(0);
    }
  }
})();
