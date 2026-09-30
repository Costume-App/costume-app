# Training Video 6 (Sharing and Billing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script, record, build, and QC video 6, "Sharing and Billing". Demo Theatre Co. shares Twelfth Night's design layer and copies the link. A second company, a new demo org, opens the link and finds it needs a plan. It sees the plans, pays for Pay Per Production on Stripe's checkout with a test card, accepts the share, and lands in its own copy.

**Architecture:** Video 6 is the first video with two signed-in identities, so the recorder learns a per-section `actor` ("sender", the existing demo user, or "receiver", a new demo user in a new demo org). Sender preps reuse video 4's `TWELFTH_COSTUMED_STATE`. Receiver preps reset the receiver org through its own API (delete its Twelfth Night copies) and reset its purchases through ONE restricted service-role module, because the app has no API that removes a purchase and deleting a copied production hands its unlock back (`production_purchases.production_id ... on delete set null`, `0028_billing.sql`). Checkout is Stripe's hosted page in the Stripe sandbox. The app's `/billing/return` page fulfills the session synchronously, so no webhook listener is needed.

**Tech Stack:** Node ESM scripts, Playwright 1.63, ffmpeg/ffprobe (no `drawtext`), edge-tts in `~/.venvs/edge-tts`, Vitest (`scripts/**/*.test.mjs` and `src/**/*.test.ts`), the app's API as each demo user, `@supabase/supabase-js` (service role) for the receiver billing reset only, Stripe sandbox (`sk_test_` key in `.env.local`).

**Spec:** `docs/superpowers/specs/2026-09-22-training-videos-design.md` (video list item 6). Task 4 amends its "no real payment on camera" line to "sandbox checkout with a test card", per Chris 2026-09-29. Also read `docs/training-videos/README.md`, `docs/training-videos/followups.md`, `docs/superpowers/plans/2026-09-28-training-video-5-house-inventory.md` (its Task 5 is the model for Task 5 here), `scripts/lib/walkthroughs/house-inventory.mjs`, and `~/.claude/skills/recording-app-training-videos/lessons.md` before any walkthrough work.

## Rulings needed from Chris before Task 4 (plan review)

Chris decided on 2026-09-29: show checkout with a test card, seed a second org, show the share link copy instead of email. Four smaller questions remain. Each has a default the plan follows unless Chris says otherwise:

1. **Receiver names.** Default: org `Demo Playhouse`, user `Riley Park`, Clerk email `demo-playhouse+clerk_test@example.com`. Checkout on camera types `riley@example.com`.
2. **Stripe sandbox branding on camera.** The 2026-09-29 probe showed the checkout page reading `Measure My Costume sandbox` with a `Sandbox` badge, product `Test One Production License`, description `For testing the one time price per production.` The badge cannot be removed while a test card is used. Default: Task 3 renames the SANDBOX product to `Pay Per Production` with the description `One production with 3 makers included.` through the Stripe API (`sk_test_` key only; refuses a live key). The account name stays as it is unless Chris renames it in the dashboard.
3. **The share link on camera reads `http://localhost:3000/share/...`.** Default: show it as it is, and keep zooms off the link text (the zoom goes on `Copy link` and `Copied!`). The alternative is a recording-only script that swaps the displayed origin for `https://www.measuremycostume.com`. It is more polished, but it paints something the local app did not render.
4. **Guide correction.** `/guide#sharing` says the copy includes "costume designs and pieces". `copyDesignLayer` (`src/lib/data/production-copy.ts:9-12`) copies roles, role photos, designs, and design photos, and never copies pieces. Default: Task 1 drops "and pieces".

## Global Constraints

