// ============================================================
// property-intelligence.js — ANA INTELLIGENCE LAYER
// ============================================================
// The spec: "Ana = intelligence layer. Collects data, extracts facts,
// calculates prices, builds public description, builds internal broker
// comments, applies agency business rules, decides property status,
// produces final normalized property JSON. Lovable/Hermes = property
// database layer — receives the payload, validates, stores, displays.
// NO calculations in Hermes. NO business decisions in Hermes."
//
// This module keeps ALL real-estate business logic in ONE place so every
// property flows through a single structured object instead of scattered
// extracted facts:
//   1. calculateSellingPrice  — 3 scenarios (€/m², total, both → mismatch
//      flag), agency %, round-UP to 500€ increments
//   2. extractTenantPreferences — preferred/excluded categories + the
//      owner's EXACT statement preserved in notes (spec: less risk of
//      misclassification, agents can interpret, easier legally)
//   3. buildBrokerComment      — internal note (agency-staff only)
//   4. buildEnhancedDescription — scraped ad text + collected facts
//   5. buildPropertyJson       — the normalized Hermes payload
// ============================================================

// ============================================================
// SELLING PRICE CALCULATOR
// ============================================================
// Round-UP to the nearest 500€ (spec): 126001 → 126500, 126320 → 126500,
// 126499 → 126500, 126500 → 126500, 126501 → 127000.
export function roundUpTo500(n) {
  return Math.ceil(n / 500) * 500;
}

// Three scenarios (spec):
//   Scenario 1 — owner gives €/m² : ownerPrice = sqm × pricePerSqm
//   Scenario 2 — owner gives total : ownerPrice = totalPrice
//   Scenario 3 — owner gives BOTH : store both, flag mismatch
//                 { price_warning: true } (happens surprisingly often)
// Garage (sold separately) is ADDED to the owner price.
// Agency selling price: (ownerPrice + garage) × (1 + agency%) rounded
// UP to the nearest 500€: 126001 → 126500, 126320 → 126500,
// 126499 → 126500, 126500 → 126500, 126501 → 127000.
// @returns {Object|null} — { ownerPrice, ownerPriceFromSqm, garagePrice,
//   agencyPercent, commission, sellingPrice, priceWarning, scenario }
//   null when no price input is usable.
// ============================================================
export function calculateSellingPrice({ sqm, pricePerSqm, totalPrice, garagePrice, agencyPercent = 2 }) {
  const agency = Number(agencyPercent) || 2;

  // Scenario 1/3: price per sqm → derived owner price (rounded to whole €)
  let ownerPriceFromSqm = null;
  if (typeof pricePerSqm === 'number' && pricePerSqm > 0 && typeof sqm === 'number' && sqm > 0) {
    ownerPriceFromSqm = Math.round(sqm * pricePerSqm);
  }

  // Scenario 2/3: total price given directly
  const hasTotal = typeof totalPrice === 'number' && totalPrice > 0;

  let ownerPrice = null;
  let scenario = null;
  if (hasTotal) {
    ownerPrice = totalPrice;
    scenario = ownerPriceFromSqm !== null ? 'both' : 'total';
  } else if (ownerPriceFromSqm !== null) {
    ownerPrice = ownerPriceFromSqm;
    scenario = 'per_sqm';
  }
  if (ownerPrice === null) return null;

  // Scenario 3 mismatch flag: the two numbers disagree beyond tolerance.
  // Tolerance: >500€ absolute OR >2% of the total (whichever is larger) —
  // small rounding differences don't warn, real disagreements do.
  let priceWarning = false;
  if (scenario === 'both') {
    const diff = Math.abs(ownerPriceFromSqm - totalPrice);
    const tolerance = Math.max(500, totalPrice * 0.02);
    if (diff > tolerance) priceWarning = true;
  }

  // Garage sold separately → added to the owner's total
  const garage = (typeof garagePrice === 'number' && garagePrice > 0) ? Math.round(garagePrice) : 0;
  const ownerTotal = ownerPrice + garage;

  const commission = Math.round(ownerTotal * (agency / 100));
  const finalPrice = ownerTotal + commission;
  const sellingPrice = roundUpTo500(finalPrice); // round UP to 500€

  return {
    ownerPrice: ownerTotal,          // owner's total incl. garage
    ownerPriceFromSqm,               // what sqm × €/m² produced (scenario 1/3)
    garagePrice: garage,
    agencyPercent: agency,
    commission,
    sellingPrice,
    priceWarning,
    scenario
  };
}

