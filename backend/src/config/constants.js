// Single source of truth for complaint-type strings, radii, time window, and
// thresholds. Do NOT re-derive complaint_type strings anywhere else — import
// from here. See CLAUDE.md for why each type is included or excluded.

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export const SOCRATA_DATASET_ID = "erm2-nwe9";
export const SOCRATA_ENDPOINT = `https://data.cityofnewyork.us/resource/${SOCRATA_DATASET_ID}.json`;

// The geo-typed column used by within_circle(). CONFIRMED live in M2: it is a
// Point geometry, and the `latitude`/`longitude` fields are plain numbers that
// within_circle REJECTS with query.soql.type-mismatch. Do not "simplify" this.
export const LOCATION_FIELD = "location";

// ---------------------------------------------------------------------------
// Buckets — CONFIRMED against live API, see CLAUDE.md
// ---------------------------------------------------------------------------

export const BUILDING_HEALTH_TYPES = {
  heatHotWater: ["HEAT/HOT WATER", "Heat/Hot Water"],
  unsanitaryCondition: ["UNSANITARY CONDITION", "Unsanitary Condition"],
  plumbing: ["PLUMBING", "Plumbing"],
};

export const BLOCK_QUALITY_TYPES = {
  noise: [
    "Noise - Residential",
    "Noise - Street/Sidewalk",
    "Noise - Vehicle",
    "Noise - Commercial",
  ],
  parking: ["Illegal Parking", "Blocked Driveway"],
  streetCondition: ["Street Condition", "Sidewalk Condition", "DEP Street Condition"],
};

// ---------------------------------------------------------------------------
// Radius tiers
// ---------------------------------------------------------------------------

export const RADIUS_TIERS = {
  building: {
    tier: "building",
    radiusMeters: 25,
    buckets: BUILDING_HEALTH_TYPES,
  },
  block: {
    tier: "block",
    radiusMeters: 350,
    buckets: BLOCK_QUALITY_TYPES,
  },
};

/** Bucket names in a stable order, per tier. */
export const BUCKET_NAMES = {
  building: Object.keys(BUILDING_HEALTH_TYPES),
  block: Object.keys(BLOCK_QUALITY_TYPES),
};

/**
 * Flat lookup: complaint_type string -> bucket name. Used to sum all string
 * variants of a bucket into ONE number. Critical: never percentile per string
 * and average — buckets have different variant counts (see CLAUDE.md).
 */
export const TYPE_TO_BUCKET = Object.fromEntries(
  Object.values(RADIUS_TIERS).flatMap(({ buckets }) =>
    Object.entries(buckets).flatMap(([bucket, types]) =>
      types.map((type) => [type, bucket])
    )
  )
);

/** Every complaint_type string we care about, for the `in (...)` clause. */
export const ALL_COMPLAINT_TYPES = Object.keys(TYPE_TO_BUCKET);

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

/** Trailing window for complaint counts. Tunable. */
export const WINDOW_MONTHS = 24;

/** Floating ISO cutoff for `created_date > ...`, computed at query time. */
export function windowCutoffISO(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - WINDOW_MONTHS);
  return cutoff.toISOString().slice(0, 19); // Socrata floating timestamp, no Z
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// Sub-score is the mean of the three bucket percentiles. Equal weights are the
// starting point; if a bucket ever needs its own weight it must be set here
// explicitly rather than by padding its type list (see CLAUDE.md decision 6).
export const BUCKET_WEIGHTS = {
  heatHotWater: 1,
  unsanitaryCondition: 1,
  plumbing: 1,
  noise: 1,
  parking: 1,
  streetCondition: 1,
};

/** Score is 0-100 where 100 = fewest complaints. Bands are inclusive lower bounds. */
export const BAND_THRESHOLDS = {
  good: 70,
  fair: 40,
  // below `fair` => "poor"
};

/**
 * The baseline gives us three points of the citywide distribution per bucket:
 * median, p90, and zeroShare (what fraction of sampled locations had none).
 * These are the percentiles median and p90 sit at; they anchor the
 * piecewise-linear curve that turns a raw count into a percentile. zeroShare
 * anchors the curve at count 1 — see anchorsFor() in services/scoring.js.
 */
export const SCORE_ANCHOR_PERCENTILES = {
  median: 50,
  p90: 90,
};

