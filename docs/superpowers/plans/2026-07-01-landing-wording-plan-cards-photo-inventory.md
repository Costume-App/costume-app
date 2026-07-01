# Landing Wording + Landing-Style Plan Cards + Photo-First Inventory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Title-case + de-AI the landing copy, restyle the in-app plan cards to match the landing pricing cards, and turn the House Inventory list into a photo tile grid.

**Architecture:** Three independent slices. (1) Copy changes live in `landing-content.ts` (data) + `LandingPage.tsx` (hardcoded h2s + one icon). (2) `billing-plans.ts` gains `cadence`/`points`; `PlanCard.tsx` adopts the landing card anatomy; three call sites switch to side-by-side grids. (3) `InventoryRow` gains `photoUrl` via a pure `attachInventoryPhotoUrls` helper (server page batches the signing); `InventoryManager` renders wrapping photo tiles per category with the inline editor spanning the full grid width.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind 4 with the app's Atelier classes (`surface`, `lbl`, `btn-primary`, `btn-ghost`, `muted`, `font-display`), Vitest (node environment — pure-logic tests only, no component rendering).

**Spec:** `docs/superpowers/specs/2026-07-01-landing-wording-plan-cards-photo-inventory-design.md`

## Global Constraints

- Local commits only. **NEVER push to any remote or deploy** — Chris green-lights pushes explicitly.
- This is Next.js 16 — check `node_modules/next/dist/docs/` before assuming an API; don't rename/move files the plan doesn't mention.
- Vitest runs in `environment: "node"` — no jsdom, no React Testing Library. Test pure data/logic only; component markup is verified by `npm run lint` + `npm run build`.
- Copy rules (Nada): headlines in Title Case (minor words — a, an, and, as, at, but, by, for, in, of, on, or, per, the, to, with — stay lowercase unless first word, EXCEPT the tier name which is exactly "Pay Per Production"); no "AI" anywhere on the landing page; the fabric feature card is titled exactly **"Automatic Fabric Estimates"** and its blurb ends with the word **"automatically."**
- Run the full suite (`npm test`) before every commit; all tests must pass (baseline is green, 443+ tests).
- End every commit message with the trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (use a second `-m`).

---

### Task 1: Landing copy — Title Case headlines, no AI, fabric card reword

**Files:**
- Create: `src/components/landing/landing-content.test.ts`
- Modify: `src/components/landing/landing-content.ts` (FEATURES titles, ai-fabric blurb, tier name)
- Modify: `src/components/landing/LandingPage.tsx` (three hardcoded `h2` strings, `ICON_PATHS["ai-fabric"]`)

**Interfaces:**
- Consumes: existing exports `FEATURES`, `LANDING`, `PRICING_TIERS` from `@/components/landing/landing-content` (shapes unchanged).
- Produces: same exports, new copy. Task 2 reuses the tier-name capitalization "Pay Per Production" in `billing-plans.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/components/landing/landing-content.test.ts`:

```ts
import { expect, test } from "vitest";
import { FEATURES, LANDING, PRICING_TIERS } from "@/components/landing/landing-content";

const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "per", "the", "to", "with",
]);

// Title Case: every significant word starts uppercase; minor words may stay
// lowercase (except as the first word).
function isTitleCase(text: string): boolean {
  return text.split(/\s+/).every((word, i) => {
    const w = word.replace(/[^A-Za-z]/g, "");
    if (!w) return true;
    if (i > 0 && MINOR_WORDS.has(w.toLowerCase())) return true;
    return w[0] === w[0].toUpperCase();
  });
}

test("feature card titles are Title Case", () => {
  for (const f of FEATURES) {
    expect(isTitleCase(f.title), `not title case: "${f.title}"`).toBe(true);
  }
});

test("pricing tier names are exactly as approved", () => {
  expect(PRICING_TIERS.map((t) => t.name)).toEqual(["Pay Per Production", "Unlimited"]);
});

test("landing copy contains no AI references", () => {
  const strings = [
    LANDING.brand, LANDING.titleLead, LANDING.titleAccent, LANDING.tagline, LANDING.eyebrow,
    ...FEATURES.flatMap((f) => [f.title, f.blurb]),
    ...PRICING_TIERS.flatMap((t) => [t.name, t.cadence, ...t.points]),
  ];
  for (const s of strings) {
    expect(s, `AI reference in: "${s}"`).not.toMatch(/\bAI\b/i);
  }
});

test("fabric estimates card matches Nada's wording", () => {
  const fabric = FEATURES.find((f) => f.id === "ai-fabric");
  expect(fabric?.title).toBe("Automatic Fabric Estimates");
  expect(fabric?.blurb.endsWith("automatically.")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/landing/landing-content.test.ts`