// ============================================================
// TENANT PREFERENCE CATEGORIES — bilingual, canonical English keys
// (spec categories: студенти, семејства, странци, самци, вработени,
// самохрани родители, пензионери, миленици дозволени/без миленици)
// ============================================================
const TENANT_CATEGORIES = [
  { key: 'students', mk: 'студенти', re: /(?:^|[^a-zа-я])(?:studenti|студенти)(?:$|[^a-zа-я])/i },
  { key: 'families', mk: 'семејства', re: /(?:^|[^a-zа-я])(?:semejstva|семејства|semejni|семејни|families)(?:$|[^a-zа-я])/i },
  { key: 'foreigners', mk: 'странци', re: /(?:^|[^a-zа-я])(?:stranci|странци)(?:$|[^a-zа-я])/i },
  { key: 'singles', mk: 'самци', re: /(?:^|[^a-zа-я])(?:samci|самци)(?:$|[^a-zа-я])/i },
  { key: 'employed', mk: 'вработени', re: /(?:^|[^a-zа-я])(?:vraboteni|вработени|zaposleni|запослени)(?:$|[^a-zа-я])/i },
  { key: 'single_parents', mk: 'самохрани родители', re: /(?:^|[^a-zа-я])(?:samohrani|самохрани)(?:$|[^a-zа-я])/i },
  { key: 'pensioners', mk: 'пензионери', re: /(?:^|[^a-zа-я])(?:penzioneri|пензионери|pensioneri|пенсионери)(?:$|[^a-zа-я])/i },
  { key: 'pets', mk: 'миленици', re: /(?:^|[^a-zа-я])(?:milenici|миленици)(?:$|[^a-zа-я])/i }
];

// Negation phrases that mark EXCLUDED categories. "ne sakam milenici",
// "bez milenici", "nema milenici", "ne dozvoluvam milenici", "odbivam...".
const TENANT_EXCLUDE_RE = /(?:ne\s+sakam|не\s+сакам|ne\s+dozvoluvam|не\s+дозволувам|ne\s+primam|не\s+примам|odbivam|одбивам|bez|без|nema|нема|nemaat|немаат|ne\s+mi|не\s+ми|ne\s+gi|не\s+ги|ne\s+gu|не\s+гу)/i;

// Positive phrases that mark PREFERRED categories. "preferiram semejstva",
// "semejstva se ok", "dobri se studenti", "bi sakal vraboteni",
// "najdobro semejstva", "moze studenti", "sakam semejstva".
const TENANT_PREFER_RE = /(?:preferiram|преферирам|bi\s+sakal|би\s+сакал|bi\s+sakame|би\s+сакаме|sakam|сакам|sakame|сакаме|dobri\s+se|добри\s+се|dobro|добро|se\s+ok|се\s+океј|se\s+ok|ok\s+se|okey\s+se|najdobro|најдобро|moze\s+da|може\s+да|moze|може|dozvoleni|дозволени)/i;

// ============================================================
// extractTenantPreferences(u)
// Parses an owner statement about the preferred tenant profile.
//   "NE SAKAM MILENICI I SAMOHRANI MAJKI" →
//       { preferred: [], excluded: ['pets', 'single_parents'],
//         notes: 'Сопственикот изјави: NE SAKAM MILENICI I SAMOHRANI MAJKI' }
//   "PREFEERIRAM SEMEJSTVA I VRABOTENI" →
//       { preferred: ['families', 'employed'], excluded: [], notes: ... }
// Per the spec: store the owner's EXACT statement in notes (preserves the
// wording, less risk of misclassification, agents can interpret it).
// @returns {Object|null} — { preferred[], excluded[], notes } or null when
//   no tenant category is mentioned.
// ============================================================
export function extractTenantPreferences(u) {
  if (!u || typeof u !== 'string') return null;
  const original = u.trim();
  if (!original) return null;
  const low = original.toLowerCase();

  const preferred = [];
  const excluded = [];
  for (const cat of TENANT_CATEGORIES) {
    const firstIdx = low.search(cat.re);
    if (firstIdx === -1) continue;
    // CLAUSE-AWARE POLARITY — inspect only the text BEFORE this category
    // (the nearest preceding polarity phrase decides, matching word order):
    //   "NE SAKAM milenici"      → negator before the category → excluded
    //   "PREFEERIRAM semejstva"  → prefer before the category → preferred
    //   "semejstva se ok"        → no marker before (idx 0) → preferred
    // The POSITIVE check runs on the SAME `before` slice only — checking the
    // whole message made "sakam" (a substring inside "ne sakam") cancel the
    // negation and misclassify "NE SAKAM MILENICI" as preferred (reported
    // lead 5502969 phrasing shape). A marker AFTER the category never flips
    // it ("BEZ MILENICI, AMA SEMEJSTVA SE OK" → pets excluded, families
    // preferred — the second clause is its own `before` slice).
    const before = low.slice(0, firstIdx);
    const isExcluded = TENANT_EXCLUDE_RE.test(before);
    const isPreferred = !isExcluded && TENANT_PREFER_RE.test(before);
    if (isExcluded) excluded.push(cat.key);
    else preferred.push(cat.key); // explicit prefer OR bare answer → preference
  }

  if (preferred.length === 0 && excluded.length === 0) return null;
  return {
    preferred,
    excluded,
    notes: `Сопственикот изјави: ${original}`
  };
}

