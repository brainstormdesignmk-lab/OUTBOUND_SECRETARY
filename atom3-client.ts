const axios = require('axios');

async function checkCoordination(atom3Url, phone) {
  try {
    const response = await axios.get(`${atom3Url}/data/phones.json`);
    const phones = response.data;
    const phoneData = phones[phone] || {};
    
    const now = Date.now() / 1000;
    const lastContact = phoneData.last_contact || 0;
    const cooldownHours = 24;
    
    return (now - lastContact) > (cooldownHours * 3600);
  } catch (err) {
    console.error('Atom3 check failed, allowing reply:', err);
    return true;
  }
}

module.exports = { checkCoordination };
