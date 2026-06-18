# Domain-Aware Onboarding + Request-to-Join — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect at onboarding that a signer-upper's org already exists (by verified email domain) and let them request access — which emails the org's admins — instead of creating a duplicate org. No billing/seat-model change.

**Architecture:** A lazily-populated `org_domains` map (filled as members load the app via `AppNav`) lets `/onboarding` look up an existing org by the user's email domain. One match → a "request access" panel (POSTs `/api/org/request-access`, which re-verifies the domain↔org link and emails the org's `org:admin` members) + a de-emphasized create fallback. Public email domains (gmail, etc.) are never matched.

**Tech Stack:** Next.js 16 (App Router, Clerk middleware/`clerkClient`), TypeScript strict, Supabase (`supabaseAdmin`), Resend (`sendEmail`), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-domain-onboarding-request-to-join-design.md`. Invitation-based (no Clerk Verified Domains add-on); **no billing/seat-model change** (membership free; usage gated by existing per-production maker seats).
- `org_domains` map is **lazy** (captured in `AppNav`, never via a creation hook). Public email domains are excluded from both capture and matching.
- `PUBLIC_EMAIL_DOMAINS` set: `gmail.com, googlemail.com, yahoo.com, outlook.com, hotmail.com, live.com, icloud.com, me.com, aol.com, proton.me, protonmail.com, gmx.com, mail.com`.
- Onboarding: exactly ONE domain match → request-to-join panel + de-emphasized "Create a different organization instead"; zero or multiple matches (or public/no domain) → the existing create flow.
- `POST /api/org/request-access`: auth = signed-in `userId` only (requester has no org); **re-verify server-side** that the requester's verified email domain maps to the posted `orgId` (403 otherwise); email only `role === "org:admin"` members; best-effort + `isEmailConfigured()`-gated; return `{ sent: boolean }`.
- New migration `0029_org_domains.sql` (applied by Chris). Needs `RESEND_API_KEY` in env for the email to actually send.
- Repo test patterns: `production-shares.test.ts` (supabase chain mock), `org/members/route.test.ts` (`vi.mock("@clerk/nextjs/server", …)`). Commands: `npx vitest run <path>`, `npx vitest run`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors). Local commits only — no push.

---

### Task 1: Migration `0029_org_domains.sql`

**Files:**
- Create: `supabase/migrations/0029_org_domains.sql`

**Interfaces:**
- Produces: table `org_domains(id, org_id, domain, created_at)`, unique `(org_id, domain)`, index on `domain`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0029_org_domains.sql`:

```sql
-- Lazy map of a non-public email domain to the org(s) that use it. Populated as
-- members load the app (recordOrgDomain). Used at onboarding to detect that a
-- signer-upper's organization already exists, so they can request to join
-- instead of creating a duplicate. See
-- docs/superpowers/specs/2026-06-18-domain-onboarding-request-to-join-design.md
create table if not exists org_domains (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  domain     text not null,
  created_at timestamptz not null default now(),
  unique (org_id, domain)
);
create index if not exists org_domains_domain_idx on org_domains(domain);
```

- [ ] **Step 2: Sanity-check the FK target**

Run: `grep -n "create table if not exists organizations\|clerk_org_id" supabase/migrations/0001*.sql | head`
Expected: `organizations(clerk_org_id)` exists in 0001.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0029_org_domains.sql
git commit -m "feat(onboarding): add 0029 org_domains map"
```

> **Operational note (Chris):** apply `0029` to Supabase before the onboarding match works against the real DB. Unit tests mock the DB.

---

### Task 2: `email-domains.ts`

**Files:**
- Create: `src/lib/email-domains.ts`
- Create: `src/lib/email-domains.test.ts`

**Interfaces:**
- Produces: `emailDomain(email: string): string | null`; `isPublicEmailDomain(domain: string): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/email-domains.test.ts`:

```ts
import { expect, test } from "vitest";
import { emailDomain, isPublicEmailDomain } from "@/lib/email-domains";

