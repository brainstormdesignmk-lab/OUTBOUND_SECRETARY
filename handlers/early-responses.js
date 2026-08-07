// ========================================
// handlers/early-responses.js — Hardcoded early-return handlers
// ========================================
// Extracted from service.js (verbatim, zero behavior change).
// These run BEFORE phase detection — each checks a well-known question
// pattern and returns an immediate hardcoded answer (no LLM call).
// The orchestrator calls runEarlyResponses() first; if it returns a
// response, that's the answer; if null, the flow continues.
// ========================================
import {
  matchObjection,
  isAskingAboutRentRules,
  isAskingAboutRentCommission,
  isAskingAboutCommission,
  isAskingForExplanation,
  isAskingAboutPhone,
  isAskingHowItWorks,
  isAskingAboutAgentVisit,
  getRandomAgentVisitResponse,
  isAskingAboutAge,
  getRandomAgeDeflectionResponse,
  isAskingHowCommissionWorks,
  getRandomCommissionNoProvisionResponse,
  getRandomAgencyWorkflowResponse,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts,
  isAskingAboutAgency,
  isAskingIfOwnerMustPay,
  getRandomOwnerMustPayResponse,
  isAskingAboutNoAgencyExperience,
  getRandomNoAgencyExperienceResponse,
  isAskingAboutClients
} from '../objections.js';

// ========================================
// AVAILABILITY-POSITIVE PHRASES (shared)
// The complete vocabulary of messages saying the property is STILL
// available ("uste go imam", "dostapen e", "ne sum go izdal", "ne e
// prodaden"...). This is the exact pattern the availability handler below
// matches. Exported so the DATA_COLLECTION flow can reuse it to ACKNOWLEDGE
// a still-available confirmation that arrives AFTER cooperation was already
// accepted — reported bug: owner sent "da" then "uste ne sum go izdal", the
// first message moved the session into DATA_COLLECTION, and the second one
// was never registered because this handler is gated on
// !cooperationAccepted. AVAILABILITY_NEGATIVE_RE keeps out messages that
// merely contain an availability phrase but are really about something else
// (terrace, klima, parking, broj, sorabotka...).
// ========================================
export const AVAILABILITY_POSITIVE_RE = /uste go imam|уште го имам|dostapen e|достапен е|sloboden e|слободен е|seuste e dostapen|сè уште е достапен|go imam|го имам|uste e|уште е|dostapen|достапен|da imam|да имам|uste go imam da|уште го имам да|da uste go imam|да уште го имам|seuste go imam|сè уште го имам|go imam uste|го имам уште|uste e sloboden|уште е слободен|e sloboden|е слободен|dostapno e|достапно е|seuste e dostapno|сè уште е достапно|ima uste|има уште|uste ima|уште има|go ima uste|го има уште|uste go ima|уште го има|go ima|го има|uste go imam|уште го имам|seuste e|сè уште е|seuste go imam|сè уште го имам|dostapna e|достапна е|slobodna e|слободна е|seuste e dostapna|сè уште е достапна|uste e dostapna|уште е достапна|dostapni se|достапни се|seuste se dostapni|сè уште се достапни|uste se dostapni|уште се достапни|go imam uste|го имам уште|uste go imam|уште го имам|go imam seuste|го имам сè уште|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|seuste e|сè уште е|dostapen|достапен|dostapna|достапна|ne sum go prodal|не сум го продал|ne sum go prodadol|не сум го продадол|uste ne sum go prodal|уште не сум го продал|uste ne sum go prodadol|уште не сум го продадол|uste se prodava|уште се продава|se prodava uste|се продава уште|ne e prodaden|не е продаден|uste ne e prodaden|уште не е продаден|ne sum go izdal|не сум го издал|ne sum go iznajmil|не сум го изнајмил|uste se izdava|уште се издава|se izdava uste|се издава уште|ne e izdaden|не е издаден|uste ne e izdaden|уште не е издаден|ne e izdadena|не е издадена|uste ne e izdadena|уште не е издадена|ne e iznajmen|не е изнајмен|uste ne e iznajmen|уште не е изнајмен|ne e iznajmena|не е изнајмена|uste ne e iznajmena|уште не е изнајмена/i;

