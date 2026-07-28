# Calculated Yardage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember what the skirt calculator produced, so the "Measurements changed" prompt can tell a genuinely stale estimate from a deliberate manual override and stop offering to revert one.

**Architecture:** One new column on `costume_pieces` holding the calculator's own last output, threaded through the same seven files `skirt_length_in` already passes through. `MakePieceRow` seeds its existing `calculatorYardage` state from that column instead of guessing from `fabric_yardage`. The predicate that decides whether to prompt is already correct and already tested — only its input changes.

**Tech Stack:** TypeScript strict, React 19 client component, Next.js 16 App Router, Supabase, Vitest (`environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-07-28-calculated-yardage-design.md`

## Global Constraints

- **`shouldOfferYardageUpdate` (`src/components/MakePieceRow.tsx:580-589`) must not change.** It is correct and tested. This work changes only where its `lastCalculatedYardage` argument comes from.
- **The AI estimator must PRESERVE the column but never SET it.** Preserving and writing are different. The column means exactly one thing: *the skirt calculator produced this*.
- **No backfill.** Existing rows get null, which reads as "not from the calculator" and suppresses the prompt — the safe direction.
- **Null means manual or AI.** A suppressed prompt costs nothing; a wrongly-fired one can revert an override and under-buy.
- No new dependencies. No visual change — the prompt's markup, label, and behavior are untouched.
- **This is Next.js 16.** Per `AGENTS.md`, check `node_modules/next/dist/docs/` before assuming older App Router patterns. Nothing here needs a routing change.
- **Do not push and do not deploy.** Local commits only, on branch `feat/calculated-yardage`, until Chris gives an explicit green light. Migration `0032` is applied to Supabase by Chris by hand — do not attempt to run it.

### The recurring hazards in this feature — name them, do not rediscover them

Two classes of bug have each occurred twice already here. Both tasks below are written to close them by construction:

1. **Omission on write-back.** Any code path that rebuilds a piece's PUT body and forgets a column *nulls* that column, because the route turns an absent field into an explicit null and `upsertPieceSource` always writes it. This bit `RoleCostumePanel`, `PurchasedList`, and the AI route.
2. **Not-yet-flushed React state.** `setX(...)` followed by a `save()` that reads `x` from state saves the *old* value. This bit the construction/fullness pair, then width, then length. **This will be its fourth appearance.**

## File Structure

| File | Change |
|---|---|
| `supabase/migrations/0032_calculated_yardage.sql` *(create)* | The column |
| `src/lib/data/costume-pieces.ts` *(modify)* | `CostumePiece` field; `upsertPieceSource` input + payload |
| `src/app/api/productions/[id]/pieces/route.ts` *(modify)* | Body field, validation, forward |
| `src/lib/tailor-summary.ts` *(modify)* | `PieceRow`, `Fabric`, `EMPTY_FABRIC`, `fabricFromRow`, `PurchasedItem` |
| `src/lib/piece-put-body.ts` *(modify)* | Both builders carry it |
| `src/components/PurchasedList.tsx` *(modify)* | Carry it in the price-save body |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` *(modify)* | Preserve in the write-back |
| `src/lib/piece-put-body.test.ts` *(modify)* | Preservation per trigger |
| `src/app/api/productions/[id]/estimate-fabric/route.test.ts` *(modify)* | Preserve-not-set |
| `src/components/MakePieceRow.tsx` *(modify)* | Seed from the column; derive it on save |
| `src/components/MakePieceRow.test.ts` *(modify)* | The null-calculated case |

Task 1 makes the column exist and survive every write path. Task 2 makes the UI use it.

---

### Task 1: The column, and making it survive every write

**Files:**
- Create: `supabase/migrations/0032_calculated_yardage.sql`
- Modify: `src/lib/data/costume-pieces.ts`, `src/app/api/productions/[id]/pieces/route.ts`, `src/lib/tailor-summary.ts`, `src/lib/piece-put-body.ts`, `src/components/PurchasedList.tsx`, `src/app/api/productions/[id]/estimate-fabric/route.ts`, `src/lib/piece-put-body.test.ts`, `src/app/api/productions/[id]/estimate-fabric/route.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `costume_pieces.calculated_yardage` (numeric, `> 0` or null); `upsertPieceSource` accepts `calculatedYardage?: number | null`; `Fabric.calculatedYardage: number | null` is what Task 2 reads off `item.fabric`.

Every edit in this task mirrors how `skirt_length_in` is already threaded. Read one of its call sites first — `src/lib/tailor-summary.ts:184` and `src/lib/piece-put-body.ts:59` are representative — and follow that shape exactly.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0032_calculated_yardage.sql`:

```sql
-- What the skirt calculator (src/lib/fabric/skirt-yardage.ts) last produced for
-- this piece, kept separate from fabric_yardage — the value the user sees and
-- may type over. Equal means the field still holds the calculator's number;
-- different means the user overrode it; null means it never came from the
-- calculator. This is the signal that lets the "Measurements changed" prompt
-- tell a genuinely stale estimate from a deliberate choice, instead of nagging
-- about an override and offering to revert it.
alter table costume_pieces add column if not exists calculated_yardage numeric
  constraint costume_pieces_calculated_yardage_check
  check (calculated_yardage is null or calculated_yardage > 0);
```

- [ ] **Step 2: Write the failing preservation tests**

These are the tests that matter. The bug class they guard has already occurred twice in this feature, so there is one per trigger rather than one representative.

In `src/lib/piece-put-body.test.ts`, add `calculated_yardage: 4.75` to the existing `existingWithSkirt` fixture, and append:

```ts
test("buildSetSourceBody preserves the calculated yardage", () => {
  expect(buildSetSourceBody(existingWithSkirt, "make").calculatedYardage).toBe(4.75);
});

test("buildSetPieceFieldBody preserves the calculated yardage across every trigger", () => {
  const triggers: SetPieceFieldPatch[] = [
    { makerId: "m1" },
    { made: true },
    { purchasePrice: 12 },
  ];
  for (const patch of triggers) {
    expect(
      buildSetPieceFieldBody(existingWithSkirt, patch).calculatedYardage,
      `lost on ${JSON.stringify(patch)}`,
    ).toBe(4.75);
  }
});

test("both builders default the calculated yardage to null with no existing row", () => {
  expect(buildSetSourceBody(undefined, "make").calculatedYardage).toBeNull();
  expect(buildSetPieceFieldBody(undefined, { made: true }).calculatedYardage).toBeNull();
});
```

If the existing `SetPieceFieldPatch` shape does not accept those three keys exactly, use whatever keys it does define for maker, made, and purchase price — read the interface at `src/lib/piece-put-body.ts:66` and match it. Keep one case per trigger.

In `src/app/api/productions/[id]/estimate-fabric/route.test.ts`, add `calculated_yardage: null` to any piece-row fixture TypeScript flags, then append:

```ts
test("an AI estimate preserves an existing calculated yardage without setting one", async () => {
  // A piece that already carries a calculator value, plus a second piece with
  // no yardage for the AI to fill. The AI must leave the first alone and must
  // not claim authorship of the value it writes to the second.
  const existing = { ...basePiece(), calculated_yardage: 4.75, fabric_yardage: 4.75 };
  listCostumePieces.mockResolvedValue([existing]);
  await POST(new Request("http://x", { method: "POST" }), ctx());
  for (const call of upsertPieceSource.mock.calls) {
    expect(call[0]).toHaveProperty("calculatedYardage");
  }
});
```

Adapt the fixture names to whatever that file already uses — read its existing tests and follow their setup exactly rather than inventing new helpers.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/piece-put-body.test.ts "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`

Expected: FAIL — `calculatedYardage` is not a property of either body type, and the fixtures do not typecheck.

- [ ] **Step 4: Thread the column through the data layer**

In `src/lib/data/costume-pieces.ts`:

Add to `CostumePiece`, immediately after `skirt_length_in` (line 21):

```ts
  calculated_yardage: number | null;
```

Add to the `upsertPieceSource` input type, after `skirtLengthIn` (line 83):

```ts
  calculatedYardage?: number | null;
```

Beside the other normalized locals, after line 101:

```ts
  const calculatedYardage = num(input.calculatedYardage);
```

And in the `.upsert({ ... })` payload, after `skirt_length_in` (line 156):

```ts
        calculated_yardage: calculatedYardage,
```

Do **not** add it to the `pieceRowIsEmpty({ ... })` call. The column only ever exists alongside a `fabric_yardage`, which already counts as content; adding it would be redundant and would change nothing.

- [ ] **Step 5: Accept it at the API boundary**

In `src/app/api/productions/[id]/pieces/route.ts`, add to the body type after `skirtLengthIn` (line 46):

```ts
      calculatedYardage?: number | null;
```

After the existing `checkPositive(body.skirtLengthIn, "Skirt length")` (line 85):

```ts
    checkPositive(body.calculatedYardage, "Calculated yardage");
```

And in the `upsertPieceSource` call, after `skirtLengthIn` (line 120):

```ts
      calculatedYardage: body.calculatedYardage ?? null,
```

- [ ] **Step 6: Thread it through the view types**

In `src/lib/tailor-summary.ts`, add to `PieceRow` after `skirt_length_in` (line 17):

```ts
  calculated_yardage: number | null;
```

To `Fabric` after `skirtLengthIn` (line 33):

```ts
  calculatedYardage: number | null;
```

To `PurchasedItem` after `skirtLengthIn` (line 111):

```ts
  calculatedYardage: number | null;
```

To the empty-fabric constant (line 170), extending that line:

```ts
  skirtConstruction: null, skirtFullness: null, skirtLengthIn: null, calculatedYardage: null,
```

To `fabricFromRow` after line 184:

```ts
    calculatedYardage: row.calculated_yardage,
```

And to the purchased-item mapping after line 292:

```ts
          calculatedYardage: row.calculated_yardage,
```

- [ ] **Step 7: Carry it in every PUT body builder**

In `src/lib/piece-put-body.ts`, add to both `SetSourceBody` (after line 27) and `SetPieceFieldBody` (after line 85):

```ts
  calculatedYardage: number | null;
```

and to both builders' returned objects, after their `skirtLengthIn` lines (59 and 114):

```ts
    calculatedYardage: existing?.calculated_yardage ?? null,
```

In `src/components/PurchasedList.tsx`, add to the price-save body after `skirtLengthIn` (line 55):

```ts
          calculatedYardage: item.calculatedYardage,
```

- [ ] **Step 8: Preserve it in the AI write-back**

In `src/app/api/productions/[id]/estimate-fabric/route.ts`, after `skirtLengthIn` (line 91):

```ts
        calculatedYardage: existing?.calculated_yardage ?? null,
```

**Preserve only.** Do not set it to the value the AI just computed. The column means the skirt calculator produced this, and the AI is not the skirt calculator — a piece it estimates has no construction and renders no prompt, so there is nothing to seed.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run src/lib/piece-put-body.test.ts "src/app/api/productions/[id]/estimate-fabric/route.test.ts"`

Expected: PASS.

- [ ] **Step 10: Full suite, typecheck, lint**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean. The suite was 694 passing across 111 files; expect 694 + your new tests. Report the actual number.

TypeScript will flag every fixture that constructs a `PieceRow`, `Fabric`, or `PurchasedItem` and now needs the field — add `calculated_yardage: null` or `calculatedYardage: null` to each. **Do not loosen a type or add a cast to avoid updating a fixture.** Report how many you touched.

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0032_calculated_yardage.sql src/lib/data/costume-pieces.ts "src/app/api/productions/[id]/pieces/route.ts" src/lib/tailor-summary.ts src/lib/piece-put-body.ts src/components/PurchasedList.tsx "src/app/api/productions/[id]/estimate-fabric/route.ts" src/lib/piece-put-body.test.ts "src/app/api/productions/[id]/estimate-fabric/route.test.ts"
git commit -m "feat(fabric): persist what the skirt calculator produced

Migration 0032 adds calculated_yardage, threaded through the data layer, the
pieces API, the view types, both PUT body builders, and the AI write-back.

The AI preserves the column but never sets it: it means the skirt calculator
produced this value, and that distinction is the whole point. Preservation is
tested per trigger, because forgetting a column in a rebuilt PUT body has
already nulled data twice in this feature."
```

---

### Task 2: Seed from the column instead of guessing

**Files:**
- Modify: `src/components/MakePieceRow.tsx`, `src/components/MakePieceRow.test.ts`

**Interfaces:**
- Consumes: `item.fabric.calculatedYardage` (`number | null`) and the `calculatedYardage` field on the pieces PUT body, both from Task 1.
- Produces: nothing later tasks consume.

- [ ] **Step 1: Write the failing test**

`shouldOfferYardageUpdate` is unchanged, but the null case is currently only implied. Append to `src/components/MakePieceRow.test.ts`:

```ts
test("no update is offered when the yardage never came from the calculator", () => {
  // A hand-typed or AI-written value has no calculated_yardage, so there is no
  // claim that measurements moved — prompting here would offer to overwrite the
  // user's own number with the calculator's minimum.
  expect(shouldOfferYardageUpdate("5.5", 4.75, null)).toBe(false);
});

test("no update is offered when the field holds a deliberate override", () => {
  expect(shouldOfferYardageUpdate("5.5", 5.25, 4.75)).toBe(false);
});

test("an update is offered when the field still holds the calculator's own number", () => {
  expect(shouldOfferYardageUpdate("4.75", 5.25, 4.75)).toBe(true);
});

test("no update is offered when the estimate has not moved", () => {
  expect(shouldOfferYardageUpdate("4.75", 4.75, 4.75)).toBe(false);
});
```

Import `shouldOfferYardageUpdate` from `@/components/MakePieceRow` if that file's existing imports do not already include it.

- [ ] **Step 2: Run it to verify the current state**

Run: `npx vitest run src/components/MakePieceRow.test.ts`

Expected: these four **PASS** already — the predicate is correct, and that is the point. They exist to pin the contract before the seeding changes underneath it, so a later edit cannot quietly break it. If any fails, stop and report: the predicate is not what this plan assumes.

- [ ] **Step 3: Seed from the column**

In `src/components/MakePieceRow.tsx`, change the `calculatorYardage` initializer (lines 105-107) from `item.fabric.yardage ?? null` to:

```tsx
  const [calculatorYardage, setCalculatorYardage] = useState<number | null>(
    item.fabric.calculatedYardage ?? null,
  );
```

Update the comment block above it (lines 99-104) so it says the value is persisted rather than tracked in memory — the previous wording explains an in-session tracker, and that is no longer the whole story.

- [ ] **Step 4: Send it on every save**

Add to the `PiecePutBody` interface, after `skirtLengthIn`:

```tsx
  calculatedYardage: number | null;
```

Then in `save` (line 252), add to the body after `skirtLengthIn` (line 264):

```tsx
      // When a recompute supplied a yardage, that value IS the calculator's
      // output. Otherwise — a manual edit, a maker change, a made toggle —
      // carry the tracked value through unchanged, which is what makes an
      // override diverge and permanently silence the prompt for this piece.
      calculatedYardage: opts?.yardage !== undefined ? Number(opts.yardage) : calculatorYardage,
```

**Read `opts.yardage`, not the `calculatorYardage` state variable, in the recompute case.** `applyComputedYardage` calls `setCalculatorYardage` immediately before `save`, and that has not flushed when `save` reads state — this is the same hazard already handled for `yd`, `con`, `ful`, and `len` on the lines just above, and its fourth appearance in this feature. Deriving from `opts.yardage` also means the two can never disagree, because they read the same input.

Note the three call sites that pass `yardage`: `applyConstruction` (line 205), `applyWidth` (line 219), `applyLength` (line 233). All three call `applyComputedYardage` first, so the derivation is correct for each. The `!construction` early-returns in `applyWidth` and `applyLength` pass no `yardage`, so they correctly fall through to the tracked value.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`

Expected: all clean, suite unchanged from Task 1's count plus the four new predicate tests.

- [ ] **Step 6: Check it in a browser**

Migration `0032` will not be applied, so saves carrying the new field will fail. **Do not apply it, and do not mint a Clerk sign-in token or authenticate as any user** — an earlier agent in this project did that and it is not to be repeated.

What you can verify without a session: confirm by reading that a manual edit to the Yardage field reaches `save()` with no `opts`, and therefore sends `calculatedYardage` unchanged from state. Trace it and state the line numbers.

If you can reach the app in a browser through an already-open session without authenticating, report what you saw. Otherwise say plainly that you could not, and what you traced instead. A partial verification honestly labeled is useful; a fabricated pass is not.

- [ ] **Step 7: Commit**

```bash
git add src/components/MakePieceRow.tsx src/components/MakePieceRow.test.ts
git commit -m "fix(fabric): stop offering to revert a deliberate yardage override

calculatorYardage now seeds from the persisted calculated_yardage instead of
guessing from fabric_yardage, so a hand-typed value is no longer mistaken for a
stale calculator value on every mount — and the prompt can no longer offer to
overwrite it with the calculator's minimum.

shouldOfferYardageUpdate is unchanged; only its input is now real."
```

- [ ] **Step 8: Report the handoff**

Do not push, do not deploy. Report to Chris:

1. **Migration `0032_calculated_yardage.sql` must be applied by hand** before the picker will save. Until then, saves fail on the missing column exactly as they did for `0031`.
2. **Existing rows get null**, which reads as "not from the calculator" and suppresses the prompt. That is deliberate and safe. The first time a user changes a construction, width, or length on such a piece, the calculator writes both columns and the row starts behaving normally.

---

## Self-Review

**Spec coverage.** Migration → Task 1 Step 1. Threading across all seven files → Task 1 Steps 4–8. AI preserve-not-set → Task 1 Step 8, tested in Step 2. `MakePieceRow` seed → Task 2 Step 3. Save derivation and the manual-edit path → Task 2 Step 4. Predicate coverage → Task 2 Step 1. Handoff and risks → Task 2 Step 8. `pieceRowIsEmpty` explicitly needs no change → Task 1 Step 4. Every spec section maps to a step.

**Placeholder scan.** No TBD, TODO, "handle edge cases", or "similar to Task N". Two steps tell the implementer to match an existing fixture's shape rather than quoting it verbatim — that is deliberate, because those fixtures live in files this plan does not otherwise reproduce, and inventing names for them would be worse than pointing at the real ones.

**Type consistency.** The database column is `calculated_yardage` throughout; the camelCase form is `calculatedYardage` on `Fabric`, `PurchasedItem`, both PUT body interfaces, `PiecePutBody`, and the `upsertPieceSource` input. `shouldOfferYardageUpdate`'s signature is untouched. Task 2 reads `item.fabric.calculatedYardage`, which Task 1 Step 6 defines.
