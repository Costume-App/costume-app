# Costume App — Milestone 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js app with Clerk auth + Organizations and Supabase, so a signed-in user can see and create productions (each with a show date and a live countdown) scoped to their school/org.

**Architecture:** Next.js 16 App Router on the house stack. Auth + org context comes from Clerk; all data access is server-side through a service-role Supabase client. Pure logic (countdown formatting, auth-context resolution, data layer) is unit-tested with Vitest; pages are server components that call a thin data layer, and mutations go through auth-checked Route Handlers.

**Tech Stack:** Next.js 16, TypeScript (strict), Tailwind CSS 4, Clerk (`@clerk/nextjs`), Supabase (`@supabase/supabase-js`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-costume-app-design.md` (§3 architecture, §4 organizations + productions, §6 permissions, §7 productions list).

> **Next.js 16 note:** v16 has breaking changes from v14/v15 and uses `src/proxy.ts` (not `middleware.ts`). After scaffolding, before assuming any older pattern works, check `node_modules/next/dist/docs/` and Clerk's installed docs. Where this plan and the installed docs disagree, follow the installed docs and note the deviation in the commit.

---

## File structure (created in this milestone)

```
.
├── package.json, tsconfig.json, next.config.ts, postcss.config.mjs   # scaffold
├── vitest.config.ts                          # test runner config
├── .env.example                              # documents required env vars
├── supabase/migrations/0001_foundation.sql   # organizations + productions tables
├── src/
│   ├── proxy.ts                              # Clerk middleware (Next 16 name)
│   ├── app/
│   │   ├── layout.tsx                        # wraps app in <ClerkProvider>
│   │   ├── page.tsx                          # redirects to /productions
│   │   ├── globals.css                       # Tailwind entry (from scaffold)
│   │   ├── sign-in/[[...sign-in]]/page.tsx   # Clerk sign-in
│   │   ├── sign-up/[[...sign-up]]/page.tsx   # Clerk sign-up
│   │   ├── productions/
│   │   │   ├── page.tsx                      # productions list (server component)
│   │   │   └── new/page.tsx                  # new production form (client)
│   │   └── api/productions/route.ts          # GET list / POST create (auth-checked)
│   └── lib/
│       ├── countdown.ts                      # pure show-date → label logic
│       ├── countdown.test.ts
│       ├── auth-context.ts                   # resolve { userId, orgId } from Clerk
│       ├── auth-context.test.ts
│       ├── supabase-admin.ts                 # server-only service-role client
│       └── data/
│           ├── productions.ts               # list/create productions
│           └── productions.test.ts
```

---

## Task 1: Scaffold the Next.js 16 project + Vitest

The repo root already contains `.git/`, `.gitignore`, `docs/`, and the meeting PDF.
`create-next-app` refuses to run in a non-empty directory, so scaffold in a temp dir and
copy in.

**Files:**
- Create: all scaffold files (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`, etc.)
- Create: `vitest.config.ts`

- [ ] **Step 1: Scaffold into a temp directory**

Run:
```bash
npx create-next-app@latest /tmp/costume-scaffold \
  --typescript --tailwind --app --src-dir --eslint \
  --import-alias "@/*" --no-turbopack --use-npm --yes
```
Expected: a new Next.js 16 project at `/tmp/costume-scaffold`.

- [ ] **Step 2: Copy scaffold into the repo without clobbering existing files**

Run:
```bash
rsync -a --exclude='.git' --exclude='.gitignore' --exclude='README.md' \
  /tmp/costume-scaffold/ ./
```
Then merge the scaffold's gitignore lines into ours if any are missing (ours already
covers `node_modules`, `.next`, `.env*`, `.vercel`):
```bash
rm -rf /tmp/costume-scaffold
```
Expected: `package.json`, `src/app/`, `tsconfig.json` now exist at repo root; `docs/` and
the PDF untouched.

- [ ] **Step 3: Install dependencies and the test toolchain**

