// LAND FIELD WHITELIST — land properties (plac/плац, niva/нива, parcela/
// парцела, zemjiste/земјиште, oranica/ораница, livada/ливада, vinograd/
// виноград, gradina/градина, zemja/земја, ...) have NO building features:
// no terrace, bedrooms, floor, heating, parking, orientation, furnishing,
// year built, renovation, elevator, AC. The essentials are price, sqm,
// documentation, owner name, address — plus PHOTOS (reported: a land owner
// may send a drawing/sketch of the plot or a photo of the land — the plot
// itself is the listing's visual, and a sketch is the land equivalent of a
// building photo). Everything else is never asked for land (previously only
// 5 of the building fields were skipped and the rest of the batch —
// terrace, bedrooms, heating, parking, orientation, yearBuilt, renovated,
// photos — was still pumped through the whole question flow; reported as
// the "whole batch" problem for land leads). monthlyRent is in the whitelist
// for rent land leads, cleanPrice for sale — the per-transaction order picks
// one.
const LAND_FIELDS = ['cleanPrice', 'monthlyRent', 'totalSqm', 'documentationClean', 'photos', 'ownerName', 'address'];

// BUSINESS/COMMERCIAL FIELD WHITELIST — commercial properties (локал, офис,
// деловен простор, продавница, ресторан, магацин, office, shop, restaurant,
// warehouse, ...) have a different field set than residential apartments:
// they need price/sqm/floor/totalFloors/heating/ac/parking/orientation/
// furnished/yearBuilt/renovated/renovationYear/documentation/photos/name/
// address (the reported list) — but NOT terrace, NOT bedrooms, NOT elevator.
// A commercial space has no sleeping rooms; terrace/elevator are
// residential-centric and would produce absurd questions for a business
// property. Every OTHER building field stays (a business unit sits on a
// floor, has heating, parking, AC, was built/renovated, has docs + photos).
// monthlyRent is in the whitelist for rent leads, cleanPrice for sale — the
// per-transaction order picks one.
const COMMERCIAL_FIELDS = [
  'cleanPrice', 'monthlyRent',
  'totalSqm', 'floor', 'totalFloors', 'heating', 'ac', 'parking',
  'orientation', 'furnished', 'yearBuilt', 'renovated', 'renovationYear',
  'documentationClean', 'photos', 'ownerName', 'address'
];

const isLand = (data) => data.propertyType === 'land';
const isLandField = (f) => LAND_FIELDS.includes(f);
const isCommercial = (data) => data.propertyType === 'commercial';
const isCommercialField = (f) => COMMERCIAL_FIELDS.includes(f);

export function getNextMissingField(data) {
  const skipBedrooms = data.bedrooms !== null && data.bedrooms !== undefined && data.bedrooms !== '';
  const skipPropertyType = data.propertyType !== null;
  const skipTransaction = data.transactionType !== null;

  const isRent = data.transactionType === 'rent';

  const saleOrder = [
    "cleanPrice",
    "totalSqm",
    "terraceSqm",
    "bedrooms",
    "floor",
    "totalFloors",
    "elevator",
    "heating",
    "ac",
    "parking",
    "orientation",
    "furnished",
    "yearBuilt",
    "renovated",
    "renovationYear",
    "documentationClean",
    "photos",
    "ownerName",
    "address"
  ];

  const rentOrder = [
    "monthlyRent",
    "availableFrom",
    "totalSqm",
    "terraceSqm",
    "bedrooms",
    "floor",
    "totalFloors",
    "elevator",
    "heating",
    "ac",
    "parking",
    "orientation",
    "furnished",
    "yearBuilt",
    "renovated",
    "renovationYear",
    "documentationClean",
    "photos",
    "ownerName",
    "address"
  ];

  const order = isRent ? rentOrder : saleOrder;

  // Debug: log all currently-missing fields before selecting next
  const missingFields = order.filter(f => {
    // PERMANENTLY SKIPPED (max 2 attempts, owner not answering) — never re-ask.
    // The skip loop in handlers/data-collection.js stores {field}Skipped=true.
    // Without this, a skipped field (null value + 0.10 confidence) is treated
    // as missing forever → the skip while-loop spins infinitely.
    if (data[f + 'Skipped']) return false;
    if (skipBedrooms && f === 'bedrooms') return false;
    if (skipPropertyType && f === 'propertyType') return false;
    if (skipTransaction && f === 'transactionType') return false;
    if (isLand(data) && !isLandField(f)) return false;
    // COMMERCIAL WHITELIST: business properties never ask terrace/bedrooms/
    // elevator (see COMMERCIAL_FIELDS above) — mirror of the land whitelist.
    if (isCommercial(data) && !isCommercialField(f)) return false;
    if (data.renovated === false && f === 'renovationYear') return false;
    if (data.hasTerrace === true && f === 'terraceSqm') return false;
    // FIELD CONFIDENCE: if field has value but confidence < 0.7, it's considered missing
    const fieldConf = data[f + 'Confidence'];
    if (fieldConf !== undefined && fieldConf < 0.7) return true;
    return data[f] === undefined || data[f] === null || data[f] === '';
  });
  console.log(`[MISSING FIELDS][${missingFields.join(', ')}]`);

  for (const field of order) {
    // PERMANENTLY SKIPPED (max 2 attempts) — never re-ask. See note above.
    if (data[field + 'Skipped']) continue;
    if (skipBedrooms && field === 'bedrooms') continue;
    if (skipPropertyType && field === 'propertyType') continue;
    if (skipTransaction && field === 'transactionType') continue;

    if (isLand(data) && !isLandField(field)) continue;

    // COMMERCIAL WHITELIST (mirror of the land whitelist above).
    if (isCommercial(data) && !isCommercialField(field)) continue;

    if (data.renovated === false && field === 'renovationYear') continue;

    // When terrace is confirmed but size unknown, skip terraceSqm
    if (data.hasTerrace === true && field === 'terraceSqm') continue;

    // FIELD CONFIDENCE SYSTEM (Priority 7):
    // If a field has a value BUT its confidence < 0.7, treat it as missing
    // and re-ask. This prevents low-quality extraction from being accepted.
    // Fields without a confidence score (undefined) are treated as 1.0
    // (complex handlers, direct user confirmations, manual overrides).
    const fieldConfidence = data[field + 'Confidence'];
    if (fieldConfidence !== undefined && fieldConfidence < 0.7) {
      return field;
    }

    if (data[field] === undefined || data[field] === null || data[field] === "") {
      return field;
    }
  }
  return null;
}

