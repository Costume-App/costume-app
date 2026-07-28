# Protect A Typed Yardage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a recompute silently replacing a hand-typed fabric yardage, and offer the calculator's new figure instead.

**Architecture:** Two pure predicates decide everything — one detects a manual override, one decides whether to offer the calculator's value. `applyComputedYardage`, the single chokepoint all three recompute paths already funnel through, gains a guard built on the first. `save` gains an option so `fabric_yardage` and `calculated_yardage` can diverge in the override case. No migration, no API change.

**Tech Stack:** TypeScript strict, React 19 client component, Next.js 16 App Router, Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-07-28-protect-yardage-override-design.md`

## Global Constraints

- **Do not change `shouldOfferYardageUpdate`, `deriveCalculatedYardage`, or `seedCalculatorYardage`.** All three are correct and tested. This is why the override case needs a new `save` option rather than a changed helper.
- **The two prompt modes must be mutually exclusive** — they split on whether the field equals `calculatorYardage`, and a test asserts they never both return true.
- **`calculated_yardage` always updates on a recompute**, even when `fabric_yardage` is left alone. The column means *the calculator produced this*, not *this is displayed*.
- **Blank is not an override.** A blank field is filled by the calculator exactly as today; that is the escape hatch that hands a piece back to calculator control.
- No migration, no API change, no data-layer change, no new dependencies.
- **This is Next.js 16.** Per `AGENTS.md`, check `node_modules/next/dist/docs/` before assuming older App Router patterns. Nothing here needs a routing change.
- **Do not push and do not deploy.** Local commits only, on branch `feat/protect-yardage-override`, until Chris gives an explicit green light.

### The hazard this feature keeps producing

**Not-yet-flushed React state — this is its fifth appearance.** `applyComputedYardage` calls `setCalculatorYardage` immediately before `save` runs, so the new calculator value must travel through `save`'s options object, never be read from state. Every prior instance was caught in review rather than in writing.

## File Structure

| File | Change |
|---|---|
| `src/components/MakePieceRow.tsx` *(modify)* | Two new exported predicates; the guard; `save`'s new option; the second prompt; the hint |
| `src/components/MakePieceRow.test.ts` *(modify)* | Both predicates, and the mutual-exclusion property |

Task 1 is pure logic, fully testable in isolation — that is where the correctness lives. Task 2 wires it in.

---

### Task 1: The two predicates

**Files:**
- Modify: `src/components/MakePieceRow.tsx` (add two exported functions beside the existing helpers at the bottom), `src/components/MakePieceRow.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, both exported from `@/components/MakePieceRow`, used by Task 2:
  - `isManualOverride(yardageText: string, calculatorYardage: number | null): boolean`
  - `shouldOfferCalculatorValue(yardageText: string, estimateYards: number, lastCalculatedYardage: number | null): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/MakePieceRow.test.ts`. Add `isManualOverride` and `shouldOfferCalculatorValue` to the existing import from `@/components/MakePieceRow`.

