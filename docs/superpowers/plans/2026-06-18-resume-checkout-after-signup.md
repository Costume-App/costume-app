# Resume Checkout After Signup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember the plan a logged-out visitor clicks on the landing pricing section, carry it through sign-up + org creation, and resume Stripe Checkout automatically once they have an org.

**Architecture:** A one-shot `checkout_intent` cookie (`"unlock"|"unlimited"`) set by `GET /get-started`; middleware redirects to `/billing/resume` once a signed-in user has an org and the cookie is present; `/billing/resume` clears the cookie and sends them to Stripe via a shared `createCheckoutSession` extracted from the checkout route.

**Tech Stack:** Next.js 16 (App Router route handlers + Clerk middleware in `proxy.ts`), TypeScript strict, Stripe, Vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-18-resume-checkout-after-signup-design.md`. No change to the checkout/webhook/return contract.
- Cookie `checkout_intent` ∈ `{"unlock","unlimited"}`: `httpOnly`, `sameSite:"lax"`, `path:"/"`, `maxAge:3600`, `secure: process.env.NODE_ENV === "production"` (so it works on local http too).
- `/get-started` and the webhook are the only new public matcher entries; `/billing/resume` stays protected (needs auth+org).
- Middleware resumes only when the user **has an `orgId`**, the cookie is present, and the path is **not** under `/billing` (prevents a loop with `/billing/return` and `/billing/resume`).
- `/billing/resume` is a **route handler** (cookies can only be mutated in route handlers/middleware, not server-component render); it **always clears the cookie** (one-shot); on missing/invalid plan, no org, `!isBillingConfigured()`, or any error → redirect `/productions`.
- `createCheckoutSession({orgId, type, productionId?, origin})` is the single source of truth for building a Checkout session; `POST /api/billing/checkout` and `/billing/resume` both use it. Behavior unchanged from today's inline route logic (mode payment/subscription, `PRICE_IDS[type]`, metadata `{orgId,type,productionId?}`, `subscription_data.metadata.orgId` for unlimited, success/cancel URLs from `origin`).
- `CheckoutType` (`"unlock"|"seat"|"unlimited"`), `PRICE_IDS`, `getStripe`, `isBillingConfigured` are exported from `@/lib/stripe`.
- Repo test patterns: route tests mock `@clerk/nextjs/server`, `@/lib/stripe`, `@/lib/data/*` (see `src/app/api/billing/checkout/route.test.ts`, `src/lib/data/stripe-billing.test.ts`). Commands: `npx vitest run <path>`, `npx vitest run`, `npx tsc --noEmit`, `npm run build`, `npm run lint` (0 errors). Local commits only; needs a deploy + the live `STRIPE_*` env to actually reach Stripe (else `/billing/resume` lands the user in `/productions`).

---

### Task 1: Extract `createCheckoutSession`; refactor the checkout route

**Files:**
- Modify: `src/lib/data/stripe-billing.ts`
- Modify: `src/lib/data/stripe-billing.test.ts`
- Modify: `src/app/api/billing/checkout/route.ts`
- Modify: `src/app/api/billing/checkout/route.test.ts`

**Interfaces:**
- Produces: `createCheckoutSession(input: { orgId: string; type: CheckoutType; productionId?: string; origin: string }): Promise<string>` (returns the Checkout session URL).
- Consumes: `getOrCreateStripeCustomer` (same module), `getStripe`, `PRICE_IDS` from `@/lib/stripe`.

- [ ] **Step 1: Write the failing `createCheckoutSession` tests**

In `src/lib/data/stripe-billing.test.ts`: (a) extend the `@/lib/stripe` mock to expose `PRICE_IDS`, and add `checkout.sessions.create` to `stripeMock`; (b) reset that 3-level mock in `beforeEach`; (c) add the tests.

Update the stripe mock block:
```ts
const stripeMock = {
  customers: { create: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
};
vi.mock("@/lib/stripe", () => ({
  isBillingConfigured: () => billingConfigured,
  getStripe: () => stripeMock,
  PRICE_IDS: { unlock: "price_unlock", seat: "price_seat", unlimited: "price_unlimited" },
}));
```
In `beforeEach`, after the existing resets, add:
```ts
  stripeMock.checkout.sessions.create.mockReset();
```
Add the import + tests:
```ts
import { getOrCreateStripeCustomer, fulfillCheckoutSession, createCheckoutSession } from "@/lib/data/stripe-billing";

test("createCheckoutSession builds a one-time payment session for unlock and returns the url", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/x" });
  const url = await createCheckoutSession({ orgId: "orgA", type: "unlock", origin: "https://app" });
  expect(url).toBe("https://stripe/x");
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "payment", customer: "cus_1", metadata: { orgId: "orgA", type: "unlock" } });
  expect(params.line_items).toEqual([{ price: "price_unlock", quantity: 1 }]);
  expect(params.success_url).toBe("https://app/billing/return?session_id={CHECKOUT_SESSION_ID}");
  expect(params.cancel_url).toBe("https://app/productions");
});

test("createCheckoutSession uses subscription mode + metadata for unlimited", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/y" });
  await createCheckoutSession({ orgId: "orgA", type: "unlimited", origin: "https://app" });
  const params = stripeMock.checkout.sessions.create.mock.calls[0][0];
  expect(params).toMatchObject({ mode: "subscription", subscription_data: { metadata: { orgId: "orgA" } } });
  expect(params.line_items).toEqual([{ price: "price_unlimited", quantity: 1 }]);
});

test("createCheckoutSession passes productionId metadata for a seat", async () => {
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: { stripe_customer_id: "cus_1" }, error: null }));
  stripeMock.checkout.sessions.create.mockResolvedValue({ url: "https://stripe/z" });
  await createCheckoutSession({ orgId: "orgA", type: "seat", productionId: "prod1", origin: "https://app" });
  expect(stripeMock.checkout.sessions.create.mock.calls[0][0].metadata).toEqual({ orgId: "orgA", type: "seat", productionId: "prod1" });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: FAIL — `createCheckoutSession` not exported.

- [ ] **Step 3: Implement `createCheckoutSession`**

In `src/lib/data/stripe-billing.ts`, update the `@/lib/stripe` import to include `PRICE_IDS` + the `CheckoutType` type, and append the function:
```ts
import { getStripe, PRICE_IDS, type CheckoutType } from "@/lib/stripe";
```
```ts
// Single source of truth for building a Stripe Checkout session. Used by the
// checkout route and by /billing/resume.
export async function createCheckoutSession(input: {
  orgId: string;
  type: CheckoutType;
  productionId?: string;
  origin: string;
}): Promise<string> {
  const { orgId, type, productionId, origin } = input;
  const customer = await getOrCreateStripeCustomer(orgId);
  const session = await getStripe().checkout.sessions.create({
    mode: type === "unlimited" ? "subscription" : "payment",
    customer,
    line_items: [{ price: PRICE_IDS[type], quantity: 1 }],
    metadata: { orgId, type, ...(productionId ? { productionId } : {}) },
    ...(type === "unlimited" ? { subscription_data: { metadata: { orgId } } } : {}),
    success_url: `${origin}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/productions`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts`
Expected: PASS (existing + 3 new).

- [ ] **Step 5: Refactor the checkout route to delegate**

Replace `src/app/api/billing/checkout/route.ts` body so it calls `createCheckoutSession` (keeping auth / 503 / type-validation / seat `assertProductionInOrg`):
```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { ValidationError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isBillingConfigured, type CheckoutType } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/data/stripe-billing";

export async function POST(request: Request) {
  try {
    const { orgId } = await getAuthContext();
    if (!isBillingConfigured()) {
      return NextResponse.json({ error: "Billing isn't set up yet" }, { status: 503 });
    }
    const body = (await request.json().catch(() => ({}))) as { type?: string; productionId?: string };
    const type = body.type as CheckoutType;
    if (type !== "unlock" && type !== "seat" && type !== "unlimited") {
      throw new ValidationError("Invalid checkout type");
    }
    if (type === "seat") {
      if (!body.productionId) throw new ValidationError("productionId is required for a seat");
      await assertProductionInOrg(orgId, body.productionId);
    }
    const url = await createCheckoutSession({
      orgId,
      type,
      productionId: body.productionId,
      origin: new URL(request.url).origin,
    });
    return NextResponse.json({ url });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Update the checkout route test to assert delegation**

In `src/app/api/billing/checkout/route.test.ts`: replace the `@/lib/data/stripe-billing` mock (`getOrCreateStripeCustomer`) with a `createCheckoutSession` mock, drop the now-unused `stripeMock.checkout.sessions.create` param assertions (those moved to the unit test), and assert the route delegates. Key changes:
```ts
const createCheckoutSession = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a) }));
```
In `beforeEach`: `createCheckoutSession.mockReset(); createCheckoutSession.mockResolvedValue("https://stripe/checkout");` (remove the `getOrCreateStripeCustomer` default + the `stripeMock.checkout.sessions.create` default). Update the assertions:
- "503 when not configured": unchanged; also `expect(createCheckoutSession).not.toHaveBeenCalled()`.
- "creates a session for unlock": `const res = await POST(req({type:"unlock"}));` → `expect(res.status).toBe(200); expect(await res.json()).toEqual({ url: "https://stripe/checkout" }); expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ orgId: "orgA", type: "unlock", origin: "https://www.measuremycostume.com" }));`
- "unlimited": `expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ type: "unlimited" }))`.
- "seat requires productionId + validates org": first call (no productionId) → 400 and `createCheckoutSession` not called; with productionId → `assertProductionInOrg("orgA","prod1")` called and `createCheckoutSession` called with `objectContaining({ type:"seat", productionId:"prod1" })`.
- "invalid type → 400": unchanged.

- [ ] **Step 7: Run both test files**

Run: `npx vitest run src/lib/data/stripe-billing.test.ts src/app/api/billing/checkout/route.test.ts`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/stripe-billing.ts src/lib/data/stripe-billing.test.ts "src/app/api/billing/checkout/route.ts" "src/app/api/billing/checkout/route.test.ts"
git commit -m "refactor(billing): extract createCheckoutSession; checkout route delegates"
```

---

### Task 2: `GET /get-started` (set intent cookie) + make it public

**Files:**
- Create: `src/app/get-started/route.ts`
- Create: `src/app/get-started/route.test.ts`
- Modify: `src/proxy.ts` (add `/get-started` to `isPublic`)

**Interfaces:**
- Produces: `GET /get-started?plan=…` → 307 redirect to `/sign-up`, setting `checkout_intent` cookie when `plan` ∈ `{unlock,unlimited}`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/get-started/route.test.ts`:
```ts
import { expect, test } from "vitest";
import { GET } from "@/app/get-started/route";

const req = (qs: string) => new Request(`https://www.measuremycostume.com/get-started${qs}`);

test("sets the checkout_intent cookie for a valid plan and redirects to sign-up", async () => {
  const res = await GET(req("?plan=unlimited"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/sign-up");
  expect(res.cookies.get("checkout_intent")?.value).toBe("unlimited");
});

test("redirects without a cookie for a missing/invalid plan", async () => {
  const res = await GET(req("?plan=bogus"));
  expect(res.status).toBe(307);
  expect(res.cookies.get("checkout_intent")).toBeUndefined();
  const none = await GET(req(""));
  expect(none.cookies.get("checkout_intent")).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/get-started/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `src/app/get-started/route.ts`:
```ts
import { NextResponse } from "next/server";

const VALID = new Set(["unlock", "unlimited"]);

// Landing pricing cards link here. Remember the chosen plan in a one-shot cookie,
// then send the visitor to sign-up; /billing/resume picks it up once they have an org.
export async function GET(request: Request) {
  const plan = new URL(request.url).searchParams.get("plan");
  const res = NextResponse.redirect(new URL("/sign-up", request.url));
  if (plan && VALID.has(plan)) {
    res.cookies.set("checkout_intent", plan, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  }
  return res;
}
```

- [ ] **Step 4: Make it public in `proxy.ts`**

Change the `isPublic` matcher to include `/get-started`:
```ts
const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/get-started", "/api/billing/webhook"]);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/app/get-started/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/get-started/route.ts src/app/get-started/route.test.ts src/proxy.ts
git commit -m "feat(billing): GET /get-started sets the checkout-intent cookie (public)"
```

---

### Task 3: `GET /billing/resume` (resume into Stripe)

**Files:**
- Create: `src/app/billing/resume/route.ts`
- Create: `src/app/billing/resume/route.test.ts`

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server`; `isBillingConfigured` from `@/lib/stripe`; `createCheckoutSession` from `@/lib/data/stripe-billing`.
- Produces: `GET /billing/resume` → redirect to Stripe (cookie cleared) on a valid resumable intent, else redirect `/productions` (cookie cleared).

- [ ] **Step 1: Write the failing tests**

Create `src/app/billing/resume/route.test.ts`:
```ts
import { expect, test, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
let billingConfigured = true;
vi.mock("@/lib/stripe", () => ({ isBillingConfigured: () => billingConfigured }));
const createCheckoutSession = vi.fn();
vi.mock("@/lib/data/stripe-billing", () => ({ createCheckoutSession: (...a: unknown[]) => createCheckoutSession(...a) }));

import { GET } from "@/app/billing/resume/route";

beforeEach(() => {
  billingConfigured = true;
  authMock.mockReset();
  createCheckoutSession.mockReset();
  authMock.mockResolvedValue({ orgId: "orgA" });
  createCheckoutSession.mockResolvedValue("https://stripe/checkout");
});

function reqWith(cookie?: string) {
  const r = new NextRequest("https://www.measuremycostume.com/billing/resume");
  if (cookie) r.cookies.set("checkout_intent", cookie);
  return r;
}

test("no cookie → redirect to /productions, no checkout", async () => {
  const res = await GET(reqWith());
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});

test("valid intent + configured → creates a session and redirects to Stripe, clears cookie", async () => {
  const res = await GET(reqWith("unlimited"));
  expect(createCheckoutSession).toHaveBeenCalledWith(
    expect.objectContaining({ orgId: "orgA", type: "unlimited", origin: "https://www.measuremycostume.com" }),
  );
  expect(res.headers.get("location")).toBe("https://stripe/checkout");
  // cookie cleared (maxAge 0 / empty value)
  expect(res.cookies.get("checkout_intent")?.value).toBe("");
});

test("billing not configured → /productions, no checkout", async () => {
  billingConfigured = false;
  const res = await GET(reqWith("unlimited"));
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});

test("invalid plan value → /productions, no checkout", async () => {
  const res = await GET(reqWith("bogus"));
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/productions");
  expect(createCheckoutSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/billing/resume/route.test.ts"`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `src/app/billing/resume/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isBillingConfigured, type CheckoutType } from "@/lib/stripe";
import { createCheckoutSession } from "@/lib/data/stripe-billing";

// Resume a checkout the visitor started from the landing (carried in a one-shot
// cookie), now that they have an org. Always clears the cookie. Any miss → app.
export async function GET(request: NextRequest) {
  const toApp = () => {
    const res = NextResponse.redirect(new URL("/productions", request.url));
    res.cookies.delete("checkout_intent");
    return res;
  };

  const plan = request.cookies.get("checkout_intent")?.value;
  if (!plan || (plan !== "unlock" && plan !== "unlimited") || !isBillingConfigured()) {
    return toApp();
  }
  try {
    const { orgId } = await auth();
    if (!orgId) return toApp();
    const url = await createCheckoutSession({
      orgId,
      type: plan as CheckoutType,
      origin: new URL(request.url).origin,
    });
    const res = NextResponse.redirect(url);
    res.cookies.delete("checkout_intent");
    return res;
  } catch (e) {
    console.error("billing resume failed:", e);
    return toApp();
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run "src/app/billing/resume/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/billing/resume/route.ts" "src/app/billing/resume/route.test.ts"
git commit -m "feat(billing): GET /billing/resume resumes checkout from the intent cookie"
```

---

### Task 4: Middleware resume trigger + landing card wiring

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/components/landing/landing-content.ts`
- Modify: `src/components/landing/LandingPage.tsx`

**Interfaces:**
- Consumes: the `checkout_intent` cookie (set in Task 2), `/billing/resume` (Task 3).

- [ ] **Step 1: Add the middleware resume trigger**

In `src/proxy.ts`, after the `orgGate` redirect handling (i.e., the user is signed in and allowed), before the function returns, add:
```ts
  // Resume a checkout started from the landing once the user has an org. Skip
  // /billing/* to avoid looping with /billing/resume and /billing/return.
  if (orgId && req.cookies.get("checkout_intent") && !req.nextUrl.pathname.startsWith("/billing")) {
    return NextResponse.redirect(new URL("/billing/resume", req.url));
  }
```
(`orgId` is already destructured above from `await auth()`.)

- [ ] **Step 2: Add `checkoutType` to the pricing tiers**

In `src/components/landing/landing-content.ts`, add `checkoutType` to the `PricingTier` interface and each tier:
```ts
export interface PricingTier {
  name: string;
  price: string;
  cadence: string;
  points: string[];
  highlight?: boolean;
  checkoutType: "unlock" | "unlimited";
}
```
- Pay-per-production tier: add `checkoutType: "unlock",`
- Unlimited tier: add `checkoutType: "unlimited",`

- [ ] **Step 3: Point the pricing-card CTA at `/get-started`**

In `src/components/landing/LandingPage.tsx`, change the pricing-card CTA link from `href="/sign-up"` to:
```tsx
              <Link
                href={`/get-started?plan=${tier.checkoutType}`}
                className={`mt-6 text-center ${tier.highlight ? "btn-primary" : "btn-ghost"}`}
              >
                Get started →
              </Link>
```
(Leave the hero and footer "Get started" links as `/sign-up` — no plan intent.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build && npm run lint`
Expected: tsc clean; build succeeds; lint 0 errors. (No unit test for middleware/landing — no such tests exist in the repo; covered by the build + manual click-through.)

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts src/components/landing/landing-content.ts src/components/landing/LandingPage.tsx
git commit -m "feat(billing): middleware resume trigger + landing pricing cards carry the plan"
```

---

### Task 5: Runbook + full verification

**Files:**
- Create: `docs/billing-resume-checkout-runbook.md`

- [ ] **Step 1: Write the runbook**

Create `docs/billing-resume-checkout-runbook.md`:
```markdown
# Resume Checkout After Signup — Runbook

## Flow
1. Logged-out visitor clicks a landing pricing card → `GET /get-started?plan=unlock|unlimited`
   → sets a one-shot `checkout_intent` cookie → `/sign-up`.
2. They sign up (or sign in) → onboarding creates an org → `/productions`.
3. Middleware sees an org + the cookie → redirects to `/billing/resume`.
4. `/billing/resume` clears the cookie and redirects straight to Stripe Checkout for that plan.
5. Pay → `/billing/return` → entitlement granted → `/productions`. Cancel → `/productions`.

## Requirements
- Needs the live `STRIPE_*` env in Vercel (same as the rest of checkout). If billing isn't
  configured, `/billing/resume` just lands the user in `/productions` (no dead-end).
- Cookie is `secure` only in production; on local http it is set non-secure so the flow is testable.

## Smoke test (test mode)
1. Logged out, open the landing, click "Unlimited" → you're on `/sign-up` (check the
   `checkout_intent` cookie is set in devtools).
2. Sign up a new account → create an org in onboarding → you should be bounced to Stripe
   Checkout for Unlimited (not just dropped on /productions).
3. Cancel at Stripe → land on `/productions`, cookie gone (no redirect loop).
4. Repeat clicking "Pay per production" → resumes the $49.99 one-time checkout.
5. Existing user: log out, click a plan, sign IN → after sign-in you're sent to Stripe.
```

- [ ] **Step 2: Full verification**

Run: `npx vitest run` → all pass (existing + new checkout/get-started/resume tests).
Run: `npm run lint && npx tsc --noEmit && npm run build` → lint 0 errors; tsc clean; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add docs/billing-resume-checkout-runbook.md
git commit -m "docs(billing): resume-checkout runbook"
```

---

## Self-Review

**Spec coverage:**
- `createCheckoutSession` shared helper + route refactor → Task 1. ✓
- `checkout_intent` cookie via `GET /get-started` (+ public) → Task 2. ✓
- `GET /billing/resume` (read+clear cookie, create session, redirect; misses → /productions) → Task 3. ✓
- Middleware resume trigger (orgId + cookie + not /billing) → Task 4. ✓
- Landing pricing cards carry the plan (`checkoutType` → `/get-started?plan=`) → Task 4. ✓
- One-shot / no-loop / graceful-degradation / cookie secure-in-prod → Tasks 2,3,4 + Global Constraints. ✓
- Runbook + verify → Task 5. ✓

**Placeholder scan:** No TBD/TODO; full code in every code step.

**Type consistency:** `createCheckoutSession({orgId, type: CheckoutType, productionId?, origin}): Promise<string>` is produced in Task 1 and consumed by the checkout route (Task 1) and `/billing/resume` (Task 3) with the same shape. `checkout_intent` cookie name + values `"unlock"|"unlimited"` are identical across `/get-started` (set), middleware (presence check), and `/billing/resume` (read/validate). `PricingTier.checkoutType` (`"unlock"|"unlimited"`) matches the `/get-started?plan=` values.