test("emailDomain extracts and lowercases the domain", () => {
  expect(emailDomain("Person@School.EDU")).toBe("school.edu");
  expect(emailDomain("a.b+tag@lincolnhs.org")).toBe("lincolnhs.org");
});

test("emailDomain returns null for malformed input", () => {
  expect(emailDomain("noatsign")).toBeNull();
  expect(emailDomain("trailing@")).toBeNull();
  expect(emailDomain("nodot@localhost")).toBeNull();
});

test("isPublicEmailDomain flags consumer providers, not org domains", () => {
  expect(isPublicEmailDomain("gmail.com")).toBe(true);
  expect(isPublicEmailDomain("ICLOUD.COM")).toBe(true);
  expect(isPublicEmailDomain("lincolnhs.edu")).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/email-domains.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/email-domains.ts`:

```ts
// Consumer/free email providers — never used to cluster users into one org.
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "mail.com",
]);

// The lowercased domain after the last "@", or null if it isn't a plausible domain.
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || domain.includes(" ") || !domain.includes(".")) return null;
  return domain;
}

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/email-domains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-domains.ts src/lib/email-domains.test.ts
git commit -m "feat(onboarding): email-domains helper (parse + public-domain guard)"
```

---

### Task 3: `org-domains.ts` data layer

**Files:**
- Create: `src/lib/data/org-domains.ts`
- Create: `src/lib/data/org-domains.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin`; `emailDomain`, `isPublicEmailDomain`.
- Produces: `recordOrgDomain(orgId: string, email: string): Promise<void>`; `findOrgsByDomain(domain: string): Promise<{ orgId: string; name: string }[]>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/org-domains.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "upsert", "eq", "in"]) chain[m] = vi.fn(() => chain);
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn(() => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => from() } }));

import { recordOrgDomain, findOrgsByDomain } from "@/lib/data/org-domains";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
  setResult(null, null);
});

test("recordOrgDomain skips a public domain (no upsert)", async () => {
  await recordOrgDomain("orgA", "teacher@gmail.com");
  expect(chain.upsert).not.toHaveBeenCalled();
});

test("recordOrgDomain skips a malformed email (no upsert)", async () => {
  await recordOrgDomain("orgA", "not-an-email");
  expect(chain.upsert).not.toHaveBeenCalled();
});

test("recordOrgDomain upserts a real org domain, ignoring duplicates", async () => {
  await recordOrgDomain("orgA", "teacher@lincolnhs.edu");
  expect(chain.upsert).toHaveBeenCalledWith(
    { org_id: "orgA", domain: "lincolnhs.edu" },
    { onConflict: "org_id,domain", ignoreDuplicates: true },
  );
});

