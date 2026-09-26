// Training video 4: "Costume Creations". Script: docs/training-videos/scripts/costume-creations.md.
//
// DB state: only the demo org's "Twelfth Night", the two DEMO_MAKERS, and
// the House Inventory items named in DEMO_INVENTORY_NAMES are touched. Every
// prep first runs resetDemoCostumeOrg (inventory cleanup by exact name, maker
// colors), then rebuilds Twelfth Night (resetTwelfthNight) from video 3's end
// state plus exactly the costume work the viewer saw done in the earlier
// sections, so any section retakes alone.
//
// "estimate-fabric" films a live AI call. The walkthrough throws unless every
// targeted piece comes back with a yardage, so a bad estimate is never
// filmed; the narration never reads an estimated number aloud, and the later
// sections start from fixed yardages (ESTIMATED below), so their retakes
// never depend on the model's answer.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TWELFTH, TWELFTH_ENSEMBLE, TWELFTH_MEASURED_STATE, DEMO_MAKERS,
  resetDemoCostumeOrg, resetTwelfthNight,
} from "../demo-productions.mjs";
import { ROSA_FORM } from "../demo-measurement-form.mjs";
import { escapeRe, roleRow, roleCard } from "../role-rows.mjs";

const SKETCH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../fixtures/training/costume-sketch-viola-doublet.jpg",
);

const MAYA = "Maya Brooks";
const JORDAN = "Jordan Lee";
const THEO = "Theo Park";
const ROSA = ROSA_FORM.name; // "Rosa Diaz"
const [PRIYA, SAM] = DEMO_MAKERS.map((m) => m.name);
if (PRIYA !== "Priya Shah" || SAM !== "Sam Ortiz") {
  throw new Error("costume-creations walkthrough: DEMO_MAKERS changed; the narration and zooms assume Priya Shah (pink) and Sam Ortiz (orange)");
}

// What "photos-notes" types on camera into the Doublet's notes.
const DOUBLET_NOTES = "Green wool, brass buttons, fitted to the waist.";
// What "creations-page" types on camera for Maya's Doublet.
const DOUBLET_FABRIC = Object.freeze({ name: "Wool suiting", color: "Deep green", widthIn: 60, unitCost: 18, supplier: "Mill End Textiles" });
// What "skirt-yardage" sets on camera for Rosa's skirt: Full circle, Width
// 60, Length typed as 36 (shorter than her 40 inch outseam below).
const SKIRT_WIDTH = "60";
const SKIRT_LENGTH = "36";

// Video 3 imported twelve values for Rosa Diaz and no outseam. The skirt
// section's narration says the Length "starts from the performer's own
// outseam", and the Length hint only says so when an outseam exists (with
// none it reads "No outseam recorded yet"), so Rosa gets one here, off
// camera: 40 inches, consistent with her 30 inch inseam and 58 inch nape to
// floor. Nothing in video 4 lists her measurement count.
const ROSA_OUTSEAM = 40;
const BASE_STATE = Object.freeze({
  ...TWELFTH_MEASURED_STATE,
  measurements: Object.freeze({
    ...TWELFTH_MEASURED_STATE.measurements,
    [ROSA]: Object.freeze({ ...TWELFTH_MEASURED_STATE.measurements[ROSA], outseam: ROSA_OUTSEAM }),
  }),
});

// Designs, section by section. A design is one costume piece on a role.
const VIOLA_DESIGNS = [
  { role: "Viola", name: "Doublet" },
  { role: "Viola", name: "Breeches" },
  { role: "Viola", name: "Boots" },
];
const VIOLA_DESIGNS_WITH_PHOTO = [
  { role: "Viola", name: "Doublet", notes: DOUBLET_NOTES, photos: [SKETCH] },
  { role: "Viola", name: "Breeches" },
  { role: "Viola", name: "Boots" },
];
// "creations-page" onward: pieces on the other roles, so the To make list is
// not thin. Rosa Diaz wears the Musicians' skirt, the others its tunic; the
// pieces nobody wears are marked "On hand" so they leave the To make list.
const ALL_DESIGNS = [
  ...VIOLA_DESIGNS_WITH_PHOTO,
  { role: "Olivia", name: "Gown" },
  { role: "Sebastian", name: "Doublet" },
  { role: TWELFTH_ENSEMBLE, name: "Skirt" },
  { role: TWELFTH_ENSEMBLE, name: "Tunic" },
];

const BOOTS_PURCHASED = { role: "Viola", design: "Boots", performer: MAYA, source: "purchase", purchasePrice: 45 };
const ENSEMBLE_SPLIT = [
  { role: TWELFTH_ENSEMBLE, design: "Skirt", performer: THEO, source: "on_hand" },
  { role: TWELFTH_ENSEMBLE, design: "Skirt", performer: JORDAN, source: "on_hand" },
  { role: TWELFTH_ENSEMBLE, design: "Tunic", performer: ROSA, source: "on_hand" },
];

const withCostumes = (designs, pieces) => ({ ...BASE_STATE, designs, pieces });

const STATE_PHOTOS = withCostumes(VIOLA_DESIGNS, []);
const STATE_MAKE_OR_BUY = withCostumes(VIOLA_DESIGNS_WITH_PHOTO, []);
const STATE_MAKERS = withCostumes(VIOLA_DESIGNS_WITH_PHOTO, [BOOTS_PURCHASED]);

