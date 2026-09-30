// Training video 6: "Sharing and Billing". Script: docs/training-videos/scripts/sharing-and-billing.md.
//
// Two identities. "sender" sections record as the demo user in Demo Theatre
// Co.; "receiver" sections record as Riley Park in Demo Playhouse. Every
// prep runs off camera through the app's own API as each party, via the
// helpers in demo-productions.mjs: the sender side touches only Twelfth
// Night (rebuilt to video 4's TWELFTH_COSTUMED_STATE) and its shares; the
// receiver side deletes only its own Twelfth Night copies and resets only
// its own purchase rows (receiver-billing.mjs, the one direct billing
// writer). This file adds no other writes.
//
// Every receiver prep creates its own share token AFTER the sender reset and
// stores it under its own section id; a run takes it back out, so a token
// never crosses sections (an accepted token is single-use, and recreating
// Twelfth Night cascades its shares away).
//
// Never on camera: a Clerk popover (the org switcher is pointed at, never
// clicked), a native dialog, or OS clipboard UI. The Stripe page gets no CSS
// zoom (record-core scopes the zoom to the app origin); its own 1920x1080
// layout is what the viewer sees.
import { TWELFTH, resetSenderForSharing, createTwelfthShare, prepShareForReceiver } from "../demo-productions.mjs";
import { DEMO_ORG_NAME, RECEIVER_ORG_NAME, loadDemoOrg, loadReceiver } from "../demo-org.mjs";
import { escapeRe, roleCard, roleRow } from "../role-rows.mjs";

// Loaded lazily: the recorder already proved both identities exist before
// any prep runs, and the tests that import every walkthrough never need them.
let demoCache = null;
const demo = () => (demoCache ??= loadDemoOrg());
const receiver = () => loadReceiver(demo());

// Per-section state set by each prep and taken (once) by that section's run.
const remembered = new Map();
function remember(id, value) {
  remembered.set(id, value);
}
function recall(id) {
  if (!remembered.has(id)) throw new Error(`${id}: prep did not run; nothing to open`);
  const value = remembered.get(id);
  remembered.delete(id);
  return value;
}

const STRIPE_CARD = Object.freeze({
  email: "riley@example.com",
  number: "4242 4242 4242 4242",
  expiry: "12 / 34",
  cvc: "123",
  name: "Riley Park",
  zip: "94103",
});

/** True once `loc` is visible within `ms` (isVisible() ignores its timeout). */
const appears = (loc, ms = 2500) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

/** Guard: the header's org switcher has mounted, names the expected org, and
 * every header image (org logo, avatar) has decoded, so no frame shows the
 * half-built header Clerk paints first. */
async function waitForHeader(page, orgName) {
  const trigger = page.locator("header .cl-organizationSwitcherTrigger").filter({ hasText: orgName }).first();
  if (!(await appears(trigger, 15000))) throw new Error(`header never showed "${orgName}"; retake`);
  try {
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll("header img"));
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, null, { timeout: 10000 });
  } catch {
    throw new Error("waitForHeader: a header image had not loaded within 10 s; retake");
  }
}

/** The identity check gotoAuthed makes, for a page reached by a full load
 * the take did not goto itself (the Stripe return). */
async function assertSession(page, identity) {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 15000 });
  const session = await page.evaluate(() => ({ userId: window.Clerk.user?.id ?? null, orgId: window.Clerk.organization?.id ?? null }));
  if (session.userId !== identity.clerkUserId || session.orgId !== identity.clerkOrgId) {
    throw new Error(`session is ${session.userId} in ${session.orgId}, expected ${identity.clerkUserId} in ${identity.clerkOrgId}`);
  }
}

async function openApp(page, h, path, orgName) {
  await h.gotoAuthed(page, path);
  await waitForHeader(page, orgName);
  await h.hold(page, 500); // settle before the first beat (lessons F6)
}

/** Opens /share/<token> and throws unless the token is live. */
async function openShare(page, h, token) {
  await h.gotoAuthed(page, `/share/${token}`);
  const accept = page.locator("main").getByRole("button", { name: "Accept & copy to my organization" });
  const dead = page.locator("main").getByText(/no longer valid|already been used/);
  await Promise.race([
    accept.waitFor({ state: "visible", timeout: 10000 }),
    dead.waitFor({ state: "visible", timeout: 10000 }),
  ]).catch(() => {});
  if (await dead.isVisible()) throw new Error("share page reports the link as dead; the prep token is stale");
  if (!(await accept.isVisible())) throw new Error("share page never showed Accept & copy to my organization");
  await waitForHeader(page, RECEIVER_ORG_NAME);
  await h.hold(page, 500);
  return accept;
}

