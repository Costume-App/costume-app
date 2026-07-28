# Skirt fabric yardage from performer measurements

**Date:** 2026-07-28
**Status:** Approved, ready for implementation plan

## Background

On a call, Nada asked for the second half of a two-part request (the first half,
the compliance revision, shipped 2026-07-28 as `a57b2cf`):

> So when we were trying to figure out — if I put in the measurements for
> whatever costume. So if I'm doing a skirt, that radius, that formula, how can
> you put that in there? So if I say her waist is 27 and her waist to ankle is
> 32 — it should spit out the calculation how much yardage.

Asked where it belonged, she confirmed the making area, per piece: *"to see that
for each item. The estimated yardage for each one."*

She also framed who it is for:

> If their waist is bigger, a 42 waist with a 48 hip — well, we know that's a
> little bit bigger, that's a size large. But what does that mean for them to
> make it themselves? Like they don't know.

Nada referred to a formula she had sent. **It could not be found** — not in the
repo, the docs directory, either meeting transcript, or the meeting PDF. Chris
elected to proceed on standard drafting math rather than block, with the cut
layout flagged for Nada to confirm.

### The anchor from the earlier meeting

The May meeting transcript (`docs/TranscriptFromMeetingwithNadaCostumeApp.odt`)
contains a usable data point:

> So a full circle skirt with gathering is going to be 4. 4 yards. I always
> guesstimate my yards. Which then leaves us with more fabric left over, which
> is fine.

**That number turns out to be correct, not generous.** An early derivation in
this design session treated a full circle skirt as two panels and produced
~2.1 yd, roughly half her figure. That derivation was wrong. A full circle skirt
is cut as four quarter-panels, each requiring an R × R square, and at 45" width
only one panel fits per row — so it needs 4 × R ≈ 149" ≈ 4.1 yards.

Her instinct matched the geometry. This matters for the allowance decision below.

## Decisions

| Question | Decision |
|---|---|
| Constructions covered | Circle (full / three-quarter / half) and gathered |
| How construction is known | Explicit per-piece picker — never inferred from the free-text design name |
| Precedence | Manual entry > skirt calculator > AI estimate > blank |
| Output | Exact math + allowance, rounded up to the next quarter yard |
| Transparency | Full derivation shown, one line per step |
| Waste allowance | **10%** |

### Why a picker rather than inferring from the design name

Design names are free text — "Cloak", "Peasant Skirt", "Skirt (Act II)". Keyword
matching would silently apply skirt math to a name that merely contains "skirt",
and silently skip one that does not. Worse, it cannot distinguish a circle skirt
from a gathered one, and those give materially different answers for the same
performer. An explicit picker is one interaction and removes the whole class of
error.

### Why deterministic math beats the AI for these pieces

The app already estimates yardage with Haiku (`src/lib/ai/estimate-fabric.ts`).
For a garment whose fabric requirement is a closed-form function of two
measurements and the fabric width, arithmetic is better than a language model at
arithmetic: it is reproducible, explainable, free, and cannot hallucinate. The
AI keeps every garment that has no closed form.

### Why the allowance is 10%, not 15%

Because the corrected math already lands on Nada's own number. Padding a figure
that already matches an experienced costumer's instinct just makes it wrong in
the other direction. 10% plus rounding up to a quarter yard gives a modest
cushion without inflating the purchase list.

This is the number most likely to need adjusting after Nada uses it. It is a
single named constant for that reason.

## The math — `src/lib/fabric/skirt-yardage.ts`

A pure module. No database, no network, no framework imports. Fully unit-tested.

```ts
export type SkirtConstruction =
  | "full_circle"
  | "three_quarter_circle"
  | "half_circle"
  | "gathered";

export interface SkirtYardageInput {
  construction: SkirtConstruction;
  waistInches: number;
  lengthInches: number;        // waist to hem
  fabricWidthInches: number;
  fullness?: number;           // gathered only: 2, 2.5, or 3
}

export interface SkirtYardageResult {
  yards: number;               // final, rounded up to the next 0.25
  steps: string[];             // one human-readable line per stage
  warning?: string;
}

export function estimateSkirtYardage(input: SkirtYardageInput): SkirtYardageResult;
```

