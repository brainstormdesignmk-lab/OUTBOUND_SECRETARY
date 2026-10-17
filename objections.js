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
  // PRICE-ANSWER GUARD (reported lead 3571074): the bare "kirija|кирија"
  // stem below matches ANY message containing the word "rent" — including
  // the most natural ANSWER to the rent question ("KIRIJATA E 300 EVRA",
  // "kirijata e 300", "plakjam 300 evra kirija"). The rent-rules explanation
  // used to swallow those answers BEFORE extraction could collect the price
  // (documented as a known limitation in test-price-correction C3). A
  // message carrying a concrete price is an ANSWER, not a question about
  // rent terms — let extraction handle it. Question forms ("kako raboti
  // kirijata?", "kolku e depozitot?") carry no price and still match.
  if (/\d+\s*(?:evra|евра|eur|evro|евро|е\b|e\b)/i.test(text) && /kirij|кириј|plakj|плаќ|zema|зем/i.test(text)) return false;
  if (/\d{2,}/.test(text) && /kirij|кириј/i.test(text)) return false;
  // TERMS-ACCEPTANCE GUARD (reported): the owner CONFIRMS the terms Ana
  // just explained — "dobar e dogovorot", "dogovoreno", "dogovorot e vo
  // red", "se dogovorivme" — a positive acceptance of the cooperation
  // terms, NOT a question about rent rules. The bare "dogovor|договор|
  // potpis|потпис" tokens below used to swallow these into the rent-rules
  // re-explanation: the owner stays in PERSUASION and gets the terms AGAIN
  // while the acceptance is never registered (same disease class as the
  // standard-terms ack). A pure positive term-confirmation (term word +
  // positive evaluation, no question, no negation) must fall through to the
  // phase detector, where the hardcoded ACCEPTED gate registers the
  // cooperation and enters DATA_COLLECTION. Questions ("kakov dogovor ke
  // potpiseme?", "kolku e depozitot?") and negations ("dogovorot ne e
  // dobar") still match below.
  if (/dogovor|договор|potpis|потпис|uslov|услов|depozit|депозит/i.test(text) &&
      /(?:dobar|добар|dobra|добра|dobro|добро|vo\s+red|во\s+ред|e\s+ok|е\s+ок|e\s+okej|е\s+океј|standard|стандард|dogovoreno|договорено|dogovorivme|договоривме|sogl|соглас|prifak|прифаќ|prihvatliv|прифатлив|redno|редно|sve\s+e\s+ok|сè\s+е\s+ок)/i.test(text) &&
      !/[?؟]/.test(text) &&
      !/(?:dali|дали|kolku|колку|kakov|каков|kakva|каква|kakvi|какви|kako|како|koga|кога|sto|што|kade|каде|moze\s+li|може\s+ли|ima\s+li|има\s+ли|dali\s+ima|дали\s+има)/i.test(text) &&
      !/(?:^|\s)(?:ne|не|ama|ама|no|но|sepak|сепак|mislam|мислам|mozebi|можеби)(?:\s|$)/i.test(text)) return false;
  return /депозит|depozit|минимален период|minimalen period|минималниот период|minimalniot period|minimum stay|стандардно|standardno|uslovi za izdavanje|услови за издавање|uslovite za izdavanje|условите за издавање|kako rabotite|како работите|sorabotka za kirija|соработка за кирија|deposit|depozit|kirija|кирија|prv mesec|прв месец|dogovor|договор|potpis|потпис|kako funkcionira|како функционира|kako tece|како тече|standardno|стандардно|kako izdavate|како издавате|kako se izdava|како се издава/i.test(text);
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
  //
  // COOPERATION-REFUSAL GUARD (reported, lead 5436709): "NE SAKAM
  // SORABOTKA", "NE MI TREBA SORABOTKA", "BEZ SORABOTKA" are REFUSALS of
  // cooperation — the bare "sorabotka|соработка" token would otherwise
  // route them to the commission explanation (the production log showed
  // exactly that: a refusal got the commission-difference answer). They must
  // fall through to the phase detector (rejection escalation), mirroring
  // the refusalGuard in isAskingAboutAgency. Positive cooperation questions
  // ("shto znaci sorabotka", "kakva sorabotka e toa") pass unchanged.
  if (/(?:ne|не)[\s,]+(?:sakam|сакам|mi\s+treba|ми\s+треба)|bez\s+sorabotk|без\s+соработк|nema\s+sorabotk|нема\s+соработк/i.test(text) &&
      /sorabotk|соработк/i.test(text)) return false;
  return /провизи|provizija|koj vi|кој ви|kako vi|како ви|komisija|комисија|koj plakja|кој плаќа|(?:^|\s)(?:koj|кој|ko|ко)\s+(?:(?:ke|ќе)\s+)?(?:go|го|ja|ја|gi|ги|nego|него)\s+(?:plakja|плаќа|плака|plaka)(?![,;\s]*(?:kirij|кириј|smetk|сметк|depozit|депозит|struj|струј|komunal|комунал|trosoc|трошоц|trosok|трошок|gree|грее|vod|вод|parking|паркинг))|koj ve plakja|кој ве плаќа|od kade se pari|од каде се пари|od kade vi se pari|од каде ви се пари|kade se pari|каде се пари|od koj dzeb|од кој џеб|cii se pari|чии се пари|cii pari|чии пари|od kade pa tie pari|од каде па тие пари|od kade vam pari|од каде вам пари|kako vie zemate|како вие земате|kako vie ke naplakjate|како вие ќе наплаќате|kolku zimate|колку земате|sto zimate|што земате|dali vi plakjam|дали ви плаќам|(?:vasi uslovi|ваши услови|kakvi se uslovite|какви се условите|kakvi se uslovi(?!t|т)|какви се услови(?!т)|koi se uslovite|кои се условите|koi vi se uslovite|кои ви се условите|kakvi se vasi|какви се ваши)(?!\s+(?:vo|во|na|на)\s+(?:(?:ovoj|овој|ovaa|ovaа|оваа|ova|ова|toj|тој|taa|taа|таа|mojot|мојот|vasiot|вашиот|tvoj|твој)\s+)?(?:zgradata|зградата|zgradava|зградава|zgrada|зграда|stanot|станот|stan|стан|kukjata|куќата|kuќата|kukja|куќа|terasata|терасата|terasa|тераса|ogradata|оградата|ograda|ограда|placot|плацот|plac|плац|kvartot|квартот|kvart|кварт|naselbata|населбата|ulicata|улицата|sosedstvoto|соседството))|what are the terms|what are your terms|terms and conditions|kako rabotite|како работите|sorabotka|соработка|kakva vi e provizijata|каква ви е провизијата|nisto ne zemate|ништо не земате|ne zemate|не земате|od mojot del|од мојот дел|vie zemate|вие земате|sto zemate|што земате|dali zimate|дали земате|vie naplakjate|вие наплаќате|kako se naplakjate|како се наплаќате|kako vi e provizijata|како ви е провизијата|znaci nisto|значи ништо|znaci ne|значи не|znaci bez|значи без|kakvi drugi obvrski|какви други обврски|drugi obvrski|други обврски|obvrski kon vas|обврски кон вас|sto treba da vi platam|што треба да ви платам|kolku procenti|колку проценти|kolku %|колку %|kolku e provizijata|колку е провизијата|kolku iznesuva provizijata|колку изнесува провизијата|kolku se naplakjate|колку се наплаќате|kolku e vashata provizija|колку е вашата провизија|kolku zimate|колку земате|kolku vi e provizijata|колку ви е провизијата|kolku vi naplakjate|колку ви наплаќате|kolku procenti zimate|колку проценти земате|kolku dodavate|колку додавате|kolku e vasiot del|колку е вашиот дел|kolku nad cenata|колку над цената|koja vi e provizijata|која ви е провизијата|kolku e vashata naknada|колку е вашата надокнада|kolku procenti vi e|колку проценти ви е|kolku se naplakja|колку се наплаќа|kolku vi se|колку ви се|od kogo zemate|од кого земате|od kogo gi zemate|од кого ги земате|od kogo zemate pari|од кого земате пари|kogo zemate|кого земате|kazi od kogo|кажи од кого|kazi mi od kogo|кажи ми од кого|pa kazi od kogo|па кажи од кого|pa od kogo|па од кого|od kogo se parite|од кого се парите|od kogo vi se parite|од кого ви се парите|od kogo\s*[?]|од кого\s*[?]/i.test(text);
}

function isAskingForExplanation(text) {
  return /kako|како|objasni|објасни|primer|пример|kazi|кажи|znaci|значи|sto znac|што зна|tocno|точно|pojasni|појасни|proveri|провери|potvrdi|потврди|ne razbiram|не разбирам|ne znam|не знам/i.test(text);
}

