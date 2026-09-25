#!/usr/bin/env node
// Generates scripts/fixtures/training/measurement-form-rosa-diaz.jpg: a synthetic
// costume measurement form, modeled on the layout of a real paper form (see
// src/lib/measurement-import/__fixtures__/sample-form-redacted.jpg, not copied
// or referenced on camera), filled in with ROSA_FORM's values. Used off camera
// to prove the AI reader (Task 2 step 4) and on camera by video 3's Import
// walkthrough (Task 4).
//
// Run: node scripts/make-demo-measurement-form.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ROSA_FORM } from "./lib/demo-measurement-form.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(HERE, "fixtures", "training", "measurement-form-rosa-diaz.jpg");

// Present on macOS at /System/Library/Fonts; Bradley Hand is not installed on
// this machine, so Noteworthy is the handwriting font actually available.
const HAND_FONT = "Noteworthy";
// local() matches a face name, not a family: "Noteworthy" alone never
// resolves. Light is the face the family renders at the default weight.
const HAND_FACE = "Noteworthy Light";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function guideLine(field) {
  return `
    <div class="guide-line">
      <span class="printed">${escapeHtml(field.label)}</span>
      <span class="hand">${escapeHtml(field.value)}</span>
    </div>`;
}

function buildHtml() {
  const guideFields = ROSA_FORM.fields.filter((f) => /^[A-G] /.test(f.label));
  const otherFields = ROSA_FORM.fields.filter((f) => !/^[A-G] /.test(f.label));

  const guideLines = guideFields.map(guideLine).join("");
  const otherLines = otherFields
    .map(
      (f) => `
    <div class="other-line">
      <span class="hand other-label">${escapeHtml(f.label)}</span>
      <span class="hand">${escapeHtml(f.value)}</span>
    </div>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 1200px;
    height: 1600px;
    background: #4b4842; /* desk behind the photographed page */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .page {
    width: 1020px;
    height: 1440px;
    box-sizing: border-box;
    padding: 70px 90px;
    background: #ece7db; /* light paper tint */
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
    transform: rotate(1.6deg);
    transform-origin: center;
    font-family: Arial, Helvetica, sans-serif;
    color: #1c1c1c;
  }
  .title {
    text-align: center;
    font-size: 44px;
    margin-bottom: 40px;
    letter-spacing: 1px;
  }
  .field-line {
    display: flex;
    align-items: baseline;
    margin-bottom: 14px;
    font-size: 24px;
  }
  .field-label {
    width: 160px;
    flex: none;
  }
  .field-line .hand {
    border-bottom: 1px solid #444;
    flex: 1;
    padding-left: 12px;
    min-height: 34px;
  }
  .sizes {
    margin-top: 36px;
  }
  .sizes h2, .guide h2, .other h2 {
    font-size: 26px;
    text-decoration: underline;
    margin: 0 0 16px 0;
  }
  .size-row {
    display: flex;
    align-items: baseline;
    font-size: 22px;
    margin-bottom: 10px;
  }
  .size-row .field-label {
    width: 90px;
  }
  .size-row .hand {
    border-bottom: 1px solid #444;
    width: 220px;
    padding-left: 12px;
    min-height: 30px;
  }
  .guide {
    margin-top: 44px;
    border: 2px solid #1c1c1c;
    padding: 30px 34px;
  }
  .guide-line, .other-line {
    display: flex;
    align-items: baseline;
    font-size: 24px;
    margin-bottom: 16px;
  }
  .guide-line .printed {
    width: 340px;
    flex: none;
  }
  .guide-line .hand, .other-line .hand {
    border-bottom: 1px solid #444;
    flex: 1;
    padding-left: 14px;
    min-height: 36px;
  }
  .other {
    margin-top: 40px;
  }
  .other-line .other-label {
    width: 220px;
    flex: none;
    border-bottom: none;
  }
  .hand {
    font-family: "${HAND_FONT}", cursive;
    font-size: 30px;
    color: #16307a;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="title">Costume Measurement Form</div>

    <div class="field-line"><span class="field-label">NAME</span><span class="hand">${escapeHtml(ROSA_FORM.name)}</span></div>
    <div class="field-line"><span class="field-label">CAST AS</span><span class="hand">${escapeHtml(ROSA_FORM.castAs)}</span></div>
    <div class="field-line"><span class="field-label">CONTACT</span><span class="hand"></span></div>

    <div class="sizes">
      <h2>CLOTHING SIZES</h2>
      <div class="size-row"><span class="field-label">Shirt</span><span class="hand">${escapeHtml(ROSA_FORM.sizes.shirt)}</span></div>
      <div class="size-row"><span class="field-label">Pant</span><span class="hand">${escapeHtml(ROSA_FORM.sizes.pant)}</span></div>
      <div class="size-row"><span class="field-label">Shoe</span><span class="hand">${escapeHtml(ROSA_FORM.sizes.shoe)}</span></div>
    </div>

    <div class="guide">
      <h2>Measuring Guide</h2>
      ${guideLines}
    </div>

    <div class="other">
      <h2>OTHER MEASUREMENTS</h2>
      ${otherLines}
    </div>
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
        "The form would render in a fallback font, which is not a handwriting convention test.",
    );
  }
}

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  const html = buildHtml();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
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
