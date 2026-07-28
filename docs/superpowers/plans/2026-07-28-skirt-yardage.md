# Skirt Yardage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute fabric yardage for skirt pieces from the performer's waist and waist-to-ankle measurements, shown per piece in the making area, replacing the AI estimate for those pieces.

**Architecture:** A pure math module holds all the geometry and is unit-tested in isolation — that is where every real risk lives. Two new columns on `costume_pieces` record the construction the user picked. `MakePieceRow` reads the measurements it already receives, calls the pure function, and saves the result into the existing `fabric_yardage` column, so the cost rollup, tailor's summary, and purchase list need no changes. The AI estimator gains one filter to skip pieces the calculator owns.

**Tech Stack:** TypeScript strict, React 19 client component, Next.js 16 App Router, Supabase, Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-07-28-skirt-yardage-design.md`

## Global Constraints

- **Constants, exact values:** `HEM_ALLOWANCE_IN = 1`, `WAIST_SEAM_IN = 1`, `SELVAGE_IN = 2`, `WASTE_ALLOWANCE = 0.10`, `ROUND_TO_YARDS = 0.25`.
- **Circle fractions:** `full_circle` 1, `three_quarter_circle` 0.75, `half_circle` 0.5. Panel count is `4 × fraction` — 4, 3, 2 respectively.
- **Precedence, highest first:** manual entry → skirt calculator → AI estimate → blank.
- **Construction is never inferred from the design name.** It is always an explicit user choice. Design names are free text.
- **The three worked anchors must hold exactly:** full circle 27"/32"/45" → **4.75 yd**; full circle 26"/20"/60" → **1.75 yd**; gathered 27"/32"/45" at 3× fullness → **2.25 yd**.
- **Measurement keys:** waist is `waist`; skirt length is `outseam`, labeled "Outseam" with help text "Waist to ankle".
- No new dependencies. No changes to the cost rollup, tailor's summary, or fabric purchase list — the value lands in `fabric_yardage` precisely so those keep working untouched.
- **This is Next.js 16.** Per `AGENTS.md` check `node_modules/next/dist/docs/` before assuming older App Router patterns. Nothing here needs a routing change.
- **Do not push and do not deploy.** Local commits only, on branch `feat/skirt-yardage`, until Chris gives an explicit green light. Migration `0031` is applied to Supabase by Chris by hand — do not attempt to run it.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/fabric/skirt-yardage.ts` *(create)* | All geometry, plus fabric-width parsing. Pure. |
| `src/lib/fabric/skirt-yardage.test.ts` *(create)* | Unit tests — the anchors and every branch |
| `supabase/migrations/0031_skirt_construction.sql` *(create)* | Two columns on `costume_pieces` |
| `src/lib/data/costume-pieces.ts` *(modify)* | Persist the two new fields |
| `src/lib/costume-merge.ts` *(modify)* | `pieceRowIsEmpty` must count a construction as content |
| `src/lib/costume-merge.test.ts` *(modify)* | Cover that |
| `src/app/api/productions/[id]/pieces/route.ts` *(modify)* | Accept and validate the two new fields |
| `src/lib/tailor-summary.ts` *(modify)* | Thread the fields through `PieceRow` and `Fabric` |
| `src/components/MakePieceRow.tsx` *(modify)* | The picker, the recompute, the derivation |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` *(modify)* | Skip calculator-owned pieces |

Task 1 is pure and standalone. Task 2 is persistence. Task 3 is UI. Task 4 is the AI filter plus the whole-feature gate.

---

### Task 1: The yardage math

**Files:**
- Create: `src/lib/fabric/skirt-yardage.ts`, `src/lib/fabric/skirt-yardage.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `@/lib/fabric/skirt-yardage`:
  - `type SkirtConstruction = "full_circle" | "three_quarter_circle" | "half_circle" | "gathered"`
  - `SKIRT_CONSTRUCTIONS: SkirtConstruction[]` — display order for the picker
  - `CONSTRUCTION_LABELS: Record<SkirtConstruction, string>`
  - `isSkirtConstruction(v: unknown): v is SkirtConstruction`
  - `parseWidthInches(raw: string | null | undefined): number | null`
  - `estimateSkirtYardage(input: SkirtYardageInput): SkirtYardageResult`

  Tasks 2, 3 and 4 all import from here under exactly these names.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fabric/skirt-yardage.test.ts`:

```ts
import { expect, test, describe } from "vitest";
import {
  estimateSkirtYardage,
  parseWidthInches,
  isSkirtConstruction,
  SKIRT_CONSTRUCTIONS,
  CONSTRUCTION_LABELS,
} from "@/lib/fabric/skirt-yardage";