// Map canonical category key → Macedonian label (for broker comments)
export function tenantCategoryLabel(key) {
  const found = TENANT_CATEGORIES.find(c => c.key === key);
  return found ? found.mk : key;
}

// ============================================================
// buildBrokerComment(data)
// Internal note visible ONLY to agency staff (the Lovable
// "Интерен коментар" textarea). Auto-generated from the collected facts,
// pricing and tenant preferences. Example (spec):
//   Сопственик бара:
//   2500€/м²
//   74м²
//   Цена стан: 185.000€
//   Гаража: 15.000€
//   Вкупно сопственик: 200.000€
//   Агенциска провизија: 2%
//   Продажна цена: 204.000€
//   Преферирани клиенти: Семејства, вработени
//   Не прифаќа: Миленици, самохрани родители
// ============================================================
function formatEur(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '';
  return Number(n).toLocaleString('de-DE'); // 204.000
}

export function buildBrokerComment(data) {
  if (!data) return '';
  const lines = ['Сопственик бара:'];

  const isRent = data.transactionType === 'rent';
  if (!isRent) {
    // Per-m² and sqm stay UNFORMATTED (spec shows "2500€/м²" and "74м²"
    // plain); only EUR prices get the thousands separator ("185.000€").
    if (typeof data.pricePerSqm === 'number' && data.pricePerSqm > 0) {
      lines.push(`${data.pricePerSqm}€/м²`);
    }
    if (typeof data.totalSqm === 'number' && data.totalSqm > 0) {
      lines.push(`${data.totalSqm}м²`);
    }
    if (typeof data.ownerPrice === 'number' && data.ownerPrice > 0) {
      lines.push(`Цена стан: ${formatEur(data.ownerPrice)}€`);
    }
    if (typeof data.garagePrice === 'number' && data.garagePrice > 0) {
      lines.push(`Гаража: ${formatEur(data.garagePrice)}€`);
    }
    if (typeof data.ownerPrice === 'number' && data.ownerPrice > 0) {
      lines.push(`Вкупно сопственик: ${formatEur(data.ownerPrice)}€`);
    }
    lines.push(`Агенциска провизија: ${data.agencyPercent || 2}%`);
    if (typeof data.sellingPrice === 'number' && data.sellingPrice > 0) {
      lines.push(`Продажна цена: ${formatEur(data.sellingPrice)}€`);
    }
  } else {
    if (typeof data.monthlyRent === 'number' && data.monthlyRent > 0) {
      lines.push(`Месечна кирија: ${formatEur(data.monthlyRent)}€`);
    }
    lines.push('Агенциска провизија: 50% од една кирија');
  }

  const tp = data.tenantPreferences;
  if (tp && (tp.preferred?.length || tp.excluded?.length)) {
    if (tp.preferred?.length) {
      lines.push(`Преферирани клиенти: ${tp.preferred.map(tenantCategoryLabel).join(', ')}`);
    }
    if (tp.excluded?.length) {
      lines.push(`Не прифаќа: ${tp.excluded.map(tenantCategoryLabel).join(', ')}`);
    }
    if (tp.notes) lines.push(tp.notes);
  }

  return lines.join('\n');
}

