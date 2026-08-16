# CLAUDE.md

## Project: "Should I Live Here" (NYC 311 address risk tool)

A hackathon web app. User enters an NYC address; app returns one report with two
scores: a Building Health Score and a Block Quality Score, both derived from NYC
311 complaint data. This file covers the BACKEND / DATA layer only (Person 1).

## What this backend does

- Exposes an API that takes a coordinate and returns two 0-100 sub-scores.
- Queries NYC Open Data 311 live, caches results in Mongo, scores them against a
  precomputed citywide baseline.
- Does NOT geocode. The frontend sends {lat, lng} from Google Places Autocomplete.

## Architecture

Three layers, kept separate for testability:
routes (Express) -> services (scoring + orchestration) -> providers (Socrata + cache)

The route never calls Socrata directly. Service checks cache, falls back to
Socrata provider, then runs scoring. Scoring is a pure function tested against
fixtures with no network.

## Data source

- Dataset: NYC 311 Service Requests, Socrata UID `erm2-nwe9`
- Endpoint: https://data.cityofnewyork.us/resource/erm2-nwe9.json
- Auth: Socrata app token in `X-App-Token` header (register one; unauthenticated
  requests throttle hard under load)

## Two scores, six buckets (RESOLVED — see complaint_type strings below)

Building Health (tight radius ~20-30m): heat/hot water, unsanitary condition, plumbing
Block Quality (wider radius ~300-400m): noise, parking, street condition

Both use the same lat/lng with different radius sizes. No BBL join (that field is
not reliably present in 311 data).

## complaint_type strings — CONFIRMED against live API (RESOLVED, was open item 1)

Pulled via `$select=complaint_type&$group=complaint_type` against erm2-nwe9. Full
distinct list has ~280 values; only the ones relevant to our six buckets are below.
Do not re-derive these from memory elsewhere in the codebase, import from constants.js.

```js
// constants.js

const BUILDING_HEALTH_TYPES = {
  heatHotWater: ["HEAT/HOT WATER", "Heat/Hot Water"],
  unsanitaryCondition: ["UNSANITARY CONDITION", "Unsanitary Condition"],
  plumbing: ["PLUMBING", "Plumbing"],
};

const BLOCK_QUALITY_TYPES = {
  noise: [
    "Noise - Residential",
    "Noise - Street/Sidewalk",
    "Noise - Vehicle",
    "Noise - Commercial",
  ],
  parking: ["Illegal Parking", "Blocked Driveway"],
  streetCondition: ["Street Condition", "Sidewalk Condition", "DEP Street Condition"],
};
```

Decisions made and why (do not silently change these without updating this file):

1. **Dirty Condition / Dirty Conditions excluded from Unsanitary Condition.** These
   are a separate DSNY street/curb sanitation complaint_type, distinct from HPD's
   Unsanitary Condition (building interior). Building Health should reflect landlord
   maintenance, not curb sanitation, so excluded.
2. **General Construction/Plumbing excluded from Plumbing.** Ambiguous DOB combined
   category, not clearly plumbing-specific. Excluded to avoid overcounting.
3. **Non-Residential Heat excluded from Heat/Hot Water.** Commercial, not relevant
   to a residential livability score.
4. **Noise scope limited to 4 of 9 possible noise types** (Residential,
   Street/Sidewalk, Vehicle, Commercial). Helicopter, Park, House of Worship, and
   generic "Noise" excluded as not representative of daily block-level noise
   experience for a resident. Revisit if scores feel too low in noise-heavy areas
   near flight paths or parks.
5. **Blocked Driveway folded into the parking bucket** alongside Illegal Parking.
   Blocked Driveway alone is 1,056,637 records citywide, larger than some of
   Illegal Parking's own minor variants, so this materially changes the bucket if
   omitted.
6. **Sidewalk Condition folded into streetCondition**, not a separate 4th bucket,
   to preserve even weighting across 3 buckets per score. If sidewalk condition
   ever needs its own weight, it must be split out explicitly in the scoring
   function, not just added to the type list.

**Critical implementation note on weighting:** `getCounts` MUST sum all string
variants within a bucket into ONE number before scoring. Do not compute a
percentile per string and average those, buckets have different variant counts
(noise has 4 strings, plumbing has 1), and per-string averaging would silently
underweight noise relative to plumbing.

## API contract (FROZEN once agreed with team; do not change unilaterally)

**CONTRACT CHANGE (post-freeze): explanationSource field + new /api/explanation
endpoint added below. Flag to Person 2 — this affects frontend swap-in-place UI.**

**CONTRACT CHANGE (post-freeze, M7): AUTH IS NOW REQUIRED on all three data
endpoints.** They return 401 without `Authorization: Bearer <accessToken>`.
Response BODIES are unchanged — no field added, removed, or renamed. See the
Authentication section below and documentation/m7-auth.md.