```ts
describe("isManualOverride", () => {
  test("a value the calculator did not produce is an override", () => {
    expect(isManualOverride("6", 4.75)).toBe(true);
  });

  test("a value matching the calculator is not an override", () => {
    expect(isManualOverride("4.75", 4.75)).toBe(false);
  });

  test("a blank field is not an override — it is how a user hands the piece back", () => {
    expect(isManualOverride("", 4.75)).toBe(false);
    expect(isManualOverride("   ", 4.75)).toBe(false);
  });

  test("a value with no calculator history is the user's, so it is protected", () => {
    expect(isManualOverride("6", null)).toBe(true);
  });

  test("non-numeric text is not treated as an override worth protecting", () => {
    expect(isManualOverride("abc", 4.75)).toBe(false);
  });
});

describe("shouldOfferCalculatorValue", () => {
  test("offers the new figure when the field holds an override", () => {
    expect(shouldOfferCalculatorValue("6", 5.25, 4.75)).toBe(true);
  });

  test("offers nothing when the field is calculator-controlled", () => {
    // That is the other prompt's job.
    expect(shouldOfferCalculatorValue("4.75", 5.25, 4.75)).toBe(false);
  });

  test("offers nothing when the override already equals the estimate", () => {
    expect(shouldOfferCalculatorValue("5.25", 5.25, 4.75)).toBe(false);
  });

  test("offers nothing on a blank field", () => {
    expect(shouldOfferCalculatorValue("", 5.25, 4.75)).toBe(false);
  });

  test("offers nothing when the calculator has never produced a value", () => {
    expect(shouldOfferCalculatorValue("6", 5.25, null)).toBe(false);
  });

  test("offers nothing for non-numeric text", () => {
    expect(shouldOfferCalculatorValue("abc", 5.25, 4.75)).toBe(false);
  });
});

// The property that stops the UI rendering two contradictory prompts at once.
// Checked exhaustively over a small matrix rather than by argument, because the
// two predicates are maintained separately and could drift apart.
describe("the two prompts are mutually exclusive", () => {
  test("no combination makes both fire", () => {
    const fields = ["", "  ", "abc", "4.75", "5.25", "6", "0"];
    const calculated = [null, 4.75, 5.25, 6];
    const estimates = [4.75, 5.25, 6];
    for (const f of fields) {
      for (const c of calculated) {
        for (const e of estimates) {
          const a = shouldOfferYardageUpdate(f, e, c);
          const b = shouldOfferCalculatorValue(f, e, c);
          expect(a && b, `both fired for field=${f} calculated=${c} estimate=${e}`).toBe(false);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/MakePieceRow.test.ts`

Expected: FAIL — neither `isManualOverride` nor `shouldOfferCalculatorValue` exists, so the import does not resolve.

- [ ] **Step 3: Write the predicates**

Add both to `src/components/MakePieceRow.tsx`, immediately after `shouldOfferYardageUpdate` so the three read together:

```tsx
// Whether the Yardage field currently holds a number the user typed rather than
// one the calculator produced. This is what a recompute checks before replacing
// the field: a value the user chose is theirs to keep, and silently swapping it
// for a smaller computed one is the under-buy failure this whole feature exists
// to prevent.
//
// A blank field is deliberately NOT an override — clearing the field is how a
// user hands the piece back to the calculator, and it is the only way to do so.
// Non-numeric text is not an override either: there is nothing to protect, and
// treating it as one would freeze the field on a typo.
export function isManualOverride(
  yardageText: string,
  calculatorYardage: number | null,
): boolean {
  if (yardageText.trim() === "") return false;
  const current = Number(yardageText);
  if (!Number.isFinite(current)) return false;
  // No calculator history, but a real number in the field: it came from the user
  // or the AI, either way not from this calculator, so protect it.
  if (calculatorYardage == null) return true;
  return current !== calculatorYardage;
}

// The override counterpart to `shouldOfferYardageUpdate`. That one fires when
// the field still shows the calculator's own number and the estimate has moved
// away from it. This one fires when the field shows the user's number instead —
// offering the calculator's latest figure without ever imposing it.
//
// The two are mutually exclusive by construction: that predicate requires
// `current === lastCalculatedYardage`, this one requires the opposite. A test
// asserts it across a matrix, because they are maintained separately.
export function shouldOfferCalculatorValue(
  yardageText: string,
  estimateYards: number,
  lastCalculatedYardage: number | null,
): boolean {
  if (yardageText.trim() === "" || lastCalculatedYardage == null) return false;
  const current = Number(yardageText);
  if (!Number.isFinite(current)) return false;
  // Calculator-controlled — the other prompt owns this case.
  if (current === lastCalculatedYardage) return false;
  // Nothing to offer if the calculator agrees with what they typed.
  return estimateYards !== current;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/MakePieceRow.test.ts`

Expected: PASS. The mutual-exclusion test runs 84 combinations; if it fails, report the exact triple it names rather than adjusting either predicate to make it green — a genuine overlap is a design problem, not a test problem.

- [ ] **Step 5: Typecheck, lint, full suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean. The suite was 710 passing across 111 files; expect 710 + your new tests. Report the actual number.

- [ ] **Step 6: Commit**

