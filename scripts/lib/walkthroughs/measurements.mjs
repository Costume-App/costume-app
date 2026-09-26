// Training video 3: "Measurements". Script: docs/training-videos/scripts/measurements.md.
//
// DB state: only the demo org's "Twelfth Night" is touched. Every prep
// rebuilds it (lib/demo-productions.mjs resetTwelfthNight) from video 2's
// end state (TWELFTH_CAST_STATE) plus exactly the measurements the viewer saw
// typed or imported in the earlier sections, so any section retakes alone.
// "import-forms" films a live AI read of the synthetic Rosa Diaz form; the
// walkthrough throws unless the read preselects Rosa Diaz with no unreadable
// rows, so a bad read is never filmed. "wrap-up" starts from ROSA_FORM's own
// values instead, so its retake never depends on the model's answer.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TWELFTH, TWELFTH_ENSEMBLE, TWELFTH_CAST_STATE, TWELFTH_MEASURED_STATE,
  MAYA_AFTER_HANDWRITING, JORDAN_ALL, ROSA_IMPORTED, resetTwelfthNight,
} from "../demo-productions.mjs";
import { ROSA_FORM } from "../demo-measurement-form.mjs";
import { escapeRe, roleRow, roleCard } from "../role-rows.mjs";

const FORM_IMAGE = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../fixtures/training/measurement-form-rosa-diaz.jpg",
);

// What "enter-measurements" types on camera for Maya Brooks: Height 5 ft 6 in
// (saved as 66 inches), Chest / bust 34, Shirt size M. "handwriting" then adds
// Waist "26 1/2" (saved as 26.5): demo-productions.mjs's MAYA_AFTER_HANDWRITING.
const MAYA_ENTERED = Object.freeze({ height: 66, chest: 34, shirt_size: "M" });
const ROSA_FIELD_COUNT = Object.keys(ROSA_IMPORTED).length; // 12
// The review table's row label for each imported key (measurement_definitions
// labels as the review renders them), so the guard can check every value on
// its own row rather than as an unordered set.
const REVIEW_LABELS = Object.freeze({
  height: "Height", chest: "Chest / bust", waist: "Waist", hips: "Hips",
  shoulder: "Shoulder width", inseam: "Inseam", neck: "Neck", head: "Head circumference",
  nape_to_floor: "Nape to floor", shirt_size: "Shirt size", pant_size: "Pant size", shoe_size: "Shoe size",
});
for (const key of Object.keys(ROSA_IMPORTED)) {
  if (!Object.hasOwn(REVIEW_LABELS, key)) throw new Error(`measurements walkthrough: no review label for "${key}"`);
}
/** What the review's "On form" cell shows for a value: height as feet and
 * inches (formatHeight in src/lib/height.ts), everything else as-is. */
function reviewDisplay(key, value) {
  if (key === "height" && typeof value === "number") return `${Math.floor(value / 12)}'${value % 12}"`;
  return String(value);
}

const withMeasurements = (measurements) => ({ ...TWELFTH_CAST_STATE, measurements });
const STATE_ENTERED = withMeasurements({ "Maya Brooks": MAYA_ENTERED });
const STATE_SWITCHER = withMeasurements({ "Maya Brooks": MAYA_AFTER_HANDWRITING, "Jordan Lee": JORDAN_ALL });
// "wrap-up"'s own end state is video 3's whole TWELFTH_MEASURED_STATE.

// Set by each prep so openRecord's fallback goto and each section's opening
// goto are the real URLs (the ids change on every reset).
let twelfthPath = "/productions";
let mayaPath = "/productions";
const remember = ({ production, performerIds }) => {
  twelfthPath = `/productions/${production.id}`;
  const maya = performerIds.get("Maya Brooks");
  if (maya) mayaPath = `${twelfthPath}/performers/${maya}`;
};

