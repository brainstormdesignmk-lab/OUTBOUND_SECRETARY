// ========================================
// classifier.js — Intent Classification
// Pure functions: (userInput, conversation) => { intent, confidence, reason }
// No external dependencies needed
// ========================================

// ========================================
// Centralized conversation-continuation words pattern
// Exported for use by service.js to keep in sync.
// These words after an affirmative mean "yes continue talking"
// NOT "yes I accept cooperation".
// ========================================
export const CONV_CONTINUATION_WORDS = /(?:prodolz|продолж|razgovar|разговар|slusam|слушам|slusham|objasn|објасн|kazh|каж|izvoli|изволи|pojasn|појасн|poveke|повеќе|samo\s*(prasaj|прашај)|slobodno|слободно)/i;

// ========================================
// STRONG ACCEPTANCE WORDS
// Shared by the zvuci acknowledgment guard and CONTEXT RULE D3.
// When a message contains BOTH rhetorical acknowledgment language
// ("dobro zvuci") AND strong acceptance language, the strong acceptance
// must win — these exclusions let those messages fall through to the
// explicit ACCEPTED rules instead of being downgraded to INTERESTED.
// NOTE: deliberately does NOT include "sorabotuv" — a message like
// "dobro zvuci. vekje sorabotuvam so druga agencija" (I already cooperate
// with another agency) is NOT acceptance and must stay INTERESTED.
// NOTE: including "važi" means "dobro zvuci, važi" after a rhetorical closer
// reaches the catch-all → ACCEPTED 0.9 (consistent with the approved rule
// that важи = strong acceptance 0.90). Intentional trade-off.
// ========================================
export const STRONG_ACCEPTANCE_WORDS = /(probame|пробаме|sorabotk|соработк|soglasuv|согласув|prifakj|прифаќ|dogovor|договор|vazi|važi|важи|ajde|ајде|sakam|сакам|pochnuvame|почнуваме|pocneme|почнеме|zapocneme|започнеме|zapochneme|probaj|пробај|probajte|пробајте|vo red|во ред)/i;

// ==========================================
// HESITATION GUARD WORDS
// Pure hedging words that downgrade "da ... probame" from committed acceptance
// to INTERESTED: "da mozebi ke probame" (yes, maybe we'll try) and
// "da razmislam pa ke probame" (let me think, then we'll try) are NOT
// commitments. Uses the "razmisl" root so razmislam/razmisluvam are covered.
// NOTE: deliberately EXCLUDES ama/sepak — "ama probame" (but let's try) is an
// intentional acceptance despite doubt (see hasAcceptanceDoubt exemption).
// SEMANTIC JUDGMENT: the word anywhere in a probame-family sentence means
// hedged, even mid-sentence hedges like "da probame, mozebi ke uspee"
// (let's try, maybe it'll work) — an owner who hedges is not committing.
// Erring toward INTERESTED is deliberate; the sales flow re-asks instead of
// over-committing to cooperation.
// ==========================================
export const HESITATION_GUARD_WORDS = /(mozebi|можеби|razmisl|размисл|ke vidime|ќе видиме|da vidime|да видиме)/i;

// ==========================================
// STANDALONE NEGATION GUARD
// Matches "ne"/"не" only as a standalone word, NOT as a substring of
// another word. JS \b does not work for Cyrillic (non-\w) chars, and a bare
// /(ne|не)/ test is WRONG for words like "pocneme" (po-cne-me), "започнеме",
// "zapochneme", "zapocneme" — they all contain "ne"/"не" as a substring and
// would self-block their own acceptance rules. Used by the acceptance rules
// whose trigger words contain "ne"/"не" (aorist "pocneme" family, go-ahead).
//
// Uses \P{L} (any non-letter) with the u flag instead of a hand-rolled
// [^a-zа-яё] class, because the а-я range (U+0430-044F) EXCLUDES the
// Macedonian-specific letters ј, љ, њ, ќ, ѓ, ѕ, џ (all U+0450+) and Latin
// š/ž/č/đ/ć — so "нејасно" (не+ј) and especially "nešto" (не+š, a very
// common Latin transcription of нешто) would otherwise be wrongly treated
// as containing a standalone "ne". \P{L} covers every script correctly.
// ==========================================
export function hasStandaloneNegation(u) {
  return /(?:^|\P{L})(?:ne|не)(?:$|\P{L})/iu.test(u);
}

// ==========================================
// ACCEPTANCE DOUBT GUARD
// When a message matches an ACCEPTED pattern but also contains
// doubt signals (questions, agency/commission questions, concerns),
// downgrade to INTERESTED. This prevents premature cooperation
// acceptance from messages like:
//   "може, ама која агенција сте?" → NOT accepted
//   "да, ама како работите?" → NOT accepted
//   "важи, ама која агенција сте?" → NOT accepted
// ==========================================
export function hasAcceptanceDoubt(u) {
  const lower = u.toLowerCase().trim();
  // Question mark
  if (/\?/.test(lower)) return true;
  // Agency questions: "koja agencija", "која сте вие", "kade vi e kancelarijata"
  if (/(koja|која|kakva|каква).{0,20}(agencija|агенција)/i.test(lower)) return true;
  if (/(kade|каде).{0,20}(kancelari|канцелари)/i.test(lower)) return true;
  if (/koja ste|која сте|koj ste|кој сте/i.test(lower)) return true;
  // Commission/responsibility questions
  if (/(provizija|провизија|obvrski|обврски|obvrska|обврска|procent|процент|%).{0,20}(plakjam|плаќам|zimate|земате|kolku|колку)?/i.test(lower)) return true;
  if (/(plakjam|плаќам|zimate|земате|kolku|колку).{0,20}(provizija|провизија)/i.test(lower)) return true;
  if (/od koj dzeb|од кој џеб|od kade parite|од каде парите/i.test(lower)) return true;
  // Cooperation question: "kakva sorabotka", "za kakva sorabotka"
  if (/kakva sorabotka|каква соработка|za kakva|за каква/i.test(lower)) return true;
  // How it works
  if (/kako.{0,10}(raboti|работи|funkcionira|функционира)/i.test(lower)) return true;
  // But/hesitation — NOT if probame is in the message ("ama probame" = acceptance despite doubt)
  if (/\b(ama|ама|sepak|сепак|no|но)\b/i.test(lower) && !/probame|пробаме|da probame|да пробаме/i.test(lower)) return true;
  return false;
}

// ========================================
// Parse conversation context from the conversation string
// Extracts last N messages, returning Ana's last message and user's last message
// conversation format: "Ана: message\nСопственик: message\nАна: message..."
// ========================================
export function parseConversationContext(conversation) {
  if (!conversation || conversation.trim().length === 0) {
    return { lastAnaMessage: '', lastUserMessage: '', previousUserMessages: [] };
  }

  const lines = conversation.split('\n').filter(l => l.trim());
  const userMessages = [];
  let lastAnaMessage = '';
  let lastUserMessage = '';

  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmedLine = lines[i].trim();
    if (trimmedLine.startsWith('Ана:')) {
      if (!lastAnaMessage) {
        lastAnaMessage = trimmedLine.replace(/^Ана:\s*/i, '').toLowerCase();
      }
    } else if (trimmedLine.startsWith('Сопственик:')) {
      const text = trimmedLine.replace(/^Сопственик:\s*/i, '').toLowerCase();
      if (!lastUserMessage) {
        lastUserMessage = text;
      }
      userMessages.push(text);
    }
  }

  return {
    lastAnaMessage,
    lastUserMessage,
    previousUserMessages: userMessages.slice(0, 3)
  };
}

