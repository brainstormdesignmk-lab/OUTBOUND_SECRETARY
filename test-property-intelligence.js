// ============================================================
// test-property-intelligence.js — ANA INTELLIGENCE LAYER
// ============================================================
// Offline regression suite for property-intelligence.js + the wiring:
//   1. Selling price calculator — 3 scenarios, 500€ round-UP, garage add,
//      price-warning flag on mismatch (reported requirement)
//   2. Tenant preference extraction — preferred/excluded + exact-statement
//      notes, negation polarity ("NE SAKAM MILENICI И САМОХРАНИ МАЈКИ")
//   3. Broker comment generator — internal note with pricing breakdown
//   4. Public description enrichment — scraped + collected facts
//   5. buildPropertyJson — normalized Hermes payload (available/blocked_until)
//   6. Extraction wiring: pricePerSqm never becomes cleanPrice; the per-sqm
//      question path skips cleanPrice and asks totalSqm instead
//   7. Close-flow pricing: a fully-collected SALE lead gets ownerPrice /
//      sellingPrice / brokerComment / descriptionPublic / hermesPayload
// ============================================================
import {
  calculateSellingPrice,
  roundUpTo500,
  extractTenantPreferences,
  buildBrokerComment,
  buildEnhancedDescription,
  buildPropertyJson,
  tenantCategoryLabel
} from './property-intelligence.js';
import { extractPrice, extractPricePerSqm } from './property-extractor.js';
import { runGlobalExtraction, assessConfidence } from './data-collector.js';
import { runGlobalExtractionPass } from './handlers/data-collection.js';
import { generateResponse } from './service.js';
import { getNextMissingField } from './workflow.js';

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  if (!cond) console.log(`  ❌ ${name} ${detail ? '— ' + detail : ''}`);
}

// Answer sequence for the both-prices warning flow (section 8) — same
// fields as the main flow, minus the price answer (given up front).
const FLOW8_ANSWERS = [
  '74 kvadrati',          // totalSqm
  'nema',                 // terraceSqm
  '2 spalni',             // bedrooms
  '4 kat',                // floor
  '10 katnica',           // totalFloors
  'ima lift',             // elevator
  'gradsko parno',        // heating
  'ima klima',            // ac
  'garaza',               // parking
  'jug',                  // orientation
  'kompletno namesten',   // furnished
  '2020 godina',          // yearBuilt
  'ne',                   // renovated
  'da',                   // documentationClean
  'da imam sliki, ke gi ispratam', // photos
  'Goran Petrov',         // ownerName
  'Dame Gruev 12'         // address
];

// ============================================================
// 1. SELLING PRICE CALCULATOR
// ============================================================
console.log(`\n=== 1. calculateSellingPrice ===`);

// Scenario 1: €/m² given → sqm × pricePerSqm (spec: 74 × 2500 = 185000)
const s1 = calculateSellingPrice({ sqm: 74, pricePerSqm: 2500 });
assert('S1 ownerPrice = 185000', s1.ownerPrice === 185000, `got ${s1.ownerPrice}`);
assert('S1 scenario = per_sqm', s1.scenario === 'per_sqm', `got ${s1.scenario}`);
assert('S1 no warning', s1.priceWarning === false, '');

// Scenario 2: total given → used directly (+2% → 204000)
const s2 = calculateSellingPrice({ totalPrice: 200000 });
assert('S2 ownerPrice = 200000', s2.ownerPrice === 200000, `got ${s2.ownerPrice}`);
assert('S2 sellingPrice = 204000', s2.sellingPrice === 204000, `got ${s2.sellingPrice}`);

// Garage added on top (spec: 185000 + 15000 = 200000 → 204000)
const sg = calculateSellingPrice({ sqm: 74, pricePerSqm: 2500, garagePrice: 15000 });
assert('S+garage ownerPrice = 200000', sg.ownerPrice === 200000, `got ${sg.ownerPrice}`);
assert('S+garage sellingPrice = 204000', sg.sellingPrice === 204000, `got ${sg.sellingPrice}`);

// Scenario 3: both given, mismatch → price_warning
const s3 = calculateSellingPrice({ sqm: 74, pricePerSqm: 2500, totalPrice: 160000 });
assert('S3 warning=true on mismatch', s3.priceWarning === true, `got ${s3.priceWarning}`);
assert('S3 scenario = both', s3.scenario === 'both', `got ${s3.scenario}`);

// Both given, consistent (within tolerance) → NO warning
const s3ok = calculateSellingPrice({ sqm: 74, pricePerSqm: 2500, totalPrice: 185500 });
assert('S3 consistent → no warning', s3ok.priceWarning === false, `got ${s3ok.priceWarning}`);

// Round-UP to 500 (spec): 126001 → 126500, 126320 → 126500, 126499 → 126500,
// 126500 → 126500, 126501 → 127000 — the FINAL-price rounding the calculator
// applies on top of owner + commission.
assert('round 126320 → 126500', roundUpTo500(126320) === 126500, `got ${roundUpTo500(126320)}`);
assert('round 126501 → 127000', roundUpTo500(126501) === 127000, `got ${roundUpTo500(126501)}`);
assert('round 126001 → 126500', roundUpTo500(126001) === 126500, `got ${roundUpTo500(126001)}`);
assert('round 126499 → 126500', roundUpTo500(126499) === 126500, `got ${roundUpTo500(126499)}`);
assert('round exact 126500 → 126500', roundUpTo500(126500) === 126500, `got ${roundUpTo500(126500)}`);

// No input → null
assert('no price input → null', calculateSellingPrice({}) === null, '');
assert('only sqm (no price) → null', calculateSellingPrice({ sqm: 74 }) === null, '');

// ============================================================
// 2. TENANT PREFERENCE EXTRACTION
// ============================================================
console.log(`\n=== 2. extractTenantPreferences ===`);

const tp1 = extractTenantPreferences('NE SAKAM MILENICI I SAMOHRANI MAJKI');
assert('TP1 excluded=[pets, single_parents]', JSON.stringify(tp1?.excluded) === JSON.stringify(['single_parents', 'pets']),
  `got ${JSON.stringify(tp1?.excluded)}`);
assert('TP1 preferred empty', tp1?.preferred.length === 0, '');
assert('TP1 notes preserves statement', /NE SAKAM MILENICI I SAMOHRANI MAJKI/.test(tp1?.notes || ''), '');

const tp2 = extractTenantPreferences('PREFEERIRAM SEMEJSTVA I VRABOTENI');
assert('TP2 preferred=[families, employed]', JSON.stringify(tp2?.preferred) === JSON.stringify(['families', 'employed']),
  `got ${JSON.stringify(tp2?.preferred)}`);
assert('TP2 excluded empty', tp2?.excluded.length === 0, '');

const tp3 = extractTenantPreferences('BEZ MILENICI');
assert('TP3 excluded=[pets]', JSON.stringify(tp3?.excluded) === JSON.stringify(['pets']), `got ${JSON.stringify(tp3?.excluded)}`);

const tp4 = extractTenantPreferences('STUDENTI SE OK');
assert('TP4 preferred=[students]', JSON.stringify(tp4?.preferred) === JSON.stringify(['students']), `got ${JSON.stringify(tp4?.preferred)}`);

const tp5 = extractTenantPreferences('semejstva se ok');
assert('TP5 preferred=[families]', JSON.stringify(tp5?.preferred) === JSON.stringify(['families']), '');

const tp6 = extractTenantPreferences('ne sakam stranci');
assert('TP6 excluded=[foreigners]', JSON.stringify(tp6?.excluded) === JSON.stringify(['foreigners']), `got ${JSON.stringify(tp6?.excluded)}`);

const tp7 = extractTenantPreferences('GO IZDADOV NA PENZIONERI');
assert('TP7 preferred=[pensioners]', JSON.stringify(tp7?.preferred) === JSON.stringify(['pensioners']), `got ${JSON.stringify(tp7?.preferred)}`);

// Mixed clause: "BEZ MILENICI, AMA SEMEJSTVA SE OK" — second clause prefers
// families (the polarity scans the text BEFORE each category, so families'
// `before` includes the earlier negation — acceptable approximation: the
// notes preserve the exact statement for the agent to interpret).
assert('TP8 no crash on mixed clause', !!extractTenantPreferences('BEZ MILENICI, AMA SEMEJSTVA SE OK'), '');

