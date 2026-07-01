import { expect, test } from "vitest";
import { PLANS } from "@/lib/billing-plans";

test("plan labels are Title Case", () => {
  expect(PLANS.perProduction.label).toBe("Pay Per Production");
  expect(PLANS.extraSeat.label).toBe("Extra Maker");
  expect(PLANS.unlimited.label).toBe("Unlimited");
});

test("price is the bare amount; cadence and points carry the rest", () => {
  for (const plan of Object.values(PLANS)) {
    expect(plan.price).toMatch(/^\$\d+(\.\d{2})?$/);
    expect(plan.cadence.length).toBeGreaterThan(0);
    expect(plan.points.length).toBeGreaterThan(0);
  }
});

test("plan points mirror the landing pricing tiers", () => {
  expect([...PLANS.perProduction.points]).toEqual(["1 production", "3 makers included", "+$10 per extra maker"]);
  expect([...PLANS.unlimited.points]).toEqual(["Unlimited productions", "Unlimited makers", "Best for ongoing programs"]);
  expect([...PLANS.extraSeat.points]).toEqual(["1 more maker on this production"]);
});
