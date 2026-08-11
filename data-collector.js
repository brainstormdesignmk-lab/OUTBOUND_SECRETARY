// ========================================
// DATA COLLECTOR — Global Extraction Pass
// ========================================
// Extracts ALL simple fields from EVERY user message,
// regardless of current nextField.
// Complex stateful handlers (terrace follow-up, photos)
// remain in service.js. Heating is handled by extractHeating.
// ========================================
import {
  parseMacedonianNumber,
  parseNumberWords,
  parseOrdinalFloor,
  parseViberOrdinalSuffix,
  extractFirstNumber,
  countBedrooms,
  extractPrice,
  extractPricePerSqm,
  parseYearBuilt,
  parseOrientation,
  parseAvailableFromDate
} from './property-extractor.js';
import { extractTenantPreferences } from './property-intelligence.js';

// ========================================
// EXTRACTION RULES
// Each rule returns { field: value, ... } or null
// ========================================

function extractCleanPrice(u, data) {
  // Skip if this is a rental (transactionType='rent') OR if monthlyRent already captured
  // (handles case during persuasion when transactionType isn't set yet but price is rent amount)
  if (data.transactionType === 'rent' || data.monthlyRent !== undefined) return null;
  // PER-SQM PRICE GUARD (reported requirement): "2000 e za m2" / "2000 evra
  // za m2" quotes the price PER M², not the total — extractPrice would grab
  // 2000 as cleanPrice (wrong; the intelligence layer derives the owner
  // price as sqm × pricePerSqm). A per-m² phrase must NEVER become
  // cleanPrice — extractPricePerSqm owns those messages. "2000 e za m2,
  // vkupno 185000" still extracts the total via extractPrice below.
  if (extractPricePerSqm(u) !== null && !/vkupno|вкупно|total|ukupno/i.test(u)) return null;
  const price = extractPrice(u);
  return price !== null ? { cleanPrice: price } : null;
}

// ========================================
// TENANT PREFERENCES (reported requirement, rent leads): "НЕ САКАМ МИЛЕНИЦИ
// И САМОХРАНИ МАЈКИ" (the type of clientele should be MEMORIZED — students,
// families, foreigners, singles, employed, single parents, pensioners,
// pets allowed/no-pets). Asked in DATA_COLLECTION right after availability;
// the answer is stored as { preferred[], excluded[], notes } and written
// into the broker-comment section (property-intelligence.js). Rent-only:
// sale leads never ask tenant-profile questions.
// ========================================
function extractTenantPrefs(u, data) {
  if (data.transactionType !== 'rent') return null;
  if (data.tenantPreferences !== undefined && data.tenantPreferences !== null) return null;
  const tp = extractTenantPreferences(u);
  if (tp === null) return null;
  const out = { tenantPreferences: tp };
  // PETS SYNERGY (reported): a tenant answer like "NE SAKAM MILENICI I
  // SAMOHRANI MAJKI" states the pets policy too. STEP 1 early-returns on
  // the bare tenant answer (no property keywords → STEP 2 skipped), so the
  // dedicated "Дали се дозволени миленици?" question would be asked
  // REDUNDANTLY right after the owner already answered it. Capture
  // petsAllowed from the same message so the workflow advances straight to
  // the next field. extractPetsAllowed's own rent-guard + no-overwrite
  // contract keep this safe.
  if (data.petsAllowed === undefined || data.petsAllowed === null) {
    const pets = extractPetsAllowed(u, data);
    if (pets && pets.petsAllowed !== undefined) out.petsAllowed = pets.petsAllowed;
  }
  return out;
}

// ========================================
// PETS ALLOWED — rent-only boolean (reported requirement: right after the
// tenant-type question, ask whether pets are allowed — a couple of varying
// question phrasings). The dedicated question's answer is a YES/NO, so the
// extractor maps explicit allow/deny phrases with pet vocabulary:
//   POSITIVE: "da, milenici se dozvoleni", "dozvoleni se", "moze so
//             milenici", "nema problem so milenici", "prihakat", "sakam so
//             milenici", "slobodno so milenici"...
//   NEGATIVE: "ne, bez milenici", "ne sakam milenici", "ne dozvoluvam
//             milenici", "zabraneto", "nema milenici", "samo bez
//             kucinja"...
// Bare "da"/"ne" answers are handled by the BARE_YES_NO_FIELDS mapping in
// runGlobalExtraction (preferredField path only). REQUIRES pet vocabulary —
// a bare "ne" in another context can never become petsAllowed=false. The
// tenant-preferences extractor ALSO knows "milenici" as a category
// (preferred/excluded); this field is the dedicated follow-up question's
// own answer, stored separately for the listing (pets_allowed in the Hermes
// payload + broker comment). Rent-only: a sale listing never asks about
// tenants/pets.
// ========================================
function extractPetsAllowed(u, data) {
  if (data.transactionType !== 'rent') return null;
  if (data.petsAllowed !== undefined && data.petsAllowed !== null) return null;
  // NEGATIVE checked first (mirror extractAC): the positive branch below
  // matches ANY "milenici" mention, so "ne sakam milenici" would otherwise
  // collect petsAllowed=true. Covers both word orders, the definite forms
  // ("milenicite ne se dozvoleni"), and the "samo bez" restriction family.
  if (/(?:ne|не)\s+(?:sakam|сакам|dozvoluvam|дозволувам|primam|примам)\s+(?:milenici|миленици|kucinja|кучиња|kuche|куче|macka|мачка)|(?:ne|не)\s+se\s+(?:dozvoleni|дозволени)\s+(?:milenici|миленици|kucinja|кучиња)|(?:milenici|миленици|kucinja|кучиња)\s+(?:ne|не)\s+se\s+(?:dozvoleni|дозволени)|bez\s+(?:milenici|миленици|kucinja|кучиња|kuche|куче|macka|мачка|zivotni|животни|zivotno|животно)|nema\s+(?:milenici|миленици|kucinja|кучиња|zivotni|животни)|samo\s+bez\s+(?:milenici|миленици|kucinja|кучиња)|zabraneto|забрането|zabraneni|забранети|ne\s+moze\s+(?:milenici|миленици)|не\s+може\s+(?:миленици|миленици)/i.test(u)) return { petsAllowed: false };
  // POSITIVE: pet vocabulary with an allow verb/adjective. Both word orders:
  // pets-first ("milenici se dozvoleni") and allow-word-first ("dozvoleni se
  // kucinja", "moze so milenici"). The separator between the allow word and
  // the pet word is "se"/"се" (copula) OR "so"/"со" (with) — "dozvoleni se
  // kucinja" (dogs ARE allowed) and "moze so milenici" (OK with pets).
  if (/(?:milenici|миленици|kucinja|кучиња|kuche|куче|macka|мачка|zivotni|животни|pets)\s+(?:se\s+)?(?:dozvoleni|дозволени|prihakat|прифаќаат|ok|ок|moze|може|slobodni|слободни)|(?:dozvoleni|дозволени|prihakat|прифаќаат|moze|може|slobodno|слободно|nema\s+problem|нема\s+проблем|sakam|сакам)\s+(?:(?:se|се|so|со)\s+)?(?:milenici|миленици|kucinja|кучиња|kuche|куче|macka|мачка|zivotni|животни|pets)/i.test(u)) return { petsAllowed: true };
  return null;
}

function extractPricePerSqmField(u, data) {
  // SALE-ONLY (the per-m² price is a SALE concept; rent asks monthly rent).
  // Skip if transactionType is rent — a rent message "2000 e za m2" would
  // be the owner describing the listing, not a monthly rent.
  if (data.transactionType === 'rent') return null;
  if (data.pricePerSqm !== undefined && data.pricePerSqm !== null) return null;
  const p = extractPricePerSqm(u);
  return p !== null ? { pricePerSqm: p } : null;
}

function extractMonthlyRent(u, data) {
  // Skip if NOT a rental (transactionType !== 'rent' also catches undefined during persuasion)
  // Also skip if cleanPrice already captured (cross-guard for sale leads)
  if (data.transactionType !== 'rent') return null;
  if (data.cleanPrice !== undefined) return null;
  // UTILITIES-CLAUSE STRIP: "350 evra + reziski trosoci" quotes the RENT, but
  // "reziski se 50 evra, kirijata 350" (utilities 50€, rent 350) would let
  // extractPrice grab the FIRST number (50) as the rent — and the currency
  // keyword ("evra") now scores it HIGH, so the confirmation net is gone.
  // Strip any clause that attaches a number to the utilities/трошоци words
  // (utilities word first, or a number directly before it) so the RENT number
  // survives. The reported "350 evra + reziski trosoci" carries no number in
  // its utilities clause → nothing is stripped → 350 is extracted as before.
  let cleaned = u.replace(/(?:reziski|режиски|trosoci|трошоци)(?:[^,;.!?]*?)\d+(?:\s*(?:evra|евра|eur|evro|евро))?[^,;.!?]*/gi, ' ');
  cleaned = cleaned.replace(/\d+(?:\s*(?:evra|евра|eur|evro|евро))?\s*(?:za|на|na|за)?\s*(?:reziski|режиски|trosoci|трошоци)/gi, ' ');
  const price = extractPrice(cleaned);
  return price !== null ? { monthlyRent: price } : null;
}

function extractAvailableFrom(u, data) {
  // RENT-ONLY (reported requirement): the available-from date question fires
  // for rent leads right after availability is confirmed. Sale leads never
  // ask it, so a date-like phrase in a sale message (e.g. "od 2015" as a
  // year) must not create the field.
  if (data.transactionType !== 'rent') return null;
  if (data.availableFrom !== undefined && data.availableFrom !== null) return null;
  const d = parseAvailableFromDate(u);
  return d !== null ? { availableFrom: d } : null;
}

function extractTotalSqm(u, data) {
  // Skip if already set
  if (data.totalSqm !== undefined && data.totalSqm !== null) return null;
  // Sqm-specific context: match number before m2/кв/квадрати words
  const sqmMatch = u.match(/(\d{2,4})\s*(m2|м2|квадрати|кв|sqm|kvadrati|kvadrata|квадрата|квадрат|kv|кв)/i);
  if (sqmMatch) return { totalSqm: parseInt(sqmMatch[1]) };
  // Word-based sqm: parse Macedonian number words before sqm keyword
  // e.g., "seeset i pet kvadrati" → 65, "trideset m2" → 30
  const sqmWordMatch = u.match(/(\S+(?:\s+\S+){0,4})\s*(kvadrati|квадрати|kvadrata|квадрата|m2|м2|kv|кв|sqm)/i);
  if (sqmWordMatch) {
    const parsed = parseNumberWords(sqmWordMatch[1]);
    if (parsed !== null && parsed >= 10 && parsed <= 999) return { totalSqm: parsed };
  }
  // VKUPNO (TOTAL) CONTEXT (reported): "VKUPNO IMA OSUMDESET I SES I TERASA
  // OD 3 M2" = 86 m² total + 3 m² terrace. The total is stated in WORDS with
  // no sqm keyword attached (the "3 M2" belongs to the terrace), so the
  // keyword patterns above miss it. An explicit "вкупно"/"vkupno" (total)
  // marks the number phrase as the total size. Guarded against price context
  // ("vkupno ... iljadi evra"), floor context ("vkupno 7 sprata"), and year
  // context ("osumdeset godina") — those are never totalSqm.
  if (/vkupno|вкупно/i.test(u) &&
      !/iljadi|илјади|evra|евра|eur|evro|евро|sprat|спрат|kat|кат|lift|лифт|elevator|godina|година|izgraden|граден|katnica|катница/i.test(u)) {
    const parsed = parseNumberWords(u);
    if (parsed !== null && parsed >= 10 && parsed <= 999) return { totalSqm: parsed };
    const vkDigits = u.match(/\b(\d{2,4})\b/);
    if (vkDigits) {
      const n = parseInt(vkDigits[1]);
      if (n >= 10 && n <= 999) return { totalSqm: n };
    }
  }

  // BARE NUMBER FALLBACK — FRUSTRATED-REPEAT STRIP ONLY (reported): "86 TI
  // KAZAV" ("86, I told you") — the owner repeats the totalSqm answer with an
  // annoyance suffix because Ana re-asked. The suffix used to break the
  // whole-message bare-number check below, so totalSqm was NOT collected on
  // the first attempt and Ana asked "Дали точната вредност е 86?" (same
  // re-ask loop as the totalFloors "7 TI KAZAV" bug). Strip the suffix first
  // ("86 TI KAZAV" → "86", "OSUMDESET TI REKOV" → "OSUMDESET") and only then
  // accept a bare number. Trailing punctuation after the marker is dropped
  // too ("86, TI KAZAV!" → "86"). This is deliberately STRICTER than the
  // totalFloors fallback: a plain bare number without an annoyed marker must
  // still NOT guess (Ana must never invent data) — the workflow asks the
  // totalSqm question properly in DATA_COLLECTION.
  const uRepeatStrippedSqm = u.replace(ANNOYED_REPEAT_RE, ' ').replace(/[.,:;!?\-]+$/, '').trim();
  if (uRepeatStrippedSqm !== u.trim()) {
    const bareSqmDigit = uRepeatStrippedSqm.match(/^(\d{1,4})$/);
    if (bareSqmDigit) {
      const n = parseInt(bareSqmDigit[1], 10);
      if (n >= 10 && n <= 999) return { totalSqm: n };
    }
    // Multi-word number phrases ("OSUMDESET I SEST" = 86) parse only via
    // parseNumberWords — parseMacedonianNumber is single-word only.
    const bareSqmWord = uRepeatStrippedSqm.trim();
    const w = parseNumberWords(bareSqmWord);
    if (w !== null && w >= 10 && w <= 999) return { totalSqm: w };
  }
  return null;
}

function extractBedrooms(u, data) {
  if (data.bedrooms !== undefined && data.bedrooms !== null) return null;
  const bd = countBedrooms(u);
  return (bd !== null && bd >= 0 && bd <= 20) ? { bedrooms: bd } : null;
}

