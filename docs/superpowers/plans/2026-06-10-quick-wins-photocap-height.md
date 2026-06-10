# Quick Wins: Photo Cap + Height in Feet/Inches — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise the per-role photo cap from 4 to 6, and enter/display performer height in feet+inches (stored as inches, unchanged).

**Architecture:** Two independent changes. (1) Bump the duplicated `MAX_PER_ROLE` constant in the client component and the API route. (2) Add a pure `height.ts` helper (split/combine/format inches↔feet+inches), special-case the height row in the measurement form to two ft/in fields, and format read-only height display as `6'0"` by threading the measurement `key` through `MeasurementView`.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase, Vitest. `@/*` → `src/*`. No DB migration.

**Conventions (verified):** pure helpers unit-tested with Vitest (`npx vitest run <file>`); API route tests mock data/storage modules; React components verified via `npx tsc --noEmit` + `npm run lint` + manual. Spec: `docs/superpowers/specs/2026-06-10-quick-wins-photocap-height-design.md`.

---

## File Structure

- **Modify** `src/app/api/productions/[id]/roles/[roleId]/images/route.ts` — cap 4→6.
- **Modify** `src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts` — cap tests.
- **Modify** `src/components/RolePhotos.tsx` — client cap 4→6.
- **Create** `src/lib/height.ts` + `src/lib/height.test.ts` — height helpers.
- **Modify** `src/components/MeasurementForm.tsx` — ft/in height input.
- **Modify** `src/lib/tailor-summary.ts` — add `key` to `MeasurementView`.
- **Modify** `src/lib/tailor-summary.test.ts` — expected objects include `key`.
- **Modify** `src/components/MakePieceRow.tsx` — height display via `formatHeight`.

---

## Task 1: Role photo cap 4 → 6

**Files:**
- Modify: `src/app/api/productions/[id]/roles/[roleId]/images/route.ts`
- Modify: `src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts`
- Modify: `src/components/RolePhotos.tsx`

- [ ] **Step 1: Update the cap tests (write the failing test)**

In `src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts`, replace the existing cap test (currently titled `"POST 400 when already at the 4-photo cap"`, using `countRoleImages.mockResolvedValue(4)`) with these two tests:

```ts
test("POST 400 when already at the 6-photo cap", async () => {
  countRoleImages.mockResolvedValue(6);
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(400);
  expect(uploadRoleImage).not.toHaveBeenCalled();
});

test("POST allows a 5th photo (under the 6 cap)", async () => {
  countRoleImages.mockResolvedValue(5);
  uploadRoleImage.mockResolvedValue(undefined);
  addRoleImage.mockResolvedValue({ id: "i6" });
  const res = await POST(postReq(), ctx("p1", "r1"));
  expect(res.status).toBe(201);
  expect(uploadRoleImage).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts"`
Expected: FAIL — "allows a 5th photo" gets 400 (old cap is 4, so 5 ≥ 4 rejects).

- [ ] **Step 3: Bump the server constant**

In `src/app/api/productions/[id]/roles/[roleId]/images/route.ts` line 11, change:

```ts
const MAX_PER_ROLE = 4;
```

to:

```ts
const MAX_PER_ROLE = 6;
```

(The error message `Up to ${MAX_PER_ROLE} photos per role` updates automatically.)

- [ ] **Step 4: Bump the client constant**

In `src/components/RolePhotos.tsx` line 11, change:

```ts
const MAX_PER_ROLE = 4;
```

to:

```ts
const MAX_PER_ROLE = 6;
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run "src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts" && npx tsc --noEmit`
Expected: all image-route tests PASS; zero type errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/productions/[id]/roles/[roleId]/images/route.ts" "src/app/api/productions/[id]/roles/[roleId]/images/route.test.ts" src/components/RolePhotos.tsx
git commit -m "feat: raise per-role photo cap from 4 to 6"
```

---

## Task 2: `height.ts` helper

**Files:**
- Create: `src/lib/height.ts`
- Test: `src/lib/height.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/height.test.ts`:

```ts
import { expect, test } from "vitest";
import { splitHeight, combineHeight, formatHeight } from "@/lib/height";

test("splitHeight breaks total inches into feet and inches", () => {
  expect(splitHeight(72)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(65)).toEqual({ feet: 5, inches: 5 });
  expect(splitHeight(5)).toEqual({ feet: 0, inches: 5 });
});

