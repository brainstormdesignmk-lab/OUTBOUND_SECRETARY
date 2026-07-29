// ========================================
// PERSUASION PHASE — Prompt builder & response post-processor
// ========================================
// Extracted from service.js to reduce its size.
// Contains:
//   1. buildPersuasionContext() — classification-driven context string
//   2. buildPersuasionPrompt() — full LLM prompt template
//   3. postProcessPersuasionResponse() — clean, dedup, closing question, hard filters
// ========================================
import { cleanResponse } from './guardrails.js';

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
export function buildPersuasionPrompt(conv, userInput, persuasionContext) {
  return `
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
