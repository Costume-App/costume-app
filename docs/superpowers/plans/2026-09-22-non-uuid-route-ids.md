# Non-UUID Route Ids Return 404 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dynamic API route and page answers a malformed (non-UUID) id with 404 instead of 500, and a contract test makes it impossible to add a dynamic route that skips the check.

**Architecture:** One helper module, `src/lib/route-params.ts`, reads Next's `params` promise and rejects any value that is not a canonical UUID: `idParams` throws `NotFoundError` (routes map it to 404 through `errorResponse`), `pageIdParams` calls `notFound()` (pages render the 404 page). Every `const { ... } = await params;` in a dynamic route or page becomes `await idParams(params)` / `await pageIdParams(params)`. A filesystem-walking contract test fails if any dynamic `route.ts` or `page.tsx` still reads `await params` directly.

**Tech Stack:** Next.js 16 App Router (async `params`), TypeScript, Vitest, Supabase (PostgREST).

**Spec:** No separate spec. This plan argues from the investigation below.

## Why (the investigation)

- Root cause: data-layer lookups do `throw new Error(error.message)` (118 sites). Postgres rejects a non-UUID in a `uuid` column with SQLSTATE `22P02`; the plain `Error` loses the code, and `errorResponse` (`src/lib/api.ts`) maps it to 500. Only `getPerformer` (`src/lib/data/performers.ts`) and the castings lookup handle `22P02` today.
- Measured 2026-09-22 against local `next dev` signed in, each bad id paired with a random well-formed UUID control: **65 of 77** route/method cases returned 500 across **37 of 39** dynamic API routes; every one of the 65 had a control of 404 or 200, so the id shape is the sole cause. Pages `/productions/not-a-uuid`, `/productions/not-a-uuid/summary`, and `/productions/<real>/performers/not-a-uuid` also 500.
- Separate defect folded into Task 6 because it is the same symptom in a file this plan edits: `/productions/<real>/performers/<well-formed unknown uuid>` returns 500, because `assertPerformerInOrg` throws `NotFoundError` and that page, unlike its siblings, does not catch it.
- Every table id in `supabase/migrations/` is `uuid primary key default gen_random_uuid()`. The one text-valued dynamic segment is `[token]` (`production_shares.token text`), which is out of scope and allowlisted.

## Global Constraints

