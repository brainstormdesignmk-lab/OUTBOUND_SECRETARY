// ============================================================
// Hermes edge function: public-properties  (PHASE 3)
// ============================================================
// The customer-facing listings endpoint. Backs the public property
// page in the Lovable app.
//
// Phase 3 rule (reported requirement): a property whose available-from
// date is in the FUTURE must be HIDDEN from customers until that date,
// then SHOW UP again once the date passes:
//
//   visible ⇔ blocked_until IS NULL OR blocked_until <= current_date
//
// This is the ONLY place Hermes touches business logic — a pure date
// filter, deliberately kept OUT of create-property (which never decides
// visibility).
//
// Deploy:  supabase functions deploy public-properties
// (public endpoint — NO API key, it serves the customer page)
//
// Call: GET {base}/public-properties
//   optional query params: ?listing_type=sale|rent  ?city=Skopje
//   → 200 { properties: [...] }  (PUBLIC_FIELDS only — never the internal
//         broker_comment, price_warning, lead_phone, tenant_preferences)
//
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Public fields ONLY — never leaks the internal broker comment, the
// price-warning flag, the owner phone, tenant-preference notes or
// source internals. `id` (the row uuid) IS public: the customer page
// needs it to deep-link to a property-detail view. MUST stay in
// lockstep with hermes-server.js PUBLIC_FIELDS (the runnable local
// counterpart).
const PUBLIC_FIELDS = [
  "id",
  "listing_type", "available", "blocked_until",
  "city", "municipality",
  "sqm", "floor", "heating", "elevator", "garage", "garage_price",
  "owner_price_per_sqm", "owner_price", "agency_percent", "selling_price", "monthly_rent",
  "description_public",
].join(",");

// ============================================================
// VISIBILITY FILTER — the Phase 3 rule.
//   blocked_until IS NULL          → free now, show
//   blocked_until <= current_date  → block expired, show again
//   blocked_until >  current_date  → hidden until that date
// 'date' column semantics: blocked_until is stored as `date` (not
// timestamptz) precisely so this comparison is timezone-proof — the
// day boundary is the local calendar day, no UTC off-by-one.
// <= (not <): a same-day availability must show immediately.
// ============================================================
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const listingType = url.searchParams.get("listing_type");
  const city = url.searchParams.get("city");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // PostgREST OR: blocked_until is null OR blocked_until <= today.
  let query = supabase
    .from("properties")
    .select(PUBLIC_FIELDS)
    .or(`blocked_until.is.null,blocked_until.lte.${today}`)
    .order("created_at", { ascending: false });

  if (listingType && (listingType === "sale" || listingType === "rent")) {
    query = query.eq("listing_type", listingType);
  }
  if (city) {
    query = query.ilike("city", city);
  }

  const { data, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: "query_failed", details: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ properties: data ?? [], today }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
