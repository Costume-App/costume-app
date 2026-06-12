import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { orgGate } from "@/lib/route-guard";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/preview(.*)"]);
const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);

// Marketing domains: each one's homepage serves its landing page (A/B for the app
// name). Pointing the domain at this deployment is all that's needed — the root
// rewrites here. Other hosts (the app domain, localhost) keep normal behavior.
const LANDING_BY_HOST: Record<string, string> = {
  "makethedrama.com": "/preview/make-the-drama",
  "www.makethedrama.com": "/preview/make-the-drama",
  "measuremycostume.com": "/preview/measure-my-costume",
  "www.measuremycostume.com": "/preview/measure-my-costume",
};

export default clerkMiddleware(async (auth, req) => {
  const host = (req.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const landing = LANDING_BY_HOST[host];
  if (landing && req.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL(landing, req.url));
  }

  if (isPublic(req)) return;

  // Require a signed-in user for everything else.
  await auth.protect();

  // Then require an active organization, routing org-less users to onboarding
  // instead of letting protected pages throw "No active organization".
  const { orgId } = await auth();
  const decision = orgGate({ isOnboarding: isOnboarding(req), orgId: orgId ?? null });
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, req.url));
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/(api|trpc)(.*)"],
};