POST /api/score
  body: { lat: number, lng: number }
  returns: {
    address: null,
    buildingHealth: {
      score, band, counts: {heatHotWater, unsanitaryCondition, plumbing}, radiusMeters,
      explanation: string,               // AI text if cached, else template text
      explanationSource: "ai" | "template"
    },
    blockQuality: {
      score, band, counts: {noise, parking, streetCondition}, radiusMeters,
      explanation: string,
      explanationSource: "ai" | "template"
    }
  }
  ALWAYS FAST. Never blocks on an AI call. On cache miss, explanation is the
  deterministic template result, explanationSource: "template".

GET /api/explanation?lat=&lng=&tier=building|block
  returns: { explanation: string, explanationSource: "ai" }
  SLOW PATH. Only called by frontend when /api/score returned
  explanationSource: "template". Calls the active AI adapter (Ollama or Gemini
  per AI_PROVIDER), writes result to the SAME cache doc /api/score reads from,
  returns the real explanation once resolved. Synchronous (frontend waits on
  this one call, no polling) — deliberate hackathon simplification, not an
  oversight. Frontend swaps the template text for this result in place once
  it resolves; if /api/score already returned explanationSource: "ai", frontend
  skips this call entirely.

GET /api/complaints?lat=&lng=&radius=
  returns: [ { type, lat, lng, created_date, status }, ... ]   // for frontend heatmap

GET /health
  returns: 200 OK   // for deploy checks + keep-warm pings
  PUBLIC — deliberately not authenticated. A 401 here reads to a host as a
  failed deploy, and it exposes only "the process is up".

band = "good" | "fair" | "poor"

## Authentication (NEW SCOPE, M7 — not in the original build order)

Username + password, JWT bearer tokens, tenant/landlord roles. Full rationale in
documentation/m7-auth.md; this section is the spec-level summary.

POST /api/auth/register  body: { username, password, role }   // role: tenant|landlord
POST /api/auth/login     body: { username, password }
POST /api/auth/refresh   body: { refreshToken }
POST /api/auth/logout    header: Authorization: Bearer <accessToken>
GET  /api/auth/me        header: Authorization: Bearer <accessToken>

The first three return:
  { accessToken, refreshToken, tokenType: "Bearer", expiresIn, expiresAt,
    user: { id, username, role, createdAt } }

Design rules (do not change these without updating this file):

1. **Access token is a 7-day JWT that is ALSO checked against a live session
   document.** Every token carries the `sid` of its session; requireAuth
   verifies that session still exists. This is what makes logout real — a
   stateless 7-day JWT cannot be revoked. Costs one indexed findOne per
   authenticated request, deliberately.
2. **Refresh token is opaque random bytes, NOT a JWT**, 30-day TTL, and only a
   SHA-256 hash is stored. It ROTATES on every refresh (single-use).
3. **Passwords use node:crypto scrypt**, not bcrypt — no native build step, which
   matters on the alpine/musl image. Self-describing hash format.
4. **Login returns one error for both unknown-user and wrong-password**, and
   spends the same CPU in both branches (dummy-hash verify). Both halves are
   required; the response alone is not enough, timing leaks it too.
5. **`algorithms` is pinned on jwt.verify.** Without it an `alg: none` token is
   accepted.
6. **Role is required at registration with no default**, and is carried in the
   token. Nothing branches on it yet.
7. **JWT_SECRET has no fallback** and the app exits at boot without it, or
   without MONGODB_URI.

Collections: `users` (username unique) and `auth_sessions` (TTL on expiresAt,
unique refreshTokenHash).

**Mongo is no longer optional.** It was an optimisation for the cache — every
cache path still degrades to "miss" — but auth needs a real user store, so
providers/mongo.js now has BOTH `getDb()` (returns null, for the cache) and
`requireDb()` (throws 503, for auth). Which one a provider calls is the
statement of whether it can degrade.

## Socrata query pattern

Two HTTP calls per uncached address (one per radius tier), NOT six or twelve.
Group by type within each radius call:

  $where  = within_circle(<LOCATION_FIELD>, lat, lng, radius)
            AND complaint_type in (...)
            AND created_date > '<cutoff>'
  $select = complaint_type, count(*)
  $group  = complaint_type
  $limit  = 50000

Then sum the returned per-string counts into their bucket (see weighting note above).

Client must set: app token header, ~5s timeout, retry-with-backoff on 429/5xx (max 2).

## Scoring

score(counts, baseline) is a PURE function.
1. Per bucket: convert summed count to percentile position vs baseline for that
   bucket + radius tier.
2. Aggregate three bucket percentiles into one sub-score (start: simple mean).
3. Map to band at fixed thresholds.

