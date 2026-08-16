<div align="center">

# Streetwise
### *Know before you sign the lease.*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![Node](https://img.shields.io/badge/Node-%E2%89%A520.6-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-optional%20cache-47A248?logo=mongodb&logoColor=white)
![Google Maps](https://img.shields.io/badge/Google%20Maps-Geocoding%20%2B%20Places-4285F4?logo=googlemaps&logoColor=white)
![Data source](https://img.shields.io/badge/data-NYC%20311%20Open%20Data-orange)

</div>

---

## About

Renters in New York City sign leases against a wall of information they
simply don't have. A listing photo says nothing about whether the landlord
lets the heat go out every winter, whether the block is a 3am parking dispute
away from a shouting match, or whether the building has a documented pattern
of plumbing failures. That information *does* exist — it's just buried in
NYC's public 311 complaint records, scattered across hundreds of millions of
rows with no way to ask "what does this actually mean for *this* address."

**Streetwise** answers that question directly. Type an address, and the
app geocodes it, pulls every relevant 311 complaint filed near that location
over the last two years, and turns the raw counts into two things a person
can actually act on:

- A **Building Health Score** (0–100) — heat/hot water outages, unsanitary
  conditions, and plumbing failures, scoped to a tight ~25m radius so it
  reflects *this building*, not the whole block.
- A **Block Quality Score** (0–100) — noise and illegal parking complaints
  at a ~350m radius, describing what living on this block is actually like
  day to day.

Both scores are computed against a **precomputed citywide baseline**, so the
number isn't just a raw count — it's a percentile. "7 plumbing complaints"
means nothing on its own; "worse than 85% of NYC buildings" does. That
baseline-relative scoring is the entire reason this is a *score* and not
just a complaint tally with extra steps.

Each score also comes with a plain-English explanation of *why* it landed
where it did — AI-generated (Ollama locally, Gemini when deployed) with a
deterministic template fallback, so the feature can never show a broken or
empty state.

This was built end-to-end in a single day for a hackathon: a real Express
API that live-queries NYC Open Data and caches results in MongoDB, paired
with a Next.js frontend that geocodes addresses through Google Maps and
presents the two scores alongside an interactive map, a complaint breakdown,
a 12-month trend, and a per-complaint detail view.

---

## Table of contents

- [Quick start](#quick-start)
- [Architecture](#architecture)
- [What's real vs. mocked/stubbed right now](#whats-real-vs-mockedstubbed-right-now)
- [Repo layout](#repo-layout)
- [Testing](#testing)
- [Contributors](#contributors)
- [Further reading](#further-reading)

---

## Quick start

**Prerequisites:** Node ≥ 20.6, npm.

The app is two independent servers — the Express backend (`:3001`) and the
Next.js frontend (`:3000`). Run both.

### 1. Backend

Two ways to run it — pick one, you don't need both:

```bash
# Option A — Docker (recommended for a fresh clone, no local installs)
cd backend
docker compose up --build
curl localhost:3001/health

# Option B — native Node
cd backend
npm install
npm run dev                # → http://localhost:3001
```

A fresh clone runs with **zero `.env`** — every piece of backend
infrastructure (Mongo cache, AI explanations, even the Socrata token) is
optional and the app degrades gracefully without it. Set one up when you want
live data that isn't throttled, a working cache, or real AI-generated
explanations instead of the template fallback:

```bash
cd backend
cp .env.example .env
```

| Var | Required? | Notes |
|---|---|---|
| `SOCRATA_APP_TOKEN` | Recommended | Free at [data.cityofnewyork.us developer settings](https://data.cityofnewyork.us/profile/edit/developer_settings). Works without one, but requests throttle hard under load — register one before demoing. |
| `MONGODB_URI` | Optional | Atlas or local. Without it, the app runs **uncached** — every request hits Socrata live, no persistence. Scoring still works with zero Mongo, via the committed baseline fallback at `backend/src/config/baseline.json`. |
| `AI_PROVIDER` | Optional | `ollama` (default, local-only) or `gemini` (works anywhere, needs `GEMINI_API_KEY`). Neither is required — explanations fall back to a deterministic template on any failure. |
| `USE_MOCK_DATA` | Optional | Set to `1`/`true` to serve fake (but realistic) scores instead of hitting Socrata — useful for frontend work with no network/token/Mongo at all. |

**Full backend setup (Docker details, every env var, Ollama install/verify,
common tasks) lives in [`backend/README.md`](backend/README.md) — read that,
not this section, if something here doesn't cover your case.**

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                # → http://localhost:3000
```

Create `frontend/.env.local` yourself — it's gitignored, so it won't exist on
a fresh clone (nobody's key is committed to the repo):

```
GOOGLE_MAPS_API_KEY=your_key_here
```

| Var | Required? | Notes |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Yes, for real geocoding/map/autocomplete | Needs the **Geocoding API**, **Places API (New)**, and **Maps JavaScript API** enabled on the Google Cloud project. Without it, the map shows a config-needed message and autocomplete falls back to a small local mock address list — the app still runs, just without real map/geocoding. |

### 3. Use it

With both running, open **http://localhost:3000**, search an NYC address
(try `123 Ludlow St, New York, NY 10002`), and you'll get a live-scored
report.

> **If the backend isn't running, the frontend doesn't crash or tell you.**
> `fetchReport()` catches the failed connection and silently falls back to a
> deterministic local mock generator, so the UI still looks fully populated.
> Convenient for frontend-only work — but it means a working-looking report
> is not proof the backend is wired up. Confirm something is actually
> listening on `:3001` if you need to verify real data end-to-end.

---

## Architecture

```
 Browser
   │  address search
   ▼
 Next.js frontend  (frontend/, :3000)
   │  geocodes via Google  (app/api/geocode, app/api/autocomplete)
   │  POST { lat, lng }
   ▼
 Express backend  (backend/, :3001)
   │  Mongo cache (optional) → live Socrata query on a miss
   │  scores counts against a precomputed citywide baseline
   ▼
 NYC 311 Open Data (Socrata)   +   MongoDB (optional cache / baseline store)
```

The backend **never geocodes** — it only ever takes `{lat, lng}`. The
frontend **never** touches Socrata or Mongo directly — it only calls the
backend's `POST /api/score`. That boundary is deliberate and documented in
[`backend/CLAUDE.md`](backend/CLAUDE.md).

---

## What's real vs. mocked/stubbed right now

Worth knowing before demoing this or building on top of it — not everything
in the UI is backed by the real data pipeline yet:

| Feature | Backed by real data? |
|---|---|
| Building Health / Block Quality scores + per-category counts | **Yes**, once the backend is running (`POST /api/score` hits live 311 data) |
| Address search, autocomplete, interactive map | **Yes**, via Google Maps APIs |
| Per-score "why" explanation text | **Yes** — AI-generated via Ollama/Gemini when a provider is configured and reachable, otherwise a deterministic (but still accurate) template. Either way it's derived from the real counts, never fabricated. The report banner now actually requests and displays the AI text (`GET /api/explanation`); it previously ignored it and always showed the client-side `explainVerdict` copy. |
| "Recent Complaints" list on each report | **Yes** — `ReportView` populates each panel's `recentComplaints` from `GET /api/complaints` (real individual 311 records). Note `/api/score` itself still returns only aggregate counts, so a component handed a raw `/api/score` response sees no complaint list. |
| Complaint status timeline (Open → In Progress → Closed) | **No** — 311 doesn't expose per-complaint status history at all. Explicitly labeled stub (`buildComplaintTimeline` in `frontend/lib/mock-data.ts`) that synthesizes a plausible timeline from a complaint's date + current status. |
| Comment/reply threads on complaints, "Building Admin" role | **No** — no backend support exists or is planned. Seeded + session-local only; the admin role is a UI checkbox, not real auth. |

**Trust the scores and the complaint list. Don't trust the timeline or
comments as real 311 records** — those two remain intentionally-scoped UI
stubs with data shapes already matching what a real implementation would
need, ready to swap in real data later without a redesign.

**A working-looking report is now proof the backend is real.** `fetchReport()`
used to fall back to a fully fake `mock-data.ts` report whenever the backend
was unreachable, which made an outage indistinguishable from success. That
fallback has been removed — a backend that is down now shows an error.

---

## Repo layout

```
backend/
  src/
    routes/       score.js, complaints.js, explanation.js, health.js
    services/     scoreService.js (orchestration), scoring.js (pure scoring),
                  explain.js, templateExplanation.js, mockData.js
    providers/    socrata.js, cache.js, mongo.js, baseline.js, ai/ (gemini.js, ollama.js, ...)
    config/       constants.js, baseline.json (committed fallback baseline)
  scripts/        buildBaseline.js, verifyDataset.js, verifyCache.js, verifyScoring.js, verifyExplanations.js
  test/           vitest suite, 299 tests, no network required
  Dockerfile, compose.yaml   local dev stack (API + Mongo), optional
  README.md       full backend setup — Docker, env vars, Ollama/Gemini
  API.md          full API reference with real captured requests/responses
  CLAUDE.md       backend architecture/data notes, decisions log
  documentation/  milestone-by-milestone build write-ups (m0–m6), handoff notes

frontend/
  app/            Next.js App Router pages + API routes (geocode, autocomplete, legacy report proxy)
  components/     UI components (ReportView, ScorePanelCard, MapPanel, ComplaintDetailModal, ...)
  lib/            api.ts (backend/Google client), mock-data.ts, score.ts, types.ts

documentation/    module-by-module reference docs for this whole repo — see below
```

---

## Testing

```bash
cd backend && npm test        # vitest, 299 tests, no network needed
cd frontend && npm run build  # type-checks + builds; no dedicated test suite yet
```

---

## Contributors

Built in one day for the hackathon by **LeonInferno**, **weijiePan**,
**Galm007**, and **ForgottenLight4415**.

---

## Further reading

Full module-by-module documentation lives in [`documentation/`](documentation/):

- [`documentation/backend-architecture.md`](documentation/backend-architecture.md) — layering, request lifecycle, design principles
- [`documentation/backend-routes.md`](documentation/backend-routes.md) — every endpoint, request/response shapes
- [`documentation/backend-services.md`](documentation/backend-services.md) — orchestration + the percentile scoring algorithm, explained
- [`documentation/backend-providers.md`](documentation/backend-providers.md) — the Socrata client, Mongo cache, baseline loader
- [`documentation/backend-config-and-scripts.md`](documentation/backend-config-and-scripts.md) — every tunable constant, and the offline scripts
- [`documentation/frontend-architecture.md`](documentation/frontend-architecture.md) — pages, API routes, data flow, styling
- [`documentation/frontend-components.md`](documentation/frontend-components.md) — every component, grouped by purpose
- [`documentation/frontend-lib.md`](documentation/frontend-lib.md) — the API client, scoring helpers, and the mock data generator

Plus the backend team's own docs:

- [`backend/README.md`](backend/README.md) — full backend setup: Docker, every env var, Ollama/Gemini install & troubleshooting
- [`backend/API.md`](backend/API.md) — full endpoint reference with real captured samples
- [`backend/CLAUDE.md`](backend/CLAUDE.md) — data model, complaint-type mapping, scoring methodology, known data caveats (e.g. `streetCondition`'s 25% null-geocode rate)
- [`backend/documentation/`](backend/documentation/) — milestone-by-milestone build notes
