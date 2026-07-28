# Stop a recompute from silently discarding a typed yardage

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan

## Background

The skirt calculator computes a fabric yardage from a performer's measurements
and writes it into `fabric_yardage`, where the user may type over it. Two rounds
of review have now traced the same failure family — a user's deliberate fabric
quantity being replaced by a smaller computed one — through three different
doors:

1. The "Measurements changed" prompt offering to revert an override (fixed by
   `feat/calculated-yardage`, merged as part of this sequence).
2. Persisting the outseam pre-fill as a length override, so a re-measure never
   surfaced (fixed during that branch's final review).
3. **This one:** a recompute overwriting a typed yardage outright.

The final whole-branch review flagged it as pre-existing and out of scope:

> Picking a skirt construction calls `applyComputedYardage` unconditionally,
> overwriting a hand-typed yardage with the calculator's number. A user who typed
> 6 yd and then selects "Full circle" sees 6 replaced by 4.75 with no prompt and
> no undo. That is the same silent-downward-revert family this branch exists to
> stop, arriving by a different door.

Reading the code confirms it is broader than that example. All three recompute
paths — `applyConstruction` (`MakePieceRow.tsx:214`), `applyWidth` (`:228`), and
`applyLength` (`:242`) — call `applyComputedYardage` unconditionally, so
changing the construction, the fabric width, *or* the skirt length each discards
a typed number.

Under-buying is the failure this feature is calibrated against: a school theater
program on a fixed budget may not get the same dye lot twice.

### What makes the fix possible now

`calculated_yardage` — added by the previous branch — records what the
calculator itself last produced. A manual override is therefore detectable, and
is exactly `yardage !== calculatorYardage`.

## Decision

**A recompute overwrites the Yardage field only when the field is not a manual
override.** Otherwise the user's number stays and the new figure is offered.

| Question | Decision |
|---|---|
| Override present | Keep the user's number; offer the calculator's |
| `calculated_yardage` | Always updates, even when `fabric_yardage` is left alone |
| Blank field | Not an override — the calculator fills it, as today |
| `shouldOfferYardageUpdate` | Unchanged |

### Why offer rather than keep silent or overwrite-with-undo

Keeping silent is the most consistent with the previous branch (never nag about
an override), but a user who picks a construction and sees nothing happen has
reason to think the app is broken. Overwriting with an undo performs the
destructive act first, and an undo that scrolls out of view is not an undo.

Offering is never destructive, never silent, and it teaches — which matters,
because the audience Nada described for this feature is people new to costuming:
*"what does that mean for them to make it themselves? Like they don't know."*
Showing that the calculator would say 5.25 against their 6 is information they
can act on or ignore.

### Why the existing predicate cannot be reused

`shouldOfferYardageUpdate` (`MakePieceRow.tsx:593-601`) requires the field to
*equal* the calculator's value before it fires. That is deliberate — it is what
stopped the prompt from nagging about overrides. So it can never fire in the
case this spec addresses, and widening it would re-open the bug the previous
branch closed. The new case gets a sibling predicate instead.

## The rule

In `applyComputedYardage` (`MakePieceRow.tsx:206-210`) — the single chokepoint
all three recompute paths already funnel through, which is why fixing it there
covers construction, width, and length at once:

- **Field is blank, or equals `calculatorYardage`** — not an override. Set both
  the field and the tracker, exactly as today.
- **Field differs from `calculatorYardage`** — a manual override. Update
  `calculatorYardage` only; leave the field alone.

`calculated_yardage` updating in both branches is what keeps the column honest:
it means *the calculator produced this*, not *this is displayed*.

### A consequence worth stating

Each `apply*` function currently passes one computed value to `save` as
`yardage`, and `save` derives *both* `fabricYardage` and `calculatedYardage`
from it (`MakePieceRow.tsx:272,277`). In the override case those must diverge —
`fabric_yardage` keeps the user's number while `calculated_yardage` takes the
new figure — so `save`'s options must carry the two independently.

This is the fifth appearance of the not-yet-flushed-state hazard in this
feature. `applyComputedYardage` calls `setCalculatorYardage` immediately before
`save` runs, so the new calculator value must travel through the options object,
never read from state.

## Two prompt modes

They split on whether the field equals the calculator's value, so they are
mutually exclusive by construction and can never both render:

| State | Condition | Shows |
|---|---|---|
| Calculator-controlled, drifted | field **=** calculated, estimate ≠ calculated | "Measurements changed — update to 5.25 yd" *(existing)* |
| Manual override | field **≠** calculated | "Calculator says 5.25 yd — use it" *(new)* |
| Agreement | field = calculated = estimate | nothing |

A new predicate, extracted and unit-tested the way `deriveCalculatedYardage`
and `seedCalculatorYardage` already are in this file:

```ts
export function shouldOfferCalculatorValue(
  yardageText: string,
  estimateYards: number,
  lastCalculatedYardage: number | null,
): boolean;
```

It returns true when the field holds a finite number that differs from
`lastCalculatedYardage`, and the estimate differs from the field. It returns
false on a blank field and on a null `lastCalculatedYardage` — a piece the
calculator has never produced a value for has nothing to offer.

Clicking "use it" applies the estimate through the existing path, which sets
both columns and returns the piece to calculator control.

**Clearing the field hands the piece back to the calculator**, since blank is
not an override and the next recompute fills it. That is the escape hatch, and
the Yardage field's hint must say so — otherwise a user who wants the calculator
back has no discoverable way to ask for it.

## Scope

### Files

| File | Change |
|---|---|
| `src/components/MakePieceRow.tsx` | The guard in `applyComputedYardage`; independent `yardage`/`calculatedYardage` in `save`'s options; the new predicate; the second prompt; the hint |
| `src/components/MakePieceRow.test.ts` | The new predicate, and the mutual-exclusion property |

No migration. No API change. No data-layer change. The column this rests on
already exists and is already threaded.

### Out of scope

- Any change to `shouldOfferYardageUpdate`, `deriveCalculatedYardage`, or
  `seedCalculatorYardage`.
- The geometry in `src/lib/fabric/skirt-yardage.ts`.
- Warning before a *construction* change specifically. The rule is uniform
  across all three recompute paths; singling one out would be arbitrary.

## Testing

- `shouldOfferCalculatorValue`: override present, no override, blank field, null
  `lastCalculatedYardage`, and an override that happens to equal the estimate.
- **Mutual exclusion** asserted directly across a matrix of field / calculated /
  estimate values: the two predicates must never both return true. This is the
  property that stops the UI rendering two contradictory prompts, and it is
  cheap to check exhaustively over a small set.
- The guard in `applyComputedYardage`: verify by extraction that an override is
  preserved and a non-override is replaced. If the guard resists extraction into
  a pure helper, say so rather than shipping it untested — the two previous
  rounds established that a pure helper plus a mock object is almost always
  available here, and the one claim that it was not turned out to be wrong.

The full suite (710 at the time of writing) must stay green.

## Risks

- **The prompt's wording carries the meaning.** "Calculator says 5.25 yd — use
  it" must not read as an error or a warning; the user's number is legitimate.
  Getting this wrong turns a helpful line into a nag, which is what the previous
  branch spent a whole review cycle removing.
- **Silence on a construction change may still surprise.** With an override
  present, picking a construction now visibly changes only the derivation and
  the offer line, not the Yardage field. That is intended, but it is a behavior
  change from today and worth watching the first time Nada uses it.
