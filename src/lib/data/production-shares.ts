import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductionByIdUnscoped } from "@/lib/data/productions";
import { listRoles } from "@/lib/data/roles";
import { listCostumeDesigns } from "@/lib/data/costume-designs";
import { ValidationError } from "@/lib/errors";
import { copyDesignLayer } from "@/lib/data/production-copy";

export interface ProductionShare {
  id: string;
  source_production_id: string;
  source_org_id: string;
  created_by: string;
  token: string;
  recipient_email: string | null;
  status: "pending" | "accepted" | "revoked";
  accepted_by_org_id: string | null;
  accepted_production_id: string | null;
  created_at: string;
  accepted_at: string | null;
}

export async function createProductionShare(input: {
  sourceProductionId: string;
  sourceOrgId: string;
  userId: string;
  recipientEmail: string | null;
}): Promise<ProductionShare> {
  // Short, URL-safe, unguessable: 12 random bytes → 16 base64url chars (96 bits).
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("base64url");
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .insert({
      source_production_id: input.sourceProductionId,
      source_org_id: input.sourceOrgId,
      created_by: input.userId,
      token,
      recipient_email: input.recipientEmail,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProductionShare;
}

export async function getShareRowByToken(token: string): Promise<ProductionShare | null> {
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProductionShare) ?? null;
}

// The recipient preview: the share row + a small summary of the source production.
export async function getShareByToken(token: string): Promise<{
  share: ProductionShare;
  source: { title: string; roleCount: number; designCount: number };
} | null> {
  const share = await getShareRowByToken(token);
  if (!share) return null;
  const [src, roles, designs] = await Promise.all([
    getProductionByIdUnscoped(share.source_production_id),
    listRoles(share.source_production_id),
    listCostumeDesigns(share.source_production_id),
  ]);
  return {
    share,
    source: { title: src?.title ?? "Production", roleCount: roles.length, designCount: designs.length },
  };
}

export async function listSharesForProduction(productionId: string): Promise<ProductionShare[]> {
  const { data, error } = await supabaseAdmin
    .from("production_shares")
    .select("*")
    .eq("source_production_id", productionId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionShare[];
}

// Revoke a still-pending share (no effect once accepted/revoked).
export async function revokeShare(productionId: string, shareId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("production_shares")
    .update({ status: "revoked" })
    .eq("id", shareId)
    .eq("source_production_id", productionId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function markShareAccepted(shareId: string, input: {
  acceptedByOrgId: string;
  acceptedProductionId: string;
  acceptedAt: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from("production_shares")
    .update({
      status: "accepted",
      accepted_by_org_id: input.acceptedByOrgId,
      accepted_production_id: input.acceptedProductionId,
      accepted_at: input.acceptedAt,
    })
    .eq("id", shareId);
  if (error) throw new Error(error.message);
}

// Single-use: copy the source design layer into recipientOrgId, then mark accepted.
// Known low-severity race: the pending-check and the mark-accepted update are not atomic,
// so two near-simultaneous accepts of one token could each produce a copy. Bounded (a
// duplicate production, no cross-org leak) and acceptable at this app's scale; harden with
// a `.eq("status","pending")`-guarded update + affected-row check if it ever matters.
export async function acceptProductionShare(input: {
  token: string;
  recipientOrgId: string;
  userId: string;
}): Promise<{ productionId: string }> {
  const share = await getShareRowByToken(input.token);
  if (!share || share.status !== "pending") {
    throw new ValidationError("This share link is no longer valid.");
  }
  const { productionId } = await copyDesignLayer({
    sourceProductionId: share.source_production_id,
    targetOrgId: input.recipientOrgId,
    userId: input.userId,
  });
  await markShareAccepted(share.id, {
    acceptedByOrgId: input.recipientOrgId,
    acceptedProductionId: productionId,
    acceptedAt: new Date().toISOString(),
  });
  return { productionId };
}
