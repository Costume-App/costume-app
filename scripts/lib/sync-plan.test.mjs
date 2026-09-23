import { describe, it, expect } from "vitest";
import {
  SYNC, narrationLayout, flattenSentences, prepareMarkers,
  planSegments, finalizeSection, rawToOut, segOutDuration,
} from "./sync-plan.mjs";

describe("narrationLayout", () => {
  it("starts later sections after the lead-in and gaps paragraphs", () => {
    const { paraAt, narrEnd, outDur } = narrationLayout([2, 3], { first: false });
    expect(paraAt[0]).toBeCloseTo(SYNC.LEAD_IN_S);
    expect(paraAt[1]).toBeCloseTo(SYNC.LEAD_IN_S + 2 + SYNC.MIN_GAP_S);
    expect(narrEnd).toBeCloseTo(SYNC.LEAD_IN_S + 5 + SYNC.MIN_GAP_S);
    expect(outDur).toBeCloseTo(narrEnd + SYNC.TAIL_S);
  });
  it("starts the first section on the title card (negative time)", () => {
    const { paraAt } = narrationLayout([2], { first: true });
    expect(paraAt[0]).toBeCloseTo(SYNC.CARD_NARR_START_S - SYNC.CARD_S);
  });
});

describe("flattenSentences", () => {
  it("offsets sentence and word times by paragraph start", () => {
    const byPara = { p00: [{ i: 0, start: 0.1, end: 1, text: "Hi there.", words: [{ text: "Hi", start: 0.1, end: 0.4 }] }] };
    const out = flattenSentences([1.2], [0.5], byPara);
    expect(out[0].start).toBeCloseTo(0.6);
    expect(out[0].words[0].start).toBeCloseTo(0.6);
  });
  it("falls back to one sentence per paragraph without timings", () => {
    const out = flattenSentences([2], [0.5], null);
    expect(out).toEqual([{ start: 0.5, end: 2.5, text: "", words: [] }]);
  });
});

describe("prepareMarkers", () => {
  it("shifts by the head trim, drops edges, sorts", () => {
    const beats = [{ t: 5, s: 1 }, { t: 0.8, s: 0 }, { t: 2, s: 0 }];
    const out = prepareMarkers(beats, 10);
    expect(out.map((m) => m.t)).toEqual([2 - SYNC.HEAD_TRIM_S, 5 - SYNC.HEAD_TRIM_S]);
  });
});

describe("planSegments", () => {
  const sentences = [{ start: 0, end: 2 }, { start: 3, end: 6 }];

  it("with no markers stretches the whole take into one segment", () => {
    const segs = planSegments({ markers: [], sentences, room: 10, outDur: 12 });
    expect(segs).toHaveLength(1);
    expect(segs[0].start).toBeCloseTo(SYNC.HEAD_TRIM_S);
    expect(segs[0].end).toBeCloseTo(SYNC.HEAD_TRIM_S + 10);
    expect(segs[0].factor).toBeCloseTo(1.2);
  });

  it("trims (never speeds up) a trailing hold that is too long", () => {
    const segs = planSegments({ markers: [], sentences, room: 20, outDur: 10 });
    expect(segs[0].factor).toBe(1);
    expect(segs[0].end - segs[0].start).toBeCloseTo(10);
  });

  it("freezes instead of crawling past MAX_STRETCH", () => {
    const segs = planSegments({ markers: [{ t: 1, s: 0 }], sentences: [{ start: 0, end: 0.5 }], room: 2, outDur: 10 });
    const last = segs[segs.length - 1];
    expect(last.factor).toBeLessThanOrEqual(SYNC.MAX_STRETCH);
    expect(last.freeze).toBeGreaterThan(0);
  });

  it("pins a beat just after its sentence starts", () => {
    const segs = planSegments({ markers: [{ t: 4, s: 1 }], sentences, room: 10, outDur: 10 });
    expect(rawToOut(segs, 4 + SYNC.HEAD_TRIM_S)).toBeCloseTo(3 + SYNC.SHOW_LAG_S);
  });
});

describe("finalizeSection", () => {
  const sentences = [{ start: 0, end: 2 }, { start: 3, end: 6 }];

  it("caps the silence after the last sentence at MAX_PAUSE_S", () => {
    const segs = planSegments({ markers: [{ t: 9, s: 0 }], sentences: [{ start: 0, end: 1 }], room: 10, outDur: 2.6 });
    const { actual, pause } = finalizeSection(segs, 2, 2.6);
    expect(pause).toBeCloseTo(SYNC.MAX_PAUSE_S, 1);
    expect(actual).toBeCloseTo(2 + SYNC.MAX_PAUSE_S, 1);
  });
  it("does not mutate its input", () => {
    const segs = planSegments({ markers: [], sentences, room: 30, outDur: 3 });
    const copy = JSON.parse(JSON.stringify(segs));
    finalizeSection(segs, 1, 3);
    expect(segs).toEqual(copy);
  });
});

describe("rawToOut", () => {
  it("is monotonic across segments and null outside them", () => {
    const segs = [
      { start: 1, end: 3, factor: 1, freeze: 0.5 },
      { start: 3, end: 5, factor: 2, freeze: 0 },
    ];
    expect(rawToOut(segs, 1)).toBe(0);
    expect(rawToOut(segs, 3)).toBeCloseTo(2);
    expect(rawToOut(segs, 4)).toBeCloseTo(2 + 0.5 + 2);
    expect(rawToOut(segs, 0.5)).toBeNull();
    expect(segOutDuration(segs[0])).toBeCloseTo(2.5);
  });
});
