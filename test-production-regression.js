import { createHarness } from './test-helpers.js';
// ========================================
// REGRESSION TEST: Exact production conversation
// ========================================
// Replays the REAL offensive lead conversation from the production log and
// asserts the corrected behavior:
//
//   OLD (bug): "SAKAM DA MI GOPUSIS KUROT ANA" on FIRST offense → silent
//              TERMINATE (strike 3), zero warnings sent.
//   NEW (fixed): the vulgar "DALI SE EBETE ZA PROVIZIJA ?" → WARNING (strike 1),
//              then "SAKAM DA MI GOPUSIS KUROT ANA" → WARNING (strike 2),
//              then repeated → TERMINATE (strike 3) + blocklist.
//
// This guards against the exact regression the user reported:
// "she does not say anything just closes on the third offense. no warnings."
//
// NOTE: uses a SYNTHETIC test number. The real production number from the log
// (+38970123456) is genuinely blocked in production data — this test would
// un-block it during cleanup. The phone value is irrelevant to the logic tested.
// ========================================
import { generateResponse } from './service.js';
import { isNumberBlocked, loadBlocklist, BLOCKLIST_PATH, STRIKE_1_RESPONSES } from './offensive-filter.js';
import { AGE_DEFLECTION_RESPONSES_SALE } from './objections.js';
import { writeFileSync } from 'fs';

const TEST_PHONE = '38970987654'; // synthetic — never collide with real production numbers

let crashed = false;

const harness = createHarness();
const assert = harness.assert;

