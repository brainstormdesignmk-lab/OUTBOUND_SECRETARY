import Groq from "groq-sdk";
import { config } from './config.js';
import { getNextMissingField, getQuestion } from './workflow.js';
import { getRentDefaults, calculateRentCommission } from './lib/commission.js';
import { cleanResponse } from './guardrails.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Extraction functions (pure, stateless)
import {
  parseMacedonianNumber,
  parseNumberWords,
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

// Intent classification (pure, stateless)
import { classifyIntent } from './classifier.js';

// Objection library (hardcoded responses + checker functions)
import {
  OBJECTION_RESPONSES,
  matchObjection,
  isAskingAboutRentRules,
  isAskingAboutRentCommission,
  isAskingAboutCommission,
  isAskingForExplanation,
  isAskingAboutPhone,
  isAskingHowItWorks,
  isAskingAboutClients,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts
} from './objections.js';

// Global extraction pass
import { runGlobalExtraction } from './data-collector.js';

// Persuasion phase (prompt builder + response post-processor)
import { buildPersuasionContext, buildPersuasionPrompt, postProcessPersuasionResponse } from './persuasion.js';

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
// GENERATE FIRST MESSAGE
// ========================================

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

  const transactionType = /издава|изнајмува|izdava|izdavam|kirija|кирија|под кирија|pod kirija|za izdavanje|за издавање|rent|rental|iznajmuva|изнајмувам/i.test(title) ? 'rent' : 'sale';

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
    if (!session.collectedData.cooperationAccepted &&/uste go imam|уште го имам|dostapen e|достапен е|sloboden e|слободен е|seuste e dostapen|сè уште е достапен|go imam|го имам|uste e|уште е|dostapen|достапен|da imam|да имам|uste go imam da|уште го имам да|da uste go imam|да уште го имам|seuste go imam|сè уште го имам|go imam uste|го имам уште|uste e sloboden|уште е слободен|e sloboden|е слободен|dostapno e|достапно е|seuste e dostapno|сè уште е достапно|ima uste|има уште|uste ima|уште има|go ima uste|го има уште|uste go ima|уште го има|go ima|го има|uste go imam|уште го имам|go nema|го нема|nema go|нема го|ne e dostapen|не е достапен|go nema uste|го нема уште|uste go nema|уште го нема|seuste e|сè уште е|seuste go imam|сè уште го имам|dostapna e|достапна е|slobodna e|слободна е|seuste e dostapna|сè уште е достапна|uste e dostapna|уште е достапна|dostapni se|достапни се|seuste se dostapni|сè уште се достапни|uste se dostapni|уште се достапни|go imam uste|го имам уште|uste go imam|уште го имам|go imam seuste|го имам сè уште|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|nema go|нема го|go nema|го нема|go nema uste|го нема уште|uste go nema|уште го нема|nema uste|нема уште|seuste e|сè уште е|dostapen|достапен|dostapna|достапна/i.test(u) && !/terasa|тераса|klima|клима|parking|паркинг|procent|процент|obvrski|обврски|klient|клиент|broj|број|kancelari|канцелари|sorabotka|соработка|uslovi|услови|garaza|гаража|garage|гараж|lift|лифт|m2|квадрати|kvadrati|heating|греење|parno|парно/i.test(u)) {
      const propertyLabel = session.adMemory?.propertyType === 'apartment' ? 'станот' :
                            session.adMemory?.propertyType === 'house' ? 'куќата' :
                            session.adMemory?.propertyType === 'land' ? 'плацот' :
                            session.adMemory?.propertyType === 'commercial' ? 'локалот' : 'имотот';

      let response;
      if (isRent) {
        const rentResponses = [
          `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го понудиме на нашите клиенти за издавање, без провизија за вас?`,
          `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале да го издадеме во најкраток можен рок, без никакви давачки за вас?`,
          `Драго ми е што ${propertyLabel} е сè уште достапен. Дали би сакале нашата агенција да се погрижи за професионално издавање, без никакви обврски од ваша страна?`
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

    // HARDCODED: How does it work?
    if (isAskingHowItWorks(u)) {
      return {
        text: isRent ? "Секоја недвижнина се внесува во системот на агенцијата со податоци за неа, се организираат посети. Како ви звучи ова?" : "Секоја недвижнина се внесува во системот на агенцијата со податоци за неа, се организираат посети и продажба. Како ви звучи ова?",
        type: "NORMAL"
      };
    }

   // HARDCODED: Client question (requires longer phrase context, not bare words)
    if (/imat klient|imate klient|имате клиент|klient spremen|клиент спремен|zainteresiran kupuvac|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент|imate kupuvac|имате купувач|kupuvac spremen|купувач спремен|najdovte klient|најдовте клиент|najdovte kupuvac|најдовте купувач|dali imate klient|дали имате клиент|dali imate kupuvac|дали имате купувач|ima li zainteresirani|има ли заинтересирани|imate gotov|имате готов|najdovte|најдовте|klient e|клиент е|kupuvac e|купувач е|koi se klientite|кои се клиентите/i.test(u)) {
      return {
        text: "Постојано имаме потенцијални клиенти заинтересирани за тој реон. Дали да почнеме со соработка?",
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
        return {
          text: 'За издавање, провизијата зависи од месечната кирија. Доколку киријата е до 1000 евра, вие како сопственик плаќате 50% од една месечна кирија. Доколку киријата е над 1000 евра, вие плаќате една цела месечна кирија. Ние се грижиме за целокупниот процес на издавање, документација и избор на соодветен клиент.',
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
      }        if (!session.commissionExplained) {
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
      classification = classifyIntent(u, conv);
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
            text: isRent ? "Агенцијата не зема ништо од вас за услугата. Само ви ги зголемува шансите за побрзо издавање на вашиот имот. Да пробаме?" : "Агенцијата не зема ништо од вас за услугата. Само ви ги зголемува шансите за побрза продажба на вашиот имот. Да пробаме?",
            type: "NORMAL"
          };
        } else if (session.rejectionCount === 2) {
          return {
            text: isRent ? "Не ве разбирам. Сакате да издадете, експерти ви ја нудат својата услуга без надокнада од ваша страна, а вие одбивате. Што велите да се обидеме?" : "Не ве разбирам. Сакате да продадете, експерти ви ја нудат својата услуга без надокнада од ваша страна, а вие одбивате. Што велите да се обидеме?",
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
    // GLOBAL EXTRACTION PASS — extracts all simple fields from EVERY message
    // Runs for BOTH persuasion and data collection phases.
    // This captures property details the owner volunteers during conversation
    // even before formal data collection starts.
    // ========================================
    const updates = runGlobalExtraction(u, session.collectedData);
    for (const [key, value] of Object.entries(updates)) {
      session.collectedData[key] = value;
      console.log(`[GLOBAL: ${key} = ${JSON.stringify(value)}]`);
    }

    // ========================================
    // COMPLEX STATEFUL HANDLERS (Data Collection only)
    // These have early returns (follow-up questions) or complex
    // state machine logic that can't be pure extraction.
    // ========================================
    if (phase === "DATA_COLLECTION") {

      // === terraceSqm (Handles ALL cases) ===
      if (session.collectedData.terraceSqm === undefined && session.collectedData.hasTerrace === undefined) {
        // Case 1: "ne znam" reply (follow-up question response)
        if (/ne znam|не знам|незнам|neznam|ne znam tocno|не знам точно|ne sum siguren|не сум сигурен/i.test(u)) {
          session.collectedData.hasTerrace = true;
          session.collectedData.terraceSqm = null;
          console.log(`[TERRACE: yes, size unknown]`);
        }
        // True negative responses
        else if (/^0$|nema terasa|нема тераса|nema|нема|без|bez|nema|нема|bez terasa|без тераса|nema parking|нема паркинг/i.test(u) && !/ima|има|kv|кв|m2|м2|kvadrat|квадрат/i.test(u)) {
          session.collectedData.hasTerrace = false;
          session.collectedData.terraceSqm = 0;
          console.log(`[TERRACE: none]`);
        }
        // Has terrace with or without size
        // NOTE: Only match terrace-SPECIFIC words, not generic sqm words like 'kvadrati'/'m2'
        // (those are handled by the global extraction pass for totalSqm)
        else if (/ima|има|terasa|тераса|terrace|teras|терас/i.test(u) || isPositive(u)) {
          const firstNum = extractTerraceNumber(u);
          if (firstNum !== null && firstNum > 0 && firstNum < 100) {
            session.collectedData.hasTerrace = true;
            session.collectedData.terraceSqm = firstNum;
            console.log(`[TERRACE: ${firstNum}m2]`);
          } else {
            console.log(`[TERRACE: yes, size unknown — asking follow-up]`);
            return {
              text: 'Дали знаете колку квадрати е терасата?',
              type: "QUESTION"
            };
          }
        }
      }

      // === heating (FIXED — parno follow-up, B16) ===
      if (nextField === 'heating' || session.collectedData.heatingFollowUp) {
        if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg/i.test(u)) {
          session.collectedData.heating = "district";
          session.collectedData.heatingType = "district";
          session.collectedData.heatingFollowUp = false;
          console.log(`[HEATING: district]`);
        } else if (/centralno|централно|central|sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) {
          session.collectedData.heating = "central";
          session.collectedData.heatingType = "private_central";
          session.collectedData.heatingFollowUp = false;
          console.log(`[HEATING: private_central]`);
        } else if (/klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u)) {
          session.collectedData.heating = "electric";
          session.collectedData.heatingType = "inverter";
          session.collectedData.heatingFollowUp = false;
          console.log(`[HEATING: inverter]`);
        } else if (/struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i.test(u)) {
          session.collectedData.heating = "electric";
          session.collectedData.heatingType = "electric";
          session.collectedData.heatingFollowUp = false;
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
          console.log(`[HEATING: ${session.collectedData.heatingType}]`);
        } else if (/parno|парно/i.test(u) && !session.collectedData.heatingFollowUp) {
          session.collectedData.heatingFollowUp = true;
          return {
            text: "Какво парно? Градско или сопствено?",
            type: "QUESTION"
          };
        }
        if (session.collectedData.heatingFollowUp) {
          session.collectedData.heating = "parno_unknown";
          session.collectedData.heatingType = "unknown";
          session.collectedData.heatingFollowUp = false;
          console.log(`[HEATING: parno_unknown (defaulted)]`);
        }
      }

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
      // === ownerName (gated — must be asked explicitly) ===
      if (nextField === 'ownerName') {
        if (userInput.trim().length > 0) {
          session.collectedData.ownerName = userInput.trim();
          console.log(`[OWNER NAME: ${session.collectedData.ownerName}]`);
        }
      }

      // === address (gated — must be asked explicitly) ===
      if (nextField === 'address') {
        if (userInput.trim().length > 0) {
          session.collectedData.address = userInput.trim();
          console.log(`[ADDRESS: ${session.collectedData.address}]`);
        }
      }
    }

    console.log(`[PHASE: ${phase}]`);
    console.log(`[MEMORY:`, JSON.stringify(session.collectedData, null, 2), `]`);

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
    const persuasionContext = buildPersuasionContext(classification);
    const prompt = buildPersuasionPrompt(conv, userInput, persuasionContext);

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

    let response = result.choices[0]?.message?.content?.trim() || "";
    response = postProcessPersuasionResponse(response, isRent);

    return { text: response, type: "NORMAL" };
  } catch (e) {
    console.error("ERR:", e.message);
    return { text: "Дали можеме да продолжиме?", type: "ERROR" };
  }
}
