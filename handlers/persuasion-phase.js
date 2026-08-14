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
//      - handles REJECTED escalation (1 → rebuttal, 2 → polite goodbye +
//        CLOSED, 3+ → cut) and low-confidence INTERESTED → CLOSED
//      Returns { phase, classification } or { response } for early returns.
//   2. runPersuasion() — the native-Macedonian LLM persuasion call with
//      exponential-backoff retry and post-processing.
// ========================================
import { classifyIntent, CONV_CONTINUATION_WORDS as convContWords, HESITATION_GUARD_WORDS as hesitationWords, parseConversationContext } from '../classifier.js';
import { isClientQualityConcern } from '../objections.js';
import { buildPersuasionContext, buildPersuasionPrompt, postProcessPersuasionResponse } from '../persuasion.js';
import { generateCompletion } from '../llm-provider.js';
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

// ========================================
// TRAILING-NEGOTIATION GUARD (reported, lead 3571074): the owner's CURRENT
// TURN (all owner messages since Ana's last reply) ends with a
// client-quality / verification concern — "mozeme da probame" +
// "ama dali klientite vi se provereni ?" + "ozbilni ?". The acceptance is
// CONDITIONAL: committing to DATA_COLLECTION on message 1 makes Ana ask
// for the rent while the owner is still extracting promises about the
// clientele. When the LAST message of the turn is a concern, hold the
// transition: stay in PERSUASION so the concern is answered first and the
// owner re-confirms cleanly. (The engine appends every grace-batch text to
// session.messages at receipt, so the WHOLE batch is visible while ANY
// message of it is processed — same property the availability and
// who-pays-the-notary helpers rely on.)
// ========================================
// Returns the concern text when the turn's LAST message is a strict
// client-quality concern, else null (the callers test `!concernText`).
function trailingNegotiationConcernText(session) {
  const msgs = session.messages || [];
  const turn = [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'model') break; // Ana's last reply ends the turn
    turn.unshift(m);
  }
  if (turn.length === 0) return null;
  const lastText = turn[turn.length - 1]?.text || '';
  const turnText = turn.map(m => m.text || '').join(' ');
  return isClientQualityConcern(lastText, turnText) ? lastText : null;
}