// ========================================
// Compound floor extraction: "na osmi od deset" → floor=8, totalFloors=10
// Detects patterns where BOTH floor and total floors are given in one phrase.
// Runs BEFORE individual floor/totalFloors extraction to capture compound
// answers in a single turn and skip the totalFloors question entirely.
// ========================================
function extractCompoundFloor(u, data) {
  // VIBER ORDINAL-SUFFIX NORMALIZATION (reported, lead pz186272900): Viber
  // owners type "5TI"/"13TI" (merged) and occasionally "5 TI"/"13 TI"
  // (spaced) for floors. Collapse the space so every compound pattern below
  // matches both shapes. Digit+suffix is unambiguous (never a price/sqm
  // number), so normalizing inside compound matching is safe.
  const v = u.replace(/(\d{1,2})\s+(ti|ти|vi|ви|ri|ри|mi|ми)(?=\s|$)/gi, '$1$2');
  // Pattern 1: "na 8 od 10" or "8 od 10" — digit "od" digit (bilingual od/од)
  const digitOdMatch = v.match(/(?:na\s+|на\s+)?(\d{1,2})\s+(?:od|од)\s+(\d{1,3})/i);
  if (digitOdMatch) {
    const floor = parseInt(digitOdMatch[1]);
    const total = parseInt(digitOdMatch[2]);
    if (floor >= 0 && floor <= 50 && total >= 2 && total <= 50) {
      return { floor, totalFloors: total };
    }
  }

  // Pattern 2: "na osmi od deset", "na 8 od vkupno deset", "osmi kat od vkupno deset",
  // "NA VTORI OD 7" — word (ordinal or digit) "od" word/digit.
  // Optional word (\S+\s+)? between floor and "od" handles "osmi kat od..." and
  // "na osmi kat od..." — a common Macedonian compound floor pattern.
  // The optional word is non-capturing ((?:...)) so capture indices 1 and 2 stay correct.
  // TOTAL TOKEN: (\d{1,3}|[a-zа-я]{2,}) — a bare SINGLE-DIGIT total ("od 7" in
  // "NA VTORI OD 7") previously failed the old (\S{2,}) 2-char minimum, so the
  // compound never fired and totalFloors=7 was lost (reported: "TOTAL FLOORS
  // NOT COLLECTED"). Digits always allowed (1-3); words keep the 2-char minimum
  // so a stray single letter can never be a total. Downstream range check
  // (total 2..50) still guards garbage.
  // FLOOR-WORD TOKEN: [a-zа-я\d]+ (NOT \w) so Cyrillic ordinals ("втори",
  // "осми") match — \w is ASCII-only and silently misses Cyrillic, making
  // "на втори од 7" fall through to single-field extraction (totalFloors
  // lost).
  // FILLER GUARD: the optional word between floor and "od" must be a FLOOR
  // keyword ("osmi kat od deset", "втори кат од седум"). A broad \S+ filler
  // let the terrace phrase "93 kvadrati so 2 TERASI od 5m2" match as
  // floor=2/totalFloors=5 (reported P10 regression) — "terasi" is not a
  // floor word, so that construction is rejected and stays a terrace answer.
  const wordOdMatch = v.match(/(?:na\s+|на\s+)?([a-zа-я\d]+)\s+(?:(?:kat|кат|sprat|спрат|kata|ката|floor|етаж|eta|ета)\s+)?(?:od|од)\s+(?:vkupno\s+|вкупно\s+)?(\d{1,3}|[a-zа-я]{2,})/i);
  if (wordOdMatch) {
    const floorWord = wordOdMatch[1].toLowerCase();
    const totalWord = wordOdMatch[2].toLowerCase();
    // Parse floor word as ordinal, digit, or Viber ordinal suffix ("5TI" → 5)
    let floor = parseOrdinalFloor(floorWord);
    if (floor === null) {
      floor = /^\d+$/.test(floorWord) ? parseInt(floorWord) : parseViberOrdinalSuffix(floorWord);
    }
    // Parse total word as digit, word-number, or extracted from compound like "desetka"
    // VIBER ORDINAL-SUFFIX TOTAL (reported, lead pz186272900): "5TI OD 13TI" —
    // the total is also typed with the ordinal suffix; strip it like the floor
    // side so the compound still fires (total 13TI → 13).
    let total = /^\d+$/.test(totalWord) ? parseInt(totalWord) : (parseMacedonianNumber(totalWord) ?? parseViberOrdinalSuffix(totalWord));
    if (floor !== null && floor >= 0 && floor <= 50 && total !== null && total >= 2 && total <= 50) {
      return { floor, totalFloors: total };
    }
  }

  // Pattern 3: "8/10" or "na 8/10" — digit/digit
  // Requires floor context OR bare message (just "8/10") to avoid false positives
  // like dates (5/10), ratios, scores.
  // Bare "8/10" needs at least 1 digit in each position and both < 50.
  const slashMatch = u.match(/(?:na\s+)?(\d{1,2})\s*\/\s*(\d{1,3})/i);
  if (slashMatch) {
    const floor = parseInt(slashMatch[1]);
    const total = parseInt(slashMatch[2]);
    if (floor >= 0 && floor <= 50 && total >= 2 && total <= 50) {
      // Accept if: floor context present OR the entire message is just this pattern
      // (bare "8/10" when answering the floor question)
      if (/na|kat|кат|sprat|спрат|floor|етаж|od/i.test(u)) {
        return { floor, totalFloors: total };
      }
    }
  }
  // Pattern 3b: bare "8/10" as entire message (no floor context words needed)
  // When the user answers the floor question with just "8/10", that's clearly
  // a compound floor/total expression even without "kat" or "sprat" keywords.
  const bareSlashMatch = u.match(/^(\d{1,2})\s*\/\s*(\d{1,3})$/);
  if (bareSlashMatch) {
    const floor = parseInt(bareSlashMatch[1]);
    const total = parseInt(bareSlashMatch[2]);
    if (floor >= 0 && floor <= 50 && total >= 2 && total <= 50) {
      return { floor, totalFloors: total };
    }
  }

  return null;
}

function extractFloor(u, data) {
  if (data.floor !== undefined && data.floor !== null) return null;
  // COMPOUND PATTERN FIRST: "na osmi od deset" → floor=8, totalFloors=10
  // Extracts BOTH fields in a single turn, skipping the totalFloors question.
  // Must run BEFORE individual floor extraction to capture compound answers.
  const compoundResult = extractCompoundFloor(u);
  if (compoundResult) {
    // Only return totalFloors if not already set by a previous turn
    if (data.totalFloors !== undefined && data.totalFloors !== null) {
      return { floor: compoundResult.floor };
    }
    return compoundResult;
  }

  // Check for potkrovje first
  if (/potkrovje|поткровје|podkrovje|подкровје|potkrov|поткров|potkrov|поткров/i.test(u)) {
    // First check if this SAME message also contains totalFloors (cross-rule hint)
    const storyHint = u.match(/(\d{1,3})\s*(katnica|катница|kata|ката|sprata|спрата|sprat|спрат|eta|ета|etaža|етажа)/i);
    const totalFloors = storyHint ? parseInt(storyHint[1]) : (data.totalFloors || 6);
    return { floor: totalFloors + 1 };
  }
  // Ordinal floors (прв, втор, трет, петти, etc.)
  // TIME-COUNT GUARD (reported quirk): ordinals counting occurrences or days
  // — "po tret pat" (for the third time), "vtor den" (second day) — are NOT
  // floor answers. Strip ordinal+time-word phrases BEFORE ordinal parsing so
  // "PO TRET PAT TI KAZUVAM" no longer yields floor=3, while
  // "PO TRET PAT ... NA VTORI" still yields floor=2 (the real floor word
  // survives the strip and parseOrdinalFloor still finds "vtor").
  // The [а-яa-z]* suffix eats inflections ("вториот ден"), (?:\s|$) prevents
  // matching word parts ("denes" contains "den" but is not a time phrase),
  // and "kat"/"sprat" are NOT time words so "tret kat" still extracts 3.
  const uNoTimeCount = u.replace(
    /(?:prv|прв|vtor|втор|tret|трет|cetvrt|четврт|petti|петти|peti|пети|sesti|шести|sedmi|седми|osmi|осми|devetti|деветти)[а-яa-z]*\s*(?:pat|пат|den|ден|mesto|место)(?:\s|$)/gi,
    ' '
  );
  const ordinal = parseOrdinalFloor(uNoTimeCount);
  if (ordinal !== null) {
    // FLOOR-CONTEXT / DIRECT-ANSWER GUARD (reported, lead 5502969): a bare
    // ordinal word ("prvo", "vtori") is only a floor answer when the message
    // has a floor keyword ("na vtori kat"), the ordinal sits after "na"/"на"
    // (the standard answer shape — "на втори"), or the message is a short
    // direct reply ("VTORI", "NA VTORI"). In longer free-form messages
    // ("PA PRVO KE RPOBAM MESEC DVA..."), "prvo" (firstly) is an adverb, NOT
    // a floor — it must never set floor=1.
    const floorWords = uNoTimeCount.split(/\s+/).filter(Boolean);
    const hasFloorKeyword = /(?:kat(?!nica)|кат(?!ница)|kata|ката|sprat(?!a)(?!а)|спрат(?!а)(?!a)|floor|eta|ета|katnica|катница|sprata|спрата|katovi|катови|spratovi|спратови)/i.test(u);
    // A direct floor answer with volunteered details ("VTORI, IMA LIFT I
    // KLIMA") starts with the ordinal — accept that shape too. The adverb
    // "prvo" (firstly) is deliberately excluded from the start-anchor: in
    // sentence-initial position without floor context it is an adverb, not
    // a floor ("PRVO KE PROBAM SAMA...").
    const firstWord = (uNoTimeCount.trim().split(/\s+/)[0] || '').toLowerCase();
    const startsWithFloorOrdinal = /^(?:vtor|втор|tret|трет|cetvrt|четврт|petti|петти|peti|пети|sesti|шести|sedmi|седми|osmi|осми|devetti|деветти|prizemje|приземје|potkrovje|поткровје)/.test(firstWord);
    // ADVERB WORD-COUNT GUARD (reviewer finding): the reported adverb bug
    // ("PA PRVO KE RPOBAM MESEC DVA..." → phantom floor=1) was fixed for LONG
    // messages via the word-count threshold — but a SHORT adverb sentence
    // ("PRVO KE PROBAM" = 3 words) still slipped through the ≤3-word
    // direct-answer shortcut and set floor=1. The adverb forms "prvo"/"prva"
    // (firstly) must be excluded from the shortcut just like they are from
    // the start-anchor; the masculine "PRVI" (a genuine bare floor answer)
    // stays a valid direct reply.
    const startsWithPrvoAdverb = /^(?:prvo|прво|prva|прва)(?:$|[^a-zа-я])/.test(firstWord);
    const isDirectAnswer = (floorWords.length <= 3 && !startsWithPrvoAdverb) || /(?:^|\s)(?:na|на)\s+/.test(u) || startsWithFloorOrdinal;
    if (hasFloorKeyword || isDirectAnswer) {
      return { floor: ordinal };
    }
    console.log(`[FLOOR: skip — ordinal "${uNoTimeCount.trim().slice(0, 40)}" without floor context]`);
  }
  // VIBER ORDINAL-SUFFIX FLOORS (reported, lead pz186272900): Viber owners
  // type digit+ordinal-suffix shorthand for the floor answer — "5TI", "13TI",
  // "7MI", "1VI", "2RI", also "5 TI" (spaced). Same direct-answer guard as
  // word ordinals: floor keyword, short reply, or "na"/"на" prefix. The
  // compound "5TI OD 13" is already handled above by extractCompoundFloor.
  const viberOrdMatch = uNoTimeCount.match(/(?:^|\s)(\d{1,2})\s*(ti|ти|vi|ви|ri|ри|mi|ми)(?:\s|$)/i);
  if (viberOrdMatch) {
    const viberOrd = parseInt(viberOrdMatch[1], 10);
    if (viberOrd >= 0 && viberOrd <= 50) {
      // TOTAL-FLOORS CONTEXT GUARD (mirrors the digit path below): "ima 13TI
      // sprata" states the building's TOTAL, never the apartment's floor.
      const isTotalContext = /(?:zgradata|зградата|zgradava|зградава|ima|има|e|е|se|се|vkupno|вкупно)\s+\d{1,2}\s*(?:ti|ти|vi|ви|ri|ри|mi|ми)\s+(?:sprata|спрата|kata|ката|katnica|катница)/i.test(u);
      if (!isTotalContext) {
        const floorWordsV = uNoTimeCount.split(/\s+/).filter(Boolean);
        const hasFloorKeywordV = /(?:kat(?!nica)|кат(?!ница)|kata|ката|sprat(?!a)(?!а)|спрат(?!а)(?!a)|floor|eta|ета|katnica|катница|sprata|спрата|katovi|катови|spratovi|спратови)/i.test(u);
        const isDirectAnswerV = floorWordsV.length <= 3 || /(?:^|\s)(?:na|на)\s+/.test(u);
        if (hasFloorKeywordV || isDirectAnswerV) {
          return { floor: viberOrd };
        }
      }
    }
  }
  // Digit floor — find number adjacent to floor context words.
  // Uses (?!nica) negative lookahead to prevent "kat" from matching
  // "katnica" ("kat" + "nica") while still allowing "kat" standalone,
  // "kata", "3kat" (no space, common in Viber shorthand), etc.
  // TOTAL-FLOORS CONTEXT GUARD: Prevent "zgradata ima 13 sprata" from setting floor=13.
  // When the message clearly states the building's total floor count, skip floor
  // extraction — these are for extractTotalFloors.
  //
  // Key patterns:
  //   "zgradata ima 13 sprata" → totalFloors=13 (NOT floor=13)
  //   "zgradata ima 10 kata" → totalFloors=10 (NOT floor=10)
  //   "ima 10 kata" → totalFloors=10 (NOT floor=10)
  //
  // NEVER blocked (correct floor extraction):
  //   "na 3 sprat" → floor=3 (preceded by "na", not total-floors context)
  //   "tret sprat" → floor=3 (ordinal, not total-floors context)
  //
  // NOTE: We include "sprata" in the guard (NOT in extraction paths) because
  // "sprata" is the PLURAL form meaning total floors. But we use
  // "sprat(?!a)(?!а)" in extraction paths (see below) to prevent the singular
  // "sprat" from matching the plural "sprata" as a substring.
  if (/(?:zgradata|зградата|zgradava|зградава|ima|има|e|е|se|се|vkupno|вкупно)\s+\d{1,2}\s+(?:kat(?!nica)|кат(?!ница)|kata|ката|sprata|спрата)/i.test(u)) {
    console.log(`[FLOOR: skip — total-floors (digits) context in "${u}"]`);
    return null;
  }
  // WORD-NUMBER VARIANT: Catch total-floors context with Macedonian word
  // numbers instead of digits. E.g., "zgradata ima trinaest kata",
  // "ima deset kata", "zgradata ima pet kata".
  // Uses parseMacedonianNumber to verify the word IS a number (prevents
  // false positives from non-number words like "nova" or "visoka").
  const wordNumberGuard = u.match(/(?:zgradata|зградата|zgradava|зградава|ima|има|e|е|se|се|vkupno|вкупно)\s+(\S+)\s+(?:kata|ката|sprata|спрата|spratovi|спратови)/i);
  if (wordNumberGuard) {
    const parsed = parseMacedonianNumber(wordNumberGuard[1]);
    if (parsed !== null && parsed >= 1 && parsed <= 50) {
      console.log(`[FLOOR: skip — total-floors (word-number) context in "${u}"]`);
      return null;
    }
  }
  // Digit floor — find number adjacent to floor context words.
  // Uses (?!nica) negative lookahead to prevent "kat" from matching
  // "katnica" ("kat" + "nica") while still allowing "kat" standalone,
  // "kata", "3kat" (no space, common in Viber shorthand), etc.
  // NOTE: "sprat|спрат" uses (?!a)(?!а) negative lookahead to prevent
  // matching "sprata"/"спрата" (plural = total floors). The 'a'/'а'
  // suffix makes it plural in Macedonian — the singular "sprat" means
  // "which floor", the plural "sprata" means "total floors".
  const floorMatch = u.match(/(\d{1,2})\s*(kat(?!nica)|кат(?!ница)|kata|ката|sprat(?!a)(?!а)|спрат(?!а)(?!a)|floor)/i);
  if (floorMatch) {
    const num = parseInt(floorMatch[1]);
    if (num >= 0 && num <= 50) return { floor: num };
  }
  // Fallback: extract first reasonable number — but skip if another field context present
  // (e.g., "2 spalni" → number 2 is about bedrooms, not floor).
  // ALSO: require floor-context words for bare number fallback (no fallback guessing).
  // "10" without "kat", "sprat", etc. has 0% confidence → return null.
  // Uses (?!nica) negative lookahead to prevent "kat" from matching
  // "katnica" while still allowing "3kat" (no space, common in Viber).
  // PROXIMITY-BASED FLOOR CONTEXT: require the floor keyword to be within
  // ~3 words of the candidate number. This prevents false positives where
  // "kat" appears elsewhere in the message but the number is about sqm or price.
  // Example: "50m2 na kat 3" — the "kat" is close to "3", not "50".
  // Uses extractFirstNumber then checks if a floor keyword is within word proximity.
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 0 && firstNum <= 50) {
    const words = u.split(/\s+/);
    const numIndex = words.findIndex(w => w.match(/\d+/));
    if (numIndex !== -1) {
      // Check within 3 words before AND after the number for floor keywords
      const start = Math.max(0, numIndex - 3);
      const end = Math.min(words.length, numIndex + 4);
      const nearWords = words.slice(start, end);
      const hasNearFloorContext = nearWords.some(w =>
        /kat(?!nica)|кат(?!ница)|sprat(?!a)(?!а)|спрат(?!а)(?!a)|floor|kata|ката|eta|ета/i.test(w)
      );
      if (hasNearFloorContext) {
        // Skip if the message contains context from another field
        if (/m2|м2|кв|kvadrati|квадрати|kv|sqm|spalni|спални|terasa|тераса/i.test(u)) return null;
        return { floor: firstNum };
      }
    }
  }
  // Also check parsed word numbers with proximity-based floor context.
  // Uses the same proximity logic as the digit path above to prevent false
  // positives where a floor keyword appears elsewhere in the message.
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 50) {
    const words = u.split(/\s+/);
    // For word numbers, find ANY word in the message that is a floor keyword.
    // Then check if the parsed word number is near that floor keyword.
    // This catches "deseti sprat" (word number + floor keyword adjacent).
    const floorWordIdx = words.findIndex(w =>
      /kat(?!nica)|кат(?!ница)|sprat(?!a)(?!а)|спрат(?!а)(?!a)|floor|kata|ката|eta|ета/i.test(w)
    );
    if (floorWordIdx !== -1) {
      // Skip if message contains terrace or question context (could be answering terrace/other follow-up)
      if (/terasa|тераса|zosto|зошто|zasto|зашто/i.test(u)) return null;
      return { floor: wordNum };
    }
  }
  return null;
}

