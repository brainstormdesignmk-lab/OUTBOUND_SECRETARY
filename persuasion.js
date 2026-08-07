// ========================================
// PERSUASION PHASE — Prompt builder & response post-processor
// ========================================
// Extracted from service.js to reduce its size.
// Contains:
//   1. buildPersuasionContext() — classification-driven context string
//   2. buildPersuasionPrompt() — full LLM prompt template
//   3. postProcessPersuasionResponse() — clean, dedup, closing question, hard filters
// ========================================
import { cleanResponse, hasMixedScript, fixMixedScript, hasDanglingConjunction, stripDanglingConjunction } from './guardrails.js';

// ========================================
// BUILD PERSUASION CONTEXT
// ========================================
export function buildPersuasionContext(classification) {
  if (!classification) return '';

  const { intent, confidence } = classification;

  if (intent === 'INTERESTED' && confidence > 0.5) {
    return 'Сопственикот покажува интерес, но има сомнежи. Одговори на неговите резерви и охрабри го да проба. Користи природен македонски јазик.';
  }

  if (intent === 'INTERESTED' && confidence <= 0.5) {
    return 'Сопственикот е несигурен. Бидете пријателски и охрабрувачки, но не и наметливи. Користи природен македонски јазик.';
  }

  if (intent === 'REJECTED' && confidence < 0.8) {
    return 'Сопственикот е скептичен. Објасни ги придобивките без притисок. Користи природен македонски јазик.';
  }

  return '';
}