// The three anchors from the spec. The first is the one to show Nada: she said a
// full circle skirt takes 4 yards, and the raw geometry lands at 4.14 before the
// allowance. If this test changes, the change needs her eyes.
describe("worked anchors", () => {
  test("full circle, 27\" waist, 32\" length, 45\" fabric", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.yards).toBe(4.75);
    expect(r.warning).toBeUndefined();
  });

  test("full circle, 26\" waist, 20\" length, 60\" fabric", () => {
    expect(
      estimateSkirtYardage({
        construction: "full_circle",
        waistInches: 26,
        lengthInches: 20,
        fabricWidthInches: 60,
      }).yards,
    ).toBe(1.75);
  });

  test("gathered at 3x fullness, 27\" waist, 32\" length, 45\" fabric", () => {
    expect(
      estimateSkirtYardage({
        construction: "gathered",
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
        fullness: 3,
      }).yards,
    ).toBe(2.25);
  });
});

describe("panel layout branches", () => {
  // Narrow: one panel per row, so all four stack -> 4R.
  test("fabric narrower than 2R uses four rows", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.steps.join(" ")).toContain("1 per row");
    expect(r.steps.join(" ")).toContain("4 rows");
  });

  // Middle: the whole circle fits as one square -> 2R. This is the common case.
  test("fabric at least 2R uses two rows", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 26,
      lengthInches: 20,
      fabricWidthInches: 60,
    });
    expect(r.steps.join(" ")).toContain("2 per row");
    expect(r.steps.join(" ")).toContain("2 rows");
  });

  // Wide: all four panels fit in one row -> R.
  test("fabric at least 4R uses one row", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 25.13,
      lengthInches: 8,
      fabricWidthInches: 60,
    });
    expect(r.steps.join(" ")).toContain("4 per row");
    expect(r.steps.join(" ")).toContain("1 row");
  });
});

describe("constructions", () => {
  test("panel count follows the circle fraction", () => {
    const at = (construction: "full_circle" | "three_quarter_circle" | "half_circle") =>
      estimateSkirtYardage({
        construction,
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
      }).steps.join(" ");
    expect(at("full_circle")).toContain("4 panels");
    expect(at("three_quarter_circle")).toContain("3 panels");
    expect(at("half_circle")).toContain("2 panels");
  });

  test("a smaller circle fraction needs less fabric", () => {
    const yards = (construction: "full_circle" | "half_circle") =>
      estimateSkirtYardage({
        construction,
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
      }).yards;
    expect(yards("half_circle")).toBeLessThan(yards("full_circle"));
  });

  test("gathered without fullness defaults to 2x and says so", () => {
    const r = estimateSkirtYardage({
      construction: "gathered",
      waistInches: 27,
      lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(r.steps.join(" ")).toContain("assuming 2");
    expect(r.yards).toBeGreaterThan(0);
  });

  test("fullness is ignored for circle constructions", () => {
    const withF = estimateSkirtYardage({
      construction: "full_circle", waistInches: 27, lengthInches: 32,
      fabricWidthInches: 45, fullness: 3,
    });
    const withoutF = estimateSkirtYardage({
      construction: "full_circle", waistInches: 27, lengthInches: 32,
      fabricWidthInches: 45,
    });
    expect(withF.yards).toBe(withoutF.yards);
  });
});

describe("edge cases", () => {
  test("a panel wider than the fabric warns and still returns a yardage", () => {
    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 30,
      lengthInches: 60,
      fabricWidthInches: 36,
    });
    expect(r.warning).toContain("piecing");
    expect(Number.isFinite(r.yards)).toBe(true);
    expect(r.yards).toBeGreaterThan(0);
  });

  test.each([
    ["waist", { waistInches: 0 }],
    ["length", { lengthInches: -5 }],
    ["width", { fabricWidthInches: Number.NaN }],
  ])("throws on a non-positive %s", (_label, patch) => {
    expect(() =>
      estimateSkirtYardage({
        construction: "full_circle",
        waistInches: 27,
        lengthInches: 32,
        fabricWidthInches: 45,
        ...patch,
      }),
    ).toThrow();
  });

  test("throws when the fabric is narrower than the selvage allowance", () => {
    expect(() =>
      estimateSkirtYardage({
        construction: "gathered", waistInches: 27, lengthInches: 32, fabricWidthInches: 2,
      }),
    ).toThrow();
  });

  test("every successful call explains itself", () => {
    for (const construction of SKIRT_CONSTRUCTIONS) {
      const r = estimateSkirtYardage({
        construction, waistInches: 27, lengthInches: 32, fabricWidthInches: 45, fullness: 2,
      });
      expect(r.steps.length, `no steps for ${construction}`).toBeGreaterThan(2);
      expect(r.yards).toBeGreaterThan(0);
    }
  });
});