function extractTotalFloors(u, data) {
  if (data.totalFloors !== undefined && data.totalFloors !== null) return null;
  // Look for number adjacent to building-story context words
  // e.g., "10katnica" → 10, "10 katnica" → 10, "10 spratovi" → 10
  const storyMatch = u.match(/(\d{1,3})\s*(katnica|катница|kata|ката|sprata|спрата|kati|кати|sprat|спрат|eta|ета|etaža|етажа)/i);
  if (storyMatch) {
    const num = parseInt(storyMatch[1]);
    if (num >= 1 && num <= 50) return { totalFloors: num };
  }
  // Also try word-based numbers (e.g., "deset katnica", "deset kata", "pet sprata")
  // NOTE: "sprat" alone is excluded because ordinal floor words (sesti, tret, etc.)
  // before "sprat" are matched by extractFloor, not extractTotalFloors.
  // Only "sprata" (floors, total) and "katnica"/"kata" (story-building) are used.
  const wordStoryMatch = u.match(/(\S+)\s*(katnica|катница|kata|ката|sprata|спрата|kati|кати|eta)/i);
  if (wordStoryMatch) {
    const wordNum = parseMacedonianNumber(wordStoryMatch[1]);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 50) return { totalFloors: wordNum };
  }

  // BARE NUMBER FALLBACK: entire message is just a number (digit or word).
  // This handles cases like "10" → totalFloors=10 when the user is directly
  // answering the totalFloors question without "katnica"/"sprata" keywords.
  // The NUMBER_SNIFFING_EXTRACTORS guard in STEP 2 prevents false positives
  // in global discovery mode (when user says "10" unrelated to floors).
  //
  // FRUSTRATED-REPEAT STRIP (reported): "7 TI KAZAV" ("7, I told you") — the
  // owner repeats the answer with an annoyance suffix because Ana re-asked.
  // The suffix used to break the whole-message bare-number checks below, so
  // the answer was NOT collected on the first attempt. Strip the suffix first
  // ("7 TI KAZAV" → "7", "SEDUM TI REKOV" → "SEDUM") so the fallback fires.
  const uRepeatStripped = u.replace(ANNOYED_REPEAT_RE, ' ').trim();
  const bareDigit = uRepeatStripped.match(/^(\d{1,3})$/);
  if (bareDigit) {
    const num = parseInt(bareDigit[1]);
    if (num >= 1 && num <= 50) return { totalFloors: num };
  }
  // NOTE: bare Viber ordinal suffixes ("9TI", "13TI") are deliberately NOT
  // handled here — a suffixed ordinal is an ORDINAL (answers "на кој кат?" =
  // which floor), never a total. extractFloor's compound path already captures
  // "5TI OD 13" → floor 5 + totalFloors 13 and "5TI OD 13TI" → total 13 in
  // the same turn; letting this fallback fire on bare "9TI" would fabricate
  // totalFloors=9 from a mere floor answer (reported, lead pz186272900).
  // Bare word number: "deset" → 10
  const bareWord = uRepeatStripped.trim();
  if (!/\s/.test(bareWord) && bareWord.length > 0) {
    const wordNum = parseMacedonianNumber(bareWord);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 50) return { totalFloors: wordNum };
  }

  return null;
}

function extractElevator(u, data) {
  if (data.elevator !== undefined && data.elevator !== null) return null;
  // Require lift-specific context — don't match bare "da"/"ne"
  if (/lift|лифт|elevator|ima lift|има лифт/i.test(u)) return { elevator: true };
  if (/bez lift|без лифт|nema lift/i.test(u)) return { elevator: false };
  return null;
}

function extractAC(u, data) {
  if (data.ac !== undefined && data.ac !== null) return null;
  // NEGATION CHECKED FIRST (reported lead 5540516): the positive keyword
  // branch below matches ANY "klima" mention, so "KLIMA NEMA AMA
  // ORIENTACIJATA MU E JUG TAKA DA NE TREBA" (no AC — it's south-facing, so
  // it doesn't need one) used to collect ac:true. Covers both word orders
  // ("nema klima" and "klima nema"), the definite form ("klimata nema"),
  // and the "ne treba" family ("AC not needed" ⇒ no AC).
  if (/nema\s+klima|нема\s+клима|klima\s+nema|клима\s+нема|klimata\s+nema|климата\s+нема|bez\s+klima|без\s+клима|klima\s+ne\s+treba|клима\s+не\s+треба|klimata\s+ne\s+treba|климата\s+не\s+треба|ne\s+treba\s+klima|не\s+треба\s+клима|nema\s+potreba\s+od\s+klima|нема\s+потреба\s+од\s+клима|klima\s+nema\s+potreba|клима\s+нема\s+потреба/i.test(u)) return { ac: false };
  // Require AC-specific context — cooling/cooling-related words only
  if (/klima|клима|inverter|инвертер|split|сплит|клима уред|klima ured/i.test(u)) return { ac: true };
  return null;
}

// ========================================
// Simple heating extraction (keyword-based, not complex follow-up)
// Detects heating type from explicit keywords in the message.
// Only fires when the full heating TYPE is mentioned ("parno gradsko",
// "centralno", "toplovod", "drva", "gas", etc.), NOT bare "parno" alone
// (which is left for the follow-up handler in service.js).
// ========================================
function extractHeating(u, data) {
  if (data.heating !== undefined && data.heating !== null) return null;

  // District/central: parno gradsko, gradsko parno, centralno, toplovod, gradsko
  if (/parno\s+gradsko|gradsko\s+parno|централно|centralno|топловод|toplovod|градско|gradsko/i.test(u)) {
    return { heating: "district", heatingType: "district" };
  }

  // Private/own: parno sopstveno, sopstveno parno, sopstveno, moe licno,
  // kotel/kotlarnica, etazno, and the "I installed it myself" family
  // ("JAS GO STAVIV", "jas sum go stavil"). Reported: the owner answered
  // "Какво парно? Градско или сопствено?" with "MOE LICNO" / "MOE" /
  // "JAS GO STAVIV" (I put it in myself = private heating) but the private
  // branch only knew sopstveno — the answer was never collected. Context
  // rules for GLOBAL discovery (this extractor runs on EVERY message):
  //   - moe/licno/nase alone are NOT enough ("toa e moe" = "that's mine" is
  //     not a heating answer) — they must be bound to parno/греење;
  //   - the staviv/stavil family REQUIRES the 1st-person prefix
  //     (jas/sum/сам/licno/лично) — a bare "GO STAVIV OGLASOT" (I posted
  //     the ad, reviewer-caught) would otherwise false-positive heating
  //     on every listing-management message. The follow-up handler in
  //     data-collection.js has the broader patterns because the "Какво
  //     парно?" question is literally being asked there.
  if (/parno\s+sopstveno|sopstveno\s+parno|сопствено\s+парно|парно\s+сопствено|sopstveno(?!\s+gradsko)|сопствено(?!\s+градско)|kotel|kotlarnica|котларница|etazno|етажно|etazhno|(?:parno|парно|greene|греење)\s+(?:moe|мое|licno|лично|nase|наше)|(?:moe|мое|licno|лично|nase|наше)\s+(?:parno|парно)|(?:jas|сам|licno|лично)(?:\s+(?:sum|сум))?\s+(?:go|го)\s+(?:staviv|ставив|stavil|ставил|postaviv|поставив|postavil|поставил)|jas\s+licno\s+go\s+stav|јас\s+лично\s+го\s+став|sopstveno\s+go\s+staviv|сопствено\s+го\s+ставив/i.test(u)) {
    return { heating: "private", heatingType: "private" };
  }

  // Electric: struja, electricno
  if (/struja|струја|електрично|electricno/i.test(u)) {
    return { heating: "electric", heatingType: "electric" };
  }

  // Wood: drva
  if (/drva|дрва/i.test(u) && !/pred|пред|pri|при/i.test(u)) {
    return { heating: "wood", heatingType: "wood" };
  }

  // Pellets: pelet, peleti
  if (/pelet|пелет|peleti|пелети/i.test(u)) {
    return { heating: "pellets", heatingType: "pellets" };
  }

  // Oil: nafta
  if (/nafta|нафта/i.test(u)) {
    return { heating: "oil", heatingType: "oil" };
  }

  // Gas: gas, priroden gas
  if (/gas|гас|priroden gas|природен гас/i.test(u)) {
    return { heating: "gas", heatingType: "gas" };
  }

  // Inverter as heating: ONLY if no higher-priority heating keyword matched.
  // Inverter AC is primarily a cooling device; only extract as heating when
  // the message has no parno/centralno/struja/drva/etc. keywords.
  if (/inverter|инвертер|split|сплит/i.test(u) &&
      !/parno|парно|struja|струја|drva|дрва|pelet|пелет|nafta|нафта|gas|гас|toplovod|топловод|centralno|централно|gradsko|градско|sopstveno|сопствено/i.test(u)) {
    return { heating: "inverter", heatingType: "inverter" };
  }

  return null;
}

function extractParking(u, data) {
  if (data.parking !== undefined && data.parking !== null) return null;
  if (/nema parking|нема паркинг|nema garaza|нема гаража|nema graza|нема граза|bez parking|без паркинг|без гаража|без граза|bez garaza|bez graza|nema parkiranje|нема паркирање|bez parkiranje|без паркирање/i.test(u)) {
    return { parking: false };
  }
  // "graza" = the common Latin-script misspelling of "гаража" (garage) —
  // "SO GRAZA ZIDANA" (with a masonry garage) must register parking=true
  // like "garaza" does (reported lead 5540516 multi-field answer).
  if (/garaza|гаража|graza|граза|privat|приват|parking|паркинг|parkiranje|паркирање|garage|гараж|podzemna|подземна|sopstveno|сопствено|pred zgrada|пред зграда|na -|на -|podzemno|подземно|ima parking|има паркинг|ima garaza|има гаража/i.test(u)) {
    let parkingType = "public";
    if (/garaza|гаража|graza|граза|garage|гараж|podzemna|подземна|podzemno|подземно|na -1|на -1|na -2|на -2|na -|на -|podzemno parking|подземно паркинг|podzemna garaza|подземна гаража|garaza na -|гаража на -/i.test(u)) {
      parkingType = "garage";
    } else if (/privat|приват|sopstveno|сопствено|pred zgrada|пред зграда|so nego|со него|so stanot|со станот|so apartmanot|со апартманот|so imotot|со имотот|kon stanot|кон станот|vo cenata|во цената|vo cena|во цена|vklucen vo cena|вклучен во цена|vklucena vo cena|вклучена во цена|vkluceno vo cena|вклучено во цена|so parking|со паркинг|so parkiranje|со паркирање/i.test(u) ||
               // RENT: "IMA I PARKING" ("there's also parking") — in a rental
               // that spot belongs to the apartment in question (the tenant's
               // private spot), NOT public street parking (reported). Same
               // "comes with the unit" semantics as "so parking" (RT3b), just
               // built with the "i" ("also") construction. Rent-gated: in a
               // SALE listing a bare "ima i parking" may describe the area,
               // so the conservative public default stays there.
               (data.transactionType === 'rent' && /ima i parking|има и паркинг|ima i parkiranje|има и паркирање/i.test(u))) {
      parkingType = "private";
    }

    // Parking/garage sold separately detection — for ANY parking type, not
    // just garage. When the owner says the parking/garage is sold separately
    // from the apartment ("posebno", "oddelno", "dodatni", "plus", "extra"),
    // the parking has its own price ON TOP of the apartment price.
    // Extract parkingSeparate=true and parkingPrice (e.g., "za dodatni sest
    // iljadi" → 6000). Common Viber patterns:
    //   "parking mestoto se prodava posebno za dodatni sest iljadi" → 6000
    //   "garaza na -2 ama ja prodavam posebno. za plus 5000"
    //   "garaza ima ama oddelno se prodava za 10000 evra"
    //   "garaza extra 8000"
    //   "garaza plus 5000"
    let parkingSeparate = null;
    let parkingPrice = null;
    if (/posebno|посебно|oddelno|одделно|oddeln|одделн|oddelen|одделен|dopolnitelno|дополнително|dodatni|дополнителни|dodatno|дополнително|plus|плус|extra|екстра|ne e vklucen|не е вклучен|ne e vkluceno|не е вклучено|ne se vkluceni|не се вклучени|ne se vklucen|не се вклучен/i.test(u)) {
      parkingSeparate = true;
      // Upgrade type: a separately-sold parking spot is a private spot,
      // not public street parking (the default when no garage keywords).
      if (parkingType === 'public') parkingType = 'private';
      // Extract price from explicit "plus/extra/posebno/za + number" pattern.
      // NO aggressive fallback (no bare \d{4,6}) — prevents grabbing cleanPrice from same message.
      const priceMatch = u.match(/(?:plus|плус|extra|екстра|posebno|посебно|oddelen|одделен|oddeln|одделн|oddelno|одделно|dodatni|дополнителни|dodatno|дополнително|za|за)\s+(\d{2,6})/i);
      if (priceMatch) {
        parkingPrice = parseInt(priceMatch[1]);
      } else {
        // Word/digit number before iljadi/evra: "za dodatni sest iljadi" → 6000.
        // Take the LAST word token before the currency keyword and parse it
        // ("dodatni sest" → "sest" → 6 → ×1000 = 6000).
        const wordPriceMatch = u.match(/(?:plus|плус|extra|екстра|posebno|посебно|oddelen|одделен|oddeln|одделн|oddelno|одделно|dodatni|дополнителни|dodatno|дополнително|za|за)\s+(\S+(?:\s+\S+){0,2})\s+(?:iljadi|илјади|evra|евра|eur|евро)/i);
        if (wordPriceMatch) {
          const tokens = wordPriceMatch[1].trim().split(/\s+/);
          const lastToken = tokens[tokens.length - 1];
          // Try direct digit parsing first ("10000 evra")
          const digitMatch = lastToken.match(/(\d{2,7})/);
          if (digitMatch) {
            parkingPrice = parseInt(digitMatch[1]);
          } else {
            // Parse Macedonian word number ("sest" in "dodatni sest iljadi")
            const parsed = parseMacedonianNumber(lastToken);
            if (parsed !== null && parsed >= 1 && parsed <= 999) {
              parkingPrice = /iljadi|илјади/i.test(wordPriceMatch[0]) ? parsed * 1000 : parsed;
            }
          }
        }
      }
    }

    const result = { parking: true, parkingType };
    if (parkingSeparate !== null) result.parkingSeparate = parkingSeparate;
    if (parkingPrice !== null) result.parkingPrice = parkingPrice;
    return result;
  }
  return null;
}

function extractOrientation(u, data) {
  if (data.orientation !== undefined && data.orientation !== null) return null;
  const orients = parseOrientation(u);
  if (orients && orients.length > 0) {
    return {
      orientation: orients.join('-'),
      orientationPrimary: orients[0],
      orientationSecondary: orients.length > 1 ? orients[1] : null
    };
  }
  return null;
}