/** Guard (Review Focus 2): the receiver has no plan, so /productions/new
 * renders the subscribe page. */
const subscribeH1 = (page) => page.getByRole("heading", { level: 1, name: "Subscribe to add a production" });
async function assertSubscribePage(page, where) {
  if (!(await appears(subscribeH1(page), 10000))) {
    throw new Error(`${where}: "Subscribe to add a production" is not showing; the receiver already holds a plan or unlock`);
  }
}

const switcher = (page) => page.locator("header .cl-organizationSwitcherTrigger").first();
const shareTrigger = (page) => page.locator("main").getByRole("button", { name: /^Share production/ }).first();
const planCard = (page, name) => page.locator("main article").filter({ has: page.getByRole("heading", { name, exact: true }) }).first();

/** Places an invisible, non-interactive 8x8 anchor whose centre sits at
 * viewport point (cx, cy), and returns its locator. A point() or zoom() on it
 * parks the cursor on empty space, so a zoom centred there never covers the
 * text it magnifies (lessons A4). The page's CSS zoom is measured rather than
 * assumed: the span is placed once, its real box read back, and moved by the
 * error. Paints nothing. */
async function placeAnchor(page, id, cx, cy) {
  const SIZE = 8;
  const set = (left, top) => page.evaluate(({ anchorId, left, top, size }) => {
    let a = document.getElementById(anchorId);
    if (!a) {
      a = document.createElement("span");
      a.id = anchorId;
      a.setAttribute("aria-hidden", "true");
      Object.assign(a.style, { position: "absolute", width: `${size}px`, height: `${size}px`, pointerEvents: "none", opacity: "0.01", zIndex: "0" });
      document.body.appendChild(a);
    }
    a.style.left = `${left}px`;
    a.style.top = `${top}px`;
  }, { anchorId: id, left, top, size: SIZE });
  const anchor = page.locator(`#${id}`);
  await set(0, 0);
  const origin = await anchor.boundingBox();
  if (!origin) throw new Error(`placeAnchor ${id}: no box`);
  const k = origin.width / SIZE;
  let left = (cx - origin.width / 2 - origin.x) / k;
  let top = (cy - origin.height / 2 - origin.y) / k;
  await set(left, top);
  const box = await anchor.boundingBox();
  if (!box) throw new Error(`placeAnchor ${id}: no box after placing`);
  left += (cx - (box.x + box.width / 2)) / k;
  top += (cy - (box.y + box.height / 2)) / k;
  await set(left, top);
  const check = await anchor.boundingBox();
  if (!check || Math.abs(check.x + check.width / 2 - cx) > 3 || Math.abs(check.y + check.height / 2 - cy) > 3) {
    throw new Error(`placeAnchor ${id}: anchor landed off target`);
  }
  return anchor;
}

/** Viewport box of the last rendered line of `loc`'s text, calibrated
 * against Playwright's own box for the element (CSS zoom safe). */
async function lastLineBox(loc) {
  const box = await loc.boundingBox();
  if (!box) throw new Error("lastLineBox: no box");
  const r = await loc.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = Array.from(range.getClientRects()).filter((q) => q.width > 0);
    const last = rects[rects.length - 1];
    const b = el.getBoundingClientRect();
    return { bx: b.x, by: b.y, bw: b.width, x: last.x, y: last.y, w: last.width, h: last.height };
  });
  const k = box.width / r.bw;
  return { x: box.x + (r.x - r.bx) * k, y: box.y + (r.y - r.by) * k, width: r.w * k, height: r.h * k };
}

/** Anchor just past the end of `loc`'s last line of text. */
async function anchorAfterText(page, loc, id) {
  const line = await lastLineBox(loc);
  return placeAnchor(page, id, line.x + line.width + 28, line.y + line.height / 2);
}

/** Anchor in the header's empty stretch between the org switcher and the
 * first nav link. */
async function headerGapAnchor(page, id) {
  const sw = await switcher(page).boundingBox();
  const nav = await page.locator("header").getByRole("link", { name: "Productions", exact: true }).first().boundingBox();
  if (!sw || !nav) throw new Error("headerGapAnchor: no header boxes");
  return placeAnchor(page, id, (sw.x + sw.width + nav.x) / 2, sw.y + sw.height / 2);
}

