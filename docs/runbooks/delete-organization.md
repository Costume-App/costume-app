# Runbook: delete an organization

Use when someone emails privacy@measuremycostume.com asking for their
organization and its data to be deleted. `/privacy` and `/terms` commit us to
completing this **within 30 days of a verified request**.

This is irreversible. Supabase Free has no point-in-time recovery, so a wrong
org id cannot be undone.

**Prerequisite: migration `0030_org_deletion.sql` must be applied to this
database.** `--confirm` checks for this itself and refuses to run otherwise,
but check it up front — an un-migrated database still passes the dry run in
step 3 (it touches neither `deletion_log` nor the now-nullable `feedback`
columns), so the check only bites you at `--confirm` time. Confirm in Supabase
before you start, not mid-procedure.

## 1. Verify the requester

Confirm in the Clerk dashboard that they are an **admin** of the organization
they are asking about. Do not proceed on an email address alone.

**Record the date the request arrived.** That starts the 30-day clock and it is
what goes in `--requested-at`.

## 2. Find the org id

Clerk dashboard → Organizations → the org → copy its `org_…` id.

## 3. Dry run

    node scripts/delete-org.mjs --org <org_id>

Read the counts. They should look like the organization you expect — a company
with three productions should not report forty. **A surprising count means you
have the wrong id.** Stop and re-check.

This step needs no Clerk access and mutates nothing, so it's safe to run
before the Clerk organization is deleted in step 5.

## 4. Review the feedback rows

The script anonymizes feedback rather than deleting it, clearing the owner
columns but keeping `message`. Free text can contain personal data — someone's
own email address, a performer's name — and no automated pass catches that
reliably.

Read this organization's feedback messages in Supabase before continuing, and
delete or redact any that contain personal data:

    select id, created_at, message from feedback where org_id = '<org_id>' order by created_at;

Skipping this step means retaining personal data you told the requester you
deleted.

## 5. Delete the Clerk organization

Do this **before** running `--confirm`, not after. In the Clerk dashboard,
**production instance**, Organizations → the org → Delete.

This step moved ahead of the script run deliberately: `ensureOrganization` /
`ensureOrgRow` (`src/lib/data/organizations.ts`) re-create the `organizations`
row on demand from `POST /api/productions`, `/api/inventory`, `/api/makers`,
the fabric-settings routes, and the billing path. As long as the Clerk org and
its members' sessions exist, any member's in-flight request can resurrect the
row (and `recordOrgDomain` re-adds `org_domains`) between the script finishing
and you getting to this step. Deleting the Clerk org here invalidates member
sessions and closes that window before step 6 runs, so `--verify` in step 7
means something.

## 6. Delete

    node scripts/delete-org.mjs --org <org_id> --confirm --requested-at <YYYY-MM-DD> --requested-by "<reference>"

Use a non-identifying reference for `--requested-by` where you have one (a
ticket number). It is stored to evidence compliance, so avoid putting more
personal data in it than you need.

**Data retention note:** if this org was the *recipient* of a share from
another org, that other org's `production_shares` row is not deleted — only
unlinked (`accepted_by_org_id` set to null). Its `recipient_email` and other
fields survive as the source org's own record of whom they invited. That is
intentional (the same reasoning behind anonymizing rather than deleting
feedback), not an oversight — see the `production_shares_released` handling in
`scripts/lib/org-deletion.mjs`.

If the script aborts partway, **read the "Confirmed complete / Unknown /
Not attempted" lines it prints on failure** rather than guessing what
happened — the script tracks this precisely because there is no transaction
spanning Stripe, Storage, and Postgres, so a partial run is possible by
construction.

Before re-running, know that the steps are not equally safe to repeat:

- **Storage removal and row deletion are safe to re-run.** Removing
  already-removed storage objects or deleting already-deleted rows is a no-op
  (nothing matches, zero counts are reported).
- **The Stripe cancellation is not known to be safe to re-run.** Whether
  `stripe.subscriptions.cancel()` on an already-cancelled subscription is a
  no-op or an error was not established during development — the Stripe docs
  do not settle it either way. If the failure report shows the Stripe step
  already completed, check the subscription's status in the Stripe dashboard
  before re-running. If it shows already cancelled, be prepared for the
  re-run to error on that step and treat that as expected, not as a new
  failure — everything after it (storage, feedback, rows, log) will still
  need to run.
- If the failure was specifically the `deletion_log` write, the script tells
  you the deletion itself already succeeded and prints the exact values to
  insert by hand — do that instead of re-running the whole script.

Also note the storage-removal line: it now prints "N of M storage objects
removed" using the count Supabase actually confirms removed, not just the
number requested. A mismatch prints a loud warning but does not fail the run —
it can legitimately happen when an earlier production-copy left a row
referencing a file that was never created. Spot-check the bucket by hand if
the gap looks larger than that would explain.

## 7. Verify

    node scripts/delete-org.mjs --org <org_id> --verify

Expect "Supabase database rows are clean for this org." Note what this does
and doesn't check: it re-queries the same tables the dry run counted, plus
storage paths *inferred* from those rows (zero productions/inventory items
means there is nothing left to walk) — it does not re-list the bucket
directly, and it cannot see Clerk at all. Confirm the Clerk deletion from step
5 by eye if you have any doubt.

**If it reports NOT clean:** do not re-run `--confirm` blindly. Read which
tables in the printed summary are still nonzero and cross-reference against
the "Confirmed complete / Unknown / Not attempted" lines from step 6 if the
script failed there — that tells you which step to finish. If step 6 reported
full success but `--verify` still shows leftover rows, something outside the
script's model changed the data in between (e.g. a new production created via
a resurrected `organizations` row per step 5's note) — investigate by hand in
Supabase before touching anything else. Only re-run the script once you know
which step actually needs it, per the re-run guidance in step 6.

## 8. Close it out

Reply to the requester confirming completion. Check the `deletion_log` row
exists and its dates are right:

    select * from deletion_log where org_id = '<org_id>';

That row is the evidence the 30-day commitment was met.
