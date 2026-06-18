import { supabaseAdmin } from "@/lib/supabase-admin";
import { emailDomain, isPublicEmailDomain } from "@/lib/email-domains";

// Best-effort lazy capture: record this org's non-public email domain. Idempotent.
export async function recordOrgDomain(orgId: string, email: string): Promise<void> {
  const domain = emailDomain(email);
  if (!domain || isPublicEmailDomain(domain)) return;
  const { error } = await supabaseAdmin
    .from("org_domains")
    .upsert({ org_id: orgId, domain }, { onConflict: "org_id,domain", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export interface OrgDomainMatch {
  orgId: string;
  name: string;
}

// Orgs known to use this domain (name-joined). Empty for a public/blank domain.
export async function findOrgsByDomain(domain: string): Promise<OrgDomainMatch[]> {
  if (!domain || isPublicEmailDomain(domain)) return [];
  const normalized = domain.toLowerCase();
  const { data: rows, error } = await supabaseAdmin
    .from("org_domains")
    .select("org_id")
    .eq("domain", normalized);
  if (error) throw new Error(error.message);
  const orgIds = [...new Set(((rows as { org_id: string }[] | null) ?? []).map((r) => r.org_id))];
  if (orgIds.length === 0) return [];
  const { data: orgs, error: oErr } = await supabaseAdmin
    .from("organizations")
    .select("clerk_org_id, name")
    .in("clerk_org_id", orgIds);
  if (oErr) throw new Error(oErr.message);
  return ((orgs as { clerk_org_id: string; name: string }[] | null) ?? []).map((o) => ({
    orgId: o.clerk_org_id,
    name: o.name,
  }));
}
