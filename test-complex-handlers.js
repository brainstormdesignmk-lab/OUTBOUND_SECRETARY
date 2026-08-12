import { createHarness } from './test-helpers.js';
// ========================================
// COMPLEX STATEFUL HANDLERS — Test Suite
// ========================================
// Tests the 3 handlers that remain in service.js because they have
// state machine logic, follow-up questions, or early returns:
//   1. terraceSqm — hasTerrace + terraceSqm determination
//   2. heating — parno follow-up + district/private/electric detection
//   3. photos — scraper approval, Viber pending, NONE detection
//
// IMPORTANT: The handleTerrace/handleHeating/handlePhotos functions below
// replicate the EXACT logic from service.js. If you fix a bug in service.js,
// you MUST update the corresponding test function here too.
// ========================================
import { extractTerraceNumber, isPositive, isNegative } from './property-extractor.js';

const harness = createHarness();
const assert = harness.assert;



// ========================================
// SIMULATED HANDLER FUNCTIONS
// These replicate the exact logic from service.js
// ========================================

function handleTerrace(u, data) {
  // Returns null (no early return) or { return: { text, type } } (early return = follow-up question)
  if (data.terraceSqm === undefined && data.hasTerrace === undefined) {
    // PENDING FOLLOW-UP (mirror of handlers/data-collection.js): process the
    // "ne znam" / negative / number / terrace-COUNT reply first, so a count
    // answer ("imaima terasi 2") resolves as "has terrace, size unknown"
    // instead of re-arming the follow-up forever.
    if (data.pendingFollowUp === 'terraceSqm') {
      if (/ne znam|не знам|незнам|neznam|ne znam tocno|не знам точно|ne sum siguren|не сум сигурен/i.test(u)) {
        data.hasTerrace = true;
        data.terraceSqm = null;
        data.pendingFollowUp = null;
        return null;
      }
      if (/^0$|nema terasa|нема тераса|nema|нема|без|bez|nema|нема|bez terasa|без тераса|nema parking|нема паркинг/i.test(u) && !/ima|има|kv|кв|m2|м2|kvadrat|квадрат/i.test(u)) {
        data.hasTerrace = false;
        data.terraceSqm = 0;
        data.pendingFollowUp = null;
        return null;
      }
      const firstNum = extractTerraceNumber(u);
      if (firstNum !== null && firstNum > 0 && firstNum < 100) {
        data.hasTerrace = true;
        data.terraceSqm = firstNum;
        data.pendingFollowUp = null;
        return null;
      }
      // TERRACE-COUNT ANSWER (reported): "imaima terasi 2" — the number is
      // the terrace COUNT, not the m² size → "has terrace, size unknown".
      if (/terasa|тераса|terrace|teras|терас|(?:^|[^a-zа-я])ima(?:$|[^a-zа-я])|(?:^|[^a-zа-я])има(?:$|[^a-zа-я])/i.test(u)) {
        data.hasTerrace = true;
        data.terraceSqm = null;
        data.pendingFollowUp = null;
        return null;
      }
      data.pendingFollowUp = null;
      return null;
    }
    if (/ne znam|не знам|незнам|neznam|ne znam tocno|не знам точно|ne sum siguren|не сум сигурен/i.test(u)) {
      data.hasTerrace = true;
      data.terraceSqm = null;
      return null;
    }
    if (/^0$|nema terasa|нема тераса|nema|нема|без|bez|nema|нема|bez terasa|без тераса|nema parking|нема паркинг/i.test(u) && !/ima|има|kv|кв|m2|м2|kvadrat|квадрат/i.test(u)) {
      data.hasTerrace = false;
      data.terraceSqm = 0;
      return null;
    }        // NOTE: Must stay in sync with handlers/data-collection.js — only match terrace-specific words,
        // not generic sqm words like 'kvadrati'/'m2' (those are for totalSqm)
        if (/ima|има|terasa|тераса|terrace|teras|терас/i.test(u) || isPositive(u)) {
      const firstNum = extractTerraceNumber(u);
      if (firstNum !== null && firstNum > 0 && firstNum < 100) {
        data.hasTerrace = true;
        data.terraceSqm = firstNum;
        return null;
      } else {
        return { type: "QUESTION" }; // Follow-up question
      }
    }
  }
  return null;
}

// EXPLICIT NON-ANSWER to the "Какво парно?" follow-up — the ONLY case that
// may default heating to parno_unknown (see the DEFAULT block below). Mirrors
// the real handler in handlers/data-collection.js. Reported bug: bare "parno"
// volunteered as bonus info got its follow-up pending, then an UNRELATED
// message ("parking mesto na -1 vo centar") was consumed as a heating
// non-answer → heating wrongly stored as parno_unknown with no clarification.
const heatingNonAnswer = /(?:^|[^a-zа-я])(?:ne|не)\s+(?:znam|знам)(?:\s+(?:tocno|tochno|точно|sigurno|сигурно))?(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+sum\s+(?:siguren|сигурен|sigurna|сигурна)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+(?:mozam|можам)\s+da\s+(?:kazam|кажам)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:ne|не)\s+se\s+(?:secavam|сеќавам)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:nema|нема|nemam|немам)\s+(?:poim|поим)(?:$|[^a-zа-я])/i;

function handleHeating(u, data, nextField) {
  // Returns { response } if follow-up question, null otherwise
  if (nextField === 'heating' || data.heatingFollowUp) {
    if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg|(?:^|[^a-zа-я])(?:centralno|централно|central)(?:$|[^a-zа-я])/i.test(u)) {
      data.heating = "district";
      data.heatingType = "district";
      data.heatingFollowUp = false;
    } else if (/sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) {
      data.heating = "central";
      data.heatingType = "private_central";
      data.heatingFollowUp = false;
    } else if ((/(?:^|[^a-zа-я])(?:klima|клима)(?:ta|та)?(?:$|[^a-zа-я])/i.test(u) || /inverter|инвертер|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u) || (/(?:^|[^a-zа-я])(?:split|сплит)(?:$|[^a-zа-я])/i.test(u) && !/(?:^|[^a-zа-я])(?:od|од|vo|во|na|на|do|до|za|за)\s+(?:split|сплит)(?:$|[^a-zа-я])/i.test(u)))) {
      data.heating = "electric";
      data.heatingType = "inverter";
      data.heatingFollowUp = false;
    } else if (/struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i.test(u)) {
      data.heating = "electric";
      data.heatingType = "electric";
      data.heatingFollowUp = false;
    } else if (/drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i.test(u)) {
      if (/drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i.test(u)) {
        data.heating = "solid_fuel";
        data.heatingType = "wood_pellets";
      } else {
        data.heating = "oil";
        data.heatingType = "oil";
      }
      data.heatingFollowUp = false;
    } else if (/(?:^|[^a-zа-я])(?:parno|парно)(?:$|[^a-zа-я])/i.test(u) && !data.heatingFollowUp) {
      data.heatingFollowUp = true;
      return { type: "QUESTION" }; // "Kakvo parno? Gradsko ili sopstveno?"
    }
    // The follow-up is pending but this message did NOT resolve it. Only an
    // explicit non-answer ("ne znam" family — the owner saw the question and
    // can't answer) defaults to parno_unknown; an unrelated message (bonus
    // info about ANOTHER field) or a repeated bare "parno" re-asks instead.
    if (data.heatingFollowUp) {
      if (heatingNonAnswer.test(u)) {
        data.heating = "parno_unknown";
        data.heatingType = "unknown";
        data.heatingFollowUp = false;
      } else {
        // Re-ask with a max-2 cap (mirrors the max-2-attempts skip for
        // regular fields): after 2 unanswered re-asks, default to unknown so
        // the conversation can never pin on the heating question.
        const reAskCount = data.heatingFollowUpAttempts || 0;
        if (reAskCount >= 2) {
          data.heating = "parno_unknown";
          data.heatingType = "unknown";
          data.heatingFollowUp = false;
          delete data.heatingFollowUpAttempts;
        } else {
          data.heatingFollowUpAttempts = reAskCount + 1;
          return { type: "QUESTION" }; // re-ask "Kakvo parno? Gradsko ili sopstveno?"
        }
      }
    }
  }
  return null;
}

