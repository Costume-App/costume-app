# Organization deletion: runbook, script, deletion log, storage-orphan fix

**Date:** 2026-07-27
**Status:** Approved, ready for implementation plan

## Background

The compliance revision merged on 2026-07-27 (merge `3152a63`) added this to
both public legal pages:

> To delete your organization and its data, email privacy@measuremycostume.com.
> We will remove it within 30 days of a verified request, except for records we
> are required by law to retain.

Plus a 30-day response commitment for CCPA and GDPR requests.

**No code implements any of that.** Every `DELETE` route and every `.delete()`
in `src/lib/data/` is scoped to a single record. `supabaseAdmin.from("organizations")`
is only ever `.select` or `.upsert`, never `.delete`. Deleting an organization
today means hand-written SQL plus a Clerk console action, with no procedure
written down.

This spec closes that gap. It is not a self-serve feature: the published policy
describes a human-verified process ("email us"), so an operator-run script plus
a runbook satisfies it exactly. A user-facing "delete my organization" button is
a larger, separate decision and is explicitly out of scope.

## What makes this harder than `DELETE FROM organizations`

Codebase mapped 2026-07-27. Four findings drive the entire design.

### 1. The cascade is mostly right, but misses four places

`organizations` has PK `clerk_org_id` (`0001_foundation.sql:2-9`). These cascade
correctly from it: `productions` (and transitively `performers`,
`performer_measurements`, `roles`, `castings`, `casts`, `costume_designs`,
`costume_pieces`, `show_dates`, `role_images`, `costume_design_images`),
`makers`, `inventory_items` (and `inventory_item_images`), `org_subscriptions`,
`production_purchases`, `seat_purchases`, `org_domains`.

These do **not**, because they store `org_id` as bare `text` with no foreign key:

| Table | Column(s) | Migration |
|---|---|---|
| `fabric_widths` | `org_id` | `0021_fabric_settings.sql:5` |
| `fabric_suppliers` | `org_id` | `0021_fabric_settings.sql:13` |
| `feedback` | `org_id`, `user_id` | `0026_feedback.sql:4-5` |
| `production_shares` | `source_org_id`, `accepted_by_org_id` | `0027_production_shares.sql:6,11` |

No constraint fires. The rows simply persist, pointing at an organization that
no longer exists. They must be deleted explicitly.

There is no RLS anywhere in `supabase/migrations/` — all org scoping is
application-level through the service-role client (`src/lib/supabase-admin.ts:12`),
so nothing at the database layer will catch a mistake here.

### 2. Storage has no org dimension

One private bucket, `role-images` (`src/lib/storage.ts:3`), shared by all three
image kinds and separated only by path prefix:

- role images — `{productionId}/{roleId}/{uuid}.jpg`
- design images — `{productionId}/designs/{designId}/{uuid}.jpg`
- inventory images — `inventory/{itemId}/{uuid}.jpg`

No path contains an org id. Inventory paths do not even contain a production id.
Deleting an org's files by prefix is therefore impossible — the paths must be
assembled from `role_images.storage_path`, `costume_design_images.storage_path`,
and `inventory_item_images.storage_path` **before** those rows cascade away.
Once the rows are gone the files are unreachable forever.

### 3. Stripe keeps charging, and then the webhook loops

`org_subscriptions` cascades away locally, but nothing Stripe-side is cancelled —
`stripe.subscriptions.cancel` does not appear anywhere in the repo.

Worse: when the next `customer.subscription.updated` or `invoice.paid` webhook
arrives for the orphaned subscription, `applySubscriptionEvent`
(`src/lib/data/stripe-billing.ts:121-133`) finds no matching row and falls into a
fallback `upsert` keyed on `subscription.metadata.orgId`. That insert violates
the FK to `organizations(clerk_org_id)`, the handler returns HTTP 500
(`src/app/api/billing/webhook/route.ts:41-44`), and Stripe retries indefinitely.

Cancelling the subscription before deleting local rows avoids both problems.

### 4. Clerk is entirely disconnected

There is no Clerk webhook handler in the codebase — only the Stripe one. Member
names and emails live solely in Clerk and are read live on every request
(`src/lib/data/org-members.ts:10`), never mirrored. Deleting the Clerk
organization today has zero effect on Supabase, and vice versa.

