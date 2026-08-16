import { bandForScore, CATEGORY_LABEL } from "./score";
import type {
  BlockCounts,
  BuildingCounts,
  Comment,
  Complaint,
  ComplaintStatus,
  ComplaintTimeline,
  ReportResponse,
  ScoreSection,
} from "./types";

// ---------------------------------------------------------------------------
// This module stands in for the real backend (Node/Express + Socrata proxy +
// MongoDB cache) described in the project brief. Every value here is
// deterministically generated from the searched address string so a given
// query always returns the same report during a demo. Swap the internals of
// `buildReport` for a real fetch to the backend once it exists — the
// ReportResponse shape is the agreed contract, so nothing downstream needs to
// change.
// ---------------------------------------------------------------------------

interface SeedAddress {
  id: string;
  description: string;
  lat: number;
  lng: number;
  borough: string;
  flavor: "great" | "average" | "bad-building" | "bad-block" | "bad-both";
}

const SEED_ADDRESSES: SeedAddress[] = [
  { id: "1", description: "123 Ludlow St, New York, NY 10002", lat: 40.7202, lng: -73.9877, borough: "Manhattan", flavor: "bad-building" },
  { id: "2", description: "456 Park Ave, New York, NY 10022", lat: 40.7614, lng: -73.9707, borough: "Manhattan", flavor: "great" },
  { id: "3", description: "88 Bedford Ave, Brooklyn, NY 11249", lat: 40.7178, lng: -73.9647, borough: "Brooklyn", flavor: "bad-block" },
  { id: "4", description: "215 W 92nd St, New York, NY 10025", lat: 40.7911, lng: -73.9724, borough: "Manhattan", flavor: "average" },
  { id: "5", description: "37-11 74th St, Jackson Heights, NY 11372", lat: 40.7495, lng: -73.8913, borough: "Queens", flavor: "bad-both" },
  { id: "6", description: "1 Grand Army Plaza, Brooklyn, NY 11238", lat: 40.6743, lng: -73.9704, borough: "Brooklyn", flavor: "great" },
  { id: "7", description: "980 Anderson Ave, Bronx, NY 10452", lat: 40.8347, lng: -73.9265, borough: "Bronx", flavor: "bad-building" },
  { id: "8", description: "142 Stuyvesant Pl, Staten Island, NY 10301", lat: 40.6423, lng: -74.0776, borough: "Staten Island", flavor: "average" },
  { id: "9", description: "350 W 42nd St, New York, NY 10036", lat: 40.7584, lng: -73.9929, borough: "Manhattan", flavor: "bad-block" },
  { id: "10", description: "27 Greenpoint Ave, Brooklyn, NY 11222", lat: 40.7304, lng: -73.9573, borough: "Brooklyn", flavor: "average" },
  { id: "11", description: "104-40 Queens Blvd, Forest Hills, NY 11375", lat: 40.7218, lng: -73.8448, borough: "Queens", flavor: "great" },
  { id: "12", description: "2201 Grand Concourse, Bronx, NY 10457", lat: 40.8465, lng: -73.9032, borough: "Bronx", flavor: "bad-both" },
  { id: "13", description: "225 E 6th St, New York, NY 10003", lat: 40.7266, lng: -73.9868, borough: "Manhattan", flavor: "bad-building" },
  { id: "14", description: "412 Vanderbilt Ave, Brooklyn, NY 11238", lat: 40.6825, lng: -73.9688, borough: "Brooklyn", flavor: "great" },
  { id: "15", description: "63-05 108th St, Forest Hills, NY 11375", lat: 40.7233, lng: -73.8462, borough: "Queens", flavor: "average" },
];

const BOROUGH_BOUNDS: { name: string; lat: [number, number]; lng: [number, number] }[] = [
  { name: "Manhattan", lat: [40.70, 40.88], lng: [-74.02, -73.91] },
  { name: "Brooklyn", lat: [40.57, 40.74], lng: [-74.05, -73.83] },
  { name: "Queens", lat: [40.54, 40.80], lng: [-73.96, -73.70] },
  { name: "Bronx", lat: [40.79, 40.92], lng: [-73.93, -73.76] },
  { name: "Staten Island", lat: [40.49, 40.65], lng: [-74.26, -74.05] },
];

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function findSuggestions(query: string, limit = 6): SeedAddress[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = SEED_ADDRESSES.filter((a) =>
    a.description.toLowerCase().includes(q)
  );
  return scored.slice(0, limit);
}

