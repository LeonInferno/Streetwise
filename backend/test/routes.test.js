import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { startTestServer } from "./helpers/testServer.js";
import {
  RADIUS_TIERS,
  BUCKET_NAMES,
  COMPLAINTS_DEFAULT_LIMIT,
  CONFIDENCE,
  CONFIDENCE_REASONS,
} from "../src/config/constants.js";

// End-to-end over real HTTP against the frozen API contract in CLAUDE.md.
// If a test in this file has to change, the contract changed — which needs
// team sign-off, not a quiet edit.
//
// Socrata is FAKED, everything else is real: the routes, the scorer, and the
// committed baseline (no MONGODB_URI here, so the file fallback is what loads).
// That is deliberate — this file's job is to prove the wiring produces the
// contract shape from real code, not to re-test the client.

const { countsSpy, complaintsSpy, aiSpy } = vi.hoisted(() => ({
  countsSpy: vi.fn(),
  complaintsSpy: vi.fn(),
  aiSpy: vi.fn(),
}));

vi.mock("../src/providers/socrata.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchCountsForTier: countsSpy,
    fetchComplaints: complaintsSpy,
  };
});

// The AI adapter is mocked too. Without this the explanation route reaches a
// real Ollama server whenever the developer happens to have one running — the
// suite would pass or fail depending on the machine, and would be making
// network calls the rest of the suite is careful to avoid.
vi.mock("../src/providers/ai/index.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateExplanation: aiSpy };
});

// Auth is stubbed out here, for the same reason Socrata is: this file's subject
// is the CONTRACT SHAPE, and a real Supabase round trip on every request would
// make these tests dependent on network + a live project. The data routes use
// optionalAuth (see app.js), which this stub mirrors: it just attaches a fake
// authenticated caller and always calls next(), same as a valid token would.
vi.mock("../src/middleware/requireAuth.js", () => ({
  optionalAuth: (req, res, next) => {
    req.auth = { userId: "test-user", email: "tester@example.com", role: "tenant" };
    next();
  },
}));

const { SocrataError } = await import("../src/providers/socrata.js");

const COUNTS = {
  building: { heatHotWater: 12, unsanitaryCondition: 3, plumbing: 1 },
  block: { noise: 1653, parking: 402, streetCondition: 88 },
};

function complaintRow(index) {
  return {
    type: "Noise - Residential",
    lat: 40.7484 + index * 1e-5,
    lng: -73.9857,
    created_date: "2026-01-01T00:00:00.000",
    status: "Closed",
  };
}

let server;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  countsSpy.mockReset();
  complaintsSpy.mockReset();
  aiSpy.mockReset();
  aiSpy.mockResolvedValue("A generated sentence about this location.");
  countsSpy.mockImplementation(async (lat, lng, tier) => COUNTS[tier]);
  complaintsSpy.mockImplementation(async (lat, lng, radius, { limit }) =>
    Array.from({ length: Math.min(25, limit) }, (_, i) => complaintRow(i))
  );
});

