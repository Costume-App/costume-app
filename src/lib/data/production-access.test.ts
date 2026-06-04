import { expect, test, vi, beforeEach } from "vitest";
import { NotFoundError } from "@/lib/errors";

const getProduction = vi.fn();
vi.mock("@/lib/data/productions", () => ({
  getProduction: (...a: unknown[]) => getProduction(...a),
}));

const getPerformerProductionId = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  getPerformerProductionId: (...a: unknown[]) => getPerformerProductionId(...a),
}));

import { assertProductionInOrg, assertPerformerInOrg } from "@/lib/data/production-access";

beforeEach(() => {
  getProduction.mockReset();
  getPerformerProductionId.mockReset();
});

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

test("assertPerformerInOrg resolves when the performer's production is in the org", async () => {
  getPerformerProductionId.mockResolvedValue("p1");
  getProduction.mockResolvedValue({ id: "p1", org_id: "org_1" });
  await expect(assertPerformerInOrg("org_1", "pf1")).resolves.toBeUndefined();
  expect(getPerformerProductionId).toHaveBeenCalledWith("pf1");
  expect(getProduction).toHaveBeenCalledWith("org_1", "p1");
});

test("assertPerformerInOrg throws NotFoundError when the performer is missing", async () => {
  getPerformerProductionId.mockResolvedValue(null);
  await expect(assertPerformerInOrg("org_1", "nope")).rejects.toBeInstanceOf(NotFoundError);
});

test("assertPerformerInOrg throws NotFoundError when the production is in another org", async () => {
  getPerformerProductionId.mockResolvedValue("p1");
  getProduction.mockResolvedValue(null);
  await expect(assertPerformerInOrg("org_1", "pf1")).rejects.toBeInstanceOf(NotFoundError);
});