### Constants

| Name | Value | Why |
|---|---|---|
| `HEM_ALLOWANCE_IN` | 1 | Turned hem |
| `WAIST_SEAM_IN` | 1 | Gathered panels only — seam into the waistband |
| `SELVAGE_IN` | 2 | Unusable edge; `usableWidth = fabricWidth − 2` |
| `WASTE_ALLOWANCE` | 0.10 | See rationale above |
| `ROUND_TO_YARDS` | 0.25 | Fabric is cut in quarter yards |

### Circle skirts

`f` is the fraction of a full circle: `full_circle` 1, `three_quarter_circle`
0.75, `half_circle` 0.5.

```
r       = waist / (2π · f)              waist-opening radius
R       = r + length + HEM_ALLOWANCE_IN outer radius
panels  = 4 · f                         full 4, three-quarter 3, half 2
perRow  = floor(usableWidth / R)        R × R panels that fit across
rows    = ceil(panels / perRow)
inches  = rows · R
```

The `perRow` term is what makes this correct at both extremes. When the fabric is
wide enough for the whole circle (`usableWidth ≥ 2R`), `perRow` is 2 and `rows`
is 2, giving `inches = 2R` — the single-square layout. When it is not, `perRow`
drops to 1 and all four panels stack, giving `4R`.

### Gathered skirts

```
panelWidth = waist · fullness
panels     = ceil(panelWidth / usableWidth)
inches     = panels · (length + HEM_ALLOWANCE_IN + WAIST_SEAM_IN)
```

### Both, then

```
yards = ceil( (inches / 36) · (1 + WASTE_ALLOWANCE) / 0.25 ) · 0.25
```

### Worked examples — these are the test anchors

| Case | Construction | Waist | Length | Width | Raw | Final |
|---|---|---|---|---|---|---|
| Nada's stated figure | full circle | 27 | 32 | 45 | 4.14 yd | **4.75 yd** |
| Knee-length, wide goods | full circle | 26 | 20 | 60 | 1.40 yd | **1.75 yd** |
| Gathered, triple fullness | gathered | 27 | 32 | 45 | 1.89 yd | **2.25 yd** |

The first row is the one to show Nada: 4.14 yd raw against her stated 4 yards.

### Edge cases

- **`R > usableWidth`** — a single panel is wider than the fabric. `perRow`
  would be 0. Clamp to 1 and return `warning`: the panel must be pieced. Silently
  dividing by zero, or silently returning a number that assumes an impossible
  cut, would be expensive in real fabric.
- **Non-finite or non-positive `waistInches` / `lengthInches` / `fabricWidthInches`**
  — throw. The caller is responsible for not calling without measurements; see
  the UI section.
- **`gathered` without `fullness`** — default to 2 and say so in `steps`.
- **`fullness` supplied for a circle construction** — ignore it silently; it has
  no meaning there.

## Data — migration `0031_skirt_construction.sql`

```sql
-- Per-piece skirt construction, so fabric yardage can be computed from the
-- performer's measurements instead of estimated by the AI. Null construction
-- means "not a skirt" and leaves the piece on the AI path, exactly as before.
alter table costume_pieces add column if not exists skirt_construction text
  check (skirt_construction in
    ('full_circle','three_quarter_circle','half_circle','gathered'));

-- Gathered skirts only: how many times the waist measurement the panels total.
alter table costume_pieces add column if not exists skirt_fullness numeric;
```

Follows the established `alter table costume_pieces add column` pattern of
`0011`, `0014`, `0020`, `0022`, `0023`. No new table, no backfill — every
existing row gets a null construction and behaves as it does today.

`upsertPieceSource` (`src/lib/data/costume-pieces.ts:66`) gains
`skirtConstruction?: string | null` and `skirtFullness?: number | null`,
following the shape of its existing optional fields.

## UI — `src/components/MakePieceRow.tsx`