function extractFurnished(u, data) {
  if (data.furnished !== undefined && data.furnished !== null) return null;
  // Require furniture-specific context — don't match bare "ne" (could be any question)
  // NOTE: Short patterns like "gol" or "prav" are intentionally excluded because they
  // false-match as substrings in non-furniture words (e.g., "gol" matches "golemi" = big).
  // Only specific furniture phrases are matched: "prazen/правен" (empty), "bez namestaj/без мебел"
  // (no furniture), "nenamesten/ненаместен" (unfurnished), "prazno/празно" (empty),
  // "gola sostojba/гола состојба" (bare condition), "ne e namesten/не е наместен" (not furnished).
  if (/prazen|правен|bez namestaj|без мебел|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|ne e namesten|не е наместен|sam ke si nosam|сам ќе си носам|se nosam|се носам|nisto ne ostanuva|ништо не останува|se e moe|се е мое/i.test(u)) {
    return { furnished: false, furnishedLevel: "empty" };
  }
  if (/komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|kompletno namesten|комплетно наместен|se prodava namesten|се продава наместен/i.test(u)) {
    return { furnished: true, furnishedLevel: "full" };
  }
  // Partial furnished: owner keeps some furniture or leaves some items.
  // Common phrases: "kujnata ke ostane" (kitchen stays), "del od mebel" (part of furniture),
  // "nesto ostanuva" (something remains), "drugo si nosam" (I'll take the rest),
  // "ke go ispraznam" (I'll empty it — means partial in context, owner keeps built-in).
  // These indicate the unit is partially furnished — some items stay, some don't.
  if (/kujnata\s+ke|кујната\s+ќе|kujna\s+ke|кујна\s+ќе|del\s+od|дел\s+од|nesto\s+ostanuva|нешто\s+останува|ostanuva|останува|ke\s+ostane|ќе\s+остане|ostanat|останат|drugo\s+si\s+nosam|друго\s+си\s+носам|ke\s+go\s+(ispraznam|izpraznam)|ќе\s+го\s+испразнам|ke\s+ispraznam|ќе\s+испразнам|polunamesten|полунаместен|delumno\s+namesten|делумно\s+наместен|polovina|половина|50%|ima\s+kujna|има\s+кујна|ima\s+plakari|има\s+плакари|ima\s+namestaj|има\s+мебел|namesten\s+del|наместен\s+дел|osnovna\s+kujna|основна\s+кујна/i.test(u)) {
    return { furnished: true, furnishedLevel: "partial" };
  }
  return null;
}

function extractYearBuilt(u, data) {
  if (data.yearBuilt !== undefined && data.yearBuilt !== null) return null;
  const year = parseYearBuilt(u);
  return year !== null ? { yearBuilt: year } : null;
}

function extractRenovated(u, data) {
  if (data.renovated !== undefined && data.renovated !== null) return null;
  // Require renovation-specific context — don't match bare "ne" (which could be elevator question)
  if (/ne e renoviran|не е реновиран|nema renoviran|нема реновирано|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран/i.test(u)) {
    return { renovated: false, renovationYear: null };
  }
  // TIGHT NEGATION GUARD: Check if ANY renovation keyword is directly negated by
  // a preceding "ne" or "не" (with optional pronoun like "go", "se" in between).
  // This catches patterns like "ne go renoviravme voopste" (we did NOT renovate it at all)
  // that contain renovation keywords as substrings but are explicitly negated.
  // Without this guard, bare substring matching of "renoviravme" would false-positive
  // to renovated=true. The check is TIGHT — only allows ne + [optional pronoun] + verb,
  // with NO clause separators (dali, znam, mozam, etc.) in between.
  // This intentionally does NOT catch "ne znam dali e renoviran" (uncertain, not negated).
  if (/(?:^|\s)(?:ne|не)\s+(?:(?:go|se|me|ti|ga|gi|sme|ste|e|ja|bea|sum|si|го|се|ме|ти|га|ги|сме|сте|е|ја|беа|сум|си)\s+){0,2}(?:renoviran[аоие]?|реновиран[аоие]?|renoviravme|реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|renovirale|renovirali|реновирал|реновирале|реновирали|obnoven[аоие]?|обновен[аоие]?|osvezen[аоие]?|освежен[аоие]?)/i.test(u)) {
    return { renovated: false, renovationYear: null };
  }
  // NEW-BUILD / FIRST-HAND → NOT renovated. A brand-new apartment (new
  // construction, first hand, unused) has never been renovated. Direct
  // answers to "Дали е реновиран?" like "NOV E 2025" (it's new, built 2025)
  // previously fell through to a re-ask and then the max-2-attempts skip.
  // Fully bilingual (Latin + Cyrillic) so НОВ Е / nov е / нов e / NOV E all
  // match. Letter-boundary matching (not \b — that doesn't work with Cyrillic)
  // prevents "nov" from matching inside "obnoven" (renovated).
  // NEGATION GUARD (reported): "NE E NOVOGRADBA, NO E RENOVIRAN 2019" (it's
  // NOT new construction, but it IS renovated) previously matched the bare
  // "novogradba" keyword first and wrongly returned renovated=false —
  // clobbering the owner's explicit positive answer. When any new-build
  // keyword is directly negated ("ne e X"), the whole branch is skipped so
  // the message falls through to the renovation checks below.
  const newBuildNegated = /(?:ne|не)\s+(?:e|е)\s+(?:novogradba|новоградба|novogradbena|новоградбена|novoizgraden|новоизграден|nova gradba|нова градба|novo gradba|ново градба|nov stan|нов стан|nova zgrada|нова зграда|prva raka|прва рака|neupotreben|неупотребен)/i.test(u);
  if (!newBuildNegated && /(?:^|[^a-zа-я])(?:nov|нов)\s+(?:e|е)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:nova|нова)\s+(?:e|е)(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:novo|ново)\s+(?:e|е)(?:$|[^a-zа-я])|novogradba|новоградба|novogradbena|новоградбена|(?:nova|нова)\s+(?:gradba|градба)|(?:novo|ново)\s+(?:gradba|градба)|(?:nov|нов)\s+(?:stan|стан)|(?:nova|нова)\s+(?:zgrada|зграда)|novoizgraden|новоизграден|(?:prva|прва)\s+(?:raka|рака)|neupotreben|неупотребен/i.test(u)) {
    return { renovated: false, renovationYear: null };
  }
  // Check if year is embedded — prefer year near renovation keywords
  // Also matches past-tense verb forms: renoviravme (we renovated), renoviral (he renovated)
  // First, try to find year specifically near renovation words
  const renovYearRegex = /renoviran|реновиран|renoviravme|реновиравме|go renoviravme|го реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|реновирал|obnoven|обновен|osvezen|освежен/i;
  const renovYearNear = u.match(new RegExp('(?:' + renovYearRegex.source + ').{0,20}((?:19|20)\\d{2})', 'i'));
  if (renovYearNear) {
    return { renovated: true, renovationYear: parseInt(renovYearNear[1]) };
  }
  const renovYearBefore = u.match(/((?:19|20)\d{2}).{0,20}(?:renoviran|реновиран|renoviravme|реновиравме|go renoviravme|го реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|реновирал|obnoven|обновен|osvezen|освежен)/i);
  if (renovYearBefore) {
    return { renovated: true, renovationYear: parseInt(renovYearBefore[1]) };
  }
  // "pred X godini" / "пред X години" — year-from-age pattern.
  // Runs BEFORE bare-keyword match to catch "renoviran pred 3 godini" → year=2023.
  // If this matches with a renovation keyword present, extract both renovated and year.
  // Requires "godini"/"години" context to prevent false positives like
  // "parking pred zgrada" (parking in front of building).
  if (/pred\s+\d+\s+godini|пред\s+\d+\s+години|pred\s+\d+\s+god|пред\s+\d+\s+год|pri\s+\d+\s+godini|при\s+\d+\s+години|pri\s+\d+\s+god|при\s+\d+\s+год|pred\s+\d+\s+godina|пред\s+\d+\s+година/i.test(u)) {
    // THE DIGIT MUST COME FROM THE MATCHED PHRASE, NOT THE WHOLE MESSAGE
    // (reported): the owner answers "Дали е реновиран?" with "da", then the
    // renovation-year follow-up with "pred 4 godini" (4 years ago). The
    // HISTORY-SCAN path (scanHistoryForField joins ALL owner messages) can
    // feed extractRenovated a joined string like "260 evra | pred 4 godini" —
    // the old `u.match(/\d+/)` grabbed the FIRST digit in the joined history
    // ("260" from the rent price) and computed 2026−260 = 1766 instead of
    // 2026−4 = 2022. Capture the number bound to the pred/при marker directly.
    const predMatch = u.match(/(?:pred|пред|pri|при)\s+(\d{1,3})\s+(?:godini|години|god|год|godina|година)/i);
    if (predMatch) {
      const currentYear = new Date().getFullYear();
      return { renovated: true, renovationYear: currentYear - parseInt(predMatch[1]) };
    }
    // Word-number fallback: "pred dve godini" / "пред три години" — parse
    // ONLY the phrase after the marker, never the whole message (same
    // first-digit trap for word numbers in a joined history).
    const predPhrase = u.match(/(?:pred|пред|pri|при)\s+([a-zа-я]+)\s+(?:godini|години|god|год|godina|година)/i);
    if (predPhrase) {
      const wordNum = parseMacedonianNumber(predPhrase[1]);
      if (wordNum !== null && wordNum >= 1 && wordNum <= 100) {
        const currentYear = new Date().getFullYear();
        return { renovated: true, renovationYear: currentYear - wordNum };
      }
    }
  }
  // "pred godina" (without digit) — "about a year ago" = 1 year.
  // Must have a renovation keyword in the message to prevent false positives
  // like "pred godina na prodavnicata" (before the store a year ago).
  // NOTE: Use (?:\s|$) instead of \b after the word because \b doesn't
  // work with Cyrillic characters (\w only covers ASCII).
  if (/pred\s+godina(?:\s|$)|пред\s+година(?:\s|$)/i.test(u) && /renoviran|реновиран|renoviravme|реновиравме|go renoviravme|го реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|реновирал|obnoven|обновен|osvezen|освежен|sreden|среден|nedavno|недавно|osvezhivme|освеживме/i.test(u)) {
    const currentYear = new Date().getFullYear();
    return { renovated: true, renovationYear: currentYear - 1 };
  }
  // "pred [word number] godini" — word-based years ("pred dve godini" = 2 years ago,
  // "pred tri godini" = 3 years ago). Requires a renovation keyword present.
  const godiniWordMatch = u.match(/pred\s+([а-яА-Яa-zA-Z]+)\s+godini(?!\S)|пред\s+([а-яА-Яa-zA-Z]+)\s+години(?!\S)/i);
  if (godiniWordMatch && /renoviran|реновиран|renoviravme|реновиравме|go renoviravme|го реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|реновирал|obnoven|обновен|osvezen|освежен|sreden|среден|nedavno|недавно|osvezhivme|освеживме|sredno renoviran|средно реновиран|celosno renoviran|целосно реновиран/i.test(u)) {
    const wordNum = parseMacedonianNumber(godiniWordMatch[1] || godiniWordMatch[2]);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 100) {
      const currentYear = new Date().getFullYear();
      return { renovated: true, renovationYear: currentYear - wordNum };
    }
  }
  // Renovation-specific words (no year) — just "renoviran" means yes, year unknown.
  // NOTE: "pre"/"пред" is intentionally excluded — it matches "pred zgrada" (in front
  // of the building) as a false positive. "novo"/"нов" is also excluded — "nova zgrada"
  // (new building) is not a renovation. "skoro"/"скоро" is excluded (generic "soon").
  if (/реновиран|renoviran|renoviravme|реновиравме|go renoviravme|го реновиравме|renoviraa|реновираа|renovirav|реновирав|renovira|реновира|renoviral|реновирал|обновен|obnoven|sreden|среден|kompletno renoviran|комплетно реновиран|delumno renoviran|делумно реновиран|nedavno|недавно|osvezhivme|освеживме|go osvezivme|го освеживме|izrenoviran|изреновиран|renoviran e|реновиран е|renoviran od|реновиран од|renoviran i|реновиран и|renoviran pred|реновиран пред|sredno renoviran|средно реновиран|celosno renoviran|целосно реновиран/i.test(u)) {
    return { renovated: true, renovationYear: null };
  }
  // Fallback: any year in the message — but ONLY if renovation word is present
  // (otherwise bare "2015 godina" would incorrectly set renovated=true)
  const yearMatch = u.match(/(?:19|20)\d{2}(?=[taтг\s,.;!]|$)/);
  if (yearMatch && /renoviran|реновиран|obnoven|обновен|osvezh|освеж/i.test(u)) {
    return { renovated: true, renovationYear: parseInt(yearMatch[0].substring(0, 4)) };
  }
  if (/90ti|90 ти|90-ти|90ти|деведесетти/i.test(u) && /renoviran|реновиран|obnoven|обновен/i.test(u)) {
    return { renovated: true, renovationYear: 1995 };
  }
  if (/80ti|80 ти|80-ти|80ти/i.test(u) && /renoviran|реновиран|obnoven|обновен/i.test(u)) {
    return { renovated: true, renovationYear: 1985 };
  }
  if (/2000ti|2000 ти|двеилјадити/i.test(u) && /renoviran|реновиран|obnoven|обновен/i.test(u)) {
    return { renovated: true, renovationYear: 2005 };
  }
  return null;
}

function extractRenovationYear(u, data) {
  if (data.renovationYear !== undefined && data.renovationYear !== null) return null;
  if (data.renovated === false) return null; // Already handled by extractRenovated
  if (data.renovated !== true) return null; // Don't extract if renovated status unknown
  const year = parseYearBuilt(u);
  if (year !== null) return { renovationYear: year };
  if (/pred|пред|pri|при/i.test(u)) {
    // Bound-phrase capture ONLY — same first-digit trap as extractRenovated
    // (reported): a joined history "260 evra | pred 4 godini" must use the
    // "4" bound to "pred", never the "260" from the rent price.
    const predMatch = u.match(/(?:pred|пред|pri|при)\s+(\d{1,3})\s+(?:godini|години|god|год|godina|година)/i);
    if (predMatch) {
      const currentYear = new Date().getFullYear();
      return { renovationYear: currentYear - parseInt(predMatch[1]) };
    }
    const predPhrase = u.match(/(?:pred|пред|pri|при)\s+([a-zа-я]+)\s+(?:godini|години|god|год|godina|година)/i);
    if (predPhrase) {
      const wordNum = parseMacedonianNumber(predPhrase[1]);
      if (wordNum !== null && wordNum >= 1 && wordNum <= 100) {
        const currentYear = new Date().getFullYear();
        return { renovationYear: currentYear - wordNum };
      }
    }
  }
  return null;
}

