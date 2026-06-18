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

// Distinct non-null maker ids across a production's costume pieces.
export async function productionMakerIds(productionId: string): Promise<Set<string>> {
  const { data: designs, error: dErr } = await supabaseAdmin
    .from("costume_designs")
    .select("id")
    .eq("production_id", productionId);
  if (dErr) throw new Error(dErr.message);
  const designIds = ((designs as { id: string }[] | null) ?? []).map((d) => d.id);
  if (designIds.length === 0) return new Set();
  const { data: pieces, error: pErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("maker_id")
    .in("costume_design_id", designIds);
  if (pErr) throw new Error(pErr.message);
  const ids = ((pieces as { maker_id: string | null }[] | null) ?? [])
    .map((p) => p.maker_id)
    .filter((m): m is string => Boolean(m));
  return new Set(ids);
}

async function seatPurchaseCount(productionId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("seat_purchases")
    .select("id")
    .eq("production_id", productionId);
  if (error) throw new Error(error.message);
  return (data as unknown[] | null)?.length ?? 0;
}

export async function productionSeatCap(orgId: string, productionId: string): Promise<number> {
  if (await isUnlimited(orgId)) return Infinity;
  return 3 + (await seatPurchaseCount(productionId));
}

export async function canAssignMakerToProduction(
  orgId: string,
  productionId: string,
  makerId: string,
): Promise<{ allowed: boolean; reason?: "needs_seat" }> {
  if (await isUnlimited(orgId)) return { allowed: true };
  const makerIds = await productionMakerIds(productionId);
  if (makerIds.has(makerId)) return { allowed: true };
  const cap = 3 + (await seatPurchaseCount(productionId));
  if (makerIds.size < cap) return { allowed: true };
  return { allowed: false, reason: "needs_seat" };
}
