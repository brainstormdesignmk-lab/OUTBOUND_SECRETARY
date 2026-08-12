// ========================================
// handlers/data-collection.js — Data collection phase handlers
// ========================================
// Extracted from service.js (verbatim, zero behavior change).
// Contains the DATA_COLLECTION phase logic:
//   1. Pending-confirmation handler (medium-confidence re-ask)
//   2. Global extraction pass (with confidence split + logging)
//   3. Complex stateful handlers (terrace, heating, photos, ownerName, address)
//   4. History scan + close flow + field question flow (with re-ask phrasings)
// ========================================
import { getNextMissingField, getQuestion, TENANT_PREF_QUESTIONS, AVAILABLE_FROM_QUESTIONS, PETS_ALLOWED_QUESTIONS } from '../workflow.js';
import { runGlobalExtraction, assessConfidence, confidenceToNumeric, scanHistoryForField, isExplicitPriceCorrection } from '../data-collector.js';

// ========================================
// ROTATING QUESTION VARIANTS BY FIELD — the single source of truth for
// fields whose re-asks rotate through fresh sentences instead of the fixed
// confirmatory phrasing ("Само да потврдам…"). A field present in this map
// is EXEMPT from both generic re-ask gates below:
//   (1) the max-attempts precheck caps it at the VARIANT COUNT (one ask per
//       variant), not the strict 2-attempt cap, and
//   (2) the confirmatory override skips it — each attempt already carries a
//       fresh sentence, so the fixed phrasing would shadow variants 1-3 and
//       the rotation would never be heard.
// tenantPreferences: static strings. availableFrom: label functions (the
// property word "станот"/"куќата" adapts per lead, mirroring
// CONFIRMATORY_QUESTIONS). petsAllowed: label functions (the pets question
// names the property too — "Дали се дозволени миленици во станот?").
// Reported requirements: "couple of variations of the type of clients
// preferred" + the same rotation for the date question + a pets-allowed
// question right after the tenant question (with variants).
// ========================================
const ROTATING_QUESTION_VARIANTS = {
  tenantPreferences: TENANT_PREF_QUESTIONS,
  availableFrom: AVAILABLE_FROM_QUESTIONS,
  petsAllowed: PETS_ALLOWED_QUESTIONS
};

/** Pick the variant for the current attempt: strings pass through, label
 *  functions are called with the property label. Clamps past the list end
 *  (a guard — the attempt cap below already stops before that). */
function pickRotatingVariant(field, attempts, propertyLabel) {
  const variants = ROTATING_QUESTION_VARIANTS[field];
  if (!variants || variants.length === 0) return null;
  const raw = variants[Math.min(attempts - 1, variants.length - 1)];
  return typeof raw === 'function' ? raw(propertyLabel) : raw;
}

/** Max attempts before skip for a field: variant count for rotating fields,
 *  2 for everything else. Math.max(1, …) guards an empty variant list.
 *
 *  PETS-ALLOWED HARD CAP (reported, lead 3571074): the dedicated pets
 *  question must NEVER loop through all 4 variants. It is a YES/NO binary
 *  whose answers the owner already gave clearly ("milenici nikako", "kuce,
 *  mace ne", bare "ne") — a 4× rotation made Ana look like she wasn't
 *  understanding ("she asks 4 times for the pets … like an idiot not
 *  understanding"). Cap at the generic 2 so the second non-answer skips the
 *  field (stores null) and the flow moves on. The variant rotation still
 *  applies WITHIN those 2 asks (attempt 1 = variant 0, attempt 2 = variant 1). */
function rotatingMaxAttempts(field) {
  if (field === 'petsAllowed') return 2;
  const variants = ROTATING_QUESTION_VARIANTS[field];
  return variants && variants.length > 0 ? Math.max(1, variants.length) : 2;
}
import {
  extractTerraceNumber,
  isPositive,
  isNegative,
  parseMacedonianNumber,
  parseNumberWords,
  parsePlusSum
} from '../property-extractor.js';
import { getRentDefaults, calculateRentCommission } from '../lib/commission.js';
import { getNextPropertyId, createPropertyFolder, saveToCSV } from './storage.js';
import { transition } from './state-machine.js';
import { isAvailabilityConfirmation } from './early-responses.js';
import { photosMessages, isPhotosWorthManagerReview } from './awaiting-photos.js';
import {
  calculateSellingPrice,
  buildBrokerComment,
  buildEnhancedDescription,
  buildPropertyJson,
  buildPriceWarningNote
} from '../property-intelligence.js';
import { config } from '../config.js';
import { submitPropertyToHermes } from '../hermes-client.js';

// ========================================
// STILL-AVAILABLE ACKNOWLEDGMENT — shared vocabulary, stricter guard
// Same positive/negative vocabulary as the persuasion availability handler,
// PLUS: an owner QUESTION ("dali e dostapen?") is not an availability
// statement and must never trigger the acknowledgment (mirrors the "?"
// exclusion the short-positive logic uses elsewhere).
// ========================================
function confirmsAvailability(text) {
  return isAvailabilityConfirmation(text) && !/\?/.test(text);
}

// ========================================
// RE-ASK DETECTION — Confirmatory & Apologetic Questions
// When a field has been asked 2+ times without a clear answer,
// switch from repeating the identical question to a softer
// confirmatory/apologetic phrasing to avoid annoying the owner.
// ========================================

// Used when attempts >= 2 (first re-ask after initial question)
const CONFIRMATORY_QUESTIONS = {
  cleanPrice: (label) => `Само да потврдам, која би била последната чиста цена за ${label}?`,
  monthlyRent: (label) => `Само да потврдам, колкава е месечната кирија за ${label}?`,
  // NOTE: NO availableFrom entry — the date question rotates through
  // AVAILABLE_FROM_QUESTIONS variants (one fresh sentence per attempt), so
  // the fixed confirmatory phrasing would shadow variants 1-3 and the
  // rotation would never be heard (same treatment as tenantPreferences).
  totalSqm: () => `Само да потврдам, колкава е вкупната квадратура?`,
  terraceSqm: () => `Само да потврдам, дали има тераса?`,
  bedrooms: (label) => `Само да потврдам, колку спални соби има ${label}?`,
  floor: (label) => `Само да потврдам, на кој кат се наоѓа ${label}?`,
  totalFloors: () => `Само да потврдам, колку спрата има зградата?`,
  elevator: () => `Само да потврдам, дали зградата има лифт?`,
  heating: () => `Само да потврдам, какво греење има?`,
  ac: () => `Само да потврдам, дали има клима?`,
  parking: () => `Само да потврдам, каков е паркингот?`,
  orientation: () => `Само да потврдам, која е ориентацијата?`,
  furnished: () => `Само да потврдам, дали е наместен?`,
  yearBuilt: () => `Само да потврдам, која година е граден?`,
  renovated: () => `Само да потврдам, дали е реновиран?`,
  renovationYear: () => `Само да потврдам, која година е реновиран?`,
  documentationClean: () => `Само да потврдам, дали имате чист имотен лист?`,
  photos: () => `Само да потврдам, дали имате фотографии?`,
  // NOTE: NO tenantPreferences entry — the tenant question rotates through
  // TENANT_PREF_QUESTIONS variants (one fresh sentence per attempt), so the
  // fixed confirmatory phrasing would shadow variants 1-3 and the rotation
  // would never be heard (reported requirement: "couple of variations of
  // the type of clients preferred").
  ownerName: () => `Само да потврдам, како да ве запишам?`,
  address: () => `Само да потврдам, која е точната адреса?`
};

/**
 * PENDING CONFIRMATION HANDLER (BEFORE global extraction)
 * If the previous turn asked for confirmation (MEDIUM confidence),
 * check the current answer and either confirm or correct.
 *
 * @returns {Object|null} — { text, type, nextField } response, or null to continue
 */
// ========================================
// PRICE CORRECTION PASS-THROUGH (shared)
// An explicit mid-collection price correction ("ne, 300 e", "kirijata e 300")
// must update the stored backfilled/extracted price even when the current
// turn is consumed by a handler that returns BEFORE the global extraction
// pass — otherwise the canned response swallows the message and the old
// price stays (same reported bug class as the extraction-pass fix). Two
// call sites: (1) the pending-confirmation reject branch here, and (2) the
// service.js early-return guard (runEarlyResponses / awaiting-photos /
// detectPhase / complex-handler responses). Reuses runGlobalExtraction,
// whose STEP 1/STEP 2 guards only let a price re-extract on an explicit
// correction, so no unrelated number (sqm, floor, parking) can ever clobber
// the price here. SAFE when the pending field IS the price field: a pending
// price is never stored yet (pendingConfirmation is only created for empty
// fields), so the stored value is undefined and nothing is applied — the
// "ne, 400 e" → fresh-ask contract is preserved.
// ========================================
export function applyPriceCorrectionIfAny(u, session) {
  const d = session.collectedData;
  const hasStoredPrice = typeof d.monthlyRent === 'number' || typeof d.cleanPrice === 'number';
  if (!hasStoredPrice) return;
  const updates = runGlobalExtraction(u, d, session.pendingConfirmation?.field);
  for (const [key, value] of Object.entries(updates)) {
    if (key !== 'cleanPrice' && key !== 'monthlyRent') continue;
    const existing = d[key];
    if (typeof existing !== 'number' || typeof value !== 'number') continue;
    if (Math.abs(existing - value) < 1) continue; // same value — nothing to change
    d[key] = value;
    d[key + 'Confidence'] = 0.95;
    delete d[key + 'Skipped'];
    console.log(`[PRICE CORRECTION (pass-through): ${key} ${existing} → ${value}]`);
  }
}

export function runPendingConfirmation({ u, session }) {
  if (!session.pendingConfirmation) return null;

  const pField = session.pendingConfirmation.field;
  const pValue = session.pendingConfirmation.value;
  // REJECT CHECK MUST RUN BEFORE CONFIRM. The confirm regex has bare
  // unanchored words (tocno, taka, tok, se, moze, ok), so a rejection like
  // "ne e tocno" / "350 ne e taka" / "ne tok" would otherwise match the
  // confirm branch first and WRONGLY confirm the pending value — the reject
  // branch below would never get a chance (reported "350 ne e tocno" stuck
  // as a false confirm). The two phrase sets are disjoint (ne*/greska vs
  // da/tocno/moze/taka/ok), so checking reject first is safe: any reply
  // starting with "ne" or containing a negation marker is a rejection or
  // correction, never a confirmation. Extended with "ne e" (not it —
  // "ne e 350", "350 ne e tocno") and leading "ne"/"не" ("ne, 400 e").
  // NOTE: the leading Cyrillic negation uses a LETTER-BOUNDARY, not \b — in
  // JS \b only separates ASCII \w chars, so "^\s*не\b" NEVER matched after
  // Cyrillic letters ("не, 100 илјади" was never rejected — a silent
  // divergence from the Latin "ne," path). (?:$|[^a-zа-я]) is the file-wide
  // letter-boundary convention.
  if (/^ne$|^не$|ne e tocno|не е точно|greska|грешка|pogresno|погрешно|ne e taka|не е така|ne tok|не ток|ne e|не е|^\s*ne\b|^\s*не(?:$|[^a-zа-я])/i.test(u)) {
    session.pendingConfirmation = null;
    // PRICE CORRECTION PASS-THROUGH (same bug class as the extraction-pass
    // fix): a correction message ("ne, 300 e") sent while a DIFFERENT field's
    // confirmation is pending must not be lost — the re-ask returned below
    // would swallow it and the stored backfilled/extracted price would stay
    // stale. Apply the price correction now (same gate as runGlobalExtraction)
    // so the price is updated even though this turn re-asks the pending field.
    // SAFE when the PENDING field IS the price field: a pending price is never
    // stored yet (pendingConfirmation is only created for empty fields), so
    // the stored price is undefined and nothing is applied — the re-ask
    // contract ("ne, 400 e" → fresh ask) is preserved.
    applyPriceCorrectionIfAny(u, session);
    console.log(`[REJECTED: ${pField} = ${JSON.stringify(pValue)} — ask again]`);
    const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'станот' :
                          session.adMemory?.propertyType === 'house' ? 'куќата' :
                          session.adMemory?.propertyType === 'land' ? 'плацот' :
                          session.adMemory?.propertyType === 'commercial' ? 'локалот' : 'имотот';
    const confirmQuestion = getQuestion(pField, session.adMemory?.propertyType || 'apartment');
    return { text: `Разбирам, да прашам повторно. ${confirmQuestion}`, type: "QUESTION", nextField: pField };
  }
  // User confirms
  if (/^da$|^да$|tocno|точно|ok|океј|moze|може|se|се|potvrd|потврд|tocno e|точно е|taka e|така е|da taka e|да така е|potvrduvam|потврдувам|potvrdi|потврди|da e|да е|tocno e taka|точно е така|upravo|управо|tok|ток|taka|така/i.test(u)) {
    session.collectedData[pField] = pValue;
    session.collectedData[pField + 'Confidence'] = 0.95;
    session.pendingConfirmation = null;
    // Confirmed value replaces any earlier skip marker
    delete session.collectedData[pField + 'Skipped'];
    console.log(`[CONFIRMED: ${pField} = ${JSON.stringify(pValue)}]`);
    // Fall through to normal flow — field is now filled
  }
  // OWNER REPEATS THE PENDING VALUE — that IS a confirmation, even without a
  // "da". "350 TI REKOV DA", "KAZAV 350", "350 e", bare "350" in reply to
  // "Дали точната вредност е 350?" previously fell into the digit branch
  // below → pending was cleared → re-extraction scored MEDIUM again (no
  // confidence keyword in "350 TI REKOV DA") → re-pended → the SAME
  // confirmation question forever (reported stuck loop). A negation marker
  // (word-boundary ne/не, ne e, greska...) blocks this so "ne, 400 e" or
  // "350 ne e tocno" never confirm the pending value.
  else if (typeof pValue === 'number' &&
           !/(?:^|[^a-zа-я])(?:ne|не)(?:$|[^a-zа-я])|ne e|не е|greska|грешка|pogresno|погрешно|ne tocno|не точно|promeni|промени|izmeni|измени/i.test(u) &&
           messageRepeatsValue(u, pValue)) {
    session.collectedData[pField] = pValue;
    session.collectedData[pField + 'Confidence'] = 0.95;
    session.pendingConfirmation = null;
    delete session.collectedData[pField + 'Skipped'];
    console.log(`[CONFIRMED: ${pField} = ${JSON.stringify(pValue)} (owner repeated the value)]`);
  }
  // User provides a different number — let extraction handle it
  else if (/\d/.test(u) || /promeni|измени|izmeni|измени|cetiri|pet|sest|sedum|osum|devet|deset|stoti|iljadi|илјади|edna|dve|tri/i.test(u)) {
    session.pendingConfirmation = null;
    console.log(`[CONFIRMATION: user providing new value — let extraction handle]`);
    // Fall through to normal extraction
  }
  // Unclear answer — prompt again
  else {
    const confirmQuestion = getQuestion(pField, session.adMemory?.propertyType || 'apartment');
    return { text: `Ве молам, потврдете. Дали точната вредност е ${pValue}?`, type: "QUESTION", nextField: pField };
  }

  return null;
}