function extractDocumentationClean(u, data) {
  if (data.documentationClean !== undefined && data.documentationClean !== null) return null;

  // IMPORTANT: Run POSITIVE check FIRST — "nema hipoteka" (no mortgage) is a POSITIVE
  // documentation signal (clean docs), not a negative issue. If the negative check
  // (which matches bare "hipoteka") ran first, it would incorrectly return false.
  //
  // Never infer documentation status from bare words like "cist" (matches "cist vozduh",
  // "cista cena", etc.) or "na moe ime" (generic ownership). Only compound phrases
  // that unambiguously refer to property documentation are accepted.
  //
  // POSITIVE documentation signal — clean docs, no issues
  // IMPORTANT: Explicitly exclude patterns with "ne e" / "не е" (not) before
  // keywords like "cist imoten" — otherwise "ne e cist imoten list" (not clean
  // property deed) would false-match as positive. The negative lookbehind
  // (?<!ne e |не е ) ensures these are caught by the negative check below.
  if (/(?<!ne e |не е )(?:cist imoten list|чист имотен лист|cist imoten|чист имотен|cisto na moe ime|чисто на мое име)|cisti dokumenti|чисти документи|cista dokumentacija|чиста документација|nema hipoteka|нема хипотека|nema ostavinska|нема оставинска|nema teret|нема терет|nema zabrana|нема забрана|legalizira[nno]|легализира[нно]|legalen|легален|katastar|катастар|vlasnicki list|власнички лист|katastarski plan|катастарски план|uredna dokumentacija|уредна документација/i.test(u)) {
    return { documentationClean: true, documentationIssues: null };
  }

  // NEGATIVE documentation signal — has issues
  // Uses negative lookbehind to prevent "nema X" / "bez X" / "без X" / "nemam X"
  // from matching as negatives. "nema hipoteka" means "no mortgage" (positive),
  // but bare "hipoteka" means "there's a mortgage" (negative). IDIOM GUARD
  // (reported): bare "problem|komplikacii" also matched inside "NEMA PROBLEMI"
  // / "nema komplikacii" (no problems — a POSITIVE "docs are fine" answer) and
  // stored documentationClean=false. The lookbehind blocks those — including
  // intensifier forms ("NEMA NIKAKVI PROBLEMI", "nema vekje problemi") and the
  // "ne e problem" idiom (the photos handler and acceptance classifier already
  // treat "ne e problem" as positive). Past-tense positives are guarded too:
  // "NE SUM IMAL PROBLEMI" / "не сум имал проблеми" (I've never had problems)
  // is a positive answer, not a docs issue — without the guard it set
  // documentationClean=false. The positive answer is caught by the
  // field-specific bare-yes map when the documentation question is current.
  if (/(?<!nema |нема |bez |без )hipoteka|(?<!nema |нема |bez |без )хипотека|(?<!nema |нема |bez |без )ostavinska|(?<!nema |нема |bez |без )оставинска|razvod|развод|sudski|судски|(?<!nema |нема |bez |без |nemam |немам |nikakvi |никакви |absolutno |апсолутно |vekje |веќе |voopsto |воопшто |stvarno |стварно |ne e |не е |ne sum imal |не сум имал |ne bev imal |не бев имал )problem|(?<!nema |нема |bez |без |nemam |немам |nikakvi |никакви |absolutno |апсолутно |vekje |веќе |voopsto |воопшто |stvarno |стварно |ne e |не е |ne sum imal |не сум имал |ne bev imal |не бев имал )проблем|ne e cist|не е чист|ne e cista|не е чиста|(?<!nema |нема |bez |без |nemam |немам |nikakvi |никакви |absolutno |апсолутно |vekje |веќе |voopsto |воопшто |stvarno |стварно |ne e |не е |ne sum imal |не сум имал |ne bev imal |не бев имал )komplikacii|(?<!nema |нема |bez |без |nemam |немам |nikakvi |никакви |absolutno |апсолутно |vekje |веќе |voopsto |воопшто |stvarno |стварно |ne e |не е |ne sum imal |не сум имал |ne bev imal |не бев имал )компликации|(?<!nema |нема |bez |без )teret|(?<!nema |нема |bez |без )терет|(?<!nema |нема |bez |без )zabrana|(?<!nema |нема |bez |без )забрана|zalozen|заложен|imam hipoteka|имам хипотека|ima hipoteka|има хипотека|ima problem|има проблем|ima teret|има терет|ima zabrana|има забрана|ne e cist imoten list|не е чист имотен лист|ne e legalizirano|не е легализирано|spor|спор|ne e sredeno|не е средено/i.test(u)) {
    let docsIssue = "other";
    if (/hipoteka|хипотека/i.test(u)) docsIssue = "hipoteka";
    else if (/ostavinska|оставинска/i.test(u)) docsIssue = "ostavinska";
    else if (/razvod|развод/i.test(u)) docsIssue = "razvod";
    else if (/teret|терет|zabrana|забрана|zalozen|заложен/i.test(u)) docsIssue = "teret";
    return { documentationClean: false, documentationIssues: docsIssue };
  }
  return null;
}

// ========================================
// EXTRACTION RULES REGISTRY
// Order matters: run simpler fields first
// to avoid cross-field interference.
// ========================================
const EXTRACTION_RULES = [
  extractCleanPrice,
  extractPricePerSqmField,
  extractMonthlyRent,
  extractTenantPrefs,
  extractPetsAllowed,
  extractAvailableFrom,
  extractTotalSqm,
  extractBedrooms,
  extractCompoundFloor,  // Standalone — NOT in NUMBER_SNIFFING so it runs even for bare numbers
  extractFloor,
  extractTotalFloors,
  extractElevator,
  extractAC,
  extractHeating,
  extractParking,
  extractOrientation,
  extractFurnished,
  extractYearBuilt,
  extractRenovated,
  extractRenovationYear,
  extractTerrace,
  extractDocumentationClean
];

// ========================================
// CONFIDENCE ASSESSMENT
// ========================================
// Returns 'HIGH' | 'MEDIUM' | 'LOW' for an extracted value
// based on the input message and the target field.
//
// HIGH = explicit keyword match ("65 m2", "3 kat", "ima lift")
// MEDIUM = uncertainty words present ("mislam okolu 65") OR bare number with partial context
// LOW = unreliable / no context (discarded entirely)
// ========================================

// Words that indicate uncertain answers
const UNCERTAINTY_WORDS = /mislam|okolu|околу|приближно|otprilika|отприлика|mozda|можеби|можда|negde|негде|valjda|ваљда|priblizno|приблизно|neshto vaka|нешто вака|tocno ne|точно не|ne znam|не знам|neznam|треба да|treba da|posle|после/i;

// FRUSTRATED-REPEAT STRIP — "7 TI KAZAV" ("7, I told you"), "SEDUM TI
// REKOV", "TI KAZAV 350" ("I told you, 350") — the owner repeats the answer
// with an annoyance suffix/prefix because Ana re-asked. Shared by
// extractTotalFloors, extractTotalSqm (so the bare-number fallbacks fire),
// and assessConfidence (so the repeat collects at HIGH, no needless re-ask).
// Covers BOTH word orders: the marker may follow the number ("350 TI KAZAV")
// or precede it ("TI KAZAV 350" — the exact reported price phrasing).
// Punctuation tolerance: "350, TI KAZAV!", "TI KAZAV - 350" all strip to the
// bare number. IMPORTANT: only the MARKER PHRASE is stripped — a number (or
// "na vtori") that follows it is deliberately LEFT in place, so phrase-first
// repeats keep their value and the floor repeat "TI KAZAV NA VTORI" still
// resolves the ordinal.
const ANNOYED_REPEAT_RE = /(?:^|[\s.,:;!?\-]+)(?:ti\s+|ти\s+)?(?:kazav|кажав|rekov|реков)(?![a-zа-я])/gi;

// DECADE-YEAR PATTERNS — the same decade forms parseYearBuilt maps to a
// memorized year (90ti → 1995, 80ti → 1985, 2000ti → 2005, 1980-ти → 1980;
// value mapping lives in property-extractor.js parseYearBuilt — KEEP IN
// SYNC). "90TI E ZGRADATA TOCNO NEZNAM" (it's from the 90s, I don't know
// exactly) means the owner only knows the DECADE — the extracted year is
// already the memorized approximation, so it must NOT be re-confirmed.
// The DIGIT forms are LETTER-BOUNDED (unlike parseYearBuilt's bare
// substrings) so a price like "50-iljadi evra" (contains "50-i") can never
// count as a decade — without the boundary, parseYearBuilt's own "50-i"
// quirk maps it to 1955 AND the confidence boost would skip the confirmation
// net. Exact 2-digit years ("92") and exact 4-digit years ("1990", "2015ti")
// are NOT decade answers — only "-ti/-ta" decade forms, decade words, and
// 19XX/20XX + ти/та references ("1980-ти" = the 1980s).
const DECADE_YEAR_RE = /(?:^|[^a-zа-я\d])(?:19|20)\d{2}\s*[- ]?(?:ti|ти|ta|та)(?:te|те)?(?:$|[^a-zа-я])|(?:^|[^a-zа-я\d])(?:2000|90|80|70|60|50)(?:\s*[- ]?)(?:ti|ти|i|ta|та)(?:te|те)?(?:$|[^a-zа-я])|деведесетти|деведесети|девеесетти|девеесети|деведесетта|деведесета|девеесета|осумдесетти|осумдесети|осумдесетта|осумдесета|осамдесетти|осамдесети|осамдесетта|осамдесета|седумдесетти|седумдесети|седумдесетта|седумдесета|шеесетти|шеесети|шеесетта|шеесета|педесетти|педесети|педесетта|педесета|пеесетти|пеесети|пеесетта|пеесета|двеилјадити|двеилјадита|deveesetti|deveeseti|devedesetti|devedeseti|deveesetta|deveeseta|devedesetta|devedeseta|osumdesetti|osumdeseti|osumdesetta|osumdeseta|osamdesetti|osamdeseti|osamdesetta|osamdeseta|sedumdesetti|sedumdeseti|sedumdesetta|sedumdeseta|seesetti|seeseti|seesetta|seeseta|pedesetti|pedeseti|pedesetta|pedeseta|peesetti|peeseti|peesetta|peeseta|(?:^|[^a-zа-я])(?:deveeset|девеесет|деведесет|devedeset|osemdeset|осумдесет|osumdeset|osamdeset|осамдесет|sedumdeset|седумдесет)(?:$|[^a-zа-я])/i;

// Required context keywords per field for HIGH confidence
// If these keywords are present in the message AND the value was extracted,
// confidence is HIGH. Otherwise MEDIUM (or LOW for binary fields with no context).
const FIELD_CONFIDENCE_KEYWORDS = {
  'cleanPrice': /iljadi|илјади|evra|евра|eur|evro|евро|cena|цена|baren|барам|sakam|сакам|za mene|за мене/i,
  'totalSqm': /m2|м2|kvadrati|квадрати|kv|кв|sqm|kvadrata|квадрата/i,
  'bedrooms': /spaln|спалн|detsk|детск|soba|соба|sobi|соби|gostinsk|гостинск|soben|собен|golem|голем|mala|мала/i,
  'floor': /kat|кат|sprat|спрат|potkrovje|поткровје|prizemje|приземје|floor|етаж|etazh/i,
  'totalFloors': /katnica|катница|kata|ката|sprata|спрата|kati|кати|eta|ета|sprat|спрат|zgradata|зградата|vkupno|вкупно/i,
  'yearBuilt': /izgraden|граден|godina|година|gradba|градба|graden|граден|izgradba|изградба|zavrshen|завршен|star|стар/i,
  // RENT-VERB KEYWORDS: "go izdavam za 350 evra" (I rent it for 350€) is a
  // CLEAR direct answer to the monthlyRent question, but the old pattern only
  // matched kirija/mesecno — so a message with the rent verb (but no "kirija"
  // word) got MEDIUM (0.60) and triggered an unnecessary confirmation re-ask.
  // izdavam/iznajmuvam/pod kirija are unambiguous rent verbs — HIGH.
  // CURRENCY/UTILITIES (reported): "350 evra + reziski trosoci" (350€ + utility
  // bills) is the plainest possible direct answer — but "evra" was only in the
  // cleanPrice keyword list, so the message scored MEDIUM (0.60) and the owner
  // got asked "Дали точната вредност е 350?" despite having answered clearly.
  // evra/евра/evro/евро/eur (currency) and reziski/режиски (utilities — a
  // rent-specific term) are unambiguous rent markers. Safe because
  // extractMonthlyRent only fires when transactionType==='rent' — the sale
  // price keeps its own currency keywords on cleanPrice. A bare "350" (no
  // currency word) still scores MEDIUM → confirmation re-ask (unchanged).
  'monthlyRent': /kirija|кирија|mesecno|месечно|izdavam|издавам|izdava|издава|iznajmuvam|изнајмувам|iznajmuva|изнајмува|pod kirija|под кирија|evra|евра|evro|евро|eur|reziski|режиски/i,
  // AVAILABLE-FROM DATE — month names, day markers, immediate words, and the
  // RELATIVE-DATE vocabulary are unambiguous date answers to "Од кога ќе биде
  // слободен?". RELATIVE FORMS (reported): "ZA DVA DENA" (in 2 days), "za dve
  // nedeli", "za mesec dena", "od utre", "zadutre", "sloboden momentalno",
  // "za brzo" — parseAvailableFromDate computes the date, but these words were
  // missing here so the parsed value scored LOW and was DISCARDED → Ana
  // re-asked until the skip ("date NOT collected" through 4 attempts).
  // The parser only fires on real date context (od/од + number, a month word,
  // immediate vocabulary, or a relative day count), so a HIGH here can't be a
  // false positive from unrelated numbers (sqm, price, floor). The singular
  // "den"/"ден" is boundary-guarded (standalone token) so it never matches
  // inside unrelated words ("sloboden", "ograden") — the plural day forms and
  // all other stems are unambiguous.
  'availableFrom': /januar|јануар|fevruar|февруар|mart|март|april|април|maj|мај|juni|јуни|juli|јули|avgust|август|septemvri|септември|oktomvri|октомври|noemvri|ноември|dekemvri|декември|odma|одма|sega|сега|vednash|веднаш|sledniot|следниот|slednata|следната|sledna|следна|mesec|месец|meseca|месеца|od \d|од \d|dena|дена|denovi|денови|(?:^|[^a-zа-я])(?:den|ден)(?:$|[^a-zа-я])|nedel|недел|nedela|недела|nedeli|недели|utre|утре|zadutre|задутре|prekosutra|прекосутра|momentalno|моментално|momentno|моментно|instant|инстант|brzo|брзо|sloboden|слободен|dostapen|достапен|godina|година|ke bide|ќе биде|denes|денес/i,
  'orientation': /orientacija|ориентација|strana|страна|jug|север|istok|запад|zapad|sever|jugoistok|jugozapad|severoistok|severozapad|исток|југ|североисток|северозапад|југоисток|југозапад|pravec|правец/i,
  'terraceSqm': /terasa|тераса|teras|терас|тераси|terrace|m2|м2|kvadrati|квадрати/i,
  // TENANT PREFERENCES — tenant-profile vocabulary is unambiguous: the
  // extractor only fires on a matched category, so any extraction is a
  // direct answer to "Каков тип на станари преферирате?" → HIGH.
  // Extended (reported): children/elders/gender restrictions — deca, starci,
  // zeni/zenski, mazi/mashki — plus the "samo za" restrictive marker.
  'tenantPreferences': /stanari|станари|zakupci|закупци|klienti|клиенти|milenici|миленици|semejst|семејст|studenti|студенти|vraboten|вработен|samohran|самохран|penzioner|пензионер|stranci|странци|samci|самци|pensioner|пенсионер|deca|деца|starci|старци|zeni|жени|zenski|женски|zenska|женска|mazi|мажи|mashki|машки|mashka|машка|turci|турци|turski|турски|albanci|албанци|albanski|албански|muslimani|муслимани|musliman|муслиман|makedonci|македонци|makedonski|македонски|samo\s+za|само\s+за/i,
  // PETS ALLOWED — pet vocabulary is unambiguous: the dedicated extractor
  // only fires on allow/deny phrases WITH pet words, so any extraction is a
  // direct answer to "Дали се дозволени миленици?" → HIGH.
  'petsAllowed': /milenici|миленици|kucinja|кучиња|kuche|куче|macka|мачка|zivotni|животни|zivotno|животно|pets|dozvolen|дозволен|zabranet|забранет/i,
  // PRICE PER M² — "e/е za m2" phrasings are an explicit per-sqm answer.
  'pricePerSqm': /m2|м2|kvadrat|квадрат|kvadrata|квадрата/i
};

// Binary fields that require explicit keyword match for HIGH confidence
const BINARY_CONFIDENCE_FIELDS = new Set([
  'elevator', 'ac', 'parking', 'furnished', 'documentationClean', 'renovated', 'heating', 'petsAllowed'
]);

// Derived sub-keys from multi-field extractors (e.g., furnishedLevel from extractFurnished).
// These are always side-effects of their parent field extraction and should inherit HIGH.
const DERIVED_SUBKEYS = new Set([
  'furnishedLevel', 'parkingType', 'orientationPrimary', 'orientationSecondary',
  'documentationIssues', 'heatingType', 'heating',
  'parkingSeparate', 'parkingPrice'
]);

