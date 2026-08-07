// ========================================
// handlers/persuasion-phase.js — Phase detection + Persuasion LLM call
// ========================================
// Extracted from service.js (verbatim, zero behavior change).
//
// Two responsibilities:
//   1. detectPhase() — the PERSUASION/DATA_COLLECTION decision:
//      - classifies the owner's intent
//      - handles short positive confirmations (immediate acceptance)
//      - enforces the COOPERATION ACCEPTANCE GATE (confidence >= 0.85)
//      - handles REJECTED escalation (1 → persuasion, 2 → persuasion,
//        3 → CLOSED) and low-confidence INTERESTED → CLOSED
//      Returns { phase, classification } or { response } for early returns.
//   2. runPersuasion() — the native-Macedonian LLM persuasion call with
//      exponential-backoff retry and post-processing.
// ========================================
import Groq from "groq-sdk";
import { config } from '../config.js';
import { classifyIntent, CONV_CONTINUATION_WORDS as convContWords, HESITATION_GUARD_WORDS as hesitationWords, parseConversationContext } from '../classifier.js';
import { buildPersuasionContext, buildPersuasionPrompt, postProcessPersuasionResponse } from '../persuasion.js';
import { withRetry } from '../retry-utils.js';
import { transitionTo } from './state-machine.js';

/**
 * Mirror the resolved phase onto the session (persisted field).
 * Delegates to the central chokepoint in handlers/state-machine.js which
 * owns session.phase mutation + transition logging + per-phase metrics.
 * Kept as a local alias so the rule-based exits in detectPhase() read
 * naturally.
 *
 * @param {Object} session
 * @param {string} phase — one of PHASES ('PERSUASION' | 'DATA_COLLECTION')
 * @param {string} [event='phase_detected']
 */
function mirrorPhase(session, phase, event = 'phase_detected') {
  transitionTo(session, phase, event);
}

// IMPORTANT: env vars are loaded by env.js (see ../env.js) — the key
// lives in the real environment or ~/.ana/ana.env, NEVER in a .env*
// file inside the project CWD. That is deliberate: the freebuff CLI
// crashes on this machine (and on the 32-bit Atom deploy boxes, both
// kernel < 4.11) whenever a .env* file exists in the CWD, because it
// calls statx() which is missing on kernels older than 4.11. Keeping
// the env file in the user's home dir sidesteps that entirely.

