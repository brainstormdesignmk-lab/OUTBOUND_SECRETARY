import Groq from "groq-sdk";
import { config } from './config.js';
import { getNextMissingField, getQuestion } from './workflow.js';
import { getRentDefaults, calculateRentCommission } from './lib/commission.js';
import { cleanResponse } from './guardrails.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ========================================
// CONSTANTS
// ========================================
const PROPERTY_ROOT = '/home/metropolis2/Documents/NEKRETNINI_EVBR';
const START_ID = 100;
const CSV_PATH = '/home/metropolis2/real-estate-atoms/data/collected-leads.csv';

// ========================================
// HELPER: Get next property ID
// ========================================
function getNextPropertyId() {
  if (!fs.existsSync(PROPERTY_ROOT)) {
    fs.mkdirSync(PROPERTY_ROOT, { recursive: true });
    return START_ID;
  }
  
  const folders = fs.readdirSync(PROPERTY_ROOT);
  const numericFolders = folders
    .map(f => parseInt(f))
    .filter(n => !isNaN(n) && n >= START_ID);
  
  if (numericFolders.length === 0) return START_ID;
  return Math.max(...numericFolders) + 1;
}

// ========================================
// HELPER: Create property folder
// ========================================
function createPropertyFolder(propertyId, data) {
  const folderPath = join(PROPERTY_ROOT, String(propertyId));
  
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    fs.mkdirSync(join(folderPath, 'photos'), { recursive: true });
    fs.mkdirSync(join(folderPath, 'documents'), { recursive: true });
    fs.mkdirSync(join(folderPath, 'history'), { recursive: true });
  }
  
  const jsonPath = join(folderPath, 'property.json');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  
  return folderPath;
}

// ========================================
// HELPER: Format phone for Lovable
// ========================================
function formatPhoneForLovable(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('389')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.startsWith('00389')) {
    cleaned = cleaned.substring(5);
  }
  if (cleaned.length === 9) {
    return `${cleaned.substring(0, 3)}/${cleaned.substring(3, 6)}-${cleaned.substring(6, 9)}`;
  }
  return phone;
}

// ========================================
// HELPER: Save to CSV
// ========================================

function csvBool(value) {
  return value === undefined || value === null ? '' : String(value);
}
function csvNum(value) {
  return value === undefined || value === null ? '' : value;
}

function saveToCSV(data, phone, propertyId) {
  const dir = '/home/metropolis2/real-estate-atoms/data';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const csvPath = CSV_PATH;
  const isRent = data.transactionType === 'rent';
  
  let headers = [
    'phone', 'formattedPhone', 'propertyId',
    'transactionType'
  ];
  
  if (isRent) {
    headers = headers.concat([
      'monthlyRent',
      'depositMonths',
      'minimumStayMonths',
      'advanceRentMonths',
      'ownerCommissionFee',
      'tenantCommissionFee',
      'totalCommissionFee',
      'commissionRule'
    ]);
  } else {
    headers = headers.concat(['price']);
  }
  
  headers = headers.concat([
    'sqm', 'hasTerrace', 'terraceSqm',
    'bedrooms', 'floor', 'totalFloors', 'elevator',
    'heating', 'heatingType', 'ac', 'parking', 'parkingType',
    'orientation', 'orientationPrimary', 'orientationSecondary',
    'furnished', 'furnishedLevel',
    'yearBuilt', 'renovated', 'renovationYear',
    'documentationClean', 'documentationIssues',
    'photosPermission', 'photosSource', 'photosStatus',
    'ownerName', 'address'
  ]);
  
  let row = [
    phone || '',
    formatPhoneForLovable(phone || ''),
    propertyId || '',
    data.transactionType || 'sale'
  ];
  
  if (isRent) {
    const rentDefaults = getRentDefaults();
    const commission = data.monthlyRent ? calculateRentCommission(data.monthlyRent) : null;
    row = row.concat([
      data.monthlyRent || '',
      data.depositMonths || rentDefaults.depositMonths,
      data.minimumStayMonths || rentDefaults.minimumStayMonths,
      data.advanceRentMonths || rentDefaults.advanceRentMonths,
      commission ? commission.ownerFee : '',
      commission ? commission.tenantFee : '',
      commission ? commission.totalFee : '',
      commission ? commission.rule : ''
    ]);
  } else {
    row = row.concat([data.cleanPrice || '']);
  }
  
  row = row.concat([
    csvNum(data.totalSqm),
    csvBool(data.hasTerrace),
    data.terraceSqm !== undefined && data.terraceSqm !== null ? data.terraceSqm : '',
    csvNum(data.bedrooms),
    csvNum(data.floor),
    csvNum(data.totalFloors),
    csvBool(data.elevator),
    data.heating || '',
    data.heatingType || '',
    csvBool(data.ac),
    csvBool(data.parking),
    data.parkingType || '',
    data.orientation || '',
    data.orientationPrimary || '',
    data.orientationSecondary || '',
    csvBool(data.furnished),
    data.furnishedLevel || '',
    csvNum(data.yearBuilt),
    csvBool(data.renovated),
    csvNum(data.renovationYear),
    csvBool(data.documentationClean),
    data.documentationIssues || '',
    csvBool(data.photosPermission),
    data.photosSource || '',
    data.photosStatus || '',
    data.ownerName || '',
    data.address || ''
  ]);
  
  const exists = fs.existsSync(csvPath);
  const line = row.join(',') + '\n';
  
  if (!exists) {
    fs.writeFileSync(csvPath, headers.join(',') + '\n' + line);
  } else {
    fs.appendFileSync(csvPath, line);
  }
  
  console.log(`[CSV SAVED: ${row.join(', ')}]`);
}

// ========================================
// HELPER: Intent Classification via LLM
// ========================================
async function classifyIntent(userInput, conversation) {
  try {
    const prompt = `
Оцени го интересот на сопственикот за соработка со агенција за недвижности.

ПРЕТХОДЕН РАЗГОВОР:
${conversation || "Нема претходен разговор"}

ПОСЛЕДНА ПОРАКА ОД СОПСТВЕНИКОТ:
"${userInput}"

Врати само JSON со овој формат:
{
  "intent": "REJECTED" | "INTERESTED" | "ACCEPTED",
  "confidence": 0.0-1.0,
  "reason": "кратко објаснување зошто"
}

ПРАВИЛА ЗА КЛАСИФИКАЦИЈА:

ACCEPTED (јасна согласност, confidence > 0.8):
- "ајде", "може", "добро", "пробаме", "соработуваме"
- "во ред", "се согласувам", "прифаќам"
- "да" (кога е самостоен одговор)
- "ако е така може да пробаме"
- "pod vakvi uslovi", "zosto da ne", "zašto da ne", "зошто да не"

INTERESTED (отворен, но се уште не се согласил, confidence 0.3-0.8):
- "можеби", "размислувам", "не сум сигурен"
- "како работи?", "кои се условите?"
- "ќе размислам", "да видиме"
- "интересно", "може да биде"

REJECTED (јасно одбивање, confidence > 0.8):
- "не ми треба", "не сакам", "не сум заинтересиран"
- "остави ме", "не ме интересира"
- "извини, не"
- "не" (кога е самостоен одговор)

ВАЖНО:
- Ако пораката содржи прашање, веројатно е INTERESTED
- "не верувам на агенции" → INTERESTED
- "може да размислам" → INTERESTED
- "да, ајде" → ACCEPTED
- "значи ништо не земате" → INTERESTED (прашање, не одбивање)
`;

    const result = await groq.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: "Ти си класификатор за недвижности. Враќај само валиден JSON. Без објаснувања, без друг текст." 
        },
        { role: "user", content: prompt }
      ],
      model: config.MODEL || "llama3-70b-8192",
      temperature: 0.15,
      frequency_penalty: 0.15,
      max_tokens: 150
    });

    const content = result.choices[0]?.message?.content || '{"intent":"INTERESTED","confidence":0.5,"reason":"fallback"}';
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const jsonMatch = content.match(/\{.*\}/s);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = { intent: "INTERESTED", confidence: 0.5, reason: "parse fallback" };
      }
    }
    
    return {
      intent: parsed.intent || "INTERESTED",
      confidence: parsed.confidence || 0.5,
      reason: parsed.reason || "unknown"
    };
    
  } catch (e) {
    console.error("[CLASSIFY ERROR]:", e.message);
    return { intent: "INTERESTED", confidence: 0.5, reason: "error fallback" };
  }
}

// ========================================
// HELPER: Macedonian number words
// ========================================
function parseMacedonianNumber(text) {
  const words = {
    'еден': 1, 'edna': 1, 'eden': 1,
    'два': 2, 'dva': 2,
    'две': 2, 'dve': 2,
    'три': 3, 'tri': 3,
    'четири': 4, 'cetiri': 4,
    'пет': 5, 'pet': 5,
    'шест': 6, 'sest': 6,
    'седум': 7, 'sedum': 7,
    'осум': 8, 'osum': 8,
    'девет': 9, 'devet': 9,
    'десет': 10, 'deset': 10,
    'edinaeset': 11, 'единаесет': 11,
    'dvanaeset': 12, 'дванаесет': 12,
    'trinaeset': 13, 'тринаесет': 13,
    'cetirinaeset': 14, 'четиринаесет': 14,
    'petnaeset': 15, 'петнаесет': 15,
    'sesnaeset': 16, 'шеснаесет': 16,
    'sedumnaeset': 17, 'седумнаесет': 17,
    'osumnaeset': 18, 'осумнаесет': 18,
    'devetnaeset': 19, 'деветнаесет': 19,
    'ses': 6, 'cetri': 4, 'cetiri': 4,
    'vtor': 2, 'tret': 3, 'cetvrt': 4, 'petti': 5,
    'sesti': 6, 'sedmi': 7, 'osmi': 8, 'devetti': 9
  };
  
  // Longest-first sort: 'dvanaeset' (12) must match before 'dva' (2) is found as substring
  const sorted = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sorted) {
    if (text.includes(word)) return num;
  }
  return null;
}