// No category → null
assert('TP9 unrelated → null', extractTenantPreferences('go izdadov veke') === null, '');
assert('TP10 empty → null', extractTenantPreferences('') === null, '');

// Cyrillic-only phrasings
const tpCy = extractTenantPreferences('НЕ САКАМ МИЛЕНИЦИ');
assert('TP11 Cyrillic negation', JSON.stringify(tpCy?.excluded) === JSON.stringify(['pets']), `got ${JSON.stringify(tpCy?.excluded)}`);

// STRONG-NEGATOR PETS (reported, lead 3571074): the owner's no-pets answer
// "nikako milenici" (никако = absolutely not) was NOT caught — the category
// precedes the negator, so the before-slice was empty and pets fell through
// to PREFERRED. Both word orders must register the pets exclusion.
const tpCy2 = extractTenantPreferences('MILENICI NIKAKO');
assert('TP11b "MILENICI NIKAKO" → excluded=[pets] (negator after category)',
  JSON.stringify(tpCy2?.excluded) === JSON.stringify(['pets']),
  `got ${JSON.stringify(tpCy2)}`);
assert('TP11b preferred empty', (tpCy2?.preferred || []).length === 0, '');
const tpCy3 = extractTenantPreferences('nikako milenici, se mi e novo');
assert('TP11c "nikako milenici, se mi e novo" → excluded=[pets] (negator before category)',
  JSON.stringify(tpCy3?.excluded) === JSON.stringify(['pets']),
  `got ${JSON.stringify(tpCy3)}`);
// GUARD: the after-category negator is scoped to STRONG "nikako" only — a
// softer/distant tail must never flip a category the owner accepts.
const tpCy4 = extractTenantPreferences('semejstva ne sakam deca');
assert('TP11d "semejstva ne sakam deca" → families still preferred (distant ne not applied)',
  (tpCy4?.preferred || []).includes('families') && !(tpCy4?.excluded || []).includes('families'),
  `got ${JSON.stringify(tpCy4)}`);

assert('label pets → миленици', tenantCategoryLabel('pets') === 'миленици', '');

// ============================================================
// 2b. EXTENDED CATEGORIES (reported): children / elders / gender
// restrictions + the "samo za" restrictive marker + bare "ne" negation
// ============================================================

// "NE DOZVOLUVAM DECA" — the reported exact phrasing (no children)
const tp12 = extractTenantPreferences('NE DOZVOLUVAM DECA');
assert('TP12 excluded=[children]', JSON.stringify(tp12?.excluded) === JSON.stringify(['children']), `got ${JSON.stringify(tp12?.excluded)}`);
assert('TP12 preferred empty', tp12?.preferred.length === 0, '');

// "samo za vraboteni" — restrictive-positive marker → preferred (the reported
// "only for employed" phrasing; previously fell through to bare-answer too,
// now explicitly preferred)
const tp13 = extractTenantPreferences('samo za vraboteni');
assert('TP13 preferred=[employed]', JSON.stringify(tp13?.preferred) === JSON.stringify(['employed']), `got ${JSON.stringify(tp13?.preferred)}`);
assert('TP13 excluded empty', tp13?.excluded.length === 0, '');

// Bare "ne" negation: "ne starci", "ne deca" (reported age restrictions)
const tp14 = extractTenantPreferences('ne starci');
assert('TP14 excluded=[elders]', JSON.stringify(tp14?.excluded) === JSON.stringify(['elders']), `got ${JSON.stringify(tp14?.excluded)}`);
const tp15 = extractTenantPreferences('ne deca');
assert('TP15 excluded=[children]', JSON.stringify(tp15?.excluded) === JSON.stringify(['children']), `got ${JSON.stringify(tp15?.excluded)}`);

// Gender restrictions: "samo za zeni" → preferred women; "ne mazi" → excluded men
const tp16 = extractTenantPreferences('samo za zeni');
assert('TP16 preferred=[women]', JSON.stringify(tp16?.preferred) === JSON.stringify(['women']), `got ${JSON.stringify(tp16?.preferred)}`);
const tp17 = extractTenantPreferences('ne mazi');
assert('TP17 excluded=[men]', JSON.stringify(tp17?.excluded) === JSON.stringify(['men']), `got ${JSON.stringify(tp17?.excluded)}`);

// Combined: "NE SAKAM DECA I STARCI" → both excluded
const tp18 = extractTenantPreferences('NE SAKAM DECA I STARCI');
assert('TP18 excluded=[children, elders]', JSON.stringify(tp18?.excluded) === JSON.stringify(['children', 'elders']), `got ${JSON.stringify(tp18?.excluded)}`);

// Cyrillic extended phrasings
const tp19 = extractTenantPreferences('не дозволувам деца');
assert('TP19 Cyrillic excluded=[children]', JSON.stringify(tp19?.excluded) === JSON.stringify(['children']), `got ${JSON.stringify(tp19?.excluded)}`);
const tp20 = extractTenantPreferences('само за вработени');
assert('TP20 Cyrillic preferred=[employed]', JSON.stringify(tp20?.preferred) === JSON.stringify(['employed']), `got ${JSON.stringify(tp20?.preferred)}`);
const tp21 = extractTenantPreferences('не старци');
assert('TP21 Cyrillic excluded=[elders]', JSON.stringify(tp21?.excluded) === JSON.stringify(['elders']), `got ${JSON.stringify(tp21?.excluded)}`);
const tp22 = extractTenantPreferences('само жени');
assert('TP22 Cyrillic preferred=[women]', JSON.stringify(tp22?.preferred) === JSON.stringify(['women']), `got ${JSON.stringify(tp22?.preferred)}`);

// FALSE-POSITIVE GUARDS — the adjective "stari" (old) must NOT fire elders:
// "ne sakam stari stanovi" is about OLD APARTMENTS, not old people.
assert('TP23 "ne sakam stari stanovi" → null (no elders from the adjective)', extractTenantPreferences('ne sakam stari stanovi') === null, `got ${JSON.stringify(extractTenantPreferences('ne sakam stari stanovi'))}`);
// A property-fact message with a category word but no tenant context still
// extracts (the notes preserve the statement) — but "kolku e cenata?" must stay null.
assert('TP24 price question → null', extractTenantPreferences('kolku e cenata?') === null, '');

const tp25 = extractTenantPreferences('ne sum siguren za deca');
assert('TP25 uncertainty — no fabricated exclusion', (tp25?.excluded || []).includes('children') !== true,
  `got ${JSON.stringify(tp25?.excluded)}`);
assert('TP25 uncertainty — not preferred either', (tp25?.preferred || []).includes('children') !== true,
  `got ${JSON.stringify(tp25?.preferred)}`);
assert('TP25 notes still preserves the statement', /ne sum siguren za deca/.test(tp25?.notes || ''), '');

const tp26 = extractTenantPreferences('ne znam za starci');
assert('TP26 ne znam — no fabricated exclusion', (tp26?.excluded || []).includes('elders') !== true,
  `got ${JSON.stringify(tp26?.excluded)}`);

const tp27 = extractTenantPreferences('ne sakam deca, i starci');
assert('TP27 same-polarity comma+i list — both excluded',
  JSON.stringify(tp27?.excluded) === JSON.stringify(['children', 'elders']),
  `got ${JSON.stringify(tp27)}`);
assert('TP27 same-polarity list — nothing preferred', (tp27?.preferred || []).length === 0, '');

const tp28 = extractTenantPreferences('ne deca, ne starci');
assert('TP28 bare-ne repeated across comma clauses — both excluded',
  JSON.stringify(tp28?.excluded) === JSON.stringify(['children', 'elders']),
  `got ${JSON.stringify(tp28)}`);

const tp29 = extractTenantPreferences('ne znam, deca se ok');
assert('TP29 uncertainty in prior clause does not leak — deca preferred',
  JSON.stringify(tp29?.preferred) === JSON.stringify(['children']),
  `got ${JSON.stringify(tp29)}`);

// ETHNICITY / NATIONALITY CATEGORIES (reported): "NE SAKAM TURCI I ALBANCI"
// must register both exclusions, "samo semejstva makedonski" must register
// families + macedonians, and "ne muslimani" the muslims exclusion.
const tp30 = extractTenantPreferences('ne sakam turci i albanci');
assert('TP30 excluded=[turks, albanians]',
  JSON.stringify(tp30?.excluded) === JSON.stringify(['turks', 'albanians']),
  `got ${JSON.stringify(tp30)}`);