export function getQuestion(field, propertyType, hasScraperPhotos = false, photosStatus = null) {
  const typeLabel = propertyType === 'apartment' ? 'станот' :
                    propertyType === 'house' ? 'куќата' :
                    propertyType === 'land' ? 'плацот' :
                    propertyType === 'commercial' ? 'локалот' : 'имотот';

  const questions = {
    available: `Дали ${typeLabel} е се уште достапен?`,
    cleanPrice: `Која би била последната чиста цена за ${typeLabel}?`,
    monthlyRent: `Која е месечната кирија за ${typeLabel}?`,
    availableFrom: `Од кога ќе биде слободен ${typeLabel}?`,
    totalSqm: `Колкава е вкупната квадратура по имотен лист?`,
    terraceSqm: `Дали има тераса и колку м2 е?`,
    bedrooms: `Колку спални соби има ${typeLabel}?`,
    floor: `На кој кат се наоѓа ${typeLabel}?`,
    totalFloors: `Колку спрата има вкупно зградата?`,
    elevator: 'Дали зградата има лифт?',
    heating: 'Какво греење има?',
    ac: 'Дали има клима?',
    parking: 'Каков е паркингот? Гаража, приватен или јавен?',
    orientation: 'Која е ориентацијата?',
    furnished: 'Дали е наместен?',
    yearBuilt: 'Која година е граден?',
    renovated: 'Дали е реновиран?',
    renovationYear: 'Која година е реновиран?',
    documentationClean: 'Дали имате чист имотен лист?',
    photos: getPhotosQuestion(propertyType, hasScraperPhotos, photosStatus),
    ownerName: 'Како да ве запишам?',
    address: 'Која е точната адреса?'
  };
  return questions[field] || null;
}

function getPhotosQuestion(propertyType, hasScraperPhotos, photosStatus) {
  // If photos are already set, we shouldn't be asking this
  if (hasScraperPhotos) {
    return 'Фотографиите од огласот ги имаме. Дали се актуелни?';
  }
  // LAND VARIANT (reported): a land owner may send a drawing/sketch of the
  // plot or a photo of the land — the land itself is the visual (the plot's
  // shape, boundaries, surroundings), so the question explicitly offers the
  // sketch/drawing option that a building owner wouldn't have.
  if (propertyType === 'land') {
    return 'Дали имате фотографија од плацот или скица/цртеж што би можеле да ни ги испратите на Viber?';
  }
  return 'Дали имате фотографии што би можеле да ни ги испратите на Viber?';
}

export function getBedroomType(bedrooms) {
  if (bedrooms === 0) return 'гарсонера';
  if (bedrooms === 1) return 'двособен';
  if (bedrooms === 2) return 'трособен';
  if (bedrooms === 3) return 'четворособен';
  if (bedrooms === 4) return 'петособен';
  return null;
}

export function getPropertyTypeLabel(type) {
  const labels = {
    apartment: 'стан',
    house: 'куќа',
    land: 'плац',
    commercial: 'локал'
  };
  return labels[type] || 'имот';
}
