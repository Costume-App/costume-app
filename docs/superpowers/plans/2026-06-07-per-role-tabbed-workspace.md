# Per-Role Tabbed Workspace (Sub-project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Cast & Measurements / Costume tabs into each expanded role card, add a role-scoped Ideas & Notes tab (notes textarea), and drop the two top-level tabs.

**Architecture:** New `roles.notes` column + `setRoleNotes` + role `PATCH`. `ProductionWorkspace` keeps all state and renders a single list of a new `RoleCard`; each card (collapsible) shows an internal tab strip and one of three panels (`RoleNotesPanel`, `RoleCastPanel`, `RoleCostumePanel`) extracted verbatim from the old `RosterTab`/`CostumesTab`. Behavior of casting/design/piece logic is unchanged — only relocated.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-per-role-tabbed-workspace-design.md`

**Conventions:** data fns throw `ValidationError`/`NotFoundError`; routes do `getAuthContext` → `assertProductionInOrg` → data → JSON via `errorResponse`. The client `Role`/`Performer`/`Casting` types live in `ProductionWorkspace.tsx`.

---

## Task 1: Migration `0009_role_notes.sql`

**Files:** Create `supabase/migrations/0009_role_notes.sql`

- [ ] **Step 1: Create the file**

```sql
-- Role-scoped costume notes (Ideas & Notes tab).
alter table roles add column notes text;
```

- [ ] **Step 2: Commit (Chris applies it in Supabase)**

```bash
git add supabase/migrations/0009_role_notes.sql
git commit -m "feat: 0009 roles.notes column"
```

> **MANUAL STEP (Chris):** apply in the Supabase SQL editor. The tab restructure works without it; role notes just can't save until applied.

---

## Task 2: `setRoleNotes` data layer

**Files:**
- Modify: `src/lib/data/roles.ts`
- Test: `src/lib/data/roles-set-notes.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/data/roles-set-notes.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const maybeSingle = vi.fn();
const updSelect = vi.fn(() => ({ maybeSingle }));
const eqProd = vi.fn(() => ({ select: updSelect }));
const eqId = vi.fn(() => ({ eq: eqProd }));
const update = vi.fn(() => ({ eq: eqId }));
const from = vi.fn((_t: string) => ({ update }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (t: string) => from(t) } }));

import { setRoleNotes } from "@/lib/data/roles";

beforeEach(() => {
  [maybeSingle, updSelect, eqProd, eqId, update, from].forEach((m) => m.mockReset());
  updSelect.mockReturnValue({ maybeSingle });
  eqProd.mockReturnValue({ select: updSelect });
  eqId.mockReturnValue({ eq: eqProd });
  update.mockReturnValue({ eq: eqId });
  from.mockReturnValue({ update });
});

test("setRoleNotes updates notes scoped by id and production", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", notes: "blue dress" }, error: null });
  const row = await setRoleNotes("p1", "r1", "blue dress");
  expect(from).toHaveBeenCalledWith("roles");
  expect(update).toHaveBeenCalledWith({ notes: "blue dress" });
  expect(eqId).toHaveBeenCalledWith("id", "r1");
  expect(eqProd).toHaveBeenCalledWith("production_id", "p1");
  expect(row).toEqual({ id: "r1", notes: "blue dress" });
});

test("setRoleNotes stores null for an empty string", async () => {
  maybeSingle.mockResolvedValue({ data: { id: "r1", notes: null }, error: null });
  await setRoleNotes("p1", "r1", "");
  expect(update).toHaveBeenCalledWith({ notes: null });
});