function assessConfidence(field, value, input) {
  // DECADE-YEAR ANSWERS ("90TI", "80TI", "осумдесетти") are inherently
  // APPROXIMATE — the owner is telling us the decade, not the exact year, and
  // the extractor maps it to a memorized mid-decade year (90ti → 1995). The
  // message usually ALSO contains an uncertainty word ("90ti e zgradata tocno
  // neznam"), but that uncertainty is about the EXACT year, which the decade
  // answer already concedes — re-asking "Дали точната вредност е 1995?" is
  // redundant (reported). Must run BEFORE the uncertainty downgrade below.
  if ((field === 'yearBuilt' || field === 'renovationYear') && DECADE_YEAR_RE.test(input)) {
    return 'HIGH';
  }

  const hasUncertainty = UNCERTAINTY_WORDS.test(input);
  if (hasUncertainty) {
    return 'MEDIUM';
  }

  // Derived sub-keys (furnishedLevel, parkingType, etc.) are side-effects of
  // their parent extractor. If they reached this point, the parent already
  // verified the context — HIGH.
  if (DERIVED_SUBKEYS.has(field)) {
    return 'HIGH';
  }

  // Binary fields (elevator, ac, parking, furnished, renovated, documentationClean, heating)
  // have dedicated extractors with their own context guards (e.g., extractElevator requires
  // "lift" or "лифт"). If the extractor returned a value, the context was verified — HIGH.
  if (typeof value === 'boolean' || BINARY_CONFIDENCE_FIELDS.has(field)) {
    return 'HIGH';
  }

  // Special: year-like numbers (1900-2030) for yearBuilt or renovationYear.
  // A 4-digit number in this range is almost certainly a year, even without
  // keyword context like "godina" or "izgraden".
  if ((field === 'yearBuilt' || field === 'renovationYear') &&
      typeof value === 'number' && value >= 1900 && value <= 2030) {
    return 'HIGH';
  }

  // BARE DIRECT ANSWERS for floor, totalFloors, totalSqm & bedrooms are
  // HIGH — the owner is directly answering the question just asked:
  //   - ORDINAL FLOOR WORDS ("vtori", "na vtori", "tret sprat", "osmi") — a
  //     bare ordinal can only be a floor value. Fixes reported bug:
  //     "TI KAZAV NA VTORI" was REJECTED as context mismatch and the floor
  //     question looped forever (→ owner insulted Ana).
  //   - BARE CARDINAL WORDS ("SEDUM" = 7, "deset" = 10, "TRI" = 3) — a single
  //     number word answering "Колку спрата има вкупно?" or "Колку спални
  //     соби има станот?" is unambiguous.
  //   - BARE DIGITS ("7", "3") — same, in the question context.
  //   - BARE SQM DIGITS ("86") — a 2-3 digit number can only be a totalSqm
  //     answer to "Колкава е вкупната квадратура?".
  //   - FRUSTRATED REPEATS ("7 TI KAZAV" = "7, I told you") — the owner
  //     repeats the answer after a re-ask; the suffix is stripped (mirrors
  //     extractTotalFloors' strip) so the repeat collects at HIGH on the
  //     FIRST attempt, no needless "Дали точната вредност е 7?" re-ask
  //     (reported: "SEDUM" extracted at 0.60 → re-ask → "DA" accepted).
  //   - BEDROOMS (reported, lead 3571074): "TRI" answering "Колку спални
  //     соби има станот?" used to score MEDIUM (0.60) → needless
  //     "Дали точната вредност е 3?" re-ask → the owner repeated "TRI" →
  //     the word repeat wasn't recognized (digit-only matcher) → re-pended →
  //     infinite loop. A bare bedroom count (digit 0-20 or number word 1-20)
  //     is a direct answer to the just-asked question — HIGH, no re-ask.
  if (field === 'floor' || field === 'totalFloors' || field === 'totalSqm' || field === 'bedrooms') {
    const stripped = input.trim().replace(ANNOYED_REPEAT_RE, ' ').replace(/[.,:;!?\-]+$/, '').trim();
    if (parseOrdinalFloor(stripped) !== null) return 'HIGH';
    // VIBER ORDINAL-SUFFIX SHORTHAND (reported, lead pz186272900): "5TI",
    // "13TI", "7MI" — digit + ordinal suffix — is a direct FLOOR answer, HIGH
    // like a bare word ordinal ("NA 5TI" too, mirroring the "NA VTORI"
    // ordinal rule). Deliberately floor-only: a suffixed ordinal is never a
    // bedroom count, sqm value, or total floor count (extractTotalFloors
    // never produces one, so a totalFloors HIGH would be dead code). The
    // helper is anchored (whole-message), so a leading "na"/"на" is
    // stripped first — exactly the standard answer shape for both.
    const viberStripped = stripped.replace(/^(?:na|на)\s+/i, '');
    if (field === 'floor' && parseViberOrdinalSuffix(viberStripped) !== null) return 'HIGH';
    // Bare digit: 0-50 for floor/totalFloors (0 = приземје for floor),
    // 0-20 for bedrooms (a bare digit answering the bedroom question),
    // 10-999 for totalSqm (a 1-digit number is never a sqm value).
    // Effectively inert for the floor FIELD itself (extractFloor requires
    // kat/sprat context and never extracts bare digits — only
    // extractTotalFloors' bare fallback does), but harmless and needed for
    // totalFloors direct answers ("7") and totalSqm repeats ("86 TI KAZAV").
    if (/^\d{1,3}$/.test(stripped)) {
      const n = parseInt(stripped, 10);
      if ((field === 'totalSqm' && n >= 10 && n <= 999) ||
          (field === 'bedrooms' && n >= 0 && n <= 20) ||
          (field !== 'totalSqm' && field !== 'bedrooms' && n >= 0 && n <= 50)) return 'HIGH';
    }
    // PLUS-ARITHMETIC DIRECT ANSWER (reported, lead 3571074): "EDNA PLUS
    // DVE" (one plus two = 3) answering "Колку спални соби има станот?" is
    // a direct multi-word answer — HIGH, no re-ask. Same extractor-
    // consistency rule as the single-word branch: countBedrooms (which now
    // sums plus-phrases) is the single source of truth, so HIGH fires only
    // on a value extraction would produce.
    if (field === 'bedrooms' && /\s*(?:plus|плус|\+)\s*/i.test(stripped)) {
      const bcPlus = countBedrooms(stripped);
      if (bcPlus !== null && bcPlus >= 1 && bcPlus <= 20) return 'HIGH';
    }
    if (!/\s/.test(stripped) && stripped.length > 0) {
      const w = parseMacedonianNumber(stripped);
      // Bedrooms are capped at 20 (mirrors extractBedrooms' range): a bare
      // word like "triest" (30) is NOT a bedroom count, so it must not be
      // HIGH for bedrooms (falls through to the MEDIUM number-word fallback).
      // The branch is EXCLUSIVE — the generic 1-50 line below must not fire
      // for bedrooms.
      if (field === 'bedrooms') {
        // EXACT-EXTRACTOR CONSISTENCY: validate against countBedrooms — the
        // very function extractBedrooms uses — not parseMacedonianNumber.
        // parseMacedonianNumber's includes-matching misreads merged tens
        // ("trideset"→10, "dvadeset"→10), so judging HIGH on it could
        // silently accept a value the extractor would never produce.
        // countBedrooms is the single source of truth: HIGH fires iff
        // extraction would extract the same value (verified: "TRI"→3 HIGH,
        // "triest"→null not HIGH).
        const bc = countBedrooms(stripped);
        if (bc !== null && bc >= 1 && bc <= 20) return 'HIGH';
      } else {
        if (w !== null && w >= 1 && w <= 50) return 'HIGH';
      }
      if (field === 'totalSqm' && w !== null && w >= 10 && w <= 999) return 'HIGH';
    }
    // Multi-word number phrases ("OSUMDESET I SEST" = 86) parse only via
    // parseNumberWords — parseMacedonianNumber is single-word only.
    if (field === 'totalSqm') {
      const wn = parseNumberWords(stripped);
      if (wn !== null && wn >= 10 && wn <= 999) return 'HIGH';
    }
  }
  // PRICE REPEATS ("350 TI KAZAV", "TI KAZAV 350" = "350, I told you") — the
  // owner repeats a price they ALREADY gave, annoyed that Ana re-asked. The
  // strip must FIRE (the message must contain an annoyed-repeat marker); a
  // plain bare "350" with NO marker stays MEDIUM below (RT3d4 — confirmation
  // re-ask preserved for genuinely new prices). This kills the reported
  // "TI KAZAV 350 → 0.60 → re-ask → DA" price loop, mirroring the
  // floor/totalFloors repeat fix.
  if (field === 'cleanPrice' || field === 'monthlyRent') {
    const strippedPrice = input.trim().replace(ANNOYED_REPEAT_RE, ' ').replace(/[.,:;!?\-]+$/, '').trim();
    if (strippedPrice !== input.trim() && strippedPrice.length > 0) {
      const barePriceDigit = strippedPrice.match(/^(\d{1,7})$/);
      if (barePriceDigit) {
        const p = parseInt(barePriceDigit[1], 10);
        if (p >= 10) return 'HIGH';
      } else if (!/\s/.test(strippedPrice)) {
        const w = parseMacedonianNumber(strippedPrice);
        if (w !== null && w >= 10) return 'HIGH';
      }
    }
  }

  // Check field-specific keywords for numeric/string fields
  const keywordRegex = FIELD_CONFIDENCE_KEYWORDS[field];
  if (keywordRegex && keywordRegex.test(input)) {
    return 'HIGH';
  }

  // Compound floor patterns ("na 6 od 12", "osmi od deset", "8/10") are
  // extracted by a highly-specific regex (extractCompoundFloor). Even though
  // the message may lack "kat"/"sprat" keywords, the compound structure
  // (digit/bare "od" digit/bare, ordinal "od" word, digit/bare "/" digit/bare)
  // uniquely identifies it as a floor answer. No confirmation needed.
  const hasCompoundFloor = /\d{1,2}\s+(?:od|од)\s+\d{1,3}|[a-zа-я\d]+\s+(?:od|од)\s+[a-zа-я\d]+|\d{1,2}\s*\/\s*\d{1,2}/i.test(input);
  if (hasCompoundFloor && (field === 'floor' || field === 'totalFloors')) {
    return 'HIGH';
  }

  // Numeric-or-string field without uncertainty but also without strong
  // field-specific keywords — might be a volunteered bare number.
  // Example: "pedeset" without "kvadrati" → MEDIUM, not LOW.
  // User might be answering the current question with a word number.
  // COMPRESSED HUNDRED FORMS (reported): "CETRSTOPEESET" (четирсто пеесет
  // = 450) drops the vowels of "четиристотини", so "cetiri" (which scores
  // "cetiristotini" as MEDIUM) never matches — the bare word price scored
  // LOW and the monthlyRent was skipped after the 2-attempt cap. The
  // compressed hundred roots (cetrsto/четирсто, petsto, seststo, ...) must
  // score MEDIUM exactly like their full -tini forms, keeping the
  // confirmation re-ask net ("Дали точната вредност е 450?").
  const hasDigits = /\d+/.test(input);
  if (hasDigits || /jedn|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset|stoti|илjadi|cetrsto|четирсто|cetirsto|cetiristo|chetiristo|четиристо|petsto|петсто|seststo|шестсто|sedumsto|седумсто|osumsto|осумсто|devetsto|деветсто|tristo|тристо|dvesto|двесто/i.test(input)) {
    return 'MEDIUM';
  }

  // String value (orientation, heating, etc.) without keyword context → LOW
  return 'LOW';
}

// ========================================
// Terrace extraction (simple context-based, not complex follow-up)
// ========================================
function extractTerrace(u, data) {
  // Skip if already set
  if (data.hasTerrace !== undefined && data.hasTerrace !== null) return null;
  if (data.terraceSqm !== undefined && data.terraceSqm !== null) return null;
  // Require terrace-specific context
  // Uses |teras|терас to match ALL inflected forms (terasa, terasi, terase, terasata, etc.)
  if (!/terasa|тераса|terrace|teras|терас/i.test(u)) return null;

  // PRIORITY 1: Bare number RIGHT AFTER terrace word (no "m2/kvadrati" suffix needed).
  // Handles "terasa 4", "terasa od 4", "terasa so 4", "terasi 5" — VERY common in Viber
  // messages where the user doesn't add units for the terrace size.
  // The number nearest to "terasa"/"terasi" is almost certainly the terrace size.
  // This runs BEFORE terraceBefore to prevent the regex from matching "68 kvadrati"
  // (the totalSqm) when the terrace size is a bare number right after "terasa".
  const terraceBare = u.match(/(?:terasa|тераса|teras|терас)(?:\s+(?:od|so|од|со))?\s+(\d{1,4})(?:\s|$)/i);
  if (terraceBare) {
    const num = parseInt(terraceBare[1]);
    if (num >= 1 && num <= 500) return { hasTerrace: true, terraceSqm: num };
  }
  // Try word number after terrace: "terasa so cetiri" → 4, "terasa od tri" → 3
  const terraceWordBare = u.match(/(?:terasa|тераса|teras|терас)(?:\s+(?:od|so|од|со))?\s+(\S+)\s*$/i);
  if (terraceWordBare) {
    const wordNum = parseMacedonianNumber(terraceWordBare[1]);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 500) {
      return { hasTerrace: true, terraceSqm: wordNum };
    }
  }

  // PRIORITY 2: Number AFTER terrace with units: "terasa od 3 m2", "terasa 4 m2"
  // Uses non-capturing group (?:terasa|тераса) to scope alternation properly
  const terraceMatch = u.match(/(?:terasa|тераса|teras|терас).{0,20}?(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв|sqm)/i);
  if (terraceMatch) {
    const num = parseInt(terraceMatch[1]);
    if (num >= 1 && num <= 500) return { hasTerrace: true, terraceSqm: num };
  }

  // PRIORITY 3: Number BEFORE terrace: "3 m2 terasa"
  // Uses (?:terasa|тераса) to scope alternation. Note: this can falsely match
  // "68 kvadrati ... terasa" where 68 is the totalSqm, not the terrace size.
  // Priority 1 (terraceBare) and Priority 2 (terraceMatch) handle the common
  // cases where the terrace number is AFTER "terasa", so this fallback only
  // fires for the "3 m2 terasa" word order.
  const terraceBefore = u.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв|sqm).{0,20}?(?:terasa|тераса|teras|терас)/i);
  if (terraceBefore) {
    const num = parseInt(terraceBefore[1]);
    if (num >= 1 && num <= 500) return { hasTerrace: true, terraceSqm: num };
  }

  return null; // No number near terrace — leave follow-up to service.js
}

// Map from workflow field name to dedicated extractor function.
// Used by runGlobalExtraction's preferredField logic to extract
// the CURRENT question's field FIRST before global extraction.
// Fields without a dedicated extractor (terraceSqm, heating, photos,
// ownerName, address) are handled by complex stateful handlers in
// service.js and are not included here.
const FIELD_TO_EXTRACTOR = {
  cleanPrice: extractCleanPrice,
  pricePerSqm: extractPricePerSqmField,
  monthlyRent: extractMonthlyRent,
  tenantPreferences: extractTenantPrefs,
  petsAllowed: extractPetsAllowed,
  availableFrom: extractAvailableFrom,
  totalSqm: extractTotalSqm,
  bedrooms: extractBedrooms,
  floor: extractFloor,
  totalFloors: extractTotalFloors,
  elevator: extractElevator,
  ac: extractAC,
  heating: extractHeating,
  parking: extractParking,
  orientation: extractOrientation,
  furnished: extractFurnished,
  yearBuilt: extractYearBuilt,
  renovated: extractRenovated,
  renovationYear: extractRenovationYear,
  documentationClean: extractDocumentationClean
};

// ========================================
// Field groups for targeted extraction.
// When preferredField is in a group, ONLY extractors in that group run.
// Fields not in any group are standalone — only their extractor runs.
// This prevents yearBuilt from grabbing "10" when nextField=totalFloors.
// ========================================
const FIELD_GROUPS = {
  'floor': ['floor', 'totalFloors'],
  'totalFloors': ['floor', 'totalFloors'],
};

