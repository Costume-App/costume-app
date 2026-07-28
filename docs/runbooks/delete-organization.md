# Runbook: delete an organization

Use when someone emails privacy@measuremycostume.com asking for their
organization and its data to be deleted. `/privacy` and `/terms` commit us to
completing this **within 30 days of a verified request**.

This is irreversible. Supabase Free has no point-in-time recovery, so a wrong
org id cannot be undone.

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

## 5. Delete

    node scripts/delete-org.mjs --org <org_id> --confirm --requested-at <YYYY-MM-DD> --requested-by "<reference>"

Use a non-identifying reference for `--requested-by` where you have one (a
ticket number). It is stored to evidence compliance, so avoid putting more
personal data in it than you need.

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

## 6. Delete the Clerk organization

The script does not do this. In the Clerk dashboard, **production instance**,
Organizations → the org → Delete.

## 7. Verify

    node scripts/delete-org.mjs --org <org_id> --verify

Expect "Supabase is clean for this org." This cannot see Clerk — confirm step 6
by eye.

## 8. Close it out

Reply to the requester confirming completion. Check the `deletion_log` row
exists and its dates are right:

    select * from deletion_log where org_id = '<org_id>';

That row is the evidence the 30-day commitment was met.
