#!/usr/bin/env node
// Generates scripts/fixtures/training/inventory/<slug>.jpg: one synthetic
// "catalog photo" per House Inventory item that video 5 seeds on camera
// (DEMO_INVENTORY_ITEMS) plus the one item it adds live (DEMO_INVENTORY_CAMERA_ITEM).
// Each object is a flat inline-SVG illustration, centered on a muslin-colored
// backdrop with a floor shadow, so the House Inventory photo tile grid (4
// tiles across) reads as a consistent catalog-photo set at thumbnail size.
// Nothing in any image resembles a real person, brand, or designer's work.
//
// Run: node scripts/make-demo-inventory-photos.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { DEMO_INVENTORY_CAMERA_ITEM, DEMO_INVENTORY_ITEMS } from "./lib/demo-productions.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "fixtures", "training", "inventory");
const MAX_BYTES = 400 * 1024;

// Backdrop shared by every item: muslin paper (matches --bg in
// src/app/globals.css) with a soft vignette, plus a blurred floor shadow so
// the object reads as photographed on a surface, not pasted on flat color.
function buildHtml(bodySvg) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: 1200px;
    height: 1200px;
    background: #e9ddc8;
  }
</style>
</head>
<body>
<svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="backdrop" cx="50%" cy="36%" r="75%">
      <stop offset="0%" stop-color="#f4ecdd" />
      <stop offset="100%" stop-color="#ddcdac" />
    </radialGradient>
    <radialGradient id="floorShadow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2c2014" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#2c2014" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#backdrop)" />
  <ellipse cx="600" cy="1000" rx="270" ry="58" fill="url(#floorShadow)" />
  ${bodySvg}
