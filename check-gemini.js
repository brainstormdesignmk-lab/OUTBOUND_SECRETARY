import { requireEnv } from './env.js';
import axios from 'axios';

// Fail fast with a clear message if the key is missing (env.js reads the
// real environment or ~/.ana/ana.env — never a .env* file in the CWD).
let apiKey;
try {
  apiKey = requireEnv('GEMINI_API_KEY');
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  console.error('   Add GEMINI_API_KEY to ~/.ana/ana.env (see ana.env.example) or export it.\n');
  process.exit(1);
}

const MODEL = process.env.ANA_GEMINI_MODEL || 'gemini-2.5-flash';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

async function checkGemini() {
  console.log(`🔑 GEMINI_API_KEY: OK\n`);
  console.log(`Calling ${MODEL} (1 tiny prompt)...\n`);
  try {
    const { data } = await axios.post(
      url,
      {
        contents: [{ role: 'user', parts: [{ text: 'Кажи само: OK' }] }],
        // gemini-2.5-flash is a THINKING model — a tiny output budget (10)
        // burns entirely on reasoning and returns empty parts (observed:
        // finishReason MAX_TOKENS, parts undefined). 100 leaves headroom.
        generationConfig: { temperature: 0.0, maxOutputTokens: 100 }
      },
      { params: { key: apiKey }, timeout: 30000 }
    );
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    console.log(`✅ Gemini responded: "${text}"`);
    console.log(`\nThe fallback provider is ready — llm-provider.js will use it whenever Groq hits a rate limit.`);
  } catch (error) {
    const apiMsg = error?.response?.data?.error?.message || error.message;
    console.error('❌ Gemini call failed:', apiMsg);
    if (error?.response?.status === 403) {
      console.error('\n   A 403 usually means: the key is not enabled for the Generative Language API');
      console.error('   → https://console.cloud.google.com/apis/api/generativelanguage.googleapis.com');
      console.error('   (or check the key is not restricted to a different API).');
    }
    if (error?.response?.status === 429) {
      console.error('\n   A 429 means the free-tier daily quota for THIS key is exhausted.');
      console.error('   It resets at midnight Pacific Time.');
    }
    process.exitCode = 1;
  }
}

checkGemini();
