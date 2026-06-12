# AI Fabric-Yardage Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-click "✨ Estimate fabric" button on the Costume Creations "Fabric list" tab that asks Haiku to estimate yardage for every make-piece missing one, persists the estimates, and refreshes the worklist + purchase list — all values stay editable.

**Architecture:** A new AI lib (`estimate-fabric.ts`) mirrors the shipped `suggest-roles.ts` (Anthropic SDK, `claude-haiku-4-5`, schema-constrained JSON). A new `POST /api/productions/[id]/estimate-fabric` route loads the production, builds the make worklist, selects make-items with no yardage, calls the lib, persists each estimate via the existing `upsertPieceSource` (merging onto current fields), and returns the refreshed pieces. `TailorSummary` gains an `aiConfigured` prop and renders the button on the Fabric tab; both the summary page and My Work page pass the gate.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Anthropic SDK `@anthropic-ai/sdk@0.104.1` (`claude-haiku-4-5`), Supabase (`supabaseAdmin`), Clerk auth via `getAuthContext`, Vitest.

---

## Design decisions locked for this plan

- **Not-configured status code = `501`.** The spec text says "400/clear error", but the mirrored, shipped `suggest-roles/route.ts` returns `501` for the identical "AI not configured" case. We match the established pattern so both AI routes behave identically. (The route test asserts `501`.)
- **`isAiConfigured` is re-exported** from `estimate-fabric.ts` (`export { isAiConfigured } from "@/lib/ai/suggest-roles"`) rather than moved — the spec says "prefer importing the existing export". The route imports it from `@/lib/ai/estimate-fabric`.
- **My Work passes `aiConfigured` too** (spec default: "the button appears there too — acceptable"). No `filterMakerId` hiding.
- **Persist = merge.** `upsertPieceSource` writes *all* fields it's given, so when persisting an estimate we pass through every existing field of the piece (source, fabric type/color/width/supplier, unit cost, made, makerId) and only set `fabricYardage`. Lazy items (no row yet) get a fresh `source: "make"` row with just the yardage.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/ai/estimate-fabric.ts` | **new** — `EstimateItem`, `estimateFabricYardage(items)` (Haiku, schema output, defensive parse), re-export `isAiConfigured`. |
| `src/lib/ai/estimate-fabric.test.ts` | **new** — unit test: empty-input short-circuit, defensive parse (clamp/ignore-bad-keys/round), JSON-failure → empty map. |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` | **new** — POST: auth → gate → build worklist → estimate missing → persist → return refreshed pieces + count. |
| `src/app/api/productions/[id]/estimate-fabric/route.test.ts` | **new** — route test (mocks lib + data layer). |
| `src/components/TailorSummary.tsx` | `aiConfigured` prop + Estimate-fabric button/flow on the Fabric tab. |
| `src/app/(app)/productions/[id]/summary/page.tsx` | pass `aiConfigured={isAiConfigured()}`. |
| `src/app/(app)/my-work/page.tsx` | pass `aiConfigured={isAiConfigured()}`. |

---

## Task 1: AI lib — `estimateFabricYardage`

**Files:**
- Create: `src/lib/ai/estimate-fabric.ts`
- Test: `src/lib/ai/estimate-fabric.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/estimate-fabric.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create } })),
}));

import { estimateFabricYardage, type EstimateItem } from "@/lib/ai/estimate-fabric";

beforeEach(() => {
  create.mockReset();
});

const aiText = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

const items: EstimateItem[] = [
  { key: "c1:d1", garment: "Cloak", fabricWidth: '60"', measurements: [{ label: "Height", value: 70, unit: "in" }] },
];

test("returns an empty map without calling the model when items is empty", async () => {
  const out = await estimateFabricYardage([]);
  expect(out.size).toBe(0);
  expect(create).not.toHaveBeenCalled();
});