- **No `any`** (`@typescript-eslint/no-explicit-any` fails lint).
- **NO EM-DASHES** anywhere: code, comments, test names, commit messages.
- Grep every file you wrote (not the diff) for em-dashes before committing: `grep -n "$(printf '\342\200\224')" <files>` must print nothing.
- Stage files by name only. Never `git add -A`, `-u`, or `.`. Never stage `docs/billing-phase2-stripe-runbook.md` (the owner's uncommitted edit).
- Quote bracketed paths in shell: `git add 'src/app/api/productions/[id]/route.ts'`.
- Do not push, merge, or deploy.
- Keep each route's existing statement order. Only the `await params` line changes; `getAuthContext()` still runs first where it did before.
- Canonical UUID regex, used verbatim: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.
- Test fixture UUIDs follow one pattern so they are readable: production `11111111-1111-4111-8111-111111111111`, then `22222222-2222-4222-8222-222222222222`, `33333333-3333-4333-8333-333333333333`, and so on for each further id in the same file.
- Verification commands: `npx vitest run <paths>` for targeted runs, `npx tsc --noEmit && echo OK`, `npx eslint <paths> && echo LINT_OK`.

## The route conversion recipe (applies to Tasks 2 to 5)

For each listed `route.ts`:

1. Add `import { idParams } from "@/lib/route-params";` next to the other `@/lib` imports.
2. Replace every `const { <names> } = await params;` with `const { <names> } = await idParams(params);`. Change nothing else.

For each listed `route.test.ts` (the file sits next to its route):

1. Near the top, after the mocks, declare one constant per fake id that the test passes through its `ctx` factory, named after the label it replaces, using the fixture UUID pattern. Example: `"p1"` becomes `const P1 = "11111111-1111-4111-8111-111111111111";`, `"r1"` becomes `const R1 = "22222222-2222-4222-8222-222222222222";`.
2. Replace that string literal with the constant everywhere in the file where it denotes the same entity (ctx calls, `toHaveBeenCalledWith` expectations, mock return values such as `{ id: "p1" }`). Read each occurrence; a literal that denotes something else (for example a body field or a storage path segment unrelated to the param) is left alone, but a storage path built from the param id must change with it.
3. Add one test per dynamic segment of that route proving the malformed id is rejected before the data layer runs. Use the file's first exported handler and its existing `ctx` factory and request helper. Template (for a file whose ctx takes `(id, roleId)` and whose first handler is `DELETE`):

```ts
test("DELETE returns 404 for a non-UUID production id without touching data", async () => {
  const res = await DELETE(req(), ctx("not-a-uuid", R1));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});

test("DELETE returns 404 for a non-UUID role id without touching data", async () => {
  const res = await DELETE(req(), ctx(P1, "not-a-uuid"));
  expect(res.status).toBe(404);
  expect(assertProductionInOrg).not.toHaveBeenCalled();
});
```

   The `not.toHaveBeenCalled()` target is the first data-layer mock the handler calls after reading params (usually `assertProductionInOrg`; for non-production routes, whatever data function the handler calls first). If the handler reads the request body before params, pass a body that passes validation so the 404 is attributable to the id.

---

### Task 1: The `route-params` helper

**Files:**
- Create: `src/lib/route-params.ts`
- Test: `src/lib/route-params.test.ts`

**Interfaces:**
- Consumes: `NotFoundError` from `@/lib/errors`; `notFound` from `next/navigation`.
- Produces:
  - `isUuid(value: string): boolean`
  - `idParams<T extends Record<string, string>>(params: Promise<T>): Promise<T>`: resolves the params, throws `NotFoundError("Not found")` if any value is not a canonical UUID.
  - `pageIdParams<T extends Record<string, string>>(params: Promise<T>): Promise<T>`: same check, but calls `notFound()` instead of throwing `NotFoundError`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import { isUuid, idParams, pageIdParams } from "@/lib/route-params";
import { NotFoundError } from "@/lib/errors";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("isUuid accepts canonical UUIDs in either case", () => {
  expect(isUuid(A)).toBe(true);
  expect(isUuid("ABCDEF01-2345-4678-9ABC-DEF012345678")).toBe(true);
});

test("isUuid rejects malformed values", () => {
  for (const v of ["", "not-a-uuid", "p1", `${A} `, `{${A}}`, A.replace(/-/g, ""), `${A}0`]) {
    expect(isUuid(v)).toBe(false);
  }
});

test("idParams returns the params when every value is a UUID", async () => {
  await expect(idParams(Promise.resolve({ id: A, roleId: B }))).resolves.toEqual({ id: A, roleId: B });
});

test("idParams throws NotFoundError when any value is malformed", async () => {
  await expect(idParams(Promise.resolve({ id: A, roleId: "nope" }))).rejects.toBeInstanceOf(NotFoundError);
  await expect(idParams(Promise.resolve({ id: "nope" }))).rejects.toBeInstanceOf(NotFoundError);
});

test("pageIdParams returns valid params without calling notFound", async () => {
  notFound.mockClear();
  await expect(pageIdParams(Promise.resolve({ id: A }))).resolves.toEqual({ id: A });
  expect(notFound).not.toHaveBeenCalled();
});

test("pageIdParams calls notFound for a malformed value", async () => {
  notFound.mockClear();
  await expect(pageIdParams(Promise.resolve({ id: "nope" }))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/route-params.test.ts`
Expected: FAIL, cannot resolve `@/lib/route-params`.

- [ ] **Step 3: Write the implementation**

```ts
import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";

// Every table id is a uuid. A malformed id in a URL would otherwise reach Postgres,
// fail with 22P02, and surface as a 500; reject it here as not found instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Route handlers: resolves dynamic params, throwing NotFoundError (404) on a malformed id.
export async function idParams<T extends Record<string, string>>(params: Promise<T>): Promise<T> {
  const resolved = await params;
  for (const value of Object.values(resolved)) {
    if (!isUuid(value)) throw new NotFoundError("Not found");
  }
  return resolved;
}

// Pages: same check, rendering the 404 page instead of throwing.
export async function pageIdParams<T extends Record<string, string>>(params: Promise<T>): Promise<T> {
  try {
    return await idParams(params);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/route-params.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Typecheck, lint, em-dash grep, commit**

```bash
npx tsc --noEmit && echo OK
npx eslint src/lib/route-params.ts src/lib/route-params.test.ts && echo LINT_OK
grep -n "$(printf '\342\200\224')" src/lib/route-params.ts src/lib/route-params.test.ts
git add src/lib/route-params.ts src/lib/route-params.test.ts
git commit -m "feat(routes): idParams/pageIdParams reject malformed ids as not found"
```

---

### Task 2: Production, role, and design routes

**Files (apply the conversion recipe above):**
- Modify routes:
  - `src/app/api/productions/[id]/route.ts`
  - `src/app/api/productions/[id]/roles/route.ts`
  - `src/app/api/productions/[id]/roles/[roleId]/route.ts`
  - `src/app/api/productions/[id]/roles/[roleId]/images/route.ts`
  - `src/app/api/productions/[id]/roles/[roleId]/images/[imageId]/route.ts`
  - `src/app/api/productions/[id]/designs/route.ts`
  - `src/app/api/productions/[id]/designs/[designId]/route.ts`
  - `src/app/api/productions/[id]/designs/[designId]/images/route.ts`
  - `src/app/api/productions/[id]/designs/[designId]/images/[imageId]/route.ts` (no test file; covered by Task 5's contract test)
- Modify tests: the `route.test.ts` beside each of the first eight routes.

**Interfaces:**
- Consumes: `idParams` from `@/lib/route-params` (Task 1).
- Produces: nothing new.

The conversion recipe (repeated so this task stands alone): in each route add `import { idParams } from "@/lib/route-params";` and change every `const { <names> } = await params;` to `const { <names> } = await idParams(params);`, nothing else. In each test, replace the fake ids passed through `ctx` with fixture-UUID constants (`const P1 = "11111111-1111-4111-8111-111111111111";`, `const R1 = "22222222-2222-4222-8222-222222222222";`, and so on), everywhere they denote the same entity, and add one "returns 404 for a non-UUID <segment> id without touching data" test per dynamic segment, asserting `res.status === 404` and that the first data mock was not called (template in "The route conversion recipe" section).

- [ ] **Step 1: Write the failing tests.** In each of the eight test files, add the per-segment 404 tests only (do not convert fixtures yet).
- [ ] **Step 2: Run to verify they fail.** `npx vitest run 'src/app/api/productions/[id]/route.test.ts' 'src/app/api/productions/[id]/roles' 'src/app/api/productions/[id]/designs'`. Expected: the new 404 tests FAIL (the routes return other statuses); existing tests pass.
- [ ] **Step 3: Convert the nine routes** to `idParams`.
- [ ] **Step 4: Run again.** Expected: the new 404 tests pass, and existing tests that pass fake ids like `"p1"` now FAIL with 404. This confirms the guard is live.
- [ ] **Step 5: Convert fixture ids** in the eight test files to UUID constants.
- [ ] **Step 6: Run to verify all pass.** Same command as Step 2. Expected: PASS, no skipped tests.
- [ ] **Step 7: Typecheck, lint, em-dash grep, commit.**

```bash
npx tsc --noEmit && echo OK
npx eslint 'src/app/api/productions/[id]' && echo LINT_OK
grep -rn "$(printf '\342\200\224')" 'src/app/api/productions/[id]/route.ts' 'src/app/api/productions/[id]/route.test.ts' 'src/app/api/productions/[id]/roles' 'src/app/api/productions/[id]/designs'
git add <each modified file by name, quoted>
git commit -m "fix(routes): production, role, design routes 404 on malformed ids"
```

---

### Task 3: Castings, casts, show dates, shares, pieces

**Files (apply the conversion recipe):**
- Modify routes:
  - `src/app/api/productions/[id]/castings/route.ts`
  - `src/app/api/productions/[id]/castings/[castingId]/route.ts`
  - `src/app/api/productions/[id]/casts/route.ts`
  - `src/app/api/productions/[id]/casts/[castId]/route.ts`
  - `src/app/api/productions/[id]/show-dates/route.ts`
  - `src/app/api/productions/[id]/show-dates/[dateId]/route.ts`
  - `src/app/api/productions/[id]/shares/route.ts`
  - `src/app/api/productions/[id]/shares/[shareId]/route.ts` (no test file)
  - `src/app/api/productions/[id]/shares/[shareId]/resend/route.ts` (no test file)
  - `src/app/api/productions/[id]/pieces/route.ts`
  - `src/app/api/productions/[id]/pieces/to-inventory/route.ts`
- Modify tests: the `route.test.ts` beside each route that has one (9 files).

**Interfaces:**
- Consumes: `idParams` from `@/lib/route-params` (Task 1).
- Produces: nothing new.

The conversion recipe (repeated so this task stands alone): in each route add `import { idParams } from "@/lib/route-params";` and change every `const { <names> } = await params;` to `const { <names> } = await idParams(params);`, nothing else. In each test, replace the fake ids passed through `ctx` with fixture-UUID constants (`const P1 = "11111111-1111-4111-8111-111111111111";`, `const C1 = "22222222-2222-4222-8222-222222222222";`, and so on), everywhere they denote the same entity, and add one "returns 404 for a non-UUID <segment> id without touching data" test per dynamic segment, asserting `res.status === 404` and that the first data mock was not called. Note: `shares/route.test.ts` has three `Promise.resolve` sites; convert each. `casts/[castId]` PATCH and DELETE validate the body first, so its 404 tests must send a valid body.

- [ ] **Step 1: Write the failing tests** (per-segment 404 tests only, in the 9 test files).
- [ ] **Step 2: Run to verify they fail.** `npx vitest run 'src/app/api/productions/[id]/castings' 'src/app/api/productions/[id]/casts' 'src/app/api/productions/[id]/show-dates' 'src/app/api/productions/[id]/shares' 'src/app/api/productions/[id]/pieces'`. Expected: new 404 tests FAIL.
- [ ] **Step 3: Convert the eleven routes** to `idParams`.
- [ ] **Step 4: Run again.** Expected: new tests pass; fake-id tests fail with 404.
- [ ] **Step 5: Convert fixture ids** to UUID constants.
- [ ] **Step 6: Run to verify all pass.** Same command as Step 2.
- [ ] **Step 7: Typecheck, lint, em-dash grep, commit.**

```bash
npx tsc --noEmit && echo OK
npx eslint 'src/app/api/productions/[id]' && echo LINT_OK
grep -rn "$(printf '\342\200\224')" 'src/app/api/productions/[id]/castings' 'src/app/api/productions/[id]/casts' 'src/app/api/productions/[id]/show-dates' 'src/app/api/productions/[id]/shares' 'src/app/api/productions/[id]/pieces'
git add <each modified file by name, quoted>
git commit -m "fix(routes): casting, cast, show-date, share, piece routes 404 on malformed ids"
```

---

### Task 4: Import, AI, and combine routes

**Files (apply the conversion recipe):**
- Modify routes:
  - `src/app/api/productions/[id]/cast-import/apply/route.ts`
  - `src/app/api/productions/[id]/cast-import/parse/route.ts`
  - `src/app/api/productions/[id]/measurement-import/apply/route.ts`
  - `src/app/api/productions/[id]/measurement-import/context/route.ts`
  - `src/app/api/productions/[id]/measurement-import/parse/route.ts`
  - `src/app/api/productions/[id]/estimate-fabric/route.ts`
  - `src/app/api/productions/[id]/suggest-roles/route.ts`
  - `src/app/api/productions/[id]/performers/combine/route.ts`
- Modify tests: the `route.test.ts` beside each (8 files).

**Interfaces:**
- Consumes: `idParams` from `@/lib/route-params` (Task 1).
- Produces: nothing new.

The conversion recipe (repeated so this task stands alone): in each route add `import { idParams } from "@/lib/route-params";` and change every `const { <names> } = await params;` to `const { <names> } = await idParams(params);`, nothing else. In each test, replace the fake production id passed through `ctx` with `const P1 = "11111111-1111-4111-8111-111111111111";` everywhere it denotes the production, and add one "returns 404 for a non-UUID production id without touching data" test asserting `res.status === 404` and that the first data mock (or the AI client mock, if the handler calls it before any data function) was not called. Several of these files already contain UUIDs for body-carried ids; pick fixture constants that do not collide with them. Parse routes take multipart bodies; build the 404 test's request the same way the file's existing tests do.

- [ ] **Step 1: Write the failing tests** (8 files).
- [ ] **Step 2: Run to verify they fail.** `npx vitest run 'src/app/api/productions/[id]/cast-import' 'src/app/api/productions/[id]/measurement-import' 'src/app/api/productions/[id]/estimate-fabric' 'src/app/api/productions/[id]/suggest-roles' 'src/app/api/productions/[id]/performers'`. Expected: new 404 tests FAIL.
- [ ] **Step 3: Convert the eight routes.**
- [ ] **Step 4: Run again.** Expected: new tests pass; fake-id tests fail with 404.
- [ ] **Step 5: Convert fixture ids.**
- [ ] **Step 6: Run to verify all pass.** Same command as Step 2.
- [ ] **Step 7: Typecheck, lint, em-dash grep, commit.**

```bash
npx tsc --noEmit && echo OK
npx eslint 'src/app/api/productions/[id]' && echo LINT_OK
grep -rn "$(printf '\342\200\224')" 'src/app/api/productions/[id]/cast-import' 'src/app/api/productions/[id]/measurement-import' 'src/app/api/productions/[id]/estimate-fabric' 'src/app/api/productions/[id]/suggest-roles' 'src/app/api/productions/[id]/performers'
git add <each modified file by name, quoted>
git commit -m "fix(routes): import, AI, and combine routes 404 on malformed ids"
```

---

### Task 5: Org-scoped routes (inventory, makers, fabric settings, performers, pieces)

**Files (apply the conversion recipe):**
- Modify routes:
  - `src/app/api/inventory/[itemId]/route.ts`
  - `src/app/api/inventory/[itemId]/usage/route.ts`
  - `src/app/api/inventory/[itemId]/images/route.ts` (no test file)
  - `src/app/api/inventory/[itemId]/images/[imageId]/route.ts` (no test file)
  - `src/app/api/makers/[makerId]/route.ts`
  - `src/app/api/org/fabric-settings/suppliers/[id]/route.ts` (no test file)
  - `src/app/api/org/fabric-settings/widths/[id]/route.ts` (no test file)
  - `src/app/api/performers/[performerId]/route.ts`
  - `src/app/api/performers/[performerId]/measurements/route.ts`
  - `src/app/api/pieces/[pieceId]/route.ts`
- Modify tests: the `route.test.ts` beside each route that has one (6 files).

**Interfaces:**
- Consumes: `idParams` from `@/lib/route-params` (Task 1).
- Produces: nothing new.

The conversion recipe (repeated so this task stands alone): in each route add `import { idParams } from "@/lib/route-params";` and change every `const { <names> } = await params;` to `const { <names> } = await idParams(params);`, nothing else. In each test, replace the fake id passed through `ctx` with a fixture-UUID constant (`const I1 = "11111111-1111-4111-8111-111111111111";`, `const M1 = ...`, named after the label replaced) everywhere it denotes the same entity, and add one "returns 404 for a non-UUID <segment> id without touching data" test asserting `res.status === 404` and that the first data mock was not called. `pieces/[pieceId]` PATCH validates the body first, so its 404 test must send a valid body. `makers/[makerId]` PATCH and the fabric-settings PATCH handlers already return 404 on a bad id through a different path; the DELETE handlers are the ones that 500 today.

- [ ] **Step 1: Write the failing tests** (6 files).
- [ ] **Step 2: Run to verify they fail.** `npx vitest run src/app/api/inventory src/app/api/makers src/app/api/performers src/app/api/pieces`. Expected: new 404 tests FAIL.
- [ ] **Step 3: Convert the ten routes.**
- [ ] **Step 4: Run again.** Expected: new tests pass; fake-id tests fail with 404.
- [ ] **Step 5: Convert fixture ids.**
- [ ] **Step 6: Run to verify all pass.** Same command as Step 2.
- [ ] **Step 7: Typecheck, lint, em-dash grep, commit.**

```bash
npx tsc --noEmit && echo OK
npx eslint src/app/api/inventory src/app/api/makers src/app/api/org src/app/api/performers src/app/api/pieces && echo LINT_OK
grep -rn "$(printf '\342\200\224')" src/app/api/inventory src/app/api/makers src/app/api/org/fabric-settings src/app/api/performers src/app/api/pieces
git add <each modified file by name, quoted>
git commit -m "fix(routes): org-scoped routes 404 on malformed ids"
```

---

### Task 6: Pages, the performer-page not-found fix, and the contract test

**Files:**
- Modify: `src/app/(app)/productions/[id]/page.tsx`
- Modify: `src/app/(app)/productions/[id]/summary/page.tsx`
- Modify: `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx`
- Create: `src/app/dynamic-route-ids.test.ts`

**Interfaces:**
- Consumes: `pageIdParams` from `@/lib/route-params` (Task 1); `NotFoundError` from `@/lib/errors`; `notFound` from `next/navigation`.
- Produces: the contract test, which fails for any future dynamic route or page that reads `await params` directly.

- [ ] **Step 1: Write the contract test (it fails now only if Tasks 2 to 5 missed a file; the three pages make it fail regardless).**

```ts
import { expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Every dynamic segment in this app is a uuid, except share tokens (text).
// A dynamic route or page that reads `await params` directly would pass a
// malformed id to Postgres and 500; it must go through idParams/pageIdParams.
const APP_DIR = path.resolve(__dirname);
const TEXT_PARAM_FILES = new Set([
  "api/shares/[token]/accept/route.ts",
  "(app)/share/[token]/page.tsx",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const dynamicFiles = walk(APP_DIR)
  .map((f) => path.relative(APP_DIR, f).split(path.sep).join("/"))
  .filter((rel) => /(^|\/)route\.ts$|(^|\/)page\.tsx$/.test(rel))
  .filter((rel) => rel.includes("["))
  .filter((rel) => !rel.includes("[[..."))
  .filter((rel) => !TEXT_PARAM_FILES.has(rel));

test("the walk finds every dynamic route and page", () => {
  // 38 uuid-param API routes + 3 pages. A drop means the walk broke, not that files vanished.
  expect(dynamicFiles.length).toBeGreaterThanOrEqual(41);
});

test.each(dynamicFiles)("%s reads its params through idParams or pageIdParams", (rel) => {
  const src = readFileSync(path.join(APP_DIR, rel), "utf8");
  expect(src).not.toMatch(/await\s+params\b/);
  const helper = rel.endsWith("page.tsx") ? "pageIdParams(params)" : "idParams(params)";
  expect(src).toContain(helper);
});
```

- [ ] **Step 2: Run to verify it fails on exactly the three pages.**

Run: `npx vitest run src/app/dynamic-route-ids.test.ts`
Expected: FAIL for the three `page.tsx` files only. Any failing `route.ts` means a route was missed in Tasks 2 to 5: convert it before continuing and note it in the report.

- [ ] **Step 3: Convert the productions and summary pages.** In each, add `import { pageIdParams } from "@/lib/route-params";` and change `const { id } = await params;` to `const { id } = await pageIdParams(params);`. Leave their existing `try { assertProductionInOrg } catch NotFoundError -> notFound()` blocks in place.

- [ ] **Step 4: Convert the performer page and catch its not-found.** In `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx`: add `import { notFound } from "next/navigation";`, `import { NotFoundError } from "@/lib/errors";`, and `import { pageIdParams } from "@/lib/route-params";`, then replace

```ts
  const { id, performerId } = await params;
```

with

```ts
  const { id, performerId } = await pageIdParams(params);
```

and replace

```ts
  const production = await assertProductionInOrg(orgId, id);
  await assertPerformerInOrg(orgId, performerId);
```

with

```ts
  let production;
  try {
    production = await assertProductionInOrg(orgId, id);
    await assertPerformerInOrg(orgId, performerId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
```

- [ ] **Step 5: Run the contract test and the full suite.**

```bash
npx vitest run src/app/dynamic-route-ids.test.ts
npx tsc --noEmit && echo OK
npx vitest run
```

Expected: contract test PASS (41+ files plus the count test); full suite PASS with no failures (baseline before this plan: 148 files, 1068 tests; expect more).

- [ ] **Step 6: Lint, em-dash grep, commit.**

```bash
npx eslint 'src/app/(app)/productions' src/app/dynamic-route-ids.test.ts && echo LINT_OK
grep -rn "$(printf '\342\200\224')" 'src/app/(app)/productions/[id]/page.tsx' 'src/app/(app)/productions/[id]/summary/page.tsx' 'src/app/(app)/productions/[id]/performers/[performerId]/page.tsx' src/app/dynamic-route-ids.test.ts
git add 'src/app/(app)/productions/[id]/page.tsx' 'src/app/(app)/productions/[id]/summary/page.tsx' 'src/app/(app)/productions/[id]/performers/[performerId]/page.tsx' src/app/dynamic-route-ids.test.ts
git commit -m "fix(pages): malformed or unknown ids render 404; contract test enforces idParams"
```

---

## Final verification (controller, after all tasks)

Re-run the same live probe that measured the defect (signed-in `adminpass` session against local `next dev` on 6100): every `bad=` column must be 404 or 400 (never 500), every `ctrl=` column unchanged from the baseline (404, 400, or 200), and the four page URLs must return 404, including `/productions/<real>/performers/<well-formed unknown uuid>`. Report the before and after counts (65 of 77 route cases and 4 pages at 500 before).

## Out of scope (recorded, not fixed here)

- Malformed ids carried in request **bodies** (for example a `roleId` field) still reach the data layer and can 500. They were not measured. A follow-up would either validate at each body parser or map `22P02` in the data layer.
- DELETE on a well-formed but unknown id returns 200 for makers, fabric suppliers and widths, shares, and show dates (idempotent delete). Pre-existing, not a 500, not changed.
