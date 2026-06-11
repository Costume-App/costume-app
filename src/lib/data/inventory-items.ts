import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface InventoryItem {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  size: string | null;
  quantity: number;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryUsage {
  designId: string;
  designName: string;
  productionId: string;
  productionName: string;
  roleId: string;
  roleName: string;
}

interface InventoryInput {
  name?: string;
  category?: string | null;
  size?: string | null;
  quantity?: number;
  location?: string | null;
  notes?: string | null;
}

const clean = (s: string | null | undefined): string | null => s?.trim() || null;
const cleanQuantity = (q: number | undefined): number =>
  typeof q === "number" && Number.isFinite(q) && q >= 0 ? Math.floor(q) : 1;

export async function listInventoryItems(orgId: string): Promise<InventoryItem[]> {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryItem[];
}

export async function getInventoryItem(orgId: string, id: string): Promise<InventoryItem> {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Inventory item not found");
  return data as InventoryItem;
}

export async function createInventoryItem(orgId: string, input: InventoryInput): Promise<InventoryItem> {
  const name = (input.name ?? "").trim();
  if (!name) throw new ValidationError("Item name is required");
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .insert({
      org_id: orgId,
      name,
      category: clean(input.category),
      size: clean(input.size),
      quantity: cleanQuantity(input.quantity),
      location: clean(input.location),
      notes: clean(input.notes),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as InventoryItem;
}

export async function updateInventoryItem(
  orgId: string,
  id: string,
  patch: InventoryInput,
): Promise<InventoryItem> {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Item name is required");
    update.name = trimmed;
  }
  if (patch.category !== undefined) update.category = clean(patch.category);
  if (patch.size !== undefined) update.size = clean(patch.size);
  if (patch.quantity !== undefined) update.quantity = cleanQuantity(patch.quantity);
  if (patch.location !== undefined) update.location = clean(patch.location);
  if (patch.notes !== undefined) update.notes = clean(patch.notes);
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Inventory item not found");
  return data as InventoryItem;
}

export async function deleteInventoryItem(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("inventory_items")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

interface UsageRow {
  id: string;
  name: string;
  production_id: string;
  role_id: string;
  productions: { title: string } | null;
  roles: { name: string } | null;
}

// Where a library item is currently pulled in: each linked costume_design with
// its production + role names. Spans all productions in the org.
export async function listInventoryUsage(itemId: string): Promise<InventoryUsage[]> {
  const { data, error } = await supabaseAdmin
    .from("costume_designs")
    .select("id, name, production_id, role_id, productions(title), roles(name)")
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as UsageRow[]).map((d) => ({
    designId: d.id,
    designName: d.name,
    productionId: d.production_id,
    productionName: d.productions?.title ?? "",
    roleId: d.role_id,
    roleName: d.roles?.name ?? "",
  }));
}
