import { expect, test } from "vitest";
import { errorResponse } from "@/lib/api";
import { AuthError } from "@/lib/auth-context";
import { ValidationError, NotFoundError } from "@/lib/errors";

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

test("unknown error maps to 500", async () => {
  expect(errorResponse(new Error("boom")).status).toBe(500);
});