// ========================================
// Intent Classification — Finite State Machine (B12)
// Replaces LLM-based classification with deterministic rule-based FSM.
// Priority: REJECTED > ACCEPTED > INTERESTED > AMBIGUOUS
// All patterns support BOTH Latin and Cyrillic (Macedonian owners use both).
// ========================================
export function classifyIntent(userInput, conversation) {
  const u = userInput.toLowerCase().trim();

  // Parse conversation context for context-aware rules
  const ctx = parseConversationContext(conversation);

  // ==========================================
  // CONTEXT RULE A: Objection context boost
  // If Ana just explained commission/pricing in her last message,
  // the user's reply is likely an engaged continuation, not a rejection.
  // ==========================================
  const anaExplainingCommission = /провизија|разлика|чиста цена|купопродажна|барана цена|без провизија|нашата провизија|вашата цена/i.test(ctx.lastAnaMessage);
  const isShortEngaged = u.length < 30 && !/(ne|не)\s*(sakam|me|sum|mi)|ostavi me|izvini/i.test(u);

  // ==========================================
  // CONTEXT RULE A2: Cooperation question context
  // If Ana just explicitly asked a yes/no cooperation-commitment question
  // (e.g., "Дали да почнеме со соработка?", "Дали сте расположени да соработуваме?"),
  // and the owner's reply is short/positive, interpret it as acceptance.
  // This handles cases like: Ana asks "Дали да почнеме?" → owner says "moze ana" → ACCEPTED
  //
  // IMPORTANT: This deliberately does NOT match rhetorical/meta closers like:
  //   "Што мислите?" (what do you think?)
  //   "Како ви звучи ова?" (how does this sound?)
  //   "Дали ви е појасно?" (is it clearer?)
  //   "Дали сакате да дознаете?" (do you want to know?)
  //   "Дали сте заинтересирани?" (are you interested? — too generic)
  //   "Дали да продолжиме?" (shall we continue — conversation continuation, not cooperation)
  // A short positive reply ("moze"/"da") to those is just agreeing with the explanation,
  // NOT committing to cooperate. Only the two explicit cooperation-commitment templates
  // should trigger auto-acceptance on a short positive reply.
  // ==========================================
  const anaAskingCooperation = /(?:да\s+почнеме.{0,30}?соработ|расположени\s+да\s+соработув)/i.test(ctx.lastAnaMessage);

  // ==========================================
  // FUTURE/HYPOTHETICAL COOPERATION GUARD (reported)
  // Ana's last message may ask about cooperation in the FUTURE or conditionally
  // ("Дали сте расположени да соработуваме во иднина, ако имате друг имот
  // за продажба?") rather than committing to the CURRENT property. A short
  // positive reply ("sekako" — sure, "ke ve kontaktiram" — I'll contact you,
  // "ubav den" — have a nice day) to such a question is polite SOCIAL
  // agreement — the owner is wrapping up the conversation, NOT accepting a
  // cooperation deal for this property. Real owners say "sekako" and hang up.
  // Only PRESENT-tense commitment questions ("Дали да почнеме со соработка?")
  // should boost short positives to ACCEPTED. AnaAskingCooperation-gated so
  // unrelated messages never hit this.
  // ==========================================
  const anaAskingFutureCooperation = anaAskingCooperation &&
    /(?:во\s+иднина|vo\s+idnina|иднина|idnina|ако\s+(?:имате|имаш|има|сакате)|ako\s+(?:imate|imas|ima|sakate)|доколку|dokolku|друг\s+имот|drug\s+imot|друг\s+стан|drug\s+stan|подоцна|podocna|во\s+прилика|vo\s+prilika|кога\s+ќе|koga\s+ke|следниот\s+пат|sledniot\s+pat)/i.test(ctx.lastAnaMessage);

  const isShortPositive = u.length < 50 && !/(ne|не)/i.test(u) && !/\?/.test(u) && !/(ama|ама|sepak|сепак|no|но)\b/i.test(u);

  // ==========================================
  // CONTEXT RULE A3: Rhetorical closer context
  // If Ana's last message ended with a rhetorical/meta closer
  // ("Како ви звучи ова?" / "Што мислите?" / "Дали ви е појасно?" / "Дали ви се разјасни?" /
  // "Дали ви помогна примерот?" — did the example help?), a short positive
  // reply is only acknowledging the explanation — it is NOT committing to
  // cooperate. The owner is saying "sounds fine" about the pitch, not
  // "yes, let's work together." Stay in PERSUASION (INTERESTED).
  // NOTE: "дали ви помогна" / "помогна ли" (did it help) was added after the
  // reported bug: after the commission EXAMPLE ("...а разликата е наша
  // провизија. Дали ви помогна примерот?") the owner's "da jasno mi e"
  // (yes, it's clear to me) is an answer to the example question, NOT a
  // cooperation acceptance — but the affirmative-start catch-all read it as
  // ACCEPTED 0.9 and kicked the phase into DATA_COLLECTION.
  // ==========================================
  const anaAskedRhetoricalCloser =
    /како ви звучи|kako vi zvuci|што мислите|sto mislite|дали ви е појасно|dali vi e pojasno|дали ви се разјасни|dali vi se razjasni|дали ви е јасно|dali vi e jasno|како звучи|kako zvuci|дали ви помогна|dali vi pomogna|помогна ли|pomogna li/i.test(ctx.lastAnaMessage);

  // "звучи" acknowledgment guard — "dobro mi zvuci" (sounds good to me),
  // "dobro zvuci" (sounds good) — the owner is commenting on the offer's
  // appeal, NOT agreeing to cooperate. Must run BEFORE the catch-all
  // "affirmative start" rule which would otherwise return ACCEPTED 0.9.
  // Also handles "zvuci dobro" (reverse word order).
  // NOTE: uses hasAcceptanceDoubt(u) directly (not hasDoubt) because this
  // guard runs before the hasDoubt const is declared in the ACCEPTED section.
  // NOTE: strong-acceptance language is excluded (shared STRONG_ACCEPTANCE_WORDS
  // constant, same list as D3) so "dobro zvuci, ajde da probame" still yields
  // ACCEPTED, not INTERESTED.
  if (/(zvuci|звучи)/i.test(u) && /(dobro|добро|super|супер|odlicno|одлично)/i.test(u) && !/(ne|не)/i.test(u) && !hasAcceptanceDoubt(u) &&
      !STRONG_ACCEPTANCE_WORDS.test(u)) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "rhetorical acknowledgment — zvuci (sounds good), not cooperation" };
  }

  // ==========================================
  // 0. PRICE QUOTE GUARD — "jas baram 156 iljadi", "sakam 98000", "cena 120 iljadi"
  // These are NOT rejections — they're stating a desired net price (buying signal!)
  // ==========================================
  const priceQuoteGuard =
    /(baram|сакам|sakam|цена|cena|price)\s*(\d{1,3}(\.\d{3})*\s*(iljadi|илјади)?)/i.test(u) ||
    /(\d{1,3}\s*(iljadi|илјади).*za\s*(mene|мене))/i.test(u) ||
    /(baram|сакам|sakam|цена|cena|price)\s+([a-zа-я]+(\s+i\s+[a-zа-я]+)*)\s+iljadi/i.test(u);
  if (priceQuoteGuard) {
    return { intent: "INTERESTED", confidence: 0.8, reason: "net price quote" };
  }

  // ==========================================
  // 1. REJECTED — explicit no/refusal
  // ==========================================
  if (/^(ne|не)$/i.test(u)) {
    // CONTEXT RULE B: Previous user engagement → downgrade standalone "ne" from REJECTED
    if (ctx.lastUserMessage && /\?|kako|sto|што|kakva|каква|kolku|колку|dali|дали|koj|кој/i.test(ctx.lastUserMessage)) {
      return { intent: "INTERESTED", confidence: 0.65, reason: "standalone ne with context: user was previously engaged" };
    }
    return { intent: "REJECTED", confidence: 0.95, reason: "standalone ne" };
  }
  if (/(ne|не)\s*sum\s*(zainteresiran|заинтересиран)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne sum zainteresiran" };
  // BARE "NE SUM" (reported, lead 5436709): "NE SUM" / "NE SUM, FALA" — a
  // short direct answer to the cooperation/interest question ("Дали сте
  // заинтересирани?") is a DECLINE, but the old flow read it as INTERESTED
  // 0.5 (ambiguous default) and Ana kept pitching. SHORT-message-only (≤ 4
  // words, only a polite tail allowed after the copula) so "ne sum siguren"
  // (I'm not sure — hesitation, stays INTERESTED) and any mid-sentence
  // "ne sum ..." declaration can never match. The availability family
  // ("uste ne sum go prodal" = still available) is handled by the
  // availability handler before this ever runs.
  if (/^(?:ne|не)\s*sum\s*(?:[,.!?]+\s*)?(?:fala|фала|blagodaram|благодарам)?\s*[.!?]?$/i.test(u) &&
      u.split(/\s+/).length <= 4) {
    return { intent: "REJECTED", confidence: 0.85, reason: "bare ne sum (short answer)" };
  }
  if (/(ne|не)\s*me\s*(interesira|интересира)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne me interesira" };
  if (/(ne|не)\s*(sakam|сакам)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne sakam" };
  if (/(ne|не)\s*mi\s*(treba|треба)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ne mi treba" };
  if (/(ostavi|остави)\s*(me|ме)/i.test(u)) return { intent: "REJECTED", confidence: 0.95, reason: "ostavi me" };
  if (/(izvini|извини),?\s*(ne|не)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "izvini ne" };
  if (/(nemam|немам)\s*(namera|намера)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "nemam namera" };
  if (/(nema|нема)\s*(potreba|потреба)/i.test(u)) return { intent: "REJECTED", confidence: 0.85, reason: "nema potreba" };
  if (/(ne|не)\s*(bake|бате)/i.test(u)) return { intent: "REJECTED", confidence: 0.9, reason: "ne bake" };
  if (/(ne|не)\s*(mislam|мислам)\s*da/i.test(u)) return { intent: "REJECTED", confidence: 0.85, reason: "ne mislam da" };
  if (/(ne|не)\s*(moze|може)\s*da/i.test(u)) return { intent: "REJECTED", confidence: 0.8, reason: "ne moze da" };
  // PRIOR-REFUSAL REAFFIRMATION (reported, lead 5502969): "TI REKOV DEKA
  // SAMA KE PROBAM" (I TOLD YOU I'll try myself) is a firm reaffirmation of
  // an EARLIER refusal, NOT a fresh acceptance — the generic "ke probam" rule
  // (ACCEPTED 0.85) must never fire on it. Requires BOTH an "I already told
  // you" marker AND a self-doing/refusal verb, so price/floor answers
  // ("350 TI KAZAV", "7 TI KAZAV") stay unaffected.
  if (/(?:ti|ти)\s*(?:rekov|реков|kazav|кажав)/i.test(u) &&
      /(?:sama|сама|sam|сам)\s*(?:ke|ќе)|ne\s*mi\s*treba|не\s*ми\s*треба|nema\s*(?:potreba|потреба)|bez\s*agencija|без\s*агенција|ne\s*sakam|не\s*сакам|ostavi\s*me|остави\s*ме/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.9, reason: "prior refusal reaffirmation" };
  }
  // SELF-SERVICE REFUSAL (reported, lead 5502969): "SAMA KE SI GI IZDADAM",
  // "SAMA KE PROBAM", "SAM KE PROBAM", "KE PROBAM SAMA" — the owner will do
  // it THEMSELVES, which is a refusal of the agency. "ke probam" (I will try)
  // is only acceptance when it means trying WITH us; "sama/sam ke probam"
  // always means trying ALONE. Must fire before the "ke probam" ACCEPTED rule.
  // VERB-BOUNDARY GUARD (reviewer finding): the verb alternatives must not
  // PREFIX-match longer verbs — "probam" (I'll try, 1sg) would otherwise
  // match inside "probame" (we'll try, 1pl), so "SAMA KE PROBAME ZAEDNO"
  // (let's try TOGETHER — a cooperative offer with the owner as part of the
  // "we") was wrongly REJECTED as self-service. Same for "izdadame"
  // (we-rent). The boundary is CYRILLIC-AWARE (?=$|[^a-zа-я]) — JS `\b` is
  // ASCII-only and fails after a Cyrillic verb. Both word orders get it.
  if (/(?:sama|сама|sam|сам)\s*(?:ke|ќе)\s*(?:(?:(?:(?:si|си)\s*)?(?:(?:gi|ги|go|го)\s*)?(?:izdadam|издадам|izdavam|издавам))|(?:probam|пробам)|(?:napravam|направам))(?=$|[^a-zа-я])/i.test(u) ||
      /(?:ke|ќе)\s*(?:(?:go|го)\s*)?(?:probam|пробам|izdadam|издадам|izdavam|издавам)(?=$|[^a-zа-я])\s+(?:sama|сама|sam|сам)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.85, reason: "self-service (sama/sam ke)" };
  }
  // BUZZ-OFF / UNSUBSCRIBE (reported, lead 5502969): "OTKACI SE" (buzz off),
  // "OTKAZI SE", "откачи се" — a firm demand to stop messaging. Same class as
  // "ostavi me" — must count as a rejection, never as engagement.
  if (/(?:otkaci|откачи|otkazi|откажи|otkazhi)\s*(?:se|се)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.9, reason: "otkaci se" };
  }
  // FRUSTRATION SIGNAL (reported, lead 5502969): "DOSADNA SI" (you're
  // annoying) — the owner wants to be left alone; treat it as a rejection so
  // it escalates Ana toward giving up, never as engagement.
  // WORD-BOUNDARY REQUIRED: "si"/"ste"/"e" must be a standalone word —
  // "dosadna situacija" (the annoying situation) contains "dosadna si..." as
  // a substring but is NOT "you are annoying".
  if (/(?:dosadna|досадна|dosaden|досаден|dosadno|досадно|dosadni|досадни)[\s,]+(?:si|си|ste|сте|e|е)(?:[\s,.;!?]|$)/i.test(u) ||
      /(?:si|си|ste|сте)[\s,]+(?:dosadna|досадна|dosaden|досаден|dosadni|досадни)(?:[\s,.;!?]|$)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.85, reason: "dosadna si (frustration)" };
  }

  // ==========================================
  // SOFT-REFUSAL FAMILY (reported, lead 5540516): the owner's polite
  // brush-offs were classified INTERESTED — "Mislam deka ne bi sorabotuval
  // so agencija" (0.7), "sakam da probam sam prvo" (0.7), "nemam vreme sega,
  // ke bideme vo kontakt" (0.5), "ako ne go prodadam ke ve kontaktiram"
  // (0.6), "fala vi" — so rejectionCount never incremented (INTERESTED>0.5
  // even RESET it) and Ana kept pitching through message after message.
  // All of these ARE refusals of the cooperation question: count them so the
  // ladder escalates (1 → rebuttal, 2 → polite goodbye + CLOSED, 3+ → cut).
  // All fire BEFORE the ACCEPTED catch-alls ("ke probam" 0.85 etc).
  // ==========================================

  // "NE BI SORABOTUVAL(A)" — "I wouldn't work with [an agency]" — a firm
  // conditional no ("Mislam deka ne bi sorabotuval so agencija").
  if (/(?:ne|не)\s*bi\s*(?:sorabotuval|соработувал|sorabotuvala|соработувала|sorabotuvali|соработувале)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.85, reason: "ne bi sorabotuval (conditional no)" };
  }

  // "DA PROBAM SAM" / "PROBAM SAM PRVO" — "I'll try [selling it] myself
  // first". The self-service rule above covers "sam KE probam" and
  // "ke probam sam"; this covers the "sakam da probam sam prvo" shape (no
  // ke, sam AFTER the verb). Word boundary keeps 1pl "probame" (we'll try
  // together) clean.
  if (/probam\s+(?:sam|сам)(?:\s|$)/i.test(u) || /(?:sam|сам)\s*(?:da|да)\s+probam(?:\s|$)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.85, reason: "self-service (probam sam)" };
  }

  // "NEMAM VREME" — "I have no time [now]" — the most common polite
  // brush-off ("nemam vreme sega, ke bideme vo kontakt"). ESCAPE (reviewer
  // finding): a strong acceptance marker in the same message wins —
  // "nemam vreme da odgovoram na se, ama da probame" (no time to answer
  // everything, but let's try) is a commitment, not a refusal. REJECTED
  // rules run before ACCEPTED, so without the escape the acceptance would
  // never get a chance. The escape also honors the cooperation-commitment
  // verbs ("nemam vreme za sostanoci ama sakam da sorabotuvame" = I want
  // to work together) — but NOT bare "nemam vreme da sorabotuvam sega"
  // (no time to cooperate NOW is still a refusal).
  if (/(?:nemam|немам|nema|нема)\s+(?:vreme|време)/i.test(u) &&
      !/(?:ajde|ајде|da\s+(?:probame|пробаме)|moze\s+da|може\s+да|se\s+soglasuvam|се\s+согласувам|prifakjam|прифаќам|(?:sakam|сакам|ke|ќе)\s*(?:da|да)?\s*(?:sorabotuvam|соработувам|sorabotuvame|соработуваме)|sorabotuvame|соработуваме)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.8, reason: "nemam vreme (no time)" };
  }

  // FUTURE-CONTACT BRUSH-OFF — "ke ve kontaktiram" (I'll contact you),
  // "ke bideme vo kontakt" (we'll be in touch), "ke se javam" (I'll call
  // back) — the owner DEFERS instead of committing. Same family as the delay
  // signal the prior-agreement acknowledgment deliberately excludes.
  if (/(?:ke|ќе)\s*(?:se|се)\s*(?:javam|јавам)/i.test(u) ||
      /(?:ke|ќе)\s*(?:bideme|бидеме)\s*(?:vo|во)\s*(?:kontakt|контакт)/i.test(u) ||
      /(?:ke|ќе)\s*(?:ve|ве|te|те)\s*(?:kontaktiram|контактирам|izvestam|известам)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.8, reason: "future contact (brush-off)" };
  }

  // STANDALONE THANKS — "fala vi" / "blagodaram" alone: in the persuasion
  // context a whole-message thank-you is a polite no ("thanks, I'm done").
  // WHOLE-MESSAGE only, so "fala, dogovoreno" (thanks, agreed) and "fala za
  // informaciite, ke razmislam" are never swallowed — those stay engagement.
  // Two-word forms FIRST (longest-match), both scripts for the tail:
  // "благодарам ви" (all Cyrillic) must match — the paired tail keeps the
  // script of the head (reviewer finding: an earlier draft paired Cyrillic
  // "благодарам" with Latin "vi", missing the all-Cyrillic form).
  if (/^(?:fala\s*vi|фала\s*ви|fala\s*ti|фала\s*ти|vi\s*blagodaram|ви\s*благодарам|blagodaram\s*vi|благодарам\s*ви|blagodaram\s*ti|благодарам\s*ти|fala|фала|blagodaram|благодарам)(?:[.!]?)$/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.75, reason: "standalone thanks (polite no)" };
  }

  // ==========================================
  // NEGATED COOPERATION STATEMENT — rollback phrases
  // "ne sum rekol deka sakam sorabotka" (I didn't say I want to cooperate),
  // "ne ti rekov deka sakam sorabotka", "ne kazav deka sakam sorabotka",
  // "ne sum siguren deka sakam sorabotka" (I'm not sure I want to) —
  // the owner denies previously stated cooperation intent. MUST fire BEFORE
  // the ACCEPTED "sakam sorabotka" rule, which would otherwise match
  // "sakam sorabotka" inside this negated sentence and re-accept immediately
  // after a cooperation rollback (runEarlyResponses just reset
  // cooperationAccepted=false — the classifier must not undo that).
  // Requires BOTH a negation phrase AND cooperation language.
  // NOTE: keep this negation alternation in sync with the rollback regex in
  // handlers/early-responses.js — both must cover the same phrases.
  // ==========================================
  if (/(ne|не)\s+(?:ti\s+|ти\s+|sum\s+|сум\s+)*(?:rekov|реков|rekol|рекол|kazal|кажал|kazav|кажав|siguren|сигурен)/i.test(u) &&
      /(sakam|сакам|sorabotk|соработк|dogovor|договор)/i.test(u)) {
    return { intent: "REJECTED", confidence: 0.9, reason: "negated cooperation statement — rollback" };
  }

  // ==========================================
  // 2. ACCEPTED — explicit yes/agreement
  // ==========================================

  // FIRST: Check for doubt signals in ACCEPTED-like messages
  // If the message matches an acceptance pattern but also has doubt
  // signals (questions, concerns), downgrade to INTERESTED.
  const hasDoubt = hasAcceptanceDoubt(u);

  // ==========================================
  // COOPERATION-VERB COMMITMENT ESCAPE (shared by D3 + the understanding guard)
  // The acknowledgment guards below downgrade short positives after a
  // rhetorical closer / understanding phrase to INTERESTED. But the
  // cooperation VERBS are explicit commitments: "sorabotuvame" (we cooperate),
  // "ke sorabotuvame" (we will cooperate), "sorabotuvam" (I cooperate).
  // STRONG_ACCEPTANCE_WORDS deliberately excludes the sorabotuv root (so
  // "dobro zvuci. vekje sorabotuvam so druga agencija" — already cooperating
  // with ANOTHER agency — is never taken as acceptance), which means the
  // guards would wrongly downgrade a genuine commitment verb after a closer.
  // Escape rule: ke/da-prefixed forms are ALWAYS commitments; the bare verb is
  // a commitment UNLESS the owner is already cooperating elsewhere
  // ("vekje ... druga" — that stays an acknowledgment / non-acceptance).
  // ==========================================
  const coopCommitmentVerb =
    /(?:ke|ќе|da|да)\s*(?:sorabotuvam|соработувам|sorabotuvame|соработуваме)/i.test(u) ||
    (/(?:^|\s)(?:sorabotuvame|соработуваме|sorabotuvam|соработувам)(?:\s|$)/i.test(u) &&
     !/(?:vekje|веќе|веке).{0,20}(?:druga|друга)/i.test(u));

  // ==========================================
  // CONTEXT RULE D3: Rhetorical closer guard
  // If Ana's last message used a rhetorical/meta closer ("Како ви звучи ова?",
  // "Што мислите?", "Дали ви е појасно?", "Дали ви се разјасни?"), a short
  // positive reply is only acknowledging the explanation — it is NOT committing
  // to cooperate. The owner is saying "sounds fine", not "yes, let's work together".
  // This prevents false acceptances like:
  //   Ana: "Како ви звучи ова?" → Owner: "moze" → must stay PERSUASION
  // Strong explicit acceptances (probame/sorabotka/dogovor/vazi/ajde) still pass
  // through unchanged. anaAskingCooperation cases are never downgraded.
  // ==========================================
  if (anaAskedRhetoricalCloser && !anaAskingCooperation && isShortPositive && !hasDoubt &&
      !STRONG_ACCEPTANCE_WORDS.test(u) && !coopCommitmentVerb) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "rhetorical closer — acknowledgment, not cooperation" };
  }

  // ==========================================
  // PRIOR-AGREEMENT ACKNOWLEDGMENT — "I already said that"
  // The owner confirms they ALREADY expressed agreement, pointing back at
  // their earlier statement instead of re-stating it:
  //   "PA TOA GO REKOV I JAS" (well, that's what I said too)
  //   "тоа го реков и јас" / "истото го реков" / "jas istoto go rekov"
  //   "веќе реков" (I already said) / "реков дека сакам" (I said I want)
  // In the persuasion flow this means "yes, I already told you I agree" —
  // it IS acceptance, not a new statement. Runs in the ACCEPTED section
  // BEFORE the catch-alls.
  // MUST NOT match negations/refusals:
  //   "не ти реков дека сакам соработка" → caught earlier (rollback rule)
  //   "реков дека не сакам" → caught earlier ("ne sakam" REJECTED)
  //   "jas rekov deka nemam vreme/iskustvo" → time/experience guard below
  //   "тоа го реков дека немам тераса" → deka+negation guard below
  //   PRIOR-REJECTION GUARD: bare forms like "тоа го реков" (without "и јас")
  //   could point back at an EARLIER refusal ("не сум заинтересиран" → then
  //   "тоа го реков" = "that's what I said [no]") — check previous user
  //   messages for rejection language, same idea as the standalone-да rule's
  //   hasPreviousHesitation.
  // ==========================================
  const hasPriorRejection = ctx.previousUserMessages.some(msg =>
    /(?:ne|не)\s*(?:sum|сум|sakam|сакам|mi|ми|me|ме)\s*(?:zainteresiran|заинтересиран|treba|треба|interesira|интересира)|ostavi|остави|izvini|извини|ne mi treba|не ми треба/i.test(msg)
  );
  if (/(rekov|реков|kazav|кажав)/i.test(u) &&
      /(?:toa\s*go|тоа\s*го|istoto|истото|isto\s*toa|исто\s*тоа|i\s*jas|и\s*јас|veke|vekje|веќе|веке|jas\s*istoto|јас\s*истото|(?:deka|дека)\s*(?:sakam|сакам))/i.test(u) &&
      !hasStandaloneNegation(u) && !hasDoubt && !hasPriorRejection &&
      !/(?:nemam|немам|nema|нема)\s+(?:vreme|време|iskustvo|искуство|namera|намера|potreba|потреба)/i.test(u) &&
      !/(?:rekov|реков|kazav|кажав)\s+(?:deka|дека)\s+(?:ne|не|nemam|немам|nema|нема)/i.test(u) &&
      !/(?:da|да|ke|ќе)\s*(?:se|се)\s*(?:javam|јавам)/i.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "prior agreement acknowledgment — owner already said so" };
  }

  // "ајде да пробаме" — strongest acceptance (0.98)
  // Uses .{0,15} proximity to require the words within 15 chars.
  // This prevents matching unrelated "ajde" and "probame" far apart.
  // HESITATION GUARD: "ajde mozebi ke probame" (come on, maybe we'll try) is
  // hedged, not committed — downgrade (falls through to INTERESTED).
  if (/ajde.{0,15}probame|ајде.{0,15}пробаме/i.test(u) && !(/(ne|не)/i.test(u)) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.98, reason: "ajde da probame" };
  }

  // "може да пробаме" — very strong acceptance (0.95)
  // HESITATION GUARD: "mozebi, moze da probame" / "moze da probame, ke vidime"
  // are hedged (maybe/we'll see) — same disease as the da-probame family.
  // NOTE: no negation guard needed here — "ne moze da probame" is already
  // caught by the earlier "ne moze da" REJECTED rule (0.80).
  if (/(moze|може)\s*da\s*(probame|пробаме)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "moze da probame" };
  }

  // "да пробаме" — very strong acceptance (0.95)
  // NOTE: Must use (?:probame|пробаме) non-capturing group to avoid
  // pipe precedence issue where |пробаме matches "пробаме" anywhere.
  // NEGATION GUARD (reviewer finding): the greedy .* swallows "ne" too —
  // "da ne probame" (let's NOT try) must not be accepted. Uses
  // hasStandaloneNegation (same as the pocneme rule), NOT a bare /(ne|не)/
  // test — a bare test would also match words that merely START with "ne"
  // without being negations, e.g. "da probame nešto novo" (let's try
  // something new) or "da probame nego" (let's try it), wrongly downgrading
  // genuine acceptances. hasStandaloneNegation only fires on a standalone
  // "ne"/"не" word.
  // HESITATION GUARD: "da mozebi ke probame" / "da razmislam pa ke probame"
  // are hedged (maybe/let me think) — downgrade to INTERESTED.
  if (/^(da|да)\s+.*(?:probame|пробаме)/i.test(u) && !hasDoubt && !hasStandaloneNegation(u) && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "da probame" };
  }

  // "важи" — strong acceptance (0.90)
  if (/^(vazhi|važi|важи)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.90, reason: "vazhi" };
  }

  // "почнуваме" — strong acceptance (0.90)
  // NEGATION GUARD: uses hasStandaloneNegation (NOT a bare /(ne|не)/ test) —
  // a bare test would wrongly block genuine acceptances that merely contain
  // a ne-PREFIX word ("nema problem, pochnuvame" = "it's no problem, let's
  // start" — "nema" is a word, not a standalone negation).
  // HESITATION GUARD: "mozebi pochnuvame" (maybe we start) is hedged, not
  // committed (audit finding — same disease as the probame family).
  if (/(pochnuvame|počnuvame|почнуваме)$/i.test(u) && !hasStandaloneNegation(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.90, reason: "pochnuvame" };
  }

  // ==========================================
  // "да почнеме" / "почнеме" / "да започнеме" — "let's start" (aorist) — strong acceptance
  // THE PRODUCTION BUG (reported): the owner said
  //   "SUPER, KAZI MI STO TI TREBA PA DA POCNEME"
  // (super, tell me what you need and let's start) — a crystal-clear acceptance —
  // but it was classified INTERESTED 0.5 (ambiguous default) because only the
  // present-tense "pochnuvame" was covered; the AORIST "pocneme"/"почнеме"
  // (the form Ana herself uses in "Дали да почнеме со соработка?") was missing
  // from every rule. Result: the session stayed in PERSUASION and the LLM
  // hallucinated a documents/meeting workflow nobody asked for.
  //
  // Covers: "da pocneme", "да почнеме", "pocneme", "почнеме", "zapocneme",
  // "започнеме" — anywhere in the message (not just at the end), with
  // negation/doubt guards. Runs in the ACCEPTED section BEFORE the catch-alls.
  // NEGATION GOTCHA: uses hasStandaloneNegation(u), NOT a bare /(ne|не)/ test —
  // the words "pocneme"/"започнеме"/"zapocneme"/"zapochneme" themselves contain
  // the substring "ne"/"не" (po-cne-me), so a substring test would block every
  // positive match. hasStandaloneNegation only fires on standalone "ne"/"не"
  // (e.g. "da ne pocneme" → blocked, "pocneme" → accepted).
  // HESITATION GUARD: "da mozebi ke pocneme" / "da razmislam pa ke pocneme"
  // (maybe we'll start / let me think then start) are hedged, not committed —
  // same disease as the da-probame family (audit finding).
  // ==========================================
  if (/(?:da\s+)?(?:pochneme|pocneme|почнеме|zapochneme|zapocneme|започнеме)(?:\s|[!.,;?]|$)/i.test(u) && !hasStandaloneNegation(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.92, reason: "pocneme — let's start" };
  }

  // ==========================================
  // "кажи ми што ти треба" — "tell me what you need" — go-ahead acceptance
  // The owner invites Ana to tell them what's needed to proceed. In context
  // this is a clear go-ahead ("ready when you are"), e.g. the first half of
  // the production message "SUPER, KAZI MI STO TI TREBA PA DA POCNEME".
  // Question-form variants ("кажи ми што ти треба?") are blocked by hasDoubt.
  // NOTE: deliberately does NOT include "кажи ми што ми треба" ("tell me what
  // I need") — that flips the subject (what *I* need, not what *you* need) and
  // is not a go-ahead; it could be a literal request for the owner's own info.
  // HESITATION GUARD: "кажи ми што ти треба за да одлучам" (tell me what you
  // need SO I CAN DECIDE) is NOT a go-ahead — the owner is still deciding.
  // Decision/thinking words after the phrase downgrade it to INTERESTED.
  // ==========================================
  if (/(kazi mi sto ti treba|кажи ми што ти треба|kazete mi sto vi treba|кажете ми што ви треба|kazhi mi shto ti treba)/i.test(u) && !hasStandaloneNegation(u) && !hasDoubt &&
      !/(odlucam|одлучам|razmislam|размислам|ke vidime|ќе видиме|ke razmislam|ќе размислам)/i.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.88, reason: "kazi mi sto ti treba — go-ahead" };
  }

  // "договорено" — strong acceptance (0.95)
  // HESITATION GUARD: "mozebi dogovoreno" (maybe agreed) is hedged (audit finding).
  // NEGATION GUARD: "ne dogovoreno" (not agreed) must not be accepted (audit finding).
  if (/dogovoreno|договорено/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "dogovoreno" };
  }

  if (/^(da|да)$/i.test(u)) {
    // CONTEXT RULE C1: Cooperation question boost
    // If Ana just directly asked "Дали да почнеме со соработка?",
    // and owner says "da" (the simplest possible yes), that's clear acceptance.
    if (anaAskingCooperation && !anaAskingFutureCooperation) {
      return { intent: "ACCEPTED", confidence: 0.90, reason: "standalone da responding to cooperation question" };
    }
    // CONTEXT RULE C2: Previous hesitation → downgrade standalone "da" to INTERESTED
    const hasPreviousHesitation = ctx.previousUserMessages.some(msg =>
      /mislam|мислам|mozebi|можеби|sepak|сепак|ama|ама|ne sum|не сум|ne znam|не знам|razmisl|размисл|prvo|прво|samo|само|probam|пробам|ke vidime|ќе видиме|da vidime|да видиме/i.test(msg)
    );
    if (hasPreviousHesitation) {
      return { intent: "INTERESTED", confidence: 0.6, reason: "standalone da with context: previous hesitation" };
    }
    return { intent: "ACCEPTED", confidence: 0.60, reason: "standalone da — low confidence" };
  }

  // "може" standalone — weak acceptance (0.65)
  if (/^(moze|може)$/i.test(u) && !hasDoubt) {
    // CONTEXT RULE C3: Cooperation question boost
    // If Ana just asked "Дали да почнеме со соработка?" and owner says "moze",
    // that's a clear acceptance, not ambiguous permission.
    if (anaAskingCooperation && !anaAskingFutureCooperation) {
      return { intent: "ACCEPTED", confidence: 0.90, reason: "moze responding to cooperation question" };
    }
    return { intent: "ACCEPTED", confidence: 0.65, reason: "moze — low confidence cooperation" };
  }

  // "моže {name}" — acceptance with personal address (0.90)
  // e.g., "moze ana", "може ана" — very common Macedonian acceptance pattern
  // The name can be any short word (agent name, etc.)
  // FUTURE-COOP GATE: "moze ana" after a future/hypothetical cooperation
  // question ("Дали сте расположени да соработуваме во иднина?") is polite
  // social agreement, not a commitment — same guard as C1/C3/D (reported).
  if (/^(moze|може)\s[a-zа-яё]{2,12}$/i.test(u) && !hasDoubt && !anaAskingFutureCooperation) {
    return { intent: "ACCEPTED", confidence: 0.90, reason: "moze plus name — strong personal acceptance" };
  }

  // "sakam" standalone — "I want" (0.85)
  if (/^(sakam|сакам)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "sakam — I want" };
  }

  // "sakam sorabotka" / "sakam da sorabotuvame" — explicit cooperation desire (0.95)
  // HESITATION GUARD: "mozebi sakam sorabotka" (maybe I want cooperation) is
  // hedged, not committed (audit finding — same disease as the probame family).
  // NOTE: negation is already safe — "ne sakam sorabotka" is caught by the
  // earlier "ne sakam" REJECTED rule (0.95), so no hasStandaloneNegation needed.
  if (/(sakam|сакам).{0,20}(sorabotk|соработк|sorabotuv|соработув)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "sakam sorabotka — explicit cooperation desire" };
  }

  // "da sum" — "yes I am" (0.85)
  if (/^(da|да)\s+(sum|сум)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "da sum — yes I am" };
  }

  // "probaj" / "probajte" — "try" / "try (polite)" — acceptance (0.85)
  if (/^(probaj|пробај|probajte|пробајте)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "probaj/probajte — try" };
  }

  // "ok" / "okej" standalone — acceptance (0.80)
  if (/^(ok|ок|okej|океј)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.80, reason: "ok/okej — okay" };
  }

  // ==========================================
  // POLITE FAREWELL / FUTURE-CONTACT GUARD (reported)
  // "ubav den" (have a nice day), "pozdrav" (greetings), "ke ve kontaktiram"
  // (I'll contact you), "ke se javam" (I'll get back to you), "ke prasam"
  // (I'll ask) — polite CLOSING messages. Owners send these to end the
  // conversation politely, NOT to accept cooperation. Previously, if Ana had
  // just asked a cooperation question (CONTEXT RULE D), a bare "ke ve
  // kontaktiram" / "ubav den" was boosted to ACCEPTED 0.85 → the phase
  // wrongly advanced to DATA_COLLECTION and Ana started asking for the sold
  // property's price (the reported conversation). This guard runs BEFORE the
  // cooperation-context boost and keeps these at INTERESTED. Real acceptance
  // words ("da probame", "sakam") are unaffected — "ke ve kontaktiram" after
  // "da, sakam sorabotka" still accepts via the sakam rule above.
  // ==========================================
  if (/(^(?:ubav|убав)\s+(?:den|ден)|^(?:prijaten|пријатен)\s+(?:den|ден)|^(?:ubava|убава)\s+(?:vecer|вечер)|^(?:prijatna|пријатна)\s+(?:vecer|вечер)|^pozdrav|^поздрав|^zbogum|^збогум|ke\s+ve\s+kontaktiram|ќе\s+ве\s+контактирам|ke\s+se\s+javam|ќе\s+се\s+јавам|ke\s+se\s+javim|ќе\s+се\s+јавим|ke\s+vi\s+se\s+javam|ќе\s+ви\s+се\s+јавам|ke\s+prasam|ќе\s+прашам)/i.test(u) &&
      !STRONG_ACCEPTANCE_WORDS.test(u) && !coopCommitmentVerb) {
    return { intent: "INTERESTED", confidence: 0.6, reason: "polite farewell / future contact — not cooperation" };
  }

  // CONTEXT RULE D: Cooperation question context boost
  // If Ana just explicitly asked "Дали да почнеме со соработка?" and the
  // owner replies with a short positive message, boost to ACCEPTED.
  // This catches positive replies that don't contain explicit acceptance words
  // but are clearly acceptances given the context of being asked directly.
  //
  // IMPORTANT: Must exclude conversation-continuation patterns ("da moze", "da prodolzi", etc.)
  // because those are conversational permission, not cooperation commitment.
  // "da moze" stays INTERESTED even with cooperation context.
  // PRIOR-REJECTION GUARD: if the owner previously refused ("не сум заинтересиран")
  // and now replies with a bare acknowledgment like "тоа го реков" (that's what
  // I said — pointing back at the refusal), do NOT boost to ACCEPTED. Without
  // this guard, CONTEXT RULE D would re-accept what the prior-agreement rule's
  // hasPriorRejection guard just blocked. Explicit fresh acceptances ("да"/"moze"
  // via C1/C3, "ajde da probame", etc.) are unaffected.
  if (anaAskingCooperation && !anaAskingFutureCooperation && isShortPositive && !hasDoubt && !hasPriorRejection && !HESITATION_GUARD_WORDS.test(u) &&
      !/(moze|може)\s+[a-zа-яё]{2,12}$/i.test(u) &&
      !CONV_CONTINUATION_WORDS.test(u) &&
      !/^(da|да)\s*[,.]?\s*moze(?:те|\s|$)/i.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "cooperation question context — short positive reply" };
  }

  // ==========================================
  // UNDERSTANDING CONFIRMATION GUARD (reported)
  // "da jasno mi e" ("yes, it's clear to me") — the owner is confirming they
  // UNDERSTOOD Ana's explanation (the commission example), NOT agreeing to
  // cooperate. The bottom "clear understanding" rule only matched
  // "mi … jasno" (mi BEFORE the keyword), so the reported message (jasno
  // BEFORE mi) fell through to the affirmative-start catch-all → ACCEPTED
  // 0.9 → the phase wrongly advanced to DATA_COLLECTION (the reported
  // "collecting phase triggered / wrong"). Covers both word orders
  // ("mi e jasno" / "jasno mi e"), "se e jasno" / "sve e jasno"
  // (everything's clear), "razbrav"/"razbiram" (I understood) and bare
  // "jasno". MUST run BEFORE the affirmative-start catch-all. Strong
  // acceptances are excluded via STRONG_ACCEPTANCE_WORDS, so
  // "jasno mi e, ajde da probame" still accepts (the strong rules then fire).
  // EXTRA EXCLUSION — the cooperation-verb commitment escape (coopCommitmentVerb,
  // shared with D3): an UNDERSTANDING phrase + "ke/da sorabotuvame" or a bare
  // cooperation verb ("jasno mi e, ke sorabotuvame" = "it's clear, we'll
  // cooperate") IS cooperation; only "vekje ... druga" (already cooperating
  // with another agency) stays an acknowledgment.
  // ==========================================
  if (/(?:mi|ми).{0,12}(?:jasno|јасно|razjasni|разјасни|razbira|разбира|razbrav|разбрав)|(?:jasno|јасно|razjasni|разјасни|razbira|разбира|razbrav|разбрав).{0,12}(?:mi|ми)|(?:se|се|sve|све)\s+(?:e|е)\s+(?:jasno|јасно)|^(?:da|да)?[,.]?\s*(?:jasno|јасно|razbrav|разбрав|razbiram|разбирам)(?:\s|$)/i.test(u) &&
      !STRONG_ACCEPTANCE_WORDS.test(u) && !coopCommitmentVerb) {
    return { intent: "INTERESTED", confidence: 0.8, reason: "clear understanding — acknowledgment, not cooperation" };
  }

  // COMPREHENSIVE GUARD: affirmative start + objection/concern/question → INTERESTED (not ACCEPTED)
  if (/^(da|да|ajde|ајде|moze|може|dobro|добро)([,.\s]|$)/i.test(u) &&
      /(\?|a\s+(sto|што|kako|како|dali|дали|koj|кој|koga|кога|kolku|колку|zosto|зошто|kakov|каков|kakva|каква|kakvo|какво|kakvi|какви)|ama|ама|sepak|сепак|mislam|мислам|dali|дали|mozebi|можеби|druga|друга|vekje|веќе|ke vidime|ќе видиме|da vidime|да видиме|ne sum|не сум|ne znam|не знам|ke razmislam|ќе размислам|razmisluvam|размислувам|ne rabotel|не работел|nemam iskustvo|немам искуство|ne sum siguren|не сум сигурен|ke prasam|ќе прашам|ke se javam|ќе се јавам|da se javam|да се јавам|da prasam|да прашам|ne sum rabotil|не сум работел|ne rabotila|не работела|nemam raboteno|немам работено|imam\s+dogovor|имам\s+договор|sto\s+ke|што\s+ќе|kako\s+ke|како\s+ќе|se\s+mislam|се\s+мислам|treba\s+da|треба\s+da|prvo|прво|samo\s+|само\s+)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "affirmative start + hesitation" };
  }
  // CONVERSATION-CONTINUATION GUARD: "da moze", "da prodolzime", "da slusam",
  // "da objasnis", "da kazes" mean "yes continue talking" — NOT "yes I accept cooperation".
  // The owner is giving conversational permission, not committing to the agency.
  // These must run BEFORE the catch-all "affirmative start" pattern below.
  if (/^(da|да|ajde|ајде|moze|може|dobro|добро)([,.\s]|$)/i.test(u) && CONV_CONTINUATION_WORDS.test(u)) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "conversation continuation, not cooperation" };
  }
  // "da moze" (and variants): "yes you may", "yes go ahead" — conversation continuation
  if (/^(da|да)\s*[,.]?\s*moze(?:те|\s|$)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "da moze — conversation continuation, not cooperation" };
  }
  // NOTE: "moze"/"може" is intentionally excluded from the affirmative-start pattern.
  // "moze" alone means "may" or "okay" — permission, not commitment (handled above as 0.65).
  // Including it causes false positives (e.g., "moze" → cooperation accepted at 0.9).
  // DECLINE GUARD: block "da/ajde/dobro + ne" only when the standalone "не" is
  // directly followed by a decline verb (pocneme/sakam/moze/sorabotka/prodolz)
  // or ends the message ("ajde ne" = "come on, no"). This is TARGETED on purpose:
  // a broad !hasStandaloneNegation guard here would wrongly downgrade genuine
  // negated-affirmatives like "да, не е проблем" ("yes, it's not a problem" =
  // acceptance) to INTERESTED. "da ne pocneme" is also already blocked by the
  // aorist "pocneme" rule's own hasStandaloneNegation guard — this catch-all
  // guard only needs to cover the "da " fall-through.
  if (/^(da|да|ajde|ајде|dobro|добро)([,.\s]|$)/i.test(u) &&
      !/(da|да|ajde|ајде|dobro|добро)[,.]?\s+(ne|не)(?:\s*(?:pocneme|почнеме|zapocneme|започнеме|zapochneme|pochnuvame|почнуваме|sakam|сакам|moze|може|sorabotk|соработк|prodolz|продолж|probame|пробаме)|[,.;!?]|$)/i.test(u) &&
      !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "affirmative start" };
  // NEGATION GUARD (reviewer finding): uses hasStandaloneNegation, NOT a bare
  // /(ne|не)/ test — "ajde, nema problem" (come on, no problem — acceptance)
  // contains "ne" inside the ne-PREFIX word "nema" and would be wrongly blocked;
  // "ajde ne" (come on, no — decline) still fires the standalone-ne guard.
  // HESITATION GUARD: "ajde, mozebi" (come on, maybe) is hedged (audit finding).
  if (/(ajde|ајде)/i.test(u) && !hasStandaloneNegation(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "ajde" };
  if (/(probame|пробаме)/i.test(u) && !hasDoubt && !hasStandaloneNegation(u) && !HESITATION_GUARD_WORDS.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "probame" };
  // HESITATION GUARD on the remaining catch-alls (audit finding): "mozebi X"
  // (maybe X) is hedged, not committed — same disease as the probame family.
  // NEGATION GUARD (reviewer round-2 finding): "ne X" (I/we don't X) must not
  // be accepted — uses hasStandaloneNegation so ne-PREFIX words ("nema problem,
  // se soglasuvam") don't wrongly block genuine acceptances.
  if (/(sorabotuvame|соработуваме|sorabotuvam|соработувам)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "sorabotuvame" };
  if (/vo\s*(red|ред)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "vo red" };
  if (/se\s*(soglasuvam|согласувам)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "se soglasuvam" };
  if (/(prifakjam|прифаќам)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) return { intent: "ACCEPTED", confidence: 0.95, reason: "prifakjam" };
  // HESITATION GUARD (audit finding): "mozebi zosto da ne" (maybe why not) is
  // hedged, not committed. NOTE: also matches Cyrillic "да" (previously the
  // pattern only had Latin "da", so the Cyrillic control "зошто да не" fell to
  // the ambiguous default — probe finding).
  if (/(zosto|зошто)\s*(?:da|да)\s*(ne|не)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "zosto da ne" };
  // HESITATION GUARD (audit finding): blocks "ako e taka moze, ke vidime"
  // (if it's so, ok — we'll see). Pure "ako e taka ke vidime" (no moze present)
  // never reaches this rule — it falls through to the INTERESTED da/ke vidime
  // fallback below.
  // STANDALONE-WORD moze check (audit finding): uses the same \P{L} boundary
  // technique as hasStandaloneNegation so the moze-inside-mozebi SUBSTRING trap
  // is fixed at the SOURCE — "mozebi ako e taka" (maybe if it's so) contains
  // "moze" as a PREFIX of "mozebi", and "mozeli ako e taka" (they could, if
  // it's so) as a prefix of "mozeli", but neither is a standalone "moze", so
  // the rule no longer fires on them at all (they fall through to INTERESTED).
  // A bare /(moze|може)/ substring test would wrongly accept both hedges.
  if (/(ako|ако)\s*(e|е)\s*(taka|така)/i.test(u) && /(?:^|\P{L})(?:moze|може)(?:\P{L}|$)/iu.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u)) return { intent: "ACCEPTED", confidence: 0.85, reason: "ako e taka moze" };
  // HESITATION GUARD: "mozebi ke probame" (maybe I'll try) is hedged, not a
  // commitment — same disease as the da-probame family. Clean "ke probame"
  // (I will try) remains ACCEPTED.
  // SUBTLE QUIRK (load-bearing): the pattern (probam|пробам) has NO word
  // boundary at the end, so "probame"/"пробаме" (we will try) matches via the
  // "probam"/"пробам" prefix. This is INTENTIONAL — it's how "ke probame"
  // gets caught here. The HESITATION_GUARD_WORDS check below is what separates
  // ACCEPTED "ke probame" from INTERESTED "mozebi ke probame". If this regex
  // is ever "tightened" (\b or an end anchor), "ke probame" would silently
  // stop matching — keep the guard and the no-boundary pattern in lockstep.
  // NEGATION GUARD (audit finding): "ne ke probam" / "ne ke probame" ("I/we
  // won't try") must NOT be accepted. Uses hasStandaloneNegation so ne-PREFIX
  // words ("nesto" in "ke probame nesto novo" = we'll try something new) don't
  // wrongly block genuine acceptances.
  if (/(ke|ќе)\s*(probam|пробам)/i.test(u) && !hasDoubt && !hasStandaloneNegation(u) && !HESITATION_GUARD_WORDS.test(u)) return { intent: "ACCEPTED", confidence: 0.85, reason: "ke probam" };
  if (/(dogovor|договор)/i.test(u) && !hasDoubt && !HESITATION_GUARD_WORDS.test(u) && !hasStandaloneNegation(u)) return { intent: "ACCEPTED", confidence: 0.9, reason: "dogovor" };

  // ==========================================
  // 3. INTERESTED — questions, uncertainty, engagement
  // ==========================================
  if (/\?/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "question mark" };
  if (/(kako|како)\s*(raboti|работи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kako raboti" };
  if (/(kako|како)\s*(funkcionira|функционира)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kako funkcionira" };
  if (/(sto|што)\s*(znaci|значи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "sto znaci" };
  if (/(sto|shto|што)\s*(e|е)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "sto e" };
  if (/(koi|кои|kakvi|какви)\s*(se|се)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "koi se" };
  if (/(kakva|каква)\s*(sorabotka|соработка)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "kakva sorabotka" };
  if (/(kako|како)\s*(vie|вие)/i.test(u)) return { intent: "INTERESTED", confidence: 0.75, reason: "kako vie" };
  if (/(primer|пример|objasni|објасни)/i.test(u)) return { intent: "INTERESTED", confidence: 0.8, reason: "asking for example" };
  if (/(znaci|значи)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "znaci" };
  if (/(uslovi|услови)/i.test(u)) return { intent: "INTERESTED", confidence: 0.85, reason: "uslovi" };
  if (/(mozebi|можеби)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "mozebi" };
  // NOTE: bare "razmislam"/"размислам" (without "ke") is included so hedges like
  // "sakam da razmislam pa ke pocneme" land here at 0.7 instead of falling to
  // the ambiguous default (reviewer finding — HESITATION_GUARD_WORDS already
  // matches the razmisl root, so the guard and this fallback recognize the same
  // forms). "razmislam" is always hesitation, never acceptance.
  if (/(razmisluvam|размислувам|ke razmislam|ќе размислам|razmislam|размислам)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "razmisluvam" };
  if (/(ne|не)\s*sum\s*(siguren|сигурен)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "ne sum siguren" };
  if (/(sepak|сепак)/i.test(u) && !/(ama|ама)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "sepak" };
  // "да видиме" (let's see) / "ke vidime" (we'll see) — hedge, never acceptance.
  // NOTE: "ke vidime"/"ќе видиме" added (hedge-audit finding) — both are already
  // in HESITATION_GUARD_WORDS, so every acceptance rule blocks them, but without
  // a fallback "ako e taka ke vidime" (if it's so, we'll see) landed at the
  // ambiguous 0.50 default instead of a proper 0.7 hedge.
  if (/((?:da|да|ke|ќе)\s*(?:vidime|видиме))/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "da/ke vidime" };
  if (/(interesno|интересно)/i.test(u)) return { intent: "INTERESTED", confidence: 0.75, reason: "interesno" };
  // NOTE: moze da probame is handled earlier in the ACCEPTED section (0.95).
  if (/(ne|не)\s*(veruvam|верувам)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "ne veruvam" };
  if (/(nemam|немам)\s*(doverba|доверба)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "nemam doverba" };

  // ==========================================
  // 3.5. UNDERSTANDING / CONCESSION patterns
  // The owner shows understanding of the model or concedes to the idea.
  // These are strong buying signals — close to acceptance.
  // ==========================================
  // "jas ne plakjam nisto" (I don't pay anything) — they understand they pay nothing
  if (/(ne|не)\s*(plakjam|плаќам|naplakjam|наплаќам)/i.test(u) && !/koj|кој|kako|како|dali|дали|sto|што/i.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.85, reason: "ne plakjam — owner understands they pay nothing" };
  }
  // "vie go prodavate/prodadete" (you sell it) — owner confirms their role
  if (/(vie go|вие го|vie da go|вие да го).{0,20}(prodava|продава|proda|прода|zeman|земан)/i.test(u) && !/kako|како|dali|дали|zosto|зошто|koj|кој/i.test(u)) {
    return { intent: "ACCEPTED", confidence: 0.8, reason: "vie go prodavate — owner confirms the model" };
  }
  // "ne e loso" (it's not bad) — mild positive signal
  if (/(pa|па).{0,10}ne.{0,10}(loso|лошо|dobro|добро)/i.test(u) && !/ama|ама|ama|ama|sepak|сепак|no|но/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.75, reason: "pa ne e loso — mild positive" };
  }
  // "mi se razjasni", "seга разбирам", "mi e jasno" (it's clear to me)
  if (/(mi|ми).{0,15}(razjasni|разјасни|jasno|јасно|razbira|разбира)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.8, reason: "clear understanding — owner engaged" };
  }
  // "taka moze", "okej probame" (okay let's try) — conditional acceptance
  if (/(taka|така|okej|океј|ok|ок).{0,10}(moze|може|probame|пробаме|da probame|да пробаме)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.85, reason: "conditional acceptance" };
  }
  // "ne (znam|sum) ama probame" (I don't know BUT let's try) — reluctant acceptance
  if (/(ne|не).{0,20}(ama|ама|no|но|sepak|сепак).{0,20}(probame|пробаме|moze|може|okej|океј)/i.test(u)) {
    return { intent: "INTERESTED", confidence: 0.8, reason: "reluctant acceptance" };
  }

  // ==========================================
  // 4. AMBIGUOUS default — mild interest
  //    (With context boost: if Ana was explaining commission, boost to INTERESTED)
  // ==========================================
  if (anaExplainingCommission && isShortEngaged) {
    return { intent: "INTERESTED", confidence: 0.7, reason: "ambiguous with commission context" };
  }
  return { intent: "INTERESTED", confidence: 0.5, reason: "ambiguous default" };
}
