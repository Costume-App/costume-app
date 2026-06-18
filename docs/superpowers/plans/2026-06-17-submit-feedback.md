# Submit Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users submit feedback from the app; each submission is saved to a `feedback` table and best-effort emailed to support.

**Architecture:** A new `feedback` table is the source of truth (the DB insert determines request success). A `POST /api/feedback` route saves the feedback, then best-effort emails it via a new Resend helper (`src/lib/email.ts`) that gracefully no-ops without an API key. A `FeedbackCard` client component (expand-from-link) under the User Guide card on the productions page collects type + message. Shared type constants live in a pure `src/lib/feedback-types.ts` so the client and server agree without bundling server-only code.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Supabase, Clerk, Resend (new), Vitest (node env — no jsdom/RTL).

## Global Constraints

- Schema change goes in **`supabase/migrations/0026_feedback.sql`** (next number; highest existing is `0025`).
- **Do NOT apply the migration to Supabase, push to GitHub, or deploy.** Local commits only; hold for Chris's explicit green light.
- Tests run in the **node** Vitest environment — component JSX is verified by `npx tsc --noEmit` + `npm run build`, NOT unit tests.
- The DB insert determines success; the email is **best-effort** and its failure must never fail the request.
- Email helper **gracefully no-ops when `RESEND_API_KEY` is missing** (no throw, no send).
- Feedback type keys: `fix` / `change` / `other`; labels: "I need something fixed" / "I'd like to see something work differently" / "Other". Type is required, default `fix`.
- App name string in copy/email: **"Measure My Costume"**. No app-wide rename in this feature.
- Email defaults: from `Measure My Costume <feedback@measuremycostume.com>` (override `FEEDBACK_FROM_EMAIL`), to `support@measuremycostume.com` (override `FEEDBACK_TO_EMAIL`). Use `||` for the fallback so a blank env value falls back.
- Client fetches use `credentials: "include"`. `ValidationError` → 400 via `errorResponse`.
- Run the full suite with `npm test`. Current baseline: 452 passing.

---

### Task 1: Migration `0026` — `feedback` table

**Files:**
- Create: `supabase/migrations/0026_feedback.sql`

**Interfaces:**
- Produces: a `feedback` table (`id`, `org_id`, `user_id`, `user_email`, `type`, `message`, `created_at`).

> No automated test (SQL migration; data-layer tests mock Supabase). Verification is self-review — the migration is **not applied** this session.

- [ ] **Step 1: Create the migration file**

```sql
-- User-submitted feedback. Source of truth (the API also best-effort emails support).
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  user_id text not null,
  user_email text,
  type text not null,
  message text not null,
  created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0026_feedback.sql
git commit -m "feat(db): 0026 adds feedback table"
```

---

### Task 2: Shared types + data layer

**Files:**
- Create: `src/lib/feedback-types.ts`
- Create: `src/lib/data/feedback.ts`
- Test: `src/lib/data/feedback.test.ts`

**Interfaces:**
- Produces: `FEEDBACK_TYPES` (`readonly ["fix","change","other"]`), `FeedbackType`, `FEEDBACK_TYPE_LABELS: Record<FeedbackType,string>`; `Feedback` interface; `createFeedback({ orgId, userId, userEmail, type, message }): Promise<Feedback>`.

- [ ] **Step 1: Create the pure shared-types module**

Create `src/lib/feedback-types.ts`:

```ts
export const FEEDBACK_TYPES = ["fix", "change", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  fix: "I need something fixed",
  change: "I'd like to see something work differently",
  other: "Other",
};
```

- [ ] **Step 2: Write the failing data-layer tests**

Create `src/lib/data/feedback.test.ts` (chained-mock pattern, mirroring `fabric-settings.test.ts`):

```ts
import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "insert"]) chain[m] = vi.fn(() => chain as unknown as typeof chain);
chain.single = vi.fn(() => Promise.resolve(result));
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn((_t: string) => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { createFeedback } from "@/lib/data/feedback";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  setResult(null, null);
});

test("createFeedback inserts a trimmed message with provenance", async () => {
  setResult({ id: "f1", org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken", created_at: "t" });
  await createFeedback({ orgId: "org_1", userId: "u1", userEmail: "a@b.com", type: "fix", message: "  Broken  " });
  expect(from).toHaveBeenCalledWith("feedback");
  expect(chain.insert).toHaveBeenCalledWith({
    org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken",
  });
});

test("createFeedback rejects an empty message", async () => {
  await expect(
    createFeedback({ orgId: "org_1", userId: "u1", userEmail: null, type: "fix", message: "   " }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("createFeedback rejects an invalid type", async () => {
  await expect(
    createFeedback({ orgId: "org_1", userId: "u1", userEmail: null, type: "nope", message: "hi" }),
  ).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run src/lib/data/feedback.test.ts`
