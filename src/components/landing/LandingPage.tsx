import Link from "next/link";
import {
  FEATURES,
  LANDING,
  PRICING_TIERS,
  CONTACT_EMAIL,
  LEGAL_LINKS,
  type FeatureGroup,
} from "@/components/landing/landing-content";

const ACTS = ["Act I", "Act II", "Act III"];
const DEMO_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Demo request — Measure My Costume")}`;

// One reusable, theatrical "playbill" marketing layout, themed entirely with the
// app's Atelier tokens (muslin paper + curtain red + Fraunces). Single variant:
// Measure My Costume.
export function LandingPage() {
  const v = LANDING;
  const groups = v.groupOrder;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-[var(--field-line)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <span className="font-display text-lg font-semibold tracking-tight">{v.brand}</span>
          <div className="flex items-center gap-4 text-sm">
            <a href="#pricing" className="link-muted">Pricing</a>
            <a href={DEMO_HREF} className="link-muted hidden sm:inline">Request a demo</a>
            <Link href="/sign-in" className="font-medium link-muted">Log in</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="lp-grain relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-12%] h-[70vh] w-[130vw] -translate-x-1/2"
          style={{ background: "radial-gradient(closest-side, rgba(140,43,34,0.17), transparent 72%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-12 sm:w-28"
          style={{ background: "linear-gradient(90deg, rgba(140,43,34,0.12), transparent)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 sm:w-28"
          style={{ background: "linear-gradient(270deg, rgba(140,43,34,0.12), transparent)" }}
        />

        <div className="relative mx-auto max-w-4xl px-5 pb-24 pt-20 text-center sm:pt-28">
          <p
            className="lp-rise lbl mb-6 flex items-center justify-center gap-2"
            style={{ animationDelay: "0.05s" }}
          >
            <span aria-hidden>✦</span>
            {v.eyebrow}
            <span aria-hidden>✦</span>
          </p>
          <h1
            className="lp-rise font-display font-semibold tracking-tight"
            style={{ fontSize: "clamp(3rem, 9vw, 6.25rem)", lineHeight: 0.95, animationDelay: "0.12s" }}
          >
            {v.titleLead} <span className="italic text-[var(--red)]">{v.titleAccent}</span>
          </h1>
          <p
            className="lp-rise mx-auto mt-7 max-w-xl text-lg leading-relaxed opacity-80 sm:text-xl"
            style={{ animationDelay: "0.2s" }}
          >
            {v.tagline}
          </p>
          <div
            className="lp-rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "0.28s" }}
          >
            <Link
              href="/sign-up"
              className="btn-primary text-base shadow-[4px_4px_0_0_rgba(42,33,28,0.18)] transition-transform hover:-translate-y-0.5"
            >
              Get started →
            </Link>
            <a href={DEMO_HREF} className="btn-ghost text-base">Request a demo</a>
          </div>
          <p
            className="lp-rise mt-8 text-xs uppercase tracking-[0.18em] text-[var(--muted)]"
            style={{ animationDelay: "0.36s" }}
          >
            Built for school &amp; community theater programs
          </p>
        </div>
      </section>

      {/* The program (features) */}
      <section className="relative mx-auto max-w-6xl px-5 py-20">
        <div className="lp-rise mb-12 text-center" style={{ animationDelay: "0.05s" }}>
          <p className="lbl">The program</p>
          <h2 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            Everything a Production Needs, in One Place
          </h2>
        </div>

        {groups.map((group, gi) => (
          <div key={group} className="mb-14 last:mb-0">
            <div className="mb-6 flex items-center gap-3">
              <span className="lbl shrink-0">
                {ACTS[gi]} · {group}
              </span>
              <span className="h-px flex-1 bg-[var(--field-line)]" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuresOf(group).map((f, i) => (
                <article
                  key={f.id}
                  className="lp-rise surface p-5 transition-transform hover:-translate-y-0.5"
                  style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                >
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#c62828]/10 text-[var(--red)]">
                    <Icon id={f.id} />
                  </span>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed muted">{f.blurb}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative mx-auto max-w-5xl scroll-mt-20 px-5 pb-20">
        <div className="mb-12 text-center">
          <p className="lbl">Pricing</p>
          <h2 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">
            Simple Plans for Every Program
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {PRICING_TIERS.map((tier) => (
            <article
              key={tier.name}
              className={`surface flex flex-col p-6 ${tier.highlight ? "ring-2 ring-[var(--red)]" : ""}`}
            >
              {tier.highlight && (
                <span className="lbl mb-2 inline-block text-[var(--red)]">Best value</span>
              )}
              <h3 className="font-display text-xl font-semibold">{tier.name}</h3>
              <p className="mt-2">
                <span className="font-display text-3xl font-semibold">{tier.price}</span>{" "}
                <span className="text-sm muted">{tier.cadence}</span>
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {tier.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-[var(--red)]">✦</span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/get-started?plan=${tier.checkoutType}`}
                className={`mt-6 text-center ${tier.highlight ? "btn-primary" : "btn-ghost"}`}
              >
                Get started →
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Curtain call */}
      <section className="relative overflow-hidden bg-[var(--red)] text-[var(--red-fg)]">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-3.5"
          style={{
            backgroundImage: "radial-gradient(circle at 50% 0, var(--bg) 9px, transparent 10px)",
            backgroundSize: "30px 14px",
            backgroundRepeat: "repeat-x",
          }}
        />
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">Curtain call</p>
          <h2 className="mt-3 font-display text-3xl font-semibold sm:text-[2.75rem]">
            Ready for Your Next Production?
          </h2>
          <p className="mx-auto mt-3 max-w-md opacity-90">
            Spin up the show, build the cast, and let the costumes follow.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="rounded-xl bg-[var(--red-fg)] px-6 py-3 font-semibold text-[var(--red)] shadow-[4px_4px_0_0_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5"
            >
              Get started →
            </Link>
            <a
              href={DEMO_HREF}
              className="rounded-xl border border-[var(--red-fg)]/60 px-6 py-3 font-semibold transition-colors hover:bg-[#ffffff]/10"
            >
              Request a demo
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--field-line)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
          <div className="text-center sm:text-left">
            <p className="font-display text-lg font-semibold">{v.brand}</p>
            <p className="text-sm muted">Production &amp; costume management for the stage.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-sm">
            <Link href="/sign-in" className="link-muted">Log in</Link>
            <Link href="/sign-up" className="link-muted">Get started</Link>
            <a href={DEMO_HREF} className="link-muted">Contact</a>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="link-muted">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

function featuresOf(group: FeatureGroup) {
  return FEATURES.filter((f) => f.group === group);
}

// Minimal line icons (feather-style), tinted with the curtain-red text color.
function Icon({ id }: { id: string }) {
  const p = ICON_PATHS[id] ?? ICON_PATHS["all-in-one"];
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {p}
    </svg>
  );
}

const ICON_PATHS: Record<string, React.ReactNode> = {
  "all-in-one": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  "auto-roles": (
    <>
      <path d="M9 7a3 3 0 1 0-3 3" />
      <path d="M2 21a5 5 0 0 1 8.5-3.6" />
      <path d="m16 4 1.2 2.6L20 8l-2.6 1.2L16 12l-1.2-2.6L12 8l2.8-1.4Z" />
      <path d="M19 14a4 4 0 0 1 3 4v3" />
    </>
  ),
  "character-boards": (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <circle cx="9" cy="9" r="1.6" />
      <path d="m4 17 5-4 4 3 3-2 4 3" />
    </>
  ),
  measurements: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="1.5" />
      <path d="M7 8v3M11 8v4M15 8v3M19 8v4" />
    </>
  ),
  sourcing: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M6 8.5v7" />
      <path d="M6 14a6 6 0 0 0 6-6 4 4 0 0 1 4-4" />
      <path d="M16 16.5 18 15.5" />
    </>
  ),
  inspiration: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  inventory: (
    <>
      <path d="M3 7h18v3H3z" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 13h4" />
    </>
  ),
  "ai-fabric": (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.48 20 20" />
      <path d="M8.12 8.12 12 12" />
    </>
  ),
  cost: (
    <>
      <path d="M6 3h9l3 3v15l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.2V3Z" />
      <path d="M9 8h6M9 11.5h6M9 15h4" />
    </>
  ),
};
