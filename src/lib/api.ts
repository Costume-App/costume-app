import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth-context";
import { ValidationError, NotFoundError, PlanLimitError, ConflictError } from "@/lib/errors";
import { PLANS } from "@/lib/billing-plans";

// Maps known error types to HTTP responses; everything else is a 500.
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof PlanLimitError) {
    return NextResponse.json({ error: err.message, reason: err.reason, plans: PLANS }, { status: 402 });
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof ConflictError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  // Log the real error server-side, but don't leak internals (e.g. raw DB
  // messages) to the client.
  console.error("Unhandled API error:", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