test("setRoleNotes throws NotFoundError when no row matches", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  await expect(setRoleNotes("p1", "nope", "x")).rejects.toBeInstanceOf(NotFoundError);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- roles-set-notes`
Expected: FAIL — `setRoleNotes` not exported.

- [ ] **Step 3: Implement**

In `src/lib/data/roles.ts`:

1. Change the errors import to add `NotFoundError`:
```typescript
import { ValidationError, NotFoundError } from "@/lib/errors";
```
2. Add `notes: string | null;` to the `Role` interface (after `display_order`).
3. Append after `createRole` (before `deleteRole`):
```typescript
export async function setRoleNotes(productionId: string, id: string, notes: string): Promise<Role> {
  const { data, error } = await supabaseAdmin
    .from("roles")
    .update({ notes: notes || null })
    .eq("id", id)
    .eq("production_id", productionId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Role not found");
  return data as Role;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- roles`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/roles.ts src/lib/data/roles-set-notes.test.ts
git commit -m "feat: setRoleNotes data-layer function + roles.notes"
```

---

## Task 3: `PATCH /api/productions/[id]/roles/[roleId]`

**Files:**
- Modify: `src/app/api/productions/[id]/roles/[roleId]/route.ts`
- Test: `src/app/api/productions/[id]/roles/[roleId]/route.test.ts` (create)

- [ ] **Step 1: Add the PATCH handler**

In `src/app/api/productions/[id]/roles/[roleId]/route.ts`:

1. Change the data import:
```typescript
import { deleteRole, setRoleNotes } from "@/lib/data/roles";
```
2. Add this handler after the existing `DELETE`:
```typescript
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id, roleId } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { notes?: string };
    const role = await setRoleNotes(id, roleId, typeof body.notes === "string" ? body.notes : "");
    return NextResponse.json({ role });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 2: Create the route test**

Create `src/app/api/productions/[id]/roles/[roleId]/route.test.ts`:

```typescript
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const deleteRole = vi.fn();
const setRoleNotes = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  deleteRole: (...a: unknown[]) => deleteRole(...a),
  setRoleNotes: (...a: unknown[]) => setRoleNotes(...a),
}));

import { DELETE, PATCH } from "@/app/api/productions/[id]/roles/[roleId]/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, deleteRole, setRoleNotes].forEach((m) => m.mockReset());
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
});

