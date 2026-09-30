// Off-camera state helpers shared by walkthrough preps. Every call goes
// through the app's API as the demo user (lib/demo-api.mjs asserts that),
// and touches only productions titled here, plus the org-wide makers and
// House Inventory items named below, with one exception: resetReceiver also
// reaches the restricted billing module in receiver-billing.mjs, which talks
// to Supabase directly rather than through the app's API. "Twelfth Night" is
// the show video 1 creates on camera and video 2 fills with roles and cast.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MEASUREMENT_UNITS, showDate } from "./demo-fixtures.mjs";
import { ROSA_FORM } from "./demo-measurement-form.mjs";
import { resetReceiverBilling as defaultResetReceiverBilling } from "./receiver-billing.mjs";

export const TWELFTH = "Twelfth Night";
// What getting-started's "create-production" types on camera, so a state a
// viewer never watched get created still matches it.
export const TWELFTH_SHOWING = Object.freeze({ offsetDays: 10, time: "19:30", label: "Opening Night" });
// Deterministic stand-in for the AI suggestions (roles-and-cast "ai-roles"
// films the real call, whose output varies). Later sections start from
// this list so their retakes never depend on a model's answer.
export const TWELFTH_ROLES = Object.freeze([
  "Viola", "Sebastian", "Orsino", "Olivia", "Malvolio", "Maria",
  "Sir Toby Belch", "Sir Andrew Aguecheek", "Feste", "Antonio",
]);

// Video 2 ("Roles and Cast") adds this role and this ensemble by hand, then
// casts a handful of performers across its later sections. Exported so
// video 2's own earlier-section states and video 3's starting state share
// one definition and cannot drift apart.
export const TWELFTH_EXTRA_ROLE = "Sea Captain";
export const TWELFTH_ENSEMBLE = "Musicians";
export const TWELFTH_ROLES_AFTER_ADD = Object.freeze({
  roles: [...TWELFTH_ROLES, TWELFTH_EXTRA_ROLE],
  ensembleRoles: [TWELFTH_ENSEMBLE],
});
export const TWELFTH_CAST_AFTER_CASTING = Object.freeze([
  { role: "Viola", name: "Maya Brooks" },
  { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
]);
export const TWELFTH_CAST_AFTER_ENSEMBLE = Object.freeze([
  ...TWELFTH_CAST_AFTER_CASTING,
  { role: TWELFTH_ENSEMBLE, name: "Theo Park" },
  { role: TWELFTH_ENSEMBLE, name: "Rosa Diaz" },
]);
// The deliberate duplicate: two separate performer rows named Jordan Lee.
export const TWELFTH_CAST_WITH_DUPLICATE = Object.freeze([
  ...TWELFTH_CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: TWELFTH_ENSEMBLE, name: "Jordan Lee" },
]);
// What the viewer is left with after "Combine selected": one Jordan Lee in
// both roles. Video 2's final state and video 3's starting state.
const CAST_AFTER_COMBINE = Object.freeze([
  ...TWELFTH_CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: TWELFTH_ENSEMBLE, name: "Jordan Lee", reuse: true },
]);
export const TWELFTH_CAST_STATE = Object.freeze({
  roles: TWELFTH_ROLES_AFTER_ADD.roles,
  ensembleRoles: TWELFTH_ROLES_AFTER_ADD.ensembleRoles,
  castings: CAST_AFTER_COMBINE,
});

// Video 3 ("Measurements") leaves the cast above fully measured. Moved here
// (from walkthroughs/measurements.mjs) so video 4's preps can build on it
// too; measurements.mjs now imports this state and the pieces it is made
// from instead of defining them.

// What "enter-measurements"/"handwriting" (video 3) leave for Maya Brooks:
// Height 5 ft 6 in (saved as 66 inches), Chest / bust 34, Shirt size M,
// Waist "26 1/2" (saved as 26.5).
export const MAYA_AFTER_HANDWRITING = Object.freeze({ height: 66, chest: 34, shirt_size: "M", waist: 26.5 });

