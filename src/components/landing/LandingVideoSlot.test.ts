import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/training-videos/manifest.json", () => ({
  default: {
    measurements: { mp4: "m/1.mp4", vtt: "m/1.vtt", poster: "m/1.jpg", durationS: 226.9 },
  },
}));

import { LandingVideoSlot } from "./LandingVideoSlot";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("renders nothing when no video is chosen", () => {
  expect(renderToStaticMarkup(createElement(LandingVideoSlot, { slug: null }))).toBe("");
});

test("renders nothing for a slug absent from the manifest", () => {
  vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
  expect(renderToStaticMarkup(createElement(LandingVideoSlot, { slug: "getting-started" }))).toBe("");
});

test("renders the heading and a video for a hosted slug with SUPABASE_URL set", () => {
  vi.stubEnv("SUPABASE_URL", "https://abc.supabase.co");
  const html = renderToStaticMarkup(createElement(LandingVideoSlot, { slug: "measurements" }));
  expect(html).toContain("See It in Action");
  expect(html).toContain("<video");
});

test("renders nothing for a hosted slug when SUPABASE_URL is unset", () => {
  vi.stubEnv("SUPABASE_URL", "");
  expect(renderToStaticMarkup(createElement(LandingVideoSlot, { slug: "measurements" }))).toBe("");
});