Expected: FAIL — `@/lib/data/feedback` does not exist.

- [ ] **Step 4: Implement the data layer**

Create `src/lib/data/feedback.ts`:

```ts
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import { FEEDBACK_TYPES } from "@/lib/feedback-types";

export interface Feedback {
  id: string;
  org_id: string;
  user_id: string;
  user_email: string | null;
  type: string;
  message: string;
  created_at: string;
}

export async function createFeedback(input: {
  orgId: string;
  userId: string;
  userEmail: string | null;
  type: string;
  message: string;
}): Promise<Feedback> {
  const message = input.message.trim();
  if (!message) throw new ValidationError("Feedback message is required");
  if (!(FEEDBACK_TYPES as readonly string[]).includes(input.type)) {
    throw new ValidationError("Invalid feedback type");
  }
  const { data, error } = await supabaseAdmin
    .from("feedback")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      user_email: input.userEmail,
      type: input.type,
      message,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Feedback;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/lib/data/feedback.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/feedback-types.ts src/lib/data/feedback.ts src/lib/data/feedback.test.ts
git commit -m "feat(data): feedback types + createFeedback"
```

---

### Task 3: Email helper (Resend)

**Files:**
- Modify: `package.json` (+ lockfile) — add `resend`
- Create: `src/lib/email.ts`
- Test: `src/lib/email.test.ts`

**Interfaces:**
- Produces: `isEmailConfigured(): boolean`; `sendEmail({ to, subject, text }): Promise<{ sent: boolean }>` — sends via Resend when `RESEND_API_KEY` is set, returns `{ sent: false }` (no Resend construction) otherwise, throws on a real Resend error.

- [ ] **Step 1: Install the dependency**

Run: `npm install resend`
Expected: `resend` added to `package.json` dependencies; lockfile updated.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/email.test.ts` (mirrors the Anthropic SDK mock in `estimate-fabric.test.ts`):

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const send = vi.fn();
vi.mock("resend", () => ({
  // Vitest requires a `function` (not arrow) impl for a mock used with `new`.
  Resend: vi.fn(function () {
    return { emails: { send } };
  }),
}));

import { isEmailConfigured, sendEmail } from "@/lib/email";
import { Resend } from "resend";

beforeEach(() => {
  send.mockReset();
  (Resend as unknown as ReturnType<typeof vi.fn>).mockClear();
  vi.unstubAllEnvs();
});

test("isEmailConfigured reflects RESEND_API_KEY", () => {
  vi.stubEnv("RESEND_API_KEY", "");
  expect(isEmailConfigured()).toBe(false);
  vi.stubEnv("RESEND_API_KEY", "re_123");
  expect(isEmailConfigured()).toBe(true);
});

test("sendEmail no-ops and never constructs Resend without a key", async () => {
  vi.stubEnv("RESEND_API_KEY", "");
  const out = await sendEmail({ to: "s@x.com", subject: "Hi", text: "Body" });
  expect(out).toEqual({ sent: false });
  expect(Resend).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

test("sendEmail sends via Resend with the default from when configured", async () => {
  vi.stubEnv("RESEND_API_KEY", "re_123");
  vi.stubEnv("FEEDBACK_FROM_EMAIL", "");
  send.mockResolvedValue({ data: { id: "e1" }, error: null });
  const out = await sendEmail({ to: "support@measuremycostume.com", subject: "Subj", text: "Body" });
  expect(out).toEqual({ sent: true });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "support@measuremycostume.com",
      subject: "Subj",
      text: "Body",
      from: "Measure My Costume <feedback@measuremycostume.com>",
    }),
  );
});

test("sendEmail throws when Resend returns an error", async () => {
  vi.stubEnv("RESEND_API_KEY", "re_123");
  send.mockResolvedValue({ data: null, error: { message: "bad domain" } });
  await expect(sendEmail({ to: "s@x.com", subject: "S", text: "B" })).rejects.toThrow("bad domain");
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run src/lib/email.test.ts`
Expected: FAIL — `@/lib/email` does not exist.

- [ ] **Step 4: Implement the helper**

Create `src/lib/email.ts`:

