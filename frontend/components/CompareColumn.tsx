"use client";

import { useEffect, useState } from "react";
import { AddressSearch } from "./AddressSearch";
import { MapPanel } from "./MapPanel";
import { ScorePanelCard } from "./ScorePanelCard";
import { VerdictBanner } from "./VerdictBanner";
import { fetchReport, getLatLng } from "@/lib/api";
import { BuildingIcon, BlockIcon, SpinnerIcon } from "./icons";
import type { ReportResponse } from "@/lib/types";

interface LoadedReport {
  address: string;
  lat: number;
  lng: number;
  data: ReportResponse;
}

export function CompareColumn({
  label,
  initialAddress,
  onAddressChange,
}: {
  label: string;
  initialAddress: string;
  onAddressChange: (address: string, placeId?: string) => void;
}) {
  const [result, setResult] = useState<LoadedReport | null>(null);
  const [errorState, setErrorState] = useState<{ address: string; message: string } | null>(null);
  const address = initialAddress;

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const coords = await getLatLng(address);
        if (!coords) throw new Error("Couldn't locate that address.");
        const data = await fetchReport(coords.lat, coords.lng);
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
  }, [address]);

  const report = result?.address === address ? result : null;
  const error = errorState?.address === address ? errorState.message : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
          {label}
        </p>
        <AddressSearch
          size="sm"
          initialValue={initialAddress}
          placeholder="Enter an address to compare"
          onSelect={onAddressChange}
        />
      </div>

      {!address && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-[color:var(--text-muted)]" style={{ borderColor: "var(--border-hairline)" }}>
          Choose an address to see its scores.
        </p>
      )}

      {error && <p style={{ color: "var(--status-critical)" }}>{error}</p>}

      {address && !report && !error && (
        <div className="flex h-96 items-center justify-center rounded-xl" style={{ background: "var(--gridline)" }}>
          <SpinnerIcon className="h-8 w-8 text-[color:var(--brand)]" />
        </div>
      )}

      {report && (
        <>
          <VerdictBanner
            building={report.data.buildingHealth}
            block={report.data.blockQuality}
            address={report.address}
            windowMonths={report.data.meta.windowMonths}
          />
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
          <MapPanel
            centerLat={report.lat}
            centerLng={report.lng}
            buildingRadiusMeters={report.data.buildingHealth.radiusMeters}
            blockRadiusMeters={report.data.blockQuality.radiusMeters}
          />
        </>
      )}
    </div>
  );
}
