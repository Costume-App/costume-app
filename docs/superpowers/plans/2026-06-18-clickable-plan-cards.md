# Clickable Plan Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make in-app purchase prompts use clickable price cards (card = the buy action) instead of plan-info-then-separate-button, on the New Production gate and the 402 `PlanLimitNotice`.

**Architecture:** Extract the checkout-start logic into a shared `useCheckout()` client hook; build a clickable `<PlanCard>` (`<button>` styled as a price card) on top of it; refactor the existing `CheckoutButton` onto the same hook (no behavior change); swap `PlanCard`s into the gate and `PlanLimitNotice`. No billing-route/data changes.

**Tech Stack:** Next.js 16 (App Router, client components), TypeScript strict, Tailwind (Atelier tokens), Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-clickable-plan-cards-design.md`. Scope = New Production gate + `PlanLimitNotice`; org "Plan & billing" tab (`OrgBillingPanel`) is OUT of scope (unchanged). No change to `POST /api/billing/checkout` or any billing route/data.
- Cards are real `<button>`s (keyboard-accessible), not clickable `div`s.
- Card display strings come from `PLANS` in `src/lib/billing-plans.ts` (`perProduction`/`extraSeat`/`unlimited`, each `{label, price, includes}`). No new data.
- `CheckoutType` (`"unlock" | "seat" | "unlimited"`) is exported from `@/lib/stripe`.
- Checkout-start behavior (preserved verbatim in the hook): POST `/api/billing/checkout {type, productionId}` with `credentials:"include"`; `res.status === 503` → message "Checkout isn't set up yet."; other non-ok → `data.error ?? "Couldn't start checkout."`; ok → `window.location.href = url`; throw → "Couldn't start checkout."; `busy` guards double-submit.
- No new unit tests (thin client wrappers over the already-tested checkout route; consistent with how `CheckoutButton` shipped). Verify each task with `npx tsc --noEmit`, and the final task with `npm run build` + `npm run lint` (0 errors) + full `npx vitest run` (no regressions). Local commits only — no push. Needs a deploy to reach prod.

---

### Task 1: `useCheckout` hook + `PlanCard`, and refactor `CheckoutButton` onto the hook

**Files:**
- Create: `src/lib/use-checkout.ts`
- Create: `src/components/PlanCard.tsx`
- Modify: `src/components/CheckoutButton.tsx`

**Interfaces:**
- Produces: `useCheckout(): { busy: boolean; message: string | null; start(type: CheckoutType, productionId?: string): Promise<void> }`; `<PlanCard type productionId? name price includes highlight? />`.
- Consumes: `CheckoutType` from `@/lib/stripe`.

- [ ] **Step 1: Create the shared hook**

Create `src/lib/use-checkout.ts`:

```ts
"use client";

import { useState } from "react";
import type { CheckoutType } from "@/lib/stripe";

// Shared checkout-start logic: POST the checkout route, redirect to Stripe, and
// surface a graceful message on a 503 (not configured) / error / network failure.
export function useCheckout() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start(type: CheckoutType, productionId?: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, productionId }),
      });
      if (res.status === 503) {
        setMessage("Checkout isn't set up yet.");
        return;
      }
      if (!res.ok) {
        setMessage(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't start checkout.");
        return;
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setMessage("Couldn't start checkout.");
    } finally {
      setBusy(false);
    }
  }

  return { busy, message, start };
}
```

- [ ] **Step 2: Create `PlanCard`**

Create `src/components/PlanCard.tsx`:

```tsx
"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