function resolveAddress(query: string): SeedAddress {
  const q = query.trim().toLowerCase();
  const exact = SEED_ADDRESSES.find((a) => a.description.toLowerCase() === q);
  if (exact) return exact;
  const partial = SEED_ADDRESSES.find(
    (a) => a.description.toLowerCase().includes(q) || q.includes(a.description.toLowerCase())
  );
  if (partial) return partial;

  // Synthesize a plausible NYC address deterministically from the query text
  // (stand-in for Google Geocoding).
  const seed = hashString(q || "123 unknown st new york ny");
  const rand = mulberry32(seed);
  const borough = BOROUGH_BOUNDS[Math.floor(rand() * BOROUGH_BOUNDS.length)];
  const lat = borough.lat[0] + rand() * (borough.lat[1] - borough.lat[0]);
  const lng = borough.lng[0] + rand() * (borough.lng[1] - borough.lng[0]);
  const flavors: SeedAddress["flavor"][] = [
    "great",
    "average",
    "average",
    "average",
    "bad-building",
    "bad-block",
    "bad-both",
  ];
  const flavor = flavors[Math.floor(rand() * flavors.length)];

  return {
    id: `synthetic-${seed}`,
    description: titleCaseAddress(query) + `, ${borough.name}, NY`,
    lat,
    lng,
    borough: borough.name,
    flavor,
  };
}

function titleCaseAddress(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "Unknown Address";
  return trimmed
    .split(" ")
    .map((w) =>
      /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

type BuildingCategory = keyof BuildingCounts;
type BlockCategory = keyof BlockCounts;

// Mean complaint count at flavor multiplier 1.0 ("average"), per category,
// tuned so an average building and an average block both land in the
// "Fair" band and a "bad" flavor lands in "Poor" — see the scoring
// calibration below.
const BUILDING_CATEGORY_MEAN: Record<BuildingCategory, number> = {
  heatHotWater: 3,
  unsanitaryCondition: 2,
  plumbing: 3,
};
const BUILDING_CATEGORY_WEIGHT: Record<BuildingCategory, number> = {
  heatHotWater: 1.3,
  unsanitaryCondition: 1.5,
  plumbing: 1.0,
};

const BLOCK_CATEGORY_MEAN: Record<BlockCategory, number> = {
  noise: 6,
  parking: 7,
  streetCondition: 5,
};
const BLOCK_CATEGORY_WEIGHT: Record<BlockCategory, number> = {
  noise: 0.6,
  parking: 0.5,
  streetCondition: 0.8,
};

// The real API's streetCondition bucket is always flagged low-confidence
// (25.6% of Street Condition 311 records have no coordinates) — mirror that
// here so the mock behaves like the live backend.
const BLOCK_LOW_CONFIDENCE_BUCKETS: BlockCategory[] = ["streetCondition"];

function flavorMultiplier(
  flavor: SeedAddress["flavor"],
  scope: "building" | "block"
): number {
  switch (flavor) {
    case "great":
      return 0.15;
    case "average":
      return 1;
    case "bad-building":
      return scope === "building" ? 2 : 1;
    case "bad-block":
      return scope === "block" ? 2 : 1;
    case "bad-both":
      return 2;
    default:
      return 1;
  }
}

// Score = 100 minus the severity-weighted complaint total, scaled so an
// "average" flavor (weighted total ~10-11) lands around 65 (Fair) and a
// "bad" flavor (weighted total ~20-22, double the average multiplier)
// lands around 25-30 (Poor).
const SCORE_SCALE = 3.5;

function buildCounts<K extends string>(
  rand: () => number,
  means: Record<K, number>,
  weights: Record<K, number>,
  mult: number
): { counts: Record<K, number>; weightedTotal: number } {
  const counts = {} as Record<K, number>;
  let weightedTotal = 0;
  for (const cat of Object.keys(means) as K[]) {
    // Uniform 0..2*mean so the average value across the range is `mean`.
    const mean = means[cat] * mult;
    const n = Math.round(rand() * 2 * mean);
    counts[cat] = n;
    weightedTotal += n * weights[cat];
  }
  return { counts, weightedTotal };
}

function scoreFromWeightedTotal(weightedTotal: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - weightedTotal * SCORE_SCALE)));
}

function buildComplaints(
  counts: Record<string, number>,
  rand: () => number,
  prefix: string
): Complaint[] {
  const STATUSES: ComplaintStatus[] = ["closed", "closed", "closed", "in-progress", "open"];
  const REF_MS = new Date("2026-08-15").getTime();
  const complaints: Complaint[] = [];
  for (const cat of Object.keys(counts)) {
    for (let i = 0; i < counts[cat]; i++) {
      const daysAgo = Math.floor(rand() * 365);
      const date = new Date(REF_MS - daysAgo * 86400000).toISOString().slice(0, 10);
      const status = STATUSES[Math.floor(rand() * STATUSES.length)];
      complaints.push({ id: `${prefix}-${cat}-${i}`, label: CATEGORY_LABEL[cat] ?? cat, date, status });
    }
  }
  return complaints.sort((a, b) => b.date.localeCompare(a.date));
}