// Jordan Lee was "measured earlier", every one of the 20 fields, so the
// switcher list shows a check beside him and "Skip anyone fully measured"
// has someone to skip. Numbers for every numeric key, strings for sizes.
const JORDAN_VALUES = Object.freeze({
  height: 70, weight: 165, chest: 40, waist: 32, hips: 38, shoulder: 18,
  sleeve: 25, back_length: 18, inseam: 32, outseam: 42, neck: 15.5,
  arm_circumference: 12, wrist: 7, thigh: 22, knee: 15, head: 23, nape_to_floor: 60,
});
export const JORDAN_ALL = Object.freeze({ ...JORDAN_VALUES, shirt_size: "L", pant_size: "32/32", shoe_size: "Men's 10" });
if (Object.keys(JORDAN_VALUES).length !== Object.keys(MEASUREMENT_UNITS).length) {
  throw new Error("demo-productions: Jordan Lee must carry every numeric measurement key");
}

/** "26 1/2" to 26.5, "22.5" to 22.5. ROSA_FORM stores values the way the
 * form is written; the DB stores numbers. Throws on anything else rather
 * than guessing. */
function formNumber(raw) {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(raw);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  if (/^\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
  throw new Error(`demo-productions: cannot read ROSA_FORM value "${raw}"`);
}
// What "import-forms" (video 3) imports on camera, taken from ROSA_FORM
// (never retyped).
export const ROSA_IMPORTED = Object.freeze({
  ...Object.fromEntries(ROSA_FORM.fields.map((f) => [f.key, formNumber(f.value)])),
  shirt_size: ROSA_FORM.sizes.shirt,
  pant_size: ROSA_FORM.sizes.pant,
  shoe_size: ROSA_FORM.sizes.shoe,
});

// Video 3's own end state ("wrap-up"): video 2's cast plus every measurement
// the viewer saw typed or imported. Video 4's preps start here.
export const TWELFTH_MEASURED_STATE = Object.freeze({
  ...TWELFTH_CAST_STATE,
  measurements: Object.freeze({
    "Maya Brooks": MAYA_AFTER_HANDWRITING,
    "Jordan Lee": JORDAN_ALL,
    [ROSA_FORM.name]: ROSA_IMPORTED,
  }),
});

// Video 4 ("Costume Creations") builds Viola's costumes up to a finished,
// inventoried Doublet. Moved here (from walkthroughs/costume-creations.mjs)
// so video 5's House Inventory preps can start from that same finished
// production instead of retyping it; costume-creations.mjs now imports this
// state and the pieces its own earlier sections are built from instead of
// defining them.

// The one design photo the demo ever uploads. Exported: "photos-notes"
// attaches this same file live, through the browser's file chooser, and
// VIOLA_DESIGNS_WITH_PHOTO below records it as already attached for every
// later section, so both point at one file.
export const SKETCH = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../fixtures/training/costume-sketch-viola-doublet.jpg",
);

// What "photos-notes" types on camera into the Doublet's notes.
export const DOUBLET_NOTES = "Green wool, brass buttons, fitted to the waist.";
// What "creations-page" types on camera for Maya's Doublet.
export const DOUBLET_FABRIC = Object.freeze({ name: "Wool suiting", color: "Deep green", widthIn: 60, unitCost: 18, supplier: "Mill End Textiles" });
// What "skirt-yardage" sets on camera for Rosa's skirt: Full circle, Width
// 60, Length typed as 36 (shorter than her 40 inch outseam below).
export const SKIRT_WIDTH = "60";
export const SKIRT_LENGTH = "36";

// Video 3 imported twelve values for Rosa Diaz and no outseam. The skirt
// section's narration says the Length "starts from the performer's own
// outseam", and the Length hint only says so when an outseam exists (with
// none it reads "No outseam recorded yet"), so Rosa gets one here, off
// camera: 40 inches, consistent with her 30 inch inseam and 58 inch nape to
// floor. Nothing in video 4 lists her measurement count.
const ROSA_OUTSEAM = 40;
export const BASE_STATE = Object.freeze({
  ...TWELFTH_MEASURED_STATE,
  measurements: Object.freeze({
    ...TWELFTH_MEASURED_STATE.measurements,
    [ROSA_FORM.name]: Object.freeze({ ...TWELFTH_MEASURED_STATE.measurements[ROSA_FORM.name], outseam: ROSA_OUTSEAM }),
  }),
});
export const withCostumes = (designs, pieces) => ({ ...BASE_STATE, designs, pieces });

