// ========================================
// property-extractor.js — Pure extraction functions
// All functions are stateless: (text) => value | null
// No imports needed — pure regex + basic JS only
// ========================================

// ========================================
// Macedonian number words
// ========================================
export function parseMacedonianNumber(text) {
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
    'sesti': 6, 'sedmi': 7, 'osmi': 8, 'devetti': 9,
    'seeset': 60, 'шеесет': 60,
    'peeset': 50, 'пеесет': 50
  };

  const sorted = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sorted) {
    if (text.includes(word)) return num;
  }
  return null;
}

// ========================================
// Parse number words for price extraction (HUNDREDS + TENS)
// ========================================
export function parseNumberWords(text) {
  const u = text.toLowerCase();

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

  for (const [word, num] of Object.entries(numberWords)) {
    if (u.trim() === word) {
      return num;
    }
  }

  const rootMap = {
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
  const rootGroup = '(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)';
  let result = 0;
  let found = false;
  let consumedLength = 0;

  let firstMatchIndex = null;
  const getStoPrefix = () => {
    return (firstMatchIndex !== null && firstMatchIndex !== 0 && /^(sto|сто)/i.test(u)) ? 100 : 0;
  };

  const compoundMatch = u.match(new RegExp(
    rootGroup + '\\s*(sto|сто)?\\s*' + rootGroup + '\\s*(eset|есет|ajset|ајсет)', 'i'
  ));
  if (compoundMatch) {
    const hundreds = rootMap[compoundMatch[1].toLowerCase()] || 0;
    const tens = rootMap[compoundMatch[3].toLowerCase()] || 0;
    result = (hundreds * 100) + (tens * 10);
    consumedLength = compoundMatch.index + compoundMatch[0].length;
    firstMatchIndex = compoundMatch.index;
    found = true;
  }

  if (!found) {
    const hundredPatterns = [
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(sto|сто)/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)sto/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)сто/i,
    ];
    for (const pattern of hundredPatterns) {
      const match = u.match(pattern);
      if (match) {
        result = rootMap[match[1].toLowerCase()] * 100;
        consumedLength = match.index + match[0].length;
        firstMatchIndex = match.index;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    const irregularTens = {
      'triest': 30, 'триест': 30,
      'pedeset': 50, 'педесет': 50,
      'seeset': 60, 'шеесет': 60,
      'stopeeset': 150, 'стопеесет': 150,
      'deveeset': 90, 'девеесет': 90,
      'osumdeset': 80, 'осумдесет': 80,
      'osemdeset': 80, 'осемдесет': 80,
      'peeset': 50, 'пеесет': 50
    };
    for (const [word, val] of Object.entries(irregularTens)) {
      const idx = u.indexOf(word);
      if (idx !== -1) {
        result = val;
        consumedLength = idx + word.length;
        firstMatchIndex = idx;
        found = true;
        break;
      }
    }

    if (!found) {
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
          result = rootMap[match[1].toLowerCase()] * 10;
          consumedLength = match.index + match[0].length;
          firstMatchIndex = match.index;
          found = true;
          break;
        }
      }
    }
  }

  if (!found) {
    const stoMatch = u.match(/^\s*(sto|сто)\s*$/i);
    if (stoMatch) return 100;
  }

  if (found) {
    const remaining = u.slice(consumedLength).trim();
    const iBrojMatch = remaining.match(/^i\s*(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset)\s*$/i);
    if (iBrojMatch) {
      result += rootMap[iBrojMatch[1].toLowerCase()] || 0;
    }
    result += getStoPrefix();
    return result;
  }

  return null;
}

