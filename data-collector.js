// ========================================
// DATA COLLECTOR — Global Extraction Pass
// ========================================
// Extracts ALL simple fields from EVERY user message,
// regardless of current nextField.
// Complex stateful handlers (heating follow-up, terrace
// follow-up, photos) remain in service.js.
// ========================================
import {
  parseMacedonianNumber,
  parseNumberWords,
  parseOrdinalFloor,
  extractFirstNumber,
  countBedrooms,
  extractPrice,
  parseYearBuilt,
  parseOrientation
} from './property-extractor.js';

// ========================================
// EXTRACTION RULES
// Each rule returns { field: value, ... } or null
// ========================================

function extractCleanPrice(u, data) {
  // Skip if this is a rental (transactionType='rent') OR if monthlyRent already captured
  // (handles case during persuasion when transactionType isn't set yet but price is rent amount)
  if (data.transactionType === 'rent' || data.monthlyRent !== undefined) return null;
  const price = extractPrice(u);
  return price !== null ? { cleanPrice: price } : null;
}

function extractMonthlyRent(u, data) {
  // Skip if NOT a rental (transactionType !== 'rent' also catches undefined during persuasion)
  // Also skip if cleanPrice already captured (cross-guard for sale leads)
  if (data.transactionType !== 'rent') return null;
  if (data.cleanPrice !== undefined) return null;
  const price = extractPrice(u);
  return price !== null ? { monthlyRent: price } : null;
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
  // Fallback: first reasonable number — but skip if near price context (evra/iljadi)
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 10 && firstNum <= 999) {
    // Check if this number is actually a price (near evra/iljadi context)
    const uClean = u.toLowerCase();
    if (/iljadi|илјади|evra|евра|eur|evro|евро|kirija|кирија|cena|цена/i.test(uClean)) {
      // Number near price context — only extract if explicitly with sqm word
      return null;
    }
    return { totalSqm: firstNum };
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
  // Pattern 1: "na 8 od 10" or "8 od 10" — digit "od" digit
  const digitOdMatch = u.match(/(?:na\s+)?(\d{1,2})\s+od\s+(\d{1,3})/i);
  if (digitOdMatch) {
    const floor = parseInt(digitOdMatch[1]);
    const total = parseInt(digitOdMatch[2]);
    if (floor >= 0 && floor <= 50 && total >= 2 && total <= 50) {
      return { floor, totalFloors: total };
    }
  }

  // Pattern 2: "na osmi od deset", "na 8 od vkupno deset", "osmi kat od vkupno deset"
  // word (ordinal or digit) "od" word/digit
  // Optional word (\S+\s+)? between floor and "od" handles "osmi kat od..." and
  // "na osmi kat od..." — a common Macedonian compound floor pattern.
  // The optional word is non-capturing ((?:...)) so capture indices 1 and 2 stay correct.
  const wordOdMatch = u.match(/(?:na\s+)?(\w+)\s+(?:\S+\s+)?od\s+(?:vkupno\s+)?(\S{2,})/i);
  if (wordOdMatch) {
    const floorWord = wordOdMatch[1].toLowerCase();
    const totalWord = wordOdMatch[2].toLowerCase();
    // Parse floor word as ordinal or digit
    let floor = parseOrdinalFloor(floorWord);
    if (floor === null) {
      floor = /^\d+$/.test(floorWord) ? parseInt(floorWord) : null;
    }
    // Parse total word as digit, word-number, or extracted from compound like "desetka"
    let total = /^\d+$/.test(totalWord) ? parseInt(totalWord) : parseMacedonianNumber(totalWord);
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
  const ordinal = parseOrdinalFloor(u);
  if (ordinal !== null) return { floor: ordinal };
  // Digit floor — find number adjacent to floor context words.
  // Uses (?!nica) negative lookahead to prevent "kat" from matching
  // "katnica" ("kat" + "nica") while still allowing "kat" standalone,
  // "kata", "3kat" (no space, common in Viber shorthand), etc.
  const floorMatch = u.match(/(\d{1,2})\s*(kat(?!nica)|кат(?!ница)|kata|ката|sprat|спрат|sprata|спрата|floor)/i);
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
  const hasFloorContext = /kat(?!nica)|кат(?!ница)|sprat|спрат|floor|sprata|спрата|kata|ката|eta|ета/i.test(u);
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 0 && firstNum <= 50 && hasFloorContext) {
    // Skip if the message contains context from another field
    if (/m2|м2|кв|kvadrati|квадрати|kv|sqm|spalni|спални|terasa|тераса/i.test(u)) return null;
    return { floor: firstNum };
  }
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 50 && hasFloorContext) {
    // Skip if message contains terrace or question context (could be answering terrace/other follow-up)
    if (/terasa|тераса|zosto|зошто|zasto|зашто/i.test(u)) return null;
    return { floor: wordNum };
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
  const bareDigit = u.match(/^(\d{1,3})$/);
  if (bareDigit) {
    const num = parseInt(bareDigit[1]);
    if (num >= 1 && num <= 50) return { totalFloors: num };
  }
  // Bare word number: "deset" → 10
  const bareWord = u.trim();
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
  // Require AC-specific context — cooling/cooling-related words only
  if (/klima|клима|inverter|инвертер|split|сплит|клима уред|klima ured/i.test(u)) return { ac: true };
  if (/bez klima|без клима|nema klima/i.test(u)) return { ac: false };
  return null;
}

