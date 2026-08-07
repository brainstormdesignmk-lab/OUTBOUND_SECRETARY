// ========================================
// OBJECTION RESPONSES — Hardcoded library
// ========================================
const LEGAL_COST_RESPONSES_SALE = [
  'Адвокатот и Нотарот се обврска на Купувачот. Данокот исто така го плаќа Купувачот во Град Скопје. Вие ја добивате вашата чиста цена.',
  'Сите давачки за Адвокат, Нотар и Данок се на товар на Купувачот. Вашата обврска е само да го продадете имотот.',
  'Купувачот ги регулира сите трошоци за Адвокат, Нотар и Данок. Вие ја добивате договорената цена без никакви давачки.'
];

const LEGAL_COST_RESPONSES_RENT = [
  'Кај издавање, Адвокатот и Нотарот обично се делат по половина, но тоа е по договор меѓу двете страни.',
  'За Адвокат и Нотар — тоа е по договор меѓу Вас и закупецот. Најчесто секоја страна плаќа половина.',
  'Трошоците за Адвокат и Нотар кај издавање се договараат меѓу Вас и закупецот. Стандардно е секој да плати по половина.'
];

function getRandomLegalCostResponse(isRent) {
  const responses = isRent ? LEGAL_COST_RESPONSES_RENT : LEGAL_COST_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// AGENT VISIT RESPONSES — "Will Ana personally come to the viewing?"
// Owner asks whether ANA PERSONALLY will come to the property, bring
// clients, show the apartment, or be present at the viewing. Ana must
// reply that it is NOT her personal obligation — a colleague agent will
// handle the case. All 3 variants rotate randomly (same as legal costs).
// ========================================
const AGENT_VISIT_RESPONSES = [
  'Тоа не е моја обврска во Агенцијата. Некој од колегите Агенти ќе се погрижи за вашиот случај.',
  'Посетите не се моја обврска. Колега Агент ќе го организира прикажувањето на станот и ќе ве контактира.',
  'Прикажувањето на имотот го вршат моите колеги Агенти. Тие ќе ве контактираат за да закажат посета.'
];

function getRandomAgentVisitResponse() {
  return AGENT_VISIT_RESPONSES[Math.floor(Math.random() * AGENT_VISIT_RESPONSES.length)];
}

// ========================================
// AGE DEFLECTION RESPONSES — "Kolku godini imas Ana?"
// Owner asks Ana's personal age ("how old are you", "when were you born").
// Ana NEVER answers with her age — she deflects professionally to her
// experience (the exact answer the user liked from the production log).
// All variants rotate randomly (same as legal costs / agent visit).
// ========================================
const AGE_DEFLECTION_RESPONSES_SALE = [
  'Имам доволно години искуство во агенцијата за да знам како да го продадем вашиот стан брзо и ефикасно. Дали да продолжиме?',
  'Во агенцијата сум доволно долго за да знам како да го продадам вашиот стан по најдобра цена. Да се фокусираме на тоа. Дали да продолжиме?',
  'Мојата возраст не е важна — важно е искуството. Имам доволно години зад себе за да ви помогнам со продажбата. Дали да продолжиме?'
];

const AGE_DEFLECTION_RESPONSES_RENT = [
  'Имам доволно години искуство во агенцијата за да знам како да го издадем вашиот стан брзо и ефикасно. Дали да продолжиме?',
  'Во агенцијата сум доволно долго за да знам како да го издадам вашиот стан по најдобра цена. Да се фокусираме на тоа. Дали да продолжиме?',
  'Мојата возраст не е важна — важно е искуството. Имам доволно години зад себе за да ви помогнам со издавањето. Дали да продолжиме?'
];

function getRandomAgeDeflectionResponse(isRent) {
  const responses = isRent ? AGE_DEFLECTION_RESPONSES_RENT : AGE_DEFLECTION_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// COMMISSION EXPLANATION RESPONSES — "Kako zarabotuvate bez provizija?" /
// "Kako funkcionira bez provizija?" — how does the no-commission model work?
// The answer is the difference between the owner's clean price and the final
// sale price. This is the HARDCODED answer the user wants for THIS question
// (NOT the generic workflow answer). All variants rotate randomly.
// ========================================
const COMMISSION_NO_PROVISION_RESPONSES_SALE = [
  'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?',
  'Ние заработуваме од разликата меѓу вашата чиста цена и цената постигната при продажбата. Вие ја добивате вашата цена, а разликата е провизија за агенцијата. Дали ви е појасно?',
  'Нашата заработувачка е разликата меѓу вашата барана чиста цена и постигнатата продажна цена. За вас нема никакви давачки. Дали ви е јасно?'
];

const COMMISSION_NO_PROVISION_RESPONSES_RENT = [
  'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци.',
  'За издавање, вашата обврска е 50% од една месечна кирија (100% ако киријата е над 1000 евра), а закупецот плаќа уште 50%. Плаќањето се врши на ден на потпишување на договорот.',
  'Кај издавање, провизијата се дели: вие 50% од месечната кирија (100% над 1000 евра) и закупецот 50%, на ден на потпишување. Минимален период 12 месеци.'
];

function getRandomCommissionNoProvisionResponse(isRent) {
  const responses = isRent ? COMMISSION_NO_PROVISION_RESPONSES_RENT : COMMISSION_NO_PROVISION_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// AGENCY WORKFLOW RESPONSES — "Kako ke gi upravuvate mojot imot?" /
// "Kako ke mi pomognete vo prodazbata?" — how does the agency manage the
// property / how will Ana help sell it. The user-approved answer (with the
// small change: "без провизија за вас"). All variants rotate randomly.
// ========================================
const AGENCY_WORKFLOW_RESPONSES_SALE = [
  'Секоја недвижнина се внесува во системот на агенцијата со податоци за неа, се организираат посети и продажба без провизија за вас. Како ви звучи ова?',
  'Вашиот стан се внесува во системот на агенцијата, се организираат посети со заинтересирани купувачи и се води целата продажба — без провизија за вас. Како ви звучи ова?',
  'Агенцијата се грижи за целиот процес: внесување на имотот, промоција, посети и завршување на продажбата — а вие не плаќате провизија. Како ви звучи ова?'
];

const AGENCY_WORKFLOW_RESPONSES_RENT = [
  'Секоја недвижнина се внесува во системот на агенцијата со податоци за неа, се организираат посети и издавање. Како ви звучи ова?',
  'Вашиот стан се внесува во системот на агенцијата, се организираат посети со заинтересирани закупци и се води целото издавање. Како ви звучи ова?',
  'Агенцијата се грижи за целиот процес: внесување на имотот, промоција, посети и склучување на договорот за издавање. Како ви звучи ова?'
];

function getRandomAgencyWorkflowResponse(isRent) {
  const responses = isRent ? AGENCY_WORKFLOW_RESPONSES_RENT : AGENCY_WORKFLOW_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// WHO PAYS? RESPONSES — "Koj ve plakja?" / "koi vi se klientite?" — who
// pays the agency. Sale: the buyer pays the final price; the owner keeps
// their clean price; the difference is the commission. Rent: BOTH sides pay
// the standard 50%/100% rule. All variants rotate randomly (same as legal
// costs / agent visit / age) so repeated follow-ups never read as a bot.
// ========================================
const WHO_PAYS_RESPONSES_SALE = [
  'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви се разјасни принципот?',
  'Не плаќате вие — плаќа купувачот. Вие ја добивате вашата чиста цена во целост, а разликата до продажната цена е наша провизија. Дали е јасно?',
  'На вас ништо не ви се наплаќа. Купувачот ја плаќа конечната цена, а ние заработуваме од разликата меѓу вашата чиста цена и постигнатата цена. Дали ви е појасно?'
];

const WHO_PAYS_RESPONSES_RENT = [
  'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци. Дали ви е појасно?',
  'За издавање, провизијата ја плаќаат двете страни: вие 50% од една месечна кирија (100% ако е над 1000 евра) и закупецот 50%, на денот на потпишување на договорот. Дали ви е јасно?',
  'Кај издавање, закупецот плаќа прва кирија, депозит и својата провизија, а вие плаќате 50% од една месечна кирија (100% над 1000 евра) — сè на ден на потпишување. Дали ви е појасно?'
];

function getRandomWhoPaysResponse(isRent) {
  const responses = isRent ? WHO_PAYS_RESPONSES_RENT : WHO_PAYS_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// FROM WHOSE POCKET? RESPONSES — "Od kogo zemate pari?" / "od koj dzeb se
// parite?" — from whose pocket does the money come. SALE: the BUYER pays
// the final price — the owner gets their asked price in full, the difference
// is the commission, nothing comes out of the owner's pocket. RENT: the
// tenant pays rent + deposit; the owner pays only the standard 50%/100%
// commission on signing day. All variants rotate randomly so the repeated
// "od kogo" press never gets the identical sentence (reported production
// bug: Ana repeated the same persuasion line verbatim).
// ========================================
const FROM_WHOSE_POCKET_RESPONSES_SALE = [
  'Купувачот ја плаќа конечната цена. Вие ја добивате вашата барана цена, а нашата провизија е разликата над неа. Дали ви е појасно?',
  'Ние заработуваме од купувачот — тој ја плаќа конечната цена, вие ја добивате вашата барана цена целосно, а разликата над неа е наша провизија. Од вас не земаме ништо. Дали ви е појасно?',
  'Парите ги земаме од купувачот: тој плаќа повеќе од вашата барана цена, вие ја добивате вашата целосно, а разликата е нашата заработувачка. Дали ви е појасно?'
];

const FROM_WHOSE_POCKET_RESPONSES_RENT = [
  'Кај издавање, закупецот ги плаќа киријата и депозитот, а провизијата за агенцијата — 50% од една месечна кирија (100% ако е над 1000 евра) — ја плаќате вие на денот на потпишување. Дали ви е појасно?',
  'За издавање, закупецот ги плаќа киријата и депозитот, а вие плаќате само стандардната провизија — 50% од една месечна кирија (100% ако е над 1000 евра) — на денот на потпишување на договорот. Дали ви е јасно?',
  'Кај издавање парите ги земаме од закупецот (кирија и депозит), а од вас само 50% од една месечна кирија како провизија (100% ако е над 1000 евра), на денот на потпишување. Дали ви е појасно?'
];

function getRandomFromWhosePocketResponse(isRent) {
  const responses = isRent ? FROM_WHOSE_POCKET_RESPONSES_RENT : FROM_WHOSE_POCKET_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

const OBJECTION_RESPONSES = {
  'legal_costs': {
    pattern: /advokat|адвокат|notar|нотар|danok|данок/i,
    response: LEGAL_COST_RESPONSES_SALE[0] // default sale V1
  },
  'commission': {
    pattern: /како без провизија|без провизија|koi vi se uslovite|какви се условите|kako rabotite|како работите|kako funkcionira|како функционира|sto znaci bez provizija|што значи без провизија|kako bez provizija|kako toa|како тоа|kako e toa|како е тоа|sto e ova|што е ова|kakva sorabotka|каква соработка|kakva e taa sorabotka|каква е таа соработка|kako mislis bez provizija|како мислиш без провизија|kakva e taa sorabotka bez provizija|каква е таа соработка без провизија|kako toa bez provizija|како тоа без провизија|kako odi toa bez provizija|како оди тоа без провизија|kako odi toa|како оди тоа|kako funkcionira toa|како функционира тоа|sto znaci toa|што значи тоа/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви е појасно?'
  },
  'who_pays': {
    // CLITIC-TOLERANT WHO-PAYS (requested): the owner may put an object
    // clitic between the who-word and the verb — "KOJ GO PLAKJA?" (who
    // pays HIM), "KOJ JA PLAKJA?" (who pays HER — the commission),
    // "KOJ GI PLAKJA?", "KOJ NEGO PLAKJA?", "ko go plakja?", with or
    // without a tense marker ("koj ke go plakja?"). The plain "koj plakja"
    // (adjacent) below already matched, but the clitic broke adjacency, so
    // these fell through to the LLM. The who-word must be a STANDALONE
    // token ((?:^|\s) boundary) — "kako" (how) and "koga" (when) contain
    // "ko" as a substring but are NOT who-questions. NOTE: the legal-costs
    // handler in early-responses.js runs BEFORE this commission gate, so
    // "KOJ GO PLAKJA NEGO ?" with a notary in context still gets the
    // who-pays-the-notary answer; the clitic forms only reach here when
    // there is NO legal referent (i.e. they are commission questions).
    pattern: /кој ве плаќа|koj ve plakja|кој ви плаќа|кој ви дава пари|koj vi plakja|koj vi dava pari|kako vi plakjaat|како ви плаќаат|kako se naplakjate|како се наплаќате|koj ve plakja vas|кој ве плаќа вас|koj plakja|кој плаќа|(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:ke|ќе)\s+)?(?:go|го|ja|ја|gi|ги|nego|него)\s+(?:plakja|плаќа|плака|plaka)(?![,;\s]*(?:kirij|кириј|smetk|сметк|depozit|депозит|struj|струј|komunal|комунал|trosoc|трошоц|trosok|трошок|gree|грее|vod|вод|parking|паркинг))|koj vi plakja za uslugata|кој ви плаќа за услугата|koi vi plakjaat|кои ви плаќаат|koj vi dava pari|кој ви дава пари|koj vi gi dava parite|кој ви ги дава парите|koj ve plakja|кој ве плаќа|koj vi e platnikot|кој ви е платникот|koi se platnicite|кои се платниците|kako vi se naplakja|како ви се наплаќа|kako vi naplakjate|како ви наплаќате|koj vi e klientot|кој ви е клиентот|koi vi se klientite|кои ви се клиентите/i,
    response: 'Разликата меѓу вашата чиста цена и постигнатата купопродажна цена е провизија за агенцијата. Дали ви се разјасни принципот?'
  },
  'from_whose_pocket': {
    // NOTE: the "pari/пари" root (not "par/пар") covers owner typos like
    // "OD KADE SE PARIYE" (pariye/parive/parimi) while NEVER matching
    // "парцели" (plots). This objection MUST stay reachable — the
    // money-origin alternatives added to isAskingAboutCommission (the gate)
    // ensure it fires BEFORE the phone-origin handler, which would otherwise
    // swallow "od kade se parite" as a phone question ("Го добив вашиот број
    // од огласот...").
    pattern: /od koj dzeb|од кој џеб|od kade se pari|од каде се пари|od kade vi se pari|од каде ви се пари|kade se pari|каде се пари|od koj dzeb se pari|од кој џеб се пари|od koj dzeb gi vadite pari|од кој џеб ги вадите пари|koi se pari|чии се пари|cii se pari|cii pari se toa|чии пари се тоа|od kade pa tie pari|од каде па тие пари|od kade vam pari|од каде вам пари|kako vie ke naplakjate|како вие ќе наплаќате|kako vie zemate|како вие земате|koj vi dava provizija|кој ви дава провизија|koj vi gi dava parite za provizija|кој ви ги дава парите за провизија|od kade e provizijata|од каде е провизијата|koj plakja provizija|кој плаќа провизија|kako se naplakjate vie|како се наплаќате вие|od kogo zemate|од кого земате|od kogo gi zemate|од кого ги земате|od kogo zemate pari|од кого земате пари|kogo zemate|кого земате|kazi od kogo|кажи од кого|kazi mi od kogo|кажи ми од кого|pa kazi od kogo|па кажи од кого|pa od kogo|па од кого|od kogo se parite|од кого се парите|od kogo vi se parite|од кого ви се парите|od kogo\s*[?]|од кого\s*[?]/i,
    response: 'Купувачот ја плаќа конечната цена. Вие ја добивате вашата барана цена, а нашата провизија е разликата над неа. Дали ви е појасно?'
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

function matchObjection(text, isRent) {
  for (const [key, obj] of Object.entries(OBJECTION_RESPONSES)) {
    if (obj.pattern.test(text)) {
      let response = obj.response;
      // Use rent-appropriate response when isRent
      // IMPORTANT: on rent the owner DOES pay the standard commission
      // (50% of one month's rent, 100% above €1000) — every rent branch
      // must state that rule, NEVER the sale "без провизија од ваша
      // страна" / "немате никакви обврски" lines.
      if (isRent) {
        if (key === 'legal_costs') {
          response = getRandomLegalCostResponse(true);
        } else if (key === 'commission') {
          response = 'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци. Дали ви е појасно?';
        } else if (key === 'who_pays') {
          response = getRandomWhoPaysResponse(true);
        } else if (key === 'faster_sale') {
          response = 'Агенцијата има голема база на потенцијални клиенти кои се спремни да изнајмат, ако нешто им се допадне. Дали би пробале агенциски третман за вашата недвижност?';
        } else if (key === 'example') {
          response = 'На пример, за кирија од 500 евра, вие добивате 1000 евра од закупецот (прва кирија + депозит). Вие плаќате 250 евра провизија (50%), а закупецот плаќа уште 250 евра. Дали ви помогна примерот?';
        } else if (key === 'trust') {
          response = 'Разбирам. Работиме транспарентно: за издавање, провизијата е стандардна — 50% од една месечна кирија (100% ако е над 1000 евра) и се плаќа само на денот на потпишување. Вие сами одлучувате дали ќе прифатите понуда. Дали ви звучи фер?';
        } else if (key === 'how_do_i_get') {
          response = 'Вие ја добивате целата кирија од закупецот, а провизијата за издавање (50% од една месечна кирија, 100% ако е над 1000 евра) се плаќа на денот на потпишување на договорот. Дали ви е јасно?';
        } else if (key === 'from_whose_pocket') {
          // Never the sale answer ("Купувачот ја плаќа конечната цена...") —
          // on rent there is no buyer, and the owner pays the 50%/100% fee.
          // Rotates (3 variants) so repeated "od kogo" presses vary.
          response = getRandomFromWhosePocketResponse(true);
        } else if (key === 'percentage') {
          // Defensive: on rent there is NO 2%-on-top model — the standard
          // 50%/100% rent rule applies. (Typical phrasings are pre-empted by
          // the rent gate, but this guarantees correctness either way.)
          response = 'Кај издавање не додаваме процент над цената — провизијата е стандардна: 50% од една месечна кирија (100% ако е над 1000 евра), платена на денот на потпишување. Дали ви е јасно?';
        } else if (key === 'obligations') {
          response = 'Вашата обврска е само стандардната провизија за издавање (50% од една месечна кирија, 100% ако е над 1000 евра), платена на денот на потпишување на договорот. Немате други обврски кон нас. Дали сте расположени да соработуваме?';
        }
      } else if (key === 'legal_costs') {
        // For sale, pick a random version
        response = getRandomLegalCostResponse(false);
      } else if (key === 'who_pays') {
        response = getRandomWhoPaysResponse(false);
      } else if (key === 'from_whose_pocket') {
        response = getRandomFromWhosePocketResponse(false);
      }
      return { key, response };
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
  // CLITIC-TOLERANT WHO-PAYS (requested): "koj go/ja/gi/nego plakja" — the
  // object clitic between the who-word and the verb must open the gate so
  // the who_pays objection is reached (previously fell through to the LLM).
  // Same standalone-token boundary as the who_pays pattern — "kako" (how)
  // and "koga" (when) contain "ko" but are NOT commission questions.
  return /провизи|provizija|koj vi|кој ви|kako vi|како ви|komisija|комисија|koj plakja|кој плаќа|(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:ke|ќе)\s+)?(?:go|го|ja|ја|gi|ги|nego|него)\s+(?:plakja|плаќа|плака|plaka)(?![,;\s]*(?:kirij|кириј|smetk|сметк|depozit|депозит|struj|струј|komunal|комунал|trosoc|трошоц|trosok|трошок|gree|грее|vod|вод|parking|паркинг))|koj ve plakja|кој ве плаќа|od kade se pari|од каде се пари|od kade vi se pari|од каде ви се пари|kade se pari|каде се пари|od koj dzeb|од кој џеб|cii se pari|чии се пари|cii pari|чии пари|od kade pa tie pari|од каде па тие пари|od kade vam pari|од каде вам пари|kako vie zemate|како вие земате|kako vie ke naplakjate|како вие ќе наплаќате|kolku zimate|колку земате|sto zimate|што земате|dali vi plakjam|дали ви плаќам|uslovi|услови|condition|terms|vasi uslovi|ваши услови|kako rabotite|како работите|sorabotka|соработка|kakva vi e provizijata|каква ви е провизијата|kakvi se uslovite|какви се условите|koi vi se uslovite|кои ви се условите|kakvi se vasi|какви се ваши|nisto ne zemate|ништо не земате|ne zemate|не земате|od mojot del|од мојот дел|vie zemate|вие земате|sto zemate|што земате|dali zimate|дали земате|vie naplakjate|вие наплаќате|kako se naplakjate|како се наплаќате|kako vi e provizijata|како ви е провизијата|znaci nisto|значи ништо|znaci ne|значи не|znaci bez|значи без|kakvi drugi obvrski|какви други обврски|drugi obvrski|други обврски|obvrski kon vas|обврски кон вас|sto treba da vi platam|што треба да ви платам|kolku procenti|колку проценти|kolku %|колку %|kolku e provizijata|колку е провизијата|kolku iznesuva provizijata|колку изнесува провизијата|kolku se naplakjate|колку се наплаќате|kolku e vashata provizija|колку е вашата провизија|kolku zimate|колку земате|kolku vi e provizijata|колку ви е провизијата|kolku vi naplakjate|колку ви наплаќате|kolku procenti zimate|колку проценти земате|kolku dodavate|колку додавате|kolku e vasiot del|колку е вашиот дел|kolku nad cenata|колку над цената|koja vi e provizijata|која ви е провизијата|kolku e vashata naknada|колку е вашата надокнада|kolku procenti vi e|колку проценти ви е|kolku se naplakja|колку се наплаќа|kolku vi se|колку ви се|od kogo zemate|од кого земате|od kogo gi zemate|од кого ги земате|od kogo zemate pari|од кого земате пари|kogo zemate|кого земате|kazi od kogo|кажи од кого|kazi mi od kogo|кажи ми од кого|pa kazi od kogo|па кажи од кого|pa od kogo|па од кого|od kogo se parite|од кого се парите|od kogo vi se parite|од кого ви се парите|od kogo\s*[?]|од кого\s*[?]/i.test(text);
}

function isAskingForExplanation(text) {
  return /kako|како|objasni|објасни|primer|пример|kazi|кажи|znaci|значи|sto znac|што зна|tocno|точно|pojasni|појасни|proveri|провери|potvrdi|потврди|ne razbiram|не разбирам|ne znam|не знам/i.test(text);
}

function isAskingAboutPhone(text) {
  return /od kade|од каде|brojot|бројот|каде го добивте|od kade vi e|од каде ви е|kako go dobivte|како го добивте/i.test(text);
}

// ========================================
// HELPER: Check if asking how the process works
// (how the agency manages the property / how will Ana help sell it)
// ========================================
function isAskingHowItWorks(text) {
  return /како би одело|kako bi odelo|како функционира|kako funkcionira|како тече|kako tece|како изгледа|kako izgleda|како работи|kako raboti|како би одела|kako bi o dela|kako bi izgledalo|како би изгледало|kako se odviva|како се одвива|kako e procesot|како е процесот|kako funkcionira procesot|како функционира процесот|kako tece procesot|како тече процесот|kako raboti ova|како работи ова|kako funkcionira ova|како функционира ова|kako bi odelo ova|како би одело ова|kako bi odela sorabotkata|како би одела соработката|kako tece sorabotkata|како тече соработката|kako funkcionira sorabotkata|како функционира соработката|kako ke mi pomognete|како ќе ми помогнете|kako kje mi pomognete|како ќе ми помогнете во продажбата|kako ke mi pomognete vo prodazbata|kako ke go prodadete|како ќе го продадете|kako ke go izdadete|како ќе го издадете|kako ke mi pomognete da go prodadam|како ќе ми помогнете да го продадам|sto ke napravite za mene|што ќе направите за мене/i.test(text);
}

// ========================================
// HELPER: Check if asking about the NO-COMMISSION model — "kako zarabotuvate
// bez provizija?", "kako funkcionira bez provizija?", "od sto zarabotuvate?"
// This must be checked BEFORE isAskingHowItWorks so the owner gets the
// commission-difference explanation, NOT the generic workflow answer.
//
// ALSO catches the "rabotite besplatno?" / "dali rabotite besplatno?" family
// ("do you work for free?") — the owner is probing how the agency earns
// money, same question. Covers: "vie rabotite besplatno?", "dali rabotite
// besplatno?", "rabotite li besplatno?", "rabotite za darmo?", "rabotite
// gratis?", "дали работите бесплатно?", reversed word order
// ("besplatno rabotite?"), and the agency form
// ("dali vashata agencija raboti besplatno?"). These must get the
// commission-difference explanation, NOT the generic "imame golem broj
// klienti" persuasion pitch.
// ========================================
function isAskingHowCommissionWorks(text) {
  const u = text.toLowerCase();
  // Free-words ("for free"): besplatno/бесплатно, darmo/дармо, dzabe/џабе,
  // gratis/гратис (all common Macedonian/Latin phrasings).
  const freeWords = '(?:besplatno|бесплатно|darmo|дармо|dzabe|џабе|gratis|гратис|za\\s+darmo|за\\s+дармо|za\\s+dzabe|за\\s+џабе)';
  // "rabotite"/"работите" (you work) — both scripts.
  const youWork = '(?:rabotite|работите)';
  const workForFree =
    // "vie rabotite besplatno?" / "dali rabotite besplatno?" / "rabotite li besplatno?"
    new RegExp(`(?:^|\\s)(?:dali\\s+|дали\\s+)?(?:vie\\s+|вие\\s+)?${youWork}(?:\\s+li|\\s+ли)?\\s+${freeWords}(?:[!?.,;\\s]|$)`, 'i').test(u) ||
    // reversed order: "besplatno rabotite?" / "za dzabe rabotite?"
    new RegExp(`(?:^|\\s)${freeWords}\\s+(?:dali\\s+|дали\\s+)?(?:vie\\s+|вие\\s+)?${youWork}(?:\\s+li|\\s+ли)?(?:\\s*[!?.,;]|$)`, 'i').test(u) ||
    // agency form: "dali vashata agencija raboti besplatno?"
    /(?:agencij|агенциј|vasa|ваша).{0,20}(?:raboti|работи).{0,20}(?:besplatno|бесплатно|darmo|дармо|dzabe|џабе|gratis|гратис)/i.test(u);
  // VERB LIST: zarabotuvate/заработувате (you earn), funkcionira/функционира
  // (it works), raboti/работи + rabotite/работите (you work), odi/оди (it
  // GOES — the colloquial Viber phrasing "kako odi toa bez provizija?" =
  // "how does THAT go without commission?", seen live on the plot lead),
  // vi se naplakja/ви се наплаќа (is it charged to you).
  return /kako (?:zarabotuvate|funkcionira|raboti|rabotite|(?:ke\s+)?odi|vi se naplakja|vie zarabotuvate).{0,40}(?:provizija|провизија)|како (?:заработувате|функционира|работи|работите|(?:ќе\s+)?оди|ви се наплаќа|вие заработувате).{0,40}(?:провизија|provizija)|od sto (?:zarabotuvate|vie zarabotuvate)|од што (?:заработувате|вие заработувате)|kako se naplakjate|како се наплаќате/i.test(u) || workForFree;
}

// ========================================
// HELPER: Check if asking whether the OWNER must pay the agency anything
// — "ke vi platam li nesto?", "dali ke vi platam nesto?", "dali imam nesto
// da vi platam?" (will I pay you anything?), "ke vi dolzam nesto?",
// "dolzam li nesto?" (do I owe you anything?). The owner is asking about
// THEIR OWN payment obligation to the agency — answer with the
// no-obligations line (sale) or the rent commission rule (rent), NOT the
// generic persuasion pitch.
// NOTE: requires a payment/owe verb directed at us (vi + platam/платам/
// plakjam/плаќам/dolzam/должам) WITH a question marker (ke/dali/li/nesto),
// so "koga treba da vi platam?" (rent-timing, no ke/li/nesto) and other
// "vi platam"-containing phrases are NOT hijacked.
// ========================================
function isAskingIfOwnerMustPay(text) {
  const u = text.toLowerCase().trim();
  return (
    // "ke vi platam li nesto?" / "dali ke vi platam nesto?" / "ke vi dolzam nesto?"
    // / "kolku ke vi platam?" / "koga ke vi platam?" (ke/dali + vi + verb [+ li] [+ nesto])
    /(?:ke|dali|дали|ќе|ке|kolku|колку)\s+(?:vi|ви)\s+(?:platam|платам|plakjam|плаќам|dolzam|должам)(?:\s+(?:li|ли))?(?:\s+(?:nesto|нешто))?/.test(u) ||
    // "dali imam nesto da vi platam?" — "do I have something to pay you?"
    /(?:dali|дали)\s+(?:imam|имам)\s+(?:nesto|нешто)\s+(?:da|да)\s+(?:vi|ви)\s+(?:platam|платам|plakjam|плаќам)/.test(u) ||
    // bare owe-question: "dolzam li nesto?" / "должам ли нешто?"
    /(?:dolzam|должам)\s+(?:li|ли)\s+(?:nesto|нешто)/.test(u)
  );
}

// ========================================
// OWNER MUST PAY? RESPONSES — "ke vi platam li nesto?" (will I pay you
// anything?) / "ke vi dolzam nesto?" (do I owe you anything?)
// Sale: nothing — the owner keeps their clean price; the difference to the
// final sale price is the agency's commission. Rent: the 50%/100% rule.
// ========================================
const OWNER_PAYS_RESPONSES_SALE = [
  'Не, вие ништо не плаќате. Немате никакви обврски кон нас — вие ја добивате вашата цена, а ние заработуваме од разликата над неа. Дали сте расположени да соработуваме?',
  'Вие немате никакви обврски кон нас — ништо не плаќате. Вашата цена ја добивате во целост, а разликата до продажната цена е наша провизија. Дали ви е јасно?',
  'Не плаќате ништо. Вие ја добивате вашата чиста цена, а ние заработуваме од разликата меѓу неа и продажната цена. Дали сте расположени да соработуваме?'
];

function getRandomOwnerMustPayResponse(isRent) {
  if (isRent) return getRandomCommissionNoProvisionResponse(true);
  return OWNER_PAYS_RESPONSES_SALE[Math.floor(Math.random() * OWNER_PAYS_RESPONSES_SALE.length)];
}

// ========================================
// NO AGENCY EXPERIENCE? RESPONSES — the owner says they have never worked
// with an agency before ("ne sum sorabotuval so agencii do sega") or have no
// experience with agencies. The user-approved answers (3 rotating variants):
//   SALE: the agency takes nothing from the owner's share — it only raises
//         the chances of a faster sale of the property.
//   RENT: the agency offers a professional rental service with carefully
//         filtered clientele to the owner's taste.
// Each variant ends with a closing question (rotates with the variant).
// ========================================
const NO_AGENCY_EXPERIENCE_RESPONSES_SALE = [
  'Агенцијата не зема ништо од вашиот дел — само ги зголемува шансите за побрза продажба на вашата недвижност. Дали сте расположени да соработуваме?',
  'Од вашиот дел агенцијата не зема ништо, само ги зголемува шансите за побрза продажба на вашата недвижност. Дали да почнеме со соработка?',
  'Агенцијата не зема ништо од вашиот дел, единствено ви ги зголемува шансите за побрза продажба на недвижноста. Како ви звучи ова?'
];

const NO_AGENCY_EXPERIENCE_RESPONSES_RENT = [
  'Агенцијата ви нуди професионална услуга за издавање на вашата недвижност, со внимателно филтрирана клиентела по ваш вкус. Дали сте расположени да соработуваме?',
  'Ви нудиме професионална услуга за издавање на вашата недвижност — внимателно филтрирана клиентела, точно по ваш вкус. Дали да почнеме со соработка?',
  'За издавањето добивате професионална услуга и внимателно филтрирана клиентела по ваш вкус. Како ви звучи ова?'
];

function getRandomNoAgencyExperienceResponse(isRent) {
  const responses = isRent ? NO_AGENCY_EXPERIENCE_RESPONSES_RENT : NO_AGENCY_EXPERIENCE_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if the owner says they have NO experience working with
// agencies — "ne sum sorabotuval so agencii do sega", "ne sum rabotel so
// agencija", "nemam iskustvo so agencii", "prv pat sorabotuvam so
// agencija", "nikogas ne sum rabotel so agencija" (+ Cyrillic).
// MUST be checked BEFORE isAskingAboutAgency — a message like "ne sum
// sorabotuval so agencija" contains "agencija" and would otherwise be
// swallowed by the generic agency pitch. NOT a trust objection ("не
// верувам на агенции" stays with the trust handler).
// ========================================
function isAskingAboutNoAgencyExperience(text) {
  const u = text.toLowerCase();
  // "(ne znam) ne sum sorabotuval/rabotel so agencii/agencija (do sega)"
  if (/(?:ne\s+sum|не\s+сум)\s+(?:sorabotuval|sorabotuvala|rabotel|rabotela|rabotal|соработувал|соработувала|работел|работела|работал)\s+(?:so|со)\s+(?:agenci|агенци)/i.test(u)) return true;
  // "nemam iskustvo so agencii" / "немам искуство со агенции"
  if (/(?:nemam|немам)\s+(?:iskustvo|искуство)\s+(?:so|со)\s+(?:agenci|агенци)/i.test(u)) return true;
  // "prv pat (sorabotuvam) so agencija" / "прв пат (соработувам) со агенција"
  if (/(?:prv\s+pat|прв\s+пат).{0,25}(?:agenci|агенци)/i.test(u)) return true;
  // "nikogas ne sum rabotel so agencija" / "никогаш не сум работел со агенција"
  if (/(?:nikogas|никогаш)\s+(?:ne\s+)?(?:sum\s+)?(?:rabotel|rabotela|sorabotuval|работел|работела|соработувал)\s+(?:so|со)\s+(?:agenci|агенци)/i.test(u)) return true;
  return false;
}

// ========================================
// HELPER: Check if asking whether ANA herself will come to the viewing/showing
// ========================================
// Owner asks whether Ana personally will come to the property, bring clients,
// show the apartment, or be present at the viewing — e.g. production messages:
//   "DALI TI KE DOAGJAS SO MUSTERII NA POSETA ?"
//   "TI KE GI NOSIS KLIENTITE KAJ MENE VO STAN ?"
// Ana must reply that it is not her personal obligation — a colleague agent
// will handle the case.
function isAskingAboutAgentVisit(text) {
  // NOTE: deliberately NO bare "dali ti ke" / "дали ти ќе" alternative — that
  // would match ANY "will you..." question (e.g. "дали ти ќе ми помогнеш?").
  // The verb must always be constrained to visit/showing verbs. The optional
  // "dali " prefix is folded into the (?:^|\s) boundary via (?:dali\s+)?. The
  // "ke ... li" interrogative forms are the most common Macedonian phrasing.
  return /(?:^|\s)(?:dali\s+)?ti\s+ke\s+(?:doagjas|dojdes|gi\s+nosis|gi\s+vodis|ja\s+pokazes|me\s+vodi|bides\s+prisutna)|(?:^|\s)(?:дали\s+)?ти\s+ќе\s+(?:доаѓаш|дојдеш|ги\s+носиш|ги\s+водиш|ја\s+покажеш|ме\s+води|бидеш\s+присутна)|ke\s+doagjas\s+(?:li\s+)?na\s+poseta|ќе\s+доаѓаш\s+(?:ли\s+)?на\s+посета|ke\s+dojdes\s+(?:li\s+)?na\s+poseta|ќе\s+дојдеш\s+(?:ли\s+)?на\s+посета|ke\s+dojdes\s+(?:li\s+)?da\s+ja\s+pokazes|ќе\s+дојдеш\s+(?:ли\s+)?да\s+ја\s+покажеш|ke\s+bides\s+li\s+prisutna|(?:ќе|ке)\s+бидеш\s+ли\s+присутна/i.test(text);
}

// ========================================
// HELPER: Check if asking about clients
// ========================================
function isAskingAboutClients(text) {
  // SINGLE SOURCE OF TRUTH for the client-question gate — handlers/early-responses.js
  // calls THIS (no inline copy), so the pattern can never drift again.
  //
  // The "imate nekoj zainteresiran" family (the user's reported miss): the old
  // pattern required klient/kupci/kupuvac words, so "imate nekoj zainteresiran"
  // / "ve prasuvam dali vie imate nekoj zainteresiran?" fell through to the LLM
  // and got a wrong generic answer. Bare "imate zainteresirani" / "dali imate
  // zainteresirani?" / "imate li zainteresirani?" (no "nekoj") are also covered
  // now, plus the rent-specific "zainteresirani zakupci" (interested tenants).
  //
  // SAFETY: "ne sum zainteresiran" (REJECTED) and "dali ste zainteresirani?"
  // (are YOU interested?) never match — the patterns require an "imate/имате
  // (nekoj/li) zainteresirani" OWNERSHIP construction, not "sum/ste" copulas.
  return /imat klient|imate klient|имате клиент|klient spremen|клиент спремен|zainteresiran kupuvac|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент|imate kupuvac|имате купувач|kupuvac spremen|купувач спремен|najdovte klient|најдовте клиент|najdovte kupuvac|најдовте купувач|imavте li klienti|имавте ли клиенти|dali imate klient|дали имате клиент|dali imate kupuvac|дали имате купувач|ima li zainteresirani|има ли заинтересирани|imaте gotov|имате готов|klient e|клиент е|kupuvac e|купувач е|koi se klientite|кои се клиентите|imate vekje klienti|имате веќе клиенти|imate vekje kupci|имате веќе купувачи|imate vekje zainteresirani|имате веќе заинтересирани|imate kupci|имате купувачи|dali imate kupci|дали имате купувачи|imame kupci|имаме купувачи|zainteresirani kupci|заинтересирани купувачи|nekoj zainteresiran|некој заинтересиран|nekoja zainteresirana|некоја заинтересирана|nekogo zainteresiran|некого заинтересиран|nekoj klient|некој клиент|nekoj kupuvac|некој купувач|nekoj e zainteresiran|некој е заинтересиран|imate zainteresirani|имате заинтересирани|imate li zainteresirani|имате ли заинтересирани|zainteresirani zakupci|заинтересирани закупци/i.test(text);
}

// ========================================
// HELPER: Check if asking where to send photos
// ========================================
function isAskingWhereToSendPhotos(text) {
  return /tuka da vi pratam|тука да ви пратам|kade da vi pratam|каде да ви пратам|pratam ovde|пратам овде|ovde da vi pratam|овде да ви пратам|kade da gi pratam|каде да ги пратам|na viber da vi pratam|на вајбер да ви пратам|preku viber|преку вајбер|na viber|на вајбер/i.test(text);
}

// ========================================
// HELPER: Check if asking about legal costs (Advokat, Notar, Danok)
// ========================================
function isAskingAboutLegalCosts(text) {
  return /advokat|адвокат|notar|нотар|danok|данок/i.test(text);
}

// ========================================
// HELPER: Who-pays-the-NOTARY follow-up — "KOJ GO PLAKJA NEGO ?" ("who
// pays HIM/it?") after the owner said "SAKAM DOGOVOR NA NOTAR" ("I want a
// notary contract"). The MASCULINE object clitic (go/nego = him) refers
// back to the notary mentioned in the PRECEDING message of the same
// quickfire batch (reported, lead 3571074: the follow-up fell through
// every hardcoded gate — the who_pays pattern needs "koj plakja"
// ADJACENT, and the clitic GO between them breaks it — so the LLM
// answered with the generic commission pitch instead of who-pays-the-
// notary).
//
// Returns true ONLY when BOTH hold:
//   1. A who-pays question shape with a masculine/plural object clitic
//      (go/nego/gi — "koj go plakja", "ko gi plakja", "koj plakja nego").
//      Deliberately EXCLUDES "ja" (feminine): "koj ja plakja kirijata?"
//      (who pays the RENT?) and "koj ja plakja provizijata?" (who pays
//      the commission?) must stay on the rent/commission path, never be
//      hijacked as legal costs.
//   2. A legal-costs keyword (notar/advokat/danok) in the message itself
//      OR the recent conversation context (covers same-batch pronouns AND
//      follow-ups after Ana already answered a notary question).
// NEGATIVE GUARD: if the message names a rent/utility object (depozit,
// kirija, provizija, smetki, struja, voda...) it is rent economics, NOT
// the notary — never route it to legal costs even with legal context
// present ("koj go plakja depozitot?" = who pays the deposit).
// ========================================
function isAskingWhoPaysForLegalCosts(text, contextText) {
  const t = String(text || '').toLowerCase().trim();
  if (!t) return false;
  // Who-pays shapes (both scripts). The who-word must be a STANDALONE token
  // ((?:^|\s) boundary): "kako" (how) contains "ko" as a substring but is
  // NOT a who-question — "kako ke go plakja?" (how will he pay) must never
  // match.
  // BRANCH 1 — clitic BEFORE the verb: "koj (ke/treba da) (go/nego/gi)
  // plakja" — the reported "KOJ GO PLAKJA NEGO ?". The tense markers must
  // cover BOTH scripts for the conjunction (da|да): the Latin-only "da"
  // silently missed the Cyrillic "КОЈ ТРЕБА ДА ГО ПЛАЌА?" (treba+да).
  // BRANCH 2 — object AFTER the verb: "koj (ke/treba da) plakja (za)?
  // (nego|него|notarot|advokatot|danokot)" — covers "КОЈ ПЛАЌА ЗА
  // НОТАРОТ?", "КОЈ ЌЕ ПЛАЌА ЗА НОТАРОТ?", "КОЈ ТРЕБА ДА ПЛАЌА ЗА
  // НОТАРОТ?" and the pronoun follow-up "кој плаќа за него?". The trailing
  // pronoun/noun is INSIDE the alternation ((?:nego|него|...)) — a
  // top-level "|него" would match ANY message containing "него" (e.g.
  // "Сакам него да го издадам"), which combined with a notary in context
  // would hijack unrelated messages into the legal-costs answer.
  const whoPaysClitic =
    /(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:(?:ke|ќе|treba|треба)\s+(?:da|да)\s+)|(?:ke|ќе)\s+)?(?:go|го|nego|него|gi|ги)\s*(?:plakja|плаќа|плака|plaka)/i.test(t) ||
    /(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:(?:ke|ќе|treba|треба)\s+(?:da|да)\s+)|(?:ke|ќе)\s+)?(?:plakja|плаќа|плака|plaka)\s+(?:za|за)?\s*(?:nego|него|notarot|нотарот|notar|нотар|advokatot|адвокатот|advokat|адвокат|danokot|данокот|danok|данок)/i.test(t) ||
    // BRANCH 3 — BEAR-THE-COSTS VERB FAMILY (requested): the owner may ask
    // who will BEAR the costs instead of who PAYS them — "кој ќе ги сноси
    // трошоците?" (who will bear the costs?), "кој ќе ги сноси трошоците
    // за нотарот?", "кој ги поднесува трошоците?" (who bears/undertakes
    // the costs), "кој ги носи трошоците?". The verb is sноси/nese/
    // podnesuva, NOT plakja, so branches 1-2 (which require the plakja
    // family) miss it entirely. Same standalone who-word boundary, same
    // optional tense markers, same clitic gi/go before the verb. The costs
    // object (trosoci/trosok) may be in the message or the referent comes
    // from the notary context. TROSOC ROOT: matches трошоците (the costs),
    // трошоци (costs), трошок (cost) — the [цc] alternation covers both
    // Latin "trosoc" and Cyrillic "трошоц" spellings.
    /(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:(?:ke|ќе|treba|треба)\s+(?:da|да)\s+)|(?:ke|ќе)\s+)?(?:gi|ги|go|го)?\s*(?:snosi|сноси|nese|несе|nosi|носи|podnesuva|поднесува|podnesi|поднеси|podnese|поднесе)\s+(?:trosoc|трошоц|trosok|трошок)/i.test(t) ||
    // BRANCH 3b — "кој ги сноси трошоците за нотарот?" — the costs object
    // is followed by an explicit legal referent ("трошоците за нотарот" =
    // the costs FOR THE NOTARY). The legal-noun alternation after the
    // connector za/за makes the referent explicit in-message, so no context
    // is needed.
    /(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:(?:ke|ќе|treba|треба)\s+(?:da|да)\s+)|(?:ke|ќе)\s+)?(?:gi|ги|go|го)?\s*(?:snosi|сноси|nese|несе|nosi|носи|podnesuva|поднесува|podnesi|поднеси|podnese|поднесе)\s+(?:trosoc|трошоц|trosok|трошок|trosoci|трошоци)\s+(?:za|за)\s*(?:nego|него|notarot|нотарот|notar|нотар|advokatot|адвокатот|advokat|адвокат|danokot|данокот|danok|данок)/i.test(t) ||
    // BRANCH 3c — PLATI-COSTS + EXPLICIT LEGAL REFERENT (requested): "кој
    // плаќа трошоци за нотар?" — the PAY verb (plakja family) with a costs
    // object followed by an explicit legal noun. Branch 2 only matched a
    // legal noun IMMEDIATELY after the verb ("кој плаќа нотар?"), so the
    // costs object in between ("плаќа трошоци за нотар") fell through.
    /(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:(?:ke|ќе|treba|треба)\s+(?:da|да)\s+)|(?:ke|ќе)\s+)?(?:gi|ги|go|го)?\s*(?:plakja|плаќа|плака|plaka)\s+(?:trosoc|трошоц|trosok|трошок|trosoci|трошоци)\s+(?:za|за)?\s*(?:nego|него|notarot|нотарот|notar|нотар|advokatot|адвокатот|advokat|адвокат|danokot|данокот|danok|данок)/i.test(t);
  if (!whoPaysClitic) return false;
  // RENT/UTILITY OBJECT GUARD — "who pays X" about rent economics is NOT
  // the notary, even when a notary was mentioned nearby.
  if (/kirija|кирија|depozit|депозит|provizij|провизиј|komisi|комиси|smetk|сметк|struja|струја|komunal|комунал|greenje|греење|voda|вода/i.test(t)) return false;
  // Legal-costs referent: in the message or the recent context.
  const ctx = String(contextText || '').toLowerCase();
  return /advokat|адвокат|notar|нотар|danok|данок/i.test(`${t} ${ctx}`);
}

// ========================================
// HELPER: Check if asking about ANA's personal age
// "kolku godini imas (ana)?", "kolku si stara?", "koja godina si rodena?",
// "koga si rodena?" — Ana deflects professionally instead of answering.
// NEGATIVE GUARDS: experience/tenure questions ("kolku godini imas iskustvo",
// "kolku godini imas vo agencijata") and property-age questions
// ("kolku godini e zgradata") must NOT be treated as personal-age questions.
// ========================================
function isAskingAboutAge(text) {
  return /kolku godini imas|колку години имаш|kolku godini ima ana|колку години има ана|kolku godini e ana|колку години е ана|kolku si stara|колку си стара|kolku godini si|колку години си|koja godina si rodena|која година си родена|koga si rodena|кога си родена/i.test(text)
    && !/(?:iskustvo|искуство|rabotno|работно|vo agencij|во агенци|zgradata|зградата|stanot|станот|kukjata|куќата|плацот|platot)/i.test(text);
}

// ========================================
// HELPER: Check if asking about the agency itself (name, location, experience)
// These must be answered BEFORE continuing with the sales/commission script.
// Priority: agency questions > objections > data collection.
// ========================================
function isAskingAboutAgency(text) {
  // "koja agencija ste?" (which agency are you?), "kako se vika agencijata?" (what's the name?)
  // "kolku vreme rabotite?" (how long have you been working?)
  // "kade vi e kancelarijata?" (where is your office?), "od kade rabotite?" (where from?)
  // "imate iskustvo?" (do you have experience?), "imate klienti?" (do you have clients?)
  // "koj ve vodi?" (who leads you?), "koja e vashata firma?" (what's your company?)
  // IMPORTANT: Negative lookahead for provizija/procent prevents false matches
  // from commission questions like "shto rabotite so provizijata?" which should
  // be handled by the commission/objection handler, NOT by the agency handler.
  // REFUSAL NEGATIVE GUARD (reported, lead 5502969): "NE MI TREBA AGENCIJA",
  // "SAMA KE SI GI IZDADAM", "BEZ AGENCIJA" are REFUSALS of the agency —
  // they must fall through to the phase detector (rejection escalation), NOT
  // get the generic "Ние сме Metropolis..." agency pitch. The bare
  // "agencija|агенциј" token in the positive pattern would otherwise match
  // every refusal that mentions the word "agency".
  const refusalGuard = /(?:ne\s*mi\s*(?:treba|треба)|не\s*ми\s*треба|ne\s*sakam|не\s*сакам|bez\s*agencij|без\s*агенци|sama\s*ke|сама\s*ќе|sam\s*ke|сам\s*ќе|ke\s*si\s*gi\s*izdadam|ќе\s*си\s*ги\s*издадам|ke\s*gi\s*izdadam\s*(?:sam|sama)|ќе\s*ги\s*издадам\s*(?:сам|сама)|nema\s*(?:potreba|потреба)\s*od\s*agenci|нема\s*потреба\s*од\s*агенци|ne\s*mi\s*treba\s*agencija|не\s*ми\s*треба\s*агенција)/i.test(text);
  if (refusalGuard) return false;
  return /agencija|агенциј|firma|фирм|kancelari|канцелари|biro|биро|vreme rabotite|време работите|iskustvo|искуство|godini rabotite|години работите|kako se vika|како се вика|kako se vikate|како се викате|koja ste|која сте|koj ve vodi|кој ве води|vodi agencijata|води агенцијата|kade rabotite|каде работите|od kade rabotite|од каде работите|kade vi e|каде ви е|kade se naogja|каде се наоѓа|shto rabotite(?!\s+so\s+(provizija|провизија|procent|процент))|што работите(?!\s+со\s+(провизија|provizija|процент|procent))|shto e toa metropolis|што е тоа metropolis|sto e metropolis|што е метрополис|sto e metro polis|metropolis agencija|metropolis агенција|angažirate|ангажирате|vraboteni|вработени|kolektiv|колектив|ime na agencijata|име на агенцијата/i.test(text);
}

export {
  OBJECTION_RESPONSES,
  matchObjection,
  isAskingAboutRentRules,
  isAskingAboutRentCommission,
  isAskingAboutCommission,
  isAskingForExplanation,
  isAskingAboutPhone,
  isAskingHowItWorks,
  isAskingAboutAgentVisit,
  AGENT_VISIT_RESPONSES,
  getRandomAgentVisitResponse,
  isAskingAboutAge,
  AGE_DEFLECTION_RESPONSES_SALE,
  AGE_DEFLECTION_RESPONSES_RENT,
  getRandomAgeDeflectionResponse,
  COMMISSION_NO_PROVISION_RESPONSES_SALE,
  COMMISSION_NO_PROVISION_RESPONSES_RENT,
  getRandomCommissionNoProvisionResponse,
  AGENCY_WORKFLOW_RESPONSES_SALE,
  AGENCY_WORKFLOW_RESPONSES_RENT,
  WHO_PAYS_RESPONSES_SALE,
  WHO_PAYS_RESPONSES_RENT,
  getRandomWhoPaysResponse,
  FROM_WHOSE_POCKET_RESPONSES_SALE,
  FROM_WHOSE_POCKET_RESPONSES_RENT,
  getRandomFromWhosePocketResponse,
  getRandomAgencyWorkflowResponse,
  isAskingHowCommissionWorks,
  isAskingIfOwnerMustPay,
  OWNER_PAYS_RESPONSES_SALE,
  getRandomOwnerMustPayResponse,
  isAskingAboutNoAgencyExperience,
  NO_AGENCY_EXPERIENCE_RESPONSES_SALE,
  NO_AGENCY_EXPERIENCE_RESPONSES_RENT,
  getRandomNoAgencyExperienceResponse,
  isAskingAboutClients,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts,
  isAskingWhoPaysForLegalCosts,
  isAskingAboutAgency
};
