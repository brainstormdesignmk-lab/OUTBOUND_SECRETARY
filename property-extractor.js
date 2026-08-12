// ========================================
// property-extractor.js — Pure extraction functions
// All functions are stateless: (text) => value | null
// No imports needed — pure regex + basic JS only
// ========================================

// ========================================
// Macedonian number words
// ========================================
export function parseMacedonianNumber(text) {
  // For merged forms (no spaces between words) like "peesetisest" → 56,
  // "sedumdesetidva" → 72, "stodvaesetipet" → 125 — very common in Viber/SMS.
  // parseNumberWords handles these correctly with its accumulation logic
  // (finds the tens root, then adds the "i" + ones remainder).
  // Only trigger for text > 3 chars to avoid interfering with short words
  // like "tri" or "pet" that the simple includes() check handles correctly.
  // Lowercased so ALL-CAPS Viber messages ("VTORI", "TRISTAPEESET") match
  // the word map — this function is called from every caller (extractFloor,
  // countBedrooms, scanHistoryForField, extractTerraceNumber, ...), including
  // paths that bypass runGlobalExtraction's normalization.
  const trimmed = text.trim().toLowerCase();
  if (!/\s/.test(trimmed) && trimmed.length > 3) {
    const mergedResult = parseNumberWords(text);
    if (mergedResult !== null) return mergedResult;
  }

  const words = {
    // Cyrillic feminine/neuter "one" (една/едно) were MISSING — only the
    // masculine еден was mapped, so "една плус две" (1+2=3) parsed as 2
    // (две only) and the plus-sum died (reported lead 3571074 bedrooms loop).
    'еден': 1, 'една': 1, 'едно': 1, 'edna': 1, 'eden': 1,
    'два': 2, 'dva': 2,
    'две': 2, 'dve': 2,
    'три': 3, 'tri': 3,
    'четири': 4, 'cetiri': 4,
    'пет': 5, 'pet': 5,
    'шест': 6, 'sest': 6,
    'седум': 7, 'sedum': 7,
    'осум': 8, 'osum': 8,
    'девет': 9, 'devet': 9,
    'десет': 10, 'deset': 10,
    // TEENS 11-19 — full forms PLUS the Viber-truncated forms (reported, lead
    // 3571074: "na peti od dvanaese" = 5th of 12 collected totalFloors=2
    // because the truncated "dvanaese" was missing here and the substring
    // scan fell through to "dva" → 2). The truncated teens drop the final
    // "t" (дванаесет → dvanaese). The words map is scanned LONGEST-FIRST, so
    // each truncated form outranks its unit prefix ("dvanaese" > "dva").
    'edinaeset': 11, 'единаесет': 11, 'edinaese': 11, 'единаесе': 11,
    'dvanaeset': 12, 'дванаесет': 12, 'dvanaese': 12, 'дванаесе': 12,
    'trinaeset': 13, 'тринаесет': 13, 'trinaese': 13, 'тринаесе': 13,
    'cetirinaeset': 14, 'четиринаесет': 14, 'cetirinaese': 14, 'четиринаесе': 14,
    'petnaeset': 15, 'петнаесет': 15, 'petnaese': 15, 'петнаесе': 15,
    'sesnaeset': 16, 'шеснаесет': 16, 'sesnaese': 16, 'шеснаесе': 16,
    'sestnaeset': 16, 'шестнаесет': 16, 'sestnaese': 16, 'шестнаесе': 16,
    'sedumnaeset': 17, 'седумнаесет': 17, 'sedumnaese': 17, 'седумнаесе': 17,
    'osumnaeset': 18, 'осумнаесет': 18, 'osumnaese': 18, 'осумнаесе': 18,
    'devetnaeset': 19, 'деветнаесет': 19, 'devetnaese': 19, 'деветнаесе': 19,
    'ses': 6, 'cetri': 4, 'cetiri': 4,
    'vtor': 2, 'tret': 3, 'cetvrt': 4, 'petti': 5,
    'sesti': 6, 'sedmi': 7, 'osmi': 8, 'devetti': 9,
    'seeset': 60, 'шеесет': 60,
    'peeset': 50, 'пеесет': 50
  };

  const sorted = Object.entries(words).sort((a, b) => b[0].length - a[0].length);
  for (const [word, num] of sorted) {
    if (trimmed.includes(word)) return num;
  }
  return null;
}

// ========================================
// PLUS-ARITHMETIC NUMBER PHRASE — "EDNA PLUS DVE" (one plus two = 3)
// The owner sometimes states a count as a SUM (reported, lead 3571074):
// "EDNA PLUS DVE" answering "Колку спални соби има станот?" means 1+2 = 3
// bedrooms, but parseMacedonianNumber's includes() grabs only the FIRST
// word ("edna"→1) and countBedrooms stored 1 — the "3" was silently lost
// and the confirmation loop re-pended the wrong value. Split on the plus
// markers (плус/plus/+), parse each part, and SUM. Returns null unless the
// phrase has at least two parts AND every part parses — so "edna plus
// terasa" (a terrace mention, not a sum) and plain single words are never
// misread as arithmetic.
// ========================================
export function parsePlusSum(text) {
  const parts = String(text || '').trim().split(/\s*(?:plus|плус|\+)\s*/i);
  if (parts.length < 2) return null;
  let sum = 0;
  for (const part of parts) {
    const n = parseMacedonianNumber(part);
    const nw = n === null ? parseNumberWords(part) : null;
    const v = nw !== null ? nw : n;
    if (v === null) return null;   // any non-number part kills the sum
    sum += v;
  }
  return sum;
}