describe("GET /health", () => {
  it("answers 200 for deploy checks and keep-warm pings", async () => {
    const { status, body } = await server.request("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.uptimeSeconds).toBeTypeOf("number");
  });
});

describe("POST /api/score", () => {
  it("returns the frozen report shape", async () => {
    const { status, body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });

    expect(status).toBe(200);
    expect(body.address).toBeNull();

    expect(body.buildingHealth.radiusMeters).toBe(
      RADIUS_TIERS.building.radiusMeters
    );
    expect(Object.keys(body.buildingHealth.counts).sort()).toEqual(
      [...BUCKET_NAMES.building].sort()
    );
    expect(body.blockQuality.radiusMeters).toBe(RADIUS_TIERS.block.radiusMeters);
    expect(Object.keys(body.blockQuality.counts).sort()).toEqual(
      [...BUCKET_NAMES.block].sort()
    );

    for (const sub of [body.buildingHealth, body.blockQuality]) {
      expect(sub.score).toBeGreaterThanOrEqual(0);
      expect(sub.score).toBeLessThanOrEqual(100);
      expect(["good", "fair", "poor"]).toContain(sub.band);
    }
  });

  it("serves the counts the provider returned, summed per bucket", async () => {
    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });
    expect(body.buildingHealth.counts).toEqual(COUNTS.building);
    expect(body.blockQuality.counts).toEqual(COUNTS.block);
  });

  it("costs exactly two upstream calls — one per radius tier", async () => {
    // CLAUDE.md budgets two HTTP calls per uncached address, not six or twelve.
    await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7101, lng: -74.0121 },
    });
    expect(countsSpy).toHaveBeenCalledTimes(2);
    expect(countsSpy.mock.calls.map((call) => call[2]).sort()).toEqual([
      "block",
      "building",
    ]);
  });

  it("carries the agreed additive fields", async () => {
    // Additive extensions agreed in handoff.md — a frontend that ignores them
    // keeps working, but they must be present for one that does not.
    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });

    for (const sub of [body.buildingHealth, body.blockQuality]) {
      expect([CONFIDENCE.normal, CONFIDENCE.low]).toContain(sub.confidence);
      expect(Object.keys(sub.bucketScores).sort()).toEqual(
        Object.keys(sub.counts).sort()
      );
    }
    // streetCondition is the one bucket flagged weak; building has none.
    expect(body.blockQuality.bucketConfidence).toEqual({
      streetCondition: CONFIDENCE.low,
    });
    expect(body.buildingHealth.bucketConfidence).toEqual({});
    expect(body.meta.baselineVersion).toBeTypeOf("string");
  });

  it("flags a building with no complaints as low confidence", async () => {
    // The score is honest to the data (100), the doubt rides alongside it.
    countsSpy.mockImplementation(async (lat, lng, tier) =>
      tier === "building"
        ? { heatHotWater: 0, unsanitaryCondition: 0, plumbing: 0 }
        : COUNTS.block
    );

    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });
    expect(body.buildingHealth.score).toBe(100);
    expect(body.buildingHealth.confidence).toBe(CONFIDENCE.low);
    expect(body.buildingHealth.confidenceReason).toBe(
      CONFIDENCE_REASONS.noComplaintsFound
    );
    expect(body.blockQuality.confidence).toBe(CONFIDENCE.normal);
  });

  it("is stable across repeat calls for the same coordinate", async () => {
    const first = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.6944, lng: -73.9213 },
    });
    const second = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.6944, lng: -73.9213 },
    });
    expect(first.body).toEqual(second.body);
  });

  it("503s rather than 500s when the upstream is down", async () => {
    // Socrata went fully dark for hours during M3. The frontend can say "NYC's
    // data service is unavailable" off a 503; it can say nothing off a 500.
    countsSpy.mockRejectedValue(new SocrataError("socrata 503: down", { status: 503 }));

    const { status, body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });
    expect(status).toBe(503);
    expect(body.error).toBe("upstream_unavailable");
  });

  it.each([
    ["missing body", {}],
    ["missing lng", { lat: 40.7484 }],
    ["non-numeric lat", { lat: "somewhere", lng: -73.9857 }],
    ["outside NYC", { lat: 34.05, lng: -118.24 }],
    ["swapped lat/lng", { lat: -73.9857, lng: 40.7484 }],
  ])("400s on %s", async (_label, payload) => {
    const { status, body } = await server.request("/api/score", {
      method: "POST",
      body: payload,
    });
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf("string");
    expect(body.details).toBeTypeOf("string");
  });

  it("400s rather than 500s when no body is sent at all", async () => {
    const res = await fetch(`${server.baseUrl}/api/score`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("rejects bad input before spending an upstream call", async () => {
    await server.request("/api/score", {
      method: "POST",
      body: { lat: 34.05, lng: -118.24 },
    });
    expect(countsSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/complaints", () => {
  it("returns an array of points in the contract shape", async () => {
    const { status, body } = await server.request(
      "/api/complaints?lat=40.7484&lng=-73.9857&radius=350"
    );
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(Object.keys(body[0]).sort()).toEqual([
      "created_date",
      "lat",
      "lng",
      "status",
      "type",
    ]);
  });

  it("defaults to the block radius when none is given", async () => {
    await server.request("/api/complaints?lat=40.7484&lng=-73.9857");
    expect(complaintsSpy).toHaveBeenCalledWith(
      40.7484,
      -73.9857,
      RADIUS_TIERS.block.radiusMeters,
      expect.objectContaining({ limit: COMPLAINTS_DEFAULT_LIMIT })
    );
  });

  it("reports truncation in headers when the row cap is hit", async () => {
    // A dense block returns only its most recent months at the cap. The array
    // shape is frozen, so the warning rides in a header instead — a frontend
    // that counts from this endpoint would disagree with the score.
    complaintsSpy.mockImplementation(async (lat, lng, radius, { limit }) =>
      Array.from({ length: limit }, (_, i) => complaintRow(i))
    );

    const { headers, body } = await server.request(
      "/api/complaints?lat=40.6944&lng=-73.9213&limit=50"
    );
    expect(body).toHaveLength(50);
    expect(headers.get("x-complaints-truncated")).toBe("true");
    expect(headers.get("x-complaints-limit")).toBe("50");
  });

  it("says so when the result is complete", async () => {
    const { headers } = await server.request(
      "/api/complaints?lat=40.7484&lng=-73.9857"
    );
    expect(headers.get("x-complaints-truncated")).toBe("false");
  });

  it("exposes the truncation headers to cross-origin JS", async () => {
    // Without Access-Control-Expose-Headers the browser receives these headers
    // and refuses to let the frontend read them.
    const { headers } = await server.request(
      "/api/complaints?lat=40.7484&lng=-73.9857"
    );
    const exposed = headers.get("access-control-expose-headers") ?? "";
    expect(exposed.toLowerCase()).toContain("x-complaints-truncated");
  });

  it.each([
    ["missing coords", "/api/complaints"],
    ["out of bounds", "/api/complaints?lat=34.05&lng=-118.24"],
    ["zero radius", "/api/complaints?lat=40.7484&lng=-73.9857&radius=0"],
    ["oversized radius", "/api/complaints?lat=40.7484&lng=-73.9857&radius=99999"],
    ["oversized limit", "/api/complaints?lat=40.7484&lng=-73.9857&limit=999999"],
    ["fractional limit", "/api/complaints?lat=40.7484&lng=-73.9857&limit=1.5"],
  ])("400s on %s", async (_label, path) => {
    const { status, body } = await server.request(path);
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf("string");
  });
});

describe("app wiring", () => {
  it("404s unknown paths as JSON, not an HTML stack page", async () => {
    const { status, body } = await server.request("/api/nope");
    expect(status).toBe(404);
    expect(body).toEqual({ error: "not_found" });
  });

  it("sets permissive CORS headers for the cross-origin frontend", async () => {
    const { headers } = await server.request("/health");
    expect(headers.get("access-control-allow-origin")).toBe("*");
  });

  it("answers CORS preflight with 204", async () => {
    const res = await fetch(`${server.baseUrl}/api/score`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });
});

// --- AI explanation layer ----------------------------------------------------

describe("explanations on POST /api/score", () => {
  it("always carries an explanation and an honest source label", async () => {
    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });

    for (const sub of [body.buildingHealth, body.blockQuality]) {
      expect(sub.explanation).toBeTypeOf("string");
      expect(sub.explanation.length).toBeGreaterThan(20);
      expect(["ai", "template"]).toContain(sub.explanationSource);
    }
  });

  it("serves the template on a cache miss — the score never waits on an AI call", async () => {
    // No Mongo in this suite, so nothing is ever cached: every response here is
    // the fast path, which is exactly the path that must not touch the AI.
    const started = Date.now();
    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.6944, lng: -73.9213 },
    });

    expect(body.buildingHealth.explanationSource).toBe("template");
    expect(body.blockQuality.explanationSource).toBe("template");
    // A real AI call is seconds; this asserts we did not make one.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("explains the tier it is attached to", async () => {
    const { body } = await server.request("/api/score", {
      method: "POST",
      body: { lat: 40.7484, lng: -73.9857 },
    });
    expect(body.blockQuality.explanation).toMatch(/block/i);
    expect(body.buildingHealth.explanation).toMatch(/building|address/i);
  });
});