const piecesCreations = (doubletFabric) => [
  { role: "Viola", design: "Doublet", performer: MAYA, source: "make", maker: PRIYA, ...(doubletFabric ? { fabric: doubletFabric } : {}) },
  { role: "Viola", design: "Breeches", performer: MAYA, source: "make", maker: SAM },
  BOOTS_PURCHASED,
  ...ENSEMBLE_SPLIT,
];
const STATE_CREATIONS = withCostumes(ALL_DESIGNS, piecesCreations(null));
const STATE_SKIRT = withCostumes(ALL_DESIGNS, piecesCreations(DOUBLET_FABRIC));
const ROSA_SKIRT = { type: "full_circle", lengthIn: Number(SKIRT_LENGTH) };
// What the calculator shows on camera for Rosa's full circle skirt: waist
// 26.5, length 36, 60 inch fabric (read off the live page; "skirt-yardage"
// throws if the take shows anything else).
const ROSA_SKIRT_YARDS = "5.25";
const STATE_ESTIMATE = withCostumes(ALL_DESIGNS, [
  ...piecesCreations(DOUBLET_FABRIC),
  { role: TWELFTH_ENSEMBLE, design: "Skirt", performer: ROSA, source: "make", fabric: { widthIn: Number(SKIRT_WIDTH), yardage: Number(ROSA_SKIRT_YARDS) }, skirt: ROSA_SKIRT },
]);

// Fixed stand-ins for the live estimate, plus fabric for every piece so the
// Shopping tab groups by type with a cost on each line. The viewer saw "some
// numbers" filled in; the narration never reads them.
const ESTIMATED = [
  { role: "Viola", design: "Doublet", performer: MAYA, source: "make", maker: PRIYA, fabric: { ...DOUBLET_FABRIC, yardage: 2.5 } },
  { role: "Viola", design: "Breeches", performer: MAYA, source: "make", maker: SAM, fabric: { name: "Wool suiting", color: "Charcoal", widthIn: 60, yardage: 1.8, unitCost: 18, supplier: "Mill End Textiles" } },
  BOOTS_PURCHASED,
  ...ENSEMBLE_SPLIT,
  { role: "Olivia", design: "Gown", performer: MAYA, source: "make", fabric: { name: "Silk taffeta", color: "Ivory", widthIn: 54, yardage: 6.5, unitCost: 24, supplier: "Fabric Row" } },
  { role: "Sebastian", design: "Doublet", performer: JORDAN, source: "make", fabric: { name: "Wool suiting", color: "Deep green", widthIn: 60, yardage: 2.8, unitCost: 18, supplier: "Mill End Textiles" } },
  { role: TWELFTH_ENSEMBLE, design: "Skirt", performer: ROSA, source: "make", fabric: { name: "Cotton broadcloth", color: "Burgundy", widthIn: Number(SKIRT_WIDTH), yardage: Number(ROSA_SKIRT_YARDS), unitCost: 9, supplier: "Fabric Row" }, skirt: ROSA_SKIRT },
  { role: TWELFTH_ENSEMBLE, design: "Tunic", performer: THEO, source: "make", fabric: { name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.2, unitCost: 12, supplier: "Fabric Row" } },
  { role: TWELFTH_ENSEMBLE, design: "Tunic", performer: JORDAN, source: "make", fabric: { name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.4, unitCost: 12, supplier: "Fabric Row" } },
];
const STATE_COSTS = withCostumes(ALL_DESIGNS, ESTIMATED);
// What "made-to-inventory" does on camera: Viola's Doublet ticked Made and
// logged to House Inventory with Location "Rack B".
const INVENTORY_LOCATION = "Rack B";
const STATE_WRAP = withCostumes(ALL_DESIGNS, ESTIMATED.map((p) => (
  p.role === "Viola" && p.design === "Doublet" ? { ...p, made: true } : p
)));

// Set by each prep so each section's opening goto is the real URL (the ids
// change on every reset), and so the estimate guard and the wrap-up prep can
// name pieces by id.
let twelfthPath = "/productions";
let summaryPath = "/productions";
let productionApi = "/api/productions";
let lastIds = { designIds: new Map(), castingIds: new Map() };
// resetTwelfthNight keys designs and castings by role plus name, joined the
// same way (demo-productions.mjs scopedKey).
const key = (role, name) => `${role}\u0000${name}`;
const remember = ({ production, designIds, castingIds }) => {
  twelfthPath = `/productions/${production.id}`;
  summaryPath = `${twelfthPath}/summary`;
  productionApi = `/api/productions/${production.id}`;
  lastIds = { designIds, castingIds };
};

/** Every prep: org-wide cleanup by exact name, then the production. */
async function prepWith(api, state) {
  const makerIds = await resetDemoCostumeOrg(api);
  const made = await resetTwelfthNight(api, state, { makerIds });
  remember(made);
  return made;
}

async function openTwelfthDirect(page, h) {
  await h.gotoAuthed(page, twelfthPath);
  await page.getByRole("heading", { level: 1, name: new RegExp(TWELFTH) }).waitFor({ state: "visible", timeout: 10000 });
  await h.hold(page, 900); // settle before the first beat (lessons F6)
}

async function openSummaryDirect(page, h) {
  await h.gotoAuthed(page, summaryPath);
  await page.getByRole("heading", { level: 1, name: "Costume Creations" }).waitFor({ state: "visible", timeout: 10000 });
  await h.hold(page, 900);
}

