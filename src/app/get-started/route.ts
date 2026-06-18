import { NextResponse } from "next/server";

const VALID = new Set(["unlock", "unlimited"]);

// Landing pricing cards link here. Remember the chosen plan in a one-shot cookie,
// then send the visitor to sign-up; /billing/resume picks it up once they have an org.
export async function GET(request: Request) {
  const plan = new URL(request.url).searchParams.get("plan");
  const res = NextResponse.redirect(new URL("/sign-up", request.url));
  if (plan && VALID.has(plan)) {
    res.cookies.set("checkout_intent", plan, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
  }
  return res;
}
