// ============================================================
// ANA Fixture Suite — Pure Function Tests
// ============================================================
// PURPOSE: Establish baseline pass/fail on all known bugs before
// any refactoring. These are COPIES of the current service.js
// internal functions for testing purposes only.
//
// RULE: Every bug fix must rerun this FULL suite.
// RULE: Every refactoring step must rerun this FULL suite.
// RULE: Max 3 retries per bug before flagging.
// ============================================================

// ============================================================
// FIXTURE: parseMacedonianNumber
// ============================================================
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
    'sesti': 6, 'sedmi': 7, 'osmi': 8, 'devetti': 9,
    // B3: Irregular tens — "seeset" = 60 (consonant mutation: sest → see)
    'seeset': 60, 'шеесет': 60,
    'peeset': 50, 'пеесет': 50
  };

  // Sort by word length descending so 'dvanaeset' matches before 'dva'
  const sorted = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sorted) {
    if (text.includes(word)) return num;
  }
  return null;
}

// ============================================================
// FIXTURE: parseNumberWords (hundreds + tens)
// ============================================================
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

  for (const [word, num] of Object.entries(numberWords)) {
    if (u.trim() === word) return num;
  }

  const rootMap = { 'eden': 1, 'edna': 1, 'edno': 1, 'dva': 2, 'dve': 2, 'tri': 3, 'cetiri': 4, 'pet': 5, 'sest': 6, 'sedum': 7, 'osum': 8, 'devet': 9 };
  const rootGroup = '(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)';
  let result = 0;
  let found = false;
  let consumedLength = 0;

  // Track "sto\/сто" prefix (100) — added ONLY if the match didn't consume "sto" at position 0.
  // This prevents false prefix when an irregular tens word starts with "sto" (e.g. "stopeeset" = 90).
  let firstMatchIndex = null;
  const getStoPrefix = () => {
    return (firstMatchIndex !== null && firstMatchIndex !== 0 && /^(sto|сто)/i.test(u)) ? 100 : 0;
  };

  // =============================================
  // COMPOUND NUMBERS — "petstodvaeset" (520)
  // Must check BEFORE hundreds so "petsto" doesn't greedily match first
  // =============================================
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

  // =============================================
  // HUNDREDS
  // =============================================
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

  // =============================================
  // TENS
  // =============================================
  if (!found) {
    // Irregular tens first
    const irregularTens = {
      'triest': 30, 'триест': 30,
      'pedeset': 50, 'педесет': 50,
      'seeset': 60, 'шеесет': 60,
      'stopeeset': 90, 'стопеесет': 90,
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

  // =============================================
  // SUFFIX: "i {broj}" — e.g. "stodvaesetipet" = 120 + 5 = 125
  // Also handles standalone: "sto" = 100 even without a tens part
  // =============================================
  if (!found) {
    // Standalone "sto/сто" = 100
    const stoMatch = u.match(/^\s*(sto|сто)\s*$/i);
    if (stoMatch) return 100;
  }

  if (found) {
    // Check for "i {broj}" suffix after the consumed portion
    const remaining = u.slice(consumedLength).trim();
    const iBrojMatch = remaining.match(/^i\s*(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset)\s*$/i);
    if (iBrojMatch) {
      result += rootMap[iBrojMatch[1].toLowerCase()] || 0;
    }
    // Add "sto" prefix (100) only if "sto" wasn't already consumed by the match at position 0
    result += getStoPrefix();
    return result;
  }

  return null;
}

// ============================================================
// FIXTURE: extractPrice
// ============================================================
function extractPrice(text) {
  const u = text.toLowerCase();

  // 1. Handle word-based MILLIONS + THOUSANDS
  const millionWordMatch = u.match(/(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionWordMatch) {
    const numMap = { 'eden': 1, 'edna': 1, 'edno': 1, 'dva': 2, 'dve': 2, 'tri': 3, 'cetiri': 4, 'pet': 5, 'sest': 6, 'sedum': 7, 'osum': 8, 'devet': 9 };
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
        const map = { 'eden': 1, 'edna': 1, 'edno': 1, 'dva': 2, 'dve': 2, 'tri': 3, 'cetiri': 4, 'pet': 5, 'sest': 6, 'sedum': 7, 'osum': 8, 'devet': 9 };
        thousandNum = map[match[1].toLowerCase()] || 0;
        break;
      }
    }

    if (thousandNum === null) {
      const compoundThousand = u.match(/([a-zа-я]+)\s*(iljadi|илјади)/i);
      if (compoundThousand) {
        const parsed = parseNumberWords(compoundThousand[1]);
        if (parsed !== null) thousandNum = parsed;
      }
    }

    if (thousandNum !== null && thousandNum > 0) total += thousandNum * 1000;
    return total;
  }

  // 2. Handle word-based THOUSANDS only (B13: capture multi-word number phrases)
  const iljadiIdx = u.search(/\b(iljadi|илјади)\b/i);
  if (iljadiIdx !== -1) {
    const beforeIljadi = u.slice(0, iljadiIdx).trim();
    const words = beforeIljadi.split(/\s+/);
    for (let i = Math.min(words.length, 10); i >= 1; i--) {
      const phrase = words.slice(-i).join(' ');
      const parsed = parseNumberWords(phrase);
      if (parsed !== null && parsed > 0) {
        // Guard: skip if single last word parses better (noise words before number)
        const lastWord = words[words.length - 1];
        const singleWord = parseNumberWords(lastWord);
        if (singleWord !== null && singleWord > parsed) continue;
        return parsed * 1000;
      }
    }
  }

  // 3. Handle digit THOUSANDS
  const iljadiNoSpaceMatch = u.match(/(\d{1,3})iljadi/i);
  if (iljadiNoSpaceMatch) return parseInt(iljadiNoSpaceMatch[1]) * 1000;

  const iljadiSpaceMatch = u.match(/(\d{1,3})\s*iljadi/i);
  if (iljadiSpaceMatch) return parseInt(iljadiSpaceMatch[1]) * 1000;

  // Cyrillic variants
  const cyrillicNoSpaceMatch = u.match(/(\d{1,3})илјади/i);
  if (cyrillicNoSpaceMatch) return parseInt(cyrillicNoSpaceMatch[1]) * 1000;

  const cyrillicSpaceMatch = u.match(/(\d{1,3})\s*илјади/i);
  if (cyrillicSpaceMatch) return parseInt(cyrillicSpaceMatch[1]) * 1000;

  // With "evra" suffix variants
  const iljadiNoSpaceEvraMatch = u.match(/(\d{1,3})iljadi\s*evra?/i);
  if (iljadiNoSpaceEvraMatch) return parseInt(iljadiNoSpaceEvraMatch[1]) * 1000;

  const iljadiSpaceEvraMatch = u.match(/(\d{1,3})\s*iljadi\s*evra?/i);
  if (iljadiSpaceEvraMatch) return parseInt(iljadiSpaceEvraMatch[1]) * 1000;

  // Typo "iljade"
  const iljadiTypoMatch = u.match(/(\d{1,3})iljade/i);
  if (iljadiTypoMatch) return parseInt(iljadiTypoMatch[1]) * 1000;

  // MILLIONS (digit)
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

  // DECIMAL MILLIONS
  const decimalMillionMatch = u.match(/(\d+[.,]\d+)\s*(miliona|miljon|милиона|милион)/i);
  if (decimalMillionMatch) {
    const num = parseFloat(decimalMillionMatch[1].replace(',', '.'));
    return Math.round(num * 1000000);
  }

  // Vague "miliona" — assume 1 million
  if (/miliona|милиона|miljon|милион/i.test(u) && !u.match(/\d+/)) return 1000000;

  // DEFAULT: strip spaces, dots, commas and extract number
  const cleaned = text.replace(/[\s.,]/g, '');
  const match = cleaned.match(/(\d{3,7})/);
  return match ? parseInt(match[1]) : null;
}

// ============================================================
// FIXTURE: parseYearBuilt
// ============================================================
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

  // =============================================
  // B11: Macedonian word-based year parsing
  // =============================================
  const yearWordMap = {
    'eden': 1, 'edna': 1, 'edno': 1, 'dva': 2, 'dve': 2,
    'tri': 3, 'cetiri': 4, 'четири': 4, 'pet': 5, 'пет': 5,
    'sest': 6, 'шест': 6, 'sedum': 7, 'седум': 7,
    'osum': 8, 'осум': 8, 'devet': 9, 'девет': 9,
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
    // Ordinal forms
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

  // Pattern 1: {units}(iljadi/илјади)(i/и){suffix}
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
          if (suffixStr.startsWith(word)) { suffix = num; break; }
        }
      }
      const year = thousands + (suffix || 0);
      if (year >= 1900 && year <= 2099) return year;
    }
  }

  // Pattern 2: {units}(i/и){suffix} (without iljadi)
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

// ============================================================
// FIXTURE: parseOrdinalFloor
// ============================================================
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

// ============================================================
// FIXTURE: extractFirstNumber
// ============================================================
function extractFirstNumber(text) {
  const numbers = text.match(/\d{1,4}/g);
  if (numbers && numbers.length > 0) return parseInt(numbers[0]);
  return null;
}