/** Open a role card and its Costume tab on camera, pointing at each. */
async function openCostumeTab(page, h, role, s, mark = true) {
  const card = roleCard(page, role);
  const row = roleRow(page, role);
  await h.point(page, row, { s, mark });
  await h.hold(page, 600);
  await row.click();
  const tab = card.getByRole("button", { name: "Costume", exact: true });
  if (!(await tab.isVisible({ timeout: 2500 }).catch(() => false))) {
    await h.hold(page, 400);
    await row.click(); // lessons B5: retry once after the re-render
  }
  await tab.waitFor({ state: "visible", timeout: 4000 });
  await h.point(page, tab, { s, mark: false });
  await h.hold(page, 600);
  await tab.click();
  await card.getByText("Pieces", { exact: true }).waitFor({ state: "visible", timeout: 4000 });
  await h.hold(page, 600);
  return card;
}

// Role card, Costume tab: the performer's bordered block, one piece's source
// row in it, the piece editor's expand button for a design.
const performerBlock = (page, card, name) =>
  card.locator("div.surface").filter({ has: page.getByRole("button", { name: new RegExp(`^[▸▾]\\s*${escapeRe(name)}`) }) }).first();
const sourceRow = (page, block, design) =>
  block.locator("div.flex.flex-col").filter({ has: page.locator("span.truncate", { hasText: new RegExp(`^${escapeRe(design)}$`) }) }).first();
const sourceSelect = (row) => row.getByRole("combobox").first();
const pieceToggle = (card, design) =>
  card.getByRole("button", { name: new RegExp(`^[▸▾]\\s*${escapeRe(design)}$`) }).first();
// The MakeAssignment wrapper (dot + Maker select): zooming it keeps the
// parked cursor on the select, clear of the dot beside it (lessons A4).
const makerSelect = (row) => row.getByLabel("Maker", { exact: true });
const makerWrap = (row) => makerSelect(row).locator("xpath=..");
const makerDot = (row) => makerWrap(row).locator("span.rounded-full");

// Costume Creations: one performer's piece row (MakePieceRow's <li>) under a
// role's section and a garment's label.
const summaryRow = (page, role, garment, performer) =>
  page.locator("main section")
    .filter({ has: page.getByRole("heading", { level: 3, name: role, exact: true }) })
    .locator("div.space-y-1")
    .filter({ has: page.locator("p.lbl", { hasText: new RegExp(`^${escapeRe(garment)}$`) }) })
    .locator("li")
    .filter({ has: page.getByRole("button", { name: new RegExp(`^${escapeRe(performer)}\\b`) }) })
    .first();
const rowToggle = (page, row, performer) => row.getByRole("button", { name: new RegExp(`^${escapeRe(performer)}\\b`) }).first();
// MakePieceRow's Field wraps label text, input, and hint in one <label>, so
// the input's accessible name starts with the label; anchor on the start.
const fabricField = (scope, label) => scope.getByRole("textbox", { name: new RegExp(`^${escapeRe(label)}\\b`) }).first();
const fabricSelect = (scope, label) => scope.getByRole("combobox", { name: new RegExp(`^${escapeRe(label)}\\b`) }).first();
const fieldBox = (input) => input.locator("xpath=ancestor::label[1]");
const tabButton = (page, re) => page.locator("main").getByRole("button", { name: re }).first();

async function typeInto(page, h, input, text, s, mark = true, delay = 80) {
  await h.point(page, input, { s, mark });
  await h.hold(page, 350);
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(text, { delay });
}

/** Expand a piece row on the Costume Creations page, retrying once (B5). */
async function expandRow(page, h, row, performer, s, mark = true) {
  const toggle = rowToggle(page, row, performer);
  await h.point(page, toggle, { s, mark });
  await h.hold(page, 500);
  await toggle.click();
  const fabric = fabricField(row, "Fabric");
  if (!(await fabric.isVisible({ timeout: 2500 }).catch(() => false))) {
    await h.hold(page, 400);
    await toggle.click();
  }
  await fabric.waitFor({ state: "visible", timeout: 4000 });
  await h.hold(page, 500);
}

/** A native <select> popup never films (lessons A1), so a choice is shown by
 * setting the value and holding. Waits until the select is enabled again
 * (the role card disables every select while a save is in flight). */
async function chooseOption(page, h, select, label, holdMs) {
  await page.waitForFunction((el) => !el.disabled, await select.elementHandle(), { timeout: 8000 });
  await select.selectOption({ label });
  await h.hold(page, holdMs);
}

/** Thrown before any beat films a maker-seat refusal. */
async function assertNoSeatLimit(page, where) {
  const limit = page.locator("main").getByText(/maker limit|needs_seat/i);
  if (await limit.first().isVisible().catch(() => false)) throw new Error(`${where}: a maker-limit notice is on screen; retake`);
}

/** The pieces the live estimate must fill: every Make piece without a skirt
 * type and without a yardage typed on camera (only Rosa's skirt, whose
 * yardage the calculator filled). Keyed by role, design, performer. */
const ESTIMATE_TARGETS = Object.freeze([
  ["Viola", "Doublet", MAYA], ["Viola", "Breeches", MAYA], ["Olivia", "Gown", MAYA],
  ["Sebastian", "Doublet", JORDAN], [TWELFTH_ENSEMBLE, "Tunic", THEO], [TWELFTH_ENSEMBLE, "Tunic", JORDAN],
]);

