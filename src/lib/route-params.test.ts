import { expect, test, vi } from "vitest";

const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import { isUuid, idParams, pageIdParams } from "@/lib/route-params";
import { NotFoundError } from "@/lib/errors";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("isUuid accepts canonical UUIDs in either case", () => {
  expect(isUuid(A)).toBe(true);
  expect(isUuid("ABCDEF01-2345-4678-9ABC-DEF012345678")).toBe(true);
});

test("isUuid rejects malformed values", () => {
  for (const v of ["", "not-a-uuid", "p1", `${A} `, `{${A}}`, A.replace(/-/g, ""), `${A}0`]) {
    expect(isUuid(v)).toBe(false);
  }
});

test("idParams returns the params when every value is a UUID", async () => {
  await expect(idParams(Promise.resolve({ id: A, roleId: B }))).resolves.toEqual({ id: A, roleId: B });
});

test("idParams throws NotFoundError when any value is malformed", async () => {
  await expect(idParams(Promise.resolve({ id: A, roleId: "nope" }))).rejects.toBeInstanceOf(NotFoundError);
  await expect(idParams(Promise.resolve({ id: "nope" }))).rejects.toBeInstanceOf(NotFoundError);
});

test("pageIdParams returns valid params without calling notFound", async () => {
  notFound.mockClear();
  await expect(pageIdParams(Promise.resolve({ id: A }))).resolves.toEqual({ id: A });
  expect(notFound).not.toHaveBeenCalled();
});

test("pageIdParams calls notFound for a malformed value", async () => {
  notFound.mockClear();
  await expect(pageIdParams(Promise.resolve({ id: "nope" }))).rejects.toThrow("NEXT_NOT_FOUND");
  expect(notFound).toHaveBeenCalledTimes(1);
});
