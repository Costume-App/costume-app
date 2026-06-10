import { expect, test } from "vitest";
import { makeStatus } from "@/lib/maker-status";

test("made is done regardless of assignment", () => {
  expect(makeStatus(true, "m1")).toBe("done");
  expect(makeStatus(true, null)).toBe("done");
});

test("assigned but not made is outstanding", () => {
  expect(makeStatus(false, "m1")).toBe("outstanding");
});

test("not made and unassigned is unassigned", () => {
  expect(makeStatus(false, null)).toBe("unassigned");
});