test("findOrgsByDomain returns [] for a public domain without querying", async () => {
  expect(await findOrgsByDomain("gmail.com")).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test("findOrgsByDomain joins matched org ids to names", async () => {
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    if (call === 1) return resolve({ data: [{ org_id: "orgA" }], error: null }); // org_domains rows
    return resolve({ data: [{ clerk_org_id: "orgA", name: "Lincoln HS" }], error: null }); // organizations
  };
  const matches = await findOrgsByDomain("lincolnhs.edu");
  expect(matches).toEqual([{ orgId: "orgA", name: "Lincoln HS" }]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/data/org-domains.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/data/org-domains.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { emailDomain, isPublicEmailDomain } from "@/lib/email-domains";

// Best-effort lazy capture: record this org's non-public email domain. Idempotent.
export async function recordOrgDomain(orgId: string, email: string): Promise<void> {
  const domain = emailDomain(email);
  if (!domain || isPublicEmailDomain(domain)) return;
  const { error } = await supabaseAdmin
    .from("org_domains")
    .upsert({ org_id: orgId, domain }, { onConflict: "org_id,domain", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export interface OrgDomainMatch {
  orgId: string;
  name: string;
}

// Orgs known to use this domain (name-joined). Empty for a public/blank domain.
export async function findOrgsByDomain(domain: string): Promise<OrgDomainMatch[]> {
  if (!domain || isPublicEmailDomain(domain)) return [];
  const normalized = domain.toLowerCase();
  const { data: rows, error } = await supabaseAdmin
    .from("org_domains")
    .select("org_id")
    .eq("domain", normalized);
  if (error) throw new Error(error.message);
  const orgIds = [...new Set(((rows as { org_id: string }[] | null) ?? []).map((r) => r.org_id))];
  if (orgIds.length === 0) return [];
  const { data: orgs, error: oErr } = await supabaseAdmin
    .from("organizations")
    .select("clerk_org_id, name")
    .in("clerk_org_id", orgIds);
  if (oErr) throw new Error(oErr.message);
  return ((orgs as { clerk_org_id: string; name: string }[] | null) ?? []).map((o) => ({
    orgId: o.clerk_org_id,
    name: o.name,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/data/org-domains.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/org-domains.ts src/lib/data/org-domains.test.ts
git commit -m "feat(onboarding): org-domains data (lazy recordOrgDomain + findOrgsByDomain)"
```

---

### Task 4: `listOrgAdmins` + request-access email + `POST /api/org/request-access`

**Files:**
- Modify: `src/lib/data/org-members.ts` (add `listOrgAdmins`)
- Create: `src/lib/request-access-email.ts`
- Create: `src/app/api/org/request-access/route.ts`
- Create: `src/app/api/org/request-access/route.test.ts`

**Interfaces:**
- Consumes: `auth`, `currentUser` from `@clerk/nextjs/server`; `findOrgsByDomain` (Task 3); `emailDomain` (Task 2); `sendEmail`, `isEmailConfigured` from `@/lib/email`.
- Produces: `listOrgAdmins(orgId): Promise<{ email: string; name: string }[]>`; `requestAccessEmail(requesterName, requesterEmail, orgName): { subject, text }`; `POST` → `{ sent: boolean }` (401 no user; 403 domain↔org mismatch).

- [ ] **Step 1: Add `listOrgAdmins`**

Append to `src/lib/data/org-members.ts`:

```ts
// Org members with the admin role (email + name), for notifications/invites.
export async function listOrgAdmins(orgId: string): Promise<{ email: string; name: string }[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId });
  return (data ?? [])
    .filter((m) => m.role === "org:admin")
    .map((m) => {
      const u = m.publicUserData;
      const email = u?.identifier ?? "";
      const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email;
      return { email, name };
    })
    .filter((a) => a.email);
}
```

- [ ] **Step 2: Add the email template**

Create `src/lib/request-access-email.ts`:

```ts
// Subject + plain-text body for the "someone asked to join your org" admin email.
export function requestAccessEmail(
  requesterName: string,
  requesterEmail: string,
  orgName: string,
): { subject: string; text: string } {
  return {
    subject: `${requesterName} asked to join ${orgName} on Measure My Costume`,
    text:
      `${requesterName} (${requesterEmail}) asked to join your organization "${orgName}" on Measure My Costume.\n\n` +
      `To add them: open Measure My Costume, go to your organization → Members, and invite ${requesterEmail}.`,
  };
}
```

- [ ] **Step 3: Write the failing route tests**

Create `src/app/api/org/request-access/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
}));
const findOrgsByDomain = vi.fn();
vi.mock("@/lib/data/org-domains", () => ({ findOrgsByDomain: (...a: unknown[]) => findOrgsByDomain(...a) }));
const listOrgAdmins = vi.fn();
vi.mock("@/lib/data/org-members", () => ({ listOrgAdmins: (...a: unknown[]) => listOrgAdmins(...a) }));
const sendEmail = vi.fn();
const isEmailConfigured = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => isEmailConfigured(),
}));

import { POST } from "@/app/api/org/request-access/route";

beforeEach(() => {
  [authMock, currentUserMock, findOrgsByDomain, listOrgAdmins, sendEmail, isEmailConfigured].forEach((m) => m.mockReset());
  authMock.mockResolvedValue({ userId: "u1" });
  currentUserMock.mockResolvedValue({ firstName: "Pat", lastName: "Lee", emailAddresses: [{ emailAddress: "pat@lincolnhs.edu" }] });
  findOrgsByDomain.mockResolvedValue([{ orgId: "orgA", name: "Lincoln HS" }]);
  listOrgAdmins.mockResolvedValue([{ email: "admin@lincolnhs.edu", name: "Admin" }]);
  isEmailConfigured.mockReturnValue(true);
  sendEmail.mockResolvedValue({ sent: true });
});
const req = (body: unknown) => new Request("https://www.measuremycostume.com/api/org/request-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("401 when not signed in", async () => {
  authMock.mockResolvedValue({ userId: null });
  expect((await POST(req({ orgId: "orgA" }))).status).toBe(401);
});

test("403 when the requester's domain does not map to the posted org", async () => {
  findOrgsByDomain.mockResolvedValue([{ orgId: "orgOTHER", name: "Other" }]);
  const res = await POST(req({ orgId: "orgA" }));
  expect(res.status).toBe(403);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("emails the org admins on a valid match", async () => {
  const res = await POST(req({ orgId: "orgA" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ sent: true });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@lincolnhs.edu" }));
});

test("returns sent:false and sends nothing when email isn't configured", async () => {
  isEmailConfigured.mockReturnValue(false);
  const res = await POST(req({ orgId: "orgA" }));
  expect(await res.json()).toEqual({ sent: false });
  expect(listOrgAdmins).not.toHaveBeenCalled();
  expect(sendEmail).not.toHaveBeenCalled();
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/app/api/org/request-access/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 5: Implement the route**

Create `src/app/api/org/request-access/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { errorResponse } from "@/lib/api";
import { emailDomain } from "@/lib/email-domains";
import { findOrgsByDomain } from "@/lib/data/org-domains";
import { listOrgAdmins } from "@/lib/data/org-members";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { requestAccessEmail } from "@/lib/request-access-email";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { orgId?: string };
    const orgId = typeof body.orgId === "string" ? body.orgId : "";
    if (!orgId) return NextResponse.json({ error: "orgId is required" }, { status: 400 });

    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
    const domain = email ? emailDomain(email) : null;

    // Re-verify server-side: the requester's verified domain must actually map to
    // this org (also rejects public domains, since findOrgsByDomain returns []).
    const matches = domain ? await findOrgsByDomain(domain) : [];
    const match = matches.find((m) => m.orgId === orgId);
    if (!match || !email) {
      return NextResponse.json({ error: "Can't request access to that organization" }, { status: 403 });
    }

    if (!isEmailConfigured()) return NextResponse.json({ sent: false });

    const requesterName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email;
    const tmpl = requestAccessEmail(requesterName, email, match.name);
    const admins = await listOrgAdmins(orgId);
    let sent = false;
    for (const admin of admins) {
      try {
        const r = await sendEmail({ to: admin.email, ...tmpl });
        if (r.sent) sent = true;
      } catch (e) {
        console.error("request-access admin email failed:", e);
      }
    }
    return NextResponse.json({ sent });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/api/org/request-access/route.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/org-members.ts src/lib/request-access-email.ts src/app/api/org/request-access
git commit -m "feat(onboarding): request-access route (verify domain, email org admins) + listOrgAdmins"
```

---

### Task 5: Lazy domain capture in `AppNav`

**Files:**
- Modify: `src/components/AppNav.tsx`

**Interfaces:**
- Consumes: `recordOrgDomain` (Task 3); `auth` from `@clerk/nextjs/server`.

- [ ] **Step 1: Wire best-effort capture**

In `src/components/AppNav.tsx`, add imports:

```ts
import { currentUser, auth } from "@clerk/nextjs/server";
import { recordOrgDomain } from "@/lib/data/org-domains";
```

(`currentUser` is already imported — merge `auth` into that import.)

At the top of the `AppNav` function body, after `const user = await currentUser();`, add:

```ts
  const { orgId } = await auth();
  const primaryEmail = user?.emailAddresses?.[0]?.emailAddress;
  if (orgId && primaryEmail) {
    // Lazy backfill of the org→domain map; never let it break the nav.
    try {
      await recordOrgDomain(orgId, primaryEmail);
    } catch (e) {
      console.error("recordOrgDomain failed (non-fatal):", e);
    }
  }
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc clean; full suite still passes (no regressions).

- [ ] **Step 3: Commit**

```bash
git add src/components/AppNav.tsx
git commit -m "feat(onboarding): lazily record org email domains from AppNav"
```

---

### Task 6: Domain-aware onboarding page + request-to-join UI

**Files:**
- Create: `src/components/OnboardingCreate.tsx` (client wrapper of `OrganizationList`)
- Create: `src/components/RequestToJoin.tsx` (client)
- Modify: `src/app/onboarding/page.tsx` (→ server component)

**Interfaces:**
- Consumes: `currentUser` from `@clerk/nextjs/server`; `emailDomain` (Task 2); `findOrgsByDomain` (Task 3); `OrganizationList`, `clerkAppearance`.

- [ ] **Step 1: Extract the create flow into a client component**

Create `src/components/OnboardingCreate.tsx`:

```tsx
"use client";

import { OrganizationList } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export function OnboardingCreate() {
  return (
    <OrganizationList
      hidePersonal
      afterCreateOrganizationUrl="/productions"
      afterSelectOrganizationUrl="/productions"
      appearance={clerkAppearance}
    />
  );
}
```

- [ ] **Step 2: Create the request-to-join panel**

Create `src/components/RequestToJoin.tsx`:

```tsx
"use client";

import { useState } from "react";

export function RequestToJoin({ orgId, orgName, domain }: { orgId: string; orgName: string; domain: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "unconfigured" | "error">("idle");

  async function request() {
    setBusy(true);
    try {
      const res = await fetch("/api/org/request-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orgId }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const { sent } = (await res.json()) as { sent: boolean };
      setStatus(sent ? "sent" : "unconfigured");
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface w-full max-w-md space-y-3 p-5 text-center">
      <p className="text-sm">
        Measure My Costume already has an organization for <span className="font-medium">{domain}</span> —{" "}
        <span className="font-medium">{orgName}</span>.
      </p>
      {status === "sent" ? (
        <p className="text-sm muted">We&rsquo;ve let the organization&rsquo;s admins know — they can invite you.</p>
      ) : status === "unconfigured" ? (
        <p className="text-sm muted">Ask an admin of {orgName} to invite you from their organization settings.</p>
      ) : (
        <>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void request()}>
            {busy ? "Requesting…" : "Request access"}
          </button>
          {status === "error" && (
            <p className="text-sm text-[var(--red)]">Couldn&rsquo;t send the request — ask an admin to invite you.</p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite onboarding as a server component**

Replace `src/app/onboarding/page.tsx` with:

```tsx
import { currentUser } from "@clerk/nextjs/server";
import { emailDomain } from "@/lib/email-domains";
import { findOrgsByDomain } from "@/lib/data/org-domains";
import { OnboardingCreate } from "@/components/OnboardingCreate";
import { RequestToJoin } from "@/components/RequestToJoin";

export default async function OnboardingPage() {
  const user = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? null;
  const domain = email ? emailDomain(email) : null;
  const matches = domain ? await findOrgsByDomain(domain) : [];
  const match = matches.length === 1 ? matches[0] : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Your organization</h1>
        <p className="mt-1 muted">
          {match
            ? "Join your organization, or create a new one."
            : "Create a school or accept an invitation to start planning productions."}
        </p>
      </div>

      {match ? (
        <>
          <RequestToJoin orgId={match.orgId} orgName={match.name} domain={domain!} />
          <details className="text-sm">
            <summary className="cursor-pointer link-muted">Create a different organization instead</summary>
            <div className="mt-4">
              <OnboardingCreate />
            </div>
          </details>
        </>
      ) : (
        <OnboardingCreate />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build && npm run lint`
Expected: tsc clean; build succeeds; lint 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/OnboardingCreate.tsx src/components/RequestToJoin.tsx src/app/onboarding/page.tsx
git commit -m "feat(onboarding): domain-match request-to-join panel + de-emphasized create fallback"
```

---

### Task 7: Runbook note + full verification

**Files:**
- Create: `docs/onboarding-request-to-join-runbook.md`

**Interfaces:** none (docs + verification).

- [ ] **Step 1: Write the runbook**

Create `docs/onboarding-request-to-join-runbook.md`:

```markdown
# Domain-Aware Onboarding — Runbook

## Apply the migration
Apply `supabase/migrations/0029_org_domains.sql` to the shared Supabase project.

## Email
The "request access" notification uses Resend (`sendEmail`). It needs `RESEND_API_KEY`
set in `.env.local` + Vercel (and a verified sending domain). Until then, "Request access"
returns `{sent:false}` and the UI tells the user to ask an admin for an invite.

## How it works
- As members load the app, `AppNav` records their org's non-public email domain in `org_domains`
  (gmail/yahoo/etc. are skipped). Existing orgs backfill automatically as members visit.
- A new signer-upper with no org hits `/onboarding`; if exactly one org matches their
  verified email domain, they see "Request access" (emails that org's admins) plus a
  de-emphasized "create a different organization" fallback. No match → normal create.
- The admin invites the requester via the org's Members management (Clerk). Membership is free;
  production/maker limits still gate usage.

## Smoke test
1. As an existing org member, load the app → confirm a row appears in `org_domains` for your domain.
2. Sign up a NEW user with the same (non-public) email domain, no org → `/onboarding` shows
   "…already has an organization for <domain>" + Request access.
3. Click Request access → org admins get the email (once Resend is configured) → admin invites.
4. Sign up with a gmail.com address → no match → normal create flow.
```

- [ ] **Step 2: Full suite**

Run: `npx vitest run`
Expected: PASS (all prior + new email-domains / org-domains / request-access tests).

- [ ] **Step 3: Lint + type-check + build**

Run: `npm run lint && npx tsc --noEmit && npm run build`
Expected: lint 0 errors; tsc clean; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/onboarding-request-to-join-runbook.md
git commit -m "docs(onboarding): request-to-join runbook (apply 0029, Resend)"
```

---

## Self-Review

**Spec coverage:**
- `org_domains` migration → Task 1. ✓
- `email-domains` (parse + public guard) → Task 2. ✓
- `org-domains` (lazy `recordOrgDomain` + `findOrgsByDomain`) → Task 3. ✓
- Request-access route (userId auth, domain↔org re-check 403, admin email, best-effort/configured) + `listOrgAdmins` + email template → Task 4. ✓
- Lazy capture in AppNav → Task 5. ✓
- Domain-aware onboarding + RequestToJoin + de-emphasized create fallback → Task 6. ✓
- Public-domain guard (never matched/recorded) → Tasks 2/3 (used in record + find). ✓
- No billing change → none touched. ✓
- Runbook (0029 apply, Resend) → Task 7. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content.

**Type consistency:** `recordOrgDomain(orgId,email)` / `findOrgsByDomain(domain): {orgId,name}[]` consistent across Tasks 3, 4 (route), 6 (onboarding). `listOrgAdmins(orgId): {email,name}[]` (Task 4) matches its use in the route. `requestAccessEmail(name,email,orgName)` matches the route call. `RequestToJoin` props `{orgId,orgName,domain}` match the onboarding render. Route returns `{ sent: boolean }`, consumed by `RequestToJoin`.
```
