import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { TRAINING_VIDEOS } from "@/lib/training-videos/catalog";

const page = readFileSync("src/app/(app)/guide/page.tsx", "utf8");
const sectionIds = [...page.matchAll(/<Section id="([^"]+)"/g)].map((m) => m[1]);

test.each(TRAINING_VIDEOS.map((v) => [v.slug, v.guideSection]))(
  "%s is hosted by an existing /guide section (%s)",
  (_slug, section) => {
    expect(sectionIds).toContain(section);
  },
);

test("the Section helper places the catalog video", () => {
  expect(page).toContain("videoForGuideSection(id)");
  expect(page).toContain("<TrainingVideo");
});