## Decisions

| Question | Decision |
|---|---|
| Script's reach | Stripe + Storage + Supabase. Clerk deletion stays a manual dashboard step the script prints. |
| Script runtime | Self-contained `.mjs` with an injected Supabase client, unit-tested with a fake |
| Feedback rows | Anonymize (`user_email`, `user_id`, `org_id` → NULL), retain `message` |
| Stripe customer | Cancel the subscription; **keep** the customer and invoices |
| Storage leak | Fix the delete script *and* the three existing routes that already orphan files |
| Dry-run | Default. `--confirm` required to mutate anything. |
| Self-serve UI | Out of scope |

### Why the script stops short of Clerk

Deleting the Clerk organization is the single most irreversible action in the
sequence and the one that cannot be undone from a backup. Keeping it as a
deliberate human step in the dashboard puts eyes on it, and keeps
`@clerk/backend` out of a plain `.mjs` script. The runbook covers it, and
`--verify` confirms the Supabase side afterward.

### Why `.mjs` with an injected client

A `.mjs` script cannot import `src/lib/data/*.ts`, and those modules import
`server-only`, so they would be fragile outside the Next runtime regardless.
Two alternatives were considered and rejected: adding `tsx` as a devDependency
(new dependency for one script, still fights `server-only`), and exposing a
destructive admin API route (an org-nuking endpoint on the public internet
behind hand-rolled auth).

Passing the Supabase client as the first argument to every function makes the
module unit-testable with a fake — and this is the most dangerous code in the
application, so it must be tested. It also follows the existing precedent,
`scripts/migrate-seeded-performers-to-roles.mjs`.

The cost, stated plainly: org-scoped path queries live in `.mjs` while the
production-scoped ones for the route fix live in TypeScript. These are sibling
queries at different scopes, not duplicated logic, but they do sit in two
places for runtime reasons.

### Why the Stripe customer is kept

