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
export const CONV_CONTINUATION_WORDS = /(?:prodolz|продолж|slusam|слушам|slusham|objasn|објасн|kazh|каж|izvoli|изволи|pojasn|појасн|poveke|повеќе|samo\s*(prasaj|прашај)|slobodno|слободно)/i;

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
    const line = lines[i];
    if (line.startsWith('Ана:')) {
      if (!lastAnaMessage) {
        lastAnaMessage = line.replace(/^Ана:\s*/i, '').toLowerCase();
      }
    } else if (line.startsWith('Сопственик:')) {
      const text = line.replace(/^Сопственик:\s*/i, '').toLowerCase();
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

  // ==========================================
  // 2. ACCEPTED — explicit yes/agreement
  // ==========================================

  // FIRST: Check for doubt signals in ACCEPTED-like messages
  // If the message matches an acceptance pattern but also has doubt
  // signals (questions, concerns), downgrade to INTERESTED.
  const hasDoubt = hasAcceptanceDoubt(u);

  // "ајде да пробаме" — strongest acceptance (0.98)
  // Uses .{0,15} proximity to require the words within 15 chars.
  // This prevents matching unrelated "ajde" and "probame" far apart.
  if (/ajde.{0,15}probame|ајде.{0,15}пробаме/i.test(u) && !(/(ne|не)/i.test(u)) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.98, reason: "ajde da probame" };
  }

  // "може да пробаме" — very strong acceptance (0.95)
  if (/(moze|може)\s*da\s*(probame|пробаме)/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "moze da probame" };
  }

  // "да пробаме" — very strong acceptance (0.95)
  // NOTE: Must use (?:probame|пробаме) non-capturing group to avoid
  // pipe precedence issue where |пробаме matches "пробаме" anywhere.
  if (/^(da|да)\s+.*(?:probame|пробаме)/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "da probame" };
  }

  // "важи" — strong acceptance (0.90)
  if (/^(vazhi|važi|важи)$/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.90, reason: "vazhi" };
  }

  // "почнуваме" — strong acceptance (0.90)
  if (/(pochnuvame|počnuvame|почнуваме)$/i.test(u) && !/(ne|не)/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.90, reason: "pochnuvame" };
  }

  // "договорено" — strong acceptance (0.95)
  if (/dogovoreno|договорено/i.test(u) && !hasDoubt) {
    return { intent: "ACCEPTED", confidence: 0.95, reason: "dogovoreno" };
  }

  if (/^(da|да)$/i.test(u)) {
    // CONTEXT RULE C: Previous hesitation → downgrade standalone "da" to INTERESTED
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
    return { intent: "ACCEPTED", confidence: 0.65, reason: "moze — low confidence cooperation" };
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
  if (/^(da|да|ajde|ајде|dobro|добро)([,.\s]|$)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "affirmative start" };
  if (/(ajde|ајде)/i.test(u) && !/(ne|не)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "ajde" };
  if (/(probame|пробаме)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "probame" };
  if (/(sorabotuvame|соработуваме|sorabotuvam|соработувам)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.95, reason: "sorabotuvame" };
  if (/vo\s*(red|ред)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "vo red" };
  if (/se\s*(soglasuvam|согласувам)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.95, reason: "se soglasuvam" };
  if (/(prifakjam|прифаќам)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.95, reason: "prifakjam" };
  if (/(zosto|зошто)\s*da\s*(ne|не)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "zosto da ne" };
  if (/(ako|ако)\s*(e|е)\s*(taka|така)/i.test(u) && /(moze|може)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.85, reason: "ako e taka moze" };
  if (/(ke|ќе)\s*(probam|пробам)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.85, reason: "ke probam" };
  if (/(dogovor|договор)/i.test(u) && !hasDoubt) return { intent: "ACCEPTED", confidence: 0.9, reason: "dogovor" };

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
  if (/(razmisluvam|размислувам|ke razmislam|ќе размислам)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "razmisluvam" };
  if (/(ne|не)\s*sum\s*(siguren|сигурен)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "ne sum siguren" };
  if (/(sepak|сепак)/i.test(u) && !/(ama|ама)/i.test(u)) return { intent: "INTERESTED", confidence: 0.6, reason: "sepak" };
  if (/(da|да)\s*(vidime|видиме)/i.test(u)) return { intent: "INTERESTED", confidence: 0.7, reason: "da vidime" };
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