- Voice: `en-US-AvaMultilingualNeural`, rate `+0%`, pitch `+0Hz`.
- Output: 1920x1080, 30 fps, H.264 + AAC MP4, plus a WebVTT file beside it.
- Record and seed only against a production build YOU started: `npm run build`, then `npx next start -p 3000` (NOT `npm start`, which pins 6100), with `DEMO_BASE_URL=http://localhost:3000` on every seeder and recorder command. Before starting, `lsof -i :3000` must show nothing. If it is taken, pick another free port and use it everywhere. Never touch port 6100, and never kill anything by name. Stop your own server by port when done, after confirming the listener is yours.
- Dev and prod share ONE Supabase database. The sender side touches only the demo org (`scripts/lib/demo-org.json` top level), and inside it only "Twelfth Night", the two `DEMO_MAKERS`, and `DEMO_INVENTORY_NAMES` items. The receiver side touches only the receiver org (`demo-org.json` `receiver`), and inside it only productions titled "Twelfth Night" and its own `production_purchases` / `seat_purchases` rows. No other org is ever read or written.
- The ONLY direct database writes in this plan are in `scripts/lib/receiver-billing.mjs` (Task 3) and the one-time `scripts/bootstrap-receiver-org.mjs` (Task 2). Everything else goes through the app's API as a signed-in demo user.
- Stripe: sandbox only. Every script that calls Stripe asserts the key starts with `sk_test_`. The only Stripe objects created are Checkout sessions, customers, and payments made by the app itself, plus the optional product rename (ruling 2).
- Blocking rules for every implementer: **no `any`** (lint errors on it), **NO EM-DASHES anywhere** (code, comments, docs, narration, commit messages, app copy), and **grep every file you wrote (not the diff) before committing**: `grep -rn $'\u2014' <files>` must print nothing.
- Beat sentence indices (`s:`) come from `node scripts/list-vo-sentences.mjs --video sharing-and-billing` output, never counted by hand. After any script edit, regenerate VO first, then re-derive every `s:`.
- Never on camera: native dialogs, Clerk popovers (the OrgSwitcher and its Billing tab included: hover the trigger at most, never click it), and OS file or clipboard UI.
- Every UI string in the script and every selector is the exact on-screen text, confirmed in code and on the live page (`playwright-cli`), not taken from this plan. This plan quotes strings read from the code on 2026-09-29. Re-check them.
- Branch `feat/training-video-6`, cut from a clean, pushed main (`84603f9` or later). Local commits only. Nothing is pushed or deployed without Chris's explicit go-ahead.
- Logs, probe frames, and probe scripts go in YOUR session scratchpad directory, written `<scratch>` below. Never in the repo, never `/tmp`.
- Commit trailer goes in the body, on its own line after a blank line: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A write aimed at the wrong org.** For example, `receiver.clerkOrgId` equals the sender's, is missing, or names a prod org, or a section signs in as one identity and preps as the other. Expected: `planReceiverBillingReset` throws before any write unless the receiver id is present, starts with `org_`, differs from the sender id, and matches the id the Clerk dev API returns for an org named `Demo Playhouse`. The executor refuses any op whose table is not on its allowlist or whose `org_id` is not the receiver's. `gotoAuthed` asserts the session against the CURRENT take's actor. Pinned by Task 2 and Task 3 tests.
2. **The receiver org already holds an unused unlock.** This happens when deleting last take's copy hands its unlock back through `on delete set null`, or when a late sandbox webhook lands after the reset. The subscribe page would then never show, and Accept would skip the paywall. Expected: every receiver prep deletes all the receiver's purchase rows. The `plans` and `checkout` sections throw before their first beat unless the page shows `Subscribe to add a production`. Pinned by a Task 3 test and the Task 5 guards.
3. **The receiver org contains something no video made** (someone signed in by hand and added a production). Expected: `assertReceiverProductionsOnly` throws naming every production not titled "Twelfth Night", and nothing is deleted. Pinned by a Task 3 test.
4. **A share token from an earlier take.** Recreating Twelfth Night cascades its shares away (`0027`: `source_production_id ... on delete cascade`), and an accepted token is single-use. The share page would read `This share link is no longer valid.` Expected: every receiver prep creates its token AFTER the sender reset, and the section waits for `Accept & copy to my organization` before its first beat. Pinned by a Task 3 test (token created after reset, in order) and a Task 5 guard.
5. **`Copy link` fails silently.** `navigator.clipboard.writeText` rejects without clipboard permission, so `Copied!` never shows. Expected: recorded contexts grant `clipboard-read` and `clipboard-write`, and the section asserts `Copied!` is visible and that `navigator.clipboard.readText()` equals the `Share link` input's value. Pinned by the Task 2 recorder change and a Task 5 guard.

## Verified facts this plan builds on (2026-09-29, read from code and one live probe)