describe("GET /api/explanation", () => {
  it("returns the AI explanation when the adapter succeeds", async () => {
    const { status, body } = await server.request(
      "/api/explanation?lat=40.7484&lng=-73.9857&tier=block"
    );
    expect(status).toBe(200);
    expect(body.explanation).toBe("A generated sentence about this location.");
    expect(body.explanationSource).toBe("ai");
    expect(aiSpy).toHaveBeenCalledTimes(1);
  });

  it("passes only the four contract fields to the adapter", async () => {
    await server.request("/api/explanation?lat=40.7484&lng=-73.9857&tier=block");
    expect(Object.keys(aiSpy.mock.calls[0][0]).sort()).toEqual([
      "band",
      "counts",
      "label",
      "radiusLabel",
    ]);
  });

  it("only fetches the tier it was asked about", async () => {
    // The slow path must not pay for the tier nobody asked for.
    await server.request("/api/explanation?lat=40.7101&lng=-74.0121&tier=building");
    expect(countsSpy).toHaveBeenCalledTimes(1);
    expect(countsSpy.mock.calls[0][2]).toBe("building");
  });

  it("200s with the template when the AI is unavailable, never an error", async () => {
    // CLAUDE.md: the demo must never show a broken state for this feature.
    aiSpy.mockRejectedValue(new Error("ollama unreachable"));
    const { status, body } = await server.request(
      "/api/explanation?lat=40.7484&lng=-73.9857&tier=block"
    );
    expect(status).toBe(200);
    expect(body.explanationSource).toBe("template");
    expect(body.explanation.length).toBeGreaterThan(20);
  });

  it("does not leak the internal failure reason to the client", async () => {
    aiSpy.mockRejectedValue(new Error("ECONNREFUSED 127.0.0.1:11434"));
    const { body } = await server.request(
      "/api/explanation?lat=40.7484&lng=-73.9857&tier=block"
    );
    expect(Object.keys(body).sort()).toEqual(["explanation", "explanationSource"]);
  });

  it("skips the AI when there is nothing to explain", async () => {
    countsSpy.mockImplementation(async () => ({
      heatHotWater: 0,
      unsanitaryCondition: 0,
      plumbing: 0,
    }));
    const { body } = await server.request(
      "/api/explanation?lat=40.7484&lng=-73.9857&tier=building"
    );
    expect(aiSpy).not.toHaveBeenCalled();
    expect(body.explanationSource).toBe("template");
  });

  it.each([
    ["missing tier", "/api/explanation?lat=40.7484&lng=-73.9857"],
    ["invalid tier", "/api/explanation?lat=40.7484&lng=-73.9857&tier=roof"],
    ["missing coords", "/api/explanation?tier=block"],
    ["out of bounds", "/api/explanation?lat=34.05&lng=-118.24&tier=block"],
  ])("400s on %s", async (_label, path) => {
    const { status, body } = await server.request(path);
    expect(status).toBe(400);
    expect(body.error).toBeTypeOf("string");
  });

  it("503s when the upstream counts cannot be fetched", async () => {
    countsSpy.mockRejectedValue(new SocrataError("socrata 503: down", { status: 503 }));
    const { status, body } = await server.request(
      "/api/explanation?lat=40.7484&lng=-73.9857&tier=block"
    );
    expect(status).toBe(503);
    expect(body.error).toBe("upstream_unavailable");
  });
});