// ========================================
// Parse number words for price extraction (HUNDREDS + TENS)
// ========================================
export function parseNumberWords(text) {
  const u = text.toLowerCase();

  const numberWords = {
    'eden': 1, 'edna': 1, 'edno': 1,
    'dva': 2, 'dve': 2,
    'tri': 3,
    'cetiri': 4, 'четири': 4,
    'pet': 5, 'пет': 5,
    'sest': 6, 'шест': 6,
    'sedum': 7, 'седум': 7,
    'osum': 8, 'осум': 8,
    'devet': 9, 'девет': 9,
    'deset': 10, 'десет': 10,
    // TEENS 11-19 — full + Viber-truncated forms (reported, lead 3571074:
    // "dvanaese" = 12 was unparseable here, so compound totals like
    // "na peti od dvanaese" fell through to parseMacedonianNumber's "dva"
    // substring match → totalFloors=2). Exact whole-phrase match, so adding
    // them is safe: "trinaese" (13) matches before any "ese"→60 pattern.
    'edinaeset': 11, 'единаесет': 11, 'edinaese': 11, 'единаесе': 11,
    'dvanaeset': 12, 'дванаесет': 12, 'dvanaese': 12, 'дванаесе': 12,
    'trinaeset': 13, 'тринаесет': 13, 'trinaese': 13, 'тринаесе': 13,
    'cetirinaeset': 14, 'четиринаесет': 14, 'cetirinaese': 14, 'четиринаесе': 14,
    'petnaeset': 15, 'петнаесет': 15, 'petnaese': 15, 'петнаесе': 15,
    'sesnaeset': 16, 'шеснаесет': 16, 'sesnaese': 16, 'шеснаесе': 16,
    'sestnaeset': 16, 'шестнаесет': 16, 'sestnaese': 16, 'шестнаесе': 16,
    'sedumnaeset': 17, 'седумнаесет': 17, 'sedumnaese': 17, 'седумнаесе': 17,
    'osumnaeset': 18, 'осумнаесет': 18, 'osumnaese': 18, 'осумнаесе': 18,
    'devetnaeset': 19, 'деветнаесет': 19, 'devetnaese': 19, 'деветнаесе': 19,
    // Truncated Viber forms for the "i {unit}" connector: "osumdeset i ses"
    // (86) — 'ses'/'шес' are shorthand for 'sest'/'шест' (6).
    'ses': 6, 'шес': 6
  };

  for (const [word, num] of Object.entries(numberWords)) {
    if (u.trim() === word) {
      return num;
    }
  }

  const rootMap = {
    'eden': 1, 'edna': 1, 'edno': 1,
    'dva': 2, 'dve': 2,
    'tri': 3,
    'cetiri': 4,
    'pet': 5,
    'sest': 6,
    'sedum': 7,
    'osum': 8,
    'devet': 9,
    // Cyrillic units — "шеесет и четири" (64) must parse the same as the
    // Latin "seeset i cetiri". The connector "и" is handled by the [iи]
    // character class in the suffix regexes below.
    'еден': 1, 'една': 1, 'едно': 1,
    'два': 2, 'две': 2,
    'три': 3,
    'четири': 4,
    'пет': 5,
    'шест': 6,
    'седум': 7,
    'осум': 8,
    'девет': 9,
    'десет': 10,
    // Truncated Viber forms for the "i {unit}" connector: "osumdeset i ses"
    // (86) — 'ses'/'шес' are shorthand for 'sest'/'шест' (6).
    'ses': 6, 'шес': 6
  };
  const rootGroup = '(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)';
  let result = 0;
  let found = false;
  let consumedLength = 0;

  let firstMatchIndex = null;
  const getStoPrefix = () => {
    if (firstMatchIndex !== null && firstMatchIndex !== 0) {
      const beforeMatch = u.slice(0, firstMatchIndex).trim().toLowerCase();
      if (beforeMatch.endsWith('sto') || beforeMatch.endsWith('сто')) return 100;
    }
    return 0;
  };

  const compoundMatch = u.match(new RegExp(
    rootGroup + '\\s*(sto|сто)?\\s*' + rootGroup + '\\s*(eset|есет|ajset|ајсет)', 'i'
  ));
  if (compoundMatch) {
    const hundreds = rootMap[compoundMatch[1].toLowerCase()] || 0;
    const tens = rootMap[compoundMatch[3].toLowerCase()] || 0;
    result = (hundreds * 100) + (tens * 10);
    consumedLength = compoundMatch.index + compoundMatch[0].length;
    firstMatchIndex = compoundMatch.index;
    found = true;
  }

  if (!found) {
    const hundredPatterns = [
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(sto|сто)/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)sto/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)сто/i,
    ];
    for (const pattern of hundredPatterns) {
      const match = u.match(pattern);
      if (match) {
        result = rootMap[match[1].toLowerCase()] * 100;
        consumedLength = match.index + match[0].length;
        firstMatchIndex = match.index;
        found = true;
        break;
      }
    }
  }

  if (!found) {
    // Standalone hundreds (двесте=200, триста=300)
    const standaloneHundreds = {
      'dveste': 200, 'двесте': 200, 'dvesta': 200, 'двеста': 200,
      'trieste': 300, 'тристе': 300, 'trista': 300, 'триста': 300,
    };
    for (const [word, val] of Object.entries(standaloneHundreds)) {
      const idx = u.indexOf(word);
      if (idx !== -1 && !/[a-zа-я]/.test(u[idx + word.length] || '') && !/[a-zа-я]/.test(u[idx - 1] || '')) {
        result = val;
        consumedLength = idx + word.length;
        firstMatchIndex = idx;
        found = true;
        break;
      }
    }
  }

  // ========================================
  // MERGED HUNDREDS+TENS: "dvestaseeset" = 200+60 = 260,
  // "tristapeeset" = 350 (300+50)
  // Very common in Viber/SMS: "tristapeeset i osum iljadi evra" = 358000.
  // Pattern: hundreds prefix merged directly with tens word (no space).
  // Matches at ANY position (with letter-boundary checks) so mid-sentence
  // merged forms are caught BEFORE irregularTens — otherwise irregularTens
  // would substring-match "peeset" (50) inside "tristapeeset" (350) and
  // return 50, corrupting the price (58,000 instead of 358,000).
  // ========================================
  if (!found) {
    const mergedHT = [
      { prefix: /(?:^|[^a-zа-я])(dvest[ea]|двест[аe])/i, hVal: 200 },
      { prefix: /(?:^|[^a-zа-я])(triest[ea]|трист[аe]|trista|триста)/i, hVal: 300 },
      // PHONETIC/VIBER 400-COMPRESSED FORMS (reported): "CETRSTOPEESET" =
      // четир-сто-пеесет (400+50 = 450) — the owner compresses "четиристо"
      // to "cetrsto"/"четирсто" (dropping the i's) in Viber shorthand, and
      // also spells it "cetirsto"/"chetiristo"/"chetirsto" (h for ч), plus
      // the -tini full forms "cetirstotini"/"chetiristotini"/"четирстотини"
      // (dropped-i / h-initial variants of четиристотини). The plain
      // "cetiristotini" entry below never matched these, so "cetrsto" fell
      // through to the irregularTens substring "stopeeset" → 150 instead of
      // 450, and the monthlyRent was skipped after the 2-attempt cap
      // (reported: owner answered "CETRSTOPEESET" → SKIP storing null).
      // ALTERNATION ORDER IS CRITICAL: longest first — "cetiristo" is a
      // prefix of "cetiristotini" and regex alternation tries left-to-right;
      // a short form matching first would leave "tini" as afterHundreds and
      // the letter-after boundary would reject the whole 400 prefix.
      { prefix: /(?:^|[^a-zа-я])(chetiristotini|cetiristotini|cetirstotini|четиристотини|четирстотини|chetiristo|cetiristo|cetirsto|chetirsto|cetrsto|четиристо|четирсто)/i, hVal: 400 },
      { prefix: /(?:^|[^a-zа-я])(petstotini|петстотини)/i, hVal: 500 },
      { prefix: /(?:^|[^a-zа-я])(seststotini|шестстотини)/i, hVal: 600 },
      { prefix: /(?:^|[^a-zа-я])(sedumstotini|седумстотини)/i, hVal: 700 },
      { prefix: /(?:^|[^a-zа-я])(osumstotini|осумстотини)/i, hVal: 800 },
      { prefix: /(?:^|[^a-zа-я])(devetstotini|деветстотини)/i, hVal: 900 },
    ];
    // Tens words sorted longest-first so "seeset" wins over "eeset"/"eset"
    // and "deveeset" over "devedeset" when both could match a prefix.
    const tensWords = ['seeset','шеесет','peeset','пеесет','dvaeset','дваесет',
      'triest','триест','trieset','триесет','pedeset','педесет','osumdeset','осумдесет',
      'sedumdeset','седумдесет','deveeset','девеесет','devedeset','деведесет',
      'osemdeset','осемдесет','stopeeset','стопеесет','stodvaeset','стодваесет',
      // Truncated tens forms (dropped final t/т) — "seese i osum" = 86.
      // Full forms sort before them (longer first), so "seeset" always wins
      // over "seese". Mirrors the irregularTens additions above.
      'seese','шесе','peese','пеесе','dvaese','дваесе','oseese','осеесе',
      'sedumese','седумесе','deveese','девеесе',
      'deset','десет','eeset','еесет','eset','есет']
      .sort((a, b) => b.length - a.length);
    const tensDirectMap = {
      'seeset': 60, 'шеесет': 60, 'eeset': 60, 'еесет': 60,
      'eset': 60, 'есет': 60, 'peeset': 50, 'пеесет': 50,
      'dvaeset': 20, 'дваесет': 20, 'triest': 30, 'триест': 30, 'trieset': 30, 'триесет': 30,
      'pedeset': 50, 'педесет': 50, 'osumdeset': 80, 'осумдесет': 80,
      'sedumdeset': 70, 'седумдесет': 70, 'deveeset': 90, 'девеесет': 90,
      'devedeset': 90, 'деведесет': 90, 'osemdeset': 80, 'осемдесет': 80,
      'deset': 10, 'десет': 10,
      'stopeeset': 150, 'стопеесет': 150, 'stodvaeset': 120, 'стодваесет': 120,
      'seese': 60, 'шесе': 60, 'peese': 50, 'пеесе': 50,
      'dvaese': 20, 'дваесе': 20, 'oseese': 80, 'осеесе': 80,
      'sedumese': 70, 'седумесе': 70, 'deveese': 90, 'девеесе': 90
    };
    for (const { prefix, hVal } of mergedHT) {
      const pMatch = u.match(prefix);
      if (!pMatch) continue;
      // pMatch[1] is the hundreds word (any leading non-letter is a
      // non-capturing boundary). The tens word must IMMEDIATELY follow it
      // (merged form) with a non-letter after it.
      const afterHundreds = u.slice(pMatch.index + pMatch[0].length);
      const wordStart = pMatch.index + (pMatch[0].length - pMatch[1].length);
      let tensFound = false;
      for (const tw of tensWords) {
        // MERGED-CONNECTOR BOUNDARY (reported, lead 5502969): the owner merged
        // hundreds + tens + the "i {unit}" connector into ONE word —
        // "tristaseesetiosum" = "trista seeset i osum" (300+60+8 = 368). The
        // tens word "seeset" is followed DIRECTLY by the connector "i" (no
        // space), which the old boundary check rejected as a letter — so the
        // whole "trista" prefix was dropped and only "seeset" (60) survived
        // via irregularTens → 68,000 instead of 368,000 (reported: WRONG PRICE
        // COLLECTED). Allow i/и right after the tens word — the iBrojMatch
        // suffix handler below consumes it + the unit. Same connector
        // tolerance as the !tensFound fallback ("tristailjadi" = trista +
        // iljadi).
        if (afterHundreds.startsWith(tw) && (!/[a-zа-я]/.test(afterHundreds[tw.length] || '') || /^[iи]/.test(afterHundreds[tw.length] || ''))) {
          const tensVal = tensDirectMap[tw] !== undefined ? tensDirectMap[tw] : parseNumberWords(tw);
          if (tensVal !== null && tensVal >= 10) {
            result = hVal + tensVal;
            consumedLength = pMatch.index + pMatch[0].length + tw.length;
            firstMatchIndex = wordStart;
            found = true;
            tensFound = true;
            break;
          }
        }
      }
      if (!tensFound) {
        // Hundreds prefix without a merged tens suffix (e.g., "trista" alone
        // or "trista iljadi" — a spaced tens is parsed from `remaining` below).
        // Only accept when the next char isn't a letter, so we never match
        // inside an unrelated word ("dvestapati" is not 200). The connector
        // "i"/"и" is allowed ("tristailjadi" = trista + iljadi).
        const nextCh = afterHundreds[0] || '';
        if (nextCh && /[a-zа-я]/.test(nextCh) && !/^[iи]$/.test(nextCh)) continue;
        result = hVal;
        consumedLength = pMatch.index + pMatch[0].length;
        firstMatchIndex = wordStart;
        found = true;
      }
      break;
    }
  }

  if (!found) {
    const irregularTens = {
      'triest': 30, 'триест': 30, 'trieset': 30, 'триесет': 30,
      'pedeset': 50, 'педесет': 50,
      'seeset': 60, 'шеесет': 60,
      'stopeeset': 150, 'стопеесет': 150,
      'stodvaeset': 120, 'стодваесет': 120,
      'deveeset': 90, 'девеесет': 90,
      'devedeset': 90, 'деведесет': 90,
      'osumdeset': 80, 'осумдесет': 80,
      'osemdeset': 80, 'осемдесет': 80,
      'sedumdeset': 70, 'седумдесет': 70,
      'peeset': 50, 'пеесет': 50,
      // TRUNCATED TENS FORMS (reported): "seese i osum kvadrata" = "seeset
      // i osum" (86 m²) — the owner drops the final "t"/"т" of the tens
      // word in Viber shorthand, so "seese"/"шесе" (60) never matched and
      // the whole 86 fell apart (totalSqm lost, the loose "osum" leaked
      // into bedrooms/terrace). The truncated forms are boundary-guarded
      // (letter boundaries both sides) so they can NEVER substring-match
      // inside the FULL forms ("seese" ⊂ "seeset") or inside unrelated
      // words ("trinaese" = 13 must not read "ese"→60 via the eset alias).
      // Full forms above are checked first in this map's iteration order.
      'seese': 60, 'шесе': 60, 'peese': 50, 'пеесе': 50,
      'dvaese': 20, 'дваесе': 20, 'oseese': 80, 'осеесе': 80,
      'sedumese': 70, 'седумесе': 70, 'deveese': 90, 'девеесе': 90
    };
    for (const [word, val] of Object.entries(irregularTens)) {
      const idx = u.indexOf(word);
      if (idx !== -1) {
        result = val;
        consumedLength = idx + word.length;
        firstMatchIndex = idx;
        found = true;
        break;
      }
    }

    // TRUNCATED-FORM BOUNDARY GUARD (reported): "seese i osum kvadrata" =
    // "seeset i osum" (68 m²) — "seese"/"шесе" drop the final "t"/"т" of the
    // tens word. The FULL forms ("seeset" etc.) keep the unguarded legacy
    // substring match above ("stoosumdeset" — a tens word after the "sto"
    // prefix letter — must still match). ONLY the truncated forms get the
    // letter-boundary check, so "seese" can never substring-match inside
    // "seeset", "trinaese" (13 — not "ese"→60), or any unrelated word.
    if (!found) {
      const truncatedTens = {
        'seese': 60, 'шесе': 60, 'peese': 50, 'пеесе': 50,
        'dvaese': 20, 'дваесе': 20, 'oseese': 80, 'осеесе': 80,
        'sedumese': 70, 'седумесе': 70, 'deveese': 90, 'девеесе': 90
      };
      for (const [word, val] of Object.entries(truncatedTens)) {
        const idx = u.indexOf(word);
        if (idx !== -1 &&
            !/[a-zа-я]/.test(u[idx - 1] || '') &&
            !/[a-zа-я]/.test(u[idx + word.length] || '')) {
          result = val;
          consumedLength = idx + word.length;
          firstMatchIndex = idx;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      const tensPatterns = [
        /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(eset|есет)/i,
        /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)eset/i,
        /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)есет/i,
        /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)ajset/i,
        /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)ајсет/i,
      ];
      for (const pattern of tensPatterns) {
        const match = u.match(pattern);
        if (match) {
          result = rootMap[match[1].toLowerCase()] * 10;
          consumedLength = match.index + match[0].length;
          firstMatchIndex = match.index;
          found = true;
          break;
        }
      }
    }
  }

  if (!found) {
    const stoMatch = u.match(/^\s*(sto|сто)\s*$/i);
    if (stoMatch) return 100;
  }

  if (found) {
    let remaining = u.slice(consumedLength).trim();

    // Try "i {unit}" suffix first (most common: "seeset i pet" → 60+5)
    // Both Latin and Cyrillic connector (i/и) and units are accepted:
    // "шеесет и четири" → 64, "седумдесет и осум" → 78.
    // The unit is matched to a WORD BOUNDARY (not \s*$) so a compound-quantity
    // mid-sentence works too: "VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2"
    // → remaining "i ses i terasa..." → "i ses" matches → 80+6 = 86 (reported
    // lead 5540516: 86 m² total with a 3 m² terrace). Truncated "ses"/"шес"
    // (Viber shorthand for "sest"/"шест") are accepted as 6.
    // Boundary is CYRILLIC-AWARE (?=$|[^a-zа-я\d]) — JS `\b` is ASCII-only and
    // silently fails after a Cyrillic unit ("осумдесет и шес" → "и шес" could
    // never match `\b` after the Cyrillic "шес"). The lookahead accepts
    // end-of-string or any non-letter/non-digit (space, punctuation, "и", …)
    // while still refusing a partial match inside a longer word ("i sesnaeset"
    // = 16 must not read "ses" as 6).
    const iBrojMatch = remaining.match(/^[iи]\s*(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset|ses|шес|еден|една|едно|два|две|три|четири|пет|шест|седум|осум|девет|десет)(?=$|[^a-zа-я\d])/i);
    if (iBrojMatch) {
      result += rootMap[iBrojMatch[1].toLowerCase()] || 0;
    }
    // If no "i {unit}" and remaining text exists, try parsing it as tens+units.
    // Handles spaced forms like "dvesta seeset i pet" → 200 + 60 + 5 = 265
    // where only the hundreds word was matched but the tens+units follow.
    else if (remaining) {
      const tensWords = ['seeset','шеесет','peeset','пеесет','dvaeset','дваесет',
        'triest','триест','trieset','триесет','pedeset','педесет','osumdeset','осумдесет',
        'sedumdeset','седумдесет','deveeset','девеесет','devedeset','деведесет',
        'osemdeset','осемдесет','stopeeset','стопеесет','stodvaeset','стодваесет',
        'deset','десет','eeset','еесет','eset','есет'];
      const tensDirectMap = {
        'seeset': 60, 'шеесет': 60, 'eeset': 60, 'еесет': 60,
        'eset': 60, 'есет': 60, 'peeset': 50, 'пеесет': 50,
        'dvaeset': 20, 'дваесет': 20, 'triest': 30, 'триест': 30, 'trieset': 30, 'триесет': 30,
        'pedeset': 50, 'педесет': 50, 'osumdeset': 80, 'осумдесет': 80,
        'sedumdeset': 70, 'седумдесет': 70, 'deveeset': 90, 'девеесет': 90,
        'devedeset': 90, 'деведесет': 90, 'osemdeset': 80, 'осемдесет': 80,
        'deset': 10, 'десет': 10,
        'stopeeset': 150, 'стопеесет': 150, 'stodvaeset': 120, 'стодваесет': 120
      };
      for (const tw of tensWords.sort((a,b) => b.length - a.length)) {
        if (remaining.startsWith(tw)) {
          const tensVal = tensDirectMap[tw] !== undefined ? tensDirectMap[tw] : parseNumberWords(tw);
          if (tensVal !== null && tensVal >= 10) {
            result += tensVal;
            const afterTens = remaining.slice(tw.length).trim();
            // Both Latin and Cyrillic connector (i/и) and units accepted,
            // matching the iBrojMatch above ("dvesta seeset i pet" → 265).
            const unitMatch = afterTens.match(/^[iи]\s*(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|еден|една|едно|два|две|три|четири|пет|шест|седум|осум|девет)\s*$/i);
            if (unitMatch) {
              result += rootMap[unitMatch[1].toLowerCase()] || 0;
            }
          }
          break;
        }
      }
    }

    result += getStoPrefix();
    return result;
  }

  return null;
}

// ========================================
// Ordinal floors (прв=1, втор=2, etc.)
// ========================================
export function parseOrdinalFloor(text) {
  const ordinals = {
    'приземје': 0, 'prizemje': 0,
    'прв': 1, 'prv': 1,
    'втор': 2, 'vtor': 2,
    'трет': 3, 'tret': 3,
    'четврт': 4, 'cetvrt': 4,
    'петти': 5, 'petti': 5, 'peti': 5,
    'шести': 6, 'sesti': 6,
    'седми': 7, 'sedmi': 7,
    'осми': 8, 'osmi': 8,
    'деветти': 9, 'devetti': 9
  };

  // Lowercased so ALL-CAPS Viber messages ("VTORI KAT") match the ordinal
  // map — this function is called from every caller (extractFloor,
  // scanHistoryForField, extractCompoundFloor, ...), including paths that
  // bypass runGlobalExtraction's normalization.
  const lt = text.toLowerCase();
  for (const [word, num] of Object.entries(ordinals)) {
    if (lt.includes(word)) return num;
  }
  return null;
}

// ========================================
// Viber ordinal-suffix numbers — "5TI" = 5th, "13TI" = 13th, "1VI" = 1st,
// "2RI" = 2nd, "7MI" = 7th, "8MI" = 8th, "20TI" = 20th (reported, lead
// pz186272900: owner answered "5TI OD 13" and the floor was NOT recognized
// — Ana re-asked). Viber/SMS owners abbreviate Macedonian ordinals as a
// digit + the ordinal suffix (ти/ti, ви/vi, ри/ri, ми/mi — matching the
// word forms петти/втори/седми/осми). The digit IS the ordinal value, so
// "5TI" → 5. Returns null unless the whole token is exactly digit + one of
// the known suffixes (no boundary tricks) — a bare digit "5" and a spelled
// ordinal "петти" keep their own paths, and "5ti" can never leak into
// unrelated words because the token must be ENTIRELY the digit+suffix.
// ========================================
export function parseViberOrdinalSuffix(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})(?:ti|ти|vi|ви|ri|ри|mi|ми)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (n >= 0 && n <= 50) ? n : null;
}

