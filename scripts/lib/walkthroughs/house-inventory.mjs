// Training video 5: "House Inventory". Script: docs/training-videos/scripts/house-inventory.md.
//
// DB state: only the demo org's "Twelfth Night", the two DEMO_MAKERS, and
// the House Inventory items named in DEMO_INVENTORY_NAMES are touched. Every
// prep runs resetDemoCostumeOrg (inventory cleanup by exact name, maker
// colors), then resetDemoInventory (the seeded items, plus the Velvet cloak
// once "add-item" has filmed it), then rebuilds Twelfth Night from video 4's
// end state (TWELFTH_COSTUMED_STATE), then logs Viola's Doublet to House
// Inventory exactly the way video 4's wrap-up prep does, so the Doublet
// carries its sketch and its "Made for" line. Every section therefore
// retakes alone.
//
// No beat clicks "Remove item" or a piece's remove button: both open a
// native confirm, which never films.
import {
  TWELFTH,
  DEMO_INVENTORY_ITEMS, DEMO_INVENTORY_CAMERA_ITEM,
  TWELFTH_COSTUMED_STATE, TWELFTH_DOUBLET_TO_INVENTORY,
  resetDemoCostumeOrg, resetDemoInventory, resetTwelfthNight,
  assertDemoInventoryOnly,
} from "../demo-productions.mjs";
import { escapeRe, roleRow, roleCard } from "../role-rows.mjs";

const CLOAK = DEMO_INVENTORY_CAMERA_ITEM; // Velvet cloak, typed on camera
const REUSED = "Pirate coat";
const REUSED_ITEM = DEMO_INVENTORY_ITEMS.find((i) => i.name === REUSED);
if (!REUSED_ITEM || REUSED_ITEM.category !== "Coats & capes" || REUSED_ITEM.location !== "Rack A") {
  throw new Error("house-inventory walkthrough: the Pirate coat fixture changed; the narration and peek zoom assume Coats & capes, Rack A");
}
const SEBASTIAN = "Sebastian";
const JORDAN = "Jordan Lee";
const DOUBLET = TWELFTH_DOUBLET_TO_INVENTORY.design; // "Doublet"
const DOUBLET_CATEGORY = "Doublets";
// Typed into the Doublet's Size on camera in "item-details" (every field,
// category included, keeps its flash and its editor open now), so later
// preps set it too.
const DOUBLET_SIZE = "M";

// Twelfth Night once "reuse" has filmed: Sebastian also wears the Pirate
// coat pulled from House Inventory, On hand for Jordan Lee.
const STATE_REUSED = Object.freeze({
  ...TWELFTH_COSTUMED_STATE,
  designs: [...TWELFTH_COSTUMED_STATE.designs, { role: SEBASTIAN, fromInventory: REUSED }],
  pieces: [...TWELFTH_COSTUMED_STATE.pieces, { role: SEBASTIAN, design: REUSED, performer: JORDAN, source: "on_hand" }],
});

// Set by each prep so the opening goto is the real URL (ids change on every
// reset).
let twelfthPath = "/productions";
const key = (role, name) => `${role}\u0000${name}`;

/** Every prep, in the order the plan fixes. `cloak` adds the Velvet cloak
 * with its camera values and photo; `doubletCategory` files the Doublet
 * under "Doublets" with size M, as item-details did on camera; `reused` adds Sebastian's
 * Pirate coat. */
async function prepWith(api, { cloak = false, doubletCategory = false, reused = false } = {}) {
  const makerIds = await resetDemoCostumeOrg(api);
  await assertDemoInventoryOnly(api);
  const inventoryIds = await resetDemoInventory(api, cloak ? [...DEMO_INVENTORY_ITEMS, CLOAK] : DEMO_INVENTORY_ITEMS);
  const { production, designIds, castingIds } = await resetTwelfthNight(
    api, reused ? STATE_REUSED : TWELFTH_COSTUMED_STATE, { makerIds, inventoryIds },
  );
  twelfthPath = `/productions/${production.id}`;
  const { role, design, performer, location } = TWELFTH_DOUBLET_TO_INVENTORY;
  await api.post(`/api/productions/${production.id}/pieces/to-inventory`, {
    designId: designIds.get(key(role, design)),
    castingId: castingIds.get(key(role, performer)),
    location,
  });
  if (doubletCategory) {
    const { items } = await api.get("/api/inventory");
    const doublets = items.filter((i) => i.name === DOUBLET);
    if (doublets.length !== 1) throw new Error(`house-inventory prep: expected one ${DOUBLET} item, found ${doublets.length}`);
    await api.patch(`/api/inventory/${doublets[0].id}`, { category: DOUBLET_CATEGORY, size: DOUBLET_SIZE });
  }
}

