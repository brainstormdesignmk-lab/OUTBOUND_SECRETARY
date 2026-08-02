#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { config } from './config.js';
import { Campaign } from './campaign.js';
import { parseLeadLine } from './lead-processor.js';
import { antiBan } from './anti-ban.js';
import { startHealthServer, stopHealthServer } from './health.js';
import { logger } from './logger.js';
import { classifyIntent } from './classifier.js';

const LEAD_TEMP_FILE = '/tmp/ana-today-leads.csv';
const LEADS_DIR = '/home/metropolis2/real-estate-atoms/leads';

async function main() {
  if (!existsSync(LEADS_DIR)) {
    mkdirSync(LEADS_DIR, { recursive: true });
  }

  console.log(`\n╔══════════════════════════════════════════╗\n║     ANA — METROPOLIS OUTBOUND SECRETARY  ║\n║          v2.0 — Production               ║\n╚══════════════════════════════════════════╝\n`);

  // ========================================
  // BOOT-TIME CLASSIFIER SELF-CHECK
  // Prints the intent verdict for the exact production acceptance messages:
  //   "SUPER, KAZI MI STO TI TREBA PA DA POCNEME" (tell me what you need, let's start)
  //   "PA TOAGO REKOV I JAS" (well, that's what I said too — prior agreement ack)
  // If either prints anything other than ACCEPTED >= 0.85, the process is
  // running STALE code — Node caches imported modules per process, so a
  // campaign started before a classifier fix keeps the old logic in memory
  // until restarted.
  // ========================================
  {
    const selfChecks = [
      { msg: 'SUPER, KAZI MI STO TI TREBA PA DA POCNEME', desc: 'go-ahead acceptance' },
      { msg: 'PA TOAGO REKOV I JAS', desc: 'prior agreement acknowledgment' },
    ];
    let allHealthy = true;
    for (const { msg, desc } of selfChecks) {
      const check = classifyIntent(msg, '');
      const healthy = check.intent === 'ACCEPTED' && check.confidence >= 0.85;
      if (healthy) {
        console.log(`✅ CLASSIFIER SELF-CHECK: "${msg}" → ${check.intent} ${check.confidence.toFixed(2)} (${desc})`);
      } else {
        allHealthy = false;
        console.log(`⛔ CLASSIFIER SELF-CHECK FAILED: "${msg}" → ${check.intent} ${check.confidence.toFixed(2)} (${desc})`);
      }
    }
    if (!allHealthy) {
      // FAIL-FAST: a stale deployment would silently run a broken campaign
      // (owner acceptances misread as INTERESTED → LLM hallucinates workflows).
      // Refuse to start so the operator is forced to restart/redeploy.
      console.log(`\n⛔ THIS PROCESS IS RUNNING STALE CODE.`);
      console.log(`   Restart the campaign locally with the latest files, or redeploy`);
      console.log(`   classifier.js (and all project files) to the production server`);
      console.log(`   and restart there.\n`);
      process.exit(1);
    }
  }

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

  // === HEALTH-CHECK SERVER (Task 10) — Docker/k8s orchestration probes ===
  startHealthServer();

  console.log(`\n▶️  Starting campaign with ${count} lead(s)...\n`);
  await campaign.start();

  // Graceful shutdown of the health server so the process can exit cleanly
  stopHealthServer();

  console.log(`\n✅ Campaign complete. Check ${config.CSV_OUTPUT_PATH}\n`);
  logger.info('cli_done', 'Campaign complete', { csv: config.CSV_OUTPUT_PATH });
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  logger.error('cli_fatal', 'Fatal error', { error: err.message });
  stopHealthServer();
  process.exit(1);
});