// LAZY GROQ CLIENT — constructed on FIRST persuasion call, never at module
// load. The Groq SDK constructor THROWS when GROQ_API_KEY is missing/empty,
// which would crash every suite that imports service.js (→ this module) at
// import time — breaking the offline test battery that must run with no key
// (the ANA_OFFLINE_LLM seam above returns before construction is reached).
// Production is unaffected: the key is read from process.env (populated by
// env.js / ~/.ana/ana.env at entry-point startup) at construction time,
// exactly as before.
let _groqClient = null;
function getGroqClient() {
  if (!_groqClient) {
    _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groqClient;
}

/**
 * Phase detection — decide PERSUASION vs DATA_COLLECTION and handle
 * all early returns (rejection escalation, low-confidence close).
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @param {string} ctx.conv — conversation transcript
 * @param {Object} ctx.session — LeadSession
 * @param {boolean} ctx.isRent — rent vs sale
 * @returns {{phase:string, classification:Object}|{response:Object}}
 */
export function detectPhase({ u, conv, session, isRent }) {
  const alreadyInDataCollection = session.collectedData.cooperationAccepted === true;
  let classification = null;
  let phase = "PERSUASION";

  if (!alreadyInDataCollection) {
    classification = classifyIntent(u, conv);
    console.log(`[INTENT: ${classification.intent}, CONFIDENCE: ${classification.confidence}]`);

    // SHORT POSITIVE CONFIRMATION — immediate acceptance
    // If the entire message is a short (1-4 words, < 50 chars) positive confirmation
    // like "moze", "da", "ok", "vazi", "super", etc., immediately enter DATA_COLLECTION
    // regardless of classifier confidence. These are clear acceptance signals in
    // Macedonian Viber conversation, but the classifier assigns them 0.60-0.70.
    const isShortPositiveConfirm = (() => {
      const trimmed = u.trim();
      if (trimmed.length > 50 || trimmed.split(/\s+/).length > 4) return false;
      if (/\?/.test(trimmed)) return false;
      if (/\b(?:ne|не|ama|ама|no|но|sepak|сепак|mislam|мислам|mozebi|можеbi|можеби)\b/i.test(trimmed)) return false;
      return /^(?:moze|може|da|да|vazi|важи|ok|ок|okej|океј|super|супер|povelete|повелете|slobodno|слободно|ajde|ајде|dogovoreno|договорено|soglasuvam|согласувам|prifakjam|прифаќам|sorabotuvame|соработуваме|probaj|пробај|probajte|пробајте|da probame|да пробаме|moze slobodno|може слободно|se soglasuvam|се согласувам|ajde da probame|ајде да пробаме|moze da|може да|moze probame|може пробаме|ajde probame|ајде пробаме)(?:\s+(?:da|да|moze|може|slobodno|слободно|probame|пробаме|soglasuvam|согласувам))?$/i.test(trimmed);
    })();

    // FUTURE/HYPOTHETICAL COOPERATION GUARD (reported): if Ana's last message
    // asked about cooperation in the FUTURE / conditionally ("Дали сте
    // расположени да соработуваме во иднина, ако имате друг имот?"), a bare
    // short positive ("moze"/"da"/"ok") is polite social agreement, NOT a
    // cooperation commitment — the owner is wrapping up the conversation. The
    // same guard the classifier applies (anaAskingFutureCooperation).
    const lastAnaMsg = parseConversationContext(conv).lastAnaMessage;
    const futureCooperationAsked =
      /(?:во\s+иднина|vo\s+idnina|иднина|idnina|ако\s+(?:имате|имаш|има|сакате)|ako\s+(?:imate|imas|ima|sakate)|доколку|dokolku|друг\s+имот|drug\s+imot|друг\s+стан|drug\s+stan|подоцна|podocna|во\s+прилика|vo\s+prilika|кога\s+ќе|koga\s+ke|следниот\s+пат|sledniot\s+pat)/i.test(lastAnaMsg);

    if (isShortPositiveConfirm && !futureCooperationAsked) {
      session.collectedData.cooperationAccepted = true;
      session.rejectionCount = 0;
      if (!session.collectedData.transactionType && session.adMemory?.transactionType) {
        session.collectedData.transactionType = session.adMemory.transactionType;
      }
      phase = "DATA_COLLECTION";
      console.log(`[COOPERATION: ACCEPTED (short positive: "${u.trim()}")]`);
    } else {
      // COOPERATION ACCEPTANCE GATE (v2):
      // Threshold raised from 0.7 to 0.85 for entering DATA_COLLECTION.
      // This prevents low-confidence ACCEPTED classifications (standalone "da" = 0.60,
      // solo "moze" = 0.65) from immediately entering data collection.
      // Owners must give a strong, unambiguous acceptance signal.
      //
      // Even if the classifier says ACCEPTED, check for conversation-continuation
      // words that the classifier might have missed. "prodolzi", "slusam", "objasni"
      // after an affirmative are conversation continuations, NOT cooperation.
      // The classifier handles the common cases ("da moze", "moze" alone),
      // this gate catches edge cases.
      // Uses the centralized CONV_CONTINUATION_WORDS pattern from classifier.js
      const isConvContinuation = convContWords.test(u);
      if (classification.intent === "ACCEPTED" && classification.confidence >= 0.85 && isConvContinuation) {
        console.log(`[COOPERATION: GATE BLOCKED — conversation continuation (${classification.reason})]`);
        phase = "PERSUASION";
        classification = { intent: "INTERESTED", confidence: 0.7 };
      } else if (classification.intent === "ACCEPTED" && classification.confidence >= 0.85 && !futureCooperationAsked) {
        session.collectedData.cooperationAccepted = true;
        session.rejectionCount = 0;
        if (!session.collectedData.transactionType && session.adMemory?.transactionType) {
          session.collectedData.transactionType = session.adMemory.transactionType;
        }
        phase = "DATA_COLLECTION";
        console.log(`[COOPERATION: ACCEPTED (conf=${classification.confidence})]`);
      } else if (classification.intent === "REJECTED" && classification.confidence > 0.7) {
        session.rejectionCount = (session.rejectionCount || 0) + 1;
        console.log(`[REJECTION COUNT: ${session.rejectionCount}]`);

        if (session.rejectionCount === 1) {
          mirrorPhase(session, 'PERSUASION');
          return {
            response: {
              // Rent: the owner DOES pay the standard commission, so the rent
              // variant must never claim "агенцијата не зема ништо од вас"
              // (sale-only phrasing).
              text: isRent ? "Агенцијата се грижи за целокупниот процес на издавање — клиенти, посети и договор — по стандардна провизија. Да пробаме?" : "Агенцијата не зема ништо од вас за услугата. Само ви ги зголемува шансите за побрза продажба на вашиот имот. Да пробаме?",
              type: "NORMAL"
            }
          };
        } else if (session.rejectionCount === 2) {
          // SECOND REJECTION → GIVE UP (reported, lead 5502969). The old
          // behavior sent a THIRD persuasion pitch, making Ana repeat the
          // same sentence like a bot. On the second firm rejection she must
          // STOP pitching: acknowledge the owner's decision, no sales
          // sentence, no cooperation question. The polite goodbye + CLOSED
          // comes on the THIRD rejection (next branch). Variants are
          // randomized so consecutive leads don't read the same sentence.
          const giveUpVariants = [
            "Разбирам, ја почитувам вашата одлука.",
            "Во ред, нема да ве притискам. Ви благодарам на разговорот.",
            "Разбирам целосно. Ви посакувам успех во вашите планови."
          ];
          mirrorPhase(session, 'PERSUASION');
          return {
            response: {
              text: giveUpVariants[Math.floor(Math.random() * giveUpVariants.length)],
              type: "NORMAL"
            }
          };
        } else {
          // THIRD REJECTION → POLITE GOODBYE + CLOSED (reported, lead
          // 5502969). All variants are rent/sale-neutral (no "без надокнада"
          // sale-only claims).
          const goodbyeVariants = [
            "Ве разбирам, можете да пробате сами, но ако не успеете, ние сме тука да ви помогнеме. Ви посакуваме успех и доколку се предомислите, слободно контактирајте нѐ.",
            "Во ред, ја почитувам вашата одлука. Ако сепак одлучите да соработувате, ние сме на располагање. Ви благодариме и ви посакуваме се најдобро.",
            "Ве разбирам целосно. Пробајте сами, а ако ви затреба стручна помош, нашата врата е секогаш отворена. Ви благодариме и до слушање.",
            "Разбирам, не ве притискам. Доколку не успеете сами, ние сме тука. Ви посакувам успех во вашите планови и ви благодарам на разговорот."
          ];
          mirrorPhase(session, 'PERSUASION');
          return {
            response: {
              text: goodbyeVariants[Math.floor(Math.random() * goodbyeVariants.length)],
              type: "CLOSED"
            }
          };
        }
      } else if (classification.intent === "INTERESTED" && classification.confidence < 0.3) {
        mirrorPhase(session, 'PERSUASION');
        return {
          response: {
            text: "Разбирам. Доколку се предомислите, слободно контактирајте нѐ.",
            type: "CLOSED"
          }
        };
      } else {
        phase = "PERSUASION";
        // RESET-ON-ENGAGEMENT ONLY: genuine interest (a question, a strong
        // signal) resets the rejection counter; HEDGED messages ("ke vidime",
        // "mozebi", "razmislam") do not — otherwise an owner could dodge the
        // polite-goodbye escalation by interleaving hedges between refusals
        // (reported, lead 5502969).
        if (classification.intent === "INTERESTED" && classification.confidence > 0.5 &&
            !hesitationWords.test(u)) {
          session.rejectionCount = 0;
        }
      }
    }
  } else {
    phase = "DATA_COLLECTION";
    console.log(`[PHASE: DATA_COLLECTION]`);
  }

  mirrorPhase(session, phase);

  return { phase, classification };
}

/**
 * Run the persuasion LLM call (native Macedonian, ends with a cooperation
 * question). Wrapped in withRetry for transient API failures.
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @param {string} ctx.conv — conversation transcript
 * @param {string} ctx.userInput — original user input
 * @param {Object} ctx.classification — classifier result
 * @param {boolean} ctx.isRent — rent vs sale
 * @returns {Promise<{text:string, type:string}>}
 */
export async function runPersuasion({ conv, userInput, classification, isRent }) {
  // ========================================
  // OFFLINE TEST SEAM (ANA_OFFLINE_LLM=1)
  // The e2e battery sim (test-sim-acceptance-e2e.js) sets this env flag so
  // PERSUASION-staying messages (hedged/negated acceptances) can be driven
  // through the FULL generateResponse pipeline — early responses, phase
  // detection, global extraction, persuasion — without hitting the live
  // Groq API (slow + network-dependent; the battery must stay offline).
  // Read at CALL time (not module load), so production — which never sets
  // the flag — is completely unaffected. Returns a canned NORMAL reply so
  // the caller observes the same shape a real persuasion response has.
  // ========================================
  if (process.env.ANA_OFFLINE_LLM === '1') {
    return { text: 'Разбирам. Дали сте расположени да соработуваме?', type: 'NORMAL' };
  }

  const persuasionContext = buildPersuasionContext(classification);
  const prompt = buildPersuasionPrompt(conv, userInput, persuasionContext, isRent);

  // Construct the client BEFORE the retry wrapper: a missing/empty API key is a
  // configuration error, not a transient failure — it must fail fast (and be
  // caught by service.js's outer recovery → safe fallback) instead of being
  // retried 3x with exponential backoff. Only the API CALL itself is retried.
  const groqClient = getGroqClient();

  // WRAP LLM CALL WITH RETRY LOGIC (exponential backoff, max 3 retries)
  // Handles transient failures: network blips, rate limits, 5xx errors.
  // Non-retryable errors (SyntaxError, TypeError) fail immediately.
  const result = await withRetry(
    () => groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "Ти си Ана. Бидете природни, професионални и кратки на македонски. Секогаш завршувај со прашање за соработка. Не биди наметлива. Користи стандарден македонски книжевен јазик."
        },
        { role: "user", content: prompt }
      ],
      model: config.MODEL,
      temperature: 0.20,
      top_p: 0.75,
      frequency_penalty: 0.15,
      max_tokens: 150
    }),
    {
      maxRetries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 20000,
      onRetry: (err, attempt) => {
        console.log(`[LLM RETRY ${attempt}/3] ${err.message.substring(0, 100)}`);
      }
    }
  );

  let response = result.choices[0]?.message?.content?.trim() || "";
  response = postProcessPersuasionResponse(response, isRent);

  return { text: response, type: "NORMAL" };
}
