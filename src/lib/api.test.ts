import { expect, test } from "vitest";
import { errorResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth-context";
import { ValidationError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { PLANS } from "@/lib/billing-plans";

async function body(res: Response) {
  return (await res.json()) as { error: string };
}

test("AuthError maps to its own status", async () => {
  const res = errorResponse(new AuthError(403, "No active organization"));
  expect(res.status).toBe(403);
  expect((await body(res)).error).toBe("No active organization");
});

test("ValidationError maps to 400", async () => {
  expect(errorResponse(new ValidationError("Title is required")).status).toBe(400);
});

test("NotFoundError maps to 404", async () => {
  expect(errorResponse(new NotFoundError("Production not found")).status).toBe(404);
});

test("SyntaxError (bad JSON) maps to 400", async () => {
  expect(errorResponse(new SyntaxError("Unexpected token")).status).toBe(400);
});

test("unknown error maps to 500 with a generic, non-leaky message", async () => {
  const res = errorResponse(new Error("boom"));
  expect(res.status).toBe(500);
  const body = (await res.json()) as { error: string };
  expect(body.error).not.toContain("boom");
  expect(body.error).toBe("Something went wrong. Please try again.");
});

test("errorResponse maps PlanLimitError to 402 with reason and plans", async () => {
  const res = errorResponse(new PlanLimitError("needs_unlock"));
  expect(res.status).toBe(402);
  const body = await res.json();
  expect(body.reason).toBe("needs_unlock");
  expect(body.plans).toEqual(PLANS);
  expect(typeof body.error).toBe("string");
});
