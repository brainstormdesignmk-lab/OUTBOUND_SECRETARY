import { generateResponse } from './service.js';

export class AnaClient {
  constructor() {
    this.conversation = { messages: [], extractedData: {} };
  }

  async sendMessage(userInput) {
    this.conversation.messages.push({ role: 'user', text: userInput });

    const result = await generateResponse(this.conversation, userInput);

    if (result.text) {
      this.conversation.messages.push({ role: 'model', text: result.text });
    }

    return result;
  }
}
