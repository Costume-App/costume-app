// Organization deletion, factored so every function takes its client as the first
// argument — that is what makes the most dangerous code in this app unit-testable
// (see scripts/lib/org-deletion.test.mjs). This module reads no env and holds no
// client of its own; scripts/delete-org.mjs wires those in.
//
// Ordering matters and is enforced by the caller, not here:
//   cancel Stripe -> collect+delete storage -> anonymize feedback -> delete rows.
// See docs/superpowers/specs/2026-07-27-org-deletion-design.md.

// Tables carrying org_id directly. Cascade descendants are implied by these.
export const ORG_TABLES = [
  "productions",
  "makers",
  "inventory_items",
  "fabric_widths",
  "fabric_suppliers",
  "feedback",
  "production_shares",
  "org_subscriptions",
  "production_purchases",
  "seat_purchases",
  "org_domains",
];

// Unwraps a Supabase response, throwing with enough context (table + PostgREST
// code) to make a partial run legible instead of a bare "undefined" message.
function unwrap({ data, error }, label) {
  if (error) throw new Error(`${label}: ${error.code ?? "unknown"} ${error.message}`);
  return data ?? [];
}

// PostgREST caps an unbounded select at the project's max_rows (default 1000)
// with nothing distinguishing "this is all of them" from "this is the first
// 1000 of 4000." Requesting the exact count alongside the data and refusing to
// proceed on a mismatch turns silent truncation (files left unreachable forever
// once their rows cascade away) into a loud, actionable failure instead.
async function fetchColumn(sb, table, column, apply, label) {
  const { data, error, count } = await apply(sb.from(table).select(column, { count: "exact" }));
  if (error) throw new Error(`${label}: ${error.code ?? "unknown"} ${error.message}`);
  const rows = data ?? [];
  if (count != null && rows.length !== count) {
    throw new Error(
      `${label}: fetched ${rows.length} of ${count} rows — PostgREST truncated the result ` +
        `(likely max_rows). Refusing to proceed with a partial row set.`,
    );
  }
  return rows.map((r) => r[column]);
}

async function idsBy(sb, table, column, value) {
  return fetchColumn(sb, table, "id", (n) => n.eq(column, value), table);
}

async function idsWhereIn(sb, table, column, values) {
  if (values.length === 0) return [];
  return fetchColumn(sb, table, "id", (n) => n.in(column, values), table);
}

async function pathsIn(sb, table, column, ids) {
  if (ids.length === 0) return [];
  return fetchColumn(sb, table, "storage_path", (n) => n.in(column, ids), table);
}

// Every storage object the org owns. The bucket key format carries no org id, and
// inventory paths carry no production id either, so these joins are the only way
// to find the files — and they must run BEFORE the rows cascade away.
export async function collectOrgStoragePaths(sb, orgId) {
  const productionIds = await idsBy(sb, "productions", "org_id", orgId);

  let rolePaths = [];
  let designPaths = [];
  if (productionIds.length > 0) {
    const roleIds = await idsWhereIn(sb, "roles", "production_id", productionIds);
    const designIds = await idsWhereIn(sb, "costume_designs", "production_id", productionIds);
    rolePaths = await pathsIn(sb, "role_images", "role_id", roleIds);
    designPaths = await pathsIn(sb, "costume_design_images", "costume_design_id", designIds);
  }

  // Inventory items are org-scoped directly (not through a production), so this
  // branch runs unconditionally — an org can have inventory with zero productions.
  const itemIds = await idsBy(sb, "inventory_items", "org_id", orgId);
  const inventoryPaths = await pathsIn(sb, "inventory_item_images", "inventory_item_id", itemIds);

  return [...new Set([...rolePaths, ...designPaths, ...inventoryPaths])];
}

// NOTE: `organizations` (PK clerk_org_id) and `org_subscriptions` (PK org_id)
// have no `id` column at all. Every count below selects "*" with head:true
// instead of "id" — with head:true no rows come back, so the wider column list
// costs nothing, and it can't break on a table whose PK isn't called `id`
// (selecting "id" here is exactly how this broke before review: 42703 column
// org_subscriptions.id does not exist, on every single run).
async function countIn(sb, table, orgId) {
  if (table === "production_shares") {
    // Must cover both operations deleteOrgRows performs on this table (delete by
    // source_org_id, release by accepted_by_org_id) or the dry-run undercounts.
    const { count, error } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .or(`source_org_id.eq."${orgId}",accepted_by_org_id.eq."${orgId}"`);
    if (error) throw new Error(`${table}: ${error.code ?? "unknown"} ${error.message}`);
    return count ?? 0;
  }
  const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).eq("org_id", orgId);
  if (error) throw new Error(`${table}: ${error.code ?? "unknown"} ${error.message}`);
  return count ?? 0;
}

