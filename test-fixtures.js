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
    'sesti': 6, 'sedmi': 7, 'osmi': 8, 'devetti': 9
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

  // =============================================
  // COMPOUND NUMBERS — "petstodvaeset" (520)
  // Must check BEFORE hundreds so "petsto" doesn't greedily match first
  // =============================================
  const rootMap = { 'eden': 1, 'edna': 1, 'edno': 1, 'dva': 2, 'dve': 2, 'tri': 3, 'cetiri': 4, 'pet': 5, 'sest': 6, 'sedum': 7, 'osum': 8, 'devet': 9 };
  const rootGroup = '(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)';
  const compoundMatch = u.match(new RegExp(
    rootGroup + '\\s*(sto|сто)?\\s*' + rootGroup + '\\s*(eset|есет|ajset|ајсет)', 'i'
  ));
  if (compoundMatch) {
    const hundreds = rootMap[compoundMatch[1].toLowerCase()] || 0;
    const tens = rootMap[compoundMatch[3].toLowerCase()] || 0;
    return (hundreds * 100) + (tens * 10);
  }

  // =============================================
  // HUNDREDS
  // =============================================
  const hundredPatterns = [
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(sto|сто)/i,
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)sto/i,
    /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)сто/i,
  ];

  for (const pattern of hundredPatterns) {
    const match = u.match(pattern);
    if (match) {
      return rootMap[match[1].toLowerCase()] * 100;
    }
  }

  // =============================================
  // TENS
  // =============================================

  // Irregular tens forms with consonant mutation:
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
      return rootMap[match[1].toLowerCase()] * 10;
    }
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

  // 2. Handle word-based THOUSANDS only
  const thousandWordMatch = u.match(/([a-zа-я]+)\s*(iljadi|илјади)/i);
  if (thousandWordMatch) {
    const parsed = parseNumberWords(thousandWordMatch[1]);
    if (parsed !== null && parsed > 0) return parsed * 1000;
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
// FIXTURE: extractTerraceNumber
// ============================================================
function extractTerraceNumber(text) {
  const sqmMatch = text.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв)/i);
  if (sqmMatch) return parseInt(sqmMatch[1]);

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

// B3: "seeset" not in map
assertEqual(parseMacedonianNumber("seeset"), null, "B3: 'seeset' → null (не препознава — needs fix!)");

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
const parsed125 = parseNumberWords("stodvaesetipet");
assert(parsed125 === null, "B1: 'stodvaesetipet' → null (parseNumberWords не парсира 'i pet' суфикс)", null, parsed125);

// "seeset" = 60 variant — NOW FIXED
assertEqual(parseNumberWords("seeset"), 60, "B2/B3: 'seeset' → 60 (fixed!)");

// B2: "seesetipet" should be 65 — still needs 'i pet' suffix parsing
const parsed65 = parseNumberWords("seesetipet");
assert(parsed65 === 60, "B2: 'seesetipet' → 60 (seeset parsed, 'i pet' suffix still pending)", 60, parsed65);

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
assertEqual(parseYearBuilt("2000ta"), 2000, "'2000ta' → 2000");

// B11: Word-based years not supported
assertNull(parseYearBuilt("dveiljadiidvanaesta"), "B11: 'dveiljadiidvanaesta' → null (⚠ needs word-to-year parser)");
assertNull(parseYearBuilt("dveidvanaesta mislam"), "B11: 'dveidvanaesta mislam' → null (⚠ needs word-to-year parser)");

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