Deleting the Stripe customer destroys the invoice and payment history — exactly
the financial records the retention clause published on the same day promises to
keep ("applicable state and federal record-retention laws, including those that
apply to financial records"). Cancelling the subscription stops the billing
relationship without destroying the record of it.

### Why feedback is anonymized rather than deleted

Chris's call, made with the tradeoff stated: it preserves product signal.

**The residual risk is real and must be mitigated in the runbook.** The
`message` column is free text (`0026_feedback.sql:8`). A user can type their own
email address, a performer's name, or any other personal data into it, and no
automated pass reliably detects that. Nulling the structured columns therefore
produces *pseudonymized*, not anonymized, data — a distinction GDPR cares about.

Mitigation: the runbook requires a human to read the organization's feedback
messages and redact or delete any containing personal data **before** running
the anonymization. This is a manual step and the spec does not pretend
otherwise.

`feedback.org_id` and `feedback.user_id` are `NOT NULL`, so anonymization needs
a schema change. Nothing reads the table (`src/lib/data/feedback.ts:28` is the
only query, an insert), so dropping those constraints is safe.

## Scope

### Files

| File | Change |
|---|---|
| `supabase/migrations/0030_org_deletion.sql` | *create* — `deletion_log` table; drop two NOT NULLs on `feedback` |
| `scripts/lib/org-deletion.mjs` | *create* — the deletion functions, client injected |
| `scripts/lib/org-deletion.test.mjs` | *create* — unit tests with a fake client |
| `scripts/delete-org.mjs` | *create* — CLI: dry-run default, `--confirm`, `--verify` |
| `src/lib/data/storage-paths.ts` | *create* — production/role/design path collection |
| `src/lib/data/storage-paths.test.ts` | *create* |
| `src/lib/storage.ts` | *modify* — `removeImages` must throw on error |
| `src/app/api/productions/[id]/route.ts` | *modify* — remove images before delete |
| `src/app/api/productions/[id]/roles/[roleId]/route.ts` | *modify* — same |
| `src/app/api/productions/[id]/designs/[designId]/route.ts` | *modify* — same |
| `docs/runbooks/delete-organization.md` | *create* — the operator procedure |

### Out of scope

- A user-facing delete button or any UI. The policy describes an email request.
- A Clerk webhook handler. Worth having eventually so a Clerk-side org deletion
  triggers cleanup, but it is a separate feature with its own security surface.
- A sweep of already-orphaned storage files from past deletes. Reconciling
  bucket contents against DB rows risks deleting live photos; it deserves its
  own spec.
- Per-user (as opposed to per-org) deletion. Clerk owns user records; no
  Supabase table stores user personal data except `feedback.user_email`, which
  this spec already handles.

## Migration `0030_org_deletion.sql`

```sql
-- Proof that a deletion request was honored. Deliberately holds no organization
-- content and no FK — by definition the org row is gone by the time this is
-- written. This is the record that demonstrates the 30-day commitment in
-- /privacy was met.
create table if not exists deletion_log (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  org_name text,
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  requested_by text,
  notes text
);

-- Feedback is anonymized rather than deleted when its org is removed, so these
-- two columns must be nullable. Nothing reads the table (only an insert in
-- src/lib/data/feedback.ts), so this is safe.
alter table feedback alter column org_id drop not null;
alter table feedback alter column user_id drop not null;
```

`requested_by` is optional free text. It may hold the requester's email where
retaining it is needed to evidence compliance; the runbook notes a
non-identifying reference is preferable where one exists.

## `scripts/lib/org-deletion.mjs`

Every exported function takes its client as the first argument so tests can
inject a fake. No module-level client, no `.env` reading — that belongs to the
CLI.

| Function | Signature | Behavior |
|---|---|---|
| `collectOrgStoragePaths` | `(sb, orgId) => Promise<string[]>` | Reads `productions.id` for the org, then `role_images` and `costume_design_images` for those productions; separately `inventory_items.id` for the org, then `inventory_item_images`. Returns all `storage_path` values, deduplicated. |
| `summarizeOrg` | `(sb, orgId) => Promise<Summary>` | Row counts per affected table plus the storage file count and the org name. Powers dry-run and `--verify`. |
| `cancelOrgSubscription` | `(stripe, sb, orgId) => Promise<{cancelled, subscriptionId}>` | Reads `org_subscriptions.stripe_subscription_id`; cancels it. No-ops cleanly when absent. Never deletes the Stripe customer. |
| `anonymizeOrgFeedback` | `(sb, orgId) => Promise<number>` | Sets `user_email`, `user_id`, `org_id` to NULL for the org's rows. Returns the count. |
| `deleteOrgRows` | `(sb, orgId) => Promise<Record<string, number>>` | Deletes `fabric_widths`, `fabric_suppliers`, `production_shares` (both org columns), then `organizations`. Returns per-table counts. |
| `writeDeletionLog` | `(sb, entry) => Promise<void>` | Inserts the `deletion_log` row. |

`Summary` shape: `{ orgName, tables: Record<string, number>, storageFiles: number }`.

Note that `anonymizeOrgFeedback` must run **before** `deleteOrgRows`, since it
matches on `org_id` — which that function nulls.

## `scripts/delete-org.mjs` — CLI

Reads `.env.local` the same way the existing script does
(`scripts/migrate-seeded-performers-to-roles.mjs:4-11`).

```
node scripts/delete-org.mjs --org <clerk_org_id> [--confirm] [--requested-at <ISO date>] [--requested-by <ref>] [--notes <text>]
node scripts/delete-org.mjs --org <clerk_org_id> --verify
```

**Dry-run is the default.** Without `--confirm` it prints the summary and exits
without mutating anything. `--requested-at` is required with `--confirm` — the
deletion log is worthless without the date the clock started.

Order of operations, which is the substance of this design:

1. **Snapshot** — org name and counts, before anything changes
2. **Cancel the Stripe subscription** — before local rows, or billing continues and the webhook loops
3. **Collect storage paths, then delete the files** — before the cascade, or the paths become unreachable
4. **Anonymize feedback** — before the org row goes, since it matches on `org_id`
5. **Delete the three remaining unconstrained tables** — `fabric_widths`,
   `fabric_suppliers`, `production_shares`. (`feedback` is the fourth table the
   cascade misses, but it is anonymized in step 4 rather than deleted.)
6. **Delete `organizations`** — the cascade handles everything else
7. **Write `deletion_log`**
8. **Print the manual Clerk step** and the exact `--verify` command

Any step failing aborts the run with a non-zero exit and a clear statement of
what has and has not been done. There is no transaction spanning Stripe,
Storage, and Postgres, so partial completion is possible by construction — the
script's job is to make the partial state legible, and `--verify` exists to
confirm the end state independently.

`--verify` re-runs `summarizeOrg` and asserts every count is zero, exiting
non-zero otherwise.

## Storage-orphan fix

`src/lib/data/storage-paths.ts`:

- `listProductionImagePaths(productionId): Promise<string[]>` — role images for the production's roles plus design images for its designs
- `listRoleImagePaths(roleId): Promise<string[]>`
- `listDesignImagePaths(designId): Promise<string[]>`

Each of the three delete routes collects paths, calls `removeImages`, then
deletes the row — matching the pattern the inventory route already uses
(`src/app/api/inventory/[itemId]/route.ts:45-57`).

`src/lib/storage.ts:31` currently discards its error:

```ts
export async function removeImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabaseAdmin.storage.from(ROLE_IMAGES_BUCKET).remove(paths);
}
```

Every other function in that file throws on error. It must too — a silent
storage failure during a compliance deletion means reporting success while the
files remain.

## Testing

`scripts/lib/org-deletion.test.mjs` — a fake client recording calls and
returning canned rows. Vitest's `include` currently covers only
`src/**/*.test.ts(x)` (`vitest.config.ts`), so it must be widened to pick up
`scripts/**/*.test.mjs`.

Cases that matter:

- `collectOrgStoragePaths` reaches inventory images, whose paths contain no production id — the easiest branch to miss
- `collectOrgStoragePaths` returns `[]` for an org with no images, and the caller does not then call `removeImages([])`
- `deleteOrgRows` deletes `production_shares` rows matched on *either* `source_org_id` or `accepted_by_org_id`
- `cancelOrgSubscription` no-ops when the org has no `org_subscriptions` row, and never calls `customers.del`
- `anonymizeOrgFeedback` nulls all three columns and leaves `message` intact
- The CLI performs no mutation without `--confirm` — asserted by running the
  dry-run path against a fake client and checking no write method was called

`src/lib/data/storage-paths.test.ts` follows the repo's existing
`src/lib/data/*.test.ts` mock patterns.

The full suite (597 at the time of writing) must stay green.

## Runbook — `docs/runbooks/delete-organization.md`

Operator procedure:

1. **Verify the requester.** Confirm they are an admin of the organization in
   Clerk. Record the date the request arrived — this starts the 30-day clock.
2. **Dry-run.** `node scripts/delete-org.mjs --org <id>` and sanity-check the
   counts against what you expect. A wildly wrong count means the wrong org id.
3. **Review feedback.** Read the organization's feedback messages and redact or
   delete any containing personal data before proceeding. Anonymization only
   clears the structured columns; free text is on you.
4. **Execute.** Re-run with `--confirm --requested-at <date>`.
5. **Delete the Clerk organization** in the Clerk dashboard, in the correct
   instance (production, not development).
6. **Verify.** `node scripts/delete-org.mjs --org <id> --verify`.
7. **Reply to the requester** confirming completion, and check `deletion_log`
   holds the row.

## Risks

- **Irreversible, with no undo.** Supabase Free has no PITR
  (see the infra notes), so a mistaken run cannot be rolled back. Dry-run
  default and `--confirm` are the guardrails; the runbook's count check is the
  real one.
- **No cross-system transaction.** Stripe, Storage, and Postgres cannot commit
  atomically. Ordering minimizes the damage of a partial run — the worst case at
  each step is a leftover the next run can clean up, never a charge against a
  deleted org or an unreachable file.
- **Pseudonymized, not anonymized, feedback.** Covered above. The runbook step
  is the mitigation, and it depends on a human actually doing it.
- **`--verify` cannot see Clerk.** It confirms Supabase and reports what it
  checked; the Clerk step is verified by eye in the dashboard.
