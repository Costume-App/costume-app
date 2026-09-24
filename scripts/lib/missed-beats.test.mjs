import { describe, it, expect } from "vitest";
import { missedBeats } from "./missed-beats.mjs";

describe("missedBeats", () => {
  it("returns nothing when every beat parked", () => {
    const rows = [{ id: "intro", rawBeats: [{ beat: 0, ok: true }, { beat: 1, ok: true }] }];
    expect(missedBeats(rows)).toEqual([]);
  });
  it("names the section and beat number of every ok:false beat", () => {
    const rows = [
      { id: "intro", rawBeats: [{ beat: 0, ok: true }, { beat: 1, ok: false }] },
      { id: "notes", rawBeats: [{ beat: 0, ok: false }] },
    ];
    expect(missedBeats(rows)).toEqual([
      { section: "intro", beat: 1 },
      { section: "notes", beat: 0 },
    ]);
  });
  it("treats a section with no rawBeats as having none missed", () => {
    expect(missedBeats([{ id: "empty", rawBeats: [] }])).toEqual([]);
    expect(missedBeats([{ id: "empty" }])).toEqual([]);
  });
});
