import Image from "next/image";
import Link from "next/link";
import { AddressSearch } from "@/components/AddressSearch";
import { FeaturedCarousel } from "@/components/FeaturedCarousel";
import { BuildingIcon, BlockIcon, MapPinIcon } from "@/components/icons";
import { buildFeaturedReport } from "@/lib/mock-data";

const FEATURED_ADDRESSES = [
  "456 Park Ave, New York, NY 10022",
  "123 Ludlow St, New York, NY 10002",
  "88 Bedford Ave, Brooklyn, NY 11249",
  "37-11 74th St, Jackson Heights, NY 11372",
  "1 Grand Army Plaza, Brooklyn, NY 11238",
  "980 Anderson Ave, Bronx, NY 10452",
];

const EXAMPLE_ADDRESSES = [
  "123 Ludlow St, New York, NY 10002",
  "456 Park Ave, New York, NY 10022",
  "88 Bedford Ave, Brooklyn, NY 11249",
  "37-11 74th St, Jackson Heights, NY 11372",
];

const FEATURES = [
  {
    icon: BuildingIcon,
    title: "Building Health Score",
    body: "Heat/hot water outages, unsanitary conditions, and plumbing failures tied to the specific address — the record nobody reads before signing a lease.",
    colorVar: "--series-building",
  },
  {
    icon: BlockIcon,
    title: "Block Quality Score",
    body: "Noise and illegal parking are the two highest-volume 311 categories citywide. See what the block is actually like before you move in.",
    colorVar: "--series-block",
  },
  {
    icon: MapPinIcon,
    title: "Grounded in public records",
    body: "Every score traces back to NYC 311 Service Requests — no reviews, no rumors, just the complaint history.",
    colorVar: "--status-good",
  },
];

export default function Home() {
  const featuredReports = FEATURED_ADDRESSES.map(buildFeaturedReport);

  return (
    <main className="flex-1">
      <section className="relative isolate overflow-hidden">
        <div
          className="absolute inset-0 -z-10 bg-cover bg-center"
          style={{ backgroundImage: "url(/hero-city.jpg)" }}
        />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,18,32,0.62) 0%, rgba(11,18,32,0.42) 45%, rgba(11,18,32,0.66) 100%)",
          }}
        />
        <div className="mx-auto max-w-3xl px-4 pt-20 pb-24 text-center sm:px-6 sm:pt-28 sm:pb-28">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
            Built on NYC 311 public data
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-[2.6rem] font-bold leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] sm:text-6xl">
            Know before you sign the lease.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
            Search any NYC address for a Building Health Score and a Block Quality
            Score — landlord complaint history and neighborhood livability, in one
            report.
          </p>
          <div className="mx-auto mt-8 max-w-xl">
            <AddressSearch autoFocus />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-white/75">Try:</span>
            {EXAMPLE_ADDRESSES.map((a) => (
              <Link
                key={a}
                href={`/report?address=${encodeURIComponent(a)}`}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1 font-medium text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                {a.split(",")[0]}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          How it works
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {[
            { step: "1", title: "Enter an address", body: "Type any NYC address — we geocode it and pull nearby 311 history." },
            { step: "2", title: "Two radii, two scores", body: "A tight radius scores the building itself; a wider radius scores the block." },
            { step: "3", title: "Decide with confidence", body: "See the verdict, the complaint breakdown, and the trend before you tour." },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                style={{ background: "var(--brand-tint)", color: "var(--brand)" }}
              >
                {s.step}
              </div>
              <h3 className="mt-3 font-medium text-[color:var(--text-primary)]">{s.title}</h3>
              <p className="mt-1 text-sm text-[color:var(--text-secondary)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-[var(--radius-lg)] bg-[color:var(--surface-1)] p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
            style={{ boxShadow: "var(--shadow-sm)", border: "1px solid var(--border-hairline)" }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)]"
              style={{ color: `var(${f.colorVar})`, background: `color-mix(in srgb, var(${f.colorVar}) 12%, transparent)` }}
            >
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold text-[color:var(--text-primary)]">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--text-secondary)]">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="py-10">
        <div className="mx-auto mb-5 flex max-w-5xl items-baseline justify-between px-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--text-primary)]">
              Featured NYC addresses
            </h2>
            <p className="mt-0.5 text-sm text-[color:var(--text-muted)]">
              Sample reports — click any to see the full breakdown.
            </p>
          </div>
          <Link
            href="/compare"
            className="text-sm font-medium text-[color:var(--brand)] transition-colors hover:text-[color:var(--brand-strong)]"
          >
            Compare addresses →
          </Link>
        </div>
        <div className="px-4 sm:px-6">
          <FeaturedCarousel reports={featuredReports} />
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-4 py-10 text-center text-xs text-[color:var(--text-muted)] sm:px-6">
        <Image
          src="/logo-full.png"
          alt="Streetwise — Rent smart in NYC"
          width={907}
          height={301}
          className="mx-auto mb-6 h-auto w-[280px]"
        />
        <p>
          Data source: NYC 311 Service Requests (Socrata, dataset erm2-nwe9). This
          preview uses generated sample data — live backend integration is next.
        </p>
        <p className="mt-1.5">
          Hero photo by{" "}
          <a
            href="https://commons.wikimedia.org/wiki/User:King_of_Hearts"
            className="underline underline-offset-2 hover:text-[color:var(--text-secondary)]"
          >
            King of Hearts
          </a>
          , licensed{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0"
            className="underline underline-offset-2 hover:text-[color:var(--text-secondary)]"
          >
            CC BY-SA 4.0
          </a>
          , via Wikimedia Commons.
        </p>
      </footer>
    </main>
  );
}
