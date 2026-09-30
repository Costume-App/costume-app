import { describe, expect, test } from "vitest";
import type { TrainingVideoManifest } from "./catalog";
import { formatDuration, publicObjectUrl, trainingVideoSources } from "./urls";

const BASE = "https://abc.supabase.co";
const manifest: TrainingVideoManifest = {
  "getting-started": {
    mp4: "getting-started/1111111111111111.mp4",
    vtt: "getting-started/2222222222222222.vtt",
    poster: "getting-started/3333333333333333.jpg",
    durationS: 134.5,
  },
};

describe("publicObjectUrl", () => {
  test("builds the public object URL", () => {
    expect(publicObjectUrl(BASE, "a/b.mp4")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/training-videos/a/b.mp4",
    );
  });
  test("tolerates a trailing slash on the base", () => {
    expect(publicObjectUrl(`${BASE}/`, "a/b.mp4")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/training-videos/a/b.mp4",
    );
  });
  test("encodes each path segment but keeps the slashes", () => {
    expect(publicObjectUrl(BASE, "a b/c#d.mp4")).toBe(
      "https://abc.supabase.co/storage/v1/object/public/training-videos/a%20b/c%23d.mp4",
    );
  });
});

describe("trainingVideoSources", () => {
  test("returns all three URLs and the duration for an uploaded slug", () => {
    expect(trainingVideoSources("getting-started", manifest, BASE)).toEqual({
      src: `${BASE}/storage/v1/object/public/training-videos/getting-started/1111111111111111.mp4`,
      captions: `${BASE}/storage/v1/object/public/training-videos/getting-started/2222222222222222.vtt`,
      poster: `${BASE}/storage/v1/object/public/training-videos/getting-started/3333333333333333.jpg`,
      durationS: 134.5,
    });
  });
  test("returns null for a slug that is not uploaded yet", () => {
    expect(trainingVideoSources("measurements", manifest, BASE)).toBeNull();
  });
  test("returns null when SUPABASE_URL is missing or empty", () => {
    expect(trainingVideoSources("getting-started", manifest, undefined)).toBeNull();
    expect(trainingVideoSources("getting-started", manifest, "")).toBeNull();
  });
});

describe("formatDuration", () => {
  test("formats minutes and zero-padded seconds, rounding", () => {
    expect(formatDuration(134.5)).toBe("2:15");
    expect(formatDuration(184.718)).toBe("3:05");
    expect(formatDuration(59.6)).toBe("1:00");
    expect(formatDuration(9)).toBe("0:09");
  });
});
