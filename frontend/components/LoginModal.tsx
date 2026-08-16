"use client";

import { useState } from "react";
import type { UserRole } from "@/lib/auth";

interface Props {
  onSuccess: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string, role: UserRole) => Promise<void>;
}

export function LoginModal({ onSuccess, onLogin, onRegister }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("tenant");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (tab === "login") {
        await onLogin(username, password);
      } else {
        await onRegister(username, password, role);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-hairline)" }}
      >
        <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">
          Sign in to Streetwise
        </h2>
        <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
          Access building health and block quality reports.
        </p>

        <div className="mt-4 flex rounded-lg p-1" style={{ background: "var(--gridline)" }}>
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); }}
              className="flex-1 rounded-md py-1.5 text-sm font-medium transition-colors"
              style={{
                background: tab === t ? "var(--surface-1)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: tab === t ? "var(--shadow-sm)" : "none",
              }}
            >
              {t === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]">
              Username
            </label>
            <input
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="your_username"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--border-hairline)",
                background: "var(--surface-0, var(--background))",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--brand)",
              } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]">
              Password
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{
                borderColor: "var(--border-hairline)",
                background: "var(--surface-0, var(--background))",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--brand)",
              } as React.CSSProperties}
            />
          </div>

          {tab === "register" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]">
                I am a…
              </label>
              <div className="flex gap-2">
                {(["tenant", "landlord"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="flex-1 rounded-lg border py-2 text-sm font-medium transition-colors"
                    style={{
                      borderColor: role === r ? "var(--brand)" : "var(--border-hairline)",
                      background: role === r
                        ? "color-mix(in srgb, var(--brand) 10%, transparent)"
                        : "transparent",
                      color: role === r ? "var(--brand)" : "var(--text-secondary)",
                    }}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{
              color: "var(--status-critical)",
              background: "color-mix(in srgb, var(--status-critical) 10%, transparent)",
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ background: "var(--brand)" }}
          >
            {loading ? "Please wait…" : tab === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
