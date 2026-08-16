export type ScoreBand = "good" | "fair" | "poor";
export type Confidence = "normal" | "low";

export type ComplaintStatus = "open" | "in-progress" | "closed";

export interface Complaint {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
  status: ComplaintStatus;
}

export type BuildingCounts = {
  heatHotWater: number;
  unsanitaryCondition: number;
  plumbing: number;
};

export type BlockCounts = {
  noise: number;
  parking: number;
  streetCondition: number;
};

export type ExplanationSource = "ai" | "template";

export interface ScoreSection<TCounts extends Record<string, number>> {
  score: number;
  band: ScoreBand;
  counts: TCounts;
  radiusMeters: number;
  // /api/score always returns the deterministic template text so it can stay
  // fast; a tier only reports "ai" once GET /api/explanation has been called
  // for it and the result cached server-side.
  explanation: string;
  explanationSource: ExplanationSource;
  confidence: Confidence;
  confidenceReason: string | null;
  bucketScores: Partial<Record<keyof TCounts, number>>;
  bucketConfidence: Partial<Record<keyof TCounts, "low">>;
  recentComplaints?: Complaint[];
}

export interface ReportMeta {
  windowMonths: number;
  baselineVersion: string;
  baselineSource: "mongo" | "file" | "mock";
  coord: { lat: number; lng: number };
  cache: { building: "hit" | "miss"; block: "hit" | "miss" };
  mock?: boolean;
}

export interface ReportResponse {
  address: string | null;
  buildingHealth: ScoreSection<BuildingCounts>;
  blockQuality: ScoreSection<BlockCounts>;
  meta: ReportMeta;
}

export interface AutocompleteSuggestion {
  id: string;
  description: string;
}

export interface TrendPoint {
  month: string; // "2026-08"
  count: number;
}

export interface TimelineEvent {
  status: ComplaintStatus;
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface ComplaintTimeline {
  complaintId: string;
  events: TimelineEvent[];
}

export type CommentRole = "resident" | "building_admin";

export interface Comment {
  id: string;
  author: string;
  role: CommentRole;
  text: string;
  timestamp: string; // YYYY-MM-DD
  replies?: Comment[];
}
