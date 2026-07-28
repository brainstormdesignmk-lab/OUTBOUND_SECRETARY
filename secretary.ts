const { checkCoordination } = require('./atom3-client');

async function processMessage(phone, text, atom3Url) {
  console.log(`Processing ${phone}: ${text}`);
  
  let reply = 'Порака пристигната! 🎯';
  const canReply = await checkCoordination(atom3Url, phone);
  
  if (!canReply) {
    reply = 'Ве контактиравме неодамна. Ќе ве контактираме повторно. 🙂';
  } else {
    fetch(`${atom3Url}/data/phones/${phone}/sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sent: true, timestamp: Date.now() })
    }).catch(err => console.error('Flag update failed:', err));
  }
  
  console.log('📡 Monitor broadcast:', { type: 'viber_message', phone, text, reply });
}

module.exports = { processMessage };