// ========================================
// BUILD PERSUASION PROMPT
// ========================================
export function buildPersuasionPrompt(conv, userInput, persuasionContext, isRent) {
  // Commission/obligations backstop instructions — transaction-aware.
  // Sale: the owner owes nothing (we earn from the difference). Rent: the
  // owner DOES pay the standard 50%/100% commission on signing day — never
  // tell a rent owner they have no obligations.
  const obligationsRule = isRent
    ? 'Ако сопственикот праша за обврски, кажи дека за издавање неговата обврска е само стандардната провизија (50% од една месечна кирија, 100% ако е над 1000 евра), платена на денот на потпишување на договорот.'
    : 'Ако сопственикот праша за обврски, кажи кратко: "Да, немате никакви обврски кон нас."';
  const mustPayRule = isRent
    ? 'Ако сопственикот праша дали тој треба да ви плати нешто ("ke vi platam nesto?", "ke vi dolzam nesto?", "дали ќе ви платам нешто?"), кажи дека за издавање се плаќа стандардната провизија (50% од една месечна кирија, 100% ако е над 1000 евра) на денот на потпишување на договорот.'
    : 'Ако сопственикот праша дали тој треба да ви плати нешто ("ke vi platam nesto?", "ke vi dolzam nesto?", "дали ќе ви платам нешто?"), кажи дека нема никакви обврски кон вас — ја добива својата цена, а разликата е ваша провизија.';
  const freeWorkRule = isRent
    ? 'Ако сопственикот праша дали работите бесплатно/за џабе ("rabotite besplatno", "rabotite za dzabe", "дали работите бесплатно", "работите ли за џабе"), кажи дека за издавање се наплаќа стандардната провизија (50% од една месечна кирија, 100% ако е над 1000 евра) на денот на потпишување — НЕ кажувај само "имаме голем број клиенти".'
    : 'Ако сопственикот праша дали работите бесплатно/за џабе ("rabotite besplatno", "rabotite za dzabe", "дали работите бесплатно", "работите ли за џабе"), објасни дека заработувачката е разликата меѓу неговата чиста цена и постигнатата купопродажна цена — НЕ кажувај само "имаме голем број клиенти".';
  // Client-question backstop: the owner asks whether the AGENCY has someone
  // interested ("imate nekoj zainteresiran?", "dali imate zainteresirani?",
  // "imate li kupci?"). The hardcoded early-response gate catches the known
  // phrasings; if a novel variant slips through to the LLM, this rule forces
  // the standard confident answer instead of the generic "имаме голем број
  // клиенти" pitch. Same wording for rent and sale (clients are clients).
  const clientQuestionRule = 'Ако сопственикот праша дали имате заинтересиран клиент/купувач/закупец ("imate nekoj zainteresiran", "imate zainteresirani", "dali imate kupci", "имате некој заинтересиран"), одговори: "Постојано имаме заинтересирани клиенти за тој реон." — НЕ кажувај само "имаме голем број клиенти".';
  // No-verbatim-repeat rule: if the owner presses on the same objection and
  // Ana already answered it, the LLM must REPHRASE — the reported production
  // bug had Ana sending the identical sentence twice in a row ("Ве разбирам
  // дека имате сомнежи, но нашата заработувачка е разликата..." twice),
  // which reads as a bot. Same information, different words, different
  // closing question.
  const noRepeatRule = 'АКО ВО ПРЕТХОДНИОТ ОДГОВОР СИ ЈА КАЖАЛА ИСТАТА РЕЧЕНИЦА, НЕ ЈА ПОВТОРУВАЈ БУКВАЛНО — кажи ги истите информации со поинакви зборови и со поинакво затворачко прашање.';

  return `
Ти си Ана, професионална македонска агенка за недвижности.

ЛИНГВИСТИЧКИ ПРАВИЛА (МОРА ДА СЛЕДИШ):

КРИТИЧНИ ЛИНГВИСТИЧКИ ПРАВИЛА:
1. НИКОГАШ не кажувај "Ви разбирам". Секогаш кажувај "Ве разбирам".
2. НИКОГАШ не кажувај "имување", "имотно огласување", "промоција на имотот" како што се користи во превод од англиски.
3. Користи природни македонски фрази:
   - Наместо "бесплатна промоција на вашето имотно огласување" → "имаме голем број клиенти заинтересирани"
   - Наместо "работиме над вашата цена" → "вие ја задржувате вашата цена"
   - Наместо "вие сте заинтересирани" → "вие сте расположени"
4. Користи "Ве" кога се однесува на вас (директен објект). Користи "Ви" кога е индиректен објект.
5. Ако не си сигурна дали е "Ви" или "Ве", користи "Вас" (Вас ве разбирам).
6. НИКОГАШ не пишувај "как" (разговорна скратена форма). Секогаш пишувај "како": "како ќе го промовираме имотот", НИКОГАШ "как ќе го промовираме имотот".

ПРИМЕРИ ЗА ТОЧНА УПОТРЕБА:
❌ "Ви разбирам" → ✅ "Ве разбирам"
❌ "Ви благодарам за довербата" → ✅ "Ви благодарам" (тука "Ви" е точно, бидејќи е индиректен објект)
❌ "Вие сте заинтересирани" → ✅ "Дали сте расположени"
❌ "как ќе го промовираме имотот" → ✅ "како ќе го промовираме имотот"

ПРАВИЛА:
- Одговарај КРАТКО. Максимум 1-2 реченици.
- НЕ додавај "Ви благодарам за довербата" освен ако не е неопходно.
- НЕ објаснувај повеќе од потребното.
- Одговори директно на прашањето.
- ${obligationsRule}
- ${freeWorkRule}
- ${mustPayRule}
- ${clientQuestionRule}
- ${noRepeatRule}
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

ПРОИЗВОДСТВЕНО ПРАВИЛО (МОРА ДА СЛЕДИШ):
НИКОГАШ не измислувај вредности за квадратура, кат, спрат, цена или други
карактеристики на имотот. Користи САМО информации кои сопственикот експлицитно ги кажал.
Ако сопственикот не дал некој податок, не претпоставувај — само продолжи со разговорот.

НЕ измислувај работен процес: НИКОГАШ не спомнувај документи, договори, средби,
термини, посети или чекори кои сопственикот не ги спомнал. Ако сопственикот е
подготвен да почне („да почнеме“, „кажи ми што ти треба“), едноставно потврди дека
ќе му поставиш неколку прашања за имотот — НЕ опишувај процедури, документација или
термини. Само прашај за соработка или за првиот податок.

${persuasionContext ? `\nКОНТЕКСТ:\n${persuasionContext}\n` : ''}
РАЗГОВОР:
${conv}

СОПСТВЕНИК: ${userInput}

СЕГА ОДГОВОРИ КРАТКО:
`;
}

