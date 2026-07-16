// Route patterns (Clerk createRouteMatcher syntax) reachable without signing in.
// `/` is handled separately in proxy.ts (logged-out visitors see the landing).
export const PUBLIC_ROUTES = [
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/get-started",
  "/api/billing/webhook",
  "/terms",
  "/privacy",
];