// ========================================
// RECENT AVAILABILITY CONFIRMATION (grace batches)
// The engine's owner-follow-up grace window runs EVERY queued message
// through generateResponse but only the LAST response is sent. By the time
// the last message is processed, session.messages already contains all the
// batched owner texts (engine.onOwnerMessage → addReply runs immediately).
// An availability confirmation that arrived as an EARLIER message in the
// same batch ("da" → "uste ne sum go izdal" → "350 evra") must still be
// acknowledged on the visible reply — checking only the current message
// would miss it. Returns true if any owner message since Ana's last reply
// confirms the property is still available.
// ========================================
function hasRecentAvailabilityConfirmation(session) {
  const msgs = session.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'model') break; // stop at Ana's last reply
    if (confirmsAvailability(m.text)) return true;
  }
  return false;
}

// ========================================
// REPEAT-VALUE CONFIRMATION HELPER
// The pending-confirmation question always names the value ("Дали точната
// вредност е 350?"). An owner who repeats that same number back — "350",
// "350 e", "350 TI REKOV DA", "KAZAV 350" — IS confirming, even without a
// "da"/"tocno". Digit runs are compared numerically with separators (spaces,
// commas, dots) stripped so "350" never matches inside "1350" or "3500".
// WORD-NUMBER REPEATS (reported, lead 3571074): "TRI" in reply to "Дали
// точната вредност е 3?" — the owner repeats the SAME Macedonian number
// WORD they originally answered with. Digit-only matching missed it ("tri"
// has no digits), so the repeat fell into the "new value" branch below,
// pending was cleared, re-extraction scored MEDIUM again and re-pended —
// the SAME confirmation question forever (the bedrooms "TRI" loop). Parse
// the word/phrase too: parseNumberWords (exact single-word + compound
// phrases: "tri"→3, "osumdeset i ses"→86) and parseMacedonianNumber
// (handles inflected contexts like "tri sobi"→3 via includes). The numeric
// comparison against pValue is the gate, so a DIFFERENT value repeated in
// words ("triest"=30 when 3 is pending) never confirms.
// ========================================
function messageRepeatsValue(u, pValue) {
  const digits = u.replace(/\s+/g, '').match(/\d+(?:[.,]\d+)?/g) || [];
  if (digits.some(d => Math.abs(parseFloat(d.replace(',', '.')) - pValue) < 0.01)) return true;
  const wordNum = parseNumberWords(u);
  if (wordNum !== null && Math.abs(wordNum - pValue) < 0.01) return true;
  const macNum = parseMacedonianNumber(u);
  if (macNum !== null && Math.abs(macNum - pValue) < 0.01) return true;
  // PLUS-SUM (reported, lead 3571074): "EDNA PLUS DVE" (one plus two = 3) in
  // reply to "Дали точната вредност е 3?" IS a confirmation of 3. The
  // single-word parsers above grab only "edna"→1 ≠ 3, so the repeat was
  // missed → pending cleared → re-extracted 1 → re-pended forever. The sum
  // must match pValue exactly ("EDNA PLUS DVE"=3 confirms 3; "DVE PLUS
  // DVE"=4 does NOT confirm 3).
  const plusSum = parsePlusSum(u);
  if (plusSum !== null && Math.abs(plusSum - pValue) < 0.01) return true;
  return false;
}

/**
 * GLOBAL EXTRACTION PASS — extracts all simple fields from EVERY message.
 * Runs for BOTH persuasion and data collection phases.
 * SKIP if a follow-up (pendingFollowUp) is active.
 *
 * @returns {Object|null} — confirmation-question response, or null to continue
 */
export function runGlobalExtractionPass({ u, userInput, session, nextField }) {
  if (session.pendingFollowUp) {
    console.log(`[PENDING FOLLOW-UP: ${session.pendingFollowUp} — global extraction skipped]`);
    return null;
  }

  const rawUpdates = runGlobalExtraction(u, session.collectedData, nextField);
  // Split extracted values by confidence level
  // HIGH → store immediately (with high confidence score)
  // MEDIUM for current field → set pendingConfirmation (ask user)
  // MEDIUM for volunteered (non-current) field → store silently (with medium score)
  // LOW → discard entirely
  const toStore = {};     // HIGH or volunteered-MEDIUM → store immediately
  const toScores = {};    // key → numeric confidence (stored alongside value)
  let provisionalValue = null;  // MEDIUM for current field → ask confirmation

  const extractedLog = [];
  const rejectedLog = [];
  for (const [key, value] of Object.entries(rawUpdates)) {
    const confidence = assessConfidence(key, value, u);
    const score = confidenceToNumeric(confidence);
    if (confidence === 'HIGH') {
      toStore[key] = value;
      toScores[key] = score;
      extractedLog.push({ key, value, score });
    } else if (confidence === 'MEDIUM' && key === nextField &&
               // NEVER re-pend a field that already has a value. nextField is
               // computed in service.js BEFORE runPendingConfirmation runs, so
               // after a just-confirmed value (e.g. monthlyRent=350 via "350 TI
               // REKOV DA") it is stale and still points at the confirmed
               // field. Without this guard the same message would be re-scored
               // MEDIUM → re-pended → the identical confirmation question
               // (reported stuck price loop).
               (session.collectedData[key] === undefined || session.collectedData[key] === null)) {
      provisionalValue = { field: key, value };
      extractedLog.push({ key, value, score: 0.60, pending: true });
    } else if (confidence === 'MEDIUM') {
      toStore[key] = value;
      toScores[key] = score;
      extractedLog.push({ key, value, score, volunteered: true });
    } else {
      rejectedLog.push({ key, value, reason: 'context mismatch' });
    }
  }
  // Print extraction summary
  if (extractedLog.length > 0 || rejectedLog.length > 0) {
    console.log(`--- EXTRACTION ---`);
    console.log(`MESSAGE: ${JSON.stringify(userInput)}`);
    for (const e of extractedLog) {
      const tag = e.pending ? ' (PENDING)' : e.volunteered ? ' (volunteered)' : '';
      console.log(`  EXTRACTED: ${e.key}=${JSON.stringify(e.value)} (${e.score.toFixed(2)})${tag}`);
    }
    for (const r of rejectedLog) {
      console.log(`  REJECTED: ${r.key}=${JSON.stringify(r.value)} (${r.reason})`);
    }
    console.log(`------------------`);
  }

  // Store HIGH and volunteered-MEDIUM values (with their confidence scores)
  for (const [key, value] of Object.entries(toStore)) {
    // Don't overwrite values already set by confirmed high-confidence
    // extraction — EXCEPT explicit mid-collection PRICE corrections
    // ("ne, 300 e"): the owner's new number REPLACES the stored
    // backfilled/extracted price instead of being silently kept (reported).
    const isPriceKey = key === 'cleanPrice' || key === 'monthlyRent';
    const existingVal = session.collectedData[key];
    const isCorrection = isPriceKey && typeof existingVal === 'number' && typeof value === 'number' &&
                         Math.abs(existingVal - value) >= 1 && isExplicitPriceCorrection(u);
    if (existingVal === undefined || existingVal === null || isCorrection) {
      session.collectedData[key] = value;
      // A corrected price is the owner's explicit statement → store at HIGH;
      // fresh fills keep the assessed score (0.95 HIGH / 0.60 volunteered).
      session.collectedData[key + 'Confidence'] = isCorrection ? 0.95 : (toScores[key] || 0.95);
      // A real value just arrived — clear any stale skip marker from an earlier
      // max-2-attempts skip (e.g. renovated was skipped as null, then the owner
      // finally answered "NE E RENOVIRAN" → renovated=false at 0.95).
      delete session.collectedData[key + 'Skipped'];
      if (isCorrection) {
        console.log(`[PRICE CORRECTION: ${key} ${existingVal} → ${value} (explicit correction, stored at HIGH)]`);
      }
    }
  }

  // Handle MEDIUM for current field — ask confirmation instead of storing
  if (provisionalValue) {
    session.pendingConfirmation = provisionalValue;
    const confirmQuestion = getQuestion(provisionalValue.field, session.adMemory?.propertyType || 'apartment');
    const confirmText = `Дали точната вредност е ${provisionalValue.value}? ${confirmQuestion}`;
    // Return confirmation question — don't fall through to complex handlers
    return { text: confirmText, type: "QUESTION", nextField: provisionalValue.field };
  }

  return null;
}

// ========================================
// PURE PHOTO-TALK DETECTION — used by the ownerName/address handlers.
// When Ana asks "Како да ве запишам?" / "Која е адресата?" and the owner
// instead replies about arranging photo delivery — "NA OVOJ BROJ TREBA"
// ("[I'll send them] to this number"), "IMAM KE VI ISPRATAM", a bare phone
// number, "KE VI PRATAM NA VIBER" — that is NOT a name/address and must
// never be stored as one (reported bug: "NA OVOJ TREBA" was stored as the
// owner name). Leading anchors keep real names safe: "ZORAN ATANASOV" or
// "GORAN KE VI ISPRATAM SLIKI" (name + photo-talk) never match here — the
// latter is handled by the ownerName tail-strip instead.
// ========================================
function isPurePhotoTalk(u) {
  const t = u.trim();
  const low = t.toLowerCase();
  // 1. Strip leading photo-affirmative chatter ("imam", "imam sliki",
  //    "da imam", "ima", "se" + separators) — that content is ABOUT the
  //    photos, not a name. Repeated so "IMAM SLIKI / IMAM KE VI ISPRATAM"
  //    and "DA, IMAM SLIKI, KE VI PRATAM" all reduce to the delivery talk.
  //    A name like "DAVID"/"IMAN"/"IMAMOV" is never emptied (strip only
  //    consumes exact affirmative tokens + separators), so real names stay
  //    intact and fall through to normal storage.
  const stripped = low.replace(/^(?:(?:imam|имам|ima|има|da|да|se|се)\s*(?:(?:sliki|слики|fotografii|фотографии)\s*)?[,/:\s]*)+/, '');
  const s = stripped.trim();
  // The message was ONLY photo affirmatives ("DA IMAM SLIKI") → photo-talk.
  if (s === '') return true;
  // 2. Delivery-target phrases: "na ovoj broj" (to this number), "na ovoj",
  //    "na brojot" / "на бројот" (to the number), "na viber" / "на вајбер",
  //    "na viberot" / "на вајберот", "tuka" (here). Letter-boundary matching
  //    (not \b — Cyrillic) so "ovoj"/"viber" must be followed by a
  //    non-letter — "NA VIBEROVA ULICA" (a street name) never matches.
  if (/^(?:na|на)\s+(?:ovoj|овој|ovaa|оваа|ova|ova|brojot|бројот)(?:$|[^a-zа-я])/.test(s)) return true;
  if (/^(?:na|на)\s+(?:viber|vajber|вајбер|viberot|вајберот)(?:$|[^a-zа-я])/.test(s)) return true;
  if (/^(?:tuka|тука)(?:$|[^a-zа-я])/.test(s)) return true;
  // 2b. "zemi mi na viber" / "земи ги на вајбер" — the owner tells Ana to
  //     TAKE the photos from them on Viber (a delivery arrangement, same
  //     class as "ke vi ispratam na viber"). Requires a pronoun and/or
  //     target after "zemi" so a word like "ZEMIROV" (no space after
  //     "zemi") can never match.
  if (/^zemi\s+(?:(?:mi|ми|gi|ги)\s+){0,2}(?:na\s+)?(?:viber|vajber|вајбер|brojot|бројот|broj|број)?(?:$|[^a-zа-я])/.test(s)) return true;
  // 3. Delivery commitments: "ke vi ispratam", "ke gi pratam", bare
  //    "ispratam"/"pratam" — with a letter-boundary guard so a surname like
  //    "PRATAMOV" never matches ("pratam" + "ov"). Pronouns are bilingual
  //    AND repeatable (1-2): "ќе ви испратам", "ќе ги пратам",
  //    "ќе ви ги испратам" all reduce to the commitment verb.
  if (/^(?:(?:ke|ќе)\s+(?:(?:vi|ви|ти|ti|gi|ги|gu|гу)\s+){0,2})?(?:ispratam|испратам|pratam|пратам|prakj|праќам|pushtam|пуштам)(?:$|[^a-zа-я])/.test(s)) return true;
  // 4. Bare phone number — the delivery target, never a name/address
  if (/^\+?[0-9][0-9\s\-–/]{6,15}$/.test(t) && t.replace(/\D/g, '').length >= 7) return true;
  return false;
}