```bash
git add src/components/MakePieceRow.tsx src/components/MakePieceRow.test.ts
git commit -m "feat(fabric): predicates for detecting and offering past a yardage override

isManualOverride tells a user-typed yardage from a calculator-produced one.
shouldOfferCalculatorValue is the override counterpart to
shouldOfferYardageUpdate — the two are mutually exclusive by construction, and
a matrix test asserts it, since they are maintained separately."
```

---

### Task 2: Guard the recompute, and offer instead

**Files:**
- Modify: `src/components/MakePieceRow.tsx`

**Interfaces:**
- Consumes: `isManualOverride(yardageText, calculatorYardage)` and `shouldOfferCalculatorValue(yardageText, estimateYards, lastCalculatedYardage)` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Guard `applyComputedYardage`**

Replace `applyComputedYardage` (currently at `src/components/MakePieceRow.tsx:206-210`) with:

```tsx
  // Applies a freshly computed yardage. The tracker always takes the new value —
  // it records what the calculator produced, regardless of what is displayed.
  // The visible field is only replaced when it is NOT a manual override: a
  // number the user typed is theirs, and a recompute offers rather than imposes
  // (see `shouldOfferCalculatorValue` and the prompt it drives).
  function applyComputedYardage(nextYardage: string | undefined) {
    if (nextYardage == null) return;
    if (!isManualOverride(yardage, calculatorYardage)) setYardage(nextYardage);
    setCalculatorYardage(Number(nextYardage));
  }
```

- [ ] **Step 2: Let `save` carry the two values independently**

Add to `save`'s options object (the type at `src/components/MakePieceRow.tsx:246`), after `yardage`:

```tsx
    calculatedYardage?: string;
```

Then change the body's `calculatedYardage` line — currently `calculatedYardage: deriveCalculatedYardage(opts?.yardage, calculatorYardage),` — to:

```tsx
      // On a recompute that left an override in place, `yardage` is omitted so
      // fabric_yardage keeps the user's number, while `calculatedYardage` still
      // carries the figure the calculator just produced. Reading opts rather
      // than state matters: setCalculatorYardage has not flushed yet.
      calculatedYardage: deriveCalculatedYardage(
        opts?.calculatedYardage ?? opts?.yardage,
        calculatorYardage,
      ),
```

`deriveCalculatedYardage` itself is unchanged — only what is handed to it. When no recompute happened both options are absent and it falls through to the tracked value, exactly as before.

- [ ] **Step 3: Have the three recompute paths respect the override**

Each currently passes the computed value as `yardage`, which `save` uses for both columns. Now `yardage` must be withheld when an override is present, while `calculatedYardage` is always sent.

Note each captures `override` **before** calling `applyComputedYardage`, because that call changes the state the check reads.

`applyConstruction` (currently `:212-216`):

```tsx
  function applyConstruction(nextConstruction: string, nextFullness: string) {
    const nextYardage = computeYardage(nextConstruction, nextFullness, widthIn, effectiveLengthIn);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      construction: nextConstruction,
      fullness: nextFullness,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
  }
```

`applyWidth` (currently `:222-230`) — leave its `!construction` early return exactly as it is:

```tsx
  function applyWidth(nextWidth: string) {
    if (!construction) {
      void save({ width: nextWidth });
      return;
    }
    const nextYardage = computeYardage(construction, fullness, parseWidthInches(nextWidth), effectiveLengthIn);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      width: nextWidth,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
  }
```

`applyLength` (currently `:235-244`) — likewise keep its early return:

```tsx
  function applyLength(nextLength: string) {
    if (!construction) {
      void save({ length: nextLength });
      return;
    }
    const nextEffectiveLength = resolveLengthOverride(nextLength, outseamIn) ?? outseamIn;
    const nextYardage = computeYardage(construction, fullness, widthIn, nextEffectiveLength);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      length: nextLength,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
  }
```

Leave the "Measurements changed" button's own handler (currently `:485-489`) alone. It only fires when the field is *not* an override, so its existing `save({ yardage: next })` is already correct.

- [ ] **Step 4: Add the second prompt**

