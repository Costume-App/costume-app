import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { TrainingVideoPlayer } from "./TrainingVideo";

const sources = {
  src: "https://abc.supabase.co/storage/v1/object/public/training-videos/m/1.mp4",
  captions: "https://abc.supabase.co/storage/v1/object/public/training-videos/m/1.vtt",
  poster: "https://abc.supabase.co/storage/v1/object/public/training-videos/m/1.jpg",
  durationS: 226.9,
};
const html = renderToStaticMarkup(createElement(TrainingVideoPlayer, { title: "Measurements", sources }));

describe("TrainingVideoPlayer", () => {
  test("is a native video that loads nothing until played", () => {
    expect(html).toContain("<video");
    expect(html).toContain('preload="none"');
    expect(html).toContain("controls");
    expect(html).toContain(`poster="${sources.poster}"`);
    expect(html).toContain(`src="${sources.src}"`);
    expect(html).toContain('type="video/mp4"');
  });

  test("requests cross-origin so the Supabase-hosted captions load", () => {
    expect(html).toContain('crossorigin="anonymous"');
  });

  test("carries English captions on by default", () => {
    expect(html).toMatch(/<track[^>]*kind="captions"/);
    expect(html).toContain(`src="${sources.captions}"`);
    // React's static-markup renderer does not lower-case this one attribute
    // (unlike crossOrigin -> crossorigin); srcLang="en" is the real output.
    expect(html).toContain('srcLang="en"');
    expect(html).toMatch(/<track[^>]*default/);
  });

  test("labels the video with its title and length", () => {
    expect(html).toContain("Measurements");
    expect(html).toContain("3:47");
    expect(html).toContain('aria-label="Training video: Measurements"');
  });
});