// ========================================
// NON-NAME STOPLIST — words that commonly follow "jas sum" / "ja sum" but
// are NOT names ("jas sum zainteresiran" = "I am interested"). Used by the
// ownerName name-marker extraction to refuse storing a continuation word as
// the owner's name. Keep domain-relevant (cooperation/status vocabulary), so
// genuine "jas sum Goran" answers still pass.
// ========================================
const NON_NAME_STOPLIST = /^(?:zainteresiran|zainteresirana|zainteresirani|zainteresiran?|siguren|sigurna|sigureni|klient|klientka|klienti|zaposlen|zaposlena|vraboten|vrabotena|sloboden|slobodna|dostapen|dostapna|pensioner|pensionerka|sopstvenik|sopstvenicka)$/i;

// ========================================
// OWNER-NAME PREFIX LEXICON — conversational naming words that must be
// stripped so ONLY the name is stored ("PISI GORAN" → "Goran", never "Pisi
// Goran"). Both scripts + the common Viber spellings WITHOUT the "h"
// ("pisi", "zapisi", "zapisete") and the 1st-person copula ("jas sum" /
// "јас сум"). IMPORTANT: longest patterns FIRST — "пиши ме како " before
// "пиши ме " before "пиши ". Reported: only "pishi" (with h) was in the
// list, so "PISI GORAN" kept its prefix and stored "Pisi Goran". Applied
// twice (with a separator strip between) in the ownerName handler so CHAINED
// prefixes like "jas sum, pisi goran" reduce fully.
//
// Every pattern ends with (?:[\s,;:]+|$) — a separator OR end-of-string —
// for three reasons: (1) chained prefixes separated by punctuation
// ("JAS SUM, PISI GORAN") still reduce, (2) a BARE prefix word ("PISI" —
// the owner typed only the instruction, no name) consumes the whole message
// so nothing is stored and Ana re-asks instead of writing "Pisi" as a name,
// and (3) a surname that merely CONTAINS a prefix word ("PISIMOV") never
// matches (no separator after "pisi"). The "како"/"kako" ("as") clause is
// ONLY stripped when a naming verb precedes it — it's folded into the
// "може да ... запишете" patterns as an optional group, so "МОЖЕ ДА МЕ
// ЗАПИШЕТЕ КАКО ГОРАН" reduces in ONE pass. There is deliberately NO
// standalone "kako" pattern: a bare leading "како" without a naming verb
// ("KAKO BILO" = "however", or an owner echoing "КАКО ДА МЕ ЗАПИШЕТЕ?") is
// not a naming answer and must never be consumed — that would store
// "Bilo"/"Da Me Zapishete" as a name (reviewer-flagged over-match).
// ========================================
const OWNER_NAME_PREFIX_RE = /^(?:може\s+да\s+ме\s+запишете(?:\s+како)?(?:[\s,;:]+|$)|може\s+да\s+ме\s+запишеш(?:\s+како)?(?:[\s,;:]+|$)|пиши\s+ме\s+како(?:[\s,;:]+|$)|запиши\s+ме\s+како(?:[\s,;:]+|$)|стави\s+ме\s+како(?:[\s,;:]+|$)|внеси\s+ме\s+како(?:[\s,;:]+|$)|запишете\s+ме\s+како(?:[\s,;:]+|$)|запишете\s+ме(?:[\s,;:]+|$)|пиши\s+ме(?:[\s,;:]+|$)|запиши\s+ме(?:[\s,;:]+|$)|стави\s+ме(?:[\s,;:]+|$)|внеси\s+ме(?:[\s,;:]+|$)|може\s+да\s+запишеш(?:\s+како)?(?:[\s,;:]+|$)|може\s+да\s+запишете(?:\s+како)?(?:[\s,;:]+|$)|пиши[й]?(?:[\s,;:]+|$)|запиши[й]?(?:[\s,;:]+|$)|стави(?:[\s,;:]+|$)|внеси(?:[\s,;:]+|$)|запишете(?:[\s,;:]+|$)|јас\s+сум(?:[\s,;:]+|$)|ја\s+сум(?:[\s,;:]+|$)|moze\s+da\s+me\s+zapishete(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+me\s+zapisete(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+me\s+zapishesh(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+me\s+zapisesh(?:\s+kako)?(?:[\s,;:]+|$)|pishi\s+me\s+kako(?:[\s,;:]+|$)|pisi\s+me\s+kako(?:[\s,;:]+|$)|zapishi\s+me\s+kako(?:[\s,;:]+|$)|zapisi\s+me\s+kako(?:[\s,;:]+|$)|stavi\s+me\s+kako(?:[\s,;:]+|$)|vnesi\s+me\s+kako(?:[\s,;:]+|$)|zapishete\s+me\s+kako(?:[\s,;:]+|$)|zapisete\s+me\s+kako(?:[\s,;:]+|$)|zapishete\s+me(?:[\s,;:]+|$)|zapisete\s+me(?:[\s,;:]+|$)|pishi\s+me(?:[\s,;:]+|$)|pisi\s+me(?:[\s,;:]+|$)|zapishi\s+me(?:[\s,;:]+|$)|zapisi\s+me(?:[\s,;:]+|$)|stavi\s+me(?:[\s,;:]+|$)|vnesi\s+me(?:[\s,;:]+|$)|moze\s+da\s+zapishesh(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+zapisesh(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+zapishete(?:\s+kako)?(?:[\s,;:]+|$)|moze\s+da\s+zapisete(?:\s+kako)?(?:[\s,;:]+|$)|pishi(?:[\s,;:]+|$)|pisi(?:[\s,;:]+|$)|zapishi(?:[\s,;:]+|$)|zapisi(?:[\s,;:]+|$)|stavi(?:[\s,;:]+|$)|vnesi(?:[\s,;:]+|$)|zapishete(?:[\s,;:]+|$)|zapisete(?:[\s,;:]+|$)|jas\s+sum(?:[\s,;:]+|$)|ja\s+sum(?:[\s,;:]+|$))/i;

// ========================================
// ENSURE PHOTO DELIVERY PENDING — the owner just promised to send photos
// ("I'll send them to this number"). Mark VIBER_PENDING if not already in
// a delivery/resolved state, and clear any earlier photos-skip marker.
// ========================================
function ensurePhotoDeliveryPending(session) {
  const d = session.collectedData;
  if (d.photosStatus === 'VIBER_PENDING' || d.photosStatus === 'VIBER_RECEIVED') return;
  d.photosPermission = true;
  d.photosSource = 'VIBER_PENDING';
  d.photosStatus = 'VIBER_PENDING';
  d.photos = true;
  d.photosPending = false;
  delete d.photosSkipped;
  console.log(`[PHOTOS: VIBER_PENDING — owner is arranging photo delivery]`);
}

// ========================================
// PHOTO-TALK MENTION — loose check used ONLY by the composite paths: a name
// or address answer that ALSO mentions photo delivery ("IMAM SLIKI, ... IME:
// GORAN") should acknowledge the photos promise (VIBER_PENDING) while still
// storing the name/address. Negated photos ("NEMA SLIKI") are NOT a delivery
// promise. Letter-boundary guarded so surnames like "Zemirov"/"Viberova" or
// the word "fotograf" (photographer) never count as photo-talk.
// ========================================
function mentionsPhotoTalk(u) {
  if (/(?:nema|нема|nemam|немам|bez|без)\s+(?:sliki|слики|slikite|сликите|fotografii|фотографии|fotografite|фотографиите)/i.test(u)) return false;
  // Definite-article forms ("slikite", "фотографиите", "viberot") included
  // so "GORAN, SLIKITE KE VI GI PRATAM" acks delivery — the pure guard
  // already recognizes "viberot|вајберот".
  return /(?:^|[^a-zа-я])(?:sliki|слики|slikite|сликите|fotografii|фотографии|fotografite|фотографиите|ispratam|испратам|pratam|пратам|prakj|праќам|pushtam|пуштам|zemi|земи|viber|вајбер|vajber|viberot|вајберот)(?:$|[^a-zа-я])/i.test(u);
}

// ========================================
// ADDRESS CLEANER — shared by the address branch and the ownerName
// address-route branch below. Label strip ("АДРЕСА: УЛ. 12"), sentence
// split, photo-talk tail strip, trailing-separator trim. Extracted
// verbatim from the address branch so both call sites stay in sync.
// ========================================
function cleanAddressText(raw) {
  let cleaned = raw.trim();
  // EXPLICIT ADDRESS MARKER — "АДРЕСА: УЛ. 12", "adresata e ul. 12" —
  // the owner labels the address inside a multi-part message.
  const addrLabel = cleaned.match(/(?:^|[^a-zа-я])(?:адресата|adresata|адреса|adresa)\s*(?:е|e)?\s*:?\s*([^\n,;]+)/i);
  if (addrLabel) cleaned = addrLabel[1].trim();
  // PHOTO-TALK TAIL STRIP — same markers as ownerName: a photo-delivery
  // tail after the address ("UL. PARTIZANSKA 12, IMAM SLIKI KE VI
  // PRATAM NA VIBER") must never be stored as part of the address.
  cleaned = cleaned
    // NOTE: no period in the split — street abbreviations "ул."/"UL."
    // (Ulica) are ubiquitous in addresses and a period-split would cut
    // "UL. PARTIZANSKA 12" to just "UL". Only ! ? … end a sentence here.
    .split(/[!?…]+/)[0]
    .replace(/\s+(?:imam|имам|sliki|слики|slikite|сликите|fotografii|фотографии|fotografite|фотографиите|ispratam|испратам|pratam|пратам|prakj|праќам|pushtam|пуштам|ke\s+vi\s+ispratam|ќе\s+ви\s+испратам|ke\s+vi\s+pratam|ќе\s+ви\s+пратам|ke\s+gi\s+ispratam|ќе\s+ги\s+испратам|ke\s+gi\s+pratam|ќе\s+ги\s+пратам|ke\s+ispratam|ќе\s+испратам|ke\s+pratam|ќе\s+пратам|na\s+ovoj\s+broj|на\s+овој\s+број|na\s+viber|на\s+вајбер|viber|вајбер|viberot|вајберот|zemi|земи)(?![a-zа-я]).*$/i, '')
    .replace(/[,;:.\s]+$/, '')
    .trim();
  return cleaned;
}

/**
 * COMPLEX STATEFUL HANDLERS (Data Collection only).
 * These have early returns (follow-up questions) or complex state machine
 * logic that can't be pure extraction.
 *
 * @returns {Object|null} — { text, type } response, or null to continue
 */
export function runComplexStatefulHandlers({ u, userInput, session, nextField, hasScraperPhotos }) {
  // LAND GUARD — land properties (plac/niva/parcela/земјиште...) have NO
  // building features. The workflow whitelist never ASKS terrace/heating for
  // land, but the extraction branches below are NOT nextField-gated: without
  // this guard a land owner answering the sqm question with a bare number
  // ("60") and no price/sqm context would store a phantom
  // hasTerrace=true/terraceSqm=60, and a stray "parno" mention would start a
  // heating follow-up — building data on a plot. Skip the terrace and heating
  // sections entirely for land leads (photos/ownerName/address are already
  // nextField-gated, so they stay untouched).
  const isLandLead = session.adMemory?.propertyType === 'land' || session.collectedData?.propertyType === 'land';
  // COMMERCIAL GUARD (terrace only) — business properties (локал/офис/магацин...)
  // have NO terrace in their whitelist (and no bedrooms/elevator), but the
  // terrace extraction branch is NOT nextField-gated: a commercial owner
  // answering the sqm question with a bare number ("80") and no price/sqm
  // context would store a phantom hasTerrace=true/terraceSqm=80 — residential
  // data on a business unit. Heating is NOT skipped here: the workflow ASKS
  // heating for commercial, and the parno-follow-up is legitimately part of
  // that flow (a business space has heating too).
  const isCommercialLead = session.adMemory?.propertyType === 'commercial' || session.collectedData?.propertyType === 'commercial';

  // === floor — POTKROVJE DEFERRAL (reported) ===
  // The attic (поткровје) sits ABOVE the last floor: floor = totalFloors + 1.
  // extractFloor computes it directly when totalFloors is known (collected or
  // same-message hint). When the owner answers the floor question with
  // "NA POTKROVJE" and totalFloors is NOT known yet, extractFloor returns
  // null (it must NEVER guess — the old (totalFloors || 6) default fabricated
  // a 6-floor building and stored floor=7). Set the deferral flag so the
  // question flow asks totalFloors FIRST and derives floor when it arrives.
  if (nextField === 'floor' &&
      session.collectedData.floor === undefined &&
      session.collectedData.floorPendingPotkrovje === undefined &&
      /potkrovje|поткровје|podkrovje|подкровје|potkrov|поткров/i.test(u) &&
      typeof session.collectedData.totalFloors !== 'number') {
    session.collectedData.floorPendingPotkrovje = true;
    console.log('[POTKROVJE: totalFloors unknown — deferring floor, will ask totalFloors first]');
  }

  // === terraceSqm (Handles ALL cases) ===
  if (!isLandLead && !isCommercialLead && session.collectedData.terraceSqm === undefined && session.collectedData.hasTerrace === undefined) {

    // PENDING FOLLOW-UP: When we just asked "kolku kvadrati?", process the
    // reply with "ne znam" and "nema" checks FIRST, before number extraction.
    // This prevents extractTerraceNumber from grabbing unrelated numbers like
    // "13" from "ne znam ama zgradata ima 13 sprata" → terraceSqm=13.
    if (session.pendingFollowUp === 'terraceSqm') {
      // "ne znam" reply
      if (/ne znam|не знам|незнам|neznam|ne znam tocno|не знам точно|ne sum siguren|не сум сигурен/i.test(u)) {
        session.collectedData.hasTerrace = true;
        session.collectedData.terraceSqm = null;
        session.pendingFollowUp = null;
        console.log(`[TERRACE: yes, size unknown]`);
      }
      // True negative response
      else if (/^0$|nema terasa|нема тераса|nema|нема|без|bez|nema|нема|bez terasa|без тераса|nema parking|нема паркинг/i.test(u) && !/ima|има|kv|кв|m2|м2|kvadrat|квадрат/i.test(u)) {
        session.collectedData.hasTerrace = false;
        session.collectedData.terraceSqm = 0;
        session.pendingFollowUp = null;
        console.log(`[TERRACE: none]`);
      }
      // Try to extract a bare number answer (e.g., "pet" = 5)
      else {
        const firstNum = extractTerraceNumber(u);
        if (firstNum !== null && firstNum > 0 && firstNum < 100) {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = firstNum;
          session.pendingFollowUp = null;
          console.log(`[TERRACE: ${firstNum}m2]`);
        }
        // TERRACE-COUNT ANSWER (reported): "imaima terasi 2" / "ima 2 terasi"
        // — the owner answered the follow-up with the NUMBER OF TERRACES, not
        // the m² size (extractTerraceNumber refuses bare counts next to the
        // plural forms). The terrace EXISTS but its size stays unknown —
        // resolve exactly like "ne znam" instead of clearing pending and
        // re-asking forever (the normal-flow branch below would otherwise
        // re-arm the follow-up on the terrace/ima context and loop).
        else if (/terasa|тераса|terrace|teras|терас|(?:^|[^a-zа-я])ima(?:$|[^a-zа-я])|(?:^|[^a-zа-я])има(?:$|[^a-zа-я])/i.test(u)) {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = null;
          session.pendingFollowUp = null;
          console.log(`[TERRACE: yes, count given (not m²) — size unknown]`);
        } else {
          // Nothing matched — clear pending so normal flow resumes
          session.pendingFollowUp = null;
        }
      }
    }

    // NORMAL FLOW (no pending follow-up, or pending was cleared)
    if (session.collectedData.terraceSqm === undefined && session.collectedData.hasTerrace === undefined) {
      // FIRST: Try to extract a terrace number — only accept if:
      //   a) the message has "terasa" context (e.g., "terasa 5m2"), OR
      //   b) there's NO generic sqm phrasing (bare word like "pet" = follow-up answer)
      // Generic sqm like "55 kvadrati" is totalSqm, NOT terrace
      const firstNum = extractTerraceNumber(u);
      if (firstNum !== null && firstNum > 0 && firstNum < 100) {
        // Accept as terrace size if:
        //   a) "terasa" context present ("terasa 15m2"), OR
        //   b) has "ima"/positive word ("ima 15m2" = has 15m2 terrace), OR
        //   c) no generic sqm or price phrasing (bare word like "pet" = follow-up answer)
        // Reject:
        //   - generic sqm without context ("55 kvadrati" = totalSqm, not terrace)
        //   - price context ("98 iljadi" = price, not terrace)
        // LETTER-BOUNDARY MATCHING: bare "da"/"ima"/"ok"/"moze" must be
        // standalone words — NOT substrings of longer words like "dodatni"
        // (contains "da") or "seprodava" (contains "da"). This prevents
        // phantom terrace extraction from unrelated messages (e.g., a price
        // message mentioning "dodatni sest iljadi" → false terraceSqm).
        const hasTerraceContext = /terasa|тераса|terrace|teras|терас|(?:^|[^a-zа-я])ima(?:$|[^a-zа-я])|(?:^|[^a-zа-я])има(?:$|[^a-zа-я])|(?:^|[^a-zа-я])da(?:$|[^a-zа-я])|(?:^|[^a-zа-я])да(?:$|[^a-zа-я])|(?:^|[^a-zа-я])ok(?:$|[^a-zа-я])|(?:^|[^a-zа-я])океј(?:$|[^a-zа-я])|(?:^|[^a-zа-я])moze(?:$|[^a-zа-я])|(?:^|[^a-zа-я])може(?:$|[^a-zа-я])/i.test(u);
        const hasGenericSqm = /kvadrati|квадрати|m2|м2|kv|кв|sqm/i.test(u);
        // RENT/PAYMENT CONTEXT — reported phantom: in a rent conversation the
        // owner answers with "EDNA KIRIJA" / "DEPOZIT KIRIJA" (one rent as
        // deposit, paid in advance) — payment terms, NOT a terrace. Without
        // kirija/depozit/kavcija/odnapred here, extractTerraceNumber's bare-
        // number fallback parsed "edna"→1 and stored a phantom
        // terraceSqm=1 (corrupting the listing data).
        const hasPriceContext = /iljadi|илјади|evra|евра|eur|evro|евро|kirija|кирија|depozit|депозит|kavcija|кавција|кауција|odnapred|однапред/i.test(u);
        if ((hasTerraceContext || (!hasGenericSqm && !hasPriceContext))) {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = firstNum;
          console.log(`[TERRACE: ${firstNum}m2]`);
        }
      }
      // "ne znam" reply — only when terraceSqm is the current workflow field
      if (session.collectedData.terraceSqm === undefined && nextField === 'terraceSqm' && /ne znam|не знам|незнам|neznam|ne znam tocno|не знам точно|ne sum siguren|не сум сигурен/i.test(u)) {
        session.collectedData.hasTerrace = true;
        session.collectedData.terraceSqm = null;
        console.log(`[TERRACE: yes, size unknown]`);
      }
      // True negative responses — only when terraceSqm is the current workflow field
      else if (session.collectedData.terraceSqm === undefined && nextField === 'terraceSqm' && /^0$|nema terasa|нема тераса|nema|нема|без|bez|nema|нема|bez terasa|без тераса|nema parking|нема паркинг/i.test(u) && !/ima|има|kv|кв|m2|м2|kvadrat|квадрат/i.test(u)) {
        session.collectedData.hasTerrace = false;
        session.collectedData.terraceSqm = 0;
        console.log(`[TERRACE: none]`);
      }
      // Has terrace (with ima/terasa context) but no number found
      // Only ask follow-up if terraceSqm is the current workflow field
      // Otherwise silently wait — the workflow will ask when it's time
      else if (session.collectedData.terraceSqm === undefined && nextField === 'terraceSqm' && (/ima|има|terasa|тераса|terrace|teras|терас/i.test(u) || isPositive(u))) {
        console.log(`[TERRACE: yes, size unknown — asking follow-up]`);
        session.pendingFollowUp = 'terraceSqm';
        return {
          text: 'Дали знаете колку квадрати е терасата?',
          type: "QUESTION"
        };
      }
    }
  }

  // === heating (FIXED — parno follow-up, B16) ===
  // Gate also fires when the owner VOLUNTEERS "parno" while another field
  // is the current question (e.g. "IMA LIFT,KLIMA , PARNO , NAMESTEN").
  // Previously bare "parno" was silently lost because this handler only ran
  // when nextField==='heating' or a follow-up was already pending.
  // EXPLICIT NON-ANSWER to the "Какво парно?" follow-up — the ONLY case that
  // may default heating to parno_unknown. Reported bug: bare "parno" was
  // mentioned as BONUS info, the follow-up got pending, and then an UNRELATED
  // message (e.g. "parking mesto na -1 vo centar") was consumed as a heating
  // non-answer → heating wrongly stored as parno_unknown/unknown with no
  // clarification. Only an explicit "не знам"-family reply defaults; anything
  // else while the follow-up is pending re-asks the question.
  const heatingNonAnswer = /(?:^|[^a-zа-я])(?:ne|не)\s+(?:znam|знам)(?:\s+(?:tocno|tochno|точно|sigurno|сигурно))?(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+sum\s+(?:siguren|сигурен|sigurna|сигурна)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+(?:mozam|можам)\s+da\s+(?:kazam|кажам)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+se\s+(?:secavam|сеќавам)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:nema|нема|nemam|немам)\s+(?:poim|поим)(?:$|[^a-zа-я])/i;
  // WORD-BOUNDARY REQUIRED (same disease as the "togas"→gas phantom,
  // reported lead 5536052): bare "parno" must be a standalone word —
  // "SPARNO E DENES" (sultry weather, спарно) contains "parno" but is not
  // a heating mention. Cyrillic-aware boundary (JS \b is ASCII-only).
  const parnoMentioned = /(?:^|[^a-zа-я])(?:parno|парно)(?:$|[^a-zа-я])/i.test(u) && !/nema parno|нема парно|nemame parno|немаме парно|nemaat parno|немаат парно|bez parno|без парно|ne e parno|не е парно/i.test(u);
  // (isLandLead skips this entire branch — see the LAND GUARD at the top.)
  if (!isLandLead && (nextField === 'heating' || session.collectedData.heatingFollowUp ||
      (parnoMentioned && !session.collectedData.heating))) {
    if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg|(?:^|[^a-zа-я])(?:centralno|централно|central)(?:$|[^a-zа-я])/i.test(u)) {
      session.collectedData.heating = "district";
      session.collectedData.heatingType = "district";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: district]`);
    } else if (/sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно|etazno|етажно|etazhno|jas\s+(?:sum\s+|сум\s+)?(?:go|го)\s+(?:staviv|ставив|stavil|ставил|postaviv|поставив|postavil|поставил)|(?:go|го)\s+(?:staviv|ставив|postaviv|поставив)(?:\s+(?:jas|licno|сам|лично))?|jas\s+licno\s+go\s+stav|јас\s+лично\s+го\s+став|sopstveno\s+go\s+staviv|сопствено\s+го\s+ставив/i.test(u)) {
      session.collectedData.heating = "central";
      session.collectedData.heatingType = "private_central";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: private_central]`);
    } else if (parnoMentioned && !session.collectedData.heatingFollowUp) {
      // Bare "parno" (no qualifier) — ask the follow-up question.
      // Runs BEFORE the klima branch so "parno + klima" resolves parno
      // as the heating type and klima as AC, not the reverse.
      session.collectedData.heatingFollowUp = true;
      session.pendingFollowUp = 'heating';
      return {
        text: "Какво парно? Градско или сопствено?",
        type: "QUESTION"
      };
    } else if ((/(?:^|[^a-zа-я])(?:klima|клима)(?:ta|та)?(?:$|[^a-zа-я])/i.test(u) || /inverter|инвертер|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u) || (/(?:^|[^a-zа-я])(?:split|сплит)(?:$|[^a-zа-я])/i.test(u) && !/(?:^|[^a-zа-я])(?:od|од|vo|во|na|на|do|до|za|за)\s+(?:split|сплит)(?:$|[^a-zа-я])/i.test(u))) && !parnoMentioned) {
      session.collectedData.heating = "electric";
      session.collectedData.heatingType = "inverter";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: inverter]`);
    } else if (/struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i.test(u)) {
      session.collectedData.heating = "electric";
      session.collectedData.heatingType = "electric";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: electric]`);
    } else if (/drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i.test(u)) {
      if (/drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i.test(u)) {
        session.collectedData.heating = "solid_fuel";
        session.collectedData.heatingType = "wood_pellets";
      } else {
        session.collectedData.heating = "oil";
        session.collectedData.heatingType = "oil";
      }
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: ${session.collectedData.heatingType}]`);
    }
    // The follow-up is pending but this message did NOT resolve it. Only an
    // explicit non-answer ("ne znam" family — the owner actually saw the
    // question and can't answer) defaults to parno_unknown. An unrelated
    // message (bonus info about ANOTHER field — the reported bug) or a
    // repeated bare "parno" is NOT an answer to "Какво парно?" — re-ask the
    // follow-up so the owner actually gets asked, keeping heating unset until
    // then (a message must never silently default heating to unknown).
    if (session.collectedData.heatingFollowUp) {
      if (heatingNonAnswer.test(u)) {
        session.collectedData.heating = "parno_unknown";
        session.collectedData.heatingType = "unknown";
        session.collectedData.heatingFollowUp = false;
        session.pendingFollowUp = null;
        console.log(`[HEATING: parno_unknown (owner doesn't know — defaulted)]`);
      } else {
        // RE-ASK — with a max-2 re-ask cap (mirrors the max-2-attempts skip
        // for regular fields): an owner who keeps sending unrelated messages
        // without answering must not pin the conversation on the heating
        // question forever. After 2 unanswered re-asks, default to unknown.
        // NOTE: while the follow-up is pending, global extraction is skipped
        // (runGlobalExtractionPass early-returns on pendingFollowUp), so
        // unrelated bonus info in these messages is not extracted — a
        // pre-existing follow-up design property, accepted here to preserve
        // the reported requirement (bare parno must be clarified, not
        // silently defaulted).
        const reAskCount = session.collectedData.heatingFollowUpAttempts || 0;
        if (reAskCount >= 2) {
          session.collectedData.heating = "parno_unknown";
          session.collectedData.heatingType = "unknown";
          session.collectedData.heatingFollowUp = false;
          session.pendingFollowUp = null;
          delete session.collectedData.heatingFollowUpAttempts;
          console.log(`[HEATING: parno_unknown (max re-asks reached)]`);
        } else {
          session.collectedData.heatingFollowUpAttempts = reAskCount + 1;
          console.log(`[HEATING: follow-up re-asked (${reAskCount + 1}/2) — message is not a heating answer]`);
          return {
            text: "Какво парно? Градско или сопствено?",
            type: "QUESTION"
          };
        }
      }
    }
  }

  // Safety net: clear pendingFollowUp before photo/ownerName/address handlers
  // in case pendingFollowUp was left set from a previous unanswered follow-up
  session.pendingFollowUp = null;

  // === photos (complex stateful handler with scraper logic) ===
  // PHOTOS MARKETING FOLLOW-UP SUB-STATES (reported requirement):
  //   'MAKE_ASKED'         — owner said NEMAM; we asked if he could MAKE the
  //                          photos himself and send them on Viber (couple of
  //                          question variants). Photos are needed for marketing.
  //   'PHOTOGRAPHY_ASKED'  — owner can't make photos; we sent the professional-
  //                          photography offer from our agents (NO_PHOTOS
  //                          category, manager-review flag when worth it).
  // Both are TRANSIENT: entered from the NEGATIVE branch below, each returns a
  // follow-up question, and the next owner message is interpreted here. They
  // MUST be checked BEFORE the already-processed guard below — otherwise a
  // sub-state answer (e.g. "DA") would be re-marked as photos=true instead of
  // resolving the make/offer decision.
  if (nextField === 'photos' ||
      session.collectedData.photosStatus === 'MAKE_ASKED' ||
      session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED') {
    // --- MAKE-PHOTOS ANSWER (owner said NEMAM; we asked "can you make them
    // yourself and send them on Viber?") ---
    if (session.collectedData.photosStatus === 'MAKE_ASKED') {
      // CANNOT is checked FIRST — isPositive() matches a bare "da" substring,
      // so "ne mozam da napravam" ("I can't make them") would otherwise be
      // swallowed by the YES branch below (reported-class footgun). The idiom
      // guard keeps "nema problem ke napravam" ("no problem, I'll make them")
      // — a POSITIVE commitment — out of the CANNOT bucket.
      const hasIdiomPositive = /nema\s+(?:problem|проблем)|bez\s+(?:problem|проблем)|ne\s+e\s+problem|не\s+е\s+проблем/i.test(u);
      // CANNOT uses a DEDICATED regex — NOT isNegative(): isNegative's
      // unfurnished patterns match "prav"/"прав" as a substring, so a YES
      // like "ke gi napravam" (make them) would be misread as CANNOT (the
      // "napravam"→"prav" trap). Only explicit cannot-phrases and bare
      // standalone negatives count here.
      if (!hasIdiomPositive && /ne\s+mozam|не\s+можам|ne\s+moze|не\s+може|ne\s+umam|не\s+умам|ne\s+mogu|не\s+могу|ne\s+se\s+razbiram|не\s+се\s+разбирам|ne\s+znam|не\s+знам|nemam\s+kako|немам\s+како|ne\s+sum\s+vo\s+moznost|не\s+сум\s+во\s+можност|ne\s+znam\s+da|не\s+знам\s+да|ne\s+mozam\s+da|не\s+можам\s+да|ne\s+umam\s+da|не\s+умам\s+да|nemam\s+aparat|немам\s+апарат|nemam\s+telefon|немам\s+телефон|nema\s+ko\s+da|нема\s+кој\s+да|ne\s+mi\s+se\s+da|не\s+ми\s+се\s+да|ne\s+sakam\s+da\s+pravam|не\s+сакам\s+да\s+правам|(?:^|\s)(?:ne|не|nema|нема|nemam|немам|bez|без)(?:\s|$)/i.test(u)) {
        // NO PHOTOS category + manager-review flag (when worth it) +
        // professional-photography offer from our agents.
        session.collectedData.photosPermission = false;
        session.collectedData.photosSource = "NO_PHOTOS";
        session.collectedData.photosStatus = "PHOTOGRAPHY_ASKED"; // offer is next
        session.collectedData.photos = false;
        session.collectedData.photosPending = false;
        const worthIt = isPhotosWorthManagerReview(session);
        if (worthIt) session.collectedData.photosManagerReview = true;
        console.log(`[PHOTOS: NO_PHOTOS — owner can't make photos; photosManagerReview=${worthIt}; photography offer sent]`);
        return { text: photosMessages.photographyOffer(), type: "QUESTION" };
      }
      // YES → VIBER PENDING + AWAITING_PHOTOS. The engine's AWAITING_PHOTOS
      // timer anchors the 2-day/5-day reminder ladder on photosPendingSince.
      if (isPositive(u) || /ke\s+gi\s+napravam|ќе\s+ги\s+направам|ke\s+napravam|ќе\s+направам|ke\s+gi\s+ispratam|ќе\s+ги\s+испратам|ke\s+ispratam|ќе\s+испратам|ke\s+probam|ќе\s+пробам|ke\s+se\s+potrudam|ќе\s+се\s+потрудам|mozam\s+da|можам\s+да|moze\s+da|може\s+да|ke\s+vi\s+gi\s+ispratam|ќе\s+ви\s+ги\s+испратам|ke\s+vi\s+ispratam|ќе\s+ви\s+испратам|ke\s+gi\s+napravam\s+sam|ќе\s+ги\s+направам\s+сам|ke\s+napravam\s+sam|ќе\s+направам\s+сам|ke\s+si\s+gi\s+napravam|ќе\s+си\s+ги\s+направам|da\s+ke|да\s+ќе|da\s+mozam|да\s+можам|ke\s+si\s+ispratam|ќе\s+си\s+испратам/i.test(u)) {
        session.collectedData.photosPermission = true;
        session.collectedData.photosSource = "VIBER_PENDING";
        session.collectedData.photosStatus = "VIBER_PENDING";
        session.collectedData.photos = true;
        session.collectedData.photosPending = true;
        session.collectedData.photosPendingSince = Date.now();
        console.log(`[PHOTOS: MAKE-YES → VIBER_PENDING — owner will make & send photos (2d/5d reminder ladder armed)]`);
        transition(session, 'photos_send_later'); // → AWAITING_PHOTOS
        return { text: photosMessages.makeYesAck(), type: "QUESTION" };
      }
      // Unclear → rotate a fresh make-photos question (variants). Cap at 2
      // re-asks (same max-2-attempts principle as field questions) — a
      // persistently non-committal owner must not loop the make question
      // forever; on the 3rd unclear answer, fall through to NO_PHOTOS + the
      // photography offer (the same next step as an explicit CANNOT).
      session.collectedData.photosMakeAttempts = (session.collectedData.photosMakeAttempts || 0) + 1;
      if (session.collectedData.photosMakeAttempts >= 3) {
        session.collectedData.photosPermission = false;
        session.collectedData.photosSource = "NO_PHOTOS";
        session.collectedData.photosStatus = "PHOTOGRAPHY_ASKED";
        session.collectedData.photos = false;
        session.collectedData.photosPending = false;
        const worthIt = isPhotosWorthManagerReview(session);
        if (worthIt) session.collectedData.photosManagerReview = true;
        console.log(`[PHOTOS: NO_PHOTOS — make question unanswered 3×, photography offer sent]`);
        return { text: photosMessages.photographyOffer(), type: "QUESTION" };
      }
      return { text: photosMessages.makeQuestion(), type: "QUESTION" };
    }
    // --- PHOTOGRAPHY OFFER ANSWER (owner can't make photos himself) ---
    if (session.collectedData.photosStatus === 'PHOTOGRAPHY_ASKED') {
      // NO checked FIRST — "ne sakam" (I don't want) contains the substring
      // "sakam" (the YES regex below), so a negation would be swallowed as an
      // acceptance. Same shadowing class as the MAKE-ASKED CANNOT check.
      if (isNegative(u) || /ne\s+sakam|не\s+сакам|fala|фала|blagodaram|благодарам|nema\s+potreba|нема\s+потреба|ne\s+mi\s+treba|не\s+ми\s+треба|ne\s+e\s+potrebno|не\s+е\s+потребно|nema|нема|bez|без/i.test(u)) {
        // final NO_PHOTOS, continue the field flow
        session.collectedData.photosSource = "NO_PHOTOS";
        session.collectedData.photosStatus = "NO_PHOTOS";
        console.log(`[PHOTOS: NO_PHOTOS — owner declined photography offer]`);
        return null; // continue flow → remaining fields
      }
      // YES → PHOTOGRAPHY_NEEDED — our photographers handle it; always
      // manager-worthy (a professional shoot is being arranged).
      if (isPositive(u) || /sakam|сакам|moze|може|okej|океј|da|да|organizirajte|организирајте|zainteresiran|заинтересиран|interesno|интересно|neka|нека|izvolte|изволте|ke\s+iskoristam|ќе\s+искористам|dogovoreno|договорено|se\s+dogovara|се\s+договара|pomognete|помогнете/i.test(u)) {
        session.collectedData.photosSource = "PHOTOGRAPHY_NEEDED";
        session.collectedData.photosStatus = "PHOTOGRAPHY_NEEDED";
        session.collectedData.photosManagerReview = true;
        console.log(`[PHOTOS: PHOTOGRAPHY_NEEDED — owner accepted professional photography]`);
        return { text: photosMessages.photographyYesAck(), type: "QUESTION" };
      }
      // Unclear → rotate a fresh photography offer
      return { text: photosMessages.photographyOffer(), type: "QUESTION" };
    }

    if (session.collectedData.photosStatus && session.collectedData.photosStatus !== 'PENDING') {
      if (session.collectedData.photosStatus === 'NONE' || session.collectedData.photosStatus === 'NO_PHOTOS') {
        session.collectedData.photos = false;
      } else {
        session.collectedData.photos = true;
      }
      console.log(`[PHOTOS: already processed, photos=${session.collectedData.photos}]`);
    } else if (hasScraperPhotos) {
      if (isPositive(u) || (/da|да|se|се|aktuelni|актуелни|okej|океј|moze|може|se aktuelni|се актуелни|aktuelni se|актуелни се|da se|да се|se isti|се исти|isti se|исти се/i.test(u) && !/neaktuelni|неактуелни/i.test(u))) {
        session.collectedData.photosPermission = true;
        session.collectedData.photosSource = "SCRAPER";
        session.collectedData.photosStatus = "SCRAPER_APPROVED";
        session.collectedData.photos = true;
        console.log(`[PHOTOS: SCRAPER_APPROVED, photos=true]`);
      } else if (isNegative(u) || /ne|не|nema|нема|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се/i.test(u)) {
        session.collectedData.photosPermission = true;
        session.collectedData.photosSource = "SCRAPER_NOT_CURRENT";
        session.collectedData.photosStatus = "SCRAPER_NOT_CURRENT";
        session.collectedData.photos = true;
        console.log(`[PHOTOS: SCRAPER_NOT_CURRENT, photos=true]`);
      }
    } else {
      // PHOTO RECOVERY RULE — checked FIRST (before the positive branch).
      // The positive branch uses isPositive(), which matches bare substrings
      // like "ke", "pratam", "ke vi pratam". A message like
      //   "NEMAM AMA KE NAPRAVAM POPLADNE I KE VI PRATAM"
      // ("I don't have them but I'll take them this afternoon and send them")
      // contains those substrings, so the positive branch used to fire first
      // and store VIBER_PENDING + photosPending=false — even though the owner
      // clearly said they do NOT have photos right now. Recovery must win.
      // Photos are high-value — always attempt a recovery.
      const hasIdiomPositive = /nema\s+(?:problem|проблем)|bez\s+(?:problem|проблем)|ne\s+e\s+problem|не\s+е\s+проблем/i.test(u);
      if (/nemam\s+fotografi|немам\s+фотографии|nemam\s+sliki|немам\s+слики|momentalno\s+nemam|моментално\s+немам|ne\s+se\s+pri\s+raka|не\s+се\s+при\s+рака|ke\s+gi\s+baram|ќе\s+ги\s+барам|ke\s+gi\s+pobaram|ќе\s+ги\s+побарам|ke\s+gi\s+pratam\s+podocna|ќе\s+ги\s+пратам\s+подоцна|podocna\s+ke\s+pratam|подоцна\s+ќе\s+пратам|nema\s+momentalno|нема\s+моментално|nemam\s+sega|немам\s+сега|sega\s+nemam|сега\s+немам|ne\s+mozam\s+sega|не\s+можам\s+сега|ke\s+ispratam\s+podocna|ќе\s+испратам\s+подоцна|ke\s+pobaram\s+pa\s+ke\s+pratam|ќе\s+побарам\s+па\s+ќе\s+пратам|ne\s+mi\s+se\s+pri\s+raka|не\s+ми\s+се\s+при\s+рака|nemam\s+pri\s+raka|немам\s+при\s+рака|ne\s+se\s+naogjaat\s+sega|не\s+се\s+наоѓаат\s+сега/i.test(u) ||
             // Short neg-now/future words (ne/не, ke/ќе) use letter-boundary
             // matching so they don't fire as substrings of innocent words
             // like "denes"/"денес" (today) — "denes ke pratam" is a POSITIVE
             // commitment to send today, not a recovery case.
             (!hasIdiomPositive && /nemam|немам|nema|нема|bez|без|(?:^|[^a-zа-я])ne(?:$|[^a-zа-я])|(?:^|[^a-zа-я])не(?:$|[^a-zа-я])/i.test(u) && /moment|момент|sega|сега|podocna|подоцна|(?:^|[^a-zа-я])ke(?:$|[^a-zа-я])|(?:^|[^a-zа-я])ќе(?:$|[^a-zа-я])|pratam|пратам|napravam|направам|popladne|попладне|utre|утре|docna|доцна|baram|барам|pobaram|побарам|sliki|слики|fotografi|фотографии|raka|рака/i.test(u))) {
        // Recoverable negative: owner doesn't have photos NOW but might later
        session.collectedData.photosPermission = false;
        session.collectedData.photosSource = "RECOVERY_ASKED";
        session.collectedData.photosStatus = "RECOVERY_ASKED";
        session.collectedData.photos = false;
        session.collectedData.photosPending = true;
        // Anchor the 2-day/5-day reminder ladder — the owner committed to
        // sending photos later, so the engine must remind (not close after
        // REPLY_TIMEOUT) if they don't arrive.
        session.collectedData.photosPendingSince = Date.now();
        console.log(`[PHOTOS: RECOVERY_ASKED — owner has no photos now, recovery question sent]`);
        // AWAITING_PHOTOS PHASE: owner committed to sending photos later —
        // the conversation now pauses in an async wait state (Layer 2),
        // which persists across restarts. The orchestrator dispatches the
        // AWAITING_PHOTOS handler on the owner's next message.
        transition(session, 'photos_send_later');
        return {
          text: 'Дали би можеле подоцна да ни ги испратите на Viber кога ќе имате можност?',
          type: "QUESTION"
        };
      }

      // POSITIVE BRANCH: Owner confirms they have photos NOW
      // ("da", "imam", "imam sliki", "da imam", "sliki imam", etc.)
      // → Set VIBER_PENDING and continue.
      if (isPositive(u) || /imam|имам|imam sliki|имам слики|imam fotografi|имам фотографии|sliki imam|слики имам|da imam|да имам|ima fotografi|има фотографии|ima sliki|има слики|sliki da|слики да/i.test(u)) {
        session.collectedData.photosPermission = true;
        session.collectedData.photosSource = "VIBER_PENDING";
        session.collectedData.photosStatus = "VIBER_PENDING";
        session.collectedData.photos = true;
        session.collectedData.photosPending = false;
        console.log(`[PHOTOS: VIBER_PENDING — owner has photos, pending Viber delivery]`);
      } else if (isNegative(u) || /nemam|немам|nema|нема|bez|без|nema sliki|нема слики|bez sliki|без слики|ne|не|nema fotografi|нема фотографии|nemam sliki|немам слики|nemam momentalno|немам моментално|ti kazav|ти кажав|kazav|кажав|rekov|реков|nemam|немам|nema momentalno|нема моментално|ne mozam|не можам|ne moze|не може/i.test(u)) {
        // NEGATIVE → no photos. MARKETING FOLLOW-UP (reported requirement):
        // instead of just storing NONE and moving on, ask if the owner could
        // MAKE the photos himself and send them on Viber (question variants) —
        // we need photos for marketing. The MAKE_ASKED sub-state above
        // interprets the answer: YES → VIBER_PENDING + reminder ladder;
        // CANNOT → NO_PHOTOS + photography offer + manager-review flag.
        session.collectedData.photosPermission = false;
        session.collectedData.photosSource = "NONE";
        session.collectedData.photosStatus = "MAKE_ASKED";
        session.collectedData.photos = false;
        session.collectedData.photosPending = false;
        console.log(`[PHOTOS: NONE — owner has no photos; asking if he can make them (marketing)]`);
        return { text: photosMessages.makeQuestion(), type: "QUESTION" };
      }
    }
  }
  // === ownerName (gated — must be asked explicitly) ===
  // Before storing, strip conversational prefixes like "пиши" (write),
  // "запиши" (write down), "стави" (put), "внеси" (enter),
  // "пиши ме како" (write me as), "може да запишеш" (you can write).
  // Never store instruction words as part of the name.
  if (nextField === 'ownerName') {
    // EXPLICIT NAME MARKER — the owner LABELS their name inside a multi-part
    // message: "IME: GORAN", "ИМЕТО МИ Е ГОРАН", "SE VIKAM GORAN",
    // "ЗОВИ МЕ ГОРАН", "JAS SUM GORAN". The label wins over both the
    // tail-strip (which would mangle it) and the pure guard (which would
    // re-ask despite the name being present). Any photo-talk in the same
    // message is acknowledged as VIBER_PENDING. Letter-boundary anchored so
    // words containing "ime" ("vreme", surname "Dimev") never match.
    const nameLabelMatch = userInput.match(
      /(?:^|[^a-zа-я])(?:(?:името|imeto|име|ime)\s+(?:ми\s+|mi\s+)?е\s+|(?:името|imeto|име|ime)\s*:?\s*|se\s+vikam\s+|се\s+викам\s+|zovi\s+me\s+|зови\s+ме\s+|jas\s+sum\s+|јас\s+сум\s+|ja\s+sum\s+|ја\s+сум\s+)([A-Za-zА-Яа-я][A-Za-zА-Яа-я'’\-]*(?:\s+[A-Za-zА-Яа-я][A-Za-zА-Яа-я'’\-]*)?)/i
    );
    if (nameLabelMatch) {
      // Cut at a standalone "и"/"i" (and) — "ИМЕ Е ГОРАН И САКАМ..." keeps
      // only the name, not the conjunction + conversational tail.
      const labeled = nameLabelMatch[1].trim()
        // Cut at a standalone "и"/"i" (and) — "ГОРАН И САКАМ..." keeps only
        // the name, not the conjunction + conversational tail. Letter-boundary
        // so surnames like "Ilievska" (and-prefixed inside a word) survive.
        .split(/\s+(?:i|и)(?:$|[^a-zа-я])/i)[0]
        .replace(/^[,;:\s]+|[,;:.\s]+$/g, '');
      // NON-NAME STOPLIST — "JAS SUM ZAINTERESIRAN" (I am interested) at the
      // name prompt must never store "Zainteresiran" as the owner name. The
      // "jas sum" marker is ambiguous (often followed by a statement, not a
      // name); a stoplisted capture is a non-answer → re-ask, never store.
      if (labeled.length > 0 && !NON_NAME_STOPLIST.test(labeled)) {
        if (mentionsPhotoTalk(userInput)) ensurePhotoDeliveryPending(session);
        const labeledName = labeled.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        session.collectedData.ownerName = labeledName;
        console.log(`[OWNER NAME: ${labeledName}] (labeled in "${userInput.trim()}")`);
        return null; // name answered — continue to the next field
      }
      if (labeled.length > 0 && NON_NAME_STOPLIST.test(labeled)) {
        console.log(`[OWNER NAME: label "${labeled}" is a non-name — re-asking, NOT stored]`);
        return {
          text: 'Само да потврдам, како да ве запишам?',
          type: "QUESTION",
          nextField: 'ownerName'
        };
      }
    }
    // PURE PHOTO-TALK GUARD — the owner is arranging photo delivery, not
    // answering the name question: "NA OVOJ BROJ TREBA" ("[I'll send them]
    // to this number"), "IMAM KE VI ISPRATAM", "KE VI PRATAM NA VIBER", or
    // a bare phone number must NEVER be stored as the owner name (reported
    // bug). Acknowledge the delivery (photos=VIBER_PENDING) and re-ask the
    // name — the owner never answered it, so attempts stay uncounted.
    if (isPurePhotoTalk(userInput)) {
      ensurePhotoDeliveryPending(session);
      console.log(`[OWNER NAME: pure photo-talk — NOT stored, photos=VIBER_PENDING, re-asking]`);
      return {
        text: 'Разбирам, ги очекувам фотографиите на Viber. Само да потврдам, како да ве запишам?',
        type: "QUESTION",
        nextField: 'ownerName'
      };
    }
    // ADDRESS-LIKE ANSWER AT THE NAME PROMPT (reported): the owner answers
    // "Како да ве запишам?" with the property ADDRESS ("JOVAN BIGORSKI 65",
    // "УЛ. ПАРТИЗАНСКА 12") — a standalone house-number token marks the
    // answer as an address, NEVER a name. Previously the generic store below
    // accepted it, so the address was stored as ownerName ("Jovan Bigorski
    // 65") and the name question was effectively SKIPPED: getNextMissingField
    // saw ownerName filled and jumped straight to the address question — the
    // owner never got a chance to give their real name (reported "NAME NOT
    // COLLECTED — never asked, never stored"). Route the answer to the
    // ADDRESS field instead (if not yet collected) and re-ask the name.
    // Word-bounded 1-4 digit token = house number (one optional trailing
    // LETTER allowed — the common "65А" letter-suffixed house number must
    // route too; the before-boundary still rejects digit-glued words like
    // "GORAN4"/"GORAN123"). Messages with 7+ digits are a phone
    // ("GORAN 070 123 456" → the tail-strip below extracts the name and
    // drops the phone) — never routed as an address.
    const digitCount = (userInput.replace(/\D/g, '') || '').length;
    const hasHouseNumberToken = digitCount < 7 && /(?:^|[^a-zа-я\d])\d{1,4}[a-zа-я]?(?:$|[^a-zа-я\d])/.test(userInput);
    if (hasHouseNumberToken) {
      const addrCleaned = cleanAddressText(userInput);
      if (addrCleaned.length > 0) {
        if (session.collectedData.address === undefined || session.collectedData.address === null) {
          // Photo-talk in the same message ("УЛ. ПАРТИЗАНСКА 12, IMAM SLIKI
          // KE VI PRATAM") must ack the delivery promise — mirrors the
          // generic name store and the address branch below.
          if (mentionsPhotoTalk(userInput)) ensurePhotoDeliveryPending(session);
          session.collectedData.address = addrCleaned;
          delete session.collectedData.addressSkipped;
          console.log(`[OWNER NAME: address-like answer — stored as ADDRESS "${addrCleaned}", name re-asked]`);
        }
        // The owner DID answer (with the wrong field) — count the attempt so
        // the max-2-attempts skip can advance the flow if they keep giving
        // addresses (a permanent re-ask pin would loop forever, unlike the
        // photo-talk re-ask where the owner gave NO answer at all).
        session.questionAttempts = session.questionAttempts || {};
        session.questionAttempts.ownerName = (session.questionAttempts.ownerName || 0) + 1;
        return {
          text: 'Разбирам, тоа е адресата. Само да потврдам, како да ве запишам?',
          type: "QUESTION",
          nextField: 'ownerName'
        };
      }
    }
    if (userInput.trim().length > 0) {
      let cleaned = userInput.trim();
      // Strip known Macedonian conversational prefixes (Latin and Cyrillic)
      // via the shared lexicon (OWNER_NAME_PREFIX_RE — longest patterns
      // FIRST, see the const above). Applied TWICE with a separator strip in
      // between so CHAINED prefixes reduce fully: "JAS SUM, PISI GORAN" →
      // "jas sum" → ", pisi goran" → "pisi goran" → "goran".
      cleaned = cleaned.replace(OWNER_NAME_PREFIX_RE, '').replace(/^[,;:\s]+/, '').replace(OWNER_NAME_PREFIX_RE, '').trim();
      // Truncate at conversational tails — owners often append chatty text
      // after giving their name (e.g. "GORAN I BI SAKALDA SE ZAPOZNAEME" =
      // "Goran and I would like to get to know you"). Only the name part
      // should be stored, not the whole sentence. Cut at sentence-ending
      // punctuation first, then at common conversational tail markers
      // (Latin + Cyrillic): "i bi sakal", "mislam", "sakam", "znam",
      // "ke te", "da se zapoznaeme", "sto e", "kako si", "izvini",
      // "povikaj me", "dodadi me", "moze da", "treba da"...
      cleaned = cleaned
        // Period-aware sentence split: a period cuts the chatty tail
        // ("ZORAN ATANASOV. KE SE JAVAM UTRE" → "Zoran Atanasov"), but a
        // period right after a SINGLE-LETTER initial must NOT cut ("G. PETROV"
        // stays whole — lookbehind requires 2+ letters before the period).
        .split(/(?<=[A-Za-zА-Яа-я]{2})\.\s+|[!?…]+/)[0]
        // Letter-boundary guard (?![a-zа-я]) after the marker: prevents
        // truncating surnames that CONTAIN a marker word (e.g. "Mislamov"
        // must not be cut to "Mislam"). The (?:da)? on the bi-sakal
        // variants keeps the merged form "BI SAKALDA" truncating correctly.
        .replace(/\s+(?:i\s+)?(?:bi\s+sakal(?:da)?|би\s+сакал(?:да)?|bi\s+sakala(?:da)?|би\s+сакала(?:да)?|mislam|мислам|sakam|сакам|znam|знам|ke\s+te|ќе\s+те|da\s+se\s+zapoznaeme|да\s+се\s+запознаеме|sto\s+e|што\s+е|kako\s+si|како\s+си|izvini|извини|povikaj\s+me|повикај\s+ме|dodadi\s+me|додади\s+ме|mozе\s+da|може\s+да|treba\s+da|треба\s+да|ke\s+vi\s+ispratam|ќе\s+ви\s+испратам|ke\s+vi\s+pratam|ќе\s+ви\s+пратам|ke\s+gi\s+ispratam|ќе\s+ги\s+испратам|ke\s+gi\s+pratam|ќе\s+ги\s+пратам|ke\s+ispratam|ќе\s+испратам|ke\s+pratam|ќе\s+пратам|ispratam|испратам|pratam|пратам|imam|имам|sliki|слики|slikite|сликите|fotografii|фотографии|fotografite|фотографиите|na\s+ovoj\s+broj|на\s+овој\s+број|na\s+viber|на\s+вајбер|viber|вајбер|viberot|вајберот|zemi|земи|telefon|телефон)(?![a-zа-я]).*$/i, '')
        // Strip a trailing phone number ("GORAN 070123456" → "GORAN")
        .replace(/\s+\+?[0-9][0-9\s\-–/]{6,}$/, '')
        // Strip trailing separators left after truncation (e.g. "GORAN,")
        .replace(/[,;:.]+\s*$/, '')
        .trim();
      if (cleaned.length > 0) {
        // A name + photo-talk combo ("GORAN, IMAM SLIKI KE VI PRATAM...")
        // acknowledges the delivery promise too.
        if (mentionsPhotoTalk(userInput)) ensurePhotoDeliveryPending(session);
        // Title-case each word: first letter uppercase, rest lowercase
        cleaned = cleaned.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        session.collectedData.ownerName = cleaned;
        console.log(`[OWNER NAME: ${session.collectedData.ownerName}] (cleaned from "${userInput.trim()}")`);
      }
    }
  }

  // === address (gated — must be asked explicitly) ===
  // PURE PHOTO-TALK GUARD — same as ownerName: "NA OVOJ BROJ TREBA" / a
  // bare phone number is a photo-delivery arrangement, never an address.
  if (nextField === 'address') {
    if (isPurePhotoTalk(userInput)) {
      ensurePhotoDeliveryPending(session);
      console.log(`[ADDRESS: pure photo-talk — NOT stored, photos=VIBER_PENDING, re-asking]`);
      return {
        text: 'Разбирам, ги очекувам фотографиите на Viber. Само да потврдам, која е точната адреса?',
        type: "QUESTION",
        nextField: 'address'
      };
    }
    if (userInput.trim().length > 0) {
      const cleaned = cleanAddressText(userInput);
      if (cleaned.length > 0) {
        if (mentionsPhotoTalk(userInput)) ensurePhotoDeliveryPending(session);
        session.collectedData.address = cleaned;
        console.log(`[ADDRESS: ${cleaned}] (cleaned from "${userInput.trim()}")`);
      }
    }
  }

  return null;
}

