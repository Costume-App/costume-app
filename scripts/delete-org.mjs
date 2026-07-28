// Operator-run organization deletion. Dry-run by default; --confirm mutates.
//
//   node scripts/delete-org.mjs --org <clerk_org_id>
//   node scripts/delete-org.mjs --org <clerk_org_id> --confirm --requested-at 2026-08-01 [--requested-by ref] [--notes text]
//   node scripts/delete-org.mjs --org <clerk_org_id> --verify
//
// Follow docs/runbooks/delete-organization.md — this script is one step in it, and
// it deliberately does NOT delete the Clerk organization.
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { readFileSync } from "node:fs";
import {
  collectOrgStoragePaths,
  summarizeOrg,
  cancelOrgSubscription,
  anonymizeOrgFeedback,
  deleteOrgRows,
  writeDeletionLog,
} from "./lib/org-deletion.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
const has = (name) => process.argv.includes(`--${name}`);

const orgId = arg("org");
if (!orgId) {
  console.error("Usage: node scripts/delete-org.mjs --org <clerk_org_id> [--confirm --requested-at <date>] [--verify]");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// production_shares' dry-run count matches EITHER org column (see
// summarizeOrg/countIn in lib/org-deletion.mjs) because deleteOrgRows performs
// two different operations on that table: rows where this org is the source
// are deleted, rows where it's the recipient are only released (unlinked) —
// see the production_shares_released annotation below. Flagging that here so
// the one pre-flight check an operator gets on an irreversible action doesn't
// read as "these will all be deleted."
function printSummary(summary) {
  console.log(`  organization: ${summary.orgName ?? "(not found)"}`);
  for (const [table, count] of Object.entries(summary.tables)) {
    const note =
      table === "production_shares"
        ? "  (includes shares that will be unlinked, not deleted — see production_shares_released)"
        : "";
    console.log(`  ${table.padEnd(22)} ${count}${note}`);
  }
  console.log(`  ${"storage files".padEnd(22)} ${summary.storageFiles}`);
}

// --verify: confirm the Supabase side is clean. Cannot see Clerk.
if (has("verify")) {
  const summary = await summarizeOrg(sb, orgId);
  printSummary(summary);
  const leftovers = Object.entries(summary.tables).filter(([, n]) => n > 0);
  if (leftovers.length > 0 || summary.storageFiles > 0 || summary.orgName !== null) {
    console.error("\n  ✗ NOT clean — the rows above are still present.");
    process.exit(1);
  }
  console.log("\n  ✓ Supabase database rows are clean for this org.");
  console.log("    Storage is INFERRED from those rows (zero productions and zero inventory");
  console.log("    items means collectOrgStoragePaths has nothing left to walk), not inspected");
  console.log("    directly — it does not re-list the bucket. See the storage-removal count");
  console.log("    printed during --confirm for the closest thing to direct evidence.");
  console.log("    This does NOT verify Clerk — check the dashboard by hand.");
  process.exit(0);
}

const summary = await summarizeOrg(sb, orgId);
if (summary.orgName === null) {
  console.error(`No organization row found for ${orgId}. Check the id.`);
  process.exit(1);
}

console.log(`\nOrganization ${orgId}`);
printSummary(summary);

if (!has("confirm")) {
  console.log("\n  DRY RUN — nothing was changed.");
  console.log("  Re-run with --confirm --requested-at <ISO date> to delete.");
  process.exit(0);
}

const requestedAt = arg("requested-at");
if (!requestedAt) {
  console.error("\n  --requested-at <ISO date> is required with --confirm.");
  console.error("  The deletion log is worthless without the date the 30-day clock started.");
  process.exit(2);
}
if (Number.isNaN(Date.parse(requestedAt))) {
  console.error(`\n  --requested-at "${requestedAt}" does not parse as a date.`);
  console.error("  A typo — or --confirm/another flag swallowing this value — would otherwise");
  console.error("  only be caught by Postgres at the very last, post-irreversible step.");
  console.error("  Pass an ISO date, e.g. 2026-08-01.");
  process.exit(2);
}

// Migration 0030 pre-flight. The dry run above touches neither deletion_log nor
// the now-nullable feedback columns, so it passes fine on an un-migrated
// database — this is the only thing standing between that and --confirm
// deleting storage irreversibly before failing on a missing table/constraint.
const migrationCheck = await sb.from("deletion_log").select("*", { count: "exact", head: true });
if (migrationCheck.error) {
  console.error("\n  ✗ Migration 0030 does not appear to be applied to this database.");
  console.error(`    deletion_log check failed: ${migrationCheck.error.code ?? "unknown"} ${migrationCheck.error.message}`);
  console.error("  Apply supabase/migrations/0030_org_deletion.sql to this database, then re-run.");
  process.exit(1);
}

// Without a Stripe key, an org WITH a subscription would be deleted while
// Stripe keeps billing a customer that no longer maps to anything, and the
// webhook 500s forever on the missing organizations FK. An org with no
// subscription has nothing to cancel, so it's safe to proceed without the key.
if (!env.STRIPE_SECRET_KEY && summary.tables.org_subscriptions > 0) {
  console.error("\n  ✗ STRIPE_SECRET_KEY is not set, and this organization has a subscription row.");
  console.error("    Deleting the org now would leave Stripe billing a deleted customer and send");
  console.error("    its webhook into an infinite retry loop against the missing organizations FK.");
  console.error("    Set STRIPE_SECRET_KEY in .env.local (or cancel the subscription by hand in");
  console.error("    Stripe first), then re-run.");
  process.exit(1);
}

console.log("\nDeleting — do not interrupt.\n");

// There is no transaction spanning Stripe, Storage, and Postgres, so a failure
// partway through is possible by construction. `completed` is only pushed to
// AFTER a step's own success is printed, so on failure it is an honest record
// of what really happened — not a guess — and everything not in it is exactly
// what remains unproven.
const STEP_NAMES = {
  stripe: "1. Stripe subscription cancel",
  storage: "2. storage object removal",
  feedback: "3. feedback anonymization",
  rows: "4. row deletion (fabric_widths, fabric_suppliers, production_shares, organizations)",
  log: "5. deletion_log write",
};
const completed = [];
const logEntry = {
  orgId,
  orgName: summary.orgName,
  requestedAt,
  requestedBy: arg("requested-by"),
  notes: arg("notes"),
};

try {
  // 1. Stripe first. After the org row goes, its webhooks fail the org FK and
  //    Stripe retries them forever; and an uncancelled subscription keeps charging.
  if (env.STRIPE_SECRET_KEY) {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const { cancelled, subscriptionId } = await cancelOrgSubscription(stripe, sb, orgId);
    console.log(cancelled ? `  ✓ Stripe subscription ${subscriptionId} cancelled` : "  · no Stripe subscription");
  } else {
    console.log("  · STRIPE_SECRET_KEY not set — skipping Stripe (cancel by hand if the org had a subscription)");
  }
  completed.push(STEP_NAMES.stripe);

  // 2. Storage before the cascade — afterwards the paths are unreachable.
  const paths = await collectOrgStoragePaths(sb, orgId);
  let removedCount = 0;
  if (paths.length > 0) {
    const { data, error } = await sb.storage.from("role-images").remove(paths);
    if (error) throw new Error(`storage removal failed: ${error.message}`);
    // `data` is what Supabase confirms actually left the bucket — `paths.length`
    // is only what we asked it to remove. Report the real number, not the claim.
    removedCount = (data ?? []).length;
  }
  if (removedCount === paths.length) {
    console.log(`  ✓ ${removedCount} of ${paths.length} storage objects removed`);
  } else {
    console.log(`  ⚠ ${removedCount} of ${paths.length} storage objects removed — MISMATCH.`);
    console.log("    Not necessarily a bug: a row can reference a file that was never actually");
    console.log("    created if an earlier copy failed partway (see production-copy.ts:45-49,");
    console.log("    which swallows that case). Spot-check the role-images bucket by hand if this");
    console.log("    gap looks larger than that would explain.");
  }
  completed.push(STEP_NAMES.storage);

  // 3. Feedback before the org row — this matches on org_id.
  console.log(`  ✓ ${await anonymizeOrgFeedback(sb, orgId)} feedback rows anonymized`);
  completed.push(STEP_NAMES.feedback);

  // 4. The tables the cascade misses, then the org row. deleteOrgRows returns
  //    production_shares_deleted (this org was the share's source — genuinely
  //    deleted) and production_shares_released (this org was the recipient of a
  //    DIFFERENT org's share — only accepted_by_org_id was nulled, the row itself
  //    belongs to that other customer and is left in place). Label the release
  //    distinctly so the printed output can't be misread as "N more rows deleted."
  //
  //    deleteOrgRows performs five sequential operations internally as one
  //    promise (frozen module, not ours to instrument). If it throws partway,
  //    we cannot know which of the five landed — that is reported honestly as
  //    "unknown" below, not as zero.
  for (const [table, count] of Object.entries(await deleteOrgRows(sb, orgId))) {
    const note = table === "production_shares_released" ? " (unlinked, not deleted — belongs to another org)" : "";
    console.log(`  ✓ ${table.padEnd(28)} ${count} rows${note}`);
  }
  completed.push(STEP_NAMES.rows);

  // 5. Proof the request was honored.
  await writeDeletionLog(sb, logEntry);
  console.log("  ✓ deletion_log written");
  completed.push(STEP_NAMES.log);
} catch (err) {
  const allSteps = Object.values(STEP_NAMES);
  const failedStep = allSteps[completed.length];
  const remaining = allSteps.slice(completed.length + 1);

  console.error(`\n  ✗ FAILED during: ${failedStep}`);
  console.error(`    ${err.message}`);
  console.error("");
  console.error(`  Confirmed complete: ${completed.length ? completed.join("; ") : "(none)"}`);
  console.error(`  Unknown (failed mid-step — may be partially applied, check Supabase/Stripe by hand): ${failedStep}`);
  console.error(`  Not attempted: ${remaining.length ? remaining.join("; ") : "(none)"}`);

  // The writeDeletionLog failure is materially different from every earlier
  // one: everything the request exists to do has already happened, and only
  // the compliance record is missing. Give the operator what they need to
  // write it by hand instead of leaving them to reconstruct it.
  if (failedStep === STEP_NAMES.log) {
    console.error("");
    console.error("  The deletion itself SUCCEEDED — Stripe, storage, feedback, and every row");
    console.error("  (including the organizations row) are gone. Only the deletion_log insert failed.");
    console.error("  Insert it by hand into deletion_log with these values:");
    console.error(`    org_id:       ${logEntry.orgId}`);
    console.error(`    org_name:     ${logEntry.orgName}`);
    console.error(`    requested_at: ${logEntry.requestedAt}`);
    console.error(`    requested_by: ${logEntry.requestedBy ?? "(null)"}`);
    console.error(`    notes:        ${logEntry.notes ?? "(null)"}`);
  } else {
    console.error("");
    console.error("  There is no transaction spanning Stripe, storage, and Postgres — do not assume");
    console.error("  re-running this script is safe without checking Supabase and Stripe by hand first.");
  }
  process.exit(1);
}

console.log("\n  ✓ Deletion complete.");
console.log("    Per the runbook, the Clerk organization should already be deleted (that step");
console.log("    now happens BEFORE --confirm, so its member sessions can't re-create rows this");
console.log("    script just removed). If it wasn't, do it now: dashboard.clerk.com →");
console.log(`    Organizations → ${orgId} → Delete, on the PRODUCTION instance.\n`);
console.log(`    Then: node scripts/delete-org.mjs --org ${orgId} --verify\n`);
