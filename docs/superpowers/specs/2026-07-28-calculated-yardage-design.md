# Remembering that a yardage came from the calculator

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan

## Background

The skirt yardage feature merged 2026-07-28 (`cc1f3ce`). Its final review left
one known residual, shipped knowingly and recorded at the time:

> A piece carrying a manual yardage override shows one false "Measurements
> changed" nudge on every fresh mount where the override still differs from a
> freshly computed estimate. If a user reflexively clicks it, their deliberate
> override silently reverts to the bare calculator minimum — the exact under-buy
> failure mode this feature exists to prevent.

The cause is a missing signal, not faulty logic. `shouldOfferYardageUpdate`
(`src/components/MakePieceRow.tsx:580-589`) is correct and tested: it fires only
when the field still shows the calculator's own last output *and* a fresh
estimate has moved away from it. But `calculatorYardage` is seeded at mount from
`item.fabric.yardage` (`:105-107`) because that is the only data available — so
a hand-typed 5.0 and a calculator-produced 5.0 are indistinguishable, and every
mount of an overridden piece looks like staleness.

Within a session the distinction holds, because manual edits never call
`applyComputedYardage`. It is only lost across a reload.

## Decision

Persist what the calculator produced, in its own column, and seed
`calculatorYardage` from that instead of guessing.

| Question | Decision |
|---|---|
| Mechanism | A `calculated_yardage numeric` column |
| Existing rows | No backfill — null reads as "not from the calculator" |
| AI-written yardages | Do **not** set the column; the AI is not the calculator |
| `shouldOfferYardageUpdate` | Unchanged |

### Why the calculator's output rather than a boolean flag

A boolean (`yardage_is_manual`) would answer the immediate question in less
space. Storing the number is barely larger and strictly more informative: it
keeps a real value to compare against rather than a claim about one, so the two
cannot drift apart. It also means `shouldOfferYardageUpdate` needs no change —
its signature already ends in `lastCalculatedYardage: number | null`, and this
work only changes where that argument comes from. Reusing a tested predicate
unchanged is the point.

### Why no backfill

Existing rows get null, which reads as "never came from the calculator" and
suppresses the nudge. That is the safe direction: a suppressed nudge costs a
user nothing, while a wrongly-fired one can revert a deliberate override and
under-buy. It is also close to moot — migration `0031` was only applied on
2026-07-28 and the feature has not been deployed, so no production row has a
skirt construction yet.

### Why the AI must not write it

The AI estimator writes `fabric_yardage` for pieces with no construction. Those
pieces render no derivation panel, so the nudge cannot appear for them either
way. Leaving `calculated_yardage` null keeps the column meaning exactly one
thing: *the skirt calculator produced this*. If a user later sets a construction
on such a piece, `applyConstruction` recomputes and writes both columns
immediately, so the null resolves itself on the first interaction.

**The AI route must still carry the column through its write-back.** That route
spreads every existing field into `upsertPieceSource` so an estimate does not
clobber other columns. Omitting the new field would null it — the identical bug
found twice already in this feature, once in the AI route itself and once in
`RoleCostumePanel`. Preserving is not the same as writing.

## Migration `0032_calculated_yardage.sql`

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

Follows `0031`'s convention: `add column if not exists`, a named check
constraint, and a comment explaining why rather than what.

## Threading

Exactly as `skirt_length_in` is threaded today — the same files, the same shape:

| File | Change |
|---|---|
| `src/lib/data/costume-pieces.ts` | `CostumePiece.calculated_yardage`; `upsertPieceSource` input `calculatedYardage?: number \| null`, normalized with the existing `num()`, written in the upsert payload |
| `src/app/api/productions/[id]/pieces/route.ts` | Body field + `checkPositive`, forwarded to `upsertPieceSource` |
| `src/lib/tailor-summary.ts` | `PieceRow.calculated_yardage`; `Fabric.calculatedYardage`; `EMPTY_FABRIC`; `fabricFromRow` |
| `src/lib/piece-put-body.ts` | Both builders carry it, alongside the three skirt fields |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` | Preserved in the write-back: `calculatedYardage: existing?.calculated_yardage ?? null` |

`pieceRowIsEmpty` (`src/lib/costume-merge.ts`) needs no change: the column only
ever exists alongside a `fabric_yardage`, which already counts as content.

## `MakePieceRow`

Three changes, all small:

1. **Seed from the column.** `calculatorYardage` initializes from
   `item.fabric.calculatedYardage` rather than `item.fabric.yardage`
   (`:105-107`). This is the fix; everything else supports it.
2. **`applyComputedYardage` writes both.** When the calculator produces a value
   it goes to `fabric_yardage` *and* `calculated_yardage`, threaded through
   `save`'s options object.

   **This is the fourth appearance of the not-yet-flushed-state hazard in this
   feature** — after `yd`, the construction/fullness pair, and the width fix.
   `setCalculatorYardage` has not flushed when `save` reads state, so the value
   must travel through `opts`, not through the state variable. Every previous
   instance of this was caught in review rather than in writing; the plan will
   name it.
3. **Manual edits leave it alone.** The Yardage field's `onBlur` calls `save()`
   with no options, which sends `calculatorYardage` from state unchanged. That
   divergence is what silences the nudge for that piece, permanently and
   correctly.

No visual change. The nudge's markup, label, and behavior are untouched — it
simply stops appearing when it shouldn't.

## Behavior

| `fabric_yardage` | `calculated_yardage` | Fresh estimate | Nudge? |
|---|---|---|---|
| 4.75 | 4.75 | 4.75 | No — nothing has changed |
| 4.75 | 4.75 | 5.25 | **Yes** — measurements moved |
| 5.5 | 4.75 | 5.25 | No — deliberate override |
| 3.0 | null | 5.25 | No — never calculated |

Row 2 is the case being protected. Row 3 is the bug being fixed.

## Testing

- `shouldOfferYardageUpdate` already has coverage; extend it so the
  null-`lastCalculatedYardage` case is asserted explicitly rather than implied.
- **Round-trip preservation**, in `src/lib/piece-put-body.test.ts`: the column
  survives a maker assignment, a made toggle, a purchase-price edit, and a
  source change. This is the class of bug that has already occurred twice in
  this feature, so it gets a test per trigger rather than one representative.
- **AI write-back preservation**, in the estimate-fabric route test: an estimate
  on a piece leaves an existing `calculated_yardage` intact.
- A test that the AI path does not *set* the column — the distinction between
  preserving and writing is the whole reason the column means anything.

The full suite (694 at the time of writing) must stay green.

## Risks

- **Migration `0032` must be applied before this helps**, and until it is, saves
  carrying the new field will fail the same way `0031` did. Same handoff as
  every migration in this project: Chris runs it by hand.
- **The null-means-manual reading is a convention, not an invariant.** Anything
  that writes `fabric_yardage` without writing `calculated_yardage` produces a
  row that reads as an override. That is intentional for the AI path and for
  hand-typed values, and it fails safe in every other case — but it means a
  future writer of `fabric_yardage` has to make a deliberate choice, and should
  find this note when it does.