export async function summarizeOrg(sb, orgId) {
  const { data: org, error } = await sb
    .from("organizations")
    .select("name")
    .eq("clerk_org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`organizations: ${error.code ?? "unknown"} ${error.message}`);

  const tables = {};
  for (const table of ORG_TABLES) tables[table] = await countIn(sb, table, orgId);

  const storageFiles = (await collectOrgStoragePaths(sb, orgId)).length;
  return { orgName: org?.name ?? null, tables, storageFiles };
}

// Cancels the subscription. Deliberately does NOT delete the Stripe customer —
// invoices are the financial records /privacy promises to retain.
export async function cancelOrgSubscription(stripe, sb, orgId) {
  const { data, error } = await sb
    .from("org_subscriptions")
    .select("stripe_subscription_id")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`org_subscriptions: ${error.code ?? "unknown"} ${error.message}`);

  const subscriptionId = data?.stripe_subscription_id ?? null;
  if (!subscriptionId) return { cancelled: false, subscriptionId: null };

  await stripe.subscriptions.cancel(subscriptionId);
  return { cancelled: true, subscriptionId };
}

// Anonymize rather than delete: the product signal in `message` is kept, the owner
// columns are cleared. Must run BEFORE deleteOrgRows, which is what stops matching
// on org_id. Note this is pseudonymization, not anonymization — free text can hold
// personal data, which is why the runbook requires a human read first.
export async function anonymizeOrgFeedback(sb, orgId) {
  const rows = unwrap(
    await sb
      .from("feedback")
      .update({ user_email: null, user_id: null, org_id: null })
      .eq("org_id", orgId)
      .select("id"),
    "feedback",
  );
  return rows.length;
}

// The two tables the cascade misses outright (fabric_widths, fabric_suppliers —
// feedback is the third, handled above by anonymizing instead of deleting),
// production_shares (see below), then the org row itself — that cascade takes
// everything else (productions, makers, inventory_items, org_subscriptions, ...).
//
// production_shares is split into two operations rather than one delete matching
// either org column:
//   - rows where this org is the SOURCE (source_org_id) cascade away anyway once
//     `organizations` is deleted below (source_production_id -> productions ->
//     organizations, all ON DELETE CASCADE). Deleting them here explicitly just
//     makes the reported count honest instead of silently relying on a cascade
//     the operator never sees.
//   - rows where this org is the RECIPIENT (accepted_by_org_id) belong to a
//     DIFFERENT org's share: source_production_id, created_by, token, and
//     recipient_email are all that other customer's data. Deleting the row would
//     destroy their record that a share was ever accepted, so this is an UPDATE
//     that only clears the reference to the org being deleted — not a delete.
export async function deleteOrgRows(sb, orgId) {
  const counts = {};

  counts.fabric_widths = unwrap(
    await sb.from("fabric_widths").delete().eq("org_id", orgId).select("id"),
    "fabric_widths",
  ).length;

  counts.fabric_suppliers = unwrap(
    await sb.from("fabric_suppliers").delete().eq("org_id", orgId).select("id"),
    "fabric_suppliers",
  ).length;

  counts.production_shares_deleted = unwrap(
    await sb.from("production_shares").delete().eq("source_org_id", orgId).select("id"),
    "production_shares",
  ).length;

  counts.production_shares_released = unwrap(
    await sb
      .from("production_shares")
      .update({ accepted_by_org_id: null })
      .eq("accepted_by_org_id", orgId)
      .select("id"),
    "production_shares",
  ).length;

  counts.organizations = unwrap(
    await sb.from("organizations").delete().eq("clerk_org_id", orgId).select("clerk_org_id"),
    "organizations",
  ).length;

  return counts;
}

export async function writeDeletionLog(sb, entry) {
  const { error } = await sb.from("deletion_log").insert({
    org_id: entry.orgId,
    org_name: entry.orgName,
    requested_at: entry.requestedAt,
    requested_by: entry.requestedBy ?? null,
    notes: entry.notes ?? null,
  });
  if (error) throw new Error(`deletion_log: ${error.code ?? "unknown"} ${error.message}`);
}
