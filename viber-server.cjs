"use strict";
// ============================================================
// viber-server.cjs — Viber webhook RECEIVER (CommonJS shell)
// ============================================================
// This file stays a thin HTTP/WS shell: express parses the Viber
// webhook POST, the WS monitor streams status to operators, and the
// actual conversation logic lives in the MODERN ESM engine
// (webhook-adapter.js → engine.js), dynamically imported below.
//
// Mode switch:
//   VIBER_ENGINE=1 (default) — every inbound message goes through the
//     MultiLeadEngine: greeting scheduler, data collection, persuasion,
//     strikes, anti-ban, session persistence. Ana's replies are sent
//     back over Viber via the adapter's ana-message wiring.
//   VIBER_ENGINE=0 — legacy mode: the old secretary.cjs canned-ack +
//     Atom3 coordination-flag path (kept for rollback / migration).
//
// Leads: the engine greets the queue staged in LEADS_INPUT_PATH
// (default ./leads/today.csv, canonical scraper CSV — see
// lead-normalizer.js loadScraperLeads). Reload = restart the server.
//
// ACK TIMING: the webhook response is sent IMMEDIATELY (200 OK) and
// the message is processed in the background. Viber retries deliveries
// whose responses are slow or missing, and the engine's PERSUASION
// phase can take seconds (LLM call) — awaiting processing before
// acking would make Viber re-deliver the same message and double-
// process it. The engine serializes outbound and owns per-session
// state, so background processing is safe.
// ============================================================
const express = require('express');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const VIBER_TOKEN = process.env.VIBER_TOKEN || 'YOUR_VIBER_BOT_TOKEN';
const ATOM3_URL = process.env.ATOM3_URL || 'http://192.168.1.100';
const HTTP_PORT = Number(process.env.VIBER_HTTP_PORT || 8080);
const WS_PORT = Number(process.env.VIBER_WS_PORT || 8081);
const LEADS_PATH = process.env.LEADS_INPUT_PATH || './leads/today.csv';
const USE_ENGINE = (process.env.VIBER_ENGINE || '1') !== '0';
// Owner-follow-up grace window. 0 = reply to each message immediately
// (the webhook default — instant replies matter in production). Set
// ANA_OWNER_FOLLOWUP_GRACE_MS to a few seconds to merge quickfire
// multi-message owners into ONE reply (the grace-batch behavior the
// reported 4-message fix was built around). Tradeoff: every reply is
// delayed by the grace window.
const OWNER_GRACE_MS = process.env.ANA_OWNER_FOLLOWUP_GRACE_MS !== undefined
  ? Number(process.env.ANA_OWNER_FOLLOWUP_GRACE_MS)
  : 0;

let wss = null;              // created below; broadcast refs it lazily

// ------------------------------------------------------------
// Boot the modern engine adapter (ESM, dynamic import from CJS).
// Resolves to the adapter, or null when boot genuinely failed
// (only then does the handler fall back to the legacy path).
// ------------------------------------------------------------
const adapterPromise = USE_ENGINE ? bootAdapter() : null;

async function bootAdapter() {
  const { createWebhookAdapter } = await import('./webhook-adapter.js');
  const { loadScraperLeads } = await import('./lead-normalizer.js');

  let leads = [];
  try {
    leads = loadScraperLeads(LEADS_PATH);
  } catch (err) {
    console.warn(`[VIBER] ⚠ No leads loaded from ${LEADS_PATH}: ${err.message}`);
  }

  const a = createWebhookAdapter({
    leads,
    token: VIBER_TOKEN,
    ownerGraceMs: OWNER_GRACE_MS,
    // The adapter's log hook also feeds the WS monitor.
    log: (msg) => {
      console.log(`[VIBER] ${msg}`);
      broadcast({ type: 'viber', message: msg });
    }
  });
  a.start();
  console.log(`[VIBER] 🧠 Engine adapter online — ${leads.length} lead(s) indexed (${LEADS_PATH})`);
  return a;
}

if (USE_ENGINE) {
  adapterPromise.catch((err) => {
    console.error('[VIBER] ❌ Engine adapter failed to boot:', err);
    console.error('[VIBER]    Falling back to legacy secretary mode.');
  });
}

function broadcast(payload) {
  if (!wss) return;
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  }
}

// ------------------------------------------------------------
// Webhook receiver — ack FIRST (Viber retry risk — see header),
// then process in the background.
// ------------------------------------------------------------
app.post('/viber/incoming', (req, res) => {
  const event = req.body || {};
  res.json({ status: 200, body: 'OK' });   // immediate ack
  handleEvent(event).catch((err) => {
    console.error('[VIBER] Processing failed:', err);
    broadcast({ type: 'error', message: err.message });
  });
});

async function handleEvent(event) {
  // ENGINE MODE (default) — await the boot promise so traffic during
  // boot waits for the engine instead of silently hitting legacy.
  if (USE_ENGINE) {
    const a = await adapterPromise;
    if (a) {
      if (event.event === 'message') {
        console.log(`[VIBER] In: ${event.sender && event.sender.id}: ${event.message && event.message.text}`);
      }
      const result = await a.handleWebhookEvent(event);
      if (!result.handled) {
        console.log(`[VIBER] ${result.reason || 'ignored'} (${result.senderId || event.event || 'no-event'})`);
      }
      return result;
    }
    // Boot rejected → fall through to legacy.
  }

  // LEGACY MODE (VIBER_ENGINE=0 or engine boot failure) — old
  // canned-ack + Atom3 flag path.
  const { processMessage } = require('./secretary.cjs');
  if (event.event === 'message') {
    const phone = event.sender && event.sender.id;
    const text = event.message && event.message.text;
    console.log(`[VIBER] In (legacy): ${phone}: ${text}`);
    await processMessage(phone, text, ATOM3_URL);
  }
  return { handled: false, reason: 'legacy' };
}

app.get('/health', (req, res) => res.json({ status: 'Atom1 OK' }));

// ------------------------------------------------------------
// WS monitor + listener
// ------------------------------------------------------------
wss = new WebSocket.Server({ port: WS_PORT });
wss.on('connection', (ws) => {
  console.log('[VIBER] WS Monitor connected');
  ws.send(JSON.stringify({ type: 'status', message: 'Atom1 ready' }));
  if (adapterPromise && USE_ENGINE) {
    adapterPromise.then((a) => {
      if (a) ws.send(JSON.stringify({ type: 'status', message: `Engine online — ${a.engine.leadIds.length} lead(s)` }));
    }).catch(() => {});
  }
});

app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[VIBER] 🚀 Atom1 Secretary on :${HTTP_PORT}`);
  console.log(`[VIBER] 📡 WS Monitor on :${WS_PORT}`);
  console.log(`[VIBER] Mode: ${USE_ENGINE ? 'ENGINE (MultiLeadEngine)' : 'LEGACY (secretary.cjs)'}`);
  if (USE_ENGINE) console.log(`[VIBER] Owner grace: ${OWNER_GRACE_MS}ms`);
});
