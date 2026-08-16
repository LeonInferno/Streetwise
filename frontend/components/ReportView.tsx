"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchExplanation, fetchNearbyComplaints, fetchReport, getLatLng } from "@/lib/api";
import { AddressSearch } from "./AddressSearch";
import { MapPanel } from "./MapPanel";
import { ReportSkeleton } from "./ReportSkeleton";
import { ScorePanelCard } from "./ScorePanelCard";
import { VerdictBanner, type AiExplanationState } from "./VerdictBanner";
import { BuildingIcon, BlockIcon, ChevronRightIcon } from "./icons";
import type { ReportResponse } from "@/lib/types";

/** The two tiers in display order, paired with the key /api/explanation wants. */
function tiersOf(data: ReportResponse) {
  return [
    { key: "building" as const, label: "Building Health", section: data.buildingHealth },
    { key: "block" as const, label: "Block Quality", section: data.blockQuality },
  ];
}

interface LoadedReport {
  address: string;
  lat: number;
  lng: number;
  data: ReportResponse;
}

export function ReportView() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address") ?? "";
  const placeId = searchParams.get("placeId") ?? undefined;
  const [result, setResult] = useState<LoadedReport | null>(null);
  const [errorState, setErrorState] = useState<{ address: string; message: string } | null>(null);
  // Only the *fetched* result lives in state; the rest is derived below. One
  // entry per tier, in tiersOf() order, and keyed by address so a stale result
  // cannot leak onto the next report.
  const [fetchedAi, setFetchedAi] = useState<{
    address: string;
    texts: (string | null)[];
  } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const coords = await getLatLng(address, placeId);
        if (!coords) throw new Error("Couldn't locate that address.");
        const data = await fetchReport(coords.lat, coords.lng);

        // Fetch recent complaint points for both panels in parallel so the
        // "Recent Complaints" section and comments feature are populated.
        const [buildingComplaints, blockComplaints] = await Promise.all([
          fetchNearbyComplaints(coords.lat, coords.lng, data.buildingHealth.radiusMeters),
          fetchNearbyComplaints(coords.lat, coords.lng, data.blockQuality.radiusMeters),
        ]);
        data.buildingHealth.recentComplaints = buildingComplaints;
        data.blockQuality.recentComplaints = blockComplaints;

        if (cancelled) return;
        setResult({ address, lat: coords.lat, lng: coords.lng, data });
      } catch (e) {
        if (cancelled) return;
        setErrorState({ address, message: e instanceof Error ? e.message : "Something went wrong" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, placeId]);

  // The AI explanation is the slow path, deliberately kept off the score
  // request: /api/score returns template text immediately, and each tier only
  // upgrades to "ai" once /api/explanation has been called for it. Fired here,
  // after the report is on screen, so the banner can swap its text in place.
  useEffect(() => {
    if (!result) return;
    const { lat, lng, data, address: forAddress } = result;
    const tiers = tiersOf(data);

    // A tier already marked "ai" was served from the backend's cache, so asking
    // again would just pay the model latency for text we already hold.
    if (tiers.every((t) => t.section.explanationSource === "ai")) return;

    let cancelled = false;
    Promise.all(
      tiers.map((t) =>
        t.section.explanationSource === "ai"
          ? Promise.resolve<string | null>(t.section.explanation)
          : fetchExplanation(lat, lng, t.key)
      )
    ).then((texts) => {
      if (cancelled) return;
      // Kept per tier (null where the AI had nothing) rather than merged, so the
      // banner can label each line and fall back per tier.
      setFetchedAi({ address: forAddress, texts });
    });

    return () => {
      cancelled = true;
    };
  }, [result]);

  const report = result?.address === address ? result : null;
  const error = errorState?.address === address ? errorState.message : null;

  const aiExplanation = useMemo<AiExplanationState>(() => {
    if (!report) return { loading: false, tiers: [] };
    const tiers = tiersOf(report.data);
    const allCached = tiers.every((t) => t.section.explanationSource === "ai");
    const fetched = fetchedAi?.address === report.address ? fetchedAi.texts : null;
    // Fully cached upstream resolves immediately, with no "Reasoning..." flash.
    if (!allCached && !fetched) return { loading: true, tiers: [] };

    return {
      loading: false,
      tiers: tiers
        .map((t, i) => {
          const ai =
            fetched?.[i] ?? (t.section.explanationSource === "ai" ? t.section.explanation : null);
          // Falling back to the tier's own template text rather than dropping
          // the line: a tier with zero complaints legitimately has nothing for
          // the model to describe (see explain.js), and "no complaints were
          // filed" is the accurate thing to say, not an absence worth hiding.
          return {
            label: t.label,
            text: ai ?? t.section.explanation,
            source: ai ? ("ai" as const) : ("template" as const),
          };
        })
        .filter((t) => t.text.trim()),
    };
  }, [report, fetchedAi]);

  if (!address) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p className="text-[color:var(--text-secondary)]">
          Enter an address to see its report.
        </p>
        <div className="mt-4">
          <AddressSearch size="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center sm:px-6">
        <p style={{ color: "var(--status-critical)" }}>{error}</p>
        <Link href="/" className="mt-3 inline-block text-sm underline text-[color:var(--text-secondary)]">
          Back to search
        </Link>
      </div>
    );
  }

  if (!report) {
    return <ReportSkeleton />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <nav className="mb-5 flex items-center gap-1 text-xs text-[color:var(--text-muted)]">
        <Link href="/" className="hover:text-[color:var(--text-primary)]">
          Search
        </Link>
        <ChevronRightIcon className="h-3 w-3" />
        <span className="text-[color:var(--text-secondary)]">Report</span>
      </nav>

      <div className="mb-6 flex items-center gap-3">
        <div className="min-w-0 flex-1 max-w-md">
          <AddressSearch key={report.address} size="sm" initialValue={report.address} />
        </div>
        <Link
          href={`/compare?a=${encodeURIComponent(report.address)}`}
          className="shrink-0 rounded-full bg-[color:var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[color:var(--brand-strong)]"
        >
          Compare →
        </Link>
      </div>

      <VerdictBanner
        building={report.data.buildingHealth}
        block={report.data.blockQuality}
        address={report.address}
        windowMonths={report.data.meta.windowMonths}
        aiExplanation={aiExplanation}
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ScorePanelCard
          icon={<BuildingIcon className="h-4.5 w-4.5" />}
          title="Building Health"
          panel={report.data.buildingHealth}
          colorVar="--series-building"
          description="Complaints tied to this building"
        />
        <ScorePanelCard
          icon={<BlockIcon className="h-4.5 w-4.5" />}
          title="Block Quality"
          panel={report.data.blockQuality}
          colorVar="--series-block"
          description="Complaints on the surrounding block"
        />
      </div>

      <div className="mt-4">
        <MapPanel
          centerLat={report.lat}
          centerLng={report.lng}
          buildingRadiusMeters={report.data.buildingHealth.radiusMeters}
          blockRadiusMeters={report.data.blockQuality.radiusMeters}
        />
      </div>

    </div>
  );
}