// ========================================
// Ordinal floors (прв=1, втор=2, etc.)
// ========================================
export function parseOrdinalFloor(text) {
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
// Positive/Negative answer detection
// ========================================
export function isPositive(text) {
  return /^da$|^ima$|da ima|има|да|yes|ok|moze|може|ke|ќе|normalno|нормално|seka|сека|sekako|секако|naravno|наравно|normal|нормално|ima|има|da|ok|da be|да бе|ima klima|има клима|normalno deka ima|нормално дека има|fala bogu|фала богу|fala|фала|hvala|хвала|ima terasa|има тераса|terasa|тераса|ima na oglasot|има на огласот|sakate|сакате|ke pratam|ќе пратам|pratam|пратам|imam|имам|moze da koristite|може да користите|slobodno|слободно|da ima|да има|komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|ke vi pratam|ќе ви пратам|ke pratam|ќе пратам|moze da pratam|може да пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|se prodava|се продава|na istata|на истата|normalno-|нормално-|normalno |нормално /i.test(text);
}

export function isNegative(text) {
  return /^ne$|nema|нема|no|не|нега|без|ne|nema|не,|nema|нема|bez|без|nema terasa|нема тераса|nema parking|нема паркинг|nemam|немам|nemame|немаме|nema|нема|ne moze|не може|ne sakam|не сакам|nema sliki|нема слики|bez sliki|без слики|ne e|не е|ne|не|prav|прав|prazen|правен|gol|гол|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|bez namestaj|без мебел|ne e namesten|не е наместен|ne e renoviran|не е реновиран|ne e cist|не е чист|nema fotografi|нема фотографии|nema sliki|нема слики|ne sakam|не сакам|ne mi treba|не ми треба|ne sum zainteresiran|не сум заинтересиран|ostavi|остави|ne me interesira|не ме интересира|izvini|извини|nemam momentalno|немам моментално|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се|ti kazav|ти кажав|kazav|кажав|rekov|реков|ne e renoviran|не е реновиран|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран/i.test(text);
}

// ========================================
// Extract first number from text
// ========================================
export function extractFirstNumber(text) {
  const numbers = text.match(/\d{1,4}/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[0]);
  }
  return null;
}

// ========================================
// Count bedrooms
// ========================================
export function countBedrooms(text) {
  const u = text.toLowerCase();

  if (/garsonjera|гарсонера|гарсоњера|garsoniera|гарсониера/i.test(u)) return 0;
  if (/dvosoben|двособен/i.test(u)) return 1;
  if (/trisoben|трисобен|trosoben/i.test(u)) return 2;
  if (/cetvorosoben|четирисобен|cetvortosoben/i.test(u)) return 3;
  if (/petsoben|петсобен/i.test(u)) return 4;

  const roomWords = [
    'spalna', 'спална', 'spalni', 'спални',
    'detska', 'детска', 'detski', 'детски',
    'gostinska', 'гостинска', 'gostinski', 'гостински'
  ];
  let roomCount = 0;
  for (const word of roomWords) {
    const matches = u.match(new RegExp(word, 'gi'));
    if (matches) roomCount += matches.length;
  }
  if (roomCount >= 2) return roomCount;

  // Digit before room word: '2 spalni', '2 спални' etc.
  const digitRoomMatch = u.match(/(\d+)\s+(spalni|спални|spalna|спална|detski|детски|detska|детска|gostinski|гостински|gostinska|гостинска)/i);
  if (digitRoomMatch) {
    const n = parseInt(digitRoomMatch[1]);
    if (n >= 1 && n <= 20) return n;
  }

  const numberRoomMatch = u.match(/([a-zа-я]+)\s+(spalni|спални|spalna|спална|detski|детски|detska|детска|gostinski|гостински|gostinska|гостинска)/i);
  if (numberRoomMatch) {
    const num = parseMacedonianNumber(numberRoomMatch[1]);
    if (num !== null && num >= 1 && num <= 20) return num;
    const digitMatch = numberRoomMatch[1].match(/\d+/);
    if (digitMatch) {
      const n = parseInt(digitMatch[0]);
      if (n >= 1 && n <= 20) return n;
    }
  }

  // Fallback: parse word number (e.g. 'dve spalni' → 2, 'tri' → 3)
  // BUT skip if the word number is actually an ordinal floor reference (tret kat, vtor sprat)
  // OR if the message is about a different field (terrace follow-up, question words)
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 10) {
    // Skip if the only number words are actually ordinal floor references
    const hasOrdinalContext = /(tret|трет|vtor|втор|prv|прв|cetvrt|четврт|petti|петти|sesti|шести|sedmi|седми|osmi|осми|devetti|деветти)\s*(kat|кат|sprat|спрат)/i.test(u);
    if (hasOrdinalContext) return null;
    // Skip if message contains terrace or question context (answering terrace/other follow-up)
    if (/terasa|тераса|zosto|зошто|zasto|зашто/i.test(u)) return null;
    return wordNum;
  }
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 0 && firstNum <= 20) {
    // Skip if message contains other-field context (sqm, floor, terrace, price)
    if (/m2|м2|кв|kvadrati|квадрати|sqm|kat|кат|sprat|спрат|terasa|тераса|m²|evra|евра/i.test(u)) return null;
    return firstNum;
  }

  if (roomCount === 1) return 1;

  return null;
}

