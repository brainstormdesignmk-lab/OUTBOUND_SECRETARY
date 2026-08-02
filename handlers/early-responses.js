// ========================================
// handlers/early-responses.js — Hardcoded early-return handlers
// ========================================
// Extracted from service.js (verbatim, zero behavior change).
// These run BEFORE phase detection — each checks a well-known question
// pattern and returns an immediate hardcoded answer (no LLM call).
// The orchestrator calls runEarlyResponses() first; if it returns a
// response, that's the answer; if null, the flow continues.
// ========================================
import {
  matchObjection,
  isAskingAboutRentRules,
  isAskingAboutRentCommission,
  isAskingAboutCommission,
  isAskingForExplanation,
  isAskingAboutPhone,
  isAskingHowItWorks,
  isAskingAboutAgentVisit,
  getRandomAgentVisitResponse,
  isAskingAboutAge,
  getRandomAgeDeflectionResponse,
  isAskingHowCommissionWorks,
  getRandomCommissionNoProvisionResponse,
  getRandomAgencyWorkflowResponse,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts,
  isAskingAboutAgency
} from '../objections.js';

/**
 * Run all hardcoded early-return handlers in the exact order they
 * appear in the original generateResponse.
 *
 * @param {Object} ctx
 * @param {string} ctx.u — lowercased trimmed user input
 * @param {boolean} ctx.isRent — rent vs sale transaction
 * @param {Object} ctx.session — LeadSession (mutated for side effects)
 * @returns {Object|null} — { text, type } response, or null to continue
 */
