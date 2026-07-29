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

function extractFloor(u, data) {
  if (data.floor !== undefined && data.floor !== null) return null;
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
  // Digit floor — find number adjacent to floor context words
  const floorMatch = u.match(/(\d{1,2})\s*(kat|кат|sprat|спрат|floor|ката|sprata|спрата)/i);
  if (floorMatch) {
    const num = parseInt(floorMatch[1]);
    if (num >= 0 && num <= 50) return { floor: num };
  }
  // Fallback: extract first reasonable number — but skip if another field context present
  // (e.g., "2 spalni" → number 2 is about bedrooms, not floor).
  // ALSO: require floor-context words for bare number fallback (no fallback guessing).
  // "10" without "kat", "sprat", etc. has 0% confidence → return null.
  const hasFloorContext = /kat|кат|sprat|спрат|floor|sprata|спрата|kata|ката|eta|ета/i.test(u);
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
  extractDocumentationClean
];

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
  'extractTotalSqm'
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
      return updates; // Return group results — do NOT fall through to full pass
    }
    // Unknown preferredField — fall through to full extraction pass
  }

  // STEP 2: Full extraction pass — bonus info discovery.
  // Only reached when preferredField is not set (persuasion mode, or
  // service.js calls without a specific nextField).
  //
  // Detect whether the message has strong field-specific keywords.
  // If not (just bare number words like "pet mislam"), number-sniffing
  // extractors are skipped — preventing a single bare number from
  // populating bedrooms + floor + totalSqm.
  const hasStrongKeywords = /spaln|спалн|detsk|детск|gostinsk|гостинск|golem|голем|mala|мала|soba|соба|sobi|соби|kat|кат|sprat|спрат|katnica|катница|sprata|спрата|potkrovje|поткровје|prizemje|приземје|prv|прв|vtor|втор|tret|трет|cetvrt|четврт|m2|м2|kvadrati|квадрати|kv|кв|sqm|lift|лифт|elevator|klima|клима|inverter|инвертер|parking|паркинг|garaza|гаража|garage|гараж|terasa|тераса|terrace|namest|мебел|namestaj|мебел|opremen|опремен|izgraden|граден|godina|година|gradba|градба|renov|ренов|cist|чист|hipotek|хипотек|ostavinsk|оставинск|foto|фото|slik|слик|viber|вајбер|advokat|адвокат|notar|нотар|danok|данок|provizija|провизија|dogovor|договор|parno|парно|greene|греење|struja|струја|drva|дрва|pelet|пелет|nafta|нафта/i.test(u);
  const isBareNumber = !hasStrongKeywords &&
    // Short message (bare answer, not a multi-field sentence)
    u.length < 50 &&
    // No commas/semicolons (separators that indicate multi-field content)
    !/[,;]/.test(u) &&
    // No specific field units
    !/m2|м2|кв|%|€|£|\$/i.test(u);

  let priceExtracted = false;
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
    const result = rule(u, currentData);
    if (result) {
      for (const [key, value] of Object.entries(result)) {
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

export {
  runGlobalExtraction,
  EXTRACTION_RULES
};
