import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LandingVideoSlot } from "./LandingVideoSlot";

test("renders no section when no video is chosen", () => {
  expect(renderToStaticMarkup(createElement(LandingVideoSlot, { slug: null }))).toBe("");
});