export function runEarlyResponses({ u, isRent, session }) {
  // ========================================
  // COOPERATION ROLLBACK CHECK (MUST run FIRST)
  // If already in DATA_COLLECTION but the owner challenges the
  // cooperation with a statement like "не ти реков дека сакам соработка"
  // (I didn't say I want cooperation), rollback cooperationAccepted=false
  // and return to PERSUASION phase.
  //
  // IMPORTANT: This must run BEFORE the objection router. isAskingAboutCommission
  // matches the literal word "sorabotka", so a challenge message like
  // "ne sum rekol deka sakam sorabotka" would otherwise be swallowed by the
  // commission handler and the rollback would never fire.
  // ========================================
  if (session.collectedData.cooperationAccepted === true &&
      (/ne ti rekov|не ти реков|ne sum rekol|не сум рекол|ne rekov|не реков|ne sum kazal|не сум кажал|ne kazav|не кажав|jas ne sakam sorabotka|јас не сакам соработка|ne sakam sorabotka|не сакам соработка|ne sum siguren deka sakam|не сум сигурен дека сакам|ne znam dali sakam|не знам дали сакам|ne sum zela odluka|не сум зела одлука|ne sum zeol odluka|не сум зел одлука|razmisluvam za sorabotka|размислувам за соработка|ne sakam da sorabotuvame|не сакам да соработуваме|pogreshno me razbravte|погрешно ме разбравте|ne me sfatete|не ме сфатете|ne me razbravte|не ме разбравте|ne e tocno|не е точно|gresno razbiranje|грешно разбирање/i.test(u))) {
    session.collectedData.cooperationAccepted = false;
    // Reset rejection count so persuasion re-starts fresh
    session.rejectionCount = 0;
    console.log(`[COOPERATION: ROLLED BACK — user challenges cooperation]`);
    // Fall through to persuasion flow
  }

  // ========================================
  // HARDCODED: Availability confirmation (with negative lookahead to prevent false matches)
  // ========================================
  if (!session.collectedData.cooperationAccepted &&/uste go imam|уште го имам|dostapen e|достапен е|sloboden e|слободен е|seuste e dostapen|сè уште е достапен|go imam|го имам|uste e|уште е|dostapen|достапен|da imam|да имам|uste go imam da|уште го имам да|da uste go imam|да уште го имам|seuste go imam|сè уште го имам|go imam uste|го имам уште|uste e sloboden|уште е слободен|e sloboden|е слободен|dostapno e|достапно е|seuste e dostapno|сè уште е достапно|ima uste|има уште|uste ima|уште има|go ima uste|го има уште|uste go ima|уште го има|go ima|го има|uste go imam|уште го имам|go nema|го нема|nema go|нема го|ne e dostapen|не е достапен|go nema uste|го нема уште|uste go nema|уште го нема|seuste e|сè уште е|seuste go imam|сè уште го имам|dostapna e|достапна е|slobodna e|слободна е|seuste e dostapna|сè уште е достапна|uste e dostapna|уште е достапна|dostapni se|достапни се|seuste se dostapni|сè уште се достапни|uste se dostapni|уште се достапни|go imam uste|го имам уште|uste go imam|уште го имам|go imam seuste|го имам сè уште|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|seuste go imam|сè уште го имам|go imam|го имам|uste go imam|уште го имам|nema go|нема го|go nema|го нема|go nema uste|го нема уште|uste go nema|уште го нема|nema uste|нема уште|seuste e|сè уште е|dostapen|достапен|dostapna|достапна|ne sum go prodal|не сум го продал|ne sum go prodadol|не сум го продадол|uste ne sum go prodal|уште не сум го продал|uste ne sum go prodadol|уште не сум го продадол|uste se prodava|уште се продава|se prodava uste|се продава уште|ne e prodaden|не е продаден|uste ne e prodaden|уште не е продаден|ne sum go izdal|не сум го издал|ne sum go iznajmil|не сум го изнајмил|uste se izdava|уште се издава|se izdava uste|се издава уште|ne e izdaden|не е издаден|uste ne e izdaden|уште не е издаден|ne e izdadena|не е издадена|uste ne e izdadena|уште не е издадена|ne e iznajmen|не е изнајмен|uste ne e iznajmen|уште не е изнајмен|ne e iznajmena|не е изнајмена|uste ne e iznajmena|уште не е изнајмена/i.test(u) && !/ne se prodava|не се продава|ne se izdava|не се издава|terasa|тераса|klima|клима|parking|паркинг|procent|процент|obvrski|обврски|klient|клиент|broj|број|kancelari|канцелари|sorabotka|соработка|uslovi|услови|garaza|гаража|garage|гараж|lift|лифт|m2|квадрати|kvadrati|heating|греење|parno|парно/i.test(u)) {
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
  // HARDCODED: Agency Questions (HIGHEST priority — answer BEFORE anything else)
  // When the owner asks about the agency itself (name, experience, location),
  // answer immediately. Never continue data collection until the question is addressed.
  // ========================================
  if (isAskingAboutAgency(u)) {
    const agencyAnswers = [
      'Ние сме Metropolis, агенција за недвижности. Работиме повеќе од 10 години и имаме искуство со продажба и издавање на станови, куќи и деловни простори. Дали имате некое друго прашање?',
      'Јас сум Ана од Metropolis. Metropolis е агенција за недвижности со повеќегодишно искуство на македонскиот пазар. Нашата канцеларија е во Скопје. Дали сакате да дознаете нешто повеќе?',
      'Metropolis е агенција за недвижности. Работиме професионално и одговорно, и имаме голема база на клиенти. Канцеларијата ни е во Скопје. Дали сакате да продолжиме со соработката?'
    ];
    return {
      text: agencyAnswers[Math.floor(Math.random() * agencyAnswers.length)],
      type: "NORMAL"
    };
  }

  // ========================================
  // HARDCODED: Objection Router
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
  }

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

  // HARDCODED: "Kako zarabotuvate bez provizija?" / "Kako funkcionira bez provizija?"
  // The owner asks how the no-commission model works — answer with the
  // commission-difference explanation (rotating variants). MUST be checked
  // BEFORE isAskingHowItWorks, otherwise "kako funkcionira bez provizija"
  // would incorrectly get the generic workflow answer.
  if (isAskingHowCommissionWorks(u)) {
    return {
      text: getRandomCommissionNoProvisionResponse(isRent),
      type: "NORMAL"
    };
  }

  // HARDCODED: How does it work / how will Ana help sell the property?
  // The owner asks about the agency's workflow or "kako ke mi pomognete vo
  // prodazbata?" — answer with the agency-workflow explanation (rotating
  // variants, "без провизија за вас" phrasing for sale).
  if (isAskingHowItWorks(u)) {
    return {
      text: getRandomAgencyWorkflowResponse(isRent),
      type: "NORMAL"
    };
  }

  // HARDCODED: Will Ana herself come to the viewing/showing?
  // Owner asks whether ANA PERSONALLY will visit the property, bring clients,
  // show the apartment, or be present at the viewing. Answer: it is NOT her
  // personal obligation — a colleague agent will handle the case.
  if (isAskingAboutAgentVisit(u)) {
    return {
      text: getRandomAgentVisitResponse(),
      type: "NORMAL"
    };
  }

  // HARDCODED: "Kolku godini imas Ana?" (age deflection)
  // Owner asks Ana's personal age. She NEVER answers with her age — she
  // deflects professionally to her experience (the answer the user liked
  // from the production log). Variants rotate randomly. NOT a strike:
  // the age question was removed from the C1 creepy catalog so this
  // hardcoded deflection fires instead of a warning.
  if (isAskingAboutAge(u)) {
    return {
      text: getRandomAgeDeflectionResponse(isRent),
      type: "NORMAL"
    };
  }

 // HARDCODED: Client question (requires longer phrase context, not bare words)
  if (/imat klient|imate klient|имате клиент|klient spremen|клиент спремен|zainteresiran kupuvac|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент|imate kupuvac|имате купувач|kupuvac spremen|купувач спремен|najdovte klient|најдовте клиент|najdovte kupuvac|најдовте купувач|dali imate klient|дали имате клиент|dali imate kupuvac|дали имате купувач|ima li zainteresirani|има ли заинтересирани|imate gotov|имате готов|najdovte|најдовте|klient e|клиент е|kupuvac e|купувач е|koi se klientite|кои се клиентите|imate vekje klienti|имате веќе клиенти|imate vekje kupci|имате веќе купувачи|imate vekje zainteresirani|имате веќе заинтересирани|imate kupci|имате купувачи|dali imate kupci|дали имате купувачи|imame kupci|имаме купувачи|zainteresirani kupci|заинтересирани купувачи/i.test(u)) {
    const clientPropertyLabel = session.adMemory?.propertyType === 'apartment' ? 'за таков стан' :
                                session.adMemory?.propertyType === 'house' ? 'за таква куќа' :
                                session.adMemory?.propertyType === 'land' ? 'за таков плац' :
                                session.adMemory?.propertyType === 'commercial' ? 'за таков деловен простор' : 'за ваков имот';
    return {
      text: `Постојано имаме заинтересирани клиенти ${clientPropertyLabel} во тој реон. Дали да почнеме со соработка?`,
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
    }      if (!session.commissionExplained) {
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

  // Nothing matched — continue to phase detection
  return null;
}