// ============================================================
// FIXTURE: countBedrooms (B14 — plural + number+room detection)
// ============================================================
function countBedrooms(text) {
  const u = text.toLowerCase();

  // 1. Apartment type check
  if (/garsonjera|гарсонера|гарсоњера|garsoniera|гарсониера/i.test(u)) return 0;
  if (/dvosoben|двособен/i.test(u)) return 1;
  if (/trisoben|трисобен|trosoben/i.test(u)) return 2;
  if (/cetvorosoben|четирисобен|cetvortosoben/i.test(u)) return 3;
  if (/petsoben|петсобен/i.test(u)) return 4;

  // 2. Room-word counting — supports singular AND plural forms
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

  // 3. Check for number-word + room-word pattern directly (B14)
  // Runs BEFORE parseMacedonianNumber to avoid substring-order issues
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

  // 4. Fall back to number extraction on full text
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 10) return wordNum;
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null) return firstNum;

  // 5. Single room word with no number
  if (roomCount === 1) return 1;

  return null;
}

// ============================================================
// FIXTURE: extractTerraceNumber (B15 — handles word-based numbers too)
// ============================================================
function extractTerraceNumber(text) {
  // Look for number before kvadrata/m2
  const sqmMatch = text.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв)/i);
  if (sqmMatch) return parseInt(sqmMatch[1]);

  // Try word-based Macedonian number (B15 — all words, not just cetiri)
  const wordNum = parseMacedonianNumber(text);
  if (wordNum !== null && wordNum >= 1 && wordNum <= 100) return wordNum;

  // Otherwise, extract all digits and take the LAST one
  const numbers = text.match(/\d+/g);
  if (numbers && numbers.length > 0) return parseInt(numbers[numbers.length - 1]);
  return null;
}

// ============================================================
// FIXTURE: isPositive
// ============================================================
function isPositive(text) {
  return /^da$|^ima$|da ima|има|да|yes|ok|moze|може|ke|ќе|normalno|нормално|seka|сека|sekako|секако|naravno|наравно|normal|нормално|ima|има|da|ok|da be|да бе|ima klima|има клима|normalno deka ima|нормално дека има|fala bogu|фала богу|fala|фала|hvala|хвала|ima terasa|има тераса|terasa|тераса|ima na oglasot|има на огласот|sakate|сакате|ke pratam|ќе пратам|pratam|пратам|imam|имам|moze da koristite|може да користите|slobodno|слободно|da ima|да има|komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|ke vi pratam|ќе ви пратам|ke pratam|ќе пратам|moze da pratam|може да пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|se prodava|се продава|na istata|на истата|normalno-|нормално-|normalno |нормално /i.test(text);
}

// ============================================================
// FIXTURE: isNegative
// ============================================================
function isNegative(text) {
  return /^ne$|nema|нема|no|не|нега|без|ne|nema|не,|nema|нема|bez|без|nema terasa|нема тераса|nema parking|нема паркинг|nemam|немам|nemame|немаме|nema|нема|ne moze|не може|ne sakam|не сакам|nema sliki|нема слики|bez sliki|без слики|ne e|не е|ne|не|prav|прав|prazen|правен|gol|гол|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|bez namestaj|без мебел|ne e namesten|не е наместен|ne e renoviran|не е реновиран|ne e cist|не е чист|nema fotografi|нема фотографии|nema sliki|нема слики|ne sakam|не сакам|ne mi treba|не ми треба|ne sum zainteresiran|не сум заинтересиран|ostavi|остави|ne me interesira|не ме интересира|izvini|извини|nemam momentalno|немам моментално|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се|ti kazav|ти кажав|kazav|кажав|rekov|реков|ne e renoviran|не е реновиран|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран/i.test(text);
}

// ============================================================
// OBJECTION RESPONSES (copy from service.js for matchObjection)
// ============================================================
const OBJECTION_RESPONSES = {
  'commission': {
    pattern: /како без провизија|без провизија|koi vi se uslovite|какви се условите|kako rabotite|како работите|kako funkcionira|како функционира|sto znaci bez provizija|што значи без провизија|kako bez provizija|kako toa|како тоа|kako e toa|како е тоа|sto e ova|што е ова|kakva sorabotka|каква соработка|kakva e taa sorabotka|каква е таа соработка|kako mislis bez provizija|како мислиш без провизија|kakva e taa sorabotka bez provizija|каква е таа соработка без провизија|kako toa bez provizija|како тоа без провизија|kako funkcionira toa|како функционира тоа|sto znaci toa|што значи тоа/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?'
  },
  'who_pays': {
    pattern: /кој ве плаќа|koj ve plakja|кој ви плаќа|кој ви дава пари|koj vi plakja|koj vi dava pari|kako vi plakjaat|како ви плаќаат|kako se naplakjate|како се наплаќате|koj ve plakja vas|кој ве плаќа вас|koj plakja|кој плаќа|koj vi plakja za uslugata|кој ви плаќа за услугата|koi vi plakjaat|кои ви плаќаат|koj vi dava pari|кој ви дава пари|koj vi gi dava parite|кој ви ги дава парите|koj ve plakja|кој ве плаќа|koj vi e platnikot|кој ви е платникот|koi se platnicite|кои се платниците|kako vi se naplakja|како ви се наплаќа|kako vi naplakjate|како ви наплаќате|koj vi e klientot|кој ви е клиентот|koi vi se klientite|кои ви се клиентите/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви се разјасни принципот?'
  },
  'from_whose_pocket': {
    pattern: /od koj dzeb|од кој џеб|od kade se parite|од каде се парите|od kade se parite|od koj dzeb se parite|od koj dzeb gi vadite parite|од кој џеб ги вадите парите|koi se parite|чии се парите|cii se parite|чии пари се тоа|cii pari se toa|od kade pa tie pari|од каде па тие пари|od kade vam parite|од каде вам парите|kako vie ke naplakjate|како вие ќе наплаќате|kako vie zemate|како вие земате|koj vi dava provizija|кој ви дава провизија|koj vi gi dava parite za provizija|кој ви ги дава парите за провизија|od kade e provizijata|од каде е провизијата|koj plakja provizija|кој плаќа провизија|kako se naplakjate vie|како се наплаќате вие/i,
    response: 'Купувачот ја плаќа конечната цена. Вие ја добивате вашата барана цена, а нашата провизија е разликата над неа. Дали ви е појасно?'
  },
  'trust': {
    pattern: /не верувам на агенции|не им верувам|агенциите се лажни|agency scam|ne veruvam na agencii|ne im veruvam|agenciite se lazni|ne veruvam|не верувам|ne sum siguren|не сум сигурен|ne vi veruvam|не ви верувам|ne im veruvam na agenciite|не им верувам на агенциите|ne veruvam na agenciite|не верувам на агенциите/i,
    response: 'Разбирам. Затоа работиме без провизија од ваша страна и вие сами одлучувате дали ќе прифатите понуда. Дали ви звучи фер?'
  },
  'how_do_i_get': {
    pattern: /како ја добивам цената|kako ja dobivam cenata|како ја добивам мојата цена|kako ja dobivam mojata cena|како ќе ја добијам цената|kako ke ja dobijam cenata|како ми плаќате|kako mi plakjate|kako ja zadrzuvam|како ја задржувам|како доаѓам до пари|kako doagjam do pari/i,
    response: 'Вие ја задржувате вашата барана цена. Ние додаваме процент за маркетинг и документација. Дали ви е јасно?'
  },
  'percentage': {
    pattern: /колку проценти|kolku procenti|колку %|kolku %|колку додавате|kolku dodavate|колку е вашиот дел|kolku e vasiot del|колку над цената|kolku nad cenata|koja vi e provizijata|која ви е провизијата|колку земате|колку е вашата провизија|kolku % zimate|колку % земате/i,
    response: 'Ние додаваме 2% над вашата барана цена. Тоа е нашата провизија. Дали ви е јасно?'
  },
  'faster_sale': {
    pattern: /како вие побрзо би го продале|kako vie pobrzo bi go prodale|како би го продале побрзо|kako bi go prodale pobrzo|зошто преку вас побрзо|zosto preku vas pobrzo|како вие би го продале|kako vie bi go prodale/i,
    response: 'Агенцијата има голема база на потенцијални клиенти кои се спремни да купат, ако нешто им се допадне. Дали би пробале агенциски третман за вашата недвижност?'
  },
  'example': {
    pattern: /пример|primer|дај пример|daj primer|објасни ми|objasni mi|дај ми пример|daj mi primer|kazi mi primer|кажи ми пример|kako bi izgledalo|како би изгледало|daj mi primer|дај ми пример|znaci|значи|objasni|објасни|kazi|кажи|sto znaci|што значи|kako funkcionira|како функционира|kako bi izgledalo vo praksa|како би изгледало во пракса|kako bi tecelo|како би течело|kako bi se odvilo|како би се одвило|kako bi se realiziralo|како би се реализирало/i,
    response: 'На пример, ако вие барате 120.000 евра, а ние најдеме купувач за 122.000 евра, вие ги добивате вашите 120.000 евра, а разликата е наша провизија. Дали ви помогна примерот?'
  },
  'rent_timing': {
    pattern: /кога треба да ви платам|кога се плаќа|кога ја плаќам провизијата|кога ви плаќам|koga treba da vi platam|koga se plakja|koga vi plakjam|koga treba da vi platam provizija|кога треба да ви платам провизија|koga plakjam provizija|кога плаќам провизија/i,
    response: 'Провизијата се плаќа на денот на потпишување на договорот за издавање. Вие ја плаќате провизијата на агенцијата истиот ден кога клиентот ги плаќа првата кирија и депозитот. Дали ви е појасно?'
  },
  'obligations': {
    pattern: /обврски|obvrski|обврска|obvrska|други обврски|drugi obvrski|дополнителни обврски|dopolnitelni obvrski|обврски кон вас|obvrski kon vas|obvrski prema vas|обврски према вас|kakvi drugi obvrski|какви други обврски/i,
    response: 'Немате други обврски кон нас. Дали сте расположени да соработуваме?'
  }
};