assert('TP30 nothing preferred', (tp30?.preferred || []).length === 0, '');

const tp31 = extractTenantPreferences('ne sakam turci, i albanci');
assert('TP31 comma+i nationality list stays one clause — both excluded',
  JSON.stringify(tp31?.excluded) === JSON.stringify(['turks', 'albanians']),
  `got ${JSON.stringify(tp31)}`);

const tp32 = extractTenantPreferences('samo semejstva makedonski');
assert('TP32 preferred=[families, macedonians]',
  JSON.stringify(tp32?.preferred) === JSON.stringify(['families', 'macedonians']),
  `got ${JSON.stringify(tp32)}`);

const tp33 = extractTenantPreferences('ne muslimani');
assert('TP33 excluded=[muslims]', JSON.stringify(tp33?.excluded) === JSON.stringify(['muslims']),
  `got ${JSON.stringify(tp33)}`);

const tp34 = extractTenantPreferences('NE SAKAM TURSKI I MUSLIMANI');
assert('TP34 Cyrillic adjective form — excluded=[turks, muslims]',
  JSON.stringify(tp34?.excluded) === JSON.stringify(['turks', 'muslims']),
  `got ${JSON.stringify(tp34)}`);

const tp35 = extractTenantPreferences('stanot e na Makedonski bulevar 12');
assert('TP35 street name — adjective gated, no fabricated macedonians',
  (tp35?.preferred || []).includes('macedonians') !== true &&
  (tp35?.excluded || []).includes('macedonians') !== true,
  `got ${JSON.stringify(tp35)}`);

const tp36 = extractTenantPreferences('ul. Albanska 5, do mostot');
assert('TP36 street name — adjective gated, no fabricated albanians',
  (tp36?.preferred || []).includes('albanians') !== true &&
  (tp36?.excluded || []).includes('albanians') !== true,
  `got ${JSON.stringify(tp36)}`);

const tp37 = extractTenantPreferences('ne sakam muslimki');
assert('TP37 female form — excluded=[muslims]',
  JSON.stringify(tp37?.excluded) === JSON.stringify(['muslims']),
  `got ${JSON.stringify(tp37)}`);

// New labels map to Macedonian for the broker comment
assert('label children → деца', tenantCategoryLabel('children') === 'деца', '');
assert('label elders → старци', tenantCategoryLabel('elders') === 'старци', '');
assert('label women → жени', tenantCategoryLabel('women') === 'жени', '');
assert('label men → мажи', tenantCategoryLabel('men') === 'мажи', '');
assert('label turks → турци', tenantCategoryLabel('turks') === 'турци', '');
assert('label albanians → албанци', tenantCategoryLabel('albanians') === 'албанци', '');
assert('label muslims → муслимани', tenantCategoryLabel('muslims') === 'муслимани', '');
assert('label macedonians → македонци', tenantCategoryLabel('macedonians') === 'македонци', '');

// TRAILING BARE "ne" (reported, lead 3571074 quickfire batch): "TURCI NE",
// "MILENICI NE" — the category PRECEDES a bare "ne" (no verb). The
// before-slice is empty so the old code missed it (and would even have
// pushed the category to PREFERRED).
const tpNe1 = extractTenantPreferences('turci ne');
assert('TP-NE1 "turci ne" → excluded=[turks]',
  JSON.stringify(tpNe1?.excluded) === JSON.stringify(['turks']),
  `got ${JSON.stringify(tpNe1)}`);
const tpNe2 = extractTenantPreferences('milenici ne');
assert('TP-NE2 "milenici ne" → excluded=[pets]',
  JSON.stringify(tpNe2?.excluded) === JSON.stringify(['pets']),
  `got ${JSON.stringify(tpNe2)}`);
const tpNe3 = extractTenantPreferences('ТУРЦИ НЕ');
assert('TP-NE3 Cyrillic "ТУРЦИ НЕ" → excluded=[turks]',
  JSON.stringify(tpNe3?.excluded) === JSON.stringify(['turks']),
  `got ${JSON.stringify(tpNe3)}`);
const tpNe4 = extractTenantPreferences('albanci ne, semejstva se ok');
assert('TP-NE4 "albanci ne, semejstva se ok" → albanci excluded (ama-less comma clause final ne)',
  JSON.stringify(tpNe4?.excluded) === JSON.stringify(['albanians']) &&
  JSON.stringify(tpNe4?.preferred) === JSON.stringify(['families']),
  `got ${JSON.stringify(tpNe4)}`);
// GUARD: "semejstva ne sakam deca" — the "ne" after semejstva is NOT
// clause-final (it belongs to the NEXT category's verb "ne sakam deca"), so
// semejstva must NOT flip to excluded; deca stays excluded as before.
const tpNe5 = extractTenantPreferences('semejstva ne sakam deca');
assert('TP-NE5 "semejstva ne sakam deca" → semejstva NOT excluded, deca excluded',
  !(tpNe5?.excluded || []).includes('families') &&
  JSON.stringify(tpNe5?.excluded) === JSON.stringify(['children']),
  `got ${JSON.stringify(tpNe5)}`);

// E2E through generateResponse: the tenant answer must be CAPTURED, not
// swallowed by the agency handler (which matches the bare word "vraboteni"
// = employees — reported shadowing: "samo za vraboteni" got the Metropolis
// pitch and the profile was never stored).
{
  const s = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent' },
    messages: [{ role: 'model', text: 'Каков тип на станари преферирате?' }],
    phone: '+38976000009'
  };
  const res = await generateResponse(s, 'NE DOZVOLUVAM DECA, SAMO ZA VRABOTENI');
  assert('E2E-1: tenant answer captured through generateResponse',
    s.collectedData.tenantPreferences &&
    JSON.stringify(s.collectedData.tenantPreferences.excluded) === JSON.stringify(['children']) &&
    JSON.stringify(s.collectedData.tenantPreferences.preferred) === JSON.stringify(['employed']),
    `got ${JSON.stringify(s.collectedData.tenantPreferences)}`);
  assert('E2E-2: NOT the Metropolis agency pitch', !/Metropolis/.test(res.text || ''), `got "${(res.text || '').slice(0, 60)}"`);
}

// AGENCY GUARD: a genuine agency-employee question outside tenant context
// still gets the agency answer (the guard must not over-block).
{
  const s2 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: false, transactionType: 'rent' },
    messages: [{ role: 'model', text: 'Здраво, јас сум Ана од Metropolis. Дали е се уште достапен станот?' }],
    phone: '+38976000009'
  };
  const res2 = await generateResponse(s2, 'kolku vraboteni imate?');
  assert('E2E-3: "kolku vraboteni imate?" still → agency answer',
    res2.type === 'NORMAL' && /Metropolis/.test(res2.text || ''),
    `got [${res2.type}] "${(res2.text || '').slice(0, 60)}"`);
  assert('E2E-4: no tenant preferences captured for the agency question',
    !s2.collectedData.tenantPreferences,
    `got ${JSON.stringify(s2.collectedData.tenantPreferences)}`);
}

// VARIANT ROTATION (reported requirement: "couple of variations of the type
// of clients preferred"): the tenant question must rotate through ALL
// TENANT_PREF_QUESTIONS variants on re-asks — NOT be shadowed by the fixed
// confirmatory phrasing ("Само да потврдам...") and NOT be skipped after 2
// attempts. The field is exempt from both gates; one ask per variant.
{
  const s3 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', monthlyRent: 350, availableFrom: '2026-07-01' },
    messages: [{ role: 'model', text: 'Одлично. Каков тип на станари преферирате?' }],
    phone: '+38976000009'
  };
  const variantTexts = [
    'Каков тип на станари преферирате?',
    'Дали имате преференци за профилот на закупците?',
    'На какви лица би сакале да се издаде станот?',
    'Дали постојат категории на станари што ги преферирате или не ги преферирате?'
  ];
  // Four non-answers (no tenant category word) → four different variants.
  for (let i = 0; i < variantTexts.length; i++) {
    const r3 = await generateResponse(s3, 'KAKO KJE BIDE');
    assert(`ROT-${i + 1}: attempt ${i + 1} asks variant ${i} ("${variantTexts[i]}")`,
      r3.type === 'QUESTION' && r3.nextField === 'tenantPreferences' && (r3.text || '').includes(variantTexts[i]),
      `got [${r3.type}] next=${r3.nextField} "${(r3.text || '').slice(0, 90)}"`);
  }
  // Fifth non-answer → max attempts (variant count) reached → field skipped,
  // flow advances to the next field (petsAllowed — the dedicated pets
  // question that sits right after the tenant question) — no infinite loop.
  const r3skip = await generateResponse(s3, 'KAKO KJE BIDE');
  assert('ROT-5: after 4 non-answers the field is skipped (moves on to petsAllowed, no loop)',
    r3skip.type === 'QUESTION' && r3skip.nextField === 'petsAllowed',
    `got [${r3skip.type}] next=${r3skip.nextField} "${(r3skip.text || '').slice(0, 90)}"`);
  assert('ROT-6: skipped marker set after max attempts', s3.collectedData.tenantPreferencesSkipped === true,
    `got ${JSON.stringify(s3.collectedData.tenantPreferencesSkipped)}`);
}

