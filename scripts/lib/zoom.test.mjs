import { describe, it, expect } from "vitest";
import { ZOOM, zoomRect, zoomWindow, zoomAt, zoompanFilter } from "./zoom.mjs";

describe("zoomRect", () => {
  it("centers on the target box", () => {
    const r = zoomRect({ x: 900, y: 500, width: 120, height: 80 }, 1.6, 1920, 1080);
    expect(r.w).toBeCloseTo(1200);
    expect(r.h).toBeCloseTo(675);
    expect(r.x + r.w / 2).toBeCloseTo(960);
    expect(r.y + r.h / 2).toBeCloseTo(540);
  });
  it("clamps at the frame edges", () => {
    const r = zoomRect({ x: 5, y: 1050, width: 20, height: 20 }, 1.6, 1920, 1080);
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(1080 - 675);
  });
});

describe("zoomWindow", () => {
  it("returns null for an unmapped or too-short window", () => {
    expect(zoomWindow(null, 5)).toBeNull();
    expect(zoomWindow(1, 1.9)).toBeNull();
  });
  it("sizes ease frames from EASE_S", () => {
    const w = zoomWindow(2, 5);
    expect(w.start).toBe(2);
    expect(w.frames).toBe(90);
    expect(w.easeFrames).toBe(Math.round(ZOOM.EASE_S * ZOOM.FPS));
  });
});

describe("zoomAt", () => {
  const p = { frames: 90, easeFrames: 12, scale: 1.6 };
  it("eases in from 1, holds at scale, eases back out", () => {
    expect(zoomAt(0, p)).toBeCloseTo(1);
    expect(zoomAt(6, p)).toBeGreaterThan(1);
    expect(zoomAt(6, p)).toBeLessThan(1.6);
    expect(zoomAt(12, p)).toBeCloseTo(1.6);
    expect(zoomAt(50, p)).toBeCloseTo(1.6);
    expect(zoomAt(89, p)).toBeLessThan(1.02);
  });
});

describe("zoompanFilter", () => {
  it("emits a zoompan with the frame count, output size and fps", () => {
    const f = zoompanFilter({
      rect: { x: 360, y: 202.5, w: 1200, h: 675 }, scale: 1.6, frames: 90, easeFrames: 12,
      vw: 1920, vh: 1080, outW: 1920, outH: 1080, fps: 30,
    });
    expect(f.startsWith("zoompan=")).toBe(true);
    expect(f).toContain(":d=90:");
    expect(f).toContain(":s=1920x1080:");
    expect(f).toContain(":fps=30");
    expect(f).not.toMatch(/\bNaN\b|undefined/);
  });

  it("pans correctly to off-center target at peak zoom", () => {
    const rect = zoomRect({ x: 1400, y: 150, width: 100, height: 60 }, 1.6, 1920, 1080);
    const f = zoompanFilter({
      rect, scale: 1.6, frames: 90, easeFrames: 12,
      vw: 1920, vh: 1080, outW: 1920, outH: 1080, fps: 30,
    });

    const xMatch = f.match(/x='([^']+)'/);
    const yMatch = f.match(/y='([^']+)'/);
    expect(xMatch).not.toBeNull();
    expect(yMatch).not.toBeNull();

    const xExpr = xMatch[1];
    const yExpr = yMatch[1];

    const evalExpr = (expr) => {
      const iw = 3840;
      const ih = 2160;
      const zoom = 1.6;
      const on = 45;
      const max = Math.max;
      const min = Math.min;
      const lt = (a, b) => a < b ? 1 : 0;
      const result = new Function("iw", "ih", "zoom", "on", "max", "min", "lt", `return ${expr}`)(
        iw, ih, zoom, on, max, min, lt
      );
      return result;
    };

    const x = evalExpr(xExpr);
    const y = evalExpr(yExpr);
    const cropCenterX = (x + 3840 / 1.6 / 2) / 3840;
    const cropCenterY = (y + 2160 / 1.6 / 2) / 2160;
    const rectCenterX = (rect.x + rect.w / 2) / 1920;
    const rectCenterY = (rect.y + rect.h / 2) / 1080;

    expect(cropCenterX).toBeCloseTo(rectCenterX, 3);
    expect(cropCenterY).toBeCloseTo(rectCenterY, 3);
  });
});