// The real 311/agency APIs don't expose per-complaint status history, only
// the current status — so there's no live source for this yet. Stands in
// for a future `/api/complaints/:id/timeline` call: same shape
// (ComplaintTimeline), deterministic per complaint id so a given complaint
// always renders the same stubbed history.
function addDays(iso: string, days: number): string {
  return new Date(new Date(iso + "T00:00:00").getTime() + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function buildComplaintTimeline(complaint: Complaint): ComplaintTimeline {
  const rand = mulberry32(hashString(complaint.id));

  const events: ComplaintTimeline["events"] = [
    {
      status: "open",
      date: complaint.date,
      note: "Complaint submitted to NYC 311 and logged for review.",
    },
  ];
  if (complaint.status === "open") {
    return { complaintId: complaint.id, events };
  }

  const inProgressDate = addDays(complaint.date, 2 + Math.floor(rand() * 8));
  events.push({
    status: "in-progress",
    date: inProgressDate,
    note: "Assigned to an inspector; site visit scheduled.",
  });
  if (complaint.status === "in-progress") {
    return { complaintId: complaint.id, events };
  }

  events.push({
    status: "closed",
    date: addDays(inProgressDate, 2 + Math.floor(rand() * 12)),
    note: "Issue resolved and verified closed by the agency.",
  });
  return { complaintId: complaint.id, events };
}

// Seed thread for the comments feature — there's no real comment backend
// yet, so each complaint starts with one deterministic resident comment,
// plus an admin reply once the complaint is past "open" (stands in for a
// real building admin posting a status update).
export function buildSeedComments(complaint: Complaint): Comment[] {
  const categoryText = complaint.label.toLowerCase().replace(/ \/ /g, "/");
  const resident: Comment = {
    id: `${complaint.id}-c1`,
    author: "Resident",
    role: "resident",
    text: `Has anyone else been dealing with the ${categoryText} issue here? Wondering if I should file a separate report.`,
    timestamp: complaint.date,
  };

  if (complaint.status === "open") {
    return [resident];
  }

  return [
    {
      ...resident,
      replies: [
        {
          id: `${complaint.id}-c1-r1`,
          author: "Building Administrator",
          role: "building_admin",
          text:
            complaint.status === "closed"
              ? "This has been resolved. Thanks for your patience — let us know if it comes back."
              : "We're on it — a technician has been scheduled to take a look this week.",
          timestamp: addDays(complaint.date, 2),
        },
      ],
    },
  ];
}

function buildScoreSection<K extends string>(
  rand: () => number,
  means: Record<K, number>,
  weights: Record<K, number>,
  mult: number,
  radiusMeters: number,
  lowConfidenceBuckets: K[] = [],
  prefix = "c"
): ScoreSection<Record<K, number>> {
  const { counts, weightedTotal } = buildCounts(rand, means, weights, mult);
  const score = scoreFromWeightedTotal(weightedTotal);
  const allZero = Object.values<number>(counts).every((n) => n === 0);

  const bucketScores = {} as Record<K, number>;
  for (const cat of Object.keys(means) as K[]) {
    bucketScores[cat] = scoreFromWeightedTotal(counts[cat] * weights[cat]);
  }

  return {
    score,
    band: bandForScore(score),
    counts,
    radiusMeters,
    confidence: allZero ? "low" : "normal",
    confidenceReason: allZero ? "no_complaints_found" : null,
    // Mock data is the offline fallback, so there is no AI text to offer. The
    // empty string with source "template" is what makes the report fall back to
    // the client-side explainVerdict copy instead of showing a blank line.
    explanation: "",
    explanationSource: "template",
    bucketScores,
    bucketConfidence: Object.fromEntries(
      lowConfidenceBuckets.map((cat) => [cat, "low" as const])
    ) as Partial<Record<K, "low">>,
    recentComplaints: buildComplaints(counts as Record<string, number>, rand, prefix),
  };
}

function buildReportForSeed(seedAddress: SeedAddress): ReportResponse {
  const buildingRand = mulberry32(hashString(seedAddress.description + "building"));
  const buildingHealth = buildScoreSection(
    buildingRand,
    BUILDING_CATEGORY_MEAN,
    BUILDING_CATEGORY_WEIGHT,
    flavorMultiplier(seedAddress.flavor, "building"),
    25,
    [],
    "b"
  );

  const blockRand = mulberry32(hashString(seedAddress.description + "block"));
  const blockQuality = buildScoreSection(
    blockRand,
    BLOCK_CATEGORY_MEAN,
    BLOCK_CATEGORY_WEIGHT,
    flavorMultiplier(seedAddress.flavor, "block"),
    350,
    BLOCK_LOW_CONFIDENCE_BUCKETS,
    "k"
  );

  return {
    address: null,
    buildingHealth,
    blockQuality,
    meta: {
      windowMonths: 24,
      baselineVersion: "v1",
      baselineSource: "mock",
      coord: { lat: seedAddress.lat, lng: seedAddress.lng },
      cache: { building: "miss", block: "miss" },
      mock: true,
    },
  };
}

export function buildReport(query: string): ReportResponse {
  return buildReportForSeed(resolveAddress(query));
}

export interface FeaturedReport {
  address: string;
  borough: string;
  data: ReportResponse;
}

// The live API never returns an address (it doesn't geocode), so callers
// that need one for display (e.g. the homepage's featured cards) pull it
// from the same seed data used to generate the mock scores.
export function buildFeaturedReport(query: string): FeaturedReport {
  const seedAddress = resolveAddress(query);
  return {
    address: seedAddress.description,
    borough: seedAddress.borough,
    data: buildReportForSeed(seedAddress),
  };
}
