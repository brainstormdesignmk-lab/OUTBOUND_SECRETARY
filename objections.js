// ========================================
// OBJECTION RESPONSES — Hardcoded library
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
  'from_whose_pocket': {
    pattern: /od koj dzeb|од кој џеб|od kade se parite|од каде се парите|od kade se parite|od koj dzeb se parite|od koj dzeb gi vadite parite|од кој џеб ги вадите парите|koi se parite|чии се парите|cii se parite|чии пари се тоа|cii pari se toa|od kade pa tie pari|од каде па тие пари|od kade vam parite|од каде вам парите|kako vie ke naplakjate|како вие ќе наплаќате|kako vie zemate|како вие земате|koj vi dava provizija|кој ви дава провизија|koj vi gi dava parite za provizija|кој ви ги дава парите за провизија|od kade e provizijata|од каде е провизијата|koj plakja provizija|кој плаќа провизија|kako se naplakjate vie|како се наплаќате вие/i,
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
      if (isRent) {
        if (key === 'commission' || key === 'who_pays') {
          response = 'За издавање, провизијата за агенцијата е 50% од месечната кирија од сопственикот (100% ако киријата е над 1000 евра) и 50% од закупецот. На ден на потпишување, закупецот плаќа прва кирија + депозит + провизија. Минимум 12 месеци. Дали ви е појасно?';
        } else if (key === 'faster_sale') {
          response = 'Агенцијата има голема база на потенцијални клиенти кои се спремни да изнајмат, ако нешто им се допадне. Дали би пробале агенциски третман за вашата недвижност?';
        } else if (key === 'example') {
          response = 'На пример, за кирија од 500 евра, вие добивате 1000 евра од закупецот (прва кирија + депозит). Вие плаќате 250 евра провизија (50%), а закупецот плаќа уште 250 евра. Дали ви помогна примерот?';
        }
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
  return /провизи|provizija|koj vi|кој ви|kako vi|како ви|komisija|комисија|koj plakja|кој плаќа|kolku zimate|колку земате|sto zimate|што земате|dali vi plakjam|дали ви плаќам|uslovi|услови|condition|terms|vasi uslovi|ваши услови|kako rabotite|како работите|sorabotka|соработка|kakva vi e provizijata|каква ви е провизијата|kakvi se uslovite|какви се условите|koi vi se uslovite|кои ви се условите|kakvi se vasi|какви се ваши|nisto ne zemate|ништо не земате|ne zemate|не земате|od mojot del|од мојот дел|vie zemate|вие земате|sto zemate|што земате|dali zimate|дали земате|vie naplakjate|вие наплаќате|kako se naplakjate|како се наплаќате|kako vi e provizijata|како ви е провизијата|znaci nisto|значи ништо|znaci ne|значи не|znaci bez|значи без|kakvi drugi obvrski|какви други обврски|drugi obvrski|други обврски|obvrski kon vas|обврски кон вас|sto treba da vi platam|што треба да ви платам|kolku procenti|колку проценти|kolku %|колку %|kolku e provizijata|колку е провизијата|kolku iznesuva provizijata|колку изнесува провизијата|kolku se naplakjate|колку се наплаќате|kolku e vashata provizija|колку е вашата провизија|kolku zimate|колку земате|kolku vi e provizijata|колку ви е провизијата|kolku vi naplakjate|колку ви наплаќате|kolku procenti zimate|колку проценти земате|kolku dodavate|колку додавате|kolku e vasiot del|колку е вашиот дел|kolku nad cenata|колку над цената|koja vi e provizijata|која ви е провизијата|kolku e vashata naknada|колку е вашата надокнада|kolku procenti vi e|колку проценти ви е|kolku se naplakja|колку се наплаќа|kolku vi se|колку ви се/i.test(text);
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
  return /imat klient|imate klient|имате клиент|klient spremen|клиент спремен|zainteresiran kupuvac|заинтересиран купувач|klienti zainteresirani|клиенти заинтересирани|imate klienti|имате клиенти|klient zainteresiran|клиент заинтересиран|imate gotov klient|имате готов клиент|imate kupuvac|имате купувач|kupuvac spremen|купувач спремен|najdovte klient|најдовте клиент|najdovte kupuvac|најдовте купувач|imavте li klienti|имавте ли клиенти|dali imate klient|дали имате клиент|dali imate kupuvac|дали имате купувач|ima li zainteresirani|има ли заинтересирани|imaте gotov|имате готов/i.test(text);
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
  isAskingAboutClients,
  isAskingWhereToSendPhotos,
  isAskingAboutLegalCosts,
  isAskingAboutAgency
};
