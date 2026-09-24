// Shared recording machinery for the training-video pipeline. Desktop only:
// this app's training library never records mobile, so the mobile capture
// path from the original (screenshot-sequence assembly, drawer navigation,
// isMobile branches) is not ported. Every non-obvious rule below was learned
// by recording real takes and looking at real frames; see the comments
// before "simplifying" any of it. Ported from listing-stack-headshot's
// scripts/lib/record-core.mjs.
import { mkdirSync, rmSync, writeFileSync } from "fs";
import { CURSOR_INIT_SCRIPT } from "./cursor-overlay.mjs";
import { signInDemo } from "./demo-api.mjs";
import { assertDemoSession } from "./demo-org.mjs";
import { rebaseMarkers } from "./markers.mjs";
import { ZOOM } from "./zoom.mjs";

// Desktop: 1920x1080, no device emulation, Playwright's native
// context.recordVideo.

// The page runs at CSS zoom 1.5 so on-screen content reads clearly in a
// 1920x1080 recording. Applied via an init script (not a Playwright option)
// so it is in effect before the very first paint, and reapplied on
// DOMContentLoaded in case a full navigation resets inline styles.
//
// Confirmed live (Task 8 Step 5 check 5): Clerk's popovers (the UserButton
// menu, the OrgSwitcher menu) are positioned with floating-ui, which does
// not account for document.documentElement's CSS zoom the way the rest of
// the page's layout does. At zoom 1.5 the popover still computes its anchor
// against unzoomed coordinates and can run off the right edge of the
// 1920x1080 viewport, clipped. Controller ruling: keep zoom 1.5, and no
// section may open a Clerk popover on camera (sign-in happens off camera
// already; no training video needs the UserButton or OrgSwitcher menu open).
export const PAGE_ZOOM = 1.5;
const PAGE_ZOOM_INIT = `
  (() => {
    const apply = () => { document.documentElement.style.zoom = "${PAGE_ZOOM}"; };
    if (document.documentElement) apply();
    document.addEventListener("DOMContentLoaded", apply);
  })();
`;

/** Polls until every <img> currently within the viewport reports
 * `complete === true && naturalWidth > 0`, the actual "a viewer would see
 * pixels right now" signal, not a proxy for it. Playwright's `networkidle`
 * proves the REQUEST finished, not that the image decoded and painted; the
 * gap between those two moments is exactly the "blank for a second or two"
 * defect this exists to catch. Throws on timeout, deliberately: a take that
 * would record a still-blank placeholder should stop and be looked at, not
 * keep going. The trailing hold lets the compositor actually paint before
 * anything camera-meaningful proceeds. */
export async function assertImagesLoaded(page, { timeoutMs = 8000 } = {}) {
  try {
    await page.waitForFunction(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const inViewport = Array.from(document.querySelectorAll("img")).filter((img) => {
        const r = img.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      });
      return inViewport.every((img) => img.complete && img.naturalWidth > 0);
    }, { timeout: timeoutMs });
  } catch {
    throw new Error(
      `assertImagesLoaded(${page.url()}): at least one in-viewport <img> had not finished ` +
      `loading within ${timeoutMs}ms, this take would have recorded a blank placeholder.`
    );
  }
  await page.waitForTimeout(300);
}

/** Every authenticated route renders AppNav (src/components/AppNav.tsx),
 * which links to /productions on every authed page. Waiting for it, instead
 * of a fixed sleep, IS the "has this page reached a signed-in state"
 * assertion. If sign-in did not actually land, this throws instead of
 * silently recording whatever is on screen (a login card, a blank page,
 * etc.) as if it were the app. */
export async function assertSignedIn(page, path, { timeoutMs = 15000 } = {}) {
  try {
    await page.waitForSelector('header a[href="/productions"]', { state: "visible", timeout: timeoutMs });
  } catch {
    throw new Error(
      `assertSignedIn(${path}): AppNav never appeared within ${timeoutMs}ms ` +
      `(stuck at ${page.url()}).`
    );
  }
}