This is the "where you're making it" area Nada pointed at. The row already
receives `measurements: MeasurementView[]` and renders them, so both required
values are in hand with no new plumbing.

- A **Construction** select beside the existing fabric fields: *(not a skirt)*,
  Full circle, Three-quarter circle, Half circle, Gathered.
- A **Fullness** select that appears only for Gathered: 2×, 2½×, 3×.
- Changing either recomputes immediately and saves through the existing
  `upsertPieceSource` call, writing `fabric_yardage` along with the two new
  fields. Because the number lands in the same column as before, the cost
  rollup, the tailor's summary, and the fabric purchase list pick it up with no
  changes to any of them.
- Beneath the yardage field, the derivation renders from `steps`, plus the
  `warning` when present.

Measurements are read from the row's existing `measurements` array by key:
`waist`, and `outseam` — which is already labeled **"Waist to ankle"**
(`supabase/migrations/0002_performers.sql`), exactly the measurement Nada named.

**When a measurement is missing**, no yardage is computed. The row states which
one is absent and links to the performer's measurements page. This will be the
common case on a fresh production, so a bare dash would be a dead end.

## AI estimator

`src/app/api/productions/[id]/estimate-fabric/route.ts` gains one condition: skip
any piece whose `skirt_construction` is set. Those pieces are owned by the
deterministic path.

Everything else about that route is unchanged, including that it never
overwrites a yardage a human already entered.

Precedence overall, highest first:

1. Manual entry
2. Skirt calculator (construction set)
3. AI estimate
4. Blank

## Testing

Unit tests on `src/lib/fabric/skirt-yardage.ts`, which is where essentially all
the risk lives:

- The three worked examples above, asserted to the quarter yard.
- Each of the four constructions produces a distinct, correct panel count.
- The `perRow` branch at each step: `usableWidth < 2R` gives `perRow = 1`,
  `rows = 4`, `inches = 4R`; `2R ≤ usableWidth < 4R` gives `perRow` of 2 or 3,
  `rows = 2`, `inches = 2R` (the single-square layout); `usableWidth ≥ 4R` gives
  `perRow = 4`, `rows = 1`, `inches = R`. Assert each explicitly rather than
  testing only "wide" versus "narrow" — the middle branch is the common one and
  the outer two are where an off-by-one hides.
- `R > usableWidth` returns a `warning` and still returns a finite yardage.
- Non-finite and non-positive inputs throw.
- `gathered` without `fullness` defaults to 2 and says so in `steps`.
- `steps` is non-empty for every successful call — it is the feature's
  transparency contract, not decoration.

Component-level: `MakePieceRow` shows the fullness select only for gathered, and
shows the missing-measurement message rather than a number when `waist` or
`outseam` is absent.

The full suite (628 at the time of writing) must stay green.

## Out of scope

- **A-line, panel, and gored skirts.** They need hip and hem-sweep inputs the app
  does not collect. Adding measurements is a separate decision.
- **Non-skirt garments.** Bodices, sleeves, and cloaks stay on the AI path.
- **Fabric-specific adjustment** — nap, one-way prints, plaid matching. Real
  effects, all of which increase yardage, none of which the app has the inputs
  for. The 10% allowance is not a substitute and should not be described as one.
- **Making the allowance configurable.** One constant until Nada has used it
  enough to say what it should be.

## Risks

- **The formula is not Nada's.** It is standard drafting math that reproduces her
  stated figure on the one case we can check. Show her the 27/32/45 example
  before this reaches her users, and treat the cut-layout rule as the part most
  likely to need revision.
- **Nobody has validated the gathered path against a real project.** The circle
  path has Nada's 4-yard anchor; the gathered path has nothing equivalent.
- **`SELVAGE_IN` is load-bearing at boundaries.** When `2R` is near
  `usableWidth`, a 2" difference flips `perRow` between 1 and 2 and so nearly
  doubles the answer. That is a genuine property of cutting fabric rather than a
  modeling artifact, but it means the constant deserves a comment and Nada's eye.