async function readPieces(page) {
  return page.evaluate(async (path) => {
    const r = await fetch(path, { credentials: "include" });
    if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`);
    return (await r.json()).pieces;
  }, `${productionApi}/pieces`);
}

export const WALKTHROUGH = {
  slug: "costume-creations",
  title: "Costume Creations",
  guideAnchor: "creations",
  sections: [
    {
      id: "intro",
      heading: "Costume Creations",
      targetSeconds: 22,
      prep: async (api) => prepWith(api, withCostumes([], [])),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900);
        // s:0: "In the last video, we measured the cast of Twelfth Night."
        const card = page.locator("main").getByRole("link", { name: new RegExp(TWELFTH) }).first();
        await h.point(page, card, { s: 0 });
        await h.hold(page, 1600);
        // s:1: "Now we will plan the costumes themselves, piece by piece."
        await h.openRecord(page, TWELFTH, twelfthPath, { headingRe: new RegExp(TWELFTH), s: 1 });
        // s:2 names every step of the video; re-park across the roles (B12).
        await h.zoom(page, roleRow(page, "Viola"), { s: 2, holdMs: 2600 });
        await h.point(page, roleRow(page, "Olivia"), { s: 2, mark: false });
        await h.hold(page, 1500);
        await h.point(page, roleRow(page, "Sebastian"), { s: 2, mark: false });
        await h.hold(page, 1500);
        await h.zoom(page, roleRow(page, TWELFTH_ENSEMBLE), { s: 2, holdMs: 2400 });
        // s:3: "By the end, every costume in the show will have a plan behind it."
        await h.point(page, roleRow(page, "Viola"), { s: 3 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "add-pieces",
      heading: "Add costume pieces",
      targetSeconds: 26,
      prep: async (api) => prepWith(api, withCostumes([], [])),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Costumes are planned role by role, right alongside casting and measurements."
        await h.zoom(page, roleRow(page, "Viola"), { s: 0, holdMs: 2400 });
        await h.hold(page, 500);
        // s:1: "Open a role and go to its Costume tab..."
        const card = await openCostumeTab(page, h, "Viola", 1);
        // s:2: "Type the name of each piece this role wears, like a doublet, breeches, and boots."
        const addLink = card.getByRole("button", { name: "+ add piece" });
        const input = card.getByPlaceholder("Piece name");
        let first = true;
        for (const name of ["Doublet", "Breeches", "Boots"]) {
          await h.point(page, addLink, { s: 2, mark: first });
          first = false;
          await h.hold(page, 400);
          await addLink.click();
          if (!(await input.isVisible({ timeout: 2000 }).catch(() => false))) {
            await h.hold(page, 400);
            await addLink.click(); // lessons B5
          }
          await input.waitFor({ state: "visible", timeout: 4000 });
          await input.pressSequentially(name, { delay: 90 });
          await h.hold(page, 300);
          const add = card.getByRole("button", { name: "Add", exact: true });
          await h.point(page, add, { s: 2, mark: false });
          await add.click();
          await pieceToggle(card, name).waitFor({ state: "visible", timeout: 6000 });
          await h.hold(page, 500);
        }
        // s:3: "More descriptive names help later, when the app estimates fabric for you."
        const hint = card.getByText("More descriptive piece names estimate fabric better", { exact: true });
        await h.zoom(page, hint.locator("xpath=.."), { s: 3, holdMs: 2600 });
        // s:4: "You can rename or remove any piece afterward, right from the same list."
        await h.point(page, card.getByRole("button", { name: "Rename Doublet" }), { s: 4 });
        await h.hold(page, 1500);
        await h.point(page, card.getByRole("button", { name: "Remove Doublet" }), { s: 4, mark: false });
        await h.hold(page, 1500);
      },
    },
    {
      id: "photos-notes",
      heading: "Photos and notes",
      targetSeconds: 24,
      prep: async (api) => prepWith(api, STATE_PHOTOS),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Each piece can carry up to six reference photos..."
        const card = await openCostumeTab(page, h, "Viola", 0);
        const toggle = pieceToggle(card, "Doublet");
        await h.point(page, toggle, { s: 0, mark: false });
        await h.hold(page, 400);
        await toggle.click();
        const addPhoto = card.getByRole("button", { name: "Add photo from library" }).first();
        if (!(await addPhoto.isVisible({ timeout: 2500 }).catch(() => false))) {
          await h.hold(page, 400);
          await toggle.click(); // lessons B5
        }
        await addPhoto.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        // s:1: "Attach one from your library..." The file chooser event hands
        // the sketch over without painting any OS dialog.
        await h.point(page, addPhoto, { s: 1 });
        await h.hold(page, 600);
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), addPhoto.click()]);
        await chooser.setFiles(SKETCH);
        const thumb = card.getByRole("img", { name: "Reference 1" });
        await thumb.waitFor({ state: "visible", timeout: 20000 });
        await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumb.elementHandle(), { timeout: 15000 });
        await h.hold(page, 400);
        // The strip's full-width row: its centre is empty space to the right
        // of the tiles, so the cursor never covers the sketch (lessons A4).
        await h.zoom(page, thumb.locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), { s: 1, holdMs: 2600 });
        // s:2: "Every piece also gets a notes box..."
        const notes = card.getByRole("textbox", { name: "Notes for Doublet" });
        await typeInto(page, h, notes, DOUBLET_NOTES, 2, true, 55);
        await h.hold(page, 400);
        // s:3: "Notes save the moment you click away..."
        // The click on the Pieces label only blurs the textarea; the zoom
        // carries the beat so it is the only s:3 marker (a second marker
        // 0.04 s earlier made the builder drop the zoom).
        await h.point(page, card.getByText("Pieces", { exact: true }), { s: 3, mark: false });
        await card.getByText("Pieces", { exact: true }).click();
        const saved = card.getByText("Saved ✓");
        await saved.waitFor({ state: "visible", timeout: 6000 });
        await h.zoom(page, saved.locator("xpath=ancestor::div[contains(@class,'space-y-1.5')][1]"), { s: 3, holdMs: 2200 });
        // Re-park across the photo and the saved note so the tail of the
        // sentence is not a still frame (lessons B12).
        await h.point(page, thumb, { s: 3, mark: false });
        await h.hold(page, 1400);
        await h.point(page, notes, { s: 3, mark: false });
        await h.hold(page, 1400);

      },
    },
    {
      id: "make-or-buy",
      heading: "Make it or buy it",
      targetSeconds: 24,
      prep: async (api) => prepWith(api, STATE_MAKE_OR_BUY),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "For every performer, choose where each piece comes from."
        const card = await openCostumeTab(page, h, "Viola", 0);
        const block = performerBlock(page, card, MAYA);
        await h.point(page, card.getByText("Assign the source for each piece for each performer.", { exact: true }), { s: 0, mark: false });
        await h.hold(page, 800);
        // s:1: "Make is the default choice, for anything your team will sew."
        const boots = sourceRow(page, block, "Boots");
        await h.zoom(page, boots, { s: 1, holdMs: 2400 });
        // s:2: "Choose Purchase instead... and enter what it costs..."
        const bootsSource = sourceSelect(boots);
        await h.point(page, bootsSource, { s: 2 });
        await h.hold(page, 500);
        await chooseOption(page, h, bootsSource, "Purchase", 700);
        const price = boots.getByRole("textbox", { name: "Purchase price" });
        await price.waitFor({ state: "visible", timeout: 6000 });
        await page.waitForFunction((el) => !el.disabled, await price.elementHandle(), { timeout: 8000 });
        await typeInto(page, h, price, "45", 2, false, 150);
        await page.keyboard.press("Tab");
        await page.waitForFunction((el) => el.value === "45.00", await price.elementHandle(), { timeout: 6000 });
        await h.hold(page, 500);
        await h.zoom(page, boots, { s: 2, holdMs: 2400 });
        // s:3: "Two more choices skip building it fresh: On hand... and Shared..."
        // Cycle the Breeches source through both and back to Make.
        const breeches = sourceRow(page, block, "Breeches");
        const breechesSource = sourceSelect(breeches);
        await h.point(page, breechesSource, { s: 3 });
        await h.hold(page, 400);
        await chooseOption(page, h, breechesSource, "On hand", 1800);
        await chooseOption(page, h, breechesSource, "Shared", 300);
        await breeches.getByRole("combobox").nth(1).waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, breeches.getByRole("combobox").nth(1), { s: 3, mark: false });
        await h.hold(page, 1800);
        await chooseOption(page, h, breechesSource, "Make", 1200);
        await h.point(page, breechesSource, { s: 3, mark: false });
        await h.hold(page, 600);
      },
    },
    {
      id: "makers",
      heading: "Assign makers",
      targetSeconds: 26,
      prep: async (api) => prepWith(api, STATE_MAKERS),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Pieces you are making can be handed to a maker."
        const card = await openCostumeTab(page, h, "Viola", 0);
        const block = performerBlock(page, card, MAYA);
        const doublet = sourceRow(page, block, "Doublet");
        const breeches = sourceRow(page, block, "Breeches");
        await h.point(page, makerSelect(doublet), { s: 0, mark: false });
        await h.hold(page, 600);
        // s:1: "Each maker gets their own color..."
        await chooseOption(page, h, makerSelect(doublet), PRIYA, 300);
        await makerDot(doublet).waitFor({ state: "visible", timeout: 6000 });
        await page.waitForFunction((el) => !el.disabled, await makerSelect(doublet).elementHandle(), { timeout: 8000 });
        await assertNoSeatLimit(page, "makers");
        await h.hold(page, 400);
        await h.zoom(page, makerWrap(doublet), { s: 1, holdMs: 2200 });
        await h.point(page, makerSelect(breeches), { s: 1, mark: false });
        await h.hold(page, 400);
        await chooseOption(page, h, makerSelect(breeches), SAM, 300);
        await makerDot(breeches).waitFor({ state: "visible", timeout: 6000 });
        await page.waitForFunction((el) => !el.disabled, await makerSelect(breeches).elementHandle(), { timeout: 8000 });
        await assertNoSeatLimit(page, "makers");
        await h.hold(page, 400);
        await h.zoom(page, makerWrap(breeches), { s: 1, holdMs: 2200 });
        // s:2: "Makers and their colors are set up once for your whole
        // organization, on its Makers page..." Ruling: reached by URL, never
        // through the Clerk organization popover.
        await h.gotoAuthed(page, "/makers");
        await page.getByRole("heading", { level: 1, name: "Makers" }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 600);
        const makerRow = (name) => page.locator("main li").filter({ has: page.getByRole("textbox", { name: "Maker name" }).and(page.locator(`[value="${name}"]`)) }).first();
        await h.point(page, page.getByRole("heading", { level: 1, name: "Makers" }), { s: 2 });
        await h.hold(page, 1500);
        await h.zoom(page, page.locator("main ul").first(), { s: 2, holdMs: 2600 });
        // s:3: "That color then follows each maker everywhere they are assigned..."
        const swatches = (name) => makerRow(name).getByRole("button", { pressed: true }).first().locator("xpath=..");
        await h.zoom(page, swatches(PRIYA), { s: 3, holdMs: 2200 });
        await h.zoom(page, swatches(SAM), { s: 3, holdMs: 2200 });
      },
    },
    {
      id: "creations-page",
      heading: "The Costume Creations page",
      targetSeconds: 24,
      prep: async (api) => prepWith(api, STATE_CREATIONS),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Everything you are making... comes together on one Costume Creations page."
        const link = page.locator(`main a[href$="/summary"]`).first();
        await h.point(page, link, { s: 0 });
        await h.hold(page, 900);
        await link.click();
        await page.getByRole("heading", { level: 1, name: "Costume Creations" }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 1000);
        // s:1: "Its To make tab lists each piece for each performer... the tab's own count..."
        const makeTab = tabButton(page, /^To make \(0\/7\)$/);
        await makeTab.waitFor({ state: "visible", timeout: 4000 });
        await h.zoom(page, makeTab.locator("xpath=.."), { s: 1, holdMs: 2600 });
        await h.point(page, summaryRow(page, TWELFTH_ENSEMBLE, "Tunic", THEO), { s: 1, mark: false });
        await h.hold(page, 1400);
        await h.point(page, summaryRow(page, "Viola", "Doublet", MAYA), { s: 1, mark: false });
        await h.hold(page, 800);
        // s:2: "Open a piece there to fill in its fabric: the type, the color,
        // the width, and where you plan to buy it."
        const row = summaryRow(page, "Viola", "Doublet", MAYA);
        await expandRow(page, h, row, MAYA, 2);
        await typeInto(page, h, fabricField(row, "Fabric"), DOUBLET_FABRIC.name, 2, false, 60);
        await typeInto(page, h, fabricField(row, "Color"), DOUBLET_FABRIC.color, 2, false, 60);
        await typeInto(page, h, fabricField(row, "Width"), String(DOUBLET_FABRIC.widthIn), 2, false, 90);
        await typeInto(page, h, fabricField(row, "$/yd"), String(DOUBLET_FABRIC.unitCost), 2, false, 90);
        await typeInto(page, h, fabricField(row, "Supplier"), DOUBLET_FABRIC.supplier, 2, false, 60);
        await page.keyboard.press("Tab");
        await row.getByText("Saving…").waitFor({ state: "hidden", timeout: 8000 });
        await h.hold(page, 500);
        await h.zoom(page, row, { s: 2, holdMs: 2200 });
      },
    },
    {
      id: "skirt-yardage",
      heading: "Skirt yardage",
      targetSeconds: 26,
      prep: async (api) => prepWith(api, STATE_SKIRT),
      run: async (page, h) => {
        await openSummaryDirect(page, h);
        // s:0: "Skirts get their own calculator."
        const row = summaryRow(page, TWELFTH_ENSEMBLE, "Skirt", ROSA);
        await expandRow(page, h, row, ROSA, 0);
        // s:1: "Choose the skirt type, full circle, three-quarter circle, half
        // circle, or gathered, and the app works out the yardage... from the
        // performer's waist, the skirt length, and the fabric width."
        const type = fabricSelect(row, "Skirt type");
        await h.point(page, type, { s: 1 });
        await h.hold(page, 300);
        for (const label of ["Full circle", "Three-quarter circle", "Half circle", "Gathered"]) {
          await chooseOption(page, h, type, label, 800);
        }
        await chooseOption(page, h, type, "Full circle", 600);
        const needsWidth = row.getByText("Add fabric width to calculate yardage.");
        await needsWidth.waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, needsWidth, { s: 1, mark: false });
        await h.hold(page, 900);
        const width = fabricField(row, "Width");
        await typeInto(page, h, width, SKIRT_WIDTH, 1, false, 150);
        await page.keyboard.press("Tab");
        const yardage = fabricField(row, "Yardage");
        await page.waitForFunction((el) => el.value.trim() !== "", await yardage.elementHandle(), { timeout: 6000 });
        await h.hold(page, 500);
        await h.zoom(page, fieldBox(yardage), { s: 1, holdMs: 2400 });
        // s:2: "The length starts from the performer's own outseam..."
        const length = fabricField(row, "Length");
        const lengthHint = row.getByText(/^Defaults to the outseam \(\d+(?:\.\d+)?"\)\. Type over it for a shorter\/longer piece\.$/);
        if (!(await lengthHint.isVisible())) throw new Error("skirt-yardage: the Length hint does not name an outseam; the narration would not match");
        await h.zoom(page, fieldBox(length), { s: 2, holdMs: 2400 });
        await typeInto(page, h, length, SKIRT_LENGTH, 2, false, 150);
        await page.keyboard.press("Tab");
        await page.waitForFunction(({ el, want }) => el.value === want, { el: await yardage.elementHandle(), want: ROSA_SKIRT_YARDS }, { timeout: 6000 });
        await row.getByText("Saving…").waitFor({ state: "hidden", timeout: 8000 });
        await h.hold(page, 700);
        // s:3: "A number you type yourself is never quietly overwritten by the calculator."
        await h.zoom(page, fieldBox(yardage), { s: 3, holdMs: 2400 });
        await h.hold(page, 600);
      },
    },
    {
      id: "estimate-fabric",
      heading: "Estimate fabric automatically",
      targetSeconds: 26,
      prep: async (api) => prepWith(api, STATE_ESTIMATE),
      run: async (page, h) => {
        await openSummaryDirect(page, h);
        // s:0: "For everything else, choose Estimate fabric..."
        const shopping = tabButton(page, /^Shopping$/);
        await h.point(page, shopping, { s: 0 });
        await h.hold(page, 500);
        await shopping.click();
        const button = page.locator("main").getByRole("button", { name: "✨ Estimate fabric" });
        if (!(await button.isVisible({ timeout: 2500 }).catch(() => false))) {
          await h.hold(page, 400);
          await shopping.click(); // lessons B5
        }
        await button.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        await h.point(page, button, { s: 0, mark: false });
        await h.hold(page, 700);
        await button.click();
        const busy = page.locator("main").getByRole("button", { name: "Estimating…" });
        await busy.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
        const failed = page.locator("main").getByText(/Couldn't estimate fabric|not configured/);
        const idle = page.locator("main").getByRole("button", { name: "✨ Estimate fabric" });
        // The live call takes several seconds: drift the cursor across the
        // table meanwhile so the stretch the builder cannot drop is not a
        // freeze. Bounded; the .or() wait below owns the timeout.
        const table = page.locator("main table").first();
        const drift = [table, busy, table.locator("tbody tr").first()];
        for (let i = 0; i < 12; i++) {
          if (!(await busy.isVisible())) break;
          await h.point(page, drift[i % drift.length], { s: 0, mark: false, timeoutMs: 1500 });
          await h.hold(page, 700);
        }
        // One wait on either outcome (no Promise.race).
        await idle.or(failed).first().waitFor({ state: "visible", timeout: 90000 });
        if (await failed.first().isVisible()) {
          throw new Error("estimate-fabric: the estimate failed on camera; check ANTHROPIC_API_KEY in the server env and retake");
        }
        // Guard: every targeted piece now has a yardage, and nothing typed
        // on camera was overwritten.
        const pieces = await readPieces(page);
        const empty = [];
        for (const [role, design, performer] of ESTIMATE_TARGETS) {
          const designId = lastIds.designIds.get(key(role, design));
          const castingId = lastIds.castingIds.get(key(role, performer));
          const p = pieces.find((x) => x.costume_design_id === designId && x.casting_id === castingId);
          if (!p || p.fabric_yardage == null || !(p.fabric_yardage > 0)) empty.push(`${role} ${design} (${performer})`);
        }
        if (empty.length > 0) throw new Error(`estimate-fabric: no yardage for ${empty.join(", ")}; retake`);
        const skirt = pieces.find((x) => x.costume_design_id === lastIds.designIds.get(key(TWELFTH_ENSEMBLE, "Skirt")) && x.casting_id === lastIds.castingIds.get(key(TWELFTH_ENSEMBLE, ROSA)));
        if (!skirt || String(skirt.fabric_yardage) !== ROSA_SKIRT_YARDS) throw new Error("estimate-fabric: Rosa's skirt yardage changed; retake");
        console.log(`  estimate-fabric: ${ESTIMATE_TARGETS.length} piece(s) estimated, guard passed`);
        await h.hold(page, 500);
        // s:1: "It only fills in the blanks... every estimate stays fully editable afterward."
        const wool = table.locator("tbody tr").filter({ hasText: DOUBLET_FABRIC.name }).first();
        await h.zoom(page, wool, { s: 1, holdMs: 2400 });
        const makeTab = tabButton(page, /^To make \(/);
        await h.point(page, makeTab, { s: 1, mark: false });
        await h.hold(page, 400);
        await makeTab.click();
        const row = summaryRow(page, "Sebastian", "Doublet", JORDAN);
        await row.waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 500);
        await expandRow(page, h, row, JORDAN, 1, false);
        const yardage = fabricField(row, "Yardage");
        if ((await yardage.inputValue()).trim() === "") throw new Error("estimate-fabric: Sebastian's Doublet shows an empty Yardage; retake");
        await h.zoom(page, fieldBox(yardage), { s: 1, holdMs: 2400 });
        // s:2: "More descriptive piece names and recorded measurements make the estimate noticeably better."
        const measurements = row.getByRole("link", { name: /^Measurements/ }).locator("xpath=..");
        await h.zoom(page, measurements, { s: 2, holdMs: 2600 });
        await h.hold(page, 600);
      },
    },
    {
      id: "costs",
      heading: "What it all costs",
      targetSeconds: 24,
      prep: async (api) => prepWith(api, STATE_COSTS),
      run: async (page, h) => {
        await openSummaryDirect(page, h);
        // s:0: "The Shopping tab adds it all up for the whole show..."
        const shopping = tabButton(page, /^Shopping$/);
        await h.point(page, shopping, { s: 0 });
        await h.hold(page, 500);
        await shopping.click();
        const table = page.locator("main table").first();
        if (!(await table.isVisible({ timeout: 2500 }).catch(() => false))) {
          await h.hold(page, 400);
          await shopping.click(); // lessons B5
        }
        await table.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        await h.zoom(page, table, { s: 0, holdMs: 2600 });
        const subtotal = page.locator("main tr").filter({ hasText: "Purchased subtotal" }).first();
        await h.zoom(page, subtotal.locator("xpath=ancestor::table[1]"), { s: 0, holdMs: 2400 });
        // s:1: "Suppliers with a website on file even become links..."
        await h.point(page, table.getByRole("cell", { name: "Mill End Textiles" }).first(), { s: 1 });
        await h.hold(page, 1400);
        await h.point(page, table.getByRole("cell", { name: "Fabric Row" }).first(), { s: 1, mark: false });
        await h.hold(page, 1200);
        // s:2: "Together it all rolls up into one total..." Zoom the literal
        // "Total (fabric + purchased)" row (ruling 2).
        const total = page.locator("main div").filter({ hasText: /^Total \(fabric \+ purchased\)\$[\d,]+\.\d{2}$/ }).last();
        await h.zoom(page, total, { s: 2, holdMs: 3200 });
        // Park on the label, never on the figure it names.
        await h.point(page, total.getByText("Total (fabric + purchased)", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 1800);
      },
    },
    {
      id: "made-to-inventory",
      heading: "Log finished pieces",
      targetSeconds: 22,
      prep: async (api) => prepWith(api, STATE_COSTS),
      run: async (page, h) => {
        await openSummaryDirect(page, h);
        // s:0: "When a piece is finished... tick it as Made right there on the To make tab."
        const row = summaryRow(page, "Viola", "Doublet", MAYA);
        const made = row.getByRole("checkbox", { name: "Made" });
        await h.point(page, made, { s: 0 });
        await h.hold(page, 900);
        await made.check();
        const ask = row.getByText(`Add Doublet (${MAYA}) to House Inventory?`);
        if (!(await ask.isVisible({ timeout: 3000 }).catch(() => false))) {
          throw new Error("made-to-inventory: the House Inventory prompt did not appear after ticking Made");
        }
        await row.getByText("Saving…").waitFor({ state: "hidden", timeout: 8000 });
        await h.hold(page, 600);
        // s:1: "The app then offers to add it to House Inventory..."
        await h.zoom(page, row, { s: 1, holdMs: 2800 });
        const add = row.getByRole("button", { name: "Add", exact: true });
        await h.point(page, add, { s: 1, mark: false });
        await h.hold(page, 700);
        await add.click();
        const location = row.getByRole("textbox", { name: "Location" });
        await location.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        // s:2: "Add it once, and a future production can pull the same piece back out..."
        await typeInto(page, h, location, INVENTORY_LOCATION, 2, true, 110);
        await h.hold(page, 400);
        const confirm = row.getByRole("button", { name: "Add to House Inventory" });
        await h.point(page, confirm, { s: 2, mark: false });
        await h.hold(page, 600);
        await confirm.click();
        await location.waitFor({ state: "hidden", timeout: 10000 });
        await h.hold(page, 600);
        await h.zoom(page, row, { s: 2, holdMs: 2200 });
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 24,
      prep: async (api) => {
        const { production, designIds, castingIds } = await prepWith(api, STATE_WRAP);
        await api.post(`/api/productions/${production.id}/pieces/to-inventory`, {
          designId: designIds.get(key("Viola", "Doublet")),
          castingId: castingIds.get(key("Viola", MAYA)),
          location: INVENTORY_LOCATION,
        });
      },
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0 recaps the whole video: the Viola card's pieces, sources, and
        // makers, then the Costume Creations page and its total. Each stop
        // is a zoom, since a moving cursor alone reads as a freeze.
        const card = await openCostumeTab(page, h, "Viola", 0);
        await h.zoom(page, pieceToggle(card, "Doublet").locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]"), { s: 0, holdMs: 2200 });
        await h.zoom(page, performerBlock(page, card, MAYA), { s: 0, holdMs: 2400 });
        const link = page.locator(`main a[href$="/summary"]`).first();
        await h.point(page, link, { s: 0, mark: false });
        await h.hold(page, 600);
        await link.click();
        await page.getByRole("heading", { level: 1, name: "Costume Creations" }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 800);
        const shopping = tabButton(page, /^Shopping$/);
        await h.point(page, shopping, { s: 0, mark: false });
        await h.hold(page, 400);
        await shopping.click();
        const total = page.locator("main div").filter({ hasText: /^Total \(fabric \+ purchased\)\$[\d,]+\.\d{2}$/ }).last();
        await total.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 500);
        await h.zoom(page, total, { s: 0, holdMs: 2200 });
        // s:1: "In the next video, we will look at House Inventory..."
        await h.navigateSlowly(page, "Inventory", "/inventory", { s: 1 });
        const tile = page.locator("main").getByText("Doublet", { exact: true }).first();
        await tile.waitFor({ state: "visible", timeout: 6000 });
        await h.zoom(page, page.locator("main"), { s: 1, holdMs: 2400 });
        // s:2: "Thanks so much for watching..."
        await h.point(page, tile, { s: 2 });
        await h.hold(page, 2000);
      },
    },
  ],
};