function getGroupFields(field) {
  return FIELD_GROUPS[field] || [field];
}

// Extractors that can accidentally pick up price words (iljadi/evra) as
// floor/bedroom/totalFloors values. These are skipped when a price was
// extracted from the same message to prevent cross-field contamination.
const PRICE_SENSITIVE_EXTRACTORS = new Set([
  'extractFloor',
  'extractBedrooms',
  'extractTotalFloors'
]);

// Year-sniffing extractors that use parseYearBuilt's 2-digit fallback.
// These should NOT run on bare numbers like "10" → 2010.
// When isBareNumber is true, these extractors are skipped.
// extractRenovationYear is NOT included because it requires
// renovated=true as precondition — it can't fire on bare numbers
// in fresh sessions anyway.
const YEAR_SNIFFING_EXTRACTORS = new Set([
  'extractYearBuilt'
]);

// Number-sniffing extractors that use parseMacedonianNumber or extractFirstNumber
// as bare-number fallbacks. When the message has NO strong field-specific keywords
// (e.g., just "pet mislam" — bare number words), these extractors should only run
// if they're matching the CURRENT field being asked (preferredField), to prevent
// a single bare number from populating bedrooms + floor + totalSqm simultaneously.
//
// extractFloor IS included despite its context-specific early paths (potkrovje,
// ordinal, digit+kat) because those paths are protected by hasStrongKeywords —
// "potkrovje" and "prv", "vtor", "tret" are all in the strong keywords regex.
const NUMBER_SNIFFING_EXTRACTORS = new Set([
  'extractBedrooms',
  'extractFloor',
  'extractTotalSqm',
  'extractTotalFloors'  // Added: bare number fallback (needs preferredField guard)
]);

// ========================================
// BARE YES/NO ANSWER MAPPING
// The dedicated extractors require keyword context (extractRenovated needs
// "renoviran", extractElevator needs "lift") — correct for global discovery,
// but a DIRECT bare answer to the current question is also valid: when Ana
// asks "Дали е реновиран?" and the owner replies "NE E" (or "da"), that IS
// the answer. Only the preferredField path maps these bare answers; global
// discovery mode never does (a bare "ne" could be answering anything, e.g.
// rejecting cooperation). Reported bug: "NE E" to the renovation re-ask was
// ignored → max-2-attempts skip → renovationYear wrongly asked next.
// ========================================
const BARE_YES_NO_FIELDS = new Set(['renovated', 'elevator', 'ac', 'parking', 'furnished', 'documentationClean', 'petsAllowed']);
// Whole-message anchors — a message with ANY extra content ("ne, 55 kvadrati")
// or property keywords must NOT be treated as a bare yes/no.
// 1st-person possession forms ("imam", "имам" = I have, "go imam" = I have
// it) are affirmative answers to ANY binary question ("Дали имате чист
// имотен лист?" → "IMAM"; "Дали има лифт?" → "go imam"...). Reported:
// "IMAM NA MOE IME" (I have the deed in my name) was NOT memorized and the
// documentation question was re-asked until max-2-attempts SKIP.
const BARE_YES_RE = /^(?:da|да|ima|има|imam|имам|go imam|го имам|ja imam|ја имам|ok|ок|okej|океј|moze|може|tocno|точно|sekako|секако|naravno|наравно|normalno|нормално|da ima|да има|ima da|има да)$/i;
// 1st-person negation forms ("nemam", "немам" = I don't have) are the
// negative mirror of "imam" — answering "Дали имате чист имотен лист?"
// with "NEMAM" must be memorized as documentationClean=false, not re-asked
// into a max-2-attempts SKIP (mirror of the reported "IMAM" bug).
const BARE_NO_RE = /^(?:ne|не|nema|нема|nemam|немам|bez|без|go nemam|го немам|ja nemam|ја немам|ne e|не е|nema e|нема е|ne e tocno|не е точно)$/i;

// FIELD-SPECIFIC BARE-YES IDIOMS. The global extractor deliberately refuses
// bare "cist"/"cisto" (matches "cist vozduh" = clean air, "cista cena" = net
// price — never documentation), so a DIRECT answer to the CURRENT question
// like "SE E CISTO" / "CISTO E" (it's all clean) in reply to "Дали имате
// чист имотен лист?" needs its own anchored mapping. Only fires in the
// preferredField path (the documentation question is literally being asked),
// never in global discovery — the whole-message anchor keeps it safe. The// negative side needs no map: "ne e cisto" is already caught by the
  // extractor's negative branch (substring "ne e cist"). Reported: "SE E
  // CISTO" was not registered as positive → documentationClean re-asked with
  // confirmatory phrasing (attempt 2) despite a clear direct answer.
  // OWNERSHIP/POSSESSION ANSWERS (reported): "IMAM NA MOE IME" (I have the
  // deed in my name) and "TI REKOV DEKA IMAM" (I told you I have it) are
  // clear positives to "Дали имате чист имотен лист?", but the global
  // extractor deliberately refuses bare "na moe ime" (generic ownership —
  // could be answering a name/address question) and bare "imam". When the
  // documentation question is CURRENT, these ownership assertions are the
  // answer → documentationClean=true.
  const BARE_YES_FIELD_RE = {
  documentationClean: /^(?:se e cisto|се е чисто|cisto e|чисто е|cista e|чиста е|se e cist|се е чист|cist e|чист е|cisto|чисто|sve e cisto|све е чисто|sve cisto|све чисто|se cisti|се чисти|cisti se|чисти се|site dokumenti cisti|сите документи чисти|dokumentite se cisti|документите се чисти|uredno e|уредно е|sredeno e|средено е|kompletno cisto|комплетно чисто|nema problemi|нема проблеми|nema problem|нема проблем|nemam problemi|немам проблеми|nema nikakvi problemi|нема никакви проблеми|nemam nikakvi problemi|немам никакви проблеми|nema vekje problemi|нема веќе проблеми|sve e vo red|сè е во ред|se e vo red|се е во ред|sve vo red|сè во ред|se e cisto, nema problemi|се е чисто, нема проблеми|cisto e, nema problemi|чисто е, нема проблеми|nema problemi so dokumentite|нема проблеми со документите|se e cisto so dokumentite|се е чисто со документите|imam na moe ime|имам на мое име|na moe ime|на мое име|e na moe ime|е на мое име|imam imoten list|имам имотен лист|imam dokumenti|имам документи|imam cist|имам чист|cisto e na moe ime|чисто е на мое име|imam na moe ime, cisto e|имам на мое име, чисто е|imam na moe ime, nema problemi|имам на мое име, нема проблеми|se e cisto, imam na moe ime|се е чисто, имам на мое име|cisto e, na moe ime|чисто е, на мое име|se e cisto, na moe ime|се е чисто, на мое име|ti rekov deka imam|ти реков дека имам|rekov deka imam|реков дека имам|ti kazav deka imam|ти кажав дека имам|kazav deka imam|кажав дека имам|ti rekov deka go imam|ти реков дека го имам|ti rekov deka imam na moe ime|ти реков дека имам на мое име|rekov deka imam na moe ime|реков дека имам на мое име)$/i,
  // PETS ALLOWED (reported): "DOZVOLENI SE" (they're allowed) / "SLOBODNO E"
  // are natural direct answers to "Дали се дозволени миленици?" but carry no
  // pet word — the keyword extractor can't fire. When the pets question is
  // CURRENT, these bare allow-phrases are the answer → petsAllowed=true.
  petsAllowed: /^(?:dozvoleni se|дозволени се|dozvoleno e|дозволено е|se dozvoleni|се дозволени|slobodno e|слободно е|slobodno|слободно|dozvoleni|дозволени|nema problem|нема проблем|nema problemi|нема проблеми|ok|ок|okej|океј|moze|може|prihakat|прифаќаат|se prihakaat|се прифаќаат|prihakaat se|прифаќаат се|sekako|секако)$/i
  };

// FIELD-SPECIFIC BARE-NO IDIOMS (negative mirror of BARE_YES_FIELD_RE).
// "NEMAM NA MOE IME" / "NE E NA MOE IME" (the deed is not in my name) or
// "NEMA IMOTEN LIST" answering the documentation question = NOT clean docs
// → documentationClean=false. The extractor's negative branch covers
// hipoteka/teret/etc., but bare possession negations fall through — without
// this map they'd be re-asked twice and SKIPPED (data lost), the exact mirror
// of the reported "IMAM NA MOE IME" bug.
const BARE_NO_FIELD_RE = {
  documentationClean: /^(?:nemam na moe ime|немам на мое име|ne e na moe ime|не е на мое име|nema imoten list|нема имотен лист|nemam imoten list|немам имотен лист|nema dokumenti|нема документи|nemam dokumenti|немам документи)$/i,
  // PETS ALLOWED (reported): "ZABRANETO E" / "NE SE DOZVOLENI" / "NEMA" are
  // natural negative answers to "Дали се дозволени миленици?" with no pet
  // word — mapped when the pets question is CURRENT → petsAllowed=false.
  petsAllowed: /^(?:zabraneto e|забрането е|zabraneto|забрането|zabraneni|забранети|ne se dozvoleni|не се дозволени|nema|нема|ne moze|не може|ne moze da|не може да|ne|не)$/i
};

// ========================================
// EXPLICIT PRICE CORRECTION GATE — mid-data-collection price fixes
// (reported): the owner answers the price question — or corrects a
// backfilled/extracted price — with a DIFFERENT number ("ne, 300 e"), and
// the stored price must be UPDATED, not silently kept. Extractors NEVER
// overwrite by design; this gate is the ONLY admission for price
// re-extraction, so unrelated numbers in other-field answers ("63
// kvadrati", "3 kat", a parking "5000 evra") can never clobber the price.
// Signals (any one suffices):
//   1. Correction verbs: promeni/izmeni/smeni/koregiraj/ispravi/popravi...
//   2. Leading negation: "ne, 300 e" / "не 300" / "ne, 100 iljadi" — the
//      reported phrasing for a correction to a previously given number.
//   3. An explicit rent noun binding: "kirijata e 300", "mesecno 300",
//      "300 evra za mesec" — a bare currency mention ("5000 evra" as a
//      parking price) is NOT a rent correction, so bare evra/iljadi alone
//      never opens the gate.
// ========================================
export function isExplicitPriceCorrection(u) {
  if (/(?:promeni|промени|izmeni|измени|smeni|смени|koregir|корегир|koregiraj|корегирај|ispravi|исправи|popravi|поправи|korekcij|корекци)/i.test(u)) return true;
  // Leading negation WITH a digit — "ne, 300 e" / "не 300" / "ne, 100 iljadi".
  // The digit must sit IMMEDIATELY after the negation (only separators in
  // between): a digit buried later in the sentence ("NE ZNAM, 300 EVRA E
  // POVEKJE OD ONA STO BARAV", "NE TREBA POVEKJE OD 300") belongs to a
  // DIFFERENT thought — the owner is NOT correcting the price, so the gate
  // must stay closed or an unrelated number would clobber the stored price.
  // A bare "ne" / "ne znam" (no number) is a non-answer, NOT a correction.
  if (/^\s*(?:ne|не)[,.\s]*\d/.test(u)) return true;
  if (/(?:kirija|кирија|kirijata|киријата|mesecno|месечно|izdavam|издавам|izdava|издава|iznajmuvam|изнајмувам|iznajmuva|изнајмува|za mesec|за месец)/i.test(u)) return true;
  return false;
}

