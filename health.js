// ========================================
// health.js — HTTP health-check endpoint (Docker/k8s)
// ========================================
// Task 10: "Add health-check endpoint (HTTP) for Docker/k8s — orchestration-ready."
//
// A tiny zero-dependency HTTP server exposing the three standard probes:
//   GET /healthz  → 200 alive   (liveness — process is up)
//   GET /readyz   → 200 ready   (readiness — campaign is running/loaded,
//                                 or READY_ON_FINISH=true after a natural end)
//   GET /metrics  → JSON snapshot of the live metrics counters
//
// Purpose:
//   - k8s livenessProbe → /healthz (restart if the process wedges)
//   - k8s readinessProbe → /readyz (only route traffic / run jobs when ready)
//   - Prometheus/operators can scrape /metrics for the counter snapshot
//
// It is deliberately dependency-free (node:http only) so it can never
// break the campaign if a library changes. Port comes from config.HEALTH_PORT
// (0 disables the server entirely).
//
// Usage:
//   import { startHealthServer, setHealthState, stopHealthServer } from './health.js';
//   setHealthState({ running: true, loaded: 12, currentIndex: 0 });
//   const server = startHealthServer();
//   // ... campaign runs ...
//   stopHealthServer();
// ========================================
import http from 'http';
import { config } from './config.js';
import { metrics } from './metrics.js';

// Live state shared with the campaign (mutated via setHealthState)
const state = {
  running: false,
  loaded: 0,
  currentIndex: 0,
  startedAt: null,
  lastError: null
};

let server = null;

/**
 * Update the health state from the campaign (call on lifecycle events).
 * @param {Object} patch
 */
export function setHealthState(patch) {
  Object.assign(state, patch);
}

/**
 * Start the HTTP health server. No-op if HEALTH_PORT is 0/undefined.
 * @returns {http.Server|null}
 */
export function startHealthServer() {
  const port = config.HEALTH_PORT;
  if (!port || port <= 0) return null;
  if (server) return server; // already running

  server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];

    // === CORS-ish headers so k8s/Prometheus probes never choke ===
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (url === '/healthz') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'alive', uptimeSec: process.uptime() }));
      return;
    }

    if (url === '/readyz') {
      const ready = state.running || (config.READY_ON_FINISH && state.startedAt);
      res.writeHead(ready ? 200 : 503);
      res.end(JSON.stringify({
        status: ready ? 'ready' : 'not_ready',
        running: state.running,
        loaded: state.loaded,
        currentIndex: state.currentIndex,
        startedAt: state.startedAt
      }));
      return;
    }

    if (url === '/metrics') {
      res.writeHead(200);
      res.end(JSON.stringify({
        status: 'ok',
        counters: { ...metrics.counters },
        state: { ...state }
      }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ status: 'not_found' }));
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[HEALTH] Listening on :${port} (/healthz /readyz /metrics)`);
  });

  server.on('error', (err) => {
    console.error(`[HEALTH] Server error: ${err.message}`);
  });

  return server;
}

/**
 * Stop the health server (e.g. at campaign end / process shutdown).
 */
export function stopHealthServer() {
  if (server) {
    server.close();
    server = null;
  }
}
