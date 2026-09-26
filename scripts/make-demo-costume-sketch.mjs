#!/usr/bin/env node
// Generates scripts/fixtures/training/costume-sketch-viola-doublet.jpg: a
// synthetic costume designer's reference sketch, a front view of a doublet
// for the role Viola. Nothing in it resembles a real person or a real
// designer's work; it exists so video 4's PhotoStrip walkthrough has an
// image to upload on camera as a piece reference photo.
//
// Run: node scripts/make-demo-costume-sketch.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "fixtures", "training", "costume-sketch-viola-doublet.jpg");

// Present on macOS at /System/Library/Fonts; Bradley Hand is not installed on
// this machine, so Noteworthy is the handwriting font actually available.
const HAND_FONT = "Noteworthy";
// local() matches a face name, not a family: "Noteworthy" alone never
// resolves. Light is the face the family renders at the default weight.
const HAND_FACE = "Noteworthy Light";

function buildHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 1200px;
    height: 1500px;
    background: #dedad0; /* desk behind the photographed sketch pad */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .page {
    width: 1080px;
    height: 1380px;
    box-sizing: border-box;
    padding: 50px 60px;
    background: #f4efe1; /* cream sketch paper */
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    position: relative;
  }
  .title {
    font-family: "${HAND_FONT}", cursive;
    font-size: 40px;
    color: #2b2b2b;
    margin-bottom: 20px;
  }
  .label {
    font-family: "${HAND_FONT}", cursive;
    fill: #3a3a3a;
  }
  .swatch-caption {
    font-family: "${HAND_FONT}", cursive;
    font-size: 22px;
    fill: #3a3a3a;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="title">Viola: doublet</div>
    <svg width="960" height="1067" viewBox="0 0 1080 1200">
      <!-- pencil-grey sketch of a doublet, front view -->
      <g fill="none" stroke="#4a4a48" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
        <!-- high collar -->
        <path d="M 440 90 Q 470 40 540 40 Q 610 40 640 90" />
        <path d="M 440 90 L 420 140 L 460 160 L 540 120 L 620 160 L 660 140 L 640 90" />
        <!-- shoulders and sleeves -->
        <path d="M 460 160 L 300 220 Q 260 260 250 340 L 260 620 L 340 620 L 350 340 Q 355 280 400 240" />
        <path d="M 620 160 L 780 220 Q 820 260 830 340 L 820 620 L 740 620 L 730 340 Q 725 280 680 240" />
        <!-- torso body -->
        <path d="M 400 240 L 380 700 Q 375 760 420 800 L 660 800 Q 705 760 700 700 L 680 240" />
        <!-- waist seam -->
        <path d="M 395 680 L 685 680" stroke-width="2.5" />
        <!-- short peplum skirt below the waist -->
        <path d="M 400 800 L 385 900 Q 470 930 540 900 Q 610 930 695 900 L 680 800" />
        <path d="M 470 800 L 460 895" stroke-width="2" />
        <path d="M 610 800 L 620 895" stroke-width="2" />
        <!-- center front placket -->
        <line x1="540" y1="120" x2="540" y2="800" stroke-width="2" />
        <!-- cuffs -->
        <path d="M 250 620 L 340 620 L 335 670 L 255 670 Z" />
        <path d="M 830 620 L 740 620 L 745 670 L 825 670 Z" />
      </g>
      <!-- buttons down the front -->
      <g fill="#4a4a48">
        <circle cx="540" cy="200" r="7" />
        <circle cx="540" cy="290" r="7" />
        <circle cx="540" cy="380" r="7" />
        <circle cx="540" cy="470" r="7" />
        <circle cx="540" cy="560" r="7" />
        <circle cx="540" cy="650" r="7" />
        <circle cx="540" cy="740" r="7" />
      </g>
      <!-- construction hatching for shading, sketch-style -->
      <g stroke="#8a8578" stroke-width="1.5" opacity="0.6">
        <line x1="410" y1="260" x2="435" y2="250" />
        <line x1="410" y1="300" x2="435" y2="290" />
        <line x1="410" y1="340" x2="435" y2="330" />
        <line x1="645" y1="260" x2="670" y2="250" />
        <line x1="645" y1="300" x2="670" y2="290" />
        <line x1="645" y1="340" x2="670" y2="330" />
      </g>
      <!-- callout lines to labels -->
      <g stroke="#4a4a48" stroke-width="1.5" fill="none" stroke-dasharray="4 4">
        <path d="M 640 90 L 780 80" />
        <path d="M 540 250 L 780 300" />
        <path d="M 470 895 L 300 980" />
      </g>
      <text class="label" x="790" y="70" font-size="24">high collar</text>
      <text class="label" x="790" y="310" font-size="24">brass buttons</text>
      <text class="label" x="120" y="1000" font-size="24">short peplum</text>

      <!-- fabric swatch box, bottom right -->
      <g>
        <rect x="820" y="1000" width="220" height="170" fill="none" stroke="#4a4a48" stroke-width="2.5" />
        <rect x="840" y="1020" width="180" height="90" fill="#2f5233" />
        <line x1="840" y1="1050" x2="1020" y2="1050" stroke="#e8e2c8" stroke-width="4" />
        <line x1="840" y1="1075" x2="1020" y2="1075" stroke="#e8e2c8" stroke-width="4" />
        <text class="swatch-caption" x="835" y="1150">wool, deep green</text>
      </g>
    </svg>
  </div>
</body>
</html>`;
}

async function assertHandFontLoaded(page) {
  // document.fonts.check() returns true for a font that is not installed at
  // all (nothing to load means nothing pending), so it cannot fail. A
  // FontFace bound to local() rejects when the system has no such font.
  const error = await page.evaluate(async (face) => {
    try {
      await new FontFace("HandProbe", `local("${face}")`).load();
      return null;
    } catch (err) {
      return String(err);
    }
  }, HAND_FACE);
  if (error !== null) {
    throw new Error(
      `Handwriting font "${HAND_FACE}" is not installed (local() FontFace load failed: ${error}). ` +
        "The sketch would render its labels in a fallback font, which is not a costume sketch convention test.",
    );
  }
}

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  const html = buildHtml();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1500 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    await assertHandFontLoaded(page);
    const jpeg = await page.screenshot({ type: "jpeg", quality: 90, fullPage: false });
    if (jpeg.byteLength > 1024 * 1024) {
      throw new Error(`Generated JPEG is ${jpeg.byteLength} bytes, over the 1 MB budget`);
    }
    await writeFile(OUT_PATH, jpeg);
    console.log(`Wrote ${OUT_PATH} (${jpeg.byteLength} bytes)`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
