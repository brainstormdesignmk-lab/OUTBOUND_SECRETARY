// ========================================
// service.js — Orchestrator (phase machine)
// ========================================
// Full re-architecture (user-approved): the former 1,500-line monolithic
// generateResponse has been split into focused phase-handler modules.
// This file is now a thin orchestrator that:
//   1. Validates input
//   2. Runs the offensive-behavior 3-strike protocol
//   3. Dispatches to hardcoded early-response handlers (handlers/early-responses.js)
//   4. Detects the phase (handlers/persuasion-phase.js)
//   5. Runs pending-confirmation + global extraction (handlers/data-collection.js)
//   6. Runs the data-collection flow OR the persuasion LLM call
//
// Public API unchanged: generateFirstMessage() and generateResponse().
// ========================================
import './env.js'; // side-effect: load ~/.ana/ana.env (see env.js) — never a .env* file in CWD.
import { config } from './config.js';
// service.js is the package.json `main` entry — running `node service.js`
// directly must get the API key from the real env or ~/.ana/ana.env BEFORE
// the Groq client (lazily constructed in handlers/persuasion-phase.js) reads
// process.env. Every other entry point (ana-cli, TUI, run-live-sim) already
// imports env.js; this closes the gap for the standalone main.
import { getNextMissingField } from './workflow.js';

import { detectOffensive, getStrikeResponse, addToBlocklist, applyStrikeDecay } from './offensive-filter.js';
import { isValidPhone, isValidMessage, createSafeFallback } from './retry-utils.js';

import { runEarlyResponses } from './handlers/early-responses.js';
import { handleClosingFollowUp } from './handlers/closing-phase.js';
import { runHumanEscalation, getHumanEscalationMessage } from './handlers/human-escalation.js';
import { detectPhase, runPersuasion } from './handlers/persuasion-phase.js';
import {
  runPendingConfirmation,
  runGlobalExtractionPass,
  runComplexStatefulHandlers,
  runDataCollectionFlow,
  applyPriceCorrectionIfAny
} from './handlers/data-collection.js';
import { runAwaitingPhotos } from './handlers/awaiting-photos.js';
import { PHASES } from './handlers/state-machine.js';
import { LeadState } from './scheduler.js';

// ========================================
// GENERATE FIRST MESSAGE
// ========================================

export function generateFirstMessage(lead) {
  const title = (lead.title || '').toLowerCase();
  let propertyType = 'apartment';
  let propertyLabel = 'имотот';

  // PROPERTY-TYPE KEYWORD SCAN — the EARLIEST keyword in the title wins.
  // Macedonian listing titles lead with the property type, so when a title
  // mentions TWO types ("се продава парцела погодна за куќа" = parcel
  // suitable for a house), the FIRST one is the actual subject: that real
  // lead is LAND, and the old fixed precedence (stan → kuk → land → lokal)
  // wrongly classified it as house because "куќа" appears later in the
  // description. "Куќа со градина" (house with garden) stays a house,
  // "Куќа во Градина" (house in the village Gradina) stays a house, while
  // "Плац/нива/парцела..." titles classify as land. LAND terms now also
  // cover the full land vocabulary (niva, parcela, zemjiste, oranica,
  // livada, vinograd, zemja, gradina, земјоделско, градежно...).
  // NOTE: "градежн" (construction) is deliberately NOT a bare term —
  // "Градежна фирма продава стан" (a construction COMPANY selling an
  // apartment) would otherwise classify as land. "Градежно земјиште" /
  // "градежна парцела" (construction LAND) is virtually always written with
  // земјиште/парцела — which are already covered — so градежн only counts
  // when directly followed by one of those land words.
  const LAND_TITLE_RE = /plac|плац|land|niva|нива|nivi|ниви|zemjiste|zemjishte|земјиште|земjиште|parcela|парцела|parceli|парцели|oranica|ораница|livada|ливада|vinograd|виноград|zemja|земја|gradina|градина|zemjodelsk|земјоделск|poljoprivredn|градежн[оa]?\s+(?:земjиште|земјиште|zemjiste|zemjishte|парцела|parcela)/i;
  // BUSINESS/COMMERCIAL TITLE VOCABULARY — beyond the bare "локал", real
  // Macedonian business leads use: деловен простор (business space),
  // канцеларија (office), магацин/склад (warehouse), продавница/дуќан
  // (shop), ресторан/кафуле (restaurant/cafe), салон (salon), хотел (hotel),
  // бизнис (business), ателје (studio). These were previously unclassified
  // and fell through to apartment ("Продажба на деловен простор" → стан,
  // "МАГАЦИН ВО КУМАНОВО" → стан) — which would then ask the apartment
  // batch (terrace/bedrooms/elevator) for a warehouse. "деловн"/"delovn"
  // stems cover деловен/деловна/деловно; "kancelari" covers office. NOTE:
  // "magazin" (magazine) is a false-positive risk only in non-real-estate
  // contexts — in listing titles it virtually always means warehouse.
  const COMMERCIAL_TITLE_RE = /lokal|локал|deloven|деловен|delovn|деловн|kancelari|канцелари|magacin|магацин|magazin|магазин|sklad|склад|prodavnic|продавниц|dukan|дукан|дуќан|restoran|ресторан|kafule|кафуле|kafic|кафич|kafe|кафе|salon|салон|atelje|ателје|biznis|бизнис|hotel|хотел|office|commercial|posloven|пословен|poslovn|пословн/i;
  const candidates = [
    [/stan|стан/i, 'apartment', 'станот'],
    [/kuk|куќ|house|villa|vila/i, 'house', 'куќата'],
    [LAND_TITLE_RE, 'land', 'плацот'],
    [COMMERCIAL_TITLE_RE, 'commercial', 'локалот']
  ].map(([re, type, label]) => {
    const idx = title.search(re);
    return idx === -1 ? null : { idx, type, label };
  }).filter(Boolean).sort((a, b) => a.idx - b.idx);

  if (candidates.length > 0) {
    propertyType = candidates[0].type;
    propertyLabel = candidates[0].label;
  }

  const transactionType = /издава|изнајмува|izdava|izdavam|kirija|кирија|под кирија|pod kirija|za izdavanje|за издавање|rent|rental|iznajmuva|изнајмувам/i.test(title) ? 'rent' : 'sale';

  const text = transactionType === 'rent'
    ? `Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за ${propertyLabel} што се издава. Дали е се уште достапен и дали сте заинтересирани за соработка?`
    : `Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам за огласот за ${propertyLabel} што се продава. Дали е се уште достапен и дали сте заинтересирани за соработка без провизија за вас?`;

  return {
    text,
    type: "GREETING",
    memory: { transactionType, propertyType, propertyLabel }
  };
}