// ========================================
// HELPER: Parse number words for price extraction (HUNDREDS + TENS)
// ========================================
function parseNumberWords(text) {
  const u = text.toLowerCase();
  
  // Single numbers
  const numberWords = {
    'eden': 1, 'edna': 1, 'edno': 1,
    'dva': 2, 'dve': 2,
    'tri': 3,
    'cetiri': 4, 'четири': 4,
    'pet': 5, 'пет': 5,
    'sest': 6, 'шест': 6,
    'sedum': 7, 'седум': 7,
    'osum': 8, 'осум': 8,
    'devet': 9, 'девет': 9,
    'deset': 10, 'десет': 10
  };
  
  // Check exact match
  for (const [word, num] of Object.entries(numberWords)) {
    if (u.trim() === word) {
      return num;
    }
  }
  
  // ========================================
  // HUNDREDS — "petsto", "pesto", "pet sto"
  // ========================================
  const hundredPatterns = [
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(sto|сто)/i,
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)sto/i,
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)сто/i,
  ];
  
  for (const pattern of hundredPatterns) {
    const match = u.match(pattern);
    if (match) {
      const map = {
        'eden': 1, 'edna': 1, 'edno': 1,
        'dva': 2, 'dve': 2,
        'tri': 3,
        'cetiri': 4,
        'pet': 5,
        'sest': 6,
        'sedum': 7,
        'osum': 8,
        'devet': 9
      };
      return map[match[1].toLowerCase()] * 100;
    }
  }
  
  // ========================================
  // TENS — "dvaeset", "dvajset", "dvadeset", "дваесет"
  // ========================================

  // Irregular tens forms with consonant mutation:
  //   triest (триест) = 30 (tri + est, shortened from trieset)
  //   pedeset (педесет) = 50 (pet→ped + eset)
  //   seeset (шеесет) = 60 (sest→see + set)
  const irregularTens = {
    'triest': 30, 'триест': 30,
    'pedeset': 50, 'педесет': 50,
    'seeset': 60, 'шеесет': 60
  };
  for (const [word, val] of Object.entries(irregularTens)) {
    if (u.includes(word)) return val;
  }

  const tensPatterns = [
    /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(eset|есет)/i,
    /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)eset/i,
    /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)есет/i,
    /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)ajset/i,
    /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)ајсет/i,
  ];
  
  for (const pattern of tensPatterns) {
    const match = u.match(pattern);
    if (match) {
      const map = {
        'dva': 2, 'dve': 2,
        'tri': 3,
        'cetiri': 4,
        'pet': 5,
        'sest': 6,
        'sedum': 7,
        'osum': 8,
        'devet': 9
      };
      return map[match[1].toLowerCase()] * 10;
    }
  }
  
  // ========================================
  // COMPOUND NUMBERS — "petstodvaeset", "pestodvajset"
  // ========================================
  const compoundMatch = u.match(/(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(sto|сто)?\s*(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(eset|есет|ajset|ајсет)/i);
  if (compoundMatch) {
    const map = {
      'eden': 1, 'edna': 1, 'edno': 1,
      'dva': 2, 'dve': 2,
      'tri': 3,
      'cetiri': 4,
      'pet': 5,
      'sest': 6,
      'sedum': 7,
      'osum': 8,
      'devet': 9
    };
    const hundreds = map[compoundMatch[1].toLowerCase()] || 0;
    const tens = map[compoundMatch[3].toLowerCase()] || 0;
    return (hundreds * 100) + (tens * 10);
  }
  
  return null;
}

// ========================================
// HELPER: Ordinal floors
// ========================================
function parseOrdinalFloor(text) {
  const ordinals = {
    'приземје': 0, 'prizemje': 0,
    'прв': 1, 'prv': 1,
    'втор': 2, 'vtor': 2,
    'трет': 3, 'tret': 3,
    'четврт': 4, 'cetvrt': 4,
    'петти': 5, 'petti': 5,
    'шести': 6, 'sesti': 6,
    'седми': 7, 'sedmi': 7,
    'осми': 8, 'osmi': 8,
    'деветти': 9, 'devetti': 9
  };
  
  for (const [word, num] of Object.entries(ordinals)) {
    if (text.includes(word)) return num;
  }
  return null;
}

// ========================================
// HELPER: Positive/Negative answers (EXPANDED)
// ========================================
function isPositive(text) {
  return /^da$|^ima$|da ima|има|да|yes|ok|moze|може|ke|ќе|normalno|нормално|seka|сека|sekako|секако|naravno|наравно|normal|нормално|ima|има|da|ok|da be|да бе|ima klima|има клима|normalno deka ima|нормално дека има|fala bogu|фала богу|fala|фала|hvala|хвала|ima terasa|има тераса|terasa|тераса|ima na oglasot|има на огласот|sakate|сакате|ke pratam|ќе пратам|pratam|пратам|imam|имам|moze da koristite|може да користите|slobodno|слободно|da ima|да има|komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|ke vi pratam|ќе ви пратам|ke pratam|ќе пратам|moze da pratam|може да пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|se prodava|се продава|na istata|на истата|normalno-|нормално-|normalno |нормално /i.test(text);
}

function isNegative(text) {
  return /^ne$|nema|нема|no|не|нега|без|ne|nema|не,|nema|нема|bez|без|nema terasa|нема тераса|nema parking|нема паркинг|nemam|немам|nemame|немаме|nema|нема|ne moze|не може|ne sakam|не сакам|nema sliki|нема слики|bez sliki|без слики|ne e|не е|ne|не|prav|прав|prazen|правен|gol|гол|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|bez namestaj|без мебел|ne e namesten|не е наместен|ne e renoviran|не е реновиран|ne e cist|не е чист|nema fotografi|нема фотографии|nema sliki|нема слики|ne sakam|не сакам|ne mi treba|не ми треба|ne sum zainteresiran|не сум заинтересиран|ostavi|остави|ne me interesira|не ме интересира|izvini|извини|nemam momentalno|немам моментално|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се|ti kazav|ти кажав|kazav|кажав|rekov|реков|ne e renoviran|не е реновиран|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран/i.test(text);
}

// ========================================
// HELPER: Extract first number from text
// ========================================
function extractFirstNumber(text) {
  const numbers = text.match(/\d{1,4}/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[0]);
  }
  return null;
}

// ========================================
// HELPER: Extract price (FIXED — handles all formats)
// ========================================
function extractPrice(text) {
  const u = text.toLowerCase(); // Convert once for all pattern matching

  // ========================================
  // 1. Handle word-based MILLIONS + THOUSANDS
  // e.g., "dva miliona petstodvaeset iljadi" → 2,520,000
  // ========================================
  const millionWordMatch = u.match(/(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionWordMatch) {
    const numMap = {
      'eden': 1, 'edna': 1, 'edno': 1,
      'dva': 2, 'dve': 2,
      'tri': 3,
      'cetiri': 4,
      'pet': 5,
      'sest': 6,
      'sedum': 7,
      'osum': 8,
      'devet': 9
    };
    let total = numMap[millionWordMatch[1].toLowerCase()] * 1000000;
    
    // Check for thousand part
    // Look for: "X iljadi" where X is a number word
    const thousandPatterns = [
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(iljadi|илјади)/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)iljadi/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)илјади/i,
      /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(iljadi|илјади)/i,
    ];
    
    let thousandNum = null;
    for (const pattern of thousandPatterns) {
      const match = u.match(pattern);
      if (match) {
        const map = {
          'eden': 1, 'edna': 1, 'edno': 1,
          'dva': 2, 'dve': 2,
          'tri': 3,
          'cetiri': 4,
          'pet': 5,
          'sest': 6,
          'sedum': 7,
          'osum': 8,
          'devet': 9
        };
        thousandNum = map[match[1].toLowerCase()] || 0;
        break;
      }
    }
    
    // If no simple number word, try parsing compound number (e.g., "petstodvaeset")
    if (thousandNum === null) {
      const compoundThousand = u.match(/([a-zа-я]+)\s*(iljadi|илјади)/i);
      if (compoundThousand) {
        const parsed = parseNumberWords(compoundThousand[1]);
        if (parsed !== null) {
          thousandNum = parsed;
        }
      }
    }
    
    if (thousandNum !== null && thousandNum > 0) {
      total += thousandNum * 1000;
    }
    
    return total;
  }

  // ========================================
  // 2. Handle word-based THOUSANDS only
  // e.g., "petstodvaeset iljadi" → 520,000
  // ========================================
  const thousandWordMatch = u.match(/([a-zа-я]+)\s*(iljadi|илјади)/i);
  if (thousandWordMatch) {
    const parsed = parseNumberWords(thousandWordMatch[1]);
    if (parsed !== null && parsed > 0) {
      return parsed * 1000;
    }
  }

  // ========================================
  // 1. Handle THOUSANDS (iljadi, илјади)
  // ========================================

  // Handle "98iljadi" (no space)
  const iljadiNoSpaceMatch = u.match(/(\d{1,3})iljadi/i);
  if (iljadiNoSpaceMatch) {
    return parseInt(iljadiNoSpaceMatch[1]) * 1000;
  }

  // Handle "98 iljadi" (with space)
  const iljadiSpaceMatch = u.match(/(\d{1,3})\s*iljadi/i);
  if (iljadiSpaceMatch) {
    return parseInt(iljadiSpaceMatch[1]) * 1000;
  }

  // Handle "98iljadi evra" (no space + evra)
  const iljadiNoSpaceEvraMatch = u.match(/(\d{1,3})iljadi\s*evra?/i);
  if (iljadiNoSpaceEvraMatch) {
    return parseInt(iljadiNoSpaceEvraMatch[1]) * 1000;
  }

  // Handle "98 iljadi evra" (with space + evra)
  const iljadiSpaceEvraMatch = u.match(/(\d{1,3})\s*iljadi\s*evra?/i);
  if (iljadiSpaceEvraMatch) {
    return parseInt(iljadiSpaceEvraMatch[1]) * 1000;
  }

  // Handle "98iljadi ev" (no space + ev)
  const iljadiNoSpaceEvMatch = u.match(/(\d{1,3})iljadi\s*ev/i);
  if (iljadiNoSpaceEvMatch) {
    return parseInt(iljadiNoSpaceEvMatch[1]) * 1000;
  }

  // Handle "98 iljadi ev" (with space + ev)
  const iljadiSpaceEvMatch = u.match(/(\d{1,3})\s*iljadi\s*ev/i);
  if (iljadiSpaceEvMatch) {
    return parseInt(iljadiSpaceEvMatch[1]) * 1000;
  }

  // Handle "98илјади" (Cyrillic, no space)
  const cyrillicNoSpaceMatch = u.match(/(\d{1,3})илјади/i);
  if (cyrillicNoSpaceMatch) {
    return parseInt(cyrillicNoSpaceMatch[1]) * 1000;
  }

  // Handle "98 илјади" (Cyrillic, with space)
  const cyrillicSpaceMatch = u.match(/(\d{1,3})\s*илјади/i);
  if (cyrillicSpaceMatch) {
    return parseInt(cyrillicSpaceMatch[1]) * 1000;
  }

  // Handle "98илјади евра" (Cyrillic, no space + evra)
  const cyrillicNoSpaceEvraMatch = u.match(/(\d{1,3})илјади\s*евра?/i);
  if (cyrillicNoSpaceEvraMatch) {
    return parseInt(cyrillicNoSpaceEvraMatch[1]) * 1000;
  }

  // Handle "98 илјади евра" (Cyrillic, with space + evra)
  const cyrillicSpaceEvraMatch = u.match(/(\d{1,3})\s*илјади\s*евра?/i);
  if (cyrillicSpaceEvraMatch) {
    return parseInt(cyrillicSpaceEvraMatch[1]) * 1000;
  }

  // Handle "98iljade" (typo: iljade instead of iljadi)
  const iljadiTypoMatch = u.match(/(\d{1,3})iljade/i);
  if (iljadiTypoMatch) {
    return parseInt(iljadiTypoMatch[1]) * 1000;
  }

  // Handle "98 iljade" (typo with space)
  const iljadeSpaceMatch = u.match(/(\d{1,3})\s*iljade/i);
  if (iljadeSpaceMatch) {
    return parseInt(iljadeSpaceMatch[1]) * 1000;
  }

  // ========================================
  // 2. Handle MILLIONS (miliona, милиона)
  // ========================================

  // Handle "2 miliona" → 2000000
  const millionMatch = u.match(/(\d+[.,]?\d*)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionMatch) {
    let num = parseFloat(millionMatch[1].replace(',', '.'));
    // Check if there's an additional "iljadi" part
    // e.g., "2 miliona i 150 iljadi" → 2150000
    const iljadiPart = u.match(/(?:i|плус|plus)\s*(\d+[.,]?\d*)\s*(iljadi|илјади)/i);
    if (iljadiPart) {
      const iljadiNum = parseFloat(iljadiPart[1].replace(',', '.'));
      return Math.round((num * 1000000) + (iljadiNum * 1000));
    }
    return Math.round(num * 1000000);
  }

  // ========================================
  // 3. Handle DECIMAL MILLIONS
  // ========================================

  // Handle "2.5 miliona" → 2500000
  const decimalMillionMatch = u.match(/(\d+[.,]\d+)\s*(miliona|miljon|милиона|милион)/i);
  if (decimalMillionMatch) {
    const num = parseFloat(decimalMillionMatch[1].replace(',', '.'));
    return Math.round(num * 1000000);
  }

  // ========================================
  // 4. Handle Vague "miliona" (no number)
  // ========================================

  // If they say "miliona" but no number, assume 1 million
  if (/miliona|милиона|miljon|милион/i.test(u) && !u.match(/\d+/)) {
    return 1000000;
  }

  // ========================================
  // 5. Default: strip spaces, dots, commas and extract number
  // ========================================

  const cleaned = text.replace(/[\s.,]/g, '');
  const match = cleaned.match(/(\d{3,7})/);
  return match ? parseInt(match[1]) : null;
}

