import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { orgGate } from "@/lib/route-guard";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/get-started", "/api/billing/webhook"]);
const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  // Canonical home: logged-out visitors see the landing (the `/` page);
  // logged-in users go straight to the app (org-less users then cascade to
  // /onboarding via orgGate on /productions).
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (userId) return NextResponse.redirect(new URL("/productions", req.url));
    return;
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
