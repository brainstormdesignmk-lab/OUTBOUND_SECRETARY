// ============================================================
// viber-send.js — Viber Public Account send_message transport
// ============================================================
// The one place that talks to the Viber chat API on the outbound
// side. The webhook adapter (webhook-adapter.js) calls this for
// every Ana outbound; tests inject their own sendMessage instead,
// so this module is never hit with a real token in CI.
//
//   POST https://chatapi.viber.com/pa/send_message
//     { auth_token, receiver, text, sender, type: 'text' }
//
// receiver is the user's Viber chat id (sender.id from the webhook)
// — the adapter prefers the remembered chat id and falls back to the
// lead phone, which Viber also accepts for users who interacted.
// Response status 0 = delivered. Any other status throws so the
// adapter can log the failure instead of pretending it was sent.
// ============================================================
import axios from 'axios';

const VIBER_API = 'https://chatapi.viber.com/pa/send_message';
const DEFAULT_SENDER = { name: 'Metropolis Ana' };

/**
 * Send one text message to a Viber user.
 * @param {Object} opts
 * @param {string} opts.token      — Viber PA auth token (VIBER_TOKEN)
 * @param {string} opts.receiver   — chat id (sender.id) or phone number
 * @param {string} opts.text       — message body
 * @param {Object} [opts.sender]   — { name } shown as the sender
 * @returns {Promise<Object>}      — Viber API response body
 * @throws {Error} when the token is unset or Viber returns status !== 0
 */
export async function sendViberMessage({ token, receiver, text, sender }) {
  if (!token || token === 'YOUR_VIBER_BOT_TOKEN') {
    throw new Error('VIBER_TOKEN not configured — cannot send Viber messages');
  }
  if (!receiver) throw new Error('Viber send: missing receiver');
  if (!text || !String(text).trim()) throw new Error('Viber send: empty text');

  const payload = {
    auth_token: token,
    receiver,
    text: String(text),
    sender: sender || DEFAULT_SENDER,
    type: 'text'
  };

  const res = await axios.post(VIBER_API, payload, { timeout: 15000 });
  const body = res.data || {};
  if (body.status !== 0) {
    throw new Error(`Viber API error ${body.status}: ${body.status_message || 'unknown'}`);
  }
  return body;
}