- **Sharing UI** (`src/components/SharePanel.tsx`). The production page renders it in the header row beside `← Productions` (`productions/[id]/page.tsx:93-100`, `canShare={isAdmin}`), and it also sits on each production card. The trigger is the button `Share production →` (`:130`; the arrow drops while open). Open, it shows the explanatory paragraph (`:137-144`), an optional email input (label `Email the link to (optional)`, aria-label `Recipient email (optional)`), and the button `Share`. After a create it shows `Share link ready`, a read-only input (aria-label `Share link`) holding `${window.location.origin}/share/<token>`, and `Copy link`, which reads `Copied!` for 1.5 s. Older pending links list under `Active links`, each with `Copy` and `Revoke`. Revoke has NO confirm dialog, and the row strikes through with `Revoking…` for about 400 ms. Em-dashes: `:146` (comment) and `:170` (rendered only when an email was given). Task 1 fixes both.
- **Sharing gate** (`api/productions/[id]/shares/route.ts:31`). The sender must be a paid org (`isPaidOrg`). The demo org is comped, so it is paid.
- **Share page** (`src/app/(app)/share/[token]/page.tsx`). H1 `Shared production`. A card shows the title and `<n> roles · <n> costume designs · includes notes & idea photos`, then `Performers and measurements are not included.` Below it: `Accepting copies this into your organization as a new production you can edit.` and the button `Accept & copy to my organization` (`AcceptShareButton.tsx`). A used token shows `This share link has already been used.`, and a revoked or missing one shows `This share link is no longer valid.`
- **Accept gate** (`api/shares/[token]/accept/route.ts`). `canCreateProduction(orgId)` must allow, which needs Unlimited or an unbound unlock. Otherwise it returns 402, and the button shows the error in red: `This action needs a production unlock. Buy a production or upgrade to Unlimited.` (`src/lib/errors.ts:29`). That notice has NO plan cards. On success it consumes the unlock and `router.push`es to `/productions/<new id>`.
- **Copy content** (`production-copy.ts`). A new production with the same title and notes, plus roles, role photos, designs, and design photos. No showings, performers, casts, pieces, or measurements.
- **Plans page** (`productions/new/page.tsx`). Without an unlock, `/productions/new` shows H1 `Subscribe to add a production`, the lede `Your current plan doesn’t include another production. Choose a plan to add one:`, and two `PlanCard`s. `Pay Per Production`: `$49.99`, `one-time, per production`, points `1 production` / `3 makers included` / `+$10 per extra maker`. `Unlimited`: `$99.99`, `per year`, points `Unlimited productions` / `Unlimited makers` / `Best for ongoing programs`, highlighted with `Best value`. Each has the button `Choose →` (`Starting…` while busy). A `Back` link follows. It is reached from the Productions page button `+ New Production` (`productions/page.tsx:43`).
- **Checkout** (`stripe-billing.ts` `createCheckoutSession`). `mode: "payment"` for unlock, on the org's Stripe customer (created on first checkout, without an email). `success_url` is `${origin}/billing/return?session_id=...`, and `cancel_url` is `${origin}/productions`. `/billing/return` retrieves the session, calls `fulfillCheckoutSession` (inserts `production_purchases { org_id, stripe_session_id, source: "stripe" }`), and redirects to `/productions`.
- **Stripe sandbox probe, 2026-09-29, headless Chromium at 1920x1080, no page zoom.** The page loads. The left column reads `Measure My Costume sandbox` `Sandbox`, `Test One Production License`, `$49.99`, `For testing the one time price per production.` The right column shows wallet buttons (Apple Pay, Link, Klarna, Amazon Pay), `OR`, `Contact information` with `#email`, then `Payment method` with an accordion (Card, Cash App Pay, Affirm, Klarna, Bank). Stripe's `getByRole("button", { name: "Pay with card" })` and `getByText("Card")` clicks both time out (the element is not visible). A mouse click on the Card row's label works. Then `#cardNumber`, `#cardExpiry`, `#cardCvc`, `#billingName`, `#billingCountry`, and `#billingPostalCode` are visible. `#enableStripePass` (`Save my information for faster checkout`, with a phone field) is CHECKED by default, and `click({ force: true })` unchecks it. The submit (`button[type="submit"]`, text `Pay`) completed payment. The invisible hCaptcha did not block it, and the session read `complete` / `paid`. At page zoom 1.5 and a 1280 viewport, the right column overflowed off screen, so the Stripe page must not get the app's CSS zoom.
- **Billing panel.** `OrgBillingPanel` lives only inside the Clerk `OrganizationSwitcher` profile (`OrgSwitcher.tsx:23-25`), which is never opened on camera. The wrap-up only points at the switcher trigger. Em-dash at `OrgBillingPanel.tsx:69` (rendered for a non-active subscription status). Task 1 fixes it.
- **Recorder.** `createRecorder({ browser, base, demo, outRoot })` (`record-core.mjs:100`) signs in as `demo` for every take (`freshAuthedStorageState`), and `gotoAuthed` asserts `assertDemoSession(session, demo)` (`:257-266`). `PAGE_ZOOM_INIT` applies zoom 1.5 to every document in the context (`:32-38`). `record-training-video.mjs:117` runs `section.prep(api)` through `withDemoApi(browser, BASE, demo, ...)`. `signInDemo(browser, base, demo)` and `assertDemoSession(session, demo)` are already generic over the identity object (`demo-api.mjs:24`, `demo-org.mjs:48`). `validateWalkthrough` (`training.mjs:18-33`) checks `id`, `heading`, `targetSeconds`, `run`, and `prep`.
- **Demo data.** `resetDemoCostumeOrg`, `resetTwelfthNight(api, state, { makerIds, inventoryIds })`, `TWELFTH_COSTUMED_STATE` (video 4's end state, with the Viola Doublet sketch) and `deleteByTitle(api, title)` are in `scripts/lib/demo-productions.mjs`. Follow `house-inventory.mjs` for how a prep gets `makerIds`. `bootstrap-demo-org.mjs` is the model for the receiver bootstrap (minus the comped subscription, plus followup M1: `insert`, not `upsert`, and log `user.id` before the org call).
- **Copy test** `src/components/costume-copy.test.ts` flags any line containing an em-dash (comments included) except the bare em-dash cell glyph (`>\u2014<` in the test regex).

---

### Task 1: Copy fixes on camera, and the guide's sharing claim

**Files:**
- Modify: `src/components/SharePanel.tsx:146,170`, `src/components/OrgBillingPanel.tsx:69`
- Modify: `src/components/costume-copy.test.ts` (extend the file list)
- Modify: `src/app/(app)/guide/page.tsx` (the `#sharing` list item, per ruling 4)

**Interfaces:** none produced. Task 4's script quotes the new strings.

- [ ] **Step 1: Extend the failing test.** In `costume-copy.test.ts`, change the comment and list to:

```ts
// Costume Creations, House Inventory, and sharing/billing copy is filmed in
// training videos 4 to 6; the owner's rule is no em-dashes in published
// copy. The bare "no value" cell glyph is exempt.
const FILES = [
  "src/components/AddToInventoryControl.tsx",
  "src/components/MakePieceRow.tsx",
  "src/components/InventoryManager.tsx",
  "src/components/InventoryQuickAddCard.tsx",
  "src/components/SharePanel.tsx",
  "src/components/OrgBillingPanel.tsx",
  "src/components/AcceptShareButton.tsx",
  "src/components/PlanCard.tsx",
  "src/app/(app)/share/[token]/page.tsx",
  "src/app/(app)/productions/new/page.tsx",
];
```

- [ ] **Step 2: Run it, expect FAIL** on exactly `SharePanel.tsx:146`, `SharePanel.tsx:170`, and `OrgBillingPanel.tsx:69`: `npx vitest run src/components/costume-copy.test.ts`.
- [ ] **Step 3: Rewrite.**
  - `SharePanel.tsx:146`: `{/* Create: email is optional; the link is generated either way. */}`
  - `SharePanel.tsx:170`: `` Share link ready{created.recipient_email ? `. Emailed to ${created.recipient_email}` : ""} ``
  - `OrgBillingPanel.tsx:69`: `<span className="muted"> ({status.subscriptionStatus})</span>`
  - Guide `#sharing`, first list item: `The copy includes roles, costume designs, notes, and photos. It never includes performers or measurements.`

  Then run `grep -rn "Share link ready\|subscriptionStatus" src --include='*.test.*'` and update any test that asserts the old wording.
- [ ] **Step 4: Verify.** `npx vitest run && echo VITEST_OK`, `npx tsc --noEmit && echo TSC_OK`, `npx eslint src/components 'src/app/(app)/guide' && echo ESLINT_OK`. All pass.
- [ ] **Step 5: Commit.**

```bash
grep -rn $'\u2014' src/components/costume-copy.test.ts src/components/SharePanel.tsx src/components/OrgBillingPanel.tsx 'src/app/(app)/guide/page.tsx'
git add src/components/costume-copy.test.ts src/components/SharePanel.tsx src/components/OrgBillingPanel.tsx 'src/app/(app)/guide/page.tsx'
git commit -m "fix(copy): no em-dash in share and billing copy; guide says pieces are not shared" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The grep must print nothing.

---

### Task 2: A second demo identity, and a two-actor recorder

**Files:**
- Modify: `scripts/lib/demo-org.mjs`, `scripts/lib/demo-org.test.mjs`
- Create: `scripts/bootstrap-receiver-org.mjs`
- Modify: `scripts/lib/demo-org.json` (the bootstrap writes `receiver`)
- Modify: `scripts/lib/record-core.mjs`, `scripts/record-training-video.mjs`, `scripts/lib/training.mjs`, `scripts/lib/training.test.mjs`
- Modify: `docs/training-videos/README.md` (step 0 names the receiver bootstrap)

**Interfaces:**
- Produces, in `demo-org.mjs`:
  - `RECEIVER_ORG_NAME = "Demo Playhouse"` (ruling 1).
  - `loadReceiver(demo)`: returns `demo.receiver` after checking it has non-empty string `clerkUserId`, `clerkOrgId`, `email`, `name`, that `name === RECEIVER_ORG_NAME`, that `clerkOrgId` starts with `org_`, and that `clerkOrgId !== demo.clerkOrgId` and `clerkUserId !== demo.clerkUserId`. Otherwise it throws naming the field and pointing at `node scripts/bootstrap-receiver-org.mjs`. `loadDemoOrg` is unchanged and does not require `receiver`, so videos 1 to 5 keep working.
  - `identityFor(demo, actor)`: `"sender"` returns `demo`, `"receiver"` returns `loadReceiver(demo)`, and anything else throws.
- Produces, in `training.mjs` `validateWalkthrough`: a section may declare `actor: "sender" | "receiver"` (default `"sender"`). Any other value throws `/actor/`. A walkthrough with any receiver section, or any section whose prep uses the receiver, must declare `WALKTHROUGH.needsReceiver = true`, otherwise it throws `/needsReceiver/`.
- Produces, in `record-core.mjs`:
  - `createRecorder({ browser, base, demo, outRoot })` is unchanged in shape. `record(id, fn, { identity = demo } = {})` signs in as `identity`, and `gotoAuthed` asserts against the identity of the take in progress.
  - Every recorded context is created with `permissions: ["clipboard-read", "clipboard-write"]`.
  - The zoom init script applies `PAGE_ZOOM` only when `location.origin === base`, so third-party pages (Stripe Checkout) render at their own scale while the cursor overlay still runs everywhere. Export the builder as `pageZoomInitScript(base)` so it can be tested.
- Produces, in `record-training-video.mjs`: for each section, `identity = identityFor(demo, section.actor ?? "sender")`. Prep runs as `section.prep(senderApi, { receiverApi })`. `receiverApi` is created with a nested `withDemoApi(browser, BASE, receiver, ...)` only when `walkthrough.needsReceiver`, and is `null` otherwise, so videos 1 to 5 behave as before. Then `recorder.record(section.id, fn, { identity })`.

- [ ] **Step 1: Failing tests.**
  - `demo-org.test.mjs`: `loadReceiver` accepts a well-formed receiver. It throws on a missing receiver (message names the bootstrap script), a wrong name, a non-`org_` id, an org id equal to the sender's, and a user id equal to the sender's. `identityFor` returns the right object for both actors and throws on `"admin"`.
  - `training.test.mjs`: a section with `actor: "receiver"` and no `needsReceiver` throws `/needsReceiver/`. `actor: "admin"` throws `/actor/`. A walkthrough with `needsReceiver: true` and receiver sections validates, and existing walkthrough shapes still validate.
  - `pageZoomInitScript("http://localhost:3000")` returns a string containing `location.origin` and `"http://localhost:3000"` (a string test is enough, since behavior is checked live in Step 5).
  - Run `npx vitest run scripts/lib/demo-org.test.mjs scripts/lib/training.test.mjs`. The new tests fail.
- [ ] **Step 2: Implement** the interfaces above. `gotoAuthed` keeps calling `assertDemoSession(session, current)`, where `current` is set by `record()` for the take and reset in its `finally`.
- [ ] **Step 3: Write `scripts/bootstrap-receiver-org.mjs`**, modeled on `bootstrap-demo-org.mjs`:
  - It refuses if `demo-org.json` is missing, or already has `receiver`.
  - It calls `assertDevClerkKey`.
  - It creates the Clerk user (`first_name: "Riley"`, `last_name: "Park"`, email `demo-playhouse+clerk_test@example.com`, `skip_password_requirement: true`, `legal_accepted_at`) and logs `user.id` before the org call.
  - It creates the org `Demo Playhouse` with `created_by: user.id`.
  - It runs `insert` (not upsert) into `organizations { clerk_org_id, name }`. It writes NO `org_subscriptions` row: the receiver must be an unpaid org.
  - It writes `receiver: { clerkUserId, clerkOrgId, email, name }` into `demo-org.json`, keeping every existing key byte-for-byte.
  - Its header comment says it is one-time and dev-Clerk-only.
- [ ] **Step 4: Run it once** (controller approval first: it writes one dev Clerk user, one dev Clerk org, and one `organizations` row in the shared DB). `node scripts/bootstrap-receiver-org.mjs`. Then run `git diff scripts/lib/demo-org.json`: only the `receiver` block is added.
- [ ] **Step 5: Live check of the two-actor recorder.** Build, start your server, and add a throwaway section to `scripts/lib/walkthroughs/_probe.mjs`, or use a `<scratch>` walkthrough if the loader allows it. It records as `receiver`, `gotoAuthed`s `/productions`, and holds 2 s. Confirm the take signs in as Riley Park in Demo Playhouse (read `window.Clerk.organization.name` in the run and log it). Also confirm that a sender section in the same run still signs in as the demo user. Remove the throwaway section before committing.
- [ ] **Step 6: README.** Step 0 gains `node scripts/bootstrap-receiver-org.mjs` (video 6 onward).
- [ ] **Step 7: Commit.**

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
grep -rn $'\u2014' scripts/lib/demo-org.mjs scripts/lib/demo-org.test.mjs scripts/bootstrap-receiver-org.mjs scripts/lib/demo-org.json scripts/lib/record-core.mjs scripts/record-training-video.mjs scripts/lib/training.mjs scripts/lib/training.test.mjs docs/training-videos/README.md
git add scripts/lib/demo-org.mjs scripts/lib/demo-org.test.mjs scripts/bootstrap-receiver-org.mjs scripts/lib/demo-org.json scripts/lib/record-core.mjs scripts/record-training-video.mjs scripts/lib/training.mjs scripts/lib/training.test.mjs docs/training-videos/README.md
git commit -m "feat(training): receiver demo org and per-section actor in the recorder" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Receiver resets, the restricted billing module, and share helpers

**Files:**
- Create: `scripts/lib/receiver-billing.mjs`, `scripts/lib/receiver-billing.test.mjs`
- Modify: `scripts/lib/demo-productions.mjs`, `scripts/lib/demo-productions.test.mjs`
- Create (only if Chris keeps ruling 2): `scripts/rename-sandbox-product.mjs`

**Interfaces:**
- Consumes: `loadReceiver`, `identityFor` (Task 2), `resetDemoCostumeOrg`, `resetTwelfthNight`, `TWELFTH_COSTUMED_STATE`, `deleteByTitle`, `TWELFTH` (existing).
- Produces, in `receiver-billing.mjs` (the ONLY module in `scripts/` that writes billing rows):
  - `planReceiverBillingReset({ sender, receiver, clerkOrgName, grantUnlock = false })`: pure. Throws unless all of these hold: `receiver.clerkOrgId` starts with `org_`, it differs from `sender.clerkOrgId`, and `clerkOrgName === RECEIVER_ORG_NAME` (the name the Clerk dev API returned for that id). It returns a frozen op list, always in this order:
    1. `{ op: "delete", table: "production_purchases", orgId }`
    2. `{ op: "delete", table: "seat_purchases", orgId }`
    3. `{ op: "assertNotSubscribed", table: "org_subscriptions", orgId }`
    4. only when `grantUnlock` is true: `{ op: "insert", table: "production_purchases", orgId, row: { org_id: orgId, source: "training_demo" } }`
  - `applyReceiverBillingPlan(sb, plan, receiverOrgId)`: executes the ops with a supabase-js client. It refuses (throws before any call) if any op's `orgId` is not `receiverOrgId`, or if any `(op, table)` pair is outside the allowlist `delete:production_purchases`, `delete:seat_purchases`, `assertNotSubscribed:org_subscriptions`, `insert:production_purchases`. Deletes are always `.delete().eq("org_id", orgId)`. `assertNotSubscribed` selects `comped, status` and throws if `comped` is true or `status` is `active` or `trialing` (it never fixes a subscription; the video never buys Unlimited).
  - `resetReceiverBilling({ demo, grantUnlock })`: loads `.env.local`, asserts the dev Clerk key, fetches `GET https://api.clerk.com/v1/organizations/<receiver id>` for its name, builds the service-role client, then plans and applies.
- Produces, in `demo-productions.mjs`:
  - `resetSenderForSharing(api)`: `resetDemoCostumeOrg(api)`, then `resetTwelfthNight(api, TWELFTH_COSTUMED_STATE, { makerIds })`. Returns the production id.
  - `createTwelfthShare(api, productionId)`: `POST /api/productions/<id>/shares` with `{}` (no email). Returns the token.
  - `assertReceiverProductionsOnly(receiverApi)`: `GET /api/productions`. Throws naming every production whose title is not `TWELFTH`. Deletes nothing.
  - `resetReceiver(receiverApi, { demo, grantUnlock = false })`: `assertReceiverProductionsOnly`, then `deleteByTitle(receiverApi, TWELFTH)`, then `resetReceiverBilling({ demo, grantUnlock })`. It deletes productions BEFORE billing, so a copy's unlock that the delete hands back is then deleted too.
  - `prepShareForReceiver(senderApi, receiverApi, { demo, grantUnlock })`: `resetSenderForSharing` first, then `createTwelfthShare`, then `resetReceiver`. Returns `{ token, productionId }`.

- [ ] **Step 1: Failing tests** in `receiver-billing.test.mjs` (a fake supabase client that records every chain call, like `org-deletion.test.mjs`):
  - The default plan is exactly the three ops in order. `grantUnlock: true` appends the insert with `source: "training_demo"`.
  - The plan throws, and the fake records no calls, for each of these: receiver id equal to the sender's, a receiver id not starting with `org_`, a missing receiver, and a Clerk name other than `Demo Playhouse`.
  - `applyReceiverBillingPlan` with an op whose `orgId` differs from the receiver's throws, and the fake recorded zero calls. So does an op on `org_subscriptions` with `delete`, and an `insert` into `seat_purchases`.
  - Every recorded delete chain ends in `.eq("org_id", <receiver id>)`.
  - `assertNotSubscribed` throws on `{ comped: true }` and on `{ status: "active" }`. It passes on no row and on `{ comped: false, status: "inactive" }`.
- [ ] **Step 2: Failing tests** in `demo-productions.test.mjs` (extend `fakeApi`, and inject a stub for `resetReceiverBilling`):
  - `assertReceiverProductionsOnly` passes on `[Twelfth Night, Twelfth Night]`. On `[Twelfth Night, Hamlet]` it throws naming `Hamlet` and sent no DELETE.
  - `resetReceiver` sends its DELETEs for Twelfth Night copies BEFORE calling the billing stub, and passes `grantUnlock` through.
  - `prepShareForReceiver` order: sender reset calls, then `POST .../shares` on the NEW production id, then receiver calls. It returns the token from the fake.
  - Run both test files. The new tests fail.
- [ ] **Step 3: Implement.** `resetReceiverBilling` is the only function that constructs a service-role client, and it lives only in `receiver-billing.mjs`. `resetReceiver` receives it through an optional parameter (default: the real one), so tests never touch the network.
- [ ] **Step 4: Live dry check** (server running, receiver bootstrapped). Through a `<scratch>` script run with `node`, as each demo user:
  - Run `prepShareForReceiver` with `grantUnlock: false`, then open `/share/<token>` as the receiver in `playwright-cli`, or use `receiverApi.get` on the page HTML. It shows `Accept & copy to my organization`.
  - Accept through `receiverApi.post('/api/shares/<token>/accept')`. Expect a 402 with the `needs_unlock` message.
  - Re-run with `grantUnlock: true` and accept. Expect a 201, and the receiver's productions now list one Twelfth Night.
  - Run `resetReceiver` again. The receiver has zero productions and zero `production_purchases` rows (read-only count through the service-role client, in `<scratch>`).
- [ ] **Step 5 (only with ruling 2 kept): sandbox product rename.** `scripts/rename-sandbox-product.mjs` asserts `sk_test_`, retrieves `STRIPE_PRICE_UNLOCK` with `expand: ["product"]`, and updates that product's `name` to `Pay Per Production` and `description` to `One production with 3 makers included.` It prints before and after. Run it once. It is a repo script, so the change can be re-created.
- [ ] **Step 6: Commit.**

```bash
npx vitest run && echo VITEST_OK
npx eslint scripts && echo ESLINT_OK
grep -rn $'\u2014' scripts/lib/receiver-billing.mjs scripts/lib/receiver-billing.test.mjs scripts/lib/demo-productions.mjs scripts/lib/demo-productions.test.mjs
git add scripts/lib/receiver-billing.mjs scripts/lib/receiver-billing.test.mjs scripts/lib/demo-productions.mjs scripts/lib/demo-productions.test.mjs
git commit -m "feat(training): receiver org resets and share helpers for video 6" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Add `scripts/rename-sandbox-product.mjs` to the grep and the `git add` if Step 5 ran.

---

### Task 4: Video 6 script draft (CHECKPOINT: Chris approves before Task 5)

**Files:**
- Create: `docs/training-videos/scripts/sharing-and-billing.md`
- Modify: `docs/superpowers/specs/2026-09-22-training-videos-design.md` (video 6 line: `share a production's design layer by link, plans, and a sandbox checkout with a test card`, per Chris 2026-09-29)

**Interfaces:**
- Produces section ids, in order: `intro`, `share-link`, `active-links`, `open-link`, `plans`, `checkout`, `accept`, `wrap-up`. Task 5 uses exactly these. Actors: the first three are `sender`, the rest `receiver`.

- [ ] **Step 1: Verify every UI claim against the code** (the files in "Verified facts" plus `/guide#sharing` and `#billing` after Task 1). The script must not claim anything the demo state will not show on camera (lessons D3). In particular, it never claims the email box sends anything, because Resend is not set up. Every sentence is 5 words or longer, UI names are quoted exactly, there are no em-dashes, sections run 15 to 40 s, and the whole video runs 3 to 4.5 minutes. The last section closes the six-video series.
- [ ] **Step 2: Write the script** in the generator's format. Starting draft; rewrite wherever the code says otherwise:

```markdown
# Sharing and Billing, VO script

Voice: Ava (en-US-AvaMultilingualNeural). Recorded against the Demo Theatre Co. and Demo Playhouse orgs.

## Sharing and billing (`intro`)

Your design work does not have to stay with one show. When another company or school stages the same play, you can give them a copy of your production. In this video, we will share Twelfth Night, and then see the other side: opening the link, choosing a plan, and accepting the copy.

> sender, on Twelfth Night; hold on the header row with "Share production →"

## Share a production (`share-link`)

Open the production, and choose "Share production".

> click "Share production →"; hold on the explanatory paragraph

The copy includes your roles, costume designs, notes, and photos. Your performers and their measurements always stay with you.

> point at the paragraph's last sentence

Choose "Share" to make a link. Each link works one time, for one company.

> click "Share"; zoom "Share link ready" with the link box and "Copy link"

Choose "Copy link", then send it however you like, by email, text, or chat.

> click "Copy link"; hold on "Copied!"

## Manage your links (`active-links`)

Links you have not used yet stay listed under "Active links". You can copy one again, or revoke it so it stops working.

> reopen the panel (prep made two pending links); zoom "Active links"; click "Revoke" on the top row; hold on the strike-through and the row leaving

## Open the link (`open-link`)

Now we are at Demo Playhouse, the company receiving the copy. Opening the link shows what is included, before anything is copied.

> receiver, on /share/<token>; zoom the card: title, counts, "Performers and measurements are not included."

Accepting a share creates a new production, so it needs a plan.

> click "Accept & copy to my organization"; zoom the red message

## Plans (`plans`)

To see the plans, choose "New Production".

> navigate to Productions; click "+ New Production"; hold on "Subscribe to add a production"

"Pay Per Production" covers one production with three makers, and you can add more makers for ten dollars each. "Unlimited" covers every production and every maker for a year.

> point Pay Per Production's price and points; point Unlimited's price and "Best value"

## Checkout (`checkout`)

Choose a plan to pay securely with Stripe. We will pay for one production.

> click "Choose →" on Pay Per Production; Stripe loads; hold on the order summary

Enter an email and your card details, then choose "Pay".

> type riley@example.com; choose Card; type the test card, expiry, CVC, name, ZIP; untick "Save my information"; click "Pay"

When the payment goes through, you land back in the app, ready to go.

> return to /productions; hold

## Accept the copy (`accept`)

Open the link again, and accept it. The production is copied into your company, with its roles, designs, and photos.

> receiver, on /share/<token>; click "Accept & copy to my organization"; land on the copy; zoom Viola's Doublet sketch

It is your copy now. Add your own performers and measurements, and change anything you like. Changes on either side never affect the other.

> point the roles list; point the empty cast area

## Wrap up (`wrap-up`)

You can see your plan anytime under "Billing", in your organization menu at the top of the page. That is sharing and billing, and that completes the series. Thanks for watching, and break a leg.

> receiver, on /productions with the Twelfth Night copy; point (do not click) the organization switcher
```

- [ ] **Step 3: Render and list.**

```bash
~/.venvs/edge-tts/bin/python scripts/generate-training-vo.py --video sharing-and-billing
node scripts/list-vo-sentences.mjs --video sharing-and-billing
```

Every section renders. Each paragraph's first sentence starts at `0.0` (lessons E6). The total runs 3 to 4.5 minutes.

- [ ] **Step 4: Em-dash sweep, commit, STOP.** Commit `docs(training): Sharing and Billing narration script draft` (script plus spec line). Report the script, the total seconds, each section's wav directory, and which rulings (1 to 4) were applied. The controller shows Chris the script and one rendered section. Task 5 does not start until he approves. If he edits it, re-run Step 3.

---

### Task 5: Video 6 walkthrough, record, build, QC (CHECKPOINT: Chris approves the MP4)

**Files:**
- Create: `scripts/lib/walkthroughs/sharing-and-billing.mjs`
- Modify: `docs/training-videos/README.md` (status row `sharing-and-billing | built, awaiting Chris | <date>`)

- [ ] **Step 1: Preflight and selectors on the live page.** Start your server. As the receiver, run `assertReceiverProductionsOnly` once through a `<scratch>` script. If it throws, STOP and report the names; do not delete them. Then confirm with `playwright-cli`, on each section's prep state and as each section's actor, every string and selector the script uses. Sender side: `Share production →` in the production header, the paragraph, `Share`, `Share link ready`, the `Share link` input, `Copy link`/`Copied!`, `Active links`, `Copy`, `Revoke`/`Revoking…`. Receiver side: the share page card and button, the 402 message, the nav `Productions`, `+ New Production`, the plans page H1 and both cards' `Choose →`, and the copy's roles, Viola's design photo, and the empty cast state. On Stripe: the Card row click point (the probe found only a mouse click on the label works), the field ids, `#enableStripePass`, and `Pay`. Also note what the page shows below the fold at zoom 1.5 on app pages.
- [ ] **Step 2: Write the walkthrough**, modeled on `house-inventory.mjs` (same `remember` pattern, direct opening gotos, every beat carrying an `s:` from the lister output for the APPROVED script). Export `needsReceiver: true`. State plan (`TWELFTH_COSTUMED_STATE` on the sender side in every prep):

| Section | Actor | Prep |
|---|---|---|
| intro | sender | `resetSenderForSharing` |
| share-link | sender | `resetSenderForSharing` |
| active-links | sender | `resetSenderForSharing`, then `createTwelfthShare` twice |
| open-link | receiver | `prepShareForReceiver({ grantUnlock: false })` |
| plans | receiver | `prepShareForReceiver({ grantUnlock: false })` |
| checkout | receiver | `prepShareForReceiver({ grantUnlock: false })` |
| accept | receiver | `prepShareForReceiver({ grantUnlock: true })` |
| wrap-up | receiver | `prepShareForReceiver({ grantUnlock: true })`, then `POST /api/shares/<token>/accept` as the receiver |

Each receiver prep stores its token with `remember` for its own `run`. A token never crosses sections.

Guards, each throwing so a bad take is never delivered:
- `share-link`: after `Copy link`, wait for `Copied!`, then assert `await page.evaluate(() => navigator.clipboard.readText())` equals the `Share link` input value.
- `open-link` and `accept`: before the first beat, wait for `Accept & copy to my organization` (10 s). If `no longer valid` or `already been used` shows instead, throw.
- `plans` and `checkout`: before the first beat, H1 `Subscribe to add a production` is visible, otherwise throw (Review Focus 2).
- `checkout`: Stripe navigation waits for `#email` (20 s). The Card row is chosen by `page.mouse` on the label's bounding box, then `#cardNumber` must become visible (retry once, lessons B5). Type `4242 4242 4242 4242`, `12 / 34`, `123`, `Riley Park`, `94103` with `pressSequentially` (Stripe formats as it goes). Uncheck `#enableStripePass` and assert it is unchecked before `Pay`. After `Pay`, `waitForURL` on `${base}/productions` (60 s). Then, with the take still recording, assert through `page.evaluate(fetch('/api/billing/status'))` that `isPaidOrg` is true.
- `accept`: after the click, `waitForURL(/\/productions\/[0-9a-f-]{36}$/)`, then assert the H1 reads `Twelfth Night` and the take's session org is Demo Playhouse.
- `wrap-up`: only `point()` the switcher trigger. Nothing in this file calls `.click()` on it (grep the file in Step 3).
- Every receiver take passes the Task 2 `gotoAuthed` identity check, and so does every sender take.

Rules carried from videos 2 to 5: a zoom target stays still for its whole `holdMs`, and a click after a re-render asserts its result and retries once (lessons B5). The Stripe page gets no CSS zoom (Task 2). Its own layout at 1920x1080 is what the viewer sees.

- [ ] **Step 3: Static checks.** `node scripts/check-beat-annotations.mjs --video sharing-and-billing; echo EXIT=$?` gives `EXIT=0`. `grep -n "OrganizationSwitcher\|cl-organizationSwitcherTrigger" scripts/lib/walkthroughs/sharing-and-billing.mjs` shows no `.click(`.
- [ ] **Step 4: Seed, record, build, QC** exactly as video 5's plan Task 5 Step 4, with `--video sharing-and-billing` and your own logs in `<scratch>`. Every take of `checkout` makes one sandbox payment; that is expected. Reseed immediately before the delivered pass (lessons D6).
- [ ] **Step 5: Look at every QC image and count defects** (video 2 Task 5 Step 5 rules). In addition:
  - `Copied!` is legible.
  - The revoke frame shows the strike-through.
  - Every receiver frame's header shows Demo Playhouse, and every sender frame's header shows Demo Theatre Co.
  - The Stripe frames are not zoomed, not clipped, and show `$49.99`. The `Save my information` box is unticked before `Pay`.
  - No frame shows the phone field filled, a Link one-time-code prompt, a Clerk popover, a native dialog, or an error page.
  - The accept frames land on the copy with Viola's sketch visible.
  - Report the sandbox branding and the localhost link (rulings 2 and 3) as they appear.
- [ ] **Step 6: Confirm both orgs are clean.** After the delivered pass: `assertReceiverProductionsOnly` passes, the sender's `assertDemoInventoryOnly` passes, the receiver holds at most one Twelfth Night, and zero pending shares in the demo org (`assertNoPendingDemoShares`).
- [ ] **Step 7: README, commit.** Run `npx vitest run` and `npx eslint scripts`, the em-dash grep over every file written, stage by name, and commit `feat(training): Sharing and Billing walkthrough recorded and built`. Stop your server by port.
- [ ] **Step 8: STOP for Chris's review.** Report:
  - the MP4 and VTT paths and the duration
  - defects found and fixed, with counts
  - whether any beat froze mid-glide
  - the preflight and clean-org checks
  - how many sandbox payments the takes made
  - the rulings as applied, and any other judgment calls

  Hosting and `/guide` embeds for all six videos are a separate plan.
