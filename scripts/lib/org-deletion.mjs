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

function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function idsBy(sb, table, column, value) {
  return unwrap(await sb.from(table).select("id").eq(column, value)).map((r) => r.id);
}

async function pathsIn(sb, table, column, ids) {
  if (ids.length === 0) return [];
  return unwrap(await sb.from(table).select("storage_path").in(column, ids)).map((r) => r.storage_path);
}

// Every storage object the org owns. The bucket key format carries no org id, and
// inventory paths carry no production id either, so these joins are the only way
// to find the files — and they must run BEFORE the rows cascade away.
export async function collectOrgStoragePaths(sb, orgId) {
  const productionIds = await idsBy(sb, "productions", "org_id", orgId);

  let rolePaths = [];
  let designPaths = [];
  if (productionIds.length > 0) {
    const roleIds = unwrap(
      await sb.from("roles").select("id").in("production_id", productionIds),
    ).map((r) => r.id);
    const designIds = unwrap(
      await sb.from("costume_designs").select("id").in("production_id", productionIds),
    ).map((r) => r.id);
    rolePaths = await pathsIn(sb, "role_images", "role_id", roleIds);
    designPaths = await pathsIn(sb, "costume_design_images", "costume_design_id", designIds);
  }

  const itemIds = await idsBy(sb, "inventory_items", "org_id", orgId);
  const inventoryPaths = await pathsIn(sb, "inventory_item_images", "inventory_item_id", itemIds);

  return [...new Set([...rolePaths, ...designPaths, ...inventoryPaths])];
}

async function countIn(sb, table, orgId) {
  const column = table === "production_shares" ? "source_org_id" : "org_id";
  const { count, error } = await sb.from(table).select("id", { count: "exact", head: true }).eq(column, orgId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function summarizeOrg(sb, orgId) {
  const { data: org, error } = await sb
    .from("organizations")
    .select("name")
    .eq("clerk_org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);

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
  if (error) throw new Error(error.message);

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
  );
  return rows.length;
}

// The three tables the cascade misses (feedback is the fourth, handled above),
// then the org row itself — that cascade takes everything else.
export async function deleteOrgRows(sb, orgId) {
  const counts = {};

  counts.fabric_widths = unwrap(
    await sb.from("fabric_widths").delete().eq("org_id", orgId).select("id"),
  ).length;

  counts.fabric_suppliers = unwrap(
    await sb.from("fabric_suppliers").delete().eq("org_id", orgId).select("id"),
  ).length;

  counts.production_shares = unwrap(
    await sb
      .from("production_shares")
      .delete()
      .or(`source_org_id.eq.${orgId},accepted_by_org_id.eq.${orgId}`)
      .select("id"),
  ).length;

  counts.organizations = unwrap(
    await sb.from("organizations").delete().eq("clerk_org_id", orgId).select("clerk_org_id"),
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
  if (error) throw new Error(error.message);
}