/**
 * CLOSE FLOW — build the CLOSE response for a fully-collected OR
 * fully-skipped session. Creates the property folder, saves to CSV, and
 * returns the closing message (varies by photos status).
 *
 * Shared by BOTH close paths in runDataCollectionFlow:
 *   1. Natural close: all fields collected (!nextField at entry).
 *   2. All-fields-skipped close: the max-2-attempts loop emptied every
 *      remaining field (nextField became null). Previously this fell
 *      through to the persuasion phase — wrong, because the owner
 *      already accepted cooperation. Now it closes cleanly.
 *
 * @param {Object} session — LeadSession with collectedData + adMemory
 * @returns {Object} — { text, type: "CLOSE" }
 */
function buildCloseResponse(session) {
  const propertyId = getNextPropertyId();
  const phone = session.phone || '';
  const isRent = session.collectedData.transactionType === 'rent';

  const propertyData = {
    propertyId: propertyId,
    status: "ACTIVE",
    leadPhone: phone,
    qualifiedBy: "Ana",
    qualificationDate: new Date().toISOString(),
    sourcePortal: session.adMemory?.sourcePortal || 'unknown',
    sourceAdUrl: session.adMemory?.adUrl || '',
    sourcePhotoUrls: session.adMemory?.photoUrls || [],
    ...session.collectedData
  };

  if (isRent) {
    const rentDefaults = getRentDefaults();
    if (!propertyData.depositMonths) propertyData.depositMonths = rentDefaults.depositMonths;
    if (!propertyData.minimumStayMonths) propertyData.minimumStayMonths = rentDefaults.minimumStayMonths;
    if (!propertyData.advanceRentMonths) propertyData.advanceRentMonths = rentDefaults.advanceRentMonths;
    if (propertyData.monthlyRent) {
      propertyData.commission = calculateRentCommission(propertyData.monthlyRent);
    }
  }

  // ========================================
  // INTELLIGENCE LAYER (reported requirement — Ana = intelligence layer):
  // 1. SELLING PRICE CALCULATOR — owner price + 2% agency, rounded UP to
  //    500€ increments. Three scenarios: total price given, €/m² given
  //    (ownerPrice = sqm × pricePerSqm), both given → price_warning flag
  //    on mismatch. Garage sold separately is added to the owner price.
  // 2. BROKER COMMENT — internal note (agency-staff only) with the pricing
  //    breakdown + tenant preferences ("Сопственик бара: ...").
  // 3. PUBLIC DESCRIPTION — scraped ad text + collected facts merged.
  // 4. NORMALIZED PROPERTY JSON — the single structured object handed to
  //    Hermes (POST /properties: validate/store, NO calculations there).
  //    env-gated: only submitted when HERMES_URL is configured.
  // ========================================
  if (!isRent && (propertyData.cleanPrice || propertyData.pricePerSqm)) {
    const pricing = calculateSellingPrice({
      sqm: propertyData.totalSqm,
      pricePerSqm: propertyData.pricePerSqm,
      totalPrice: propertyData.cleanPrice,
      garagePrice: propertyData.parkingSeparate ? propertyData.parkingPrice : undefined,
      agencyPercent: config.SALE_COMMISSION_PERCENT
    });
    if (pricing) {
      propertyData.ownerPrice = pricing.ownerPrice;
      propertyData.agencyPercent = pricing.agencyPercent;
      propertyData.commission = pricing.commission;
      propertyData.sellingPrice = pricing.sellingPrice;
      propertyData.priceWarning = pricing.priceWarning;
      console.log(`[PRICING: owner=${pricing.ownerPrice}, commission=${pricing.commission}, selling=${pricing.sellingPrice} (scenario=${pricing.scenario}, warning=${pricing.priceWarning})]`);
    }
  }
  propertyData.brokerComment = buildBrokerComment(propertyData);
  propertyData.descriptionPublic = buildEnhancedDescription(propertyData, session.adMemory?.title || '');
  propertyData.hermesPayload = buildPropertyJson(propertyData, session.adMemory, phone, propertyId);
  // Fire-and-forget Hermes submission (no-op when HERMES_URL unset).
  submitPropertyToHermes(propertyData.hermesPayload);

  // Mirror the derived intelligence fields back onto the in-memory session
  // so the lead state matches what was saved to the folder/CSV (the flow
  // tests and any later follow-up read session.collectedData).
  for (const k of ['ownerPrice', 'agencyPercent', 'sellingPrice', 'priceWarning',
                   'brokerComment', 'descriptionPublic', 'hermesPayload']) {
    if (propertyData[k] !== undefined) session.collectedData[k] = propertyData[k];
  }

  createPropertyFolder(propertyId, propertyData);
  // Pass the ENRICHED propertyData (intelligence fields: ownerPrice,
  // sellingPrice, brokerComment, tenantPreferences...) so the CSV row gets
  // the derived columns — session.collectedData alone would lack them.
  saveToCSV(propertyData, phone, propertyId);

  let closeMessage = "";
  if (session.collectedData.photosStatus === 'VIBER_PENDING') {
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам.\n\nГи очекувам фотографиите на Viber за да можеме поефикасно да го промовираме имотот.\n\nПријатен ден.`;
  } else if (session.collectedData.photosStatus === 'NONE' || session.collectedData.photosStatus === 'SCRAPER_APPROVED' ||
             session.collectedData.photosStatus === 'NO_PHOTOS') {
    // NO_PHOTOS (reported requirement): the owner can't/won't provide photos —
    // same close as NONE. If the property was worth it, photosManagerReview
    // flags it for the ops team (the photography offer was already sent).
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам за довербата.\n\nЌе ве контактирам кога ќе имаме заинтересиран клиент за разгледување на имотот.\n\nПријатен ден.`;
  } else if (session.collectedData.photosStatus === 'VIBER_RECEIVED') {
    closeMessage = `Ви благодарам за фотографиите.\n\nГи имам сите потребни информации.\n\nЌе ве контактирам кога ќе имаме заинтересиран клиент.`;
  } else if (session.collectedData.photosStatus === 'PHOTOGRAPHY_NEEDED') {
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам.\n\nЌе ве контактирам за да организираме фотографирање на имотот.\n\nПријатен ден.`;
  } else {
    closeMessage = `Ви благодарам за довербата и за одвоеното време.\n\nГи внесов сите информации за имотот.\n\nЌе ве контактирам штом имаме соодветен заинтересиран клиент за посета.\n\nВи посакувам убав ден.`;
  }

  // PRICE-WARNING → polite confirmation request to the OWNER (reported):
  // the owner gave BOTH €/m² and a total price that disagree. The broker
  // comment + Hermes payload carry the internal ⚠ flag for agents; the
  // owner gets a soft ask (with the actual numbers — same helper as the
  // internal note, ownerFacing variant, so the math can't drift) so the
  // correct price lands in the system and the transcript surfaces the
  // discrepancy for the agency to verify.
  if (propertyData.priceWarning) {
    const priceAsk = buildPriceWarningNote(propertyData, { ownerFacing: true });
    closeMessage += `\n\n${priceAsk}`;
    console.log(`[PRICE WARNING in close message — agent must verify: ${buildPriceWarningNote(propertyData)}]`);
  }

  return { text: closeMessage, type: "CLOSE" };
}

/**
 * DATA COLLECTION PHASE — WITH MICRO-SOCIAL GLUE
 * History scan, close flow (property folder + CSV), and field question
 * flow with re-ask phrasings and max-2-attempts skip.
 *
 * @returns {Object} — always returns a response (CLOSE or QUESTION)
 */
export function runDataCollectionFlow({ u, userInput, session, adMemory, hasScraperPhotos }) {
  const known = { ...adMemory, ...session.collectedData };
  let nextField = getNextMissingField(known);

  // ========================================
  // PRE-QUESTION HISTORY SCAN
  // Before asking, search ALL previous user messages for the current
  // nextField. If found with HIGH confidence, store it and re-check
  // what's missing. This prevents asking the same question twice when
  // the user already volunteered the information in an earlier message
  // (e.g., "na osmi od deset" → floor=8 AND totalFloors=10 during
  // persuasion, or volunteered details like "65 m2 so terasa od 3 m2").
  // ========================================
  if (nextField) {
    const historyResult = scanHistoryForField(nextField, session.messages, session.collectedData);
    if (historyResult && Object.keys(historyResult).length > 0) {
      let stored = false;
      for (const [key, value] of Object.entries(historyResult)) {
        const existing = session.collectedData[key];
        if (existing === undefined || existing === null) {
          session.collectedData[key] = value;
          session.collectedData[key + 'Confidence'] = 0.95;
          stored = true;
          console.log(`[HISTORY SCAN STORED: ${key} = ${JSON.stringify(value)}]`);
        }
      }
      if (stored) {
        // Re-check what's missing — nextField may have changed
        const updatedKnown = { ...adMemory, ...session.collectedData };
        nextField = getNextMissingField(updatedKnown);
        console.log(`[HISTORY SCAN: nextField updated -> ${nextField || 'COMPLETE'}]`);
      }
    }
  }

  // ========================================
  // POTKROVJE DEFERRAL RESOLUTION (reported)
  // The owner answered the floor question with "NA POTKROVJE" (attic) while
  // totalFloors was still unknown — extractFloor never guesses, so the flag
  // below was set by runComplexStatefulHandlers. Here:
  //   - totalFloors is now known (the owner just answered it) → derive
  //     floor = totalFloors + 1, clear the flag;
  //   - totalFloors still missing → redirect the question to totalFloors so
  //     the derivation can happen, instead of re-asking the floor question
  //     the owner already answered ("ti kazav potkrovje").
  // ========================================
  if (session.collectedData.floorPendingPotkrovje) {
    if (typeof session.collectedData.totalFloors === 'number') {
      // Only derive when floor is STILL missing — if the owner later answered
      // the floor directly with a real value ("na vtor kat" while the
      // redirected totalFloors question was pending), never clobber it.
      if (session.collectedData.floor === undefined || session.collectedData.floor === null) {
        session.collectedData.floor = session.collectedData.totalFloors + 1;
        session.collectedData.floorConfidence = 0.95;
        console.log(`[POTKROVJE: floor = ${session.collectedData.totalFloors} + 1 = ${session.collectedData.floor}]`);
      } else {
        console.log(`[POTKROVJE: floor already answered directly (${session.collectedData.floor}) — keeping it, dropping deferral]`);
      }
      delete session.collectedData.floorPendingPotkrovje;
      const postPotkrovjeKnown = { ...adMemory, ...session.collectedData };
      nextField = getNextMissingField(postPotkrovjeKnown);
    } else if (nextField === 'floor') {
      nextField = 'totalFloors';
      console.log('[POTKROVJE: totalFloors unknown — asking totalFloors question first]');
    }
  }

  if (!nextField) {
    // NATURAL CLOSE: all fields collected — property folder + CSV + message.
    return buildCloseResponse(session);
  }

          // Count how many fields we already have
    const fieldCount = Object.keys(session.collectedData).filter(k =>
      k !== 'cooperationAccepted' &&
      session.collectedData[k] !== null &&
      session.collectedData[k] !== undefined
    ).length;

    const fillers = ["Одлично.", "Супер.", "Добро.", "Разбирам.", "Во ред.", "Благодарам."];
    const filler = fillers[Math.floor(Math.random() * fillers.length)];

    let prefix = "";
    if (fieldCount <= 1) {
      prefix = "Одлично. Ќе ми бидат потребни неколку информации за внес на вашата недвижност во системот. ";
    } else if (fieldCount <= 3) {
      prefix = filler + " ";
    } else if (fieldCount <= 6) {
      prefix = filler + " ";
    } else if (fieldCount <= 10) {
      prefix = filler + " Уште неколку прашања. ";
    } else {
      prefix = "Одлично, уште последниве информации и завршуваме. ";
    }

    const propertyLabel = known.propertyType === 'apartment' ? 'станот' :
                          known.propertyType === 'house' ? 'куќата' :
                          known.propertyType === 'land' ? 'плацот' :
                          known.propertyType === 'commercial' ? 'локалот' : 'имотот';

    // ========================================
    // AVAILABILITY ACKNOWLEDGMENT (reported bug)
    // The owner already accepted cooperation ("da") and THEN confirms the
    // property is still available ("uste ne sum go izdal" = "I haven't
    // rented it out yet"). The early-responses availability handler is
    // gated on !cooperationAccepted, so this second message used to be
    // silently swallowed — Ana re-asked the field question with ZERO
    // acknowledgment, as if the owner's second message never happened.
    // When the CURRENT message — or an earlier message in the same grace
    // batch — confirms availability, register it by prepending a natural
    // acknowledgment to the next field question. Fires at most once per
    // conversation (session.availabilityAcknowledged is also set by the
    // persuasion-phase availability handler, so a still-available reply
    // that was already acknowledged there is never acknowledged twice).
    // KNOWN LIMITATION: this block only runs on the QUESTION path — if an
    // earlier handler returns first on the same turn (pending-confirmation
    // re-ask, terrace/heating follow-up, photos recovery), the flag stays
    // unset and the acknowledgment lands on the next asked question.
    // ========================================
    if (!session.availabilityAcknowledged &&
        session.collectedData.cooperationAccepted === true &&
        (confirmsAvailability(u) || hasRecentAvailabilityConfirmation(session))) {
      session.availabilityAcknowledged = true;
      console.log('[AVAILABILITY: acknowledged — owner confirms the property is still available]');
      const ack = 'Одлично, значи сè уште е достапен! ';
      // Replace the generic filler lead ("Одлично.", "Супер."...), never a
      // double lead ("Одлично. ... Одлично, значи..."). Capitalize the
      // remainder so the rare "Одлично, уште последниве..." branch reads
      // naturally after the "!".
      const leadStripped = prefix.replace(/^(?:Одлично\.|Одлично,|Супер\.|Добро\.|Разбирам\.|Во ред\.|Благодарам\.)\s*/, '');
      const capitalized = leadStripped.charAt(0) ? leadStripped.charAt(0).toUpperCase() + leadStripped.slice(1) : leadStripped;
      prefix = ack + capitalized;
    }

    // ========================================
    // MAX 2 ATTEMPTS PRECHECK (BEFORE asking)
    // Check if the current nextField has already been asked 2+ times.
    // If so, run a fallback extraction pass on the owner's current message
    // to try to catch any keyword the normal pass might have missed.
    // If fallback also finds nothing, skip the field entirely (store null)
    // and move to the next missing field. The existing !nextField close
    // block below handles the "all fields exhausted" case naturally.
    // This prevents infinite loops on fields like "furnished" or "renovated".
    // ========================================
    // ROTATING-VARIANT ATTEMPTS EXEMPTION (reported requirements: "couple of
    // variations of the type of clients preferred" + the same rotation for
    // the availableFrom date question): rotating fields are asked once per
    // variant, so they may re-ask up to the variant count — the generic
    // 2-attempt cap would skip the field right after variant 1 and variants
    // 2-3 would never be spoken. Every other field keeps the strict 2-attempt
    // cap. Math.max(1, …) inside rotatingMaxAttempts guarantees the while-loop
    // terminates even with an empty variant list.
    while (nextField && (session.questionAttempts[nextField] || 0) >= rotatingMaxAttempts(nextField)) {
      // Fallback: run global extraction with NO preferredField to catch
      // any keyword in the owner's message that might have been missed.
      const fallbackUpdates = runGlobalExtraction(u, session.collectedData);
      // NEVER overwrite a field that already has a value from earlier extraction.
      // Bonus extraction should only fill missing fields, not clobber confirmed ones.
      if (fallbackUpdates[nextField] !== undefined &&
          (session.collectedData[nextField] === undefined || session.collectedData[nextField] === null)) {
        session.collectedData[nextField] = fallbackUpdates[nextField];
        session.collectedData[nextField + 'Confidence'] = 0.30;
        // PERMANENT SKIP MARKER: even though the fallback found a value, we
        // have already asked 2+ times. Mark the field Skipped so
        // getNextMissingField never returns it again (a 0.30 confidence
        // would otherwise be treated as missing → infinite loop).
        session.collectedData[nextField + 'Skipped'] = true;
        console.log(`[SKIP FALLBACK: ${nextField} = ${JSON.stringify(fallbackUpdates[nextField])} (caught via keyword scan)]`);
        // Field is now filled — re-check what's missing
        const postKnown = { ...adMemory, ...session.collectedData };
        nextField = getNextMissingField(postKnown);
        continue;
      }
      // No fallback found — skip field (only if not already set by earlier extraction)
      if (session.collectedData[nextField] === undefined || session.collectedData[nextField] === null) {
        session.collectedData[nextField] = null;
        session.collectedData[nextField + 'Confidence'] = 0.10;
      }
      // PERMANENT SKIP MARKER: store null + 0.10 confidence AND flag the field
      // as Skipped so getNextMissingField stops treating it as missing.
      // (null value + confidence < 0.7 both read as "missing" in workflow.js
      // — without the marker the while-loop below spins forever.)
      session.collectedData[nextField + 'Skipped'] = true;
      const skipCap = rotatingMaxAttempts(nextField);
      console.log(`[SKIP: ${nextField} — max attempts reached (${skipCap === 2 ? '2' : `${skipCap} rotating variants`}), owner not providing answer, storing null]`);
      const updatedKnown = { ...adMemory, ...session.collectedData };
      nextField = getNextMissingField(updatedKnown);
    }
    // If all fields were skipped (nextField became null), the close block
    // at the bottom of this function handles it — see the final return.

    // ========================================
    // QUESTION ATTEMPT TRACKING
    // Track how many times each field has been asked. When 2+ attempts
    // fail to extract a value, switch to confirmatory phrasing instead
    // of repeating the identical question.
    // ========================================
    if (nextField) {
      session.questionAttempts[nextField] = (session.questionAttempts[nextField] || 0) + 1;
      const attempts = session.questionAttempts[nextField];

      // Compute the question text from the CURRENT nextField. The
      // max-2-attempts skip loop above can advance nextField (e.g.
      // cleanPrice → totalSqm), so the question must be derived AFTER
      // that loop — otherwise the owner is asked the skipped field's
      // question (stale question-text bug).
      const question = getQuestion(nextField, known.propertyType || 'apartment', hasScraperPhotos, session.collectedData.photosStatus);

      // ROTATING-VARIANT QUESTION (reported requirements: "couple of
      // variations of the type of clients preferred" + the same rotation for
      // the availableFrom date question). The first ask uses variant 0;
      // re-asks rotate through the list so the owner is never asked the
      // identical sentence twice. Rotating fields are EXEMPT from both
      // generic re-ask gates: the max-attempts precheck above caps them at
      // the variant count (one ask per variant, NOT 2), and the confirmatory
      // override below deliberately skips them — each attempt already
      // carries a fresh variant sentence, so the fixed "Само да потврдам…"
      // phrasing would shadow variants 1-3 and the rotation would never be
      // heard. ROTATING_QUESTION_VARIANTS is the single source of truth.
      const rotatedVariant = pickRotatingVariant(nextField, attempts, propertyLabel);

      // If the question is generic, replace with property-specific
      let finalQuestion = question;
      // POTKROVJE DEFERRAL (reported): while floor is deferred pending
      // totalFloors, the redirected totalFloors question carries an explicit
      // explanation — the owner already told us the floor (potkrovje), so a
      // generic re-ask would read as if Ana ignored their answer.
      if (nextField === 'totalFloors' && session.collectedData.floorPendingPotkrovje) {
        finalQuestion = 'Бидејќи станот е на поткровје, колку спрата има зградата вкупно?';
      }
      if (rotatedVariant) {
        finalQuestion = rotatedVariant;
      } else if (question && question.includes('станот')) {
        finalQuestion = question.replace(/станот/g, propertyLabel);
      }

      // Override question text on re-asks — EXCEPT rotating-variant fields
      // (tenantPreferences, availableFrom), whose variant rotation above
      // already supplies a fresh sentence for every attempt — the
      // confirmatory phrasing would shadow variants 1-3 and the rotation
      // would never be heard (reported requirements). Guard on the variant
      // LIST being non-empty (not just the map key) so a hypothetical empty
      // list degrades to the confirmatory phrasing instead of silently
      // repeating the plain question.
      if (attempts >= 2 && !pickRotatingVariant(nextField, attempts, propertyLabel) &&
          // POTKROVJE DEFERRAL: the redirected totalFloors question already
          // carries its own explanatory phrasing — don't shadow it with the
          // generic confirmatory sentence on a re-ask.
          !(nextField === 'totalFloors' && session.collectedData.floorPendingPotkrovje)) {
        const confQuestion = CONFIRMATORY_QUESTIONS[nextField];
        if (confQuestion) {
          finalQuestion = confQuestion(propertyLabel);
          console.log(`[QUESTION ATTEMPT ${attempts}: ${nextField} — using confirmatory phrasing]`);
        }
      }

      console.log(`[QUESTION ATTEMPT ${attempts}: ${nextField}]`);
      console.log(`[QUESTION: ${finalQuestion}]`);

      const response = prefix + finalQuestion;

      return {
        text: response,
        type: "QUESTION",
        nextField
      };
    }

    // ALL FIELDS SKIPPED: the max-2-attempts loop above emptied every
    // remaining field (nextField became null). Close the session cleanly
    // with the same close flow as a fully-collected session — the owner
    // already accepted cooperation, so falling through to the persuasion
    // phase (an LLM pitch) would be wrong and confusing.
    console.log(`[DATA COLLECTION: all remaining fields skipped — closing cleanly]`);
    return buildCloseResponse(session);
}