const ctx = (id: string, roleId: string) => ({ params: Promise.resolve({ id, roleId }) });
const patchReq = (body: unknown) =>
  new Request("http://test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("DELETE removes a role (200)", async () => {
  deleteRole.mockResolvedValue(undefined);
  const res = await DELETE(new Request("http://test", { method: "DELETE" }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(deleteRole).toHaveBeenCalledWith("p1", "r1");
});

test("PATCH saves role notes (200)", async () => {
  setRoleNotes.mockResolvedValue({ id: "r1", notes: "blue dress" });
  const res = await PATCH(patchReq({ notes: "blue dress" }), ctx("p1", "r1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ role: { id: "r1", notes: "blue dress" } });
  expect(setRoleNotes).toHaveBeenCalledWith("p1", "r1", "blue dress");
});

test("PATCH 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));
  const res = await PATCH(patchReq({ notes: "x" }), ctx("p1", "r1"));
  expect(res.status).toBe(404);
  expect(setRoleNotes).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run + tsc**

Run: `npm test -- "roles/[roleId]"` (or `npm test`) then `npx tsc --noEmit`
Expected: DELETE + PATCH tests pass; tsc clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/productions/[id]/roles/[roleId]/route.ts" "src/app/api/productions/[id]/roles/[roleId]/route.test.ts"
git commit -m "feat: PATCH role saves notes"
```

---

## Task 4: `RoleNotesPanel` (Ideas & Notes tab)

**Files:** Create `src/components/RoleNotesPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useRef, useState } from "react";

export function RoleNotesPanel({
  productionId,
  roleId,
  notes,
}: {
  productionId: string;
  roleId: string;
  notes: string | null;
}) {
  const [value, setValue] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(notes ?? "");

  async function save() {
    if (value === lastSaved.current) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/productions/${productionId}/roles/${roleId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ notes: value }),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save notes");
      setBusy(false);
      return;
    }
    lastSaved.current = value;
    setBusy(false);
    setSaved(true);
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="lbl">Costume notes</span>
        {busy ? (
          <span className="text-xs muted">Saving…</span>
        ) : error ? (
          <span className="text-xs text-[var(--red)]">{error}</span>
        ) : saved ? (
          <span className="text-xs muted">Saved</span>
        ) : null}
      </div>
      <textarea
        className="field w-full"
        rows={4}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        placeholder="Costume notes for this role…"
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` (clean).
```bash
git add src/components/RoleNotesPanel.tsx
git commit -m "feat: RoleNotesPanel (role-scoped notes textarea)"
```

---

## Task 5: `RoleCastPanel` (Cast & Measurements tab, extracted)

**Files:** Create `src/components/RoleCastPanel.tsx`

This is the per-role roster content lifted out of `RosterTab.tsx` (the `MeasurementDot`, `CastLink`, and `AddName` helpers move with it). Behavior is identical; it operates on a single `role` instead of mapping all roles.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import type { MeasureStatus, Role, Performer, Casting } from "@/components/ProductionWorkspace";

export function RoleCastPanel({
  productionId,
  role,
  selectedCastId,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
}: {
  productionId: string;
  role: Role;
  selectedCastId: string;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  const statusOf = (performerId: string): MeasureStatus => measurementStatus[performerId] ?? "none";

  async function addCastMember(name: string, assignment: "primary" | "understudy") {
    if (!name.trim() || !selectedCastId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/castings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ castId: selectedCastId, roleId: role.id, name, assignment }),
    });
    if (res.ok) {
      const { performer, casting } = (await res.json()) as {
        performer: { id: string; label: string };
        casting: {
          id: string;
          cast_id: string;
          role_id: string;
          performer_id: string;
          assignment: "primary" | "understudy";
        };
      };
      setPerformers((prev) => [...prev, { id: performer.id, name: performer.label }]);
      setCastings((prev) => [
        ...prev,
        {
          id: casting.id,
          castId: casting.cast_id,
          roleId: casting.role_id,
          performerId: casting.performer_id,
          assignment: casting.assignment,
        },
      ]);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add cast member");
    }
    setBusy(false);
  }

  async function removeCastMember(performerId: string) {
    const who = nameOf(performerId);
    if (!confirm(`Remove ${who || "this cast member"}? This also deletes their measurements and can't be undone.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/performers/${performerId}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setCastings((prev) => prev.filter((c) => c.performerId !== performerId));
    } else {
      setError("Couldn't remove cast member");
    }
    setBusy(false);
  }

  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const understudies = forRole.filter((c) => c.assignment === "understudy");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {primary ? (
          <CastLink
            productionId={productionId}
            performerId={primary.performerId}
            name={nameOf(primary.performerId)}
            status={statusOf(primary.performerId)}
            onRemove={() => removeCastMember(primary.performerId)}
            busy={busy}
          />
        ) : (
          <AddName placeholder="Add primary" onAdd={(n) => addCastMember(n, "primary")} busy={busy} />
        )}
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="lbl">Understudies</span>
          <AddName
            placeholder="Add understudy"
            addLabel="Add"
            block
            onAdd={(n) => addCastMember(n, "understudy")}
            busy={busy}
          />
        </div>
        <div className="flex flex-col items-start gap-1">
          {understudies.map((u, i) => (
            <CastLink
              key={u.performerId}
              order={i + 1}
              productionId={productionId}
              performerId={u.performerId}
              name={nameOf(u.performerId)}
              status={statusOf(u.performerId)}
              onRemove={() => removeCastMember(u.performerId)}
              busy={busy}
            />
          ))}
        </div>
      </div>
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function MeasurementDot({ status }: { status: MeasureStatus }) {
  const label =
    status === "complete"
      ? "Measurements complete"
      : status === "partial"
        ? "Measurements in progress"
        : "No measurements yet";
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" role="img" aria-label={label} className="shrink-0">
      <title>{label}</title>
      <circle cx="6" cy="6" r="5" fill="none" stroke="var(--muted)" strokeWidth="1.5" />
      {status === "partial" && <path d="M6 1 A5 5 0 0 0 6 11 Z" fill="var(--red)" />}
      {status === "complete" && <circle cx="6" cy="6" r="5" fill="var(--red)" stroke="var(--red)" strokeWidth="1.5" />}
    </svg>
  );
}