Baseline is computed ONCE by scripts/buildBaseline.js (sample ~few hundred spread
NYC coords, compute median + p90 per bucket per tier, write one baseline doc, commit
output). This is what makes the score defensible vs a raw count map. Do not skip.

Config constants (radii, time window, weights, thresholds) live in /config/constants.js.
Time window: start at trailing 24 months, tunable.

## Mongo

collection complaint_cache:
  { lat (rounded ~4dp), lng (rounded), radiusTier: "building"|"block",
    counts: {...six buckets...}, createdAt }
  - compound index {lat, lng, radiusTier}
  - TTL index on createdAt (~24h) for self-refresh
  - NO 2dsphere index. Spatial filtering is done by Socrata, not Mongo. Cache
    lookup is exact key match on rounded coords.

collection baseline:
  { _id: "v1", perBucket: { <bucket>: {median, p90} }, radiusTier, computedAt }

## AI Explanation Layer (NEW SCOPE)

Each sub-score (Building Health, Block Quality) is accompanied by a 1-2 sentence
AI-generated explanation of why it got that band ("Good to live" / "Proceed with
caution" / etc). This is a separate step AFTER scoring, not inside the pure
score() function — scoring stays deterministic and fixture-tested; the AI call is
neither, and must be isolated so it can fail without breaking scoring.

**Two adapters, same interface, swapped by env var:**
- `ollama` — local dev only. Requires Ollama running locally with `llama3` pulled.
  Cannot run on Vercel (serverless has no persistent local process).
- `gemini` — deployed (Vercel) target. Hosted HTTP API, works identically in any
  environment including serverless.

Shared contract both adapters must implement:
`generateExplanation({ label, band, counts, radiusLabel }) -> Promise<string>`

```
/providers/ai
  index.js      factory: reads AI_PROVIDER env var, returns ollama.js or gemini.js
  ollama.js     calls http://localhost:11434/api/generate, model "llama3"
  gemini.js     calls generativelanguage.googleapis.com, model "gemini-2.5-flash-lite"
  prompt.js     buildPrompt() — SHARED by both adapters so output tone stays consistent
```

Prompt rules (baked into prompt.js, do not duplicate/diverge per adapter):
- Explicitly instruct: base explanation ONLY on the provided counts, do not invent
  addresses, dates, or specific incidents. This is the main defense against
  hallucinated specifics.
- temperature 0.3 (consistency over creativity), short output cap (~80-100 tokens).
- No mention of "percentile" or other technical scoring terms in the output.

**Env vars:**
- `AI_PROVIDER` = "ollama" (local `.env`) or "gemini" (Vercel dashboard)
- `GEMINI_API_KEY` = set in Vercel dashboard only, never committed

**Fallback is not optional.** services/explain.js wraps the adapter call in
try/catch; on ANY failure (timeout, rate limit, service down), fall back to
services/templateExplanation.js, a deterministic template keyed by band + dominant
bucket. Demo must never show a broken/error state for this feature.

**Caching:** explanation is generated once and stored on the SAME complaint_cache
Mongo document as the score (same TTL), not regenerated per request. This matters
more for Ollama (slow on CPU) but keep it for Gemini too, to stay under free-tier
daily request caps.

**Two-call pattern (see API contract for exact shapes):** POST /api/score never
blocks on the AI call — on a cache miss it returns the deterministic template
explanation immediately with explanationSource: "template". Frontend then fires
GET /api/explanation as a second call ONLY when it sees "template", which does
the actual AI generation, writes it to the same cache doc, and returns the real
text for the frontend to swap in. Synchronous, no polling — deliberate hackathon
simplification. This is what actually solves the Vercel timeout risk: the slow
AI call is now its own request with its own budget, not stacked behind the
Socrata + scoring latency on the main score request.

**Model deprecation flag:** gemini-2.5-flash and gemini-2.5-flash-lite are
scheduled to shut down Oct 16, 2026 per Google's notice. Fine for the hackathon
timeline, but if this project continues past that date, swap the model string —
it lives in ONE place (constants.js), not hardcoded in gemini.js directly, so
confirm that's actually how it's wired before relying on it.

**Tone-consistency check:** Llama 3 8B and Gemini Flash-Lite are different models
and may not produce similarly-toned output from an identical prompt. Before
demo day, run both adapters against the same cached counts and eyeball the two
outputs side by side. If they diverge noticeably, tighten prompt.js (more explicit
tone/length constraints) rather than shipping two different-feeling products
depending on environment.

## Deployment (Vercel)

- Express app must be adapted for serverless, not run as-is with app.listen().
  Wrap the whole app with `serverless-http` in api/index.js (least restructuring
  for a hackathon timeline vs splitting every route into its own /api file).
- Mongo connections MUST be cached on `global`, not opened fresh per invocation,
  or you'll exhaust Atlas's connection limit under any real traffic:
  see db.js pattern — cache client on global._mongoClient, reuse if present.
- Env vars (SOCRATA_APP_TOKEN, MONGODB_URI, JWT_SECRET, AI_PROVIDER,
  GEMINI_API_KEY) go in Vercel dashboard > Project Settings. .env files do NOT
  deploy. JWT_SECRET and MONGODB_URI are REQUIRED — the app exits at boot
  without them, so a missing one is a failed deploy, not a degraded one.
- Hobby tier function execution cap (reportedly ~10s) — verify actual current
  limit on Vercel's own pricing page before assuming. This is another reason the
  AI explanation call happens at cache-write time, not inline in the live request
  path when deployed.
- Ollama-based local dev and Gemini-based deployed behavior are expected to
  differ in this one respect: this is intentional, not a bug, per adapter design
  above.

## Repo shape

/src
  /routes      score.js, complaints.js, health.js, explanation.js, auth.js
  /services    scoreService.js, scoring.js (pure), explain.js, templateExplanation.js,
               authService.js
  /providers   socrata.js, cache.js, mongo.js, baseline.js, users.js, sessions.js
    /ai        index.js, ollama.js, gemini.js, prompt.js
  /middleware  requireAuth.js
  /lib         validate.js, errors.js, password.js, tokens.js
  /config      constants.js
/scripts       buildBaseline.js, createUser.js, verify*.js
/test          scoring.test.js, auth.test.js, password.test.js, ...
api/index.js   Vercel serverless entrypoint (wraps Express app)

## OPEN ITEMS — verify against live API before building on top

1. ~~Exact complaint_type strings~~ — RESOLVED, see table above.
2. Exact geolocation column name for within_circle (the geo-typed column, not the
   separate latitude/longitude text fields). Check via a single-row pull:
   `erm2-nwe9.json?$limit=1` and inspect field types on the dataset's About page.
3. ~~Null-geocoding rate PER bucket~~ — RESOLVED for the Building Health buckets.
   Measured against live `erm2-nwe9` over the trailing 24 months, counting
   `location IS NOT NULL` (the geo column `within_circle` actually uses):

   | complaint_type | total | geocoded | missing |
   |---|---|---|---|
   | HEAT/HOT WATER | 651,313 | 651,263 | 50 (0.008%) |
   | UNSANITARY CONDITION | 247,974 | 247,954 | 20 (0.008%) |
   | PLUMBING | 149,848 | 149,835 | 13 (0.009%) |

   The concern that plumbing/unsanitary would be spottier than noise/parking is
   NOT borne out — all three are >99.99% geocoded. No fallback to
   `incident_address` is needed. **Block Quality buckets still unmeasured.**

   Consequence worth knowing: zero building counts are therefore REAL data, not
   a geocoding artifact. At a 25m radius, 9 of 10 sampled NYC coordinates had
   zero building complaints — citywide there are only ~0.65 heat complaints per
   building over 24 months. This is what makes the Building Health explanation
   land on the template path at nearly every address (see explain.js's
   deliberate zero-complaint short-circuit), and it is the strongest argument
   for revisiting the 25m radius in open item 5.
4. Dataset title has changed over time on the Socrata page (same UID). Confirm
   current title + date range on the dataset page.
5. Tight building radius may bleed into adjacent buildings on dense blocks. Person 3
   owns radius testing; coordinate before trusting building scores.
6. Gemini free-tier RPM/RPD caps — figures used in planning came from third-party
   reporting, not confirmed directly against ai.google.dev/gemini-api/docs/pricing.
   Check that page directly before assuming the exact numbers.

## Build order

P0: Express skeleton + MOCKED /api/score in frozen shape, deployed. Unblocks team.
P1: Socrata client + null-geocoding check (item 3). Item 1 already resolved above.
P2: real getCounts (with bucket-level summing) + cache read/write + TTL.
P3: buildBaseline.js, then score() against it.
P3.5: AI explanation layer — both adapters, factory, template fallback, GET
    /api/explanation endpoint as the separate slow-path call (see AI
    Explanation Layer and API contract sections above).
P4: swap mock for real, integrate. Budget full time; clean integration is rare.
P5: pre-warm cache for demo addresses (score + explanation both); serve cached
    value on live-API/AI failure; keep backend warm (free tiers cold-start and
    look broken mid-demo).

## Conventions

- Live-proxy + cache. NOT bulk ingest (millions of rows would blow free Atlas tier).
- Validate coords in NYC bounds (~lat 40.4-40.95, lng -74.3 to -73.7); 400 on bad input.
- Do not put personal data or coordinates in logs beyond what debugging needs.
- AI adapters are provider-agnostic at the call site (services/explain.js). Never
  branch on AI_PROVIDER outside providers/ai/index.js.