function extractParking(u, data) {
  if (data.parking !== undefined && data.parking !== null) return null;
  if (/nema parking|нема паркинг|nema garaza|нема гаража|bez parking|без паркинг|без гаража|bez garaza/i.test(u)) {
    return { parking: false };
  }
  if (/garaza|гаража|privat|приват|parking|паркинг|garage|гараж|podzemna|подземна|sopstveno|сопствено|pred zgrada|пред зграда|na -|на -|podzemno|подземно|ima parking|има паркинг|ima garaza|има гаража/i.test(u)) {
    let parkingType = "public";
    if (/garaza|гаража|garage|гараж|podzemna|подземна|podzemno|подземно|na -1|на -1|na -2|на -2|na -|на -|podzemno parking|подземно паркинг|podzemna garaza|подземна гаража|garaza na -|гаража на -/i.test(u)) {
      parkingType = "garage";
    } else if (/privat|приват|sopstveno|сопствено|pred zgrada|пред зграда/i.test(u)) {
      parkingType = "private";
    }
    return { parking: true, parkingType };
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
  if (/prazen|правен|bez namestaj|без мебел|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|ne e namesten|не е наместен/i.test(u)) {
    return { furnished: false, furnishedLevel: "empty" };
  }
  if (/komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|se prodava namesten|се продава наместен|so namestaj|со мебел|namesten|наместен/i.test(u)) {
    return { furnished: true, furnishedLevel: "full" };
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
  // Check if year is embedded — prefer year near renovation keywords
  // First, try to find year specifically near renovation words
  const renovYearNear = u.match(/(?:renoviran|реновиран|obnoven|обновен|osvezen|освежен).{0,20}((?:19|20)\d{2})/i);
  if (renovYearNear) {
    return { renovated: true, renovationYear: parseInt(renovYearNear[1]) };
  }
  const renovYearBefore = u.match(/((?:19|20)\d{2}).{0,20}(?:renoviran|реновиран|obnoven|обновен|osvezen|освежен)/i);
  if (renovYearBefore) {
    return { renovated: true, renovationYear: parseInt(renovYearBefore[1]) };
  }
  // Renovation-specific words (no year) — just "renoviran" means yes, year unknown
  if (/реновиран|renoviran|обновен|obnoven|novo|нов|sreden|среден|kompletno renoviran|комплетно реновиран|delumno renoviran|делумно реновиран|skoro|скоро|nedavno|недавно|pre|пред|osvezhivme|освеживме|go osvezivme|го освеживме/i.test(u)) {
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
  if (/pred|пред|pri|при/i.test(u)) {
    const years = u.match(/\d+/);
    if (years) {
      const currentYear = new Date().getFullYear();
      return { renovated: true, renovationYear: currentYear - parseInt(years[0]) };
    }
    const wordNum = parseMacedonianNumber(u);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 100) {
      const currentYear = new Date().getFullYear();
      return { renovated: true, renovationYear: currentYear - wordNum };
    }
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
    const years = u.match(/\d+/);
    if (years) {
      const currentYear = new Date().getFullYear();
      return { renovationYear: currentYear - parseInt(years[0]) };
    }
    const wordNum = parseMacedonianNumber(u);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 100) {
      const currentYear = new Date().getFullYear();
      return { renovationYear: currentYear - wordNum };
    }
  }
  return null;
}

function extractDocumentationClean(u, data) {
  if (data.documentationClean !== undefined && data.documentationClean !== null) return null;
  if (/hipoteka|хипотека|ostavinska|оставинска|razvod|развод|sudski|судски|problem|проблем|ne e cist|не е чист|ne e cista|не е чиста|komplikacii|компликации|teret|терет|zabrana|забрана|zalozen|заложен|ne e cist imoten list|не е чист имотен лист|ima hipoteka|има хипотека|ima problem|има проблем/i.test(u)) {
    let docsIssue = "other";
    if (/hipoteka|хипотека/i.test(u)) docsIssue = "hipoteka";
    else if (/ostavinska|оставинска/i.test(u)) docsIssue = "ostavinska";
    else if (/razvod|развод/i.test(u)) docsIssue = "razvod";
    else if (/teret|терет|zabrana|забрана|zalozen|заложен/i.test(u)) docsIssue = "teret";
    return { documentationClean: false, documentationIssues: docsIssue };
  }
  // Require documentation-specific context — don't match bare "da" / "ima"
  if (/cist imoten|чист имотен|cist|чист|nema hipoteka|нема хипотека|nema ostavinska|нема оставинска|nema teret|нема терет|nema zabrana|нема забрана|cisto na moe ime|чисто на мое име|na moe ime|на мое име|cist imoten list|чист имотен лист/i.test(u)) {
    return { documentationClean: true, documentationIssues: null };
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
  extractMonthlyRent,
  extractTotalSqm,
  extractBedrooms,
  extractCompoundFloor,  // Standalone — NOT in NUMBER_SNIFFING so it runs even for bare numbers
  extractFloor,
  extractTotalFloors,
  extractElevator,
  extractAC,
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
  'monthlyRent': /kirija|кирија|mesecno|месечно/i,
  'orientation': /orientacija|ориентација|strana|страна|jug|север|istok|запад|zapad|sever|jugoistok|jugozapad|severoistok|severozapad|исток|југ|североисток|северозапад|југоисток|југозапад|pravec|правец/i,
  'terraceSqm': /terasa|тераса|terrace|m2|м2|kvadrati|квадрати/i
};

// Binary fields that require explicit keyword match for HIGH confidence
const BINARY_CONFIDENCE_FIELDS = new Set([
  'elevator', 'ac', 'parking', 'furnished', 'documentationClean', 'renovated', 'heating'
]);

// Derived sub-keys from multi-field extractors (e.g., furnishedLevel from extractFurnished).
// These are always side-effects of their parent field extraction and should inherit HIGH.
const DERIVED_SUBKEYS = new Set([
  'furnishedLevel', 'parkingType', 'orientationPrimary', 'orientationSecondary',
  'documentationIssues', 'heatingType', 'heating'
]);

function assessConfidence(field, value, input) {
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
  const hasCompoundFloor = /\d{1,2}\s+od\s+\d{1,3}|\w+\s+od\s+\w+|\d{1,2}\s*\/\s*\d{1,2}/i.test(input);
  if (hasCompoundFloor && (field === 'floor' || field === 'totalFloors')) {
    return 'HIGH';
  }

  // Numeric-or-string field without uncertainty but also without strong
  // field-specific keywords — might be a volunteered bare number.
  // Example: "pedeset" without "kvadrati" → MEDIUM, not LOW.
  // User might be answering the current question with a word number.
  const hasDigits = /\d+/.test(input);
  if (hasDigits || /jedn|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset|stoti|илjadi/i.test(input)) {
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
  if (!/terasa|тераса|terrace/i.test(u)) return null;
  // Match number after terrace word: "terasa od 3 m2" → cap 1 = "3"
  // Uses non-capturing group (?:terasa|тераса) to scope alternation properly
  const terraceMatch = u.match(/(?:terasa|тераса).{0,20}?(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв|sqm)/i);
  if (terraceMatch) {
    const num = parseInt(terraceMatch[1]);
    if (num >= 1 && num <= 500) return { hasTerrace: true, terraceSqm: num };
  }
  // Also try number-before-terrace: "3 m2 terasa"
  // Uses (?:terasa|тераса) to scope alternation and ensures the extracted
  // number is the one NEAREST to "terasa", not the first number in the message.
  const terraceBefore = u.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв|sqm).{0,20}?(?:terasa|тераса)/i);
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
  monthlyRent: extractMonthlyRent,
  totalSqm: extractTotalSqm,
  bedrooms: extractBedrooms,
  floor: extractFloor,
  totalFloors: extractTotalFloors,
  elevator: extractElevator,
  ac: extractAC,
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
// Does NOT overwrite existing non-null values in currentData.
// ========================================
function runGlobalExtraction(u, currentData, preferredField) {
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
      for (const field of groupFields) {
        const rule = FIELD_TO_EXTRACTOR[field];
        if (!rule) continue;
        // Skip if field already has a value
        const dataKey = field;
        if (currentData[dataKey] !== undefined && currentData[dataKey] !== null) continue;
        const result = rule(u, currentData);
        if (result) {
          for (const [key, value] of Object.entries(result)) {
            const existing = currentData[key];
            if (existing === undefined || existing === null) {
              updates[key] = value;
              console.log(`[EXTRACTION: field ${field} = ${JSON.stringify(value)} (from preferredField=${preferredField}, group=${JSON.stringify(groupFields)})]`);
            }
          }
        }
      }
      // Fall through to STEP 2 (bonus pass) — scan for additional volunteered info
      // like terrace size, orientation, etc. that the user added to their answer.
    }
    // Unknown preferredField — also fall through to STEP 2
  }

  // ========================================
  // EARLY RETURN FOR DIRECT ANSWERS
  // When preferredField was set AND STEP 1 extracted a value for it,
  // check if the message contains volunteered-content indicators for
  // OTHER fields (not in the current question's group). If the message
  // is a direct answer (no commas, no "и"/"i", no strong keywords for
  // other property features), skip STEP 2 entirely.
  //
  // This prevents unrelated extractors from grabbing the same number
  // for different fields — e.g., "10 katnica" → totalFloors=10 from
  // STEP 1, but extractFloor finds "kat" in "katnica" via its digit+kat
  // regex and assigns floor=10. With this guard, "10 katnica" skips
  // STEP 2 because no volunteered-content indicators are detected.
  // ========================================
  if (preferredField && FIELD_TO_EXTRACTOR[preferredField]) {
    const groupFields = getGroupFields(preferredField);
    let step1Found = false;
    for (const field of groupFields) {
      if (field in updates) {
        step1Found = true;
        break;
      }
    }
    if (step1Found) {
      // Check for indicators that the user is volunteering information
      // for OTHER fields (not the current question):
      //   - Commas/semicolons: "65 m2, 3 kat, ima lift"
      //   - "и"/"i" (and) separator: "65 m2 i terasa od 3"
      //   - Strong keywords for other property features: "lift" (elevator),
      //     "terasa" (terrace), "klima" (AC), "parking", "spalni" (bedrooms),
      //     "foto" (photos), etc.
      //
      // If NONE of these are present, the user is simply answering the
      // current question — no need to volunteer scanning.
      const hasVolunteerContent = /[,;]|\s+i\s+|\s+и\s+|lift|лифт|elevator|klima|клима|inverter|terasa|тераса|terrace|parking|паркинг|garaz|гараж|spaln|спалн|detsk|детск|gostinsk|гостинск|soba|соба|sobi|соби|foto|фото|slik|слик|viber|вајбер|renov|ренов|izgraden|граден|godina|година|advokat|адвокат|notar|нотар|danok|данок/i.test(u);
      if (!hasVolunteerContent) {
        console.log(`[EARLY RETURN: direct answer for ${preferredField} — no volunteered content detected]`);
        return updates;
      }
    }
  }

  // STEP 2: Bonus extraction pass — scan for ADDITIONAL property facts.
  // Reached after the group-restricted pass (if preferredField was set)
  // OR directly when preferredField was not set (full discovery mode).
  // OR when preferredField was found BUT the message shows volunteer content.
  //
  // This pass runs ALL extractors BUT with safety guards:
  // - Bare numbers (no strong keywords) skip NUMBER_SNIFFING_EXTRACTORS
  //   (bedrooms, floor, totalSqm) and YEAR_SNIFFING_EXTRACTORS (yearBuilt)
  // - This prevents "10" → yearBuilt=2010 while allowing legitimate
  //   multi-field extraction like "65 m2 so terasa od 3 m2".
  //
  // Essential for catching volunteered info (terrace, orientation, parking)
  // that the user adds to their answer for the current question.
  const hasStrongKeywords = /spaln|спалн|detsk|детск|gostinsk|гостинск|golem|голем|mala|мала|soba|соба|sobi|соби|kat|кат|sprat|спрат|katnica|катница|sprata|спрата|potkrovje|поткровје|prizemje|приземје|prv|прв|vtor|втор|tret|трет|cetvrt|четврт|m2|м2|kvadrati|квадрати|kv|кв|sqm|lift|лифт|elevator|klima|клима|inverter|инвертер|parking|паркинг|garaza|гаража|garage|гараж|terasa|тераса|terrace|namest|мебел|namestaj|мебел|opremen|опремен|izgraden|граден|godina|година|gradba|градба|renov|ренов|cist|чист|hipotek|хипотек|ostavinsk|оставинск|foto|фото|slik|слик|viber|вајбер|advokat|адвокат|notar|нотар|danok|данок|provizija|провизија|dogovor|договор|parno|парно|greene|греење|struja|струја|drva|дрва|pelet|пелет|nafta|нафта/i.test(u);
  const isBareNumber = !hasStrongKeywords &&
    // Short message (bare answer, not a multi-field sentence)
    u.length < 50 &&
    // No commas/semicolons (separators that indicate multi-field content)
    !/[,;]/.test(u) &&
    // No specific field units
    !/m2|м2|кв|%|€|£|\$/i.test(u);

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
    if (priceExtracted && PRICE_SENSITIVE_EXTRACTORS.has(rule.name)) {
      continue;
    }
    // If the message has NO strong field-specific keywords (just bare number words
    // like "pet mislam"), skip number-sniffing extractors to prevent a bare number
    // from populating multiple unrelated fields.
    if (isBareNumber && NUMBER_SNIFFING_EXTRACTORS.has(rule.name)) {
      continue;
    }
    // If the message is a bare number, skip year-sniffing extractors that
    // can accidentally convert "10" to yearBuilt=2010.
    if (isBareNumber && YEAR_SNIFFING_EXTRACTORS.has(rule.name)) {
      continue;
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
        if (existing === undefined || existing === null) {
          updates[key] = value;
          if (key === 'cleanPrice' || key === 'monthlyRent') {
            priceExtracted = true;
          }
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
  const complexFields = new Set(['terraceSqm', 'heating', 'photos', 'ownerName', 'address']);
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

export {
  runGlobalExtraction,
  assessConfidence,
  EXTRACTION_RULES
};