Expected: FAIL — title-case, tier-name, no-AI, and fabric-card tests all fail against current copy.

- [ ] **Step 3: Update the copy**

In `src/components/landing/landing-content.ts`, replace the `FEATURES` array with:

```ts
export const FEATURES: Feature[] = [
  { id: "all-in-one", group: "Production", title: "Everything in One Place", blurb: "Casts, roles, costumes, fabric, and budget for a whole show — together." },
  { id: "auto-roles", group: "Production", title: "Auto-Built Cast Lists", blurb: "Generate the standard roles for popular productions in a click." },
  { id: "character-boards", group: "Production", title: "Character Boards", blurb: "Pin reference photos, ideas, and notes to every role." },
  { id: "measurements", group: "Production", title: "Cast Measurements", blurb: "Capture each performer's measurements right where you need them." },

  { id: "sourcing", group: "Costumes & Inventory", title: "Source Every Piece", blurb: "Decide each costume: make it, buy it, or pull it from inventory." },
  { id: "inspiration", group: "Costumes & Inventory", title: "Piece Inspiration", blurb: "Collect photos and ideas for every costume piece in one place." },
  { id: "inventory", group: "Costumes & Inventory", title: "House Inventory", blurb: "Track your stock with photos and a storage location for every piece." },
  { id: "ai-fabric", group: "Costumes & Inventory", title: "Automatic Fabric Estimates", blurb: "Get the yardage for every costume piece, calculated automatically." },

  { id: "cost", group: "Cost", title: "Cost at a Glance", blurb: "See your production's whole estimated cost in one place." },
];
```

And in `PRICING_TIERS`, change `name: "Pay per production"` → `name: "Pay Per Production"` (nothing else in that tier changes).

In `src/components/landing/LandingPage.tsx`, change the three hardcoded headline strings:
- `Everything a production needs, in one place` → `Everything a Production Needs, in One Place`
- `Simple plans for every program` → `Simple Plans for Every Program`
- `Ready for your next production?` → `Ready for Your Next Production?`

Also in `LandingPage.tsx`, replace the sparkles entry in `ICON_PATHS` (the `"ai-fabric"` key) with a feather-style scissors (fabric-cutting) icon:

```tsx
  "ai-fabric": (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M20 4 8.12 15.88" />
      <path d="M14.47 14.48 20 20" />
      <path d="M8.12 8.12 12 12" />
    </>
  ),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/landing/landing-content.test.ts` → PASS (4 tests).
Then the full suite: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landing-content.ts src/components/landing/landing-content.test.ts src/components/landing/LandingPage.tsx
git commit -m "feat(landing): Title Case headlines, remove AI references (Automatic Fabric Estimates)"
```

---

### Task 2: `billing-plans.ts` — Title Case labels, split price/cadence, add points

**Files:**
- Create: `src/lib/billing-plans.test.ts`
- Modify: `src/lib/billing-plans.ts`
- Modify: `src/app/(app)/productions/new/page.tsx:40-51` (checkout-not-configured fallback `<ul>` only — it renders `plan.price`, which loses its cadence suffix in this change)

**Interfaces:**
- Consumes: nothing new.
- Produces: `PLANS.<key>` now has `id`, `label`, `price` (bare amount, e.g. `"$49.99"`), `cadence` (e.g. `"one-time, per production"`), `includes` (kept — the fallback list and `/api` payload use it), and `points: readonly string[]`. Task 3's `PlanCard` consumes `label`, `price`, `cadence`, `points`. Note `src/lib/api.test.ts` deep-equals the API payload against `PLANS` itself, so the shape change passes through without edits.

- [ ] **Step 1: Write the failing test**

Create `src/lib/billing-plans.test.ts`:

```ts
import { expect, test } from "vitest";
import { PLANS } from "@/lib/billing-plans";

