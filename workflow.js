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
    if (data.propertyType === 'land' && ['floor', 'totalFloors', 'elevator', 'ac', 'furnished'].includes(f)) return false;
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

    if (data.propertyType === 'land') {
      if (['floor', 'totalFloors', 'elevator', 'ac', 'furnished'].includes(field)) continue;
    }

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
                    propertyType === 'land' ? 'плацот' : 'имотот';

  const questions = {
    available: `Дали ${typeLabel} е се уште достапен?`,
    cleanPrice: `Која би била последната чиста цена за ${typeLabel}?`,
    monthlyRent: `Која е месечната кирија за ${typeLabel}?`,
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
    photos: getPhotosQuestion(hasScraperPhotos, photosStatus),
    ownerName: 'Како да ве запишам?',
    address: 'Која е точната адреса?'
  };
  return questions[field] || null;
}

function getPhotosQuestion(hasScraperPhotos, photosStatus) {
  // If photos are already set, we shouldn't be asking this
  if (hasScraperPhotos) {
    return 'Фотографиите од огласот ги имаме. Дали се актуелни?';
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
