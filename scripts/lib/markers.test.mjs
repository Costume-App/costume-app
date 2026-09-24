import { describe, it, expect } from "vitest";
import { FRAME_LAG_S, rebaseMarkers } from "./markers.mjs";

describe("rebaseMarkers", () => {
  it("rebases wall-clock ms to clip seconds and adds the lag", () => {
    const out = rebaseMarkers([{ beat: 0, at: 11500, ok: true, s: 2 }], 10000, 0.2);
    expect(out).toEqual([{ beat: 0, t: 1.7, ok: true, s: 2 }]);
  });

  it("defaults the lag to FRAME_LAG_S", () => {
    const [b] = rebaseMarkers([{ beat: 0, at: 12000, ok: true, s: null }], 10000);
    expect(b.t).toBe(+(2 + FRAME_LAG_S).toFixed(3));
  });

  it("keeps pos when present and omits it when absent", () => {
    const out = rebaseMarkers([
      { beat: 0, at: 10000, ok: true, s: 0, pos: { x: 10, y: 20 } },
      { beat: 1, at: 10000, ok: false, s: 1 },
    ], 10000, 0);
    expect(out[0].pos).toEqual({ x: 10, y: 20 });
    expect("pos" in out[1]).toBe(false);
  });

  it("rebases a zoom's stillAt to stillT with the same lag and drops stillAt", () => {
    const zoom = { box: { x: 1, y: 2, width: 3, height: 4 }, scale: 1.6, holdS: 2.6, still: "zoom-00.jpg", stillAt: 13000 };
    const [b] = rebaseMarkers([{ beat: 0, at: 12000, ok: true, s: 0, zoom }], 10000, 0.1);
    expect(b.t).toBe(2.1);
    expect(b.zoom).toEqual({ box: zoom.box, scale: 1.6, holdS: 2.6, still: "zoom-00.jpg", stillT: 3.1 });
  });

  it("rounds to milliseconds", () => {
    const [b] = rebaseMarkers([{ beat: 0, at: 10001.4, ok: true, s: 0 }], 10000, 0);
    expect(b.t).toBe(0.001);
  });
});