// ========================================
// HELPER: Fresh session identical to the production lead
// ========================================
function createProductionSession() {
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
      cooperationAccepted: false,
      transactionType: 'sale',
      propertyType: 'apartment'
    },
    messages: [
      { role: 'model', text: 'Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за станот што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?' }
    ],
    phone: `+${TEST_PHONE}`
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
  try {
    console.log(`\n================================================================`);
    console.log(`🎭 REGRESSION: Exact production conversation (+${TEST_PHONE})`);
    console.log(`================================================================`);

    const session = createProductionSession();

    // === Pre-offense normal turns (from the real log) ===
    // IMPORTANT: only include turns that hit HARDCODED handlers (client question,
    // commission, legal costs, how-it-works) — these return NORMAL without calling
    // the Groq LLM, so this test runs fully OFFLINE. Turns that reach the
    // PERSUASION phase (e.g. "KOLKU GODINI IMAS ANA ?", "ODLICNO MI ZVUCI...")
    // would make real API calls and are deliberately excluded.
    const normalTurns = [
      'IMATE KLIENTI ZAINTERESIRANI?',          // hardcoded client handler
      'IMATE NEKOJ ZAINTERESIRAN?',             // hardcoded client handler (nekoj family)
      'VE PRASUVAM DALI VIE IMATE NEKOJ ZAINTERESIRAN?', // hardcoded client handler (nekoj family)
      'OBJASNI MI MOLIMTE KAKO RABOTITE BEZ PROVIZIJA ?', // hardcoded commission-explanation
      'KAKVI DAVACKI IMAM JAS PREMA VAS AKO NE PLAKJAM PROVIZIJA?', // hardcoded commission
      'KOJPLAKJA ADVOKAT , NOTAR ?'             // hardcoded legal costs
    ];
    for (const turn of normalTurns) {
      await sendMessage(session, turn);
    }
    let normalOk = true;
    for (const turn of normalTurns) {
      const r = await sendMessage(session, turn);
      if (r.type !== 'NORMAL') normalOk = false;
    }
    assert(`Hardcoded normal turns (${normalTurns.length}) → zero strikes`,
      (session.offensiveStrikes || 0) === 0 && normalOk,
      `strikes=${session.offensiveStrikes}, allNORMAL=${normalOk}`);

    // === OFFENSE 1: the vulgar "DALI SE EBETE ZA PROVIZIJA ?" ===
    // This was the message that slipped through in production with NO warning.
    // With the ебам/ебете pattern it must now produce WARNING (strike 1).
    let res = await sendMessage(session, 'DALI SE EBETE ZA PROVIZIJA ?');
    assert('Offense 1 ("DALI SE EBETE..."): type=WARNING', res.type === 'WARNING', `got ${res.type}`);
    assert('Offense 1: strike counter=1', session.offensiveStrikes === 1, `got ${session.offensiveStrikes}`);
    assert('Offense 1: Macedonian professional rebuff text sent', STRIKE_1_RESPONSES.includes(res.text),
      `got: "${res.text}"`);
    assert('Offense 1: warning text is NOT the terminate string', res.text !== 'TERMINATE_SESSION', `got "${res.text}"`);

    // === OFFENSE 2: the exact "SAKAM DA MI GOPUSIS KUROT ANA" ===
    // In the buggy log this message terminated instantly (STRIKE 1/3 → strike 3).
    // Now it must be the FINAL warning (strike 2) — Ana still says something.
    res = await sendMessage(session, 'SAKAM DA MI GOPUSIS KUROT ANA');
    assert('Offense 2 ("SAKAM DA MI GOPUSIS KUROT ANA"): type=WARNING', res.type === 'WARNING', `got ${res.type}`);
    assert('Offense 2: strike counter=2', session.offensiveStrikes === 2, `got ${session.offensiveStrikes}`);
    assert('Offense 2: final warning text sent', res.text.includes('последна опомена') || res.text.includes('опомена'),
      `got: "${res.text}"`);
    assert('Offense 2: final warning text, not terminate', res.text !== 'TERMINATE_SESSION', `got "${res.text}"`);

    // === OFFENSE 3: repeated → TERMINATE (strike 3) + blocklist ===
    res = await sendMessage(session, 'SAKAM DA MI GOPUSIS KUROT ANA');
    assert('Offense 3: type=TERMINATE', res.type === 'TERMINATE', `got ${res.type}`);
    assert('Offense 3: strike counter=3', session.offensiveStrikes === 3, `got ${session.offensiveStrikes}`);
    assert('Offense 3: text=TERMINATE_SESSION', res.text === 'TERMINATE_SESSION', `got "${res.text}"`);

    // === EARLY WARNING: flirtatious/sexual advances (new) ===
    // The user asked that the professional rebuff (STRIKE_1_RESPONSES, in
    // Macedonian) fire EARLY — on the flirtatious advances from the production
    // log that previously slipped through as normal INTERESTED turns.
    // Fresh session:
    //   "OSTRO A ? SAKAM OSTRI ZENSKI"  → WARNING (strike 1)
    //   "KE BIDES LI FINO DEVOJCE ZA MENE ANA ?" → WARNING (strike 2)
    const flirtSession = createProductionSession();
    let fres = await sendMessage(flirtSession, 'OSTRO A ? SAKAM OSTRI ZENSKI');
    assert('Early warning 1 ("OSTRO A ? SAKAM OSTRI ZENSKI"): type=WARNING', fres.type === 'WARNING', `got ${fres.type}`);
    assert('Early warning 1: strike counter=1', flirtSession.offensiveStrikes === 1, `got ${flirtSession.offensiveStrikes}`);
    assert('Early warning 1: Macedonian professional rebuff text sent', STRIKE_1_RESPONSES.includes(fres.text), `got: "${fres.text}"`);

    fres = await sendMessage(flirtSession, 'KE BIDES LI FINO DEVOJCE ZA MENE ANA ?');
    assert('Early warning 2 ("KE BIDES LI FINO DEVOJCE..."): type=WARNING', fres.type === 'WARNING', `got ${fres.type}`);
    assert('Early warning 2: strike counter=2', flirtSession.offensiveStrikes === 2, `got ${flirtSession.offensiveStrikes}`);
    assert('Early warning 2: final warning text sent', fres.text.includes('последна опомена') || fres.text.includes('опомена'), `got: "${fres.text}"`);
    assert('Early warning 2: not terminate', fres.text !== 'TERMINATE_SESSION', `got "${fres.text}"`);

    // === CATALOG EARLY WARNING: user-approved variants across severities ===
    // One representative from each new catalog category must ALSO fire the
    // professional rebuff on strike 1 (fresh sessions, offline — these are
    // caught by the filter before any LLM call):
    const catSession = createProductionSession();
    let cres = await sendMessage(catSession, 'SAKAM DA MI BIDES DEVOJKA');   // catalog S1 (sexual)
    assert('Catalog S1 ("SAKAM DA MI BIDES DEVOJKA"): type=WARNING', cres.type === 'WARNING', `got ${cres.type}`);
    assert('Catalog S1: Macedonian professional rebuff', STRIKE_1_RESPONSES.includes(cres.text) && cres.text !== 'TERMINATE_SESSION', `got: "${cres.text}"`);

    const catSession2 = createProductionSession();
    cres = await sendMessage(catSession2, 'KOLKU GODINI IMAS ANA ?');         // age question → hardcoded deflection (NOT a strike)
    assert('Age question ("KOLKU GODINI IMAS ANA ?"): type=NORMAL (deflection)', cres.type === 'NORMAL', `got ${cres.type}`);
    assert('Age question: hardcoded deflection text', AGE_DEFLECTION_RESPONSES_SALE.includes(cres.text), `got: "${cres.text}"`);
    assert('Age question: zero strikes recorded', (catSession2.offensiveStrikes || 0) === 0, `got ${catSession2.offensiveStrikes}`);

    const catSession3 = createProductionSession();
    cres = await sendMessage(catSession3, 'ZAMOLCHI VECHE');                   // catalog O1 (insult)
    assert('Catalog O1 ("ZAMOLCHI VECHE"): type=WARNING', cres.type === 'WARNING', `got ${cres.type}`);
    assert('Catalog O1: Macedonian professional rebuff', STRIKE_1_RESPONSES.includes(cres.text) && cres.text !== 'TERMINATE_SESSION', `got: "${cres.text}"`);

    const catSession4 = createProductionSession();
    cres = await sendMessage(catSession4, 'EDVAJ CEKAM DA TE ZAPOZNAAM');      // catalog C12 (flirt from log)
    assert('Catalog C12 ("EDVAJ CEKAM DA TE ZAPOZNAAM"): type=WARNING', cres.type === 'WARNING', `got ${cres.type}`);
    assert('Catalog C12: Macedonian professional rebuff', STRIKE_1_RESPONSES.includes(cres.text) && cres.text !== 'TERMINATE_SESSION', `got: "${cres.text}"`);

    const catSession5 = createProductionSession();
    cres = await sendMessage(catSession5, 'DALI IMA GRATIS PUSENJE SO TOA ?'); // NEW: oral-sex production miss (was INTERESTED)
    assert('Oral-sex miss ("DALI IMA GRATIS PUSENJE SO TOA ?"): type=WARNING', cres.type === 'WARNING', `got ${cres.type}`);
    assert('Oral-sex miss: strike counter=1', catSession5.offensiveStrikes === 1, `got ${catSession5.offensiveStrikes}`);
    assert('Oral-sex miss: Macedonian professional rebuff', STRIKE_1_RESPONSES.includes(cres.text) && cres.text !== 'TERMINATE_SESSION', `got: "${cres.text}"`);

    // Blocklist verified (addToBlocklist uses writeFileSync → synchronous, no wait needed)
    assert('Number IS in blocklist after strike 3', isNumberBlocked(`+${TEST_PHONE}`), `blocklist check failed`);
    const entry = loadBlocklist().find(e => e.phone === TEST_PHONE);
    assert('Blocklist reason is the detected category (sexual)', entry && entry.reason === 'sexual', `got ${JSON.stringify(entry)}`);

  } catch (e) {
    crashed = true;
    console.error(`\n💥 FATAL ERROR:`, e.message);
    console.error(e.stack);
  } finally {
    // Cleanup: remove the test number from the blocklist
    try {
      const blocklist = loadBlocklist();
      const cleaned = blocklist.filter(e => e.phone !== TEST_PHONE);
      if (cleaned.length !== blocklist.length) {
        writeFileSync(BLOCKLIST_PATH, JSON.stringify(cleaned, null, 2));
        console.log(`   ✔ Removed test entry from blocklist`);
      }
    } catch (err) {
      console.error(`   ⚠ Cleanup warning: ${err.message}`);
    }

    console.log(`\n===============================================================`);
    console.log(`📊 PRODUCTION REGRESSION TEST SUMMARY:`);
    console.log(`   ✅ Passed: ${harness.passed}`);
    console.log(`   ❌ Failed: ${harness.failed}`);
    console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
    console.log(`===============================================================`);

    if (crashed || harness.failed > 0) {
      const prefix = crashed ? '💥 CRASHED — ' : '';
      console.log(`\n🔴 ${prefix}${harness.failed} TEST(S) FAILED`);
      process.exit(1);
    } else {
      console.log(`\n🟢 PRODUCTION REGRESSION TEST PASSED — warnings fire before termination`);
      process.exit(0);
    }
  }
})();