// ========================================
// HELPER: Extract terrace number (looks for number near kvadrata or last number)
// ========================================
function extractTerraceNumber(text) {
  // Look for number before kvadrata/m2
  const sqmMatch = text.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв)/i);
  if (sqmMatch) return parseInt(sqmMatch[1]);
  
  // Otherwise, extract all numbers and take the LAST one (total)
  const numbers = text.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[numbers.length - 1]);
  }
  return null;
}

// ========================================
// HELPER: Parse year built (FIXED)
// ========================================
function parseYearBuilt(text) {
  const exactYearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (exactYearMatch) return parseInt(exactYearMatch[1]);
  
  const twoDigit = text.match(/\b(\d{2})\b/);
  if (twoDigit) {
    const year = parseInt(twoDigit[1]);
    if (year >= 0 && year <= 30) return 2000 + year;
    if (year >= 70 && year <= 99) return 1900 + year;
  }
  
  if (/80ti|80 ти|80-ти|80ти|осумдесетти|80-i|80i|осамдесетти/i.test(text)) return 1985;
  if (/80ta|80 та|80та|1980-ти|1980ти|осумдесетта|80-ta/i.test(text)) return 1980;
  if (/90ti|90 ти|90-ти|90ти|деведесетти|90-i|90i|деведесетти/i.test(text)) return 1995;
  if (/90ta|90 та|90та|1990-ти|1990ти|деведесетта|90-ta/i.test(text)) return 1990;
  if (/70ti|70 ти|70-ти|70ти|седумдесетти/i.test(text)) return 1975;
  if (/70ta|70 та|70та|седумдесетта/i.test(text)) return 1970;
  if (/2000ti|2000 ти|двеилјадити/i.test(text)) return 2005;
  if (/2000ta|2000 та|двеилјадита/i.test(text)) return 2000;
  
  if (/deveeset|девеесет|90|деведесет/i.test(text)) {
    if (/nekoja|некоја|nekoi|некои|неколку|некое|nekoe/i.test(text)) return 1995;
    return 1990;
  }
  
  if (/osemdeset|осумдесет|80/i.test(text)) {
    if (/nekoja|некоја|nekoi|некои|неколку|некое|nekoe/i.test(text)) return 1985;
    return 1980;
  }
  
  return null;
}

// ========================================
// HELPER: Parse orientation (EXPANDED with typos)
// ========================================
function parseOrientation(text) {
  let normalized = text
    .replace(/zadap|zapat|zapad/g, 'zapad')
    .replace(/istk|istk|isok/g, 'istok')
    .replace(/severz|severz|severj/g, 'sever')
    .replace(/jugoj/g, 'jug')
    .replace(/jugo/g, 'jug');
  
  const orientations = [];
  if (/sever|север|north/i.test(normalized)) orientations.push('sever');
  if (/jug|југ|south/i.test(normalized)) orientations.push('jug');
  if (/istok|исток|east/i.test(normalized)) orientations.push('istok');
  if (/zapad|запад|west/i.test(normalized)) orientations.push('zapad');
  return orientations.length > 0 ? orientations : null;
}