// MeasurementForm renders each numeric field as <label> text + <input>, so the
// input's accessible name is the whole label text ("Waist (in) Around the
// natural waistline"); anchor on the start. Height has its own two inputs.
const field = (page, label) => page.locator("main").getByRole("textbox", { name: new RegExp(`^${escapeRe(label)}\\b`) });
// The relative wrapper around a field's input, which also holds its status
// dot. Zooming this (not the 8px dot) keeps the cursor, parked on the
// input's centre, clear of the dot it is showing (lessons A4).
const fieldBox = (page, label) => field(page, label).locator("xpath=..");
const heightBox = (page) => page.getByLabel("Height (feet)").locator("xpath=..");
const counter = (page) => page.locator("main").getByText(/^\d+ of 20 measured$/);
// Zoom targets whose centre is empty space, so the parked cursor never
// covers the number, dot, or note the zoom exists to show (lessons A4): a
// field's whole row, the "Measurements / N of 20" header, a text's own
// full-width parent.
const fieldRow = (page, label) => field(page, label).locator("xpath=ancestor::label[1]");
const counterHeader = (page) => counter(page).locator("xpath=..");
// The legend cell left of the toolbar buttons: empty at its centre, and a
// zoom there still frames "Import measurement forms" beside it.
const importToolbar = (page) =>
  page.locator("main").getByRole("button", { name: "Import measurement forms" }).locator("xpath=ancestor::li[1]/div[1]");

/** Section start on Maya's measurement page. A hard goto is fine here: it is
 * the section's first paint, which the builder's head-trim hides. */
async function openMaya(page, h) {
  await h.gotoAuthed(page, mayaPath);
  await page.getByRole("heading", { level: 1, name: "Maya Brooks" }).waitFor({ state: "visible", timeout: 10000 });
  await h.hold(page, 900); // settle before the first beat (lessons F6)
}

async function openTwelfthDirect(page, h) {
  await h.gotoAuthed(page, twelfthPath);
  await h.hold(page, 900);
}

/** Click a field and type into it, replacing whatever it held. */
async function typeInto(page, h, input, text, s, mark = true) {
  await h.point(page, input, { s, mark });
  await h.hold(page, 400);
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(text, { delay: 110 });
}

/** Wait for a field's status dot to reach `label` ("Saved", "Couldn't read
 * that number"). The dot shows "Saving" first; a zoom must not freeze that. */
async function waitDot(box, label) {
  await box.getByLabel(label, { exact: true }).waitFor({ state: "visible", timeout: 8000 });
}