// Designs, section by section. A design is one costume piece on a role.
// "creations-page" onward: pieces on the other roles, so the To make list is
// not thin. Rosa Diaz wears the Musicians' skirt, the others its tunic; the
// pieces nobody wears are marked "On hand" so they leave the To make list.
export const VIOLA_DESIGNS_WITH_PHOTO = Object.freeze([
  Object.freeze({ role: "Viola", name: "Doublet", notes: DOUBLET_NOTES, photos: [SKETCH] }),
  Object.freeze({ role: "Viola", name: "Breeches" }),
  Object.freeze({ role: "Viola", name: "Boots" }),
]);
export const ALL_DESIGNS = Object.freeze([
  ...VIOLA_DESIGNS_WITH_PHOTO,
  Object.freeze({ role: "Olivia", name: "Gown" }),
  Object.freeze({ role: "Sebastian", name: "Doublet" }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, name: "Skirt" }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, name: "Tunic" }),
]);

export const BOOTS_PURCHASED = Object.freeze({ role: "Viola", design: "Boots", performer: "Maya Brooks", source: "purchase", purchasePrice: 45 });
export const ENSEMBLE_SPLIT = Object.freeze([
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Skirt", performer: "Theo Park", source: "on_hand" }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Skirt", performer: "Jordan Lee", source: "on_hand" }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Tunic", performer: ROSA_FORM.name, source: "on_hand" }),
]);
// What the calculator shows on camera for Rosa's full circle skirt: waist
// 26.5, length 36, 60 inch fabric (read off the live page; "skirt-yardage"
// throws if the take shows anything else).
export const ROSA_SKIRT_YARDS = "5.25";
export const ROSA_SKIRT = Object.freeze({ type: "full_circle", lengthIn: Number(SKIRT_LENGTH) });

// Fixed stand-ins for the live estimate, plus fabric for every piece so the
// Shopping tab groups by type with a cost on each line. The viewer saw "some
// numbers" filled in; the narration never reads them.
export const ESTIMATED = Object.freeze([
  Object.freeze({ role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "make", maker: "Priya Shah", fabric: Object.freeze({ ...DOUBLET_FABRIC, yardage: 2.5 }) }),
  Object.freeze({ role: "Viola", design: "Breeches", performer: "Maya Brooks", source: "make", maker: "Sam Ortiz", fabric: Object.freeze({ name: "Wool suiting", color: "Charcoal", widthIn: 60, yardage: 1.8, unitCost: 18, supplier: "Mill End Textiles" }) }),
  BOOTS_PURCHASED,
  ...ENSEMBLE_SPLIT,
  Object.freeze({ role: "Olivia", design: "Gown", performer: "Maya Brooks", source: "make", fabric: Object.freeze({ name: "Silk taffeta", color: "Ivory", widthIn: 54, yardage: 6.5, unitCost: 24, supplier: "Fabric Row" }) }),
  Object.freeze({ role: "Sebastian", design: "Doublet", performer: "Jordan Lee", source: "make", fabric: Object.freeze({ name: "Wool suiting", color: "Deep green", widthIn: 60, yardage: 2.8, unitCost: 18, supplier: "Mill End Textiles" }) }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Skirt", performer: ROSA_FORM.name, source: "make", fabric: Object.freeze({ name: "Cotton broadcloth", color: "Burgundy", widthIn: Number(SKIRT_WIDTH), yardage: Number(ROSA_SKIRT_YARDS), unitCost: 9, supplier: "Fabric Row" }), skirt: ROSA_SKIRT }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Tunic", performer: "Theo Park", source: "make", fabric: Object.freeze({ name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.2, unitCost: 12, supplier: "Fabric Row" }) }),
  Object.freeze({ role: TWELFTH_ENSEMBLE, design: "Tunic", performer: "Jordan Lee", source: "make", fabric: Object.freeze({ name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.4, unitCost: 12, supplier: "Fabric Row" }) }),
]);

