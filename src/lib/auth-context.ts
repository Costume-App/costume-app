import { auth } from "@clerk/nextjs/server";

export interface AuthContext {
  userId: string;
  orgId: string;
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

// Resolve the signed-in user and their active org, or fail closed.
export async function getAuthContext(): Promise<AuthContext> {
  const { userId, orgId } = await auth();
  if (!userId) throw new AuthError(401, "Not signed in");
  if (!orgId) throw new AuthError(403, "No active organization");
  return { userId, orgId };
}

// Like getAuthContext, but also asserts the caller is an org Admin (Clerk role).
// Used by the org fabric-settings write routes.
export async function requireOrgAdmin(): Promise<AuthContext> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) throw new AuthError(401, "Not signed in");
  if (!orgId) throw new AuthError(403, "No active organization");
  // Fails closed: a missing/undefined role is treated as non-admin.
  if (orgRole !== "org:admin") throw new AuthError(403, "Admin access required");
  return { userId, orgId };
}