test("plan labels are Title Case", () => {
  expect(PLANS.perProduction.label).toBe("Pay Per Production");
  expect(PLANS.extraSeat.label).toBe("Extra Maker");
  expect(PLANS.unlimited.label).toBe("Unlimited");
});

test("price is the bare amount; cadence and points carry the rest", () => {
  for (const plan of Object.values(PLANS)) {
    expect(plan.price).toMatch(/^\$\d+(\.\d{2})?$/);
    expect(plan.cadence.length).toBeGreaterThan(0);
    expect(plan.points.length).toBeGreaterThan(0);
  }
});

test("plan points mirror the landing pricing tiers", () => {
  expect([...PLANS.perProduction.points]).toEqual(["1 production", "3 makers included", "+$10 per extra maker"]);
  expect([...PLANS.unlimited.points]).toEqual(["Unlimited productions", "Unlimited makers", "Best for ongoing programs"]);
  expect([...PLANS.extraSeat.points]).toEqual(["1 more maker on this production"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/billing-plans.test.ts`
Expected: FAIL — labels are lowercase, `price` contains cadence text, `cadence`/`points` are undefined.

- [ ] **Step 3: Update the plans descriptor**

Replace the `PLANS` object in `src/lib/billing-plans.ts` (keep the file's leading comment and the `Plans` type export):

```ts
export const PLANS = {
  perProduction: {
    id: "per_production",
    label: "Pay Per Production",
    price: "$49.99",
    cadence: "one-time, per production",
    includes: "1 production, 3 makers",
    points: ["1 production", "3 makers included", "+$10 per extra maker"],
  },
  extraSeat: {
    id: "extra_seat",
    label: "Extra Maker",
    price: "$10",
    cadence: "one-time",
    includes: "1 more maker on this production",
    points: ["1 more maker on this production"],
  },
  unlimited: {
    id: "unlimited",
    label: "Unlimited",
    price: "$99.99",
    cadence: "per year",
    includes: "Unlimited productions & makers",
    points: ["Unlimited productions", "Unlimited makers", "Best for ongoing programs"],
  },
} as const;
```

In `src/app/(app)/productions/new/page.tsx`, in the checkout-not-configured fallback `<ul>`, change the price span so the cadence isn't lost:

```tsx
                  <span className="text-sm muted">{plan.price} · {plan.cadence}</span>
```

(This is the span currently rendering `{plan.price}` at line 45. Leave the rest of the fallback, including the `{plan.includes}` line, unchanged. Do NOT touch the `<PlanCard …>` calls yet — that's Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/billing-plans.test.ts` → PASS (3 tests).
Then `npm test` → all green (`api.test.ts` compares against `PLANS` itself, so it stays green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing-plans.ts src/lib/billing-plans.test.ts "src/app/(app)/productions/new/page.tsx"
git commit -m "feat(billing): plan descriptor gains cadence + points, Title Case labels"
```

---

### Task 3: `PlanCard` matches the landing pricing cards; call sites go side-by-side

**Files:**
- Modify: `src/components/PlanCard.tsx` (full rewrite of the render)
- Modify: `src/components/OrgBillingPanel.tsx:61,75-90`
- Modify: `src/components/PlanLimitNotice.tsx:22-56`
- Modify: `src/app/(app)/productions/new/page.tsx:18,24-38`

**Interfaces:**
- Consumes: `PLANS.<key>.{label,price,cadence,points}` from Task 2; existing `useCheckout()` hook (`{ busy, message, start }`, `start(type, productionId?)`) and `CheckoutType` — both unchanged.
- Produces: `PlanCard` props change from `includes: string` to `cadence: string; points: readonly string[]`. No other component consumes `PlanCard` beyond the three call sites listed.

- [ ] **Step 1: Rewrite `PlanCard.tsx`**

Replace the whole file with:

```tsx
"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

// A landing-style price card (Fraunces name, big price, ✦ points) whose CTA
// button starts Stripe Checkout. Mirrors the pricing cards in LandingPage.
export function PlanCard({
  type,
  productionId,
  name,
  price,
  cadence,
  points,
  highlight,
}: {
  type: CheckoutType;
  productionId?: string;
  name: string;
  price: string;
  cadence: string;
  points: readonly string[];
  highlight?: boolean;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <div className="flex h-full flex-col space-y-1">
      <article
        className={`surface flex flex-1 flex-col p-5 ${highlight ? "ring-2 ring-[var(--red)]" : ""}`}
      >
        {highlight && <span className="lbl mb-2 inline-block text-[var(--red)]">Best value</span>}
        <h3 className="font-display text-xl font-semibold">{name}</h3>
        <p className="mt-2">
          <span className="font-display text-3xl font-semibold">{price}</span>{" "}
          <span className="text-sm muted">{cadence}</span>
        </p>
        <ul className="mt-3 flex-1 space-y-1.5 text-sm">
          {points.map((pt) => (
            <li key={pt} className="flex items-start gap-2">
              <span aria-hidden className="mt-0.5 text-[var(--red)]">✦</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy}
          onClick={() => void start(type, productionId)}
          className={`mt-4 w-full text-center ${highlight ? "btn-primary" : "btn-ghost"} disabled:opacity-60`}
        >
          {busy ? "Starting…" : "Choose →"}
        </button>
      </article>
      {message && <p className="text-sm muted">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Update the three call sites**

`src/components/OrgBillingPanel.tsx`:
- Line 61: `"Pay per production"` → `"Pay Per Production"` in `planLabel`.
- Replace the card container (`<div className="space-y-2">` wrapping the two `PlanCard`s) with:

```tsx
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanCard
                type="unlock"
                name={PLANS.perProduction.label}
                price={PLANS.perProduction.price}
                cadence={PLANS.perProduction.cadence}
                points={PLANS.perProduction.points}
              />
              <PlanCard
                type="unlimited"
                name={PLANS.unlimited.label}
                price={PLANS.unlimited.price}
                cadence={PLANS.unlimited.cadence}
                points={PLANS.unlimited.points}
                highlight
              />
            </div>
```

`src/components/PlanLimitNotice.tsx` — same treatment for both branches:

```tsx
      {reason === "needs_seat" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanCard
            type="seat"
            productionId={productionId}
            name={PLANS.extraSeat.label}
            price={PLANS.extraSeat.price}
            cadence={PLANS.extraSeat.cadence}
            points={PLANS.extraSeat.points}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            cadence={PLANS.unlimited.cadence}
            points={PLANS.unlimited.points}
            highlight
          />
        </div>
      )}
      {(reason === "needs_paid_plan" || reason === "needs_unlock") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <PlanCard
            type="unlock"
            name={PLANS.perProduction.label}
            price={PLANS.perProduction.price}
            cadence={PLANS.perProduction.cadence}
            points={PLANS.perProduction.points}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            cadence={PLANS.unlimited.cadence}
            points={PLANS.unlimited.points}
            highlight
          />
        </div>
      )}
```

`src/app/(app)/productions/new/page.tsx`:
- Line 18: `max-w-md` → `max-w-2xl` (the side-by-side cards need the width).
- Replace the configured-branch container (`<div className="mb-4 space-y-3">` and its two `PlanCard`s) with:

```tsx
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <PlanCard
              type="unlock"
              name={PLANS.perProduction.label}
              price={PLANS.perProduction.price}
              cadence={PLANS.perProduction.cadence}
              points={PLANS.perProduction.points}
            />
            <PlanCard
              type="unlimited"
              name={PLANS.unlimited.label}
              price={PLANS.unlimited.price}
              cadence={PLANS.unlimited.cadence}
              points={PLANS.unlimited.points}
              highlight
            />
          </div>
```

- [ ] **Step 3: Verify — suite, lint, build**

Run: `npm test` → all green.
Run: `npm run lint` → no new errors.
Run: `npm run build` → compiles (this is the type-level test that no call site still passes `includes`).

- [ ] **Step 4: Commit**

```bash
git add src/components/PlanCard.tsx src/components/OrgBillingPanel.tsx src/components/PlanLimitNotice.tsx "src/app/(app)/productions/new/page.tsx"
git commit -m "feat(billing): in-app plan cards match landing pricing cards, side-by-side"
```

---

### Task 4: `photoUrl` on `InventoryRow` + pure `attachInventoryPhotoUrls`

**Files:**
- Modify: `src/lib/inventory-grouping.ts` (extend `InventoryRow`, add helper)
- Modify: `src/lib/inventory-grouping.test.ts` (add tests)

**Interfaces:**
- Consumes: nothing new (pure function).
- Produces: `InventoryRow.photoUrl?: string | null`; `attachInventoryPhotoUrls(items: InventoryRow[], pathsById: Record<string, string>, urlsByPath: Record<string, string>): InventoryRow[]`. Task 5's page composes it with the existing `firstImagePaths(itemIds)` (item id → earliest storage path) and `signImageUrls(paths)` (path → signed URL).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/inventory-grouping.test.ts` (the file's existing `row()` factory keeps working since `photoUrl` is optional; add `attachInventoryPhotoUrls` to the import from `@/lib/inventory-grouping`):

```ts
test("attachInventoryPhotoUrls maps each item's first-photo path to its signed url", () => {
  const out = attachInventoryPhotoUrls(
    [row({ id: "1", name: "Top hat" }), row({ id: "2", name: "Bowler" })],
    { "1": "inventory/1/a.jpg" },
    { "inventory/1/a.jpg": "https://signed.example/a.jpg" },
  );
  expect(out[0].photoUrl).toBe("https://signed.example/a.jpg");
  expect(out[1].photoUrl).toBeNull();
});

test("attachInventoryPhotoUrls: path with no signed url falls back to null", () => {
  const out = attachInventoryPhotoUrls(
    [row({ id: "1", name: "Top hat" })],
    { "1": "inventory/1/a.jpg" },
    {},
  );
  expect(out[0].photoUrl).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/inventory-grouping.test.ts`
Expected: FAIL — `attachInventoryPhotoUrls` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/inventory-grouping.ts`, add to `InventoryRow`:

```ts
  /** Signed URL of the item's first photo; null/absent when it has none. */
  photoUrl?: string | null;
```

And add at the bottom of the file:

```ts
// Attach each item's first-photo signed URL. The caller batches the lookups
// (one firstImagePaths + one signImageUrls call for the whole list).
export function attachInventoryPhotoUrls(
  items: InventoryRow[],
  pathsById: Record<string, string>,
  urlsByPath: Record<string, string>,
): InventoryRow[] {
  return items.map((item) => {
    const path = pathsById[item.id];
    return { ...item, photoUrl: (path && urlsByPath[path]) || null };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/inventory-grouping.test.ts` → PASS (existing tests + 2 new).
Then `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory-grouping.ts src/lib/inventory-grouping.test.ts
git commit -m "feat(inventory): attachInventoryPhotoUrls maps items to signed first-photo urls"
```

---

### Task 5: Inventory page wires photos; list becomes a photo tile grid

**Files:**
- Modify: `src/app/(app)/inventory/page.tsx`
- Modify: `src/components/InventoryManager.tsx` (list rendering only — the search box, add form, groups, and collapse logic stay)

**Interfaces:**
- Consumes: `attachInventoryPhotoUrls` (Task 4); existing `firstImagePaths` from `@/lib/data/inventory-item-images`; existing `signImageUrls` from `@/lib/storage` (7-day default expiry — do not pass a custom one); `InventoryRow.photoUrl`.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Wire photo URLs in the server page**

Replace the body of `src/app/(app)/inventory/page.tsx`'s data section:

```tsx
import { getAuthContext } from "@/lib/auth-context";
import { listInventoryItems } from "@/lib/data/inventory-items";
import { firstImagePaths } from "@/lib/data/inventory-item-images";
import { signImageUrls } from "@/lib/storage";
import { attachInventoryPhotoUrls } from "@/lib/inventory-grouping";
import { InventoryManager } from "@/components/InventoryManager";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { orgId } = await getAuthContext();
  const { item: focusItemId } = await searchParams;
  const items = await listInventoryItems(orgId);
  const pathsById = await firstImagePaths(items.map((i) => i.id));
  const urlsByPath = await signImageUrls(Object.values(pathsById));
  const rows = attachInventoryPhotoUrls(
    items.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      size: i.size,
      quantity: i.quantity,
      location: i.location,
      notes: i.notes,
    })),
    pathsById,
    urlsByPath,
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">House Inventory</h1>
        <p className="mt-1 text-sm muted">
          Your on-hand costume library. Photograph items here, then add them to a role from the Costume tab.
        </p>
      </div>
      <InventoryManager focusItemId={focusItemId} initialItems={rows} />
    </main>
  );
}
```

- [ ] **Step 2: Tile grid in `InventoryManager.tsx`**

Add `Fragment` to the React import (line 3):

```tsx
import { Fragment, useEffect, useMemo, useState } from "react";
```

Replace the item list block (the `{!isCollapsed && (<ul className="space-y-1.5">…</ul>)}` section, currently lines 177-205) with:

```tsx
            {!isCollapsed && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {group.items.map((item) => (
                  <Fragment key={item.id}>
                    <li id={`inv-item-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                        className={`surface !shadow-none block h-full w-full overflow-hidden text-left transition-colors hover:bg-[var(--bg)] ${
                          expandedId === item.id ? "ring-2 ring-[var(--red)]" : ""
                        }`}
                      >
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photoUrl} alt="" className="aspect-square w-full object-cover" />
                        ) : (
                          <span className="flex aspect-square w-full items-center justify-center bg-[#8c2b22]/10 text-[var(--red)]">
                            <GarmentIcon />
                          </span>
                        )}
                        <span className="block p-2">
                          <span className="block truncate text-sm font-medium">{item.name}</span>
                          <span className="block text-xs muted">
                            {[item.size, `×${item.quantity}`].filter(Boolean).join(" · ") || " "}
                          </span>
                        </span>
                      </button>
                    </li>
                    {expandedId === item.id && (
                      <li className="col-span-full">
                        <InventoryItemDetail
                          item={item}
                          busy={busy}
                          onChange={(patch) => updateItem(item.id, patch)}
                          onRemove={() => remove(item.id)}
                        />
                      </li>
                    )}
                  </Fragment>
                ))}
              </ul>
            )}
```

Notes on intent: `alt=""` because the name sits right below the image; the `" "` fallback keeps tile heights even when an item has no size (every tile renders the meta line); the ring marks the tile whose editor is open; the `col-span-full` `li` puts the editor full-width directly after the tile's row, so the grid flow isn't broken.

Add the placeholder icon component at the bottom of the file (matches the feather style used in `LandingPage.tsx`: 24×24 viewBox, `strokeWidth 1.75`):

```tsx
// Placeholder for items with no photo yet: a simple garment outline.
function GarmentIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m8 3-4 3 2 4 2-1v9h8v-9l2 1 2-4-4-3a4 4 0 0 1-8 0Z" />
    </svg>
  );
}
```

Leave everything else in the component untouched — search, category collapse headers (`lbl` labels stay), the add form, `justAddedId` flow, and the deep-link `focusItemId` effect (the `li` keeps its `inv-item-<id>` id, so `scrollIntoView` still works).

- [ ] **Step 3: Verify — suite, lint, build**

Run: `npm test` → all green.
Run: `npm run lint` → no new errors.
Run: `npm run build` → compiles.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/inventory/page.tsx" src/components/InventoryManager.tsx
git commit -m "feat(inventory): photo-first tile grid with category groups kept"
```

---

### Task 6: End-to-end verification

**Files:** none created; read-only checks.

**Interfaces:** n/a.

- [ ] **Step 1: Full suite + lint + production build**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass.

- [ ] **Step 2: Landing page smoke (public, server-rendered)**

```bash
npm run dev &
sleep 8
curl -s http://localhost:3000/ -H "User-Agent: smoke" > /tmp/landing.html
grep -c "Automatic Fabric Estimates" /tmp/landing.html   # expect ≥ 1
grep -c "Everything a Production Needs, in One Place" /tmp/landing.html  # expect ≥ 1
grep -c "Pay Per Production" /tmp/landing.html            # expect ≥ 1
grep -oE "\bAI\b" /tmp/landing.html | head               # expect no output
kill %1
```

Note: the landing page renders only for logged-out visitors; curl has no Clerk cookie, so `/` serves the landing. If port 3000 is busy, use the port Next reports. Use the scratchpad dir instead of /tmp if sandboxing blocks it.

- [ ] **Step 3: Report what needs a human eye**

The authed pages can't be smoke-tested without a Clerk session. Flag for Chris's browser pass:
- `/inventory` — tile grid, placeholders, expand-to-edit, deep-link `?item=` focus
- Org settings billing tab + `/productions/new` gate — side-by-side landing-style cards, "Choose →" starts checkout
- No commit in this task.