Run:
```bash
npm install
npm install -D vitest
```
Expected: install completes; `node_modules/` present (gitignored).

- [ ] **Step 4: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Foundation lands before any test files exist; keep the suite green until then.
    passWithNoTests: true,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 5: Add a test script to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Add a trivial smoke test and confirm Vitest runs**

Create `src/lib/smoke.test.ts`:
```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```
Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 7: Verify the dev build boots**

Run: `npm run build`
Expected: build succeeds (default scaffold page compiles).

- [ ] **Step 8: Commit**

```bash
rm -f src/lib/smoke.test.ts
git add -A
git commit -m "chore: scaffold Next.js 16 app with Tailwind 4 and Vitest"
```

---

## Task 2: Environment variables + Supabase admin client

**Files:**
- Create: `.env.example`
- Create: `.env.local` (local only — gitignored)
- Create: `src/lib/supabase-admin.ts`

- [ ] **Step 1: Document required env vars**

Create `.env.example`:
```bash
# Clerk (https://dashboard.clerk.com -> API Keys)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase (Project Settings -> API). Service role is server-only — never NEXT_PUBLIC.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Create your local env file**

Copy `.env.example` to `.env.local` and fill in real values from the Clerk and Supabase
dashboards. (Create a Clerk application with **Organizations enabled**, and a Supabase
project.) `.env.local` is already gitignored.

- [ ] **Step 3: Write the server-only Supabase client**

Create `src/lib/supabase-admin.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

// Service-role client. Bypasses RLS — only ever import from server code.
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
```

- [ ] **Step 4: Install the required packages**

Run:
```bash
npm install @supabase/supabase-js server-only
```
Expected: both packages added.

- [ ] **Step 5: Commit**

```bash
git add .env.example src/lib/supabase-admin.ts package.json package-lock.json
git commit -m "feat: add env template and server-only Supabase admin client"
```

---

## Task 3: Database schema — organizations + productions

We store an app-side `organizations` row keyed to the Clerk org id, plus `productions`.
Other tables come in later milestones.

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0001_foundation.sql`:
```sql
-- Organizations mirror Clerk orgs (id = Clerk org id). Billing-ready placeholders.
create table if not exists organizations (
  clerk_org_id text primary key,
  name         text not null,
  plan         text not null default 'free',
  plan_status  text not null default 'active',
  limits       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create table if not exists productions (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null references organizations(clerk_org_id) on delete cascade,
  created_by        text not null,                 -- Clerk user id
  title             text not null,
  show_date         date,
  play_template_id  uuid,                          -- FK added in a later milestone
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists productions_org_id_idx on productions(org_id);
```

- [ ] **Step 2: Apply the migration to your Supabase project**

