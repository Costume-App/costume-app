import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError, NotFoundError } from "@/lib/errors";

export interface FabricWidth {
  id: string;
  org_id: string;
  value: string;
  is_default: boolean;
  created_at: string;
}

export interface FabricSupplier {
  id: string;
  org_id: string;
  name: string;
  price_per_yard: number | null;
  is_default: boolean;
  created_at: string;
}

// Clear the existing default in a list so only one row is is_default at a time.
async function clearDefault(table: "fabric_widths" | "fabric_suppliers", orgId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from(table)
    .update({ is_default: false })
    .eq("org_id", orgId)
    .eq("is_default", true);
  if (error) throw new Error(error.message);
}

// --- Widths ---

export async function listFabricWidths(orgId: string): Promise<FabricWidth[]> {
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FabricWidth[];
}

export async function createFabricWidth(
  orgId: string,
  input: { value: string; isDefault: boolean },
): Promise<FabricWidth> {
  const value = input.value.trim();
  if (!value) throw new ValidationError("Width is required");
  if (input.isDefault) await clearDefault("fabric_widths", orgId);
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .insert({ org_id: orgId, value, is_default: input.isDefault })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FabricWidth;
}

export async function updateFabricWidth(
  orgId: string,
  id: string,
  patch: { value?: string; isDefault?: boolean },
): Promise<FabricWidth> {
  const update: { value?: string; is_default?: boolean } = {};
  if (patch.value !== undefined) {
    const trimmed = patch.value.trim();
    if (!trimmed) throw new ValidationError("Width is required");
    update.value = trimmed;
  }
  if (patch.isDefault === true) {
    await clearDefault("fabric_widths", orgId);
    update.is_default = true;
  } else if (patch.isDefault === false) {
    update.is_default = false;
  }
  const { data, error } = await supabaseAdmin
    .from("fabric_widths")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Width not found");
  return data as FabricWidth;
}

export async function deleteFabricWidth(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fabric_widths")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

// --- Suppliers ---

export async function listFabricSuppliers(orgId: string): Promise<FabricSupplier[]> {
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FabricSupplier[];
}

export async function createFabricSupplier(
  orgId: string,
  input: { name: string; pricePerYard: number | null; isDefault: boolean },
): Promise<FabricSupplier> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Supplier name is required");
  if (input.isDefault) await clearDefault("fabric_suppliers", orgId);
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .insert({ org_id: orgId, name, price_per_yard: input.pricePerYard, is_default: input.isDefault })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FabricSupplier;
}

export async function updateFabricSupplier(
  orgId: string,
  id: string,
  patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean },
): Promise<FabricSupplier> {
  const update: { name?: string; price_per_yard?: number | null; is_default?: boolean } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Supplier name is required");
    update.name = trimmed;
  }
  if (patch.pricePerYard !== undefined) update.price_per_yard = patch.pricePerYard;
  if (patch.isDefault === true) {
    await clearDefault("fabric_suppliers", orgId);
    update.is_default = true;
  } else if (patch.isDefault === false) {
    update.is_default = false;
  }
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .update(update)
    .eq("id", id)
    .eq("org_id", orgId)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new NotFoundError("Supplier not found");
  return data as FabricSupplier;
}

export async function deleteFabricSupplier(orgId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("fabric_suppliers")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}
