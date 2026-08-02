export function cleanResponse(text, fallback = '') {
  if (!text || !text.trim()) return fallback;

  let cleaned = text.trim();

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (cleaned.length > 300) {
    cleaned = cleaned.substring(0, 297) + '...';
  }

  return cleaned;
}

// ========================================
// SCRIPT-CONSISTENCY GUARDS
// LLMs (especially llama-3.3-70b at low token budgets) sometimes produce:
//   1. Mixed Latin/Cyrillic script in a single word: "потencijални"
//   2. Dangling duplicated conjunctions: "...клиенти и потencijални и."
//   3. Truncated sentence fragments when MAX_TOKENS cuts them off.
// These guards detect and repair such artifacts so garbled text is
// never sent to the owner.
// ========================================

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const LATIN_RE = /[a-z]/i;

// Latin → Cyrillic mapping for letters that leak into otherwise-Cyrillic words.
const LATIN_TO_CYRILLIC = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х',
  i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п',
  r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', z: 'з'
};

/**
 * True if any word in the text mixes Latin AND Cyrillic letters
 * (e.g. "потencijални" → п-о-т + e-n-c-i-j + а-л-н-и).
 */
export function hasMixedScript(text) {
  if (!text) return false;
  return text.split(/\s+/).some(word => {
    const letters = word.replace(/[^\p{L}]/gu, '');
    return letters.length > 1 && LATIN_RE.test(letters) && CYRILLIC_RE.test(letters);
  });
}

/**
 * Repair mixed-script words by converting embedded Latin letters to their
 * Cyrillic equivalents. "потencijални" → "потенцијални".
 */
export function fixMixedScript(text) {
  if (!text) return text;
  return text.split(/\s+/).map(word => {
    const letters = word.replace(/[^\p{L}]/gu, '');
    if (letters.length <= 1 || !LATIN_RE.test(letters) || !CYRILLIC_RE.test(letters)) {
      return word;
    }
    return word.split('').map(ch => {
      const lower = ch.toLowerCase();
      if (/[a-z]/.test(lower) && LATIN_TO_CYRILLIC[lower]) {
        return LATIN_TO_CYRILLIC[lower];
      }
      return ch;
    }).join('');
  }).join(' ');
}

// Conjunctions that, when duplicated at the end of a sentence, indicate a
// dangling LLM fragment. Matches both Cyrillic and Latin spellings.
const DANGLING_CONJ = /(^|\s)(и|а|но|или|i|a|no|ili)\s*[.!?…]?\s*$/i;

/**
 * True if the text ends with a conjunction that also appears earlier in the
 * same sentence — the "клиенти и потенцијални и" duplicate-conjunction
 * artifact.
 */
export function hasDanglingConjunction(text) {
  if (!text) return false;
  const core = text.replace(/[.!?…]+\s*$/, '').trim();
  const m = core.match(DANGLING_CONJ);
  if (!m) return false;
  const conj = m[2].toLowerCase();
  const before = core.slice(0, m.index).trim();
  // The same conjunction must already exist earlier in the sentence.
  return new RegExp(`(^|\\s)${conj}(\\s|$)`, 'i').test(before);
}

/**
 * Strip a trailing dangling/duplicated conjunction, preserving punctuation.
 * "...клиенти и потенцијални и." → "...клиенти и потенцијални."
 */
export function stripDanglingConjunction(text) {
  if (!text || !hasDanglingConjunction(text)) return text;
  const punctMatch = text.match(/[.!?…]+\s*$/);
  const punct = punctMatch ? punctMatch[0] : '';
  const core = text.slice(0, text.length - punct.length).trim();
  return core.replace(DANGLING_CONJ, '$1').trim() + punct;
}
