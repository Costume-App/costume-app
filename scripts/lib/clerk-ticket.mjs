// Clerk sign-in tickets for the demo user. A ticket-minted session JWT
// expires in about 60 seconds, so callers mint one immediately before use
// (see record-core.mjs). The token never leaves this process.
import { assertDevClerkKey } from "./demo-org.mjs";

export async function mintSignInTicket(clerkUserId) {
  const key = process.env.CLERK_SECRET_KEY;
  assertDevClerkKey(key);
  const res = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: clerkUserId, expires_in_seconds: 300 }),
  });
  if (!res.ok) throw new Error(`mintSignInTicket: Clerk returned ${res.status}`);
  return (await res.json()).token;
}