</svg>
</body>
</html>`;
}

// Two-stop linear gradient, angled top-left to bottom-right so every filled
// shape reads as softly lit rather than flat-color clip art.
function shade(id, light, dark) {
  return `<linearGradient id="${id}" x1="15%" y1="0%" x2="85%" y2="100%">
    <stop offset="0%" stop-color="${light}" />
    <stop offset="100%" stop-color="${dark}" />
  </linearGradient>`;
}

function drawTopHat() {
  return {
    defs: `
      ${shade("hatCrown", "#3a3a3e", "#121214")}
      ${shade("hatTop", "#454549", "#1a1a1c")}
      ${shade("hatBrim", "#333336", "#0f0f11")}
    `,
    body: `
      <g>
        <ellipse cx="600" cy="820" rx="235" ry="46" fill="url(#hatBrim)" />
        <rect x="478" y="430" width="244" height="370" rx="14" fill="url(#hatCrown)" />
        <rect x="478" y="720" width="244" height="42" fill="#c9a13f" />
        <ellipse cx="600" cy="430" rx="122" ry="34" fill="url(#hatTop)" />
        <path d="M 512 450 Q 522 600 512 780" stroke="#ffffff" stroke-opacity="0.08" stroke-width="22" fill="none" stroke-linecap="round" />
      </g>
    `,
  };
}

function drawTricornHat() {
  return {
    defs: `
      ${shade("tricornCrown", "#6b4a28", "#3a2712")}
      ${shade("tricornBase", "#5a3d22", "#2c1c0e")}
      ${shade("tricornTrim", "#e3c76a", "#a9843a")}
    `,
    body: `
      <g>
        <ellipse cx="600" cy="470" rx="150" ry="115" fill="url(#tricornCrown)" />
        <path d="M 360 660 Q 400 430 600 480 Q 800 430 840 660 Q 760 540 600 590 Q 440 540 360 660 Z" fill="url(#tricornBase)" />
        <path d="M 360 660 Q 400 430 600 480 Q 800 430 840 660" fill="none" stroke="url(#tricornTrim)" stroke-width="14" stroke-linecap="round" />
        <path d="M 420 480 Q 340 340 400 220 Q 440 300 450 380 Q 470 300 500 260 Q 480 360 460 460 Z" fill="#e9e0c9" opacity="0.9" />
        <line x1="440" y1="470" x2="450" y2="260" stroke="#c8bd9c" stroke-width="4" opacity="0.8" />
        <circle cx="418" cy="560" r="20" fill="#c62828" />
        <circle cx="418" cy="560" r="9" fill="#e3c76a" />
      </g>
    `,
  };
}

function drawPirateCoat() {
  return {
    defs: `
      ${shade("coatBody", "#7a2230", "#3c0f16")}
      ${shade("coatSleeve", "#6a1c28", "#2f0c11")}
      ${shade("coatCuff", "#d8b25a", "#9a7628")}
    `,
    body: `
      <g>
        <path d="M 470 320 Q 600 280 730 320 L 700 380 L 600 350 L 500 380 Z" fill="#4a0f16" />
        <path d="M 500 380 L 380 440 Q 330 480 328 560 L 344 760 L 410 760 L 400 560 Q 404 500 450 460 Z" fill="url(#coatSleeve)" />
        <path d="M 700 380 L 820 440 Q 870 480 872 560 L 856 760 L 790 760 L 800 560 Q 796 500 750 460 Z" fill="url(#coatSleeve)" />
        <rect x="328" y="740" width="86" height="46" rx="6" fill="url(#coatCuff)" />
        <rect x="786" y="740" width="86" height="46" rx="6" fill="url(#coatCuff)" />
        <path d="M 450 400 L 420 900 Q 500 950 600 920 Q 700 950 780 900 L 750 400 Q 675 430 600 420 Q 525 430 450 400 Z" fill="url(#coatBody)" />
        <line x1="600" y1="420" x2="600" y2="900" stroke="#3c0f16" stroke-width="4" />
        <circle cx="600" cy="480" r="9" fill="#d8b25a" />
        <circle cx="600" cy="560" r="9" fill="#d8b25a" />
        <circle cx="600" cy="640" r="9" fill="#d8b25a" />
        <circle cx="600" cy="720" r="9" fill="#d8b25a" />
        <circle cx="600" cy="800" r="9" fill="#d8b25a" />
        <path d="M 480 440 Q 500 650 480 880" stroke="#ffffff" stroke-opacity="0.06" stroke-width="30" fill="none" stroke-linecap="round" />
      </g>
    `,
  };
}

function drawBallGown() {
  return {
    defs: `
      ${shade("gownBodice", "#2c4f82", "#0f2038")}
      ${shade("gownSkirt", "#254a7a", "#0c1e34")}
    `,
    body: `
      <g>
        <path d="M 450 320 Q 480 290 600 320 Q 720 290 750 320 L 660 420 Q 600 450 540 420 Z" fill="url(#gownBodice)" />
        <path d="M 540 420 L 560 580 L 640 580 L 660 420 Q 600 450 540 420 Z" fill="url(#gownBodice)" />
        <rect x="548" y="570" width="104" height="30" rx="8" fill="#cdb26a" />
        <path d="M 560 596 Q 300 660 258 950 Q 600 1015 942 950 Q 900 660 640 596 Q 600 640 560 596 Z" fill="url(#gownSkirt)" />
        <path d="M 540 640 Q 470 800 480 960" stroke="#ffffff" stroke-opacity="0.08" stroke-width="16" fill="none" stroke-linecap="round" />
        <path d="M 600 640 Q 590 810 600 970" stroke="#ffffff" stroke-opacity="0.06" stroke-width="16" fill="none" stroke-linecap="round" />
        <path d="M 660 640 Q 730 800 720 960" stroke="#000000" stroke-opacity="0.14" stroke-width="16" fill="none" stroke-linecap="round" />
        <path d="M 420 700 Q 340 820 320 940" stroke="#000000" stroke-opacity="0.10" stroke-width="16" fill="none" stroke-linecap="round" />
      </g>
    `,
  };
}

function drawLaceFan() {
  const ribs = [];
  for (let i = 0; i <= 8; i += 1) {
    const angle = Math.PI * (0.06 + (i / 8) * 0.88);
    const x = 600 + Math.cos(Math.PI - angle) * 330;
    const y = 820 - Math.sin(angle) * 330;
    ribs.push(`<line x1="600" y1="820" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#8a6a3f" stroke-width="3" stroke-opacity="0.55" />`);
  }
  return {
    defs: `
      ${shade("fanBody", "#f6efe0", "#d8cba8")}
    `,
    body: `
      <g>
        <path d="M 270 820 A 330 330 0 0 1 930 820 Q 780 780 600 800 Q 420 780 270 820 Z" fill="url(#fanBody)" />
        ${ribs.join("\n        ")}
        <rect x="586" y="815" width="28" height="60" rx="6" fill="#5a3d22" />
        <circle cx="600" cy="820" r="12" fill="#5a3d22" />
      </g>
    `,
  };
}

