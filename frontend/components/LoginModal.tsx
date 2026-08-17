"use client";

import { useState } from "react";
import type { UserRole } from "@/lib/auth";

interface Props {
  onSuccess: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, role: UserRole) => Promise<{ needsEmailConfirmation: boolean }>;
  onGoogleLogin: () => Promise<void>;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden>
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.68h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.26Z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.9 6.62-2.42l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z" />
      <path fill="#FBBC05" d="M4.41 11.92a5.99 5.99 0 0 1 0-3.84V5.49H1.06a10 10 0 0 0 0 9.02l3.35-2.59Z" />
      <path fill="#EA4335" d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.96 9.96 0 0 0 10 0 10 10 0 0 0 1.06 5.49l3.35 2.6C5.2 5.72 7.4 3.96 10 3.96Z" />
    </svg>
  );
}

export function LoginModal({ onSuccess, onLogin, onRegister, onGoogleLogin }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("tenant");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (tab === "login") {
        await onLogin(email, password);
        onSuccess();
      } else {
        const { needsEmailConfirmation } = await onRegister(email, password, role);
        if (needsEmailConfirmation) {
          setNotice("Check your email to confirm your account, then log in.");
          setTab("login");
        } else {
          onSuccess();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      await onGoogleLogin();
      // Redirects away from the page on success; nothing left to do here.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
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

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-opacity disabled:opacity-60"
          style={{ borderColor: "var(--border-hairline)", color: "var(--text-primary)" }}
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "var(--border-hairline)" }} />
          <span className="text-xs text-[color:var(--text-muted)]">or</span>
          <div className="h-px flex-1" style={{ background: "var(--border-hairline)" }} />
        </div>

        <div className="flex rounded-lg p-1" style={{ background: "var(--gridline)" }}>
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); setNotice(""); }}
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
              Email
            </label>
            <input
              autoFocus
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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

          {notice && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{
              color: "var(--brand)",
              background: "color-mix(in srgb, var(--brand) 10%, transparent)",
            }}>
              {notice}
            </p>
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