test("splitHeight rounds to the nearest whole inch and clamps negatives to 0", () => {
  expect(splitHeight(72.4)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(71.5)).toEqual({ feet: 6, inches: 0 });
  expect(splitHeight(-3)).toEqual({ feet: 0, inches: 0 });
});

test("combineHeight converts feet and inches to total inches", () => {
  expect(combineHeight(6, 0)).toBe(72);
  expect(combineHeight(5, 5)).toBe(65);
  expect(combineHeight(0, 5)).toBe(5);
});

test("combineHeight and splitHeight round-trip", () => {
  for (const n of [0, 5, 60, 65, 72, 77]) {
    const { feet, inches } = splitHeight(n);
    expect(combineHeight(feet, inches)).toBe(n);
  }
});

test("formatHeight renders feet and inches", () => {
  expect(formatHeight(72)).toBe("6'0\"");
  expect(formatHeight(65)).toBe("5'5\"");
  expect(formatHeight(5)).toBe("0'5\"");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/height.test.ts`
Expected: FAIL — cannot resolve `@/lib/height`.

- [ ] **Step 3: Write the helper**

Create `src/lib/height.ts`:

```ts
// Performer height is stored as a single measurement in total inches. These
// helpers convert between that storage form and a feet+inches representation
// used for data entry and display.

// Break total inches into whole feet + remaining inches. Rounds to the nearest
// inch and clamps negatives to zero.
export function splitHeight(totalInches: number): { feet: number; inches: number } {
  const n = Math.max(0, Math.round(totalInches));
  return { feet: Math.floor(n / 12), inches: n % 12 };
}

// Combine feet + inches into total inches.
export function combineHeight(feet: number, inches: number): number {
  return feet * 12 + inches;
}

// Render total inches as e.g. 6'0".
export function formatHeight(totalInches: number): string {
  const { feet, inches } = splitHeight(totalInches);
  return `${feet}'${inches}"`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/height.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/height.ts src/lib/height.test.ts
git commit -m "feat: height feet/inches conversion helpers"
```

---

## Task 3: Height input (ft/in) + display formatting

**Files:**
- Modify: `src/components/MeasurementForm.tsx`
- Modify: `src/lib/tailor-summary.ts`
- Modify: `src/lib/tailor-summary.test.ts`
- Modify: `src/components/MakePieceRow.tsx`

- [ ] **Step 1: Add `key` to `MeasurementView` and the builder, and update its test (write the failing test)**

In `src/lib/tailor-summary.test.ts`, the `buildMeasurementsByCasting` test asserts the view objects. Update the two expectations to include `key`:

```ts
  expect(map["c1"]).toEqual([
    { key: "waist", label: "Waist", value: 30, unit: "in" },
    { key: "chest", label: "Chest", value: 36, unit: "in" },
  ]);
  expect(map["c2"]).toEqual([{ key: "chest", label: "Chest", value: 40, unit: "in" }]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — actual view objects have no `key` field yet.

- [ ] **Step 3: Add `key` to `MeasurementView` and populate it**

In `src/lib/tailor-summary.ts`, change the interface (currently `{ label; value; unit }`):

```ts
export interface MeasurementView {
  key: string;
  label: string;
  value: number;
  unit: string;
}
```

And in `buildMeasurementsByCasting`, where the `view` object is built (currently `{ label: ..., value: ..., unit: ... }`), add the key:

```ts
    const view: MeasurementView = {
      key: m.measurement_key,
      label: label.get(m.measurement_key) ?? m.measurement_key,
      value: m.value_numeric,
      unit: m.unit,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Format height in the read-only display**

In `src/components/MakePieceRow.tsx`:

(a) Add the import after the existing imports (e.g. after the `usePersistentState` import):

```ts
import { formatHeight } from "@/lib/height";
```

(b) Replace the measurement chip render (currently `<span className="muted">{m.label}:</span> {m.value}{m.unit}` inside `measurements.map((m) => (...))`) with:

```tsx
                {measurements.map((m) => (
                  <span key={m.label}>
                    <span className="muted">{m.label}:</span>{" "}
                    {m.key === "height" ? formatHeight(m.value) : `${m.value}${m.unit}`}
                  </span>
                ))}
```

- [ ] **Step 6: Two-field ft/in height input in the measurement form**

In `src/components/MeasurementForm.tsx`:

(a) Add the import at the top (after the `useState` import):

```ts
import { splitHeight, combineHeight } from "@/lib/height";
```

(b) After the existing `values`/`saved` state declarations, add height feet/inches state and a save function:

```tsx
  const initialHeight = splitHeight(initialValues.height ?? 0);
  const [heightFeet, setHeightFeet] = useState(
    "height" in initialValues ? String(initialHeight.feet) : "",
  );
  const [heightInches, setHeightInches] = useState(
    "height" in initialValues ? String(initialHeight.inches) : "",
  );

  async function saveHeight() {
    if (heightFeet.trim() === "" && heightInches.trim() === "") return;
    const heightDef = definitions.find((d) => d.key === "height");
    if (!heightDef) return;
    const total = combineHeight(Number(heightFeet || 0), Number(heightInches || 0));
    setSaved((s) => ({ ...s, height: "saving" }));
    const res = await fetch(`/api/performers/${performerId}/measurements`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ measurementKey: "height", valueNumeric: total, unit: heightDef.unit }),
    });
    setSaved((s) => ({ ...s, height: res.ok ? "saved" : "error" }));
    setValues((v) => ({ ...v, height: String(total) }));
  }
```

(c) In the `definitions.map((def) => ...)` body, special-case the height row. Replace the single returned `<label …>…</label>` with a conditional that returns the ft/in row for height and the existing label/input for everything else:

```tsx
        {definitions.map((def) =>
          def.key === "height" ? (
            <div
              key={def.key}
              className="flex items-center gap-2 border-b border-[var(--field-line)] py-2.5"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{def.label}</span>
                {def.help_text && <span className="block text-xs muted">{def.help_text}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  className="field w-16 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={heightFeet}
                  onChange={(e) => setHeightFeet(e.target.value)}
                  onBlur={saveHeight}
                  aria-label="Height (feet)"
                />
                <span className="text-sm muted">ft</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="11"
                  className="field w-16 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  value={heightInches}
                  onChange={(e) => setHeightInches(e.target.value)}
                  onBlur={saveHeight}
                  aria-label="Height (inches)"
                />
                <span className="text-sm muted">in</span>
                {saved[def.key] && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background:
                        saved[def.key] === "saved"
                          ? "#3f7d4f"
                          : saved[def.key] === "error"
                            ? "var(--red)"
                            : "var(--muted)",
                    }}
                    title={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                    aria-label={saved[def.key] === "saved" ? "Saved" : saved[def.key] === "error" ? "Couldn't save" : "Saving"}
                  />
                )}
              </span>
            </div>
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
                          ? "#3f7d4f"
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
        )}
```

(The non-height branch is the existing markup verbatim — keep it identical to what's there now.)

- [ ] **Step 7: Grep for any other read-only height display**

Run: `grep -rn "value_numeric\|\.unit\|measurement" src/components src/app --include=*.tsx | grep -vi "MeasurementForm\|MakePieceRow"`
Inspect hits; if any other component renders a height measurement value read-only, format it with `formatHeight` the same way. (Expected: none beyond `MakePieceRow`; the performer page edits via `MeasurementForm`.) If none found, no change.

- [ ] **Step 8: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: zero type errors, no NEW lint errors, all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/MeasurementForm.tsx src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts src/components/MakePieceRow.tsx
git commit -m "feat: enter and display performer height in feet and inches"
```

---

## Self-Review Notes

- **Spec coverage:** cap 4→6 in both constants + tests (Task 1); `height.ts` helper + tests (Task 2); ft/in input, `MeasurementView.key`, read-only `formatHeight` display, grep for other sites (Task 3). No migration. All spec sections map to a task.
- **Type consistency:** `MeasurementView` gains `key: string` (Task 3 step 3), consumed in `MakePieceRow` (step 5) and asserted in the updated test (step 1). `splitHeight`/`combineHeight`/`formatHeight` signatures from Task 2 are used unchanged by the form and display.
- **Storage unchanged:** height still saved as total inches via the existing PUT payload (`measurementKey`, `valueNumeric`, `unit`); only entry/display representation changes.
- **No placeholders:** every code step has complete code; every run step has an exact command + expected result.