// AVAILABLE-FROM ROTATION (reported requirement: same rotation treatment as
// the tenant question): re-asks of "Од кога ќе биде слободен?" must rotate
// through AVAILABLE_FROM_QUESTIONS variants — NOT be shadowed by the fixed
// confirmatory phrasing and NOT be skipped after 2 attempts.
{
  const s4 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: { cooperationAccepted: true, transactionType: 'rent', monthlyRent: 350 },
    messages: [{ role: 'model', text: 'Добро. Од кога ќе биде слободен станот?' }],
    phone: '+38976000010'
  };
  const dateVariantTexts = [
    'Од кога ќе биде слободен',
    'Од кој датум ќе биде слободен',
    'Кога точно ќе биде слободен',
    'Од кога ќе може да се издаде'
  ];
  for (let i = 0; i < dateVariantTexts.length; i++) {
    const r4 = await generateResponse(s4, 'NE ZNAM USTE');
    assert(`DATE-ROT-${i + 1}: attempt ${i + 1} asks date variant ${i} ("${dateVariantTexts[i]}")`,
      r4.type === 'QUESTION' && r4.nextField === 'availableFrom' && (r4.text || '').includes(dateVariantTexts[i]),
      `got [${r4.type}] next=${r4.nextField} "${(r4.text || '').slice(0, 90)}"`);
  }
  // Fifth non-answer → max attempts (variant count) reached → field skipped,
  // flow advances to the next field (tenantPreferences) — no infinite loop.
  const r4skip = await generateResponse(s4, 'NE ZNAM USTE');
  assert('DATE-ROT-5: after 4 non-answers the date field is skipped (moves on, no loop)',
    r4skip.type === 'QUESTION' && r4skip.nextField === 'tenantPreferences',
    `got [${r4skip.type}] next=${r4skip.nextField} "${(r4skip.text || '').slice(0, 90)}"`);
  assert('DATE-ROT-6: skipped marker set after max date attempts', s4.collectedData.availableFromSkipped === true,
    `got ${JSON.stringify(s4.collectedData.availableFromSkipped)}`);
}

// ============================================================
// 3. BROKER COMMENT
// ============================================================
console.log(`\n=== 3. buildBrokerComment ===`);

const bc = buildBrokerComment({
  transactionType: 'sale',
  pricePerSqm: 2500,
  totalSqm: 74,
  ownerPrice: 200000,
  garagePrice: 15000,
  sellingPrice: 204000,
  agencyPercent: 2,
  tenantPreferences: { preferred: ['families'], excluded: ['pets'], notes: 'Сопственикот изјави: BEZ MILENICI' }
});
assert('BC has Сопственик бара', bc.includes('Сопственик бара'), '');
assert('BC has 2500€/м²', bc.includes('2500€/м²'), '');
assert('BC has Цена стан', bc.includes('Цена стан'), '');
assert('BC has Гаража', bc.includes('Гаража'), '');
assert('BC has Агенциска провизија', bc.includes('Агенциска провизија'), '');
assert('BC has Продажна цена', bc.includes('Продажна цена'), '');
assert('BC has Преферирани клиенти', bc.includes('Преферирани клиенти'), '');
assert('BC has Не прифаќа', bc.includes('Не прифаќа'), '');

// PRICE-WARNING in broker comment (reported): owner gave BOTH €/m² and a
// total that disagree — the INTERNAL note must carry the ⚠ flag for agents.
const bcNoWarning = buildBrokerComment({ transactionType: 'sale', pricePerSqm: 2500, totalSqm: 74, cleanPrice: 185000, ownerPrice: 185000, sellingPrice: 188700, priceWarning: false });
assert('BC no ⚠ when priceWarning=false', !bcNoWarning.includes('ЦЕНА НЕСОГЛАСНОСТ'), bcNoWarning);
const bcWarning = buildBrokerComment({ transactionType: 'sale', pricePerSqm: 2500, totalSqm: 74, cleanPrice: 160000, ownerPrice: 160000, sellingPrice: 163500, priceWarning: true });
assert('BC ⚠ ЦЕНА НЕСОГЛАСНОСТ present', bcWarning.includes('ЦЕНА НЕСОГЛАСНОСТ'), bcWarning);
assert('BC ⚠ shows both numbers', bcWarning.includes('2.500€/м² × 74м² = 185.000€') && bcWarning.includes('160.000€'), bcWarning);
assert('BC ⚠ says verify with owner', bcWarning.includes('Да се потврди точната цена'), bcWarning);

const bcRent = buildBrokerComment({ transactionType: 'rent', monthlyRent: 500 });
assert('BC rent has Месечна кирија', bcRent.includes('Месечна кирија'), '');
assert('BC rent has 50% комисија', bcRent.includes('50% од една кирија'), '');

// ============================================================
// 4. PUBLIC DESCRIPTION
// ============================================================
console.log(`\n=== 4. buildEnhancedDescription ===`);

const ed = buildEnhancedDescription(
  {
    transactionType: 'sale',
    propertyType: 'apartment',
    totalSqm: 74,
    bedrooms: 2,
    floor: 1,
    heating: 'district',
    elevator: true,
    parking: true,
    parkingType: 'garage',
    orientation: 'jug',
    yearBuilt: 2025,
    documentationClean: true
  },
  'Се продава нов стан на прв спрат во Дебар Маало'
);
assert('ED keeps scraped text', ed.includes('Се продава нов стан на прв спрат во Дебар Маало'), '');
assert('ED adds sqm fact', ed.includes('74 м²'), '');
assert('ED adds orientation', ed.includes('jug ориентација'), '');
assert('ED adds heating', ed.includes('централно греење'), '');
assert('ED adds garage', ed.includes('гаражно место'), '');
assert('ED adds year', ed.includes('градба 2025'), '');

// ============================================================
// 5. buildPropertyJson
// ============================================================
console.log(`\n=== 5. buildPropertyJson ===`);

const pj = buildPropertyJson({
  transactionType: 'sale',
  totalSqm: 74,
  floor: 1,
  heatingType: 'district',
  elevator: true,
  parkingType: 'garage',
  parkingPrice: 15000,
  pricePerSqm: 2500,
  ownerPrice: 200000,
  agencyPercent: 2,
  sellingPrice: 204000,
  descriptionPublic: 'опис',
  brokerComment: 'коментар',
  tenantPreferences: { preferred: ['families'], excluded: ['pets'], notes: 'белешка' }
}, { sourcePortal: 'reklama5', adUrl: 'https://x' }, '+38970111111', 101);
assert('PJ listing_type=sale', pj.listing_type === 'sale', `got ${pj.listing_type}`);
assert('PJ available=true (no blocked date)', pj.available === true, '');
assert('PJ blocked_until=null', pj.blocked_until === null, '');
assert('PJ sqm=74', pj.sqm === 74, '');
assert('PJ garage=true', pj.garage === true, '');
assert('PJ garage_price=15000', pj.garage_price === 15000, '');
assert('PJ owner_price_per_sqm=2500', pj.owner_price_per_sqm === 2500, '');
assert('PJ owner_price=200000', pj.owner_price === 200000, '');
assert('PJ selling_price=204000', pj.selling_price === 204000, '');
assert('PJ price_warning=false (no conflict)', pj.price_warning === false, `got ${pj.price_warning}`);
assert('PJ monthly_rent=null for sale', pj.monthly_rent === null, `got ${pj.monthly_rent}`);
// PRICE-WARNING in payload (spec: { price_warning: true }) — owner gave
// BOTH €/m² and a total that disagree → agents see the flag in Hermes.
const pjWarn = buildPropertyJson({ transactionType: 'sale', totalSqm: 74, pricePerSqm: 2500, cleanPrice: 160000, priceWarning: true });
assert('PJ price_warning=true on conflict', pjWarn.price_warning === true, `got ${pjWarn.price_warning}`);
assert('PJ tenant_preferences kept', pj.tenant_preferences?.preferred[0] === 'families', '');
assert('PJ broker_comment passthrough', pj.broker_comment === 'коментар', '');
assert('PJ source_portal', pj.source_portal === 'reklama5', '');

