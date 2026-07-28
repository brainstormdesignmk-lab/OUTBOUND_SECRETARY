import { generateResponse } from './service.js';

const conversation = {
  messages: [],
  extractedData: { title: "Стан на Аеродром 60м2" }
};

async function test() {
  console.log("🧪 Testing Ana with Groq...\n");
  
  const response = await generateResponse(conversation, "Здраво, видов го огласот.");
  console.log("Ana's Reply:\n");
  console.log(response.text);
}

test().catch(console.error);
