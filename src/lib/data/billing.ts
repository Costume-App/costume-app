import { supabaseAdmin } from "@/lib/supabase-admin";

interface SubscriptionRow {
  status: string;
  current_period_end: string | null;
  comped: boolean;
}

// Unlimited == comped OR (active/trialing AND not expired).
export async function isUnlimited(orgId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("org_subscriptions")
    .select("status, current_period_end, comped")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as SubscriptionRow | null;
  if (!row) return false;
  if (row.comped) return true;
  if (row.status === "active" || row.status === "trialing") {
    return !row.current_period_end || new Date(row.current_period_end) > new Date();
  }
  return false;
}

// Paying == unlimited OR has bought at least one production unlock.
export async function isPaidOrg(orgId: string): Promise<boolean> {
  if (await isUnlimited(orgId)) return true;
  const { data, error } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data as unknown[] | null)?.length ?? 0) > 0;
}

export async function canCreateProduction(
  orgId: string,
): Promise<{ allowed: boolean; reason?: "needs_unlock"; unlimited: boolean }> {
  if (await isUnlimited(orgId)) return { allowed: true, unlimited: true };
  const { data, error } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .is("production_id", null)
    .limit(1);
  if (error) throw new Error(error.message);
  const has = ((data as unknown[] | null)?.length ?? 0) > 0;
  return has
    ? { allowed: true, unlimited: false }
    : { allowed: false, reason: "needs_unlock", unlimited: false };
}

// Atomically bind one unbound unlock to a production. Race-safe: the update's
// `.is("production_id", null)` guard means only one concurrent caller wins.
export async function consumeProductionUnlock(orgId: string, productionId: string): Promise<boolean> {
  const { data: rows, error: selErr } = await supabaseAdmin
    .from("production_purchases")
    .select("id")
    .eq("org_id", orgId)
    .is("production_id", null)
    .limit(1);
  if (selErr) throw new Error(selErr.message);
  const id = (rows as { id: string }[] | null)?.[0]?.id;
  if (!id) return false;
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("production_purchases")
    .update({ production_id: productionId })
    .eq("id", id)
    .is("production_id", null)
    .select("id");
  if (updErr) throw new Error(updErr.message);
  return ((updated as unknown[] | null)?.length ?? 0) > 0;
}
