const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractDataFromMessage(text, currentData) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a precise Macedonian real estate data extractor.
Update the JSON with new information. Do not invent data.

Current Data: ${JSON.stringify(currentData)}

New message: "${text}"

Return only valid JSON with updated fields.`;

    const result = await model.generateContent(prompt);
    const extracted = JSON.parse(result.response.text());

    // Merge
    return { ...currentData, ...extracted };
  } catch (e) {
    console.error("Extractor error:", e);
    return currentData;
  }
}

module.exports = { extractDataFromMessage };
