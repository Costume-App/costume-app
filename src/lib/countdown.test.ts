import { expect, test } from "vitest";
import { countdown, todayIso, formatShowDate } from "@/lib/countdown";

test("future date shows days to go", () => {
  expect(countdown("2026-07-16", "2026-06-04")).toEqual({
    days: 42,
    label: "42 days to go",
    tone: "future",
  });
});

test("one day away is singular", () => {
  expect(countdown("2026-06-05", "2026-06-04").label).toBe("1 day to go");
});

test("same day opens today", () => {
  expect(countdown("2026-06-04", "2026-06-04")).toEqual({
    days: 0,
    label: "Opens today!",
    tone: "today",
  });
});

test("past date shows days since, singular at one", () => {
  expect(countdown("2026-06-03", "2026-06-04")).toEqual({
    days: -1,
    label: "Opened 1 day ago",
    tone: "past",
  });
  expect(countdown("2026-06-01", "2026-06-04").label).toBe("Opened 3 days ago");
});

test("no show date returns neutral label", () => {
  expect(countdown(null, "2026-06-04")).toEqual({
    days: null,
    label: "No date set",
    tone: "none",
  });
});

test("crossing a year boundary counts whole days correctly", () => {
  expect(countdown("2027-01-01", "2026-12-31").days).toBe(1);
  expect(countdown("2026-12-31", "2027-01-01").days).toBe(-1);
});

test("todayIso formats a Date as local YYYY-MM-DD", () => {
  expect(todayIso(new Date(2026, 5, 4, 9, 30))).toBe("2026-06-04");
  expect(todayIso(new Date(2026, 0, 9))).toBe("2026-01-09");
});

test("formatShowDate renders a human-readable date with no timezone drift", () => {
  expect(formatShowDate("2026-07-16")).toBe("Jul 16, 2026");
  expect(formatShowDate("2026-01-01")).toBe("Jan 1, 2026");
  expect(formatShowDate("2026-12-31")).toBe("Dec 31, 2026");
});

import { nextUpcomingDate, latestDate } from "@/lib/countdown";

test("nextUpcomingDate returns the soonest date on or after today", () => {
  expect(nextUpcomingDate(["2026-07-01", "2026-06-10", "2026-06-20"], "2026-06-15")).toBe("2026-06-20");
});

test("nextUpcomingDate treats today as upcoming", () => {
  expect(nextUpcomingDate(["2026-06-15", "2026-08-01"], "2026-06-15")).toBe("2026-06-15");
});

test("nextUpcomingDate returns null when all dates are past", () => {
  expect(nextUpcomingDate(["2026-01-01", "2026-02-01"], "2026-06-15")).toBeNull();
});

test("nextUpcomingDate returns null for an empty list", () => {
  expect(nextUpcomingDate([], "2026-06-15")).toBeNull();
});

test("latestDate returns the maximum date", () => {
  expect(latestDate(["2026-07-01", "2026-06-10", "2026-08-20"])).toBe("2026-08-20");
});

test("latestDate returns null for an empty list", () => {
  expect(latestDate([])).toBeNull();
});
