// Records the raw takes for ONE training video (one walkthrough module), one
// .webm per guide section, against a PRODUCTION build (`npm run build &&
// npm start`, never `next dev`).
//
//   node scripts/record-training-video.mjs --video productions-basics
//   node scripts/record-training-video.mjs --video productions-basics --section notes
//
// Training-video ground rules:
//   - NO on-screen text, the owner narrates over the footage. The recorder
//     burns in nothing but the synthetic cursor.
//   - One raw take per guide SECTION so any section can be retaken alone and
//     so the VO edit can freeze-pad an individual section without
//     re-recording.
//   - Each section records in a FRESH context with freshly-minted auth (the
//     Clerk ticket-JWT expires in ~60s, see demo-api.mjs), and navigates
//     itself into place: sections never inherit page state from the previous
//     section's context. DB state DOES carry across sections of one run
//     (same server, same demo org).
//   - A mutating section declares an off-camera `prep(api)` that runs before
//     the recorded context exists, via the app's own API (withDemoApi), so a
//     retake converges its state without the cleanup ever appearing in
//     frame.
//   - Every section is padded to its targetSeconds by holding on the final
//     screen, so the stitched cut is never shorter than the narration needs.
import { existsSync, readdirSync, statSync } from "node:fs";
import { chromium } from "playwright";
import { assertDevClerkKey, assertLocalBase, loadDemoOrg, loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";
import { withDemoApi } from "./lib/demo-api.mjs";
import { createRecorder } from "./lib/record-core.mjs";
import { loadWalkthrough, rawDir } from "./lib/training.mjs";

loadEnvLocalIntoProcess();

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:6100";
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const videoSlug = arg("video");
if (!videoSlug) {
  console.error("Usage: node scripts/record-training-video.mjs --video <slug> [--section <id>]");
  process.exit(1);
}

/** Fails fast when the server behind BASE is `next dev` rather than a
 * production build: a dev server recompiles on the fly and can flash a
 * compiling/error overlay mid-take, and its timing does not match what a
 * viewer will get from the shipped build. There is no reliable way to ask a
 * running server "were you started with next start", so this proves the
 * PROCESS'S OWN INPUT is a production build: `.next/BUILD_ID` must exist and
 * be newer than every file under `src/`. A build that predates a source edit
 * is stale, not proof of production. */
function assertProductionBuildFresh() {
  const buildIdPath = ".next/BUILD_ID";
  if (!existsSync(buildIdPath)) {
    throw new Error(`${buildIdPath} missing. Run: npm run build`);
  }
  const buildMtime = statSync(buildIdPath).mtimeMs;
  let newestSrcMtime = 0;
  let newestSrcFile = null;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else {
        const mtime = statSync(full).mtimeMs;
        if (mtime > newestSrcMtime) {
          newestSrcMtime = mtime;
          newestSrcFile = full;
        }
      }
    }
  };
  walk("src");
  if (newestSrcMtime > buildMtime) {
    throw new Error(
      `Stale production build: ${buildIdPath} (mtime ${new Date(buildMtime).toISOString()}) ` +
      `is older than ${newestSrcFile} (mtime ${new Date(newestSrcMtime).toISOString()}). ` +
      `Run: npm run build`
    );
  }
}

assertLocalBase(BASE);
assertDevClerkKey(process.env.CLERK_SECRET_KEY);
assertProductionBuildFresh();
const demo = loadDemoOrg();

const walkthrough = await loadWalkthrough(videoSlug);
const only = arg("section");
if (only && !walkthrough.sections.some((s) => s.id === only)) {
  console.error(
    `Unknown section "${only}" for video "${videoSlug}". Valid: ` +
    walkthrough.sections.map((s) => s.id).join(", ")
  );
  process.exit(1);
}

const OUT = rawDir(videoSlug);
const browser = await chromium.launch();
const recorder = createRecorder({ browser, base: BASE, demo, outRoot: OUT });

const failed = [];
for (const section of walkthrough.sections) {
  if (only && only !== section.id) continue;
  console.log(`\n[${videoSlug}] section "${section.id}" (${section.heading})`);
  try {
    // Off-camera DB prep: runs before the recorded context exists, via the
    // app's own API, so retaking one section converges its state without
    // the cleanup ever appearing in frame.
    if (section.prep) await withDemoApi(browser, BASE, demo, (api) => section.prep(api));
    await recorder.record(section.id, async (page) => {
      const startedAt = Date.now();
      await section.run(page, recorder);
      // Hold on the section's final screen until the narration budget is
      // covered (plus a small edit margin), never hand-tune sleeps against
      // one observed run.
      const remaining = section.targetSeconds * 1000 + 1500 - (Date.now() - startedAt);
      if (remaining > 0) await recorder.hold(page, remaining);
    });
  } catch (err) {
    // A dead section should not cost the rest of the run, takes are
    // per-section and independently retakeable by design. Record the
    // failure, keep filming, and fail the process at the end.
    failed.push(section.id);
    console.error(`\n[${videoSlug}] section "${section.id}" FAILED: ${err.message}\n`);
  }
}

await browser.close();
console.log(`\nRaw section takes in ${OUT}`);
if (failed.length > 0) {
  console.error(
    `FAILED sections: ${failed.join(", ")}, retake with ` +
    `node scripts/record-training-video.mjs --video ${videoSlug} --section <id>`
  );
  process.exit(1);
}
