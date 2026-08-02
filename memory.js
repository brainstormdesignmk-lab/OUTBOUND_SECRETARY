// Regex-based fact extraction from ad titles and owner messages
// FALLBACK — LLM is primary extractor

export function extractFacts(text) {
  if (!text || typeof text !== 'string') {
    return getEmptyMemory();
  }
  const t = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const data = {};

  // === AVAILABILITY ===
  if (/(dostapen|dostapno|sloboden|slobodno|uste[,\s]e|se prodava|ima|ke prodavam|ke izdavam|na prodadba|na prodazba|dostaprn)/i.test(t)) {
    data.available = true;
  } else if (/(prodaden|izdadena|iznajmen|nema|ne e dostapen|ne e dostapno|nemam|ne go imam|vec[e]? prodaden|nemame|ne prodavam|ne izdavam|ne e aktiven|ne e aktuelno|povlecen)/i.test(t)) {
    data.available = false;
  }

  // === PRICE ===
  // Patterns: "123 000 evra", "123000 evra", "123,000 evra", "123000е", "10000eur"
  const pricePatterns = [
    /(\d{1,3}(?:[.,\s]?\d{3})*)\s*(?:evra|eur|e|е|евра|евро)/i,
    /(\d{1,3}(?:[.,\s]?\d{3})*)\s*(?:cena|cena e|iznesuva|iznos)/i,
  ];
  for (const p of pricePatterns) {
    const m = t.match(p);
    if (m) {
      const cleaned = m[1].replace(/[.\s,]/g, '');
      const num = parseInt(cleaned, 10);
      if (num > 1000 && num < 9999999) {
        data.cleanPrice = num;
        break;
      }
    }
  }
  // Also try bare number followed by thousand context
  const bareMatch = t.match(/(?:cist[ai]?\s*)?(\d{3,6})\s*(?:iljadi|илјади|evo|prasuva|sakam|baram|e)/i);
  if (bareMatch && !data.cleanPrice) {
    const num = parseInt(bareMatch[1].replace(/[.\s,]/g, ''), 10);
    if (num > 1000 && num < 9999999) data.cleanPrice = num;
  }

  // === TOTAL SQM ===
  const sqmPatterns = [
    /(\d{2,3})\s*(?:m2|kvadrat|kvadrati|м2|кв[.])/i,
    /(?:od|pogolema|okolku|cela|ima|e|gradba|kubatura|povrsina|kvadratur)\s*(\d{2,3})\s*(?:\s|$|\.)/i,
  ];
  for (const p of sqmPatterns) {
    const m = t.match(p);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num >= 15 && num <= 500) {
        data.totalSqm = num;
        break;
      }
    }
  }

  // === FLOOR ===
  // Kat/sprat patterns - handle "3kat", "3 kat", "3-kat", "3 sprat", "tret kat/cetvrt kat"
  const floorMap = {
    'prv': 1, 'прв': 1, 'parter': 0, 'приземје': 0, 'prizemje': 0,
    'vtor': 2, 'втор': 2, 'vtvr': 2,
    'tret': 3, 'трет': 3, 'trt': 3, 'treti': 3,
    'cetvrt': 4, 'четврт': 4, 'cetvt': 4, 'cetvrti': 4,
    'pet': 5, 'пет': 5, 'peti': 5,
    'shest': 6, 'шест': 6, 'sesti': 6,
    'sedum': 7, 'седум': 7, 'sedmi': 7,
    'osum': 8, 'осум': 8, 'osmi': 8,
    'devet': 9, 'девет': 9, 'devetti': 9,
    'deset': 10, 'десет': 10, 'desetti': 10,
  };
  // Digit pattern: "3kat" or "3 kat" or "3-kat" or "na 3 kat"
  const floorDigit = t.match(/(\d{1,2})\s*(?:kat|кат|sprat|спрат|sp|k[.])(?:\s|$|\.|,|!|\\?)/i);
  if (floorDigit) {
    data.floor = parseInt(floorDigit[1], 10);
  }
  // Word pattern
  if (!data.floor) {
    for (const [word, val] of Object.entries(floorMap)) {
      const re = new RegExp(`(?:na\\s+)?${word}\\s*(?:kat|кат|sprat|спрат)?(?:\\s|$|,|\\.|\\?|!)`, 'i');
      if (re.test(t)) { data.floor = val; break; }
    }
  }

  // === TOTAL FLOORS ===
  const totalFloorDigit = t.match(/(\d{1,2})\s*(?:kata|ката|sprata|спрата|kati|кати|sprait)/i);
  if (totalFloorDigit) {
    data.totalFloors = parseInt(totalFloorDigit[1], 10);
  }

  // === BEDROOMS ===
  const roomMap = {
    'garsonjera': 0, 'гарсониера': 0, 'garsoniera': 0, 'garson': 0, 'gars': 0, 'едноставен': 0,
    '1 sob[ai]': 1, 'еднособен': 1, 'едно собен': 1, 'dvosoben': 1, 'двособен': 1, 'ednosoben': 1,
    '2 sob[ai]': 2, 'двособен': 2, 'дво собен': 2, 'trosoben': 2, 'трособен': 2, 'tri sob[ai]': 2,
    '3 sob[ai]': 3, 'трособен': 3, 'тро собен': 3, 'cetvorosoben': 3, 'четворособен': 3, 'cetvoro': 3,
    '4 sob[ai]': 4, 'четворособен': 4, 'cetvorosoben': 4,
  };
  for (const [pat, val] of Object.entries(roomMap)) {
    const re = new RegExp(pat, 'i');
    if (re.test(t)) { data.bedrooms = val; break; }
  }
  // Fallback: "sobi: 2" or bare "2 spalni"
  if (data.bedrooms === undefined) {
    const spalni = t.match(/(?:spalni\s*sobi|spalni|sobi|bedrooms?)\s*[:\s]*(\d)/i);
    if (spalni) data.bedrooms = parseInt(spalni[1], 10);
  }
  if (data.bedrooms === undefined) {
    const bareSobi = t.match(/(\d)\s*(?:sobi|spalni)/i);
    if (bareSobi) data.bedrooms = parseInt(bareSobi[1], 10);
  }

  // === FURNISHED ===
  if (/(name[šs]ten|furnished|furnish|so name[šs]taj|opremen|opremljen|mebeliran|pohomebljeno|pohomebljen|pohomebjeno|kompletno opremen)/i.test(t)) {
    data.furnished = 'da';
  } else if (/(praz[ae]n|prazno|bez name[šs]taj|ne e name[šs]ten|nema mebel|nema name[šs]taj|empty)/i.test(t)) {
    data.furnished = 'ne';
  }

  // === HEATING ===
  if (/(centralno|central|centralno greenje|centralno greenje|calefaction|daljinsko|etazno|eta[žz]no|gas|plin|struja)/i.test(t)) {
    if (/(gas|plin)/i.test(t)) data.heating = 'gas';
    else if (/(struja|electric)/i.test(t)) data.heating = 'electric';
    else if (/(eta[žz]no|etazno)/i.test(t)) data.heating = 'etazhno';
    else data.heating = 'central';
  }

  // === AC ===
  if (/(klima|klima ured|ac|air condition|aircondition|ladilnik|hladenje)/i.test(t)) {
    data.ac = true;
  }

  // === PARKING ===
  if (/(garaz[ai]|garage|parking|parking mesto|parking prostor|garage spot)/i.test(t)) {
    if (/(garaz[ai]|garage)/i.test(t)) data.parking = 'garaza';
    else data.parking = 'parking';
  }

  // === ORIENTATION ===
  const oriMap = {
    'sever': 'north', 'север': 'north',
    'jug': 'south', 'jyg': 'south', 'југ': 'south',
    'istok': 'east', 'исток': 'east',
    'zapad': 'west', 'zapd': 'west', 'запад': 'west',
    'severoistok': 'northeast', 'североисток': 'northeast', 'severo istok': 'northeast',
    'severozapad': 'northwest', 'северозапад': 'northwest', 'severo zapad': 'northwest',
    'jugoistok': 'southeast', 'југоисток': 'southeast', 'jugo istok': 'southeast',
    'jugozapad': 'southwest', 'југозапад': 'southwest', 'jugo zapad': 'southwest',
  };
  for (const [word, val] of Object.entries(oriMap)) {
    const re = new RegExp(word, 'i');
    if (re.test(t)) { data.orientation = val; break; }
  }

  // === ELEVATOR ===
  if (/(lift|elevator|лифт|хидрофор|dvigalo)/i.test(t)) {
    data.elevator = true;
  }

  // === YEAR BUILT ===
  const yearMatch = t.match(/(?:godina|izgradba|gradba|zgraden|year|built)\s*[:\s]*(\d{4})/i) ||
                    t.match(/(?:nova|novogradba|novogradnja|новоградба)\s*(?:v[.]?\s*)?(\d{4})/i);
  if (yearMatch) {
    const yr = parseInt(yearMatch[1], 10);
    if (yr > 1950 && yr <= 2030) data.yearBuilt = yr;
  }

  // === DOCUMENTATION ===
  // Only extract documentation status from explicit documentation keywords.
  // NEVER infer from area, terrace, rooms, floor, or other property details.
  // The bare words "cista" (clean) and "dokumentacija" (documentation) are
  // intentionally excluded because they match too broadly — "cista" can appear
  // in "cista soba" (clean room), "cista cena" (net price), etc., and
  // "dokumentacija" can appear in "nema dokumentacija" (no docs) which the
  // negative check might miss. Only compound phrases that unambiguously
  // refer to property documentation are accepted.
  if (/(cista dokumentacija|чиста документација|средена документација|uredna dokumentacija|уредна документација|cist papir|чист папир|cist imoten list|чист имотен лист|cist imoten|чист имотен|cisti dokumenti|чисти документи|vlasnicki list|власнички лист|legalizirano|легализирано|katastar|катастар)/i.test(t) &&
      !/(ne e cista|nemam dokumentaci|problem so dokumentaci|nema dokument|bez dokument|ne e sredeno|не е средено|ima hipoteka|има хипотека)/i.test(t)) {
    data.documentationClean = true;
  }

  // === PHOTOS ===
  if (/(sliki|fotografii|slike|photos|pictures|img|ima sliki)/i.test(t)) {
    data.photos = true;
  }

  // === OWNER NAME ===
  const namePatterns = [
    /(?:jas sum|ime|vika|vikaat|owner|name)\s*(?:mi e|me|mu e|:)?\s*([А-Яа-яA-Za-z]{3,})/i,
    /^([А-Яа-яA-Za-z]{3,})\s*(?:e|od|na|vi|mi)/i,
  ];
  for (const p of namePatterns) {
    const m = t.match(p);
    if (m && !/(kako|shto|zosto|koj|kade|dali|ova|koja|kvie|ne|da|se|ke|bi|po|za|so)/i.test(m[1])) {
      data.ownerName = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      break;
    }
  }

  // === NASELBA ===
  const naselbe = [
    'aerodrom', 'аеродром', 'centar', 'центар', 'karpos', 'карпош', 'karposh',
    'kisela voda', 'кисела вода', 'gazi baba', 'гази баба', 'butel', 'бутел',
    'chair', 'чаир', 'cair', 'shuto orizari', 'шуто оризари', 'suto orizari',
    'saray', 'сарај', 'saraj', 'ilinden', 'илинден',
    'debar maalo', 'дебар маало', 'madzari', 'маџари', 'madari',
    'lisice', 'лисиче', 'lisiche', 'taftalidze', 'тафталиџе', 'taftalidze',
    'vodno', 'водно', 'kapishtec', 'капиштец', 'kapistec',
    'dracevo', 'драчево', 'drachevo',
  ];
  for (const nas of naselbe) {
    const re = new RegExp(nas, 'i');
    if (re.test(t)) { data.naselba = nas.charAt(0).toUpperCase() + nas.slice(1).toLowerCase(); break; }
  }

  // === TERRACE ===
  const terrPatt = t.match(/(\d{1,2})\s*(?:terasa|тераса|terrace|balkon|балкон|lo[đd]a)/i);
  if (terrPatt) data.terraceSqm = parseInt(terrPatt[1], 10);

  // === NETO SQM ===
  const netoPatt = t.match(/(?:neto|нето)\s*(\d{2,3})/i);
  if (netoPatt && !data.netoSqm) data.netoSqm = parseInt(netoPatt[1], 10);

  // === TRANSACTION TYPE ===
  if (/(izdavam|iznamuva|renta|rent|pod zakup|kratok prestoj|iznajmuva|dava pod|na mesec|na den|na nedela|dnevno)/i.test(t)) {
    data.transactionType = 'rent';
  } else if (/(prodavam|продавам|prodadba|продажба|продава|sale|buy|na prodadba|se prodava|kupuva|kupuvam)/i.test(t)) {
    data.transactionType = 'buy';
  }

  // === PROPERTY TYPE ===
  if (/(stan|apartment|flat|гарсониера|garsonjera|garsoniera|ednosoben|dvosoben|trosoben|cetvorosoben)/i.test(t)) {
    data.propertyType = 'apartment';
  } else if (/(kuk[aи]|house|vila|villa|duplex|kukja|kuka|family house|samostoe[nj]?na)/i.test(t)) {
    data.propertyType = 'house';
  } else if (/(posloven|deuren|kancelarija|office|commercial|shopping|dukan|dukjan|lokal|prostor|komercijalen)/i.test(t)) {
    data.propertyType = 'commercial';
  }

  return data;
}

function getEmptyMemory() {
  return {
    available: null, cleanPrice: null, ownerName: null, phone: null,
    address: null, naselba: null, transactionType: null, propertyType: null,
    yearBuilt: null, totalSqm: null, netoSqm: null, terraceSqm: null,
    bedrooms: null, furnished: null, floor: null, totalFloors: null,
    elevator: null, heating: null, ac: null, parking: null,
    orientation: null, documentationClean: null, photos: null
  };
}
