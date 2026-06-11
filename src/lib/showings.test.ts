import { expect, test } from "vitest";
import { normalizeShowings } from "@/lib/showings";

test("drops rows with a blank or whitespace-only date", () => {
  expect(
    normalizeShowings([
      { date: "", time: "19:00" },
      { date: "   ", time: "" },
      { date: "2026-11-01", time: "" },
    ]),
  ).toEqual([{ date: "2026-11-01", time: null, label: null }]);
});

test("normalizes a blank or whitespace time to null and trims the date", () => {
  expect(normalizeShowings([{ date: "  2026-11-01 ", time: "   " }])).toEqual([
    { date: "2026-11-01", time: null, label: null },
  ]);
});

test("dedupes exact (date, time) pairs, preserving first-seen order", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-02", time: "19:00" },
      { date: "2026-11-01", time: "14:00" },
      { date: "2026-11-02", time: "19:00" },
    ]),
  ).toEqual([
    { date: "2026-11-02", time: "19:00", label: null },
    { date: "2026-11-01", time: "14:00", label: null },
  ]);
});

test("keeps distinct times on the same date as separate showings", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "14:00" },
      { date: "2026-11-01", time: "19:00" },
    ]),
  ).toEqual([
    { date: "2026-11-01", time: "14:00", label: null },
    { date: "2026-11-01", time: "19:00", label: null },
  ]);
});

test("returns an empty array for no rows", () => {
  expect(normalizeShowings([])).toEqual([]);
});

test("normalizeShowings carries a trimmed label and nulls a blank one", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "19:00", label: "  Opening Night " },
      { date: "2026-11-02", time: "", label: "   " },
      { date: "2026-11-03", time: "" },
    ]),
  ).toEqual([
    { date: "2026-11-01", time: "19:00", label: "Opening Night" },
    { date: "2026-11-02", time: null, label: null },
    { date: "2026-11-03", time: null, label: null },
  ]);
});

test("normalizeShowings dedupes by date+time, keeping the first label", () => {
  expect(
    normalizeShowings([
      { date: "2026-11-01", time: "19:00", label: "Tech" },
      { date: "2026-11-01", time: "19:00", label: "Other" },
    ]),
  ).toEqual([{ date: "2026-11-01", time: "19:00", label: "Tech" }]);
});
