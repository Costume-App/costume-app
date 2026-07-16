import Link from "next/link";

// Shared shell + typography for the public legal pages (/terms, /privacy).
// Mirrors the /guide page's look: Fraunces headings, muted body, surface cards.
export function LegalShell({
  title,
  updated,
  intro,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/" className="link-muted text-sm">
        ← Home
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm muted">{intro}</p>
      <p className="mb-8 text-sm muted">Last updated: {updated}</p>
      <div className="space-y-10">{children}</div>
    </main>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}
