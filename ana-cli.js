#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { config } from './config.js';
import { Campaign } from './campaign.js';
import { parseLeadLine } from './lead-processor.js';
import { antiBan } from './anti-ban.js';

const LEAD_TEMP_FILE = '/tmp/ana-today-leads.csv';
const LEADS_DIR = '/home/metropolis2/real-estate-atoms/leads';

async function main() {
  if (!existsSync(LEADS_DIR)) {
    mkdirSync(LEADS_DIR, { recursive: true });
  }

  console.log(`\n╔══════════════════════════════════════════╗\n║     ANA — METROPOLIS OUTBOUND SECRETARY  ║\n║          v2.0 — Production               ║\n╚══════════════════════════════════════════╝\n`);

  const argFile = process.argv[2];
  let leadsFile = null;

  if (argFile && existsSync(argFile)) {
    leadsFile = argFile;
    console.log(`📁 Using leads file: ${leadsFile}\n`);
  } else if (existsSync(config.LEADS_INPUT_PATH)) {
    leadsFile = config.LEADS_INPUT_PATH;
    console.log(`📁 Using default leads file: ${leadsFile}\n`);
  } else {
    console.log(`📋 Paste leads for today (one per line, then Ctrl+D when done):`);
    console.log(`   Format: id,title,phone,url`);
    console.log(`   Example: 5540516,Се продава стан во Аеродром,+38978950414,https://...\n`);

    const stdin = process.stdin;
    let inputData = '';
    for await (const chunk of stdin) { inputData += chunk; }

    const lines = inputData.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      console.log('❌ No leads provided. Exiting.');
      process.exit(0);
    }

    console.log(`\n📋 Parsed ${lines.length} lead(s):\n`);
    const validLines = [];
    for (const line of lines) {
      const lead = parseLeadLine(line);
      if (lead) {
        console.log(`   ✅ ${lead.phone} — ${lead.title.substring(0, 50)}`);
        validLines.push(line);
      } else {
        console.log(`   ❌ Invalid line: ${line.substring(0, 40)}...`);
      }
    }

    if (validLines.length === 0) {
      console.log('\n❌ No valid leads. Exiting.');
      process.exit(0);
    }

    writeFileSync(LEAD_TEMP_FILE, validLines.join('\n') + '\n');
    leadsFile = LEAD_TEMP_FILE;
    console.log(`\n📁 Saved ${validLines.length} lead(s) to ${leadsFile}`);
  }

  if (!antiBan.isWithinActiveHours()) {
    console.log(`\n⚠️  Outside active hours.`);
    console.log(`   Press Enter to proceed anyway (test mode), or Ctrl+C to exit:`);
    await new Promise(resolve => { process.stdin.once('data', () => resolve()); });
  }

  console.log(`\n========================================`);
  console.log(`🔒 ANTI-BAN RULES ACTIVE:`);
  console.log(`   Max ${config.MAX_MSGS_PER_HOUR} msgs/hour`);
  console.log(`   Max ${config.MAX_MSGS_PER_DAY_PER_CONTACT} msgs/day per contact`);
  console.log(`   Active hours: ${config.ACTIVE_HOURS_START}:00-${config.ACTIVE_HOURS_END}:00, ${config.ACTIVE_HOURS_AFTERNOON_START}:00-${config.ACTIVE_HOURS_AFTERNOON_END}:00`);
  console.log(`========================================\n`);

  console.log(`   Press Enter to start the campaign, or Ctrl+C to abort:`);
  await new Promise(resolve => { process.stdin.once('data', () => resolve()); });

  const campaign = new Campaign();
  const count = campaign.loadLeads(leadsFile);
  if (count === 0) {
    console.log('❌ No valid leads. Exiting.');
    process.exit(0);
  }

  console.log(`\n▶️  Starting campaign with ${count} lead(s)...\n`);
  await campaign.start();

  console.log(`\n✅ Campaign complete. Check ${config.CSV_OUTPUT_PATH}\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