// ========================================
// runGlobalExtraction — Main entry point
// ========================================
// Extracts field values from user input.
//
// When preferredField is a known field:
//   Run ONLY extractors in the same field group (floor ↔ totalFloors).
//   Standalone fields run only their own extractor.
//   This prevents yearBuilt from grabbing "10" when nextField=totalFloors.
//
// When preferredField is unknown or not set:
//   Run ALL extractors (global discovery mode).
//
// Returns { field: value, ... } for any newly extracted data.
// Does NOT overwrite existing non-null values in currentData — EXCEPT an
// explicit price correction ("ne, 300 e"), which re-extracts and replaces
// the stored price (see isExplicitPriceCorrection).
// ========================================
function runGlobalExtraction(u, currentData, preferredField) {
  // Normalize to lowercase ONCE for the whole pass. Viber owners type in
  // ALL-CAPS ("VTORI KAT", "TRISTAPEESET"), and parseOrdinalFloor /
  // parseMacedonianNumber use case-sensitive includes() — without this they
  // silently miss every ordinal floor and word number in real messages.
  // All extractors and guards are case-insensitive (/i or internal lowercase).
  u = u.toLowerCase();
  const updates = {};

  // STEP 1: Field-targeted extraction.
  // When preferredField is a KNOWN field in FIELD_TO_EXTRACTOR, run ONLY
  // extractors in the same field group. This prevents unrestricted global
  // extraction from grabbing numbers meant for the current question and
  // assigning them to unrelated fields (e.g., "10" → yearBuilt=2010).
  //
  // When preferredField is NOT a known field (e.g., an input string passed
  // by test fixtures), fall through to the full extraction pass below.
  if (preferredField) {
    const extractor = FIELD_TO_EXTRACTOR[preferredField];
    if (extractor) {
      const groupFields = getGroupFields(preferredField);
      let foundPreferred = false;
      for (const field of groupFields) {
        const rule = FIELD_TO_EXTRACTOR[field];
        if (!rule) continue;
        // Skip if field already has a value — EXCEPT explicit price
        // corrections ("ne, 300 e") which legitimately re-extract to
        // replace the stored backfilled/extracted price (reported).
        const dataKey = field;
        const isPriceField = dataKey === 'cleanPrice' || dataKey === 'monthlyRent';
        if (currentData[dataKey] !== undefined && currentData[dataKey] !== null &&
            !(isPriceField && isExplicitPriceCorrection(u))) continue;
        const result = rule(u, currentData);
        if (result) {
          for (const [key, value] of Object.entries(result)) {
            const existing = currentData[key];
            const isPriceKey = key === 'cleanPrice' || key === 'monthlyRent';
            if (existing === undefined || existing === null) {
              updates[key] = value;
              console.log(`[EXTRACTION: field ${field} = ${JSON.stringify(value)} (from preferredField=${preferredField}, group=${JSON.stringify(groupFields)})]`);
            } else if (isPriceKey && typeof existing === 'number' && typeof value === 'number' &&
                       Math.abs(existing - value) >= 1 && isExplicitPriceCorrection(u)) {
              updates[key] = value;
              console.log(`[EXTRACTION: ${key} CORRECTED ${existing} → ${value} (explicit price correction)]`);
            }
          }
          if (field === preferredField) foundPreferred = true;
        }
      }
      // BARE YES/NO MAPPING: the current question was NOT answered by keyword
      // extraction, but the message is a strict bare yes/no answer to a
      // binary question ("Дали е реновиран?" → "ne"). Map it directly.
      // Anchored whole-message patterns keep this safe: "ne, 55 kvadrati"
      // or any message with extra content never matches.
      if (!foundPreferred && BARE_YES_NO_FIELDS.has(preferredField)) {
        // No-overwrite contract: a bare answer must not clobber a value the
        // owner already gave (e.g. "renovated=false" then a stray "da").
        const existingVal = currentData[preferredField];
        if (existingVal === undefined || existingVal === null) {
          // Leading affirmative prefix ("da"/"да" + separator) is stripped
          // BEFORE the bare-answer match — "DA, IMAM NA MOE IME" reduces to
          // "imam na moe ime" so the maps fire (reported docs answer). "da"
          // ALONE is not stripped (the regex requires a separator after it),
          // so bare "da" keeps matching BARE_YES_RE as before.
          const bare = u.trim().replace(/[.!?,;]+$/, '').replace(/^(?:da|да)\s*[,:\s]+/i, '');
          // Field-specific idioms (documentationClean: "SE E CISTO", ...) join
          // the generic bare-yes phrases — see BARE_YES_FIELD_RE above.
          const fieldYesRe = BARE_YES_FIELD_RE[preferredField];
          // ...and their negative mirror ("NEMAM NA MOE IME" → false).
          const fieldNoRe = BARE_NO_FIELD_RE[preferredField];
          if (BARE_YES_RE.test(bare) || (fieldYesRe && fieldYesRe.test(bare))) {
            updates[preferredField] = true;
            console.log(`[EXTRACTION: field ${preferredField} = true (bare yes answer to ${preferredField} question)]`);
          } else if (BARE_NO_RE.test(bare) || (fieldNoRe && fieldNoRe.test(bare))) {
            updates[preferredField] = false;
            if (preferredField === 'renovated') updates.renovationYear = null;
            console.log(`[EXTRACTION: field ${preferredField} = false (bare no answer to ${preferredField} question)]`);
          }
        }
      }
      // Fall through to STEP 2 (bonus pass) — scan for additional volunteered info
      // like terrace size, orientation, etc. that the user added to their answer.
    }
    // Unknown preferredField — also fall through to STEP 2
  }

  // ========================================
  // FIELD LOCK MODE
  // When preferredField is set, we're in data collection mode — asking
  // a specific question. In this mode:
  //
  // 1. EARLY RETURN FOR DIRECT ANSWERS: If STEP 1 found the current
  //    field AND the message is a truly bare answer with NO property
  //    keywords (just "55", "da", "ne znam"), skip STEP 2 entirely.
  //    Uses the comprehensive hasStrongKeywords regex — if ANY property
  //    keyword is present, the message MIGHT have volunteered info
  //    for other fields, so STEP 2 runs.
  //
  // 2. YEAR-SNIFFING LOCK: Even if STEP 1 didn't find the current
  //    field, never run year-sniffing extractors on a message that
  //    was meant for a different field. Year info will be caught
  //    by the history scan when yearBuilt becomes the next field.
  // ========================================

  // Comprehensive keyword check — shared by early-return guard and
  // STEP 2 bare-number detection. This MUST be computed before the
  // early return check to ensure accurate volunteer-content detection.
  const hasStrongKeywords = /spaln|спалн|detsk|детск|gostinsk|гостинск|golem|голем|mala|мала|soba|соба|sobi|соби|bracn|брачн|brachn|pomal|помал|pogolem|поголем|kat|кат|sprat|спрат|katnica|катница|sprata|спрата|potkrovje|поткровје|prizemje|приземје|prv|прв|vtor|втор|tret|трет|cetvrt|четврт|m2|м2|kvadrati|квадрати|kv|кв|sqm|lift|лифт|elevator|klima|клима|inverter|инвертер|parking|паркинг|garaza|гаража|garage|гараж|terasa|тераса|terasi|тераси|terrace|namest|мебел|namestaj|мебел|opremen|опремен|izgraden|граден|godina|година|gradba|градба|renov|ренов|cist|чист|hipotek|хипотек|ostavinsk|оставинск|foto|фото|slik|слик|viber|вајбер|advokat|адвокат|notar|нотар|danok|данок|provizija|провизија|dogovor|договор|parno|парно|greene|греење|struja|струја|drva|дрва|pelet|пелет|nafta|нафта|centralno|централно|toplovod|топловод|gas|гас|kujna|кујна|plakari|плакари|podzemna|подземна|odelno|одделно|oddelen|одделен|posebno|посебно|elektricno|електрично|gradsko|градско|sopstveno|сопствено/i.test(u);

  const hasPreferredField = preferredField && FIELD_TO_EXTRACTOR[preferredField];
  if (hasPreferredField) {
    const groupFields = getGroupFields(preferredField);
    let step1Found = false;
    for (const field of groupFields) {
      if (field in updates) {
        step1Found = true;
        break;
      }
    }
    if (step1Found) {
      // EARLY RETURN: Only skip STEP 2 when the message is a truly bare
      // answer with NO property keywords. Uses the comprehensive
      // hasStrongKeywords regex instead of the old hasVolunteerContent
      // which was missing floor/building keywords (sprat, kat, kata, etc.).
      // Now messages like "na sesti sprat a zgradata ima deset kata" will
      // NOT early-return — "sprat" and "kata" are in hasStrongKeywords,
      // so STEP 2 runs and extracts BOTH floor AND totalFloors.
      //
      // Check for multi-field indicators even when hasStrongKeywords is false:
      // commas/semicolons ("65, 3 kat"), "i"/"и" separators ("65 i terasa"),
      // or just a long message that likely contains volunteered info.
      const isBareAnswer = !hasStrongKeywords &&
        // Short message (bare answer, not a multi-field sentence)
        u.length < 50 &&
        // No commas/semicolons (separators that indicate multi-field content)
        !/[,;]/.test(u) &&
        // No specific field units
        !/m2|м2|кв|%|€|£|\$/i.test(u);
      if (isBareAnswer) {
        console.log(`[EARLY RETURN: direct answer for ${preferredField} — bare answer, no volunteered content]`);
        return updates;
      }
      console.log(`[BONUS PASS: ${preferredField} found + hasStrongKeywords=${hasStrongKeywords} — checking for volunteered content]`);
    }
  }

  // STEP 2: Bonus extraction pass — scan for ADDITIONAL property facts.
  // Reached after the group-restricted pass (if preferredField was set)
  // OR directly when preferredField was not set (full discovery mode).
  // OR when preferredField was found BUT the message has strong keywords
  // (indicating volunteered info for other fields).
  //
  // This pass runs ALL extractors BUT with safety guards:
  // - Bare numbers (no strong keywords) skip NUMBER_SNIFFING_EXTRACTORS
  //   (bedrooms, floor, totalSqm) and YEAR_SNIFFING_EXTRACTORS (yearBuilt)
  // - This prevents "10" → yearBuilt=2010 while allowing legitimate
  //   multi-field extraction like "65 m2 so terasa od 3 m2".
  //
  // Essential for catching volunteered info (terrace, orientation, parking)
  // that the user adds to their answer for the current question.
  // REPEAT-STRIPPED TEXT for the bare-number guard: "86 TI KAZAV" is a bare
  // answer ("86") wearing an annoyance marker. Judging isBareNumber on the
  // RAW message would let "kazav" count as a strong keyword and un-leash the
  // number-sniffing extractors on the same bare number (extractTotalFloors
  // would read totalFloors=86 from the totalSqm repeat, etc.). Strip the
  // marker so a repeat during ANOTHER question is treated as the bare number
  // it is and correctly skipped by the guard (cross-field contamination).
  const uRepeatStrippedGuard = u.replace(ANNOYED_REPEAT_RE, ' ').trim();
  const isBareNumber = !hasStrongKeywords &&
    // Short message (bare answer, not a multi-field sentence)
    uRepeatStrippedGuard.length < 50 &&
    // No commas/semicolons (separators that indicate multi-field content)
    !/[,;]/.test(uRepeatStrippedGuard) &&
    // No specific field units
    !/m2|м2|кв|%|€|£|\$/i.test(uRepeatStrippedGuard);

  // Track price extraction in THIS call (both group pass and bonus pass)
  let priceExtracted = false;
  // Check if Step 1 already extracted a price
  if (updates.cleanPrice !== undefined || updates.monthlyRent !== undefined) {
    priceExtracted = true;
  }

  for (const rule of EXTRACTION_RULES) {
    // If a price (cleanPrice or monthlyRent) was already extracted from THIS
    // message, skip number-sniffing extractors that can accidentally pick up
    // price words like "stopeeset" → floor=50 or "tri" → bedrooms=3.
    // REFINEMENT (reported bug): explicit field context bypasses the skip —
    // "98 iljadi evra, vtori kat" MUST register floor=2 because ordinal /
    // digit+kat / room-word / katnica patterns can never be confused with
    // price numbers. Only the substring number-sniffing fallbacks (which
    // fire when NO explicit context exists) are the real contamination risk.
    if (priceExtracted && PRICE_SENSITIVE_EXTRACTORS.has(rule.name)) {
      const hasExplicitFieldContext =
        (rule.name === 'extractFloor' && /(?:prvi|први|prv|прв|vtori|втори|vtor|втор|treti|трети|tret|трет|cetvrti|четврти|cetvrt|четврт|petti|петти|sesti|шести|sedmi|седми|osmi|осми|devetti|деветти|prizemje|приземје|potkrovje|поткровје)(?:\s*(?:kat|кат|sprat|спрат))?|\d{1,2}\s*(?:kat|кат|sprat(?!a)|спрат(?!а))/i.test(u)) ||
        (rule.name === 'extractTotalFloors' && /(?:katnica|катница|sprata|спрата|kata|ката|spratovi|спратови|katovi|катови|kati|кати)/i.test(u)) ||
        (rule.name === 'extractBedrooms' && /(?:spaln|спалн|detsk|детск|gostinsk|гостинск|soba|соба|sobi|соби|bracn|брачн|golem|голем|mala|мала)/i.test(u));
      if (!hasExplicitFieldContext) continue;
    }
    // If the message has NO strong field-specific keywords (just bare number words
    // like "pet mislam"), skip number-sniffing extractors to prevent a bare number
    // from populating multiple unrelated fields.
    if (isBareNumber && NUMBER_SNIFFING_EXTRACTORS.has(rule.name)) {
      continue;
    }
    // FIELD LOCK: When preferredField is set (data collection mode),
    // skip year-sniffing extractors UNCONDITIONALLY in STEP 2.
    // extractRenovationYear is also guarded here (even though it's not
    // in YEAR_SNIFFING_EXTRACTORS) because it calls parseYearBuilt().
    // Year info volunteered during other questions will be caught
    // by the history scan when yearBuilt becomes the next field.
    // When preferredField is NOT set (global discovery during
    // persuasion), only skip extractYearBuilt for bare numbers.
    // extractRenovationYear is NOT guarded by isBareNumber because it
    // requires renovated=true as precondition, so it can't fire on
    // bare numbers in fresh sessions.
    const yearSniffingNames = ['extractYearBuilt', 'extractRenovationYear'];
    if (hasPreferredField && yearSniffingNames.includes(rule.name)) {
      // FIELD-LOCK REFINEMENT (reported bug): skip year-sniffing UNLESS the
      // message carries explicit year context. "NOVA ZGRADA OD 2024" or
      // "izgradena 2015 godina" volunteered while answering the price question
      // MUST be captured now — the history-scan fallback is not guaranteed.
      // A year adjacent to a renovation keyword is the RENOVATION year and is
      // deliberately excluded (extractRenovationYear owns it, not yearBuilt).
      const yearMatch = u.match(/\b(?:19|20)\d{2}\b|(?:19|20)\d{2}(?:ta|та|ти|ti)/i);
      const yearIsRenovation = yearMatch
        ? /(?:renoviran|реновиран|renoviravme|реновиравме|renoviraa|реновираа|renoviral|реновирал|obnoven|обновен|osvezen|освежен)/i.test(
            u.slice(Math.max(0, yearMatch.index - 25), yearMatch.index + yearMatch[0].length + 25))
        : false;
      const hasYearContext = (yearMatch && !yearIsRenovation) ||
        /(?:godina|година|graden|граден|izgraden|изграден|gradena|градена|izgradena|изградена|nova\s*zgrada|нова\s*зграда|zgrada\s*od|зграда\s*од|zgradena|зградена)/i.test(u);
      if (!hasYearContext) continue;
    }
    if (isBareNumber && rule.name === 'extractYearBuilt') {
      // Allow year extraction even for bare numbers if the message has
      // year-like patterns: 4-digit years (2015, 1985), decade refs (80ti),
      // or year keywords (graden, godina). This handles "80ti" → yearBuilt
      // and "2015ta e gradeno" which have clear year context but lack
      // the sqm/floor/lift keywords that would make hasStrongKeywords=true.
      const hasYearContext = /\b(?:19|20)\d{2}\b|\d{2}ti|\d{2}ти|\d{2}ta|\d{2}та|\d{4}ta|\d{4}та|imotna|имотан|godina|година|graden|граден|izgraden|изграден|star|стар/i.test(u);
      if (!hasYearContext) {
        continue;
      }
    }
    // Skip if this field was already extracted by Step 1 (group pass)
    // Check rule's output name — for simple single-field extractors, we can
    // check if the key exists in updates. For multi-field extractors (e.g.,
    // extractParking returns { parking, parkingType }), we check the primary key.
    const result = rule(u, currentData);
    if (result) {
      for (const [key, value] of Object.entries(result)) {
        // Don't overwrite what Step 1 already extracted
        if (key in updates) continue;
        const existing = currentData[key];
        const isPriceKey = key === 'cleanPrice' || key === 'monthlyRent';
        if (existing === undefined || existing === null) {
          updates[key] = value;
          if (isPriceKey) {
            priceExtracted = true;
          }
        } else if (isPriceKey && typeof existing === 'number' && typeof value === 'number' &&
                   Math.abs(existing - value) >= 1 && isExplicitPriceCorrection(u)) {
          // PRICE CORRECTION (reported): the owner answered the price
          // question — or corrected the stored backfilled/extracted price —
          // with a DIFFERENT number ("ne, 300 e"). Extractors never
          // overwrite by design; only an explicit correction passes the
          // gate, so unrelated numbers in other-field answers (sqm, floor,
          // parking price) can never clobber the price.
          updates[key] = value;
          priceExtracted = true;
          console.log(`[PRICE CORRECTION: ${key} ${existing} → ${value} (explicit correction in "${u}")]`);
        }
      }
    }
  }
  return updates;
}

// ========================================
// Pre-question history scan
// Before asking a question, check if the answer already exists
// in any previous user message. Scans ALL user messages in the
// conversation history and runs the appropriate field extractor
// on the combined text. If found with HIGH confidence, returns
// the extracted values so the caller can store them and skip.
//
// This prevents repeated questions when the user already provided
// the information in an earlier message (compound floor answers
// during persuasion, volunteered details, etc.).
// ========================================
export function scanHistoryForField(field, messages, currentData) {
  // Complex stateful fields handled by service.js — skip (can't be extracted from history)
  const complexFields = new Set(['terraceSqm', 'photos', 'ownerName', 'address']);
  if (complexFields.has(field)) return null;

  // Already in collectedData — skip
  const existing = currentData[field];
  if (existing !== undefined && existing !== null && existing !== '') return null;

  // No messages to scan — skip
  if (!messages || !Array.isArray(messages) || messages.length === 0) return null;

  // Combine ALL user/owner messages into one text for a thorough scan.
  // This captures information the user volunteered in any previous turn.
  const userMessages = messages
    .filter(m => m.role === 'user' || m.role === 'client' || m.role === 'owner')
    .map(m => m.text)
    .filter(Boolean)
    .join(' ');

  if (!userMessages) return null;

  // Try extractors in the same field group (e.g., floor ↔ totalFloors).
  // When scanning for totalFloors, also run extractFloor which has the
  // compound floor extraction logic ("na osmi od deset" → both fields).
  const groupFields = getGroupFields(field);
  for (const gf of groupFields) {
    const extractor = FIELD_TO_EXTRACTOR[gf];
    if (!extractor) continue;
    // Use empty currentData to bypass skip guards like "if (data.floor !== undefined) return null".
    // Those guards would block compound extraction (e.g., extractCompoundFloor returning
    // totalFloors from "na osmi od deset" when floor is already set from a previous turn).
    // We already confirmed the target field is missing above — let extractors run freely.
    const result = extractor(userMessages, {});
    if (result && result[field] !== undefined) {
      const confidence = assessConfidence(field, result[field], userMessages);
      if (confidence === 'HIGH') {
        console.log(`[HISTORY SCAN: found ${field} = ${JSON.stringify(result[field])} from combined user messages]`);
        return result;
      }
    }
  }

  return null;
}

// ========================================
// Confidence score conversion
// Converts 'HIGH' | 'MEDIUM' | 'LOW' to numeric 0-1 scores.
// Used by service.js to store persistent field confidence.
// ========================================
export function confidenceToNumeric(level) {
  return level === 'HIGH' ? 0.95 : level === 'MEDIUM' ? 0.60 : 0.10;
}

export {
  runGlobalExtraction,
  assessConfidence,
  EXTRACTION_RULES
};
