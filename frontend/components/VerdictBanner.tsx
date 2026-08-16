import { BAND_VAR, BAND_VERDICT, explainVerdict, overallBand } from "@/lib/score";
import { StatusBadge } from "./StatusBadge";
import type { BlockCounts, BuildingCounts, ExplanationSource, ScoreSection } from "@/lib/types";

/** One tier's explanation line, labeled so the two are told apart. */
export interface TierExplanation {
  label: string;
  text: string;
  source: ExplanationSource;
}

/**
 * `loading` while the explanations are in flight, `tiers` once they land. An
 * empty `tiers` means there was nothing at all to show, which falls back to the
 * deterministic client-side verdict. Omitted entirely by callers that never
 * request one (the compare view), which keeps that same fallback.
 */
export interface AiExplanationState {
  loading: boolean;
  tiers: TierExplanation[];
}

export function VerdictBanner({
  building,
  block,
  address,
  windowMonths,
  aiExplanation,
}: {
  building: ScoreSection<BuildingCounts>;
  block: ScoreSection<BlockCounts>;
  address: string;
  windowMonths: number;
  aiExplanation?: AiExplanationState;
}) {
  const band = overallBand(building.band, block.band);
  const color = `var(${BAND_VAR[band]})`;
  // Three states, in priority order: still thinking, one labeled line per tier,
  // and — whenever nothing at all came back, or no explanation was ever
  // requested — the deterministic client-side verdict. Never empty, never an
  // error.
  const isReasoning = aiExplanation?.loading ?? false;
  const tiers = aiExplanation?.tiers ?? [];

  return (
    <div
      className="rounded-[var(--radius-lg)] p-6"
      style={{
        boxShadow: "var(--shadow-md)",
        border: "1px solid var(--border-hairline)",
        borderLeft: `3px solid ${color}`,
        background: `color-mix(in srgb, ${color} 5%, var(--surface-1))`,
      }}
    >
      <h1 className="text-xl font-semibold text-[color:var(--text-primary)]">{address}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-2xl font-bold tracking-tight" style={{ color }}>
          {BAND_VERDICT[band]}
        </span>
        <StatusBadge band={band} />
      </div>
      {isReasoning ? (
        <p className="mt-1.5 animate-pulse text-sm text-[color:var(--text-muted)]">Reasoning...</p>
      ) : tiers.length > 0 ? (
        <dl className="mt-3 space-y-2.5">
          {tiers.map((tier) => (
            <div key={tier.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
                {tier.label}
              </dt>
              <dd className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{tier.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1.5 text-sm text-[color:var(--text-muted)]">
          {explainVerdict(building, block, band, windowMonths)}
        </p>
      )}
    </div>
  );
}
