# Clickable Plan Cards — Design

**Date:** 2026-06-18
**Status:** Approved (brainstorm).

## Goal

Replace the "plan info, then a separate Buy button" pattern in the in-app purchase prompts with **clickable plan cards**: each card shows the plan's name/price/what's included and *is itself* the buy action (click → Stripe Checkout). Applies to the **New Production subscribe gate** and the **402 upgrade prompts** (`PlanLimitNotice`). The org "Plan & billing" tab is out of scope (stays as-is).

Today (`/productions/new` gate) shows each plan as a non-interactive `surface` list item AND repeats them as separate `CheckoutButton`s ("Buy this production — $49.99" / "Go Unlimited — $99.99/yr"); `PlanLimitNotice` shows a message + `CheckoutButton`s. This unifies card + button.

## Decisions (from brainstorming)

- Scope = New Production gate + `PlanLimitNotice`; **not** the org billing tab.
- Each card is a real `<button>` (keyboard-accessible), not a `div` with onClick.
- DRY: extract the checkout-start logic into a shared hook used by both the new card and the existing button.
- No billing/route change — reuses the shipped `POST /api/billing/checkout`.

## Architecture

### 1. `src/lib/use-checkout.ts` (client hook)
Extracts the logic currently inside `CheckoutButton.go()`:
```ts
"use client";
import { useState } from "react";
import type { CheckoutType } from "@/lib/stripe"; // "unlock" | "seat" | "unlimited"

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
      if (res.status === 503) { setMessage("Checkout isn't set up yet."); return; }
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
> `CheckoutType` is already exported from `@/lib/stripe`.

### 2. `src/components/PlanCard.tsx` (client)
A clickable card. Props `{ type: CheckoutType; productionId?: string; name: string; price: string; includes: string; highlight?: boolean }`.
- Renders a `<button type="button">` styled as a `surface` card: top row `name` (left) + `price` (right, muted), an `includes` line, and a footer affordance (`Starting…` while busy, else `Choose →` in `link-red`).
- `onClick` → `start(type, productionId)` from `useCheckout()`. `disabled={busy}`; `disabled:opacity-60`; `hover:-translate-y-0.5` like other surface cards.
- Below the button: `{message && <p className="text-sm muted">{message}</p>}` (the hook's 503/error message). Each card owns its own hook instance, so busy/message are per-card.
- `highlight` (Unlimited) adds `ring-2 ring-[var(--red)]` (matches the landing's highlighted tier), optional.

### 3. `src/components/CheckoutButton.tsx` (refactor, no behavior change)
Replace its internal `useState`/`go()` with `useCheckout()`: render `<button onClick={() => void start(type, productionId)} disabled={busy}>{busy ? "Starting…" : label}</button>` + `{message && …}`. Same public props `{ type, productionId?, label, className? }`. Keeps the org billing tab's "Go Unlimited" working unchanged.

### 4. New Production gate (`src/app/(app)/productions/new/page.tsx`)
In the `!gate.allowed` branch, replace the plan `<ul>` and the `<div className="flex … gap-3">` CheckoutButton block with:
- When `isBillingConfigured()`: two `<PlanCard>`s in a `space-y-3` stack —
  - `<PlanCard type="unlock" name={PLANS.perProduction.label} price={PLANS.perProduction.price} includes={PLANS.perProduction.includes} />`
  - `<PlanCard type="unlimited" name={PLANS.unlimited.label} price={PLANS.unlimited.price} includes={PLANS.unlimited.includes} highlight />`
- When not configured: keep today's disabled "Subscribe — coming soon" text.
- Keep the `Subscribe to add a production` heading, the intro `<p>`, and the `Back` link (`/productions`).

### 5. `src/components/PlanLimitNotice.tsx`
Keep the `message` line on top. Replace the `CheckoutButton` groups with `PlanCard`s (imported `PLANS` from `@/lib/billing-plans`):
- `reason === "needs_seat"` → `<PlanCard type="seat" productionId={productionId} name={PLANS.extraSeat.label} price={PLANS.extraSeat.price} includes={PLANS.extraSeat.includes} />` + Unlimited card (`highlight`).
- `reason === "needs_paid_plan" | "needs_unlock"` → Pay-per-production card (`type="unlock"`, from `PLANS.perProduction`) + Unlimited card (`highlight`).
- No `reason` → unchanged ("Online checkout is coming soon." note).
Cards stack `space-y-2` inside the existing `surface` notice container.

### 6. Out of scope
`OrgBillingPanel` (the "Plan & billing" tab) keeps its status panel + "Go Unlimited" `CheckoutButton` + "Manage billing". No changes to `POST /api/billing/checkout` or any billing route/data.

## Data

Card display strings come from `PLANS` (`src/lib/billing-plans.ts`): `perProduction {label, price, includes}`, `extraSeat {label, price, includes}`, `unlimited {label, price, includes}` — already present and recently updated ($99.99/yr). No new data.

## Error / edge handling

- 503 (billing not configured): the gate shows "coming soon" (server-gated on `isBillingConfigured()`); a `PlanCard` that does reach a 503 shows "Checkout isn't set up yet." inline.
- Checkout error / network failure: inline "Couldn't start checkout." under the clicked card; card re-enables.
- Double-click: `disabled={busy}` prevents a second POST mid-flight.

## Testing

`npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors), and a manual click-through (gate card → Stripe Checkout; a 402 prompt card → Checkout). No new unit tests — `PlanCard`/`useCheckout`/`CheckoutButton` are thin client wrappers over the already-tested `POST /api/billing/checkout`; consistent with how `CheckoutButton` shipped (no unit test). The full suite must stay green (no regressions from the `CheckoutButton` refactor).

## Out of scope

Any change to checkout/webhook/billing data; the org billing tab; quantity selection; the landing pricing cards (those link to `/sign-up`, not checkout — logged-out).
