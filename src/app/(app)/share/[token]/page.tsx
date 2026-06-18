import Link from "next/link";
import { getShareByToken } from "@/lib/data/production-shares";
import { AcceptShareButton } from "@/components/AcceptShareButton";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getShareByToken(token);

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/productions" className="link-muted text-sm">← Productions</Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">Shared production</h1>

      {!result || result.share.status === "revoked" ? (
        <p className="mt-4 text-sm muted">This share link is no longer valid.</p>
      ) : result.share.status === "accepted" ? (
        <p className="mt-4 text-sm muted">This share link has already been used.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="surface p-4">
            <p className="font-display text-xl font-semibold">{result.source.title}</p>
            <p className="mt-1 text-sm muted">
              {result.source.roleCount} role{result.source.roleCount === 1 ? "" : "s"} ·{" "}
              {result.source.designCount} costume design{result.source.designCount === 1 ? "" : "s"} · includes notes &amp; idea photos
            </p>
            <p className="mt-1 text-sm muted">Performers and measurements are not included.</p>
          </div>
          <p className="text-sm muted">
            Accepting copies this into your organization as a new production you can edit.
          </p>
          <AcceptShareButton token={token} />
        </div>
      )}
    </main>
  );
}