test("parses estimates into a Map, rounding to one decimal", async () => {
  create.mockResolvedValue(aiText({ estimates: [{ key: "c1:d1", yardage: 3.46 }] }));
  const out = await estimateFabricYardage(items);
  expect(out.get("c1:d1")).toBe(3.5);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ model: "claude-haiku-4-5" }),
  );
});

test("ignores non-positive, non-numeric, mis-shaped, and keyless estimates", async () => {
  create.mockResolvedValue(
    aiText({
      estimates: [
        { key: "ok", yardage: 2.5 },
        { key: "neg", yardage: -1 },
        { key: "zero", yardage: 0 },
        { key: "nan", yardage: "x" },
        { yardage: 4 },
        { key: "", yardage: 4 },
        null,
      ],
    }),
  );
  const out = await estimateFabricYardage(items);
  expect([...out.entries()]).toEqual([["ok", 2.5]]);
});

test("returns an empty map when the model output is not valid JSON", async () => {
  create.mockResolvedValue({ content: [{ type: "text", text: "sorry, no idea" }] });
  const out = await estimateFabricYardage(items);
  expect(out.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ai/estimate-fabric.test.ts`
Expected: FAIL — `estimateFabricYardage` cannot be imported (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/lib/ai/estimate-fabric.ts`:

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// AI estimates are optional — they only run when an Anthropic key is set. Reuse
// the existing gate rather than duplicating it (one source of truth).
export { isAiConfigured } from "@/lib/ai/suggest-roles";

export interface EstimateItem {
  key: string; // pieceKey(castingId, designId)
  garment: string; // design name, e.g. "Cloak"
  fabricWidth: string | null; // e.g. '60"' if entered
  measurements: { label: string; value: number; unit: string }[];
}

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    estimates: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, yardage: { type: "number" } },
        required: ["key", "yardage"],
        additionalProperties: false,
      },
    },
  },
  required: ["estimates"],
  additionalProperties: false,
} as const;

// Estimate the yards of fabric to construct each garment for a performer with the
// given measurements at the given width. Returns Map<key, yardage>; keys the model
// omits or garbles are simply absent. Returns empty immediately when items is empty.
export async function estimateFabricYardage(items: EstimateItem[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: ESTIMATE_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          "You are a theatrical costume fabric estimator. For each garment below, estimate the " +
          "yards of fabric needed to construct it for a performer with the given measurements at the " +
          'given fabric width (assume 45" if the width is unknown). Return yardage as a positive ' +
          "number to one decimal place. Respond as JSON: " +
          '{"estimates": [{"key": "<key>", "yardage": <number>}, ...]} — one entry per garment, ' +
          "reusing each garment's exact key.\n\n" +
          JSON.stringify(
            items.map((it) => ({
              key: it.key,
              garment: it.garment,
              fabricWidth: it.fabricWidth ?? "unknown",
              measurements: it.measurements.map((m) => `${m.label}: ${m.value}${m.unit}`),
            })),
            null,
            2,
          ),
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  let parsed: { estimates?: unknown };
  try {
    parsed = JSON.parse(raw) as { estimates?: unknown };
  } catch {
    return out;
  }
  if (!Array.isArray(parsed.estimates)) return out;
  for (const e of parsed.estimates) {
    if (!e || typeof e !== "object") continue;
    const { key, yardage } = e as { key?: unknown; yardage?: unknown };
    if (typeof key !== "string" || !key) continue;
    if (typeof yardage !== "number" || !Number.isFinite(yardage) || yardage <= 0) continue;
    out.set(key, Math.round(yardage * 10) / 10);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ai/estimate-fabric.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/estimate-fabric.ts src/lib/ai/estimate-fabric.test.ts
git commit -m "feat: estimateFabricYardage AI lib (Haiku, schema output)"
```

---

## Task 2: Route — `POST /api/productions/[id]/estimate-fabric`

**Files:**
- Create: `src/app/api/productions/[id]/estimate-fabric/route.ts`
- Test: `src/app/api/productions/[id]/estimate-fabric/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/productions/[id]/estimate-fabric/route.test.ts`:

```ts
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

const loadCostumeCreationsData = vi.fn();
vi.mock("@/lib/data/costume-creations", () => ({
  loadCostumeCreationsData: (...a: unknown[]) => loadCostumeCreationsData(...a),
}));

const listCostumePieces = vi.fn();
const upsertPieceSource = vi.fn();
vi.mock("@/lib/data/costume-pieces", () => ({
  listCostumePieces: (...a: unknown[]) => listCostumePieces(...a),
  upsertPieceSource: (...a: unknown[]) => upsertPieceSource(...a),
}));

const isAiConfigured = vi.fn();
const estimateFabricYardage = vi.fn();
vi.mock("@/lib/ai/estimate-fabric", () => ({
  isAiConfigured: () => isAiConfigured(),
  estimateFabricYardage: (...a: unknown[]) => estimateFabricYardage(...a),
}));

import { POST } from "@/app/api/productions/[id]/estimate-fabric/route";
import type { PieceRow } from "@/lib/tailor-summary";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, loadCostumeCreationsData, listCostumePieces, upsertPieceSource, isAiConfigured, estimateFabricYardage].forEach(
    (m) => m.mockReset(),
  );
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "POST" });

