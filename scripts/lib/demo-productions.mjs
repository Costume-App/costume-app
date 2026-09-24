// Off-camera state helpers shared by walkthrough preps. Every call goes
// through the app's API as the demo user (lib/demo-api.mjs asserts that),
// and touches only productions titled here. "Twelfth Night" is the show
// video 1 creates on camera and video 2 fills with roles and cast.
import { MEASUREMENT_UNITS, showDate } from "./demo-fixtures.mjs";

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

// Numeric measurement keys carry a unit from MEASUREMENT_UNITS; these three
// are free text instead (garment sizes, not body measurements) and carry no
// unit.
const TEXT_KEYS = new Set(["shirt_size", "pant_size", "shoe_size"]);

function measurementBody(key, value) {
  if (typeof value === "string") {
    if (!TEXT_KEYS.has(key)) throw new Error(`resetTwelfthNight: unknown measurement key "${key}"`);
    return { measurementKey: key, valueText: value, unit: "" };
  }
  if (!(key in MEASUREMENT_UNITS)) throw new Error(`resetTwelfthNight: unknown measurement key "${key}"`);
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

export async function resetTwelfthNight(api, { roles = [], ensembleRoles = [], castings = [], measurements = {} } = {}) {
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
      const { performer } = await api.post(`${base}/castings`, {
        castId, roleId, ...who, ...(c.assignment ? { assignment: c.assignment } : {}),
      });
      if (!c.reuse) performerIds.set(c.name, performer.id);
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
  return { production, roleIds, performerIds };
}
