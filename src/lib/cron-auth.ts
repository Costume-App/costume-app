import { timingSafeEqual } from "node:crypto";

// Vercel Cron calls the scheduled path with `Authorization: Bearer <CRON_SECRET>`.
// Fails closed: no configured secret means no request is authorized.
export function isAuthorizedCronRequest(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const presented = Buffer.from(authHeader.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
}
