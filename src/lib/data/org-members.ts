import { clerkClient } from "@clerk/nextjs/server";

export interface OrgMember {
  userId: string;
  name: string;
  email: string;
  imageUrl: string;
}

// Live list of the org's Clerk members. Names/emails are never stored locally.
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId });
  return (data ?? []).map((m) => {
    const u = m.publicUserData;
    const userId = u?.userId ?? "";
    const email = u?.identifier ?? "";
    const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email;
    return { userId, name, email, imageUrl: u?.imageUrl ?? "" };
  });
}

// Org members with the admin role (email + name), for notifications/invites.
export async function listOrgAdmins(orgId: string): Promise<{ email: string; name: string }[]> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({ organizationId: orgId });
  return (data ?? [])
    .filter((m) => m.role === "org:admin")
    .map((m) => {
      const u = m.publicUserData;
      const email = u?.identifier ?? "";
      const name = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || email;
      return { email, name };
    })
    .filter((a) => a.email);
}
