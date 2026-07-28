import { readFileSync, existsSync, appendFileSync } from 'fs';
import { config } from './config.js';
import { extractFacts } from './memory.js';
import { generateFirstMessage } from './service.js';
import { LeadSession, LeadState } from './scheduler.js';

/**
 * Parse a CSV line from scraped leads
 * Format: id,title,phone,url
 * Or: id,"title with commas",phone,url
 */
export function parseLeadLine(line) {
  line = line.trim();
  if (!line || line.startsWith('#')) return null;

  try {
    // Simple CSV parser for our format
    const parts = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    parts.push(current.trim());

    if (parts.length < 3) return null;

    return {
      id: parts[0] || Date.now().toString(),
      title: parts[1] || '',
      phone: parts[2] || '',
      url: parts[3] || ''
    };
  } catch (e) {
    return null;
  }
}

/**
 * Load leads from a CSV file
 */
export function loadLeadsFromFile(filePath) {
  const fileContent = readFileSync(filePath, 'utf-8');
  const lines = fileContent.split('\n').filter(l => l.trim());
  const leads = [];

  for (const line of lines) {
    const lead = parseLeadLine(line);
    if (lead) leads.push(lead);
  }

  return leads;
}

/**
 * Process a lead and start a session
 */
export function createSessionFromLead(lead) {
  // Generate first message
  const firstMsg = generateFirstMessage(lead);

  // Create session
  const session = new LeadSession(lead);
  session.adMemory = firstMsg.memory;
  session.addSentMessage(firstMsg.text);
  session.markGreetingSent();

  return { session, firstMessage: firstMsg.text };
}

/**
 * Append completed lead to CSV output
 */
export function appendToCSV(session) {
  const header = LeadSession.getCSVHeader();
  const row = session.toCSVRow();

  // Check if file exists, if not write header first
  const filePath = config.CSV_OUTPUT_PATH;
  const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1);

  // Ensure directory exists
  if (!existsSync(dir)) {
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
  }

  // Append header if file doesn't exist
  if (!existsSync(filePath)) {
    appendFileSync(filePath, header + '\n');
  }

  appendFileSync(filePath, row + '\n');
  console.log(`\n✅ Appended to CSV: ${row}`);
}