// ========================================
// Positive/Negative answer detection
// ========================================
export function isPositive(text) {
  return /^da$|^ima$|da ima|има|да|yes|ok|moze|може|ke|ќе|normalno|нормално|seka|сека|sekako|секако|naravno|наравно|normal|нормално|ima|има|da|ok|da be|да бе|ima klima|има клима|normalno deka ima|нормално дека има|fala bogu|фала богу|fala|фала|hvala|хвала|ima terasa|има тераса|terasa|тераса|ima na oglasot|има на огласот|sakate|сакате|ke pratam|ќе пратам|pratam|пратам|imam|имам|moze da koristite|може да користите|slobodno|слободно|da ima|да има|komplet|ful|full|kompletno|celosno|целосно|m paket|м пакет|top namesten|топ наместен|namesten|наместен|opremen|опремен|namestaj|мебел|kompletno namesten|комплетно наместен|ke vi pratam|ќе ви пратам|ke pratam|ќе пратам|moze da pratam|може да пратам|ke ispratam|ќе испратам|ke pushtam|ќе пуштам|ima na oglas|има на оглас|se prodava|се продава|na istata|на истата|normalno-|нормално-|normalno |нормално /i.test(text);
}

export function isNegative(text) {
  return /^ne$|nema|нема|no|не|нега|без|ne|nema|не,|nema|нема|bez|без|nema terasa|нема тераса|nema parking|нема паркинг|nemam|немам|nemame|немаме|nema|нема|ne moze|не може|ne sakam|не сакам|nema sliki|нема слики|bez sliki|без слики|ne e|не е|ne|не|prav|прав|prazen|правен|gol|гол|nenamesten|ненаместен|prazno|празно|gola sostojba|гола состојба|bez namestaj|без мебел|ne e namesten|не е наместен|ne e renoviran|не е реновиран|ne e cist|не е чист|nema fotografi|нема фотографии|nema sliki|нема слики|ne sakam|не сакам|ne mi treba|не ми треба|ne sum zainteresiran|не сум заинтересиран|ostavi|остави|ne me interesira|не ме интересира|izvini|извини|nemam momentalno|немам моментално|ne se|не се|neaktuelni|неактуелни|novi|нови|novo|ново|ne se aktuelni|не се актуелни|ne se isti|не се исти|novi se|нови се|ti kazav|ти кажав|kazav|кажав|rekov|реков|ne e renoviran|не е реновиран|ne e renovirano|не е реновирано|nema renovirano|нема реновирано|ne renoviran|не реновиран/i.test(text);
}

// ========================================
// Extract first number from text
// ========================================
export function extractFirstNumber(text) {
  const numbers = text.match(/\d{1,4}/g);
  if (numbers && numbers.length > 0) {
    return parseInt(numbers[0]);
  }
  return null;
}

// ========================================
// Count bedrooms
// ========================================
export function countBedrooms(text) {
  const u = text.toLowerCase();

  // ORDINAL + FLOOR CONTEXT (reported): the owner is answering the FLOOR
  // question, never bedrooms — "vtori kat", "на втори од 7" (2nd of 7
  // floors), "osmi od deset". Two constructions:
  //   a) ordinal + kat/sprat ("vtori kat")
  //   b) ordinal + "od N" compound floor ("vtori od 7" / "втори од 7")
  //   c) VIBER ORDINAL-SUFFIX (reported, lead pz186272900): digit+ordinal
  //      suffix — "5TI OD 13" (5th of 13 floors), bare "13TI" — the suffix
  //      TI/ти/VI/ви/RI/ри/MI/ми marks an ORDINAL floor, never a bedroom
  //      count, so "5TI OD 13" must not phantom as bedrooms=5 (extractFirst
  //      Number reads the "5" via the digit fallback below).
  // Used by BOTH fallback paths below — the word-number path (parseMacedonian
  // Number handles the Latin "vtor") AND the digit path (Cyrillic "втори" is
  // NOT in parseMacedonianNumber's word map, so "на втори од 7" falls through
  // to extractFirstNumber → 7, which would otherwise phantom as bedrooms=7).
  const hasOrdinalContext = /(treti|трети|tret|трет|vtori|втори|vtor|втор|prvi|први|prv|прв|cetvrti|четврти|cetvrt|четврт|petti|петти|sesti|шести|sedmi|седми|osmi|осми|devetti|деветти)\s*(kat|кат|sprat|спрат|od\s+\d{1,3}|од\s+\d{1,3}|od\s+[a-zа-я]+|од\s+[a-zа-я]+)|\d{1,2}\s*(ti|ти|vi|ви|ri|ри|mi|ми)(?![a-zа-я\d])/i;

  if (/garsonjera|гарсонера|гарсоњера|garsoniera|гарсониера/i.test(u)) return 0;
  if (/dvosoben|двособен/i.test(u)) return 1;
  if (/trisoben|трисобен|trosoben/i.test(u)) return 2;
  if (/cetvorosoben|четирисобен|cetvortosoben/i.test(u)) return 3;
  if (/petsoben|петсобен/i.test(u)) return 4;

  const roomWords = [
    'spalna', 'спална', 'spalni', 'спални',
    'detska', 'детска', 'detski', 'детски',
    'gostinska', 'гостинска', 'gostinski', 'гостински',
    'bracna', 'брачна', 'brachna',
    'pomala', 'помала', 'pomali', 'помали',
    'pogolema', 'поголема', 'pogolemi', 'поголеми',
    'roditelska', 'родителска', 'roditelski', 'родителски'
  ];
  let roomCount = 0;
  for (const word of roomWords) {
    const matches = u.match(new RegExp(word, 'gi'));
    if (matches) roomCount += matches.length;
  }

  // Multi-room list: "dve golemi i edna detska" → 3, "tri golemi spalni i edna detska" → 4
  // Runs BEFORE roomCount >= 2 check because this parser can detect MORE bedrooms than
  // room types (e.g., 3 large bedrooms + 1 children's room = 4, but room types = 2).
  // Split on commas or standalone "i"/"и" with spaces around them (NOT bare "i" inside
  // words like "spalni", which would incorrectly split a room word).
  const roomSegments = u.split(/\s*,\s*|\s+(?:i|и)\s+/);
  if (roomSegments.length >= 2) {
    let roomsFromList = 0;
    // OTHER-FIELD UNITS GUARD (reported): "seese i osum kvadrata so terasa
    // golema" (86 m² with a large terrace) split on " i " into ["seese",
    // "osum kvadrata so terasa golema"] — the second segment matches the
    // room-regex ("golema") and parseMacedonianNumber's substring matching
    // read "osum"→8, storing a phantom bedrooms=8. The word-number fallback
    // below already skips other-field context (kvadrata/terasa/m2/price/floor);
    // the roomSegments branch (which returns EARLY at >= 2) must apply the
    // SAME guard per segment. A genuine multi-room answer ("dve spalni i
    // edna detska") has no sqm/terrace/price words and is untouched.
    const otherFieldUnits = /m2|м2|m²|кв|kvadrati|квадрати|kvadrata|квадрата|kvadrat|квадрат|sqm|kat|кат|sprat|спрат|evra|евра|iljadi|илјади|parking|паркинг|garaza|гаража|lift|лифт|klima|клима|terasa|тераса|teras|терас|terrace|zosto|зошто|zasto|зашто|godina|година|izgraden|граден/i;
    for (const seg of roomSegments) {
      // Skip segments that are really about another field (sqm total, terrace,
      // price, floor, year...) — a number word there belongs to THAT field.
      if (otherFieldUnits.test(seg)) continue;
      if (/(spaln|спалн|detsk|детск|gostinsk|гостинск|golem|голем|mala|мала|soba|соба|sobi|соби|bracn|брачн|brachn|pomal|помал|pogolem|поголем|roditelsk|родителск)/i.test(seg)) {
        const num = parseMacedonianNumber(seg);
        if (num !== null && num >= 1 && num <= 20) {
          roomsFromList += num;
        }
      }
    }
    if (roomsFromList >= 2) return roomsFromList;
  }

  if (roomCount >= 2) return roomCount;

  // Digit before room word: '2 spalni', '2 спални' etc.
  const digitRoomMatch = u.match(/(\d+)\s+(spalni|спални|spalna|спална|detski|детски|detska|детска|gostinski|гостински|gostinska|гостинска)/i);
  if (digitRoomMatch) {
    const n = parseInt(digitRoomMatch[1]);
    if (n >= 1 && n <= 20) return n;
  }

  const numberRoomMatch = u.match(/([a-zа-я]+)\s+(spalni|спални|spalna|спална|detski|детски|detska|детска|gostinski|гостински|gostinska|гостинска)/i);
  if (numberRoomMatch) {
    const num = parseMacedonianNumber(numberRoomMatch[1]);
    if (num !== null && num >= 1 && num <= 20) return num;
    const digitMatch = numberRoomMatch[1].match(/\d+/);
    if (digitMatch) {
      const n = parseInt(digitMatch[0]);
      if (n >= 1 && n <= 20) return n;
    }
  }

  // TIME-SPAN GUARD (shared by the plus-arithmetic branch AND the word
  // fallback below): the owner may talk about HOW LONG something takes
  // ("mesec dva" = a month or two, "nedela dve" = a week or two, "dva dena"
  // = two days, "tri meseci" = three months). Those number words are TIME
  // amounts, NOT bedroom counts. Only ADJACENT unit+number / number+unit
  // pairs trigger, so a genuine bedroom answer that merely mentions time
  // elsewhere in the sentence is left alone. Declared here so the plus
  // branch above the word fallback can use it too (a const in the TDZ
  // would throw — reviewer finding: "mesec dva plus edna nedela" summed to 3).
  const timeSpanRe = /(?:mesec|месец|meseci|месеци|nedela|недела|nedeli|недели|dena|дена|denovi|денови|cas|час|casovi|часови|sati|сати|godina|година|godini|години)\s+(?:\d+|eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset|еден|една|едно|два|две|три|четири|пет|шест|седум|осум|девет|десет)|(?:\d+|eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet|deset|еден|една|едно|два|две|три|четири|пет|шест|седум|осум|девет|десет)\s+(?:meseca|месеца|meseci|месеци|nedela|недела|nedeli|недели|dena|дена|denovi|денови|cas|час|casa|часа|sati|сати|godina|година|godini|години)/i;

  // PLUS-ARITHMETIC (reported, lead 3571074): "EDNA PLUS DVE" (one plus two
  // = 3) — the owner states the bedroom count as a SUM. parseMacedonianNumber
  // below grabs only the first word ("edna"→1) and the "3" was lost (stored
  // 1 → wrong confirmation loop). parsePlusSum splits on plus/плус/+ and sums
  // the parts; it returns null unless every part parses, so "edna plus
  // terasa" and other non-sum phrases fall through untouched.
  const plusSum = parsePlusSum(u);
  if (plusSum !== null && plusSum >= 1 && plusSum <= 20) {
    // Reuse the word-fallback context guards (terrace, year, other-field
    // units, TIME-SPAN) — a plus phrase inside an sqm/price sentence or a
    // time amount ("mesec dva plus edna nedela" = a month or two plus a
    // week, NOT bedrooms) is NOT a bedroom count. timeSpanRe is required
    // here exactly like the word fallback below (reviewer finding: its
    // absence let "mesec dva plus edna nedela" sum to 3).
    if (/terasa|тераса|teras|терас|zosto|зошто|zasto|зашто/i.test(u)) return null;
    if (/izgraden|граден|osumdesti|осумдесетти|osumdeseti|осумдесети|osumdeset|осумдесет|godina|година|gradba|градба|graden|граден|pedesetti|педесетти|deveesetti|девеесетти|deveeseti|девеесети|deveeset|девеесет|devedeseti|деведесети|sedumdesetti|седумдесетти|sedumdeseti|седумдесети|sedumdeset|седумдесет/i.test(u)) return null;
    if (/m2|м2|кв|kvadrati|квадрати|kvadrata|квадрата|kvadrat|квадрат|sqm|kat|кат|sprat|спрат|evra|евра|iljadi|илјади|parking|паркинг|garaza|гаража|lift|лифт|klima|клима/i.test(u)) return null;
    if (timeSpanRe.test(u)) return null;
    return plusSum;
  }

  // Fallback: parse word number (e.g. 'dve spalni' → 2, 'tri' → 3)
  // BUT skip if the word number is actually an ordinal floor reference (tret kat, vtor sprat)
  // OR if the message is about a different field (terrace follow-up, question words)
  // OR if the message has year/decade context ("osumdesti" → 1980s, not 8 bedrooms)
  //
  const wordNum = parseMacedonianNumber(u);
  if (wordNum !== null && wordNum >= 0 && wordNum <= 10) {
    // Skip if the only number words are actually ordinal floor references
    // Inflected ordinal forms (vtori/втори, treti/трети, prvi/први) as well
    // as bare ordinals — "vtori kat" must never count as bedrooms=2.
    // COMPOUND-FLOOR FORM (reported): "NA VTORI OD 7" (2nd of 7 floors) — the
    // ordinal is bound to "od N", not to kat/sprat, so the old guard missed it
    // and the substring-matched "vtor"→2 leaked through as a phantom
    // bedrooms=2. (Regex shared with the digit fallback below.)
    if (hasOrdinalContext.test(u)) return null;
    // Skip if message contains terrace or question context (answering terrace/other follow-up)
    // Uses |teras|терас to match ALL inflected forms (terasa, terasi, terase, etc.)
    if (/terasa|тераса|teras|терас|zosto|зошто|zasto|зашто/i.test(u)) return null;
    // Skip if message contains year/decade context — "osumdesti" (1980s) should
    // NOT be interpreted as 8 bedrooms. "osum" is a substring of "osumdesti"
    // and parseMacedonianNumber would return 8, but the context is year/decade.
    if (/izgraden|граден|osumdesti|осумдесетти|osumdeseti|осумдесети|osumdeset|осумдесет|godina|година|gradba|градба|graden|граден|pedesetti|педесетти|deveesetti|девеесетти|deveeseti|девеесети|deveeset|девеесет|devedeseti|деведесети|sedumdesetti|седумдесетти|sedumdeseti|седумдесети|sedumdeset|седумдесет/i.test(u)) return null;
    // Skip if the message has OTHER-FIELD units/context — a number word in an
    // sqm/floor/price sentence ("seeset i cetiri kvadrati" = 64 m²) belongs
    // to that field, not bedrooms. "cetiri" inside the compound "seeset i
    // cetiri" must NOT become bedrooms=4 (reported production bug).
    if (/m2|м2|кв|kvadrati|квадрати|kvadrata|квадрата|kvadrat|квадрат|sqm|kat|кат|sprat|спрат|evra|евра|iljadi|илјади|parking|паркинг|garaza|гаража|lift|лифт|klima|клима/i.test(u)) return null;
    // TIME-SPAN: "mesec dva", "nedela dve", "dva dena", "tri meseci" —
    // the number word is a time amount, not a bedroom count.
    if (timeSpanRe.test(u)) return null;
    return wordNum;
  }
  const firstNum = extractFirstNumber(u);
  if (firstNum !== null && firstNum >= 0 && firstNum <= 20) {
    // Skip if message contains other-field context (sqm, floor, terrace, price)
    // 'iljadi' included: "cena 15 iljadi, golem stan" must NOT set bedrooms=15
    // (a price digit leaking into bedrooms via this fallback).
    // TERRACE INFLECTIONS (reported): the word-number fallback above already
    // uses |teras|терас (matches ALL inflections); the digit fallback only had
    // "terasa" — so "imaima terasi 2" (2 terraces) leaked bedrooms=2 through
    // this path. Use |teras|терас here too for consistency.
    // PARKING/GARAGE (reported): "parking mesto na -1 vo centar" extracted
    // bedrooms=1 from the garage LEVEL. The word-number fallback above
    // already skips parking context; the digit fallback must too.
    if (/m2|м2|кв|kvadrati|квадрати|sqm|kat|кат|sprat|спрат|teras|терас|m²|evra|евра|iljadi|илјади|parking|паркинг|garaza|гаража/i.test(u)) return null;
    // ORDINAL + FLOOR CONTEXT (reported): "на втори од 7" (Cyrillic) reaches
    // THIS digit fallback because parseMacedonianNumber has no Cyrillic
    // "втор" in its word map — the word-number guard above never fired, and
    // extractFirstNumber read "7" as bedrooms. Same ordinal-context guard.
    if (hasOrdinalContext.test(u)) return null;
    // NEGATIVE-LEVEL GUARD (reported): "-1"/"na -1"/"на -2" is a basement
    // or parking level, never a bedroom count. extractFirstNumber strips the
    // minus ("-1" → 1), so the guard must run here.
    if (/-\s*\d/.test(u)) return null;
    // TIME-SPAN: "mesec 2", "2 dena" — time, not bedrooms.
    if (timeSpanRe.test(u)) return null;
    return firstNum;
  }

  if (roomCount === 1) return 1;

  return null;
}

