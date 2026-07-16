import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { LEGAL_LINKS } from "@/components/landing/landing-content";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <SignUp />
      <p className="max-w-xs text-center text-xs muted">
        By creating an account you agree to the{" "}
        {LEGAL_LINKS.map((l, i) => (
          <span key={l.href}>
            {i > 0 && <> and </>}
            <Link href={l.href} className="link-red">
              {l.fullLabel}
            </Link>
          </span>
        ))}
        .
      </p>
    </main>
  );
}