// One role/design/casting; no piece rows → the make-item is lazy and missing yardage.
const piece = (over: Partial<PieceRow> = {}): PieceRow => ({
  costume_design_id: "d1",
  casting_id: "c1",
  source: "make",
  fabric_type: null,
  fabric_color: null,
  fabric_width: null,
  fabric_supplier: null,
  fabric_yardage: null,
  fabric_unit_cost: null,
  made: false,
  maker_id: null,
  ...over,
});

const dataWith = (initialPieces: PieceRow[]) => ({
  roles: [{ id: "r1", name: "Lead", notes: null }],
  designs: [{ id: "d1", role_id: "r1", name: "Cloak", display_order: 0, inventory_item_id: null }],
  castings: [{ id: "c1", cast_id: "cast1", role_id: "r1", performer_id: "pf1", assignment: "primary" }],
  performers: [{ id: "pf1", name: "Ana" }],
  casts: [{ id: "cast1", name: "Cast A" }],
  initialPieces,
  measurementsByCasting: { c1: [{ key: "height", label: "Height", value: 70, unit: "in" }] },
});

test("estimates only make-items missing a yardage and persists each via upsertPieceSource", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(dataWith([])); // lazy item, no yardage
  estimateFabricYardage.mockResolvedValue(new Map([["c1:d1", 3.5]]));
  upsertPieceSource.mockResolvedValue(piece({ fabric_yardage: 3.5 }));
  const refreshed = [piece({ fabric_yardage: 3.5 })];
  listCostumePieces.mockResolvedValue(refreshed);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: refreshed, estimated: 1 });

  // Estimator saw exactly the one missing item, with garment name, width, measurements.
  expect(estimateFabricYardage).toHaveBeenCalledWith([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: null,
      measurements: [{ label: "Height", value: 70, unit: "in" }],
    },
  ]);
  // Persisted with the estimate, preserving the (empty) existing fields and source "make".
  expect(upsertPieceSource).toHaveBeenCalledWith({
    designId: "d1",
    castingId: "c1",
    source: "make",
    sourceNote: null,
    fabricType: null,
    fabricColor: null,
    fabricWidth: null,
    fabricSupplier: null,
    fabricYardage: 3.5,
    fabricUnitCost: null,
    made: false,
    makerId: null,
  });
});

