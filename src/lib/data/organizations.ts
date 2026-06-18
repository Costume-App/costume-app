import { clerkClient } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Ensure an app-side organizations row exists for this Clerk org.
export async function ensureOrganization(clerkOrgId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizations")
    // Insert-only: never overwrite an existing org's name on later writes.
    .upsert({ clerk_org_id: clerkOrgId, name }, { onConflict: "clerk_org_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

// Ensure the organizations row exists when we only know the org by its Clerk id
// (e.g. a brand-new org that hasn't created a production yet). Other tables
// (org_subscriptions, org_domains, purchases) FK to organizations(clerk_org_id),
// so anything writing them for such an org must call this first. Cheap existence
// check; only fetches the Clerk org name when the row is actually missing.
export async function ensureOrgRow(clerkOrgId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("clerk_org_id")
    .eq("clerk_org_id", clerkOrgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const client = await clerkClient();
  const org = await client.organizations.getOrganization({ organizationId: clerkOrgId });
  await ensureOrganization(clerkOrgId, org.name);
}