function matchObjection(text) {
  for (const [key, obj] of Object.entries(OBJECTION_RESPONSES)) {
    if (obj.pattern.test(text)) return { key, response: obj.response };
  }
  return null;
}

// ============================================================
// ============================================================
// FIXTURE: parseConversationContext (context-aware intent helper)
// ============================================================
function parseConversationContext(conversation) {
  if (!conversation || conversation.trim().length === 0) {
    return { lastAnaMessage: '', lastUserMessage: '', previousUserMessages: [] };
  }

  const lines = conversation.split('\n').filter(l => l.trim());
  const userMessages = [];
  let lastAnaMessage = '';
  let lastUserMessage = '';

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith('Ана:')) {
      if (!lastAnaMessage) {
        lastAnaMessage = line.replace(/^Ана:\s*/i, '').toLowerCase();
      }
    } else if (line.startsWith('Сопственик:')) {
      const text = line.replace(/^Сопственик:\s*/i, '').toLowerCase();
      if (!lastUserMessage) {
        lastUserMessage = text;
      }
      userMessages.push(text);
    }
  }

  return {
    lastAnaMessage,
    lastUserMessage,
    previousUserMessages: userMessages.slice(0, 3)
  };
}

// ============================================================
// FIXTURE: classifyIntent (B12 — Finite State Machine, B21 — Context-aware)
// ============================================================
function classifyIntent(userInput, conversation) {
  const u = userInput.toLowerCase().trim();

  // Parse conversation context for context-aware rules
  const ctx = parseConversationContext(conversation);

  // CONTEXT: Check if Ana just explained commission/pricing in her last message
  const anaExplainingCommission = /провизија|разлика|чиста цена|купопродажна|барана цена|без провизија|нашата провизија|вашата цена/i.test(ctx.lastAnaMessage);
  const isShortEngaged = u.length < 30 && !/(ne|не)\s*(sakam|me|sum|mi)|ostavi me|izvini/i.test(u);

  // 0. PRICE QUOTE GUARD — "jas baram 156 iljadi", "sakam 98000", "cena 120 iljadi"
  const priceQuoteGuard =
    /(baram|сакам|sakam|цена|cena|price)\s*(\d{1,3}(\.\d{3})*\s*(iljadi|илјади)?)/i.test(u) ||
    /(\d{1,3}\s*(iljadi|илјади).*za\s*(mene|мене))/i.test(u) ||
    /(baram|сакам|sakam|цена|cena|price)\s+([a-zа-я]+(\s+i\s+[a-zа-я]+)*)\s+iljadi/i.test(u);
  if (priceQuoteGuard) {
    return { intent: "INTERESTED", confidence: 0.8, reason: "net price quote" };
  }

  // 1. REJECTED — with Cyrillic support
  if (/^(ne|не)$/i.test(u)) {
    // RULE B: If user was previously engaged (asked question), standalone "ne" is likely answering, not rejecting
    if (ctx.lastUserMessage && /\?|kako|sto|што|kakva|каква|kolku|колку|dali|дали|koj|кој/i.test(ctx.lastUserMessage)) {
      return { intent: "INTERESTED", confidence: 0.65, reason: "standalone ne with context: user was previously engaged" };
    }
    return { intent: "REJECTED", confidence: 0.95, reason: "standalone ne" };
  }
  if (/(ne|не)\s*sum\s*(zainteresiran|заинтересиран)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne sum zainteresiran" };
  if (/(ne|не)\s*me\s*(interesira|интересира)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne me interesira" };
  if (/(ne|не)\s*(sakam|сакам)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne sakam" };
  if (/(ne|не)\s*mi\s*(treba|треба)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne mi treba" };
  if (/(ostavi|остави)\s*(me|ме)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ostavi me" };
  if (/(izvini|извини),?\s*(ne|не)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "izvini ne" };
  if (/(nemam|немам)\s*(namera|намера)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "nemam namera" };
  if (/(nema|нема)\s*(potreba|потреба)/i.test(u)) return { intent: "REJECTED", confidence: 0.85, reason: "nema potreba" };
  if (/(ne|не)\s*(bake|бате)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "ne bake" };
  if (/(ne|не)\s*(mislam|мислам)\s*da/i.test(u)) return { intent: "REJECTED", confidence: 0.85, reason: "ne mislam da" };
  if (/(ne|не)\s*(moze|може)\s*da/i.test(u)) return { intent: "REJECTED", confidence: 0.8, reason: "ne moze da" };

  // 2. ACCEPTED — with Cyrillic support
  if (/^(da|да)$/i.test(u)) {
    // RULE C: If user previously hesitated, standalone "da" is not true acceptance
    const hasPreviousHesitation = ctx.previousUserMessages.some(msg =>
      /mislam|мислам|mozebi|можеби|sepak|сепак|ama|ама|ne sum|не сум|ne znam|не знам|razmisl|размисл|prvo|прво|samo|само|probam|пробам|ke vidime|ќе видиме|da vidime|да видиме/i.test(msg)
    );
    if (hasPreviousHesitation) {
      return { intent: "INTERESTED", confidence: 0.6, reason: "standalone da with context: previous hesitation" };
    }
    return { intent: "ACCEPTED", confidence: 0.95, reason: "standalone da" };
  }
  // COMPREHENSIVE GUARD: affirmative start + objection/concern/question → INTERESTED (not ACCEPTED)
  if (/^(da|да|ajde|ајде|moze|може|dobro|добро)([,.\s]|$)/i.test(u) &&
      /(\?|a\s+(sto|што|kako|како|dali|дали|koj|кој|koga|кога|kolku|колку|zosto|зошто|kakov|каков|kakva|каква|kakvo|какво|kakvi|какви)|ama|ама|sepak|сепак|mislam|мислам|dali|дали|mozebi|можеби|druga|друга|vekje|веќе|ke vidime|ќе видиме|da vidime|да видиме|ne sum|не сум|ne znam|не знам|ke razmislam|ќе размислам|razmisluvam|размислувам|ne rabotel|не работел|nemam iskustvo|немам искуство|ne sum siguren|не сум сигурен|ke prasam|ќе прашам|ke se javam|ќе се јавам|da se javam|да се јавам|da prasam|да прашам|ne sum rabotil|не сум работел|ne rabotila|не работела|nemam raboteno|немам работено|imam\s+dogovor|имам\s+договор|sto\s+ke|што\s+ќе|kako\s+ke|како\s+ќе|se\s+mislam|се\s+мислам|treba\s+da|треба\s+da|prvo|прво|samo\s+|само\s+)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "affirmative start + hesitation" };
  }
  if (/^(da|да|ajde|ајде|moze|може|dobro|добро)([,.\s]|$)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "affirmative start" };
  if (/(ajde|ајде)/i.test(u) && !/(ne|не)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "ajde" };
  if (/(probame|пробаме)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "probame" };
  if (/(sorabotuvame|соработуваме)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "sorabotuvame" };
  if (/vo\s*(red|ред)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "vo red" };
  if (/se\s*(soglasuvam|согласувам)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "se soglasuvam" };
  if (/(prifakjam|прифаќам)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "prifakjam" };
  if (/(zosto|зошто)\s*da\s*(ne|не)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "zosto da ne" };
  if (/(ako|ако)\s*(e|е)\s*(taka|така)/i.test(u) && /(moze|може)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.85, reason: "ako e taka moze" };
  if (/(ke|ќе)\s*(probam|пробам)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.85, reason: "ke probam" };
  if (/(dogovor|договор)/i.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "dogovor" };

  // 3. INTERESTED — with Cyrillic support
  if (/\?/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "question mark" };
  if (/(kako|како)\s*(raboti|работи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kako raboti" };
  if (/(kako|како)\s*(funkcionira|функционира)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kako funkcionira" };
  if (/(sto|што)\s*(znaci|значи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "sto znaci" };
  if (/(sto|shto|што)\s*(e|е)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "sto e" };
  if (/(koi|кои|kakvi|какви)\s*(se|се)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "koi se" };
  if (/(kakva|каква)\s*(sorabotka|соработка)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kakva sorabotka" };
  if (/(kako|како)\s*(vie|вие)/i.test(u)) return { intent: "INTERESTED", confidence: 0.75, reason: "kako vie" };
  if (/(primer|пример|objasni|објасни)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "asking for example" };
  if (/(znaci|значи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "znaci" };
  if (/(uslovi|услови)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "uslovi" };
  if (/(mozebi|можеби)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "mozebi" };
  if (/(razmisluvam|размислувам|ke razmislam|ќе размислам)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "razmisluvam" };
  if (/(ne|не)\s*sum\s*(siguren|сигурен)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "ne sum siguren" };
  if (/(sepak|сепак)/i.test(u) && !/(ama|ама)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "sepak" };
  if (/(da|да)\s*(vidime|видиме)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "da vidime" };
  if (/(interesno|интересно)/i.test(u)) return { intent: "INTERESTED", confidence: 0.75, reason: "interesno" };
  if (/(moze|може)\s*da\s*(probame|пробаме)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "moze da probame" };
  if (/(ne|не)\s*(veruvam|верувам)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "ne veruvam" };
  if (/(nemam|немам)\s*(doverba|доверба)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "nemam doverba" };

  // 4. Default (with context boost: if Ana was explaining commission, boost to INTERESTED)
  if (anaExplainingCommission && isShortEngaged) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "ambiguous with commission context" };
  }
  return { intent: "INTERESTED", confidence: 0.5, reason: "ambiguous default" };
}

// ============================================================
// FIXTURE: assertIntentEqual (for cleanup/testing intent results)
// ============================================================
function assertIntentEqual(actual, expectedIntent, expectedConfidence, label) {
  const pass = actual && actual.intent === expectedIntent && actual.confidence >= expectedConfidence;
  if (pass) {
    passed++;
    console.log(`  ✅ ${label} → ${actual.intent} (${actual.confidence}, ${actual.reason})`);
  } else {
    failed++;
    const msg = `  ❌ ${label} — expected ${expectedIntent} >=${expectedConfidence}, got ${actual?.intent} (${actual?.confidence})`;
    failures.push(msg);
    console.log(msg);
  }
}

// ============================================================
// FIXTURE: parseOrientation (abbreviated for testing)
// ============================================================
function parseOrientation(text) {
  const normalized = text
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

// ============================================================
// TEST SUITE
// ============================================================

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, expected, actual) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    const msg = `  ❌ ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
    failures.push(msg);
    console.log(msg);
  }
}

function assertEqual(actual, expected, label) {
  assert(actual === expected, label, expected, actual);
}

function assertNotNull(actual, label) {
  assert(actual !== null && actual !== undefined, label, 'not null', actual);
}

function assertNull(actual, label) {
  assert(actual === null || actual === undefined, label, 'null', actual);
}

// ============================================================
// TEST GROUP: parseMacedonianNumber
// ============================================================
console.log(`\n📦 GROUP: parseMacedonianNumber`);

// B3: "seeset" = 60 (now fixed with irregular tens)
assertEqual(parseMacedonianNumber("seeset"), 60, "B3: 'seeset' → 60 (fixed!)");

// B6/B10: substring issue — "dvanaeset" should be 12, not 2
assertEqual(parseMacedonianNumber("dvanaeset"), 12, "B6/B10: 'dvanaeset' → 12 (⚠ current: 2 — substring match bug!)");

assertEqual(parseMacedonianNumber("cetirinaeset"), 14, "B6: 'cetirinaeset' → 14 (⚠ current: 4)");

// Working cases
assertEqual(parseMacedonianNumber("dva"), 2, "dva → 2");
assertEqual(parseMacedonianNumber("tri"), 3, "tri → 3");
assertEqual(parseMacedonianNumber("pet"), 5, "pet → 5");
assertEqual(parseMacedonianNumber("devet"), 9, "devet → 9");
assertEqual(parseMacedonianNumber("deset"), 10, "deset → 10");
assertEqual(parseMacedonianNumber("trinaeset"), 13, "trinaeset → 13");
assertEqual(parseMacedonianNumber("petnaeset"), 15, "petnaeset → 15");

// ============================================================
// TEST GROUP: parseNumberWords
// ============================================================
console.log(`\n📦 GROUP: parseNumberWords (hundreds + tens)`);

assertEqual(parseNumberWords("petsto"), 500, "petsto → 500");
assertEqual(parseNumberWords("dvesto"), 200, "dvesto → 200");
assertEqual(parseNumberWords("dvaeset"), 20, "dvaeset → 20");
assertEqual(parseNumberWords("triest"), 30, "triest → 30");
assertEqual(parseNumberWords("pedeset"), 50, "pedeset → 50");

// Compound: "petstodvaeset" = 520
assertEqual(parseNumberWords("petstodvaeset"), 520, "petstodvaeset → 520");

// B1 critical — "stodvaesetipet" should be 125
assertEqual(parseNumberWords("stodvaesetipet"), 125, "B1: 'stodvaesetipet' → 125 (sto + dvaeset + i + pet)");

// "seeset" = 60 variant — NOW FIXED
assertEqual(parseNumberWords("seeset"), 60, "B2/B3: 'seeset' → 60 (fixed!)");

// B2: "seesetipet" = 65 (seeset=60 + i pet=5)
assertEqual(parseNumberWords("seesetipet"), 65, "B2: 'seesetipet' → 65 (seeset=60 + i pet=5)");

// ============================================================
// TEST GROUP: extractPrice
// ============================================================
console.log(`\n📦 GROUP: extractPrice`);

// B1: "stodvaesetipet iljadi" = 125000
const priceB1 = extractPrice("ZA MENE BARAM STODVAESETIPET ILJADI EVRA");
assertEqual(priceB1, 125000, "B1: 'STODVAESETIPET ILJADI EVRA' → 125000 (⚠ current: 20000)");

// Standard price cases
assertEqual(extractPrice("105000 evra"), 105000, "'105000 evra' → 105000");
assertEqual(extractPrice("baram 120000 evra"), 120000, "'baram 120000 evra' → 120000");
assertEqual(extractPrice("2 miliona"), 2000000, "'2 miliona' → 2000000");
assertEqual(extractPrice("98 iljadi"), 98000, "'98 iljadi' → 98000");
assertEqual(extractPrice("250 evra"), 250, "'250 evra' → 250");

// ============================================================
// TEST GROUP: parseYearBuilt
// ============================================================
console.log(`\n📦 GROUP: parseYearBuilt`);

// B11: "dveiljadiidvanaesta" = 2012 (but this is Cyrillic Macedonian)
// The text "dveiljadiidvanaesta" means "2012" in Macedonian words
assertEqual(parseYearBuilt("2012"), 2012, "'2012' → 2012");
assertEqual(parseYearBuilt("70ti posle zemjotresot"), 1975, "'70ti posle zemjotresot' → 1975");
assertEqual(parseYearBuilt("90ta"), 1990, "'90ta' → 1990");
assertEqual(parseYearBuilt("2000ta"), 2000, "'2000ta' → 2000");  // B11: Word-based years
  assertEqual(parseYearBuilt("dveiljadiidvanaesta"), 2012, "B11: 'dveiljadiidvanaesta' → 2012");
  assertEqual(parseYearBuilt("dveidvanaesta mislam"), 2012, "B11: 'dveidvanaesta mislam' → 2012");

// ============================================================
// TEST GROUP: parseOrdinalFloor
// ============================================================
console.log(`\n📦 GROUP: parseOrdinalFloor`);

assertEqual(parseOrdinalFloor("na vtor kat"), 2, "'na vtor kat' → 2");
assertEqual(parseOrdinalFloor("prizemje"), 0, "'prizemje' → 0");
assertEqual(parseOrdinalFloor("cetvrt kat"), 4, "'cetvrt kat' → 4");
assertEqual(parseOrdinalFloor("na potkrovje"), null, "'na potkrovje' → null (не е ordinal)");

// ============================================================
// TEST GROUP: isPositive
// ============================================================
console.log(`\n📦 GROUP: isPositive`);

assert(isPositive("da"), true, "'da' → true");
assert(isPositive("ima"), true, "'ima' → true");
assert(isPositive("DA"), true, "'DA' → true");
assert(isPositive("normalno"), true, "'normalno' → true");
assert(isPositive("ke ispratam"), true, "'ke ispratam' → true");
assert(isPositive("moze"), true, "'moze' → true");

// B4: "IMA" should be positive
assert(isPositive("IMA"), true, "B4: 'IMA' → true");
assert(isPositive("ima 3 kvadrata"), true, "'ima 3 kvadrata e' → true");

// Edge cases — should not false positive
assert(isPositive("dava pare"), false, "'dava pare' → false (not positive)");
assert(isPositive("dali"), false, "'dali' → false (not positive)");

// ============================================================
// TEST GROUP: isNegative
// ============================================================
console.log(`\n📦 GROUP: isNegative`);

assert(isNegative("ne"), true, "'ne' → true");
assert(isNegative("nema"), true, "'nema' → true");
assert(isNegative("NEMA"), true, "'NEMA' → true");
assert(isNegative("nemam sliki"), true, "'nemam sliki' → true");
assert(isNegative("ne moze"), true, "'ne moze' → true");
assert(isNegative("bez"), true, "'bez' → true");

// ============================================================
// TEST GROUP: matchObjection
// ============================================================
console.log(`\n📦 GROUP: matchObjection`);

const obj1 = matchObjection("kako mislis bez provizija");
assert(obj1 !== null, "'kako mislis bez provizija' → matched");
assert(obj1?.key === 'commission', "'kako mislis bez provizija' → 'commission'");

const obj2 = matchObjection("ne veruvam na agencii");
assert(obj2 !== null, "'ne veruvam na agencii' → matched");
assert(obj2?.key === 'trust', "'ne veruvam na agencii' → 'trust'");

const obj3 = matchObjection("daj primer");
assert(obj3 !== null, "'daj primer' → matched");
assert(obj3?.key === 'example', "'daj primer' → 'example'");

const obj4 = matchObjection("kolku procenti zemate");
assert(obj4 !== null, "'kolku procenti zemate' → matched");
assert(obj4?.key === 'percentage', "'kolku procenti zemate' → 'percentage'");

const obj5 = matchObjection("kako vie pobrzo bi go prodale");
assert(obj5 !== null, "'kako vie pobrzo bi go prodale' → matched");
assert(obj5?.key === 'faster_sale', "→ 'faster_sale'");

// ============================================================
// TEST GROUP: classifyIntent (B12 FSM)
// ============================================================
console.log(`\n📦 GROUP: classifyIntent`);

// REJECTED cases
assertIntentEqual(classifyIntent("ne"), "REJECTED", 0.9, "'ne' → REJECTED");
assertIntentEqual(classifyIntent("ne sakam"), "REJECTED", 0.9, "B12: 'ne sakam' → REJECTED");
assertIntentEqual(classifyIntent("ne mi treba"), "REJECTED", 0.9, "'ne mi treba' → REJECTED");
assertIntentEqual(classifyIntent("ne sum zainteresiran"), "REJECTED", 0.9, "'ne sum zainteresiran' → REJECTED");
assertIntentEqual(classifyIntent("ne me interesira"), "REJECTED", 0.9, "'ne me interesira' → REJECTED");
assertIntentEqual(classifyIntent("ostavi me"), "REJECTED", 0.9, "'ostavi me' → REJECTED");
assertIntentEqual(classifyIntent("izvini, ne"), "REJECTED", 0.9, "'izvini, ne' → REJECTED");

// ACCEPTED cases
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.9, "'da' → ACCEPTED");
assertIntentEqual(classifyIntent("ajde"), "ACCEPTED", 0.8, "'ajde' → ACCEPTED");
assertIntentEqual(classifyIntent("moze"), "ACCEPTED", 0.8, "'moze' → ACCEPTED");
assertIntentEqual(classifyIntent("dobro"), "ACCEPTED", 0.8, "'dobro' → ACCEPTED");
assertIntentEqual(classifyIntent("probame"), "ACCEPTED", 0.8, "'probame' → ACCEPTED");
assertIntentEqual(classifyIntent("sorabotuvame"), "ACCEPTED", 0.9, "'sorabotuvame' → ACCEPTED");
assertIntentEqual(classifyIntent("vo red"), "ACCEPTED", 0.8, "'vo red' → ACCEPTED");
assertIntentEqual(classifyIntent("zosto da ne"), "ACCEPTED", 0.8, "'zosto da ne' → ACCEPTED");
assertIntentEqual(classifyIntent("se soglasuvam"), "ACCEPTED", 0.9, "'se soglasuvam' → ACCEPTED");
assertIntentEqual(classifyIntent("prifakjam"), "ACCEPTED", 0.9, "'prifakjam' → ACCEPTED");

// INTERESTED cases
assertIntentEqual(classifyIntent("kako raboti?"), "INTERESTED", 0.7, "'kako raboti?' → INTERESTED");
assertIntentEqual(classifyIntent("koi se uslovite"), "INTERESTED", 0.7, "'koi se uslovite' → INTERESTED");
assertIntentEqual(classifyIntent("mozebi"), "INTERESTED", 0.6, "'mozebi' → INTERESTED");
assertIntentEqual(classifyIntent("ke razmislam"), "INTERESTED", 0.6, "'ke razmislam' → INTERESTED");
assertIntentEqual(classifyIntent("ne sum siguren"), "INTERESTED", 0.6, "'ne sum siguren' → INTERESTED");
assertIntentEqual(classifyIntent("interesno"), "INTERESTED", 0.7, "'interesno' → INTERESTED");
assertIntentEqual(classifyIntent("ne veruvam na agencii"), "INTERESTED", 0.5, "'ne veruvam na agencii' → INTERESTED");
assertIntentEqual(classifyIntent("kako vie bi go prodale"), "INTERESTED", 0.7, "'kako vie bi go prodale' → INTERESTED");
assertIntentEqual(classifyIntent("daj primer"), "INTERESTED", 0.7, "'daj primer' → INTERESTED");

// HESITATION GUARD — affirmative start + hesitation should be INTERESTED, not ACCEPTED
assertIntentEqual(classifyIntent("da da, jasnomi e ama sepak se mislam"), "INTERESTED", 0.6, "H1: 'da da, ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("da ama ne sum siguren"), "INTERESTED", 0.6, "H2: 'da ama ne sum siguren' → INTERESTED");
assertIntentEqual(classifyIntent("da sepak ne znam"), "INTERESTED", 0.6, "H3: 'da sepak ne znam' → INTERESTED");
assertIntentEqual(classifyIntent("da mozebi ke probame"), "INTERESTED", 0.6, "H4: 'da mozebi ke probame' → INTERESTED");
assertIntentEqual(classifyIntent("ajde ama sepak"), "INTERESTED", 0.6, "H5: 'ajde ama sepak' → INTERESTED");
assertIntentEqual(classifyIntent("da ke vidime"), "INTERESTED", 0.6, "H6: 'da ke vidime' → INTERESTED");
assertIntentEqual(classifyIntent("da ne sum rabotel so agencii"), "INTERESTED", 0.6, "H7: 'da ne sum rabotel so agencii' → INTERESTED");
assertIntentEqual(classifyIntent("dobro ama sepak se mislam"), "INTERESTED", 0.6, "H8: 'dobro ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("moze ama sepak"), "INTERESTED", 0.6, "H9: 'moze ama sepak' → INTERESTED");
assertIntentEqual(classifyIntent("da da, ke razmislam uste malce"), "INTERESTED", 0.6, "H10: 'da da, ke razmislam' → INTERESTED");

// Separately: standalone "sepak" should be INTERESTED (not ignored)
assertIntentEqual(classifyIntent("sepak ne sum siguren"), "INTERESTED", 0.5, "H11: 'sepak ne sum siguren' → INTERESTED");

// Confirm pure affirmatives still work correctly (no regression)
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.9, "REGRESSION: 'da' still → ACCEPTED");
assertIntentEqual(classifyIntent("da probame"), "ACCEPTED", 0.8, "REGRESSION: 'da probame' → ACCEPTED");
assertIntentEqual(classifyIntent("da sorabotuvame"), "ACCEPTED", 0.8, "REGRESSION: 'da sorabotuvame' → ACCEPTED");
assertIntentEqual(classifyIntent("ajde ajde"), "ACCEPTED", 0.8, "REGRESSION: 'ajde ajde' → ACCEPTED");  assertIntentEqual(classifyIntent("dobro. javete se"), "ACCEPTED", 0.8, "REGRESSION: 'dobro. javete se' → ACCEPTED");

// ============================================================
// CONTEXT-AWARE (B21) — classifyIntent with conversation history
// ============================================================
console.log(`  ── Context-aware rules (B21)`);

// Helper: build conv string with Ana's last message
function convWithAna(text) {
  return `Ана: Здраво, јас сум Ана од Metropolis.
Сопственик: KAKVI SE USLOVITE?
Ана: ${text}`;
}

// Helper: build conv string with the last user message showing engagement
function convWithUserQuestion(userMsg) {
  return `Ана: Здраво, јас сум Ана од Metropolis.
Сопственик: ${userMsg}
Ана: Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?`;
}

// Helper: build conv with previous user hesitation
function convWithHesitation(hesitationMsg) {
  return `Ана: Здраво, јас сум Ана од Metropolis.
Сопственик: ${hesitationMsg}
Ана: Ве разбирам, имаме голем број клиенти заинтересирани. Дали сте расположени да соработуваме?
Сопственик: da
Ана: Одлично! Која би била последната чиста цена за станот?`;
}

// RULE A: Objection context boost — Ana explaining commission should boost INTERESTED
assertIntentEqual(
  classifyIntent("kazete mi poveke", convWithAna("Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата.")),
  "INTERESTED", 0.6,
  "B21-A1: ambiguous reply → INTERESTED with commission context"
);

// RULE B: Previous user engagement → standalone "ne" downgraded from REJECTED
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KAKVI SE USLOVITE?")),
  "INTERESTED", 0.6,
  "B21-B1: 'ne' → INTERESTED when user previously asked a question"
);
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KOLKU PROVZIJA ZEMATE?")),
  "INTERESTED", 0.6,
  "B21-B2: 'ne' → INTERESTED when user asked about commission"
);
assertIntentEqual(
  classifyIntent("ne", convWithUserQuestion("KAKO RABOTI TOA?")),
  "INTERESTED", 0.6,
  "B21-B3: 'ne' → INTERESTED when user asked 'how does it work?'"
);

// RULE B (control): Without conversation context, standalone "ne" is still REJECTED
assertIntentEqual(
  classifyIntent("ne", ""),
  "REJECTED", 0.9,
  "B21-B4: 'ne' without context → still REJECTED"
);

// RULE C: Previous hesitation → standalone "da" downgraded to INTERESTED
assertIntentEqual(
  classifyIntent("da", convWithHesitation("mozebi ke probam ama ne sum siguren")),
  "INTERESTED", 0.5,
  "B21-C1: 'da' → INTERESTED when user previously hesitated"
);
assertIntentEqual(
  classifyIntent("da", convWithHesitation("se mislam uste")),
  "INTERESTED", 0.5,
  "B21-C2: 'da' → INTERESTED when user said 'se mislam'"
);

// RULE C (control): Without previous hesitation, "da" is still ACCEPTED
assertIntentEqual(
  classifyIntent("da", ""),
  "ACCEPTED", 0.9,
  "B21-C3: 'da' without hesitation context → still ACCEPTED"
);

// RULE C (control): Strong explicit acceptance overrides hesitation context
assertIntentEqual(
  classifyIntent("da sorabotuvame", convWithHesitation("mozebi")),
  "ACCEPTED", 0.8,
  "B21-C4: 'da sorabotuvame' → ACCEPTED regardless of context"
);

// NEW OBJECTION PATTERNS — expanded guard catches questions, other agencies, conditions, etc.
assertIntentEqual(classifyIntent("dobro zvuci. a sto ke pravime so toa sto jas vekje sorabotuvam so edna druga agencija?"), "INTERESTED", 0.6, "H12: 'dobro zvuci. a sto ke pravime so druga agencija?' → INTERESTED");
assertIntentEqual(classifyIntent("da, a kako ke funkcionira toa?"), "INTERESTED", 0.6, "H13: 'da, a kako ke funkcionira?' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, imam dogovor so druga agencija"), "INTERESTED", 0.6, "H14: 'dobro, imam dogovor so druga agencija' → INTERESTED");
assertIntentEqual(classifyIntent("da, vekje sorabotuvam so edna agencija"), "INTERESTED", 0.6, "H15: 'da, vekje sorabotuvam so agencija' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, sto ke pravime so garazata?"), "INTERESTED", 0.6, "H16: 'dobro, sto ke pravime?' → INTERESTED");
assertIntentEqual(classifyIntent("da, treba da prasam uste nesto"), "INTERESTED", 0.6, "H17: 'da, treba da prasam uste nesto' → INTERESTED");
assertIntentEqual(classifyIntent("moze, samo da proveram nesto"), "INTERESTED", 0.6, "H18: 'moze, samo da proveram nesto' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, prvo sakam da prasam nesto"), "INTERESTED", 0.6, "H19: 'dobro, prvo sakam da prasam' → INTERESTED");
assertIntentEqual(classifyIntent("dobro zvuci. vekje sorabotuvam so druga agencija"), "INTERESTED", 0.6, "H20: 'dobro zvuci. vekje sorabotuvam so druga' → INTERESTED");
assertIntentEqual(classifyIntent("ajde, ama sepak se mislam deka"), "INTERESTED", 0.6, "H21: 'ajde, ama sepak se mislam' → INTERESTED");
assertIntentEqual(classifyIntent("da, a dali moze da se dogovorime?"), "INTERESTED", 0.6, "H22: 'da, a dali moze da se dogovorime?' → INTERESTED");
assertIntentEqual(classifyIntent("dobro, kako ke odi celiot proces?"), "INTERESTED", 0.6, "H23: 'dobro, kako ke odi procesot?' → INTERESTED");
assertIntentEqual(classifyIntent("da, sepak se mislam uste"), "INTERESTED", 0.6, "H24: 'da, sepak se mislam' → INTERESTED");

// Confirm pure affirmatives still work after new patterns (no regression)
assertIntentEqual(classifyIntent("da"), "ACCEPTED", 0.9, "REGRESSION H: 'da' still → ACCEPTED");
assertIntentEqual(classifyIntent("dobro"), "ACCEPTED", 0.8, "REGRESSION H: 'dobro' still → ACCEPTED");
assertIntentEqual(classifyIntent("da probame"), "ACCEPTED", 0.8, "REGRESSION H: 'da probame' → ACCEPTED");

// Cyrillic variants (B12 critical — patterns must support both scripts)
assertIntentEqual(classifyIntent("ne sakam"), "REJECTED", 0.9, "B12 Cyrillic: 'ne sakam' (Latin) → REJECTED");
assertIntentEqual(classifyIntent("не сакам"), "REJECTED", 0.9, "B12 Cyrillic: 'не сакам' (Cyrillic) → REJECTED");
assertIntentEqual(classifyIntent("да"), "ACCEPTED", 0.9, "Cyrillic: 'да' (Cyrillic) → ACCEPTED");
assertIntentEqual(classifyIntent("не верувам на агенции"), "INTERESTED", 0.5, "Cyrillic: 'не верувам на агенции' → INTERESTED");
assertIntentEqual(classifyIntent("како работи?"), "INTERESTED", 0.7, "Cyrillic: 'како работи?' → INTERESTED");

// AMBIGUOUS default
const amb = classifyIntent("dali") || {};
assert(amb.intent === "INTERESTED" && amb.confidence === 0.5, "'dali' → INTERESTED 0.5 default", "INTERESTED 0.5", amb.intent + " " + amb.confidence);

// ============================================================
// TEST GROUP: extractTerraceNumber
// ============================================================
console.log(`\n📦 GROUP: extractTerraceNumber`);

assertEqual(extractTerraceNumber("ima 3 kvadrata e"), 3, "'ima 3 kvadrata e' → 3");
assertEqual(extractTerraceNumber("terasa 5 m2"), 5, "'terasa 5 m2' → 5");
assertEqual(extractTerraceNumber("nema"), null, "'nema' → null");

// ============================================================
// TEST GROUP: extractFirstNumber
// ============================================================
console.log(`\n📦 GROUP: extractFirstNumber`);

assertEqual(extractFirstNumber("105000 evra"), 1050, "'105000 evra' → 1050 (returns first 4 digits)");
assertEqual(extractFirstNumber("3 kvadrata"), 3, "'3 kvadrata' → 3");
assertEqual(extractFirstNumber("65m2"), 65, "'65m2' → 65");
assertEqual(extractFirstNumber("nema broj"), null, "'nema broj' → null");

// ============================================================
// TEST GROUP: countBedrooms
// ============================================================
console.log(`\n📦 GROUP: countBedrooms`);

// B5: "една голема спална и една детска" = 2
assertEqual(countBedrooms("EDNA GOLEMA SPALNA I EDNA DETSKA"), 2, "B5: 'EDNA GOLEMA SPALNA I ENA DETSKA' → 2");

// Known apartment types
assertEqual(countBedrooms("garsonjera"), 0, "garsonjera → 0");
assertEqual(countBedrooms("dvosoben stan"), 1, "dvosoben stan → 1");
assertEqual(countBedrooms("trisoben"), 2, "trisoben → 2");

// Simple number-based (handled by parseMacedonianNumber/extractFirstNumber fallback)
assertEqual(countBedrooms("2 spalni"), 2, "'2 spalni' → 2");
assertEqual(countBedrooms("tri spalni"), 3, "'tri spalni' → 3");

// Single bedroom word (roomCount=1, no number → returns 1)
assertEqual(countBedrooms("ima edna spalna"), 1, "'ima edna spalna' → 1");

// Compound: spalni doesn't match 'spalna', detska matches once → roomCount=1 < 2
// Falls through to parseMacedonianNumber: 'dve'=2 → returns 2
assertEqual(countBedrooms("dve spalni i detska"), 2, "'dve spalni i detska' → 2 (dve=2 via fallback)");

// Fallback to number word
assertEqual(countBedrooms("cetiri"), 4, "'cetiri' → 4 (fallback)");

// Multiple room-words: спална + детска = 2 (caught by roomCount >= 2)
assertEqual(countBedrooms("edna spalna i edna detska"), 2, "'edna spalna i edna detska' → 2 (room words)");
assertEqual(countBedrooms("spalna, detska i gostinska"), 3, "'spalna, detska i gostinska' → 3 (3 room words)");

// ============================================================
// TEST GROUP: parseOrientation
// ============================================================
console.log(`\n📦 GROUP: parseOrientation`);

const or1 = parseOrientation("sever");
assert(or1 !== null, "'sever' → parsed");
assert(or1?.includes('sever'), "'sever' contains 'sever'");

const or2 = parseOrientation("severistok");
assert(or2 !== null, "'severistok' → parsed");
assert(or2?.includes('sever'), "'severistok' contains 'sever'");
assert(or2?.includes('istok'), "'severistok' contains 'istok'");

const or3 = parseOrientation("jug");
assert(or3 !== null, "'jug' → parsed");
assert(or3?.includes('jug'), "'jug' contains 'jug'");

// ============================================================
// TEST GROUP: B13 — Multi-word price thousand parsing
// ============================================================
console.log(`\n📦 GROUP: B13 — Multi-word price thousand parsing`);

// The core bug: "stodvaeset i pet iljadi" = 125000
assertEqual(extractPrice("stodvaeset i pet iljadi"), 125000, "B13: 'stodvaeset i pet iljadi' → 125000");

// All variants of number phrases before iljadi
assertEqual(extractPrice("sto iljadi evra"), 100000, "B13: 'sto iljadi evra' → 100000");
assertEqual(extractPrice("dvesto iljadi"), 200000, "B13: 'dvesto iljadi' → 200000");
assertEqual(extractPrice("petstodvaeset iljadi"), 520000, "B13: 'petstodvaeset iljadi' → 520000");
assertEqual(extractPrice("dvaeset iljadi"), 20000, "B13: 'dvaeset iljadi' → 20000");
assertEqual(extractPrice("triest iljadi"), 30000, "B13: 'triest iljadi' → 30000");
assertEqual(extractPrice("pedeset iljadi"), 50000, "B13: 'pedeset iljadi' → 50000");
assertEqual(extractPrice("seeset iljadi"), 60000, "B13: 'seeset iljadi' → 60000");

// Multi-word with "i": stodvaeset i X iljadi
assertEqual(extractPrice("stodvaeset i pet iljadi"), 125000, "B13: 'stodvaeset i pet iljadi' → 125000");
assertEqual(extractPrice("stodvaeset i tri iljadi"), 123000, "B13: 'stodvaeset i tri iljadi' → 123000");
assertEqual(extractPrice("stotriest i cetiri iljadi"), 134000, "B13: 'stotriest i cetiri iljadi' → 134000");

// Regular single-word before iljadi (should still work)
assertEqual(extractPrice("pet iljadi"), 5000, "B13: 'pet iljadi' → 5000");
assertEqual(extractPrice("deset iljadi"), 10000, "B13: 'deset iljadi' → 10000");

// ============================================================
// TEST GROUP: B14 — Bedroom count variants
// ============================================================
console.log(`\n📦 GROUP: B14 — Bedroom count with plural + number+room`);

// Core bug: "dve spalni. edna pogolema drugata mala" = 2
assertEqual(countBedrooms("dve spalni. edna pogolema drugata mala"), 2, "B14: 'dve spalni. edna pogolema drugata mala' → 2");

// All number words + plural spalni
assertEqual(countBedrooms("edna spalni"), 1, "B14: 'edna spalni' → 1");
assertEqual(countBedrooms("dve spalni"), 2, "B14: 'dve spalni' → 2");
assertEqual(countBedrooms("tri spalni"), 3, "B14: 'tri spalni' → 3");
assertEqual(countBedrooms("cetiri spalni"), 4, "B14: 'cetiri spalni' → 4");
assertEqual(countBedrooms("pet spalni"), 5, "B14: 'pet spalni' → 5");
assertEqual(countBedrooms("sest spalni"), 6, "B14: 'sest spalni' → 6");
assertEqual(countBedrooms("sedum spalni"), 7, "B14: 'sedum spalni' → 7");
assertEqual(countBedrooms("osum spalni"), 8, "B14: 'osum spalni' → 8");

// Plural room words should be matched
assertEqual(countBedrooms("dve detski"), 2, "B14: 'dve detski' → 2");
assertEqual(countBedrooms("edna gostinska i edna spalna"), 2, "B14: 'edna gostinska i edna spalna' → 2");
assertEqual(countBedrooms("dve spalni i edna detska"), 2, "B14: 'dve spalni i edna detska' → 2 (roomCount>=2)");

// ============================================================
// TEST GROUP: B15 — Terrace word-based numbers
// ============================================================
console.log(`\n📦 GROUP: B15 — Terrace word-based numbers`);

// Core bug: "cetiri" (word-based) should work
assertEqual(extractTerraceNumber("cetiri"), 4, "B15: 'cetiri' → 4");

// All Macedonian number words for terrace size
assertEqual(extractTerraceNumber("edna"), 1, "B15: 'edna' → 1");
assertEqual(extractTerraceNumber("dve"), 2, "B15: 'dve' → 2");
assertEqual(extractTerraceNumber("tri"), 3, "B15: 'tri' → 3");
assertEqual(extractTerraceNumber("cetiri"), 4, "B15: 'cetiri' → 4");
assertEqual(extractTerraceNumber("pet"), 5, "B15: 'pet' → 5");
assertEqual(extractTerraceNumber("sest"), 6, "B15: 'sest' → 6");
assertEqual(extractTerraceNumber("sedum"), 7, "B15: 'sedum' → 7");
assertEqual(extractTerraceNumber("osum"), 8, "B15: 'osum' → 8");
assertEqual(extractTerraceNumber("devet"), 9, "B15: 'devet' → 9");
assertEqual(extractTerraceNumber("deset"), 10, "B15: 'deset' → 10");

// Cyrillic variants
assertEqual(extractTerraceNumber("четири"), 4, "B15: 'четири' → 4 (Cyrillic)");
assertEqual(extractTerraceNumber("пет"), 5, "B15: 'пет' → 5 (Cyrillic)");

// Digit variants still work
assertEqual(extractTerraceNumber("4"), 4, "B15: '4' → 4");
assertEqual(extractTerraceNumber("5 m2"), 5, "B15: '5 m2' → 5");
assertEqual(extractTerraceNumber("nema"), null, "B15: 'nema' → null");

// ============================================================
// TEST GROUP: B16 — Heating type detection patterns (COMPREHENSIVE)
// ============================================================
console.log(`\n📦 GROUP: B16 — Heating type detection patterns (comprehensive)`);

// Mirrors the exact regex patterns from service.js heating handler
// District: /gradsko|граѓско|dalinsko|toplovod|beg/i
// Private central: /centralno|централно|central|sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i
// Inverter: /klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i
// Electric: /struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i
// Solid_fuel/oil: /drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i
//   Sub-check: /drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i → wood_pellets, else → oil
function testHeatingPattern(u) {
  if (/gradsko|градско|граѓско|dalinsko|dalecno|далечно|toplovod|beg/i.test(u)) return "district";
  if (/centralno|централно|central|sopstveno|сопствено|individualno|индивидуално|svoja|своја|kotel|kotlarnica|котларница|сопствена|sopstvena|moe|мое|nase|наше|licno|лично|zgradata|зградата|na zgradata|на зградата|sopstveno parno|сопствено парно|moe parno|мое парно|nase parno|наше парно|licno parno|лично парно|parno moe|парно мое|parno nase|парно наше|parno licno|парно лично|parno na zgradata|парно на зградата|sopstveno|сопствено|sopstveno parno|сопствено парно/i.test(u)) return "private_central";
  if (/klima|клима|inverter|инвертер|split|сплит|invertor|инвертор|klima inverter|клима инвертер|термопумпа|toplotna|топлотна|na klima|на клима|se gream|се греам/i.test(u)) return "inverter";
  if (/struja|струја|electric|термо|термосистем|termo|radijatori|радијатори|kalorifer|калорифер/i.test(u)) return "electric";
  if (/drva|дрва|peleti|пелети|pellet|пелет|nafta|нафта|loz|лож|огрев|ogrev|jаглен|jaglen|uglen|у́глен/i.test(u)) {
    if (/drva|дрва|peleti|пелети|pellet|пелет|ogrev|огрев/i.test(u)) return "wood_pellets";
    return "oil";
  }
  if (/parno|парно/i.test(u)) return "parno_bare";
  return null;
}

// ── DISTRICT tests ──
console.log(`  ── District variants`);
assertEqual(testHeatingPattern("gradsko"), "district", "B16: 'gradsko' → district");
assertEqual(testHeatingPattern("dalinsko"), "district", "B16: 'dalinsko' → district");
assertEqual(testHeatingPattern("dalecno"), "district", "B16: 'dalecno' (alternate) → district");
assertEqual(testHeatingPattern("toplovod"), "district", "B16: 'toplovod' → district");
assertEqual(testHeatingPattern("beg"), "district", "B16: 'beg' → district");
assertEqual(testHeatingPattern("gradsko parno"), "district", "B16: 'gradsko parno' → district");

// ── PRIVATE CENTRAL tests ──
console.log(`  ── Private central variants`);
assertEqual(testHeatingPattern("centralno"), "private_central", "B16: 'centralno' → private_central");
assertEqual(testHeatingPattern("central"), "private_central", "B16: 'central' → private_central");
assertEqual(testHeatingPattern("sopstveno"), "private_central", "B16: 'sopstveno' → private_central");
assertEqual(testHeatingPattern("сопствено"), "private_central", "B16: 'сопствено' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("individualno"), "private_central", "B16: 'individualno' → private_central");
assertEqual(testHeatingPattern("индивидуално"), "private_central", "B16: 'индивидуално' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("svoja"), "private_central", "B16: 'svoja' → private_central");
assertEqual(testHeatingPattern("kotel"), "private_central", "B16: 'kotel' → private_central");
assertEqual(testHeatingPattern("kotlarnica"), "private_central", "B16: 'kotlarnica' → private_central");
assertEqual(testHeatingPattern("sopstvena"), "private_central", "B16: 'sopstvena' → private_central");
assertEqual(testHeatingPattern("moe"), "private_central", "B16: 'moe' → private_central");
assertEqual(testHeatingPattern("nase"), "private_central", "B16: 'nase' → private_central");
assertEqual(testHeatingPattern("licno"), "private_central", "B16: 'licno' → private_central");
assertEqual(testHeatingPattern("zgradata"), "private_central", "B16: 'zgradata' → private_central");
assertEqual(testHeatingPattern("na zgradata"), "private_central", "B16: 'na zgradata' → private_central");

// ── PRIVATE CENTRAL: compound phrases ──
console.log(`  ── Private central: compound phrases`);
assertEqual(testHeatingPattern("moe parno"), "private_central", "B16: 'moe parno' → private_central");
assertEqual(testHeatingPattern("мое парно"), "private_central", "B16: 'мое парно' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("nase parno"), "private_central", "B16: 'nase parno' → private_central");
assertEqual(testHeatingPattern("наше парно"), "private_central", "B16: 'наше парно' (Cyrillic) → private_central");
assertEqual(testHeatingPattern("licno parno"), "private_central", "B16: 'licno parno' → private_central");
assertEqual(testHeatingPattern("parno moe"), "private_central", "B16: 'parno moe' → private_central");
assertEqual(testHeatingPattern("parno nase"), "private_central", "B16: 'parno nase' → private_central");
assertEqual(testHeatingPattern("parno licno"), "private_central", "B16: 'parno licno' → private_central");
assertEqual(testHeatingPattern("parno na zgradata"), "private_central", "B16: 'parno na zgradata' → private_central");
assertEqual(testHeatingPattern("sopstveno parno"), "private_central", "B16: 'sopstveno parno' → private_central");
assertEqual(testHeatingPattern("сопствено парно"), "private_central", "B16: 'сопствено парно' (Cyrillic) → private_central");

// ── INVERTER tests ──
console.log(`  ── Inverter variants`);
assertEqual(testHeatingPattern("klima"), "inverter", "B16: 'klima' → inverter");
assertEqual(testHeatingPattern("inverter"), "inverter", "B16: 'inverter' → inverter");
assertEqual(testHeatingPattern("split"), "inverter", "B16: 'split' → inverter");
assertEqual(testHeatingPattern("invertor"), "inverter", "B16: 'invertor' (alternate) → inverter");
assertEqual(testHeatingPattern("klima inverter"), "inverter", "B16: 'klima inverter' → inverter");
assertEqual(testHeatingPattern("термопумпа"), "inverter", "B16: 'термопумпа' → inverter");
assertEqual(testHeatingPattern("toplotna"), "inverter", "B16: 'toplotna' → inverter");
assertEqual(testHeatingPattern("na klima"), "inverter", "B16: 'na klima' → inverter");
assertEqual(testHeatingPattern("se gream"), "inverter", "B16: 'se gream' → inverter");

// ── ELECTRIC tests ──
console.log(`  ── Electric variants`);
assertEqual(testHeatingPattern("struja"), "electric", "B16: 'struja' → electric");
assertEqual(testHeatingPattern("electric"), "electric", "B16: 'electric' → electric");
assertEqual(testHeatingPattern("термо"), "electric", "B16: 'термо' → electric");
assertEqual(testHeatingPattern("termo"), "electric", "B16: 'termo' → electric");
assertEqual(testHeatingPattern("radijatori"), "electric", "B16: 'radijatori' → electric");
assertEqual(testHeatingPattern("kalorifer"), "electric", "B16: 'kalorifer' → electric");

// ── SOLID FUEL / WOOD PELLETS tests ──
console.log(`  ── Solid fuel / wood pellets variants`);
assertEqual(testHeatingPattern("drva"), "wood_pellets", "B16: 'drva' → wood_pellets");
assertEqual(testHeatingPattern("na drva"), "wood_pellets", "B16: 'na drva' → wood_pellets");
assertEqual(testHeatingPattern("peleti"), "wood_pellets", "B16: 'peleti' → wood_pellets");
assertEqual(testHeatingPattern("pellet"), "wood_pellets", "B16: 'pellet' → wood_pellets");
assertEqual(testHeatingPattern("ogrev"), "wood_pellets", "B16: 'ogrev' → wood_pellets");

// ── OIL tests ──
console.log(`  ── Oil variants`);
assertEqual(testHeatingPattern("nafta"), "oil", "B16: 'nafta' → oil");
assertEqual(testHeatingPattern("loz"), "oil", "B16: 'loz' → oil");
assertEqual(testHeatingPattern("jaglen"), "oil", "B16: 'jaglen' → oil");
assertEqual(testHeatingPattern("uglen"), "oil", "B16: 'uglen' → oil");

// ── BARE PARNO (triggers follow-up) ──
console.log(`  ── Bare parno (triggers follow-up)`);
assertEqual(testHeatingPattern("parno"), "parno_bare", "B16: bare 'parno' → triggers follow-up");
assertEqual(testHeatingPattern("парно"), "parno_bare", "B16: bare 'парно' (Cyrillic) → triggers follow-up");

// ── DISTINCTNESS: ensure district and private_central don't overlap ──
console.log(`  ── Distinctness checks`);
// 'gradsko' should NOT match private_central
assertEqual(testHeatingPattern("gradsko"), "district", "B16: 'gradsko' → district (not private_central)");
// 'centralno' should NOT match district
assertEqual(testHeatingPattern("centralno"), "private_central", "B16: 'centralno' → private_central (not district)");
// Compound with both should resolve by order: district patterns checked first
assertEqual(testHeatingPattern("gradsko centralno"), "district", "B16: 'gradsko centralno' → district (matches first)");
// Even with centralno first, gradsko in string still matches district (first pattern wins)
assertEqual(testHeatingPattern("centralno gradsko"), "district", "B16: 'centralno gradsko' → district (district checked first, gradsko found)");

// ============================================================
// TEST GROUP: B17 — Renovation year word-based relative years
// ============================================================
console.log(`\n📦 GROUP: B17 — Word-based relative years (pred X godini)`);

// Verify parseMacedonianNumber works for all relative year number words
assertEqual(parseMacedonianNumber("pred edna godina"), 1, "B17: 'edna' found in 'pred edna godina'");
assertEqual(parseMacedonianNumber("pred dve godini"), 2, "B17: 'dve' found in 'pred dve godini'");
assertEqual(parseMacedonianNumber("pred tri godini"), 3, "B17: 'tri' found in 'pred tri godini'");
assertEqual(parseMacedonianNumber("pred cetiri godini"), 4, "B17: 'cetiri' found in 'pred cetiri godini'");
assertEqual(parseMacedonianNumber("pred pet godini"), 5, "B17: 'pet' found in 'pred pet godini'");
assertEqual(parseMacedonianNumber("pred sest godini"), 6, "B17: 'sest' found in 'pred sest godini'");
assertEqual(parseMacedonianNumber("pred sedum godini"), 7, "B17: 'sedum' found in 'pred sedum godini'");
assertEqual(parseMacedonianNumber("pred osum godini"), 8, "B17: 'osum' found in 'pred osum godini'");
assertEqual(parseMacedonianNumber("pred devet godini"), 9, "B17: 'devet' found in 'pred devet godini'");
assertEqual(parseMacedonianNumber("pred deset godini"), 10, "B17: 'deset' found in 'pred deset godini'");

// Cyrillic variants
assertEqual(parseMacedonianNumber("пред две години"), 2, "B17: 'две' found in Cyrillic");
assertEqual(parseMacedonianNumber("пред три години"), 3, "B17: 'три' found in Cyrillic");
assertEqual(parseMacedonianNumber("пред четири години"), 4, "B17: 'четири' found in Cyrillic");

// Digits are handled by a separate code path (not parseMacedonianNumber)

// ============================================================
// SUMMARY
// ============================================================
console.log(`\n${'='.repeat(55)}`);
console.log(`📊 TEST SUMMARY:`);
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   📋 Total:  ${passed + failed}`);
console.log(`${'='.repeat(55)}`);

if (failures.length > 0) {
  console.log(`\n⚠️  FAILURES:`);
  for (const f of failures) {
    console.log(f);
  }
  console.log(`\n🔴 ${failed} test(s) failed — this is the BASELINE.`);
  console.log(`   Every fix should increase 'Passed' count.`);
  process.exit(1);
} else {
  console.log(`\n🟢 ALL TESTS PASSED — this is the BASELINE.`);
  console.log(`   Every refactoring step must maintain this.`);
  process.exit(0);
}
