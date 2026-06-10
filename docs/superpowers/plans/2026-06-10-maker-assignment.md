# Maker Assignment + Status (Phase 2b) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assign a maker (from the org roster) to each make-piece and track done status (green = made, red = assigned-but-not-made, neutral = unassigned), on both the Tailor's-summary worklist and the role Costume tab.

**Architecture:** Add `costume_pieces.maker_id` (migration 0014) and thread it through the upsert/route/tailor-summary types. A pure `makeStatus` helper + a shared presentational `MakeAssignment` component (maker `<select>` + status dot + optional made toggle) render on both surfaces; persistence reuses the existing pieces `PUT`.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase, Vitest. `@/*` → `src/*`. **Requires migration 0014 applied to Supabase on deploy.** Depends on phase 2a (makers roster) already merged: `src/lib/data/makers.ts` (`listMakers`, `Maker`), `/makers`, `cast-colors.ts`.

**Conventions:** data-layer + route tests mock dependencies; pure helpers TDD'd; components verified via tsc/lint/manual. The pieces `PUT` is the single persistence path for make-pieces. Spec: `docs/superpowers/specs/2026-06-10-maker-assignment-status-design.md`.

---

## File Structure

- **Create** `supabase/migrations/0014_costume_pieces_maker.sql`
- **Modify** `src/lib/costume-merge.ts` + `src/lib/costume-merge.test.ts` (`pieceRowIsEmpty` gains `makerId`)
- **Modify** `src/lib/data/costume-pieces.ts` (+ its test) — `maker_id` in type + upsert
- **Modify** `src/app/api/productions/[id]/pieces/route.ts` (+ its test) — accept `makerId`
- **Modify** `src/lib/tailor-summary.ts` (+ its test) — `maker_id`/`makerId` on `PieceRow`/`MakeItem` + builder
- **Create** `src/lib/maker-status.ts` (+ test) — status helper
- **Create** `src/components/MakeAssignment.tsx` — shared picker/status UI
- **Modify (summary wiring)** `src/components/MakePieceRow.tsx`, `MakeWorklist.tsx`, `TailorSummary.tsx`, `src/app/productions/[id]/summary/page.tsx`
- **Modify (costume-tab wiring)** `src/components/RoleCostumePanel.tsx`, `RoleCard.tsx`, `ProductionWorkspace.tsx`, `src/app/productions/[id]/page.tsx`

---

## Task 1: `maker_id` data backbone

**Files:**
- Create: `supabase/migrations/0014_costume_pieces_maker.sql`
- Modify: `src/lib/costume-merge.ts`, `src/lib/costume-merge.test.ts`
- Modify: `src/lib/data/costume-pieces.ts`, its test file
- Modify: `src/app/api/productions/[id]/pieces/route.ts`, its test file
- Modify: `src/lib/tailor-summary.ts`, its test file

- [ ] **Step 1: Migration**

Create `supabase/migrations/0014_costume_pieces_maker.sql`:

```sql
-- Which maker (org roster) is assigned to make a given piece. Null = unassigned.
alter table costume_pieces add column if not exists maker_id uuid references makers(id) on delete set null;
create index if not exists costume_pieces_maker_id_idx on costume_pieces(maker_id);
```

- [ ] **Step 2: `pieceRowIsEmpty` — keep a row that has a maker (failing test first)**

In `src/lib/costume-merge.test.ts`, read the existing `pieceRowIsEmpty` tests and add:

```ts
test("pieceRowIsEmpty: a make row with a maker assigned is NOT empty", () => {
  expect(
    pieceRowIsEmpty({
      source: "make",
      sourceNote: null,
      fabricType: null,
      fabricColor: null,
      fabricWidth: null,
      fabricSupplier: null,
      fabricYardage: null,
      fabricUnitCost: null,
      made: false,
      makerId: "m1",
    }),
  ).toBe(false);
});

test("pieceRowIsEmpty: a bare make row with no maker is still empty", () => {
  expect(
    pieceRowIsEmpty({
      source: "make",
      sourceNote: null,
      fabricType: null,
      fabricColor: null,
      fabricWidth: null,
      fabricSupplier: null,
      fabricYardage: null,
      fabricUnitCost: null,
      made: false,
      makerId: null,
    }),
  ).toBe(true);
});
```