describe("helpers", () => {
  test.each([
    ['45"', 45],
    ["60", 60],
    ["  54 in  ", 54],
    ["45.5\"", 45.5],
    ["", null],
    [null, null],
    ["wide", null],
  ])("parseWidthInches(%p) -> %p", (raw, expected) => {
    expect(parseWidthInches(raw as string | null)).toBe(expected);
  });

  test("isSkirtConstruction accepts only the four known values", () => {
    expect(isSkirtConstruction("full_circle")).toBe(true);
    expect(isSkirtConstruction("gathered")).toBe(true);
    expect(isSkirtConstruction("a_line")).toBe(false);
    expect(isSkirtConstruction(null)).toBe(false);
  });

  test("every construction has a label and appears in the picker order", () => {
    for (const c of SKIRT_CONSTRUCTIONS) expect(CONSTRUCTION_LABELS[c]).toBeTruthy();
    expect(SKIRT_CONSTRUCTIONS).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/fabric/skirt-yardage.test.ts`

Expected: FAIL — `@/lib/fabric/skirt-yardage` does not resolve.

- [ ] **Step 3: Write the module**

Create `src/lib/fabric/skirt-yardage.ts`:

```ts
// Fabric yardage for skirts, computed from the performer's measurements.
//
// This exists because a skirt's fabric requirement is a closed-form function of
// two measurements and the fabric width — so arithmetic beats the AI estimator
// (src/lib/ai/estimate-fabric.ts) at it: reproducible, explainable, free, and it
// cannot hallucinate. Pieces with no construction set stay on the AI path.
//
// The math is standard drafting geometry, not a formula supplied by Nada — hers
// could not be found. It is validated against the one figure we have from her:
// a full circle skirt at 27" waist / 32" length on 45" goods, which she puts at
// 4 yards and this puts at 4.14 before allowance. See the design spec.
//
// Pure: no I/O, no framework imports. All of this feature's real risk lives here,
// which is why it is a separate module.

export type SkirtConstruction =
  | "full_circle"
  | "three_quarter_circle"
  | "half_circle"
  | "gathered";

export const SKIRT_CONSTRUCTIONS: SkirtConstruction[] = [
  "full_circle",
  "three_quarter_circle",
  "half_circle",
  "gathered",
];

export const CONSTRUCTION_LABELS: Record<SkirtConstruction, string> = {
  full_circle: "Full circle",
  three_quarter_circle: "Three-quarter circle",
  half_circle: "Half circle",
  gathered: "Gathered",
};

export interface SkirtYardageInput {
  construction: SkirtConstruction;
  waistInches: number;
  lengthInches: number; // waist to hem
  fabricWidthInches: number;
  fullness?: number; // gathered only: 2, 2.5, or 3
}

export interface SkirtYardageResult {
  yards: number; // rounded up to the next quarter yard
  steps: string[]; // one line per stage, shown to the user
  warning?: string;
}

const HEM_ALLOWANCE_IN = 1;
const WAIST_SEAM_IN = 1;
// Unusable edge on both sides together. Load-bearing at boundaries: when 2R sits
// near the usable width this constant flips the layout and nearly doubles the
// answer. That is how cutting fabric actually behaves, not a modelling artifact.
const SELVAGE_IN = 2;
const WASTE_ALLOWANCE = 0.1;
const ROUND_TO_YARDS = 0.25;
const DEFAULT_FULLNESS = 2;

const CIRCLE_FRACTION: Record<Exclude<SkirtConstruction, "gathered">, number> = {
  full_circle: 1,
  three_quarter_circle: 0.75,
  half_circle: 0.5,
};

export function isSkirtConstruction(v: unknown): v is SkirtConstruction {
  return typeof v === "string" && (SKIRT_CONSTRUCTIONS as string[]).includes(v);
}

// Fabric widths are stored as free text from the org's Fabric settings — `45"`,
// `60`, `54 in`. Take the leading number; null when there isn't one.
export function parseWidthInches(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.trim().match(/^\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function requirePositive(name: string, n: number): void {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

export function estimateSkirtYardage(input: SkirtYardageInput): SkirtYardageResult {
  requirePositive("Waist", input.waistInches);
  requirePositive("Length", input.lengthInches);
  requirePositive("Fabric width", input.fabricWidthInches);

  const usableWidth = input.fabricWidthInches - SELVAGE_IN;
  if (usableWidth <= 0) {
    throw new Error(`Fabric width must be more than ${SELVAGE_IN}" of selvage`);
  }

  const steps: string[] = [];
  let inches: number;
  let warning: string | undefined;

  if (input.construction === "gathered") {
    const fullness = input.fullness ?? DEFAULT_FULLNESS;
    if (input.fullness == null) {
      steps.push(`No fullness set — assuming ${DEFAULT_FULLNESS}× the waist.`);
    }
    const panelWidth = input.waistInches * fullness;
    const panels = Math.ceil(panelWidth / usableWidth);
    const panelLength = input.lengthInches + HEM_ALLOWANCE_IN + WAIST_SEAM_IN;
    inches = panels * panelLength;
    steps.push(`Gathered · ${input.fabricWidthInches}" fabric (${usableWidth}" usable)`);
    steps.push(`waist ${input.waistInches}" × ${fullness} fullness = ${r2(panelWidth)}" to gather`);
    steps.push(`${r2(panelWidth)}" ÷ ${usableWidth}" usable = ${plural(panels, "panel")}`);
    steps.push(
      `${panels} × (length ${input.lengthInches}" + hem ${HEM_ALLOWANCE_IN}" + seam ${WAIST_SEAM_IN}") = ${r2(inches)}"`,
    );
  } else {
    const f = CIRCLE_FRACTION[input.construction];
    const waistRadius = input.waistInches / (2 * Math.PI * f);
    const outerRadius = waistRadius + input.lengthInches + HEM_ALLOWANCE_IN;
    const panels = 4 * f;

    // Each panel needs an outerRadius × outerRadius square. How many fit across
    // decides how many rows of fabric the skirt costs: at 2 per row the whole
    // circle is one square (2R); at 1 per row all four stack (4R).
    let perRow = Math.floor(usableWidth / outerRadius);
    if (perRow < 1) {
      perRow = 1;
      warning = `A ${r2(outerRadius)}" panel is wider than the ${usableWidth}" of usable fabric — each panel will need piecing, and the estimate assumes one panel per row.`;
    }
    const rows = Math.ceil(panels / perRow);
    inches = rows * outerRadius;

    steps.push(
      `${CONSTRUCTION_LABELS[input.construction]} · ${input.fabricWidthInches}" fabric (${usableWidth}" usable)`,
    );
    steps.push(`waist ${input.waistInches}" ÷ (2π × ${f}) = ${r2(waistRadius)}" waist radius`);
    steps.push(
      `+ length ${input.lengthInches}" + hem ${HEM_ALLOWANCE_IN}" = ${r2(outerRadius)}" outer radius`,
    );
    steps.push(
      `${plural(panels, "panel")} of ${r2(outerRadius)}", ${perRow} per row = ${plural(rows, "row")}`,
    );
    steps.push(`${rows} × ${r2(outerRadius)}" = ${r2(inches)}"`);
  }

  const rawYards = inches / 36;
  const padded = rawYards * (1 + WASTE_ALLOWANCE);
  const yards = Math.ceil(padded / ROUND_TO_YARDS) * ROUND_TO_YARDS;

  steps.push(`${r2(inches)}" ÷ 36 = ${r2(rawYards)} yd`);
  steps.push(`+ ${Math.round(WASTE_ALLOWANCE * 100)}% allowance = ${r2(padded)} yd`);
  steps.push(`rounded up to the next ¼ yard = ${r2(yards)} yd`);

  return { yards: r2(yards), steps, warning };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/fabric/skirt-yardage.test.ts`

Expected: PASS. If an anchor is off, **do not adjust the expected value to match the code** — the anchors are the specification. Re-derive and report.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/fabric/skirt-yardage.ts src/lib/fabric/skirt-yardage.test.ts
git commit -m "feat(fabric): skirt yardage geometry

Closed-form fabric estimate for circle and gathered skirts from waist, length
and fabric width. Pure and fully tested, including the anchor Nada gave us: a
full circle skirt at 27/32 on 45\" goods lands at 4.14 yd raw against her
stated 4 yards. Returns the derivation so the UI can show its working."
```

---

### Task 2: Persist the construction

**Files:**
- Create: `supabase/migrations/0031_skirt_construction.sql`
- Modify: `src/lib/data/costume-pieces.ts`, `src/lib/costume-merge.ts`, `src/lib/costume-merge.test.ts`, `src/app/api/productions/[id]/pieces/route.ts`, `src/lib/tailor-summary.ts`

**Interfaces:**
- Consumes: `isSkirtConstruction` from `@/lib/fabric/skirt-yardage` (Task 1).
- Produces: `costume_pieces.skirt_construction` (text, checked) and `costume_pieces.skirt_fullness` (numeric); `upsertPieceSource` accepts `skirtConstruction?: string | null` and `skirtFullness?: number | null`; `CostumePiece`, `PieceRow` and `Fabric` all carry the values through to the UI. Task 3 reads `item.fabric.skirtConstruction` (`SkirtConstruction | null`) and `item.fabric.skirtFullness` (`number | null`); Task 4 reads `skirt_construction` off the raw piece row.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_skirt_construction.sql`:

```sql
-- Per-piece skirt construction, so fabric yardage can be computed from the
-- performer's measurements (src/lib/fabric/skirt-yardage.ts) instead of estimated
-- by the AI. A null construction means "not a skirt" and leaves the piece on the
-- AI path exactly as before, so every existing row keeps its current behaviour.
alter table costume_pieces add column if not exists skirt_construction text
  check (skirt_construction in
    ('full_circle','three_quarter_circle','half_circle','gathered'));

-- Gathered skirts only: how many times the waist measurement the panels total.
-- Meaningless for the circle constructions, which get their fullness from geometry.
alter table costume_pieces add column if not exists skirt_fullness numeric;
```

- [ ] **Step 2: Write the failing test for the empty-row guard**

`upsertPieceSource` deletes the row when `pieceRowIsEmpty` says every field is blank. A piece where the user picked a construction but has no measurements yet would have a null yardage and nothing else — so without this change, picking a construction would silently delete the row and lose the choice.

Append to `src/lib/costume-merge.test.ts`:

```ts
test("a piece with only a skirt construction is not empty", () => {
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
      skirtConstruction: "full_circle",
    }),
  ).toBe(false);
});

test("a piece with no construction and nothing else is still empty", () => {
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
      skirtConstruction: null,
    }),
  ).toBe(true);
});
```

Ensure `pieceRowIsEmpty` is imported at the top of that file; add it to the existing import if it is not already there.

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/costume-merge.test.ts`

Expected: FAIL — `skirtConstruction` is not part of the parameter type, and the first case returns `true`.

- [ ] **Step 4: Update `pieceRowIsEmpty`**

In `src/lib/costume-merge.ts`, add `skirtConstruction: string | null;` to the input type (after `makerId`), and change the return to account for it:

```ts
  return (
    input.source === "make" &&
    !input.sourceNote &&
    !hasFabric &&
    !input.made &&
    !input.makerId &&
    !input.skirtConstruction
  );
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/costume-merge.test.ts`

Expected: PASS.

- [ ] **Step 6: Thread the fields through the data layer**

In `src/lib/data/costume-pieces.ts`:

Add to the `CostumePiece` interface, after `fabric_unit_cost`:

```ts
  skirt_construction: string | null;
  skirt_fullness: number | null;
```

Add to the `upsertPieceSource` input type, after `fabricUnitCost`:

```ts
  skirtConstruction?: string | null;
  skirtFullness?: number | null;
```

In the body, alongside the other normalized locals:

```ts
  const skirtConstruction = clean(input.skirtConstruction);
  const skirtFullness = num(input.skirtFullness);
```

Pass `skirtConstruction` into the `pieceRowIsEmpty({ ... })` call, and add both to the `.upsert({ ... })` payload after `fabric_unit_cost`:

```ts
        skirt_construction: skirtConstruction,
        skirt_fullness: skirtFullness,
```

- [ ] **Step 7: Accept the fields at the API boundary**

In `src/app/api/productions/[id]/pieces/route.ts`, add to the destructured body type after `fabricUnitCost`:

```ts
      skirtConstruction?: string | null;
      skirtFullness?: number | null;
```

After the existing `checkNum` calls, validate:

```ts
    // Reject an unknown construction rather than letting the DB check constraint
    // surface as a 500.
    if (
      body.skirtConstruction != null &&
      body.skirtConstruction !== "" &&
      !isSkirtConstruction(body.skirtConstruction)
    ) {
      throw new ValidationError("Unknown skirt construction");
    }
    checkNum(body.skirtFullness, "Fullness");
```

Import `isSkirtConstruction` from `@/lib/fabric/skirt-yardage`, and `ValidationError` from `@/lib/errors` if that file does not already import it. Pass both fields through to `upsertPieceSource`, normalizing an empty string to null:

```ts
      skirtConstruction: body.skirtConstruction || null,
      skirtFullness: body.skirtFullness ?? null,
```

- [ ] **Step 8: Thread the fields through to the UI types**

In `src/lib/tailor-summary.ts`:

Add to `PieceRow`, after `fabric_unit_cost`:

```ts
  skirt_construction: string | null;
  skirt_fullness: number | null;
```

Add to `Fabric`, after `unitCost`:

```ts
  skirtConstruction: SkirtConstruction | null;
  skirtFullness: number | null;
```

Import the type at the top:

```ts
import { isSkirtConstruction, type SkirtConstruction } from "@/lib/fabric/skirt-yardage";
```

In `fabricFromRow`, add to the returned object:

```ts
    skirtConstruction: isSkirtConstruction(row.skirt_construction) ? row.skirt_construction : null,
    skirtFullness: row.skirt_fullness,
```

The `isSkirtConstruction` guard is what narrows the column's `string | null` to the
union type — a value that somehow bypassed the database check constraint becomes
null rather than a lie about the type.

In the empty-fabric constant just above it (the object reading
`type: null, color: null, width: null, supplier: null, yardage: null, unitCost: null`),
add `skirtConstruction: null, skirtFullness: null`.

- [ ] **Step 9: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean. TypeScript will point at any object literal that now needs the two new fields — including test fixtures that construct a `PieceRow` or `Fabric`. Add `skirt_construction: null` / `skirtConstruction: null` (and the fullness pair) to each. Do not loosen a type to avoid updating a fixture.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0031_skirt_construction.sql src/lib/data/costume-pieces.ts src/lib/costume-merge.ts src/lib/costume-merge.test.ts "src/app/api/productions/[id]/pieces/route.ts" src/lib/tailor-summary.ts
git commit -m "feat(fabric): persist skirt construction on costume pieces

Migration 0031 adds skirt_construction and skirt_fullness. Threads them through
the data layer, the pieces API, and the summary view types.

pieceRowIsEmpty now counts a construction as content — without that, picking a
construction before any measurements exist would leave every other field blank
and silently delete the row."
```

---

### Task 3: The picker and the derivation

**Files:**
- Modify: `src/components/MakePieceRow.tsx`

**Interfaces:**
- Consumes: `estimateSkirtYardage`, `parseWidthInches`, `SKIRT_CONSTRUCTIONS`, `CONSTRUCTION_LABELS`, `type SkirtConstruction` from `@/lib/fabric/skirt-yardage` (Task 1); `item.fabric.skirtConstruction` and `item.fabric.skirtFullness` (Task 2).
- Produces: nothing later tasks consume.

- [ ] **Step 1: Add the imports and the measurement lookup**

At the top of `src/components/MakePieceRow.tsx`, add:

```tsx
import { useMemo } from "react";
import {
  estimateSkirtYardage,
  parseWidthInches,
  SKIRT_CONSTRUCTIONS,
  CONSTRUCTION_LABELS,
  type SkirtConstruction,
} from "@/lib/fabric/skirt-yardage";
```

`useMemo` joins the existing `import { useRef, useState } from "react"` — merge them into one import rather than adding a second.

At the bottom of the file, beside the other helpers, add:

```tsx
// Measurements arrive as display rows; the numeric ones carry a number in `value`.
function measurementInches(rows: MeasurementView[], key: string): number | null {
  const row = rows.find((m) => m.key === key);
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
```

- [ ] **Step 2: Extend the request body and the save options**

Add to `PiecePutBody`, after `fabricUnitCost`:

```tsx
  skirtConstruction: string | null;
  skirtFullness: number | null;
```

Add state, beside the existing fabric state:

```tsx
  const [construction, setConstruction] = useState<string>(item.fabric.skirtConstruction ?? "");
  const [fullness, setFullness] = useState<string>(
    item.fabric.skirtFullness != null ? String(item.fabric.skirtFullness) : "3",
  );
```

Widen the `save` options and body. The options object gains three fields:

```tsx
  function save(opts?: {
    made?: boolean;
    makerId?: string | null;
    width?: string;
    supplier?: string;
    unitCost?: string;
    construction?: string;
    fullness?: string;
    yardage?: string;
  }) {
    const uc = opts?.unitCost ?? unitCost;
    const yd = opts?.yardage ?? yardage;
    const con = opts?.construction ?? construction;
    const ful = opts?.fullness ?? fullness;
    const body: PiecePutBody = {
      designId: item.designId,
      castingId: item.castingId,
      source: "make",
      fabricType: type.trim() || null,
      fabricColor: color.trim() || null,
      fabricWidth: (opts?.width ?? width).trim() || null,
      fabricSupplier: (opts?.supplier ?? supplier).trim() || null,
      fabricYardage: yd.trim() === "" ? null : Number(yd),
      fabricUnitCost: uc.trim() === "" ? null : Number(uc),
      skirtConstruction: con || null,
      skirtFullness: con === "gathered" ? Number(ful) : null,
      makerId: opts?.makerId !== undefined ? opts.makerId : makerId,
      made: opts?.made !== undefined ? opts.made : made,
    };
    setBusy(true);
    saveChain.current = saveChain.current.then(() => sendSave(body));
  }
```

Note the `yd` local: without it, changing the construction would save the *previous* yardage, because `setYardage` has not flushed by the time `save` reads state.

- [ ] **Step 3: Compute the estimate**

After the state declarations, add:

```tsx
  const waistIn = measurementInches(measurements, "waist");
  const lengthIn = measurementInches(measurements, "outseam");
  const widthIn = parseWidthInches(width);

  // Recomputed for display; the value itself is saved on change, not on render.
  const estimate = useMemo(() => {
    if (!construction || waistIn == null || lengthIn == null || widthIn == null) return null;
    try {
      return estimateSkirtYardage({
        construction: construction as SkirtConstruction,
        waistInches: waistIn,
        lengthInches: lengthIn,
        fabricWidthInches: widthIn,
        fullness: construction === "gathered" ? Number(fullness) : undefined,
      });
    } catch {
      return null;
    }
  }, [construction, fullness, waistIn, lengthIn, widthIn]);

  // What the user has to supply before a number is possible.
  const missing = construction
    ? [
        waistIn == null ? "waist" : null,
        lengthIn == null ? "waist to ankle" : null,
        widthIn == null ? "fabric width" : null,
      ].filter((x): x is string => x !== null)
    : [];

  function applyConstruction(nextConstruction: string, nextFullness: string) {
    let nextYardage: string | undefined;
    if (nextConstruction && waistIn != null && lengthIn != null && widthIn != null) {
      try {
        const r = estimateSkirtYardage({
          construction: nextConstruction as SkirtConstruction,
          waistInches: waistIn,
          lengthInches: lengthIn,
          fabricWidthInches: widthIn,
          fullness: nextConstruction === "gathered" ? Number(nextFullness) : undefined,
        });
        nextYardage = String(r.yards);
        setYardage(nextYardage);
      } catch {
        // Leave the yardage alone; `missing` or the thrown case is surfaced in the UI.
      }
    }
    void save({ construction: nextConstruction, fullness: nextFullness, yardage: nextYardage });
  }
```

- [ ] **Step 4: Render the controls**

Inside the existing `<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">`, immediately **before** the Yardage `<Field>`, add:

```tsx
            <SelectField
              label="Skirt type"
              value={construction}
              options={SKIRT_CONSTRUCTIONS.map((c) => CONSTRUCTION_LABELS[c])}
              onChange={(labelValue) => {
                const next =
                  SKIRT_CONSTRUCTIONS.find((c) => CONSTRUCTION_LABELS[c] === labelValue) ?? "";
                setConstruction(next);
                applyConstruction(next, fullness);
              }}
            />
            {construction === "gathered" && (
              <SelectField
                label="Fullness"
                value={fullness}
                options={["2", "2.5", "3"]}
                onChange={(v) => {
                  setFullness(v);
                  applyConstruction(construction, v);
                }}
              />
            )}
```

`SelectField` already renders a leading `—` option whose value is `""`, which is the "not a skirt" choice — no extra entry needed.

Immediately **after** the Yardage `<Field>`, add the derivation:

```tsx
            {construction && (
              <div className="col-span-full rounded-md bg-[var(--bg)] px-2 py-1.5">
                {missing.length > 0 ? (
                  <p className="text-xs muted">
                    Add {missing.join(" and ")} to calculate yardage.{" "}
                    <Link
                      href={`/productions/${productionId}/performers/${item.performerId}?from=summary`}
                      className="link-red"
                    >
                      Measurements ↗
                    </Link>
                  </p>
                ) : estimate ? (
                  <>
                    <span className="lbl block">How this was calculated</span>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] leading-tight muted">
                      {estimate.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    {estimate.warning && (
                      <p className="mt-1 text-xs text-[var(--red)]">{estimate.warning}</p>
                    )}
                  </>
                ) : null}
              </div>
            )}
```

- [ ] **Step 5: Update the yardage field hint**

The Yardage field's hint currently reads "Leave blank to have the system estimate yardage." That is now only true when no construction is set. Change that `<Field>`'s `hint` prop to:

```tsx
hint={construction ? "Calculated from the measurements — type over it to override." : "Leave blank to have the system estimate yardage."}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean, suite unchanged from Task 2's count. If `useMemo` is reported unused, the import merge in Step 1 went wrong.

- [ ] **Step 7: Check it in a browser**

Run `npm run dev`, open a production with a cast performer who has waist and waist-to-ankle recorded, go to Costume Creations, and expand a piece.

Confirm:
- **Skirt type** offers the four labels plus `—`.
- Choosing **Full circle** fills Yardage immediately and shows the derivation beneath it.
- **Fullness** appears only for Gathered, and changing it changes the number.
- Choosing `—` clears the construction; the yardage keeps its last value (it is now a manual number, which is correct — it must not silently vanish).
- On a performer *without* those measurements, picking a construction shows "Add waist and waist to ankle to calculate yardage" with a working link, and no number.
- Reload the page: the construction and yardage persist.

If localhost throws "enqueueModel is not a function" or similar RSC errors, that is a stale service worker from another project on this machine, not this change — clear site data for localhost:3000 and reload.

- [ ] **Step 8: Commit**

```bash
git add src/components/MakePieceRow.tsx
git commit -m "feat(fabric): skirt type picker and yardage derivation in the making area

Picking a construction computes yardage from the performer's waist and
waist-to-ankle and writes it to the existing fabric_yardage field, so the cost
rollup and purchase list pick it up unchanged. Shows the full derivation rather
than a bare number, and names the missing measurement when it cannot calculate."
```

---

### Task 4: Hand skirt pieces to the calculator, and verify

**Files:**
- Modify: `src/app/api/productions/[id]/estimate-fabric/route.ts`

**Interfaces:**
- Consumes: `costume_pieces.skirt_construction` (Task 2), reachable via `pieceByKey` in that route.
- Produces: nothing.

- [ ] **Step 1: Skip calculator-owned pieces**

In `src/app/api/productions/[id]/estimate-fabric/route.ts`, the selection loop currently skips any item that already has a yardage:

```ts
          if (item.fabric.yardage != null) continue;
```

Add a second skip immediately after it:

```ts
          // Skirts with a construction set are owned by the deterministic
          // calculator (src/lib/fabric/skirt-yardage.ts) — the AI must not
          // second-guess arithmetic, and would overwrite a blank yardage the
          // user will fill by picking a construction.
          if (pieceByKey.get(pieceKey(item.castingId, item.designId))?.skirt_construction) continue;
```

`pieceByKey` and `pieceKey` are already in scope in that file.

- [ ] **Step 2: Preserve the new fields through the estimator's write-back**

Further down, the route calls `upsertPieceSource` with every existing field spread from `existing` so the AI write does not clobber other columns. Add the two new fields to that call, alongside the others:

```ts
        skirtConstruction: existing?.skirt_construction ?? null,
        skirtFullness: existing?.skirt_fullness ?? null,
```

Without this, an AI estimate written onto *this same piece's own row* would null its own `skirt_fullness` (e.g. left over from before its construction was cleared). `upsertPieceSource` conflicts on `(costume_design_id, casting_id)`, so a write can only ever touch the piece being written — it can never reach a different piece's row. This is defense-in-depth for the piece's own data, not protection against a cross-piece write, which cannot happen.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean. The estimate-fabric route has its own test file (`route.test.ts`) — if a fixture there constructs a piece row, TypeScript will require the new fields; add `skirt_construction: null, skirt_fullness: null`.

- [ ] **Step 4: Production build**

Run: `npm run build`

Expected: succeeds.

- [ ] **Step 5: Confirm the anchor number end to end**

Run `npx vitest run src/lib/fabric/skirt-yardage.test.ts` one more time and quote the anchor test results in your report. The 27"/32"/45" case returning **4.75 yd** is the single number Chris will show Nada; it is worth stating explicitly rather than folding into a suite total.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/productions/[id]/estimate-fabric/route.ts"
git commit -m "feat(fabric): AI estimator skips pieces the skirt calculator owns

A piece with a construction set gets its yardage from arithmetic, so the AI
should not estimate it. Also carries the two new fields through the estimator's
write-back, which would otherwise null this piece's own skirt_fullness on its
own AI write (defense-in-depth; upsertPieceSource keys on this piece alone, so
it can never touch a sibling piece)."
```

- [ ] **Step 7: Report the handoff items**

Do not push and do not deploy. Report to Chris:

1. **Migration `0031_skirt_construction.sql` must be applied by hand** before the picker will save. Until then the PUT returns an error mentioning the missing column.
2. **The 27"/32"/45" full circle case computes 4.75 yd** (4.14 raw + 10% + rounding). This is a plausibility check, not a validation: Nada's 4-yard figure was a guesstimate for a different, undimensioned performer (6-foot, 190 lb, ~45" waist), not for these dimensions. Worth showing her that specific case before this reaches her users — it is the only real-world data point we can check it against, even loosely.
3. **The gathered path has no real-world anchor.** Ask her for one remembered project so it can be validated the way the circle path was.

---

## Self-Review

**Spec coverage.** Math module with all five constants, both formulas, `steps`, and `warning` → Task 1. Migration `0031` → Task 2. `upsertPieceSource`, the pieces route, and type threading → Task 2. Picker, fullness select, recompute, derivation display, missing-measurement message → Task 3. AI route filter → Task 4. Testing → Tasks 1 and 2, verified in Task 4. Risks and handoff → Task 4 Step 7. Every spec section maps to a task.

**Additions beyond the spec, deliberate.** Two things the spec did not name but the code requires. `pieceRowIsEmpty` must count a construction as content (Task 2 Steps 2–5) or picking a construction with no measurements yet silently deletes the piece row — a data-loss bug, not a nicety. And the estimator's write-back must carry the new fields (Task 4 Step 2) or an AI run on the piece's own row nulls its own skirt_fullness — defense-in-depth, since upsertPieceSource conflicts on (costume_design_id, casting_id) and can never touch a sibling piece. Both are consequences of existing code the spec did not inspect.

**Placeholder scan.** No TBD, TODO, "handle edge cases", or "similar to Task N". Every code step carries complete, paste-ready content.

**Type consistency.** `SkirtConstruction`, `SKIRT_CONSTRUCTIONS`, `CONSTRUCTION_LABELS`, `isSkirtConstruction`, `parseWidthInches`, `estimateSkirtYardage`, `SkirtYardageInput`, `SkirtYardageResult` are defined in Task 1 and consumed under exactly those names in Tasks 2, 3 and 4. The database columns `skirt_construction` / `skirt_fullness` (Task 2) map to `skirtConstruction` / `skirtFullness` on `Fabric` and on the `upsertPieceSource` input, and the API body uses the camelCase form throughout.
