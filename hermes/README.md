# Hermes — Lovable/Supabase property-database layer

Hermes is the **property database side** of the Ana → Lovable integration.
Ana (this repo, the intelligence layer) computes everything — extracts facts,
calculates prices, builds the public description and the internal broker
comment, decides availability — and hands Hermes one normalized property JSON.
Hermes does **only** CRUD:

> `POST /properties` → validate → store → return id.
> No calculations. No AI. No enrichment. No business decisions.

This is Option 1 from the integration plan (compute on Ana's side, Hermes
stays a thin CRUD receiver), so all real-estate logic lives in one tested,
offline-testable codebase.

---

## 1. Deploying the edge function

The reference implementation lives in `hermes/create-property/index.ts`
(Deno/Supabase edge-function style). In your Lovable/Supabase project:

```bash
# from the supabase/ folder of your Lovable app
cp <this-repo>/hermes/create-property/index.ts supabase/functions/create-property/index.ts
supabase functions deploy create-property
```

Required secrets (Supabase dashboard → Settings → Edge Functions → Secrets):

| Secret            | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| `HERMES_API_KEY`  | A long random string. Ana sends it in the `X-Hermes-Key` header.      |
| `HERMES_ENABLED`  | `true`/`false` — the **kill switch**. When unset or `false`, every Hermes endpoint returns `503` immediately and nothing is written. |

On Ana's side, set `HERMES_URL` in `~/.ana/ana.env` (see
`ana.env.example` in the Ana repo):

```
HERMES_URL="https://<project-ref>.functions.supabase.co"
```

`hermes-client.js` then POSTs every closed property to
`{HERMES_URL}/create-property` with header `X-Hermes-Key: <key>`.
Without `HERMES_URL` Ana stays fully offline (local property.json + CSV only).

---

## 2. Payload schema (Ana → Hermes)

Built by `buildPropertyJson()` in `property-intelligence.js` (Ana repo).
Hermes **validates and stores only** — never transforms.

```jsonc
{
  "listing_type": "sale",              // "sale" | "rent"
  "available": true,                   // false when a future availableFrom date was given
  "blocked_until": null,               // ISO date — public page hides the listing until then

  "city": "Skopje",
  "municipality": "Centar",

  "sqm": 74,
  "floor": 1,
  "heating": "central",                // central | electric | private_central | ...
  "elevator": true,
  "garage": true,
  "garage_price": 15000,

  "owner_price_per_sqm": 2500,         // sale: €/m² stated by the owner (may be null)
  "owner_price": 200000,               // sale: owner's total (incl. garage)
  "agency_percent": 2,                 // sale: agency % (default 2)
  "selling_price": 204000,             // sale: owner + agency %, rounded UP to 500€
  "price_warning": false,              // TRUE when owner gave BOTH €/m² and a total
                                        // that disagree — agent must verify the price
  "monthly_rent": null,                // rent: the monthly rent (owner_price is sale-side)

  "description_public": "...",         // scraped ad + Ana-collected facts
  "broker_comment": "...",             // INTERNAL — agency staff only, never public

  "tenant_preferences": {
    "preferred": ["families", "employed"],
    "excluded": ["pets", "single_parents"],
    "notes": "Сопственикот изјави: NE SAKAM MILENICI I SAMOHRANI MAJKI"  // exact owner wording
  },

  "property_id": "pz-...",             // Ana's internal id (dedup/audit)
  "lead_phone": "+389...",             // owner phone (Hermes dedup key)
  "source_portal": "..." ,
  "source_ad_url": "..."
}
```

### blocked_until semantics (the "hide until free" rule)

The availability date question fires even when the property is **not**
available right now ("не е достапен, од 1 јануари е слободен"). Ana records
`availableFrom` and emits:

- `available: false`, `blocked_until: "2026-01-01"`

The public listings query hides the property until that date. This is
implemented by the **public-properties** edge function
(`hermes/public-properties/index.ts`, Phase 3):

```sql
-- PUBLIC listings (the ONLY place Hermes touches business logic — a filter)
where blocked_until is null or blocked_until <= current_date
```

Deploy: `supabase functions deploy public-properties` — it is a **public**
endpoint (NO API key — it serves the customer page) and returns
`PUBLIC_FIELDS` only, so the internal `broker_comment`, `price_warning`,
`lead_phone`, `tenant_preferences` and source internals never leak to
customers. Optional `?listing_type=` and `?city=` filters.

```
GET {base}/public-properties            → 200 { properties: [...] }
GET {base}/public-properties?listing_type=sale&city=Skopje
```

Test the three concrete cases from the risk plan (covered offline by
`test-public-properties.js`, 45 asserts):
1. property free today (`blocked_until is null`) → **shown**
2. `blocked_until` in the future → **hidden**
3. `blocked_until` already passed → **shown again**

Boundary + leak cases also covered: same-day `blocked_until` shows
immediately (`<=`, not `<` — a same-day availability must show); dates
stored as `date` (not `timestamptz`) so the calendar-day comparison has no
UTC off-by-one; and the leak guard (internal fields never in the response).
The runnable local counterpart is `GET /public-properties` on
`hermes-server.js` (same filter, same PUBLIC_FIELDS).

Date note: the cutoff "today" defaults to the **UTC calendar date** on both
the local server and the deployed edge function (the edge function runs in
UTC), so the two behave identically. Tests pin a fixed day via the
`?today=YYYY-MM-DD` query param (local server only — the edge function
never accepts it). A Skopje-local cutoff would shift the boundary ~1h
before/after UTC midnight; the UTC default avoids that drift entirely.

---

## 3. Automation log (from day 1)

Every Hermes write also inserts into the `automation_log` table so a weird
property can always be traced:

| column        | example                                        |
| ------------- | ---------------------------------------------- |
| `id`          | uuid                                           |
| `action`      | `property.created`                             |
| `entity_type` | `property`                                     |
| `entity_id`   | `<new property id>`                            |
| `payload`     | the raw JSON received                          |
| `source`      | `ana`                                          |
| `created_at`  | now()                                          |

`automation_log` is write-only append; nothing reads it except support.

---

## 4. Rollout phases (from LOVABLE_HERMES_INTEGRATION_PLAN.txt)

- **Phase 1:** API key + create-property endpoint → tested with a real
  property from Ana (done — `hermes/create-property` + `hermes-server.js`).
- **Phase 2:** update / delete / photos endpoints.
- **Phase 3:** appointments + `blocked_until` filter on public listings
  (done — `hermes/public-properties` + `test-public-properties.js`).
- **Phase 4:** documents.

Additive changes only — new edge functions, nullable columns
(`blocked_until`, `deleted_at`), new tables (`appointments`,
`automation_log`). Existing UI/CRM/forms keep working unchanged.

### Risk notes

- **Soft delete last, not first.** Keep hard delete until Phase 2 is proven.
  When you do add `deleted_at`, grep every `.from("properties")` and add the
  `deleted_at is null` filter in the same session.
- **`blocked_until` is the only risky public-facing change.** Ship Phase 3
  with the 3-case test above.
- **Kill switch:** flip `HERMES_ENABLED=false` and all Hermes endpoints
  return 503 instantly — Ana keeps working offline (local persistence is
  never blocked by Hermes).