// ========================================
// Extract price (handles all formats)
// ========================================
export function extractPrice(text) {
  const u = text.toLowerCase();

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

  const iljadiIdx = u.search(/\b(iljadi|илјади)\b/i);
  if (iljadiIdx !== -1) {
    const beforeIljadi = u.slice(0, iljadiIdx).trim();
    const words = beforeIljadi.split(/\s+/);
    for (let i = Math.min(words.length, 10); i >= 1; i--) {
      const phrase = words.slice(-i).join(' ');
      const parsed = parseNumberWords(phrase);
      if (parsed !== null && parsed > 0) {
        const lastWord = words[words.length - 1];
        const singleWord = parseNumberWords(lastWord);
        if (singleWord !== null && singleWord > parsed) continue;
        return parsed * 1000;
      }
    }
  }

  const iljadiNoSpaceMatch = u.match(/(\d{1,3})iljadi/i);
  if (iljadiNoSpaceMatch) return parseInt(iljadiNoSpaceMatch[1]) * 1000;

  const iljadiSpaceMatch = u.match(/(\d{1,3})\s*iljadi/i);
  if (iljadiSpaceMatch) return parseInt(iljadiSpaceMatch[1]) * 1000;

  const iljadiNoSpaceEvraMatch = u.match(/(\d{1,3})iljadi\s*evra?/i);
  if (iljadiNoSpaceEvraMatch) return parseInt(iljadiNoSpaceEvraMatch[1]) * 1000;

  const iljadiSpaceEvraMatch = u.match(/(\d{1,3})\s*iljadi\s*evra?/i);
  if (iljadiSpaceEvraMatch) return parseInt(iljadiSpaceEvraMatch[1]) * 1000;

  const iljadiNoSpaceEvMatch = u.match(/(\d{1,3})iljadi\s*ev/i);
  if (iljadiNoSpaceEvMatch) return parseInt(iljadiNoSpaceEvMatch[1]) * 1000;

  const iljadiSpaceEvMatch = u.match(/(\d{1,3})\s*iljadi\s*ev/i);
  if (iljadiSpaceEvMatch) return parseInt(iljadiSpaceEvMatch[1]) * 1000;

  const cyrillicNoSpaceMatch = u.match(/(\d{1,3})илјади/i);
  if (cyrillicNoSpaceMatch) return parseInt(cyrillicNoSpaceMatch[1]) * 1000;

  const cyrillicSpaceMatch = u.match(/(\d{1,3})\s*илјади/i);
  if (cyrillicSpaceMatch) return parseInt(cyrillicSpaceMatch[1]) * 1000;

  const cyrillicNoSpaceEvraMatch = u.match(/(\d{1,3})илјади\s*евра?/i);
  if (cyrillicNoSpaceEvraMatch) return parseInt(cyrillicNoSpaceEvraMatch[1]) * 1000;

  const cyrillicSpaceEvraMatch = u.match(/(\d{1,3})\s*илјади\s*евра?/i);
  if (cyrillicSpaceEvraMatch) return parseInt(cyrillicSpaceEvraMatch[1]) * 1000;

  const iljadiTypoMatch = u.match(/(\d{1,3})iljade/i);
  if (iljadiTypoMatch) return parseInt(iljadiTypoMatch[1]) * 1000;

  const iljadeSpaceMatch = u.match(/(\d{1,3})\s*iljade/i);
  if (iljadeSpaceMatch) return parseInt(iljadeSpaceMatch[1]) * 1000;

  const millionMatch = u.match(/(\d+[.,]?\d*)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionMatch) {
    let num = parseFloat(millionMatch[1].replace(',', '.'));
    const iljadiPart = u.match(/(?:i|плус|plus)\s*(\d+[.,]?\d*)\s*(iljadi|илјади)/i);
    if (iljadiPart) {
      const iljadiNum = parseFloat(iljadiPart[1].replace(',', '.'));
      return Math.round((num * 1000000) + (iljadiNum * 1000));
    }
    return Math.round(num * 1000000);
  }

  const decimalMillionMatch = u.match(/(\d+[.,]\d+)\s*(miliona|miljon|милиона|милион)/i);
  if (decimalMillionMatch) {
    const num = parseFloat(decimalMillionMatch[1].replace(',', '.'));
    return Math.round(num * 1000000);
  }

  if (/miliona|милиона|miljon|милион/i.test(u) && !u.match(/\d+/)) {
    return 1000000;
  }

  // Before the aggressive cleanup fallback, check for non-price context words
  // (sqm, floor, terrace, etc.) WITHOUT any price indicators.
  // Prevents false positives like "100 m2, 3 kat" → cleanPrice=100.
  const uClean = text.toLowerCase();
  const hasPriceKeywords = /iljadi|илјади|evra|евра|eur|evro|евро|cena|цена|plate|плате|plakja|плаќа|kirija|кирија/i.test(uClean);
  if (!hasPriceKeywords) {
    const hasNonPriceContext = /m2|м2|kvadrati|квадрати|kvadrata|квадрата|kv|кв|sqm|kat|кат|sprat|спрат|katnica|катница|lift|лифт|klima|клима|garaza|гаража|terasa|тераса|spalni|спални|parking|паркинг|garage|гараж|potkrovje|поткровје/i.test(uClean);
    if (hasNonPriceContext) return null;
  }

  const cleaned = text.replace(/[\s.,]/g, '');
  const match = cleaned.match(/(\d{3,7})/);
  return match ? parseInt(match[1]) : null;
}