// ============================================================
// buildEnhancedDescription(data, scrapedDescription)
// Public description = original scraped ad text + facts collected by Ana
// that are missing from the ad. Example (spec):
//   "Се продава нов стан на прв спрат и гаражно место градба 2025 во
//   Дебар Маало близу до Броз кафе. Станот е со јужна ориентација,
//   централно греење, лифт и гаражно место. Објектот е новоградба со
//   чиста документација."
// ============================================================
export function buildEnhancedDescription(data, scrapedDescription = '') {
  if (!data) return String(scrapedDescription || '').trim();
  const facts = [];
  const isRent = data.transactionType === 'rent';

  if (typeof data.totalSqm === 'number' && data.totalSqm > 0) facts.push(`површина од ${data.totalSqm} м²`);
  if (typeof data.bedrooms === 'number' && data.bedrooms >= 0) {
    const type = data.bedrooms === 0 ? 'гарсонера' :
                 data.bedrooms === 1 ? 'еднособен' :
                 data.bedrooms === 2 ? 'двособен' :
                 data.bedrooms === 3 ? 'трособен' : 'повеќесобен';
    facts.push(`${type} стан`);
  }
  if (typeof data.floor === 'number' && data.floor !== null) facts.push(`на ${data.floor} кат`);
  if (data.heating) facts.push(data.heating === 'district' ? 'централно греење' : data.heating === 'electric' ? 'електрично греење' : data.heatingType === 'private_central' ? 'сопствено парно' : 'греење');
  if (data.elevator) facts.push('лифт');
  if (data.parking && data.parkingType === 'garage') facts.push('гаражно место');
  else if (data.parking && data.parkingType === 'private') facts.push('приватен паркинг');
  if (data.orientation) facts.push(`${data.orientation} ориентација`);
  if (data.yearBuilt) facts.push(`градба ${data.yearBuilt}`);
  if (data.renovated === true) facts.push(data.renovationYear ? `реновиран ${data.renovationYear}` : 'реновиран');
  if (data.documentationClean === true) facts.push('со чиста документација');
  if (data.furnished === true) facts.push('наместен');

  const base = String(scrapedDescription || '').trim().replace(/[.\s]+$/, '');
  if (facts.length === 0) return base;
  const typeLabel = data.propertyType === 'apartment' ? 'Станот' :
                    data.propertyType === 'house' ? 'Куќата' :
                    data.propertyType === 'land' ? 'Плацот' :
                    data.propertyType === 'commercial' ? 'Локалот' : 'Имотот';
  const suffix = `${typeLabel} е со ${facts.join(', ')}.`;
  return base ? `${base}. ${suffix}` : suffix;
}

// ============================================================
// buildPropertyJson(data, adMemory, phone, propertyId)
// The FINAL NORMALIZED property payload handed to Hermes/Lovable.
// Hermes simply: POST /properties → validate → store → return id.
// NO calculations, NO AI, NO enrichment, NO business decisions there.
// `available` mirrors the available-from date: a future blocked_until
// hides the listing on the customer page until that date (reported
// requirement — "THE PROPERTY IS HIDDEN UNTILL THAT DATE AND SHOWS UP
// ON THE CUSTOMERS WEB PAGE WHEN ITS FREE").
// ============================================================
export function buildPropertyJson(data, adMemory = {}, phone = '', propertyId = null) {
  if (!data) return null;
  const isRent = data.transactionType === 'rent';
  const hasFutureDate = typeof data.availableFrom === 'string' && data.availableFrom !== 'immediate';

  const tenantPreferences = data.tenantPreferences && (data.tenantPreferences.preferred?.length || data.tenantPreferences.excluded?.length)
    ? {
        preferred: data.tenantPreferences.preferred || [],
        excluded: data.tenantPreferences.excluded || [],
        notes: data.tenantPreferences.notes || ''
      }
    : { preferred: [], excluded: [], notes: '' };

  return {
    listing_type: isRent ? 'rent' : 'sale',
    available: !hasFutureDate,
    blocked_until: hasFutureDate ? data.availableFrom : null,

    city: data.city || adMemory.city || '',
    municipality: data.municipality || adMemory.municipality || '',

    sqm: data.totalSqm ?? null,
    floor: data.floor ?? null,
    heating: data.heatingType || data.heating || null,
    elevator: data.elevator ?? null,
    garage: data.parkingType === 'garage' || data.parking === true ? (data.parkingType === 'garage') : null,
    garage_price: data.parkingPrice ?? null,

    owner_price_per_sqm: data.pricePerSqm ?? null,
    owner_price: data.ownerPrice ?? data.cleanPrice ?? null,
    agency_percent: data.agencyPercent ?? null,
    selling_price: data.sellingPrice ?? null,
    // RENT price — owner_price/selling_price are sale-side fields; a rent
    // payload carries the monthly rent here (code-review finding: the rent
    // amount used to survive ONLY inside broker_comment).
    monthly_rent: isRent ? (data.monthlyRent ?? null) : null,

    description_public: data.descriptionPublic || '',
    broker_comment: data.brokerComment || '',

    tenant_preferences: tenantPreferences,

    // source + id context for Hermes dedup/audit
    property_id: propertyId,
    lead_phone: phone,
    source_portal: adMemory.sourcePortal || data.sourcePortal || '',
    source_ad_url: adMemory.adUrl || data.sourceAdUrl || ''
  };
}
