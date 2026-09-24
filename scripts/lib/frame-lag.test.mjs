import { describe, it, expect } from "vitest";
import { parseSignalStats, arrivalTime, lagConstant } from "./frame-lag.mjs";

const LOG = [
  "frame:0    pts:0       pts_time:0",
  "lavfi.signalstats.VAVG=128.2",
  "frame:1    pts:40      pts_time:0.04",
  "lavfi.signalstats.VAVG=128.4",
  "frame:2    pts:80      pts_time:0.08",
  "lavfi.signalstats.VAVG=151.0",
].join("\n");

describe("parseSignalStats", () => {
  it("pairs each frame's pts_time with the requested key", () => {
    expect(parseSignalStats(LOG, "lavfi.signalstats.VAVG")).toEqual([
      { t: 0, v: 128.2 }, { t: 0.04, v: 128.4 }, { t: 0.08, v: 151 },
    ]);
  });
  it("ignores other keys", () => {
    expect(parseSignalStats(LOG, "lavfi.signalstats.UAVG")).toEqual([]);
  });
});

const series = (vals, step = 0.04) => vals.map((v, i) => ({ t: +(i * step).toFixed(2), v }));

describe("arrivalTime", () => {
  // 2 s of baseline at 128, the dot arrives at t = 2.2.
  const s = series([...Array(55).fill(128), ...Array(20).fill(150)]);
  it("finds the first frame that departs from the pre-mark baseline", () => {
    expect(arrivalTime(s, 2.0)).toBeCloseTo(2.2, 5);
  });
  it("returns null when nothing departs", () => {
    expect(arrivalTime(series(Array(80).fill(128)), 2.0)).toBeNull();
  });
  it("returns null when the baseline window has no frames", () => {
    expect(arrivalTime(s, 0.3)).toBeNull();
  });
});

describe("lagConstant", () => {
  it("is the worst observed lag plus one 25 fps frame, rounded up to 10 ms", () => {
    expect(lagConstant([0.12, 0.2, 0.161])).toBe(0.24);
  });
  it("never goes negative", () => {
    expect(lagConstant([-0.3, -0.1])).toBe(0);
  });
  it("refuses an empty sample", () => {
    expect(() => lagConstant([])).toThrow(/no lag samples/);
  });
});