The existing `pieceRowIsEmpty` calls in that test file will now be missing the `makerId` field — add `makerId: null` to each existing call object so they still type-check and assert the same result.

Run: `npx vitest run src/lib/costume-merge.test.ts` → FAIL (makerId not in the param type / not considered).

- [ ] **Step 3: Update `pieceRowIsEmpty`**

In `src/lib/costume-merge.ts`, change the `pieceRowIsEmpty` signature + logic:

```ts
export function pieceRowIsEmpty(input: {
  source: "make" | "on_hand" | "shared";
  sourceNote: string | null;
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  made: boolean;
  makerId: string | null;
}): boolean {
  const hasFabric =
    !!(input.fabricType || input.fabricColor || input.fabricWidth || input.fabricSupplier) ||
    input.fabricYardage != null ||
    input.fabricUnitCost != null;
  return input.source === "make" && !input.sourceNote && !hasFabric && !input.made && !input.makerId;
}
```

Run: `npx vitest run src/lib/costume-merge.test.ts` → PASS.

- [ ] **Step 4: Thread `maker_id` through `costume-pieces.ts`**

In `src/lib/data/costume-pieces.ts`:

(a) Add to the `CostumePiece` interface after `made_at`:

```ts
  maker_id: string | null;
```

(b) Add to `upsertPieceSource`'s input type after `made?: boolean;`:

```ts
  makerId?: string | null;
```

(c) In the function body, after `const made = input.made ?? false;` add:

```ts
  const makerId = input.makerId !== undefined ? input.makerId : null;
```

(d) Add `makerId` to the `pieceRowIsEmpty({ ... })` call object (after `made,`):

```ts
      made,
      makerId,
```

(e) Add `maker_id: makerId,` to the upsert row object (after `made,` / before `made_at`):

```ts
        made,
        maker_id: makerId,
        made_at: made ? new Date().toISOString() : null,
```

Then update `src/lib/data/costume-pieces.ts`'s test: read it, and for the upsert test(s) add an assertion that `makerId` is written as `maker_id` (e.g. pass `makerId: "m1"` and assert the upserted row includes `maker_id: "m1"`), and ensure any existing `pieceRowIsEmpty`-driven delete test still passes (a bare make row with `makerId` undefined/null still deletes). Run that test file → PASS.

- [ ] **Step 5: Accept `makerId` in the pieces PUT route**

In `src/app/api/productions/[id]/pieces/route.ts`:

(a) Add to the body type after `made?: boolean;`:

```ts
      makerId?: string | null;
```

(b) Add validation after the `made` check:

```ts
    if (body.makerId !== undefined && body.makerId !== null && typeof body.makerId !== "string") {
      throw new ValidationError("makerId must be a string or null");
    }
```

(c) Add to the `upsertPieceSource({ ... })` call after `made: body.made ?? false,`:

```ts
      makerId: body.makerId ?? null,
```

Update `src/app/api/productions/[id]/pieces/route.test.ts`: read it and add/extend a test asserting `makerId` is forwarded to `upsertPieceSource` (mock it, PUT a body with `makerId: "m1"`, assert the call included `makerId: "m1"`). Run → PASS.

- [ ] **Step 6: Surface `maker_id` in tailor-summary types + builder**

In `src/lib/tailor-summary.ts`:

(a) Add `maker_id: string | null;` to the `PieceRow` interface (after `made: boolean;`).

(b) Add `makerId: string | null;` to the `MakeItem` interface (after `made: boolean;`).

(c) In `buildMakeWorklist`, where each `MakeItem` is pushed (after `made,`), add:

```ts
      made,
      makerId: row?.maker_id ?? null,
```

