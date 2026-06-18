# Additional Measurements + Body Diagram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seven numeric and three free-text body measurements, and a front/back body diagram whose markers highlight as you focus each measurement field.

**Architecture:** `measurement_definitions` already has an `input_type` column; we make it meaningfully `number | text` and add a `value_text` column to `performer_measurements` (numeric becomes nullable, a CHECK enforces one-of). The form branches on `input_type`; the data/API/AI layers carry text alongside numbers. The diagram is a pure marker-map module rendered by a `BodyDiagram` client component, reused on the form (interactive) and `/guide` (static).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Supabase (Postgres), Vitest (node env — **no jsdom/RTL**).

## Global Constraints

- **All schema + seed changes go in the single file** `supabase/migrations/0024_additional_measurements.sql` (Chris's standing instruction). Do not create `0025`.
- **Do NOT apply the migration to Supabase, push to GitHub, or deploy.** Local commits only; hold for Chris's explicit green light.
- Tests run in the **node** environment — no React DOM testing. Put all testable logic in pure `.ts` modules; verify JSX via `npx tsc --noEmit` and `npm run build`.
- Client fetches use `credentials: "include"` (already present in `MeasurementForm`).
- Theme: Atelier (muslin/curtain-red); reuse existing globals (`field`, `muted`, `surface`, `--field-line`, `--red`, `--green`).
- Run the full suite with `npm test` (alias for `vitest run`).

---

### Task 1: Migration `0024` — schema change + all new definitions

**Files:**
- Modify (overwrite): `supabase/migrations/0024_additional_measurements.sql`

**Interfaces:**
- Produces: 10 new `measurement_definitions` rows (`neck`, `arm_circumference`, `wrist`, `thigh`, `knee`, `head`, `nape_to_floor` as `number`; `shirt_size`, `pant_size`, `shoe_size` as `text`); a nullable `value_numeric`, a new `value_text text`, and CHECK `performer_measurements_value_present` on `performer_measurements`.

> No automated test (migrations aren't unit-tested here; data-layer tests mock Supabase). Verification is self-review — the migration is **not applied** this session.

- [ ] **Step 1: Overwrite the migration file**

```sql
-- Additional body-measurement fields requested by Nada, plus the schema change that
-- lets non-numeric sizes (shirt/pant/shoe) be stored as text alongside numeric ones.
-- Data-driven, same as the 0002 seed: the form renders these automatically (numeric vs
-- text by input_type) and the AI fabric estimator picks them up by label.

-- 1) Allow text-valued measurements: value_numeric becomes optional, value_text is added,
--    and a row must carry at least one of the two.
alter table performer_measurements alter column value_numeric drop not null;
alter table performer_measurements add column if not exists value_text text;
alter table performer_measurements
  add constraint performer_measurements_value_present
  check (value_numeric is not null or value_text is not null);

-- 2) Numeric fields (input_type defaults to 'number'). display_order continues from 100.
insert into measurement_definitions (key, label, unit, help_text, display_order) values
  ('neck',              'Neck',              'in', 'Around the base of the neck, for collars',           110),
  ('arm_circumference', 'Arm circumference', 'in', 'Around the fullest part of the upper arm',           120),
  ('wrist',             'Wrist',             'in', 'Around the wrist bone, for cuffs',                    130),
  ('thigh',             'Thigh',             'in', 'Around the fullest part of the thigh',                140),
  ('knee',              'Knee',              'in', 'Around the knee, for breeches',                       150),
  ('head',              'Head circumference','in', 'Around the forehead, for hats and headpieces',       160),
  ('nape_to_floor',     'Nape to floor',     'in', 'Center back of the neck straight down to the floor', 170)
on conflict (key) do nothing;

-- 3) Text fields (free text — input_type 'text', no unit). help_text doubles as the
--    input placeholder so the expected format is visible.
insert into measurement_definitions (key, label, unit, input_type, help_text, display_order) values
  ('shirt_size', 'Shirt size', '', 'text', 'e.g. XS, S, M, L, XL, XXL, XXXL', 180),
  ('pant_size',  'Pant size',  '', 'text', 'Waist/Inseam, e.g. 36/30',        190),
  ('shoe_size',  'Shoe size',  '', 'text', 'e.g. Men''s 10 or Women''s 8.5',  200)
on conflict (key) do nothing;
```

- [ ] **Step 2: Self-review**

Confirm: apostrophes in `Men''s`/`Women''s` are doubled; text rows set `input_type` explicitly; numeric rows omit it (DB default `'number'`); display_order is 110–200; **file is not applied**.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0024_additional_measurements.sql
git commit -m "feat(db): 0024 adds text-valued measurements + 10 new definitions"
```

---

### Task 2: Data layer — text-aware `upsertMeasurement`

**Files:**
- Modify: `src/lib/data/performers.ts:12-19` (interface), `:116-140` (`upsertMeasurement`)
- Test: `src/lib/data/performers.test.ts`

**Interfaces:**
- Produces: `PerformerMeasurement { value_numeric: number | null; value_text: string | null; ... }` and `upsertMeasurement({ performerId, measurementKey, valueNumeric?: number | null, valueText?: string | null, unit }): Promise<PerformerMeasurement>`.
- Consumes: nothing new.

- [ ] **Step 1: Update the two existing measurement tests for the new payload shape**

In `src/lib/data/performers.test.ts`, replace the `upsertMeasurement upserts...` test body (lines 81-97) so the asserted upsert payload includes `value_text`:

```ts
test("upsertMeasurement upserts on (performer_id, measurement_key)", async () => {
  upsertSingle.mockResolvedValue({
    data: { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" },
    error: null,
  });
  const row = await upsertMeasurement({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    unit: "in",
  });
  expect(upsert).toHaveBeenCalledWith(
    { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" },
    { onConflict: "performer_id,measurement_key" },
  );
  expect(row).toEqual({ performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" });
});
```

- [ ] **Step 2: Add failing tests for the text path**

Append to `src/lib/data/performers.test.ts`:

```ts
test("upsertMeasurement stores a trimmed text value and clears the numeric value", async () => {
  upsertSingle.mockResolvedValue({
    data: { performer_id: "pf1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
    error: null,
  });
  await upsertMeasurement({
    performerId: "pf1",
    measurementKey: "shirt_size",
    valueText: "  L  ",
    unit: "",
  });
  expect(upsert).toHaveBeenCalledWith(
    { performer_id: "pf1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
    { onConflict: "performer_id,measurement_key" },
  );
});

test("upsertMeasurement rejects an empty text value", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "shirt_size", valueText: "   ", unit: "" }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("upsertMeasurement rejects when neither value is given", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "waist", unit: "in" }),
  ).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 3: Run the tests, verify the new ones fail**

Run: `npx vitest run src/lib/data/performers.test.ts`
Expected: the three new tests + the edited one FAIL (current `upsertMeasurement` has no `valueText` param and omits `value_text` from the payload).

- [ ] **Step 4: Update the interface**

Replace `src/lib/data/performers.ts:12-19`:

```ts
export interface PerformerMeasurement {
  id: string;
  performer_id: string;
  measurement_key: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string;
  updated_at: string;
}
```

- [ ] **Step 5: Rewrite `upsertMeasurement`**

Replace `src/lib/data/performers.ts:116-140`:

```ts
export async function upsertMeasurement(input: {
  performerId: string;
  measurementKey: string;
  valueNumeric?: number | null;
  valueText?: string | null;
  unit: string;
}): Promise<PerformerMeasurement> {
  const text = typeof input.valueText === "string" ? input.valueText.trim() : "";
  let value_numeric: number | null = null;
  let value_text: string | null = null;
  if (text) {
    value_text = text;
  } else if (input.valueNumeric != null) {
    if (!Number.isFinite(input.valueNumeric)) {
      throw new ValidationError("Measurement must be a number");
    }
    value_numeric = input.valueNumeric;
  } else {
    throw new ValidationError("Measurement value is required");
  }
  const { data, error } = await supabaseAdmin
    .from("performer_measurements")
    .upsert(
      {
        performer_id: input.performerId,
        measurement_key: input.measurementKey,
        value_numeric,
        value_text,
        unit: input.unit,
      },
      { onConflict: "performer_id,measurement_key" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PerformerMeasurement;
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npx vitest run src/lib/data/performers.test.ts`
Expected: PASS (all measurement tests, including the existing NaN-rejection test).

- [ ] **Step 7: Commit**

```bash
git add src/lib/data/performers.ts src/lib/data/performers.test.ts
git commit -m "feat(data): upsertMeasurement stores text or numeric values"
```

---

### Task 3: API route — PUT accepts `valueText`

**Files:**
- Modify: `src/app/api/performers/[performerId]/measurements/route.ts:21-41`
- Test: `src/app/api/performers/[performerId]/measurements/route.test.ts`

**Interfaces:**
- Consumes: `upsertMeasurement({ performerId, measurementKey, valueNumeric, valueText, unit })` from Task 2.
- Produces: PUT body now reads `{ measurementKey, valueNumeric?, valueText?, unit }`.

- [ ] **Step 1: Update the existing PUT test + add a text test**

In `route.test.ts`, replace the `PUT upserts one measurement` assertion (lines 54-65) and add a text case:

```ts
test("PUT upserts one numeric measurement", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockResolvedValue({ measurement_key: "waist", value_numeric: 28, unit: "in" });
  const res = await PUT(putReq({ measurementKey: "waist", valueNumeric: 28, unit: "in" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(upsertMeasurement).toHaveBeenCalledWith({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    valueText: null,
    unit: "in",
  });
});

test("PUT upserts a text measurement", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  upsertMeasurement.mockResolvedValue({ measurement_key: "shirt_size", value_text: "L", unit: "" });
  const res = await PUT(putReq({ measurementKey: "shirt_size", valueText: "L", unit: "" }), ctx("pf1"));
  expect(res.status).toBe(200);
  expect(upsertMeasurement).toHaveBeenCalledWith({
    performerId: "pf1",
    measurementKey: "shirt_size",
    valueNumeric: null,
    valueText: "L",
    unit: "",
  });
});
```

- [ ] **Step 2: Run, verify the two PUT tests fail**

Run: `npx vitest run "src/app/api/performers/[performerId]/measurements/route.test.ts"`
Expected: the numeric test FAILS (route doesn't pass `valueText` yet) and the text test FAILS.

- [ ] **Step 3: Update the PUT handler**

Replace `route.ts:21-41`:

```ts
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    const body = (await request.json()) as {
      measurementKey?: string;
      valueNumeric?: unknown;
      valueText?: unknown;
      unit?: string;
    };
    const measurement = await upsertMeasurement({
      performerId,
      measurementKey: String(body.measurementKey ?? ""),
      valueNumeric: body.valueNumeric == null ? null : Number(body.valueNumeric),
      valueText: body.valueText == null ? null : String(body.valueText),
      unit: String(body.unit ?? ""),
    });
    return NextResponse.json({ measurement });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run "src/app/api/performers/[performerId]/measurements/route.test.ts"`
Expected: PASS (including the unchanged `PUT 400 on a non-numeric value` test — `valueNumeric:"x"` → `Number` → `NaN`, `valueText:null`, mock rejects).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/performers/[performerId]/measurements/route.ts" "src/app/api/performers/[performerId]/measurements/route.test.ts"
git commit -m "feat(api): measurements PUT accepts text values"
```

---

### Task 4: Tailor summary — carry text values into `MeasurementView`

**Files:**
- Modify: `src/lib/tailor-summary.ts:109-118` (types), `:133-139` (mapping)
- Test: `src/lib/tailor-summary.test.ts`

**Interfaces:**
- Produces: `MeasurementView { key; label; value: number | string; unit }`; `buildMeasurementsByCasting` now reads `value_text ?? value_numeric`.
- Consumes: nothing new.

- [ ] **Step 1: Add a failing test for a text measurement**

Append to `src/lib/tailor-summary.test.ts`:

```ts
test("buildMeasurementsByCasting uses value_text when present", () => {
  const defs = [{ key: "shirt_size", label: "Shirt size", display_order: 0 }];
  const meas = [
    { performer_id: "p1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
  ];
  const castings = [{ id: "c1", performer_id: "p1" }];
  const map = buildMeasurementsByCasting(defs, meas, castings);
  expect(map["c1"]).toEqual([{ key: "shirt_size", label: "Shirt size", value: "L", unit: "" }]);
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `value` is `null` (current code reads `m.value_numeric`), and TS rejects `value_text` on `MeasurementRowLike`.

- [ ] **Step 3: Widen the types**

Replace `MeasurementView` (`tailor-summary.ts:109-114`):

```ts
export interface MeasurementView {
  key: string;
  label: string;
  value: number | string;
  unit: string;
}
```

Replace `MeasurementRowLike` (`tailor-summary.ts:117`):

```ts
interface MeasurementRowLike { performer_id: string; measurement_key: string; value_numeric: number | null; value_text?: string | null; unit: string }
```

- [ ] **Step 4: Use the text value when present**

In `buildMeasurementsByCasting`, replace the `value:` line (`tailor-summary.ts:137`):

```ts
      value: m.value_text ?? m.value_numeric ?? "",
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS (the original numeric test still passes — its rows have no `value_text`, so `?? value_numeric` applies).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat(summary): measurement views carry text values"
```

---

### Task 5: AI estimator — accept text measurement values

**Files:**
- Modify: `src/lib/ai/estimate-fabric.ts:8-13` (type)
- Test: `src/lib/ai/estimate-fabric.test.ts`

**Interfaces:**
- Produces: `EstimateItem.measurements: { label: string; value: number | string; unit: string }[]`. Serialization (`${label}: ${value}${unit}`) is unchanged and already handles strings.
- Consumes: `MeasurementView.value` (number | string) from Task 4 (the estimate-fabric route maps it straight through; no route edit needed).

- [ ] **Step 1: Add a failing serialization test**

Append to `src/lib/ai/estimate-fabric.test.ts`:

```ts
test("serializes a text measurement with no unit", async () => {
  create.mockResolvedValue(aiText({ estimates: [] }));
  await estimateFabricYardage([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: '60"',
      measurements: [
        { label: "Shirt size", value: "L", unit: "" },
        { label: "Waist", value: 30, unit: "in" },
      ],
    },
  ]);
  const content = create.mock.calls[0][0].messages[0].content as string;
  expect(content).toContain("Shirt size: L");
  expect(content).toContain("Waist: 30in");
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/lib/ai/estimate-fabric.test.ts`
Expected: FAIL — TS rejects `value: "L"` because `EstimateItem.measurements[].value` is `number`.

- [ ] **Step 3: Widen the value type**

Replace `estimate-fabric.ts:12`:

```ts
  measurements: { label: string; value: number | string; unit: string }[];
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/ai/estimate-fabric.test.ts`
Expected: PASS (all existing estimator tests still pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/estimate-fabric.ts src/lib/ai/estimate-fabric.test.ts
git commit -m "feat(ai): fabric estimator accepts text measurement values"
```

---

### Task 6: Measurement form — text inputs end to end

**Files:**
- Create: `src/lib/measurement-input.ts`
- Test: `src/lib/measurement-input.test.ts`
- Modify: `src/components/MeasurementForm.tsx` (interface, `save`, render branch, height cast)
- Modify: `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx:39-40,63`

**Interfaces:**
- Produces: `measurementPayload(def: { key; unit; input_type }, raw: string): { measurementKey; unit; valueNumeric?; valueText? } | null`. The form's `Definition` gains `input_type: string`; `initialValues` becomes `Record<string, number | string>`.
- Consumes: the PUT body shape from Task 3.

- [ ] **Step 1: Write failing tests for the payload helper**

Create `src/lib/measurement-input.test.ts`:

```ts
import { expect, test } from "vitest";
import { measurementPayload } from "@/lib/measurement-input";

test("text defs save a trimmed string", () => {
  expect(measurementPayload({ key: "shirt_size", unit: "", input_type: "text" }, "  L  ")).toEqual({
    measurementKey: "shirt_size",
    unit: "",
    valueText: "L",
  });
});

test("number defs save a numeric value", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "30")).toEqual({
    measurementKey: "waist",
    unit: "in",
    valueNumeric: 30,
  });
});

test("a blank field saves nothing", () => {
  expect(measurementPayload({ key: "waist", unit: "in", input_type: "number" }, "   ")).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/measurement-input.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the helper**

Create `src/lib/measurement-input.ts`:

```ts
export interface MeasurementInputDef {
  key: string;
  unit: string;
  input_type: string;
}

export interface MeasurementPayload {
  measurementKey: string;
  unit: string;
  valueNumeric?: number;
  valueText?: string;
}

// Build the PUT body for one measurement field, or null when the field is blank
// (nothing to save). Text defs save a trimmed string; everything else saves a number.
export function measurementPayload(def: MeasurementInputDef, raw: string): MeasurementPayload | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (def.input_type === "text") {
    return { measurementKey: def.key, unit: def.unit, valueText: trimmed };
  }
  return { measurementKey: def.key, unit: def.unit, valueNumeric: Number(trimmed) };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/measurement-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the form's `Definition` interface and `initialValues` type**

In `src/components/MeasurementForm.tsx`, replace the `Definition` interface (lines 6-11) and the prop type (line 20):

```ts
interface Definition {
  key: string;
  label: string;
  unit: string;
  input_type: string;
  help_text: string | null;
}
```

```ts
  initialValues: Record<string, number | string>;
```

- [ ] **Step 6: Make the height split tolerant of the union type**

In `MeasurementForm.tsx`, replace line 31:

```ts
  const initialHeight = splitHeight(Number(initialValues.height ?? 0));
```

- [ ] **Step 7: Rewrite `save` to use the payload helper**

Replace `MeasurementForm.tsx:55-66`:

```tsx
  async function save(def: Definition, raw: string) {
    const payload = measurementPayload(def, raw);
    if (!payload) return; // nothing to save for an empty field
    setSaved((s) => ({ ...s, [def.key]: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    setSaved((s) => ({ ...s, [def.key]: res.ok ? "saved" : "error" }));
  }
```

Add the import near the top (after line 4):

```tsx
import { measurementPayload } from "@/lib/measurement-input";
```

- [ ] **Step 8: Render a text input for text defs**

In `MeasurementForm.tsx`, the non-height branch currently begins at the `<label>` (line 131). Split it so text defs get a text input. Replace the non-height branch (the `: (` arm of the ternary, lines 130-176) with:

```tsx
          ) : def.input_type === "text" ? (
            <label
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{def.label}</span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="relative w-36 shrink-0">
                <input
                  type="text"
                  className="field w-full !pl-6 text-right"
                  placeholder={def.help_text ?? ""}
                  value={values[def.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                  onBlur={(e) => save(def, e.target.value)}
                />
                {saved[def.key] && (
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "var(--green)"
                          : saved[def.key] === "error"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                    aria-label={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                  />
                )}
              </span>
            </label>
          ) : (
            <label
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {def.label}
                  {" "}
                  <span className="muted">({def.unit})</span>
                </span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="relative w-28 shrink-0">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.10"
                  className="field w-full !pr-8 !pl-6 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={values[def.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [def.key]: e.target.value }))}
                  onBlur={(e) => save(def, e.target.value)}
                />
                {saved[def.key] && (
                  <span
                    className="pointer-events-none absolute left-2.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "var(--green)"
                          : saved[def.key] === "error"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                    aria-label={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                  />
                )}
                {values[def.key]?.trim() !== "" && (
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm muted">
                    {def.unit}
                  </span>
                )}
              </span>
            </label>
          ),
```

- [ ] **Step 9: Feed text values into the form from the page**

In `src/app/(app)/productions/[id]/performers/[performerId]/page.tsx`, replace lines 39-40:

```tsx
  const initial: Record<string, number | string> = {};
  for (const m of measurements) initial[m.measurement_key] = m.value_text ?? m.value_numeric ?? "";
```

(The `MeasurementForm` call on line 63 is unchanged — its prop type now accepts the wider record.)

- [ ] **Step 10: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/measurement-input.ts src/lib/measurement-input.test.ts src/components/MeasurementForm.tsx "src/app/(app)/productions/[id]/performers/[performerId]/page.tsx"
git commit -m "feat(measurements): text inputs for shirt/pant/shoe sizes"
```

---

### Task 7: Body-diagram marker map (pure module)

**Files:**
- Create: `src/lib/body-diagram.ts`
- Test: `src/lib/body-diagram.test.ts`

**Interfaces:**
- Produces: `MEASUREMENT_MARKERS: Record<string, Marker>` where `Marker = { label: string; view: "front" | "back"; x: number; y: number }` (x/y are percentages 0–100 of the view box). Keys cover the dimensional measurements only.

- [ ] **Step 1: Write failing tests**

Create `src/lib/body-diagram.test.ts`:

```ts
import { expect, test } from "vitest";
import { MEASUREMENT_MARKERS } from "@/lib/body-diagram";

test("covers the dimensional measurements", () => {
  for (const key of ["height", "head", "neck", "shoulder", "chest", "waist", "hips", "sleeve",
    "arm_circumference", "wrist", "thigh", "knee", "inseam", "outseam", "back_length", "nape_to_floor"]) {
    expect(MEASUREMENT_MARKERS[key], key).toBeDefined();
  }
});

test("omits abstract measurements that have no body location", () => {
  for (const key of ["weight", "shirt_size", "pant_size", "shoe_size"]) {
    expect(MEASUREMENT_MARKERS[key]).toBeUndefined();
  }
});

test("every marker has a label, a valid view, and in-range coordinates", () => {
  for (const [key, m] of Object.entries(MEASUREMENT_MARKERS)) {
    expect(m.label.length, key).toBeGreaterThan(0);
    expect(["front", "back"]).toContain(m.view);
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(100);
    expect(m.y).toBeGreaterThanOrEqual(0);
    expect(m.y).toBeLessThanOrEqual(100);
  }
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/body-diagram.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the marker map**

Create `src/lib/body-diagram.ts`:

```ts
export type DiagramView = "front" | "back";

export interface Marker {
  label: string;
  view: DiagramView;
  // Position as a percentage (0–100) of the silhouette box, so the diagram can place
  // an HTML dot over the SVG without depending on the SVG's internal coordinate units.
  x: number;
  y: number;
}

// Where each *dimensional* measurement is taken. Abstract fields (weight, shirt/pant/shoe
// size) intentionally have no marker. Coordinates are tuned against the silhouettes in
// BodyDiagram and are the single source of truth for both labels and focus highlighting.
export const MEASUREMENT_MARKERS: Record<string, Marker> = {
  height: { label: "Height", view: "front", x: 22, y: 50 },
  head: { label: "Head", view: "front", x: 50, y: 8 },
  neck: { label: "Neck", view: "front", x: 50, y: 16 },
  shoulder: { label: "Shoulder", view: "front", x: 64, y: 22 },
  chest: { label: "Chest", view: "front", x: 50, y: 30 },
  arm_circumference: { label: "Arm", view: "front", x: 72, y: 33 },
  sleeve: { label: "Sleeve", view: "front", x: 78, y: 44 },
  wrist: { label: "Wrist", view: "front", x: 82, y: 55 },
  waist: { label: "Waist", view: "front", x: 50, y: 43 },
  hips: { label: "Hips", view: "front", x: 50, y: 51 },
  thigh: { label: "Thigh", view: "front", x: 42, y: 62 },
  inseam: { label: "Inseam", view: "front", x: 50, y: 60 },
  knee: { label: "Knee", view: "front", x: 44, y: 78 },
  outseam: { label: "Outseam", view: "front", x: 30, y: 62 },
  back_length: { label: "Back length", view: "back", x: 50, y: 31 },
  nape_to_floor: { label: "Nape to floor", view: "back", x: 56, y: 55 },
};
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/lib/body-diagram.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/body-diagram.ts src/lib/body-diagram.test.ts
git commit -m "feat(measurements): body-diagram marker map"
```

---

### Task 8: `BodyDiagram` component + form integration

**Files:**
- Create: `src/components/BodyDiagram.tsx`
- Modify: `src/components/MeasurementForm.tsx` (active-key state, focus/blur wiring, collapsible panel)

**Interfaces:**
- Produces: `<BodyDiagram activeKey?: string />` — renders front + back silhouettes with a dot+label per marker; the marker whose key equals `activeKey` is highlighted.
- Consumes: `MEASUREMENT_MARKERS` from Task 7.

- [ ] **Step 1: Create the component**

Create `src/components/BodyDiagram.tsx`:

```tsx
"use client";

import { MEASUREMENT_MARKERS, type DiagramView } from "@/lib/body-diagram";

// A simple, stylized human outline (front and back share the shape). viewBox is
// 100 wide × 220 tall; markers are positioned over it with percentage offsets.
const SILHOUETTE =
  "M50 31 C58 31 63 36 63 44 L70 56 C74 60 75 70 73 80 L68 84 C66 76 64 70 63 66 " +
  "L63 96 C63 104 61 112 60 120 L62 150 C63 170 64 195 62 212 L54 212 C53 195 52 172 50 152 " +
  "C48 172 47 195 46 212 L38 212 C36 195 37 170 38 150 L40 120 C39 112 37 104 37 96 " +
  "L37 66 C36 70 34 76 32 84 L27 80 C25 70 26 60 30 56 L37 44 C37 36 42 31 50 31 Z";

function View({ view, activeKey }: { view: DiagramView; activeKey?: string }) {
  const markers = Object.entries(MEASUREMENT_MARKERS).filter(([, m]) => m.view === view);
  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="relative w-full max-w-[180px]" style={{ aspectRatio: "100 / 220" }}>
        <svg viewBox="0 0 100 220" className="h-full w-full" aria-hidden="true">
          <circle cx="50" cy="18" r="13" fill="var(--field-line)" />
          <path d={SILHOUETTE} fill="var(--field-line)" />
        </svg>
        {markers.map(([key, m]) => {
          const active = key === activeKey;
          return (
            <div
              key={key}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface,#fff)] transition-transform"
                style={{
                  background: active ? "var(--red)" : "var(--muted)",
                  transform: active ? "scale(1.6)" : "scale(1)",
                }}
              />
              <span
                className="whitespace-nowrap text-[10px] leading-none"
                style={{ color: active ? "var(--red)" : "var(--muted)", fontWeight: active ? 600 : 400 }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
      <span className="mt-1 text-xs muted capitalize">{view}</span>
    </div>
  );
}

export function BodyDiagram({ activeKey }: { activeKey?: string }) {
  return (
    <div className="flex gap-4">
      <View view="front" activeKey={activeKey} />
      <View view="back" activeKey={activeKey} />
    </div>
  );
}
```

- [ ] **Step 2: Add active-key state to the form**

In `src/components/MeasurementForm.tsx`, add the import (near the other imports):

```tsx
import { BodyDiagram } from "@/components/BodyDiagram";
```

After the `saved` state declaration (current line 29), add:

```tsx
  const [activeKey, setActiveKey] = useState<string | null>(null);
```

- [ ] **Step 3: Render a collapsible diagram panel**

In `MeasurementForm.tsx`, immediately after the header `</div>` and before `<div className="border-t border-[var(--field-line)]">` (current line 78), insert:

```tsx
      <details className="surface mb-4 p-3">
        <summary className="cursor-pointer text-sm font-medium">Where do I measure?</summary>
        <div className="mt-3">
          <BodyDiagram activeKey={activeKey ?? undefined} />
        </div>
      </details>
```

- [ ] **Step 4: Highlight markers on focus**

Add `onFocus`/`onBlur` to each measurement input so focusing a field lights its marker. For the two **height** inputs (current lines 90-99 and 101-111), add to each:

```tsx
                  onFocus={() => setActiveKey("height")}
```

For the **text** input and the **number** input added in Task 6, add to each:

```tsx
                  onFocus={() => setActiveKey(def.key)}
```

Leave the existing `onBlur={...save...}` handlers as they are (focus state simply persists to the next focus; this keeps the active marker visible while the user reads it). No blur clearing needed.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run `npm run dev`, open a performer's measurement page, expand "Where do I measure?", focus "Sleeve" → its marker turns curtain-red and scales up. Focus "Shirt size" → no marker changes (abstract field).

- [ ] **Step 7: Commit**

```bash
git add src/components/BodyDiagram.tsx src/components/MeasurementForm.tsx
git commit -m "feat(measurements): body diagram with focus highlighting on the form"
```

---

### Task 9: Body diagram on the User Guide

**Files:**
- Modify: `src/app/(app)/guide/page.tsx` (nav entry + a measurements section rendering a static `<BodyDiagram />`)

**Interfaces:**
- Consumes: `<BodyDiagram />` from Task 8 (rendered with no `activeKey` → all labels shown, nothing highlighted).

- [ ] **Step 1: Import the component**

In `src/app/(app)/guide/page.tsx`, add near the top imports:

```tsx
import { BodyDiagram } from "@/components/BodyDiagram";
```

- [ ] **Step 2: Add the nav entry**

In the on-this-page `<ul>` (the list of `<li><a ...>` links), add a "Measurements" entry after the performers link:

```tsx
          <li><a href="#measurements" className="link-muted">Taking measurements</a></li>
```

- [ ] **Step 3: Add the measurements section**

Inside the `<div className="space-y-10">` container, add a section (place it after the roles/performers section, before designs):

```tsx
        <Section id="measurements" title="Taking measurements">
          <P>
            On a performer's page, open <B>Where do I measure?</B> to see a front and back
            body diagram. Most measurements are in inches; <B>Shirt size</B>, <B>Pant size</B>,
            and <B>Shoe size</B> are free text (e.g. <B>L</B>, <B>36/30</B>, <B>Men&apos;s 10</B>).
            Focus any field on the form to see where it&apos;s taken on the body.
          </P>
          <div className="surface mt-3 p-4">
            <BodyDiagram />
          </div>
        </Section>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds (a server component may render a `"use client"` component as a child — this is allowed).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/guide/page.tsx"
git commit -m "docs(guide): add body diagram to the measurements section"
```

---

## Final verification

- [ ] `npm test` — all suites pass.
- [ ] `npx tsc --noEmit && npm run build` — clean.
- [ ] Confirm the migration `0024` was **not** applied to Supabase and nothing was pushed/deployed. Report to Chris that the work is on local `main` awaiting his green light to apply + push.

## Notes on what is deliberately out of scope

- No constrained dropdown for shirt size (free text was chosen).
- No blur-clearing of the active marker (last-focused stays lit — simpler, and reads fine).
- No anatomically-detailed art; the silhouette is a simple outline and its coordinates may be nudged during the manual smoke in Task 8.
- No client-side signed-URL refresh, email reminders, or other roadmap items.