```ts
import "server-only";
import { Resend } from "resend";

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// Sends an email via Resend when configured; no-ops (returns { sent: false })
// when RESEND_API_KEY is missing. A real send error throws so the caller can
// decide what to do (the feedback route swallows it — the feedback is already saved).
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false };
  const resend = new Resend(apiKey);
  const from = process.env.FEEDBACK_FROM_EMAIL || "Measure My Costume <feedback@measuremycostume.com>";
  const { error } = await resend.emails.send({ from, to: input.to, subject: input.subject, text: input.text });
  if (error) throw new Error(error.message ?? "Email send failed");
  return { sent: true };
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/lib/email.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/email.ts src/lib/email.test.ts
git commit -m "feat(email): add Resend helper that no-ops without a key"
```

---

### Task 4: `POST /api/feedback` route

**Files:**
- Create: `src/lib/clerk-user.ts`
- Create: `src/app/api/feedback/route.ts`
- Test: `src/app/api/feedback/route.test.ts`

**Interfaces:**
- Consumes: `createFeedback` (Task 2), `FEEDBACK_TYPE_LABELS`/`FeedbackType` (Task 2), `sendEmail` (Task 3), `getAuthContext`/`errorResponse` (existing).
- Produces: `getUserEmail(userId): Promise<string | null>`; `POST` handler — `201 { ok: true }` on save (email best-effort), `400` on validation error, `401/403` on auth error.

- [ ] **Step 1: Create the best-effort Clerk email helper**

Create `src/lib/clerk-user.ts`:

```ts
import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

// Best-effort: the signed-in user's primary email, or null if it can't be fetched.
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Write the failing route tests**

Create `src/app/api/feedback/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const createFeedback = vi.fn();
vi.mock("@/lib/data/feedback", () => ({ createFeedback: (...a: unknown[]) => createFeedback(...a) }));