function drawParasol() {
  const panels = [];
  const colors = ["#1f4d5c", "#e8dcc0", "#1f4d5c", "#e8dcc0", "#1f4d5c", "#e8dcc0"];
  const spanStart = -100;
  const spanEnd = 100;
  const step = (spanEnd - spanStart) / colors.length;
  for (let i = 0; i < colors.length; i += 1) {
    const a1 = spanStart + i * step;
    const a2 = spanStart + (i + 1) * step;
    const p1 = polarPoint(600, 480, 330, a1);
    const p2 = polarPoint(600, 480, 330, a2);
    panels.push(
      `<path d="M 600 480 L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A 330 330 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z" fill="${colors[i]}" />`,
    );
  }
  return {
    defs: "",
    body: `
      <g>
        ${panels.join("\n        ")}
        <path d="M 270 620 Q 600 560 930 620" fill="none" stroke="#0d2731" stroke-width="6" stroke-opacity="0.4" />
        <circle cx="600" cy="480" r="18" fill="#0d2731" />
        <line x1="600" y1="480" x2="600" y2="880" stroke="#3a2a18" stroke-width="10" />
        <path d="M 600 880 Q 600 930 650 930" fill="none" stroke="#3a2a18" stroke-width="10" stroke-linecap="round" />
      </g>
    `,
  };
}

function polarPoint(cx, cy, r, degrees) {
  const rad = (degrees * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function drawVelvetCloak() {
  return {
    defs: `
      ${shade("cloakBody", "#5a2a6b", "#25102e")}
      ${shade("cloakHood", "#4a2258", "#1c0c24")}
    `,
    body: `
      <g>
        <line x1="500" y1="320" x2="700" y2="320" stroke="#7a7062" stroke-width="10" stroke-linecap="round" />
        <path d="M 600 300 Q 615 280 640 295" fill="none" stroke="#7a7062" stroke-width="10" stroke-linecap="round" />
        <path d="M 510 330 Q 600 260 690 330 L 660 460 Q 600 490 540 460 Z" fill="url(#cloakHood)" />
        <path d="M 500 340 L 380 420 Q 340 460 350 900 Q 600 960 850 900 Q 860 460 820 420 L 700 340 Q 650 410 600 410 Q 550 410 500 340 Z" fill="url(#cloakBody)" />
        <circle cx="600" cy="400" r="12" fill="#d8b25a" />
        <path d="M 470 440 Q 460 680 480 900" stroke="#ffffff" stroke-opacity="0.06" stroke-width="26" fill="none" stroke-linecap="round" />
        <path d="M 730 440 Q 740 680 720 900" stroke="#000000" stroke-opacity="0.12" stroke-width="26" fill="none" stroke-linecap="round" />
      </g>
    `,
  };
}

// Stack order mirrors DEMO_INVENTORY_ITEMS followed by DEMO_INVENTORY_CAMERA_ITEM,
// which is also the contact sheet's tile order (Task brief step 2).
const ITEMS = [
  { name: "Top hat", draw: drawTopHat },
  { name: "Tricorn hat", draw: drawTricornHat },
  { name: "Pirate coat", draw: drawPirateCoat },
  { name: "Ball gown", draw: drawBallGown },
  { name: "Lace fan", draw: drawLaceFan },
  { name: "Parasol", draw: drawParasol },
  { name: "Velvet cloak", draw: drawVelvetCloak },
];

function photoPathFor(name) {
  const all = [...DEMO_INVENTORY_ITEMS, DEMO_INVENTORY_CAMERA_ITEM];
  const item = all.find((entry) => entry.name === name);
  if (!item) throw new Error(`make-demo-inventory-photos: no fixture entry named "${name}"`);
  return item.photo;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    for (const item of ITEMS) {
      const outPath = photoPathFor(item.name);
      const { defs, body } = item.draw();
      const svg = `<defs>${defs}</defs>${body}`;
      await page.setContent(buildHtml(svg), { waitUntil: "networkidle" });
      const jpeg = await page.screenshot({ type: "jpeg", quality: 90, fullPage: false });
      if (jpeg.byteLength > MAX_BYTES) {
        throw new Error(`${item.name}: generated JPEG is ${jpeg.byteLength} bytes, over the ${MAX_BYTES} byte budget`);
      }
      await writeFile(outPath, jpeg);
      console.log(`Wrote ${outPath} (${jpeg.byteLength} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