// ========================================
// OBJECTION LIBRARY — Hardcoded Responses (LOCKED)
// ========================================
const OBJECTION_RESPONSES = {
  'commission': {
    pattern: /како без провизија|без провизија|koi vi se uslovite|какви се условите|kako rabotite|како работите|kako funkcionira|како функционира|sto znaci bez provizija|што значи без провизија|kako bez provizija|kako toa|како тоа|kako e toa|како е тоа|sto e ova|што е ова|kakva sorabotka|каква соработка|kakva e taa sorabotka|каква е таа соработка|kako mislis bez provizija|како мислиш без провизија|kakva e taa sorabotka bez provizija|каква е таа соработка без провизија|kako toa bez provizija|како тоа без провизија|kako funkcionira toa|како функционира тоа|sto znaci toa|што значи тоа/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?'
  },
  'who_pays': {
    pattern: /кој ве плаќа|koj ve plakja|кој ви плаќа|кој ви дава пари|koj vi plakja|koj vi dava pari|kako vi plakjaat|како ви плаќаат|kako se naplakjate|како се наплаќате|koj ve plakja vas|кој ве плаќа вас|koj plakja|кој плаќа|koj vi plakja za uslugata|кој ви плаќа за услугата|koi vi plakjaat|кои ви плаќаат|koj vi dava pari|кој ви дава пари|koj vi gi dava parite|кој ви ги дава парите|koj ve plakja|кој ве плаќа|koj vi e platnikot|кој ви е платникот|koi se platnicite|кои се платниците|kako vi se naplakja|како ви се наплаќа|kako vi naplakjate|како ви наплаќате|koj vi e klientot|кој ви е клиентот|koi vi se klientite|кои ви се клиентите/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви се разјасни принципот?'
  },
  'trust': {
    pattern: /не верувам на агенции|не им верувам|агенциите се лажни|agency scam|ne veruvam na agencii|ne im veruvam|agenciite se lazni|ne veruvam|не верувам|ne sum siguren|не сум сигурен|ne vi veruvam|не ви верувам|ne im veruvam na agenciite|не им верувам на агенциите|ne veruvam na agenciite|не верувам на агенциите|agenciite ne se dobri|агенциите не се добри|agenciite se prevara|агенциите се превара|ne vi veruvam deka|не ви верувам дека|ne vi veruvam na zbor|не ви верувам на збор|ne vi veruvam deka ke|не ви верувам дека ќе|ne veruvam deka|не верувам дека|se shto kazuvate|се што кажувате|ne vi veruvam|не ви верувам|ne imam doverba|не имам доверба|doverba nemam|доверба немам|ne veruvam vo agencii|не верувам во агенции|agenciite se isti|агенциите се исти|site agencii se isti|сите агенции се исти|agenciite ne se dobri|агенциите не се добри|agenciite se lazni|агенциите се лажни|agenciite se prevara|агенциите се превара|ne mi se veruva|не ми се верува|ne veruvam vo toa|не верувам во тоа|ne veruvam deka e taka|не верувам дека е така|ne veruvam deka moze|не верувам дека може|ne veruvam deka ke|не верувам дека ќе|ne veruvam na nikoj|не верувам на никој|ne veruvam na site|не верувам на сите|ne veruvam na vasiot|не верувам на вашиот|ne veruvam na vasi|не верувам на ваши|ne veruvam na ova|не верувам на ова|ne veruvam na takvi|не верувам на такви|ne veruvam na agenciite|не верувам на агенциите|ne veruvam na agencii|не верувам на агенции|agenciite ne mi se dopagaat|агенциите не ми се допаѓаат|agenciite ne se kredibilni|агенциите не се кредибилни|agenciite se nesigurni|агенциите се несигурни/i,
    response: 'Разбирам. Затоа работиме без провизија од ваша страна и вие сами одлучувате дали ќе прифатите понуда. Дали ви звучи фер?'
  },
  'how_do_i_get': {
    pattern: /како ја добивам цената|kako ja dobivam cenata|како ја добивам мојата цена|kako ja dobivam mojata cena|како ќе ја добијам цената|kako ke ja dobijam cenata|како ми плаќате|kako mi plakjate|kako ja zadrzuvam|како ја задржувам|како доаѓам до пари|kako doagjam do pari|kako ja dobivam mojata cena|како ја добивам мојата цена|kako da ja dobijam cenata|како да ја добијам цената|kako da ja zadrzam cenata|како да ја задржам цената|kako funkcionira cenata|како функционира цената|kako se odreduva cenata|како се одредува цената|kako ja dobivam platata|како ја добивам платата|kako ja dobivam sumata|како ја добивам сумата|kako ja dobivam provizijata|како ја добивам провизијата|kako ja dobivam mojata|како ја добивам мојата|kako ja dobivam vashata|како ја добивам вашата|kako ja dobivam|како ја добивам|kako da dobijam|како да добијам|kako da stignam do|како да стигнам до|kako da stignam do cenata|како да стигнам до цената|kako da stignam do mojata|како да стигнам до мојата|kako da stignam do vashata|како да стигнам до вашата|kako da stignam do sumata|како да стигнам до сумата|kako da stignam do provizijata|како да стигнам до провизијата/i,
    response: 'Вие ја задржувате вашата барана цена. Ние додаваме процент за маркетинг и документација. Дали ви е јасно?'
  },
  'percentage': {
    pattern: /колку проценти|kolku procenti|колку %|kolku %|колку додавате|kolku dodavate|колку е вашиот дел|kolku e vasiot del|колку над цената|kolku nad cenata|koja vi e provizijata|која ви е провизијата|колку земате|колку е вашата провизија|kolku % zimate|колку % земате|kolku dodavate nad cenata|колку додавате над цената|kolku procenti dodavate|колку проценти додавате|kolku vi e provizijata|колку ви е провизијата|kolku e vashata provizija|колку е вашата провизија|kolku se naplakjate|колку се наплаќате|kolku procenti se naplakjate|колку проценти се наплаќате|kolku e vasiot procent|колку е вашиот процент|kolku procenti zimate od prodazba|колку проценти земате од продажба|kolku e vashata naknada|колку е вашата надокнада|kolku procenti vi se|колку проценти ви се|kolku e vasiot del od cenata|колку е вашиот дел од цената|kolku dodavate na cenata|колку додавате на цената|kolku e vashata provizija|колку е вашата провизија|kolku se naplakja|колку се наплаќа|kolku vi naplakjate|колку ви наплаќате|kolku e vashata nadoknada|колку е вашата надокнада|kolku e vasiot trosek|колку е вашиот трошок|kolku e vashata taksa|колку е вашата такса/i,
    response: 'Ние додаваме 2% над вашата барана цена. Тоа е нашата провизија. Дали ви е јасно?'
  },
  'faster_sale': {
    pattern: /како вие побрзо би го продале|kako vie pobrzo bi go prodale|како би го продале побрзо|kako bi go prodale pobrzo|зошто преку вас побрзо|zosto preku vas pobrzo|како вие би го продале|kako vie bi go prodale|вие побрзо|vie pobrzo|побрзо преку вас|pobrzo preku vas|како преку вас|kako preku vas|зошто преку агенција|zosto preku agencija|како агенцијата би го продала|kako agencijata bi go prodala|како вие|kako vie|вие би|vie bi|преку вас|preku vas|kako vie bi go prodale pobrzo|како вие би го продале побрзо|vie bi go prodale pobrzo|вие би го продале побрзо|kako bi go prodale preku vas|како би го продале преку вас|zasto preku vas|зашто преку вас|kako vie ke go prodadete|како вие ќе го продадете|vie ke go prodadete|вие ќе го продадете|kako ke go prodadete|како ќе го продадете|pobrzo prodazba|побрза продажба|brza prodazba|брза продажба|prodazba preku agencija|продажба преку агенција|agencija pobrzo|агенција побрзо|vie ke go prodadete|вие ќе го продадете|kako vie|како вие|vie ste podobri|вие сте подобри|vie bi go prodale|вие би го продале|kako bi go prodale|како би го продале|pobrzo od mene|побрзо од мене|podobro od mene|подобро од мене|kako vie bi go prodale podobro|како вие би го продале подобро|vie bi go prodale podobro|вие би го продале подобро|kako bi go prodale podobro|како би го продале подобро|podobro preku vas|подобро преку вас/i,
    response: 'Агенцијата има голема база на потенцијални клиенти кои се спремни да купат, ако нешто им се допадне. Дали би пробале агенциски третман за вашата недвижност?'
  },
  'example': {
    pattern: /пример|primer|дај пример|daj primer|објасни ми|objasni mi|дај ми пример|daj mi primer|kazi mi primer|кажи ми пример|kako bi izgledalo|како би изгледало|daj mi primer|дај ми пример|znaci|значи|objasni|објасни|kazi|кажи|sto znaci|што значи|kako funkcionira|како функционира|kako bi izgledalo vo praksa|како би изгледало во пракса|kako bi tecelo|како би течело|kako bi se odvilo|како би се одвило|kako bi se realiziralo|како би се реализирало|kako bi izgledala sorabotkata|како би изгледала соработката|kako bi funkcionirala sorabotkata|како би функционирала соработката|kako bi izgledal procesot|како би изгледал процесот|kako bi se odvila prodazbata|како би се одвила продажбата|kako bi izgledalo toa|како би изгледало тоа|kako bi se realiziralo toa|како би се реализирало тоа|kako bi se odvilo toa|како би се одвило тоа|kako bi tecelo toa|како би течело тоа|kako bi izgledalo vo praksa|како би изгледало во пракса|kako bi funkcioniralo toa|како би функционирало тоа|kako bi izgledalo|како би изгледало|kako bi funkcioniralo|како би функционирало|kako bi se realiziralo|како би се реализирало|kako bi se odvilo|како би се одвило|kako bi tecelo|како би течело|kako bi izgledalo|како би изгледало|kako bi bilo|како би било/i,
    response: 'На пример, ако вие барате 120.000 евра, а ние најдеме купувач за 122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е наша провизија. Дали ви помогна примерот?'
  },
  'rent_timing': {
    pattern: /кога треба да ви платам|кога се плаќа|кога ја плаќам провизијата|кога ви плаќам|koga treba da vi platam|koga se plakja|koga vi plakjam|koga treba da vi platam provizija|кога треба да ви платам провизија|koga plakjam provizija|кога плаќам провизија|na den na potpis|на ден на потпис|na den na dogovor|на ден на договор|koga se plakja provizijata|кога се плаќа провизијата|koga treba da vi platam za uslugata|кога треба да ви платам за услугата|koga se plakja provizijata za izdavanje|кога се плаќа провизијата за издавање|koga treba da vi platam za kirija|кога треба да ви платам за кирија|koga se plakja agencijata|кога се плаќа агенцијата|koga treba da vi platam agencija|кога треба да ви платам агенција|koga se plakja provizija|кога се плаќа провизија|koga treba da se plati|кога треба да се плати|koga e plakanjeto|кога е плаќањето|koga se naplakja|кога се наплаќа|koga treba da vi platam|кога треба да ви платам|koga se plakja|кога се плаќа|koga treba da plakam|кога треба да плаќам|koga e rokot|кога е рокот|koga e vremeto|кога е времето|koga treba da se uplati|кога треба да се уплати|koga se vrsi uplatata|кога се врши уплатата|koga treba da se izvrsi uplata|кога треба да се изврши уплата|koga se podmiruva|кога се подмирува|koga se namiruva|кога се намирува|koga se regulira|кога се регулира|koga se plakja na agencijata|кога се плаќа на агенцијата|koga treba da se plakja na agencijata|кога треба да се плаќа на агенцијата|koga se plakja na dogovor|кога се плаќа на договор|koga treba da se plakja na dogovor|кога треба да се плаќа на договор|koga se plakja na potpis|кога се плаќа на потпис|koga treba da se plakja na potpis|кога треба да се плаќа на потпис/i,
    response: 'Провизијата се плаќа на денот на потпишување на договорот за издавање. Вие ја плаќате провизијата на агенцијата истиот ден кога клиентот ги плаќа првата кирија и депозитот. Дали ви е појасно?'
  },
  'obligations': {
    pattern: /обврски|obvrski|обврска|obvrska|други обврски|drugi obvrski|дополнителни обврски|dopolnitelni obvrski|обврски кон вас|obvrski kon vas|obvrski prema vas|обврски према вас|kakvi drugi obvrski|какви други обврски|kakvi obvrski imam|какви обврски имам|sto treba da vi platam|што треба да ви платам|sto vi dolzam|што ви должам|dolzam li nesto|должам ли нешто|dolgam li nesto|долгам ли нешто|dolg sum|долг сум|dolzhi|должи|dolg|долг|obvrska|обврска|obvrski kon vas|обврски кон вас|obvrski prema vas|обврски према вас|drugi obvrski|други обврски|dopolnitelni obvrski|дополнителни обврски|obvrski|обврски|obvrska|обврска|obvrski kon agencijata|обврски кон агенцијата|obvrski prema agencijata|обврски према агенцијата|kakvi obvrski imam kon vas|какви обврски имам кон вас|kakvi obvrski imam prema vas|какви обврски имам према вас|sto treba da vi plakjam|што треба да ви плаќам|sto vi dolzam|што ви должам|dolzam|должам|dolg|долг|obvrski|обврски|obvrska|обврска|kakvi drugi obvrski|какви други обврски|dopolnitelni obvrski|дополнителни обврски|obvrski kon vas|обврски кон вас|obvrski prema vas|обврски према вас|obvrski kon agencijata|обврски кон агенцијата|obvrski prema agencijata|обврски према агенцијата|sto treba da vi platam|што треба да ви платам|sto vi dolzam|што ви должам|dolzam|должам|dolg|долг|obvrski|обврски|obvrska|обврска|kakvi drugi obvrski|какви други обврски|dopolnitelni obvrski|дополнителни обврски|obvrski kon vas|обврски кон вас|obvrski prema vas|обврски према вас|obvrski kon agencijata|обврски кон агенцијата|obvrski prema agencijata|обврски према агенцијата|sto treba da vi platam|што треба да ви платам|sto vi dolzam|што ви должам|dolzam|должам|dolg|долг|obvrski|обврски|obvrska|обврска|kakvi drugi obvrski|какви други обврски|dopolnitelni obvrski|дополнителни обврски|obvrski kon vas|обврски кон вас|obvrski prema vas|обврски према вас|obvrski kon agencijata|обврски кон агенцијата|obvrski prema agencijata|обврски према агенцијата|sto treba da vi platam|што треба да ви платам|sto vi dolzam|што ви должам|dolzam|должам|dolg|долг/i,
    response: 'Немате други обврски кон нас. Дали сте расположени да соработуваме?'
  }
};

function matchObjection(text) {
  for (const [key, obj] of Object.entries(OBJECTION_RESPONSES)) {
    if (obj.pattern.test(text)) {
      return { key, response: obj.response };
    }
  }
  return null;
}

