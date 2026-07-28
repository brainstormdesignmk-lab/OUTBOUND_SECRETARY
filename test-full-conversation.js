import { AnaClient } from './ana-client.js';

const ana = new AnaClient();

async function test() {
  console.log("🔄 Testing Ana v2.6...\n");

  const msgs = [
    "Здраво, видов го огласот за станот на Аеродром.",
    "Да, се согласувам.",
    "На трет кат е, има гаража.",
    "Греењето е на струја.",
    "Имам слики."
  ];

  for (let msg of msgs) {
    console.log(`User: ${msg}`);
    const res = await ana.sendMessage(msg);
    console.log(`Ana: ${res.text}\n`);
  }
}

test().catch(console.error);
