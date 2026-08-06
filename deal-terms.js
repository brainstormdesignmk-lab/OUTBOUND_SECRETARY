export function getPitchMessage(propertyType, transactionType) {
  const typeLabel = propertyType === 'apartment' ? 'станот' :
                    propertyType === 'house' ? 'куќата' :
                    propertyType === 'land' ? 'плацот' : 'имотот';

  if (transactionType === 'rent') {
    return `Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам во врска со огласот за ${typeLabel}. За издавање работиме по стандардна провизија: 50% од една месечна кирија (100% ако е над 1000 евра) на денот на потпишување на договорот. Дали сте заинтересирани да соработуваме?`;
  }

  // Default: sale
  return `Здраво, јас сум Ана од Metropolis - Агенција за Недвижности. Ве контактирам во врска со огласот за ${typeLabel}. Без провизија за вас — вашата цена ја добивате во целост, ние работиме над вашата цена. Дали сте заинтересирани да соработуваме?`;
}

export function getTermsExplanation(transactionType) {
  if (transactionType === 'rent') {
    return 'Стандардна провизија за издавање: сопственикот плаќа 50% од една месечна кирија (100% ако е над 1000 евра), а закупецот 50%, на денот на потпишување на договорот.';
  }
  return 'Додаваме 2% на вашата цена. Вие ја добивате бараната сума.';
}

export function getCloseMessage() {
  const variations = [
    'Ви благодарам на довербата. Ќе ве контактираме со соодветен клиент за посета.',
    'Фала за соработката. Ќе ве известиме кога ќе имаме заинтересиран купувач.',
    'Ви благодарам. Ќе ве контактираме кога ќе најдеме соодветен клиент.',
    'Благодарам на довербата. Ќе ве контактираме за посета.'
  ];
  return variations[Math.floor(Math.random() * variations.length)];
}

// Follow-up nudge. Transaction-aware: the sale "без провизија за вас"
// reminder is WRONG for rent — on rent the owner DOES pay the standard
// 50%/100% commission, so the rent variants must never promise "no
// commission / no obligations".
export function getFollowUpMessage(transactionType) {
  if (transactionType === 'rent') {
    const rentVariations = [
      'Дали размисливте за соработката за издавање?',
      'Само да проверам дали сте заинтересирани за издавање?',
      'Да ве потсетам — за издавање работиме по стандардна провизија, платена само на денот на потпишување. Дали размисливте?',
      'Имате ли уште прашања околу соработката за издавање?'
    ];
    return rentVariations[Math.floor(Math.random() * rentVariations.length)];
  }
  const variations = [
    'Дали размисливте за соработка?',
    'Само да проверам дали сте заинтересирани?',
    'Да ве потсетам — без провизија за вас. Дали размисливте?',
    'Имате ли уште прашања околу соработката?'
  ];
  return variations[Math.floor(Math.random() * variations.length)];
}

export function getNoResponseClose() {
  const variations = [
    'Ви благодарам. Доколку се предомислите, слободно контактирајте нѐ.',
    'Разбирам. Ако подоцна сте заинтересирани, тука сум.',
    'Нема проблем. Слободно јавете се кога сте подготвени.'
  ];
  return variations[Math.floor(Math.random() * variations.length)];
}