export const AVAILABILITY_NEGATIVE_RE = /ne se prodava|не се продава|ne se izdava|не се издава|terasa|тераса|klima|клима|parking|паркинг|procent|процент|obvrski|обврски|klient|клиент|broj|број|kancelari|канцелари|sorabotka|соработка|uslovi|услови|garaza|гаража|garage|гараж|lift|лифт|m2|квадрати|kvadrati|heating|греење|parno|парно/i;

/**
 * Shared predicate: does the text say the property is STILL available?
 * Positive vocabulary + negative guard, lowercased/trimmed. Single source of
 * truth for both the persuasion-phase availability handler and the
 * DATA_COLLECTION acknowledgment (data-collection.js) — the two call sites
 * can never drift apart. NOTE: this deliberately does NOT exclude question
 * marks — that's a pre-existing property of the availability handler; the
 * ack path adds its own stricter guard (see confirmsAvailability).
 */
export function isAvailabilityConfirmation(text) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return false;
  return AVAILABILITY_POSITIVE_RE.test(t) && !AVAILABILITY_NEGATIVE_RE.test(t);
}

/**
 * BARE AVAILABILITY-AMBIGUOUS POSITIVE — the short "yes" family that reads
 * as the AVAILABILITY answer when it arrives together with an availability
 * confirmation: "da"/"да", "ok"/"ок", "okej"/"океј" (reported, lead
 * 3571074: "DA" + "DOSTAPEN E"). DELIBERATELY NARROW: stronger or
 * cooperation-flavored short positives ("moze" = ok/let's, "vazi" =
 * agreed, "ajde" = let's go, "super", "sorabotuvame" = we cooperate,
 * "da probame" = let's try) stay on the short-positive → cooperation path
 * even in an availability batch — "vazi" + "dostapen e" means the owner
 * confirmed availability AND agreed. Only the plain affirmatives are
 * ambiguous enough to be the availability half of the greeting's double
 * question.
 */
const BARE_AVAILABILITY_POSITIVE_RE = /^(?:da|да|ok|ок|okej|океј)$/i;

/**
 * Does the owner's CURRENT TURN confirm availability?
 * Scans session.messages backwards from the end, stopping at Ana's last
 * reply. The engine's grace batch appends every owner text to
 * session.messages immediately (onOwnerMessage → addReply runs at receipt),
 * so by the time ANY message of a batch is processed, the WHOLE batch is
 * visible — "DA" + "DOSTAPEN E" in one window is detected from either
 * message.
 *
 * DELIBERATE DIFFERENCE from data-collection.js's hasRecentAvailability-
 * Confirmation (the DATA_COLLECTION acknowledgment path): this one uses the
 * LOOSE isAvailabilityConfirmation (question marks allowed), because even an
 * owner QUESTION ("dali e dostapen?") in the same batch means the follow-up
 * "DA" is answering availability, not committing to cooperate. Do NOT
 * "unify" the two helpers — importing data-collection's would also create a
 * circular import (data-collection.js imports isAvailabilityConfirmation
 * from THIS module).
 */
function hasRecentAvailabilityConfirmation(session) {
  const msgs = session.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role === 'model') break; // stop at Ana's last reply
    if (isAvailabilityConfirmation(m.text)) return true;
  }
  return false;
}

/**
 * Build the still-available acknowledgment template (rent vs sale wording,
 * "без провизија за вас" is sale-only). Shared by the availability handler
 * and the bare-positive-in-availability-batch guard below — the two call
 * sites can never drift apart. Marks session.availabilityAcknowledged.
 */