function handlePhotos(u, data, hasScraperPhotos) {
  // Returns null (no early return) or { return: { text, type } }
  // PHOTOS MARKETING FOLLOW-UP SUB-STATES (mirrors data-collection.js):
  //   MAKE_ASKED — owner said NEMAM; we asked if he can MAKE the photos
  //   PHOTOGRAPHY_ASKED — owner can't make them; we sent the photography offer
  if (data.photosStatus === 'MAKE_ASKED') {
    // CANNOT is checked FIRST — isPositive() matches a bare "da" substring,
    // so "ne mozam da napravam" would otherwise be swallowed by the YES
    // branch below. Idiom guard keeps "nema problem ke napravam" positive.
    const hasIdiomPositive = /nema\s+(?:problem|проблем)|bez\s+(?:problem|проблем)|ne\s+e\s+problem|не\s+е\s+проблем/i.test(u);
    // Dedicated CANNOT regex — NOT isNegative() (its "prav"/"прав" patterns
    // match "napravam" inside "ke gi napravam", a YES).
    if (!hasIdiomPositive && /ne\s+mozam|не\s+можам|ne\s+moze|не\s+може|ne\s+umam|не\s+умам|ne\s+mogu|не\s+могу|ne\s+se\s+razbiram|не\s+се\s+разбирам|ne\s+znam|не\s+знам|nemam\s+kako|немам\s+како|ne\s+sum\s+vo\s+moznost|не\s+сум\s+во\s+можност|ne\s+znam\s+da|не\s+знам\s+да|ne\s+mozam\s+da|не\s+можам\s+да|ne\s+umam\s+da|не\s+умам\s+да|nemam\s+aparat|немам\s+апарат|nemam\s+telefon|немам\s+телефон|nema\s+ko\s+da|нема\s+кој\s+да|ne\s+mi\s+se\s+da|не\s+ми\s+се\s+да|ne\s+sakam\s+da\s+pravam|не\s+сакам\s+да\s+правам|(?:^|\s)(?:ne|не|nema|нема|nemam|немам|bez|без)(?:\s|$)/i.test(u)) {
      data.photosPermission = false;
      data.photosSource = "NO_PHOTOS";
      data.photosStatus = "PHOTOGRAPHY_ASKED";
      data.photos = false;
      data.photosPending = false;
      return { type: "QUESTION" }; // Photography offer
    }
    // YES → VIBER_PENDING + reminder ladder anchor
    if (isPositive(u) || /ke\s+gi\s+napravam|ќе\s+ги\s+направам|ke\s+napravam|ќе\s+направам|ke\s+gi\s+ispratam|ќе\s+ги\s+испратам|ke\s+ispratam|ќе\s+испратам|ke\s+probam|ќе\s+пробам|ke\s+se\s+potrudam|ќе\s+се\s+потрудам|mozam\s+da|можам\s+да|moze\s+da|може\s+да|ke\s+vi\s+gi\s+ispratam|ќе\s+ви\s+ги\s+испратам|ke\s+vi\s+ispratam|ќе\s+ви\s+испратам|ke\s+gi\s+napravam\s+sam|ќе\s+ги\s+направам\s+сам|ke\s+napravam\s+sam|ќе\s+направам\s+сам|ke\s+si\s+gi\s+napravam|ќе\s+си\s+ги\s+направам|da\s+ke|да\s+ќе|da\s+mozam|да\s+можам|ke\s+si\s+ispratam|ќе\s+си\s+испратам/i.test(u)) {
      data.photosPermission = true;
      data.photosSource = "VIBER_PENDING";
      data.photosStatus = "VIBER_PENDING";
      data.photos = true;
      data.photosPending = true;
      return { type: "QUESTION" }; // Make-YES ack
    }
    // Unclear → re-ask, capped at 3 total attempts (mirrors data-collection.js)
    data.photosMakeAttempts = (data.photosMakeAttempts || 0) + 1;
    if (data.photosMakeAttempts >= 3) {
      data.photosPermission = false;
      data.photosSource = "NO_PHOTOS";
      data.photosStatus = "PHOTOGRAPHY_ASKED";
      data.photos = false;
      data.photosPending = false;
      return { type: "QUESTION" }; // Photography offer (fall-through from cap)
    }
    return { type: "QUESTION" }; // Re-ask make question
  }
  if (data.photosStatus === 'PHOTOGRAPHY_ASKED') {
    // NO checked FIRST — "ne sakam" contains the substring "sakam" (the YES
    // regex below), so a negation would otherwise be swallowed as acceptance.
    if (isNegative(u) || /ne\s+sakam|не\s+сакам|fala|фала|blagodaram|благодарам|nema\s+potreba|нема\s+потреба|ne\s+mi\s+treba|не\s+ми\s+треба|ne\s+e\s+potrebno|не\s+е\s+потребно|nema|нема|bez|без/i.test(u)) {
      data.photosSource = "NO_PHOTOS";
      data.photosStatus = "NO_PHOTOS";
      return null; // continue flow
    }
    if (isPositive(u) || /sakam|сакам|moze|може|okej|океј|da|да|organizirajte|организирајте|zainteresiran|заинтересиран|interesno|интересно|neka|нека|izvolte|изволте|ke\s+iskoristam|ќе\s+искористам|dogovoreno|договорено|se\s+dogovara|се\s+договара|pomognete|помогнете/i.test(u)) {
      data.photosSource = "PHOTOGRAPHY_NEEDED";
      data.photosStatus = "PHOTOGRAPHY_NEEDED";
      data.photosManagerReview = true;
      return { type: "QUESTION" }; // Photography-YES ack
    }
    return { type: "QUESTION" }; // Re-ask photography offer
  }
  if (data.photosStatus && data.photosStatus !== 'PENDING') {
    if (data.photosStatus === 'NONE' || data.photosStatus === 'NO_PHOTOS') {
      data.photos = false;
    } else {
      data.photos = true;
    }
  } else if (hasScraperPhotos) {
    if (isPositive(u) || (/da|да|se|се|aktuelni|актуелни|okej|океј|moze|може|se aktuelni|се актуелни|aktuelni se|актуелни се|da se|да се|se isti|се исти|isti se|исти се/i.test(u) && !/neaktuelni|неактуелни/i.test(u))) {
      data.photosPermission = true;
      data.photosSource = "SCRAPER";
      data.photosStatus = "SCRAPER_APPROVED";
      data.photos = true;
    } else if (isNegative(u) || /ne|не|nema|нема|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се/i.test(u)) {
      data.photosPermission = true;
      data.photosSource = "SCRAPER_NOT_CURRENT";
      data.photosStatus = "SCRAPER_NOT_CURRENT";
      data.photos = true;
    }
  } else {
    // PHOTO RECOVERY RULE — checked FIRST (before the positive branch).
    // isPositive() matches bare substrings like "ke"/"pratam"/"ke vi pratam",
    // so "NEMAM AMA KE NAPRAVAM POPLADNE I KE VI PRATAM" (negative-now +
    // promise-later) must go to RECOVERY_ASKED, NOT VIBER_PENDING.
    const hasIdiomPositive = /nema\s+(?:problem|проблем)|bez\s+(?:problem|проблем)|ne\s+e\s+problem|не\s+е\s+проблем/i.test(u);
    if (/nemam\s+fotografi|немам\s+фотографии|nemam\s+sliki|немам\s+слики|momentalno\s+nemam|моментално\s+немам|ne\s+se\s+pri\s+raka|не\s+се\s+при\s+рака|ke\s+gi\s+baram|ќе\s+ги\s+барам|ke\s+gi\s+pobaram|ќе\s+ги\s+побарам|ke\s+gi\s+pratam\s+podocna|ќе\s+ги\s+пратам\s+подоцна|podocna\s+ke\s+pratam|подоцна\s+ќе\s+пратам|nema\s+momentalno|нема\s+моментално|nemam\s+sega|немам\s+сега|sega\s+nemam|сега\s+немам|ne\s+mozam\s+sega|не\s+можам\s+сега|ke\s+ispratam\s+podocna|ќе\s+испратам\s+подоцна|ke\s+pobaram\s+pa\s+ke\s+pratam|ќе\s+побарам\s+па\s+ќе\s+пратам|ne\s+mi\s+se\s+pri\s+raka|не\s+ми\s+се\s+при\s+рака|nemam\s+pri\s+raka|немам\s+при\s+рака|ne\s+se\s+naogjaat\s+sega|не\s+се\s+наоѓаат\s+сега/i.test(u) ||
        // Short neg-now/future words (ne/не, ke/ќе) use letter-boundary matching
        // so they don't fire as substrings of innocent words like "denes"/"денес"
        // (today) — "denes ke pratam" is a POSITIVE commitment, not a recovery.
        (!hasIdiomPositive && /nemam|немам|nema|нема|bez|без|(?:^|[^a-zа-я])ne(?:$|[^a-zа-я])|(?:^|[^a-zа-я])не(?:$|[^a-zа-я])/i.test(u) && /moment|момент|sega|сега|podocna|подоцна|(?:^|[^a-zа-я])ke(?:$|[^a-zа-я])|(?:^|[^a-zа-я])ќе(?:$|[^a-zа-я])|pratam|пратам|napravam|направам|popladne|попладне|utre|утре|docna|доцна|baram|барам|pobaram|побарам|sliki|слики|fotografi|фотографии|raka|рака/i.test(u))) {
      data.photosPermission = false;
      data.photosSource = "RECOVERY_ASKED";
      data.photosStatus = "RECOVERY_ASKED";
      data.photos = false;
      data.photosPending = true;
      return { type: "QUESTION" }; // Recovery question
    }
    if (isPositive(u) || /ima|има|imam|имам|ke pratam|ќе пратам|pratam|пратам|moze da pratam|може да пратам|da|да|ok|океј|da imam|да имам|ima fotografi|има фотографии|ima sliki|има слики|ke vi pratam|ќе ви пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|ke vi ispratam|ќе ви испратам|ispratam|испратам|tuka da vi pratam|тука да ви пратам/i.test(u)) {
      data.photosPermission = true;
      data.photosSource = "VIBER_PENDING";
      data.photosStatus = "VIBER_PENDING";
      data.photos = true;
      data.photosPending = false;
    } else if (isNegative(u) || /nemam|немам|nema|нема|bez|без|nema sliki|нема слики|bez sliki|без слики|ne|не|nema fotografi|нема фотографии|nemam sliki|немам слики|nemam momentalno|немам моментално|ti kazav|ти кажав|kazav|кажав|rekov|реков|nemam|немам|nema momentalno|нема моментално|ne mozam|не можам|ne moze|не може/i.test(u)) {
      data.photosPermission = false;
      data.photosSource = "NONE";
      data.photosStatus = "MAKE_ASKED";
      data.photos = false;
      data.photosPending = false;
      return { type: "QUESTION" }; // Marketing make-photos question
    }
  }
  return null;
}


