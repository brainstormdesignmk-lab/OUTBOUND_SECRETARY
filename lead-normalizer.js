// ============================================================
// lead-normalizer.js — Multi-scraper lead CSV → canonical leads
// ============================================================
// The scraper pipeline produces THREE different CSV layouts that
// all land in the same lead queue:
//
//   reklama5 : id,title,phone,url
//      3571074,SE IZDAVA NOV STAN 42 m2 VO STAR AERODROM,+38978334393,https://reklama5.mk/...
//      (current lead-processor.js parseLeadLine already handles this)
//
//   pazar3   : title,N/A,N/A,"phone1, phone2",url
//      Se izdava namesten stan Centar,...,"070 234 423, 078 377 677",https://www.pazar3.mk/...
//      (phone is the 4th field, often MULTIPLE numbers, no +389 prefix)
//
//   imoti247 : id,title,url,phone          ← phone/url SWAPPED vs reklama5
//      75889,"Plac-Gorno Konjari,Petrovec",https://imoti247.com/...,+38970376475
//      (phone may be "+38978251554 | +38975293311" — pipe-separated)
//
// This module detects the layout per line and normalizes every lead to
// the canonical { id, title, phone, url }. Leads with NO valid phone are
// skipped (returned as null) — a lead you cannot contact is noise.
// ============================================================
import { readFileSync } from 'node:fs';

// ------------------------------------------------------------
// CSV line splitter that respects quoted fields (reused shape
// from lead-processor.js parseLeadLine — kept local so this
// module stays self-contained and unit-testable).
// ------------------------------------------------------------
export function splitCsvLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

// ------------------------------------------------------------
// Phone normalization → canonical +389 form.
//   "+38978334393"            → "+38978334393"
//   "070 234 423"             → "+38970234423"
//   "+38978251554 | +38975.." → "+38978251554"  (first of many)
//   "N/A" / ""                → null
// ------------------------------------------------------------
export function normalizePhone(raw) {
  if (!raw) return null;
  const first = String(raw).split(/[,|;]/)[0].trim();
  if (!first || /^n\/?a$/i.test(first)) return null;
  const digits = first.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    const d = digits.slice(1);
    return d.length >= 8 && d.length <= 13 ? '+' + d : null;
  }
  // Local Macedonian mobile: 07X XXX XXX (9 digits after the leading 0)
  if (/^07\d{7,8}$/.test(digits)) return '+389' + digits.slice(1);
  if (/^7\d{7,8}$/.test(digits)) return '+389' + digits;
  // Loose fallback: any 9-12 digit local number → assume Macedonian
  if (/^\d{9,12}$/.test(digits)) return '+389' + digits;
  return null;
}

const looksLikeUrl = (s) => /^https?:\/\//i.test(String(s || '').trim());

// ------------------------------------------------------------
// Parse ONE line of scraper CSV into canonical {id,title,phone,url}.
// Returns null when the line is a comment, empty, or has no phone.
// ------------------------------------------------------------
export function parseScraperLeadLine(line) {
  const trimmed = String(line).trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const parts = splitCsvLine(trimmed);
  if (parts.length < 4) return null;

  let id = null;
  let title = null;
  let phoneRaw = null;
  let url = null;

  // --- Layout detection --------------------------------------
  if (parts.length >= 5 && /^n\/?a$/i.test(parts[1] || '') && looksLikeUrl(parts[parts.length - 1])) {
    // pazar3: title, N/A, N/A, "phones", url
    title = parts[0] || '';
    phoneRaw = parts[3] || '';
    url = parts[parts.length - 1];
    // pazar3 URLs are frequently truncated in the scrape ("...") — still keep
    // them; the phone is the contact, the URL is just provenance.
  } else if (looksLikeUrl(parts[2] || '')) {
    // imoti247: id, title, url, phone
    id = parts[0] || '';
    title = parts[1] || '';
    url = parts[2] || '';
    phoneRaw = parts[3] || '';
  } else {
    // reklama5: id, title, phone, url
    id = parts[0] || '';
    title = parts[1] || '';
    phoneRaw = parts[2] || '';
    url = parts[3] || '';
  }

  const phone = normalizePhone(phoneRaw);
  if (!phone) return null; // no valid contact → skip lead

  // pazar3 has no id — derive a stable one from the URL/title so session
  // persistence and CSV output still get a unique key.
  if (!id || /^n\/?a$/i.test(id)) {
    id = 'pz' + Math.abs(hashStr(url + '|' + title)) % 1_000_000_000;
  }

  return { id: String(id), title: String(title || ''), phone, url: String(url || '') };
}

// djb2 — tiny deterministic string hash for pazar3-derived ids
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

// ------------------------------------------------------------
// Load a whole scraper CSV file → canonical lead array.
//   loadScraperLeads('./leads/scraped.csv') → [{id,title,phone,url}, ...]
// ------------------------------------------------------------
export function loadScraperLeads(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const leads = [];
  for (const line of raw.split('\n')) {
    const lead = parseScraperLeadLine(line);
    if (lead) leads.push(lead);
  }
  return leads;
}