test("preserves an existing piece's other fabric fields when filling its yardage", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(
    dataWith([
      piece({
        fabric_type: "Wool",
        fabric_color: "Black",
        fabric_width: '60"',
        fabric_supplier: "Mood",
        fabric_unit_cost: 12,
        made: true,
        maker_id: "m1",
        fabric_yardage: null,
      }),
    ]),
  );
  estimateFabricYardage.mockResolvedValue(new Map([["c1:d1", 4]]));
  upsertPieceSource.mockResolvedValue(piece({ fabric_yardage: 4 }));
  listCostumePieces.mockResolvedValue([piece({ fabric_yardage: 4 })]);

  await POST(req(), ctx("p1"));

  expect(estimateFabricYardage).toHaveBeenCalledWith([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: '60"',
      measurements: [{ label: "Height", value: 70, unit: "in" }],
    },
  ]);
  expect(upsertPieceSource).toHaveBeenCalledWith({
    designId: "d1",
    castingId: "c1",
    source: "make",
    sourceNote: null,
    fabricType: "Wool",
    fabricColor: "Black",
    fabricWidth: '60"',
    fabricSupplier: "Mood",
    fabricYardage: 4,
    fabricUnitCost: 12,
    made: true,
    makerId: "m1",
  });
});

test("returns estimated:0 without calling the AI when nothing is missing", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  const initial = [piece({ fabric_yardage: 2 })];
  loadCostumeCreationsData.mockResolvedValue(dataWith(initial));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: initial, estimated: 0 });
  expect(estimateFabricYardage).not.toHaveBeenCalled();
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("does not persist keys the model omits", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  loadCostumeCreationsData.mockResolvedValue(dataWith([]));
  estimateFabricYardage.mockResolvedValue(new Map()); // model returned nothing usable
  listCostumePieces.mockResolvedValue([]);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ pieces: [], estimated: 0 });
  expect(upsertPieceSource).not.toHaveBeenCalled();
});

test("501 when AI is not configured", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(false);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(501);
  expect(loadCostumeCreationsData).not.toHaveBeenCalled();
  expect(estimateFabricYardage).not.toHaveBeenCalled();
});

