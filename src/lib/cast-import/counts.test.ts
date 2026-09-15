import { expect, test } from "vitest";
import { describeCounts } from "@/lib/cast-import/counts";

test("describeCounts lists only non-zero parts in natural English", () => {
  expect(describeCounts({ casts: 0, roles: 26, performers: 23, castings: 81 })).toBe(
    "26 new roles, 23 new performers and 81 castings",
  );
  expect(describeCounts({ casts: 1, roles: 0, performers: 1, castings: 0 })).toBe("1 new cast and 1 new performer");
  expect(describeCounts({ casts: 0, roles: 0, performers: 0, castings: 1 })).toBe("1 casting");
  expect(describeCounts({ casts: 0, roles: 0, performers: 0, castings: 0 })).toBe("nothing new");
});
