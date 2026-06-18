import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

// Best-effort: the signed-in user's primary email, or null if it can't be fetched.
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    return null;
  }
}