function isAskingAboutPhone(text) {
  // The full Viber vocabulary for "where did you get my number": od kade / od
  // kaj (от каде / од кај — kaj is the common dialect form), brojot / brojov
  // (brojov is the -ov form of бројот), dobivte / najdovte (got / found).
  // Reported (lead 5531598): "OD KADE VI E BROJOV?" was stolen by the agency
  // matcher and "OD KAJ TI E BROJOV?" fell through to the LLM — both must
  // land on the direct "Го добив вашиот број од огласот..." answer.
  //
  // TIGHTENED (reported): the bare phrase triggers "od kade vi e" / "od kaj
  // ti e" / "od kade" matched ANY origin question — "OD KAJ TI E IDEJATA?"
  // (where did you get the idea), "od kaj ti e cena" (the price), "od kaj ti
  // e ova" (this) all got the from-the-ad phone answer. An origin phrase now
  // fires ONLY when it is bound to a phone reference (brojot/brojov — the
  // number) OR to the got/found/know verb family (dobivte/najdovte/znaete —
  // "kade go najdovte", "kako me najdovte", "od kade go znaete mojot broj"),
  // neither of which can occur in a non-phone question. Note: the bare origin
  // word (kade/kaj/kako) matches inside "od kade"/"од кај", so the od prefix
  // needs no separate alternative.
  return /brojot|бројот|brojov|бројов|(?:kade|каде|kaj|кај|kako|како)(?:\s+(?:go|го|me|ме))?\s+(?:dobivte|добивте|najdovte|најдовте|znaete|знаете|znajdete|знајдете)/i.test(text);
}