/** True once `loc` is visible within `ms`. Playwright's isVisible() ignores
 * its timeout and answers immediately, so a retry-once check built on it
 * fires the retry click before a slow render lands (that re-click closed an
 * already-open peek and collapsed a just-expanded piece in the first pass). */
const appears = (loc, ms = 2500) => loc.waitFor({ state: "visible", timeout: ms }).then(() => true, () => false);

/** Guard: every tile photo (and any photo in an open item) has decoded. */
async function waitForTilePhotos(page) {
  await page.locator("main li img").first().waitFor({ state: "attached", timeout: 10000 });
  try {
    await page.waitForFunction(() => {
      const imgs = Array.from(document.querySelectorAll("main li img"));
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    }, null, { timeout: 10000 });
  } catch {
    throw new Error("waitForTilePhotos: a House Inventory photo had not loaded within 10 s; retake");
  }
}

async function openInventoryDirect(page, h) {
  await h.gotoAuthed(page, "/inventory");
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: 10000 });
  await waitForTilePhotos(page);
  await h.hold(page, 900); // settle before the first beat (lessons F6)
}

async function openTwelfthDirect(page, h) {
  await h.gotoAuthed(page, twelfthPath);
  await page.getByRole("heading", { level: 1, name: new RegExp(TWELFTH) }).waitFor({ state: "visible", timeout: 10000 });
  await h.hold(page, 900);
}

// /inventory: a tile (the <li> holding the item's button), its button, a
// category header button (label, count, collapse glyph).
const tile = (page, name) =>
  page.locator("main li").filter({ has: page.locator("span.truncate", { hasText: new RegExp(`^${escapeRe(name)}$`) }) }).first();
const tileButton = (page, name) => tile(page, name).getByRole("button").first();
const tileMeta = (page, name) => tile(page, name).locator("span.block.text-xs").first();
const groupHeader = (page, label) =>
  page.locator("main").getByRole("button").filter({ has: page.locator("span.lbl", { hasText: new RegExp(`^${escapeRe(label)}$`) }) }).first();
// The item editor (InventoryItemDetail's root) that holds a given name.
const itemEditor = (page, name) =>
  page.locator("main div.surface").filter({ has: page.locator(`input[aria-label="Item name"][value="${name}"]`) }).first();
const flash = (scope) => scope.getByText("Saved ✓", { exact: true }).first();

/** Waits until a SavedFlash in `scope` is showing (it is always in the DOM,
 * faded to opacity 0, so "visible" alone proves nothing). */
async function waitForSaved(page, scope, where) {
  const el = await flash(scope).elementHandle({ timeout: 4000 });
  try {
    await page.waitForFunction((node) => node.classList.contains("opacity-100"), el, { timeout: 6000 });
  } catch {
    throw new Error(`${where}: "Saved ✓" never showed; retake`);
  }
}

async function typeInto(page, h, input, text, s, mark = true, delay = 80) {
  await h.point(page, input, { s, mark });
  await h.hold(page, 300);
  await input.click();
  await input.press("ControlOrMeta+A");
  await input.pressSequentially(text, { delay });
}