// What "made-to-inventory" does on camera: Viola's Doublet ticked Made and
// logged to House Inventory with Location "Rack B". Video 5's preps read
// this too, so a viewer's House Inventory item comes from the same doublet
// they watched get made in video 4.
export const TWELFTH_DOUBLET_TO_INVENTORY = Object.freeze({ role: "Viola", design: "Doublet", performer: "Maya Brooks", location: "Rack B" });

// Video 4's own end state ("wrap-up"): every design and piece above, with
// Viola's Doublet marked Made.
export const TWELFTH_COSTUMED_STATE = Object.freeze(withCostumes(
  ALL_DESIGNS,
  ESTIMATED.map((p) => (p.role === "Viola" && p.design === "Doublet" ? { ...p, made: true } : p)),
));

// Video 4 ("Costume Creations") touches two org-wide things besides the
// production itself: makers and House Inventory items. Both are cleaned up
// by exact name in resetDemoCostumeOrg so repeated takes never pile up
// duplicates or leave a stale color behind.

// Mirrors the palette tokens in src/lib/cast-colors.ts (scripts are plain
// .mjs and cannot import a .ts module). Priya Shah is filmed with the pink
// dot, Sam Ortiz with the orange one.
export const DEMO_MAKERS = Object.freeze([
  Object.freeze({ name: "Priya Shah", color: "pink" }),
  Object.freeze({ name: "Sam Ortiz", color: "orange" }),
]);

// Resolves a House Inventory photo the same way costume-creations.mjs
// resolves SKETCH: relative to this module's own file, never the caller's.
function inventoryPhoto(fileName) {
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "../fixtures/training/inventory", fileName);
}

// Video 5's House Inventory items, rebuilt every take: what "browse-inventory"
// (and later sections) sees already sitting in the list. Task 3 generates the
// photo JPEGs these paths point to; task 4 may adjust these names, and the
// generator changes with this list so the two never drift apart.
export const DEMO_INVENTORY_ITEMS = Object.freeze([
  Object.freeze({ name: "Top hat", category: "Hats", size: "7 1/4", quantity: 2, location: "Shelf 3", photo: inventoryPhoto("top-hat.jpg") }),
  Object.freeze({ name: "Tricorn hat", category: "Hats", quantity: 4, location: "Shelf 3", photo: inventoryPhoto("tricorn-hat.jpg") }),
  Object.freeze({ name: "Pirate coat", category: "Coats & capes", size: "L", quantity: 3, location: "Rack A", photo: inventoryPhoto("pirate-coat.jpg") }),
  Object.freeze({ name: "Ball gown", category: "Dresses", size: "8", quantity: 1, location: "Rack C", photo: inventoryPhoto("ball-gown.jpg") }),
  Object.freeze({ name: "Lace fan", category: "Accessories", quantity: 6, location: "Bin 2", photo: inventoryPhoto("lace-fan.jpg") }),
  Object.freeze({ name: "Parasol", category: "Accessories", quantity: 2, location: "Bin 2", photo: inventoryPhoto("parasol.jpg") }),
]);

// What "add-item" types on camera: a new House Inventory item added live,
// on top of the DEMO_INVENTORY_ITEMS already sitting there.
export const DEMO_INVENTORY_CAMERA_ITEM = Object.freeze({
  name: "Velvet cloak", category: "Coats & capes", size: "M", quantity: 2, location: "Rack A",
  photo: inventoryPhoto("velvet-cloak.jpg"),
});

// Every House Inventory item name video 4 or video 5 can create: the Doublet
// video 4 logs from a finished piece (addPieceToInventory names it from the
// design's own name, not the performer's:
// src/lib/data/piece-to-inventory.ts:61, `name: design.name`), plus video 5's
// own seeded items and the one it adds on camera. A later task confirms the
// Doublet name against the live page before recording and amends this list
// if the live name differs.
export const DEMO_INVENTORY_NAMES = Object.freeze([
  "Doublet",
  ...DEMO_INVENTORY_ITEMS.map((item) => item.name),
  DEMO_INVENTORY_CAMERA_ITEM.name,
]);