// A clickable price card: the whole card is the buy action (→ Stripe Checkout).
export function PlanCard({
  type,
  productionId,
  name,
  price,
  includes,
  highlight,
}: {
  type: CheckoutType;
  productionId?: string;
  name: string;
  price: string;
  includes: string;
  highlight?: boolean;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void start(type, productionId)}
        className={`surface block w-full p-4 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${
          highlight ? "ring-2 ring-[var(--red)]" : ""
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium">{name}</span>
          <span className="text-sm muted">{price}</span>
        </div>
        <span className="text-sm muted">{includes}</span>
        <span className="link-red mt-2 block text-sm">{busy ? "Starting…" : "Choose →"}</span>
      </button>
      {message && <p className="text-sm muted">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Refactor `CheckoutButton` onto the hook**

Replace the contents of `src/components/CheckoutButton.tsx` with (same public props/behavior, now using the hook):

```tsx
"use client";

import type { CheckoutType } from "@/lib/stripe";
import { useCheckout } from "@/lib/use-checkout";

export function CheckoutButton({
  type,
  productionId,
  label,
  className,
}: {
  type: CheckoutType;
  productionId?: string;
  label: string;
  className?: string;
}) {
  const { busy, message, start } = useCheckout();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start(type, productionId)}
        className={className ?? "btn-primary"}
      >
        {busy ? "Starting…" : label}
      </button>
      {message && <p className="text-sm muted">{message}</p>}
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: clean. (`CheckoutButton`'s public API is unchanged, so `OrgBillingPanel`/gate/notice still compile.)

Run: `npx vitest run`
Expected: full suite passes (no regressions — no test referenced `CheckoutButton` internals).

- [ ] **Step 5: Commit**

```bash
git add src/lib/use-checkout.ts src/components/PlanCard.tsx src/components/CheckoutButton.tsx
git commit -m "feat(billing): useCheckout hook + clickable PlanCard; CheckoutButton uses the hook"
```

---

### Task 2: Use `PlanCard` on the New Production gate

**Files:**
- Modify: `src/app/(app)/productions/new/page.tsx`

**Interfaces:**
- Consumes: `<PlanCard>` (Task 1); `PLANS` from `@/lib/billing-plans`; `isBillingConfigured` from `@/lib/stripe`.

- [ ] **Step 1: Swap the plan list + buttons for cards**

In `src/app/(app)/productions/new/page.tsx`:

- Update imports: remove `import { CheckoutButton } from "@/components/CheckoutButton";`; add `import { PlanCard } from "@/components/PlanCard";`. Keep `PLANS`, `isBillingConfigured`, `Link`.

- In the `!gate.allowed` branch, replace BOTH the plan `<ul>…</ul>` block AND the `<div className="flex flex-wrap gap-3">…</div>` button block with this single block (keep the surrounding `<main>`, the `<h1>Subscribe to add a production</h1>`, and the intro `<p>`):

```tsx
        {isBillingConfigured() ? (
          <div className="mb-4 space-y-3">
            <PlanCard
              type="unlock"
              name={PLANS.perProduction.label}
              price={PLANS.perProduction.price}
              includes={PLANS.perProduction.includes}
            />
            <PlanCard
              type="unlimited"
              name={PLANS.unlimited.label}
              price={PLANS.unlimited.price}
              includes={PLANS.unlimited.includes}
              highlight
            />
          </div>
        ) : (
          <ul className="mb-4 space-y-2">
            {[PLANS.perProduction, PLANS.unlimited].map((plan) => (
              <li key={plan.id} className="surface p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{plan.label}</span>
                  <span className="text-sm muted">{plan.price}</span>
                </div>
                <span className="text-sm muted">{plan.includes}</span>
              </li>
            ))}
            <li className="muted text-sm">Online checkout is coming soon.</li>
          </ul>
        )}
        <div>
          <Link href="/productions" className="btn-ghost">
            Back
          </Link>
        </div>
```

> When billing is configured: two clickable cards (no separate buttons). When not configured: the static plan list + a "coming soon" note (preserves the prior unconfigured experience). The `Back` link remains in all cases. Remove the now-unused standalone `<p>{isBillingConfigured() ? "Choose a plan to continue." : "Online checkout is coming soon."}</p>` line.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean (no remaining `CheckoutButton` reference in this file).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/productions/new/page.tsx"
git commit -m "feat(billing): clickable plan cards on the New Production gate"
```

---

### Task 3: Use `PlanCard` in `PlanLimitNotice` + full verify

**Files:**
- Modify: `src/components/PlanLimitNotice.tsx`

**Interfaces:**
- Consumes: `<PlanCard>` (Task 1); `PLANS` from `@/lib/billing-plans`.

- [ ] **Step 1: Swap the CheckoutButtons for cards**

Replace the contents of `src/components/PlanLimitNotice.tsx` with:

```tsx
"use client";

import { PlanCard } from "@/components/PlanCard";
import { PLANS } from "@/lib/billing-plans";

// Friendly subscribe-style prompt shown when an action is blocked by the org's
// plan (an HTTP 402). With a `reason`, it offers clickable plan cards; without
// one it falls back to the message + a "coming soon" note.
export function PlanLimitNotice({
  message,
  reason,
  productionId,
}: {
  message: string;
  reason?: "needs_unlock" | "needs_seat" | "needs_paid_plan";
  productionId?: string;
}) {
  return (
    <div className="surface space-y-2 p-3 text-sm">
      <p className="font-medium">{message}</p>
      {!reason && <p className="muted">Online checkout is coming soon.</p>}
      {reason === "needs_seat" && (
        <div className="space-y-2">
          <PlanCard
            type="seat"
            productionId={productionId}
            name={PLANS.extraSeat.label}
            price={PLANS.extraSeat.price}
            includes={PLANS.extraSeat.includes}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            includes={PLANS.unlimited.includes}
            highlight
          />
        </div>
      )}
      {(reason === "needs_paid_plan" || reason === "needs_unlock") && (
        <div className="space-y-2">
          <PlanCard
            type="unlock"
            name={PLANS.perProduction.label}
            price={PLANS.perProduction.price}
            includes={PLANS.perProduction.includes}
          />
          <PlanCard
            type="unlimited"
            name={PLANS.unlimited.label}
            price={PLANS.unlimited.price}
            includes={PLANS.unlimited.includes}
            highlight
          />
        </div>
      )}
    </div>
  );
}
```

> Props (`message`, `reason`, `productionId`) are unchanged, so the callers (`SharePanel`, `MakePieceRow`, `RoleCostumePanel`) need no edits.

- [ ] **Step 2: Full verify**

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx vitest run`
Expected: full suite passes (no regressions).

Run: `npm run lint && npm run build`
Expected: lint 0 errors; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/PlanLimitNotice.tsx
git commit -m "feat(billing): clickable plan cards in PlanLimitNotice (seat/unlock/unlimited)"
```

---

## Self-Review

**Spec coverage:**
- `useCheckout` hook (extracted logic) → Task 1. ✓
- `PlanCard` clickable card (`<button>`, name/price/includes, highlight, inline message) → Task 1. ✓
- `CheckoutButton` refactored onto the hook, public API unchanged → Task 1. ✓
- New Production gate uses PlanCards (configured) / keeps coming-soon (unconfigured) + Back link → Task 2. ✓
- `PlanLimitNotice` uses PlanCards per reason; no-reason fallback kept; props unchanged → Task 3. ✓
- Org billing tab untouched; no billing-route change → not modified. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full content.

**Type consistency:** `useCheckout().start(type: CheckoutType, productionId?)` consumed by both `PlanCard` and `CheckoutButton` (Task 1). `PlanCard` props `{type, productionId?, name, price, includes, highlight?}` match all call sites (Tasks 2, 3). `PLANS.{perProduction,extraSeat,unlimited}.{label,price,includes}` are the fields used. `PlanLimitNotice` keeps its `{message, reason, productionId}` props, so its callers are unaffected.