/**
 * Above p90 the baseline tells us nothing about shape, so the curve is
 * extrapolated: percentile reaches 100 at `p90 + TAIL * (p90 - median)`.
 * 2 keeps a genuinely awful block distinguishable from a merely bad one
 * instead of flattening every outlier to a score of 0.
 */
export const SCORE_TAIL_MULTIPLIER = 2;

/**
 * Degenerate baselines (median AND p90 both 0 — a bucket that is essentially
 * always zero citywide) carry no spread to interpolate over. One complaint is
 * then already unusual, and percentile reaches 100 at this many complaints.
 */
export const SCORE_DEGENERATE_SPAN = 10;

/**
 * Buckets whose underlying data is known to be weaker, surfaced per-bucket in
 * the response so the frontend can de-emphasize them rather than presenting
 * them as equally solid. streetCondition is 25.6% null-geocoded and the nulls
 * are NOT uniform by borough (19.1% Manhattan → 31.1% Queens), so the bias does
 * not cancel against the baseline. See handoff.md decision A.
 */
export const LOW_CONFIDENCE_BUCKETS = {
  streetCondition: "high_null_geocoding_rate",
};

/** Values for the `confidence` field on each sub-score. */
export const CONFIDENCE = {
  normal: "normal",
  low: "low",
};

/**
 * Reasons a sub-score is marked low-confidence.
 * - noComplaintsFound: every bucket is 0. A mid-street coordinate returns zero
 *   building complaints, which would otherwise score as a PERFECT building —
 *   a lookup failure presented to a renter as good news. See handoff.md B.
 * - noBaseline: no baseline available, so the score is not comparable to the city.
 * - staleBaseline: baseline was computed at different radii than we now query.
 */
export const CONFIDENCE_REASONS = {
  noComplaintsFound: "no_complaints_found",
  noBaseline: "no_baseline",
  staleBaseline: "stale_baseline_radius",
};

// ---------------------------------------------------------------------------
// Socrata client
// ---------------------------------------------------------------------------

export const SOCRATA_TIMEOUT_MS = 5000;
export const SOCRATA_MAX_RETRIES = 2;
export const SOCRATA_ROW_LIMIT = 50000;

/**
 * Row caps for the heatmap endpoint (individual points, not counts).
 * Socrata returns the most RECENT rows, so a dense block hitting the cap loses
 * its older months — the endpoint reports that truncation in a response header
 * rather than passing off a partial window as complete. Never count from this
 * endpoint; counts come from /api/score, which aggregates server-side.
 */
export const COMPLAINTS_DEFAULT_LIMIT = 1000;
export const COMPLAINTS_MAX_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export const CACHE_COLLECTION = "complaint_cache";
export const BASELINE_COLLECTION = "baseline";
export const BASELINE_ID = "v1";

// ---------------------------------------------------------------------------
// Baseline sampling (scripts/buildBaseline.js)
// ---------------------------------------------------------------------------

/** How many sample coordinates the baseline is computed over. */
export const BASELINE_SAMPLE_SIZE = 250;

/** Concurrent getCounts calls while sampling. Two HTTP calls each — be polite. */
export const BASELINE_SAMPLE_CONCURRENCY = 4;

/**
 * Fixed PRNG seed for sample selection. Sampling is deterministic on purpose:
 * a rerun picks the SAME coordinates, so it hits the cache instead of paying
 * for 500 fresh Socrata calls, and two runs are comparable.
 */
export const BASELINE_SAMPLE_SEED = 20260815;

/**
 * Sample points closer together than this share a grid cell and only one is
 * kept, so the baseline is not dominated by one complaint-dense block.
 * 0.003 degrees ≈ 330m, roughly the block radius.
 */
export const BASELINE_THINNING_GRID_DEGREES = 0.003;

/**
 * Minimum share of the sample each borough gets regardless of its record count.
 * Without a floor, Staten Island (fewest 311 records) would barely appear, and
 * the baseline would describe dense Brooklyn/Queens rather than the city.
 */
export const BASELINE_MIN_BOROUGH_SHARE = 0.08;

/** Borough values as they appear in the `borough` column. */
export const BOROUGHS = [
  "MANHATTAN",
  "BROOKLYN",
  "QUEENS",
  "BRONX",
  "STATEN ISLAND",
];