In the Supabase dashboard → SQL Editor, paste and run the contents of
`supabase/migrations/0001_foundation.sql`.
Expected: both tables created (Table Editor shows `organizations` and `productions`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_foundation.sql
git commit -m "feat: add organizations and productions schema"
```

---

## Task 4: Countdown utility (TDD)

Pure function: given a show date and "today" (both `YYYY-MM-DD` strings, date-only, no
timezone math), return a human label and the day delta.

**Files:**
- Create: `src/lib/countdown.ts`
- Test: `src/lib/countdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/countdown.test.ts`:
```ts
import { expect, test } from "vitest";
import { countdown } from "@/lib/countdown";

test("future date shows days to go", () => {
  expect(countdown("2026-07-16", "2026-06-04")).toEqual({
    days: 42,
    label: "42 days to go",
    tone: "future",
  });
});

test("one day away is singular", () => {
  expect(countdown("2026-06-05", "2026-06-04").label).toBe("1 day to go");
});

test("same day opens today", () => {
  expect(countdown("2026-06-04", "2026-06-04")).toEqual({
    days: 0,
    label: "Opens today!",
    tone: "today",
  });
});

test("past date shows days since, singular at one", () => {
  expect(countdown("2026-06-03", "2026-06-04")).toEqual({
    days: -1,
    label: "Opened 1 day ago",
    tone: "past",
  });
  expect(countdown("2026-06-01", "2026-06-04").label).toBe("Opened 3 days ago");
});

test("no show date returns neutral label", () => {
  expect(countdown(null, "2026-06-04")).toEqual({
    days: null,
    label: "No date set",
    tone: "none",
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/countdown.test.ts`
Expected: FAIL with "Cannot find module '@/lib/countdown'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/countdown.ts`:
```ts
export type CountdownTone = "future" | "today" | "past" | "none";

export interface Countdown {
  days: number | null;
  label: string;
  tone: CountdownTone;
}

// Parse a YYYY-MM-DD string into a UTC-midnight epoch day count (no timezone drift).
function toEpochDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function countdown(showDate: string | null, today: string): Countdown {
  if (!showDate) {
    return { days: null, label: "No date set", tone: "none" };
  }
  const days = toEpochDay(showDate) - toEpochDay(today);
  if (days === 0) {
    return { days: 0, label: "Opens today!", tone: "today" };
  }
  if (days > 0) {
    const unit = days === 1 ? "day" : "days";
    return { days, label: `${days} ${unit} to go`, tone: "future" };
  }
  const ago = -days;
  const unit = ago === 1 ? "day" : "days";
  return { days, label: `Opened ${ago} ${unit} ago`, tone: "past" };
}

// Today's date as YYYY-MM-DD in the user's local timezone.
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/countdown.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/countdown.ts src/lib/countdown.test.ts
git commit -m "feat: add show-date countdown utility"
```

---

## Task 5: Auth-context helper (TDD)

A single place to resolve the current `{ userId, orgId }` from Clerk and fail closed.
Tests mock `@clerk/nextjs/server`.

**Files:**
- Create: `src/lib/auth-context.ts`
- Test: `src/lib/auth-context.test.ts`

- [ ] **Step 1: Install Clerk**

Run: `npm install @clerk/nextjs`
Expected: package added.

- [ ] **Step 2: Write the failing test**

Create `src/lib/auth-context.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

import { getAuthContext, AuthError } from "@/lib/auth-context";

beforeEach(() => authMock.mockReset());

test("returns userId and orgId when signed in with an org", async () => {
  authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
  await expect(getAuthContext()).resolves.toEqual({ userId: "user_1", orgId: "org_1" });
});

test("throws AuthError(401) when not signed in", async () => {
  authMock.mockResolvedValue({ userId: null, orgId: null });
  await expect(getAuthContext()).rejects.toMatchObject({ status: 401 });
});

test("throws AuthError(403) when signed in but no org selected", async () => {
  authMock.mockResolvedValue({ userId: "user_1", orgId: null });
  await expect(getAuthContext()).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/auth-context.test.ts`
Expected: FAIL with "Cannot find module '@/lib/auth-context'".

- [ ] **Step 4: Write the implementation**

Create `src/lib/auth-context.ts`:
```ts
import { auth } from "@clerk/nextjs/server";

export interface AuthContext {
  userId: string;
  orgId: string;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// Resolve the signed-in user and their active org, or fail closed.
export async function getAuthContext(): Promise<AuthContext> {
  const { userId, orgId } = await auth();
  if (!userId) throw new AuthError(401, "Not signed in");
  if (!orgId) throw new AuthError(403, "No active organization");
  return { userId, orgId };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/auth-context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth-context.ts src/lib/auth-context.test.ts package.json package-lock.json
git commit -m "feat: add Clerk auth-context helper that fails closed"
```

---

## Task 6: Productions data layer (TDD)

`listProductions(orgId)` and `createProduction(input)`. Tests mock `supabase-admin` so no
network is needed.

**Files:**
- Create: `src/lib/data/productions.ts`
- Test: `src/lib/data/productions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/productions.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const single = vi.fn();
const insertSelect = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: insertSelect }));
const from = vi.fn((_table: string) => ({ select, insert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listProductions, createProduction } from "@/lib/data/productions";

beforeEach(() => {
  [order, eq, select, single, insertSelect, insert, from].forEach((m) => m.mockReset());
  eq.mockReturnValue({ order });
  select.mockReturnValue({ eq });
  insertSelect.mockReturnValue({ single });
  insert.mockReturnValue({ select: insertSelect });
  from.mockReturnValue({ select, insert });
});

test("listProductions queries by org, ordered by show_date", async () => {
  order.mockResolvedValue({ data: [{ id: "p1", title: "Mary Poppins" }], error: null });
  const rows = await listProductions("org_1");
  expect(from).toHaveBeenCalledWith("productions");
  expect(eq).toHaveBeenCalledWith("org_id", "org_1");
  expect(order).toHaveBeenCalledWith("show_date", { ascending: true, nullsFirst: false });
  expect(rows).toEqual([{ id: "p1", title: "Mary Poppins" }]);
});

test("listProductions throws on supabase error", async () => {
  order.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listProductions("org_1")).rejects.toThrow("boom");
});

test("createProduction inserts the row and returns it", async () => {
  single.mockResolvedValue({ data: { id: "p2", title: "Newsies" }, error: null });
  const row = await createProduction({
    orgId: "org_1",
    createdBy: "user_1",
    title: "Newsies",
    showDate: "2026-11-01",
    notes: null,
  });
  expect(insert).toHaveBeenCalledWith({
    org_id: "org_1",
    created_by: "user_1",
    title: "Newsies",
    show_date: "2026-11-01",
    notes: null,
  });
  expect(row).toEqual({ id: "p2", title: "Newsies" });
});

test("createProduction rejects an empty title", async () => {
  await expect(
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "  ", showDate: null, notes: null }),
  ).rejects.toThrow("Title is required");
});

test("createProduction throws on supabase error", async () => {
  single.mockResolvedValue({ data: null, error: { message: "insert failed" } });
  await expect(
    createProduction({ orgId: "org_1", createdBy: "user_1", title: "Cats", showDate: null, notes: null }),
  ).rejects.toThrow("insert failed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/productions.test.ts`
Expected: FAIL with "Cannot find module '@/lib/data/productions'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/data/productions.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

export interface Production {
  id: string;
  org_id: string;
  created_by: string;
  title: string;
  show_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProductionInput {
  orgId: string;
  createdBy: string;
  title: string;
  showDate: string | null;
  notes: string | null;
}

export async function listProductions(orgId: string): Promise<Production[]> {
  const { data, error } = await supabaseAdmin
    .from("productions")
    .select("*")
    .eq("org_id", orgId)
    .order("show_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Production[];
}

export async function createProduction(input: CreateProductionInput): Promise<Production> {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const { data, error } = await supabaseAdmin
    .from("productions")
    .insert({
      org_id: input.orgId,
      created_by: input.createdBy,
      title,
      show_date: input.showDate,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Production;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/productions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/productions.ts src/lib/data/productions.test.ts
git commit -m "feat: add productions data layer (list/create)"
```

---

## Task 7: Productions API route (TDD)

`GET /api/productions` (list for the active org) and `POST /api/productions` (create).
Both go through `getAuthContext`. Before insert, `POST` ensures the org row exists.

**Files:**
- Create: `src/lib/data/organizations.ts`
- Create: `src/app/api/productions/route.ts`
- Test: `src/app/api/productions/route.test.ts`

- [ ] **Step 1: Write the org-upsert helper**

Create `src/lib/data/organizations.ts`:
```ts
import { supabaseAdmin } from "@/lib/supabase-admin";

// Ensure an app-side organizations row exists for this Clerk org.
export async function ensureOrganization(clerkOrgId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizations")
    .upsert({ clerk_org_id: clerkOrgId, name }, { onConflict: "clerk_org_id" });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Write the failing test**

Create `src/app/api/productions/route.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const listProductions = vi.fn();
const createProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  listProductions: (...a: unknown[]) => listProductions(...a),
  createProduction: (...a: unknown[]) => createProduction(...a),
}));

const ensureOrganization = vi.fn();
vi.mock("@/lib/data/organizations", () => ({
  ensureOrganization: (...a: unknown[]) => ensureOrganization(...a),
}));

import { GET, POST } from "@/app/api/productions/route";

beforeEach(() => {
  [getAuthContext, listProductions, createProduction, ensureOrganization].forEach((m) => m.mockReset());
});

function postReq(body: unknown) {
  return new Request("http://test/api/productions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("GET returns 401 when not signed in", async () => {
  const { AuthError } = await import("@/lib/auth-context");
  getAuthContext.mockRejectedValue(new AuthError(401, "Not signed in"));
  const res = await GET();
  expect(res.status).toBe(401);
});

test("GET returns productions for the org", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  listProductions.mockResolvedValue([{ id: "p1", title: "Mary Poppins" }]);
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ productions: [{ id: "p1", title: "Mary Poppins" }] });
  expect(listProductions).toHaveBeenCalledWith("org_1");
});

test("POST creates a production and returns 201", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockResolvedValue({ id: "p2", title: "Newsies" });
  const res = await POST(postReq({ title: "Newsies", showDate: "2026-11-01", orgName: "Lincoln HS" }));
  expect(res.status).toBe(201);
  expect(ensureOrganization).toHaveBeenCalledWith("org_1", "Lincoln HS");
  expect(createProduction).toHaveBeenCalledWith({
    orgId: "org_1",
    createdBy: "u1",
    title: "Newsies",
    showDate: "2026-11-01",
    notes: null,
  });
});

test("POST returns 400 when title missing", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createProduction.mockRejectedValue(new Error("Title is required"));
  const res = await POST(postReq({ showDate: null }));
  expect(res.status).toBe(400);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/app/api/productions/route.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/productions/route'".

- [ ] **Step 4: Write the route handler**

Create `src/app/api/productions/route.ts`:
```ts
import { NextResponse } from "next/server";
import { getAuthContext, AuthError } from "@/lib/auth-context";
import { listProductions, createProduction } from "@/lib/data/productions";
import { ensureOrganization } from "@/lib/data/organizations";

function errorResponse(err: unknown) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  const status = message === "Title is required" ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const { orgId } = await getAuthContext();
    const productions = await listProductions(orgId);
    return NextResponse.json({ productions });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, orgId } = await getAuthContext();
    const body = (await request.json()) as {
      title?: string;
      showDate?: string | null;
      notes?: string | null;
      orgName?: string;
    };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const production = await createProduction({
      orgId,
      createdBy: userId,
      title: body.title ?? "",
      showDate: body.showDate ?? null,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ production }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/productions/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites green).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/organizations.ts src/app/api/productions/route.ts src/app/api/productions/route.test.ts
git commit -m "feat: add auth-checked productions API route"
```

---

## Task 8: App shell — ClerkProvider, middleware, sign-in pages

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/proxy.ts`
- Create: `src/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `src/app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Wrap the app in ClerkProvider**

Replace `src/app/layout.tsx` with:
```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Costume Studio",
  description: "Plan costumes, casts, and fabric for your production.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Add Clerk middleware as `proxy.ts` (Next 16)**

Create `src/proxy.ts`:
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
```
> If `npm run dev` warns that middleware must be named `middleware.ts`, check
> `node_modules/next/dist/docs/` for the installed v16 convention and rename accordingly,
> noting it in the commit.

- [ ] **Step 3: Add the sign-in page**

Create `src/app/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 4: Add the sign-up page**

Create `src/app/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 5: Redirect the home page to productions**

Replace `src/app/page.tsx` with:
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/productions");
}
```

- [ ] **Step 6: Manually verify auth**

Run: `npm run dev`, open `http://localhost:3000`.
Expected: redirected to Clerk sign-in. After signing up/in and creating an organization
when prompted, you reach `/productions` (which 404s until Task 9 — that's expected here).

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/proxy.ts src/app/sign-in src/app/sign-up src/app/page.tsx
git commit -m "feat: add Clerk provider, route protection, and sign-in pages"
```

---

## Task 9: Productions list + new-production form (UI)

**Files:**
- Create: `src/app/productions/page.tsx`
- Create: `src/components/CountdownBadge.tsx`
- Create: `src/app/productions/new/page.tsx`

- [ ] **Step 1: Build the countdown badge**

Create `src/components/CountdownBadge.tsx`:
```tsx
import { countdown, todayIso } from "@/lib/countdown";

const toneClass: Record<string, string> = {
  future: "bg-emerald-100 text-emerald-800",
  today: "bg-amber-100 text-amber-900",
  past: "bg-gray-100 text-gray-500",
  none: "bg-gray-100 text-gray-400",
};

export function CountdownBadge({ showDate }: { showDate: string | null }) {
  const c = countdown(showDate, todayIso());
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${toneClass[c.tone]}`}>
      {c.label}
    </span>
  );
}
```

- [ ] **Step 2: Build the productions list page**

Create `src/app/productions/page.tsx`:
```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { listProductions } from "@/lib/data/productions";
import { CountdownBadge } from "@/components/CountdownBadge";

export default async function ProductionsPage() {
  const { orgId } = await getAuthContext();
  const productions = await listProductions(orgId);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productions</h1>
        <Link
          href="/productions/new"
          className="rounded-lg bg-black px-4 py-2 font-medium text-white"
        >
          + New Production
        </Link>
      </div>

      {productions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-gray-500">
          No productions yet. Create your first show to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {productions.map((p) => (
            <li key={p.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-semibold">{p.title}</span>
                <CountdownBadge showDate={p.show_date} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build the new-production form (client)**

Create `src/app/productions/new/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewProductionPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [showDate, setShowDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/productions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, showDate: showDate || null }),
    });
    if (res.ok) {
      router.push("/productions");
      router.refresh();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Something went wrong");
    setSaving(false);
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-bold">New Production</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-medium">Show title</span>
          <input
            className="w-full rounded-lg border p-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mary Poppins"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Show date</span>
          <input
            type="date"
            className="w-full rounded-lg border p-3"
            value={showDate}
            onChange={(e) => setShowDate(e.target.value)}
          />
        </label>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-black px-4 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Create production"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Manually verify the full flow**

Run: `npm run dev`. Signed in, go to `/productions`.
Expected: empty state. Click "+ New Production", enter "Mary Poppins" + a future date,
submit. You return to `/productions` and see the card with a green "N days to go" badge.
Add one with no date (neutral badge) and one with a past date (gray "Opened N days ago").

- [ ] **Step 5: Confirm tests and build still pass**

Run: `npm test && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/productions src/components/CountdownBadge.tsx
git commit -m "feat: add productions list and new-production form with countdown"
```

---

## Milestone 1 complete

A signed-in user belonging to an org can create productions (title + show date) and see
them listed with a live countdown, all scoped to their org, with the calc engine, roles,
casts, and sharing still to come.

**Next milestone (separate plan):** Performers + measurements + garment templates + the
deterministic fabric calc engine (Milestone 2 in spec §9) — the first real "how much
fabric" number, built test-first.

---

## Self-review notes

- **Spec coverage (this milestone):** §3 stack (Tasks 1–2, 8), §4 organizations +
  productions (Task 3, 6), §6 auth fail-closed + org scoping (Tasks 5, 7), §7 productions
  list + show date + countdown (Tasks 4, 9). Roles/casts/designs/pieces/engine/templates
  are intentionally deferred to later milestone plans per spec §9.
- **Placeholders:** none — every code/test step contains full content.
- **Type consistency:** `Production`, `CreateProductionInput`, `AuthContext`, `AuthError`,
  `Countdown`, `countdown()`/`todayIso()`, `listProductions()`/`createProduction()`,
  `ensureOrganization()`, and the `{ productions }` / `{ production }` API shapes are used
  consistently across data layer, route, tests, and UI.