In the derivation panel, immediately after the existing `shouldOfferYardageUpdate` block (currently `:481-493`) and before the closing `</>`:

```tsx
                    {shouldOfferCalculatorValue(yardage, estimate.yards, calculatorYardage) && (
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium text-[var(--red)] hover:underline"
                        onClick={() => {
                          const next = String(estimate.yards);
                          setYardage(next);
                          setCalculatorYardage(estimate.yards);
                          void save({ yardage: next, calculatedYardage: next });
                        }}
                      >
                        Calculator says {estimate.yards} yd — use it
                      </button>
                    )}
```

This handler sets the field directly rather than calling `applyComputedYardage`, because that function would now refuse — the field is an override, which is precisely why this prompt is showing. Clicking is the user choosing to hand the piece back, so both columns take the estimate and the piece returns to calculator control.

The wording is deliberate: *"Calculator says X — use it"* states a fact and offers an action. It must not read as an error or a warning, because the user's number is legitimate. Do not reword it to imply something is wrong.

- [ ] **Step 5: Tell the user how to hand the piece back**

The Yardage field's hint currently reads, when an estimate exists, "Calculated from the measurements — type over it to override." Clearing the field is now the only way to return a piece to calculator control, and nothing says so. Change that branch of the hint to:

```tsx
"Calculated from the measurements — type over it to override, or clear it to hand it back."
```

Leave the no-estimate branch of the hint unchanged.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean, suite unchanged from Task 1's count — this task adds no tests, because its logic lives in Task 1's predicates and the wiring is covered by them plus the existing `deriveCalculatedYardage` tests.

- [ ] **Step 7: Trace the four paths and report**

No browser is available: the app needs a signed-in Clerk session, and **you must not mint a sign-in token or authenticate as any user** — an earlier agent in this project did that and it is not to be repeated. Verify by reading, and cite line numbers for each:

1. **Override + construction change** — field keeps the user's number; `save` receives no `yardage` but a `calculatedYardage`; the offer prompt appears.
2. **No override + construction change** — field takes the new number; both columns move together; no offer prompt.
3. **Blank field + construction change** — treated as no override, so the field fills; this is the escape hatch working.
4. **Clicking "use it"** — both columns take the estimate and the prompt disappears on the next render.

State plainly which you could confirm by reading and which you could not.

- [ ] **Step 8: Commit**

```bash
git add src/components/MakePieceRow.tsx
git commit -m "fix(fabric): a recompute no longer discards a typed yardage

Changing the construction, width, or length used to overwrite a hand-typed
yardage outright — the same silent-downward-revert this feature has now closed
twice by other doors. The field is replaced only when it is not an override;
otherwise the user's number stays and the calculator's figure is offered.

calculated_yardage still updates either way, so the column keeps meaning
\"the calculator produced this\" rather than \"this is displayed\"."
```

---

## Self-Review

**Spec coverage.** The rule in `applyComputedYardage` → Task 2 Step 1. `save` carrying the two values independently → Step 2. All three recompute paths → Step 3. The second prompt and its wording → Step 4. The escape hatch made discoverable → Step 5. Both predicates and mutual exclusion → Task 1. Every spec section maps to a step.

**One thing the spec asked for that this plan handles differently.** The spec's testing section says to verify the guard "by extraction… If the guard resists extraction into a pure helper, say so." The guard *is* extracted — into `isManualOverride`, which Task 1 tests directly. `applyComputedYardage` itself then contains only a call to it plus two setters, which is thin enough that a further extraction would test nothing. Task 2 Step 7's read-through covers the wiring.

**Placeholder scan.** No TBD, TODO, "handle edge cases", or "similar to Task N". Every code step is complete and paste-ready.

**Type consistency.** `isManualOverride(yardageText: string, calculatorYardage: number | null)` and `shouldOfferCalculatorValue(yardageText: string, estimateYards: number, lastCalculatedYardage: number | null)` are defined in Task 1 Step 3 and called under exactly those names and argument orders in Task 2 Steps 1, 3, and 4. `save`'s new option is `calculatedYardage?: string` throughout — a string, matching `yardage`, because `deriveCalculatedYardage` takes `string | undefined`.