// Future date → hidden until that date (reported requirement)
const pjBlocked = buildPropertyJson({ transactionType: 'rent', monthlyRent: 500, availableFrom: '2026-01-01' });
assert('PJ blocked: available=false', pjBlocked.available === false, '');
assert('PJ blocked: blocked_until=2026-01-01', pjBlocked.blocked_until === '2026-01-01', `got ${pjBlocked.blocked_until}`);
assert('PJ rent monthly_rent=500 (not lost to broker_comment only)', pjBlocked.monthly_rent === 500, `got ${pjBlocked.monthly_rent}`);
const pjImmediate = buildPropertyJson({ transactionType: 'rent', monthlyRent: 500, availableFrom: 'immediate' });
assert('PJ immediate → available=true', pjImmediate.available === true, '');
assert('PJ immediate → blocked_until=null', pjImmediate.blocked_until === null, '');
assert('PJ immediate rent monthly_rent=500', pjImmediate.monthly_rent === 500, `got ${pjImmediate.monthly_rent}`);

// ============================================================
// 6. EXTRACTION WIRING — pricePerSqm vs cleanPrice
// ============================================================
console.log(`\n=== 6. extraction wiring ===`);

// extractPricePerSqm parses per-m² phrasings
assert('EPS "2000 e za m2" → 2000', extractPricePerSqm('2000 e za m2') === 2000, `got ${extractPricePerSqm('2000 e za m2')}`);
assert('EPS "2000 evra za m2" → 2000', extractPricePerSqm('2000 evra za m2') === 2000, `got ${extractPricePerSqm('2000 evra za m2')}`);
assert('EPS "2500 е м2" → 2500', extractPricePerSqm('2500 е м2') === 2500, `got ${extractPricePerSqm('2500 е м2')}`);
assert('EPS "74 m2" → null (a sqm answer)', extractPricePerSqm('74 m2') === null, `got ${extractPricePerSqm('74 m2')}`);
assert('EPS "350 evra" → null (total price)', extractPricePerSqm('350 evra') === null, `got ${extractPricePerSqm('350 evra')}`);
assert('EPS "3 m2" → null (terrace)', extractPricePerSqm('terasa od 3 m2') === null, `got ${extractPricePerSqm('terasa od 3 m2')}`);
// REPORTED (lead 75889 Плац): "4000 m2" answering the totalSqm question on
// a 4000 m² plot was crowned as pricePerSqm=4000 — a bare "N m2" has no
// currency/copula marker and is a square-meter answer, never a €/m² quote.
assert('EPS "4000 m2" → null (REPORTED — a sqm answer, not €/m²)', extractPricePerSqm('4000 m2') === null, `got ${extractPricePerSqm('4000 m2')}`);
assert('EPS "3000 m2" → null (REPORTED family — land sqm)', extractPricePerSqm('3000 m2') === null, `got ${extractPricePerSqm('3000 m2')}`);
// Per-m² phrasings WITHOUT a currency word still read as price (the
// preposition "za"/"на" itself marks the per-square intent).
assert('EPS "2000 za m2" → 2000 (preposition-only per-m²)', extractPricePerSqm('2000 za m2') === 2000, `got ${extractPricePerSqm('2000 za m2')}`);

// Global extraction: per-sqm phrase → pricePerSqm ONLY (never cleanPrice)
const saleData = { transactionType: 'sale' };
const ups1 = runGlobalExtraction('2000 e za m2', saleData, 'cleanPrice');
assert('GE per-sqm → pricePerSqm=2000', ups1.pricePerSqm === 2000, `got ${JSON.stringify(ups1)}`);
assert('GE per-sqm → cleanPrice ABSENT (guard)', ups1.cleanPrice === undefined, `got cleanPrice=${ups1.cleanPrice}`);

// Global extraction: total price still works
const ups2 = runGlobalExtraction('200000 evra', { transactionType: 'sale' }, 'cleanPrice');
assert('GE total → cleanPrice=200000', ups2.cleanPrice === 200000, `got ${JSON.stringify(ups2)}`);

// Mixed: per-sqm + total ("2000 e za m2, vkupno 185000") → cleanPrice extracted
const ups3 = runGlobalExtraction('2000 e za m2, vkupno 185000 evra', { transactionType: 'sale' }, 'cleanPrice');
assert('GE mixed → cleanPrice=185000', ups3.cleanPrice === 185000, `got ${JSON.stringify(ups3)}`);
assert('GE mixed → pricePerSqm=2000', ups3.pricePerSqm === 2000, `got ${JSON.stringify(ups3)}`);

// Code-review guard: a square-meter total must NEVER become a price
const ups4 = runGlobalExtraction('vkupno 2000 m2', { transactionType: 'sale' }, 'cleanPrice');
assert('GE sqm-total → cleanPrice ABSENT ("вкупно 2000 м2" is sqm, not price)', ups4.cleanPrice === undefined, `got ${JSON.stringify(ups4)}`);
const ups5 = runGlobalExtraction('vкупno 3000 kvadrati, 5 kat', { transactionType: 'sale' }, 'cleanPrice');
assert('GE sqm-word-total → cleanPrice ABSENT', ups5.cleanPrice === undefined, `got ${JSON.stringify(ups5)}`);
// But a currency-bound small total still extracts ("вкупно 300 евра")
const ups6 = runGlobalExtraction('vкупno 300 evra', { transactionType: 'rent' }, 'monthlyRent');
assert('GE vkupno 300 evra (rent) → monthlyRent=300', ups6.monthlyRent === 300, `got ${JSON.stringify(ups6)}`);

// Tenant prefs via global extraction (rent only)
const rentData = { transactionType: 'rent' };
const upT = runGlobalExtraction('NE SAKAM MILENICI', rentData, 'tenantPreferences');
assert('GE tenant → tenantPreferences.excluded=[pets]', JSON.stringify(upT.tenantPreferences?.excluded) === JSON.stringify(['pets']),
  `got ${JSON.stringify(upT)}`);
// Sale leads never extract tenant prefs
const upT2 = runGlobalExtraction('NE SAKAM MILENICI', { transactionType: 'sale' }, 'tenantPreferences');
assert('GE tenant → sale leads never', upT2.tenantPreferences === undefined, `got ${JSON.stringify(upT2)}`);

// ============================================================
// PETS-ALLOWED (reported requirement): a dedicated question about pets
// asked right after the tenant-type question, with a couple of varying
// phrasings. The answer is a YES/NO boolean stored as petsAllowed.
// ============================================================
console.log(`\n=== 6b. petsAllowed extraction + flow ===`);