// ========================================
// Extract price (handles all formats)
// ========================================
export function extractPrice(text) {
  const u = text.toLowerCase();

  // TOTAL-PREFERENCE (reported requirement): "2000 e za m2, vkupno 185000
  // evra" — when a total marker (vkupno/вкупно/total/ukupno) binds a DIGIT
  // number, that number is the total price and must win over the first
  // number (the per-m² quote). Requires a price indicator (currency) or a
  // large number (≥1000) so "vkupno 7 sprata" / "vkupno 86 kvadrati" can
  // never be read as a price. "vkupno 200 iljadi evra" stays 200000 (the
  // iljadi suffix multiplies).
  // SQUARE-UNIT GUARD (code review): "вкупно 2000 м2" / "вкупно 2000
  // квадрати" state a square-meter TOTAL (realistic for land/commercial),
  // not a price — the negative lookahead after the number rejects any
  // square/floor/terrace unit so only currency-bound or bare large totals
  // pass.
  const totalMatch = u.match(/(?:vkupno|вкупно|total|ukupno)\s*[^\d]{0,14}(\d{3,7}|\d{1,3}(?:[.,]\d{3})*)(?!\s*(?:m2|м2|kvadrat|квадрат|kvadrata|квадрата|kvadrati|квадрати|кв|kv|sprata|спрата|sprat|спрат|kat|кат|terasi|тераси|meseci|месеци))\s*(?:evra|евра|evro|евро|eur|е|e|iljadi|илјади)?/i);
  if (totalMatch) {
    const raw = totalMatch[1].replace(/[.,\s]/g, '');
    let totalNum = parseInt(raw, 10);
    const suffix = (totalMatch[2] || '').toLowerCase();
    if (/iljadi|илјади/.test(suffix)) totalNum *= 1000;
    // Currency = a REAL price word only — the bare "е"/"e" (the Macedonian
    // verb "is") is too ambiguous to unlock a small number as a price
    // ("вкупно 300 е" stays rejected; "вкупно 185000 е" still passes on
    // size alone).
    const hasCurrency = /evra|евра|evro|евро|eur|€|iljadi|илјади/.test(suffix);
    if (totalNum >= 1000 || (hasCurrency && totalNum >= 100)) return totalNum;
  }

  const millionWordMatch = u.match(/(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionWordMatch) {
    const numMap = {
      'eden': 1, 'edna': 1, 'edno': 1,
      'dva': 2, 'dve': 2,
      'tri': 3,
      'cetiri': 4,
      'pet': 5,
      'sest': 6,
      'sedum': 7,
      'osum': 8,
      'devet': 9
    };
    let total = numMap[millionWordMatch[1].toLowerCase()] * 1000000;

    const thousandPatterns = [
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(iljadi|илјади)/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)iljadi/i,
      /(eden|edna|edno|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)илјади/i,
      /(dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)\s*(iljadi|илјади)/i,
    ];

    let thousandNum = null;
    for (const pattern of thousandPatterns) {
      const match = u.match(pattern);
      if (match) {
        const map = {
          'eden': 1, 'edna': 1, 'edno': 1,
          'dva': 2, 'dve': 2,
          'tri': 3,
          'cetiri': 4,
          'pet': 5,
          'sest': 6,
          'sedum': 7,
          'osum': 8,
          'devet': 9
        };
        thousandNum = map[match[1].toLowerCase()] || 0;
        break;
      }
    }

    if (thousandNum === null) {
      const compoundThousand = u.match(/([a-zа-я]+)\s*(iljadi|илјади)/i);
      if (compoundThousand) {
        const parsed = parseNumberWords(compoundThousand[1]);
        if (parsed !== null) {
          thousandNum = parsed;
        }
      }
    }

    if (thousandNum !== null && thousandNum > 0) {
      total += thousandNum * 1000;
    }

    return total;
  }

  const iljadiIdx = u.search(/\b(iljadi|илјади)\b/i);
  if (iljadiIdx !== -1) {
    const beforeIljadi = u.slice(0, iljadiIdx).trim();
    const words = beforeIljadi.split(/\s+/);
    for (let i = Math.min(words.length, 10); i >= 1; i--) {
      const phrase = words.slice(-i).join(' ');
      const parsed = parseNumberWords(phrase);
      if (parsed !== null && parsed > 0) {
        const lastWord = words[words.length - 1];
        const singleWord = parseNumberWords(lastWord);
        if (singleWord !== null && singleWord > parsed) continue;
        const result = parsed * 1000;
        console.log({ raw: text, normalized: u, beforeIljadi, phrase, parsedNumber: parsed, result });
        return result;
      }
    }
  }

  const iljadiNoSpaceMatch = u.match(/(\d{1,3})iljadi/i);
  if (iljadiNoSpaceMatch) return parseInt(iljadiNoSpaceMatch[1]) * 1000;

  const iljadiSpaceMatch = u.match(/(\d{1,3})\s*iljadi/i);
  if (iljadiSpaceMatch) return parseInt(iljadiSpaceMatch[1]) * 1000;

  const iljadiNoSpaceEvraMatch = u.match(/(\d{1,3})iljadi\s*evra?/i);
  if (iljadiNoSpaceEvraMatch) return parseInt(iljadiNoSpaceEvraMatch[1]) * 1000;

  const iljadiSpaceEvraMatch = u.match(/(\d{1,3})\s*iljadi\s*evra?/i);
  if (iljadiSpaceEvraMatch) return parseInt(iljadiSpaceEvraMatch[1]) * 1000;

  const iljadiNoSpaceEvMatch = u.match(/(\d{1,3})iljadi\s*ev/i);
  if (iljadiNoSpaceEvMatch) return parseInt(iljadiNoSpaceEvMatch[1]) * 1000;

  const iljadiSpaceEvMatch = u.match(/(\d{1,3})\s*iljadi\s*ev/i);
  if (iljadiSpaceEvMatch) return parseInt(iljadiSpaceEvMatch[1]) * 1000;

  const cyrillicNoSpaceMatch = u.match(/(\d{1,3})илјади/i);
  if (cyrillicNoSpaceMatch) return parseInt(cyrillicNoSpaceMatch[1]) * 1000;

  const cyrillicSpaceMatch = u.match(/(\d{1,3})\s*илјади/i);
  if (cyrillicSpaceMatch) return parseInt(cyrillicSpaceMatch[1]) * 1000;

  const cyrillicNoSpaceEvraMatch = u.match(/(\d{1,3})илјади\s*евра?/i);
  if (cyrillicNoSpaceEvraMatch) return parseInt(cyrillicNoSpaceEvraMatch[1]) * 1000;

  const cyrillicSpaceEvraMatch = u.match(/(\d{1,3})\s*илјади\s*евра?/i);
  if (cyrillicSpaceEvraMatch) return parseInt(cyrillicSpaceEvraMatch[1]) * 1000;

  const iljadiTypoMatch = u.match(/(\d{1,3})iljade/i);
  if (iljadiTypoMatch) return parseInt(iljadiTypoMatch[1]) * 1000;

  const iljadeSpaceMatch = u.match(/(\d{1,3})\s*iljade/i);
  if (iljadeSpaceMatch) return parseInt(iljadeSpaceMatch[1]) * 1000;

  const millionMatch = u.match(/(\d+[.,]?\d*)\s*(miliona|miljon|милиона|милион|milion)/i);
  if (millionMatch) {
    let num = parseFloat(millionMatch[1].replace(',', '.'));
    const iljadiPart = u.match(/(?:i|плус|plus)\s*(\d+[.,]?\d*)\s*(iljadi|илјади)/i);
    if (iljadiPart) {
      const iljadiNum = parseFloat(iljadiPart[1].replace(',', '.'));
      return Math.round((num * 1000000) + (iljadiNum * 1000));
    }
    return Math.round(num * 1000000);
  }

  const decimalMillionMatch = u.match(/(\d+[.,]\d+)\s*(miliona|miljon|милиона|милион)/i);
  if (decimalMillionMatch) {
    const num = parseFloat(decimalMillionMatch[1].replace(',', '.'));
    return Math.round(num * 1000000);
  }

  if (/miliona|милиона|miljon|милион/i.test(u) && !u.match(/\d+/)) {
    return 1000000;
  }

  // Before the aggressive cleanup fallback, check for non-price context words
  // (sqm, floor, terrace, etc.) WITHOUT any price indicators.
  // Prevents false positives like "100 m2, 3 kat" → cleanPrice=100.
  const uClean = text.toLowerCase();
  const hasPriceKeywords = /iljadi|илјади|evra|евра|evri|еври|eur|evro|евро|cena|цена|plate|плате|plakja|плаќа|kirija|кирија/i.test(uClean);
  // NON-PRICE CONTEXT WORDS (sqm/floor/room/terrace/year/...): a message
  // describing those fields must never be read as a price — "100 m2, 3 kat"
  // is not 100€. Hoisted OUT of the !hasPriceKeywords block (reviewer
  // finding): the bare WORD fallback below must also respect it even when a
  // price keyword is present — "kirijata e dogovor, ima dvesta kvadrati"
  // (rent by agreement; 200 is the sqm) contains "kirija" but the number
  // word "dvesta" belongs to "kvadrati", not the rent.
  const hasNonPriceContext = /m2|м2|kvadrati|квадрати|kvadrata|квадрата|kv|кв|sqm|kat|кат|sprat|спрат|katnica|катница|lift|лифт|klima|клима|garaza|гаража|terasa|тераса|spalni|спални|parking|паркинг|garage|гараж|potkrovje|поткровје|zgrada|зграда|godina|година|izgraden|изграден|graden|граден|renoviran|реновиран|renovira|реновира|obnoven|обновен|osvezen|освежен/i.test(uClean);
  if (!hasPriceKeywords && hasNonPriceContext) return null;

  // DATE GUARD (reported): the owner answers the availableFrom question with
  // "OD 7.15.2026" — a DATE, never a price. Without this guard the aggressive
  // digit-cleanup fallback below strips the separators and returns 7152026 as
  // a phantom monthly rent (stored as monthlyRent=7152026). Fire only when NO
  // price keyword is present — a message quoting BOTH a price and a date
  // ("kirijata 300 evra, od 7.15.2026") must still yield 300.
  //   - "od/од/na/на" + day.month(.year) — the standard date-answer shape
  //     ("od 7.15", "od 07.15", "od 7 15", "od 7.15.2026", "od 15.07.2026");
  //     the (?!\d) after the second group keeps "od 15.000 evra" (15000€,
  //     thousands separator) safe — a digit follows "15.00".
  //   - bare day.month.year ("7.15.2026" without "od")
  //   - ISO "2026-07-15"
  if (!hasPriceKeywords) {
    const datePattern = /(?:od|од|na|на)\s+\d{1,2}[./\s]+\d{1,2}(?!\d)(?:[./\s]+(?:19|20)\d{2})?|\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}|\d{4}-\d{2}-\d{2}/i;
    if (datePattern.test(uClean)) return null;
  }

  // BARE WORD-NUMBER PRICE (reported): the owner answers the price/rent
  // question with a pure number WORD and no currency — "CETRSTOPEESET"
  // (четирсто пеесет = 450). The digit fallback below requires digits and
  // returned null, so monthlyRent was never extracted and the field hit the
  // 2-attempt cap → SKIP storing null. Parse the whole text as a Macedonian
  // number word; require a plausible price magnitude so small counts ("tri"
  // bedrooms, "sedum" floors) can never phantom as a price. With a price
  // keyword present (evra/iljadi/cena/kirija) accept >= 10 ("deset evra");
  // without one require >= 50 ("dvesta" = 200€ rent is a price, "tri" = 3
  // is not).
  // GUARDS (reviewer finding): fire ONLY on pure word answers — (1) no
  // digits at all, so an explicit digit price ("300 evra, dvesta" → 300,
  // never 200 from the "dvesta" word) is never shadowed; (2) no non-price
  // context words, so "… dvesta kvadrati" (sqm answer) and "… tret sprat"
  // (floor answer) never phantom as prices even when a price keyword
  // appears elsewhere in the sentence.
  //
  // CURRENCY-BOUND WORD PRICE (reported, lead 3571074): "cetrsto dvaeset
  // evra + davacki , parking poc" (420€ + fees, POC parking) — the owner
  // answered the rent question with a clear word price and VOLUNTEERED
  // extra details in the same message. The global hasNonPriceContext guard
  // used to block ANY word-price when a non-price word ("parking") appeared
  // anywhere, so the first ask collected nothing and Ana re-asked ("Само да
  // потврдам, колкава е месечната кирија?") → owner annoyed ("ti kazav
  // cetrsto dvaeset evra mesecno"). A number-word phrase DIRECTLY followed
  // by a currency word (evra/евра/evro/евро/eur/evri/еври — the dialectal
  // plural) is an unambiguous price: extract it BEFORE the non-price-context
  // guard. The guard still protects genuinely ambiguous numbers ("dvesta
  // kvadrati", "tret sprat") — those carry no currency word. A non-price
  // word within 2 tokens BEFORE the phrase rejects it ("terasa e cetrsto
  // evra" = the terrace is 400€, a terrace price — the noun binds the
  // number, not a rent). The noun list includes the definite-article forms
  // (terasata/терасата, klimata/климата, garazata/гаражата, spalnite/спалните,
  // parkingot/паркингот — the most common in real speech) so "terasata e
  // cetrsto evra" is also rejected; rarer inflections (terasite, klimata
  // variants) are a known limitation of exact-token matching, consistent with
  // the codebase's exact-word style.
  const currencyBoundWordPrice = (() => {
    const tokens = uClean.split(/[\s,;:]+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length) {
      if (parseNumberWords(tokens[i]) === null) { i++; continue; }
      // Extend the run over number words + the "i"/"и" connector
      let j = i;
      while (j < tokens.length && (parseNumberWords(tokens[j]) !== null || /^[iи]$/i.test(tokens[j]))) j++;
      // Currency within the next 2 tokens?
      const after = tokens.slice(j, j + 2);
      const currencyAdjacent = after.some(t => /^(?:evra|евра|evro|евро|eur|evri|еври)$/i.test(t));
      if (currencyAdjacent) {
        // Non-price noun immediately BEFORE the phrase ("terasa e cetrsto
        // evra") rejects the currency-bound reading. Definite-article forms
        // (terasata/терасата, klimata/климата, garazata/гаражата,
        // spalnite/спалните, parkingot/паркингот) are listed explicitly —
        // "терасата е четирсто евра" (THE terrace is 400€) must reject the
        // same as the bare noun.
        const before = tokens.slice(Math.max(0, i - 2), i);
        const nounAdjacent = before.some(t => /^(?:m2|м2|kvadrati|квадрати|kvadrata|квадрата|kv|кв|sqm|kat|кат|sprat|спрат|katnica|катница|lift|лифт|klima|клима|klimata|климата|garaza|гаража|garazata|гаражата|terasa|тераса|terasata|терасата|terasite|терасите|spalni|спални|spalnite|спалните|parking|паркинг|parkingot|паркингот|garage|гараж|potkrovje|поткровје|zgrada|зграда|zgradata|зградата|godina|година|godinata|годината|izgraden|изграден|graden|граден|renoviran|реновиран|renovira|реновира|obnoven|обновен|osvezen|освежен)$/i.test(t));
        if (!nounAdjacent) {
          const pv = parseNumberWords(tokens.slice(i, j).join(' '));
          if (pv !== null && pv >= 10) return pv;
        }
      }
      i = j; // never re-start inside the same run
    }
    return null;
  })();
  if (currencyBoundWordPrice !== null) return currencyBoundWordPrice;

  const hasDigits = /\d/.test(uClean);
  const bareWordPrice = parseNumberWords(uClean);
  if (bareWordPrice !== null && !hasDigits && !hasNonPriceContext) {
    if (hasPriceKeywords ? bareWordPrice >= 10 : bareWordPrice >= 50) {
      return bareWordPrice;
    }
  }

  // DATE MASK before the digit-cleanup fallback (reviewer-caught edge): the
  // early-return guard above fires only when NO price keyword is present — a
  // message with BOTH a date and a price ("OD 7.15.2026, KIRIJATA 300 EVRA")
  // skips the guard and the fallback would grab the DATE digits first
  // (7152026). Mask numeric dates (dotted/slashed/spaced/ISO) and word-month
  // dates ("od 1 juli 2026", "od 15 septemvri 2026") out of the text so only
  // the real price survives. Same shape as the guard: od/од/na/на + day.month
  // (.year), bare day.month.year, ISO, and od/на + day + month-name + year.
  const dateMasked = text.replace(
    /(?:od|од|na|на)\s+\d{1,2}[./\s]+\d{1,2}(?!\d)(?:[./\s]+(?:19|20)\d{2})?|\d{1,2}[./]\d{1,2}[./](?:19|20)\d{2}|\d{4}-\d{2}-\d{2}|(?:od|од|na|на)\s+\d{1,2}\s+(?:januari|januar|fevruari|februar|mart|april|maj|juni|juli|avgust|septemvri|oktomvri|noemvri|dekemvri|јануари|јануар|фебруари|фебруар|март|април|мај|јуни|јули|август|септември|октомври|ноември|декември)[а-яa-z]*\s+(?:19|20)\d{2}/gi,
    ' '
  );
  const cleaned = dateMasked.replace(/[\s.,]/g, '');
  const match = cleaned.match(/(\d{3,7})/);
  return match ? parseInt(match[1]) : null;
}

