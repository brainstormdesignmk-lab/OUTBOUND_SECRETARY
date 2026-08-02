import Groq from "groq-sdk";
import dotenv from 'dotenv';

dotenv.config({ path: 'groq.env' });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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
    console.log("\nCheck if your groq.env file has GROQ_API_KEY");
  }
}

listModels();