/** Open a role card and its Costume tab on camera, pointing at each. */
async function openCostumeTab(page, h, role, s, mark = true) {
  const card = roleCard(page, role);
  const row = roleRow(page, role);
  await h.point(page, row, { s, mark });
  await h.hold(page, 600);
  await row.click();
  const tab = card.getByRole("button", { name: "Costume", exact: true });
  if (!(await appears(tab, 2500))) {
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

// Role card, Costume tab (same shapes as costume-creations.mjs).
const performerBlock = (page, card, name) =>
  card.locator("div.surface").filter({ has: page.getByRole("button", { name: new RegExp(`^[▸▾]\\s*${escapeRe(name)}`) }) }).first();
const sourceRow = (page, block, design) =>
  block.locator("div.flex.flex-col").filter({ has: page.locator("span.truncate", { hasText: new RegExp(`^${escapeRe(design)}$`) }) }).first();
const pieceBox = (card, design) =>
  card.locator("div.rounded-md").filter({ has: card.page().getByRole("button", { name: new RegExp(`^[▸▾]\\s*${escapeRe(design)}$`) }) }).first();
const pieceToggle = (card, design) =>
  card.getByRole("button", { name: new RegExp(`^[▸▾]\\s*${escapeRe(design)}$`) }).first();

export const WALKTHROUGH = {
  slug: "house-inventory",
  title: "House Inventory",
  guideAnchor: "inventory",
  sections: [
    {
      id: "intro",
      heading: "House Inventory",
      targetSeconds: 26,
      prep: async (api) => prepWith(api),
      run: async (page, h) => {
        await openInventoryDirect(page, h);
        // s:0: "In the last video, we logged a finished doublet into House Inventory."
        await h.point(page, tileButton(page, DOUBLET), { s: 0 });
        await h.hold(page, 1800);
        // s:1: "House Inventory is your costume library: everything your
        // company already owns, photographed and easy to find..."
        await h.point(page, tileButton(page, "Lace fan"), { s: 1 });
        await h.hold(page, 1200);
        await h.zoom(page, tile(page, REUSED), { s: 1, holdMs: 2600 });
        await h.point(page, tileButton(page, "Ball gown"), { s: 1, mark: false });
        await h.hold(page, 1500);
        // s:2: "...how it is organized, add a brand new item from scratch, and
        // then pull an existing item straight into a different show..."
        await h.point(page, groupHeader(page, "Hats"), { s: 2 });
        await h.hold(page, 1600);
        await h.point(page, page.locator("main").getByRole("button", { name: "+ Add item", exact: true }), { s: 2, mark: false });
        await h.hold(page, 1800);
        await h.point(page, tileButton(page, REUSED), { s: 2, mark: false });
        await h.hold(page, 2200);
      },
    },
    {
      id: "find-inventory",
      heading: "Finding it",
      targetSeconds: 17,
      prep: async (api) => prepWith(api),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        const card = page.locator('main a[href="/inventory"]').first();
        await card.waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 900);
        // s:0: "Open it from Inventory at the top of any page."
        await h.point(page, page.locator("header").getByRole("link", { name: /^Inventory\s*$/ }), { s: 0 });
        await h.hold(page, 1800);
        // s:1: "It also has its own card on the Productions page, which shows
        // how many items you have on hand."
        const count = card.getByText(/^\d+ items? on hand$/);
        if (!(await count.isVisible())) throw new Error("find-inventory: the House Inventory card shows no \"on hand\" count");
        await h.zoom(page, card.locator("xpath=.."), { s: 1, holdMs: 2800 });
        // s:2: "That count grows every time you log a finished piece..."
        await h.point(page, count, { s: 2 });
        await h.hold(page, 1400);
        await h.point(page, card.getByText("House Inventory →", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 600);
        await card.click();
        await page.waitForURL(/\/inventory(?:$|[/?])/, { timeout: 10000 });
        await waitForTilePhotos(page);
        await h.hold(page, 1600);
      },
    },
    {
      id: "the-grid",
      heading: "The photo grid",
      targetSeconds: 21,
      prep: async (api) => prepWith(api),
      run: async (page, h) => {
        await openInventoryDirect(page, h);
        // s:0: "Every item shows as a photo tile, with its size and how many you have."
        await h.point(page, tileButton(page, "Lace fan"), { s: 0 });
        await h.hold(page, 1000);
        await h.zoom(page, tileMeta(page, REUSED), { s: 0, holdMs: 2400 });
        // s:1: "Items are grouped by category, and you can fold a category away..."
        const hats = groupHeader(page, "Hats");
        await h.point(page, hats, { s: 1 });
        await h.hold(page, 700);
        await hats.click();
        const glyph = hats.locator("span.ml-auto");
        const collapsedOk = async (want) =>
          page.waitForFunction(({ el, want }) => el.textContent === want, { el: await glyph.elementHandle(), want }, { timeout: 2500 }).then(() => true, () => false);
        if (!(await collapsedOk("›"))) {
          await h.hold(page, 400);
          await hats.click(); // lessons B5
          if (!(await collapsedOk("›"))) throw new Error("the-grid: the Hats group did not collapse");
        }
        await h.hold(page, 1600);
        await hats.click();
        if (!(await collapsedOk("⌄"))) throw new Error("the-grid: the Hats group did not expand again");
        await waitForTilePhotos(page);
        await h.point(page, tileButton(page, "Top hat"), { s: 1, mark: false });
        await h.hold(page, 1200);
        // s:2: "To find something fast, type in the search box..."
        const search = page.locator("main").getByRole("textbox", { name: "Search inventory" });
        await typeInto(page, h, search, "hat", 2, true, 160);
        const matches = groupHeader(page, "Hats").getByText(/·\s*2 matches/);
        await matches.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 500);
        // The header is full width: its centre is empty space, clear of the
        // label and the count (lessons A4).
        await h.zoom(page, groupHeader(page, "Hats"), { s: 2, holdMs: 2600 });
        await h.point(page, search, { s: 2, mark: false });
        await h.hold(page, 400);
        await search.press("ControlOrMeta+A");
        await search.press("Backspace");
        await groupHeader(page, "Accessories").waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 1400);
      },
    },
    {
      id: "add-item",
      heading: "Add an item",
      targetSeconds: 24,
      prep: async (api) => prepWith(api),
      run: async (page, h) => {
        await openInventoryDirect(page, h);
        // s:0: "To add something new, choose Add item and give it a name."
        const addButton = page.locator("main").getByRole("button", { name: "+ Add item", exact: true });
        await h.point(page, addButton, { s: 0 });
        await h.hold(page, 500);
        await addButton.click();
        const nameInput = page.locator("main").getByPlaceholder("Item name (e.g. Top hat)");
        if (!(await appears(nameInput, 2500))) {
          await h.hold(page, 400);
          await addButton.click(); // lessons B5
        }
        await nameInput.waitFor({ state: "visible", timeout: 4000 });
        await nameInput.pressSequentially(CLOAK.name, { delay: 90 });
        await h.hold(page, 300);
        const submit = page.locator("main").getByRole("button", { name: "Add item", exact: true });
        await h.point(page, submit, { s: 0, mark: false });
        await submit.click();
        const added = page.locator("main p").filter({ hasText: `Added ✓ ${CLOAK.name}. Add details & photos:` }).first();
        await added.waitFor({ state: "visible", timeout: 8000 });
        const editor = itemEditor(page, CLOAK.name);
        await editor.waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);
        // s:1: "Then fill in the details: a category, the size, how many you
        // have, and where it is stored." Each field: type, Tab, "Saved ✓".
        const fields = [
          ["Category", CLOAK.category],
          ["Size", CLOAK.size],
          ["Quantity", String(CLOAK.quantity)],
          ["Location", CLOAK.location],
        ];
        let first = true;
        for (const [label, value] of fields) {
          // getByLabel: Category is a combobox (it has a datalist), Quantity a spinbutton.
          const input = editor.getByLabel(label, { exact: true });
          await typeInto(page, h, input, value, 1, first, 90);
          first = false;
          await input.press("Tab");
          await waitForSaved(page, editor, `add-item ${label}`);
          await h.hold(page, 350);
        }
        // s:2: "Each field saves the moment you click away... and there is a
        // notes box too..." The size and quantity row: its centre sits
        // between the two inputs, and the Saved flash is in frame above.
        await h.zoom(page, editor.locator("div.grid").first(), { s: 2, holdMs: 2400 });
        await h.point(page, editor.getByLabel("Notes", { exact: true }), { s: 2, mark: false });
        await h.hold(page, 2000);
        // s:3: "Add up to six photos..." The file chooser event hands the
        // photo over without painting any OS dialog.
        const addPhoto = editor.getByRole("button", { name: "Add photo from library" });
        await h.point(page, addPhoto, { s: 3 });
        await h.hold(page, 500);
        const [chooser] = await Promise.all([page.waitForEvent("filechooser"), addPhoto.click()]);
        await chooser.setFiles(CLOAK.photo);
        const thumb = editor.getByRole("img", { name: "Reference 1" });
        await thumb.waitFor({ state: "visible", timeout: 20000 });
        await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await thumb.elementHandle(), { timeout: 15000 });
        await h.hold(page, 300);
        // The strip's full-width row: its centre is empty space to the right
        // of the thumbnail, so the cursor never covers it (lessons A4).
        await h.zoom(page, thumb.locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), { s: 3, holdMs: 2000 });
        // Guard: the typed values and the photo reached the server. "Done" is
        // not clicked on camera for pacing and scope: this section is about
        // filling in an item's details, not the grid's tile refresh, which
        // "the-grid" already covers.
        const items = await page.evaluate(async () => {
          const r = await fetch("/api/inventory", { credentials: "include" });
          if (!r.ok) throw new Error(`GET /api/inventory -> ${r.status}`);
          return (await r.json()).items;
        });
        const cloaks = items.filter((i) => i.name === CLOAK.name);
        const c = cloaks[0];
        if (cloaks.length !== 1 || c.category !== CLOAK.category || c.size !== CLOAK.size || c.quantity !== CLOAK.quantity || c.location !== CLOAK.location) {
          throw new Error(`add-item: the Velvet cloak did not save as typed: ${JSON.stringify(cloaks)}`);
        }
        if (!c.thumbUrl) throw new Error("add-item: the Velvet cloak has no photo on the server");
        await h.point(page, thumb, { s: 3, mark: false });
        await h.hold(page, 1400);
      },
    },
    {
      id: "item-details",
      heading: "An item's details",
      targetSeconds: 28,
      prep: async (api) => prepWith(api, { cloak: true }),
      run: async (page, h) => {
        await openInventoryDirect(page, h);
        // s:0: "Tap any tile to open it."
        const doublet = tileButton(page, DOUBLET);
        await h.point(page, doublet, { s: 0 });
        await h.hold(page, 500);
        await doublet.click();
        const editor = itemEditor(page, DOUBLET);
        if (!(await appears(editor, 2500))) {
          await h.hold(page, 400);
          await doublet.click(); // lessons B5
        }
        await editor.waitFor({ state: "visible", timeout: 4000 });
        const madeFor = editor.getByText(`Made for: ${TWELFTH} → ${TWELFTH_DOUBLET_TO_INVENTORY.role}`, { exact: true });
        await madeFor.waitFor({ state: "visible", timeout: 8000 });
        await waitForTilePhotos(page);
        // s:1: "Here is the doublet from the last video."
        const sketch = editor.getByRole("img", { name: "Reference 1" });
        await h.point(page, sketch, { s: 1 });
        await h.hold(page, 1200);
        // s:2: "The app remembers which production and role it was made for..."
        // The line is a full-width block: its centre is clear of the text.
        await h.zoom(page, madeFor, { s: 2, holdMs: 3200 });
        await h.hold(page, 400);
        // s:3: "Everything stays editable, so you can file it under a category now..."
        const category = editor.getByLabel("Category", { exact: true });
        await typeInto(page, h, category, DOUBLET_CATEGORY, 3, true, 110);
        await h.hold(page, 300);
        await category.press("Tab");
        // The item stays in its original group and its editor keeps focus
        // while the editor is open (confirmed live): it regroups only once
        // the editor closes. Zoom on the Category/Size row to hold on the
        // "Saved ✓" flash for roughly the glide the old choreography spent;
        // a plain hold has no motion of its own and freezes once the TTS
        // stretch lengthens it past freezedetect's static-frame floor.
        await waitForSaved(page, editor, "item-details Category");
        await h.zoom(page, editor.locator("div.grid").first(), { s: 3, holdMs: 1400 });
        // s:4: "You can also update its size, quantity, or storage location...
        // and the same Saved flash confirms every edit."
        const size = editor.getByLabel("Size", { exact: true });
        await typeInto(page, h, size, DOUBLET_SIZE, 4, true, 150);
        await size.press("Tab");
        await waitForSaved(page, editor, "item-details Size");
        await h.zoom(page, editor.locator("div.grid").first(), { s: 4, holdMs: 2200 });
        await h.point(page, editor.getByLabel("Location", { exact: true }), { s: 4, mark: false });
        await h.hold(page, 1200);
      },
    },
    {
      id: "reuse",
      heading: "Reuse it in a show",
      targetSeconds: 27,
      prep: async (api) => prepWith(api, { cloak: true, doubletCategory: true }),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "This is the payoff for keeping that library up to date."
        await h.zoom(page, roleRow(page, SEBASTIAN), { s: 0, holdMs: 2200 });
        // s:1: "Open a role's Costume tab, and choose add from inventory..."
        const card = await openCostumeTab(page, h, SEBASTIAN, 1);
        const fromInv = card.getByRole("button", { name: "+ add from inventory", exact: true });
        await h.point(page, fromInv, { s: 1, mark: false });
        await h.hold(page, 600);
        await fromInv.click();
        const filter = card.getByPlaceholder("Search inventory…");
        if (!(await appears(filter, 2500))) {
          await h.hold(page, 400);
          await fromInv.click(); // lessons B5
        }
        await filter.waitFor({ state: "visible", timeout: 4000 });
        const pick = card.getByRole("button", { name: new RegExp(`^${escapeRe(REUSED)}\\s*${escapeRe(REUSED_ITEM.category)}$`) });
        await pick.waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 500);
        // s:2: "Search, then pick the item; each result shows its category..."
        await typeInto(page, h, filter, "coat", 2, true, 160);
        await page.waitForFunction((el) => {
          const imgs = Array.from(el.querySelectorAll("img"));
          return imgs.every((img) => img.complete && img.naturalWidth > 0);
        }, await filter.locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]").elementHandle(), { timeout: 8000 });
        await h.hold(page, 400);
        await h.zoom(page, filter.locator("xpath=ancestor::div[contains(@class,'rounded-md')][1]").locator("ul"), { s: 2, holdMs: 2200 });
        await h.point(page, pick, { s: 2, mark: false });
        await h.hold(page, 500);
        await pick.click();
        const toggle = pieceToggle(card, REUSED);
        await toggle.waitFor({ state: "visible", timeout: 8000 });
        await h.hold(page, 600);
        // s:3: "It is added as a costume piece, with its photos, and it is
        // marked On hand for the performer, with its storage location..."
        await h.point(page, toggle, { s: 3 });
        await h.hold(page, 400);
        await toggle.click();
        const expanded = card.getByRole("button", { name: new RegExp(`^▾\\s*${escapeRe(REUSED)}$`) });
        if (!(await appears(expanded, 2500))) {
          await h.hold(page, 400);
          await toggle.click(); // lessons B5
        }
        await expanded.waitFor({ state: "visible", timeout: 4000 });
        // The read-only strip renders nothing until its photos load.
        const photo = pieceBox(card, REUSED).getByRole("img", { name: "Reference 1" });
        await photo.waitFor({ state: "visible", timeout: 10000 });
        await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await photo.elementHandle(), { timeout: 10000 });
        await h.hold(page, 400);
        await h.zoom(page, photo.locator("xpath=ancestor::div[contains(@class,'flex-wrap')][1]"), { s: 3, holdMs: 2200 });
        // Guard: the new piece is the Pirate coat, On hand, at Rack A.
        const row = sourceRow(page, performerBlock(page, card, JORDAN), REUSED);
        await row.waitFor({ state: "visible", timeout: 6000 });
        const select = row.getByRole("combobox").first();
        const shown = await select.evaluate((el) => el.options[el.selectedIndex]?.text ?? "");
        if (shown !== "On hand") throw new Error(`reuse: the Pirate coat source reads "${shown}", not On hand`);
        const where = row.getByText(REUSED_ITEM.location, { exact: true });
        if (!(await where.isVisible())) throw new Error("reuse: Rack A is not shown beside the Pirate coat");
        await h.zoom(page, row, { s: 3, holdMs: 2600 });
        await h.point(page, select, { s: 3, mark: false });
        await h.hold(page, 1200);
      },
    },
    {
      id: "peek-and-used-in",
      heading: "Check it without leaving",
      targetSeconds: 26,
      prep: async (api) => prepWith(api, { cloak: true, doubletCategory: true, reused: true }),
      run: async (page, h) => {
        await openTwelfthDirect(page, h);
        // s:0: "Choose From inventory to look at the item without leaving the page."
        const card = await openCostumeTab(page, h, SEBASTIAN, 0);
        const peekLink = pieceBox(card, REUSED).getByRole("button", { name: "From inventory ↗" });
        await h.point(page, peekLink, { s: 0, mark: false });
        await h.hold(page, 600);
        await peekLink.click();
        const dialog = page.locator('[role="dialog"]').filter({ has: page.getByRole("heading", { name: REUSED }) });
        if (!(await appears(dialog, 2500))) {
          await h.hold(page, 400);
          await peekLink.click(); // lessons B5
        }
        await dialog.waitFor({ state: "visible", timeout: 6000 });
        const location = dialog.locator("p").filter({ hasText: /^Location:\s*Rack A$/ });
        await location.waitFor({ state: "visible", timeout: 8000 });
        const meta = dialog.getByText(`${REUSED_ITEM.category} · ${REUSED_ITEM.size} · ×${REUSED_ITEM.quantity}`, { exact: true });
        if (!(await meta.isVisible())) throw new Error("peek-and-used-in: the peek does not show the Pirate coat's category, size, and quantity");
        const peekPhoto = dialog.getByRole("img", { name: "Reference 1" });
        await peekPhoto.waitFor({ state: "visible", timeout: 8000 });
        await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, await peekPhoto.elementHandle(), { timeout: 10000 });
        await h.hold(page, 500);
        // s:1: "It shows the same photo and details as the full item page..."
        // The Location line is a full-width block: its centre is clear of text.
        await h.zoom(page, location, { s: 1, holdMs: 3200 });
        await h.point(page, peekPhoto, { s: 1, mark: false });
        await h.hold(page, 1200);
        // s:2: "And Open in inventory takes you to the item itself, which now
        // shows where it is being used..."
        const open = dialog.getByRole("link", { name: "Open in inventory ↗" });
        await h.point(page, open, { s: 2 });
        await h.hold(page, 700);
        await open.click();
        await page.waitForURL(/\/inventory\?item=/, { timeout: 10000 });
        const editor = itemEditor(page, REUSED);
        await editor.waitFor({ state: "visible", timeout: 8000 });
        const usedIn = editor.getByText(`Used in: ${TWELFTH} → ${SEBASTIAN}`, { exact: true });
        await usedIn.waitFor({ state: "visible", timeout: 8000 });
        await waitForTilePhotos(page);
        await h.hold(page, 600);
        await h.zoom(page, usedIn, { s: 2, holdMs: 3000 });
        // s:3: "It is the same item page from earlier in this video, just with
        // one more relationship added to it."
        await h.point(page, tileButton(page, REUSED), { s: 3 });
        await h.hold(page, 1400);
        await h.point(page, editor.getByRole("img", { name: "Reference 1" }), { s: 3, mark: false });
        await h.hold(page, 1400);
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 24,
      prep: async (api) => prepWith(api, { cloak: true, doubletCategory: true, reused: true }),
      run: async (page, h) => {
        await openInventoryDirect(page, h);
        // s:0: "That is House Inventory: photograph what you own, find it in
        // seconds, and pull it straight into your next show..."
        await h.zoom(page, tile(page, CLOAK.name), { s: 0, holdMs: 2400 });
        await h.point(page, page.locator("main").getByRole("textbox", { name: "Search inventory" }), { s: 0, mark: false });
        await h.hold(page, 1500);
        await h.point(page, tileButton(page, REUSED), { s: 0, mark: false });
        await h.hold(page, 1800);
        // s:1: "Whatever you catalog today saves time on every production..."
        await h.point(page, groupHeader(page, "Hats"), { s: 1 });
        await h.hold(page, 1500);
        await h.point(page, tileButton(page, "Top hat"), { s: 1, mark: false });
        await h.hold(page, 1500);
        // s:2: "In the next video, we will share a production with another
        // company, and look at plans." Point only: no Clerk popover.
        // Cursor moves alone stay under freezedetect's noise floor, so s2
        // zooms the full-width header (its center is empty space, so the
        // parked cursor covers no text) to break the static tail.
        const productionsLink = page.locator("header").getByRole("link", { name: /^Productions\s*$/ });
        await h.point(page, productionsLink, { s: 2 });
        await h.hold(page, 600);
        await h.zoom(page, page.locator("header").first(), { s: 2, holdMs: 2600 });
        // s:3: "Thanks so much for watching."
        await h.point(page, page.locator("main").getByRole("button", { name: "+ Add item", exact: true }), { s: 3 });
        await h.hold(page, 700);
        await h.point(page, page.locator("main").getByRole("textbox", { name: "Search inventory" }), { s: 3, mark: false });
        await h.hold(page, 900);
      },
    },
  ],
};