// ========================================
// Extract terrace number
// ========================================
// CRITICAL: When "terasa" is present, ONLY look for the number NEAREST to it.
// Uses word-based backwards search from "terasa" to find the closest number.
// NEVER call parseMacedonianNumber on the full text — that will pick up
// unrelated numbers like "peeset" (50) from "peeset i sest i tri kvadrata terasa"
// when the correct terrace size is "tri" (3) which is the last word before "terasa".
// ========================================
export function extractTerraceNumber(text) {
  const words = text.split(/\s+/);
  const terasaWordIdx = words.findIndex(w => /terasa|тераса|terasi|тераси|terase|терасе|terrace/i.test(w));

  if (terasaWordIdx !== -1) {
    // Helper to extract number from a single word.
    // Handles: "5" (digit), "5m2" (leading digits), "tri" (Macedonian word)
    const extractWordNumber = (w) => {
      // Strip trailing punctuation that might be attached (",", ".", "?", "!")
      const clean = w.replace(/[.,!?;:]+$/, '');
      if (clean.length === 0) return null;
      // Pure digit word: "5", "15"
      if (/^\d{1,4}$/.test(clean)) {
        const n = parseInt(clean);
        return (n >= 1 && n <= 200) ? n : null;
      }
      // Leading digits + suffix: "5m2", "15m2", "3kvadrata"
      const leadingDigits = clean.match(/^(\d{1,4})/);
      if (leadingDigits) {
        const n = parseInt(leadingDigits[1]);
        if (n >= 1 && n <= 200) return n;
      }
      // Macedonian number word: "tri", "pet", "seesetiosum"
      const wordNum = parseMacedonianNumber(clean);
      if (wordNum !== null && wordNum >= 1 && wordNum <= 200) return wordNum;
      return null;
    };

    // "OF WHICH X ARE TERRACE" / "X ARE TERRACE" COPULA (reported bug):
    //   "VKUPNO IMA SEESET I TRI KVADRATA OD KOI 2 SE TERASA"
    //   (63 sqm total, of which 2 are terrace) → terraceSqm must be 2, NOT 3
    //   ("tri" from the 63-phrase) or 63. The proximity/context scan below
    //   treats the total-sqm numbers as candidates because "kvadrata" sits
    //   between them and terasa — so the number BOUND to terasa ("2 se
    //   terasa" / "од кои 2 се тераса") must win, and is checked FIRST.
    //   One disambiguator is REQUIRED (the "od koi" construction or the
    //   "se" copula): bare "WORD terasa" ("ima terasa", "golema terasa")
    //   must never match — parseMacedonianNumber uses substring matching,
    //   which could read a phantom number out of an innocent word. SINGULAR
    //   forms only (terasa/тераса/terrace): the plural forms ("ima 2 terasi"
    //   = 2 terraces) are a COUNT, not a size, and keep the existing
    //   plural-count guard below.
    const boundTerraceMatch = text.match(
      /(?:^|[^a-zа-я\d])(?:(?:(?:od\s+koi|од\s+кои)\s+)(\d{1,4}|[a-zа-я]+)\s*(?:se|се)?|(\d{1,4}|[a-zа-я]+)\s+(?:se|се)\s+)(?:terasa|тераса|terrace)(?:$|[^a-zа-я])/i
    );
    if (boundTerraceMatch) {
      const n = extractWordNumber(boundTerraceMatch[1] || boundTerraceMatch[2]);
      if (n !== null) return n;
    }

    // PLURAL-FORM COUNT GUARD (reported): "imaima terasi 2" (there are 2
    // terraces) / "2 terasi" / "dve terasi" — a BARE number next to the
    // PLURAL forms (terasi/тераси/terase/терасе) is the terrace COUNT, not
    // the m² size, and must never be stored as terraceSqm. Numbers with an
    // explicit area unit ("terasi 5m2", "5 kvadrati") are still sizes, and
    // the SINGULAR forms (terasa/тераса/terrace) keep the old bare-number
    // behavior ("terasa 4" = 4 m²).
    const isPluralForm = /terasi|тераси|terase|терасе/i.test(words[terasaWordIdx]);
    const hasAreaUnit = (w) => /m2|м2|m²|kvadrat|квадрат|kv|кв|sqm/i.test(w);
    // true when w is a pure number (digit or Macedonian word) with NO area unit
    const isBareCountWord = (w) => {
      const clean = w.replace(/[.,!?;:]+$/, '');
      if (hasAreaUnit(clean)) return false; // "5m2" / "2kvadrati" → size, not count
      if (/^\d{1,4}$/.test(clean)) return true; // "2" → count candidate
      const wordNum = parseMacedonianNumber(clean); // "dve" → count candidate
      return wordNum !== null && wordNum >= 1 && wordNum <= 200;
    };

    // PRIORITY 1: Check for a number RIGHT AFTER the terrace word.
    // e.g., "terasi 5", "terasa 5m2", "terase 4" — the clearest signal.
    // With a PLURAL form, a bare count right after is the terrace COUNT,
    // not the size — skip it ("terasi 2" → null; the follow-up asks for m²).
    if (terasaWordIdx + 1 < words.length) {
      const nextWord = words[terasaWordIdx + 1];
      if (!(isPluralForm && isBareCountWord(nextWord))) {
        const nextResult = extractWordNumber(nextWord);
        if (nextResult !== null) return nextResult;
      }
    }

    // PRIORITY 2: Find ALL numbers, prefer those with "kvadrati" context
    // between the number and the terrace word. This handles:
    //   "5 kvadrati se terasi" → 5 (number before terasi with sqm in between)
    //   "68 kvadrati i terasa 4" → 4 (number after terasi, already caught by
    //        Priority 1 but falls through to here for edge cases)
    // Bare trailing numbers like "2" in "ima 2" after terasi are NOT preferred.
    let bestWithContext = null;
    let bestContextDistance = Infinity;
    let bestBare = null;
    let bestBareDistance = Infinity;

    for (let i = 0; i < words.length; i++) {
      if (i === terasaWordIdx) continue;
      const result = extractWordNumber(words[i]);
      if (result !== null) {
        const distance = Math.abs(i - terasaWordIdx);
        // Check if there's a "kvadrati" word between this number and terasa
        const start = Math.min(i, terasaWordIdx);
        const end = Math.max(i, terasaWordIdx);
        const hasSqmBetween = words.slice(start, end).some(w =>
          /kvadrati|квадрати|kvadrata|квадрата|m2|м2|kv|кв|sqm/i.test(w)
        );
        // A number with an ATTACHED unit ("5m2") OR an ADJACENT unit word
        // ("3 M2") is an unambiguous SIZE — treat it as context so
        // "VKUPNO IMA OSUMDESET I SES I TERASA OD 3 M2" resolves to 3 (the
        // "OD 3 M2" terrace), not to the closer bare "ses" (6 — the tens of
        // the 86 total). Reported lead 5540516.
        // DISTANCE CAP: adjacent-unit is only a size signal NEAR the terrace
        // word (≤2 words: "terasa od 3 M2") — a farther "N M2" ("ima terasa,
        // stanot e 68 M2") is the TOTAL size, not the terrace, and must stay
        // a bare candidate (rejected by the bare-distance ≤ 2 guard below).
        const unitAdjacent = hasAreaUnit(words[i]) ||
          (((i + 1 < words.length && hasAreaUnit(words[i + 1])) ||
            (i - 1 >= 0 && hasAreaUnit(words[i - 1]))) && distance <= 2);
        // TOTAL-SQM-ADJACENCY EXCLUSION (reported): "seese i osum kvadrata
        // so terasa golema" (86 m² with a large terrace) — "osum" sits
        // DIRECTLY before the total-sqm word "kvadrata" ("8 kvadrata"), so
        // it is the TOTAL, never the terrace size. Without this, the scan
        // picked "osum"→8 as the best context candidate and stored a phantom
        // terraceSqm=8 (and bedrooms=8 via countBedrooms). A number with an
        // attached unit ("5m2") or adjacent "m2"/"kv" ("3 M2") is still a
        // SIZE signal (kept by unitAdjacent) — only a number glued to a
        // TOTAL-sqm word (kvadrata/kvadrati forms) is excluded. The copula
        // boundTerraceMatch above already ran, so "...OD KOI 2 SE TERASA"
        // (2 m² terrace of a 63 m² total) is unaffected.
        // TOTAL-SQM PHRASE EXCLUSION — a number word that belongs to the
        // TOTAL-sqm phrase ("seese i osum kvadrata" = 68 m² total) is never
        // a terrace size. Two prongs:
        //   a) ADJACENT: the number is glued to a total-sqm keyword
        //      ("osum kvadrata" → "osum" is the total, not the terrace).
        //   b) BEFORE-KEYWORD: the number sits anywhere BEFORE the
        //      total-sqm keyword token ("seese i osum kvadrata ... terasa")
        //      — the tens word "seese" also belongs to the total phrase, and
        //      with "kvadrata" between it and "terasa" the old
        //      hasSqmBetween logic wrongly crowned it "best context".
        //      Excluding every pre-keyword bare candidate kills the whole
        //      phantom in one rule. Unit-ATTACHED numbers ("3 M2" / "5m2") —
        //      including ones after "terasa" ("... terasa od 3 M2") — are
        //      untouched (the terrace size of the VKUPNO case, reported
        //      lead 5540516).
        const totalSqmUnitRe = /kvadrata|квадрата|kvadrati|квадрати|kvadrat|квадрат/i;
        const prevIsTotalSqm = i - 1 >= 0 && totalSqmUnitRe.test(words[i - 1]);
        const nextIsTotalSqm = i + 1 < words.length && totalSqmUnitRe.test(words[i + 1]);
        const totalSqmKeywordIdx = words.findIndex(w => totalSqmUnitRe.test(w));
        const beforeTotalSqmKeyword = totalSqmKeywordIdx !== -1 && i < totalSqmKeywordIdx;
        const totalSqmAdjacent = prevIsTotalSqm || nextIsTotalSqm;
        if (totalSqmAdjacent || (beforeTotalSqmKeyword && !unitAdjacent)) continue;
        if ((hasSqmBetween || unitAdjacent) && distance < bestContextDistance) {
          bestContextDistance = distance;
          bestWithContext = result;
        } else if (!hasSqmBetween && !unitAdjacent && distance < bestBareDistance) {
          bestBareDistance = distance;
          bestBare = result;
        }
      }
    }

    // Prefer context-enhanced number over bare trailing number
    if (bestWithContext !== null) return bestWithContext;
    // Only accept bare numbers within 2 words of terasa (e.g., "terasa 4")
    // PLURAL COUNT GUARD: with a plural form a bare number is the terrace
    // count ("ima 2 terasi"), never a size — reject it.
    if (bestBare !== null && bestBareDistance <= 2 && !isPluralForm) return bestBare;

    // No good number found near terrace — return null instead of guessing
    return null;
  }

  // Phase 3: No "terasa" in text — existing fallback logic.
  // IMPORTANT: Only run on SHORT bare answers (≤3 words) with NO other-field
  // context. NEVER call parseMacedonianNumber on a full sentence — it uses
  // substring matching, so "deset" inside "stoosumdeset" (183) false-matches
  // to 10. And never let a bare digit (e.g. "6" in "na 6 kat") be read as a
  // terrace size when floor/sqm/price context is present.
  const sqmMatch = text.match(/(\d{1,4})\s*(kvadrata|kvadrati|m2|м2|kv|кв)/i);
  if (sqmMatch) return parseInt(sqmMatch[1]);

  const wordCount = words.length; // reuse the top-of-function `words` split
  // OTHER-FIELD CONTEXT — a bare number in such a message is NOT a terrace
  // size. Includes the BUILDING word ("ZGRADA OD 80TI" — a building-year
  // answer, not a terrace) and the DECADE forms ("80ti"/"осумдесетти" — a
  // yearBuilt decade, never a terrace size): the old list lacked them, so a
  // "80ti" digit fell through to the bare-\d+ grab below and a phantom
  // terraceSqm=80 was stored (reported lead 5540516).
  // TIME-UNIT WORDS (reported): "ZA DVA DENA" (in 2 days), "za tri dena" —
  // a bare-number answer to the available-from date question must NEVER be
  // read as a terrace size. "dva""/"tri" passed the ≤3-word bare fallback
  // below and a phantom terraceSqm=2 was stored while availableFrom stayed
  // missing. dena/дена/denovi/денови (days) and the SINGULAR den/ден are
  // time units, not terrace areas — the singular is boundary-guarded (a
  // standalone "den"/"ден" token only) so the bare "den" substring never
  // matches inside unrelated words ("sloboden", "ograden", "vreden",
  // "sreden" — reviewer finding). nedel/недел (week) and mesec/месец
  // (month) stems are unambiguous. A boundary-guarded singular also catches
  // "za eden den" (1 day) while leaving "denes" (today) alone.
  const hasOtherContext = /iljadi|илјади|evra|евра|eur|evro|евро|kvadrati|квадрати|kvadrata|квадрата|m2|м2|kv|кв|sqm|kat|кат|sprat|спрат|sprata|спрата|kata|ката|katnica|катница|spalni|спални|parking|паркинг|garaza|гаража|lift|лифт|klima|клима|godina|година|izgraden|граден|renoviran|реновиран|zgrad|зград|dena|дена|denovi|денови|(?:^|[^a-zа-я])(?:den|ден)(?:$|[^a-zа-я])|nedel|недел|mesec|месец|\d{1,2}\s*[- ]?(?:ti|ти|ta|та)(?:te|те)?|осумдесет|osumdeset|осамдесет|osamdeset|девеесет|deveeset|деведесет|devedeset|седумдесет|sedumdeset|шеесет|seeset|педесет|pedeset/i.test(text);
  if (wordCount <= 3 && !hasOtherContext) {
    const wordNum = parseMacedonianNumber(text);
    if (wordNum !== null && wordNum >= 1 && wordNum <= 100) return wordNum;

    const numbers = text.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      return parseInt(numbers[numbers.length - 1]);
    }
  }
  return null;
}