export const WALKTHROUGH = {
  slug: "measurements",
  title: "Measurements",
  guideAnchor: "measurements",
  sections: [
    {
      id: "intro",
      heading: "Measurements",
      targetSeconds: 24,
      prep: async (api) => remember(await resetTwelfthNight(api, TWELFTH_CAST_STATE)),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900);
        // s:0: "In the last video, we cast Twelfth Night..."
        const card = page.locator("main").getByRole("link", { name: new RegExp(TWELFTH) }).first();
        await h.point(page, card, { s: 0 });
        await h.hold(page, 1600);
        // s:1: "Now it is time to measure everyone..." opens the show.
        await h.openRecord(page, TWELFTH, twelfthPath, { headingRe: new RegExp(TWELFTH), s: 1 });
        // s:2: "...from your first number to a whole cast recorded."
        await h.zoom(page, roleRow(page, "Viola"), { s: 2, holdMs: 2600 });
        // s:3 names every step; re-park across the rows it touches (B12).
        await h.point(page, roleRow(page, TWELFTH_ENSEMBLE), { s: 3 });
        await h.hold(page, 2200);
        await h.zoom(page, importToolbar(page), { s: 3, holdMs: 2600 });
        // s:4: "By the end, you will know every way to get a whole cast measured."
        await h.point(page, roleRow(page, "Sebastian"), { s: 4 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "open-performer",
      heading: "Open a performer",
      targetSeconds: 20,
      prep: async (api) => remember(await resetTwelfthNight(api, TWELFTH_CAST_STATE)),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900);
        // s:0: "Measurements live with each performer, right alongside their casting."
        const card = page.locator("main").getByRole("link", { name: new RegExp(TWELFTH) }).first();
        await h.point(page, card, { s: 0 });
        await h.hold(page, 1500);
        // s:1: "Open the show, choose a role, and go to its Cast & Measure tab..."
        await h.openRecord(page, TWELFTH, twelfthPath, { headingRe: new RegExp(TWELFTH), s: 1 });
        const viola = roleCard(page, "Viola");
        const row = roleRow(page, "Viola");
        await h.point(page, row, { s: 1 });
        await h.hold(page, 600);
        await row.click();
        const tab = viola.getByRole("button", { name: "Cast & Measure" });
        await tab.waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, tab, { s: 1 });
        await h.hold(page, 600);
        await tab.click();
        const maya = viola.getByRole("link", { name: "Maya Brooks" }).first();
        await maya.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 700);
        // s:2: "Choose the performer's name to open their measurement page."
        await h.point(page, maya, { s: 2 });
        await h.hold(page, 800);
        await maya.click();
        await page.getByRole("heading", { level: 1, name: "Maya Brooks" }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 1000);
        // s:3: "Each performer gets one page for every measurement they need..."
        await h.zoom(page, counterHeader(page), { s: 3, holdMs: 3000 });
        await h.hold(page, 800);
      },
    },
    {
      id: "enter-measurements",
      heading: "Enter measurements",
      targetSeconds: 26,
      prep: async (api) => remember(await resetTwelfthNight(api, TWELFTH_CAST_STATE)),
      run: async (page, h) => {
        await openMaya(page, h);
        // s:0: "Type each measurement into its box."
        const feet = page.getByLabel("Height (feet)");
        const inches = page.getByLabel("Height (inches)");
        await typeInto(page, h, feet, "5", 0);
        await h.hold(page, 300);
        await typeInto(page, h, inches, "6", 0, false);
        await h.hold(page, 400);
        // s:1: "There is no save button here... a small dot beside it confirms it saved."
        const chest = field(page, "Chest / bust");
        await typeInto(page, h, chest, "34", 1);
        await page.keyboard.press("Tab");
        await waitDot(fieldBox(page, "Chest / bust"), "Saved");
        await waitDot(heightBox(page), "Saved");
        await h.hold(page, 500);
        await h.zoom(page, fieldRow(page, "Chest / bust"), { s: 1, holdMs: 2800 });
        // s:2: "Numeric fields like chest and waist take a plain number of inches."
        await h.point(page, field(page, "Waist"), { s: 2 });
        await h.hold(page, 2200);
        // s:3: "Sizes like shirt, pant, and shoe are free text instead..."
        const shirt = field(page, "Shirt size");
        await typeInto(page, h, shirt, "M", 3);
        await page.keyboard.press("Tab");
        await waitDot(fieldBox(page, "Shirt size"), "Saved");
        await h.hold(page, 1200);
        await h.point(page, field(page, "Shoe size"), { s: 3, mark: false });
        await h.hold(page, 1200);
        // s:4: "There is no strict format to match..." holds on the counter.
        await h.zoom(page, counterHeader(page), { s: 4, holdMs: 2800 });
      },
    },
    {
      id: "where-to-measure",
      heading: "Where to measure",
      targetSeconds: 22,
      prep: async (api) => remember(await resetTwelfthNight(api, STATE_ENTERED)),
      run: async (page, h) => {
        await openMaya(page, h);
        const summary = page.locator("main summary").filter({ hasText: "Where do I measure?" });
        const diagram = page.locator("main details > div").first();
        // s:0: "Not sure where a measurement is taken?"
        await h.point(page, summary, { s: 0 });
        await h.hold(page, 900);
        // s:1: "For a front and back body diagram, shown side by side, open Where do I measure?"
        await h.point(page, summary, { s: 1 });
        await summary.click();
        await diagram.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        // Still s:1: the diagram opens while the sentence describes it.
        await h.zoom(page, diagram, { s: 1, holdMs: 2600 });
        // s:2: "Each body measurement has a matching spot on that diagram."
        await h.point(page, diagram.getByText("Chest", { exact: true }), { s: 2 });
        await h.hold(page, 1400);
        // s:3: "Click into a measurement box, and its spot on the diagram lights up in red..."
        // The field sits far below the diagram at this zoom, so click it,
        // then glide back up: activeKey stays set after the field blurs.
        const nape = field(page, "Nape to floor");
        await h.point(page, nape, { s: 3 });
        await h.hold(page, 500);
        await nape.click();
        await h.hold(page, 600);
        // Zoom the whole diagram: its centre is the gap between the two
        // figures, so the cursor never hides the red marker.
        await h.zoom(page, diagram, { s: 3, holdMs: 3000 });
        // s:4: "This works for every body measurement, from the neck down to the inseam."
        const inseam = field(page, "Inseam");
        // One beat on the last sentence, so it lands at the sentence start
        // and the zoom fits before the section's tail is trimmed.
        await h.point(page, inseam, { s: 4, mark: false });
        await h.hold(page, 400);
        await inseam.click();
        await h.hold(page, 500);
        await h.zoom(page, diagram, { s: 4, holdMs: 2200 });
        await h.hold(page, 800);
      },
    },
    {
      id: "handwriting",
      heading: "Write it like you would on paper",
      targetSeconds: 26,
      prep: async (api) => remember(await resetTwelfthNight(api, STATE_ENTERED)),
      run: async (page, h) => {
        await openMaya(page, h);
        const waist = field(page, "Waist");
        const waistBox = fieldBox(page, "Waist");
        // s:0: "You can enter a number the way you would write it by hand."
        await typeInto(page, h, waist, "26 1/2", 0);
        await h.hold(page, 400);
        await page.keyboard.press("Tab");
        await waitDot(waistBox, "Saved");
        await h.hold(page, 400);
        // s:1: "...written with a fraction, saves as twenty six point five..."
        // The field keeps showing what was typed until the page loads again;
        // reload so the saved 26.5 is what the viewer sees.
        await h.zoom(page, fieldRow(page, "Waist"), { s: 1, holdMs: 2000 });
        await h.gotoAuthed(page, mayaPath);
        await page.getByRole("heading", { level: 1, name: "Maya Brooks" }).waitFor({ state: "visible", timeout: 10000 });
        if ((await waist.inputValue()) !== "26.5") throw new Error(`handwriting: Waist reads "${await waist.inputValue()}" after reload, expected 26.5`);
        await h.hold(page, 500);
        await h.zoom(page, fieldRow(page, "Waist"), { s: 1, holdMs: 2800 });
        // s:2: "On an iPad with an Apple Pencil, you can write straight into any box..."
        await h.point(page, waist, { s: 2 });
        await h.hold(page, 1800);
        // s:3: "If the app cannot read a value, a red dot appears, and you simply write it again."
        await typeInto(page, h, waist, "abc", 3, false);
        await page.keyboard.press("Tab");
        await waitDot(waistBox, "Couldn't read that number");
        await h.hold(page, 300);
        await h.zoom(page, fieldRow(page, "Waist"), { s: 3, holdMs: 2400 });
        await typeInto(page, h, waist, "26 1/2", 3, false);
        await page.keyboard.press("Tab");
        await waitDot(waistBox, "Saved");
        await h.hold(page, 1600);
      },
    },
    {
      id: "switcher",
      heading: "Move between performers",
      targetSeconds: 26,
      prep: async (api) => remember(await resetTwelfthNight(api, STATE_SWITCHER)),
      run: async (page, h) => {
        await openMaya(page, h);
        const next = page.getByRole("button", { name: "Next performer" }).first();
        // s:0: "...the bars at the top and bottom of the page take you to the previous or next person."
        await h.point(page, next, { s: 0 });
        await h.hold(page, 1500);
        await h.point(page, page.getByRole("button", { name: "Previous performer" }).first(), { s: 0, mark: false });
        await h.hold(page, 900);
        // The same bar repeats at the foot of the page.
        await h.point(page, page.getByRole("button", { name: "Next performer" }).last(), { s: 0, mark: false });
        await h.hold(page, 1200);
        await h.point(page, next, { s: 0, mark: false });
        await h.hold(page, 500);
        await next.click();
        await page.getByRole("heading", { level: 1, name: "Theo Park" }).waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 800);
        // s:1: "You never need to go back to the cast list."
        await h.point(page, page.getByRole("heading", { level: 1, name: "Theo Park" }), { s: 1 });
        await h.hold(page, 1200);
        // s:2: "Choose the name in the middle to jump straight to anyone..."
        const centre = page.getByRole("button", { name: /^Theo Park \d+ of \d+/ }).first();
        await h.point(page, centre, { s: 2 });
        await h.hold(page, 600);
        const skip = page.getByLabel("Skip anyone fully measured");
        await centre.click();
        if (!(await skip.isVisible({ timeout: 2000 }).catch(() => false))) {
          await h.hold(page, 400);
          await centre.click(); // lessons B5: retry once after the re-render
        }
        await skip.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 700);
        const jordan = page.locator("main ul li button").filter({ hasText: "Jordan Lee" }).first();
        await h.zoom(page, jordan, { s: 2, holdMs: 2600 });
        // s:3: "You can sort that list By role, A to Z, or by Order added."
        // A native <select> popup never films (lessons A1): cycle the value.
        const order = page.locator("main select").first();
        await h.point(page, order, { s: 3 });
        await h.hold(page, 600);
        await order.selectOption({ label: "A to Z" });
        await h.hold(page, 700);
        // Zoom the list so the reorder reads (Jordan first under A to Z).
        await h.zoom(page, page.locator("main ul").first().locator("xpath=.."), { s: 3, holdMs: 2200 });
        for (const label of ["Order added", "By role"]) {
          await h.point(page, order, { s: 3, mark: false });
          await order.selectOption({ label });
          await h.hold(page, 900);
        }
        // s:4: "Turn on Skip anyone fully measured, and Next only stops on people who still need it."
        await h.point(page, skip, { s: 4 });
        await h.hold(page, 600);
        await skip.check();
        await h.hold(page, 600);
        await h.zoom(page, page.locator("main ul").first().locator("xpath=.."), { s: 4, holdMs: 2400 });
      },
    },
    {
      id: "import-forms",
      heading: "Import paper forms",
      targetSeconds: 32,
      prep: async (api) => remember(await resetTwelfthNight(api, STATE_SWITCHER)),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Already have forms filled in on paper?"
        await h.point(page, roleRow(page, TWELFTH_ENSEMBLE), { s: 0 });
        await h.hold(page, 900);
        // s:1: "Back on the production, choose Import measurement forms, and pick a photo..."
        const openImport = page.locator("main").getByRole("button", { name: "Import measurement forms" });
        await h.point(page, openImport, { s: 1 });
        await h.hold(page, 700);
        await openImport.click();
        const panel = page.locator("main section").filter({ has: page.getByRole("heading", { name: "Import measurement forms" }) });
        const choose = panel.getByText("Choose photos", { exact: true });
        await choose.waitFor({ state: "visible", timeout: 6000 });
        // The file input stays disabled until the cast context loads.
        await page.waitForFunction(() => {
          const el = document.querySelector('main section input[type="file"]');
          return el instanceof HTMLInputElement && !el.disabled;
        }, null, { timeout: 10000 });
        await h.hold(page, 600);
        await h.point(page, choose, { s: 1, mark: false });
        await h.hold(page, 700);
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), choose.click()]);
        await chooser.setFiles(FORM_IMAGE);
        // s:2: "The app reads every photo with AI and matches it to a performer by name."
        const reading = panel.getByText(/^Reading 1 of 1/);
        await h.point(page, reading, { s: 2, timeoutMs: 3000 });
        const importBtn = panel.getByRole("button", { name: "Import 1 form" });
        const failed = panel.getByText(/Couldn't read that photo|isn't set up|Try again/);
        // The live read takes several seconds. The builder compresses that
        // stretch but cannot drop it, so the cursor drifts across the panel
        // meanwhile rather than filming a freeze. Bounded; the .or() wait
        // below still owns the timeout.
        const drift = [panel.getByRole("heading", { name: "Import measurement forms" }), panel.locator("p").first(), reading];
        for (let i = 0; i < 12; i++) {
          if (await importBtn.or(failed).first().isVisible()) break;
          if (!(await reading.isVisible())) break;
          await h.point(page, drift[i % drift.length], { s: 2, mark: false, timeoutMs: 1500 });
          await h.hold(page, 700);
        }
        // One wait on either outcome (no Promise.race; see roles-and-cast).
        await importBtn.or(failed).first().waitFor({ state: "visible", timeout: 60000 });
        if (await failed.first().isVisible()) {
          throw new Error("import-forms: the AI read failed on camera; check ANTHROPIC_API_KEY in the server env and retake");
        }
        const performer = panel.locator("select").first();
        const chosen = await performer.evaluate((el) => el.options[el.selectedIndex]?.text ?? "");
        if (!chosen.startsWith(ROSA_FORM.name)) {
          throw new Error(`import-forms: the read preselected "${chosen}", not ${ROSA_FORM.name}; retake`);
        }
        const unreadable = await panel.getByText("couldn't read", { exact: true }).count();
        if (unreadable > 0) throw new Error(`import-forms: ${unreadable} couldn't-read row(s) in the review; retake`);
        const rows = await panel.locator("tbody tr").count();
        if (rows !== ROSA_FIELD_COUNT) throw new Error(`import-forms: the review lists ${rows} rows, expected ${ROSA_FIELD_COUNT}; retake`);
        // Every value, on its own row, must match ROSA_FORM before anything is
        // filmed as correct. The "On form" cell is the value text node plus a
        // status span ("new"), so read the text node alone.
        const mismatches = [];
        for (const [key, value] of Object.entries(ROSA_IMPORTED)) {
          const label = REVIEW_LABELS[key];
          const cells = panel.locator("tbody tr").filter({ has: page.getByRole("cell", { name: label, exact: true }) }).first().locator("td");
          const shown = (await cells.nth(2).evaluate((td) => td.firstChild?.textContent ?? "")).trim();
          const want = reviewDisplay(key, value);
          if (shown !== want) mismatches.push(`${label}: shows "${shown}", form says "${want}"`);
        }
        if (mismatches.length > 0) throw new Error(`import-forms: the read disagrees with the form (${mismatches.join("; ")}); retake`);
        await h.hold(page, 600);
        await h.zoom(page, performer, { s: 2, holdMs: 2400 });
        // s:3: "Before anything is saved, you check each value next to what is already saved..."
        const row = (label) => panel.locator("tbody tr").filter({ has: page.getByRole("cell", { name: label, exact: true }) }).first();
        await h.zoom(page, row("Chest / bust"), { s: 3, holdMs: 2400 });
        await h.zoom(page, row("Waist"), { s: 3, holdMs: 2600 });
        // s:4: "When it looks right, choose Import..."
        await h.point(page, importBtn, { s: 4 });
        await h.hold(page, 800);
        await importBtn.click();
        const note = page.locator("main").getByText(/^Imported /).first();
        await note.waitFor({ state: "visible", timeout: 15000 });
        const expected = `Imported ${ROSA_FIELD_COUNT} measurements.`;
        const said = (await note.textContent())?.trim();
        if (said !== expected) throw new Error(`import-forms: the note reads "${said}", the narration expects "${expected}"`);
        await h.hold(page, 400);
        await h.zoom(page, note.locator("xpath=.."), { s: 4, holdMs: 2800 });
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 30,
      prep: async (api) => remember(await resetTwelfthNight(api, TWELFTH_MEASURED_STATE)),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "That is how you measure a cast..."
        await h.zoom(page, roleRow(page, "Viola"), { s: 0, holdMs: 2600 });
        await h.zoom(page, roleRow(page, "Sebastian"), { s: 0, holdMs: 2400 });
        // s:1 recaps each step and ends on Rosa Diaz's imported form: open
        // the Musicians card, where she is cast. Each stop is a zoom, since a
        // moving cursor alone reads as a freeze (see roles-and-cast wrap-up).
        const card = roleCard(page, TWELFTH_ENSEMBLE);
        const row = roleRow(page, TWELFTH_ENSEMBLE);
        await h.point(page, row, { s: 1 });
        await h.hold(page, 600);
        await row.click();
        const tab = card.getByRole("button", { name: "Cast & Measure" });
        await tab.waitFor({ state: "visible", timeout: 4000 });
        await h.point(page, tab, { s: 1, mark: false });
        await h.hold(page, 500);
        await tab.click();
        const rosa = card.getByRole("link", { name: ROSA_FORM.name }).first();
        await rosa.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 700);
        await h.zoom(page, card, { s: 1, holdMs: 3000 });
        await h.point(page, rosa, { s: 1, mark: false });
        await h.hold(page, 1500);
        // s:2: "In the next video, we will move into Costume Creations..."
        // Nothing links there yet (no pieces exist), so rest on the lead role.
        await h.zoom(page, roleRow(page, "Viola"), { s: 2, holdMs: 3000 });
        // s:3: "Thanks for watching..."
        // A role row, not the h1: any title zoom parks the cursor inside the
        // word. The Musicians row's centre is empty and its icon now shows
        // Rosa Diaz's imported measurements.
        await h.zoom(page, roleRow(page, TWELFTH_ENSEMBLE), { s: 3, holdMs: 1800 });
        await h.hold(page, 800);
      },
    },
  ],
};
