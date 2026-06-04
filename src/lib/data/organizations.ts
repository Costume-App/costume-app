import { supabaseAdmin } from "@/lib/supabase-admin";

// Ensure an app-side organizations row exists for this Clerk org.
export async function ensureOrganization(clerkOrgId: string, name: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizations")
    // Insert-only: never overwrite an existing org's name on later writes.
    .upsert({ clerk_org_id: clerkOrgId, name }, { onConflict: "clerk_org_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}
