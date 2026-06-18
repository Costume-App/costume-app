# Submit Feedback — Design

**Date:** 2026-06-17
**Status:** Approved (design); pending spec review

## Summary

Add a "Submit feedback" option so signed-in users can send feedback from the app. A link under the User Guide card on the productions page expands an inline form: a required **type** (one of three options) and a **message**. On submit, the feedback is **saved to a Supabase `feedback` table** (source of truth) and **best-effort emailed** to `support@measuremycostume.com` via Resend.

This is also the app's first email integration — it adds a small `src/lib/email.ts` helper (Resend) that gracefully no-ops when no API key is configured, consistent with the stack convention ("Email/SMS integrations gracefully fail if API keys are missing").

The app's chosen name is **"Measure My Costume"** (used in the email subject/from and new copy). A broader app-wide rename (nav, page titles, landing pages) is **out of scope** for this feature.

## Decisions (from brainstorming)

- **Save to DB + best-effort email** (not email-only): the DB insert is the source of truth and determines request success; the email is a notification layered on top. This means feedback is never lost even before Resend's sending domain is verified.
- **Type is required**, defaulting to the first option ("I need something fixed").
- Type stored as a **stable key** (`fix` / `change` / `other`), validated in code — **no DB CHECK constraint** (adding categories later needs no migration).

## Current system (as found)

- **No email infrastructure exists** — no `resend`/email dependency, no `src/lib/email*`, no email env vars. This feature adds it.
- The User Guide card is on `src/app/(app)/productions/page.tsx` (lines 73-76):
  ```tsx
  <Link href="/guide" className="surface mt-3 block p-4 transition-transform hover:-translate-y-0.5">
    <span className="font-display text-xl font-semibold">User Guide →</span>
    <span className="mt-0.5 block text-sm muted">How to use every feature, step by step</span>
  </Link>
  ```
- API route + auth pattern: `getAuthContext()` (`src/lib/auth-context.ts`) returns `{ userId, orgId }` (no email); routes parse the body, do work, return JSON, and wrap errors with `errorResponse(err)`. The user's email is fetched server-side via `clerkClient`: `const u = await (await clerkClient()).users.getUser(userId); u.emailAddresses[0]?.emailAddress`.
- Expand-from-link UI convention: `src/components/InventoryQuickAddCard.tsx` (`useState` for open/busy/error; link toggles an inline form; success collapses; errors inline; `credentials: "include"`).
- Tests: node Vitest; API route tests mock `@/lib/auth-context` and data/external helpers (see `src/app/api/makers/route.test.ts`). Highest migration is `0025`.

## Decision 1 — Schema (`supabase/migrations/0026_feedback.sql`)

```sql
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

Mirrors existing migrations (e.g. `org_id text`, `gen_random_uuid()`, `created_at timestamptz default now()`). No CHECK on `type`.

## Decision 2 — Shared type constants (`src/lib/feedback-types.ts`)

A pure module (no imports) so it can be shared by the client component and the server data layer/route without dragging `supabaseAdmin` (server-only) into the client bundle:

```ts
export const FEEDBACK_TYPES = ["fix", "change", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  fix: "I need something fixed",
  change: "I'd like to see something work differently",
  other: "Other",
};
```

## Decision 2b — Data layer (`src/lib/data/feedback.ts`)

Imports the constants from `@/lib/feedback-types`.

```ts
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
}): Promise<Feedback>;
```

`createFeedback` trims `message` (throws `ValidationError("Feedback message is required")` when empty), validates `type` is one of `FEEDBACK_TYPES` (throws `ValidationError("Invalid feedback type")` otherwise), inserts via `supabaseAdmin`, returns the row.

## Decision 3 — Email helper (`src/lib/email.ts`)

Adds the `resend` dependency. Graceful when unconfigured (no throw, no send):

```ts
export function isEmailConfigured(): boolean; // !!process.env.RESEND_API_KEY