// ========================================
// HELPER: Rent Topic Detection
// ========================================
function isAskingAboutRentRules(text) {
  return /депозит|depozit|минимален период|minimum stay|стандардно|standardno|uslovi za izdavanje|услови за издавање|kako rabotite|како работите|sorabotka za kirija|соработка за кирија|deposit|depozit|kirija|кирија|prv mesec|прв месец|dogovor|договор|potpis|потпис|kako funkcionira|како функционира|kako tece|како тече|standardno|стандардно|kako izdavate|како издавате|kako se izdava|како се издава/i.test(text);
}

function isAskingAboutRentCommission(text) {
  return /провизија|provizija|%|procent|колку проценти|kolku procenti|колку земате|kolku zimate|ваша провизија|vasa provizija|плаќам провизија|plakjam provizija|50%|50 |neli|нели|zar|зар|ne e 50|не е 50|50% od mene|50% од мене|50% od kupuvacot|50% од купувачот|neli e 50|нели е 50|zar ne e 50|зар не е 50/i.test(text) && /izdavanje|издавање|kirija|кирија|rent|rental|zakup|закуп/i.test(text);
}

function isAskingAboutCommission(text) {
  return /провизи|provizija|plakja|плаќа|koj vi|кој ви|kako vi|како ви|komisija|комисија|koj plakja|кој плаќа|kolku zimate|колку земате|sto zimate|што земате|dali vi plakjam|дали ви плаќам|uslovi|услови|condition|terms|vasi uslovi|ваши услови|kako rabotite|како работите|sorabotka|соработка|kakva vi e provizijata|каква ви е провизијата|kakvi se uslovite|какви се условите|koi vi se uslovite|кои ви се условите|kakvi se vasi|какви се ваши|nisto ne zemate|ништо не земате|ne zemate|не земате|od mojot del|од мојот дел|vie zemate|вие земате|sto zemate|што земате|dali zimate|дали земате|vie naplakjate|вие наплаќате|kako se naplakjate|како се наплаќате|kako vi e provizijata|како ви е провизијата|znaci nisto|значи ништо|znaci ne|значи не|znaci bez|значи без|kakvi drugi obvrski|какви други обврски|drugi obvrski|други обврски|obvrski kon vas|обврски кон вас|sto treba da vi platam|што треба да ви платам|kolku procenti|колку проценти|kolku %|колку %|kolku e provizijata|колку е провизијата|kolku iznesuva provizijata|колку изнесува провизијата|kolku se naplakjate|колку се наплаќате|kolku e vashata provizija|колку е вашата провизија|kolku zimate|колку земате|kolku vi e provizijata|колку ви е провизијата|kolku vi naplakjate|колку ви наплаќате|kolku procenti zimate|колку проценти земате|kolku dodavate|колку додавате|kolku e vasiot del|колку е вашиот дел|kolku nad cenata|колку над цената|koja vi e provizijata|која ви е провизијата|kolku e vashata naknada|колку е вашата надокнада|kolku procenti vi e|колку проценти ви е|kolku se naplakja|колку се наплаќа|kolku vi se|колку ви се/i.test(text);
}

function isAskingForExplanation(text) {
  return /kako|како|objasni|објасни|primer|пример|kazi|кажи|znaci|значи|sto znac|што зна|tocno|точно|pojasni|појасни|proveri|провери|potvrdi|потврди|ne razbiram|не разбирам|ne znam|не знам/i.test(text);
}

function isAskingAboutPhone(text) {
  return /od kade|од каде|brojot|бројот|каде го добивте|od kade vi e|од каде ви е|kako go dobivte|како го добивте/i.test(text);
}

// ========================================
// HELPER: Check if asking how the process works
// ========================================
function isAskingHowItWorks(text) {
  return /како би одело|kako bi odelo|како функционира|kako funkcionira|како тече|kako tece|како изгледа|kako izgleda|како работи|kako raboti|како би одела|kako bi o dela|kako bi izgledalo|како би изгледало|kako se odviva|како се одвива|kako e procesot|како е процесот|kako funkcionira procesot|како функционира процесот|kako tece procesot|како тече процесот|kako raboti ova|како работи ова|kako funkcionira ova|како функционира ова|kako bi odelo ova|како би одело ова|kako bi odela sorabotkata|како би одела соработката|kako tece sorabotkata|како тече соработката|kako funkcionira sorabotkata|како функционира соработката/i.test(text);
}

// ========================================
// HELPER: Check if asking about clients
// ========================================
function isAskingAboutClients(text) {
  return /клиент|klient|клиенти|klienti|заинтересиран|zainteresiran|купци|kupci|spremen|ready|imat klient|imate klient|klient spremen|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент|klienti|клиенти|kupuvac|купувач|kupuvaci|купувачи/i.test(text);
}

// ========================================
// HELPER: Check if asking where to send photos
// ========================================
function isAskingWhereToSendPhotos(text) {
  return /tuka da vi pratam|тука да ви пратам|kade da vi pratam|каде да ви пратам|pratam ovde|пратам овде|ovde da vi pratam|овде да ви пратам|kade da gi pratam|каде да ги пратам|na viber da vi pratam|на вајбер да ви пратам|preku viber|преку вајбер|na viber|на вајбер/i.test(text);
}

export function generateFirstMessage(lead) {
  const title = (lead.title || '').toLowerCase();
  let propertyType = 'apartment';
  let propertyLabel = 'имотот';

  if (/stan|стан/i.test(title)) {
    propertyType = 'apartment';
    propertyLabel = 'станот';
  } else if (/kuk|куќ|house|villa|vila/i.test(title)) {
    propertyType = 'house';
    propertyLabel = 'куќата';
  } else if (/plac|плац|land/i.test(title)) {
    propertyType = 'land';
    propertyLabel = 'плацот';
  } else if (/lokal|office|commercial/i.test(title)) {
    propertyType = 'commercial';
    propertyLabel = 'локалот';
  }

  const transactionType = /издава|изнајмува|rent|rental/i.test(title) ? 'rent' : 'sale';

  const text = transactionType === 'rent'
    ? `Здраво, јас сум Ана од Metropolis. Ве контактирам за огласот за ${propertyLabel} што се издава. Дали е сѐ уште достапен и дали сте заинтересирани за соработка?`
    : `Здраво, јас сум Ана од Metropolis. Ве контактирам за огласот за ${propertyLabel} што се продава. Дали е сѐ уште достапен и дали сте заинтересирани за соработка без провизија за вас?`;

  return {
    text,
    type: "GREETING",
    memory: { transactionType, propertyType, propertyLabel }
  };
}