/** Coordinates are rounded to this many decimals to form the cache key (~11m). */
export const CACHE_COORD_PRECISION = 4;

/** TTL index expiry on createdAt — cache self-refreshes daily. */
export const CACHE_TTL_SECONDS = 24 * 60 * 60;

// ---------------------------------------------------------------------------
// AI explanation layer
// ---------------------------------------------------------------------------

export const AI_PROVIDERS = {
  ollama: "ollama",
  gemini: "gemini",
};

/** Used when AI_PROVIDER is unset. Local dev is the default environment. */
export const DEFAULT_AI_PROVIDER = AI_PROVIDERS.ollama;

/**
 * Model strings live HERE and nowhere else — CLAUDE.md calls this out
 * specifically so a deprecation is a one-line swap. Both are env-overridable so
 * a deployment can change models without a code change. That design was
 * immediately vindicated; see the Gemini note.
 *
 * GEMINI note (verified live 2026-08-15): CLAUDE.md specifies
 * `gemini-2.5-flash-lite` and expects it to last until its 2026-10-16 shutdown.
 * It does NOT — it already returns
 *   404 "This model is no longer available to new users"
 * for a newly-issued API key. `gemini-3.5-flash-lite` is the current
 * equivalent tier: available, ~0.8s, and it needs no thinking config (see
 * GEMINI_THINKING_BUDGET below). Swapped, not worked around.
 *
 * OLLAMA note: CLAUDE.md specifies "llama3". The machine this was built on has
 * `llama3.1:8b` pulled and not `llama3`, so that is the default here — one
 * constant (or one env var) to change back, and nothing else knows the name.
 */
export const AI_MODELS = {
  ollama: process.env.OLLAMA_MODEL || "llama3.1:8b",
  gemini: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
};

/**
 * Whether to send Gemini an explicit thinking budget, and what it should be.
 * `null` omits `thinkingConfig` entirely.
 *
 * This is model-dependent and there is no safe universal value — measured:
 *   gemini-3.5-flash-lite  REJECTS thinkingConfig with 400 invalid argument
 *   gemini-2.5-flash       REQUIRES thinkingBudget: 0, or 111 thinking tokens
 *                          eat the 120-token cap and the response comes back
 *                          finishReason MAX_TOKENS with the text "Living here,
 *                          you would" — a truncated fragment, not an error
 *
 * Default is `null` because the default model is 3.5-flash-lite. Set
 * GEMINI_THINKING_BUDGET=0 when pointing at a 2.5 model. The adapter also
 * retries without the field on a 400, so a model swap degrades rather than breaks.
 */
export const GEMINI_THINKING_BUDGET =
  process.env.GEMINI_THINKING_BUDGET === undefined
    ? null
    : Number(process.env.GEMINI_THINKING_BUDGET);

export const OLLAMA_ENDPOINT =
  process.env.OLLAMA_ENDPOINT || "http://localhost:11434/api/generate";

export const GEMINI_ENDPOINT_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Consistency over creativity — two lookups of the same block should read alike. */
export const AI_TEMPERATURE = 0.3;

/** Short output cap. Gemini counts thinking tokens against this, see gemini.js. */
export const AI_MAX_OUTPUT_TOKENS = 120;

/**
 * Per-call timeouts. Ollama on CPU is genuinely slow (8B model, tens of
 * seconds), and this call is on its own request budget by design — but it still
 * needs a ceiling, or a wedged local model hangs the tab forever.
 */
export const AI_TIMEOUT_MS = {
  ollama: 45000,
  gemini: 12000,
};

/** Explanations must be short enough to sit under a score without wrapping forever. */
export const EXPLANATION_MAX_CHARS = 400;

/** Where an explanation came from. Mirrors `explanationSource` in the API. */
export const EXPLANATION_SOURCES = {
  ai: "ai",
  template: "template",
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// Sign-up, login, sessions, and roles (tenant/landlord, in user_metadata) are
// all owned by Supabase now — see providers/supabase.js and
// middleware/requireAuth.js. Nothing about an account lives in this app.

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export const NYC_BOUNDS = {
  minLat: 40.4,
  maxLat: 40.95,
  minLng: -74.3,
  maxLng: -73.7,
};
