"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchNearbyComplaints, fetchReport, getLatLng } from "@/lib/api";
import { AddressSearch } from "./AddressSearch";
import { MapPanel } from "./MapPanel";
import { ReportSkeleton } from "./ReportSkeleton";
import { ScorePanelCard } from "./ScorePanelCard";
import { VerdictBanner } from "./VerdictBanner";
import { BuildingIcon, BlockIcon, ChevronRightIcon } from "./icons";
import type { ReportResponse } from "@/lib/types";

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

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const coords = await getLatLng(address, placeId);
        if (!coords) throw new Error("Couldn't locate that address.");
        const data = await fetchReport(coords.lat, coords.lng, address);

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

  const report = result?.address === address ? result : null;
  const error = errorState?.address === address ? errorState.message : null;

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