test("404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`
Expected: FAIL — route module does not exist (cannot import `POST`).

- [ ] **Step 3: Write the implementation**

Create `src/app/api/productions/[id]/estimate-fabric/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadCostumeCreationsData } from "@/lib/data/costume-creations";
import { buildMakeWorklist } from "@/lib/tailor-summary";
import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";
import { pieceKey } from "@/lib/costume-merge";
import { isAiConfigured, estimateFabricYardage, type EstimateItem } from "@/lib/ai/estimate-fabric";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    const production = await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "AI estimates are not configured." }, { status: 501 });
    }

    const data = await loadCostumeCreationsData(orgId, production);
    // Whole-production worklist (no maker filter) — estimate every missing yardage.
    const worklist = buildMakeWorklist(
      data.roles,
      data.designs,
      data.castings,
      data.performers,
      data.casts,
      data.initialPieces,
    );

    // Existing rows, by piece key, so we can merge each estimate onto current fields.
    const pieceByKey = new Map(
      data.initialPieces.map((p) => [pieceKey(p.casting_id, p.costume_design_id), p]),
    );

    // Select make-items with no yardage yet (never overwrite a human entry).
    const toEstimate: EstimateItem[] = [];
    for (const role of worklist.roles) {
      for (const garment of role.garments) {
        for (const item of garment.items) {
          if (item.fabric.yardage != null) continue;
          toEstimate.push({
            key: pieceKey(item.castingId, item.designId),
            garment: garment.designName,
            fabricWidth: item.fabric.width,
            measurements: (data.measurementsByCasting[item.castingId] ?? []).map((m) => ({
              label: m.label,
              value: m.value,
              unit: m.unit,
            })),
          });
        }
      }
    }

    if (toEstimate.length === 0) {
      return NextResponse.json({ pieces: data.initialPieces, estimated: 0 });
    }

    const estimates = await estimateFabricYardage(toEstimate);

    let estimated = 0;
    for (const it of toEstimate) {
      const yardage = estimates.get(it.key);
      if (yardage == null) continue;
      // pieceKey is `${castingId}:${designId}`; UUIDs contain no colon.
      const [castingId, designId] = it.key.split(":");
      const existing = pieceByKey.get(it.key);
      await upsertPieceSource({
        designId,
        castingId,
        source: existing?.source ?? "make",
        sourceNote: existing?.source_note ?? null,
        fabricType: existing?.fabric_type ?? null,
        fabricColor: existing?.fabric_color ?? null,
        fabricWidth: existing?.fabric_width ?? null,
        fabricSupplier: existing?.fabric_supplier ?? null,
        fabricYardage: yardage,
        fabricUnitCost: existing?.fabric_unit_cost ?? null,
        made: existing?.made ?? false,
        makerId: existing?.maker_id ?? null,
      });
      estimated += 1;
    }

    const pieces = await listCostumePieces(data.designs.map((d) => d.id));
    return NextResponse.json({ pieces, estimated });
  } catch (err) {
    return errorResponse(err);
  }
}
```

> **Note on `PieceRow` vs `CostumePiece`:** `data.initialPieces` is typed `CostumePiece[]` from `loadCostumeCreationsData`, but `buildMakeWorklist` accepts `PieceRow[]`. `CostumePiece` is a structural superset of `PieceRow` (it has every field `PieceRow` declares plus extras like `id`/`created_at`), so it's assignable — this matches how `TailorSummary` already passes `initialPieces` into `buildMakeWorklist`. The `source_note` field read above (`existing?.source_note`) exists on `CostumePiece`. No cast needed; if `tsc` complains, the cause is a real type mismatch, not this note.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/estimate-fabric/route.ts" "src/app/api/productions/[id]/estimate-fabric/route.test.ts"
git commit -m "feat: POST estimate-fabric route — estimate missing yardages + persist"
```

---

## Task 3: UI — `aiConfigured` prop + Estimate-fabric button

**Files:**
- Modify: `src/components/TailorSummary.tsx`
- Modify: `src/app/(app)/productions/[id]/summary/page.tsx`
- Modify: `src/app/(app)/my-work/page.tsx`

This task is wiring + UI (no unit test — the route is the tested seam). Verify via `tsc` + `lint` + build, then the manual browser check in the Verification section.

- [ ] **Step 1: Add the `aiConfigured` prop and estimate flow to `TailorSummary`**

In `src/components/TailorSummary.tsx`, add `aiConfigured` to both the destructured params and the prop type. Replace the destructuring block (lines 22–50) so it reads:

```tsx
export function TailorSummary({
  productionId,
  roles,
  designs,
  castings,
  performers,
  casts,
  initialPieces,
  photosByRole,
  measurementsByCasting,
  makers,
  costumesDueDate,
  today,
  filterMakerId,
  aiConfigured,
}: {
  productionId: string;
  roles: Role[];
  designs: Design[];
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  initialPieces: PieceRow[];
  photosByRole: Record<string, RolePhoto[]>;
  measurementsByCasting: Record<string, MeasurementView[]>;
  makers: { id: string; name: string; color: string }[];
  costumesDueDate: string | null;
  today: string;
  filterMakerId?: string;
  aiConfigured?: boolean;
}) {
```

- [ ] **Step 2: Add estimate state and handler**

In `src/components/TailorSummary.tsx`, just after the existing `const [pieces, setPieces] = useState<PieceRow[]>(initialPieces);` (line 52), add:

```tsx
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  async function estimateFabric() {
    setEstimating(true);
    setEstimateError(null);
    const res = await fetch(`/api/productions/${productionId}/estimate-fabric`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { pieces: PieceRow[]; estimated: number };
      setPieces(data.pieces);
    } else {
      setEstimateError(
        ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't estimate fabric",
      );
    }
    setEstimating(false);
  }
```

- [ ] **Step 3: Render the button above the purchase list**

In `src/components/TailorSummary.tsx`, replace the Fabric-tab branch (currently `) : (\n        <FabricPurchaseList purchase={purchase} />\n      )}`) with:

```tsx
      ) : (
        <div className="space-y-3">
          {aiConfigured && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={estimateFabric}
                disabled={estimating}
                className="btn-primary"
              >
                {estimating ? "Estimating…" : "✨ Estimate fabric"}
              </button>
              <span className="text-sm muted">fills empty yardages only</span>
            </div>
          )}
          {estimateError && <p className="text-sm text-[var(--red)]">{estimateError}</p>}
          <FabricPurchaseList purchase={purchase} />
        </div>
      )}
