import { expect, test } from "vitest";
import { classifyProduction, partitionProductions } from "@/lib/production-status";

const TODAY = "2026-06-15";

test("classifyProduction: manually hidden is inactive even with future dates", () => {
  expect(classifyProduction(false, ["2026-09-01"], TODAY)).toBe("inactive");
});

test("classifyProduction: active flag with all past dates is past", () => {
  expect(classifyProduction(true, ["2026-01-01", "2026-05-01"], TODAY)).toBe("past");
});

test("classifyProduction: active flag with an upcoming date is active", () => {
  expect(classifyProduction(true, ["2026-05-01", "2026-09-01"], TODAY)).toBe("active");
});

test("classifyProduction: active flag with no dates is active", () => {
  expect(classifyProduction(true, [], TODAY)).toBe("active");
});

test("partitionProductions: buckets and sorts active by next upcoming, undated last", () => {
  const items = [
    { id: "a", is_active: true, created_at: "2026-01-01", dates: ["2026-09-01"] },
    { id: "b", is_active: true, created_at: "2026-02-01", dates: ["2026-07-01"] },
    { id: "c", is_active: true, created_at: "2026-03-01", dates: [] },
    { id: "d", is_active: false, created_at: "2026-04-01", dates: ["2026-08-01"] },
    { id: "e", is_active: true, created_at: "2026-05-01", dates: ["2026-02-01"] },
  ];
  const { active, inactive } = partitionProductions(items, TODAY);
  expect(active.map((p) => p.id)).toEqual(["b", "a", "c"]);
  expect(inactive.map((p) => p.id)).toEqual(["d", "e"]);
});

test("partitionProductions: inactive sorts by latest date desc, undated last", () => {
  const items = [
    { id: "x", is_active: false, created_at: "2026-01-01", dates: [] },
    { id: "y", is_active: true, created_at: "2026-02-01", dates: ["2026-03-01"] },
    { id: "z", is_active: true, created_at: "2026-03-01", dates: ["2026-05-10"] },
  ];
  const { inactive } = partitionProductions(items, TODAY);
  expect(inactive.map((p) => p.id)).toEqual(["z", "y", "x"]);
});