// ========================================
// Parse year built
// ========================================
export function parseYearBuilt(text) {
  // DATE-YEAR GUARD (reported with the available-from feature): a year that is
  // the THIRD component of a numeric date ("од 1.6.2026" — move-in/available-
  // from date, "15/03/2027") is the year OF A DATE, NOT the construction year.
  // scanHistoryForField joins ALL owner messages and re-runs the yearBuilt
  // extractor — without this guard, the owner's availableFrom answer would
  // backfill yearBuilt=2026 from "od 1.6.2026" and the construction-year
  // question would be silently skipped. Construction years are NEVER written
  // as day.month.year, so the date segment is safely removed before the year
  // patterns below run. (A thousands-separated price "85.000" can't match:
  // the third group needs a separator + 2-4 digits, i.e. exactly a date.)
  // ALSO stripped: "od 15.09." / "од 1.6." — the availableFrom answer in
  // day.month form (no year) would otherwise leak through the 2-digit year
  // fallback as 2015/2001. Day.month WITHOUT the od/од marker is NOT stripped
  // — "8/10" is a compound floor answer and keeps its pre-existing path.
  const dateYearMatch = text.match(/(?:^|[^.\d/-])\d{1,2}[.\-/]\d{1,2}[.\-/](\d{2,4})(?![.\d/-])/);
  if (dateYearMatch) {
    text = text.replace(dateYearMatch[0], ' ');
  } else {
    // "od 15.09." ends with a trailing dot (the sentence-final period) —
    // allow one optional trailing separator after day.month, then a
    // non-digit boundary. "od 15.09.2026" was already stripped above.
    const odDayMonth = text.match(/(?:od|од)\s*\d{1,2}[.\-/]\d{1,2}(?:[.\-/]|$)(?!\d)/i);
    if (odDayMonth) {
      text = text.replace(odDayMonth[0], ' ');
    }
  }
  // PRICE-YEAR GUARD (reported with the price-per-sqm feature): a 4-digit
  // number bound to price context ("2000 e za m2" per-m², "185000 evra",
  // "3500€", "200 iljadi") is a PRICE, never a construction year — the
  // exact-year pattern below would otherwise read "2000" from
  // "2000 e za m2, vkupno 185000 evra" as yearBuilt=2000. Year nouns
  // ("2020 godina", "izgradena 2015") are NOT price context, so they
  // survive the strip unchanged.
  text = text.replace(/\b(\d{3,4})\b\s*(?:e\s*za\s*m2|е\s*за\s*м2|evra\s*za\s*m2|евра\s*за\s*м2|evra|евра|evro|евро|eur|€|iljadi|илјади)/gi, ' ');
  // Try word-boundary year first: "2015 godina", "izgradena 2015", "2015 година"
  // The \b ensures we match standalone year numbers, not part of a larger number.
  const exactYearMatch = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (exactYearMatch) return parseInt(exactYearMatch[1]);
  // Year with attached Macedonian suffix: "2015ta", "2015ти", "2015ti"
  // The suffix is attached without a space, so \b doesn't find a word boundary.
  // Runs AFTER the word-boundary check to prefer "2015 godina" over "2020ta"
  // in messages like "2015 godina, renoviran 2020ta" where both are present.
  const suffixYearMatch = text.match(/((?:19|20)\d{2})(?:ta|та|ти|ti|год|година)/i);
  if (suffixYearMatch) return parseInt(suffixYearMatch[1]);

  // Skip 2-digit matches that are part of sqm/price context ('80 m2', '50 кв', '350 evra', '98 iljadi')
  // or floor/building-story context ('13 sprata', '10 katnica', '5 kat').
  // Only extract 2-digit years when message is purely numeric (bare '98', '13')
  // or has explicit year context words (izgraden, godina, etc.).
  const twoDigit = text.match(/\b(\d{2})\b/);
  if (twoDigit) {
    const year = parseInt(twoDigit[1]);
    // Skip if followed by sqm, price, floor, or building-story context
    const afterMatch = text.slice(twoDigit.index + twoDigit[0].length).trim();
    if (/^(m2|м2|кв|kvadrati|квадрати|kvadrata|квадрата|sqm|evra|евра|eur|iljadi|илјади|iljade|илјаде|sprat|спрат|kat|кат|katnica|катница|sprata|спрата|kata|ката|kati|кати|eta|ета|etazha|етажа|spraevi|спраеви|spratovi|спратови|katovi|катови)/i.test(afterMatch)) return null;
    // COMPOUND-QUANTITY GUARD (reported lead 5540516): "80 i ses" is the
    // quantity 86, not the 1980s — a 2-digit year followed by "i {unit}"
    // is a compound number, never a decade. Boundary is CYRILLIC-AWARE
    // (?=$|[^a-zа-я\d]) — JS `\b` is ASCII-only and fails after "шес".
    if (/^[iи]\s+(?:eden|edna|edno|dva|dve|tri|cetiri|pet|sest|ses|sedum|osum|devet|deset|шес)(?=$|[^a-zа-я\d])/i.test(afterMatch)) return null;
    if (year >= 0 && year <= 30) return 2000 + year;
    if (year >= 70 && year <= 99) return 1900 + year;
  }

  // Decade word variants — both single-t and double-t spellings, Latin + Cyrillic.
  // Viber users type "osumdeseti", "осумдесети" (single т), "deveeseti", "sedumdeseti" etc.
  // The "-ti/-tti" forms mean approximate year → mid-decade (1985/1995/1975).
  if (/80ti|80 ти|80-ти|80ти|осумдесетти|осумдесети|осумдести|осамдесетти|осамдесети|осамдести|80-i|80i|osumdesti|osumdeseti|osumdesetti|osamdesti|osamdesetti|osamdeseti/i.test(text)) return 1985;
  if (/80ta|80 та|80та|1980-ти|1980ти|осумдесетта|осумдесета|осумдеста|осамдесетта|осамдесета|осамдеста|80-ta|osumdesetta|osumdeseta|osumdesta|osamdesetta|osamdeseta|osamdesta/i.test(text)) return 1980;
  if (/90ti|90 ти|90-ти|90ти|деведесетти|деведесети|деведести|девеесетти|девеесети|девеести|90-i|90i|deveeseti|deveesetti|deveesti|devedeseti|devedesetti|devedesti/i.test(text)) return 1995;
  if (/90ta|90 та|90та|1990-ти|1990ти|деведесетта|деведесета|деведеста|девеесетта|девеесета|девееста|90-ta|deveesetta|deveeseta|deveesta|devedesetta|devedeseta|devedesta/i.test(text)) return 1990;
  if (/70ti|70 ти|70-ти|70ти|седумдесетти|седумдесети|седумдести|sedumdesti|sedumdeseti|sedumdesetti/i.test(text)) return 1975;
  if (/70ta|70 та|70та|седумдесетта|седумдесета|седумдеста|sedumdesetta|sedumdeseta|sedumdesta/i.test(text)) return 1970;
  // 50s/60s decade lines were entirely missing — same disease (silently null).
  // E.g. 'pedeseti'/'peesetti' (50s), 'seeseti'/'seesetti' (60s), Viber spellings.
  // COMPACT DECADE FORMS (reported: "SEESTI" answering "Која година е
  // граден?" was NOT collected) — Viber owners DROP the medial "е":
  // шеесет → шеест → шеести / SEESTI, педесет → пеест → ПЕЕСТИ,
  // деведесет → девест → девеести, седумдесет → седумдести, etc.
  if (/50ti|50 ти|50-ти|50ти|50-i|50i|педесетти|педесети|педести|пеесетти|пеесети|пеести|pedesetti|pedeseti|pedesti|peesetti|peeseti|peesti/i.test(text)) return 1955;
  if (/50ta|50 та|50та|50-ta|педесетта|педесета|педеста|пеесетта|пеесета|пееста|pedesetta|pedeseta|pedesta|peesetta|peeseta|peesta/i.test(text)) return 1950;
  if (/60ti|60 ти|60-ти|60ти|60-i|60i|шеесетти|шеесети|шеести|сеести|seesetti|seeseti|seesti/i.test(text)) return 1965;
  if (/60ta|60 та|60та|60-ta|шеесетта|шеесета|шееста|сееста|seesetta|seeseta|seesta/i.test(text)) return 1960;
  if (/2000ti|2000 ти|двеилјадити/i.test(text)) return 2005;
  if (/2000ta|2000 та|двеилјадита/i.test(text)) return 2000;

  // COMPOUND-QUANTITY GUARD (reported lead 5540516): "osumdeset i ses" is
  // the QUANTITY 86 ("VKUPNO IMA OSUMDESET I SES ..." = 86 m² total), NOT a
  // decade. The bare-word blocks below would otherwise match "osumdeset" →
  // phantom yearBuilt 1980. A decade word (or bare decade digit) followed by
  // "i {unit}" is a compound number — never a year answer (the -ti/-ta
  // decade forms and exact years above are unambiguous and already handled).
  if (/(?:osumdeset|осумдесет|osemdeset|осемдесет|deveeset|девеесет|devedeset|деведесет|sedumdeset|седумдесет)\s+[iи]\s+(?:eden|edna|edno|dva|dve|tri|cetiri|pet|sest|ses|sedum|osum|devet|deset)|\b(?:90|80|70|60|50)\b\s+[iи]\s+(?:eden|edna|edno|dva|dve|tri|cetiri|pet|sest|ses|sedum|osum|devet|deset)\b/i.test(text)) {
    return null;
  }

  // Word boundary BOTH before AND after to prevent matching "deveeset"
  // inside "deveesetitri" (93). The dual `\b` requires the decade word
  // to be standalone — not part of a compound number.
  if (/\bdeveeset\b|\bдевеесет\b|\b90\b|\bдеведесет\b|\bdevedeset\b/i.test(text)) {
    if (/nekoja|некоја|nekoi|некои|неколку|некое|nekoe|nekade|некаде/i.test(text)) return 1995;
    return 1990;
  }

  // Same dual word-boundary fix for 80s: prevent matching "osemdeset" inside
  // "osemdeseti" or other compound forms.
  if (/\bosemdeset\b|\bосумдесет\b|\b80\b|\bosumdeset\b/i.test(text)) {
    if (/nekoja|некоја|nekoi|некои|неколку|некое|nekoe|nekade|некаде/i.test(text)) return 1985;
    return 1980;
  }

  // 70s bare-word block (word-only; bare digits like "70" are handled by the
  // twoDigit block above — note "70 godini" currently maps to 1970 via twoDigit).
  if (/\bsedumdeset\b|\bседумдесет\b/i.test(text)) {
    if (/nekoja|некоја|nekoi|некои|неколку|некое|nekoe|nekade|некаде/i.test(text)) return 1975;
    return 1970;
  }

  const yearWordMap = {
    'eden': 1, 'edna': 1, 'edno': 1,
    'dva': 2, 'dve': 2,
    'tri': 3,
    'cetiri': 4, 'четири': 4,
    'pet': 5, 'пет': 5,
    'sest': 6, 'шест': 6,
    'sedum': 7, 'седум': 7,
    'osum': 8, 'осум': 8,
    'devet': 9, 'девет': 9,
    'deset': 10, 'десет': 10,
    'edinaeset': 11, 'единаесет': 11,
    'dvanaeset': 12, 'дванаесет': 12,
    'trinaeset': 13, 'тринаесет': 13,
    'cetirinaeset': 14, 'четиринаесет': 14,
    'petnaeset': 15, 'петнаесет': 15,
    'sesnaeset': 16, 'шеснаесет': 16,
    'sedumnaeset': 17, 'седумнаесет': 17,
    'osumnaeset': 18, 'осумнаесет': 18,
    'devetnaeset': 19, 'деветнаесет': 19,
    'edinaesta': 11, 'dvanaesta': 12, 'trinaesta': 13,
    'cetirinaesta': 14, 'petnaesta': 15, 'sesnaesta': 16,
    'sedumnaesta': 17, 'osumnaesta': 18, 'devetnaesta': 19,
    'edinaesti': 11, 'dvanaesti': 12, 'trinaesti': 13,
    'cetirinaesti': 14, 'petnaesti': 15, 'sesnaesti': 16,
    'sedumnaesti': 17, 'osumnaesti': 18, 'devetnaesti': 19,
    'edinaesetta': 11, 'dvanaesetta': 12, 'trinaesetta': 13,
    'cetirinaesetta': 14, 'petnaesetta': 15, 'sesnaesetta': 16,
    'sedumnaesetta': 17, 'osumnaesetta': 18, 'devetnaesetta': 19,
    'edinaesetti': 11, 'dvanaesetti': 12, 'trinaesetti': 13,
    'cetirinaesetti': 14, 'petnaesetti': 15, 'sesnaesetti': 16,
    'sedumnaesetti': 17, 'osumnaesetti': 18, 'devetnaesetti': 19,
  };
  const sortedYearWords = Object.entries(yearWordMap)
    .sort((a, b) => b[0].length - a[0].length);

  const uw = text.toLowerCase().replace(/\s+/g, '');

  const iljadiMatch = uw.match(/([a-zа-я]{1,4})(iljadi|илјади)([iи]?)([a-zа-я]*)/i);
  if (iljadiMatch && iljadiMatch.index === 0) {
    const unitsStr = iljadiMatch[1];
    const suffixStr = iljadiMatch[4];

    let thousands = null;
    for (const [word, num] of sortedYearWords) {
      if (unitsStr === word && num >= 1 && num <= 9) {
        thousands = num * 1000;
        break;
      }
    }

    if (thousands !== null) {
      let suffix = null;
      if (suffixStr.length > 0) {
        for (const [word, num] of sortedYearWords) {
          if (suffixStr.startsWith(word)) {
            suffix = num;
            break;
          }
        }
      }

      const year = thousands + (suffix || 0);
      if (year >= 1900 && year <= 2099) return year;
    }
  }

  const iMatch = uw.match(/(edna|edno|eden|dva|dve|tri|cetiri|pet|sest|sedum|osum|devet)([iи])([a-zа-я]+)/i);
  if (iMatch && iMatch.index === 0) {
    const unitsStr = iMatch[1];
    const suffixStr = iMatch[3];

    let thousands = null;
    for (const [word, num] of sortedYearWords) {
      if (unitsStr === word && num >= 1 && num <= 9) {
        thousands = num * 1000;
        break;
      }
    }

    if (thousands !== null && suffixStr.length > 0) {
      for (const [word, num] of sortedYearWords) {
        if (suffixStr.startsWith(word)) {
          const year = thousands + num;
          if (year >= 1900 && year <= 2099) return year;
          break;
        }
      }
    }
  }

  return null;
}