// Mirrors the source tokens in src/lib/costume-sources.ts (scripts are plain
// .mjs and cannot import a .ts module).
const COSTUME_SOURCES = new Set(["make", "on_hand", "shared", "purchase"]);

/** Deletes every House Inventory item named in DEMO_INVENTORY_NAMES (never
 * anything else), then makes each DEMO_MAKERS entry exist with its listed
 * color: PATCHes the color when a maker of that exact name already exists
 * and differs, POSTs a new maker when none exists, and sends nothing when
 * the existing maker already matches. Never touches an unrelated maker or
 * inventory item. Returns a Map from maker name to maker id. */
export async function resetDemoCostumeOrg(api) {
  const { items } = await api.get("/api/inventory");
  const doomed = items.filter((item) => DEMO_INVENTORY_NAMES.includes(item.name));
  for (const item of doomed) await api.del(`/api/inventory/${item.id}`);
  const { makers } = await api.get("/api/makers");
  const makerIds = new Map();
  for (const wanted of DEMO_MAKERS) {
    const existing = makers.find((m) => m.name === wanted.name);
    if (!existing) {
      const { maker } = await api.post("/api/makers", { name: wanted.name, color: wanted.color });
      makerIds.set(wanted.name, maker.id);
      continue;
    }
    makerIds.set(wanted.name, existing.id);
    if (existing.color !== wanted.color) {
      await api.patch(`/api/makers/${existing.id}`, { color: wanted.color });
    }
  }
  return makerIds;
}

/** Seeds House Inventory for video 5. Assumes resetDemoCostumeOrg already
 * ran (it deletes every item named in DEMO_INVENTORY_NAMES, so this always
 * starts from an empty list of these names and a bare POST cannot collide).
 * Validates every item before sending anything: its name must be one this
 * training video ever shows, no two items in this call may share a name,
 * and its photo file must exist. `fileExists` is injectable so a test never
 * depends on the real fixture JPEGs a later task generates. Returns a Map
 * from item name to the created item's id. */
export async function resetDemoInventory(api, items = DEMO_INVENTORY_ITEMS, { fileExists = existsSync } = {}) {
  const seen = new Set();
  for (const item of items) {
    if (!DEMO_INVENTORY_NAMES.includes(item.name)) {
      throw new Error(`resetDemoInventory: "${item.name}" is not in DEMO_INVENTORY_NAMES`);
    }
    if (seen.has(item.name)) throw new Error(`resetDemoInventory: "${item.name}" repeats`);
    seen.add(item.name);
  }
  for (const item of items) {
    if (!fileExists(item.photo)) throw new Error(`resetDemoInventory: photo missing for "${item.name}": ${item.photo}`);
  }
  const itemIds = new Map();
  for (const item of items) {
    const body = { name: item.name, category: item.category, quantity: item.quantity, location: item.location };
    if (item.size !== undefined) body.size = item.size;
    if (item.notes !== undefined) body.notes = item.notes;
    const { item: created } = await api.post("/api/inventory", body);
    itemIds.set(item.name, created.id);
    await api.upload(`/api/inventory/${created.id}/images`, item.photo);
  }
  return itemIds;
}

/** Guards a take against a manual add slipping into House Inventory between
 * takes: throws naming every item whose name is not in DEMO_INVENTORY_NAMES.
 * Deletes nothing; cleanup is resetDemoCostumeOrg's job, by exact name. */
export async function assertDemoInventoryOnly(api) {
  const { items } = await api.get("/api/inventory");
  const strays = items.filter((item) => !DEMO_INVENTORY_NAMES.includes(item.name)).map((item) => item.name);
  if (strays.length > 0) {
    throw new Error(`assertDemoInventoryOnly: unexpected House Inventory item(s): ${strays.join(", ")}`);
  }
}

