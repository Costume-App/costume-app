import { describe, expect, test } from "vitest";
import { orderPerformers, neighbors, type SwitcherPerformer } from "@/lib/performer-order";

const p = (id: string, label: string, createdAt: string, filled = 0): SwitcherPerformer => ({
  id,
  label,
  createdAt,
  filled,
});

// Added order: Zed, Amy, Bo, Cy. Role order puts Bo first (Lead), then Zed, then Amy.
const performers = [
  p("z", "Zed", "2026-01-01", 0),
  p("a", "Amy", "2026-01-02", 22),
  p("b", "Bo", "2026-01-03", 5),
  p("c", "Cy", "2026-01-04", 0),
];
const roleOrder = ["b", "z", "a", "b"]; // Bo is in two roles; first appearance wins. Cy is uncast.

describe("orderPerformers", () => {
  test("by role: cast performers in role order, first appearance wins, uncast last in added order", () => {
    expect(orderPerformers(performers, "role", roleOrder).map((x) => x.id)).toEqual(["b", "z", "a", "c"]);
  });

  test("a to z sorts by name, case-insensitively", () => {
    const withLower = [...performers, p("d", "ada", "2026-01-05")];
    expect(orderPerformers(withLower, "alpha", roleOrder).map((x) => x.id)).toEqual(["d", "a", "b", "c", "z"]);
  });

  test("added keeps creation order", () => {
    expect(orderPerformers(performers, "added", roleOrder).map((x) => x.id)).toEqual(["z", "a", "b", "c"]);
  });
});

describe("neighbors", () => {
  const ordered = orderPerformers(performers, "added", roleOrder); // z a b c

  test("prev and next in order when not skipping", () => {
    expect(neighbors(ordered, "a", { skipComplete: false, total: 22 })).toEqual({ prev: "z", next: "b" });
  });

  test("no prev at the start, no next at the end", () => {
    expect(neighbors(ordered, "z", { skipComplete: false, total: 22 })).toEqual({ prev: null, next: "a" });
    expect(neighbors(ordered, "c", { skipComplete: false, total: 22 })).toEqual({ prev: "b", next: null });
  });

  test("skip complete jumps over fully measured performers", () => {
    expect(neighbors(ordered, "z", { skipComplete: true, total: 22 })).toEqual({ prev: null, next: "b" });
    expect(neighbors(ordered, "b", { skipComplete: true, total: 22 })).toEqual({ prev: "z", next: "c" });
  });

  test("the current performer can be complete and still navigate from", () => {
    expect(neighbors(ordered, "a", { skipComplete: true, total: 22 })).toEqual({ prev: "z", next: "b" });
  });

  test("everyone else complete: nowhere to go", () => {
    const done = orderPerformers(
      [p("z", "Zed", "1", 22), p("a", "Amy", "2", 5), p("b", "Bo", "3", 22)],
      "added",
      [],
    );
    expect(neighbors(done, "a", { skipComplete: true, total: 22 })).toEqual({ prev: null, next: null });
  });

  test("unknown current id has no neighbors", () => {
    expect(neighbors(ordered, "nope", { skipComplete: false, total: 22 })).toEqual({ prev: null, next: null });
  });
});
