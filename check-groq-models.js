import Groq from "groq-sdk";
import { requireEnv } from './env.js';

// Fail fast with a clear message if the key is missing (env.js reads the
// real environment or ~/.ana/ana.env — never a .env* file in the CWD).
let apiKey;
try {
  apiKey = requireEnv('GROQ_API_KEY');
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  console.error("   Create ~/.ana/ana.env (see ana.env.example) or export GROQ_API_KEY.\n");
  process.exit(1);
}
const groq = new Groq({ apiKey });

async function listModels() {
  try {
    const models = await groq.models.list();
    console.log("✅ Available Models on your Groq account:\n");

    models.data.forEach(model => {
      console.log(`Model ID: ${model.id}`);
      console.log(`Context Window: ${model.context_window} tokens`);
      console.log("-------------------");
    });
  } catch (error) {
    console.error("Error:", error.message);
    console.log("\nCheck that ~/.ana/ana.env has GROQ_API_KEY (or export it)");
  }
}

listModels();
