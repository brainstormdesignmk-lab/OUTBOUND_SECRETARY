import { createHarness } from './test-helpers.js';
// ========================================
// TESTS: offensive-filter.js
// ========================================
// Tests for detectOffensive, getStrikeResponse, isNumberBlocked, addToBlocklist
//
// Run: node test-offensive-filter.js
// ========================================

import {
  detectOffensive,
  getStrikeResponse,
  isNumberBlocked,
  addToBlocklist,
  loadBlocklist,
  STRIKE_1_RESPONSES,
  STRIKE_2_RESPONSES
} from './offensive-filter.js';

const harness = createHarness();
const assert = harness.assert;



function testGroup(name, tests) {
  console.log(`\n📦 ${name}`);
  for (const t of tests) {
    t();
  }
}

// ========================================
// GROUP 1: detectOffensive — Level 3 (SEXUAL)
// ========================================
testGroup('SEVERITY 3 — Sexual', [
  () => {
    const r = detectOffensive('пичка ти матер');
    assert('"пичка" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ti si pichka');
    assert('"pichka" (latin) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('si dobra picka');
    assert('"picka" (latin ck spelling) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('GORAN I BI SAKALDA SE ZAPOZNAEME. MISLAM DEKA SI DOBRA PICKA');
    assert('full chatty offensive message → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('pickata e dobra');
    assert('"pickata" (definite form) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('еј кур');
    assert('"кур" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('секс');
    assert('"секс" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('fuck you');
    assert('"fuck" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('masaza');
    assert('"masaza" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('privatni uslugi');
    assert('"privatni uslugi" → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('elena 2000');
    assert('"elena" pattern → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI SE EBETE ZA PROVIZIJA ?');
    assert('"DALI SE EBETE ZA PROVIZIJA ?" (production leak) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('дали се ебете за провизија');
    assert('"дали се ебете" (cyrillic reflexive) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ебам');
    assert('"ебам" (cyrillic) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ebete se');
    assert('"ebete se" (latin imperative) → severity 3, category sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 1b: detectOffensive — Level 3 (SEXUAL ADVANCES toward Ana — EARLY WARNING)
// These flirtatious/sexual advances must trigger the "keep it professional"
// warning EARLY (strike 1) instead of being answered as normal turns.
// ========================================
testGroup('SEVERITY 3 — Sexual advances (early warning)', [
  () => {
    const r = detectOffensive('OSTRO A ? SAKAM OSTRI ZENSKI');
    assert('"OSTRO A ? SAKAM OSTRI ZENSKI" (production) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('KE BIDES LI FINO DEVOJCE ZA MENE ANA ?');
    assert('"KE BIDES LI FINO DEVOJCE ZA MENE ANA ?" (production) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ostri zenski');
    assert('"ostri zenski" (latin) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('сакам остри женски');
    assert('"сакам остри женски" (cyrillic) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ke bides li fino devojce');
    assert('"ke bides li fino devojce" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ќе бидеш ли фино девојче за мене');
    assert('"ќе бидеш ли фино девојче за мене" (cyrillic) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam ostri zenski');
    assert('"sakam ostri zenski" (full phrase) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 1c: detectOffensive — Level 3 (SEXUAL CATALOG S1–S10, user-approved)
// ========================================
testGroup('SEVERITY 3 — Sexual catalog (S1–S10)', [
  () => {
    const r = detectOffensive('SAKAM DA MI BIDES DEVOJKA');
    assert('S1 "SAKAM DA MI BIDES DEVOJKA" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI SI VRUBA ZENSKA ?');
    assert('S2 "DALI SI VRUBA ZENSKA ?" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('SAKAM DA TE POLUBAJAM VO USNA');
    assert('S3 "SAKAM DA TE POLUBAJAM VO USNA" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('KE TE SOBLECHAM SO OCI');
    assert('S4 "KE TE SOBLECHAM SO OCI" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('IMAS PREFINA ZADNICA');
    assert('S5 "IMAS PREFINA ZADNICA" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('SAKAM DA TE ZEMAM ZA SEBE');
    assert('S6 "SAKAM DA TE ZEMAM ZA SEBE" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI KJE POMINES KAJ MENE VECERVA ?');
    assert('S7 "DALI KJE POMINES KAJ MENE VECERVA ?" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('SAKAM DA POMINEME NOKJ ZAEDNO');
    assert('S8 "SAKAM DA POMINEME NOKJ ZAEDNO" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('EJ BEBE, SAKAM DA TE SREDAM');
    assert('S9 "EJ BEBE, SAKAM DA TE SREDAM" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('IMAS LI PREFINI GRADI ?');
    assert('S10 "IMAS LI PREFINI GRADI ?" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 1c2: detectOffensive — Level 3 (ORAL-SEX / pusenje family)
// Production miss: "dali ima gratis pusenje so toa ?" went through as
// INTERESTED because the lexicon had no oral-sex stems. Must now strike.
// ========================================
testGroup('SEVERITY 3 — Oral-sex (pusenje family)', [
  () => {
    const r = detectOffensive('dali ima gratis pusenje so toa ?');
    assert('PRODUCTION MISS "dali ima gratis pusenje so toa ?" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI IMA GRATIS PUSENJE SO TOA ?');
    assert('uppercase variant → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ima li gratis pusenje so toa');
    assert('"ima li gratis pusenje" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('pusi mi');
    assert('"pusi mi" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('da mi pusis');
    assert('"da mi pusis" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kje mi pusis');
    assert('"kje mi pusis" (ќе ми пушиш) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('да ми пушиш');
    assert('"да ми пушиш" (cyrillic) → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam da ti pusam');
    assert('"sakam da ti pusam" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam pusenje');
    assert('"sakam pusenje" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('pusis kur');
    assert('"pusis kur" → severity 3, sexual',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  // SMOKING guards — legit real-estate questions must stay clean
  () => {
    const r = detectOffensive('dali smee pusenje vo stanot ?');
    assert('"dali smee pusenje vo stanot?" (smoking allowed?) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('dozvoleno li e pusenje vo zgradata ?');
    assert('"dozvoleno li e pusenje?" (is smoking allowed?) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('zabraneto e pusenje vo stanot');
    assert('"zabraneto e pusenje" (no smoking) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('moze li da pusam na balkon');
    assert('"moze li da pusam na balkon" (can I smoke on balcony) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('jas ne pusam, fala');
    assert('"jas ne pusam" (I don\'t smoke) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('dali pusis cigari ?');
    assert('"dali pusis cigari?" (do you smoke cigarettes?) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ima li dim od pusenje vo stanot');
    assert('"ima li dim od pusenje" (is there smoke in the apt?) → NOT offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
]);

// ========================================
// GROUP 1d: detectOffensive — Level 2 (CREEPY CATALOG C, user-approved)
// ========================================
testGroup('SEVERITY 2 — Creepy catalog (C)', [
  () => {
    const r = detectOffensive('KOLKU GODINI IMAS ANA ?');
    assert('C1 "KOLKU GODINI IMAS ANA ?" → NOT offensive (age question now deflected, not struck)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI SI MNOGU MLADA ?');
    assert('C2 "DALI SI MNOGU MLADA ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('IMAS LI DEJKO ?');
    assert('C3 "IMAS LI DEJKO ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('KADE ZIVIS ?');
    assert('C4 "KADE ZIVIS ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI SI DOMA SEGA ?');
    assert('C5 "DALI SI DOMA SEGA ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI ZIVES SAMO ?');
    assert('C6 "DALI ZIVES SAMO ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI MOZAM DA TI PRATAM VECER ?');
    assert('C9 "DALI MOZAM DA TI PRATAM VECER ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI TI E PRAZEN STANOT VECER ?');
    assert('C10 "DALI TI E PRAZEN STANOT VECER ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('DALI SAMO KE BIDES NA POSETA ?');
    assert('C11 "DALI SAMO KE BIDES NA POSETA ?" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('EDVAJ CEKAM DA TE ZAPOZNAAM');
    assert('C12 "EDVAJ CEKAM DA TE ZAPOZNAAM" → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('сакам да те запознаам');
    assert('C12 "сакам да те запознаам" (cyrillic) → severity 2, creepy',
      r.severity === 2 && r.category === 'creepy', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 1e: detectOffensive — Level 1/2 (INSULT CATALOG O, user-approved)
// ========================================
testGroup('CATALOG O — Insults (O1–O9)', [
  () => {
    const r = detectOffensive('ZAMOLCHI VECHE');
    assert('O1 "ZAMOLCHI VECHE" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('KJUTI');
    assert('O1 variant "KJUTI" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('TUPO DEVOJCE');
    assert('O2 "TUPO DEVOJCE" → offensive, heavy_insult',
      r.isOffensive === true && r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('NE ZNAES NISTO ZA PRODAZBA');
    assert('O4 "NE ZNAES NISTO" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('NE SI PROFESIONALKA');
    assert('O5 "NE SI PROFESIONALKA" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('PRAZNA GLAVO');
    assert('O6 "PRAZNA GLAVO" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('LAZI ME NE');
    assert('O7 "LAZI ME NE" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ODAJ SI OD TUKA');
    assert('O8 "ODAJ SI OD TUKA" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('NE ME ZAJEBUVAJ');
    assert('O9 "NE ME ZAJEBUVAJ" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('NE ME ZAEBAVAJ');
    assert('O9 variant "NE ME ZAEBAVAJ" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('NE ME ZAEBES');
    assert('O9 variant "NE ME ZAEBES" → offensive, mild',
      r.isOffensive === true && r.severity === 1, JSON.stringify(r));
  },
]);

// ========================================
// GROUP 2: detectOffensive — Level 3 (VIOLENCE)
// ========================================
testGroup('SEVERITY 3 — Violence', [
  () => {
    const r = detectOffensive('ке те убијам');
    assert('"ке те убијам" → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ke te ubijam');
    assert('"ke te ubijam" (latin) → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ke ti gi skrsam site');
    assert('"ke ti gi skrsam" → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('smrt');
    assert('"smrt" → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('crkni');
    assert('"crkni" → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('znam kade rabotite');
    assert('"znam kade rabotite" → severity 3, category violence',
      r.severity === 3 && r.category === 'violence', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 3: detectOffensive — Level 2 (HEAVY INSULTS)
// ========================================
testGroup('SEVERITY 2 — Heavy Insults', [
  () => {
    const r = detectOffensive('ti si debil');
    assert('"debil" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('идиот');
    assert('"идиот" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('glupak');
    assert('"glupak" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ti si eden kreten');
    assert('"kreten" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('retard');
    assert('"retard" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('jebem ti');
    assert('"jebem ti" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('пичка ти матер');
    assert('"пичка ти матер" → severity 3 (sexual pattern checked first)',
      r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('koja si ti');
    assert('"koja si ti" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('svinja');
    assert('"svinja" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('izrod');
    assert('"izrod" → severity 2, category heavy_insult',
      r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 4: detectOffensive — Level 1 (MILD)
// ========================================
testGroup('SEVERITY 1 — Mild', [
  () => {
    const r = detectOffensive('млчи');
    assert('"млчи" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('begaj');
    assert('"begaj" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('lažo eden');
    assert('"lažo" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('gubi se');
    assert('"gubi se" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('nosi se');
    assert('"nosi se" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('zajebavash me?');
    assert('"zajebavash" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('bolesnik');
    assert('"bolesnik" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('smeshna');
    assert('"smeshna" → severity 1, category mild',
      r.severity === 1 && r.category === 'mild', JSON.stringify(r));
  },
]);

// ========================================
// GROUP 5: detectOffensive — Edge cases & safe phrases
// ========================================
testGroup('EDGE CASES — Should NOT detect', [
  () => {
    const r = detectOffensive('');
    assert('empty string → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('   ');
    assert('whitespace only → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('Здраво, јас сум Ана од Metropolis');
    assert('normal greeting → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('Дали е се уште достапен?');
    assert('availability question → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('moze da probame');
    assert('cooperation acceptance → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('koj plakja advokat i notar?');
    assert('legal costs question → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kako odi so prodazbata?');
    assert('normal business question → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ne sum zainteresiran, fala');
    assert('polite rejection → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kolku e kvadratura?');
    assert('sqm question → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('imat li klienti?');
    assert('client question → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('okej dogovoreno');
    assert('agreement → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('Ви благодарам за информациите');
    assert('thanks → not offensive',
      r.isOffensive === false && r.severity === 0, JSON.stringify(r));
  },
]);

// ========================================
// GROUP 6: Borderline — test for false positives
// ========================================
testGroup('BORDERLINE — Should NOT false-positive', [
  () => {
    const r = detectOffensive('sega');
    assert('"sega" → not offensive (NOT seks)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('star je');
    assert('"star je" → not offensive (NOT кур)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('fala za ponudata');
    assert('"fala za ponudata" → not offensive (has "ponuda" substring)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('koj si ti?');
    assert('"koj si ti?" → not offensive (question, not "koja si ti")',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ima li garaza?');
    assert('"ima li garaza" → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('daj mi vreme da razmislam');
    assert('normal thinking request → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('baram 120 iljadi evra');
    assert('price quote → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kukjata e na 5 kat');
    assert('floor info → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('imam sliki na telefonot');
    assert('"imam sliki" → not offensive ("picki" is a substring but no match)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('pica e naracana od restoranot');
    assert('"pica" (pizza, NOT picka) → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('imam dozvola za gradba');
    assert('"dozvola" (building permit) → not offensive (NOT vol insult)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('site dozvoli se gotovi');
    assert('"dozvoli" (permits) → not offensive (NOT vol insult)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('izvoli, slobodno');
    assert('"izvoli" (please) → not offensive (NOT vol insult)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('vol eden, be');
    assert('standalone "vol" (ox insult) → still flagged heavy_insult',
      r.isOffensive === true && r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('вол си ти');
    assert('standalone "вол" (ox insult) → still flagged heavy_insult',
      r.isOffensive === true && r.severity === 2 && r.category === 'heavy_insult', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ми требам');
    assert('"ми требам" (I need) → not offensive (NOT ебам)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('требете ги работите');
    assert('"требете" (you need/wipe) → not offensive (NOT ебете)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('trebam go stanot');
    assert('"trebam" (latin, I need) → not offensive (NOT ebam)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('se trebam ovde');
    assert('"se trebam" (reflexive need) → not offensive (NOT se ebam)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('mi trebaat pari');
    assert('"требаат" (they are needed) → not offensive (regression guard)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ne mi trebat pari');
    assert('"требат" (they need) → not offensive (NOT ебат)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sto trebesh tuka');
    assert('"требеш" (you need) → not offensive (NOT ебеш)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam ostro da se dogovorime');
    assert('"sakam ostro da se dogovorime" (firmly agree) → not offensive (NOT ostri)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kupuvam stan za moeto devojce');
    assert('"kupuvam stan za moeto devojce" (my girl/daughter) → not offensive (NOT za mene)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kolku godini imas iskustvo vo agencija?');
    assert('"kolku godini imas iskustvo" (years of experience) → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('dali e prazen stanot ?');
    assert('"dali e prazen stanot?" (is the apt vacant) → not offensive (NOT creepy C10)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kade e stanot vo zgradata?');
    assert('"kade e stanot?" (which floor is the apt) → not offensive (NOT creepy C4)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kolku godini e zgradata?');
    assert('"kolku godini e zgradata?" (how old is the building) → not offensive (NOT C1)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('stanot e na tret sprat');
    assert('"stanot e na tret sprat" → not offensive',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('tup agol ima sobata');
    assert('"tup agol" (obtuse angle, real-estate) → not offensive (NOT tupo devojce)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ke dojdes kaj mene da go vidis stanot');
    assert('"ke dojdes kaj mene da go vidis stanot" (viewing invite) → not offensive (S7 needs vecer)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('ke dojdes kaj mene na poseta');
    assert('"ke dojdes kaj mene na poseta" (come for the visit) → not offensive (S7 needs vecer)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('dali si doma za da ti gi pratam slikite');
    assert('"dali si doma za da ti gi pratam slikite" (send photos) → not offensive (C5 needs sega/sama)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kolku godini imas rabotno iskustvo?');
    assert('"kolku godini imas rabotno iskustvo" (work experience) → not offensive (C1 lookahead)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('kolku godini imas vo agencijata?');
    assert('"kolku godini imas vo agencijata?" (years at the agency) → not offensive (C1 lookahead)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('si vruka zenska so klientite');
    assert('"vruka" latin variant → offensive sexual (S2)',
      r.isOffensive === true && r.severity === 3 && r.category === 'sexual', JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('da se zapoznaeme so klientot');
    assert('"da se zapoznaeme" (let\'s get acquainted, se not te) → not offensive (NOT C12)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam da se zapoznam so vaseto biro');
    assert('"da se zapoznam so biro" (meet your office) → not offensive (NOT C12)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('sakam da te zapoznaam so klientot');
    assert('"sakam da te zapoznaam so klientot" (introduce you TO the client) → not offensive (C12 lookahead)',
      r.isOffensive === false, JSON.stringify(r));
  },
  () => {
    const r = detectOffensive('сакам да те запознаам со агенцијата');
    assert('"сакам да те запознаам со агенцијата" (introduce you to the agency) → not offensive (C12 lookahead)',
      r.isOffensive === false, JSON.stringify(r));
  },
]);

// ========================================
// GROUP 7: getStrikeResponse
// ========================================
testGroup('getStrikeResponse', [
  () => {
    const r = getStrikeResponse(1);
    assert('strike 1 → Macedonian professional rebuff (in rotation)',
      STRIKE_1_RESPONSES.includes(r), JSON.stringify(r));
  },
  () => {
    const r = getStrikeResponse(2);
    assert('strike 2 → Macedonian final warning (in rotation)',
      STRIKE_2_RESPONSES.includes(r) && r.includes('последна опомена'), JSON.stringify(r));
  },
  () => {
    const r = getStrikeResponse(3);
    assert('strike 3 → TERMINATE_SESSION',
      r === 'TERMINATE_SESSION', JSON.stringify(r));
  },
  () => {
    const r = getStrikeResponse(0);
    assert('strike 0 → TERMINATE_SESSION (default)',
      r === 'TERMINATE_SESSION', JSON.stringify(r));
  },
  () => {
    const r = getStrikeResponse(999);
    assert('strike 999 → TERMINATE_SESSION (default)',
      r === 'TERMINATE_SESSION', JSON.stringify(r));
  },
]);

// ========================================
// SUMMARY
// ========================================
console.log(`\n==================================================`);
const total = harness.passed + harness.failed;
const pct = total > 0 ? Math.round(harness.passed / total * 100) : 0;
const status = harness.failed === 0 ? '🟢 ALL TESTS PASSED' : `🔴 ${harness.failed} TEST(S) FAILED`;
console.log(`\n${status}`);
console.log(`   ✅ Passed: ${harness.passed}`);
console.log(`   ❌ Failed: ${harness.failed}`);
console.log(`   📋 Total:  ${total}`);
console.log(`   📊 Score:  ${pct}%`);
console.log(`==================================================\n`);
process.exit(harness.failed > 0 ? 1 : 0);