// Numeric measurement keys carry a unit from MEASUREMENT_UNITS; these three
// are free text instead (garment sizes, not body measurements) and carry no
// unit.
const TEXT_KEYS = new Set(["shirt_size", "pant_size", "shoe_size"]);

function measurementBody(key, value) {
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string") throw new Error(`resetTwelfthNight: measurement "${key}" needs text`);
    return { measurementKey: key, valueText: value, unit: "" };
  }
  // Object.hasOwn, not `in`: `in` also accepts inherited keys like "toString".
  if (!Object.hasOwn(MEASUREMENT_UNITS, key)) throw new Error(`resetTwelfthNight: unknown measurement key "${key}"`);
  if (typeof value !== "number") throw new Error(`resetTwelfthNight: measurement "${key}" needs a number`);
  return { measurementKey: key, valueNumeric: value, unit: MEASUREMENT_UNITS[key] };
}

export async function deleteByTitle(api, title) {
  const { productions } = await api.get("/api/productions");
  const doomed = productions.filter((p) => p.title === title);
  for (const p of doomed) await api.del(`/api/productions/${p.id}`);
  return doomed.length;
}

async function createTwelfthNight(api) {
  const { production } = await api.post("/api/productions", {
    title: TWELFTH,
    showings: [{ date: showDate(TWELFTH_SHOWING.offsetDays), time: TWELFTH_SHOWING.time, label: TWELFTH_SHOWING.label }],
  });
  return production;
}

export async function ensureTwelfthNight(api) {
  const { productions } = await api.get("/api/productions");
  return productions.find((p) => p.title === TWELFTH) ?? (await createTwelfthNight(api));
}

// Joins a role with a name it scopes (a design or a casting), since either
// can repeat across roles: video 4 gives both Viola and Sebastian a design
// named "Doublet".
const scopedKey = (role, name) => `${role}\u0000${name}`;

