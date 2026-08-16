"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function Header() {
  const { user, isLoading, logout, openLogin } = useAuth();

  return (
    <header
      className="sticky top-0 z-30 bg-[color:var(--surface-1)]/90 backdrop-blur"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)]"
        >
          <Image
            src="/logo-icon.png"
            alt=""
            width={36}
            height={36}
            className="rounded-[10px]"
            style={{ boxShadow: "var(--shadow-sm)" }}
            priority
          />
          Streetwise
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          <Link
            href="/compare"
            className="font-medium text-[color:var(--text-secondary)] transition-colors hover:text-[color:var(--brand)]"
          >
            Compare
          </Link>

          {!isLoading && (
            user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-[color:var(--text-muted)]">
                  {user.username}
                </span>
                <button
                  onClick={logout}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-[color:var(--gridline)]"
                  style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                onClick={openLogin}
                className="rounded-full px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "var(--brand)" }}
              >
                Log in
              </button>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