// POSITIVE answers → petsAllowed=true
for (const [input, label] of [
  ['DA, MILENICI SE DOZVOLENI', 'explicit positive'],
  ['dozvoleni se', 'bare positive'],
  ['MOZE SO MILENICI', 'moze + pets'],
  ['NEMA PROBLEM SO MILENICI', 'no-problem idiom'],
  ['PRIHAKAT SO MILENICI', 'prihakat verb'],
  ['SAKAM SO MILENICI', 'sakam verb'],
  ['SLOBODNO SO MILENICI', 'slobodno'],
  ['DOZVOLENI SE KUCINJA', 'dogs allowed'],
  ['PAPAGAL MOZE', 'small caged pet ok']
]) {
  const r = runGlobalExtraction(input, { transactionType: 'rent' }, 'petsAllowed');
  assert(`PETS: "${input}" (${label}) → petsAllowed=true`, r.petsAllowed === true, `got ${JSON.stringify(r)}`);
}
// NEGATIVE answers → petsAllowed=false (incl. the reported lead-3571074
// phrasings that previously looped the question 4×: "nikako milenici",
// "kuce, mace ne", "nikako osven papagal i ribi" — cats/dogs are the usual
// pet problem; parrots/fish/small caged pets are not).
for (const [input, label] of [
  ['NE, BEZ MILENICI', 'bez + pets'],
  ['NE SAKAM MILENICI', 'ne sakam + pets'],
  ['NE DOZVOLUVAM MILENICI', 'ne dozvoluvam + pets'],
  ['ZABRANETO E', 'zabraneto'],
  ['NEMA MILENICI', 'nema + pets'],
  ['SAMO BEZ KUCINJA', 'samo bez + dogs'],
  ['NIKAKO MILENICI', 'nikako + pets'],
  ['MILENICI NIKAKO', 'pets + nikako (reported)'],
  ['nikako milenici, se mi e novo', 'reported first answer'],
  ['KUCE, MACE NE', 'dog, cat no (reported)'],
  ['kuce , mace ne', 'reported comma-spaced'],
  ['NIKAKO OSVEN PAPAGAL I RIBI', 'nothing except parrot+fish (reported)'],
  ['KUCE NE', 'single pet + trailing ne'],
  ['MACA NE', 'cat + trailing ne'],
  ['MILENICI NE', 'generic pets + trailing ne (reported batch)'],
  ['milenici ne', 'lowercase generic pets + trailing ne']
]) {
  const r = runGlobalExtraction(input, { transactionType: 'rent' }, 'petsAllowed');
  assert(`PETS: "${input}" (${label}) → petsAllowed=false`, r.petsAllowed === false, `got ${JSON.stringify(r)}`);
  assert(`PETS: "${input}" scores HIGH (no confirmation re-ask)`, assessConfidence('petsAllowed', false, input) === 'HIGH',
    `got ${assessConfidence('petsAllowed', false, input)}`);
}
// Sale leads never extract petsAllowed
const upPetsSale = runGlobalExtraction('DOZVOLENI SE MILENICI', { transactionType: 'sale' }, 'petsAllowed');
assert('PETS: sale leads never extract', upPetsSale.petsAllowed === undefined, `got ${JSON.stringify(upPetsSale)}`);
// TENANT-ANSWER SYNERGY (reported): "NE SAKAM MILENICI I SAMOHRANI MAJKI"
// as the tenant-type answer also states the pets policy. STEP 1 early-returns
// on the bare tenant answer (no property keywords → STEP 2 skipped), so
// extractTenantPrefs must capture petsAllowed from the SAME message — the
// dedicated "Дали се дозволени миленици?" question is then skipped and the
// workflow advances straight to totalSqm (no redundant re-ask).
const upSyn = runGlobalExtraction('NE SAKAM MILENICI I SAMOHRANI MAJKI', { transactionType: 'rent' }, 'tenantPreferences');
assert('PETS-SYNERGY: tenant answer also sets petsAllowed=false',
  upSyn.petsAllowed === false,
  `got ${JSON.stringify(upSyn)}`);
const upSyn2 = runGlobalExtraction('DA, MILENICI SE DOZVOLENI, SAMO VRABOTENI', { transactionType: 'rent' }, 'tenantPreferences');
assert('PETS-SYNERGY: positive tenant answer also sets petsAllowed=true',
  upSyn2.petsAllowed === true,
  `got ${JSON.stringify(upSyn2)}`);
// Synergy must never fire for sale leads (extractPetsAllowed rent guard)
const upSynSale = runGlobalExtraction('NE SAKAM MILENICI I SAMOHRANI MAJKI', { transactionType: 'sale' }, 'tenantPreferences');
assert('PETS-SYNERGY: sale leads never get petsAllowed',
  upSynSale.petsAllowed === undefined,
  `got ${JSON.stringify(upSynSale)}`);
// Non-pets binary answers don't touch petsAllowed
const upPetsOther = runGlobalExtraction('DA IMA LIFT', { transactionType: 'rent' }, 'petsAllowed');
assert('PETS: "DA IMA LIFT" → petsAllowed ABSENT', upPetsOther.petsAllowed === undefined, `got ${JSON.stringify(upPetsOther)}`);
// RENT order: petsAllowed sits right after tenantPreferences in the rent walk.
const wfPets = getNextMissingField({
  transactionType: 'rent', monthlyRent: 350, availableFrom: '2026-07-01',
  tenantPreferences: { preferred: [], excluded: [], notes: '' }
});
assert('PETS: next missing field after tenantPreferences is petsAllowed', wfPets === 'petsAllowed', `next=${wfPets}`);

// ============================================================
// TENANT QUICKFIRE BATCH (reported, lead 3571074): the owner fires THREE
// messages in one grace window — "sakam stranci", "turci ne", "milenici
// ne". The engine processes each sequentially; the first sets
// tenantPreferences, so the follow-up exclusion and the pets denial must
// MERGE into it (and into petsAllowed), never be dropped by the
// never-overwrite contract.
// ============================================================
{
  let data = { transactionType: 'rent' };
  // msg1 — the tenant-type answer (Ana asked "Каков тип на станари...?")
  const r1 = runGlobalExtraction('sakam stranci', data, 'tenantPreferences');
  Object.assign(data, r1);
  assert('TENANT-BATCH: msg1 "sakam stranci" → preferred=[foreigners]',
    JSON.stringify(data.tenantPreferences?.preferred) === JSON.stringify(['foreigners']),
    `got ${JSON.stringify(data.tenantPreferences)}`);
  // msg2 — the follow-up exclusion (Ana is now asking the pets question)
  const r2 = runGlobalExtraction('turci ne', data, 'petsAllowed');
  Object.assign(data, r2);
  assert('TENANT-BATCH: msg2 "turci ne" → excluded=[turks] (merged, not dropped)',
    JSON.stringify(data.tenantPreferences?.excluded) === JSON.stringify(['turks']),
    `got ${JSON.stringify(data.tenantPreferences)}`);
  assert('TENANT-BATCH: msg2 keeps preferred=[foreigners]',
    JSON.stringify(data.tenantPreferences?.preferred) === JSON.stringify(['foreigners']),
    `got ${JSON.stringify(data.tenantPreferences)}`);
  assert('TENANT-BATCH: merged tenantPreferences scores HIGH (stored at 0.95)',
    assessConfidence('tenantPreferences', data.tenantPreferences, 'turci ne') === 'HIGH',
    `got ${assessConfidence('tenantPreferences', data.tenantPreferences, 'turci ne')}`);
  // msg3 — the pets denial
  const r3 = runGlobalExtraction('milenici ne', data, 'petsAllowed');
  Object.assign(data, r3);
  assert('TENANT-BATCH: msg3 "milenici ne" → petsAllowed=false',
    data.petsAllowed === false,
    `got ${JSON.stringify(data.petsAllowed)}`);
  // notes preserve BOTH exact statements for the broker comment
  const notes = data.tenantPreferences?.notes || '';
  assert('TENANT-BATCH: notes keep both statements',
    /sakam stranci/.test(notes) && /turci ne/.test(notes),
    `got ${notes}`);
  // The merged object is de-duplicated (turks not doubled by a repeat)
  const r4 = runGlobalExtraction('turci ne', data, 'petsAllowed');
  Object.assign(data, r4);
  assert('TENANT-BATCH: repeat "turci ne" dedupes (still one turks)',
    (data.tenantPreferences?.excluded || []).filter(x => x === 'turks').length === 1,
    `got ${JSON.stringify(data.tenantPreferences)}`);
}