/** Moves the cursor to the centre of `loc`'s box and clicks there with the
 * mouse. Stripe's payment-method labels only answer a real mouse click, and
 * Playwright's locator click reports them as not visible. */
async function mouseClick(page, loc) {
  const box = await loc.boundingBox({ timeout: 8000 });
  if (!box) throw new Error("mouseClick: no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(250);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

export const WALKTHROUGH = {
  slug: "sharing-and-billing",
  title: "Sharing and Billing",
  guideAnchor: "sharing",
  needsReceiver: true,
  sections: [
    {
      id: "intro",
      heading: "Sharing and billing",
      actor: "sender",
      targetSeconds: 19,
      prep: async (api) => remember("intro", await resetSenderForSharing(api)),
      run: async (page, h) => {
        await openApp(page, h, `/productions/${recall("intro")}`, DEMO_ORG_NAME);
        // s:0 plays over the title card; the first beat is s:1.
        // s:1: "When another company or school stages the same play, you can
        // give them a copy of your production."
        await h.point(page, page.getByRole("heading", { level: 1, name: TWELFTH }), { s: 1 });
        await h.hold(page, 1600);
        await h.point(page, shareTrigger(page), { s: 1, mark: false });
        await h.hold(page, 2400);
        // s:2: "In this video, we will share Twelfth Night, and then see the
        // other side..." The header row is full width: its centre is empty
        // space between "Productions" and "Share production".
        await h.zoom(page, shareTrigger(page).locator("xpath=.."), { s: 2, holdMs: 3000 });
        await h.point(page, roleRow(page, "Viola"), { s: 2, mark: false });
        await h.hold(page, 2000);
        await h.point(page, shareTrigger(page), { s: 2, mark: false });
        await h.hold(page, 1600);
        // s:3: "We will use two organizations to show both sides clearly."
        // Point only: never open a Clerk popover.
        await h.point(page, switcher(page), { s: 3 });
        await h.hold(page, 2600);
      },
    },
    {
      id: "share-link",
      heading: "Share a production",
      actor: "sender",
      targetSeconds: 24,
      prep: async (api) => remember("share-link", await resetSenderForSharing(api)),
      run: async (page, h) => {
        const productionId = recall("share-link");
        await openApp(page, h, "/productions", DEMO_ORG_NAME);
        // s:0: "Open the production, and choose Share production." Client-side
        // route from the Productions page, then the header link.
        const card = page.locator(`main a[href="/productions/${productionId}"]`).first();
        await h.point(page, card.getByText(TWELFTH, { exact: true }).first(), { s: 0 });
        await h.hold(page, 600);
        await card.getByText(TWELFTH, { exact: true }).first().click();
        await page.waitForURL(new RegExp(`/productions/${escapeRe(productionId)}$`), { timeout: 10000 });
        await page.getByRole("heading", { level: 1, name: TWELFTH }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 400);
        const trigger = page.locator("main").getByRole("button", { name: "Share production →" });
        await h.point(page, trigger, { s: 0, mark: false });
        await h.hold(page, 400);
        await trigger.click();
        const para = page.locator("main p").filter({ hasText: "Performers and their measurements are not shared." }).first();
        if (!(await appears(para, 2500))) {
          await h.hold(page, 400);
          await trigger.click(); // lessons B5
        }
        await para.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 500);
        // s:1: "The copy includes your roles, costume designs, notes, ideas,
        // and photos."
        // The zoom centres on empty space between the paragraph and the email
        // label, right of the short last line ("...are not shared."), so the
        // cursor never covers a word it magnifies.
        const paraBox = await para.boundingBox();
        const labelBox = await page.locator("main").getByText(/email the link to/i).first().boundingBox();
        if (!paraBox || !labelBox) throw new Error("share-link: no box for the paragraph or the email label");
        const gap = await placeAnchor(page, "sab-gap-para", paraBox.x + paraBox.width * 0.8, (paraBox.y + paraBox.height + labelBox.y) / 2);
        await h.zoom(page, gap, { s: 1, holdMs: 3200 });
        await h.hold(page, 600);
        // s:2: "Your performers and their measurements always stay with you."
        // Parked just past the paragraph's last line, which says exactly that.
        await h.point(page, await anchorAfterText(page, para, "sab-anchor-performers"), { s: 2 });
        await h.hold(page, 2400);
        // s:3: "Choose Share to make a link."
        const share = page.locator("main").getByRole("button", { name: "Share", exact: true });
        await h.point(page, share, { s: 3 });
        await h.hold(page, 400);
        await share.click();
        const ready = page.locator("main").getByText("Share link ready", { exact: true });
        await ready.waitFor({ state: "visible", timeout: 8000 });
        const copy = page.locator("main").getByRole("button", { name: "Copy link", exact: true });
        await copy.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 400);
        // s:4: "Each link works one time, for one company." A point, not a
        // zoom: any crop here would magnify the link text (ruling 3).
        await h.point(page, ready, { s: 4 });
        await h.hold(page, 2200);
        // s:5: "Choose Copy link, then send it however you like..."
        await h.point(page, copy, { s: 5 });
        await h.hold(page, 400);
        await copy.click();
        // Glide off the button at once so Copied! is readable, not under the cursor.
        await h.point(page, ready, { s: 5, mark: false, steps: 6 });
        const copied = page.locator("main").getByRole("button", { name: "Copied!", exact: true });
        if (!(await appears(copied, 1200))) throw new Error("share-link: Copied! never showed");
        // Guard: the clipboard holds exactly the link in the box.
        const link = await page.locator("main").getByRole("textbox", { name: "Share link" }).inputValue();
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        if (clip !== link) throw new Error("share-link: the clipboard does not hold the Share link value");
        await h.hold(page, 3000);
      },
    },
    {
      id: "active-links",
      heading: "Manage your links",
      actor: "sender",
      targetSeconds: 16,
      prep: async (api) => {
        const productionId = await resetSenderForSharing(api);
        await createTwelfthShare(api, productionId);
        await createTwelfthShare(api, productionId);
        remember("active-links", productionId);
      },
      run: async (page, h) => {
        await openApp(page, h, `/productions/${recall("active-links")}`, DEMO_ORG_NAME);
        const trigger = page.locator("main").getByRole("button", { name: "Share production →" });
        // s:0: "Links you have not used yet stay listed under Active links."
        // The panel opens late in the sentence, so the page changes again well
        // inside the QC freeze window before the revoke.
        await h.point(page, trigger, { s: 0 });
        await h.hold(page, 1500);
        await trigger.click();
        const label = page.locator("main").getByText("Active links", { exact: true });
        if (!(await appears(label, 2500))) {
          await h.hold(page, 400);
          await trigger.click(); // lessons B5
        }
        await label.waitFor({ state: "visible", timeout: 6000 });
        const rows = page.locator("main li").filter({ has: page.getByRole("button", { name: "Revoke", exact: true }) });
        await page.waitForFunction((n) => document.querySelectorAll("main li button").length >= n, 4, { timeout: 6000 });
        if ((await rows.count()) !== 2) throw new Error(`active-links: expected 2 active links, found ${await rows.count()}`);
        await h.hold(page, 300);
        // No zoom in this section: any crop here would magnify the link text
        // (ruling 3).
        await h.point(page, label, { s: 0, mark: false });
        await h.hold(page, 1200);
        // s:1: "You can copy a link again if it never got sent..."
        const top = rows.first();
        const copyTop = top.getByRole("button", { name: "Copy", exact: true });
        await h.point(page, copyTop, { s: 1 });
        await h.hold(page, 500);
        await copyTop.click();
        await h.point(page, label, { s: 1, mark: false, steps: 6 });
        if (!(await appears(top.getByRole("button", { name: "Copied!", exact: true }), 1200))) {
          throw new Error("active-links: Copied! never showed on the top row");
        }
        await h.hold(page, 1700);
        // s:2: "Revoke a link you no longer want to work, and it stops
        // immediately, with no confirmation needed."
        const revoke = top.getByRole("button", { name: "Revoke", exact: true });
        await h.point(page, revoke, { s: 2 });
        await h.hold(page, 250);
        await revoke.click();
        const revoking = page.locator("main").getByRole("button", { name: "Revoking…", exact: true });
        if (!(await appears(revoking, 1500))) throw new Error("active-links: the revoked row never struck through");
        await revoking.waitFor({ state: "detached", timeout: 8000 });
        await page.waitForFunction(() => document.querySelectorAll("main li").length > 0, null, { timeout: 4000 });
        if ((await rows.count()) !== 1) throw new Error(`active-links: expected 1 link after revoke, found ${await rows.count()}`);
        await h.hold(page, 800);
        await h.point(page, rows.first().getByRole("button", { name: "Revoke", exact: true }), { s: 2, mark: false });
        await h.hold(page, 1400);
      },
    },
    {
      id: "open-link",
      heading: "Open the link",
      actor: "receiver",
      targetSeconds: 28,
      prep: async (senderApi, { receiverApi }) => {
        const { token } = await prepShareForReceiver(senderApi, receiverApi, { demo: demo(), grantUnlock: false });
        remember("open-link", token);
      },
      run: async (page, h) => {
        const accept = await openShare(page, h, recall("open-link"));
        // s:0: "Now we are at Demo Playhouse, the company receiving the copy."
        // Point, then zoom the header beside it (never click it: a Clerk popover).
        await h.point(page, switcher(page), { s: 0 });
        await h.hold(page, 900);
        await h.zoom(page, await headerGapAnchor(page, "sab-header-gap"), { s: 0, holdMs: 2400 });
        // s:1: "Opening the link shows what is included, before anything is copied."
        const card = page.locator("main div.surface").first();
        await h.point(page, card.getByText(TWELFTH, { exact: true }), { s: 1 });
        await h.hold(page, 2400);
        // s:2: "The card lists the title, how many roles and costume designs
        // are inside..." The card plus the line under it: its centre is the
        // empty gap below the card, clear of every line of text.
        await h.zoom(page, card.locator("xpath=.."), { s: 2, holdMs: 3600 });
        await h.point(page, card.getByText(/^\d+ roles? ·/), { s: 2, mark: false });
        await h.hold(page, 1600);
        await h.point(page, card.getByText("Performers and measurements are not included.", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 2400);
        // s:3: "Accepting a share creates a new production, so it needs a plan
        // on this side too."
        // Zoom beside the "Accepting copies this..." line, on empty space.
        const note = page.locator("main p").filter({ hasText: "Accepting copies this" }).first();
        await h.zoom(page, await anchorAfterText(page, note, "sab-after-note"), { s: 3, holdMs: 2200 });
        await h.point(page, accept, { s: 3, mark: false });
        await h.hold(page, 500);
        await accept.click();
        const msg = page.locator("main p").filter({ hasText: "This action needs a production unlock." }).first();
        if (!(await appears(msg, 8000))) throw new Error("open-link: the 402 message never showed");
        await h.hold(page, 1400);
        // s:4: "Without one, the app tells you plainly, right here, before
        // anything is copied."
        await h.zoom(page, await anchorAfterText(page, msg, "sab-after-402"), { s: 4, holdMs: 3000 });
        await h.hold(page, 1200);
      },
    },
    {
      id: "plans",
      heading: "Plans",
      actor: "receiver",
      targetSeconds: 24,
      prep: async (senderApi, { receiverApi }) => {
        const { token } = await prepShareForReceiver(senderApi, receiverApi, { demo: demo(), grantUnlock: false });
        remember("plans", token);
      },
      run: async (page, h) => {
        recall("plans"); // this section never opens the link; the token dies with the section
        await openApp(page, h, "/productions", RECEIVER_ORG_NAME);
        // Guard before the first beat (Review Focus 2): the page New
        // Production leads to is the subscribe page.
        const html = await page.evaluate(async () => (await fetch("/productions/new", { credentials: "include" })).text());
        if (!html.includes("Subscribe to add a production")) {
          throw new Error("plans: /productions/new is not the subscribe page; the receiver already holds a plan or unlock");
        }
        // s:0: "To see the plans, choose New Production."
        const newProd = page.locator("main").getByRole("link", { name: /New Production/ }).first();
        await h.point(page, newProd, { s: 0 });
        await h.hold(page, 600);
        await newProd.click();
        await assertSubscribePage(page, "plans");
        await h.hold(page, 500);
        // s:1: "Any member of your organization can choose a plan here, not just admins."
        await h.point(page, subscribeH1(page), { s: 1 });
        await h.hold(page, 1800);
        await h.point(page, switcher(page), { s: 1, mark: false });
        await h.hold(page, 1600);
        // s:2: "Pay Per Production covers one production with three makers,
        // and you can add more makers for ten dollars each."
        const per = planCard(page, "Pay Per Production");
        const unlBox = await planCard(page, "Unlimited").boundingBox();
        const perBox = await per.boundingBox();
        if (!unlBox || !perBox) throw new Error("plans: no plan card boxes");
        // Zoom centred in the gutter between the two cards (lessons A4).
        const gutter = await placeAnchor(page, "sab-plan-gutter", (perBox.x + perBox.width + unlBox.x) / 2, perBox.y + perBox.height / 2);
        await h.zoom(page, gutter, { s: 2, holdMs: 2600 });
        await h.point(page, per.getByText("$49.99", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 900);
        await h.point(page, per.getByText("3 makers included", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 1500);
        await h.point(page, per.getByText("+$10 per extra maker", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 1800);
        // s:3: "Unlimited covers every production and every maker for a year."
        const unl = planCard(page, "Unlimited");
        // Zoom beside the "Best value" label, on the card's empty top-right.
        await h.zoom(page, await anchorAfterText(page, unl.getByText("Best value", { exact: true }), "sab-after-best"), { s: 3, holdMs: 2200 });
        await h.point(page, unl.getByText("$99.99", { exact: true }), { s: 3, mark: false });
        await h.hold(page, 1300);
        // s:4: "Add more productions later the same way, any time you need one."
        await h.point(page, per.getByRole("button", { name: "Choose →" }), { s: 4 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "checkout",
      heading: "Checkout",
      actor: "receiver",
      targetSeconds: 28,
      prep: async (senderApi, { receiverApi }) => {
        const { token } = await prepShareForReceiver(senderApi, receiverApi, { demo: demo(), grantUnlock: false });
        remember("checkout", token);
      },
      run: async (page, h) => {
        recall("checkout"); // never opened here
        await openApp(page, h, "/productions/new", RECEIVER_ORG_NAME);
        await assertSubscribePage(page, "checkout");
        // s:0: "Choose a plan to pay securely with Stripe."
        const choose = planCard(page, "Pay Per Production").getByRole("button", { name: "Choose →" });
        await h.point(page, choose, { s: 0 });
        await h.hold(page, 700);
        await choose.click();
        await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30000 });
        // First checkout for this org: an empty #email input to type into.
        // Every later one: Stripe reuses the org's customer (the app stores
        // it) and shows that customer's email read-only instead.
        const email = page.locator("#email");
        const savedEmail = page.getByText(STRIPE_CARD.email, { exact: true }).first();
        await Promise.race([
          email.waitFor({ state: "visible", timeout: 20000 }),
          savedEmail.waitFor({ state: "visible", timeout: 20000 }),
        ]).catch(() => {});
        const typeEmail = await email.isVisible();
        if (!typeEmail && !(await savedEmail.isVisible())) throw new Error("checkout: Stripe showed neither an email field nor the saved email");
        const price = page.getByText("$49.99", { exact: true }).first();
        await price.waitFor({ state: "visible", timeout: 10000 });
        const cardLabel = page.locator("#payment-method-label-card");
        await cardLabel.waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 400);
        // No zoom anywhere on Stripe: its own 1920x1080 layout is the shot.
        // s:1: "We will pay for one production." Parked beside the price.
        await h.point(page, await anchorAfterText(page, price, "sab-after-price"), { s: 1 });
        await h.hold(page, 1300);
        // s:2: "Stripe handles your card, so the app never sees or stores the number."
        // The card number goes in here, while the line is about the card.
        // Stripe's own processing after Pay takes about 12 s, so the stretch
        // from s:3 to the landing only fits the voice if the number is typed
        // before s:3.
        await h.point(page, cardLabel, { s: 2 });
        await h.hold(page, 500);
        const number = page.locator("#cardNumber");
        await mouseClick(page, cardLabel);
        if (!(await appears(number, 3000))) {
          await page.waitForTimeout(400);
          await mouseClick(page, cardLabel); // lessons B5
          if (!(await appears(number, 4000))) throw new Error("checkout: the Card row never opened its fields");
        }
        const typeField = async (sel, text, s) => {
          const field = page.locator(sel);
          await h.point(page, field, { s, mark: false, steps: 4 });
          await field.click();
          await field.pressSequentially(text, { delay: 15 });
        };
        await typeField("#cardNumber", STRIPE_CARD.number, 2);
        await typeField("#cardExpiry", STRIPE_CARD.expiry, 2);
        await typeField("#cardCvc", STRIPE_CARD.cvc, 2);
        await h.hold(page, 300);
        // s:3: "Enter an email and your card details, then choose Pay."
        if (typeEmail) {
          await h.point(page, email, { s: 3, steps: 8 });
          await email.click();
          await email.pressSequentially(STRIPE_CARD.email, { delay: 15 });
        } else {
          await h.point(page, savedEmail, { s: 3, steps: 8 });
          await h.hold(page, 200);
        }
        await typeField("#billingName", STRIPE_CARD.name, 3);
        await typeField("#billingPostalCode", STRIPE_CARD.zip, 3);
        // Untick "Save my information for faster checkout" so no Link phone
        // prompt ever shows; assert before Pay.
        const pass = page.locator("#enableStripePass");
        if (await pass.isChecked()) {
          await mouseClick(page, pass);
          if (await pass.isChecked()) {
            await page.waitForTimeout(300);
            await pass.click({ force: true }); // lessons B5
          }
        }
        if (await pass.isChecked()) throw new Error("checkout: Save my information is still ticked; refusing to Pay");
        await h.hold(page, 350); // the unticked box reads on camera before Pay
        const pay = page.locator('button[type="submit"]').first();
        await h.point(page, pay, { s: 3, mark: false, steps: 6 });
        await pay.click();
        const isHome = (u) => u.origin === h.base && u.pathname === "/productions";
        // s:4: "This is a test card in a sandbox, so no real charge happens."
        // The beat sits about 3 s into Stripe's processing, on Stripe's own
        // Sandbox badge: an earlier beat would pin the processing wait
        // against s:4's short voice and push the landing past s:5.
        const landedEarly = await page.waitForURL(isHome, { timeout: 3000 }).then(() => true, () => false);
        const badge = page.getByText("Sandbox", { exact: true }).first();
        await h.point(page, landedEarly ? page.locator("main h1").first() : badge, { s: 4, steps: 10 });
        await page.waitForURL(isHome, { timeout: 60000 });
        // s:5: "When the payment goes through, you land back in the app, ready to go."
        // The beat waits for the finished header, never Clerk's half-built one.
        const newProd = page.locator("main").getByRole("link", { name: /New Production/ }).first();
        await newProd.waitFor({ state: "visible", timeout: 15000 });
        await waitForHeader(page, RECEIVER_ORG_NAME);
        await h.point(page, page.locator("main h1").first(), { s: 5, steps: 8 });
        await assertSession(page, receiver());
        // Guard, with the take still recording: the org is paid now.
        const status = await page.evaluate(async () => (await fetch("/api/billing/status", { credentials: "include" })).json());
        if (status.isPaidOrg !== true) throw new Error("checkout: /api/billing/status reports isPaidOrg false after Pay");
        await h.hold(page, 600);
        // s:6: "Your new plan is active right away, so you can start the
        // production immediately."
        // Zoom centred on the empty stretch between the Productions title and
        // New Production, so the page moves again inside the QC freeze window.
        const homeH1 = await page.locator("main h1").first().boundingBox();
        const newBox = await newProd.boundingBox();
        if (!homeH1 || !newBox) throw new Error("checkout: no box for the Productions title or New Production");
        const rowGap = await placeAnchor(page, "sab-home-gap", (homeH1.x + homeH1.width + newBox.x) / 2, newBox.y + newBox.height / 2);
        await h.zoom(page, rowGap, { s: 6, holdMs: 2200 });
        await h.point(page, newProd, { s: 6, mark: false });
        await h.hold(page, 800);
      },
    },
    {
      id: "accept",
      heading: "Accept the copy",
      actor: "receiver",
      targetSeconds: 23,
      prep: async (senderApi, { receiverApi }) => {
        const { token } = await prepShareForReceiver(senderApi, receiverApi, { demo: demo(), grantUnlock: true });
        remember("accept", token);
      },
      run: async (page, h) => {
        const accept = await openShare(page, h, recall("accept"));
        // s:0: "Open the link again, and accept it."
        await h.point(page, accept, { s: 0 });
        await h.hold(page, 500);
        await accept.click();
        await page.waitForURL(/\/productions\/[0-9a-f-]{36}$/, { timeout: 20000 });
        const h1 = page.getByRole("heading", { level: 1 }).first();
        await h1.waitFor({ state: "visible", timeout: 10000 });
        if ((await h1.innerText()).trim() !== TWELFTH) throw new Error(`accept: landed on "${await h1.innerText()}", not ${TWELFTH}`);
        await assertSession(page, receiver());
        await waitForHeader(page, RECEIVER_ORG_NAME);
        // s:1: "The production is copied into your company, with its roles,
        // designs, and photos." Viola's Costume tab, then her Doublet sketch.
        const row = roleRow(page, "Viola");
        const card = roleCard(page, "Viola");
        await h.point(page, row, { s: 1 });
        await h.hold(page, 300);
        await row.click();
        const tab = card.getByRole("button", { name: "Costume", exact: true });
        if (!(await appears(tab, 2500))) {
          await h.hold(page, 400);
          await row.click(); // lessons B5
        }
        await tab.waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, tab, { s: 1, mark: false, steps: 8 });
        await tab.click();
        const toggle = card.getByRole("button", { name: /^[▸▾]\s*Doublet$/ }).first();
        await toggle.waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, toggle, { s: 1, mark: false, steps: 8 });
        await toggle.click();
        const sketch = card.getByRole("img", { name: "Reference 1" }).first();
        if (!(await appears(sketch, 3000))) {
          await h.hold(page, 400);
          await toggle.click(); // lessons B5
        }
        await sketch.waitFor({ state: "visible", timeout: 10000 });
        await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await sketch.elementHandle(), { timeout: 10000 });
        await h.hold(page, 300);
        // The strip's full-width row: its centre is empty space to the right
        // of the sketch, so the cursor never covers it (lessons A4).
        await h.zoom(page, sketch.locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), { s: 1, holdMs: 2600 });
        // s:2: "It lands as a brand new production, ready for your company to build on."
        await h.point(page, h1, { s: 2 });
        await h.hold(page, 800);
        // The header row is full width: its centre is empty space between
        // "Productions" and "Share production".
        await h.zoom(page, shareTrigger(page).locator("xpath=.."), { s: 2, holdMs: 2200 });
        // s:3: "It is your copy now."
        await h.point(page, row, { s: 3 });
        await h.hold(page, 900);
        // s:4: "Add your own performers and measurements, and change anything you like."
        const importCast = page.locator("main").getByRole("button", { name: "Import cast list", exact: true });
        const castBox = await importCast.boundingBox();
        const h1Box = await h1.boundingBox();
        if (!castBox || !h1Box) throw new Error("accept: no box for Import cast list or the title");
        // Zoom centred on the empty stretch of the Key row, left of the imports.
        const keyGap = await placeAnchor(page, "sab-key-gap", (h1Box.x + castBox.x) / 2 + 40, castBox.y + castBox.height / 2);
        await h.zoom(page, keyGap, { s: 4, holdMs: 2200 });
        await h.point(page, importCast, { s: 4, mark: false });
        await h.hold(page, 900);
        await h.point(page, page.locator("main").getByRole("button", { name: "Import measurement forms", exact: true }), { s: 4, mark: false });
        await h.hold(page, 1400);
        // s:5: "Changes on either side never affect the other."
        await h.point(page, sketch, { s: 5 });
        await h.hold(page, 2200);
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      actor: "receiver",
      targetSeconds: 17,
      prep: async (senderApi, { receiverApi }) => {
        const { token } = await prepShareForReceiver(senderApi, receiverApi, { demo: demo(), grantUnlock: true });
        await receiverApi.post(`/api/shares/${token}/accept`, {});
      },
      run: async (page, h) => {
        await openApp(page, h, "/productions", RECEIVER_ORG_NAME);
        const copy = page.locator("main").getByRole("link").filter({ hasText: TWELFTH });
        if ((await copy.count()) < 1) throw new Error("wrap-up: the Twelfth Night copy is not on the receiver's Productions page");
        // s:0: "You can see your plan anytime under Billing, in your
        // organization menu at the top of the page." Point only: never click
        // the switcher (a Clerk popover).
        await h.point(page, switcher(page), { s: 0 });
        await h.hold(page, 2200);
        await h.zoom(page, await headerGapAnchor(page, "sab-header-gap"), { s: 0, holdMs: 2400 });
        // s:1: "If you want the details again, the User Guide covers sharing and billing too."
        await h.point(page, page.locator("main").getByText("User Guide →", { exact: true }).first(), { s: 1 });
        await h.hold(page, 3000);
        // s:2: "That is sharing and billing, and that completes the series."
        const title = page.locator("main").getByText(TWELFTH, { exact: true }).first();
        const badge = page.locator("main").getByText("No date set", { exact: true }).first();
        const titleBox = await title.boundingBox();
        const badgeBox = await badge.boundingBox();
        if (!titleBox || !badgeBox) throw new Error("wrap-up: no box for the Twelfth Night card");
        // Zoom centred on the card's empty middle, between title and date badge.
        const cardGap = await placeAnchor(page, "sab-card-gap", (titleBox.x + titleBox.width + badgeBox.x) / 2, titleBox.y + titleBox.height / 2);
        await h.zoom(page, cardGap, { s: 2, holdMs: 2400 });
        await h.point(page, title, { s: 2, mark: false });
        await h.hold(page, 800);
        // s:3: "Thanks for watching, and break a leg."
        await h.point(page, page.locator("main").getByRole("link", { name: /New Production/ }).first(), { s: 3 });
        await h.hold(page, 1400);
      },
    },
  ],
};