function buildAvailabilityResponse(session, isRent) {
  const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'станот' :
                        session.adMemory?.propertyType === 'house' ? 'куќата' :
                        session.adMemory?.propertyType === 'land' ? 'плацот' :
                        session.adMemory?.propertyType === 'commercial' ? 'локалот' : 'имотот';

  let response;
  if (isRent) {
    // IMPORTANT: rent owners DO pay the standard commission (50% of one
    // month's rent, 100% above €1000) — so the rent variants must NEVER
    // promise "без провизија за вас" / "без никакви давачки" / "без
    // обврски" (that phrasing is sale-only).
    const rentResponses = [
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го понудиме на нашите клиенти за издавање?`,
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го издадеме во најкраток можен рок?`,
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале нашата агенција да се погрижи за професионално издавање?`
    ];
    response = rentResponses[Math.floor(Math.random() * rentResponses.length)];
  } else {
    const saleResponses = [
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го понудиме на нашите клиенти, без провизија за вас?`,
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го продадеме во најкраток можен рок, без никакви давачки за вас?`,
      `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале нашата агенција да се погрижи за професионална продажба, без никакви обврски од ваша страна?`
    ];
    response = saleResponses[Math.floor(Math.random() * saleResponses.length)];
  }

  // Store that we already acknowledged availability
  session.availabilityAcknowledged = true;

  return {
    text: response,
    type: "NORMAL"
  };
}

/**
 * Run all hardcoded early-return handlers in the exact order they
 * appear in the original generateResponse.
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @param {boolean} ctx.isRent — rent vs sale transaction
 * @param {Object} ctx.session — LeadSession (mutated for side effects)
 * @returns {Object|null} — { text, type } response, or null to continue
 */
export function runEarlyResponses({ u, isRent, session }) {
  // ========================================
  // COOPERATION ROLLBACK CHECK (MUST run FIRST)
  // If already in DATA_COLLECTION but the owner challenges the
  // cooperation with a statement like "не ти реков дека сакам соработка"
  // (I didn't say I want cooperation), rollback cooperationAccepted=false
  // and return to PERSUASION phase.
  //
  // IMPORTANT: This must run BEFORE the objection router. isAskingAboutCommission
  // matches the literal word "sorabotka", so a challenge message like
  // "ne sum rekol deka sakam sorabotka" would otherwise be swallowed by the
  // commission handler and the rollback would never fire.
  // ========================================
  if (session.collectedData.cooperationAccepted === true &&
      (/ne ti rekov|не ти реков|ne sum rekol|не сум рекол|ne rekov|не реков|ne sum kazal|не сум кажал|ne kazav|не кажав|jas ne sakam sorabotka|јас не сакам соработка|ne sakam sorabotka|не сакам соработка|ne sum siguren deka sakam|не сум сигурен дека сакам|ne znam dali sakam|не знам дали сакам|ne sum zela odluka|не сум зела одлука|ne sum zeol odluka|не сум зел одлука|razmisluvam za sorabotka|размислувам за соработка|ne sakam da sorabotuvame|не сакам да соработуваме|pogreshno me razbravte|погрешно ме разбравте|ne me sfatete|не ме сфатете|ne me razbravte|не ме разбравте|ne e tocno|не е точно|gresno razbiranje|грешно разбирање/i.test(u))) {
    session.collectedData.cooperationAccepted = false;
    // Reset rejection count so persuasion re-starts fresh
    session.rejectionCount = 0;
    console.log(`[COOPERATION: ROLLED BACK — user challenges cooperation]`);
    // Fall through to persuasion flow
  }

  // ========================================
  // HARDCODED: Property already SOLD / no longer available
  // The owner says the property is GONE from the market — "go prodadov pred
  // dva dena" (I sold it two days ago), "veke prodaden" (already sold),
  // "go nema" / "ne e dostapen" (it's gone / not available), "go izdadov"
  // (I rented it out). The deal is done — there is nothing to cooperate on
  // for THIS property, so asking for its clean price / starting data
  // collection is absurd (reported: cooperation was accepted after the owner
  // clearly said the apartment was sold, and Ana then asked for the sold
  // apartment's price). Congratulate, offer future cooperation, and CLOSE
  // the lead gracefully.
  //
  // MUST run BEFORE the availability handler: that regex mixes positive and
  // negative availability phrases and would otherwise swallow "go nema" /
  // "ne e dostapen" and reply "glad it's still available" — the exact
  // opposite of what the owner said.
  //
  // NOT-GONE GUARD: the still-available family must NOT match here —
  // "ne sum go prodal" (I haven't sold it), "ne e prodaden" (it's NOT
  // sold), "uste se prodava" (still for sale) are POSITIVE availability
  // signals that must flow to the availability handler below.
  // ========================================
  const PROPERTY_GONE_RE =
    /go prodadov|го продадов|ja prodadov|ја продадов|prodadov pred|продадов пред|veke prodaden|веќе продаден|prodaden e|продаден е|se prodade|се продаде|go nema|нема го|nema go|ne e dostapen|не е достапен|ne e veke dostapen|не е веќе достапен|veke ne e dostapen|веќе не е достапен|go povlekov|го повлеков|povlekov|повлеков|go izdadov|го издадов|ja izdadov|ја издадов|izdadov pred|издадов пред|veke izdaden|веќе издаден|izdaden e|издаден е|iznajmen e|изнајмен е|go iznajmiv|го изнајмив|veke ne se prodava|веќе не се продава|veke ne se izdava|веќе не се издава/i;
  const NOT_GONE_RE =
    /ne\s+sum\s+(?:go|го|ja|ја)?\s*(?:prodal|продал|prodadol|продадол|izdal|издал|iznajmil|изнајмил)|ne\s+(?:e|е)\s+(?:prodaden|продаден|izdaden|издаден|iznajmen|изнајмен)|uste\s+(?:ne|не)|уште\s+(?:ne|не)|ne\s+(?:se|се)\s+(?:prodava|продава|izdava|издава)|uste\s+(?:se|се)\s+(?:prodava|продава|izdava|издава)|dostapen\s+e|достапен\s+е|go\s+imam|го\s+имам|uste\s+go\s+imam|уште\s+го\s+имам/i;
  // PHONE-CONTEXT GUARD: "brojot ne e dostapen" / "ne e dostapen brojot" (the
  // phone NUMBER isn't reachable) is NOT the property being gone — "ne e
  // dostapen" alone would otherwise close the lead. Exclude any message that
  // ties "dostapen" to a phone/line/number word. (The availability handler
  // below no longer contains the gone-phrases, so this falls through cleanly.)
  const PHONE_UNAVAIL_RE = /(?:broj|број|linija|линија|telefon|телефон)\s*[^.]{0,20}?dostapen|dostapen\s*[^.]{0,20}?(?:broj|број|linija|линија|telefon|телефон)/i;
  if (PROPERTY_GONE_RE.test(u) && !NOT_GONE_RE.test(u) && !PHONE_UNAVAIL_RE.test(u)) {
    // Mark for traceability (the operator sees the closed state in the TUI;
    // the message below already explains WHY to the owner).
    session.propertySold = true;
    console.log('[PROPERTY SOLD/GONE: owner says the property is no longer available — closing gracefully]');
    return {
      text: isRent
        ? 'Разбирам, имотот е веќе издаден. Честитам за успешното издавање! Доколку во иднина имате друг имот за издавање, слободно контактирајте нè. Ви посакувам убав ден.'
        : 'Честитам за успешната продажба на имотот! Доколку во иднина имате друг имот за продажба, слободно контактирајте нè. Ви посакувам убав ден.',
      type: "CLOSED"
    };
  }

  // ========================================
  // HARDCODED: Availability confirmation (with negative lookahead to prevent false matches)
  // ========================================
  // BARE POSITIVE + AVAILABILITY BATCH GUARD (reported, lead 3571074): the
  // greeting asks a DOUBLE question — "Дали е се уште достапен И дали сте
  // заинтересирани за соработка?" An owner who fires "DA" and "DOSTAPEN E"
  // in one quickfire batch is answering the AVAILABILITY half twice. Reading
  // the bare "DA" as a short-positive cooperation acceptance jumps the
  // session into DATA_COLLECTION and Ana demands the rent from an owner who
  // never agreed to cooperate. When the current turn (any user message since
  // Ana's last reply) already confirms availability, a bare short positive
  // gets the availability template (which asks the cooperation question)
  // instead of cooperation acceptance. A SOLO "DA" (no availability
  // confirmation in the turn) keeps the short-positive → DATA_COLLECTION
  // path. Runs BEFORE the availability handler below — the two are mutually
  // exclusive per message (a message is either a bare positive or an
  // availability phrase, never both).
  if (!session.collectedData.cooperationAccepted &&
      BARE_AVAILABILITY_POSITIVE_RE.test(u) &&
      hasRecentAvailabilityConfirmation(session)) {
    console.log('[AVAILABILITY: bare positive + availability confirmation in the same turn — availability, NOT cooperation]');
    return buildAvailabilityResponse(session, isRent);
  }

  if (!session.collectedData.cooperationAccepted && isAvailabilityConfirmation(u)) {
    return buildAvailabilityResponse(session, isRent);
  }

  // ========================================
  // HARDCODED: "Kako zarabotuvate bez provizija?" / "Kako funkcionira bez
  // provizija?" / "rabotite besplatno?" — how does the no-commission model
  // work / do you work for free? Answer with the commission-difference
  // explanation (rotating variants).
  // MUST be checked BEFORE the agency block: a message like "dali vashata
  // agencija raboti besplatno?" contains "agencija" and would otherwise be
  // swallowed by isAskingAboutAgency's generic pitch instead of getting the
  // commission explanation. Also MUST be checked BEFORE isAskingHowItWorks,
  // otherwise "kako funkcionira bez provizija" would incorrectly get the
  // generic workflow answer.
  // ========================================
  if (isAskingHowCommissionWorks(u)) {
    return {
      text: getRandomCommissionNoProvisionResponse(isRent),
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: "Ke vi platam li nesto?" / "ke vi dolzam nesto?" — the owner
  // asks whether THEY must pay the agency anything. Sale: no obligations
  // (they keep their clean price, we earn from the difference). Rent: the
  // 50%/100% rent commission rule. NOT the generic persuasion pitch.
  // ========================================
  if (isAskingIfOwnerMustPay(u)) {
    return {
      text: getRandomOwnerMustPayResponse(isRent),
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: "Ne sum sorabotuval so agencii do sega" — the owner says
  // they have NO experience working with agencies (or it's their first
  // time). Sale: the agency takes nothing from their share, it only raises
  // the chances of a faster sale. Rent: a professional rental service with
  // carefully filtered clientele. MUST run BEFORE the agency block — the
  // message contains "agencija" and would otherwise get the generic
  // Metropolis pitch instead of this reassurance.
  // ========================================
  if (isAskingAboutNoAgencyExperience(u)) {
    return {
      text: getRandomNoAgencyExperienceResponse(isRent),
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: Agency Questions (answer BEFORE anything else except
  // commission-work / no-experience questions — the owner asks about the
  // agency itself: name, experience, location). Answer immediately. Never
  // continue data collection until the question is addressed.
  // ========================================
  if (isAskingAboutAgency(u)) {
    const agencyAnswers = [
      'Ние сме Metropolis, агенција за недвижности. Работиме повеќе од 10 години и имаме искуство со продажба и издавање на станови, куќи и деловни простори. Дали имате некое друго прашање?',
      'Јас сум Ана од Metropolis. Metropolis е агенција за недвижности со повеќегодишно искуство на македонскиот пазар. Нашата канцеларија е во Скопје. Дали сакате да дознаете нешто повеќе?',
      'Metropolis е агенција за недвижности. Работиме професионално и одговорно, и имаме голема база на клиенти. Канцеларијата ни е во Скопје. Дали сакате да продолжиме со соработката?'
    ];
    return {
      text: agencyAnswers[Math.floor(Math.random() * agencyAnswers.length)],
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: Objection Router
  // ========================================

      // Check for price quotes like "baram 156iljadi", "сакам 120000", "цена 150000"
      // GATED on !cooperationAccepted (reported bug): during PERSUASION the
      // commission-rule pitch is the right reply and the sum is tracked as
      // mentionedPrice. But during DATA_COLLECTION the owner is ANSWERING the
      // price question — the early response would swallow the answer, store
      // only mentionedPrice, and leave monthlyRent/cleanPrice empty, so Ana
      // re-asked a price the owner already gave ("BARAM 350 EVRA ZA MESEC" →
      // re-ask → "TI KAZAV 350" → re-ask). Let it fall through to the
      // extraction pass instead, which stores the price field at HIGH.
  const priceQuoteMatch = !session.collectedData.cooperationAccepted &&
    u.match(/\b(baram|сакам|цена|price|cena)\s*(\d{1,3}(?:[.,]\d{3})*)/i);
  if (priceQuoteMatch) {
    let price = parseInt(priceQuoteMatch[2].replace(/[.,]/g, ''));

    // Check if "iljadi" appears anywhere in the message
    if (u.includes('iljadi') || u.includes('илјади')) {
      // If number is less than 1000 and "iljadi" is mentioned, multiply
      if (price < 1000) {
        price = price * 1000;
      }
    }

    session.collectedData.mentionedPrice = price;
    session.rejectionCount = 0; // Reset rejection count

    // Rent rule: the quoted sum is the monthly rent, and the OWNER pays the
    // standard 50%/100% commission on the signing day — never "ние додаваме
    // над неа" (that sale phrasing would claim the owner owes nothing).
    if (isRent) {
      return {
        text: `Вие барате ${price.toLocaleString()} евра месечна кирија. За издавање, вашата обврска е стандардната провизија: 50% од една месечна кирија (100% ако е над 1000 евра), платена на денот на потпишување на договорот. Дали сте расположени да соработуваме?`,
        type: "NORMAL"
      };
    }

    return {
      text: `Вие барате ${price.toLocaleString()} евра. Тоа е вашата чиста цена, а ние додаваме над неа. Дали сте расположени да соработуваме?`,
      type: "NORMAL"
    };
  }

  // HARDCODED: Koj plakja Advokat / Notar / Danok? (any one → answer all three)
  if (isAskingAboutLegalCosts(u)) {
    const saleAnswers = [
      'Адвокатот и Нотарот се обврска на Купувачот. Данокот исто така го плаќа Купувачот во Град Скопје. Вие ја добивате вашата чиста цена.',
      'Сите давачки за Адвокат, Нотар и Данок се на товар на Купувачот. Вашата обврска е само да го продадете имотот.',
      'Купувачот ги регулира сите трошоци за Адвокат, Нотар и Данок. Вие ја добивате договорената цена без никакви давачки.'
    ];
    const rentAnswers = [
      'Кај издавање, Адвокатот и Нотарот обично се делат по половина, но тоа е по договор меѓу двете страни.',
      'За Адвокат и Нотар — тоа е по договор меѓу Вас и закупецот. Најчесто секоја страна плаќа половина.',
      'Трошоците за Адвокат и Нотар кај издавање се договараат меѓу Вас и закупецот. Стандардно е секој да плати по половина.'
    ];
    const answers = isRent ? rentAnswers : saleAnswers;
    return {
      text: answers[Math.floor(Math.random() * answers.length)],
      type: "NORMAL"
    };
  }

  // HARDCODED: How does it work / how will Ana help sell the property?
  // The owner asks about the agency's workflow or "kako ke mi pomognete vo
  // prodazbata?" — answer with the agency-workflow explanation (rotating
  // variants, "без провизија за вас" phrasing for sale).
  if (isAskingHowItWorks(u)) {
    return {
      text: getRandomAgencyWorkflowResponse(isRent),
      type: "NORMAL"
    };
  }

  // HARDCODED: Will Ana herself come to the viewing/showing?
  // Owner asks whether ANA PERSONALLY will visit the property, bring clients,
  // show the apartment, or be present at the viewing. Answer: it is NOT her
  // personal obligation — a colleague agent will handle the case.
  if (isAskingAboutAgentVisit(u)) {
    return {
      text: getRandomAgentVisitResponse(),
      type: "NORMAL"
    };
  }

  // HARDCODED: "Kolku godini imas Ana?" (age deflection)
  // Owner asks Ana's personal age. She NEVER answers with her age — she
  // deflects professionally to her experience (the answer the user liked
  // from the production log). Variants rotate randomly. NOT a strike:
  // the age question was removed from the C1 creepy catalog so this
  // hardcoded deflection fires instead of a warning.
  if (isAskingAboutAge(u)) {
    return {
      text: getRandomAgeDeflectionResponse(isRent),
      type: "NORMAL"
    };
  }

 // HARDCODED: Client question (requires longer phrase context, not bare words)
  // Uses the SHARED isAskingAboutClients gate (objections.js — single source of
  // truth, includes the "imate nekoj zainteresiran" family and bare "imate
  // zainteresirani" variants). An inline copy used to live here and drifted
  // from the objections.js version; now there is exactly one pattern.
  if (isAskingAboutClients(u)) {
    const clientPropertyLabel = session.adMemory?.propertyType === 'apartment' ? 'за таков стан' :
                                session.adMemory?.propertyType === 'house' ? 'за таква куќа' :
                                session.adMemory?.propertyType === 'land' ? 'за таков плац' :
                                session.adMemory?.propertyType === 'commercial' ? 'за таков деловен простор' : 'за ваков имот';
    return {
      text: `Постојано имаме заинтересирани клиенти ${clientPropertyLabel} во тој реон. Дали да почнеме со соработка?`,
      type: "NORMAL"
    };
  }

 // HARDCODED: "za kakva sorabotka prasuvas?"
if (/za kakva sorabotka|каква соработка|kakva sorabotka|за каква соработка/i.test(u)) {
  return {
    text: isRent ? 'Соработката значи дека ние го промовираме вашиот стан на нашите канали и наоѓаме закупец, а вие ја добивате вашата кирија. Дали ви се допаѓа идејата?' : 'Соработката значи дека ние го промовираме вашиот стан на нашите канали и наоѓаме купувач, а вие ја добивате вашата цена. Дали ви се допаѓа идејата?',
    type: "NORMAL"
  };
}

 // HARDCODED: "kako bi sorabotuvale?"
if (/kako bi sorabotuvale|како би соработувале|како да соработуваме|kako da sorabotuvaме/i.test(u)) {
  return {
    text: isRent ? 'Соработката е едноставна: ние го промовираме имотот, доведуваме заинтересирани закупци, а вие одлучувате дали да прифатите понуда. Како ви звучи?' : 'Соработката е едноставна: ние го промовираме имотот, доведуваме заинтересирани купувачи, а вие одлучувате дали да прифатите понуда. Како ви звучи?',
    type: "NORMAL"
  };
}
  // First: Check for rent commission timing questions
  if (isRent && isAskingAboutRentCommission(u)) {
    // Check if it's about percentage/timing
    if (/кога|koga|кога треба|koga treba|плаќам|plakjam|на ден|na den|potpis|потпис|dogovor|договор|neli|нели|zar|зар|50%|50 /i.test(u)) {
      return {
        text: 'За издавање, провизијата зависи од месечната кирија. Доколку киријата е до 1000 евра, вие како сопственик плаќате 50% од една месечна кирија. Доколку киријата е над 1000 евра, вие плаќате една цела месечна кирија. Ние се грижиме за целокупниот процес на издавање, документација и избор на соодветен клиент.',
        type: "NORMAL"
      };
    }
    return {
      text: 'За издавање, провизијата зависи од месечната кирија. Доколку киријата е до 1000 евра, вие како сопственик плаќате 50% од една месечна кирија. Доколку киријата е над 1000 евра, вие плаќате една цела месечна кирија.',
      type: "NORMAL"
    };
  }

  // Second: Check for rent rules
  if (isRent && isAskingAboutRentRules(u)) {
    return {
      text: 'Стандардно, кирија за првиот месец плус една депозит кирија за вас на ден на потпишување на договорот. Минималниот период на издавање е 12 месеци.',
      type: "NORMAL"
    };
  }

  // Third: Check for general commission/conditions
  if (isAskingAboutCommission(u)) {
    if (isRent && /провизи|provizija|%|procent|kolku|колку|plakjam|плаќам|zimate|земате|uslovi|услови/i.test(u)) {
      // ROTATING (anti-bot): the rent commission rule rotates across the
      // approved COMMISSION_NO_PROVISION_RESPONSES_RENT variants instead of
      // returning the same static sentence every time (a Cyrillic rent
      // "од кого земате пари" hits this branch BEFORE matchObjection — the
      // Latin "OD KOGO ZEMATE PARI" falls through to matchObjection's
      // rotating from_whose_pocket rent variants).
      return {
        text: getRandomCommissionNoProvisionResponse(true),
        type: "NORMAL"
      };
    }

    const objection = matchObjection(u, isRent);
    if (objection) {
      session.commissionExplained = true;
      return {
        text: objection.response,
        type: "NORMAL"
      };
    }      if (!session.commissionExplained) {
      session.commissionExplained = true;
      return {
        text: isRent ? 'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци.' : 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата.',
        type: "NORMAL"
      };
    } else if (isAskingForExplanation(u)) {
      return {
        text: isRent ? 'На пример, за кирија од 500 евра, вие добивате 1000 евра од закупецот (прва кирија + депозит). Вие плаќате 250 евра провизија (50%), а закупецот плаќа уште 250 евра.' : 'На пример, ако вие барате 120.000 евра, а ние најдеме купувач за 122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е наша провизија.',
        type: "NORMAL"
      };
    } else {
      return {
        text: isRent ? 'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци. Дали ви е појасно?' : 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?',
        type: "NORMAL"
      };
    }
  }

  // ========================================
  // HARDCODED: Where to send photos
  // ========================================
  if (isAskingWhereToSendPhotos(u)) {
    return {
      text: 'Може да ми ги испратите на Viber. Ќе ве контактирам на Viber за да ми ги пратите. Ви благодарам.',
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: Phone Origin
  // ========================================
  // MONEY-QUESTION GUARD: isAskingAboutPhone matches any "od kade..." message
  // (its "od kade" prefix), but a question like "od kade se parite?" (where
  // does the money come from) is a commission/money question — it must get the
  // from_whose_pocket objection answer, NEVER "Го добив вашиот број од
  // огласот...". The commission gate above already intercepts money-origin
  // phrases (see isAskingAboutCommission); this guard is the second layer.
  const isMoneyQuestion = /pari|пари|dzeb|џеб|provizij|провизиј|zemate|земате|naplakj|наплаќ/i.test(u);
  if (!session.collectedData.cooperationAccepted && isAskingAboutPhone(u) && !isMoneyQuestion) {
    return {
      // Rent: the owner DOES pay the standard commission — never claim
      // "без провизија за вас" (sale-only phrasing).
      text: isRent
        ? "Го добив вашиот број од огласот за станот што го објавивте. За издавање работиме по стандардна провизија за агенцијата. Дали сте заинтересирани за соработка?"
        : "Го добив вашиот број од огласот за станот што го објавивте. Ние работиме без провизија за вас. Дали сте заинтересирани за соработка?",
      type: "NORMAL"
    };
  }

  // Nothing matched — continue to phase detection
  return null;
}
