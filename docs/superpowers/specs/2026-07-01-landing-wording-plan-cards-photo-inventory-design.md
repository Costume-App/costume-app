# Landing Wording + Landing-Style Plan Cards + Photo-First Inventory

**Date:** 2026-07-01
**Status:** Approved by Chris (design conversation, 2026-07-01)

Three small independent changes, plus one ops task already completed.

## 0. (Done, no code) Comp Nada's prod org

`org_subscriptions.comped = true` set for `org_3FupIkxyxEKeuHAxXcqzOzrVxKz`
("Self", created 2026-07-01) via Supabase REST. `isUnlimited` in
`src/lib/data/billing.ts` reads this flag, so she has full unlimited access.
No code change; recorded here for the paper trail.

## 1. Landing page wording (`src/components/landing/landing-content.ts`, `LandingPage.tsx`)

### 1a. Title Case headlines

Standard title case (minor connector words — a, in, for, at, per, of, the —
stay lowercase unless first word). Applies to every `h1`/`h2`/`h3` and pricing
tier name on the landing page. Exact strings:

| Location | Current | New |
|---|---|---|
| Features h2 (`LandingPage.tsx`) | Everything a production needs, in one place | Everything a Production Needs, in One Place |
| Pricing h2 (`LandingPage.tsx`) | Simple plans for every program | Simple Plans for Every Program |
| Curtain-call h2 (`LandingPage.tsx`) | Ready for your next production? | Ready for Your Next Production? |
| Feature card (`landing-content.ts`) | Everything in one place | Everything in One Place |
| Feature card | Auto-built cast lists | Auto-Built Cast Lists |
| Feature card | Character boards | Character Boards |
| Feature card | Cast measurements | Cast Measurements |
| Feature card | Source every piece | Source Every Piece |
| Feature card | Piece inspiration | Piece Inspiration |
| Feature card | House inventory | House Inventory |
| Feature card | Cost at a glance | Cost at a Glance |
| Pricing tier name | Pay per production | Pay Per Production |

Not headlines (unchanged): hero tagline, eyebrow labels (CSS-uppercased
`.lbl`), feature blurbs, hero footnote, footer strapline, buttons.

Note: the tier name "Pay Per Production" also appears in-app via
`PLANS.perProduction.label` (`src/lib/billing-plans.ts`) and the plan label in
`OrgBillingPanel.tsx` — update those to match so landing and app agree.

### 1b. Remove AI references

Only occurrence is the `ai-fabric` feature card:

- Title: "AI fabric estimates" → **"Automatic Fabric Estimates"**
- Blurb: "Let AI calculate the yardage to bring each costume to life." →
  **"Get the yardage for every costume piece, calculated automatically."**
  (Per Nada: card text must end with the word "automatically".)
- Icon: replace the ✨ sparkles path in `ICON_PATHS["ai-fabric"]`
  (`LandingPage.tsx`) with a tape-measure/scissors-style line icon in the same
  feather style (24×24, stroke 1.75). The `id` string `ai-fabric` may stay.

## 2. In-app plan cards match landing pricing cards

**Files:** `src/components/PlanCard.tsx`, `src/lib/billing-plans.ts`,
`src/components/OrgBillingPanel.tsx`, `src/components/PlanLimitNotice.tsx`.

### `billing-plans.ts`

Each plan gains `cadence` and `points` (mirroring `PRICING_TIERS`; keep in
sync by eye, per the existing comment):

- `perProduction`: label "Pay Per Production", price "$49.99", cadence
  "one-time, per production", points: ["1 production", "3 makers included",
  "+$10 per extra maker"].
- `extraSeat`: label "Extra Maker", price "$10", cadence "one-time", points:
  ["1 more maker on this production"].
- `unlimited`: label "Unlimited", price "$99.99", cadence "per year", points:
  ["Unlimited productions", "Unlimited makers", "Best for ongoing programs"].

Keep `id`; keep or drop `includes` depending on remaining call sites (grep —
if nothing else reads it, drop it and fix tests).

### `PlanCard.tsx`

Landing card anatomy, adapted:

- Root: `<article className="surface flex flex-col p-5">` (+ `ring-2
  ring-[var(--red)]` when `highlight`). No longer a `<button>` — the CTA is
  the only interactive element.
- `highlight` → `<span className="lbl … text-[var(--red)]">Best value</span>`.
- Name: `font-display text-xl font-semibold`.
- Price line: `font-display text-3xl font-semibold` price + `text-sm muted`
  cadence.
- Points: `ul` with red `✦` bullets, exactly like `LandingPage.tsx` pricing.
- CTA: `<button>` — `btn-primary` when highlighted, else `btn-ghost` — text
  "Choose →" / "Starting…", disabled while busy, `onClick` → existing
  `useCheckout().start(type, productionId)`. Checkout error `message` still
  renders under the card.

Props change from `includes: string` to `cadence: string` and
`points: string[]`.

### Call sites

Both card lists switch from vertical `space-y-2` stacks to
`grid gap-3 sm:grid-cols-2` so pairs sit side by side like the landing page.
`OrgBillingPanel` plan label "Pay per production" → "Pay Per Production".

## 3. Photo-first House Inventory rows

**Files:** `src/app/(app)/inventory/page.tsx`,
`src/lib/inventory-grouping.ts` (`InventoryRow`),
`src/components/InventoryManager.tsx`.

- `InventoryRow` gains optional `photoUrl?: string | null`.
- `inventory/page.tsx`: after `listInventoryItems`, call the existing
  `firstImagePaths(itemIds)` (`src/lib/data/inventory-item-images.ts`) +
  `signImageUrls` (`src/lib/storage.ts`, 7-day expiry) and attach `photoUrl`
  per row. One batched signing call, not per item.
- Row layout (`InventoryManager.tsx` list button): prepend a 56px square
  thumbnail — `h-14 w-14 shrink-0 rounded-lg object-cover` `<img>` when
  `photoUrl`, else a muted placeholder tile (same box, `bg-[#8c2b22]/10` with
  a small feather-style garment/scissors icon). Name/size/qty/chevron
  unchanged; row padding may tighten (`p-2`) so rows don't balloon.
- Search, grouping, collapse, expand-to-edit all unchanged.
- Accepted limitation (YAGNI): uploading a photo in the expanded editor does
  not live-update the row thumbnail; it appears on next page load.

## Testing

Vitest suite exists (443+ tests) — TDD with the repo's mock patterns:

- Update/extend `PlanCard` / `OrgBillingPanel` / `PlanLimitNotice` tests for
  the new markup and props (bullets render, CTA starts checkout, busy state).
- Inventory: test that page data mapping attaches `photoUrl` (mock
  `firstImagePaths`/`signImageUrls`) and that rows render an `img` when
  `photoUrl` is set and the placeholder when not.
- Landing content: if copy is asserted anywhere, update; add a simple
  assertion that no landing string contains "AI".

## Out of scope

- Any push/deploy (local commits only — Chris green-lights pushes).
- Live thumbnail refresh after photo upload.
- Wording changes anywhere but the landing page (except the plan-label sync
  noted in 1a/2).
