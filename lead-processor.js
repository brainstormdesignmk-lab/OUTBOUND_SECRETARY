import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { config } from './config.js';
import { extractFacts } from './memory.js';
import { generateFirstMessage } from './service.js';
import { LeadSession, LeadState } from './scheduler.js';
import { withRetrySync } from './retry-utils.js';

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
 * Append completed lead to CSV output.
 *
 * WRITE RESILIENCE (task: retry + fallback-to-console):
 *   1. RETRY — the write (mkdir + header + row) is wrapped in withRetrySync
 *      with exponential backoff, so transient FS failures (network drive
 *      hiccup, antivirus lock, EMFILE/EBUSY, disk busy) retry instead of
 *      dropping the row. mkdir/existsSync guards make the operation
 *      idempotent, so a retry never duplicates the header.
 *   2. FALLBACK-TO-CONSOLE — if ALL retries fail, the full row is printed
 *      to the console so collected data is NEVER lost silently. The
 *      operator can copy it into the CSV manually.
 */
export function appendToCSV(session) {
  const header = LeadSession.getCSVHeader();
  const row = session.toCSVRow();
  const filePath = config.CSV_OUTPUT_PATH;

  try {
    withRetrySync(() => {
      const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1);

      // Ensure directory exists
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Append header if file doesn't exist (idempotent on retry)
      if (!existsSync(filePath)) {
        appendFileSync(filePath, header + '\n');
      }

      appendFileSync(filePath, row + '\n');
    }, {
      maxRetries: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      onRetry: (err, attempt) => {
        console.warn(`\n[CSV RETRY ${attempt}/3] Write failed for ${session?.phone || 'unknown'}: ${err.message}`);
      }
    });

    console.log(`\n✅ Appended to CSV: ${row}`);
  } catch (err) {
    // FALLBACK-TO-CONSOLE — never lose collected data
    console.error(`\n[CSV FAILED] Could not write row for ${session?.phone || 'unknown'} to ${filePath}: ${err.message}`);
    console.error('[CSV FALLBACK] Row preserved below — save it manually:');
    console.log(row);
  }
}
