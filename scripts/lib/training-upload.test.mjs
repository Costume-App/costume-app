import { describe, expect, test } from "vitest";
import { TRAINING_VIDEOS, TRAINING_VIDEOS_BUCKET } from "../../src/lib/training-videos/catalog";
import {
  BUCKET,
  MAX_OBJECT_BYTES,
  UPLOADABLE_SLUGS,
  contentPath,
  planUpload,
  serializeManifest,
} from "./training-upload.mjs";

const bytes = (s) => new TextEncoder().encode(s);
const VTT = bytes("WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n");
const input = (over = {}) => ({
  slug: "getting-started",
  mp4: bytes("mp4-a"),
  vtt: VTT,
  poster: bytes("jpg-a"),
  durationS: 134.5,
  manifest: {},
  ...over,
});

describe("contract with the app catalog", () => {
  test("uploadable slugs and bucket match src/lib/training-videos/catalog.ts", () => {
    expect(UPLOADABLE_SLUGS).toEqual(TRAINING_VIDEOS.map((v) => v.slug));
    expect(BUCKET).toBe(TRAINING_VIDEOS_BUCKET);
  });
});

describe("contentPath", () => {
  test("is stable for identical bytes and changes when bytes change", () => {
    const a = contentPath("measurements", "mp4", bytes("x"));
    expect(a).toMatch(/^measurements\/[0-9a-f]{16}\.mp4$/);
    expect(contentPath("measurements", "mp4", bytes("x"))).toBe(a);
    expect(contentPath("measurements", "mp4", bytes("y"))).not.toBe(a);
  });
});

describe("planUpload", () => {
  test("plans three objects with content types and a manifest entry", () => {
    const plan = planUpload(input());
    expect(plan.objects.map((o) => o.contentType)).toEqual(["video/mp4", "text/vtt", "image/jpeg"]);
    expect(plan.entry).toEqual({
      mp4: plan.objects[0].path,
      vtt: plan.objects[1].path,
      poster: plan.objects[2].path,
      durationS: 134.5,
    });
    expect(plan.manifest["getting-started"]).toEqual(plan.entry);
    expect(plan.unchanged).toBe(false);
  });

  test("does not mutate the input manifest and keeps other slugs", () => {
    const other = { mp4: "m/1.mp4", vtt: "m/1.vtt", poster: "m/1.jpg", durationS: 1 };
    const manifest = Object.freeze({ measurements: Object.freeze(other) });
    const plan = planUpload(input({ manifest }));
    expect(manifest).toEqual({ measurements: other });
    expect(plan.manifest.measurements).toEqual(other);
  });

  test("reports unchanged when the entry already matches", () => {
    const first = planUpload(input());
    const again = planUpload(input({ manifest: first.manifest }));
    expect(again.unchanged).toBe(true);
  });

  test("refuses the probe and unknown slugs", () => {
    expect(() => planUpload(input({ slug: "_probe" }))).toThrow(/_probe/);
    expect(() => planUpload(input({ slug: "nope" }))).toThrow(/nope/);
  });

  test("refuses a caption file that is not WebVTT", () => {
    expect(() => planUpload(input({ vtt: bytes("1\n00:00:00,000 --> 00:00:01,000\nHi\n") }))).toThrow(/WEBVTT/);
  });

  test("refuses an object over the 50 MB cap, naming it", () => {
    const big = new Uint8Array(MAX_OBJECT_BYTES + 1);
    expect(() => planUpload(input({ mp4: big }))).toThrow(/mp4.*50 MB/);
  });

  test("refuses an empty file and an implausible duration", () => {
    expect(() => planUpload(input({ poster: new Uint8Array(0) }))).toThrow(/jpg.*empty/);
    expect(() => planUpload(input({ durationS: 0 }))).toThrow(/duration/);
    expect(() => planUpload(input({ durationS: Number.NaN }))).toThrow(/duration/);
  });
});

describe("serializeManifest", () => {
  test("sorts slugs and ends with a newline", () => {
    const e = { mp4: "a", vtt: "b", poster: "c", durationS: 1 };
    const out = serializeManifest({ "sharing-and-billing": e, "getting-started": e });
    expect(out.indexOf("getting-started")).toBeLessThan(out.indexOf("sharing-and-billing"));
    expect(out.endsWith("}\n")).toBe(true);
    expect(JSON.parse(out)).toEqual({ "getting-started": e, "sharing-and-billing": e });
  });
});
