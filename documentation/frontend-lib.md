# Frontend — `lib/`

The non-UI core: the API client, scoring/formatting helpers, and the mock
data generator that stands in for real data wherever it isn't available.

---

## `api.ts` — client for backend + Google

### `getLatLng(address)`

Geocodes an address via the app's own `/api/geocode` route (Google under the
hood). If the first lookup returns nothing, retries with unit designators
stripped (`stripUnit()` — removes `apt`/`unit`/`suite`/`floor`/`room`/`#`
etc.) before giving up. This exists because a unit-suffixed address can fail
to geocode even though the building itself resolves fine, and scoring only
needs the building's coordinates.

### `fetchSuggestions(query, signal)`

Calls `/api/autocomplete`. Returns `[]` immediately for an empty query;
otherwise returns whatever the route responds with (real Google suggestions,
or the local mock fallback — the client doesn't know or care which).

### `fetchReport(lat, lng)`

```ts
try {
  res = await fetch(`${API_BASE_URL}/api/score`, { method: "POST", ... });
} catch {
  throw new Error("Couldn't reach the backend — is it running?");
}
```

`API_BASE_URL` is hardcoded to `http://localhost:3001`. If that connection
fails for any reason (backend not running, wrong port, network error), this
**throws** and the report page shows the error.

> **Changed:** this used to fall back to `mock-data.ts#buildReport(address)` —
> a fully populated, entirely fake report — whenever the backend was
> unreachable, which meant a working-looking UI was no proof the backend was
> being used. That fallback is gone, along with the `address?` parameter that
> existed only to feed it, and the dead `app/api/report/route.ts` route that
> served the same mock. A backend outage now surfaces as an error.

On a 401 with `error: "token_expired"` it attempts one token refresh and
retries once; any other 401 triggers the login modal.

If the backend *is* reachable, its real response is returned as-is — which
notably does **not** include `recentComplaints` (see
[Real backend response vs. what components expect](#real-backend-response-vs-what-components-expect)
below).

### `fetchExplanation(lat, lng, tier)`

The slow path of the two-call AI explanation flow. `GET /api/explanation` with
the bearer token, for `tier` of `"building"` or `"block"`.

Returns the AI text, or **`null` whenever there is nothing to swap in** — a
network failure, an auth failure, or the endpoint answering `200` with
template text because the AI call failed server-side. It never throws;
callers treat `null` as "keep the deterministic client-side copy".

Only worth calling for a tier whose `/api/score` response came back with
`explanationSource: "template"`. See
[the AI explanation flow](./frontend-components.md#the-ai-explanation-flow)
for how `ReportView` orchestrates this.

---

## `score.ts` — display logic derived from a report

- **`BAND_LABEL` / `BAND_VERDICT` / `BAND_VAR`** — display strings and CSS
  variable names for each `ScoreBand` (`good`/`fair`/`poor`).
- **`overallBand(a, b)`** — the worse of two bands (used to pick the overall
  verdict from Building Health + Block Quality).
- **`CATEGORY_LABEL`** — maps a bucket key (`heatHotWater`, `parking`, ...)
  to its display label (`"Heat / Hot Water"`, `"Illegal Parking"`, ...).
- **`STATUS_LABEL` / `STATUS_VAR`** — same idea for `ComplaintStatus`
  (`open`/`in-progress`/`closed`), shared by `RecentComplaintsList` and
  `ComplaintDetailModal` so their colors/labels can't drift apart.
- **`explainVerdict(building, block, overall, windowMonths)`** — builds the
  one-line "why this rating" sentence under the verdict badge. Looks at
  whichever section(s) actually match the overall band (could be one or
  both), ranks their non-zero categories by count, takes the top 1–2, and
  counts how many of those specific categories' `recentComplaints` are still
  `open`/`in-progress`. E.g. *"Rated Poor due to 8 plumbing and 7 heat/hot
  water complaints in the last 24 months, including 3 unresolved."*
  Degrades gracefully with no complaint data (e.g. *"Rated Good — no notable
  complaints recorded..."*).
- **`buildMonthlyTrend(complaints, months = 12, reference = new Date())`** —
  buckets a panel's `recentComplaints` into a fixed-length array of the last
  N calendar months (oldest → newest), each `{month, count}`. This is what
  feeds `TrendSparkline` — there's no backend trend endpoint; it's entirely
  derived client-side from whatever complaint records are available.
- **`CONFIDENCE_MESSAGE`** — user-facing copy for the backend's
  `confidenceReason` values (see
  [`backend-services.md`](./backend-services.md#confidence)).

---

## `mock-data.ts` — the frontend's own mock generator

Separate from (and older than) the backend's `mockData.js` — this one exists
purely for the frontend and is used in two situations: (1) `fetchReport()`'s
network-failure fallback, and (2) the landing page's featured address cards,
which are *always* mock regardless of backend status.

- **`SEED_ADDRESSES`** — 15 hand-picked NYC addresses, each tagged with a
  `flavor` (`great`/`average`/`bad-building`/`bad-block`/`bad-both`) that
  controls how bad its generated counts are.
- **`resolveAddress(query)`** — matches a query against the seed list; if
  nothing matches, deterministically synthesizes a plausible address +
  coordinate + flavor from a hash of the query string (`hashString` +
  `mulberry32`, the same seeded-PRNG pattern used throughout this codebase).
  Same query always produces the same fake report.
- **`buildReport(query)` / `buildFeaturedReport(query)`** — generate a full
  `ReportResponse` (or, for the homepage, one with an address attached too,
  since the real API never returns one).
- **`buildComplaintTimeline(complaint)`** — the status-history stub. Always
  starts with an `"open"` event at the complaint's submission date; if the
  complaint's current status is `in-progress` or `closed`, adds a
  deterministically-timed `"in-progress"` event (2–10 days later), and if
  `closed`, a further `"closed"` event (2–14 days after that), each with a
  plausible note. Explicitly a stand-in for a real per-complaint history NYC
  311 doesn't expose — see
  [`frontend-components.md`](./frontend-components.md#complaint-detail-modal).
- **`buildSeedComments(complaint)`** — deterministic starter comment thread:
  one resident comment always; an admin reply added once the complaint is
  past `"open"`, with wording that varies by whether it's `in-progress` or
  `closed`.

---

## `types.ts` — shared TypeScript types

The `ReportResponse` shape here is written to match the backend's frozen
`POST /api/score` contract:

```ts
ReportResponse {
  address: string | null
  buildingHealth: ScoreSection<BuildingCounts>
  blockQuality: ScoreSection<BlockCounts>
  meta: ReportMeta
}

ScoreSection<TCounts> {
  score, band, counts: TCounts, radiusMeters,
  confidence, confidenceReason,
  bucketScores, bucketConfidence,
  recentComplaints?: Complaint[]   // ← optional, see below
}
```

### Real backend response vs. what components expect

`recentComplaints` is typed as **optional** on purpose: the real backend
never populates it (its `/api/score` response only ever contains `score`,
`band`, `counts`, `radiusMeters`, `confidence`, `confidenceReason`,
`bucketScores`, `bucketConfidence` — see
[`backend-routes.md`](./backend-routes.md)). Only
the frontend's own mock generator (`mock-data.ts#buildComplaints()`)
populates it. `ScorePanelCard` guards the entire trend chart + Recent
Complaints section on `panel.recentComplaints !== undefined` — so once the
real backend is what's actually answering requests, that whole section
silently disappears unless something is added to populate it (e.g. wiring up
`GET /api/complaints` on the frontend side).

### Other types worth knowing

- **`Complaint`** — `{ id, label, date, status }`. No `category` field — the
  `label` string itself doubles as the display category name.
- **`TrendPoint`** — `{ month: "YYYY-MM", count }`.
- **`TimelineEvent`** / **`ComplaintTimeline`** — `{ status, date, note? }` /
  `{ complaintId, events }`. This is the exact stub shape the timeline
  feature was scoped around, ready to swap in a real data source later
  without changing any component.
- **`Comment`** — `{ id, author, role: "resident" | "building_admin", text,
  timestamp, replies? }`. One level of nesting only.
