# My Work = per-production Costume Creations (filtered) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `/my-work` as a section per production the user's maker has make-work in, each showing the full `TailorSummary` filtered to that user's pieces, under a heading that links to the production.

**Architecture:** A `makerId` filter is added to `buildMakeWorklist`; `TailorSummary` gains a `filterMakerId` prop. The summary page's per-production data assembly is extracted into a shared `loadCostumeCreationsData(orgId, production)` loader, reused by both Costume Creations and the rewritten My Work page.

**Tech Stack:** Next.js 16 App Router (server components), Supabase data layer, Clerk auth, TypeScript strict, Vitest.

---

## File Structure

| File | Change |
|------|--------|
| `src/lib/tailor-summary.ts` | `buildMakeWorklist` optional `{ makerId }` filter |
| `src/lib/tailor-summary.test.ts` | tests for the filter |
| `src/components/TailorSummary.tsx` | `filterMakerId?` prop → builder |
| `src/lib/data/costume-creations.ts` | **new** — `loadCostumeCreationsData` |
| `src/app/(app)/productions/[id]/summary/page.tsx` | use the shared loader (no behavior change) |
| `src/app/(app)/my-work/page.tsx` | **rewrite** — filtered per-production sections + title links |
| `src/components/MyWorkList.tsx` | **delete** |

---

## Task 1: `buildMakeWorklist` maker filter (TDD)

**Files:**
- Modify: `src/lib/tailor-summary.ts`
- Test: `src/lib/tailor-summary.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/tailor-summary.test.ts` (the fixtures `roles`, `designs`, `castings`, `performers`, `casts`, and the `row(...)` helper already exist in this file):