/** Resolves after the browser has painted at least one frame since the
 * call: the first rAF runs before the next paint, the second only after it.
 * Marking a beat after this ties the mark to a painted frame instead of to
 * the input dispatch. Best-effort: a navigation mid-evaluate rejects, and a
 * lost wait must never cost a take. */
async function afterPaint(page) {
  await page
    .evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    .catch(() => {});
}

/** Creates the per-take recording toolkit. `browser` is a launched Playwright
 * browser; `base` the server origin; `demo` the loaded demo-org descriptor
 * (see demo-org.mjs); `outRoot` where raw takes land (one subdir per
 * section id). */
export function createRecorder({ browser, base, demo, outRoot }) {
  /** Signs in as the demo user in a throwaway (never recorded) context,
   * takes the resulting storage state, and closes that context. Called once
   * per take, right before that take's recorded context is created, so the
   * Clerk session cookies are always fresh. */
  async function freshAuthedStorageState() {
    const { context } = await signInDemo(browser, base, demo);
    const state = await context.storageState();
    await context.close();
    return state;
  }

  // Beat markers for narration alignment. Every point() (and zoom()) is, by
  // construction, "the sentence being spoken here is about THIS element", so
  // the moment it fires is a beat boundary the narrated build can align
  // audio to. Collected per take and written to markers.json beside the raw
  // clip, wall-clock here, rebased to the clip's own zero (page creation) at
  // write time.
  let markers = [];
  // The take dir record() created, for zoom() to write its still into.
  let currentDir = null;

  /** One recorded context per take, so a bad take re-runs alone. Clears any
   * prior take first, a retake REPLACES rather than accumulates, so there is
   * never more than one file for a builder to choose between. */
  async function record(id, fn) {
    const dir = `${outRoot}/${id}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    currentDir = dir;
    const storageState = await freshAuthedStorageState();
    const ctx = await browser.newContext({
      viewport: { width: ZOOM.VIEW_W, height: ZOOM.VIEW_H },
      deviceScaleFactor: 2, // zoom stills only; recordVideo stays 1920x1080
      recordVideo: { dir, size: { width: ZOOM.VIEW_W, height: ZOOM.VIEW_H } },
      colorScheme: "light", // seeded light-mode preference must not fight prefers-color-scheme
      storageState,
    });
    await ctx.addInitScript(PAGE_ZOOM_INIT);
    await ctx.addInitScript(CURSOR_INIT_SCRIPT);
    markers = [];
    // context.recordVideo's timeline starts inside newPage(), so the clock origin is taken just before it. The capture latency that remains is FRAME_LAG_S (markers.mjs).
    const clipT0 = Date.now();
    const page = await ctx.newPage();
    // Spec: "Recorder aborts a take on any uncaught page error." point() and
    // zoom() stay best-effort for a missed SELECTOR (see their own
    // comments), but a page error is the app itself throwing, never
    // cosmetic, so it must not ship silently in a freeze-framed take.
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err));
    try {
      await fn(page);
      if (pageErrors.length > 0) {
        throw new Error(
          `record(${id}): ${pageErrors.length} uncaught page error(s) during the take: ` +
          pageErrors.map((e) => e.message).join("; ")
        );
      }
    } finally {
      await ctx.close(); // flushes the video file
    }
    writeFileSync(`${dir}/markers.json`, JSON.stringify({
      beats: rebaseMarkers(markers, clipT0),
    }, null, 2) + "\n");
    console.log(`recorded ${id} (${markers.length} beat marker(s))`);
  }

  const hold = (page, ms) => page.waitForTimeout(ms);
  const type = (page, sel, text) => page.locator(sel).pressSequentially(text, { delay: 90 });

  /** Literal-ize a path before it goes into a RegExp. App paths look inert
   * but query strings carry `?` and `.`, which are quantifiers/wildcards. */
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /** Parks the synthetic amber cursor ON the element the narration is
   * discussing. hover() runs full actionability (auto-scroll, stability) but
   * never clicks. BEST-EFFORT by design: this is cosmetic positioning, so a
   * missing/covered element logs a grep-able warning and the take keeps
   * rolling, a bad point() selector must never cost a section. */
  async function point(page, target, { timeoutMs = 4000, s = null, mark = true, steps = 12 } = {}) {
    const beat = markers.length;
    let ok = true;
    let pos = null;
    try {
      const el = (typeof target === "string" ? page.locator(target) : target).first();
      await el.waitFor({ state: "visible", timeout: timeoutMs });
      const vp = page.viewportSize();
      let box = await el.boundingBox({ timeout: timeoutMs });
      if (!box || !vp) throw new Error("no bounding box");
      // NEVER scroll to reach something already on screen. hover() runs
      // scrollIntoViewIfNeeded, which jumps INSTANTLY, and with a beat on
      // most narration sentences, back-to-back points at different page
      // positions makes the page yank up and down. Only genuinely
      // off-screen targets scroll, and then smoothly.
      const margin = 8;
      const offscreen = box.y < margin || box.y + box.height > vp.height - margin;
      if (offscreen) {
        await el.evaluate((node) =>
          node.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" }));
        await page.waitForTimeout(650); // let the smooth scroll settle
        box = await el.boundingBox({ timeout: timeoutMs });
        if (!box) throw new Error("no bounding box after scroll");
      }
      // Glide rather than teleport: the synthetic cursor tracks mousemove, so
      // stepping it reads as a hand moving to the control. steps: 1 teleports, which only the frame-lag calibration uses.
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y, { steps });
      pos = { x: Math.round(x), y: Math.round(y) };
    } catch (err) {
      ok = false;
      console.warn(`  point(): cursor not parked, ${err.message.split("\n")[0]}`);
    }
    // Marked even when the hover missed: the narration beat still exists, and
    // dropping it here would silently shift every later beat's alignment.
    // `s` is the 0-based index of the SCRIPT SENTENCE this beat illustrates,
    // counted across the section's whole narration; it comes from
    // list-vo-sentences.mjs output, never counted by hand.
    //
    // `mark: false` parks the cursor WITHOUT claiming a beat, for a second
    // cursor stop that belongs to the same narration sentence as the one
    // before it.
    if (mark) {
      await afterPaint(page);
      markers.push({ beat, at: Date.now(), ok, s, ...(pos ? { pos } : {}) });
    }
  }

  /** Zoom beat: park the cursor on the target, capture a sharp 2x still while
   * the page holds still, and record the hold window. The builder renders the
   * whole zoom (ease in, hold, ease out) from the still, so the page MUST NOT
   * change during holdMs. Best-effort like point(): a miss still emits the
   * beat (without zoom) so later s: alignment never shifts. */
  async function zoom(page, target, { s = null, scale = ZOOM.SCALE, holdMs = 2600, timeoutMs = 4000 } = {}) {
    const beat = markers.length;
    const at = Date.now();
    let info = null;
    try {
      const el = (typeof target === "string" ? page.locator(target) : target).first();
      await point(page, el, { mark: false, timeoutMs });
      await page.waitForTimeout(250); // cursor glide settles
      await afterPaint(page);
      const stillAt = Date.now();
      const box = await el.boundingBox({ timeout: timeoutMs });
      if (!box) throw new Error("no bounding box");
      const still = `zoom-${String(beat).padStart(2, "0")}.jpg`;
      await page.screenshot({ path: `${currentDir}/${still}`, type: "jpeg", quality: 92, scale: "device" });
      info = { box, scale, holdS: holdMs / 1000, still, stillAt };
    } catch (err) {
      console.warn(`  zoom(): no zoom captured, ${err.message.split("\n")[0]}`);
    }
    await page.waitForTimeout(holdMs);
    markers.push({ beat, at, ok: info !== null, s, ...(info ? { zoom: info } : {}) });
  }

  /** Navigation within an already-signed-in recorded context, asserts the
   * shell actually rendered rather than assuming it. */
  async function gotoAuthed(page, path, opts = {}) {
    await page.goto(`${base}${path}`);
    await assertSignedIn(page, path, opts);
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 15000 });
    const session = await page.evaluate(() => ({
      userId: window.Clerk.user?.id ?? null,
      orgId: window.Clerk.organization?.id ?? null,
    }));
    assertDemoSession(session, demo);
  }

  /** Deliberate, on-camera navigation to another area of the app, the
   * teaching version of a hard goto. Sections that gotoAuthed teleport,
   * which never shows a viewer HOW to get there. Parks the cursor on the nav
   * link, holds so it can be read, then clicks.
   *
   * Every stop is a point(), so this becomes a beat the narrated build can
   * align to; `s` is the sentence index of that line. Scoped to `header`:
   * AppNav (src/components/AppNav.tsx) is the only nav, with links labeled
   * "Productions", "Inventory", "My Work". */
  async function navigateSlowly(page, linkLabel, path, { s = null } = {}) {
    const linkRe = new RegExp(`^${linkLabel}\\s*$`);
    const link = page.locator("header").getByRole("link", { name: linkRe });
    await point(page, link, { s });
    await hold(page, 1100);
    await link.click();
    await page.waitForURL(new RegExp(`${escapeRe(path)}(?:$|[/?])`), { timeout: 10000 });
    await assertSignedIn(page, path);
    await hold(page, 1300); // land, and let the new page be seen before work starts
  }

  /** Open a record from its index page by clicking its row ON CAMERA.
   *
   * Reaching a sub-page (e.g. /productions/<id>) with gotoAuthed is a full
   * document load, and the white paint that follows is exactly what the
   * builder's head-trim exists to hide, but that trim only fires at a
   * section's START, so a goto placed mid-section flashes on camera.
   * Clicking the row is a client-side route: no reload, no flash, and it
   * teaches the path a viewer would use.
   *
   * Falls back to the hard goto if anything about the row goes wrong, so a
   * selector drift degrades to today's behaviour instead of killing a take
   * mid-batch. point() runs BEFORE the try block on purpose: it emits its
   * marker even when it cannot park, so both paths produce exactly ONE beat
   * and a fallback can never shift the beat-to-sentence mapping. */
  async function openRecord(
    page,
    rowText,
    fallbackPath,
    { headingRe = null, searchInput = null, s = null, timeoutMs = 8000 } = {},
  ) {
    if (searchInput) await type(page, searchInput, rowText).catch(() => {});
    const row = page.locator("main").getByText(rowText).first();
    await point(page, row, { s });
    await hold(page, 700);
    try {
      await row.click({ timeout: timeoutMs });
      if (headingRe) {
        await page
          .getByRole("heading", { level: 1, name: headingRe })
          .waitFor({ state: "visible", timeout: timeoutMs });
      } else {
        // escapeRe matters here: a path with a query string would otherwise
        // compile to a pattern whose `?` is a quantifier, which can never
        // match the real URL, the wait burns its timeout and silently falls
        // back to the goto, i.e. the flash this helper exists to remove,
        // plus dead footage.
        await page.waitForURL(new RegExp(`${escapeRe(fallbackPath)}(?:$|[/?])`), { timeout: timeoutMs });
      }
    } catch (err) {
      console.warn(`  openRecord(): row click failed, goto ${fallbackPath}, ${err.message.split("\n")[0]}`);
      await gotoAuthed(page, fallbackPath);
    }
    await hold(page, 900);
  }

  return {
    record,
    gotoAuthed,
    navigateSlowly,
    openRecord,
    hold,
    type,
    point,
    zoom,
    base,
  };
}