export async function generateResponse(session, userInput) {
  // ========================================
  // INPUT VALIDATION — prevent crashes from malformed input
  // ========================================
  if (!session || typeof session !== 'object') {
    console.error('[INPUT VALIDATION] Invalid session object');
    return {
      text: 'Извинете, имав техничка грешка. Обидете се повторно.',
      type: 'ERROR'
    };
  }

  if (!isValidMessage(userInput, 10000)) {
    console.error(`[INPUT VALIDATION] Invalid user input: ${typeof userInput} length=${userInput?.length}`);
    return {
      text: 'Ве молам, испратете валидна порака.',
      type: 'ERROR'
    };
  }

  // Validate phone number on session (if present)
  if (session.phone && !isValidPhone(session.phone)) {
    console.warn(`[INPUT VALIDATION] Suspicious phone number: ${session.phone}`);
  }

  try {
    if (!session.collectedData) {
      session.collectedData = { cooperationAccepted: false };
    }
    // TRANSACTION-TYPE BACKFILL: the lead's rent/sale type is known from the
    // ad title (adMemory) from the very first message, but collectedData only
    // gets it copied on cooperation ACCEPT (persuasion-phase.js). The price
    // extractors (data-collector.js) read ONLY collectedData — without this
    // backfill a rent owner's "250 evra" volunteered during persuasion was
    // stored as cleanPrice (the SALE price field) at HIGH confidence, because
    // extractCleanPrice fires whenever transactionType !== 'rent'. Mirror the
    // adMemory value up front so rent prices always land in monthlyRent.
    if (!session.collectedData.transactionType && session.adMemory?.transactionType) {
      session.collectedData.transactionType = session.adMemory.transactionType;
    }
    // PRICE BACKFILL (reported): the owner quoted their price during
    // persuasion ("baram 350 evra") — the early-response price handler stores
    // it as mentionedPrice, but the real field (monthlyRent for rent /
    // cleanPrice for sale) stays empty, so once cooperation is accepted Ana
    // re-asks for a price the owner already gave. Mirror mentionedPrice into
    // the price field (HIGH — the owner stated it explicitly) so the
    // data-collection flow moves on. Never overwrites an already-collected
    // price (runGlobalExtractionPass only fills empty fields anyway).
    if (session.collectedData.mentionedPrice != null &&
        session.collectedData.monthlyRent === undefined &&
        session.collectedData.cleanPrice === undefined) {
      const priceField = session.collectedData.transactionType === 'rent' ? 'monthlyRent' : 'cleanPrice';
      session.collectedData[priceField] = session.collectedData.mentionedPrice;
      session.collectedData[priceField + 'Confidence'] = 0.95;
      console.log(`[PRICE BACKFILL: mentionedPrice=${session.collectedData.mentionedPrice} → ${priceField}]`);
      // Clear the quoted price once mirrored — it was never a real collected
      // field and would otherwise inflate the data-collection fieldCount
      // (question-prefix selection) and linger as stale state.
      delete session.collectedData.mentionedPrice;
    }
    if (!session.commissionExplained) {
      session.commissionExplained = false;
    }
    if (!session.rejectionCount) {
      session.rejectionCount = 0;
    }
    if (!session.pendingFollowUp) {
      session.pendingFollowUp = null;
    }
    if (!session.pendingConfirmation) {
      session.pendingConfirmation = null;
    }
    if (!session.questionAttempts) {
      session.questionAttempts = {};
    }
    if (!session.offensiveStrikes) {
      session.offensiveStrikes = 0;
    }

    const u = userInput.toLowerCase().trim();

    // ========================================
    // PARKED-SESSION GUARD (MUST run BEFORE the strike protocol)
    // A session already in the terminal NEEDS_HUMAN state must never be
    // re-processed. The strike machine would otherwise run first and could
    // return TERMINATE on a stray offensive message — which campaign.js
    // maps to markBlocklisted(), silently overwriting the escalation.
    // Short-circuit here so a parked session can never be mutated again.
    // ========================================
    if (session.state === LeadState.NEEDS_HUMAN) {
      return {
        text: getHumanEscalationMessage(),
        type: 'ESCALATE'
      };
    }

    // ========================================
    // CLOSING FOLLOW-UP WINDOW (reported, approved Option A — grace window
    // only): the engine keeps a successful CLOSED_SUCCESS chat reachable for
    // CLOSE_FOLLOWUP_WINDOW_MS, so the owner's end questions ("KOGA DA VE
    // OCEKUVAM SO KLIENTI?", "SE NAJDOBRO") still get answered — rule-based,
    // no LLM, no data collection, no persuasion. MUST run BEFORE the strike
    // protocol (a venting owner inside the window must never be strike-3
    // blocklisted), before early responses, and before phase detection. The
    // engine already filters window expiry — a stale flag reaching here
    // simply gets a polite final answer.
    // ========================================
    if (typeof session.closingSince === 'number') {
      return handleClosingFollowUp(session, u);
    }

    // ========================================
    // OFFENSIVE BEHAVIOR PROTOCOL (3 STRIKES + STRIKE DECAY)
    // Check BEFORE any other processing.
    // ========================================
    if (userInput && userInput.trim()) {
      const detection = detectOffensive(u);
      const wasOffensive = detection.isOffensive;
      const previousStrikes = session.offensiveStrikes;

      // STRIKE DECAY STATE MACHINE:
      //   - offense              → counter + 1
      //   - normal after strike 1 → counter resets to 0 (owner corrected)
      //   - normal after strike 2 → counter STAYS at 2 (never decays)
      session.offensiveStrikes = applyStrikeDecay(previousStrikes, wasOffensive);

      if (!wasOffensive && previousStrikes === 1 && session.offensiveStrikes === 0) {
        console.log(`[STRIKE DECAY: normal message after strike 1 — counter reset to 0]`);
      }

      if (wasOffensive) {
        const currentStrikes = session.offensiveStrikes;
        console.log(`[STRIKE ${currentStrikes}/3] ${detection.category} (conf=${detection.confidence}): "${userInput.trim().substring(0, 60)}"`);

        // All offenses escalate equally: strike 1 → warning, strike 2 → final warning,
        // strike 3 → terminate + blocklist. No offense type (even sexual/violent)
        // skips the warning stage.
        if (currentStrikes >= 3) {
          session.offensiveStrikes = 3;
          addToBlocklist(session.phone, detection.category);
          return {
            text: getStrikeResponse(3),
            type: "TERMINATE"
          };
        }

        return {
          text: getStrikeResponse(currentStrikes),
          type: "WARNING"
        };
      }
    }
    // Conversation transcript for persuasion/classification — capped at
    // config.MAX_HISTORY turns (reported: input tokens count toward every
    // LLM provider's daily quota; 20+ turns + the system prompt was ~2,300
    // tokens/call, and MAX_HISTORY was defined but never applied). Filter
    // FIRST (drop textless rows), then take the LAST N turns so recent
    // context — including the lastAnaMessage used by phase detection — is
    // always present.
    const conv = (session.messages?.filter(m => m.text) || [])
      .slice(-config.MAX_HISTORY)
      .map(m => `${m.role === 'model' ? 'Ана' : 'Сопственик'}: ${m.text}`)
      .join('\n') || "";

    const isRent = session.adMemory?.transactionType === 'rent' || session.collectedData?.transactionType === 'rent';

    // ========================================
    // PHASE 0.5: HUMAN ESCALATION (NEEDS_HUMAN)
    // Owner explicitly asks to speak with a real person ("sakam da zboram
    // so covek" etc.). Hand off immediately — BEFORE the hardcoded early
    // responses so an escalation request is never swallowed by a canned
    // objection/agency answer. The parked-session guard lives above the
    // strike protocol (see top of function) so a terminal NEEDS_HUMAN
    // session is never mutated again.
    // ========================================
    const escalation = runHumanEscalation({ u });
    if (escalation) return escalation;

    // ========================================
    // PRICE CORRECTION SAFETY NET for early-return paths.
    // Any handler that returns a response BEFORE the global extraction pass
    // (runEarlyResponses, awaiting-photos resolution, detectPhase
    // short-circuits, complex stateful follow-ups, and runDataCollectionFlow
    // when a pending follow-up skipped extraction) swallows the whole
    // message — an explicit mid-collection price correction ("ne, 300 e",
    // "kirijata e 300") inside it would be lost and the stored
    // backfilled/extracted price would stay stale (same bug class as the
    // extraction-pass and pending-confirmation fixes; reported: commission
    // questions answered mid-flow). Apply the correction (guarded — only
    // fires on an explicit correction signal with a DIFFERENT number against
    // an already-stored price, see applyPriceCorrectionIfAny) before the
    // canned response is handed back. Re-application is a verified no-op
    // (the value-difference guard skips when the stored price already
    // matches), so wrapping paths where extraction already ran is safe.
    // ========================================
    const guardResponse = (resp) => {
      if (resp) applyPriceCorrectionIfAny(u, session);
      return resp;
    };

    // ========================================
    // PHASE 1: HARDCODED EARLY RESPONSES
    // Availability, agency, objection router, photos, phone, rollback.
    // Returns a response immediately if the message matches a known pattern.
    // ========================================
    const early = runEarlyResponses({ u, isRent, session });
    if (early) {
      // PRICE-QUOTE FEATURE EXTRACTION (reported, lead 5536052): the
      // hardcoded price rebuttal returns BEFORE the global extraction pass,
      // so features volunteered in the SAME price-quote message ("JAS BARAM
      // 150.000 ZA MENE, KOMPLETNO NAMESTEN, SO KLIMA, GARAZA I PARNO") were
      // never extracted live — the owner's answers looked lost even though
      // the extractors would have found them all at HIGH. When the price
      // handler fires, ALSO run the extraction pass (nextField=null → every
      // MEDIUM counts as volunteered, no confirmation question). The price
      // field itself stays in mentionedPrice: the price extractors never
      // fire on "baram/sakam X" quote forms, so the HIGH backfill below
      // remains the only path that stores the price — no double-store.
      if (early.priceQuote) {
        runGlobalExtractionPass({ u, userInput, session, nextField: null });
        // PRICE STAGING RECONCILIATION (reviewer + C1 regression): the pass
        // can store the quoted price DIRECTLY, which makes the
        // mentionedPrice→backfill below a no-op on the next message. Two
        // cases:
        //   - HIGH (>=0.7) — rent quotes with currency ("BARAM 350 EVRA
        //     MESECNO"), some sale forms ("SAKAM 120000"): the price is
        //     already accepted at 0.95, so clear the staging mentionedPrice
        //     (it would otherwise linger, inflating the question-prefix
        //     fieldCount — the exact thing the backfill's delete guards).
        //   - MEDIUM (<0.7) — bare quote forms ("baram 500", "baram 500
        //     iljadi") extract at volunteered 0.60: too weak to keep (a
        //     0.60 price is treated as missing and re-asked, and the
        //     non-undefined value blocks the 0.95 backfill). Roll it back so
        //     mentionedPrice still lands at 0.95 on the next message.
        for (const k of ['monthlyRent', 'cleanPrice']) {
          const v = session.collectedData[k];
          if (typeof v !== 'number') continue;
          const conf = session.collectedData[k + 'Confidence'];
          if (conf != null && conf >= 0.7) {
            delete session.collectedData.mentionedPrice;
          } else {
            delete session.collectedData[k];
            delete session.collectedData[k + 'Confidence'];
          }
        }
      }
      return guardResponse(early);
    }

    // ========================================
    // PHASE 2: AWAITING_PHOTOS RESOLUTION
    // If the session is parked in AWAITING_PHOTOS (owner committed to
    // sending photos on Viber later), resolve the wait BEFORE phase
    // detection. detectPhase would otherwise re-derive DATA_COLLECTION
    // from cooperationAccepted and skip the async-wait resolution.
    // ========================================
    if (session.phase === PHASES.AWAITING_PHOTOS) {
      const awaitingResp = runAwaitingPhotos({ u, session });
      // If the owner resumed normally (owner_back → DATA_COLLECTION) or the
      // cooperation was rolled back (→ PERSUASION), runAwaitingPhotos returns
      // null and we fall through to the normal flow below.
      if (awaitingResp) return guardResponse(awaitingResp);
    }

    // ========================================
    // PHASE 3: PHASE DETECTION (PERSUASION vs DATA_COLLECTION)
    // ========================================
    const detection = detectPhase({ u, conv, session, isRent });
    if (detection.response) return guardResponse(detection.response);
    const { phase, classification } = detection;

    let nextField = null;
    let hasScraperPhotos = false;

    if (phase === "DATA_COLLECTION") {
      const known = { ...session.adMemory, ...session.collectedData };
      nextField = getNextMissingField(known);

      if (session.adMemory?.photoUrls && session.adMemory.photoUrls.length > 0) {
        hasScraperPhotos = true;
      }
    }

    // ========================================
    // PHASE 4: PENDING CONFIRMATION + GLOBAL EXTRACTION
    // Run for BOTH phases — captures volunteered details and handles
    // medium-confidence confirmation re-asks.
    // ========================================
    const pendingResp = runPendingConfirmation({ u, session });
    if (pendingResp) return pendingResp;

    const extractionResp = runGlobalExtractionPass({ u, userInput, session, nextField });
    if (extractionResp) return extractionResp;

    // ========================================
    // PHASE 5: COMPLEX STATEFUL HANDLERS (Data Collection only)
    // terrace, heating, photos, ownerName, address — follow-up questions
    // with early returns.
    // ========================================
    if (phase === "DATA_COLLECTION") {
      const complexResp = runComplexStatefulHandlers({ u, userInput, session, nextField, hasScraperPhotos });
      if (complexResp) return guardResponse(complexResp);
    }

    console.log(`[PHASE: ${phase}]`);
    console.log(`[MEMORY:`, JSON.stringify(session.collectedData, null, 2), `]`);

    // ========================================
    // PHASE 6: DATA COLLECTION FLOW (history scan, close, questions)
    // ========================================
    if (phase === "DATA_COLLECTION") {
      const dcResult = runDataCollectionFlow({ u, userInput, session, adMemory: session.adMemory, hasScraperPhotos });
      // runDataCollectionFlow always returns a response: a QUESTION for the
      // next field, or CLOSE — both when all fields were collected AND when
      // the max-2-attempts loop skipped every remaining field (previously it
      // returned null and we fell through to the persuasion phase, which was
      // wrong for an owner who already accepted cooperation). Guarded: when a
      // pending follow-up had skipped the extraction pass and this message
      // RESOLVED it (complex handler cleared pendingFollowUp and returned
      // null), any price correction in the message would otherwise be lost.
      if (dcResult) return guardResponse(dcResult);
    }

    // ========================================
    // PHASE 7: PERSUASION — Native Macedonian LLM call
    // ========================================
    return await runPersuasion({ conv, userInput, classification, isRent });
  } catch (e) {
    // COMPREHENSIVE ERROR RECOVERY:
    // Catches ALL exceptions from the entire generateResponse function.
    // Returns a safe fallback response that preserves session state,
    // allowing the conversation to continue on the next message.
    //
    // The session is NOT modified — collectedData, conversation history,
    // phase state, etc. remain intact. The next call to generateResponse
    // will retry from the same state.
    //
    // Types of errors caught:
    //   - LLM API failures (after 3 retries exhausted)
    //   - Network/DNS failures
    //   - Unexpected input formats
    //   - Null pointer / undefined property access
    //   - FS operations (CSV writing, property folder creation)
    //   - Import/initialization errors
    console.error("[FATAL] generateResponse crashed:", e.message);
    if (e.stack) {
      console.error(e.stack.split('\n').slice(0, 5).join('\n'));
    }
    return createSafeFallback(e.message, session);
  }
}