```ts
test("buildMakeWorklist: makerId filter includes only that maker's pieces", () => {
  const pieces = [
    row({ costume_design_id: "d1", casting_id: "c1", maker_id: "m1" }),
    row({ costume_design_id: "d1", casting_id: "c2", maker_id: "m2" }),
    row({ costume_design_id: "d2", casting_id: "c1", maker_id: "m1", made: true }),
  ];
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, pieces, { makerId: "m1" });
  expect(wl.totalItems).toBe(2);
  expect(wl.madeItems).toBe(1);
  const items = wl.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
  expect(items.every((i) => i.makerId === "m1")).toBe(true);
});

test("buildMakeWorklist: makerId filter excludes lazy/no-maker items", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, [], { makerId: "m1" });
  expect(wl.totalItems).toBe(0);
  expect(wl.roles).toEqual([]);
});

test("buildMakeWorklist: no makerId keeps the whole-production behavior", () => {
  const wl = buildMakeWorklist(roles, designs, castings, performers, casts, []);
  expect(wl.totalItems).toBe(5); // unchanged lazy-default count
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `buildMakeWorklist` doesn't accept a 7th arg / doesn't filter.

- [ ] **Step 3: Implement**

In `src/lib/tailor-summary.ts`, add the optional param to the signature (after `pieces: PieceRow[],`):
```ts
export function buildMakeWorklist(
  roles: RoleLike[],
  designs: DesignLike[],
  castings: CastingLike[],
  performers: PerformerLike[],
  casts: CastLike[],
  pieces: PieceRow[],
  opts: { makerId?: string } = {},
): Worklist {
```

Then add the filter immediately after the existing source guard. Change:
```ts
        if (source !== "make") continue; // only make pieces are tailor work (on_hand/shared/purchase excluded)
        const made = row?.made ?? false;
```
to:
```ts
        if (source !== "make") continue; // only make pieces are tailor work (on_hand/shared/purchase excluded)
        if (opts.makerId && row?.maker_id !== opts.makerId) continue; // My Work: only this maker's pieces
        const made = row?.made ?? false;
```

(Lazy/no-row items have `row?.maker_id === undefined`, so they're excluded when `opts.makerId` is set.)

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat: buildMakeWorklist optional makerId filter"
```

---

## Task 2: `TailorSummary` filterMakerId prop

**Files:**
- Modify: `src/components/TailorSummary.tsx`

- [ ] **Step 1: Add the prop**

Add `filterMakerId?: string;` to the props type (e.g. after `today: string;` in the destructure type), and to the destructured params (after `today,`).

- [ ] **Step 2: Pass it into the builder**

Change:
```tsx
  const worklist = useMemo(
    () => buildMakeWorklist(roles, designs, castings, performers, casts, pieces),
    [roles, designs, castings, performers, casts, pieces],
  );
```
to:
```tsx
  const worklist = useMemo(
    () => buildMakeWorklist(roles, designs, castings, performers, casts, pieces, { makerId: filterMakerId }),
    [roles, designs, castings, performers, casts, pieces, filterMakerId],
  );
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` (clean), `npm run lint` (no new errors).
```bash
git add src/components/TailorSummary.tsx
git commit -m "feat: TailorSummary filterMakerId prop (filters the whole view to one maker)"
```

---

## Task 3: Shared `loadCostumeCreationsData` loader + summary-page refactor

**Files:**
- Create: `src/lib/data/costume-creations.ts`
- Modify: `src/app/(app)/productions/[id]/summary/page.tsx`

- [ ] **Step 1: Create the loader**

Create `src/lib/data/costume-creations.ts`:

```ts
import { listRoles } from "@/lib/data/roles";
import { listCasts } from "@/lib/data/casts";
import { listCastings } from "@/lib/data/castings";
import { listPerformers, getMeasurementsForPerformers } from "@/lib/data/performers";
import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { listCostumePieces } from "@/lib/data/costume-pieces";
import { listRoleImagesForRoles } from "@/lib/data/role-images";
import { signRoleImageUrls } from "@/lib/storage";
import { listMakers } from "@/lib/data/makers";
import { buildMeasurementsByCasting } from "@/lib/tailor-summary";
import type { Production } from "@/lib/data/productions";
import type { RolePhoto } from "@/components/RolePhotoStrip";

// Assembles everything <TailorSummary> needs for one production. Shared by the
// Costume Creations page and the My Work page (which calls it per production).
export async function loadCostumeCreationsData(orgId: string, production: Production) {
  const id = production.id;
  const [casts, roles, castings, performers] = await Promise.all([
    listCasts(id),
    listRoles(id),
    listCastings(id),
    listPerformers(id),
  ]);
  const designs = await listCostumeDesigns(id);
  const pieces = await listCostumePieces(designs.map((d) => d.id));

  const roleImages = await listRoleImagesForRoles(roles.map((r) => r.id));
  const imageUrls = await signRoleImageUrls(roleImages.map((i) => i.storage_path));
  const photosByRole: Record<string, RolePhoto[]> = {};
  for (const img of roleImages) {
    (photosByRole[img.role_id] ??= []).push({ id: img.id, url: imageUrls[img.storage_path] ?? null });
  }

  const [definitions, measurements] = await Promise.all([
    listMeasurementDefinitions(),
    getMeasurementsForPerformers(performers.map((p) => p.id)),
  ]);
  const measurementsByCasting = buildMeasurementsByCasting(definitions, measurements, castings);
  const makers = await listMakers(orgId);

  return {
    productionId: id,
    roles: roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes })),
    designs: designs.map((d) => ({
      id: d.id,
      role_id: d.role_id,
      name: d.name,
      display_order: d.display_order,
      inventory_item_id: d.inventory_item_id,
    })),
    castings: castings.map((c) => ({
      id: c.id,
      cast_id: c.cast_id,
      role_id: c.role_id,
      performer_id: c.performer_id,
      assignment: c.assignment,
    })),
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    casts: casts.map((c) => ({ id: c.id, name: c.name })),
    initialPieces: pieces,
    photosByRole,
    measurementsByCasting,
    makers: makers.map((m) => ({ id: m.id, name: m.name, color: m.color })),
    costumesDueDate: production.costumes_due_date,
  };
}
```

- [ ] **Step 2: Refactor the summary page to use it (no behavior change)**

Replace the body of `src/app/(app)/productions/[id]/summary/page.tsx` from the data-loading down to the return. The full new file:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { todayIso } from "@/lib/countdown";
import { NotFoundError } from "@/lib/errors";
import { TailorSummary } from "@/components/TailorSummary";

export default async function TailorSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { id } = await params;

  let production;
  try {
    production = await assertProductionInOrg(orgId, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const data = await loadCostumeCreationsData(orgId, production);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/productions/${id}`} className="link-muted text-sm">
        ← {production.title}
      </Link>
      <h1 className="mt-2 mb-6 font-display text-2xl font-semibold">Costume Creations</h1>
      <TailorSummary {...data} today={todayIso()} />
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (clean — the loader's return shape matches `TailorSummary`'s props), `npm run lint` (no new errors), `npx vitest run` (green).

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/costume-creations.ts "src/app/(app)/productions/[id]/summary/page.tsx"
git commit -m "refactor: extract loadCostumeCreationsData; summary page uses it (no behavior change)"
```

---

## Task 4: Rewrite My Work + remove MyWorkList

**Files:**
- Modify (rewrite): `src/app/(app)/my-work/page.tsx`
- Delete: `src/components/MyWorkList.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/(app)/my-work/page.tsx` with:

```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { findMakerByUser } from "@/lib/data/makers";
import { listAssignmentsForMaker } from "@/lib/data/maker-assignments";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { todayIso } from "@/lib/countdown";
import { TailorSummary } from "@/components/TailorSummary";

export default async function MyWorkPage() {
  const { orgId, userId } = await getAuthContext();
  const maker = await findMakerByUser(orgId, userId);

  const heading = (
    <div className="mb-6">
      <h1 className="font-display text-3xl font-semibold">My Work</h1>
      <p className="mt-1 text-sm muted">Costume pieces assigned to you, by production.</p>
    </div>
  );

  if (!maker) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        {heading}
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          You&apos;re not linked to a maker yet. Link yourself from Makers (in the organization menu), or ask an admin.
        </p>
      </main>
    );
  }

  // Distinct productions this maker has assignments in (assignments are already
  // sorted by production title).
  const assignments = await listAssignmentsForMaker(orgId, maker.id);
  const productions: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const a of assignments) {
    if (!seen.has(a.productionId)) {
      seen.add(a.productionId);
      productions.push({ id: a.productionId, title: a.productionTitle });
    }
  }

  if (productions.length === 0) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        {heading}
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-8 text-center muted">
          Nothing assigned to you yet.
        </p>
      </main>
    );
  }

  const today = todayIso();
  const sections = await Promise.all(
    productions.map(async (p) => {
      const production = await assertProductionInOrg(orgId, p.id);
      const data = await loadCostumeCreationsData(orgId, production);
      return { id: p.id, title: p.title, data };
    }),
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      {heading}
      <div className="space-y-10">
        {sections.map((s) => (
          <section key={s.id} className="space-y-4">
            <Link
              href={`/productions/${s.id}`}
              className="block font-display text-xl font-semibold hover:text-[var(--red)] hover:underline"
            >
              {s.title}
            </Link>
            <TailorSummary {...s.data} filterMakerId={maker.id} today={today} />
          </section>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Delete the obsolete component**

```bash
git rm src/components/MyWorkList.tsx
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` (clean — confirms nothing else imports `MyWorkList`, and the `TailorSummary` props from the loader + `filterMakerId` typecheck). Run: `npm run lint` (no new errors). Run: `npx vitest run` (green — `MyWorkList` had no tests; `listAssignmentsForMaker` tests still pass).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/my-work/page.tsx"
git commit -m "feat: My Work renders per-production Costume Creations filtered to the user"
```

---

## Task 5: Verification

**Files:** none (Clerk-gated; interactive checks need an authenticated browser). Dev server: http://localhost:3000.

- [ ] **Step 1: Static** — `npx tsc --noEmit` clean, `npm run lint` no new errors, `npx vitest run` green.

- [ ] **Step 2: Browser** — confirm:
  - **Costume Creations unchanged:** open a production's summary; it looks/behaves exactly as before.
  - **My Work (linked maker with work):** shows a section per production, each with the production title as a link to `/productions/[id]`, a costumes-due banner, To-make/Fabric tabs, and a worklist containing **only your assigned pieces** (other makers' pieces and unassigned/lazy items absent). The counts and fabric list reflect only your pieces.
  - Toggling done / editing fabric / changing the maker on a row saves (and reassigning a piece to someone else drops it from your view on its next load).
  - **Empty states:** an unlinked user sees the "not linked" message; a linked user with no make-work sees "Nothing assigned to you yet."

---

## Self-Review Notes

- **Spec coverage:** maker filter (T1), `filterMakerId` (T2), shared loader + summary refactor (T3), per-production sections + title links + empty states + MyWorkList removal (T4). ✓
- **Type consistency:** the loader's returned object keys exactly match `TailorSummary`'s props (`productionId, roles, designs, castings, performers, casts, initialPieces, photosByRole, measurementsByCasting, makers, costumesDueDate`); `filterMakerId`/`today` supplied at the call sites. `{ makerId }` opts shape consistent between T1 and T2. ✓
- **Retained:** `listAssignmentsForMaker`/`buildMakerAssignments` (now find the user's productions); `setPieceMade` + `PATCH /api/pieces/[pieceId]` kept (unused but tested/reusable), per spec.
- **No migration / no API-route changes.**
```