// ========================================
// Parse orientation
// ========================================
export function parseOrientation(text) {
  let normalized = text
    .replace(/zadap|zapat|zapad/g, 'zapad')
    .replace(/istk|istk|isok/g, 'istok')
    .replace(/severz|severz|severj/g, 'sever')
    .replace(/jugoj/g, 'jug')
    .replace(/jugo/g, 'jug')
    // Adjective forms: juzen (southern), severn (northern), etc.
    .replace(/ju[zž]en|јужен|ju[zž]na|јужна|ju[zž]ni|јужни/gi, 'jug')
    .replace(/severen|северен|severna|северна|severni|северни/gi, 'sever')
    .replace(/isto[čc]en|источен|isto[čc]na|источна|isto[čc]ni|источни/gi, 'istok')
    .replace(/zapaden|западен|zapadna|западна|zapadni|западни/gi, 'zapad');

  const orientations = [];
  if (/sever|север|north/i.test(normalized)) orientations.push('sever');
  if (/jug|југ|south/i.test(normalized)) orientations.push('jug');
  if (/istok|исток|east/i.test(normalized)) orientations.push('istok');
  if (/zapad|запад|west/i.test(normalized)) orientations.push('zapad');
  return orientations.length > 0 ? orientations : null;
}

// ========================================
// AVAILABLE-FROM DATE PARSING (reported requirement, rent leads)
// The rent flow asks "Од кога ќе биде слободен?" right after availability is
// confirmed (and even when the property is NOT available now — "не е
// достапен, од 1 јануари е слободен" — the listing goes HIDDEN until that
// date, then shows on the customer page). Owner answers:
//   "ОД 1 ЈАНУАРИ Е СЛОБОДЕН" → next January 1st
//   "слободен од март"        → next March 1st
//   "od 15ti" / "од 15"       → next occurrence of day 15
//   "од 1.6.2026" / "1.6."    → June 1st (day.month[.year] — Macedonian
//                                numeric date order)
//   "sledniot mesec"          → first of next month
//   "одма" / "сега" / "веднаш" → 'immediate' (free right away)
// Returns an ISO date string (YYYY-MM-DD), the literal 'immediate', or null
// when no date is present. All date/days roll FORWARD to the next occurrence
// (a date in the past means next year/month — "од 1 јануари" said in August
// is next January). This is the one genuinely new parsing category in the
// codebase (nothing else parses Macedonian dates/months).
// ========================================
const AVAILABLE_FROM_MONTH_NUM = {
  januari: 1, 'јануари': 1,
  fevruari: 2, 'февруари': 2,
  mart: 3, 'март': 3,
  april: 4, 'април': 4,
  maj: 5, 'мај': 5,
  juni: 6, 'јуни': 6,
  juli: 7, 'јули': 7,
  avgust: 8, 'август': 8,
  septemvri: 9, 'септември': 9,
  oktomvri: 10, 'октомври': 10,
  noemvri: 11, 'ноември': 11,
  dekemvri: 12, 'декември': 12
};

const AVAILABLE_FROM_MONTH_RE = /januari|јануари|fevruari|февруари|mart|март|april|април|maj|мај|juni|јуни|juli|јули|avgust|август|septemvri|септември|oktomvri|октомври|noemvri|ноември|dekemvri|декември/i;

function _isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// RELATIVE-DATE HELPERS (reported): "od utre" (tomorrow), "zadutre" (day
// after tomorrow), "za dve nedeli" (in two weeks), "za mesec dena" (in a
// month) — computed from TODAY, matching the roll-forward semantics of
// _nextDay/_nextMonthDay. _addMonths clamps to the target month's last day
// (Jan 31 + 1 month → Feb 28/29, never Mar 3).
function _addDays(days) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return _isoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days));
}
function _addMonths(months) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const targetMonth = base.getMonth() + months;
  const lastDay = new Date(base.getFullYear(), targetMonth + 1, 0).getDate();
  return _isoDate(new Date(base.getFullYear(), targetMonth, Math.min(base.getDate(), lastDay)));
}

// Next occurrence of (day, month) — rolls to next year when the candidate is
// in the past. month is 1-12, day 1-31.
function _nextMonthDay(day, month) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let candidate = new Date(today.getFullYear(), month - 1, day);
  if (candidate < now) candidate = new Date(today.getFullYear() + 1, month - 1, day);
  return _isoDate(candidate);
}

// Next occurrence of a bare day-of-month ("od 15ti") — this month if still
// ahead, else next month. Handles month-length overflow naturally via Date.
function _nextDay(day) {
  const today = new Date();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < now) candidate = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return _isoDate(candidate);
}