// Sends via Resend when configured; no-ops (returns { sent: false }) when not.
// Never throws on a missing key. From/to read from env with defaults.
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ sent: boolean }>;
```

- Uses `new Resend(process.env.RESEND_API_KEY)` and `resend.emails.send({ from, to, subject, text })`.
- `from` = `process.env.FEEDBACK_FROM_EMAIL ?? "Measure My Costume <feedback@measuremycostume.com>"`.
- Real send errors propagate (the caller decides whether to swallow them — the feedback route does).

## Decision 4 — Route (`POST /api/feedback`)

```ts
export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as { type?: string; message?: string };
    const userEmail = await getUserEmail(userId); // best-effort; null on failure
    const feedback = await createFeedback({
      orgId, userId, userEmail,
      type: String(body.type ?? ""),
      message: String(body.message ?? ""),
    });
    // Best-effort notification — never fail the request on an email problem.
    try {
      await sendEmail({
        to: process.env.FEEDBACK_TO_EMAIL ?? "support@measuremycostume.com",
        subject: `Measure My Costume feedback: ${FEEDBACK_TYPE_LABELS[feedback.type as FeedbackType] ?? feedback.type}`,
        text: feedbackEmailBody(feedback),
      });
    } catch { /* swallow: feedback is already persisted */ }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- `getUserEmail(userId)`: wraps the `clerkClient` lookup in try/catch, returns `string | null`.
- `feedbackEmailBody(feedback)`: a plain-text body with the type label, the message, and provenance (user email, user id, org id, timestamp). A small local helper.
- Success is determined solely by the DB insert. Email is best-effort.
- `createFeedback`'s `ValidationError` → `errorResponse` → `400`; `getAuthContext` failures → `401`/`403`.

## Decision 5 — UI (`src/components/FeedbackCard.tsx`)

A `"use client"` component rendered on the productions page directly after the User Guide card.

- Collapsed: a `surface` card with a "Submit feedback →" link (same visual family as the Guide card, lighter subcopy "Tell us what to fix or improve").
- Expanded (on click): an inline form with
  - three radio buttons for type (keys `fix`/`change`/`other`, labels from `FEEDBACK_TYPE_LABELS`), `fix` selected by default;
  - a `textarea` (the `field` class) for the message;
  - **Submit** (disabled while busy / when message is blank) and **Cancel**.
- `POST /api/feedback` with `{ type, message }`, `credentials: "include"`.
- On success: replace the form with "Thanks — we got your feedback." On error: inline `--red` message; the form stays open.

Labels/keys are imported from `src/lib/feedback-types.ts` (the pure module from Decision 2) so the form and the server share one source of truth without pulling `supabaseAdmin` into the client bundle.

## Decision 6 — Config (`.env.example`)

Add, with comments noting they're optional and the feature still records feedback to the DB without them:

```
# Resend (optional — enables emailing submitted feedback to support).
# Without it, feedback is still saved to the database; the email is skipped.
RESEND_API_KEY=
# Optional overrides for the feedback email addresses.
FEEDBACK_TO_EMAIL=
FEEDBACK_FROM_EMAIL=
```

## Testing (TDD)

- **`email.test.ts`**: `isEmailConfigured` reflects `RESEND_API_KEY`; `sendEmail` returns `{ sent: false }` and does not construct/call Resend when the key is missing; calls `resend.emails.send` with the right `to`/`subject`/`from` when configured (Resend SDK mocked like the Anthropic mock in `estimate-fabric.test.ts`).
- **`feedback.test.ts`** (data layer): `createFeedback` inserts the expected payload (chained-mock pattern); rejects an empty/whitespace message and an invalid type with `ValidationError`.
- **`route.test.ts`**: `201` saves feedback (mocks `createFeedback`, `sendEmail`, `getUserEmail`); **still `201` when `sendEmail` rejects** (best-effort); `400` on empty message / bad type (propagated `ValidationError`); `401` when signed out.
- **`FeedbackCard`**: no DOM test (node Vitest, no jsdom) — verified via `tsc --noEmit` + `npm run build`.

## Scope / non-goals

- No app-wide rename to "Measure My Costume" (separate task if wanted).
- No admin UI to browse feedback in-app (it's in the DB; can be added later).
- No file attachments, no rate limiting, no anonymous (signed-out) feedback.
- No SMS; email only.

## Rollout

1. TDD the data layer + email helper → route.
2. Build `FeedbackCard` and mount it under the Guide card (verified via tsc/build).
3. Add the `resend` dependency and the `.env.example` entries.
4. Apply `0026` to Supabase **only after** Chris's green light; commit locally; do not push/deploy until told. Setting `RESEND_API_KEY` + verifying the `measuremycostume.com` sending domain in Resend is Chris's config step (the feature records feedback regardless).
