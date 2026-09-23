import { describe, it, expect } from "vitest";
import { CAPTION, packCues, wrapLines, vttTime, toWebVTT } from "./captions.mjs";

const words = (text, start, step = 0.3) =>
  text.split(" ").map((t, i) => ({ text: t, start: start + i * step, end: start + i * step + 0.25 }));

describe("packCues", () => {
  it("never lets a cue span two sentences", () => {
    const cues = packCues([
      { words: words("Welcome to Measure My Costume.", 0) },
      { words: words("Let's begin.", 3) },
    ]);
    expect(cues.map((c) => c.text)).toEqual(["Welcome to Measure My Costume.", "Let's begin."]);
  });
  it("splits a long sentence at the two-line limit", () => {
    const long = "This sentence is deliberately long so that it cannot possibly fit inside a single caption cue of two lines";
    const cues = packCues([{ words: words(long, 0) }]);
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(CAPTION.LINE_CHARS * CAPTION.MAX_LINES);
  });
  it("lingers briefly but never overlaps the next cue", () => {
    const cues = packCues([{ words: words("One two.", 0) }, { words: words("Three four.", 0.7) }]);
    expect(cues[0].end).toBeLessThanOrEqual(cues[1].start);
  });
  it("skips sentences without word timings", () => {
    expect(packCues([{ words: [] }])).toEqual([]);
  });
});

describe("wrapLines", () => {
  it("keeps short text on one line", () => {
    expect(wrapLines("Short line.", 42)).toEqual(["Short line."]);
  });
  it("balances two lines within the width", () => {
    const lines = wrapLines("Create your first production and add the showings for it", 42);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(42);
  });
});

describe("vttTime and toWebVTT", () => {
  it("formats hours, minutes, seconds, millis", () => {
    expect(vttTime(3723.4567)).toBe("01:02:03.457");
  });
  it("writes a valid WebVTT document", () => {
    const vtt = toWebVTT([{ start: 1, end: 2.5, text: "Hello there." }]);
    expect(vtt).toBe("WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nHello there.\n");
  });
});