export async function resetTwelfthNight(
  api,
  { roles = [], ensembleRoles = [], castings = [], measurements = {}, designs = [], pieces = [] } = {},
  { makerIds = new Map(), inventoryIds = new Map() } = {},
) {
  await deleteByTitle(api, TWELFTH);
  const production = await createTwelfthNight(api);
  const base = `/api/productions/${production.id}`;
  const roleIds = new Map();
  if (roles.length > 0) {
    const { roles: made } = await api.post(`${base}/roles`, { names: [...roles] });
    for (const r of made) roleIds.set(r.name, r.id);
  }
  for (const name of ensembleRoles) {
    const { role } = await api.post(`${base}/roles`, { name, isEnsemble: true });
    roleIds.set(role.name, role.id);
  }
  const performerIds = new Map();
  const castingIds = new Map();
  if (castings.length > 0) {
    const { casts } = await api.get(`${base}/casts`);
    const castId = casts[0].id; // the default "Main Cast"
    for (const c of castings) {
      const roleId = roleIds.get(c.role);
      if (!roleId) throw new Error(`resetTwelfthNight: unknown role "${c.role}"`);
      let who;
      if (c.reuse) {
        const performerId = performerIds.get(c.name);
        if (!performerId) throw new Error(`resetTwelfthNight: no performer "${c.name}" to reuse`);
        who = { performerId };
      } else {
        who = { name: c.name };
      }
      const { performer, casting } = await api.post(`${base}/castings`, {
        castId, roleId, ...who, ...(c.assignment ? { assignment: c.assignment } : {}),
      });
      if (!c.reuse) performerIds.set(c.name, performer.id);
      castingIds.set(scopedKey(c.role, c.name), casting.id);
    }
  }
  // Validate every entry (known performer name created above, known key)
  // and build every PUT body before sending the first PUT.
  const puts = [];
  for (const [name, values] of Object.entries(measurements)) {
    const performerId = performerIds.get(name);
    if (!performerId) throw new Error(`resetTwelfthNight: no performer "${name}" to measure`);
    for (const [key, value] of Object.entries(values)) {
      puts.push([performerId, measurementBody(key, value)]);
    }
  }
  for (const [performerId, body] of puts) {
    await api.put(`/api/performers/${performerId}/measurements`, body);
  }

  // Designs and pieces: validate every entry (known role, design, performer,
  // maker, source; a piece's performer must be cast in that piece's role)
  // before the first design or piece write. A design given as
  // { role, fromInventory: "<item name>" } instead of { role, name } is
  // keyed by the item's own name, since POST /designs names an
  // inventory-linked design from the item and no separate name is sent.
  const designKeys = new Set();
  for (const d of designs) {
    if (!roleIds.has(d.role)) throw new Error(`resetTwelfthNight: unknown role "${d.role}"`);
    if (d.fromInventory !== undefined) {
      if (!inventoryIds.has(d.fromInventory)) {
        throw new Error(`resetTwelfthNight: unknown inventory item "${d.fromInventory}" for fromInventory`);
      }
      designKeys.add(scopedKey(d.role, d.fromInventory));
    } else {
      designKeys.add(scopedKey(d.role, d.name));
    }
  }
  const pieceBuilds = [];
  for (const p of pieces) {
    if (!roleIds.has(p.role)) throw new Error(`resetTwelfthNight: unknown role "${p.role}"`);
    if (!designKeys.has(scopedKey(p.role, p.design))) {
      throw new Error(`resetTwelfthNight: unknown design "${p.design}" for role "${p.role}"`);
    }
    if (!performerIds.has(p.performer)) throw new Error(`resetTwelfthNight: unknown performer "${p.performer}"`);
    const castingId = castingIds.get(scopedKey(p.role, p.performer));
    if (!castingId) throw new Error(`resetTwelfthNight: performer "${p.performer}" not cast in role "${p.role}"`);
    if (typeof p.source !== "string" || !COSTUME_SOURCES.has(p.source)) {
      throw new Error(`resetTwelfthNight: unknown source "${p.source}"`);
    }
    let makerId;
    if (p.maker !== undefined) {
      makerId = makerIds.get(p.maker);
      if (!makerId) throw new Error(`resetTwelfthNight: unknown maker "${p.maker}"`);
    }
    pieceBuilds.push({ p, castingId, makerId });
  }

  const designIds = new Map();
  for (const d of designs) {
    const roleId = roleIds.get(d.role);
    let design;
    if (d.fromInventory !== undefined) {
      const inventoryItemId = inventoryIds.get(d.fromInventory);
      ({ design } = await api.post(`${base}/designs`, { roleId, inventoryItemId }));
      designIds.set(scopedKey(d.role, d.fromInventory), design.id);
    } else {
      ({ design } = await api.post(`${base}/designs`, { roleId, name: d.name }));
      designIds.set(scopedKey(d.role, d.name), design.id);
    }
    if (d.notes) await api.patch(`${base}/designs/${design.id}`, { notes: d.notes });
    for (const photoPath of d.photos ?? []) {
      await api.upload(`${base}/designs/${design.id}/images`, photoPath);
    }
  }

  for (const { p, castingId, makerId } of pieceBuilds) {
    const designId = designIds.get(scopedKey(p.role, p.design));
    const body = { designId, castingId, source: p.source };
    if (makerId !== undefined) body.makerId = makerId;
    if (p.made !== undefined) body.made = p.made;
    if (p.purchasePrice !== undefined) body.purchasePrice = p.purchasePrice;
    if (p.fabric) {
      const f = p.fabric;
      if (f.name !== undefined) body.fabricType = f.name;
      if (f.color !== undefined) body.fabricColor = f.color;
      if (f.widthIn !== undefined) body.fabricWidth = String(f.widthIn);
      if (f.yardage !== undefined) body.fabricYardage = f.yardage;
      if (f.unitCost !== undefined) body.fabricUnitCost = f.unitCost;
      if (f.supplier !== undefined) body.fabricSupplier = f.supplier;
    }
    if (p.skirt) {
      body.skirtConstruction = p.skirt.type;
      if (p.skirt.fullness !== undefined) body.skirtFullness = p.skirt.fullness;
      if (p.skirt.lengthIn !== undefined) body.skirtLengthIn = p.skirt.lengthIn;
    }
    await api.put(`${base}/pieces`, body);
  }

  return { production, roleIds, performerIds, designIds, castingIds };
}

