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
  isPositive,
  isNegative,
  extractFirstNumber,
  countBedrooms,
  extractPrice,
  extractTerraceNumber,
  parseYearBuilt,
  parseOrientation
} from './property-extractor.js';

// ========================================
// EXTRACTION RULES
// Each rule returns { field: value, ... } or null
// ========================================

function extractCleanPrice(u, data) {
  if (data.transactionType === 'rent') return null;
  const price = extractPrice(u);
  return price !== null ? { cleanPrice: price } : null;
}

function extractMonthlyRent(u, data) {
  if (data.transactionType !== 'rent') return null;
  const price = extractPrice(u);
  return price !== null ? { monthlyRent: price } : null;
}

function extractTotalSqm(u, data) {
  // Skip if already set
  if (data.totalSqm !== undefined && data.totalSqm !== null) return null;
  const sqmMatch = u.match(/(\d{2,4})\s*(m2|м2|квадрати|кв|sqm|kvadrati|kvadrata|квадрата|квадрат|kv|кв)/i);
  if (sqmMatch) return { totalSqm: parseInt(sqmMatch[1]) };
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 10 && firstNum <= 999) return { totalSqm: firstNum };
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
    const totalFloors = data.totalFloors || 6;
    return { floor: totalFloors + 1 };
  }
  const ordinal = parseOrdinalFloor(u);
  if (ordinal !== null) return { floor: ordinal };
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 0 && firstNum <= 50) return { floor: firstNum };
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 50) return { floor: wordNum };
  return null;
}

function extractTotalFloors(u, data) {
  if (data.totalFloors !== undefined && data.totalFloors !== null) return null;
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 1 && firstNum <= 50) return { totalFloors: firstNum };
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 1 && wordNum <= 50) return { totalFloors: wordNum };
  return null;
}

function extractElevator(u, data) {
  if (data.elevator !== undefined && data.elevator !== null) return null;
  if (isPositive(u) || /lift|лифт|ima|има/i.test(u)) return { elevator: true };
  if (isNegative(u) || /bez lift|без лифт|nema lift/i.test(u)) return { elevator: false };
  return null;
}

function extractAC(u, data) {
  if (data.ac !== undefined && data.ac !== null) return null;
  if (isPositive(u)) return { ac: true };
  if (isNegative(u)) return { ac: false };
  return null;
}

function extractParking(u, data) {
  if (data.parking !== undefined && data.parking !== null) return null;
  if (/nema|нема|без|bez|ne|не|nema parking|нема паркинг|nema garaza|нема гаража/i.test(u)) {
    return { parking: false };
  }
  if (isPositive(u) || /garaza|гаража|privat|приват|parking|паркинг|garage|гараж|podzemna|подземна|sopstveno|сопствено|pred zgrada|пред зграда|na -|на -|podzemno|подземно/i.test(u)) {
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
  if (/prazen|правен|gol|гол|bez namestaj|без мебел|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|ne e namesten|не е наместен|bez|без|nema|нема|ne|не|ne e|не е|prav|прав/i.test(u)) {
    return { furnished: false, furnishedLevel: "empty" };
  }
  if (/komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|se prodava namesten|се продава наместен|so namestaj|со мебел|namesten|наместен/i.test(u)) {
    return { furnished: true, furnishedLevel: "full" };
  }
  if (isPositive(u)) {
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
  if (/ne|не|nema|нема|ne e|не е|bez|без|not renovated|ништо|ne e renoviran|не е реновиран|nema renoviran|нема реновирано|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран|ne e renoviran|не е реновиран|ne e|не е/i.test(u)) {
    return { renovated: false, renovationYear: null };
  }
  // Check if year is embedded (e.g. "da renoviran 2000ta")
  const yearMatch = u.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return { renovated: true, renovationYear: parseInt(yearMatch[1]) };
  }
  if (/90ti|90 ти|90-ти|90ти|деведесетти/i.test(u)) {
    return { renovated: true, renovationYear: 1995 };
  }
  if (/80ti|80 ти|80-ти|80ти/i.test(u)) {
    return { renovated: true, renovationYear: 1985 };
  }
  if (/2000ti|2000 ти|двеилјадити/i.test(u)) {
    return { renovated: true, renovationYear: 2005 };
  }
  if (isPositive(u) || /реновиран|renoviran|обновен|obnoven|novo|нов|sreden|среден|kompletno renoviran|комплетно реновиран|delumno renoviran|делумно реновиран|skoro|скоро|nedavno|недавно|pre|пред|osvezhivme|освеживме|go osvezivme|го освеживме/i.test(u)) {
    return { renovated: true, renovationYear: null };
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
  if (data.renovated === false) return { renovationYear: null }; // Skip
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
  if (/cist|чист|ima|има|da|да|nema problem|нема проблем|nema|нема|cista|чиста|cisto|чисто|nema hipoteka|нема хипотека|nema ostavinska|нема оставинска|nema razvod|нема развод|nema sudski|нема судски|cist imoten list|чист имотен лист|ima cist imoten list|има чист имотен лист|nema teret|нема терет|nema zabrana|нема забрана|cisto|чисто|ima|има|na ime|на име|cisto na moe ime|чисто на мое име|na moe ime|на мое име/i.test(u)) {
    return { documentationClean: true, documentationIssues: null };
  }
  return null;
}

function extractOwnerName(u, data, originalInput) {
  if (data.ownerName !== undefined && data.ownerName !== null) return null;
  const src = originalInput || u;
  if (src.length > 3) return { ownerName: src.trim() };
  return null;
}

function extractAddress(u, data, originalInput) {
  if (data.address !== undefined && data.address !== null) return null;
  const src = originalInput || u;
  if (src.length > 3) return { address: src.trim() };
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
  extractDocumentationClean,
  extractOwnerName,
  extractAddress
];

// ========================================
// runGlobalExtraction — Main entry point
// ========================================
// Runs ALL extraction rules on user input and returns
// { field: value, ... } for any newly extracted data.
// Does NOT overwrite existing non-null values.
// ========================================
function runGlobalExtraction(u, currentData, originalInput) {
  const updates = {};
  for (const rule of EXTRACTION_RULES) {
    const result = rule(u, currentData, originalInput);
    if (result) {
      // Only add fields that aren't already set
      for (const [key, value] of Object.entries(result)) {
        const existing = currentData[key];
        if (existing === undefined || existing === null) {
          updates[key] = value;
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
