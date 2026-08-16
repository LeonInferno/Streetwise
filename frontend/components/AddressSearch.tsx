"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSuggestions } from "@/lib/api";
import { SearchIcon, ClockIcon, MapPinIcon } from "./icons";
import type { AutocompleteSuggestion } from "@/lib/types";

const RECENT_KEY = "streetwise.recentSearches";
const MAX_RECENT = 5;

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveRecentSearch(address: string) {
  if (typeof window === "undefined") return;
  const existing = getRecentSearches().filter((a) => a !== address);
  const next = [address, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function AddressSearch({
  size = "lg",
  autoFocus = false,
  placeholder,
  initialValue = "",
  onSelect,
}: {
  size?: "lg" | "sm";
  autoFocus?: boolean;
  placeholder?: string;
  initialValue?: string;
  onSelect?: (address: string, placeId?: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchSuggestions(query, controller.signal)
        .then(setSuggestions)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function go(address: string, placeId?: string) {
    const trimmed = address.trim();
    if (!trimmed) return;
    saveRecentSearch(trimmed);
    setOpen(false);
    setQuery(trimmed);
    if (onSelect) {
      onSelect(trimmed, placeId);
    } else {
      const params = new URLSearchParams({ address: trimmed });
      if (placeId) params.set("placeId", placeId);
      router.push(`/report?${params.toString()}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) {
      if (e.key === "Enter") go(query);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const active = activeIdx >= 0 ? suggestions[activeIdx] : null;
      go(active?.description ?? query, active?.id || undefined);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const inputClasses =
    size === "lg"
      ? "h-14 pl-12 pr-4 text-base"
      : "h-11 pl-10 pr-3 text-sm";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <SearchIcon
          className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] ${
            size === "lg" ? "h-5 w-5" : "h-4 w-4"
          }`}
        />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? "Enter an NYC address, e.g. 123 Ludlow St"}
          className={`w-full rounded-full border bg-[color:var(--surface-1)] text-[color:var(--text-primary)] outline-none transition-shadow focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--series-building)_25%,transparent)] ${inputClasses}`}
          style={{ borderColor: "var(--border-hairline)" }}
        />
      </div>

      {open && (query.trim() || getRecentSearches().length > 0) && (
        <div
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
        >
          {query.trim() ? (
            suggestions.length > 0 ? (
              <ul>
                {suggestions.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(s.description, s.id || undefined)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                      style={{
                        background: i === activeIdx ? "var(--gridline)" : "transparent",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={() => setActiveIdx(i)}
                    >
                      <MapPinIcon className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
                      {s.description}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(query)}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[color:var(--text-primary)]"
              >
                <SearchIcon className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
                Search &ldquo;{query}&rdquo;
              </button>
            )
          ) : (
            getRecentSearches().length > 0 && (
              <ul>
                <li className="px-4 pt-2.5 pb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--text-muted)]">
                  Recent
                </li>
                {getRecentSearches().map((a) => (
                  <li key={a}>
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => go(a)}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-[color:var(--text-primary)] hover:bg-[color:var(--gridline)]"
                    >
                      <ClockIcon className="h-4 w-4 shrink-0 text-[color:var(--text-muted)]" />
                      {a}
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}