```

- [ ] **Step 4: Pass `aiConfigured` from the summary page**

In `src/app/(app)/productions/[id]/summary/page.tsx`:

Add the import (alongside the existing imports near the top):

```tsx
import { isAiConfigured } from "@/lib/ai/estimate-fabric";
```

Change the render line from:

```tsx
      <TailorSummary {...data} today={todayIso()} />
```

to:

```tsx
      <TailorSummary {...data} today={todayIso()} aiConfigured={isAiConfigured()} />
```

- [ ] **Step 5: Pass `aiConfigured` from the My Work page**

In `src/app/(app)/my-work/page.tsx`:

Add the import (alongside the existing imports near the top):

```tsx
import { isAiConfigured } from "@/lib/ai/estimate-fabric";
```

Just before `const today = todayIso();`, capture the gate once (server env read):

```tsx
  const aiConfigured = isAiConfigured();
```

Change the render line from:

```tsx
            <TailorSummary {...s.data} filterMakerId={maker.id} today={today} />
```

to:

```tsx
            <TailorSummary {...s.data} filterMakerId={maker.id} today={today} aiConfigured={aiConfigured} />
```

- [ ] **Step 6: Verify types, lint, and the full test suite**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (including Tasks 1 & 2).

- [ ] **Step 7: Commit**

```bash
git add src/components/TailorSummary.tsx "src/app/(app)/productions/[id]/summary/page.tsx" "src/app/(app)/my-work/page.tsx"
git commit -m "feat: Estimate-fabric button on Costume Creations Fabric tab"
```

---

## Verification (manual, with `ANTHROPIC_API_KEY` set)

The live AI call can only be checked in an authenticated browser. Do NOT push/deploy (see memory `no-push-without-greenlight`).

1. `npm run dev`, sign in, open a production with make-pieces whose yardage is blank → **Costume Creations** → **Fabric list** tab.
2. Confirm the **✨ Estimate fabric** button appears (it's hidden if `ANTHROPIC_API_KEY` is unset) with the "fills empty yardages only" note.
3. Click it → button shows "Estimating…", then the purchase-list totals populate. Switch to **To make** tab → the per-piece yardage fields now show the estimates.
4. Edit one estimate (blur to save) → value persists; re-clicking **Estimate fabric** does **not** overwrite it (only blank yardages are filled).
5. Confirm `/my-work` shows the same button per production.

## Self-Review (completed by plan author)

- **Spec coverage:** §1 AI lib → Task 1 (`estimateFabricYardage`, Haiku, schema, defensive parse, empty-input short-circuit, `isAiConfigured` re-export). §2 route → Task 2 (auth → gate → `loadCostumeCreationsData` → `buildMakeWorklist` no filter → select `yardage == null` → `EstimateItem`s with `garment`/`fabricWidth`/`measurements`/`key` → persist via `upsertPieceSource` merging fields → refreshed `listCostumePieces` + `estimated`; early return when none missing; gate). §3 UI → Task 3 (`aiConfigured` prop, button above `FabricPurchaseList` on Fabric tab, busy/error states, `setPieces` recompute, both pages pass the gate). Testing → route TDD (Task 2, all four asserted behaviors a–d) + lib unit test (Task 1).
- **Deviation logged:** not-configured returns `501` (matches shipped `suggest-roles`), not the spec's loose "400". Asserted in the test so it's intentional and visible.
- **Placeholder scan:** none — every code step contains full code.
- **Type consistency:** `estimateFabricYardage(items: EstimateItem[]): Promise<Map<string, number>>` and `EstimateItem` are identical across lib/route/tests. `pieceKey(castingId, designId)` order matches `costume-merge.ts`. `upsertPieceSource` call uses the exact field names from its signature. `aiConfigured?: boolean` is optional, so existing callers (none other) and tests are unaffected.
```