// ========================================
// HELPER: Check if asking how the process works
// (how the agency manages the property / how will Ana help sell it)
// ========================================
function isAskingHowItWorks(text) {
  // DEVICE/PROPERTY-OBJECT GUARDS (audit): the bare "како работи" (how
  // does it work) / "како функционира" / "како изгледа" phrases fired on
  // DATA-COLLECTION answers and property talk, which runEarlyResponses
  // intercepts BEFORE phase detection: "kako raboti na struja" (the
  // heating runs on electricity), "kako funkcionira greenjeto" (the heating
  // works), "kako izgleda stanot" (how does the apartment look), "kako
  // tece vremeto" (how time flows). None of these are workflow questions —
  // they must fall through to the data-collection extractors / LLM. The
  // negative lookaheads block device/heating/property objects; "како тече"
  // is bound to process objects (procesot/sorabotkata/rabotata/toa).
  return /како би одело|kako bi odelo|како функционира(?!\s+(?:greenjeto|греењето|parnoto|парното|klimata|климата|toplinata|топлината|liftot|лифтот|vozduhot|воздухот|bojlerot|бојлерот))|kako funkcionira(?!\s+(?:greenjeto|греењето|parnoto|парното|klimata|климата|toplinata|топлината|liftot|лифтот|vozduhot|воздухот|bojlerot|бојлерот))|како тече(?!\s+(?:vremeto|времето|denot|денот|nedelata|неделата|mesecot|месецот|godinata|годината))|kako tece(?!\s+(?:vremeto|времето|denot|денот|nedelata|неделата|mesecot|месецот|godinata|годината))|како изгледа(?!\s+(?:stanot|станот|kukjata|куќата|kuќата|imotot|имотот|ogradata|оградата|placot|плацот|terasata|терасата|fasadata|фасадата|vnatre|внатре|od\s+nadvor|од\s+надвор))|kako izgleda(?!\s+(?:stanot|станот|kukjata|куќата|kuќата|imotot|имотот|ogradata|оградата|placot|плацот|terasata|терасата|fasadata|фасадата|vnatre|внатре|od\s+nadvor|од\s+надвор))|како работи(?!\s+(?:na|на)\s+[a-zа-я]+|\s+(?:klimata|климата|klimat|климат|liftot|лифтот|bojlerot|бојлерот|pumpata|пумпата|peckata|печката))|kako raboti(?!\s+(?:na|на)\s+[a-zа-я]+|\s+(?:klimata|климата|klimat|климат|liftot|лифтот|bojlerot|бојлерот|pumpata|пумпата|peckata|печката))|како би одела|kako bi o dela|kako bi izgledalo|како би изгледало|kako se odviva|како се одвива|kako e procesot|како е процесот|kako funkcionira procesot|како функционира процесот|kako tece procesot|како тече процесот|kako raboti ova|како работи ова|kako funkcionira ova|како функционира ова|kako bi odelo ova|како би одело ова|kako bi odela sorabotkata|како би одела соработката|kako tece sorabotkata|како тече соработката|kako funkcionira sorabotkata|како функционира соработката|kako ke mi pomognete|како ќе ми помогнете|kako kje mi pomognete|како ќе ми помогнете во продажбата|kako ke mi pomognete vo prodazbata|kako ke go prodadete|како ќе го продадете|kako ke go izdadete|како ќе го издадете|kako ke mi pomognete da go prodadam|како ќе ми помогнете да го продадам|sto ke napravite za mene|што ќе направите за мене/i.test(text);
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
// CLIENT-QUALITY / VERIFICATION CONCERN — "ama dali klientite vi se
// provereni ?" (but are your clients verified?), "ozbilni ?" (serious?),
// "SAKAM OZBILNI KLIENTI NE NEKOJ SALABAJZERI" (I want serious clients,
// not slackers). The owner is still NEGOTIATING the quality of the
// clientele, not collecting property data. Two entry points:
//
//   isAskingAboutClientQuality(text, recentContext) — BROAD gate used by the
//   early-response router: any client + quality-word combination, INCLUDING
//   declarative statements ("sakam ozbilni klienti"), plus bare follow-ups
//   ("ozbilni ?") that refer to clients mentioned in the same turn. This is
//   what decides the ANSWER (a reassurance) when the owner says it.
//
//   isClientQualityConcern(text, recentContext) — STRICT gate used by the
//   conditional-acceptance guard in persuasion-phase.js: only QUESTION /
//   probing forms block an acceptance. A declarative statement fused into an
//   acceptance ("dobro, sakam ozbilni klienti, ajde probame" = acceptance
//   WITH a preference) must NOT hold the PERSUASION → DATA_COLLECTION
//   transition — the owner already committed. The reported batch
//   ("mozeme da probame" + "ama dali klientite vi se provereni ?" +
//   "ozbilni ?") has question marks on the trailing messages, so it blocks.
//
// Reported (lead 3571074 production log): Ana jumped into data collection
// after "mozeme da probame" while the owner was still asking "dali
// klientite vi se provereni ? ozbilni ?" — she asked for the rent instead
// of answering the client-quality question.
// ========================================
const CLIENT_QUALITY_WORDS_RE =
  /provereni|проверени|proveren|проверен|ozbilni|озбилни|ozbilen|озбилен|seriozni|сериозни|seriozen|сериозен|salabajzer|салабајзер|kvalitetn|квалитетн|doverliv|доверлив/i;
const CLIENT_WORDS_RE = /klient|клиент|kupuvac|купувач|kupci|купци|zakupc|закупц/i;
// A short message that is essentially one quality word with optional
// politeness/tense scaffolding: "ozbilni ?", "ozbilni li se ?", "provereni ?",
// "ama dali se ozbilni ?". Shared by both gates.
const BARE_CLIENT_QUALITY_RE =
  /^(?:ama\s+|ама\s+|но\s+|no\s+)?(?:dali\s+|дали\s+)?(?:se\s+|се\s+)?(?:ozbilni|озбилни|provereni|проверени|seriozni|сериозни|kvalitetni|квалитетни|doverlivi|доверливи)(?:\s+(?:li|ли)\s+(?:se|се))?(?:\s*[?.,!]|\s*$)/i;

function isAskingAboutClientQuality(text, recentContext = '') {
  const u = String(text || '').toLowerCase().trim();
  if (!u) return false;
  const ctx = (u + ' ' + String(recentContext || '')).toLowerCase();
  // 1. The message itself pairs a quality word with a client word
  //    ("dali klientite vi se provereni ?", "sakam ozbilni klienti").
  if (CLIENT_QUALITY_WORDS_RE.test(u) && CLIENT_WORDS_RE.test(u)) return true;
  // 2. Bare quality follow-up ("ozbilni ?", "provereni ?") — the referent
  //    (clients) must be in the same turn / recent context.
  if (BARE_CLIENT_QUALITY_RE.test(u) && CLIENT_WORDS_RE.test(ctx)) return true;
  // 3. "kakvi klienti imate?" / "kakvi se klientite?" (what kind of clients
  //    do you have / what are the clients like) — the owner is probing
  //    client quality.
  if (/kakvi\s+(?:se\s+)?klient|какви\s+(?:се\s+)?клиент/i.test(u)) return true;
  return false;
}

function isClientQualityConcern(text, recentContext = '') {
  if (!isAskingAboutClientQuality(text, recentContext)) return false;
  const u = String(text || '').toLowerCase().trim();
  // ONLY probing forms block an acceptance — a question, an opening
  // "ama/dali" hedge, a bare quality word, or a "kakvi klienti" probe.
  // NOTE: the hedge prefix must use (?:\s|$) — a \b boundary is ASCII-only
  // and would silently fail after Cyrillic "ама"/"дали" (Cyrillic chars are
  // non-word for \b), so a Cyrillic "ама ..." without a "?" would fall
  // through. The "?" check above covers the reported shapes anyway.
  return /\?/.test(u) ||
         /^(?:ama|ама|но|no|dali|дали)(?:\s|$)/i.test(u) ||
         /^a\s+(?:dali|дали)(?:\s|$)/i.test(u) ||
         BARE_CLIENT_QUALITY_RE.test(u) ||
         /kakvi\s+(?:se\s+)?klient|какви\s+(?:се\s+)?клиент/i.test(u);
}

// ========================================
// CLIENT-QUALITY RESPONSES — "dali klientite vi se provereni?" / "ozbilni?"
// The reassurance Ana gives (rotating variants, rent/sale aware: закупци vs
// купувачи). Same family as the no-agency-experience reassurance — the
// owner is probing whether the clientele is serious and vetted.
// ========================================
const CLIENT_QUALITY_RESPONSES_SALE = [
  'Да, сите наши клиенти се проверени и сериозни. Секој заинтересиран поминува проверка пред да закажеме посета. Дали да продолжиме со соработката?',
  'Можам да ве уверам — клиентите ни се проверени и озбилни. Не доведуваме случајни луѓе, туку само сериозни и проверени купувачи. Дали ви звучи добро?',
  'Сите клиенти што ги доведуваме се проверени. Ја чуваме вашата доверба и работиме само со озбилни и сериозни заинтересирани. Како ви звучи ова?'
];

const CLIENT_QUALITY_RESPONSES_RENT = [
  'Да, сите наши клиенти се проверени и сериозни. Секој заинтересиран поминува проверка пред да закажеме посета. Дали да продолжиме со соработката?',
  'Можам да ве уверам — клиентите ни се проверени и озбилни. Не доведуваме случајни луѓе, туку само сериозни и проверени закупци. Дали ви звучи добро?',
  'Сите клиенти што ги доведуваме се проверени. Ја чуваме вашата доверба и работиме само со озбилни и сериозни заинтересирани. Како ви звучи ова?'
];

function getRandomClientQualityResponse(isRent) {
  const responses = isRent ? CLIENT_QUALITY_RESPONSES_RENT : CLIENT_QUALITY_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
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
  // BARE-TOKEN BINDINGS (audit — same disease class as the phone/AC fixes):
  //   - "iskustvo" (experience) must be bound to the AGENCY's experience
  //     (imate iskustvo / kolku iskustvo / imame iskustvo ...). A bare
  //     token matched the OWNER's own experience — "imam iskustvo so
  //     prodazba", "imam iskustvo so agencii site se isti" (the trust
  //     objection!) — and routed it to the agency pitch.
  //   - "vraboteni" (employees) must be bound to "kolku vraboteni?" /
  //     "imate vraboteni?". A bare token matched the tenant preference
  //     "samo za vraboteni" (only for employees).
  //   - "firma"/"kancelarija" are WORD-BOUNDARY guarded (Cyrillic-aware
  //     JS \b is ASCII-only): "фирмиран договор" (signed contract)
  //     contains the "фирм" stem and "канцелариски" (office supplies)
  //     contains "канцелари" — neither is an agency question.
  return /agencija|агенциј|(?:^|[^a-zа-я])(?:firm|фирм)(?:a|i|а|и)?(?:ta|te|та|те)?(?:$|[^a-zа-я])|(?:^|[^a-zа-я])(?:kancelarij|канцелариј)(?:a|i|а|и)?(?:ta|te|та|те)?(?:$|[^a-zа-я])|biro|биро|vreme rabotite|време работите|imate iskustvo|имате искуство|kolku iskustvo|колку искуство|imame iskustvo|имаме искуство|golemo iskustvo|големо искуство|dolgotrajno iskustvo|долготрајно искуство|so iskustvo|со искуство|godini rabotite|години работите|kako se vika|како се вика|kako se vikate|како се викате|koja ste|која сте|koj ve vodi|кој ве води|vodi agencijata|води агенцијата|kade rabotite|каде работите|od kade rabotite|од каде работите|kade vi e|каде ви е|kade se naogja|каде се наоѓа|shto rabotite(?!\s+so\s+(provizija|провизија|procent|процент))|што работите(?!\s+со\s+(провизија|provizija|процент|procent))|shto e toa metropolis|што е тоа metropolis|sto e metropolis|што е метрополис|sto e metro polis|metropolis agencija|metropolis агенција|angažirate|ангажирате|kolku vraboteni|колку вработени|imate vraboteni|имате вработени|kolektiv|колектив|ime na agencijata|име на агенцијата/i.test(text);
}

// ========================================
// OBJECTION EXPANSION — real owner questions that used to die at the LLM
// gate (or worse: the property-gone close). Each family has a tight matcher
// (both scripts, negative guards per this file's standards) + rotating
// sale/rent response libraries. Wired into handlers/early-responses.js
// (the property-verb family BEFORE the gone-close, the rest before the
// how-it-works / commission gates).
// ========================================

// ========================================
// CLIENT-TYPE RESPONSES — "KAKOV TIP NA KLIENTI NUDITE?" (what TYPE of
// clients do you offer?) — the reported production question (lead 3571074
// log): the 8b LLM ignored it with a canned pitch and the owner pressed.
// The question is about client PROFILES/types, so the answer lists the
// profiles — distinct from client QUALITY (проверени/озбилни), which is
// handled by CLIENT_QUALITY_* above. All variants rotate randomly.
// ========================================
const CLIENT_TYPE_RESPONSES_SALE = [
  'Нашите клиенти се проверени купувачи со различен профил — млади семејства, инвеститори и луѓе што бараат стан за живеење. Сите поминуваат проверка пред да закажеме посета. Дали ви звучи добро?',
  'Нудиме сериозни и проверени купувачи — од млади парови до инвеститори. Секој заинтересиран се проверува пред да закажеме посета. Дали да продолжиме со соработката?',
  'Нашите клиенти се озбилни купувачи со различни профили — семејства, инвеститори и луѓе што бараат дом. Сите се проверени пред посетата. Како ви звучи ова?'
];

const CLIENT_TYPE_RESPONSES_RENT = [
  'Нашите клиенти се проверени закупци со различен профил — млади професионалци, семејства и студенти. Сите поминуваат проверка пред да закажеме посета. Дали ви звучи добро?',
  'Нудиме сериозни и проверени закупци — од млади парови до семејства. Секој заинтересиран се проверува пред да закажеме посета. Дали да продолжиме со соработката?',
  'Нашите клиенти се озбилни закупци со различни профили — професионалци, семејства и студенти. Сите се проверени пред посетата. Како ви звучи ова?'
];

function getRandomClientTypeResponse(isRent) {
  const responses = isRent ? CLIENT_TYPE_RESPONSES_RENT : CLIENT_TYPE_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the client TYPE/PROFILE — "KAKOV TIP NA
// KLIENTI NUDITE ?", "каков профил на клиенти имате?", "kakov klient
// nudite?" (what kind of client do you offer). Requires an explicit
// type/profile word OR a "клиенти + нудите/имате" construction, so a bare
// "клиенти" mention is never hijacked (isAskingAboutClients and the
// client-quality gate own those). NOT a quality question — "kakvi se
// klientite?" (what are the clients like) stays with client quality.
// ========================================
function isAskingAboutClientType(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kakov|каков)\s+(?:tip|тип|profil|профил)\s+(?:na|на)?\s*(?:klient|клиент|kupuvac|купувач|zakupc|закупц)|(?:kakov|каков)\s+(?:klient|клиент|kupuvac|купувач|zakupc|закупц)[a-zа-я]*\s+(?:nudite|нудите|imate|имате)/i.test(u);
}

// ========================================
// TIMELINE RESPONSES — "kolku vreme ke trae prodazbata?" (how long will
// the sale take), "kolku brzo ke se prodade?", "koga ke se prodade mojot
// stan?", "dali ke se prodade brzo?" (rent: izdavanje / izdade / najdeme
// zakupac). Honest framing: no guaranteed date, typical ranges, dependent
// on price/location. All variants rotate randomly.
// ========================================
const TIMELINE_RESPONSES_SALE = [
  'Брзината зависи од имотот и цената, но со нашата база на клиенти повеќето станови се продаваат во рок од неколку недели до два месеци. Дали да почнеме со соработката?',
  'Не можеме да гарантираме точен датум, но нашите клиенти во просек купуваат имот за 1-2 месеци. Сè зависи од локацијата и цената. Дали сте расположени да соработуваме?',
  'Со нашата голема база на заинтересирани купувачи, просечното време на продажба е неколку недели. Дали да продолжиме со соработката?'
];

const TIMELINE_RESPONSES_RENT = [
  'За издавање обично наоѓаме закупец во рок од неколку недели, во зависност од киријата и локацијата. Дали да почнеме со соработката?',
  'Не можеме да гарантираме точен датум, но закупец најчесто наоѓаме за 2-3 недели. Сè зависи од киријата и локацијата. Дали сте расположени да соработуваме?',
  'Со нашата база на заинтересирани закупци, просечното време на издавање е неколку недели. Дали да продолжиме со соработката?'
];

function getRandomTimelineResponse(isRent) {
  const responses = isRent ? TIMELINE_RESPONSES_RENT : TIMELINE_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the sale/rental TIMELINE. MUST run BEFORE
// the property-gone close: "koga ke se prodade" / "dali ke se prodade" /
// "koga ke se izdade" contain the bare "se prodade|се продаде" / "izdade"
// alternatives of PROPERTY_GONE_RE, which would otherwise CLOSE the lead as
// already-sold (reported-adjacent disease class: the gone-close fires on a
// substring). Only future/hypothetical shapes match — a factual "veke
// prodaden" (already sold) is untouched. Negative guards: "kolku vreme
// rabotite" (agency tenure) is owned by the agency gate which runs earlier;
// "kolku godini" (age) is owned by the age gate.
// ========================================
function isAskingAboutTimeline(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kolku|колку)\s+(?:vreme|време|dolgo|долго)\s+(?:ke|ќе)?\s*(?:trae|трае|e\s+potrebno|е\s+потребно|treba|треба)|(?:kolku\s+brzo|колку\s+брзо)\s+(?:ke|ќе)\s+(?:se|се)?\s*(?:prodade|продаде|izdade|издаде|iznajmi|изнајми)|(?:koga|кога)\s+(?:ke|ќе)\s+(?:se|се)\s+(?:prodade|продаде|izdade|издаде|iznajmi|изнајми)|(?:koga|кога)\s+(?:ke|ќе)\s+(?:go|го)\s+(?:prodadam|продадам|izdadam|издадам)|(?:dali|дали)\s+(?:ke|ќе)\s+(?:se|се)\s+(?:prodade|продаде|izdade|издаде|iznajmi|изнајми)\s*(?:brzo|брзо)?|(?:kolku\s+vreme\s+ke\s+trae\s+prodazbata|колку\s+време\s+ќе\s+трае\s+продажбата|koga\s+ke\s+se\s+prodade\s+mojot\s+imot|кога\s+ќе\s+се\s+продаде\s+мојот\s+имот)/i.test(u);
}

// ========================================
// WHAT-IF-NOT-SOLD RESPONSES — "STO AKO NE SE PRODADE ?" (what if it
// doesn't sell?), "ako ne najdete klient?", "dali ke ostane neprodamen?".
// The failure case: NO obligations unless the deal closes (sale) / no fee
// unless the contract is signed (rent — the 50%/100% rule is paid on
// signing day). All variants rotate randomly.
// ========================================
const WHAT_IF_NOT_SOLD_RESPONSES_SALE = [
  'Ако имотот не се продаде, вие немате никакви обврски кон нас — провизијата се плаќа само при успешна продажба. Дали ви звучи фер?',
  'Нема ризик за вас: ако не најдеме купувач, вие не плаќате ништо. Ние заработуваме само кога ќе се склучи продажбата. Дали да почнеме?',
  'Ако имотот остане непродаден, нема давачки за вас — ние заработуваме само на успешна продажба. Дали ви звучи ова?'
];

const WHAT_IF_NOT_SOLD_RESPONSES_RENT = [
  'Ако не најдеме закупец, вие немате обврска кон нас — провизијата се плаќа само на денот на потпишување на договорот. Дали ви звучи фер?',
  'Нема ризик за вас: ако не најдеме закупец, вие не плаќате ништо. Ние заработуваме само кога ќе се потпише договорот. Дали да почнеме?',
  'Ако станот остане неиздаден, нема давачки за вас — провизијата се плаќа само на денот на потпишување. Дали ви звучи ова?'
];

function getRandomWhatIfNotSoldResponse(isRent) {
  const responses = isRent ? WHAT_IF_NOT_SOLD_RESPONSES_RENT : WHAT_IF_NOT_SOLD_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking the FAILURE case — "sto ako ne se prodade?",
// "ako ne najdete klient?", "dali ke ostane neprodamen?". MUST run BEFORE
// the property-gone close (the bare "se prodade" alternative of
// PROPERTY_GONE_RE matches INSIDE "STO AKO NE SE PRODADE?" and would close
// the lead as already-sold — a live negotiation question must be answered,
// never closed). Only HYPOTHETICAL shapes match (ako/sto ako/dali ke
// ostane); a factual "veke prodaden" is untouched. Negative guard: "ne se
// prodava" / "ne e prodaden" (still available) never match.
// ========================================
function isAskingWhatIfNotSold(text) {
  const u = String(text || '').toLowerCase();
  return /(?:ako|ако)\s+(?:ne|не)\s+(?:se|се)\s+(?:prodade|продаде|izdade|издаде|iznajmi|изнајми)|(?:sto\s+ako|што\s+ако)\s+(?:ne|не)\s+(?:se|се)?\s*(?:prodade|продаде|izdade|издаде|iznajmi|изнајми)|(?:ako|ако)\s+(?:ne|не)\s+(?:najdete|најдете|najdeme|најдеме)\s+(?:klient|клиент|kupuvac|купувач|zakupc|закупц)|(?:sto\s+ako|што\s+ако)\s+(?:ne|не)\s+(?:najdete|најдете|najdeme|најдеме)|(?:dali\s+ke\s+ostane\s+neprodaden|дали\s+ќе\s+остане\s+непродаден|dali\s+ke\s+ostane\s+neizdaden|дали\s+ќе\s+остане\s+неиздаден)/i.test(u);
}

// ========================================
// MARKETING RESPONSES — "kade ke go objavite?" (where will you advertise
// it), "koi portali koristite?", "kako ke go promovirate?", "imate li
// sajt?" — how the property gets promoted. Sale/rent wording only differs
// in the property noun; the channel list is the same. All variants rotate.
// ========================================
const MARKETING_RESPONSES_SALE = [
  'Вашиот имот го објавуваме на нашите канали и на водечките портали за недвижности, со професионални фотографии и опис. Дали ви звучи добро?',
  'Имотот се објавува на сите главни портали за недвижности во Македонија и на нашите социјални мрежи, со квалитетни фотографии. Дали да почнеме со соработката?',
  'Промоцијата опфаќа објава на порталите, нашите социјални мрежи и директно претставување на заинтересирани клиенти. Дали ви звучи ова?'
];

const MARKETING_RESPONSES_RENT = [
  'Вашиот стан го објавуваме на нашите канали и на водечките портали за недвижности, со професионални фотографии и опис. Дали ви звучи добро?',
  'Станот се објавува на сите главни портали за недвижности во Македонија и на нашите социјални мрежи, со квалитетни фотографии. Дали да почнеме со соработката?',
  'Промоцијата опфаќа објава на порталите, нашите социјални мрежи и директно претставување на заинтересирани закупци. Дали ви звучи ова?'
];

function getRandomMarketingResponse(isRent) {
  const responses = isRent ? MARKETING_RESPONSES_RENT : MARKETING_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about ADVERTISING/promotion — "kade ke go
// objavite?", "kade ke go oglasite?", "koi portali?", "kako ke go
// promovirate?", "imate li sajt?", "kade ke bide objaven?" (both scripts).
// Distinct from isAskingWhereToSendPhotos (that is the owner sending ANA
// photos — "kade da vi pratam") and from isAskingHowItWorks (generic
// workflow — this is specifically the channel/marketing question).
// ========================================
function isAskingAboutMarketing(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kade|каде)\s+(?:ke|ќе)\s+(?:go|го)?\s*(?:objavite|објавите|oglasite|огласите|reklamirate|рекламирате|promovirate|промовирате)|(?:kako|како)\s+(?:ke|ќе)\s+(?:go|го)?\s*(?:promovirate|промовирате|reklamirate|рекламирате|objavite|објавите)|(?:koi\s+portali|кои\s+портали|na\s+koi\s+portali|на\s+кои\s+портали)|(?:imate\s+li\s+sajt|имате\s+ли\s+сајт|imate\s+sajt|имате\s+сајт)|(?:kade\s+ke\s+bide\s+objaven|каде\s+ќе\s+биде\s+објавен)/i.test(u);
}

// ========================================
// EXCLUSIVITY RESPONSES — "dali moze i sam da go prodavam?" (can I also
// sell it myself?), "dali e ekskluzivno?", "samo kaj vas?", "dali imam
// pravo sam da go prodavam?" — the owner keeps their right to sell/rent the
// property themselves; cooperation is NOT exclusive. All variants rotate.
// ========================================
const EXCLUSIVITY_RESPONSES_SALE = [
  'Соработката не е ексклузивна — вие имате право сами да го продавате имотот во секое време. Ние додаваме вредност со нашите клиенти и промоција. Дали ви звучи фер?',
  'Вие можете да го продавате имотот и сами, нема никаква ексклузивна обврска. Нашата предност е базата на клиенти и промоцијата. Дали да почнеме?',
  'Нема ексклузивитет — соработуваме заедно, а вие останувате слободни сами да го продавате имотот. Дали сте расположени да соработуваме?'
];

const EXCLUSIVITY_RESPONSES_RENT = [
  'Соработката не е ексклузивна — вие имате право сами да го издавате станот во секое време. Ние додаваме вредност со нашите клиенти и промоција. Дали ви звучи фер?',
  'Вие можете да го издавате станот и сами, нема никаква ексклузивна обврска. Нашата предност е базата на клиенти и промоцијата. Дали да почнеме?',
  'Нема ексклузивитет — соработуваме заедно, а вие останувате слободни сами да го издавате станот. Дали сте расположени да соработуваме?'
];

function getRandomExclusivityResponse(isRent) {
  const responses = isRent ? EXCLUSIVITY_RESPONSES_RENT : EXCLUSIVITY_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about EXCLUSIVITY / the owner's own selling
// rights — "dali moze i sam da go prodavam?", "ekskluzivno?", "samo kaj
// vas?", "dali imam pravo sam da go prodavam?", "smeam li i na drugo
// mesto?" (both scripts). Requires an explicit exclusivity word or a
// self-selling right construction — a bare "sam da prodavam" (I'll sell it
// myself as a refusal — "ke go prodadam sam") is owned by the refusal
// guard / rejection ladder and never matched here (no "moze/i sam" right-
// asking shape).
// ========================================
function isAskingAboutExclusivity(text) {
  const u = String(text || '').toLowerCase();
  // "можам/mozam" (first person) and "може/moze" both covered — the owner
  // says "дали МОЖАМ и сам да го издавам?" (can I myself also rent it)
  // as often as the impersonal "дали може и сам да го продавам?".
  return /(?:ekskluziv|ексклузив)|(?:samo\s+kaj\s+vas|само\s+кај\s+вас)|(?:dali|дали)\s+(?:moze|mozam|може|можам)\s+(?:i|и)?\s*(?:sam|сам)\s+(?:da|да)\s+(?:go|го)?\s*(?:prodavam|продавам|izdadam|издадам|izdavam|издавам)|(?:dali\s+imam\s+pravo\s+(?:i\s+)?sam\s+da\s+go\s+(?:prodavam|продавам|izdadam|издадам|izdavam|издавам)|дали\s+имам\s+право\s+(?:и\s+)?сам\s+да\s+го\s+(?:продавам|издадам|издавам))|(?:dali\s+smeam\s+(?:i\s+)?sam\s+da\s+go\s+(?:prodavam|продавам)|дали\s+смеам\s+(?:и\s+)?сам\s+да\s+го\s+(?:продавам|издадам|издавам))|(?:moze\s+li\s+(?:i\s+)?na\s+drugo\s+mesto|може\s+ли\s+(?:и\s+)?на\s+друго\s+место)|(?:dali\s+ke\s+moze\s+da\s+go\s+prodavam\s+(?:i\s+)?sam|дали\s+ќе\s+може\s+да\s+го\s+продавам\s+(?:и\s+)?сам)/i.test(u);
}

// ========================================
// CONTRACT-TERMS RESPONSES — "kakov dogovor ke potpiseme?" (what contract
// will we sign), "kolku e dolg dogovorot?", "dali moze da se raskine
// dogovorot?", "dali ima dogovor?" — the agency agreement. Sale: the
// contract defines the clean-price / difference model. Rent: the contract
// states the 50%/100% rule. All variants rotate randomly.
// ========================================
const CONTRACT_TERMS_RESPONSES_SALE = [
  'Работиме со стандарден договор за агенциска соработка, во кој се дефинирани обврските и провизијата. Договорот е јасен и транспарентен. Дали имате некое прашање?',
  'Потпишуваме стандарден агенциски договор во кој јасно стои дека вие ја добивате вашата чиста цена, а провизијата е разликата над неа. Дали ви е појасно?',
  'Договорот е стандарден за агенциска соработка — ги дефинира правата и обврските на двете страни. Може да го прочитате пред потпишување. Дали ви звучи добро?'
];

const CONTRACT_TERMS_RESPONSES_RENT = [
  'Работиме со стандарден договор за агенциска соработка, во кој се дефинирани обврските и провизијата — 50% од една месечна кирија (100% ако е над 1000 евра), платена на денот на потпишување. Дали имате некое прашање?',
  'Потпишуваме стандарден агенциски договор во кој јасно стои провизијата за издавање — 50% од една месечна кирија (100% ако е над 1000 евра), платена на денот на потпишување. Дали ви е појасно?',
  'Договорот е стандарден за агенциска соработка — ги дефинира правата и обврските на двете страни. Може да го прочитате пред потпишување. Дали ви звучи добро?'
];

function getRandomContractTermsResponse(isRent) {
  const responses = isRent ? CONTRACT_TERMS_RESPONSES_RENT : CONTRACT_TERMS_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the CONTRACT — "kakov dogovor?", "kolku e
// dolg dogovorot?", "dali ima dogovor?", "dali moze da se raskine
// dogovorot?", "kakov dokument potpisuvame?" (both scripts). Not the
// cooperation-explainer ("kakva sorabotka" — owned by its own gate): this
// is specifically the legal agreement the owner would sign.
// ========================================
function isAskingAboutContractTerms(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kakov|каков)\s+(?:dogovor|договор)|(?:kolku\s+(?:e\s+)?dolg\s+dogovor|колку\s+(?:е\s+)?долг\s+договор)|(?:dali\s+(?:ima|има|potpisuvame|потпишуваме)\s+(?:dogovor|договор))|(?:kakov\s+dokument\s+potpisuvame|каков\s+документ\s+потпишуваме)|(?:dali\s+moze\s+da\s+se\s+raskine\s+dogovorot|дали\s+може\s+да\s+се\s+раскине\s+договорот|raskinuvanje\s+na\s+dogovor|раскинување\s+на\s+договор|moze\s+li\s+da\s+se\s+raskine|може\s+ли\s+да\s+се\s+раскине)/i.test(u);
}

// ========================================
// PAYMENT-TIMING RESPONSES — "kako ke mi isplatite?" (how will you pay
// me), "koga ke gi dobijam parite?", "koga ke mi ja isplatite cenata?" —
// when the OWNER gets paid. Sale: buyer pays the full clean price at
// notary signing. Rent: tenant pays first rent + deposit on signing day.
// Distinct from owner-must-pay ("ke vi platam li nesto?" — what the owner
// owes US) — this is the mirror: what the owner RECEIVES. All rotate.
// ========================================
const PAYMENT_TIMING_RESPONSES_SALE = [
  'Цената ви ја исплаќа купувачот при потпишување на договорот пред нотар — вие ја добивате вашата чиста цена во целост. Дали ви е јасно?',
  'Плаќањето се врши на денот на потпишување — купувачот ја плаќа цената, а вие ја добивате вашата чиста сума. Дали ви е појасно?',
  'Парите ги добивате на денот на потпишување на договорот, директно од купувачот — вашата чиста цена во целост. Дали ви звучи добро?'
];

const PAYMENT_TIMING_RESPONSES_RENT = [
  'За издавање, закупецот ја плаќа првата кирија и депозитот на денот на потпишување — вие ги добивате вашите пари веднаш. Дали ви е јасно?',
  'Киријата и депозитот се плаќаат на денот на потпишување на договорот — вие ги добивате парите веднаш од закупецот. Дали ви е појасно?',
  'Закупецот плаќа прва кирија и депозит на денот на потпишување, а киријата потоа ја примате месечно. Дали ви звучи добро?'
];

function getRandomPaymentTimingResponse(isRent) {
  const responses = isRent ? PAYMENT_TIMING_RESPONSES_RENT : PAYMENT_TIMING_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking how/when the OWNER gets paid — "kako ke mi
// isplatite?", "koga ke mi gi isplatite parite?", "koga ke gi dobijam
// parite?", "koga ke mi ja isplatite cenata?" (both scripts). The verb is
// directed at US paying THEM (ke mi ... isplatite/dobijam/parite) — the
// opposite direction of isAskingIfOwnerMustPay (ke vi platam li nesto —
// they pay us), so the two never collide.
// ========================================
function isAskingAboutPaymentTiming(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kako|како)\s+(?:ke|ќе)\s+(?:mi|ми)\s+(?:gi|ги)?\s*(?:isplatite|исплатите|platite|платите|davate|давате)|(?:koga|кога)\s+(?:ke|ќе)\s+(?:mi|ми)\s+(?:gi|ги)?\s*(?:isplatite|исплатите|dobijam|добијам|pristignat|пристигнат)|(?:kako\s+ke\s+gi\s+dobijam\s+parite|како\s+ќе\s+ги\s+добијам\s+парите|koga\s+ke\s+gi\s+dobijam\s+parite|кога\s+ќе\s+ги\s+добијам\s+парите|koga\s+ke\s+mi\s+ja\s+isplatite\s+cenata|кога\s+ќе\s+ми\s+ја\s+исплатите\s+цената|kako\s+ke\s+mi\s+ja\s+isplatite\s+cenata|како\s+ќе\s+ми\s+ја\s+исплатите\s+цената)/i.test(u);
}

// ========================================
// NEXT-STEP RESPONSES — "sto e sledniot cekor?" (what's the next step),
// "koga ke pocneme?", "kako ke odi ponatamu?", "sto ponatamu?" — the
// process roadmap after the owner agrees to explore cooperation. All
// variants rotate randomly.
// ========================================
const NEXT_STEP_RESPONSES_SALE = [
  'Следниот чекор е да ги собереме основните податоци за имотот — цена, квадратура и локација — па го објавуваме и почнуваме со посети. Дали да почнеме сега?',
  'Прво ги потврдуваме деталите за имотот, потоа го објавуваме на порталите и организираме посети со заинтересирани купувачи. Дали да почнеме?',
  'Следно треба да ги дополниме податоците за имотот и да закажеме фотографирање. Потоа објава и посети. Дали да почнеме со соработката?'
];

const NEXT_STEP_RESPONSES_RENT = [
  'Следниот чекор е да ги собереме основните податоци за станот — кирија, квадратура и локација — па го објавуваме и почнуваме со посети. Дали да почнеме сега?',
  'Прво ги потврдуваме деталите за станот, потоа го објавуваме на порталите и организираме посети со заинтересирани закупци. Дали да почнеме?',
  'Следно треба да ги дополниме податоците за станот и да закажеме фотографирање. Потоа објава и посети. Дали да почнеме со соработката?'
];

function getRandomNextStepResponse(isRent) {
  const responses = isRent ? NEXT_STEP_RESPONSES_RENT : NEXT_STEP_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the NEXT STEP / how the process continues
// — "sto e sledniot cekor?", "sto ponatamu?", "kako ke odi ponatamu?",
// "koga ke pocneme?" (both scripts). Distinct from isAskingHowItWorks
// (generic workflow — "kako ke mi pomognete"): this is the owner asking
// what happens NEXT, right now. The verb is pocneme/pocnuvame/sleduva/
// ponatamu, never the help-verbs of the workflow gate.
// ========================================
function isAskingAboutNextStep(text) {
  const u = String(text || '').toLowerCase();
  return /(?:sto\s+e\s+sledniot\s+cekor|што\s+е\s+следниот\s+чекор|koj\s+e\s+sledniot\s+cekor|кој\s+е\s+следниот\s+чекор|sto\s+ponatamu|што\s+понатаму|sto\s+sleduva|што\s+следува|kako\s+ke\s+odi\s+ponatamu|како\s+ќе\s+оди\s+понатаму|kako\s+ponatamu|како\s+понатаму|koga\s+ke\s+pocneme|кога\s+ќе\s+почнеме|koga\s+pocnuvame|кога\s+почнуваме|od\s+kade\s+pocnuvame|од\s+каде\s+почнуваме)/i.test(u);
}

// ========================================
// VALUATION RESPONSES — "kolku vredi mojot stan?" (how much is my
// apartment worth), "kolku mozam da dobijam?", "dali moze procenka?" —
// the owner asks for a property valuation. Honest framing: needs the
// property data first, then a market-based estimate. All variants rotate.
// ========================================
const VALUATION_RESPONSES_SALE = [
  'За точна проценка ни требаат податоци за имотот — квадратура, локација, кат и состојба. Ако ни ги дадете, ќе ви кажеме реална проценка на цената. Дали да почнеме?',
  'Проценката зависи од локацијата, квадратурата и состојбата на имотот. Споделете ги основните податоци, па ќе ви дадеме реална цена. Дали да продолжиме?',
  'Без да го видиме имотот не можеме да гарантираме цена, но со основните податоци ќе ви дадеме реална проценка според пазарот. Дали да почнеме со соработката?'
];

const VALUATION_RESPONSES_RENT = [
  'За точна проценка на киријата ни требаат податоци за станот — квадратура, локација, кат и состојба. Ако ни ги дадете, ќе ви кажеме реална кирија. Дали да почнеме?',
  'Проценката на киријата зависи од локацијата, квадратурата и состојбата на станот. Споделете ги основните податоци, па ќе ви дадеме реална цена. Дали да продолжиме?',
  'Без да го видиме станот не можеме да гарантираме кирија, но со основните податоци ќе ви дадеме реална проценка според пазарот. Дали да почнеме со соработката?'
];

function getRandomValuationResponse(isRent) {
  const responses = isRent ? VALUATION_RESPONSES_RENT : VALUATION_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking for a PROPERTY VALUATION — "kolku vredi mojot
// stan?", "kolkava e cenata na mojot imot?", "kolku moze da se dobie?",
// "dali moze procenka?", "kolku bi se prodal?" (both scripts). Requires a
// value/price verb or the procenka noun — never bare "kolku" (that family
// is owned by percentage/age/rent-rules gates, all of which run before
// this one in the router).
// ========================================
function isAskingAboutValuation(text) {
  const u = String(text || '').toLowerCase();
  // "можам/mozam" and "може/moze" both covered: "kolku mozam da dobijam
  // za imotot?" (how much can I get) and "kolku moze da se dobie?".
  return /(?:kolku|колку)\s+(?:vredi|вреди|vredn|вредн|bi\s+se\s+prodal|би\s+се\s+продал)|(?:kolkava|колкава)\s+(?:e\s+)?(?:cenata|цената)\s+(?:na|на)?\s*(?:mojot|мојот|mojata|мојата)?\s*(?:imot|имот|stan|стан)|(?:kolku|колку)\s+(?:moze|mozam|може|можам)\s+da\s+(?:se\s+dobie|dobijam|се\s+добие|добијам)|(?:dali\s+moze\s+procenka|дали\s+може\s+проценка|napravete\s+procenka|направете\s+проценка|imate\s+procenka|имате\s+проценка)/i.test(u);
}

// ========================================
// DOCUMENTS RESPONSES — "koi dokumenti mi trebaat?" (what documents do I
// need), "kakvi hartii treba?" — the paperwork the owner must provide.
// Same answer for sale and rent (title deed + ID; the rest is handled by
// the agency). All variants rotate randomly.
// ========================================
const DOCUMENTS_RESPONSES_SALE = [
  'Потребни се имотен лист и лична карта, а доколку има — договор за градба или други документи за имотот. Сè останато го водиме ние. Дали имате уште прашања?',
  'Главните документи се имотниот лист и личната карта. Ако имате дополнителни документи за имотот, добредојдени се, но не се задолжителни. Дали ви е јасно?',
  'За почеток ни се доволни имотен лист и лична карта. Останатата документација ја прибираме заедно при потпишување. Дали да почнеме?'
];

const DOCUMENTS_RESPONSES_RENT = [
  'Потребни се имотен лист и лична карта, а доколку има — договор за издавање од претходно или други документи за станот. Сè останато го водиме ние. Дали имате уште прашања?',
  'Главните документи се имотниот лист и личната карта. Ако имате дополнителни документи за станот, добредојдени се, но не се задолжителни. Дали ви е јасно?',
  'За почеток ни се доволни имотен лист и лична карта. Останатата документација ја прибираме заедно при потпишување. Дали да почнеме?'
];

function getRandomDocumentsResponse(isRent) {
  const responses = isRent ? DOCUMENTS_RESPONSES_RENT : DOCUMENTS_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the required DOCUMENTS — "koi dokumenti mi
// trebaat?", "kakvi dokumenti?", "koi hartii?", "dali mi trebaat
// dokumenti?" (both scripts). Never matches the refusal "ne mi treba"
// (different direction — that asks whether the OWNER needs documents, and
// the word is "dali mi trebaat", not "ne mi treba").
// ========================================
function isAskingAboutDocuments(text) {
  const u = String(text || '').toLowerCase();
  return /(?:koi|кои|kakvi|какви|sto|што)\s+(?:dokumenti|документи|hartii|хартии)|(?:dali\s+mi\s+trebaat\s+(?:dokumenti|документи)|дали\s+ми\s+требаат\s+(?:документи|dokumenti))/i.test(u);
}

// ========================================
// DISCOUNT RESPONSES — "moze li pomala provizija?" (can the commission be
// lower), "dali ima popust?", "dali moze da se dogovori provizijata?" —
// the owner negotiates the fee down. SALE: the agency earns the DIFFERENCE
// over the owner's clean price — the owner's share is never touched, so
// there is nothing to discount off their pocket. RENT: the 50%/100% rule
// is standard — never promise a discount, restate the rule. All rotate.
// ========================================
const DISCOUNT_RESPONSES_SALE = [
  'Разбирам дека сакате пониска провизија, но нашата провизија е разликата над вашата барана цена — вие ја добивате вашата цена во целост. Дали ви звучи фер?',
  'Нашата заработувачка е разликата меѓу вашата барана цена и постигнатата продажна цена — не земаме ништо од вашиот дел. Дали тоа ви одговара?',
  'Провизијата не ви се наплаќа од вашиот дел — вие ја добивате вашата барана цена, а ние заработуваме над неа. Дали ви е појасно?'
];

const DISCOUNT_RESPONSES_RENT = [
  'Разбирам. За издавање провизијата е стандардна — 50% од една месечна кирија (100% ако е над 1000 евра), платена само на денот на потпишување. Дали ви звучи фер?',
  'Провизијата за издавање е стандардна: 50% од една месечна кирија (100% ако е над 1000 евра), на денот на потпишување на договорот. Дали ви е појасно?',
  'За издавање провизијата е фиксна — 50% од една месечна кирија (100% ако е над 1000 евра) — и се плаќа само на денот на потпишување. Дали ви звучи ова?'
];

function getRandomDiscountResponse(isRent) {
  const responses = isRent ? DISCOUNT_RESPONSES_RENT : DISCOUNT_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if the owner is NEGOTIATING the fee down — "moze li pomala
// provizija?", "dali moze popust?", "dali moze da se dogovori
// provizijata?", "kolku e minimalnata provizija?" (both scripts). MUST run
// BEFORE the commission gate (isAskingAboutCommission / rent-commission):
// "pomala provizija" contains "provizija" and would otherwise get the
// generic rule explanation. The answer acknowledges the ask but NEVER
// promises a discount (the rent variants restate the standard rule).
// ========================================
function isAskingAboutDiscount(text) {
  const u = String(text || '').toLowerCase();
  return /(?:moze\s+li|може\s+ли|dali\s+moze|дали\s+може|dali\s+ima|дали\s+има)\s+(?:pomala|помала|poniska|пониска|popust|попуст)\s*(?:provizija|провизија|na\s+provizijata|на\s+провизијата)?|(?:moze\s+li\s+da\s+se\s+dogovori\s+provizijata|може\s+ли\s+да\s+се\s+договори\s+провизијата|dali\s+moze\s+da\s+se\s+dogovori\s+provizijata|дали\s+може\s+да\s+се\s+договори\s+провизијата)|(?:kolku\s+e\s+minimalnata\s+provizija|колку\s+е\s+минималната\s+провизија)|(?:pomala\s+provizija|помала\s+провизија)|(?:dali\s+moze\s+pomala|дали\s+може\s+помала)/i.test(u);
}

// ========================================
// OFFICE-VISIT RESPONSES — "dali treba da dojdam kaj vas?" (do I need to
// come to you), "dali mora da odam vo kancelarija?" — does the owner need
// to visit the office in person. Answer: no — everything is handled over
// phone/Viber, in-person only if they want. All variants rotate randomly.
// ========================================
const OFFICE_VISIT_RESPONSES_SALE = [
  'Не мора да доаѓате во канцеларија — сè може да се договори преку телефон и Viber. Ако сакате, можеме да се видиме и лично. Дали ви одговара?',
  'Сè се одвива преку телефон и Viber, не мора да доаѓате кај нас. Ако сакате лична средба, можеме да се договориме. Дали ви е појасно?',
  'Нема потреба да доаѓате во канцеларијата — комуникацијата е на телефон и Viber, а документацијата ја водиме ние. Дали да почнеме?'
];

const OFFICE_VISIT_RESPONSES_RENT = [
  'Не мора да доаѓате во канцеларија — сè може да се договори преку телефон и Viber. Ако сакате, можеме да се видиме и лично. Дали ви одговара?',
  'Сè се одвива преку телефон и Viber, не мора да доаѓате кај нас. Ако сакате лична средба, можеме да се договориме. Дали ви е појасно?',
  'Нема потреба да доаѓате во канцеларијата — комуникацијата е на телефон и Viber, а документацијата ја водиме ние. Дали да почнеме?'
];

function getRandomOfficeVisitResponse(isRent) {
  const responses = isRent ? OFFICE_VISIT_RESPONSES_RENT : OFFICE_VISIT_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking whether the OWNER must come to the office —
// "dali treba da dojdam kaj vas?", "dali mora da odam vo kancelarija?",
// "dali ke doagjam kaj vas?" (both scripts). NEGATIVE GUARD: the viewing
// ("poseta/ogled") is at the property and is a different question — never
// matched here (the owner does not attend tenant viewings).
// ========================================
function isAskingAboutOfficeVisit(text) {
  const u = String(text || '').toLowerCase();
  if (/poseta|посета|ogled|оглед/i.test(u)) return false;
  return /(?:dali\s+treba\s+da\s+dojdam|дали\s+треба\s+да\s+дојдам|dali\s+moram\s+da\s+dojdam|дали\s+морам\s+да\s+дојдам|dali\s+treba\s+da\s+dojdam\s+kaj\s+vas|дали\s+треба\s+да\s+дојдам\s+кај\s+вас|kade\s+treba\s+da\s+dojdam|каде\s+треба\s+да\s+дојдам|dali\s+mora\s+da\s+odam\s+vo\s+kancelarija|дали\s+мора\s+да\s+одам\s+во\s+канцеларија|dali\s+treba\s+da\s+odam\s+kaj\s+vas\s+vo\s+kancelarija|дали\s+треба\s+да\s+одам\s+кај\s+вас\s+во\s+канцеларија|dali\s+ke\s+doagjam\s+kaj\s+vas|дали\s+ќе\s+доаѓам\s+кај\s+вас)/i.test(u);
}

// ========================================
// WORKING-HOURS RESPONSES — "koe e rabotnoto vreme?" (what are the
// working hours), "do kolku rabotite?", "koga rabotite?", "dali rabotite
// vikend?" — agency availability. All variants rotate randomly.
// ========================================
const WORKING_HOURS_RESPONSES_SALE = [
  'Работното време ни е секој ден од 9 до 17 часот, а на Viber сме достапни и надвор од него. Дали имате некое друго прашање?',
  'Достапни сме секој работен ден од 9 до 17 часот, а пораките на Viber ги читаме и потоа. Дали да продолжиме со соработката?',
  'Работиме секој ден во текот на работната недела, а на Viber одговараме брзо. Дали имате некое друго прашање?'
];

const WORKING_HOURS_RESPONSES_RENT = [
  'Работното време ни е секој ден од 9 до 17 часот, а на Viber сме достапни и надвор од него. Дали имате некое друго прашање?',
  'Достапни сме секој работен ден од 9 до 17 часот, а пораките на Viber ги читаме и потоа. Дали да продолжиме со соработката?',
  'Работиме секој ден во текот на работната недела, а на Viber одговараме брзо. Дали имате некое друго прашање?'
];

function getRandomWorkingHoursResponse(isRent) {
  const responses = isRent ? WORKING_HOURS_RESPONSES_RENT : WORKING_HOURS_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking about the agency's WORKING HOURS — "koe e
// rabotnoto vreme?", "do kolku rabotite?", "koga rabotite?", "dali
// rabotite vikend?" (both scripts). Distinct from "kolku vreme rabotite?"
// (agency TENURE — owned by the agency gate, which runs earlier) and from
// "koga ke pocneme?" (process start — owned by the next-step gate, which
// also runs earlier in the general block).
// ========================================
function isAskingAboutWorkingHours(text) {
  const u = String(text || '').toLowerCase();
  return /(?:koe\s+e\s+rabotnoto\s+vreme|кое\s+е\s+работното\s+време|kolku\s+do\s+kolku\s+rabotite|колку\s+до\s+колку\s+работите|do\s+kolku\s+rabotite|до\s+колку\s+работите|koga\s+rabotite|кога\s+работите|koga\s+ste\s+dostapni|кога\s+сте\s+достапни|dali\s+rabotite\s+vikend|дали\s+работите\s+викенд|rabotite\s+li\s+vikend|работите\s+ли\s+викенд)/i.test(u);
}

// ========================================
// CLIENT-VERIFICATION RESPONSES — "kako gi proveruvate klientite?" (how
// do you verify the clients), "kako znaete dali klientot e ozbilen?" — the
// owner asks about the VERIFICATION PROCESS (distinct from client QUALITY
// reassurance — "dali klientite vi se provereni?" — which is owned by
// CLIENT_QUALITY_* above: here the owner asks HOW the vetting works). Sale:
// financial capability to buy. Rent: ability to pay the rent. All rotate.
// ========================================
const CLIENT_VERIFICATION_RESPONSES_SALE = [
  'Секој заинтересиран клиент поминува проверка — потврдуваме дека е сериозен и дека има финансиска можност, пред да закажеме посета. Дали ви звучи добро?',
  'Ги проверуваме клиентите пред посета — нивната намера и финансиска подготвеност. Не доведуваме случајни луѓе. Дали ви е појасно?',
  'Секој клиент се проверува пред да го донесеме на посета — сериозност, мотивација и можност за купување. Дали ви звучи ова?'
];

const CLIENT_VERIFICATION_RESPONSES_RENT = [
  'Секој заинтересиран закупец поминува проверка — потврдуваме дека е сериозен и дека може да ја плаќа киријата, пред да закажеме посета. Дали ви звучи добро?',
  'Ги проверуваме закупците пред посета — нивната намера и финансиска подготвеност. Не доведуваме случајни луѓе. Дали ви е појасно?',
  'Секој закупец се проверува пред да го донесеме на посета — сериозност, мотивација и можност за плаќање на киријата. Дали ви звучи ова?'
];

function getRandomClientVerificationResponse(isRent) {
  const responses = isRent ? CLIENT_VERIFICATION_RESPONSES_RENT : CLIENT_VERIFICATION_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if asking HOW clients are verified — "kako gi proveruvate
// klientite?", "kako proveruvate dali klientot e ozbilen?", "kako znaete
// dali klientot e ozbilen?" (both scripts). The verb is proveruvate/
// znaete (process) — NOT the quality adjectives (provereni/ozbilni) owned
// by isAskingAboutClientQuality. Requires the verify-verb + a client word;
// a bare "provereni klienti" statement stays with client quality.
// ========================================
function isAskingHowClientsVerified(text) {
  const u = String(text || '').toLowerCase();
  return /(?:kako|како)\s+(?:gi|ги)?\s*(?:proveruvate|проверувате|proverite|проверите|znaete|знаете)\s+(?:dali|дали)?\s*(?:klient|клиент|kupuvac|купувач|zakupc|закупц)|(?:kako\s+proveruvate\s+dali\s+klientot\s+e\s+ozbilen|како\s+проверувате\s+дали\s+клиентот\s+е\s+озбилен|kako\s+znaete\s+dali\s+klientot\s+e\s+ozbilen|како\s+знаете\s+дали\s+клиентот\s+е\s+озбилен|kako\s+gi\s+proveruvate\s+zainteresiranite|како\s+ги\s+проверувате\s+заинтересираните|kako\s+proveruvate\s+kupuvacot|како\s+проверувате\s+купувачот)/i.test(u);
}

// ========================================
// WHO-HANDLES RESPONSES — "koj ke raboti so mojot imot?" (who will work
// on my property), "koj ke go vodi mojot slucaj?", "koj ke se grizi za
// mojot imot?" — which agent owns the case. Answer: a dedicated colleague
// agent (consistent with the agent-visit answer — the case is handled by
// the team, not only by Ana). All variants rotate randomly.
// ========================================
const WHO_HANDLES_RESPONSES_SALE = [
  'За вашиот случај ќе се грижи посветен агент од нашиот тим, кој ќе ве контактира и ќе го води целиот процес. Дали имате уште прашања?',
  'Еден од нашите агенти ќе биде задолжен за вашиот имот — ќе ве контактира, ќе ги организира посетите и ќе го води процесот. Дали ви звучи добро?',
  'Вашиот случај го презема агент од нашиот тим — тој ќе ве контактира за деталите и ќе го води целиот процес. Дали да почнеме?'
];

const WHO_HANDLES_RESPONSES_RENT = [
  'За вашиот случај ќе се грижи посветен агент од нашиот тим, кој ќе ве контактира и ќе го води целиот процес. Дали имате уште прашања?',
  'Еден од нашите агенти ќе биде задолжен за вашиот стан — ќе ве контактира, ќе ги организира посетите и ќе го води процесот. Дали ви звучи добро?',
  'Вашиот случај го презема агент од нашиот тим — тој ќе ве контактира за деталите и ќе го води целиот процес. Дали да почнеме?'
];

function getRandomWhoHandlesResponse(isRent) {
  const responses = isRent ? WHO_HANDLES_RESPONSES_RENT : WHO_HANDLES_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// STANDARD-TERMS ACK RESPONSES — the owner replies "standard" /
// "standardna procedura" (accepting the commission/rent-rules explanation
// Ana just gave) and it used to fall through every gate into the LLM,
// which answered with a generic client pitch (reported: owner said
// "standard" after the rent commission split explanation, got a canned
// "draga mi e sto doznav..." line instead). The right reply confirms the
// standard procedure AND reassures with the carefully-filtered clientele.
// All variants rotate randomly (same as legal costs / agent visit).
// ========================================
const STANDARD_TERMS_RESPONSES_SALE = [
  'Ова е стандардна процедура, со тоа што нашите купувачи се внимателно филтрирани пред посета. Дали сте расположени да почнеме со соработка?',
  'Стандардна процедура, со тоа што секој наш клиент поминува проверка пред да дојде на посета. Дали да продолжиме со соработката?',
  'Тоа е стандардната процедура — а нашите клиенти се внимателно проверени. Дали да почнеме со соработката?'
];

const STANDARD_TERMS_RESPONSES_RENT = [
  'Ова е стандардна процедура, со тоа што нашите закупци се внимателно филтрирани пред посета. Дали сте расположени да почнеме со соработка?',
  'Стандардна процедура, со тоа што секој наш клиент поминува проверка пред да дојде на посета. Дали да продолжиме со соработката?',
  'Тоа е стандардната процедура — а нашите клиенти се внимателно проверени. Дали да почнеме со соработката?'
];

function getRandomStandardTermsResponse(isRent) {
  const responses = isRent ? STANDARD_TERMS_RESPONSES_RENT : STANDARD_TERMS_RESPONSES_SALE;
  return responses[Math.floor(Math.random() * responses.length)];
}

// ========================================
// HELPER: Check if the owner ACKNOWLEDGES the standard terms — "standard",
// "standardna procedura", "standardno e", "ok standard" (both scripts).
// Whole-message anchored: it fires ONLY on a short ack centered on the
// standard-word. A QUESTION about the terms ("dali e standardna
// procedura?", "kako funkcionira standardno?") must NEVER match — those
// have their own gates (isAskingHowCommissionWorks etc.). A NEGATION
// ("ne e standard", "ne standardno") is also excluded — it's an objection.
// ========================================
function isStandardTermsAck(text) {
  const u = String(text || '').trim().toLowerCase();
  if (!u || u.length > 60) return false;
  if (/[?؟]/.test(u)) return false;
  if (/dali|дали|kolku|колку|kako|како|koga|кога|zosto|зошто|sto|што|kade|каде|moze|може/i.test(u)) return false;
  if (/ne\s*(?:e|е)?\s*(?:standard|стандард)|не\s*(?:е)?\s*(?:standard|стандард)/i.test(u)) return false;
  return /^(?:(?:ok|okej|океј|vo red|во ред|sve e|сè е|se e|се е|toa e|тоа е|taka e|така е|ova e|ова е|e|е)\s+)?(?:standard(?:na|no)?|стандард(?:на|но)?)(?:\s+(?:procedura|процедура))?(?:\s*(?:e|е))?(?:[.!?,]?\s*(?:ok|okej|океј))?[.!?,]?$/i.test(u);
}

// ========================================
// HELPER: Check if asking WHO handles the property/case — "koj ke raboti
// so mojot imot?", "koj ke go vodi mojot slucaj?", "koj agent ke raboti?"
// (both scripts). Requires a case/property object (mojot imot/slucaj/stan)
// or "koj agent" — a bare "koj ke raboti" (who will work) with no referent
// never matches. Distinct from the who-pays/commission clitic patterns
// (those need plakja verbs — never matched here).
// ========================================
function isAskingWhoHandlesProperty(text) {
  const u = String(text || '').toLowerCase();
  return /(?:koj|кој)\s+(?:agent|агент)|(?:koj|кој)\s+(?:ke|ќе)?\s*(?:raboti|работи|se\s+grizi|се\s+грижи|go\s+vodi|го\s+води|ja\s+vodi|ја\s+води)\s+(?:so|со)?\s*(?:mojot|мојот|mojata|мојата)?\s*(?:imot|имот|stan|стан|slucaj|случај)|(?:koj\s+ke\s+go\s+vodi\s+mojot\s+slucaj|кој\s+ќе\s+го\s+води\s+мојот\s+случај|koj\s+ke\s+se\s+grizi\s+za\s+mojot\s+imot|кој\s+ќе\s+се\s+грижи\s+за\s+мојот\s+имот)/i.test(u);
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
  isAskingAboutClientQuality,
  isClientQualityConcern,
  CLIENT_QUALITY_RESPONSES_SALE,
  CLIENT_QUALITY_RESPONSES_RENT,
  getRandomClientQualityResponse,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts,
  isAskingWhoPaysForLegalCosts,
  isAskingAboutAgency,
  CLIENT_TYPE_RESPONSES_SALE,
  CLIENT_TYPE_RESPONSES_RENT,
  getRandomClientTypeResponse,
  isAskingAboutClientType,
  TIMELINE_RESPONSES_SALE,
  TIMELINE_RESPONSES_RENT,
  getRandomTimelineResponse,
  isAskingAboutTimeline,
  WHAT_IF_NOT_SOLD_RESPONSES_SALE,
  WHAT_IF_NOT_SOLD_RESPONSES_RENT,
  getRandomWhatIfNotSoldResponse,
  isAskingWhatIfNotSold,
  MARKETING_RESPONSES_SALE,
  MARKETING_RESPONSES_RENT,
  getRandomMarketingResponse,
  isAskingAboutMarketing,
  EXCLUSIVITY_RESPONSES_SALE,
  EXCLUSIVITY_RESPONSES_RENT,
  getRandomExclusivityResponse,
  isAskingAboutExclusivity,
  CONTRACT_TERMS_RESPONSES_SALE,
  CONTRACT_TERMS_RESPONSES_RENT,
  getRandomContractTermsResponse,
  isAskingAboutContractTerms,
  PAYMENT_TIMING_RESPONSES_SALE,
  PAYMENT_TIMING_RESPONSES_RENT,
  getRandomPaymentTimingResponse,
  isAskingAboutPaymentTiming,
  NEXT_STEP_RESPONSES_SALE,
  NEXT_STEP_RESPONSES_RENT,
  getRandomNextStepResponse,
  isAskingAboutNextStep,
  VALUATION_RESPONSES_SALE,
  VALUATION_RESPONSES_RENT,
  getRandomValuationResponse,
  isAskingAboutValuation,
  DOCUMENTS_RESPONSES_SALE,
  DOCUMENTS_RESPONSES_RENT,
  getRandomDocumentsResponse,
  isAskingAboutDocuments,
  DISCOUNT_RESPONSES_SALE,
  DISCOUNT_RESPONSES_RENT,
  getRandomDiscountResponse,
  isAskingAboutDiscount,
  OFFICE_VISIT_RESPONSES_SALE,
  OFFICE_VISIT_RESPONSES_RENT,
  getRandomOfficeVisitResponse,
  isAskingAboutOfficeVisit,
  WORKING_HOURS_RESPONSES_SALE,
  WORKING_HOURS_RESPONSES_RENT,
  getRandomWorkingHoursResponse,
  isAskingAboutWorkingHours,
  CLIENT_VERIFICATION_RESPONSES_SALE,
  CLIENT_VERIFICATION_RESPONSES_RENT,
  getRandomClientVerificationResponse,
  isAskingHowClientsVerified,
  WHO_HANDLES_RESPONSES_SALE,
  WHO_HANDLES_RESPONSES_RENT,
  getRandomWhoHandlesResponse,
  isAskingWhoHandlesProperty,
  STANDARD_TERMS_RESPONSES_SALE,
  STANDARD_TERMS_RESPONSES_RENT,
  getRandomStandardTermsResponse,
  isStandardTermsAck
};