// Video 6 ("Sharing and Billing") preps two identities: the sender (the
// existing demo org, replaying video 4's finished Twelfth Night) and the
// receiver (a second demo org that starts with nothing and needs its own
// productions AND its own billing rows reset). The billing reset is a
// network call against the one shared Supabase database, so resetReceiver
// takes it as an injectable parameter (default: the real one in
// receiver-billing.mjs) and tests never touch the network.

/** Rebuilds the sender's Twelfth Night to video 4's finished, costumed
 * state, the state video 6 shares from. Returns the new production's id. */
export async function resetSenderForSharing(api) {
  const makerIds = await resetDemoCostumeOrg(api);
  const { production } = await resetTwelfthNight(api, TWELFTH_COSTUMED_STATE, { makerIds });
  return production.id;
}

/** Creates a fresh, no-email share for the given production and returns its
 * token. A new token every prep run, since resetSenderForSharing recreates
 * the production and its old shares cascade away with it. */
export async function createTwelfthShare(api, productionId) {
  const { token } = await api.post(`/api/productions/${productionId}/shares`, {});
  return token;
}

/** Guards a whole recording run against a live share token surviving into
 * the delivered video: lists every production in the sender org, then every
 * share on each, through the app API only (never Supabase directly), and
 * throws naming how many are still "pending" (never the token itself, which
 * would make the error message a usable link). A prep that runs
 * resetSenderForSharing after this point recreates Twelfth Night and its old
 * shares cascade away, so a run that ends here clean stays clean until the
 * next one starts. Deletes nothing; a pending share found here is a bug to
 * fix, not cleanup to perform silently. */
export async function assertNoPendingDemoShares(api) {
  const { productions } = await api.get("/api/productions");
  let pendingCount = 0;
  for (const p of productions) {
    const { shares } = await api.get(`/api/productions/${p.id}/shares`);
    pendingCount += shares.filter((s) => s.status === "pending").length;
  }
  if (pendingCount > 0) {
    throw new Error(`assertNoPendingDemoShares: ${pendingCount} pending share(s) survive in the demo org`);
  }
}

/** Guards a take against a stray production sitting in the receiver org
 * (someone signed in by hand and added one): throws naming every production
 * whose title is not TWELFTH. Deletes nothing; cleanup is resetReceiver's
 * job, by exact title. */
export async function assertReceiverProductionsOnly(receiverApi) {
  const { productions } = await receiverApi.get("/api/productions");
  const strays = productions.filter((p) => p.title !== TWELFTH).map((p) => p.title);
  if (strays.length > 0) {
    throw new Error(`assertReceiverProductionsOnly: unexpected production(s): ${strays.join(", ")}`);
  }
}

/** Resets the receiver org for a take: asserts it holds nothing unexpected,
 * deletes every Twelfth Night copy it holds, THEN resets its billing rows.
 * Deleting the copy first matters: a copied production's unlock comes back
 * unbound when the production is deleted (production_purchases.production_id
 * ... on delete set null, 0028_billing.sql), so resetting billing first
 * would leave that returned unlock behind. */
export async function resetReceiver(receiverApi, { demo, grantUnlock = false, resetReceiverBilling = defaultResetReceiverBilling } = {}) {
  await assertReceiverProductionsOnly(receiverApi);
  await deleteByTitle(receiverApi, TWELFTH);
  await resetReceiverBilling({ demo, grantUnlock });
}

/** Full video 6 prep: resets the sender's Twelfth Night, shares it, then
 * resets the receiver so the take starts from an unused share link and a
 * clean receiver org. Returns the token to open and the shared
 * production's id. */
export async function prepShareForReceiver(senderApi, receiverApi, { demo, grantUnlock = false } = {}) {
  const productionId = await resetSenderForSharing(senderApi);
  const token = await createTwelfthShare(senderApi, productionId);
  await resetReceiver(receiverApi, { demo, grantUnlock });
  return { token, productionId };
}
