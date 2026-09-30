import { describe, expect, test } from "vitest";
import {
  TRAINING_VIDEOS,
  isTrainingVideoSlug,
  trainingVideoTitle,
  videoForGuideSection,
} from "./catalog";

describe("training video catalog", () => {
  test("lists the six approved videos in series order", () => {
    expect(TRAINING_VIDEOS.map((v) => v.slug)).toEqual([
      "getting-started",
      "roles-and-cast",
      "measurements",
      "costume-creations",
      "house-inventory",
      "sharing-and-billing",
    ]);
  });

  test("each guide section hosts at most one video", () => {
    const sections = TRAINING_VIDEOS.map((v) => v.guideSection);
    expect(new Set(sections).size).toBe(sections.length);
  });

  test("videoForGuideSection maps a hosting section and ignores the rest", () => {
    expect(videoForGuideSection("measurements")).toBe("measurements");
    expect(videoForGuideSection("sharing")).toBe("sharing-and-billing");
    expect(videoForGuideSection("billing")).toBeNull();
    expect(videoForGuideSection("")).toBeNull();
  });

  test("isTrainingVideoSlug rejects the probe and unknown slugs", () => {
    expect(isTrainingVideoSlug("house-inventory")).toBe(true);
    expect(isTrainingVideoSlug("_probe")).toBe(false);
    expect(isTrainingVideoSlug("House-Inventory")).toBe(false);
  });

  test("titles match the VO script headings", () => {
    expect(trainingVideoTitle("roles-and-cast")).toBe("Roles and Cast");
    expect(trainingVideoTitle("sharing-and-billing")).toBe("Sharing and Billing");
  });
});