function CastLink({
  productionId,
  performerId,
  name,
  onRemove,
  busy,
  order,
  status,
}: {
  productionId: string;
  performerId: string;
  name: string;
  onRemove: () => void;
  busy: boolean;
  order?: number;
  status?: MeasureStatus;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {order != null && <span className="muted text-sm">{order}.</span>}
      {status && <MeasurementDot status={status} />}
      <Link href={`/productions/${productionId}/performers/${performerId}`} className="font-medium hover:underline">
        {name}
      </Link>
      <button
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        className="text-base leading-none text-[var(--red)] hover:opacity-70 disabled:opacity-50"
      >
        ×
      </button>
    </span>
  );
}

function AddName({
  placeholder,
  addLabel,
  onAdd,
  busy,
  block,
}: {
  placeholder: string;
  addLabel?: string;
  onAdd: (name: string) => void;
  busy: boolean;
  block?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        + {addLabel ?? placeholder}
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name);
        setName("");
        setOpen(false);
      }}
      className={`${block ? "flex w-full flex-wrap" : "inline-flex"} items-center gap-1.5`}
    >
      <input
        autoFocus
        className="field w-28 !p-1.5 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
      />
      <button type="submit" disabled={busy} className="btn-ghost text-sm">
        Add
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setName("");
        }}
        className="link-muted text-sm"
      >
        Cancel
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` (clean — note: `RosterTab.tsx` still exists and compiles; it's removed in Task 8).
```bash
git add src/components/RoleCastPanel.tsx
git commit -m "feat: RoleCastPanel (per-role cast & measurements)"
```

---

## Task 6: `RoleCostumePanel` (Costume tab, extracted)

**Files:** Create `src/components/RoleCostumePanel.tsx`

The per-role costume content lifted out of `CostumesTab.tsx` (the `PieceEditor` helper moves with it, simplified to take a role-less `onAdd(name)`).

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { COSTUME_SOURCES, DEFAULT_SOURCE } from "@/lib/costume-sources";
import { resolvePieceSources, pieceKey } from "@/lib/costume-merge";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";
import type { Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";

export function RoleCostumePanel({
  productionId,
  role,
  selectedCastId,
  castings,
  performers,
  casts,
  designs,
  setDesigns,
  pieces,
  setPieces,
}: {
  productionId: string;
  role: Role;
  selectedCastId: string;
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingShared, setPendingShared] = useState<Record<string, string>>({});

  const nameOf = (performerId: string) => performers.find((p) => p.id === performerId)?.name ?? "";
  const castNameOf = (castId: string) => casts.find((c) => c.id === castId)?.name ?? "";
  const sources = resolvePieceSources(pieces);

  async function addDesign(name: string) {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roleId: role.id, name }),
    });
    if (res.ok) {
      const { design } = (await res.json()) as { design: CostumeDesign };
      setDesigns((prev) => [...prev, design]);
    } else setError("Couldn't add piece");
    setBusy(false);
  }

  async function removeDesign(designId: string) {
    if (!confirm("Remove this piece from the costume? Removes it for every performer.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/designs/${designId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setDesigns((prev) => prev.filter((d) => d.id !== designId));
      setPieces((prev) => prev.filter((p) => p.costume_design_id !== designId));
    } else setError("Couldn't remove piece");
    setBusy(false);
  }

  async function setSource(designId: string, castingId: string, source: string, sharedWithCastingId: string | null) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/pieces`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ designId, castingId, source, sharedWithCastingId }),
    });
    if (res.ok) {
      const { piece } = (await res.json()) as { piece: CostumePiece | null };
      setPieces((prev) => {
        const without = prev.filter((p) => !(p.costume_design_id === designId && p.casting_id === castingId));
        return piece ? [...without, piece] : without;
      });
    } else {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error;
      setError(msg ?? "Couldn't update source");
    }
    setBusy(false);
  }

  const roleDesigns = designs.filter((d) => d.role_id === role.id);
  const forRole = castings.filter((c) => c.castId === selectedCastId && c.roleId === role.id);
  const primary = forRole.find((c) => c.assignment === "primary");
  const ordered = [...(primary ? [primary] : []), ...forRole.filter((c) => c.assignment === "understudy")];

  return (
    <div className="space-y-2">
      <PieceEditor designs={roleDesigns} onAdd={addDesign} onRemove={removeDesign} busy={busy} />
      {ordered.length === 0 ? (
        <p className="text-sm muted">No one cast in this role yet.</p>
      ) : (
        ordered.map((casting) => (
          <div key={casting.id} className="surface !shadow-none p-3">
            <div className="mb-1 font-medium">
              {nameOf(casting.performerId)}
              {casting.assignment === "understudy" && <span className="muted text-sm"> · Understudy</span>}
            </div>
            {roleDesigns.length === 0 ? (
              <p className="text-sm muted">No pieces defined.</p>
            ) : (
              roleDesigns.map((d) => {
                const key = pieceKey(casting.id, d.id);
                const resolved = sources[key];
                const pending = key in pendingShared;
                const source = pending ? "shared" : resolved?.source ?? DEFAULT_SOURCE;
                const persistedShareCasting = resolved?.sharedWithPieceId
                  ? pieces.find((p) => p.id === resolved.sharedWithPieceId)?.casting_id ?? ""
                  : "";
                const sharedCastingId = pending ? pendingShared[key] : persistedShareCasting;
                const shareCandidates = castings.filter(
                  (c) =>
                    c.roleId === role.id &&
                    c.id !== casting.id &&
                    sources[pieceKey(c.id, d.id)]?.source !== "shared",
                );
                return (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 py-1">
                    <span className="flex-1">{d.name}</span>
                    <select
                      className="field !p-1.5 text-sm"
                      value={source}
                      disabled={busy}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "shared") {
                          setPendingShared((p) => ({ ...p, [key]: persistedShareCasting }));
                        } else {
                          setPendingShared((p) => {
                            const next = { ...p };
                            delete next[key];
                            return next;
                          });
                          setSource(d.id, casting.id, v, null);
                        }
                      }}
                    >
                      {COSTUME_SOURCES.map((s) => (
                        <option key={s.token} value={s.token}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    {source === "shared" && (
                      <select
                        className="field !p-1.5 text-sm"
                        value={sharedCastingId}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPendingShared((p) => ({ ...p, [key]: v }));
                          if (v) setSource(d.id, casting.id, "shared", v);
                        }}
                      >
                        <option value="">Whose?</option>
                        {shareCandidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {nameOf(c.performerId)} ({castNameOf(c.castId)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ))
      )}
      {error && <p className="text-[var(--red)] text-sm">{error}</p>}
    </div>
  );
}

function PieceEditor({
  designs,
  onAdd,
  onRemove,
  busy,
}: {
  designs: CostumeDesign[];
  onAdd: (name: string) => void;
  onRemove: (designId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="mb-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="lbl">Pieces</span>
        {designs.map((d) => (
          <span key={d.id} className="chip">
            {d.name}
            <button
              type="button"
              aria-label={`Remove ${d.name}`}
              disabled={busy}
              onClick={() => onRemove(d.id)}
              className="ml-1 text-[var(--red)]"
            >
              ×
            </button>
          </span>
        ))}
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onAdd(name);
              setName("");
              setOpen(false);
            }}
            className="inline-flex items-center gap-1.5"
          >
            <input
              autoFocus
              className="field w-28 !p-1.5 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Piece name"
            />
            <button type="submit" disabled={busy} className="btn-ghost text-sm">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setName("");
              }}
              className="link-muted text-sm"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
            + add
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit` (clean; `CostumesTab.tsx` still compiles until Task 8).
```bash
git add src/components/RoleCostumePanel.tsx
git commit -m "feat: RoleCostumePanel (per-role costume sourcing)"
```

---

## Task 7: `RoleCard` (collapsible + internal tabs)

**Files:** Create `src/components/RoleCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { CollapsibleRole } from "@/components/CollapsibleRole";
import { Tabs } from "@/components/Tabs";
import { RoleNotesPanel } from "@/components/RoleNotesPanel";
import { RoleCastPanel } from "@/components/RoleCastPanel";
import { RoleCostumePanel } from "@/components/RoleCostumePanel";
import type { MeasureStatus, Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";

type RoleTab = "ideas" | "cast" | "costume";

export function RoleCard({
  role,
  productionId,
  selectedCastId,
  tint,
  edge,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
  casts,
  designs,
  setDesigns,
  pieces,
  setPieces,
}: {
  role: Role;
  productionId: string;
  selectedCastId: string;
  tint: string;
  edge: string;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
}) {
  const [activeTab, setActiveTab] = useState<RoleTab>("ideas");

  const primary = castings.find(
    (c) => c.castId === selectedCastId && c.roleId === role.id && c.assignment === "primary",
  );
  const summary = primary ? performers.find((p) => p.id === primary.performerId)?.name ?? "—" : "—";

  return (
    <CollapsibleRole title={role.name} summary={summary} tint={tint} edge={edge}>
      <Tabs
        tabs={[
          { id: "ideas", label: "Ideas & Notes" },
          { id: "cast", label: "Cast & Measurements" },
          { id: "costume", label: "Costume" },
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as RoleTab)}
      />
      {activeTab === "ideas" && (
        <RoleNotesPanel productionId={productionId} roleId={role.id} notes={role.notes} />
      )}
      {activeTab === "cast" && (
        <RoleCastPanel
          productionId={productionId}
          role={role}
          selectedCastId={selectedCastId}
          performers={performers}
          setPerformers={setPerformers}
          castings={castings}
          setCastings={setCastings}
          measurementStatus={measurementStatus}
        />
      )}
      {activeTab === "costume" && (
        <RoleCostumePanel
          productionId={productionId}
          role={role}
          selectedCastId={selectedCastId}
          castings={castings}
          performers={performers}
          casts={casts}
          designs={designs}
          setDesigns={setDesigns}
          pieces={pieces}
          setPieces={setPieces}
        />
      )}
    </CollapsibleRole>
  );
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`.
Expected: ONE error — `role.notes` does not exist on the client `Role` type yet (added in Task 8). Confirm that's the only error, then commit (the type is fixed next).
```bash
git add src/components/RoleCard.tsx
git commit -m "feat: RoleCard with internal Ideas/Cast/Costume tabs"
```

---

## Task 8: Rewire `ProductionWorkspace`, update types + detail page, remove old tabs

**Files:**
- Modify: `src/components/ProductionWorkspace.tsx`
- Modify: `src/app/productions/[id]/page.tsx`
- Delete: `src/components/RosterTab.tsx`, `src/components/CostumesTab.tsx`

- [ ] **Step 1: Update the client `Role` type + imports in `ProductionWorkspace.tsx`**

1. Change the imports block — remove `Tabs`, `RosterTab`, `CostumesTab`; add `RoleCard`:
```typescript
import { RoleCard } from "@/components/RoleCard";
```
(Delete the lines `import { Tabs } from "@/components/Tabs";`, `import { RosterTab } from "@/components/RosterTab";`, `import { CostumesTab } from "@/components/CostumesTab";`.)

2. Add `notes` to the client `Role` interface:
```typescript
export interface Role { id: string; name: string; notes: string | null }
```

- [ ] **Step 2: Remove the tab state and add role state/handler**

In `ProductionWorkspace`:
1. Delete the line `const [tab, setTab] = useState<"roster" | "costumes">("roster");`
2. Add a `newRole` state near the other `useState`s:
```typescript
  const [newRole, setNewRole] = useState("");
```
3. Add an `addRole` handler (next to `addCast`):
```typescript
  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRole.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: newRole }),
    });
    if (res.ok) {
      const { role } = (await res.json()) as { role: { id: string; name: string; notes: string | null } };
      setRoles((prev) => [...prev, { id: role.id, name: role.name, notes: role.notes }]);
      setNewRole("");
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add role");
    }
    setBusy(false);
  }
```

- [ ] **Step 3: Replace the `<Tabs>` + tab bodies with the RoleCard list + add-role form**

Replace this whole block (the `<Tabs ... />` element and the `{tab === "roster" ? (<RosterTab .../>) : (<CostumesTab .../>)}` ternary):

```tsx
      <Tabs
        tabs={[
          { id: "roster", label: "Cast and Measurements" },
          { id: "costumes", label: "Costumes" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "roster" | "costumes")}
      />

      {tab === "roster" ? (
        <RosterTab ... />
      ) : (
        <CostumesTab ... />
      )}
```

with:

```tsx
      {roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
          No roles yet. Add the first character below.
        </p>
      ) : (
        <ul className="space-y-3">
          {roles.map((r) => (
            <RoleCard
              key={r.id}
              role={r}
              productionId={productionId}
              selectedCastId={selectedCastId}
              tint={tint}
              edge={edge}
              performers={performers}
              setPerformers={setPerformers}
              castings={castings}
              setCastings={setCastings}
              measurementStatus={measurementStatus}
              casts={casts}
              designs={designs}
              setDesigns={setDesigns}
              pieces={pieces}
              setPieces={setPieces}
            />
          ))}
        </ul>
      )}

      <form onSubmit={addRole} className="flex gap-2">
        <input
          className="field flex-1"
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          placeholder="Add a role (character)"
        />
        <button type="submit" disabled={busy} className="btn-primary shrink-0">
          Add role
        </button>
      </form>
```

- [ ] **Step 4: Pass `notes` through from the detail page**

In `src/app/productions/[id]/page.tsx`, change the `initialRoles` prop mapping:
```tsx
        initialRoles={roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes }))}