Update `src/lib/tailor-summary.test.ts`: read the `buildMakeWorklist` test; add `maker_id` to the `PieceRow` fixtures it feeds in, and assert the produced `MakeItem` carries the expected `makerId` (e.g. a row with `maker_id: "m1"` → item `makerId: "m1"`; a casting with no row → `makerId: null`). Run → PASS.

- [ ] **Step 7: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: zero type errors; all tests pass (existing pieces/summary/merge tests updated, not broken).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0014_costume_pieces_maker.sql src/lib/costume-merge.ts src/lib/costume-merge.test.ts src/lib/data/costume-pieces.ts src/lib/data/costume-pieces.test.ts "src/app/api/productions/[id]/pieces/route.ts" "src/app/api/productions/[id]/pieces/route.test.ts" src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat: thread maker_id through pieces data layer, route, and worklist"
```

---

## Task 2: `makeStatus` helper + `MakeAssignment` component

**Files:**
- Create: `src/lib/maker-status.ts`, `src/lib/maker-status.test.ts`
- Create: `src/components/MakeAssignment.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/lib/maker-status.test.ts`:

```ts
import { expect, test } from "vitest";
import { makeStatus } from "@/lib/maker-status";

test("made is done regardless of assignment", () => {
  expect(makeStatus(true, "m1")).toBe("done");
  expect(makeStatus(true, null)).toBe("done");
});

test("assigned but not made is outstanding", () => {
  expect(makeStatus(false, "m1")).toBe("outstanding");
});