// ========================================
// Extract terrace number
// ========================================
export function extractTerraceNumber(text) {
  const sqmMatch = text.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв)/i);
  if (sqmMatch) return parseInt(sqmMatch[1]);

  const wordNum = parseMacedonianNumber(text);
  if (wordNum !== null && wordNum >= 1 && wordNum <= 100) return wordNum;

  const numbers = text.match(/\d+/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[numbers.length - 1]);
  }
  return null;
}

// ========================================
// Parse year built
// ========================================
export function parseYearBuilt(text) {
  const exactYearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (exactYearMatch) return parseInt(exactYearMatch[1]);

  // Skip 2-digit matches that are part of sqm/price context ('80 m2', '50 кв', '350 evra', '98 iljadi')
  const twoDigit = text.match(/\b(\d{2})\b/);
  if (twoDigit) {
    const year = parseInt(twoDigit[1]);
    // Skip if followed by sqm or price context
    const afterMatch = text.slice(twoDigit.index + twoDigit[0].length).trim();
    if (/^(m2|м2|кв|kvadrati|квадрати|kvadrata|квадрата|sqm|evra|евра|eur|iljadi|илјади|iljade|илјаде)/i.test(afterMatch)) return null;
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

  const yearWordMap = {
    'eden': 1, 'edna': 1, 'edno': 1,
    'dva': 2, 'dve': 2,
    'tri': 3,
    'cetiri': 4, 'четири': 4,
    'pet': 5, 'пет': 5,
    'sest': 6, 'шест': 6,
    'sedum': 7, 'седум': 7,
    'osum': 8, 'осум': 8,
    'devet': 9, 'девет': 9,
    'deset': 10, 'десет': 10,
    'edinaeset': 11, 'единаесет': 11,
    'dvanaeset': 12, 'дванаесет': 12,
    'trinaeset': 13, 'тринаесет': 13,
    'cetirinaeset': 14, 'четиринаесет': 14,
    'petnaeset': 15, 'петнаесет': 15,
    'sesnaeset': 16, 'шеснаесет': 16,
    'sedumnaeset': 17, 'седумнаесет': 17,
    'osumnaeset': 18, 'осумнаесет': 18,
    'devetnaeset': 19, 'деветнаесет': 19,
    'edinaesta': 11, 'dvanaesta': 12, 'trinaesta': 13,
    'cetirinaesta': 14, 'petnaesta': 15, 'sesnaesta': 16,
    'sedumnaesta': 17, 'osumnaesta': 18, 'devetnaesta': 19,
    'edinaesti': 11, 'dvanaesti': 12, 'trinaesti': 13,
    'cetirinaesti': 14, 'petnaesti': 15, 'sesnaesti': 16,
    'sedumnaesti': 17, 'osumnaesti': 18, 'devetnaesti': 19,
    'edinaesetta': 11, 'dvanaesetta': 12, 'trinaesetta': 13,
    'cetirinaesetta': 14, 'petnaesetta': 15, 'sesnaesetta': 16,
    'sedumnaesetta': 17, 'osumnaesetta': 18, 'devetnaesetta': 19,
    'edinaesetti': 11, 'dvanaesetti': 12, 'trinaesetti': 13,
    'cetirinaesetti': 14, 'petnaesetti': 15, 'sesnaesetti': 16,
    'sedumnaesetti': 17, 'osumnaesetti': 18, 'devetnaesetti': 19,
  };
  const sortedYearWords = Object.entries(yearWordMap)
    .sort((a, b) => b[0].length - a[0].length);

  const uw = text.toLowerCase().replace(/\s+/g, '');

  const iljadiMatch = uw.match(/([a-zа-я]{1,4})(iljadi|илјади)([iи]?)([a-zа-я]*)/i);
  if (iljadiMatch && iljadiMatch.index === 0) {
    const unitsStr = iljadiMatch[1];
    const suffixStr = iljadiMatch[4];

    let thousands = null;
    for (const [word, num] of sortedYearWords) {
      if (unitsStr === word && num >= 1 && num <= 9) {
        thousands = num * 1000;
        break;
      }
    }

    if (thousands !== null) {
      let suffix = null;
      if (suffixStr.length > 0) {
        for (const [word, num] of sortedYearWords) {
          if (suffixStr.startsWith(word)) {
            suffix = num;
            break;
          }
        }
      }

      const year = thousands + (suffix || 0);
      if (year >= 1900 && year <= 2099) return year;
    }
  }

  const iMatch = uw.match(/(edna|edno|eden|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)([iи])([a-zа-я]+)/i);
  if (iMatch && iMatch.index === 0) {
    const unitsStr = iMatch[1];
    const suffixStr = iMatch[3];

    let thousands = null;
    for (const [word, num] of sortedYearWords) {
      if (unitsStr === word && num >= 1 && num <= 9) {
        thousands = num * 1000;
        break;
      }
    }

    if (thousands !== null && suffixStr.length > 0) {
      for (const [word, num] of sortedYearWords) {
        if (suffixStr.startsWith(word)) {
          const year = thousands + num;
          if (year >= 1900 && year <= 2099) return year;
          break;
        }
      }
    }
  }

  return null;
}

// ========================================
// Parse orientation
// ========================================
export function parseOrientation(text) {
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
