import { describe, it, expect } from "vitest";
import { parseFreezes, unexplainedFreezes } from "./qc.mjs";

const log = [
  "frame:10 pts:10 pts_time:0.33",
  "lavfi.freezedetect.freeze_start=12.5",
  "lavfi.freezedetect.freeze_duration=7.2",
  "lavfi.freezedetect.freeze_end=19.7",
  "lavfi.freezedetect.freeze_start=40",
  "lavfi.freezedetect.freeze_duration=6.5",
  "lavfi.freezedetect.freeze_end=46.5",
].join("\n");

describe("parseFreezes", () => {
  it("pairs starts with durations", () => {
    expect(parseFreezes(log)).toEqual([{ start: 12.5, duration: 7.2 }, { start: 40, duration: 6.5 }]);
  });
  it("keeps an unterminated freeze at the end with a null duration", () => {
    expect(parseFreezes("lavfi.freezedetect.freeze_start=3")).toEqual([{ start: 3, duration: null }]);
  });
});

describe("unexplainedFreezes", () => {
  it("drops freezes inside zooms or title cards", () => {
    const sidecar = { zooms: [{ start: 12, end: 20 }] };
    const out = unexplainedFreezes(parseFreezes(log), sidecar, { cardS: 3, totalS: 60 });
    expect(out).toEqual([{ start: 40, duration: 6.5 }]);
  });
});
