// ============================================================
// Hermes edge function: create-property
// ============================================================
// The Lovable/Supabase side of the Ana → Lovable integration.
// Ana (the intelligence layer) sends a COMPLETE normalized property
// JSON; this endpoint validates it, stores it, returns the id.
// NO calculations. NO AI. NO enrichment. NO business decisions.
//
// Deploy:  supabase functions deploy create-property
// Secrets: HERMES_API_KEY (required), HERMES_ENABLED (kill switch)
//
// Call: POST {base}/create-property
//   headers: { "Content-Type": "application/json",
//              "X-Hermes-Key": "<HERMES_API_KEY>" }
//   body:    the payload built by Ana's buildPropertyJson()
//   → 200 { id, property_id }        stored
//   → 401 invalid/missing key        → 503 kill switch off
//   → 400 validation failed          (details in error.details)
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HERMES_API_KEY = Deno.env.get("HERMES_API_KEY") || "";
const HERMES_ENABLED = Deno.env.get("HERMES_ENABLED") === "true";

const ALLOWED_LISTING_TYPES = new Set(["sale", "rent"]);
// Columns Ana may send (whitelist — rejects unknown keys instead of
// silently dropping them, so an Ana payload upgrade fails loudly on
// staging, not silently in production).
const ALLOWED_FIELDS = new Set([
  "listing_type", "available", "blocked_until",
  "city", "municipality",
  "sqm", "floor", "heating", "elevator", "garage", "garage_price",
  "owner_price_per_sqm", "owner_price", "agency_percent", "selling_price", "price_warning", "monthly_rent",
  "description_public", "broker_comment", "tenant_preferences",
  "property_id", "lead_phone", "source_portal", "source_ad_url",
]);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Timing-safe key compare (constant-time over the key length) — the header
// is attacker-controlled; a plain !== can leak timing on match. Matches
// hermes-server.js (the local Node endpoint) behavior.
function safeKeyEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Minimal schema validation — range sanity only, NEVER value rewriting
// (all business rules already ran on Ana's side).
function validate(payload) {
  const problems = [];
  if (!payload || typeof payload !== "object") {
    return ["body must be a JSON object"];
  }
  if (!ALLOWED_LISTING_TYPES.has(payload.listing_type)) {
    problems.push("listing_type must be 'sale' or 'rent'");
  }
  if (payload.sqm !== null && payload.sqm !== undefined &&
      (!Number.isFinite(payload.sqm) || payload.sqm <= 0 || payload.sqm > 100000)) {
    problems.push("sqm must be a positive number ≤ 100000");
  }
  for (const f of ["owner_price", "selling_price", "monthly_rent"]) {
    const v = payload[f];
    if (v !== null && v !== undefined && (!Number.isFinite(v) || v <= 0)) {
      problems.push(`${f} must be a positive number when present`);
    }
  }
  if (payload.blocked_until !== null && payload.blocked_until !== undefined) {
    const d = new Date(payload.blocked_until);
    if (Number.isNaN(d.getTime())) problems.push("blocked_until must be an ISO date");
  }
  return problems;
}

Deno.serve(async (req) => {
  // Kill switch — instant 503, nothing written (Ana keeps working offline).
  if (!HERMES_ENABLED) {
    return json({ error: "hermes_disabled" }, 503);
  }

  // API-key auth — timing-safe compare against the configured secret.
  if (!HERMES_API_KEY || !safeKeyEqual(req.headers.get("X-Hermes-Key"), HERMES_API_KEY)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed", details: "use POST" }, 405);
  }

  let payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const problems = validate(payload);
  if (problems.length > 0) {
    return json({ error: "validation_failed", details: problems }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Whitelist the incoming payload to the allowed columns.
  const row = {};
  for (const k of Object.keys(payload)) {
    if (ALLOWED_FIELDS.has(k)) row[k] = payload[k];
  }

  const { data, error } = await supabase
    .from("properties")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    return json({ error: "store_failed", details: error.message }, 500);
  }

  // Append to automation_log (write-only; support/audit only).
  await supabase.from("automation_log").insert({
    action: "property.created",
    entity_type: "property",
    entity_id: data.id,
    payload: row,
    source: "ana",
  });

  return json({ id: data.id, property_id: payload.property_id ?? null }, 200);
});