// ========================================
// HELPER: Create a fresh collectedData object
// ========================================
function freshData() {
  return {};
}

// ========================================
// TERRACE HANDLER TESTS
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🏠 TERRACE HANDLER`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

// T1: No terrace — "nema"
(() => {
  const d = freshData();
  handleTerrace("nema", d);
  assert("T1: 'nema' → hasTerrace=false", d.hasTerrace === false && d.terraceSqm === 0, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T2: No terrace — "nema terasa"
(() => {
  const d = freshData();
  handleTerrace("nema terasa", d);
  assert("T2: 'nema terasa' → hasTerrace=false", d.hasTerrace === false && d.terraceSqm === 0, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T3: No terrace — "bez"
(() => {
  const d = freshData();
  handleTerrace("bez", d);
  assert("T3: 'bez' → hasTerrace=false", d.hasTerrace === false && d.terraceSqm === 0, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T4: No terrace — "0"
(() => {
  const d = freshData();
  handleTerrace("0", d);
  assert("T4: '0' → hasTerrace=false", d.hasTerrace === false && d.terraceSqm === 0, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T5: Terrain with known size — "ima terasa 15m2"
(() => {
  const d = freshData();
  handleTerrace("ima terasa 15m2", d);
  assert("T5: 'ima terasa 15m2' → hasTerrace=true, sqm=15", d.hasTerrace === true && d.terraceSqm === 15, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T6: Terrace with known size — Cyrillic
(() => {
  const d = freshData();
  handleTerrace("има тераса 20 квадрати", d);
  assert("T6: 'има тераса 20 квадрати' → hasTerrace=true, sqm=20", d.hasTerrace === true && d.terraceSqm === 20, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T7: Terrace with known size — "da, 8m2"
(() => {
  const d = freshData();
  handleTerrace("da, 8m2", d);
  assert("T7: 'da, 8m2' → hasTerrace=true, sqm=8", d.hasTerrace === true && d.terraceSqm === 8, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T8: Generic sqm word "kvadrati" should NOT trigger terrace handler (bug fix)
// 'kvadrati' is now only used by global extraction pass for totalSqm, not terrace
(() => {
  const d = freshData();
  handleTerrace("kvadrati 12", d);
  assert("T8: 'kvadrati 12' → NOT extracted (generic sqm word)", d.hasTerrace === undefined && d.terraceSqm === undefined, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T9: Terrace without size — "ima" → follow-up
(() => {
  const d = freshData();
  const result = handleTerrace("ima", d);
  assert("T9: 'ima' without size → follow-up question", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("T9: 'ima' without size → no data set yet", d.hasTerrace === undefined, `got hasTerrace=${d.hasTerrace}`);
})();

// T10: Terrace without size — "terasa" → follow-up
(() => {
  const d = freshData();
  const result = handleTerrace("terasa", d);
  assert("T10: 'terasa' without size → follow-up", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// T11: Terrace follow-up — "ne znam"
(() => {
  const d = freshData();
  handleTerrace("ne znam", d);
  assert("T11: 'ne znam' → hasTerrace=true, sqm=null", d.hasTerrace === true && d.terraceSqm === null, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T12: Terrace follow-up — "ne znam tocno"
(() => {
  const d = freshData();
  handleTerrace("ne znam tocno", d);
  assert("T12: 'ne znam tocno' → hasTerrace=true, sqm=null", d.hasTerrace === true && d.terraceSqm === null, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T13: Terrace — already set → no change
(() => {
  const d = { hasTerrace: true, terraceSqm: 10 };
  handleTerrace("nema terasa", d);
  assert("T13: already set → unchanged by 'nema'", d.hasTerrace === true && d.terraceSqm === 10, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T14: Terrace with Cyrillic — "да, има тераса"
(() => {
  const d = freshData();
  const result = handleTerrace("да, има тераса", d);
  assert("T14: 'да, има тераса' without size → follow-up", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// T15: Terrace with negative reply containing "parking" → still handles correctly
// "nema parking" could be about parking, not terrace. But the handler has "nema parking" in the negative pattern.
// This is a known limitation — only triggers if no ima/kv/m2 present
(() => {
  const d = freshData();
  handleTerrace("nema parking", d);
  assert("T15: 'nema parking' → hasTerrace=false (limitation: nema parking in pattern)", 
    d.hasTerrace === false && d.terraceSqm === 0, 
    `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T16: Terrace follow-up answer — bare number "15" (user responds just the number)
(() => {
  const d = freshData();
  handleTerrace("15", d);
  assert("T16: bare number '15' → NOT extracted (no terrace word, not isPositive)", d.hasTerrace === undefined, `got hasTerrace=${d.hasTerrace}`);
  // NOTE: isPositive("15") is false, bare numbers don't trigger the handler.
  // This is a known limitation for the follow-up scenario.
  // In practice the user typically says "da, 15" or "ima 15".
})();