// ========================================
// POST-PROCESS PERSUASION RESPONSE
// ========================================
export function postProcessPersuasionResponse(response, isRent) {
  if (!response || !response.trim()) {
    return 'Дали сте расположени да соработуваме?';
  }

  // Clean via guardrails and remove "Ана:" prefix
  let cleaned = cleanResponse(response, '').replace(/^Ана:?\s*/i, '').trim();

  // SCRIPT-CONSISTENCY GUARDS: repair mixed Latin/Cyrillic words ("потencijални")
  // and dangling duplicated conjunctions ("клиенти и потенцијални и.").
  // These are LLM output artifacts, not owner messages — repair before sending.
  if (hasMixedScript(cleaned)) {
    cleaned = fixMixedScript(cleaned);
  }
  if (hasDanglingConjunction(cleaned)) {
    cleaned = stripDanglingConjunction(cleaned);
  }

  // MACEDONIAN STYLE GUARD: the LLM sometimes writes the truncated colloquial
  // "как" ("сакате да знаете как ќе го промовираме имотот") instead of the
  // standard "како". Letter-boundary matching (not \b — doesn't work with
  // Cyrillic) keeps real words intact: "каква", "какви", "каков", "како",
  // "секако", "така" never match because "как" is followed by a letter.
  // Boundaries exclude BOTH cases of both scripts ([a-zA-Zа-яА-Я]) so
  // all-caps Cyrillic words (КАКВА, СЕКАКО, КАКОВ) stay intact without
  // relying on the engine's case-folding of character classes.
  // Script is preserved (как→како, kak→kako) and so is case
  // (как/Как/КАК → како/Како/КАКО, kak/Kak/KAK → kako/Kako/KAKO).
  cleaned = cleaned.replace(/(^|[^a-zA-Zа-яА-Я])(как|kak)($|[^a-zA-Zа-яА-Я])/gi, (m, pre, word, post) => {
    const allCaps = word === word.toUpperCase() && /[A-ZА-Я]/.test(word);
    const titleCase = !allCaps && word[0] === word[0].toUpperCase();
    const isLatin = /^[a-z]+$/i.test(word);
    const base = isLatin ? 'kako' : 'како';
    const replacement = allCaps ? base.toUpperCase() : titleCase ? (isLatin ? 'Kako' : 'Како') : base;
    return pre + replacement + post;
  });

  // Remove duplicate phrases (fix for stutter)
  cleaned = cleaned.replace(/(Дали сте расположени)\s+\1/gi, '$1');
  cleaned = cleaned.replace(/(\.)\s*\1/g, '.');

  // Ensure there's a closing question
  const closingQuestions = [
    'Дали сте расположени да соработуваме?',
    'Дали да почнеме со соработка?',
    'Што велите, да пробаме?',
    'Како ви звучи ова?',
    'Дали да продолжиме?',
    'Што мислите?'
  ];

  if (!/да ли|дали|\?/.test(cleaned)) {
    const closing = closingQuestions[Math.floor(Math.random() * closingQuestions.length)];
    cleaned += ' ' + closing;
  } else {
    // Occasionally replace the closing question with a different one for variety
    for (const q of closingQuestions) {
      if (cleaned.includes(q)) {
        const newClosing = closingQuestions[Math.floor(Math.random() * closingQuestions.length)];
        cleaned = cleaned.replace(q, newClosing);
        break;
      }
    }
  }

  // HARD FILTER: NEVER mention buyer (sale) or tenant (rent) — let LLM be generic
  cleaned = cleaned.replace(/купувач|купувачот|купувачи|kupuvac|kupuvacot/gi, '');

  if (isRent) {
    cleaned = cleaned.replace(/продажб|продаде|продава|prodazb|prodade|prodava/gi, 'издавањ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}