test("not made and unassigned is unassigned", () => {
  expect(makeStatus(false, null)).toBe("unassigned");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/maker-status.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the helper**

Create `src/lib/maker-status.ts`:

```ts
export type MakeStatus = "done" | "outstanding" | "unassigned";

// done = made; outstanding = assigned to a maker but not yet made; unassigned
// otherwise. Mapped to green / red / neutral in the UI.
export function makeStatus(made: boolean, makerId: string | null): MakeStatus {
  if (made) return "done";
  if (makerId) return "outstanding";
  return "unassigned";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/maker-status.test.ts` → PASS (3 tests).

- [ ] **Step 5: Write the shared component**

Create `src/components/MakeAssignment.tsx`:

```tsx
"use client";

import { castColorHex } from "@/lib/cast-colors";
import { makeStatus } from "@/lib/maker-status";

export interface MakerOption {
  id: string;
  name: string;
  color: string;
}

const STATUS_COLOR: Record<string, string> = {
  done: "#3f7d4f",
  outstanding: "var(--red)",
  unassigned: "var(--muted)",
};

// Maker selector + a done/outstanding/unassigned status dot, with an optional
// "Made" toggle. Presentational: persistence is the parent's job.
export function MakeAssignment({
  makers,
  makerId,
  made,
  showMade = true,
  busy = false,
  onChangeMaker,
  onToggleMade,
}: {
  makers: MakerOption[];
  makerId: string | null;
  made: boolean;
  showMade?: boolean;
  busy?: boolean;
  onChangeMaker: (makerId: string | null) => void;
  onToggleMade?: (made: boolean) => void;
}) {
  const status = makeStatus(made, makerId);
  const selected = makers.find((m) => m.id === makerId) ?? null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: STATUS_COLOR[status] }}
        title={status === "done" ? "Done" : status === "outstanding" ? "Outstanding" : "Unassigned"}
        aria-label={`Status: ${status}`}
      />
      <span className="inline-flex items-center gap-1.5">
        {selected && (
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: castColorHex(selected.color) }} />
        )}
        <select
          className="field !p-1.5 text-sm"
          value={makerId ?? ""}
          disabled={busy}
          onChange={(e) => onChangeMaker(e.target.value || null)}
          aria-label="Maker"
        >
          <option value="">Unassigned</option>
          {makers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </span>
      {showMade && (
        <label className="inline-flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={made}
            disabled={busy}
            onChange={(e) => onToggleMade?.(e.target.checked)}
            className="h-4 w-4 accent-[var(--red)]"
          />
          Made
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: zero errors; no new warnings.

```bash
git add src/lib/maker-status.ts src/lib/maker-status.test.ts src/components/MakeAssignment.tsx
git commit -m "feat: makeStatus helper + shared MakeAssignment component"
```

---

## Task 3: Wire into the Tailor's summary worklist

**Files:**
- Modify: `src/app/productions/[id]/summary/page.tsx`
- Modify: `src/components/TailorSummary.tsx`
- Modify: `src/components/MakeWorklist.tsx`
- Modify: `src/components/MakePieceRow.tsx`

No automated test for the components; verified via tsc/lint/manual + the suite.

- [ ] **Step 1: Load makers in the summary page**

In `src/app/productions/[id]/summary/page.tsx`:

(a) Add the import: `import { listMakers } from "@/lib/data/makers";`
(b) After the existing data loads, add: `const makers = await listMakers(orgId);` (the page already has `orgId` from `getAuthContext()` — confirm the variable name when reading; if it destructures `{ orgId }`, reuse it).
(c) On the `<TailorSummary ... />` call, add the prop:

```tsx
        makers={makers.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
```

- [ ] **Step 2: Thread through TailorSummary**

In `src/components/TailorSummary.tsx`, add to the props type and destructure:

```ts
  makers: { id: string; name: string; color: string }[];
```

and pass to `<MakeWorklist ... makers={makers} />`.

- [ ] **Step 3: Thread through MakeWorklist + RoleSection**

In `src/components/MakeWorklist.tsx`:
- Add `makers: { id: string; name: string; color: string }[];` to `MakeWorklist`'s props type and destructure; pass `makers={makers}` to each `<RoleSection ... />`.
- Add the same prop to `RoleSection`'s props type and destructure; pass `makers={makers}` to each `<MakePieceRow ... />`.

- [ ] **Step 4: Render the maker selector in MakePieceRow**

In `src/components/MakePieceRow.tsx`:

(a) Add imports:

```ts
import { MakeAssignment } from "@/components/MakeAssignment";
```

(b) Add `maker?` to `PiecePutBody` after `made: boolean;`:

```ts
  makerId: string | null;
```

(c) Add the prop to the component params + type:

```tsx
  makers,
```
```ts
  makers: { id: string; name: string; color: string }[];
```

(d) Add state after the fabric state (e.g. after `unitCost`):

```tsx
  const [makerId, setMakerId] = useState<string | null>(item.makerId ?? null);
```

(e) Include `makerId` in the `save()` body (add after `fabricUnitCost`):

```ts
      fabricUnitCost: unitCost.trim() === "" ? null : Number(unitCost),
      makerId,
      made: nextMade,
```

(f) Add a maker-change handler near `toggleMade`:

```tsx
  function changeMaker(next: string | null) {
    setMakerId(next);
    // save() reads makerId from state; defer one tick so it sees the new value.
    queueMicrotask(() => save());
  }
```

Wait — `save()` reads `makerId` from the closure at call time, which won't reflect `setMakerId` synchronously. Instead, build the save from an explicit value. Replace `save(nextMade = made)` so it also accepts an optional maker override, OR inline the body in `changeMaker`. Use this approach: change `save` to accept an options object.

Replace the `save` function with:

```tsx
  function save(opts?: { made?: boolean; makerId?: string | null }) {
    const body: PiecePutBody = {
      designId: item.designId,
      castingId: item.castingId,
      source: "make",
      fabricType: type.trim() || null,
      fabricColor: color.trim() || null,
      fabricWidth: width.trim() || null,
      fabricSupplier: supplier.trim() || null,
      fabricYardage: yardage.trim() === "" ? null : Number(yardage),
      fabricUnitCost: unitCost.trim() === "" ? null : Number(unitCost),
      makerId: opts?.makerId !== undefined ? opts.makerId : makerId,
      made: opts?.made !== undefined ? opts.made : made,
    };
    setBusy(true);
    saveChain.current = saveChain.current.then(() => sendSave(body));
  }
```

Update the fabric-field `onBlur` calls from `() => void save()` to stay `() => void save()` (unchanged — no args). Update `toggleMade`:

```tsx
  function toggleMade() {
    const next = !made;
    setMade(next);
    save({ made: next });
  }
```

And `changeMaker`:

```tsx
  function changeMaker(next: string | null) {
    setMakerId(next);
    save({ makerId: next });
  }
```

(g) Render `MakeAssignment` inside the expanded section — add it as the first child of the `<div className="space-y-2 px-3 pb-3">` block (before the measurements box). The header keeps its own made checkbox, so pass `showMade={false}`:

```tsx
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <MakeAssignment
            makers={makers}
            makerId={makerId}
            made={made}
            showMade={false}
            busy={busy}
            onChangeMaker={changeMaker}
          />
          <div className="rounded-md bg-[var(--bg)] px-2 py-1.5">
```

(leave the rest of the expanded block unchanged).

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no new lint errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/productions/[id]/summary/page.tsx" src/components/TailorSummary.tsx src/components/MakeWorklist.tsx src/components/MakePieceRow.tsx
git commit -m "feat: maker assignment + status on the Tailor's summary worklist"
```

---

## Task 4: Wire into the role Costume tab

**Files:**
- Modify: `src/app/productions/[id]/page.tsx`
- Modify: `src/components/ProductionWorkspace.tsx`
- Modify: `src/components/RoleCard.tsx`
- Modify: `src/components/RoleCostumePanel.tsx`

- [ ] **Step 1: Load makers in the production detail page**

In `src/app/productions/[id]/page.tsx`:
- Add `import { listMakers } from "@/lib/data/makers";`
- After the designs/pieces loads, add `const makers = await listMakers(orgId);` (page already has `orgId`).
- On `<ProductionWorkspace ... />`, add:

```tsx
        makers={makers.map((m) => ({ id: m.id, name: m.name, color: m.color }))}
```

- [ ] **Step 2: Thread through ProductionWorkspace**

In `src/components/ProductionWorkspace.tsx`:
- Add `makers` to the destructured params and to the props type:

```ts
  makers: { id: string; name: string; color: string }[];
```
- Pass `makers={makers}` to each `<RoleCard ... />`.

- [ ] **Step 3: Thread through RoleCard**

In `src/components/RoleCard.tsx`:
- Add `makers: { id: string; name: string; color: string }[];` to the props type and destructure.
- Pass `makers={makers}` to `<RoleCostumePanel ... />` (the `activeTab === "costume"` branch).

- [ ] **Step 4: Render in RoleCostumePanel make-rows**

In `src/components/RoleCostumePanel.tsx`:

(a) Add imports:

```ts
import { MakeAssignment } from "@/components/MakeAssignment";
```

(b) Add `makers` to the props type + destructure:

```ts
  makers: { id: string; name: string; color: string }[];
```

(c) In `setSource`'s PUT body, preserve maker by adding (after `made: existing?.made ?? false,`):

```ts
        made: existing?.made ?? false,
        makerId: existing?.maker_id ?? null,
```

(d) Add a `setMaker` + `setMade` saver. After the `setSource` function, add:

```tsx
  async function setPieceField(
    designId: string,
    castingId: string,
    patch: { makerId?: string | null; made?: boolean },
  ) {
    setBusy(true);
    setError(null);
    const existing = pieces.find(
      (p) => p.costume_design_id === designId && p.casting_id === castingId,
    );
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        designId,
        castingId,
        source: "make",
        sharedWithCastingId: null,
        fabricType: existing?.fabric_type ?? null,
        fabricColor: existing?.fabric_color ?? null,
        fabricWidth: existing?.fabric_width ?? null,
        fabricSupplier: existing?.fabric_supplier ?? null,
        fabricYardage: existing?.fabric_yardage ?? null,
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        made: patch.made !== undefined ? patch.made : existing?.made ?? false,
        makerId: patch.makerId !== undefined ? patch.makerId : existing?.maker_id ?? null,
      }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: CostumePiece | null };
      setPieces((prev) => {
        const without = prev.filter((p) => !(p.costume_design_id === designId && p.casting_id === castingId));
        return piece ? [...without, piece] : without;
      });
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
    }
    setBusy(false);
  }
```

(e) In the per-design row JSX, when `source === "make"`, render `MakeAssignment` below the source `<select>`. The current row is the `<div key={d.id} className="flex items-center gap-2 py-1">` containing the name + source select (+ shared select). Wrap so that under a make row we show the assignment. Find the current make/shared row block and, after the source `<select>`/shared `<select>` controls within that row, add (only when `source === "make"`):

```tsx
                    {source === "make" && (
                      <MakeAssignment
                        makers={makers}
                        makerId={
                          pieces.find((p) => p.costume_design_id === d.id && p.casting_id === casting.id)?.maker_id ?? null
                        }
                        made={
                          pieces.find((p) => p.costume_design_id === d.id && p.casting_id === casting.id)?.made ?? false
                        }
                        busy={busy}
                        onChangeMaker={(mk) => setPieceField(d.id, casting.id, { makerId: mk })}
                        onToggleMade={(md) => setPieceField(d.id, casting.id, { made: md })}
                      />
                    )}
```

Because the row is currently a single horizontal `flex` line, wrap the existing row contents + this assignment block in a vertical container so the assignment sits on its own line. Change the row wrapper from `<div key={d.id} className="flex items-center gap-2 py-1">` to:

```tsx
                  <div key={d.id} className="flex flex-col gap-1 py-1">
                    <div className="flex items-center gap-2">
                      {/* existing: name span + source select + optional shared select */}
                    </div>
                    {source === "make" && (
                      /* MakeAssignment block from above */
                    )}
                  </div>
```

Keep the existing name/select markup intact inside the inner `<div className="flex items-center gap-2">`.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no new lint errors, all tests pass.

- [ ] **Step 6: Manual verification (dev server)**

Run: `npm run dev` (migration 0014 must be applied to Supabase, and 0013 from phase 2a). Verify, after adding a couple of makers on `/makers`:
1. Costume tab → a make-row shows a maker dropdown + status dot + Made toggle. Assign a maker → dot turns red; check Made → dot turns green; reload persists.
2. Tailor's summary → the same piece shows the assigned maker; toggling Made in either place reflects in the other after reload.
3. A non-make row (on-hand/shared) shows no maker controls.

- [ ] **Step 7: Commit**

```bash
git add "src/app/productions/[id]/page.tsx" src/components/ProductionWorkspace.tsx src/components/RoleCard.tsx src/components/RoleCostumePanel.tsx
git commit -m "feat: maker assignment + status on the role Costume tab"
```

---

## Deploy Note

Adds migration `0014_costume_pieces_maker.sql` — apply to Supabase on deploy (after 0013). The `makers` table (0013) must exist first (FK target).

## Self-Review Notes

- **Spec coverage:** `maker_id` column + data/route/worklist threading (Task 1); `makeStatus` + `MakeAssignment` (Task 2); summary surface (Task 3); Costume-tab surface incl. the new made toggle (Task 4). Both surfaces persist via the existing pieces PUT, so they stay in sync.
- **Critical correctness:** `pieceRowIsEmpty` now treats a maker-assigned row as non-empty (Task 1 Step 3) so assigning a maker to an otherwise-bare make row doesn't get deleted.
- **Type consistency:** `maker_id` (DB/row) ↔ `makerId` (API/input) used consistently; `MakerOption`/`{id,name,color}` prop shape identical across the threading chain and `MakeAssignment`; `makeStatus(made, makerId)` signature shared by helper + component.
- **Test extensions:** existing pieces/route/merge/summary tests are read and extended (not replaced) to cover `maker_id`; new pure helper is TDD'd.
- **No placeholders:** production code is complete; the few "read the existing test and add this assertion" steps name the exact file and give the assertion to add.