export function parseAvailableFromDate(text) {
  const t = String(text || '').trim();
  if (!t) return null;

  // 1. IMMEDIATE — the property is free right away (no blocked_until needed).
  //    Reported: "sloboden momentalno" (free at the moment) was NOT registered
  //    even after the second attempt — "momentalno" (currently), "instant",
  //    "za brzo" (soon/quickly) and "veke e sloboden" (already free) are the
  //    missing immediate words from the Macedonian vocabulary.
  //    NEGATION GUARD (reviewer finding): "моментално НЕ Е слободен" / "не е
  //    слободен моментно" / "моментално е зафатен" say the property is NOT
  //    free now — the immediate rule must NOT fire (it would reply "достапен
  //    веднаш" — the opposite of the truth). Let the future-date rules below
  //    handle a following date ("не е слободен, од 1 јуни") or return null
  //    so the date question re-asks.
  //    BARE "brzo" DELIBERATELY EXCLUDED (reviewer finding): the user asked
  //    for "za brzo" — a bare "brzo" in "ke ti odgovoram brzo" (I'll reply
  //    quickly) or "ke vi ispratam sliki brzo" would false-capture immediate
  //    while the field is still missing (extractAvailableFrom runs in global
  //    discovery + the STEP 2 bonus pass).
  const NEGATED_NOW_RE = /ne\s*e\s*(?:sloboden|dostapen|izdaden|издаден)|не\s*е\s*(?:слободен|достапен|издаден)|ne\s*(?:e|е)\s*sloboden|не\s*е\s*слободен|zafaten|зафатен|zaferan|momentаlno\s*ne|моментално\s*не|momentno\s*ne|моментно\s*не/i;
  if (!NEGATED_NOW_RE.test(t) &&
      /(?:^|[^a-zа-я])(?:odma|одма|sega|сега|vednash|веднаш|od denes|од денес|denes|денес|momentalno|моментално|momentno|моментно|instant|инстант|za\s+brzo|за\s+брзо|veke\s+e\s+sloboden|веќе\s+е\s+слободен|veke\s+sloboden|веќе\s+слободен)(?:$|[^a-zа-я])/i.test(t)) {
    return 'immediate';
  }

  // 2a. RELATIVE DATES (reported): the owner answers "Од кога ќе биде
  //     слободен?" with a relative phrase instead of a calendar date:
  //     "od utre" (from tomorrow), "zadutre" (day after tomorrow),
  //     "prekosutra", "za mesec dena" (in a month), "za dve nedeli" (in
  //     two weeks), "za edna nedela" (in a week), "slednata nedela" (next
  //     week), "za godina dena" (in a year). Computed from TODAY. Word-
  //     boundary-guarded so the check order is safe: "zadutre" contains
  //     "utre" as a substring, but the leading ^|[^a-zа-я] boundary stops
  //     "utre" from matching inside it. "nedela" alone is deliberately NOT
  //     a match (недела = Sunday is ambiguous with неделя = week) — only the
  //     plural/dena/edna/slednata forms pin the week reading.
  if (/(?:^|[^a-zа-я])(?:zadutre|задутре|prekosutra|прекосутра)(?:$|[^a-zа-я])/i.test(t)) return _addDays(2);
  if (/(?:^|[^a-zа-я])(?:utre|утре)(?:$|[^a-zа-я])/i.test(t)) return _addDays(1);
  if (/(?:za|за)\s+(?:eden|еден|1)\s+(?:mesec|месец)|(?:za|за)\s+(?:mesec|месец)\s+(?:dena|дена)/i.test(t)) return _addMonths(1);
  if (/(?:za|за)\s+(?:dva|два|2)\s+(?:meseca|месеца)/i.test(t)) return _addMonths(2);
  if (/(?:za|за)\s+(?:tri|три|3)\s+(?:meseca|месеца)/i.test(t)) return _addMonths(3);
  if (/(?:za|за)\s+(?:dve|две|2)\s+(?:nedeli|недели)/i.test(t)) return _addDays(14);
  if (/(?:za|за)\s+(?:tri|три|3)\s+(?:nedeli|недели)/i.test(t)) return _addDays(21);
  if (/(?:slednata|следната|sledna|следна)\s+(?:nedela|недела)/i.test(t)) return _addDays(7);
  if (/(?:za|за)\s+(?:edna|една|1)\s+(?:nedela|недела)|(?:za|за)\s+(?:nedela|недела)\s+(?:dena|дена)/i.test(t)) return _addDays(7);
  if (/(?:za|за)\s+(?:edna|една|1)\s+(?:godina|година)|(?:za|за)\s+(?:godina|година)\s+(?:dena|дена)/i.test(t)) return _addMonths(12);

  // 2b. DAY-COUNT RANGE (reported): "ZA DVA TRI DENA" (in 2-3 days),
  //     "tri cetiri dena" (3-4 days) — the owner gives a RANGE and Ana must
  //     memorize the LOWER bound (the earliest the property can be free):
  //     "dva tri" → 2 days, "tri cetiri" → 3 days. Same for weeks ("dve tri
  //     nedeli" → 2 weeks) and months ("dva tri meseca" → 2 months). Both
  //     digits ("za 2 3 dena", "za 2-3 dena") and word numbers ("dva tri")
  //     with space/hyphen/dash/comma separators.
  const rangeDays = t.match(/(?:za|за)\s+(\d{1,2}|[a-zа-я]{2,})\s*(?:-|–|—|\/|,|\s+)\s*(\d{1,2}|[a-zа-я]{2,})\s*(dena|дена|denovi|денови|nedeli|недели|meseca|месеца)(?:\s|$)/i);
  if (rangeDays) {
    const n1 = /^\d{1,2}$/.test(rangeDays[1]) ? parseInt(rangeDays[1], 10) : parseMacedonianNumber(rangeDays[1]);
    const n2 = /^\d{1,2}$/.test(rangeDays[2]) ? parseInt(rangeDays[2], 10) : parseMacedonianNumber(rangeDays[2]);
    if (n1 !== null && n2 !== null && n1 >= 1 && n1 <= 90 && n2 >= 1 && n2 <= 90) {
      const lower = Math.min(n1, n2);
      const unit = rangeDays[3].toLowerCase();
      if (/nedeli|недели/.test(unit)) return _addDays(lower * 7);
      if (/meseca|месеца/.test(unit)) return _addMonths(lower);
      return _addDays(lower);
    }
  }

  // 2c. GENERIC DAY COUNT (reported): "ZA DVA DENA" (in 2 days), "za tri
  //     dena", "za 5 dena", "za eden den" (1 day), "za deset denovi" — a
  //     plain day count, which previously had NO rule at all (only the
  //     month/week/year specifics above) so the answer was never registered
  //     and Ana re-asked until the 4-attempt skip. Digit or word number,
  //     singular/plural (den/ден, dena/дена, denovi/денови).
  const daysRel = t.match(/(?:za|за)\s+(\d{1,2}|[a-zа-я]{2,})\s+(dena|дена|den|ден|denovi|денови)(?:\s|$)/i);
  if (daysRel) {
    const n = /^\d{1,2}$/.test(daysRel[1]) ? parseInt(daysRel[1], 10) : parseMacedonianNumber(daysRel[1]);
    if (n !== null && n >= 1 && n <= 90) return _addDays(n);
  }

  // 2. NEXT MONTH — "sledniot mesec" / "следниот месец" → 1st of next month.
  if (/(?:sledniot|следниот)\s+(?:mesec|месец)/i.test(t)) {
    const today = new Date();
    return _isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));
  }

  // QUANTITY-UNIT LOOKAHEAD (reviewer finding): "од N <unit>" — "тераса од
  // 3 m2", "од 3.5 m2" (decimal terrace size), "од 12 месеци" (rent term),
  // "од 2 спрата" (floors) — is a QUANTITY phrase, NOT an available-from
  // date. Without the guard, the day-only and numeric rules below read the
  // "N" as a day-of-month and phantom-extract availableFrom (wrong
  // blocked_until in the CSV). Stems catch all inflections. Only true date
  // answers ("od 15ti", "od 15 ќе биде слободен", "од 1.6.2026") survive.
  const AVAILABLE_FROM_UNIT_LOOKAHEAD = '(?!\\s*(?:m2|м2|kv|кв|kvadrat|квадрат|kvadr|квадр|teras|терас|evr|евр|iljad|илјад|mesec|месец|nedel|недел|godin|годин|sprat|спрат|kat|кат|kata|ката|kati|кати|den|ден|cas|час|sati|сати))';

  // 3. NUMERIC DATE — "od 1.6.2026", "од 15.06", "od 1.6." (day.month[.year])
  //    AND US-STYLE (reported): "OD 7.15.2026" = July 15, 2026 — the owner
  //    types month.day (American order). Separators: dot, slash, dash OR
  //    SPACE ("od 7 15 2026", "od 07.15", "od 07 15" — all reported
  //    variants). DISAMBIGUATION: day.month wins when both are valid
  //    (Macedonian convention — "1.6" = June 1); month.day (US) only when
  //    day.month is impossible (second number > 12 — "7.15" can't be day 7
  //    month 15, so it's July 15). REQUIRES the od/од marker so a floor
  //    answer ("8/10") or a bare number can never become a date.
  const numMatch = t.match(new RegExp('(?:od|од)\\s*(\\d{1,2})\\s*[.\\-/ ]\\s*(\\d{1,2})(?:\\s*[.\\-/ ]\\s*(\\d{2,4}))?' + AVAILABLE_FROM_UNIT_LOOKAHEAD, 'i'));
  if (numMatch) {
    const first = parseInt(numMatch[1], 10);
    const second = parseInt(numMatch[2], 10);
    let day = null;
    let month = null;
    if (first >= 1 && first <= 12 && second > 12 && second <= 31) {
      // US-style month.day: "7.15" → July 15 (month 15 doesn't exist).
      month = first;
      day = second;
    } else if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
      // Macedonian day.month: "1.6" → June 1, "15.09" → Sep 15.
      day = first;
      month = second;
    }
    if (day !== null && month !== null) {
      if (numMatch[3]) {
        const year = parseInt(numMatch[3], 10);
        if (year >= 2020 && year <= 2100) {
          // Respect the explicit year (no roll-forward for a clearly stated
          // past date — the owner said that year on purpose).
          return _isoDate(new Date(year, month - 1, day));
        }
      }
      return _nextMonthDay(day, month);
    }
  }

  // 3b. BARE NUMERIC DATE WITH YEAR (reported variants "7.15.2026",
  //     "07 15 2026" — the owner sometimes types just the date, no od/од
  //     marker). A 3-component date carrying a valid year is unambiguous, so
  //     the od requirement is relaxed here only (a floor "8/10" has no
  //     year). Same day.month/US-month.day disambiguation as rule 3.
  const bareNum = t.match(new RegExp('(?:^|[^a-zа-я\\d])(\\d{1,2})\\s*[.\\-/ ]\\s*(\\d{1,2})\\s*[.\\-/ ]\\s*(\\d{4})(?:$|[^a-zа-я\\d])', 'i'));
  if (bareNum) {
    const first = parseInt(bareNum[1], 10);
    const second = parseInt(bareNum[2], 10);
    const year = parseInt(bareNum[3], 10);
    if (year >= 2020 && year <= 2100) {
      let day = null;
      let month = null;
      if (first >= 1 && first <= 12 && second > 12 && second <= 31) {
        month = first;
        day = second;
      } else if (first >= 1 && first <= 31 && second >= 1 && second <= 12) {
        day = first;
        month = second;
      }
      if (day !== null && month !== null) {
        return _isoDate(new Date(year, month - 1, day));
      }
    }
  }

  // 3c. BARE US-STYLE MONTH.DAY, no year, no od marker (reported variants
  //     "7 15", "07.15", "07 15" — the owner answers with just the date).
  //     Fires ONLY when the SECOND number > 12, which makes the month.day
  //     reading UNAMBIGUOUS (Macedonian day.month with month 15 is
  //     impossible — "7.15" can only be July 15). Separators dot/space/dash;
  //     SLASH deliberately excluded because "5/15" is the compound-FLOOR
  //     answer (5th of 15), never a date (A17 keeps "8/10" → null). Unit
  //     lookahead still applies so "7.15 m2" (terrace) and "7.15 evra"
  //     (price) stay null.
  const bareMonthDay = t.match(new RegExp('(?:^|[^a-zа-я\\d])(\\d{1,2})\\s*[.\\- ]\\s*(\\d{1,2})(?:$|[^a-zа-я\\d])' + AVAILABLE_FROM_UNIT_LOOKAHEAD, 'i'));
  if (bareMonthDay) {
    const month = parseInt(bareMonthDay[1], 10);
    const day = parseInt(bareMonthDay[2], 10);
    if (month >= 1 && month <= 12 && day > 12 && day <= 31) {
      return _nextMonthDay(day, month);
    }
  }

  // 4. DAY + MONTH — "od 1 januari", "1vi јануари", "15ти март",
  //    "од 15 ти септември" (digit + optional ordinal suffix + month word).
  //    The (?!\d) lookahead keeps a 4-digit year ("od 2026") from matching
  //    as day 20. Requires a REAL month word after the day.
  //    SUFFIX SET is bilingual: Latin "vi/ti/ri/mi" ("15ti mart") AND Cyrillic
  //    "ви/ти/ри/ми" ("15ти март") — Viber owners type both scripts.
  const dayMonth = t.match(/(?:od|од)?\s*(\d{1,2})(?!\d)\s*(?:vi|ви|ri|ри|ti|ти|mi|ми|и|ot|от)?\s*([a-zа-я]{2,})/i);
  if (dayMonth) {
    const monthNum = AVAILABLE_FROM_MONTH_NUM[dayMonth[2].toLowerCase()];
    if (monthNum) {
      const day = parseInt(dayMonth[1], 10);
      if (day >= 1 && day <= 31) return _nextMonthDay(day, monthNum);
    }
  }

  // 5. MONTH ONLY — "od mart", "слободен од март", "од септември" → 1st.
  //    Month word must be a standalone token (letter-boundary) so "март"
  //    never matches inside "мартин" (a name) or "марта".
  const monthOnly = t.match(new RegExp('(?:^|[^a-zа-я])(' + AVAILABLE_FROM_MONTH_RE.source + ')(?:$|[^a-zа-я])', 'i'));
  if (monthOnly) {
    const monthNum = AVAILABLE_FROM_MONTH_NUM[monthOnly[1].toLowerCase()];
    if (monthNum) return _nextMonthDay(1, monthNum);
  }

  // 6. DAY ONLY — "od 15ti" / "од 15" / "од 15-ти" → next occurrence of
  //    that day. Requires the od/од marker AND (?!\d) so "od 2026" (year)
  //    never matches as day 20. Day 1-31 only. BILINGUAL suffix set (Latin
  //    "15ti" AND Cyrillic "15ти" — Viber owners type both scripts): the
  //    suffix must be followed by end-of-string or a non-letter, so the
  //    Latin "ti" in "15ti" (end of token) matches while "15t" never does.
  //    UNIT GUARD: "od 3 m2"/"од 12 месеци" are quantities, not dates.
  //    DECIMAL GUARD: "од 3.5 m2" (terrace size) — rule 3 rejects it as a
  //    date (unit guard) and rule 6 must not re-read "od 3" as a day. A
  //    bare-day answer is NEVER followed by a decimal point + digit, and
  //    day.month forms are already consumed by rule 3, so rejecting is safe.
  const dayOnly = t.match(new RegExp('(?:od|од)\\s*(\\d{1,2})(?!\\d)(?!\\s*[.,]\\d)' + AVAILABLE_FROM_UNIT_LOOKAHEAD + '\\s*(?:vi|ви|ri|ри|ti|ти|mi|ми|и|ot|от)?(?:$|[^a-zа-я])', 'i'));
  if (dayOnly) {
    const day = parseInt(dayOnly[1], 10);
    if (day >= 1 && day <= 31) return _nextDay(day);
  }

  return null;
}

// Format an availableFrom value (ISO date or 'immediate') for Ana's reply
// text — "2027-01-01" → "1 јануари 2027", "immediate" → "веднаш".
const AVAILABLE_FROM_MONTH_NAMES = ['', 'јануари', 'февруари', 'март', 'април', 'мај', 'јуни', 'јули', 'август', 'септември', 'октомври', 'ноември', 'декември'];
export function formatAvailableFromDate(value) {
  if (value === 'immediate') return 'веднаш';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!m) return String(value || '');
  const day = parseInt(m[3], 10);
  const monthName = AVAILABLE_FROM_MONTH_NAMES[parseInt(m[2], 10)] || '';
  return `${day} ${monthName} ${m[1]}`;
}

// ========================================
// PRICE PER SQUARE METER — "2000 e za m2", "2000 evra za m2", "2500 е м2"
// The owner quotes the SALE price per m² instead of a total price. The
// intelligence layer (property-intelligence.js calculateSellingPrice)
// turns it into the owner price: sqm × pricePerSqm (spec requirement:
// "IF THE OWNER SAYS 2000 E ZA M2 IT SHOULD BE CALCULATED").
// Patterns are STRICT — a currency or "e"/"е" (copula, "is") marker must
// sit between the number and the m² unit, so "74 m2" (a sqm answer, no
// currency) and "2000" alone (a total price) can never be misread as a
// per-m² quote. The number must be a plausible €/m² (100–20000); small
// numbers like "3 m2" (terrace) and "12 m2" (room) are never prices.
// @returns {number|null} — the €/m² value, or null when no per-m² price.
// ========================================
export function extractPricePerSqm(text) {
  if (!text) return null;
  const u = text.toLowerCase();
  // Pattern 1: "2000 e za m2" / "2000 evra za m2" / "2500 е на м2"
  //   number + optional currency + optional preposition + m2-unit
  const m1 = u.match(/(\d{3,6})\s*(?:evra|евра|evro|евро|eur|е|e)?\s*(?:za|на|na|по|po)?\s*(?:m2|м2|kvadrat|квадрат|kvadrata|квадрата|кв|kv)\b/i);
  if (m1) {
    const n = parseInt(m1[1], 10);
    if (n >= 100 && n <= 20000) return n;
  }
  // Pattern 2: "2000 na kvadrat" / "2500 за квадрат" — number + per-square noun
  const m2 = u.match(/(\d{3,6})\s*(?:evra|евра|evro|евро|eur|е|e)?\s*(?:za|на|na|по|po)\s*(?:kvadrat|квадрат|kvadrata|квадрата)\b/i);
  if (m2) {
    const n = parseInt(m2[1], 10);
    if (n >= 100 && n <= 20000) return n;
  }
  return null;
}
