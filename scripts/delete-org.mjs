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
  console.log("\n  ✓ Supabase is clean for this org.");
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

console.log("\nDeleting — do not interrupt.\n");

// 1. Stripe first. After the org row goes, its webhooks fail the org FK and
//    Stripe retries them forever; and an uncancelled subscription keeps charging.
if (env.STRIPE_SECRET_KEY) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const { cancelled, subscriptionId } = await cancelOrgSubscription(stripe, sb, orgId);
  console.log(cancelled ? `  ✓ Stripe subscription ${subscriptionId} cancelled` : "  · no Stripe subscription");
} else {
  console.log("  · STRIPE_SECRET_KEY not set — skipping Stripe (cancel by hand if the org had a subscription)");
}

// 2. Storage before the cascade — afterwards the paths are unreachable.
const paths = await collectOrgStoragePaths(sb, orgId);
if (paths.length > 0) {
  const { error } = await sb.storage.from("role-images").remove(paths);
  if (error) throw new Error(`storage removal failed: ${error.message}`);
}
console.log(`  ✓ ${paths.length} storage objects removed`);

// 3. Feedback before the org row — this matches on org_id.
console.log(`  ✓ ${await anonymizeOrgFeedback(sb, orgId)} feedback rows anonymized`);

// 4. The tables the cascade misses, then the org row. deleteOrgRows returns
//    production_shares_deleted (this org was the share's source — genuinely
//    deleted) and production_shares_released (this org was the recipient of a
//    DIFFERENT org's share — only accepted_by_org_id was nulled, the row itself
//    belongs to that other customer and is left in place). Label the release
//    distinctly so the printed output can't be misread as "N more rows deleted."
for (const [table, count] of Object.entries(await deleteOrgRows(sb, orgId))) {
  const note = table === "production_shares_released" ? " (unlinked, not deleted — belongs to another org)" : "";
  console.log(`  ✓ ${table.padEnd(28)} ${count} rows${note}`);
}

// 5. Proof the request was honored.
await writeDeletionLog(sb, {
  orgId,
  orgName: summary.orgName,
  requestedAt,
  requestedBy: arg("requested-by"),
  notes: arg("notes"),
});
console.log("  ✓ deletion_log written");

console.log("\n  ⚠ MANUAL STEP REMAINING");
console.log("    Delete the Clerk organization by hand:");
console.log(`    dashboard.clerk.com → Organizations → ${orgId} → Delete`);
console.log("    Use the PRODUCTION instance, not development.\n");
console.log(`    Then: node scripts/delete-org.mjs --org ${orgId} --verify\n`);
