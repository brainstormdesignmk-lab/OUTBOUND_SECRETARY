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
import { getNextMissingField, getQuestion } from '../workflow.js';
import { runGlobalExtraction, assessConfidence, confidenceToNumeric, scanHistoryForField } from '../data-collector.js';
import {
  extractTerraceNumber,
  isPositive,
  isNegative
} from '../property-extractor.js';
import { getRentDefaults, calculateRentCommission } from '../lib/commission.js';
import { getNextPropertyId, createPropertyFolder, saveToCSV } from './storage.js';
import { transition } from './state-machine.js';

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
export function runPendingConfirmation({ u, session }) {
  if (!session.pendingConfirmation) return null;

  const pField = session.pendingConfirmation.field;
  const pValue = session.pendingConfirmation.value;
  // User confirms
  if (/^da$|^да$|tocno|точно|ok|океј|moze|може|se|се|potvrd|потврд|tocno e|точно е|taka e|така е|da taka e|да така е|potvrduvam|потврдувам|potvrdi|потврди|da e|да е|tocno e taka|точно е така|upravo|управо|tok|ток|taka|така/i.test(u)) {
    session.collectedData[pField] = pValue;
    session.collectedData[pField + 'Confidence'] = 0.95;
    session.pendingConfirmation = null;
    console.log(`[CONFIRMED: ${pField} = ${JSON.stringify(pValue)}]`);
    // Fall through to normal flow — field is now filled
  }
  // User rejects — ask same question again
  else if (/^ne$|^не$|ne e tocno|не е точно|greska|грешка|pogresno|погрешно|ne e taka|не е така|ne tok|не ток/i.test(u)) {
    session.pendingConfirmation = null;
    console.log(`[REJECTED: ${pField} = ${JSON.stringify(pValue)} — ask again]`);
    const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'станот' : 'имотот';
    const confirmQuestion = getQuestion(pField, session.adMemory?.propertyType || 'apartment');
    return { text: `Разбирам, да прашам повторно. ${confirmQuestion}`, type: "QUESTION", nextField: pField };
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
    } else if (confidence === 'MEDIUM' && key === nextField) {
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
    // Don't overwrite values already set by confirmed high-confidence extraction
    if (session.collectedData[key] === undefined || session.collectedData[key] === null) {
      session.collectedData[key] = value;
      session.collectedData[key + 'Confidence'] = toScores[key] || 0.95;
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

/**
 * COMPLEX STATEFUL HANDLERS (Data Collection only).
 * These have early returns (follow-up questions) or complex state machine
 * logic that can't be pure extraction.
 *
 * @returns {Object|null} — { text, type } response, or null to continue
 */
export function runComplexStatefulHandlers({ u, userInput, session, nextField, hasScraperPhotos }) {
  // === terraceSqm (Handles ALL cases) ===
  if (session.collectedData.terraceSqm === undefined && session.collectedData.hasTerrace === undefined) {

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
        const hasPriceContext = /iljadi|илјади|evra|евра|eur|evro|евро/i.test(u);
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
  const parnoMentioned = /parno|парно/i.test(u) && !/nema parno|нема парно|nemame parno|немаме парно|nemaat parno|немаат парно|bez parno|без парно|ne e parno|не е парно/i.test(u);
  if (nextField === 'heating' || session.collectedData.heatingFollowUp ||
      (parnoMentioned && !session.collectedData.heating)) {
    if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg/i.test(u)) {
      session.collectedData.heating = "district";
      session.collectedData.heatingType = "district";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: district]`);
    } else if (/centralno|централно|central|sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) {
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
    } else if (/klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u) && !parnoMentioned) {
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
    if (session.collectedData.heatingFollowUp) {
      session.collectedData.heating = "parno_unknown";
      session.collectedData.heatingType = "unknown";
      session.collectedData.heatingFollowUp = false;
      session.pendingFollowUp = null;
      console.log(`[HEATING: parno_unknown (defaulted)]`);
    }
  }

  // Safety net: clear pendingFollowUp before photo/ownerName/address handlers
  // in case pendingFollowUp was left set from a previous unanswered follow-up
  session.pendingFollowUp = null;

  // === photos (complex stateful handler with scraper logic) ===
  if (nextField === 'photos') {
    if (session.collectedData.photosStatus && session.collectedData.photosStatus !== 'PENDING') {
      if (session.collectedData.photosStatus === 'NONE') {
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
        session.collectedData.photosPermission = false;
        session.collectedData.photosSource = "NONE";
        session.collectedData.photosStatus = "NONE";
        session.collectedData.photos = false;
        session.collectedData.photosPending = false;
        console.log(`[PHOTOS: NONE, photos=false]`);
      }
    }
  }
  // === ownerName (gated — must be asked explicitly) ===
  // Before storing, strip conversational prefixes like "пиши" (write),
  // "запиши" (write down), "стави" (put), "внеси" (enter),
  // "пиши ме како" (write me as), "може да запишеш" (you can write).
  // Never store instruction words as part of the name.
  if (nextField === 'ownerName') {
    if (userInput.trim().length > 0) {
      let cleaned = userInput.trim();
      // Strip known Macedonian conversational prefixes (Latin and Cyrillic)
      // IMPORTANT: Longest patterns MUST come FIRST in the alternation.
      // Otherwise "пиши " (short) matches before "пиши ме како " (long),
      // leaving "ме како Ана" as the name instead of just "Ана".
      cleaned = cleaned.replace(/^(?:пиши\s+ме\s+како\s+|запиши\s+ме\s+како\s+|стави\s+ме\s+како\s+|може\s+да\s+запишеш\s+|може\s+да\s+ме\s+запишете\s+|внеси\s+ме\s+како\s+|запишете\s+|пиши[й]?\s+|запиши[й]?\s+|стави\s+|внеси\s+|pishi\s+me\s+kako\s+|zapishi\s+me\s+kako\s+|stavi\s+me\s+kako\s+|moze\s+da\s+zapishesh\s+|moze\s+da\s+me\s+zapishete\s+|vnesi\s+me\s+kako\s+|zapishete\s+|pishi\s+|zapishi\s+|stavi\s+|vnesi\s+)/i, '');
      // Strip leading/trailing whitespace after prefix removal
      cleaned = cleaned.trim();
      // Truncate at conversational tails — owners often append chatty text
      // after giving their name (e.g. "GORAN I BI SAKALDA SE ZAPOZNAEME" =
      // "Goran and I would like to get to know you"). Only the name part
      // should be stored, not the whole sentence. Cut at sentence-ending
      // punctuation first, then at common conversational tail markers
      // (Latin + Cyrillic): "i bi sakal", "mislam", "sakam", "znam",
      // "ke te", "da se zapoznaeme", "sto e", "kako si", "izvini",
      // "povikaj me", "dodadi me", "moze da", "treba da"...
      cleaned = cleaned
        .split(/[.!?…]+/)[0]
        // Letter-boundary guard (?![a-zа-я]) after the marker: prevents
        // truncating surnames that CONTAIN a marker word (e.g. "Mislamov"
        // must not be cut to "Mislam"). The (?:da)? on the bi-sakal
        // variants keeps the merged form "BI SAKALDA" truncating correctly.
        .replace(/\s+(?:i\s+)?(?:bi\s+sakal(?:da)?|би\s+сакал(?:да)?|bi\s+sakala(?:da)?|би\s+сакала(?:да)?|mislam|мислам|sakam|сакам|znam|знам|ke\s+te|ќе\s+те|da\s+se\s+zapoznaeme|да\s+се\s+запознаеме|sto\s+e|што\s+е|kako\s+si|како\s+си|izvini|извини|povikaj\s+me|повикај\s+ме|dodadi\s+me|додади\s+ме|mozе\s+da|може\s+да|treba\s+da|треба\s+да)(?![a-zа-я]).*$/i, '')
        // Strip trailing separators left after truncation (e.g. "GORAN,")
        .replace(/[,;:]+\s*$/, '')
        .trim();
      if (cleaned.length > 0) {
        // Title-case each word: first letter uppercase, rest lowercase
        cleaned = cleaned.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        session.collectedData.ownerName = cleaned;
        console.log(`[OWNER NAME: ${session.collectedData.ownerName}] (cleaned from "${userInput.trim()}")`);
      }
    }
  }

  // === address (gated — must be asked explicitly) ===
  if (nextField === 'address') {
    if (userInput.trim().length > 0) {
      session.collectedData.address = userInput.trim();
      console.log(`[ADDRESS: ${session.collectedData.address}]`);
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

  createPropertyFolder(propertyId, propertyData);
  saveToCSV(session.collectedData, phone, propertyId);

  let closeMessage = "";
  if (session.collectedData.photosStatus === 'VIBER_PENDING') {
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам.\n\nГи очекувам фотографиите на Viber за да можеме поефикасно да го промовираме имотот.\n\nПријатен ден.`;
  } else if (session.collectedData.photosStatus === 'NONE' || session.collectedData.photosStatus === 'SCRAPER_APPROVED') {
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам за довербата.\n\nЌе ве контактирам кога ќе имаме заинтересиран клиент за разгледување на имотот.\n\nПријатен ден.`;
  } else if (session.collectedData.photosStatus === 'VIBER_RECEIVED') {
    closeMessage = `Ви благодарам за фотографиите.\n\nГи имам сите потребни информации.\n\nЌе ве контактирам кога ќе имаме заинтересиран клиент.`;
  } else if (session.collectedData.photosStatus === 'PHOTOGRAPHY_NEEDED') {
    closeMessage = `Тоа беа информациите што ми се потребни.\n\nВи благодарам.\n\nЌе ве контактирам за да организираме фотографирање на имотот.\n\nПријатен ден.`;
  } else {
    closeMessage = `Ви благодарам за довербата и за одвоеното време.\n\nГи внесов сите информации за имотот.\n\nЌе ве контактирам штом имаме соодветен заинтересиран клиент за посета.\n\nВи посакувам убав ден.`;
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
                          known.propertyType === 'land' ? 'плацот' : 'имотот';

    // Get the question with the correct property type
    const question = getQuestion(nextField, known.propertyType || 'apartment', hasScraperPhotos, session.collectedData.photosStatus);

    // If the question is generic, replace with property-specific
    let finalQuestion = question;
    if (question && question.includes('станот')) {
      finalQuestion = question.replace(/станот/g, propertyLabel);
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
    while (nextField && (session.questionAttempts[nextField] || 0) >= 2) {
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
      console.log(`[SKIP: ${nextField} — max 2 attempts reached, owner not providing answer, storing null]`);
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

      // Override question text on re-asks
      if (attempts >= 2) {
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