export async function generateResponse(session, userInput) {
  try {
    if (!session.collectedData) {
      session.collectedData = { cooperationAccepted: false };
    }
    if (!session.commissionExplained) {
      session.commissionExplained = false;
    }
    if (!session.rejectionCount) {
      session.rejectionCount = 0;
    }

    const u = userInput.toLowerCase().trim();
    const conv = session.messages?.filter(m => m.text).map(m => `${m.role === 'model' ? 'Ана' : 'Сопственик'}: ${m.text}`).join('\n') || "";

    const isRent = session.adMemory?.transactionType === 'rent' || session.collectedData?.transactionType === 'rent';
    
    // ========================================
    // HARDCODED: Availability confirmation (with negative lookahead to prevent false matches)
    // ========================================
    if (!session.collectedData.cooperationAccepted &&/uste go imam|уште го имам|dostapen e|достапен е|sloboden e|слободен е|seuste e dostapen|сè уште е достапен|go imam|го имам|uste e|уште е|dostapen|достапен|da imam|да имам|uste go imam da|уште го имам да|da uste go imam|да уште го имам|seuste go imam|сè уште го имам|go imam uste|го имам уште|uste e sloboden|уште е слободен|e sloboden|е слободен|dostapno e|достапно е|seuste e dostapno|сè уште е достапно|ima uste|има уште|uste ima|уште има|go ima uste|го има уште|uste go ima|уште го има|go ima|го има|uste go imam|уште го имам|go nema|го нема|nema go|нема го|ne e dostapen|не е достапен|ne e|не е|go nema uste|го нема уште|uste go nema|уште го нема|seuste e|сè уште е|seuste go imam|сè уште го имам|dostapna e|достапна е|slobodna e|слободна е|seuste e dostapna|сè уште е достапна|uste e dostapna|уште е достапна|dostapni se|достапни се|seuste se dostapni|сè уште се достапни|uste se dostapni|уште се достапни|go imam uste|го имам уште|uste go imam|уште го имам|go imam seuste|го имам сè уште|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|nema|нема|nema go|нема го|go nema|го нема|ne e|не е|go nema uste|го нема уште|uste go nema|уште го нема|nema uste|нема уште|seuste e|сè уште е|dostapen|достапен|dostapna|достапна/i.test(u) && !/terasa|тераса|klima|клима|parking|паркинг|procent|процент|obvrski|обврски|klient|клиент|broj|број|kancelari|канцелари|sorabotka|соработка|uslovi|услови|garaza|гаража|garage|гараж|lift|лифт|m2|квадрати|kvadrati|heating|греење|parno|парно/i.test(u)) {
      const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'станот' :
                            session.adMemory?.propertyType === 'house' ? 'куќата' :
                            session.adMemory?.propertyType === 'land' ? 'плацот' :
                            session.adMemory?.propertyType === 'commercial' ? 'локалот' : 'имотот';
      
      const responses = [
        `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го понудиме на нашите клиенти, без провизија за вас?`,
        `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го продадеме во најкраток можен рок, без никакви давачки за вас?`,
        `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале нашата агенција да се погрижи за професионална продажба, без никакви обврски од ваша страна?`
      ];
      
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      // Store that we already acknowledged availability
      session.availabilityAcknowledged = true;
      
      return {
        text: response,
        type: "NORMAL"
      };
    }

    // ========================================
    // HARDCODED: Objection Router (BEFORE anything else)
    // ========================================
    
        // Check for price quotes like "baram 156iljadi", "сакам 120000", "цена 150000"
    const priceQuoteMatch = u.match(/\b(baram|сакам|цена|price|cena)\s*(\d{1,3}(?:[.,]\d{3})*)/i);
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
      
      return {
        text: `Вие барате ${price.toLocaleString()} евра. Тоа е вашата чиста цена, а ние додаваме над неа. Дали сте расположени да соработуваме?`,
        type: "NORMAL"
      };
    } // ← THIS BRACE WAS MISSING!
    
    // HARDCODED: How does it work?
    if (isAskingHowItWorks(u)) {
      return {
        text: "Секоја недвижнина се внесува во системот на агенцијата со податоци за неа, се организираат посети и продажба. Како ви звучи ова?",
        type: "NORMAL"
      };
    }

   // HARDCODED: Client question
    if (/клиент|klient|клиенти|klienti|заинтересиран|zainteresiran|купци|kupci|spremen|ready|imat klient|imate klient|klient spremen|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент/i.test(u)) {
      return {
        text: "Постојано имаме потенцијални клиенти заинтересирани за тој реон. Дали да почнеме со соработка?",
        type: "NORMAL"
      };
    }

   // HARDCODED: "za kakva sorabotka prasuvas?"
if (/za kakva sorabotka|каква соработка|kakva sorabotka|за каква соработка/i.test(u)) {
  return {
    text: 'Соработката значи дека ние го промовираме вашиот стан на нашите канали и наоѓаме купувач, а вие ја добивате вашата цена. Дали ви се допаѓа идејата?',
    type: "NORMAL"
  };
}

   // HARDCODED: "kako bi sorabotuvale?"
if (/kako bi sorabotuvale|како би соработувале|како да соработуваме|kako da sorabotuvaме/i.test(u)) {
  return {
    text: 'Соработката е едноставна: ние го промовираме имотот, доведуваме заинтересирани купувачи, а вие одлучувате дали да прифатите понуда. Како ви звучи?',
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
        return {
          text: 'За издавање, провизијата зависи од месечната кирија. Доколку киријата е до 1000 евра, вие како сопственик плаќате 50% од една месечна кирија. Доколку киријата е над 1000 евра, вие плаќате една цела месечна кирија. Ние се грижиме за целокупниот процес на издавање, документација и избор на соодветен клиент.',
          type: "NORMAL"
        };
      }
      
      const objection = matchObjection(u);
      if (objection) {
        session.commissionExplained = true;
        return {
          text: objection.response,
          type: "NORMAL"
        };
      }
      
      if (!session.commissionExplained) {
        session.commissionExplained = true;
        return {
          text: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата.',
          type: "NORMAL"
        };
      } else if (isAskingForExplanation(u)) {
        return {
          text: 'На пример, ако вие барате 120.000 евра, а ние најдеме купувач за 122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е наша провизија.',
          type: "NORMAL"
        };
      } else {
        return {
          text: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?',
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
    if (!session.collectedData.cooperationAccepted && isAskingAboutPhone(u)) {
      return {
        text: "Го добив вашиот број од огласот за станот што го објавивте. Ние работиме без провизија за вас. Дали сте заинтересирани за соработка?",
        type: "NORMAL"
      };
    }

    // ========================================
    // PHASE DETECTION
    // ========================================
    const alreadyInDataCollection = session.collectedData.cooperationAccepted === true;
    let classification = null;
    let phase = "PERSUASION";
    
    if (!alreadyInDataCollection) {
      classification = await classifyIntent(u, conv);
      console.log(`[INTENT: ${classification.intent}, CONFIDENCE: ${classification.confidence}]`);
      
      if (classification.intent === "ACCEPTED" && classification.confidence > 0.7) {
        session.collectedData.cooperationAccepted = true;
        session.rejectionCount = 0;
        if (!session.collectedData.transactionType && session.adMemory?.transactionType) {
          session.collectedData.transactionType = session.adMemory.transactionType;
        }
        phase = "DATA_COLLECTION";
        console.log(`[COOPERATION: ACCEPTED]`);
      } else if (classification.intent === "REJECTED" && classification.confidence > 0.7) {
        session.rejectionCount = (session.rejectionCount || 0) + 1;
        console.log(`[REJECTION COUNT: ${session.rejectionCount}]`);
        
        if (session.rejectionCount === 1) {
          return {
            text: "Агенцијата не зема ништо од вас за услугата. Само ви ги зголемува шансите за побрза продажба на вашиот имот. Да пробаме?",
            type: "NORMAL"
          };
        } else if (session.rejectionCount === 2) {
          return {
            text: "Не ве разбирам. Сакате да продадете, експерти ви ја нудат својата услуга без надокнада од ваша страна, а вие одбивате. Што велите да се обидеме?",
            type: "NORMAL"
          };
        } else {
          return {
            text: "Разбирам. Доколку се предомислите, слободно контактирајте нѐ.",
            type: "CLOSED"
          };
        }
      } else if (classification.intent === "INTERESTED" && classification.confidence < 0.3) {
        return { 
          text: "Разбирам. Доколку се предомислите, слободно контактирајте нѐ.", 
          type: "CLOSED" 
        };
      } else {
        phase = "PERSUASION";
        if (classification.intent === "INTERESTED" && classification.confidence > 0.5) {
          session.rejectionCount = 0;
        }
      }
    } else {
      phase = "DATA_COLLECTION";
      console.log(`[PHASE: DATA_COLLECTION]`);
    }

    let nextField = null;
    let hasScraperPhotos = false;
    
    if (phase === "DATA_COLLECTION") {
      const known = { ...session.adMemory, ...session.collectedData };
      nextField = getNextMissingField(known);
      
      if (session.adMemory?.photoUrls && session.adMemory.photoUrls.length > 0) {
        hasScraperPhotos = true;
      }
    }

    // ========================================
    // MEMORY EXTRACTION (Context-aware)
    // ========================================
    
    // === cleanPrice (Sale) / monthlyRent (Rent) ===
    if (nextField === 'cleanPrice' || nextField === 'monthlyRent') {
      const price = extractPrice(u);
      if (price !== null) {
        if (nextField === 'cleanPrice') {
          session.collectedData.cleanPrice = price;
          console.log(`[PRICE: ${session.collectedData.cleanPrice}]`);
        } else {
          session.collectedData.monthlyRent = price;
          console.log(`[MONTHLY RENT: ${session.collectedData.monthlyRent}]`);
        }
      }
    }

    // === totalSqm ===
    if (nextField === 'totalSqm') {
      const sqmMatch = u.match(/(\d{2,4})\s*(m2|м2|квадрати|кв|sqm|kvadrati|kvadrata|квадрата|квадрат|kv|кв)/i);
      if (sqmMatch) {
        session.collectedData.totalSqm = parseInt(sqmMatch[1]);
        console.log(`[SQM: ${session.collectedData.totalSqm}]`);
      } else {
        const firstNum = extractFirstNumber(u);
        if (firstNum !== null && firstNum >= 10 && firstNum <= 999) {
          session.collectedData.totalSqm = firstNum;
          console.log(`[SQM: ${session.collectedData.totalSqm}]`);
        }
      }
    }

    // === terraceSqm (FIXED — handles ALL cases) ===
    if (nextField === 'terraceSqm') {
      // Case 1: No terrace
      if (/nema|нема|без|bez|ne|не|nema terasa|нема тераса|nema|нема|bez terasa|без тераса/i.test(u)) {
        session.collectedData.hasTerrace = false;
        session.collectedData.terraceSqm = 0;
        console.log(`[TERRACE: none]`);
      } 
      // Case 2: Has terrace but unknown size (explicitly says "ne znam")
      else if (/ima|има/i.test(u) && /ne znam|не знам|незнам|neznam|не знам точно|не сум сигурен|ne sum siguren|ne znam tocno|не знам точно/i.test(u)) {
        session.collectedData.hasTerrace = true;
        session.collectedData.terraceSqm = null;
        console.log(`[TERRACE: yes, size unknown]`);
      }
      // Case 3: Has terrace with size — use extractTerraceNumber
      else if (/ima|има|terasa|тераса|terrace|тераса|kv|кв|kvadrati|квадрати|m2|m²/i.test(u) || isPositive(u)) {
        const firstNum = extractTerraceNumber(u);
        if (firstNum !== null && firstNum > 0 && firstNum < 100) {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = firstNum;
          console.log(`[TERRACE: ${firstNum}m2]`);
        } else {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = null;
          console.log(`[TERRACE: yes, size unknown]`);
        }
      }
    }

    // === bedrooms ===
    if (nextField === 'bedrooms') {
      const firstNum = extractFirstNumber(u);
      if (firstNum !== null && firstNum >= 0 && firstNum <= 10) {
        session.collectedData.bedrooms = firstNum;
        console.log(`[BEDROOMS: ${session.collectedData.bedrooms}]`);
      }
      const wordNum = parseMacedonianNumber(u);
      if (wordNum !== null && wordNum >= 0 && wordNum <= 10) {
        session.collectedData.bedrooms = wordNum;
        console.log(`[BEDROOMS: ${session.collectedData.bedrooms}]`);
      }
      if (/garsonjera|гарсонера|гарсоњера/i.test(u)) {
        session.collectedData.bedrooms = 0;
      } else if (/dvosoben|двособен/i.test(u)) {
        session.collectedData.bedrooms = 1;
      } else if (/trisoben|трисобен|trosoben/i.test(u)) {
        session.collectedData.bedrooms = 2;
      } else if (/cetvorosoben|четирисобен/i.test(u)) {
        session.collectedData.bedrooms = 3;
      } else if (/petsoben|петсобен/i.test(u)) {
        session.collectedData.bedrooms = 4;
      }
    }

    // === floor (FIXED — potkrovje detection) ===
    if (nextField === 'floor') {
      // Check for potkrovje first
      if (/potkrovje|поткровје|podkrovje|подкровје|potkrov|поткров|potkrov|поткров/i.test(u)) {
        if (session.collectedData.totalFloors) {
          session.collectedData.floor = session.collectedData.totalFloors + 1;
        } else {
          session.collectedData.floor = 6; // Default assumption
        }
        console.log(`[FLOOR: potkrovje → ${session.collectedData.floor}]`);
      } else {
        const ordinal = parseOrdinalFloor(u);
        if (ordinal !== null) {
          session.collectedData.floor = ordinal;
          console.log(`[FLOOR: ${session.collectedData.floor}]`);
        } else {
          const firstNum = extractFirstNumber(u);
          if (firstNum !== null && firstNum >= 0 && firstNum <= 50) {
            session.collectedData.floor = firstNum;
            console.log(`[FLOOR: ${session.collectedData.floor}]`);
          }
          const wordNum = parseMacedonianNumber(u);
          if (wordNum !== null && wordNum >= 0 && wordNum <= 50) {
            session.collectedData.floor = wordNum;
            console.log(`[FLOOR: ${session.collectedData.floor}]`);
          }
        }
      }
    }

    // === totalFloors ===
    if (nextField === 'totalFloors') {
      const firstNum = extractFirstNumber(u);
      if (firstNum !== null && firstNum >= 1 && firstNum <= 50) {
        session.collectedData.totalFloors = firstNum;
        console.log(`[TOTAL FLOORS: ${session.collectedData.totalFloors}]`);
      }
      const wordNum = parseMacedonianNumber(u);
      if (wordNum !== null && wordNum >= 1 && wordNum <= 50) {
        session.collectedData.totalFloors = wordNum;
        console.log(`[TOTAL FLOORS: ${session.collectedData.totalFloors}]`);
      }
    }

    // === elevator ===
    if (nextField === 'elevator') {
      if (isPositive(u) || /lift|лифт|ima|има/i.test(u)) {
        session.collectedData.elevator = true;
        console.log(`[ELEVATOR: true]`);
      } else if (isNegative(u) || /bez lift|без лифт|nema lift/i.test(u)) {
        session.collectedData.elevator = false;
        console.log(`[ELEVATOR: false]`);
      }
    }

    // === heating (FIXED — parno follow-up detection) ===
    if (nextField === 'heating') {
      if (/parno|парно/i.test(u) && !/gradsko|граѓско|sopstveno|сопствено|individualno|индивидуално|moe|мое|nase|наше|licno|лично|zgradata|зградата|centralno|централно|na zgradata|на зградата|sopstveno parno|сопствено парно|gradsko parno|градско парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно/i.test(u)) {
        // Just "parno" — ask for follow-up
        session.collectedData.heating = "parno_unknown";
        session.collectedData.heatingType = "unknown";
        session.collectedData.heatingFollowUp = true;
        return {
          text: "Какво парно? Градско или сопствено?",
          type: "QUESTION"
        };
      } else if (/gradsko|граѓско|central|centralno|dalinsko|toplovod|beg|gradsko|градско/i.test(u)) {
        session.collectedData.heating = "district";
        session.collectedData.heatingType = "district";
        console.log(`[HEATING: district]`);
      } else if (/sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|centralno|централно|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) {
        session.collectedData.heating = "central";
        session.collectedData.heatingType = "private_central";
        console.log(`[HEATING: private_central]`);
      } else if (/klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u)) {
        session.collectedData.heating = "electric";
        session.collectedData.heatingType = "inverter";
        console.log(`[HEATING: inverter]`);
      } else if (/struja|струја|electric|термо|термосистем|termo|радијатори|radijatori|калорифер|kalorifer/i.test(u)) {
        session.collectedData.heating = "electric";
        session.collectedData.heatingType = "electric";
        console.log(`[HEATING: electric]`);
      } else if (/drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i.test(u)) {
        if (/drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i.test(u)) {
          session.collectedData.heating = "solid_fuel";
          session.collectedData.heatingType = "wood_pellets";
        } else {
          session.collectedData.heating = "oil";
          session.collectedData.heatingType = "oil";
        }
        console.log(`[HEATING: ${session.collectedData.heatingType}]`);
      }
    }

    // === ac ===
    if (nextField === 'ac') {
      if (isPositive(u)) {
        session.collectedData.ac = true;
        console.log(`[AC: true]`);
      } else if (isNegative(u)) {
        session.collectedData.ac = false;
        console.log(`[AC: false]`);
      }
    }

    // === parking (FIXED — underground = garage) ===
    if (nextField === 'parking') {
      if (/nema|нема|без|bez|ne|не|nema parking|нема паркинг|nema garaza|нема гаража/i.test(u)) {
        session.collectedData.parking = false;
        console.log(`[PARKING: false]`);
      } else if (isPositive(u) || /garaza|гаража|privat|приват|parking|паркинг|garage|гараж|podzemna|подземна|sopstveno|сопствено|pred zgrada|пред зграда|na -|на -|podzemno|подземно/i.test(u)) {
        session.collectedData.parking = true;
        if (/garaza|гаража|garage|гараж|podzemna|подземна|podzemno|подземно|na -1|на -1|na -2|на -2|na -|на -|podzemno parking|подземно паркинг|podzemna garaza|подземна гаража|garaza na -|гаража на -/i.test(u)) {
          session.collectedData.parkingType = "garage";
        } else if (/privat|приват|sopstveno|сопствено|pred zgrada|пред зграда/i.test(u)) {
          session.collectedData.parkingType = "private";
        } else {
          session.collectedData.parkingType = "public";
        }
        console.log(`[PARKING: true, type: ${session.collectedData.parkingType}]`);
      }
    }

    // === orientation (EXPANDED) ===
    if (nextField === 'orientation') {
      const orients = parseOrientation(u);
      if (orients && orients.length > 0) {
        session.collectedData.orientation = orients.join('-');
        session.collectedData.orientationPrimary = orients[0];
        session.collectedData.orientationSecondary = orients.length > 1 ? orients[1] : null;
        console.log(`[ORIENTATION: ${session.collectedData.orientation}]`);
      }
    }

    // === furnished ===
    if (nextField === 'furnished') {
      if (/prazen|правен|gol|гол|bez namestaj|без мебел|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|ne e namesten|не е наместен|bez|без|nema|нема|ne|не|ne e|не е|prav|прав/i.test(u)) {
        session.collectedData.furnished = false;
        session.collectedData.furnishedLevel = "empty";
        console.log(`[FURNISHED: empty]`);
      } else if (/komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|se prodava namesten|се продава наместен|so namestaj|со мебел|namesten|наместен/i.test(u)) {
        session.collectedData.furnished = true;
        session.collectedData.furnishedLevel = "full";
        console.log(`[FURNISHED: full]`);
      } else if (isPositive(u)) {
        session.collectedData.furnished = true;
        session.collectedData.furnishedLevel = "partial";
        console.log(`[FURNISHED: partial]`);
      }
    }

    // === yearBuilt ===
    if (nextField === 'yearBuilt') {
      const year = parseYearBuilt(u);
      if (year !== null) {
        session.collectedData.yearBuilt = year;
        console.log(`[YEAR BUILT: ${session.collectedData.yearBuilt}]`);
      }
    }

    // === renovated ===
    if (nextField === 'renovated') {
      if (/ne|не|nema|нема|ne e|не е|bez|без|not renovated|ништо|ne e renoviran|не е реновиран|nema renoviran|нема реновирано|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран|ne e renoviran|не е реновиран|ne e|не е/i.test(u)) {
        session.collectedData.renovated = false;
        session.collectedData.renovationYear = null;
        console.log(`[RENOVATED: false]`);
      } else {
        const yearMatch = u.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
          session.collectedData.renovated = true;
          session.collectedData.renovationYear = parseInt(yearMatch[1]);
          console.log(`[RENOVATED: true, year: ${session.collectedData.renovationYear}]`);
        } else if (/90ti|90 ти|90-ти|90ти|деведесетти/i.test(u)) {
          session.collectedData.renovated = true;
          session.collectedData.renovationYear = 1995;
          console.log(`[RENOVATED: true, year: 1995 (90ti)]`);
        } else if (/80ti|80 ти|80-ти|80ти/i.test(u)) {
          session.collectedData.renovated = true;
          session.collectedData.renovationYear = 1985;
          console.log(`[RENOVATED: true, year: 1985 (80ti)]`);
        } else if (/2000ti|2000 ти|двеилјадити/i.test(u)) {
          session.collectedData.renovated = true;
          session.collectedData.renovationYear = 2005;
          console.log(`[RENOVATED: true, year: 2005 (2000ti)]`);
        } else if (isPositive(u) || /реновиран|renoviran|обновен|obnoven|novo|нов|sreden|среден|kompletno renoviran|комплетно реновиран|delumno renoviran|делумно реновиран|skoro|скоро|nedavno|недавно|pre|пред|osvezhivme|освеживме|go osvezivme|го освеживме/i.test(u)) {
          session.collectedData.renovated = true;
          session.collectedData.renovationYear = null;
          console.log(`[RENOVATED: true, year unknown]`);
        } else if (/pred|пред|pri|при/i.test(u)) {
          const years = u.match(/\d+/);
          if (years) {
            const currentYear = new Date().getFullYear();
            session.collectedData.renovated = true;
            session.collectedData.renovationYear = currentYear - parseInt(years[0]);
            console.log(`[RENOVATED: true, year: ${session.collectedData.renovationYear} (calculated)]`);
          }
        }
      }
    }

    // === renovationYear — SKIP if renovated is false ===
    if (nextField === 'renovationYear') {
      if (session.collectedData.renovated === false) {
        session.collectedData.renovationYear = null;
        console.log(`[RENOVATION YEAR: skipped (renovated=false)]`);
        const known = { ...session.adMemory, ...session.collectedData };
        nextField = getNextMissingField(known);
      } else {
        const year = parseYearBuilt(u);
        if (year !== null) {
          session.collectedData.renovationYear = year;
          console.log(`[RENOVATION YEAR: ${session.collectedData.renovationYear}]`);
        }
      }
    }

    // === documentationClean (FIXED — hipoteka = NOT clean) ===
    if (nextField === 'documentationClean') {
      if (/hipoteka|хипотека|ostavinska|оставинска|razvod|развод|sudski|судски|problem|проблем|ne e cist|не е чист|ne e cista|не е чиста|komplikacii|компликации|teret|терет|zabrana|забрана|zalozen|заложен|ne e cist imoten list|не е чист имотен лист|ima hipoteka|има хипотека|ima problem|има проблем/i.test(u)) {
        session.collectedData.documentationClean = false;
        if (/hipoteka|хипотека/i.test(u)) {
          session.collectedData.documentationIssues = "hipoteka";
        } else if (/ostavinska|оставинска/i.test(u)) {
          session.collectedData.documentationIssues = "ostavinska";
        } else if (/razvod|развод/i.test(u)) {
          session.collectedData.documentationIssues = "razvod";
        } else if (/teret|терет|zabrana|забрана|zalozen|заложен/i.test(u)) {
          session.collectedData.documentationIssues = "teret";
        } else {
          session.collectedData.documentationIssues = "other";
        }
        console.log(`[DOCUMENTATION: not clean - ${session.collectedData.documentationIssues}]`);
      } else if (/cist|чист|ima|има|da|да|nema problem|нема проблем|nema|нема|cista|чиста|cisto|чисто|nema hipoteka|нема хипотека|nema ostavinska|нема оставинска|nema razvod|нема развод|nema sudski|нема судски|cist imoten list|чист имотен лист|ima cist imoten list|има чист имотен лист|nema teret|нема терет|nema zabrana|нема забрана|cisto|чисто|ima|има|na ime|на име|cisto na moe ime|чисто на мое име|na moe ime|на мое име/i.test(u)) {
        session.collectedData.documentationClean = true;
        session.collectedData.documentationIssues = null;
        console.log(`[DOCUMENTATION: clean]`);
      }
    }

    // === photos ===
    if (nextField === 'photos') {
      if (session.collectedData.photosStatus && session.collectedData.photosStatus !== 'PENDING') {
        if (session.collectedData.photosStatus === 'NONE') {
          session.collectedData.photos = false;
        } else {
          session.collectedData.photos = true;
        }
        console.log(`[PHOTOS: already processed, photos=${session.collectedData.photos}]`);
      } else if (hasScraperPhotos) {
        if (isPositive(u) || /da|да|se|се|aktuelni|актуелни|okej|океј|moze|може|se aktuelni|се актуелни|aktuelni se|актуелни се|da se|да се|se isti|се исти|isti se|исти се/i.test(u)) {
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
        if (isPositive(u) || /ima|има|imam|имам|ke pratam|ќе пратам|pratam|пратам|moze da pratam|може да пратам|da|да|ok|океј|da imam|да имам|ima fotografi|има фотографии|ima sliki|има слики|ke vi pratam|ќе ви пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|ke vi ispratam|ќе ви испратам|ispratam|испратам|tuka da vi pratam|тука да ви пратам/i.test(u)) {
          session.collectedData.photosPermission = true;
          session.collectedData.photosSource = "VIBER_PENDING";
          session.collectedData.photosStatus = "VIBER_PENDING";
          session.collectedData.photos = true;
          console.log(`[PHOTOS: VIBER_PENDING, photos=true]`);
        } else if (isNegative(u) || /nemam|немам|nema|нема|bez|без|nema sliki|нема слики|bez sliki|без слики|ne|не|nema fotografi|нема фотографии|nemam sliki|немам слики|nemam momentalno|немам моментално|ti kazav|ти кажав|kazav|кажав|rekov|реков|nemam|немам|nema momentalno|нема моментално|ne mozam|не можам|ne moze|не може/i.test(u)) {
          session.collectedData.photosPermission = false;
          session.collectedData.photosSource = "NONE";
          session.collectedData.photosStatus = "NONE";
          session.collectedData.photos = false;
          console.log(`[PHOTOS: NONE, photos=false]`);
        }
      }
    }

    // === ownerName ===
    if (nextField === 'ownerName') {
      if (u.length > 0) {
        session.collectedData.ownerName = userInput.trim();
        console.log(`[OWNER NAME: ${session.collectedData.ownerName}]`);
      }
    }

    // === address ===
    if (nextField === 'address') {
      if (u.length > 0) {
        session.collectedData.address = userInput.trim();
        console.log(`[ADDRESS: ${session.collectedData.address}]`);
      }
    }

    console.log(`[PHASE: ${phase}]`);
    console.log(`[MEMORY:`, JSON.stringify(session.collectedData, null, 2), `]`);

    // ========================================
    // DATA COLLECTION PHASE — WITH MICRO-SOCIAL GLUE
    // ========================================
    if (phase === "DATA_COLLECTION") {
      const known = { ...session.adMemory, ...session.collectedData };
      nextField = getNextMissingField(known);
      
      if (!nextField) {
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
          closeMessage = `Тоа беа информациите што ми се потребни.

Ви благодарам.

Ги очекувам фотографиите на Viber за да можеме поефикасно да го промовираме имотот.

Пријатен ден.`;
        } else if (session.collectedData.photosStatus === 'NONE' || session.collectedData.photosStatus === 'SCRAPER_APPROVED') {
          closeMessage = `Тоа беа информациите што ми се потребни.

Ви благодарам за довербата.

Ќе ве контактирам кога ќе имаме заинтересиран клиент за разгледување на имотот.

Пријатен ден.`;
        } else if (session.collectedData.photosStatus === 'VIBER_RECEIVED') {
          closeMessage = `Ви благодарам за фотографиите.

Ги имам сите потребни информации.

Ќе ве контактирам кога ќе имаме заинтересиран клиент.`;
        } else if (session.collectedData.photosStatus === 'PHOTOGRAPHY_NEEDED') {
          closeMessage = `Тоа беа информациите што ми се потребни.

Ви благодарам.

Ќе ве контактирам за да организираме фотографирање на имотот.

Пријатен ден.`;
        } else {
          closeMessage = `Ви благодарам за довербата и за одвоеното време.

Ги внесов сите информации за имотот.

Ќе ве контактирам штом имаме соодветен заинтересиран клиент за посета.

Ви посакувам убав ден.`;
        }
        
        return { text: closeMessage, type: "CLOSED" };
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
      
      const response = prefix + finalQuestion;

      console.log(`[NEXT FIELD: ${nextField}]`);
      console.log(`[QUESTION: ${finalQuestion}]`);

      return { 
        text: response, 
        type: "QUESTION", 
        nextField 
      };
    }

    // ========================================
    // PERSUASION PHASE — Native Macedonian
    // ========================================
    let persuasionContext = "";
    if (classification) {
      if (classification.intent === "INTERESTED" && classification.confidence > 0.5) {
        persuasionContext = "Сопственикот покажува интерес, но има сомнежи. Одговори на неговите резерви и охрабри го да проба. Користи природен македонски јазик.";
      } else if (classification.intent === "INTERESTED" && classification.confidence <= 0.5) {
        persuasionContext = "Сопственикот е несигурен. Бидете пријателски и охрабрувачки, но не и наметливи. Користи природен македонски јазик.";
      } else if (classification.intent === "REJECTED" && classification.confidence < 0.8) {
        persuasionContext = "Сопственикот е скептичен. Објасни ги придобивките без притисок. Користи природен македонски јазик.";
      }
    }

    const prompt = `
Ти си Ана, професионална македонска агенка за недвижности.

ЛИНГВИСТИЧКИ ПРАВИЛА (МОРА ДА СЛЕДИШ):

const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'стан' :
                          session.adMemory?.propertyType === 'house' ? 'куќа' :
                          session.adMemory?.propertyType === 'land' ? 'плац' : 'имот';

КРИТИЧНИ ЛИНГВИСТИЧКИ ПРАВИЛА:
1. НИКОГАШ не кажувај "Ви разбирам". Секогаш кажувај "Ве разбирам".
2. НИКОГАШ не кажувај "имување", "имотно огласување", "промоција на имотот" како што се користи во превод од англиски.
3. Користи природни македонски фрази:
   - Наместо "бесплатна промоција на вашето имотно огласување" → "имаме голем број клиенти заинтересирани"
   - Наместо "работиме над вашата цена" → "вие ја задржувате вашата цена"
   - Наместо "вие сте заинтересирани" → "вие сте расположени"
4. Користи "Ве" кога се однесува на вас (директен објект). Користи "Ви" кога е индиректен објект.
5. Ако не си сигурна дали е "Ви" или "Ве", користи "Вас" (Вас ве разбирам).

ПРИМЕРИ ЗА ТОЧНА УПОТРЕБА:
❌ "Ви разбирам" → ✅ "Ве разбирам"
❌ "Ви благодарам за довербата" → ✅ "Ви благодарам" (тука "Ви" е точно, бидејќи е индиректен објект)
❌ "Вие сте заинтересирани" → ✅ "Дали сте расположени"

ПРАВИЛА:
- Одговарај КРАТКО. Максимум 1-2 реченици.
- НЕ додавај "Ви благодарам за довербата" освен ако не е неопходно.
- НЕ објаснувај повеќе од потребното.
- Одговори директно на прашањето.
- Ако сопственикот праша за обврски, кажи кратко: "Да, немате никакви обврски кон нас."
- Секогаш заврши со прашање за соработка: "Дали сте расположени да соработуваме?"
- Пишувај исклучиво на стандарден македонски јазик (македонски книжевен јазик).
- НЕ користі русизми, украинизми или србизми.
- НЕ преведувај збор-по-збор од англиски. Преведувај го значењето.
- НЕ кажувај "работиме над вашата цена". Користи: "вие ја задржувате вашата барана цена, а ние го додаваме нашиот дел над тоа".
- Користи "имотот" или "станот" правилно. НИКОГАШ не кажувај "станиот".
- Користи "расположени" наместо "заинтересирани" кога прашуваш за соработка.
- НЕ повторувај "сопственик" секоја реченица. Користи "Ве разбирам" или "Ви благодарам".
- Максимум 1-2 реченици.

ПРИМЕР ЗА КРАТОК ОДГОВОР:
"Да, немате никакви обврски кон нас. Дали сте расположени да соработуваме?"
"Драго ми е што дознав дека имотот сè уште е слободен. Дали сте расположени да разговараме подетално?"

РАЗГОВОР:
${conv}

СОПСТВЕНИК: ${userInput}

СЕГА ОДГОВОРИ КРАТКО:
`;

    const result = await groq.chat.completions.create({
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
    });

    let response = result.choices[0]?.message?.content?.trim() || "Дали сте расположени да соработуваме?";
    response = cleanResponse(response, '').replace(/^Ана:?\s*/i, '').trim();
    
    // Remove duplicate phrases (fix for stutter)
    response = response.replace(/(Дали сте расположени)\s+\1/gi, '$1');
    response = response.replace(/(\.)\s*\1/g, '.');
    
        if (!/да ли|дали|\?/.test(response)) {
      const closings = [
        "Дали сте расположени да соработуваме?",
        "Дали да почнеме со соработка?",
        "Што велите, да пробаме?",
        "Како ви звучи ова?",
        "Дали да продолжиме?"
      ];
      const closing = closings[Math.floor(Math.random() * closings.length)];
      response += " " + closing;
    }    
    // Add variety to closing question - ALWAYS add if not already present
    const closingQuestions = [
      "Дали сте расположени да соработуваме?",
      "Дали да почнеме со соработка?",
      "Што велите, да пробаме?",
      "Како ви звучи ова?",
      "Дали да продолжиме?",
      "Што мислите?"
    ];
    
    if (!/да ли|дали|\?/.test(response)) {
      const closing = closingQuestions[Math.floor(Math.random() * closingQuestions.length)];
      response += " " + closing;
    } else {
      // If there's already a question, occasionally replace it with a different one
      // This prevents the same closing question from being used repeatedly
      for (const q of closingQuestions) {
        if (response.includes(q)) {
          // Replace with a different random closing question
          const newClosing = closingQuestions[Math.floor(Math.random() * closingQuestions.length)];
          response = response.replace(q, newClosing);
          break;
        }
      }
    }
    // HARD FILTER: NEVER mention buyer
    response = response.replace(/купувач|купувачот|купувачи|kupuvac|kupuvacot/gi, '');
    response = response.replace(/\s+/g, ' ').trim();
    
    return { text: response, type: "NORMAL" };
  } catch (e) {
    console.error("ERR:", e.message);
    return { text: "Дали можеме да продолжиме?", type: "ERROR" };
  }
}
