export function getPitchMessage(propertyType, transactionType) {
  const typeLabel = propertyType === 'apartment' ? 'станот' :
                    propertyType === 'house' ? 'куќата' :
                    propertyType === 'land' ? 'плацот' : 'имотот';

  if (transactionType === 'rent') {
    return `Здраво, јас сум Ана од Metropolis. Ве контактирам во врска со огласот за ${typeLabel}. Без провизија за вас — стандардната провизија ја наплаќаме од закупецот на денот на договорот. Дали сте заинтересирани да соработуваме?`;
  }

  // Default: sale
  return `Здраво, јас сум Ана од Metropolis. Ве контактирам во врска со огласот за ${typeLabel}. Без провизија за вас — вашата цена ја добивате во целост, ние работиме над вашата цена. Дали сте заинтересирани да соработуваме?`;
}

export function getTermsExplanation(transactionType) {
  if (transactionType === 'rent') {
    return 'Стандардна провизија за издавање: 50% од киријата се плаќа на денот на потпишување на договорот.';
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

export function getFollowUpMessage() {
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