```
(`r` is the data-layer `Role`, which now has `notes` from Task 2.)

- [ ] **Step 5: Delete the old tab files**

```bash
git rm src/components/RosterTab.tsx src/components/CostumesTab.tsx
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit` (MUST be clean now — RoleCard's `role.notes` resolves, no references to the deleted files remain), `npm run lint` (no new errors), `npm test` (green).

If tsc reports a leftover import of `RosterTab`/`CostumesTab`/`Tabs` in `ProductionWorkspace`, remove it. `Tabs` is still used by `RoleCard` (its own import), so the `Tabs.tsx` file stays.

- [ ] **Step 7: Commit**

```bash
git add src/components/ProductionWorkspace.tsx "src/app/productions/[id]/page.tsx"
git commit -m "feat: per-role tabbed workspace replaces top-level tabs"
```

---

## Task 9: Full verification pass

- [ ] **Step 1: Suite + types + lint**

Run: `npm test` (all green), `npx tsc --noEmit` (clean), `npm run lint` (no new errors). Confirm no file still imports `RosterTab` or `CostumesTab`:
Run: `grep -rn "RosterTab\|CostumesTab" src` → expected: no matches.

- [ ] **Step 2: Manual smoke (after Chris applies migration 0009)**

- A role card collapsed shows role name + primary cast member name (unchanged).
- Expand a card → three tabs: **Ideas & Notes** (default) | **Cast & Measurements** | **Costume**.
- Ideas & Notes: type notes, blur → "Saved"; reload → persists.
- Cast & Measurements: add primary/understudy, measurement dots show, remove works — same as before, now per card.
- Costume: add/remove pieces, set source make/on_hand/shared + share target — same as before.
- Switch casts at the top → each open card's Cast/Costume tabs re-filter to that cast.
- Add a new role via the bottom form → a new card appears.

> Do NOT push or deploy — Chris gives the green light separately.

---

## Self-Review notes (addressed)

- **Spec coverage:** roles.notes column (T1); setRoleNotes (T2); role PATCH (T3); Ideas&Notes panel (T4); Cast&Measurements panel extracted (T5); Costume panel extracted (T6); RoleCard with tab strip (T7); ProductionWorkspace rewire + add-role + type/notes wiring + remove old tabs (T8). All spec items mapped.
- **Behavior preserved:** RoleCastPanel/RoleCostumePanel are verbatim extractions (same fetch calls, handlers, helpers) scoped to one role — no logic change, lowering risk.
- **Type consistency:** client `Role` gains `notes: string | null` (T8) used by RoleCard (T7) / RoleNotesPanel (T4); `setRoleNotes(productionId, id, notes)` and role `PATCH {notes}` consistent across T2/T3/T4. The intentional transient tsc error in T7 (role.notes) is resolved in T8.
- **Tabs.tsx retained:** still used inside RoleCard; only RosterTab/CostumesTab are removed.
- **Order note:** Tasks 5–7 create new files while the old tab files still exist (both compile); Task 8 flips ProductionWorkspace over and deletes the old files in one commit so there's never a broken intermediate build.