// T17: Terrace — "da, ima" without size → follow-up
(() => {
  const d = freshData();
  const result = handleTerrace("da, ima", d);
  assert("T17: 'da, ima' without size → follow-up", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// T18: Terrace — Cyrillic "нема" (no) → hasTerrace=false
(() => {
  const d = freshData();
  handleTerrace("нема", d);
  assert("T18: 'нема' → hasTerrace=false", d.hasTerrace === false && d.terraceSqm === 0, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T19: Terrace — "terasa 10m2" without "ima" → still works via terrace-specific word
(() => {
  const d = freshData();
  handleTerrace("terasa 10m2", d);
  assert("T19: 'terasa 10m2' → hasTerrace=true, sqm=10", d.hasTerrace === true && d.terraceSqm === 10, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T20: Terrace — "ok" with number via isPositive
(() => {
  const d = freshData();
  handleTerrace("ok 12m2", d);
  assert("T20: 'ok 12m2' → hasTerrace=true, sqm=12", d.hasTerrace === true && d.terraceSqm === 12, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T21: Terrace — "teras" short form (without final "a") with number
// /teras/ regex matches "teras" even though "terasa" has the full form
(() => {
  const d = freshData();
  handleTerrace("teras 5m2", d);
  assert("T21: 'teras 5m2' → hasTerrace=true, sqm=5", d.hasTerrace === true && d.terraceSqm === 5, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T22: Terrace — "ne sum siguren" (I'm not sure) → ne znam variant
(() => {
  const d = freshData();
  handleTerrace("ne sum siguren", d);
  assert("T22: 'ne sum siguren' → hasTerrace=true, sqm=null", d.hasTerrace === true && d.terraceSqm === null, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T23: Terrace — Cyrillic "не сум сигурен"
(() => {
  const d = freshData();
  handleTerrace("не сум сигурен", d);
  assert("T23: 'не сум сигурен' → hasTerrace=true, sqm=null", d.hasTerrace === true && d.terraceSqm === null, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T24: Terrace — mixed message: "nema terasa" + "ima dvorište"
// The negative guard checks !/ima|има/, so "ima" negates the negative match.
// Then the positive check /ima|има/ matches. No number → follow-up.
(() => {
  const d = freshData();
  const result = handleTerrace("nema terasa ama ima dvorište", d);
  assert("T24: 'nema...ima dvorište' → follow-up (ima negates negative)", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// T25: Terrace — size > 100 bound (should NOT be extracted)
// extractTerraceNumber returns 150, but the <100 check rejects it
(() => {
  const d = freshData();
  const result = handleTerrace("ima terasa 150m2", d);
  assert("T25: 'ima terasa 150m2' → follow-up (150 > 100 bound)", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("T25: hasTerrace NOT set", d.hasTerrace === undefined, `got hasTerrace=${d.hasTerrace}`);
})();

// T26: Terrace — typo "terace" → NOT extracted (no regex match)
(() => {
  const d = freshData();
  handleTerrace("terace 8m2", d);
  assert("T26: 'terace 8m2' (typo) → NOT extracted", d.hasTerrace === undefined, `got hasTerrace=${d.hasTerrace}`);
})();

// T27: Terrace COUNT vs SIZE (reported) — "imaima terasi 2" = there are 2
// terraces, the "2" is the COUNT not the m² size. Must NOT be stored as
// terraceSqm=2 → follow-up asks for the size instead.
(() => {
  const d = freshData();
  const result = handleTerrace("imaima terasi 2", d);
  assert("T27: 'imaima terasi 2' (count) → follow-up, NOT terraceSqm=2", result !== null && result.type === "QUESTION" && d.hasTerrace === undefined && d.terraceSqm === undefined, `got result=${JSON.stringify(result)}, hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T28: "ima 2 terasi" (count BEFORE plural form) — same rule
(() => {
  const d = freshData();
  const result = handleTerrace("ima 2 terasi", d);
  assert("T28: 'ima 2 terasi' (count) → follow-up, NOT terraceSqm=2", result !== null && result.type === "QUESTION" && d.hasTerrace === undefined && d.terraceSqm === undefined, `got result=${JSON.stringify(result)}, hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T29: Unit-attached size with plural form still extracts — "ima 2 terasi od 5m2"
// The "5m2" is an explicit area → terraceSqm=5 (the count "2" is ignored).
(() => {
  const d = freshData();
  handleTerrace("ima 2 terasi od 5m2", d);
  assert("T29: 'ima 2 terasi od 5m2' → terraceSqm=5 (unit wins over count)", d.hasTerrace === true && d.terraceSqm === 5, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T30: Follow-up answered with a COUNT — "imaima terasi 2" after the m²
// question → terrace exists, size unknown (like "ne znam"), NO re-ask loop.
(() => {
  const d = freshData();
  d.pendingFollowUp = 'terraceSqm';
  const result = handleTerrace("imaima terasi 2", d);
  assert("T30: follow-up count answer → hasTerrace=true, sqm=null, no re-ask", result === null && d.hasTerrace === true && d.terraceSqm === null && d.pendingFollowUp === null, `got result=${JSON.stringify(result)}, hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}, pending=${d.pendingFollowUp}`);
})();

// T31: Follow-up answered with a word-number COUNT — "dve terasi"
(() => {
  const d = freshData();
  d.pendingFollowUp = 'terraceSqm';
  const result = handleTerrace("dve terasi", d);
  assert("T31: follow-up 'dve terasi' → hasTerrace=true, sqm=null", result === null && d.hasTerrace === true && d.terraceSqm === null, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T32: Singular bare size is UNTOUCHED by the plural guard — "terasa 4" = 4 m²
(() => {
  const d = freshData();
  handleTerrace("terasa 4", d);
  assert("T32: 'terasa 4' (singular bare) → terraceSqm=4", d.hasTerrace === true && d.terraceSqm === 4, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();

// T33: Singular bare word-number size — "terasa so pet" = 5 m² (not blocked)
(() => {
  const d = freshData();
  handleTerrace("terasa so pet", d);
  assert("T33: 'terasa so pet' (singular word) → terraceSqm=5", d.hasTerrace === true && d.terraceSqm === 5, `got hasTerrace=${d.hasTerrace}, sqm=${d.terraceSqm}`);
})();


// ========================================
// HEATING HANDLER TESTS
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`🔥 HEATING HANDLER`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

// H1: District heating — "gradsko"
(() => {
  const d = freshData();
  handleHeating("gradsko", d, 'heating');
  assert("H1: 'gradsko' → heating=district", d.heating === "district" && d.heatingType === "district" && d.heatingFollowUp === false, `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H2: District heating — Cyrillic
(() => {
  const d = freshData();
  handleHeating("градско", d, 'heating');
  assert("H2: 'градско' → heating=district", d.heating === "district" && d.heatingType === "district", `got heating=${d.heating}`);
})();

// H3: District heating — "dalecno"
(() => {
  const d = freshData();
  handleHeating("dalecno", d, 'heating');
  assert("H3: 'dalecno' → heating=district", d.heating === "district", `got heating=${d.heating}`);
})();

// H4: District heating — "toplovod"
(() => {
  const d = freshData();
  handleHeating("toplovod", d, 'heating');
  assert("H4: 'toplovod' → heating=district", d.heating === "district", `got heating=${d.heating}`);
})();

// H5: District — "centralno" (централно парно = градско)
(() => {
  const d = freshData();
  handleHeating("centralno", d, 'heating');
  assert("H5: 'centralno' → heating=district", d.heating === "district" && d.heatingType === "district", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H6: Private central — Cyrillic
(() => {
  const d = freshData();
  handleHeating("сопствено", d, 'heating');
  assert("H6: 'сопствено' → heating=central, type=private_central", d.heating === "central" && d.heatingType === "private_central", `got heating=${d.heating}`);
})();

// H7: Private central — "kotel"
(() => {
  const d = freshData();
  handleHeating("kotel", d, 'heating');
  assert("H7: 'kotel' → heating=central, type=private_central", d.heating === "central", `got heating=${d.heating}`);
})();

// H8: Inverter — "klima"
(() => {
  const d = freshData();
  handleHeating("klima", d, 'heating');
  assert("H8: 'klima' → heating=electric, type=inverter", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H9: Inverter — "inverter"
(() => {
  const d = freshData();
  handleHeating("inverter", d, 'heating');
  assert("H9: 'inverter' → heating=electric, type=inverter", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}`);
})();

// H10: Electric — "struja"
(() => {
  const d = freshData();
  handleHeating("struja", d, 'heating');
  assert("H10: 'struja' → heating=electric, type=electric", d.heating === "electric" && d.heatingType === "electric", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H11: Solid fuel — "drva"
(() => {
  const d = freshData();
  handleHeating("drva", d, 'heating');
  assert("H11: 'drva' → heating=solid_fuel, type=wood_pellets", d.heating === "solid_fuel" && d.heatingType === "wood_pellets", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H12: Solid fuel — "peleti"
(() => {
  const d = freshData();
  handleHeating("peleti", d, 'heating');
  assert("H12: 'peleti' → heating=solid_fuel, type=wood_pellets", d.heating === "solid_fuel" && d.heatingType === "wood_pellets", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H13: Oil — "nafta"
(() => {
  const d = freshData();
  handleHeating("nafta", d, 'heating');
  assert("H13: 'nafta' → heating=oil, type=oil", d.heating === "oil" && d.heatingType === "oil", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H14: Parno follow-up — first "parno" triggers question
(() => {
  const d = freshData();
  const result = handleHeating("parno", d, 'heating');
  assert("H14: 'parno' → follow-up question", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("H14: 'parno' → heatingFollowUp=true", d.heatingFollowUp === true, `got ${d.heatingFollowUp}`);
})();

// H15: Parno follow-up — "gradsko" answer after follow-up
(() => {
  const d = freshData();
  // First "parno" triggers follow-up
  handleHeating("parno", d, 'heating');
  // Then answer with "gradsko" — note: followUp flag is already set
  handleHeating("gradsko", d, null);
  assert("H15: 'parno' then 'gradsko' → heating=district", d.heating === "district" && d.heatingType === "district" && d.heatingFollowUp === false, `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H16: Parno follow-up — "sopstveno" answer
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');  // triggers follow-up
  handleHeating("sopstveno", d, null);   // answer
  assert("H16: 'parno' then 'sopstveno' → heating=central, type=private_central", d.heating === "central" && d.heatingType === "private_central" && d.heatingFollowUp === false, `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H17: Parno default — second non-matching answer defaults to unknown
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');  // triggers follow-up
  handleHeating("ne znam", d, null);      // answer doesn't match any heating type
  assert("H17: 'parno' then no match → heating=parno_unknown (default)", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H18: Not heating field → skipped
(() => {
  const d = freshData();
  handleHeating("gradsko", d, 'someOtherField');
  assert("H18: not heating field → no change", d.heating === undefined, `got ${d.heating}`);
})();

// H19: Cyrillic — "парно" triggers follow-up
(() => {
  const d = freshData();
  const result = handleHeating("парно", d, 'heating');
  assert("H19: 'парно' → follow-up question", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("H19: 'парно' → heatingFollowUp=true", d.heatingFollowUp === true, `got ${d.heatingFollowUp}`);
})();

// H19b: "SPARNO" (sultry weather, спарно) contains "parno" but is NOT a
// heating mention — must NOT trigger the follow-up (same substring disease as
// the "togas"→gas phantom, reported lead 5536052).
(() => {
  const d = freshData();
  const result = handleHeating("sparno e denes", d, 'heating');
  assert("H19b: 'sparno e denes' → NO follow-up question", result === null, `got ${JSON.stringify(result)}`);
  assert("H19b: 'sparno e denes' → heatingFollowUp stays unset", d.heatingFollowUp === undefined, `got ${d.heatingFollowUp}`);
})();

// H19c: Cyrillic "спарно" (sultry) — same guard
(() => {
  const d = freshData();
  const result = handleHeating("спарно е денес", d, 'heating');
  assert("H19c: 'спарно е денес' → NO follow-up question", result === null, `got ${JSON.stringify(result)}`);
  assert("H19c: 'спарно е денес' → heatingFollowUp stays unset", d.heatingFollowUp === undefined, `got ${d.heatingFollowUp}`);
})();

// H19d: "decentralno" (децентрално — decentralized heating) contains
// "centralno" as a substring but is NOT district heating — must not set
// heating=district (same substring disease as togas→gas, lead 5536052).
(() => {
  const d = freshData();
  handleHeating("decentralno greenje", d, 'heating');
  assert("H19d: 'decentralno greenje' → heating stays unset", d.heating === undefined, `got heating=${d.heating}`);
})();

// H19e: Cyrillic "децентрално" — same guard
(() => {
  const d = freshData();
  handleHeating("децентрално греење", d, 'heating');
  assert("H19e: 'децентрално греење' → heating stays unset", d.heating === undefined, `got heating=${d.heating}`);
})();

// H19f: standalone "centralno" still resolves to district
(() => {
  const d = freshData();
  handleHeating("centralno", d, 'heating');
  assert("H19f: 'centralno' → heating=district", d.heating === "district", `got heating=${d.heating}`);
})();

// H20: Cyrillic follow-up answer — "градско"
(() => {
  const d = freshData();
  handleHeating("парно", d, 'heating');
  handleHeating("градско", d, null);
  assert("H20: парно→градско → district", d.heating === "district" && d.heatingType === "district", `got heating=${d.heating}`);
})();

// H21: Cyrillic — "радијатори" → electric
(() => {
  const d = freshData();
  handleHeating("радијатори", d, 'heating');
  assert("H21: 'радијатори' → heating=electric", d.heating === "electric" && d.heatingType === "electric", `got heating=${d.heating}`);
})();

// H22: Cyrillic — "пелети" → solid_fuel
(() => {
  const d = freshData();
  handleHeating("пелети", d, 'heating');
  assert("H22: 'пелети' → heating=solid_fuel", d.heating === "solid_fuel" && d.heatingType === "wood_pellets", `got heating=${d.heating}`);
})();

// H23: Cyrillic "далечно" → district
(() => {
  const d = freshData();
  handleHeating("далечно", d, 'heating');
  assert("H23: 'далечно' → heating=district", d.heating === "district", `got heating=${d.heating}`);
})();

// H24: "individualno" → private_central
(() => {
  const d = freshData();
  handleHeating("individualno", d, 'heating');
  assert("H24: 'individualno' → heating=central, type=private_central", d.heating === "central" && d.heatingType === "private_central", `got heating=${d.heating}`);
})();

// H25: Cyrillic "термопумпа" (heat pump) → electric/inverter
(() => {
  const d = freshData();
  handleHeating("термопумпа", d, 'heating');
  assert("H25: 'термопумпа' → heating=electric, type=inverter", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}`);
})();

// H26: "kalorifer" → electric
(() => {
  const d = freshData();
  handleHeating("kalorifer", d, 'heating');
  assert("H26: 'kalorifer' → heating=electric, type=electric", d.heating === "electric" && d.heatingType === "electric", `got heating=${d.heating}`);
})();

// H27: Parno follow-up — "sopstveno parno" answer (compound phrase)
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("sopstveno parno", d, null);
  assert("H27: parno→'sopstveno parno' → central, type=private_central", d.heating === "central" && d.heatingType === "private_central" && d.heatingFollowUp === false, `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H28: Parno follow-up — "gradsko parno" answer (compound phrase)
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("gradsko parno", d, null);
  assert("H28: parno→'gradsko parno' → district", d.heating === "district" && d.heatingType === "district" && d.heatingFollowUp === false, `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H29: Already set → no change with new input (nextField !== 'heating', so handler skips)
(() => {
  const d = { heating: "district", heatingType: "district", heatingFollowUp: false };
  handleHeating("parno", d, null);
  assert("H29: already set → unchanged by 'parno'", d.heating === "district" && d.heatingFollowUp === false, `got heating=${d.heating}`);
})();

// H30: "moe parno" during follow-up → private_central
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("moe parno", d, null);
  assert("H30: parno→'moe parno' → central, type=private_central", d.heating === "central" && d.heatingType === "private_central", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H31: "dalinsko" → district (variant of "dalecno")
(() => {
  const d = freshData();
  handleHeating("dalinsko", d, 'heating');
  assert("H31: 'dalinsko' → heating=district", d.heating === "district", `got heating=${d.heating}`);
})();

// H32: "split" (split system) → inverter
(() => {
  const d = freshData();
  handleHeating("split", d, 'heating');
  assert("H32: 'split' → heating=electric, type=inverter", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H32b: Substring-trap audit — "klimatski uslovi" (climatic conditions),
// "mikroklima" (microclimate), and the CITY Split ("od Split sum", "во
// Сплит") must NOT resolve as inverter heating (same disease class as the
// togas→gas fix). Bare "split" (H32) stays valid — the follow-up context
// was asked.
(() => {
  const d = freshData();
  handleHeating("klimatski uslovi", d, 'heating');
  assert("H32b: 'klimatski uslovi' → heating stays unset (climate ≠ AC)", d.heating === undefined, `got heating=${d.heating}`);
})();
(() => {
  const d = freshData();
  handleHeating("mikroklima", d, 'heating');
  assert("H32c: 'mikroklima' → heating stays unset", d.heating === undefined, `got heating=${d.heating}`);
})();
(() => {
  const d = freshData();
  handleHeating("od Split sum", d, 'heating');
  assert("H32d: 'od Split sum' (city) → heating stays unset", d.heating === undefined, `got heating=${d.heating}`);
})();
(() => {
  const d = freshData();
  handleHeating("во Сплит", d, 'heating');
  assert("H32e: 'во Сплит' (in Split) → heating stays unset", d.heating === undefined, `got heating=${d.heating}`);
})();
(() => {
  const d = freshData();
  handleHeating("split sistem", d, 'heating');
  assert("H32f: 'split sistem' → heating=inverter (co-occurrence kept)", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H33: "svoja" (my own — colloq. for own boiler) → private_central
(() => {
  const d = freshData();
  handleHeating("svoja", d, 'heating');
  assert("H33: 'svoja' → heating=central, type=private_central", d.heating === "central" && d.heatingType === "private_central", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H34: "se gream" (I heat myself — colloq. for electric/inverter)
(() => {
  const d = freshData();
  handleHeating("se gream", d, 'heating');
  assert("H34: 'se gream' → heating=electric, type=inverter", d.heating === "electric" && d.heatingType === "inverter", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H35: "loz" (oil heating — from loz ulje/лож) → oil
(() => {
  const d = freshData();
  handleHeating("loz", d, 'heating');
  assert("H35: 'loz' → heating=oil, type=oil", d.heating === "oil" && d.heatingType === "oil", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H36: "pellet" (English singular) → solid_fuel/wood_pellets
(() => {
  const d = freshData();
  handleHeating("pellet", d, 'heating');
  assert("H36: 'pellet' → heating=solid_fuel, type=wood_pellets", d.heating === "solid_fuel" && d.heatingType === "wood_pellets", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H37: Cyrillic "нафта" → oil
(() => {
  const d = freshData();
  handleHeating("нафта", d, 'heating');
  assert("H37: 'нафта' → heating=oil, type=oil", d.heating === "oil" && d.heatingType === "oil", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H38: Follow-up answer with "centralno" → district (централно парно = градско)
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("centralno", d, null);
  assert("H38: parno→'centralno' → heating=district", d.heating === "district" && d.heatingType === "district", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H39: "parno nase" during follow-up → private_central
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("parno nase", d, null);
  assert("H39: parno→'parno nase' → central, type=private_central", d.heating === "central" && d.heatingType === "private_central", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H40: "termo" → electric (short for termoakumulacioni)
(() => {
  const d = freshData();
  handleHeating("termo", d, 'heating');
  assert("H40: 'termo' → heating=electric, type=electric", d.heating === "electric" && d.heatingType === "electric", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H41: THE REPORTED BUG — an UNRELATED message while the follow-up is pending
// must NOT be consumed as a heating non-answer (no parno_unknown default).
// Owner volunteered "ima parno" as bonus info, then sent "parking mesto na -1
// vo centar" — that is NOT an answer to "Какво парно?" → re-ask the follow-up.
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');            // follow-up triggered
  const result = handleHeating("parking mesto na -1 vo centar", d, null);
  assert("H41: unrelated msg while follow-up pending → follow-up RE-ASKED", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("H41: heating NOT defaulted to unknown", d.heating === undefined && d.heatingType === undefined, `got heating=${d.heating}, type=${d.heatingType}`);
  assert("H41: follow-up still pending", d.heatingFollowUp === true, `got ${d.heatingFollowUp}`);
})();

// H42: repeated bare "parno" while the follow-up is pending → still re-ask
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  const result = handleHeating("ima parno", d, null);
  assert("H42: repeated 'parno' → follow-up RE-ASKED (not defaulted)", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
  assert("H42: heating still unset", d.heating === undefined, `got ${d.heating}`);
})();

// H43: explicit non-answer "ne znam tocno" still defaults (H17 family)
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("ne znam tocno", d, null);
  assert("H43: 'ne znam tocno' → parno_unknown (explicit non-answer)", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H44: Cyrillic explicit non-answer "не знам" still defaults
(() => {
  const d = freshData();
  handleHeating("парно", d, 'heating');
  handleHeating("не знам", d, null);
  assert("H44: 'не знам' → parno_unknown (Cyrillic non-answer)", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H45: RE-ASK CAP — after 2 unanswered re-asks, the 3rd unrelated message
// defaults to unknown (the conversation must never pin on heating forever)
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');            // initial ask
  let r = handleHeating("parking mesto na -1", d, null);   // re-ask 1
  assert("H45: re-ask 1 → QUESTION", r !== null && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
  assert("H45: heating still unset after re-ask 1", d.heating === undefined, `got ${d.heating}`);
  r = handleHeating("ul. partizanska 12", d, null);        // re-ask 2
  assert("H45: re-ask 2 → QUESTION", r !== null && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
  r = handleHeating("ima garaza", d, null);                // re-ask 3 → cap
  assert("H45: 3rd unrelated msg → defaulted (cap reached)", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
  assert("H45: follow-up cleared after cap", d.heatingFollowUp === false, `got ${d.heatingFollowUp}`);
})();

// H46: "ne znam tochno" (h-form Viber spelling) → defaults
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("ne znam tochno", d, null);
  assert("H46: 'ne znam tochno' → parno_unknown", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
})();

// H47: "nemam poim" (I have no idea) → defaults
(() => {
  const d = freshData();
  handleHeating("parno", d, 'heating');
  handleHeating("nemam poim", d, null);
  assert("H47: 'nemam poim' → parno_unknown", d.heating === "parno_unknown" && d.heatingType === "unknown", `got heating=${d.heating}, type=${d.heatingType}`);
})();


// ========================================
// PHOTOS HANDLER TESTS
// ========================================
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📸 PHOTOS HANDLER`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

// P1: Normal flow — "da" → Viber pending
(() => {
  const d = freshData();
  handlePhotos("da", d, false);
  assert("P1: 'da' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING" && d.photosStatus === "VIBER_PENDING" && d.photos === true, `got source=${d.photosSource}, status=${d.photosStatus}`);
})();

// P2: Normal flow — "imam"
(() => {
  const d = freshData();
  handlePhotos("imam", d, false);
  assert("P2: 'imam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P3: Normal flow — "ima sliki"
(() => {
  const d = freshData();
  handlePhotos("ima sliki", d, false);
  assert("P3: 'ima sliki' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P4: Normal flow — Cyrillic "има слики"
(() => {
  const d = freshData();
  handlePhotos("има слики", d, false);
  assert("P4: 'има слики' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P5: Normal flow — "ke pratam" (will send)
(() => {
  const d = freshData();
  handlePhotos("ke pratam", d, false);
  assert("P5: 'ke pratam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P6: Normal flow — "ne" → MAKE_ASKED (marketing follow-up: can he make them?)
(() => {
  const d = freshData();
  const result = handlePhotos("ne", d, false);
  assert("P6: 'ne' → MAKE_ASKED (marketing make-photos question)", d.photosPermission === false && d.photosSource === "NONE" && d.photosStatus === "MAKE_ASKED" && d.photos === false, `got source=${d.photosSource}, status=${d.photosStatus}`);
  assert("P6: make-photos question asked", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// P7: Normal flow — "nemam" → MAKE_ASKED
(() => {
  const d = freshData();
  const result = handlePhotos("nemam", d, false);
  assert("P7: 'nemam' → MAKE_ASKED", d.photosPermission === false && d.photosSource === "NONE" && d.photosStatus === "MAKE_ASKED", `got source=${d.photosSource}, status=${d.photosStatus}`);
  assert("P7: make-photos question asked", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// P8: Normal flow — "nema sliki" (don't have photos — recoverable)
(() => {
  const d = freshData();
  handlePhotos("nema sliki", d, false);
  assert("P8: 'nema sliki' → RECOVERY_ASKED (nema+sliki fallback)", d.photosPermission === false && d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P9: Scraper flow — "da" (approves scraper photos)
(() => {
  const d = freshData();
  handlePhotos("da", d, true);
  assert("P9: 'da' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED" && d.photos === true, `got source=${d.photosSource}, status=${d.photosStatus}`);
})();

// P10: Scraper flow — "ne" (rejects existing photos)
(() => {
  const d = freshData();
  handlePhotos("ne", d, true);
  assert("P10: 'ne' with scraper → SCRAPER_NOT_CURRENT", d.photosSource === "SCRAPER_NOT_CURRENT" && d.photosStatus === "SCRAPER_NOT_CURRENT" && d.photos === true, `got source=${d.photosSource}, status=${d.photosStatus}`);
})();

// P11: Scraper flow — Cyrillic "да"
(() => {
  const d = freshData();
  handlePhotos("да", d, true);
  assert("P11: 'да' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P12: Scraper flow — Cyrillic "не"
(() => {
  const d = freshData();
  handlePhotos("не", d, true);
  assert("P12: 'не' with scraper → SCRAPER_NOT_CURRENT", d.photosSource === "SCRAPER_NOT_CURRENT" && d.photosStatus === "SCRAPER_NOT_CURRENT", `got source=${d.photosSource}`);
})();

// P13: Scraper flow — "aktuelni se" (current photos)
(() => {
  const d = freshData();
  handlePhotos("aktuelni se", d, true);
  assert("P13: 'aktuelni se' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P14: Scraper flow — "nema" (new photos needed)
// NOTE: "novi se" would match isPositive (via "se") → SCRAPER_APPROVED (wrong)
// Using "nema" instead which correctly triggers isNegative
(() => {
  const d = freshData();
  handlePhotos("nema", d, true);
  assert("P14: 'nema' with scraper → SCRAPER_NOT_CURRENT", d.photosSource === "SCRAPER_NOT_CURRENT", `got source=${d.photosSource}`);
})();

// P15: Already processed — NONE status → photos=false
(() => {
  const d = { photosStatus: 'NONE' };
  handlePhotos("da", d, false);
  assert("P15: NONE already processed → photos=false", d.photos === false, `got photos=${d.photos}`);
})();

// P16: Already processed — VIBER_PENDING → photos=true
(() => {
  const d = { photosStatus: 'VIBER_PENDING' };
  handlePhotos("ne", d, false);
  assert("P16: VIBER_PENDING already processed → photos=true", d.photos === true, `got photos=${d.photos}`);
  // Note: already-processed check runs BEFORE positive/negative detection
})();

// P17: Already processed — SCRAPER_APPROVED → photos=true
(() => {
  const d = { photosStatus: 'SCRAPER_APPROVED' };
  handlePhotos("ne", d, true);
  assert("P17: SCRAPER_APPROVED already processed → photos=true", d.photos === true, `got photos=${d.photos}`);
})();

// P18: Normal flow — Cyrillic "немам слики" → RECOVERY_ASKED
(() => {
  const d = freshData();
  handlePhotos("немам слики", d, false);
  assert("P18: 'немам слики' → RECOVERY_ASKED", d.photosPermission === false && d.photosSource === "RECOVERY_ASKED" && d.photosStatus === "RECOVERY_ASKED" && d.photos === false && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P19: Normal flow — "ok" → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("ok", d, false);
  assert("P19: 'ok' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P20: Normal flow — "ке пратам" (Cyrillic will-send)
(() => {
  const d = freshData();
  handlePhotos("ке пратам", d, false);
  assert("P20: 'ке пратам' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P21: No match — "kako si" → no change
(() => {
  const d = freshData();
  handlePhotos("kako si", d, false);
  assert("P21: 'kako si' → no data changes", Object.keys(d).length === 0, `got ${JSON.stringify(d)}`);
})();

// P22: Normal flow — "ne mozam" (can't send) → MAKE_ASKED (marketing follow-up)
(() => {
  const d = freshData();
  const result = handlePhotos("ne mozam", d, false);
  assert("P22: 'ne mozam' → MAKE_ASKED", d.photosPermission === false && d.photosSource === "NONE" && d.photosStatus === "MAKE_ASKED", `got source=${d.photosSource}, status=${d.photosStatus}`);
  assert("P22: make-photos question asked", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// P23: Scraper flow — "se aktuelni" → approved
(() => {
  const d = freshData();
  handlePhotos("se aktuelni", d, true);
  assert("P23: 'se aktuelni' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P24: Scraper flow — "novo" (new/updated photos available elsewhere)
// NOTE: "ne se aktuelni" contains "se" (matches isPositive) and "aktuelni" (matches positive regex)
// Using "novo" — can't accidentally match positive patterns, triggers isNegative
(() => {
  const d = freshData();
  handlePhotos("novo", d, true);
  assert("P24: 'novo' with scraper → SCRAPER_NOT_CURRENT", d.photosSource === "SCRAPER_NOT_CURRENT" && d.photosStatus === "SCRAPER_NOT_CURRENT", `got source=${d.photosSource}`);
})();

// P25: Normal flow — "tuka da vi pratam" (I'll send them here)
(() => {
  const d = freshData();
  handlePhotos("tuka da vi pratam", d, false);
  assert("P25: 'tuka da vi pratam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P26: Normal flow — "ke vi ispratam" (I'll send them to you)
(() => {
  const d = freshData();
  handlePhotos("ke vi ispratam", d, false);
  assert("P26: 'ke vi ispratam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P27: Normal flow — "moze da pratam" (I can send)
(() => {
  const d = freshData();
  handlePhotos("moze da pratam", d, false);
  assert("P27: 'moze da pratam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P28: Normal flow — "ima na oglas" (photos on the ad)
(() => {
  const d = freshData();
  handlePhotos("ima na oglas", d, false);
  assert("P28: 'ima na oglas' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P29: Already processed — VIBER_RECEIVED → photos=true
(() => {
  const d = { photosStatus: 'VIBER_RECEIVED' };
  handlePhotos("ne", d, false);
  assert("P29: VIBER_RECEIVED already processed → photos=true", d.photos === true, `got photos=${d.photos}`);
})();

// P30: Already processed — PHOTOGRAPHY_NEEDED → photos=true
(() => {
  const d = { photosStatus: 'PHOTOGRAPHY_NEEDED' };
  handlePhotos("da", d, false);
  assert("P30: PHOTOGRAPHY_NEEDED already processed → photos=true", d.photos === true, `got photos=${d.photos}`);
})();

// P31: Already processed — SCRAPER_NOT_CURRENT → photos=true
(() => {
  const d = { photosStatus: 'SCRAPER_NOT_CURRENT' };
  handlePhotos("da", d, true);
  assert("P31: SCRAPER_NOT_CURRENT already processed → photos=true", d.photos === true, `got photos=${d.photos}`);
})();

// P32: Normal flow — "nema momentalno" (don't have currently) → RECOVERY_ASKED
(() => {
  const d = freshData();
  handlePhotos("nema momentalno", d, false);
  assert("P32: 'nema momentalno' → RECOVERY_ASKED", d.photosPermission === false && d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P33: Normal flow — "da imam" (I have, short form) → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("da imam", d, false);
  assert("P33: 'da imam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P34: Scraper flow — Cyrillic "актуелни" → approved
(() => {
  const d = freshData();
  handlePhotos("актуелни", d, true);
  assert("P34: 'актуелни' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P35: Scraper flow — "neaktuelni" (not current) → SCRAPER_NOT_CURRENT
// NOTE: "neaktuelni" does NOT directly match the positive regex ("aktuelni" would,
// but "neaktuelni" is different). Falls through to isNegative which matches it.
(() => {
  const d = freshData();
  handlePhotos("neaktuelni", d, true);
  assert("P35: 'neaktuelni' → SCRAPER_NOT_CURRENT via isNegative", d.photosSource === "SCRAPER_NOT_CURRENT", `got source=${d.photosSource}`);
})();

// P36: Scraper flow — "se isti" (the same as current) → SCRAPER_APPROVED
(() => {
  const d = freshData();
  handlePhotos("se isti", d, true);
  assert("P36: 'se isti' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P37: Scraper flow — "isti se" (reversed word order) → SCRAPER_APPROVED
(() => {
  const d = freshData();
  handlePhotos("isti se", d, true);
  assert("P37: 'isti se' with scraper → SCRAPER_APPROVED", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got source=${d.photosSource}`);
})();

// P38: Scraper flow — "novi se" (new photos exist, old not current)
// NOTE: The regex `/se/` in the positive scraper condition matches "se" in "novi se".
// This is a known limitation — "novi se" (new ones) means old photos are NOT current,
// but the bare `/se/` pattern is too broad and triggers the APPROVED branch.
// The negative pattern "novi se|нови се" is never reached because the OR short-circuits.
(() => {
  const d = freshData();
  handlePhotos("novi se", d, true);
  // NOTE: This will be SCRAPER_APPROVED because `/se/` in the regex matches "se".
  // Not isPositive — isPositive() doesn't match bare "se". Known limitation.
  assert("P38: 'novi se' with scraper → SCRAPER_APPROVED (regex trap: /se/ matches)",
    d.photosSource === "SCRAPER", `got source=${d.photosSource}`);
})();

// P39: Normal flow — "ke pushtam" (I'll send via Viber/other) → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("ke pushtam", d, false);
  assert("P39: 'ke pushtam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P40: Normal flow — Cyrillic "има фотографии" → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("има фотографии", d, false);
  assert("P40: 'има фотографии' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P41: Normal flow — "ispratam" (I'll send, short form) → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("ispratam", d, false);
  assert("P41: 'ispratam' → VIBER_PENDING", d.photosPermission === true && d.photosSource === "VIBER_PENDING", `got source=${d.photosSource}`);
})();

// P42: Normal flow — "ti kazav" (I told you, I don't have) → MAKE_ASKED
(() => {
  const d = freshData();
  handlePhotos("ti kazav", d, false);
  assert("P42: 'ti kazav' → MAKE_ASKED", d.photosPermission === false && d.photosSource === "NONE" && d.photosStatus === "MAKE_ASKED", `got source=${d.photosSource}, status=${d.photosStatus}`);
})();

// P43: Normal flow — "bez sliki" (without photos) → RECOVERY_ASKED (bez+sliki fallback)
(() => {
  const d = freshData();
  handlePhotos("bez sliki", d, false);
  assert("P43: 'bez sliki' → RECOVERY_ASKED", d.photosPermission === false && d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P44: THE BUG — "nemam ama ke napravam popladne i ke vi pratam"
// Owner says "I don't have them but I'll take them this afternoon and send them."
// Must be RECOVERY_ASKED (photosPending=true), NOT VIBER_PENDING.
(() => {
  const d = freshData();
  const result = handlePhotos("nemam ama ke napravam popladne i ke vi pratam", d, false);
  assert("P44: 'nemam ama ke napravam popladne i ke vi pratam' → RECOVERY_ASKED", d.photosSource === "RECOVERY_ASKED" && d.photosStatus === "RECOVERY_ASKED" && d.photos === false && d.photosPending === true, `got source=${d.photosSource}, pending=${d.photosPending}`);
  assert("P44: recovery question asked", result !== null && result.type === "QUESTION", `got ${JSON.stringify(result)}`);
})();

// P45: Pure promise "ke vi pratam" (will send) with NO negative-now → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("ke vi pratam", d, false);
  assert("P45: 'ke vi pratam' → VIBER_PENDING (no negative-now)", d.photosSource === "VIBER_PENDING" && d.photosPending === false, `got source=${d.photosSource}, pending=${d.photosPending}`);
})();

// P46: "momentalno nemam" (don't have right now) → RECOVERY_ASKED
(() => {
  const d = freshData();
  const result = handlePhotos("momentalno nemam", d, false);
  assert("P46: 'momentalno nemam' → RECOVERY_ASKED", d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P47: "ke gi baram" (I'll look for them) → RECOVERY_ASKED
(() => {
  const d = freshData();
  handlePhotos("ke gi baram", d, false);
  assert("P47: 'ke gi baram' → RECOVERY_ASKED", d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P48: "ne se pri raka" (not at hand) → RECOVERY_ASKED
(() => {
  const d = freshData();
  handlePhotos("ne se pri raka", d, false);
  assert("P48: 'ne se pri raka' → RECOVERY_ASKED", d.photosSource === "RECOVERY_ASKED" && d.photosPending === true, `got source=${d.photosSource}`);
})();

// P49: Idiomatic positive "nema problem ke pratam" (no problem, I'll send)
// must NOT be misclassified as recovery — stays VIBER_PENDING.
(() => {
  const d = freshData();
  handlePhotos("nema problem ke pratam", d, false);
  assert("P49: 'nema problem ke pratam' → VIBER_PENDING (idiom guard)", d.photosSource === "VIBER_PENDING" && d.photosPending === false, `got source=${d.photosSource}, pending=${d.photosPending}`);
})();

// P50: "denes ke pratam" (today I'll send) — "denes" contains "ne" as a substring,
// but letter-boundary matching prevents the false recovery → VIBER_PENDING.
(() => {
  const d = freshData();
  handlePhotos("denes ke pratam", d, false);
  assert("P50: 'denes ke pratam' → VIBER_PENDING (letter-boundary guard)", d.photosSource === "VIBER_PENDING" && d.photosPending === false, `got source=${d.photosSource}, pending=${d.photosPending}`);
})();

// P51: Cyrillic "денес ќе пратам" (today I'll send) → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("денес ќе пратам", d, false);
  assert("P51: 'денес ќе пратам' → VIBER_PENDING (letter-boundary guard)", d.photosSource === "VIBER_PENDING" && d.photosPending === false, `got source=${d.photosSource}, pending=${d.photosPending}`);
})();

// ========================================
// PHOTOS MARKETING FOLLOW-UP (reported requirement): NEMAM → ask if he can
// MAKE the photos himself and send on Viber (variants). YES → VIBER_PENDING
// + reminder ladder anchor. CANNOT → NO_PHOTOS + photography offer from our
// agents + manager-review flag when the property is worth it.
// ========================================

// P52: NEMAM → MAKE_ASKED — then YES "ke gi napravam" → VIBER_PENDING + pending anchor
(() => {
  const d = freshData();
  const q = handlePhotos("nemam", d, false);
  assert("P52: 'nemam' → MAKE_ASKED sub-state", d.photosStatus === "MAKE_ASKED", `got ${d.photosStatus}`);
  assert("P52: make question returned", q && q.type === "QUESTION", `got ${JSON.stringify(q)}`);
  // Owner answers the make question: YES
  const r = handlePhotos("ke gi napravam", d, false);
  assert("P52: make-YES → VIBER_PENDING", d.photosSource === "VIBER_PENDING" && d.photosStatus === "VIBER_PENDING" && d.photos === true && d.photosPending === true, `got source=${d.photosSource}, pending=${d.photosPending}`);
  assert("P52: make-YES returns ack", r && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
})();

// P53: NEMAM → MAKE_ASKED — then Cyrillic YES "ќе ги направам" → VIBER_PENDING
(() => {
  const d = freshData();
  handlePhotos("немам слики", d, false); // recovery path fires first for nema+sliki
  assert("P53: 'немам слики' stays RECOVERY_ASKED (recovery wins)", d.photosStatus === "RECOVERY_ASKED", `got ${d.photosStatus}`);
  const d2 = freshData();
  handlePhotos("не", d2, false);
  assert("P53: 'не' → MAKE_ASKED", d2.photosStatus === "MAKE_ASKED", `got ${d2.photosStatus}`);
  const r = handlePhotos("ќе ги направам", d2, false);
  assert("P53: Cyrillic make-YES → VIBER_PENDING", d2.photosSource === "VIBER_PENDING" && d2.photosPending === true, `got source=${d2.photosSource}`);
})();

// P54: NEMAM → CANNOT ("ne mozam da napravam") → NO_PHOTOS + photography offer
(() => {
  const d = freshData();
  handlePhotos("nemam", d, false);
  assert("P54: 'nemam' → MAKE_ASKED", d.photosStatus === "MAKE_ASKED", `got ${d.photosStatus}`);
  const r = handlePhotos("ne mozam da napravam", d, false);
  assert("P54: make-CANNOT → NO_PHOTOS source", d.photosSource === "NO_PHOTOS", `got ${d.photosSource}`);
  assert("P54: make-CANNOT → PHOTOGRAPHY_ASKED sub-state", d.photosStatus === "PHOTOGRAPHY_ASKED" && d.photos === false && d.photosPending === false, `got status=${d.photosStatus}, photos=${d.photos}`);
  assert("P54: photography offer returned", r && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
})();

// P55: Photography offer → YES "sakam" → PHOTOGRAPHY_NEEDED + manager review
(() => {
  const d = freshData();
  handlePhotos("nemam", d, false);
  handlePhotos("ne mozam da napravam", d, false);
  const r = handlePhotos("sakam", d, false);
  assert("P55: offer-YES → PHOTOGRAPHY_NEEDED", d.photosStatus === "PHOTOGRAPHY_NEEDED" && d.photosSource === "PHOTOGRAPHY_NEEDED", `got status=${d.photosStatus}, source=${d.photosSource}`);
  assert("P55: offer-YES flags manager review", d.photosManagerReview === true, `got ${d.photosManagerReview}`);
  assert("P55: offer-YES returns ack", r && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
})();

// P56: Photography offer → NO ("ne sakam") → final NO_PHOTOS, flow continues
(() => {
  const d = freshData();
  handlePhotos("nemam", d, false);
  handlePhotos("ne mozam da napravam", d, false);
  const r = handlePhotos("ne sakam", d, false);
  assert("P56: offer-NO → NO_PHOTOS final", d.photosStatus === "NO_PHOTOS" && d.photosSource === "NO_PHOTOS" && d.photos === false, `got status=${d.photosStatus}`);
  assert("P56: offer-NO continues flow (null)", r === null, `got ${JSON.stringify(r)}`);
})();

// P57: Make answer unclear ("kako si") → re-ask make question, sub-state kept
(() => {
  const d = freshData();
  handlePhotos("nemam", d, false);
  const r = handlePhotos("kako si", d, false);
  assert("P57: unclear make answer → stays MAKE_ASKED", d.photosStatus === "MAKE_ASKED", `got ${d.photosStatus}`);
  assert("P57: re-ask returned", r && r.type === "QUESTION", `got ${JSON.stringify(r)}`);
})();

// P58: Scraper flow unaffected by marketing sub-states (photosStatus empty)
(() => {
  const d = freshData();
  handlePhotos("da", d, true);
  assert("P58: scraper 'da' → SCRAPER_APPROVED (unchanged)", d.photosSource === "SCRAPER" && d.photosStatus === "SCRAPER_APPROVED", `got ${d.photosSource}`);
})();

// P59: Already-processed NO_PHOTOS → photos=false
(() => {
  const d = { photosStatus: 'NO_PHOTOS' };
  handlePhotos("da", d, false);
  assert("P59: NO_PHOTOS already processed → photos=false", d.photos === false, `got photos=${d.photos}`);
})();

// P60: Make-question re-ask CAP — 3rd unclear answer falls through to the
// photography offer instead of looping the make question forever.
// NOTE: neutral strings only — "sto e novo"/"nema vrska" contain bare
// negatives ("nema") and would hit CANNOT directly instead of the cap.
(() => {
  const d = freshData();
  handlePhotos("nemam", d, false);
  const r1 = handlePhotos("kako si", d, false);
  assert("P60: attempt 1 unclear → stays MAKE_ASKED", d.photosStatus === "MAKE_ASKED" && d.photosMakeAttempts === 1, `status=${d.photosStatus}, attempts=${d.photosMakeAttempts}`);
  const r2 = handlePhotos("haha", d, false);
  assert("P60: attempt 2 unclear → stays MAKE_ASKED", d.photosStatus === "MAKE_ASKED" && d.photosMakeAttempts === 2, `status=${d.photosStatus}, attempts=${d.photosMakeAttempts}`);
  const r3 = handlePhotos("dobar den", d, false);
  assert("P60: attempt 3 unclear → PHOTOGRAPHY_ASKED (cap)", d.photosStatus === "PHOTOGRAPHY_ASKED" && d.photosSource === "NO_PHOTOS", `got status=${d.photosStatus}`);
  assert("P60: cap returns the photography offer", r3 && r3.type === "QUESTION", `got ${JSON.stringify(r3)}`);
  assert("P60: attempts counted", d.photosMakeAttempts >= 3, `got ${d.photosMakeAttempts}`);
})();


// ========================================
// TEST SUMMARY
// ========================================
console.log(`\n=======================================================`);
console.log(`📊 COMPLEX HANDLERS TEST SUMMARY:`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${harness.passed + harness.failed}`);
console.log(`=======================================================`);

if (harness.failed > 0) {
  process.exit(1);
} else {
  console.log(`\n🟢 ALL COMPLEX HANDLER TESTS PASSED`);
}