// HANDLER-LEVEL: runGlobalExtractionPass is what the engine batch actually
// invokes per message — its toStore loop is the FINAL storage gate and must
// admit the tenant merge (the 4th admission site).
{
  const session = {
    pendingFollowUp: null,
    collectedData: {
      transactionType: 'rent',
      tenantPreferences: { preferred: ['foreigners'], excluded: [], notes: 'Сопственикот изјави: sakam stranci' }
    }
  };
  const r = runGlobalExtractionPass({
    u: 'turci ne', userInput: 'turci ne', session, nextField: 'petsAllowed'
  });
  assert('TENANT-BATCH-HANDLER: toStore loop stores the merge',
    JSON.stringify(session.collectedData.tenantPreferences?.excluded) === JSON.stringify(['turks']) &&
    JSON.stringify(session.collectedData.tenantPreferences?.preferred) === JSON.stringify(['foreigners']),
    `got ${JSON.stringify(session.collectedData.tenantPreferences)}`);
  // And the pets denial arrives as its own message through the same gate
  const s2 = { ...session, collectedData: { ...session.collectedData } };
  s2.collectedData.tenantPreferences = { ...session.collectedData.tenantPreferences };
  runGlobalExtractionPass({ u: 'milenici ne', userInput: 'milenici ne', session: s2, nextField: 'petsAllowed' });
  assert('TENANT-BATCH-HANDLER: "milenici ne" stores petsAllowed=false',
    s2.collectedData.petsAllowed === false,
    `got ${JSON.stringify(s2.collectedData.petsAllowed)}`);
}

// E2E: tenant-type answer → pets question asked (rotating variants) → DA
// answer stored → flow advances to totalSqm.
{
  const sP = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      monthlyRent: 350, monthlyRentConfidence: 0.95,
      availableFrom: '2026-07-01', availableFromConfidence: 0.95,
      tenantPreferences: { preferred: ['students'], excluded: [], notes: 'Сопственикот изјави: SAKAM STUDENTI' },
      tenantPreferencesConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Одлично. Каков тип на станари преферирате?' }],
    phone: '+38976000011'
  };
  // First pets question → variant 0
  const rP1 = await generateResponse(sP, 'KAKO KJE BIDE');
  assert('PETS-FLOW-1: first pets question uses variant 0 ("Дали се дозволени миленици во станот?")',
    rP1.type === 'QUESTION' && rP1.nextField === 'petsAllowed' && (rP1.text || '').includes('Дали се дозволени миленици во станот?'),
    `got [${rP1.type}] next=${rP1.nextField} "${(rP1.text || '').slice(0, 90)}"`);
  // Re-ask rotates to variant 1
  const rP2 = await generateResponse(sP, 'KAKO KJE BIDE');
  assert('PETS-FLOW-2: re-ask rotates to variant 1 ("Дали прифаќате станари со миленици?")',
    rP2.type === 'QUESTION' && rP2.nextField === 'petsAllowed' && (rP2.text || '').includes('Дали прифаќате станари со миленици?'),
    `got [${rP2.type}] next=${rP2.nextField} "${(rP2.text || '').slice(0, 90)}"`);
  // Real answer → stored at HIGH, flow advances to totalSqm
  const rP3 = await generateResponse(sP, 'DA, MILENICI SE DOZVOLENI');
  assert('PETS-FLOW-3: "DA, MILENICI SE DOZVOLENI" → petsAllowed=true stored',
    sP.collectedData.petsAllowed === true, `got ${JSON.stringify(sP.collectedData.petsAllowed)}`);
  assert('PETS-FLOW-4: flow advances to totalSqm',
    rP3.type === 'QUESTION' && rP3.nextField === 'totalSqm',
    `got [${rP3.type}] next=${rP3.nextField} "${(rP3.text || '').slice(0, 60)}"`);
}

// TWO-ATTEMPT CAP (reported, lead 3571074): the pets question used to rotate
// through ALL 4 variants when the owner's no-pets answers weren't recognized
// ("nikako milenici", "kuce, mace ne" → NOT caught → attempt 3, attempt 4...
// "she asks 4 times for the pets ... like an idiot not understanding"). Now
// the extraction catches those phrasings on attempt 1, AND the re-ask cap is
// hard-set to 2: a genuinely unanswerable owner is skipped (stores null) after
// the second ask, never looped. Variant rotation still applies within those 2
// asks (attempt 1 = variant 0, attempt 2 = variant 1).
{
  const sP2 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      monthlyRent: 350, monthlyRentConfidence: 0.95,
      availableFrom: '2026-07-01', availableFromConfidence: 0.95,
      tenantPreferences: { preferred: ['students'], excluded: [], notes: '' }, tenantPreferencesConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Дали се дозволени миленици во станот?' }],
    phone: '+38976000013'
  };
  const rC1 = await generateResponse(sP2, 'NE ZNAM USTE');
  assert('PETS-CAP-1: attempt 1 asks variant 0',
    rC1.type === 'QUESTION' && rC1.nextField === 'petsAllowed' && (rC1.text || '').includes('Дали се дозволени миленици во станот?'),
    `got [${rC1.type}] next=${rC1.nextField} "${(rC1.text || '').slice(0, 90)}"`);
  const rC2 = await generateResponse(sP2, 'NE ZNAM USTE');
  assert('PETS-CAP-2: attempt 2 rotates to variant 1',
    rC2.type === 'QUESTION' && rC2.nextField === 'petsAllowed' && (rC2.text || '').includes('Дали прифаќате станари со миленици?'),
    `got [${rC2.type}] next=${rC2.nextField} "${(rC2.text || '').slice(0, 90)}"`);
  // Third non-answer → SKIPPED after 2 asks (never a 3rd/4th variant) → the
  // flow advances to totalSqm with petsAllowedSkipped=true, storing null.
  const rC3 = await generateResponse(sP2, 'NE ZNAM USTE');
  assert('PETS-CAP-3: after 2 non-answers the pets field is skipped (no 3rd/4th ask)',
    rC3.type === 'QUESTION' && rC3.nextField === 'totalSqm',
    `got [${rC3.type}] next=${rC3.nextField} "${(rC3.text || '').slice(0, 90)}"`);
  assert('PETS-CAP-4: petsAllowedSkipped=true after the 2-attempt cap',
    sP2.collectedData.petsAllowedSkipped === true,
    `got ${JSON.stringify(sP2.collectedData.petsAllowedSkipped)}`);
  assert('PETS-CAP-5: petsAllowed stored null (nothing guessed)',
    sP2.collectedData.petsAllowed === null || sP2.collectedData.petsAllowed === undefined,
    `got ${JSON.stringify(sP2.collectedData.petsAllowed)}`);
  // The reported first answer IS caught on attempt 1 — petsAllowed=false at
  // HIGH, flow advances immediately, no re-ask at all.
  const sP3 = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      monthlyRent: 350, monthlyRentConfidence: 0.95,
      availableFrom: '2026-07-01', availableFromConfidence: 0.95,
      tenantPreferences: { preferred: ['students'], excluded: [], notes: '' }, tenantPreferencesConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Дали се дозволени миленици во станот?' }],
    phone: '+38976000014'
  };
  const rP4 = await generateResponse(sP3, 'nikako milenici, se mi e novo');
  assert('PETS-FLOW-5: reported "nikako milenici, se mi e novo" → petsAllowed=false on attempt 1',
    sP3.collectedData.petsAllowed === false,
    `got ${JSON.stringify(sP3.collectedData.petsAllowed)}`);
  assert('PETS-FLOW-6: flow advances to totalSqm immediately (no re-ask)',
    rP4.type === 'QUESTION' && rP4.nextField === 'totalSqm',
    `got [${rP4.type}] next=${rP4.nextField} "${(rP4.text || '').slice(0, 60)}"`);
}

// BARE "DA"/"NE" answers to the pets question work (BARE_YES_NO_FIELDS).
{
  const sPB = {
    adMemory: { transactionType: 'rent', propertyType: 'apartment', propertyLabel: 'станот' },
    collectedData: {
      cooperationAccepted: true, transactionType: 'rent',
      monthlyRent: 350, monthlyRentConfidence: 0.95,
      availableFrom: '2026-07-01', availableFromConfidence: 0.95,
      tenantPreferences: { preferred: ['students'], excluded: [], notes: '' }, tenantPreferencesConfidence: 0.95
    },
    messages: [{ role: 'model', text: 'Дали се дозволени миленици во станот?' }],
    phone: '+38976000012'
  };
  const rB = await generateResponse(sPB, 'DA');
  assert('PETS-BARE: bare "DA" → petsAllowed=true stored', sPB.collectedData.petsAllowed === true, `got ${JSON.stringify(sPB.collectedData.petsAllowed)}`);
  assert('PETS-BARE: flow advances after bare DA',
    rB.type === 'QUESTION' && rB.nextField === 'totalSqm',
    `got [${rB.type}] next=${rB.nextField} "${(rB.text || '').slice(0, 60)}"`);
}