const getUserEmail = vi.fn();
vi.mock("@/lib/clerk-user", () => ({ getUserEmail: (...a: unknown[]) => getUserEmail(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { POST } from "@/app/api/feedback/route";

beforeEach(() => {
  [getAuthContext, createFeedback, getUserEmail, sendEmail].forEach((m) => m.mockReset());
  getUserEmail.mockResolvedValue("a@b.com");
  sendEmail.mockResolvedValue({ sent: true });
});

function postReq(body: unknown) {
  return new Request("http://test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sample = { id: "f1", org_id: "org_1", user_id: "u1", user_email: "a@b.com", type: "fix", message: "Broken", created_at: "t" };

test("POST 201 saves feedback and emails support", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockResolvedValue(sample);
  const res = await POST(postReq({ type: "fix", message: "Broken" }));
  expect(res.status).toBe(201);
  expect(createFeedback).toHaveBeenCalledWith({ orgId: "org_1", userId: "u1", userEmail: "a@b.com", type: "fix", message: "Broken" });
  expect(sendEmail).toHaveBeenCalled();
});

test("POST still 201 when the email send throws (best-effort)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockResolvedValue(sample);
  sendEmail.mockRejectedValue(new Error("unverified domain"));
  const res = await POST(postReq({ type: "fix", message: "Broken" }));
  expect(res.status).toBe(201);
});

test("POST 400 when createFeedback rejects", async () => {
  const { ValidationError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFeedback.mockRejectedValue(new ValidationError("Feedback message is required"));
  const res = await POST(postReq({ type: "fix", message: "" }));
  expect(res.status).toBe(400);
  expect(sendEmail).not.toHaveBeenCalled();
});

test("POST 401 when signed out", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await POST(postReq({ type: "fix", message: "Hi" }));
  expect(res.status).toBe(401);
});
```

- [ ] **Step 3: Run, verify fail**

Run: `npx vitest run src/app/api/feedback/route.test.ts`
Expected: FAIL — `@/app/api/feedback/route` does not exist.

- [ ] **Step 4: Implement the route**

Create `src/app/api/feedback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { createFeedback, type Feedback } from "@/lib/data/feedback";
import { FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/lib/feedback-types";
import { getUserEmail } from "@/lib/clerk-user";
import { sendEmail } from "@/lib/email";

function feedbackEmailBody(f: Feedback): string {
  const label = FEEDBACK_TYPE_LABELS[f.type as FeedbackType] ?? f.type;
  return [
    `Type: ${label}`,
    "",
    f.message,
    "",
    "—",
    `From: ${f.user_email ?? "unknown"}`,
    `User ID: ${f.user_id}`,
    `Org ID: ${f.org_id}`,
    `Submitted: ${f.created_at}`,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as { type?: string; message?: string };
    const userEmail = await getUserEmail(userId);
    const feedback = await createFeedback({
      orgId,
      userId,
      userEmail,
      type: String(body.type ?? ""),
      message: String(body.message ?? ""),
    });
    // Best-effort notification — the feedback is already saved, so an email
    // problem (e.g. unverified domain, no key) must not fail the request.
    try {
      await sendEmail({
        to: process.env.FEEDBACK_TO_EMAIL || "support@measuremycostume.com",
        subject: `Measure My Costume feedback: ${FEEDBACK_TYPE_LABELS[feedback.type as FeedbackType] ?? feedback.type}`,
        text: feedbackEmailBody(feedback),
      });
    } catch (e) {
      console.error("Feedback email failed (feedback still saved):", e);
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/app/api/feedback/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (confirms `clerk-user.ts` and the route compile; `@clerk/nextjs/server` is already a dependency, used in `AppNav`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/clerk-user.ts src/app/api/feedback/route.ts src/app/api/feedback/route.test.ts
git commit -m "feat(api): POST /api/feedback saves + best-effort emails support"
```

---

### Task 5: FeedbackCard UI + mount + env docs

**Files:**
- Create: `src/components/FeedbackCard.tsx`
- Modify: `src/app/(app)/productions/page.tsx` (import + mount after the Guide link, around line 76)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `FEEDBACK_TYPES`, `FEEDBACK_TYPE_LABELS`, `FeedbackType` (Task 2); `POST /api/feedback` (Task 4).

- [ ] **Step 1: Create the component**

Create `src/components/FeedbackCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FEEDBACK_TYPES, FEEDBACK_TYPE_LABELS, type FeedbackType } from "@/lib/feedback-types";

export function FeedbackCard() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("fix");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, message }),
      });
      if (res.ok) {
        setSent(true);
      } else {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send feedback.");
      }
    } catch {
      setError("Couldn't send feedback.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="surface mt-3 p-4">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="block text-left">
          <span className="font-display text-xl font-semibold">Submit feedback →</span>
          <span className="mt-0.5 block text-sm muted">Tell us what to fix or improve</span>
        </button>
      ) : sent ? (
        <p className="text-sm">Thanks — we got your feedback.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="font-display text-xl font-semibold">Submit feedback</p>
          <fieldset className="space-y-1">
            {FEEDBACK_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="feedback-type"
                  value={t}
                  checked={type === t}
                  onChange={() => setType(t)}
                />
                {FEEDBACK_TYPE_LABELS[t]}
              </label>
            ))}
          </fieldset>
          <textarea
            className="field w-full"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What would you like to tell us?"
            aria-label="Feedback message"
          />
          {error && <p className="text-sm text-[var(--red)]">{error}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy || !message.trim()}>
              Send feedback
            </button>
            <button type="button" className="link-muted text-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it under the Guide card**

In `src/app/(app)/productions/page.tsx`, add the import near the other component imports (alongside `InventoryQuickAddCard`):

```tsx
import { FeedbackCard } from "@/components/FeedbackCard";
```

Then add `<FeedbackCard />` immediately after the User Guide `</Link>` (current line 76):

```tsx
      <Link href="/guide" className="surface mt-3 block p-4 transition-transform hover:-translate-y-0.5">
        <span className="font-display text-xl font-semibold">User Guide →</span>
        <span className="mt-0.5 block text-sm muted">How to use every feature, step by step</span>
      </Link>
      <FeedbackCard />
```

- [ ] **Step 3: Document the env vars**

Append to `.env.example`:

```
# Resend (optional — enables emailing submitted feedback to support).
# Without it, feedback is still saved to the database; the email is skipped.
RESEND_API_KEY=
# Optional overrides for the feedback email addresses.
FEEDBACK_TO_EMAIL=
FEEDBACK_FROM_EMAIL=
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds (the server-only `email.ts`/`clerk-user.ts`/`feedback.ts` are not reachable from the client `FeedbackCard`, which imports only the pure `feedback-types.ts`).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/FeedbackCard.tsx "src/app/(app)/productions/page.tsx" .env.example
git commit -m "feat(feedback): submit-feedback card under the User Guide"
```

---

## Final verification

- [ ] `npm test` — all suites pass.
- [ ] `npx tsc --noEmit && npm run build` — clean.
- [ ] Confirm migration `0026` was **not** applied to Supabase and nothing was pushed/deployed. Report to Chris that the work is on local `main` awaiting his green light to apply `0026` + push, and that delivering the emails needs `RESEND_API_KEY` + a verified `measuremycostume.com` sending domain (feedback records to the DB regardless).

## Notes / out of scope

- No app-wide rename to "Measure My Costume" (separate task if wanted).
- No in-app admin view of feedback (it's in the DB).
- No rate limiting, attachments, or signed-out feedback.
- `clerk-user.ts` is a thin best-effort wrapper around Clerk — no unit test (mocked in the route test; covered by tsc/build), consistent with how `AppNav` uses `clerkClient` untested.
