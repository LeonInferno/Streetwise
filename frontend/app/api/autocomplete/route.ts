import { NextRequest, NextResponse } from "next/server";
import { findSuggestions } from "@/lib/mock-data";

// Tight bounding box around the outer edges of the five boroughs (Staten
// Island's western tip to the Bronx's northern tip, Staten Island's western
// shore to eastern Queens). Used as a hard locationRestriction, not just a
// bias, so results outside NYC don't show up at all.
const NYC_BOUNDS = {
  low: { latitude: 40.4957, longitude: -74.2557 }, // SW: Tottenville, Staten Island
  high: { latitude: 40.9153, longitude: -73.7002 }, // NE: edge of the Bronx / eastern Queens
};

// Boroughs share the Hudson/harbor waterfront with NJ, so a lat/lng box
// alone still lets a sliver of Jersey City/Bayonne through near Staten
// Island. Google's predictions always end in ", <state abbr>, USA", so this
// is a cheap, reliable second filter — no extra API call needed.
function isNewYorkState(description: string): boolean {
  return /,\s*NY,/.test(description);
}

// Google Places Autocomplete (New) API for real NYC address suggestions.
// Falls back to local mock suggestions if no API key is configured, so the
// search bar still works without Google Maps set up.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json({ suggestions: [] });
  }

  const mockFallback = () =>
    NextResponse.json({
      suggestions: findSuggestions(q).map((s) => ({ id: s.id, description: s.description })),
    });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return mockFallback();
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["us"],
        locationRestriction: {
          rectangle: NYC_BOUNDS,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google Places API error:", response.status, errorText);
      return mockFallback();
    }

    const data = await response.json();
    const suggestions = (data.suggestions ?? [])
      .map((s: any) => ({
        id: s.placePrediction?.placeId ?? "",
        description: s.placePrediction?.text?.text ?? "",
      }))
      .filter((s: { id: string; description: string }) => s.description && isNewYorkState(s.description))
      .slice(0, 6);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Autocomplete error:", error);
    return mockFallback();
  }
}
