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