// Broker comment includes the pets line
const petsBroker = buildBrokerComment({
  transactionType: 'rent',
  monthlyRent: 350,
  tenantPreferences: { preferred: ['students'], excluded: [], notes: '' },
  petsAllowed: true
});
assert('PETS-BROKER: petsAllowed=true → "Миленици: дозволени" line', petsBroker.includes('Миленици: дозволени'), `got ${JSON.stringify(petsBroker)}`);
const petsBrokerNo = buildBrokerComment({
  transactionType: 'rent',
  monthlyRent: 350,
  petsAllowed: false
});
assert('PETS-BROKER: petsAllowed=false → "Миленици: не се дозволени" line', petsBrokerNo.includes('Миленици: не се дозволени'), `got ${JSON.stringify(petsBrokerNo)}`);

// Hermes payload carries pets_allowed
const petsPayload = buildPropertyJson(
  { transactionType: 'rent', monthlyRent: 350, petsAllowed: true },
  { city: 'Skopje' }, '+38970123456', 'P1');
assert('PETS-PAYLOAD: pets_allowed=true in Hermes payload', petsPayload.pets_allowed === true, `got ${JSON.stringify(petsPayload.pets_allowed)}`);

// ============================================================
// 7. FLOW: sale per-sqm → workflow skips cleanPrice, close computes pricing
// ============================================================
console.log(`\n=== 7. close-flow pricing ===`);

// getNextMissingField: pricePerSqm set → cleanPrice not missing
const wfMissing = getNextMissingField({ transactionType: 'sale', pricePerSqm: 2000, totalSqm: 74 });
assert('WF cleanPrice skipped when pricePerSqm set', wfMissing !== 'cleanPrice', `next=${wfMissing}`);

// Full sale conversation: per-sqm answer → cleanPrice skipped → totalSqm
// asked → fill everything → CLOSE with computed sellingPrice
const session = {
  adMemory: {
    transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот',
    sourcePortal: 'test', adUrl: 'https://test', photoUrls: [], title: 'Се продава стан во Центар'
  },
  collectedData: { cooperationAccepted: true, transactionType: 'sale', propertyType: 'apartment' },
  messages: [], phone: '+38970333333'
};
async function send(u) {
  const r = await generateResponse(session, u);
  session.messages.push({ role: 'user', text: u }, { role: 'model', text: r.text || '' });
  return r;
}
(async () => {
  let r = await send('2000 e za m2');
  assert('FLOW per-sqm → cleanPrice not stored', session.collectedData.cleanPrice === undefined, `got ${session.collectedData.cleanPrice}`);
  assert('FLOW per-sqm → pricePerSqm=2000', session.collectedData.pricePerSqm === 2000, `got ${session.collectedData.pricePerSqm}`);
  assert('FLOW next is NOT cleanPrice', r.text && !/последната чиста цена/.test(r.text), `text=${(r.text || '').slice(0, 60)}`);

  // Drive through the remaining fields to a natural CLOSE
  const answers = [
    '74 kvadrati',          // totalSqm
    'nema',                 // terraceSqm → no terrace
    '2 spalni',             // bedrooms
    '4 kat',                // floor
    '10 katnica',           // totalFloors
    'ima lift',             // elevator
    'gradsko parno',        // heating
    'ima klima',            // ac
    'garaza',               // parking (garage)
    'jug',                  // orientation
    'kompletno namesten',   // furnished
    '2020 godina',          // yearBuilt
    'ne',                   // renovated → false
    'da',                   // documentationClean
    'da imam sliki, ke gi ispratam', // photos
    'Goran Petrov',         // ownerName
    'Dame Gruev 12'         // address
  ];
  for (const a of answers) {
    r = await send(a);
    if (r.type === 'CLOSE') break;
  }
  assert('FLOW sale closes', r.type === 'CLOSE', `got ${r.type}`);

  // Close-flow pricing computed on collectedData via buildCloseResponse
  const d = session.collectedData;
  assert('FLOW ownerPrice = 148000 (74×2000, no garage price)', d.ownerPrice === 148000,
    `got ${d.ownerPrice} (cleanPrice=${d.cleanPrice}, sqm=${d.totalSqm}, perSqm=${d.pricePerSqm})`);
  assert('FLOW sellingPrice = 151000 (round 500: 148000×1.02=150960→151000)', d.sellingPrice === 151000, `got ${d.sellingPrice}`);
  assert('FLOW brokerComment present', !!d.brokerComment && d.brokerComment.includes('Сопственик бара'), '');
  assert('FLOW descriptionPublic present', !!d.descriptionPublic && d.descriptionPublic.includes('74 м²'), '');
  assert('FLOW hermesPayload built', !!d.hermesPayload && d.hermesPayload.listing_type === 'sale', '');

  // ============================================================
  // 8. FLOW: BOTH prices given (€/m² AND total, mismatch) → warning in
  //    close message + broker comment + payload
  // ============================================================
  console.log(`\n=== 8. close-flow price warning (both prices, mismatch) ===`);

  const warnSession = {
    adMemory: {
      transactionType: 'sale', propertyType: 'apartment', propertyLabel: 'станот',
      sourcePortal: 'test', adUrl: 'https://test', photoUrls: [], title: 'Се продава стан'
    },
    collectedData: { cooperationAccepted: true, transactionType: 'sale', propertyType: 'apartment' },
    messages: [], phone: '+38976000003'
  };
  // Section 7 defines a module-level send(u) bound to ITS session — pass
  // an explicit (session, u) helper for this flow.
  async function send8(s, u) {
    const rr = await generateResponse(s, u);
    s.messages.push({ role: 'user', text: u }, { role: 'model', text: rr.text || '' });
    return rr;
  }
  // Owner gives BOTH prices — they disagree (per-sqm 2500 × 74 = 185000,
  // but states total 160000).
  r = await send8(warnSession, '2500 e za m2, vkupno 160000 evra');
  assert('FLOW8 pricePerSqm=2500', warnSession.collectedData.pricePerSqm === 2500, `got ${warnSession.collectedData.pricePerSqm}`);
  assert('FLOW8 cleanPrice=160000 (total kept)', warnSession.collectedData.cleanPrice === 160000, `got ${warnSession.collectedData.cleanPrice}`);

  for (const a of FLOW8_ANSWERS) {
    r = await send8(warnSession, a);
    if (r.type === 'CLOSE') break;
  }
  assert('FLOW8 sale closes', r.type === 'CLOSE', `got ${r.type}`);
  const d8 = warnSession.collectedData;
  assert('FLOW8 priceWarning=true', d8.priceWarning === true, `got ${d8.priceWarning}`);
  assert('FLOW8 close message asks to confirm the price', /потврди.*цена|цена.*потврди|точната цена/i.test(r.text || ''),
    `text=${(r.text || '').slice(0, 160)}`);
  assert('FLOW8 close message shows both numbers', /2500 €\/м²/.test(r.text || '') && /160\.000 €/.test(r.text || ''),
    `text=${(r.text || '').slice(0, 200)}`);
  assert('FLOW8 brokerComment carries ⚠', !!d8.brokerComment && d8.brokerComment.includes('ЦЕНА НЕСОГЛАСНОСТ'),
    `bc=${(d8.brokerComment || '').slice(0, 120)}`);
  assert('FLOW8 hermesPayload price_warning=true', d8.hermesPayload?.price_warning === true,
    `got ${d8.hermesPayload && d8.hermesPayload.price_warning}`);

  // ============================================================
  // SUMMARY
  // ============================================================
  const failed = results.filter(r2 => !r2.ok);
  console.log(`\n===============================================================`);
  console.log(`📊 PROPERTY INTELLIGENCE TEST SUMMARY:`);
  console.log(`   ✅ Passed: ${results.length - failed.length}`);
  console.log(`   ❌ Failed: ${failed.length}`);
  console.log(`   📋 Total:  ${results.length}`);
  console.log(`===============================================================`);
  if (failed.length > 0) {
    console.log(`\n🔴 FAILED:`);
    for (const f of failed) console.log(`   - ${f.name}: ${f.detail}`);
    process.exit(1);
  } else {
    console.log(`\n🟢 ALL PROPERTY INTELLIGENCE TESTS PASSED`);
    process.exit(0);
  }
})();