// IMPORTANT: env vars are loaded by env.js (see ../env.js) — the key
// lives in the real environment or ~/.ana/ana.env, NEVER in a .env*
// file inside the project CWD. That is deliberate: the freebuff CLI
// crashes on this machine (and on the 32-bit Atom deploy boxes, both
// kernel < 4.11) whenever a .env* file exists in the CWD, because it
// calls statx() which is missing on kernels older than 4.11. Keeping
// the env file in the user's home dir sidesteps that entirely.
//
// LLM PROVIDERS: the actual chat call now lives in ../llm-provider.js
// (Groq → Gemini fallback chain, rate-limit circuit breaker — reported
// Groq TPD exhaustion froze persuasion). All provider clients are
// constructed lazily there, never at module load, so the offline test
// battery (ANA_OFFLINE_LLM seam below returns first) still needs no key.

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

    // TRAILING-NEGOTIATION GUARD — computed once, applied to BOTH
    // acceptance paths below (short-positive and the 0.85 gate).
    const trailingConcern = trailingNegotiationConcernText(session);
    if (trailingConcern &&
        (isShortPositiveConfirm || (classification.intent === "ACCEPTED" && classification.confidence >= 0.85))) {
      // The log quotes the CONCERN message (the turn's last word), not the
      // current message being processed — for the reported batch that is
      // "ozbilni ?", which is what actually held the transition.
      console.log(`[COOPERATION: GATE BLOCKED — the turn ends with a client-quality concern ("${trailingConcern.trim().slice(0, 40)}"); answering it before data collection]`);
    }

    if (isShortPositiveConfirm && !futureCooperationAsked && !trailingConcern) {
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
      } else if (classification.intent === "ACCEPTED" && classification.confidence >= 0.85 && !futureCooperationAsked && !trailingConcern) {
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
          // SECOND REJECTION → POLITE GOODBYE + CLOSED (user-approved
          // cadence, reported lead 5540516): the old ladder only CLOSED on
          // the THIRD rejection — the second got a bare acknowledgment and
          // a third firm "no" still heard a goodbye. Now the second firm
          // refusal ends the conversation with a polite goodbye (the next
          // branch is the "just cut" fallback for anything that arrives
          // after closing). All variants are rent/sale-neutral (no
          // "без надокнада" sale-only claims). Variants rotate so
          // consecutive leads don't read the same sentence.
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
        } else {
          // THIRD+ REJECTION → JUST CUT (reported, lead 5540516): the owner
          // has said no three times — no sales sentence, no question, no
          // explanation. A single short closing line is all they get; the
          // conversation is over. (Strike-3 insults terminate even harder —
          // the TERMINATE response is never sent to the owner at all.)
          const cutVariants = [
            "Разговорот е завршен.",
            "Ви посакувам пријатен ден.",
            "Разговорот е завршен. Пријатен ден."
          ];
          mirrorPhase(session, 'PERSUASION');
          return {
            response: {
              text: cutVariants[Math.floor(Math.random() * cutVariants.length)],
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
 * TIER ROUTING MAP (unit-tested — the offline seam returns before the LLM
 * call, so the mapping is extracted to stay pinable): skeptical / soft
 * rejection turns (intent REJECTED) get the SMART tier (70b / flash) for
 * rebuttal quality; everything else is ROUTINE (8b / flash-lite).
 */
export function tierForClassification(classification) {
  return classification?.intent === 'REJECTED' ? 'rebuttal' : 'routine';
}

// ========================================
// DETERMINISTIC PERSUASION LADDER (LLM-free floor, like Lina's code-built
// replies). Used when NO LLM can answer — every provider exhausted (429/TPD
// on Groq AND Gemini), a parked pool, or ANA_OFFLINE_LLM=1. Before this,
// an outage sent owners "Извинете, имав техничка грешка" (createSafeFallback)
// and consecutive errors escalated live leads to a human — the worst moment
// to lose a conversation. Now the owner gets a natural, intent-aware
// persuasion line that ends with the cooperation question, so the funnel
// continues until the tokens come back.
//
// Rent/sale-aware: on RENT the owner pays the standard 50%/100% commission,
// so the value pitch never claims "без провизија" — only the sale line may.
// Rotates variants so consecutive leads don't read the same sentence.
// ========================================
function pickVariants(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function buildDeterministicPersuasion(classification, isRent) {
  const intent = classification?.intent;
  const confidence = classification?.confidence ?? 0;

  // SOFT/SKEPTICAL REJECTION (conf < 0.8 — the firm rejections are already
  // handled deterministically in detectPhase: rebuttal → goodbye → cut).
  // Rent owners DO pay the commission, so only the sale line may promise
  // "без провизија".
  if (intent === 'REJECTED') {
    if (isRent) {
      return pickVariants([
        'Разбирам дека не сте сигурни. Агенцијата ви носи проверени клиенти, организира посети и се грижи за целиот процес на издавање — а провизијата се плаќа само на денот на потпишување. Дали би пробале да ви најдеме клиент?',
        'Ве разбирам. Нашата работа е да ви најдеме вистински заинтересиран закупец и да го средиме целиот процес наместо вас. Дали сте расположени да пробаме?',
        'Нема притисок. Само сакам да знаете дека агенцијата ви заштедува време — ние ги проверуваме клиентите и ги организираме посетите. Дали би размислиле?'
      ]);
    }
    return pickVariants([
      'Разбирам дека не сте сигурни. Агенцијата не зема ништо од вас за услугата — само ви ја зголемува видливоста на огласот и ви носи заинтересирани купувачи. Дали би пробале?',
      'Ве разбирам. Нашата цел е да ви ја добиеме бараната цена, а разликата е наша провизија — вие немате никакви обврски. Дали сте расположени да пробаме?',
      'Нема притисок. Само сакам да знаете дека со нас огласот добива поголема видливост и вистински заинтересирани клиенти. Дали би размислиле?'
    ]);
  }

  // GENUINE INTEREST WITH RESERVATIONS (the runPersuasion majority).
  if (intent === 'INTERESTED' && confidence > 0.5) {
    if (isRent) {
      return pickVariants([
        'Одлично. Агенцијата ви носи проверени закупувачи, организира посети и го води процесот до потпишување. Дали сте расположени да почнеме со соработка?',
        'Супер. Ние ви наоѓаме клиент, организираме сè наместо вас, а провизијата се плаќа само на денот на потпишување. Дали да почнеме?'
      ]);
    }
    return pickVariants([
      'Одлично. Агенцијата ви носи заинтересирани клиенти, организира посети и го води целиот процес — без никаква провизија од ваша страна. Дали сте расположени да почнеме со соработка?',
      'Супер. Ние ви ја зголемуваме видливоста на огласот и ви носиме вистински заинтересирани купувачи. Дали да почнеме?'
    ]);
  }

  // UNCERTAIN / LOW-CONFIDENCE INTEREST — warm, gentle, no pressure.
  if (intent === 'INTERESTED') {
    return pickVariants([
      'Разбирам. Размислете мирно — кога ќе сакате, ние сме тука да ви помогнеме со огласот. Дали сте расположени да пробаме?',
      'Нема брзање. Кажете ми ако имате некое прашање, а доколку сакате, можеме да почнеме со соработка. Што велите?'
    ]);
  }

  // FALLBACK (unclassified / anything else) — the generic cooperation ask.
  return pickVariants([
    'Разбирам. Агенцијата ви ја зголемува видливоста на огласот и ви носи заинтересирани клиенти. Дали сте расположени да соработуваме?',
    'Ве разбирам. Доколку имате прашање, тука сум — а ако сакате, можеме да почнеме со соработка. Дали сте расположени?'
  ]);
}

/**
 * Run the persuasion LLM call (native Macedonian, ends with a cooperation
 * question). Wrapped in withRetry for transient API failures.
 *
 * LLM-FREE FLOOR: when every LLM provider fails (429/TPD/parked pool) or
 * ANA_OFFLINE_LLM=1, the reply is the code-built deterministic ladder above
 * — the owner never sees "техничка грешка" and the conversation continues.
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
  // the flag — is completely unaffected. Returns the deterministic ladder
  // (intent-aware now, not the old single canned line) so the caller
  // observes the same shape a real persuasion response has.
  // ========================================
  if (process.env.ANA_OFFLINE_LLM === '1') {
    return { text: buildDeterministicPersuasion(classification, isRent), type: 'NORMAL' };
  }

  const persuasionContext = buildPersuasionContext(classification);
  const prompt = buildPersuasionPrompt(conv, userInput, persuasionContext, isRent);

  // LLM PROVIDER CHAIN + TIERED MODEL SPLIT (user-approved, reported
  // lead-level outage: Groq 429 TPD exhaustion froze persuasion and
  // escalated live leads). llm-provider.js owns every provider + the
  // cascade: Groq first, Gemini on rate limit/outage, and the deterministic
  // ladder below is the final net — the owner gets a natural persuasion
  // line, NEVER "техничка грешка" and NEVER a human escalation caused by a
  // quota outage.
  //
  // TIER ROUTING (smart split, approved): skeptical/soft-rejection turns
  // (classification.intent === 'REJECTED') get the SMART tier (config.MODEL
  // = 70b / GEMINI_MODEL = flash) — the model with the stronger rebuttal
  // quality. Everything else (INTERESTED, gated ACCEPTED, unclassified)
  // is ROUTINE (config.MODEL_LITE = 8b / GEMINI_MODEL_LITE = flash-lite).
  // Groq's quota is PER-MODEL (observed 429 was "for model
  // llama-3.3-70b-versatile ... TPD: Limit 100000"), so the two tiers draw
  // from SEPARATE daily buckets on the same key ≈ 600K TPD combined.
  const tier = tierForClassification(classification);
  let result;
  try {
    result = await generateCompletion({
      messages: [
        {
          role: "system",
          content: "Ти си Ана. Бидете природни, професионални и кратки на македонски. Секогаш завршувај со прашање за соработка. Не биди наметлива. Користи стандарден македонски книжевен јазик."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.20,
      top_p: 0.75,
      frequency_penalty: 0.15,
      max_tokens: 150
    }, { tier });
  } catch (e) {
    // EVERY provider exhausted (429/TPD/parked pool) or all keys missing —
    // the LLM-free floor takes over. Log the reason, keep the conversation
    // alive with a deterministic persuasion line. This is the Lina pattern:
    // the LLM adds voice when it's up; the code-built reply is the floor.
    console.error(`[PERSUASION: LLM unavailable (${String(e.message).substring(0, 120)}) — deterministic floor reply]`);
    return { text: buildDeterministicPersuasion(classification, isRent), type: 'NORMAL' };
  }

  let response = (result?.text || "").trim();
  response = postProcessPersuasionResponse(response, isRent);

  return { text: response, type: "NORMAL" };
}
