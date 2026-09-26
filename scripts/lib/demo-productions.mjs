// Off-camera state helpers shared by walkthrough preps. Every call goes
// through the app's API as the demo user (lib/demo-api.mjs asserts that),
// and touches only productions titled here, plus the org-wide makers and
// House Inventory items named below. "Twelfth Night" is the show video 1
// creates on camera and video 2 fills with roles and cast.
import { MEASUREMENT_UNITS, showDate } from "./demo-fixtures.mjs";
import { ROSA_FORM } from "./demo-measurement-form.mjs";

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

// Every House Inventory item name video 4 can create by logging a finished
// piece to inventory. addPieceToInventory names the new item from the
// design's own name, not the performer's (src/lib/data/piece-to-inventory.ts:61,
// `name: design.name`). A later task confirms this against the live page
// before recording and amends this list if the live name differs.
export const DEMO_INVENTORY_NAMES = Object.freeze(["Doublet"]);

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
  { makerIds = new Map() } = {},
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
  // before the first design or piece write.
  const designKeys = new Set();
  for (const d of designs) {
    if (!roleIds.has(d.role)) throw new Error(`resetTwelfthNight: unknown role "${d.role}"`);
    designKeys.add(scopedKey(d.role, d.name));
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
    const { design } = await api.post(`${base}/designs`, { roleId, name: d.name });
    designIds.set(scopedKey(d.role, d.name), design.id);
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
