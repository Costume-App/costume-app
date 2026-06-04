import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const getProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  getProduction: (...a: unknown[]) => getProduction(...a),
}));

import { assertProductionInOrg } from "@/lib/data/production-access";

beforeEach(() => getProduction.mockReset());

test("returns the production when it belongs to the org", async () => {
  getProduction.mockResolvedValue({ id: "p1", org_id: "org_1", title: "Mary Poppins" });
  const prod = await assertProductionInOrg("org_1", "p1");
  expect(getProduction).toHaveBeenCalledWith("org_1", "p1");
  expect(prod).toEqual({ id: "p1", org_id: "org_1", title: "Mary Poppins" });
});

test("throws NotFoundError when the production is missing or in another org", async () => {
  getProduction.mockResolvedValue(null);
  await expect(assertProductionInOrg("org_1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});
