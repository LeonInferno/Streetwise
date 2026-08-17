import { getAccessToken, triggerAuthError } from "./auth";
import type { AutocompleteSuggestion, Complaint, ComplaintStatus, ReportResponse } from "./types";

// Geocoding (via /api/geocode, Google under the hood) can return zero
// results whenever a unit designator — apt/unit/suite/floor/room/# — is
// present, even though the building itself geocodes fine. Since scoring
// only needs the building's coordinates, strip these before falling back
// to a second lookup.
function stripUnit(address: string): string {
  return address
    .replace(/[,\s]*#\s*[\w-]+/g, "")
    .replace(
      /[,\s]*\b(apt|apartment|unit|suite|ste|fl|floor|rm|room|ph|penthouse|no)\.?\s*[\w-]+/gi,
      ""
    )
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`/api/geocode?address=${encodeURIComponent(query)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (typeof data.lat !== "number" || typeof data.lng !== "number") return null;
  return { lat: data.lat, lng: data.lng };
}

async function geocodeByPlaceId(placeId: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(`/api/geocode?placeId=${encodeURIComponent(placeId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (typeof data.lat !== "number" || typeof data.lng !== "number") return null;
  return { lat: data.lat, lng: data.lng };
}

export async function getLatLng(address: string, placeId?: string): Promise<{ lat: number; lng: number } | null> {
  if (placeId) {
    const result = await geocodeByPlaceId(placeId);
    if (result) return result;
  }

  const trimmed = address.trim();
  const result = await geocode(trimmed);
  if (result) return result;

  const stripped = stripUnit(trimmed);
  if (stripped && stripped !== trimmed) return geocode(stripped);
  return null;
}

function mapStatus(raw: string | undefined): ComplaintStatus {
  const s = (raw ?? "").toLowerCase();
  if (s === "closed") return "closed";
  if (s.includes("progress") || s === "pending") return "in-progress";
  return "open";
}

export async function fetchNearbyComplaints(
  lat: number,
  lng: number,
  radius: number,
  limit = 25
): Promise<Complaint[]> {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/api/complaints?lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`;
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return [];
    const points: Array<{ type: string; lat: number; lng: number; created_date: string; status: string }> =
      await res.json();
    return points.map((p, i) => ({
      id: `${p.type}-${p.created_date}-${i}`,
      label: p.type,
      date: p.created_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
      status: mapStatus(p.status),
    }));
  } catch {
    return [];
  }
}

/**
 * The SLOW path. Only worth calling for a tier whose /api/score response came
 * back with explanationSource "template".
 *
 * Returns null whenever there is nothing to swap in — a network failure, an
 * auth failure, or the endpoint answering 200 with template text because the
 * AI call failed server-side. Callers treat null as "fall back to the
 * client-side copy", so this never throws.
 */
export async function fetchExplanation(
  lat: number,
  lng: number,
  tier: "building" | "block"
): Promise<string | null> {
  const token = await getAccessToken();
  const url = `${API_BASE_URL}/api/explanation?lat=${lat}&lng=${lng}&tier=${tier}`;
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.explanationSource === "ai" && data.explanation ? data.explanation : null;
  } catch {
    return null;
  }
}

export async function fetchSuggestions(
  query: string,
  signal?: AbortSignal
): Promise<AutocompleteSuggestion[]> {
  if (!query.trim()) return [];
  const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`, {
    signal,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.suggestions ?? [];
}

// Falls back to localhost for local dev; the deployed frontend needs
// NEXT_PUBLIC_API_URL set in its environment, since the browser (not a
// server) makes this request and can't reach the developer's machine.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function scoreRequest(lat: number, lng: number, token: string | null): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/score`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ lat, lng }),
  });
}

export async function fetchReport(lat: number, lng: number): Promise<ReportResponse> {
  const token = await getAccessToken();

  let res: Response;
  try {
    res = await scoreRequest(lat, lng, token);
  } catch {
    throw new Error("Couldn't reach the backend — is it running?");
  }

  if (res.status === 401) {
    // supabase-js keeps the access token fresh in the background, so a 401
    // here means the session is genuinely gone (never logged in, signed out
    // elsewhere, or revoked) rather than a routine expiry to retry.
    triggerAuthError();
    throw new Error("Please log in to view reports.");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 503) {
      throw new Error("NYC's data service is unavailable right now — try again shortly.");
    }
    throw new Error(body.details ?? body.error ?? "Failed to load report");
  }

  return res.json();
}
