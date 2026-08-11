// ========================================
// CLOSING FOLLOW-UP WINDOW (approved Option A — grace window only)
// After a successful data-collection close, the engine keeps the chat
// reachable for CLOSE_FOLLOWUP_WINDOW_MS (10 min). Any owner message inside
// that window is answered HERE — rule-based, no LLM, no data collection, no
// persuasion — so natural end questions never hit silence (reported: after
// the goodbye, "KOGA DA VE OCEKUVAM SO KLIENTI?" / "SE NAJDOBRO" were
// dropped with { type: 'IGNORED' } and Ana went dark at the warmest moment).
//
// Three tiers:
//   1. WHEN-TO-EXPECT ("koga da ve očekuvam so klienti?", "koga ke ima
//      klienti?", "za kolku vreme?") → a timeline answer. Rent vs sale
//      wording (same pattern as deal-terms.js). NEVER a concrete promise —
//      only "најчесто / вообичаено" phrasing (legal/commitment safety).
//   2. THANKS / GOODBYE ("se najdobro", "blagodaram", "prijaten den") →
//      a warm closing ack, no new content.
//   3. ANYTHING ELSE → a short safe ack that keeps the door open without
//      promising anything specific.
// ========================================
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const EXPECT_RENT = [
  'Штом најдеме заинтересиран закупец, веднаш ќе ве контактирам — најчесто во првата недела од објавувањето.',
  'Вообичаено во првите неколку дена од објавата се јавуваат заинтересирани. Ќе ве известам веднаш.'
];

const EXPECT_SALE = [
  'Штом најдеме заинтересиран купувач, веднаш ќе ве контактирам — најчесто во првата недела од објавувањето.',
  'Вообичаено во првите неколку недели се јавуваат сериозни купувачи. Ќе ве известам веднаш.'
];

const GOODBYE_ACKS = [
  'Ви благодарам! Пријатен ден. Ќе ве известам за секој напредок.',
  'Ви благодарам на соработката! Пријатен ден и до слушање.'
];

const FALLBACK_ACKS = [
  'Разбрав. Ќе ве контактирам штом има нешто ново. Пријатен ден!',
  'Јасно. Ќе ве известам за секој напредок. Пријатен ден!'
];

// WHEN-TO-EXPECT — the owner wants a timeline for client contact:
//   "koga da ve očekuvam so klienti?" / "koga da ve čekam?" (when should I
//   expect you / wait for you), "koga ke ima klienti/zainteresirani/kupci?",
//   "koga ke ve vidime / koga da se javime?" and the how-long family
//   ("za kolku vreme?", "kolku vreme ke trae?"). Latin + Cyrillic, all
//   common clitic orders.
// NOTE: leading (?:^|[^a-zа-я]) on every alternative — bare-Latin tokens must
// never substring-match inside a longer word (codebase convention).
const EXPECT_RE =
  /(?:^|[^a-zа-я])(?:koga|кога)\s+(?:da\s+)?(?:ve|ве|te|те)\s+(?:o[čcć]ekuvam|очекувам|čekam|чекам|chekam|ocekuvam)|(?:^|[^a-zа-я])(?:koga|кога)\s+(?:ke|ќе)\s+(?:ima|има)\s+(?:klienti|клиенти|zainteresirani|заинтересирани|kupci|купци)|(?:^|[^a-zа-я])(?:koga|кога)\s+(?:da|ќе)\s+(?:ve|ве)\s+(?:vidime|видиме|kontaktiram|контактирам|se\s+javime|се\s+јавиме)|(?:^|[^a-zа-я])(?:za\s+kolku\s+vreme|за\s+колку\s+време|kolku\s+vreme\s+(?:ke|ќе)\s+trae|колку\s+време\s+(?:ке|ќе)\s+трае)/i;

// THANKS / GOODBYE — a pure valediction needs only a warm ack:
//   "blagodaram / fala", "se najdobro", "prijaten den", "pozdrav",
//   "do gledanje / dogledno", "by / bye / cb / cao / чао", "srećno".
// Leading boundary (?:^|[^a-zа-я]) — "by"/"cao"/"fala" must not match
// inside a longer Latin word (e.g. a word ending in "-by" followed by space).
const GOODBYE_RE =
  /(?:^|[^a-zа-я])(?:blagodaram|благодарам|fala|фала|se\s+najdobro|се\s+најдобро|prijaten\s+den|пријатен\s+ден|pozdrav|поздрав|dogledno|до\s+гледање|do\s+gledanje|sre[ćč]no|среќно|bye|by|cb|cao|чао|циао|dovi|дови|adios|адиос)(?:\s|$)/i;

/**
 * Answer an owner message that arrived inside the closing follow-up window.
 * Always returns a CLOSING_ANSWER (routed like a normal reply, never
 * terminal — the session stays closed, no CSV re-append, no state change).
 * The engine already filtered window expiry (onOwnerMessage) — a stale flag
 * reaching service.js directly simply gets a polite final answer.
 */
export function handleClosingFollowUp(session, userInput) {
  const tt = session.collectedData?.transactionType || session.adMemory?.transactionType;
  const u = String(userInput || '').toLowerCase().trim();

  if (EXPECT_RE.test(u)) {
    console.log(`[CLOSING: when-to-expect answer (${tt === 'rent' ? 'rent' : 'sale'})]`);
    return { text: pick(tt === 'rent' ? EXPECT_RENT : EXPECT_SALE), type: 'CLOSING_ANSWER' };
  }
  if (GOODBYE_RE.test(u)) {
    console.log('[CLOSING: warm goodbye ack]');
    return { text: pick(GOODBYE_ACKS), type: 'CLOSING_ANSWER' };
  }
  console.log(`[CLOSING: fallback ack — "${u.slice(0, 50)}"]`);
  return { text: pick(FALLBACK_ACKS), type: 'CLOSING_ANSWER' };
}
