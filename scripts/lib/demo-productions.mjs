// Off-camera state helpers shared by walkthrough preps. Every call goes
// through the app's API as the demo user (lib/demo-api.mjs asserts that),
// and touches only productions titled here. "Twelfth Night" is the show
// video 1 creates on camera and video 2 fills with roles and cast.
import { showDate } from "./demo-fixtures.mjs";

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

export async function resetTwelfthNight(api, { roles = [], ensembleRoles = [], castings = [] } = {}) {
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
  return { production, roleIds, performerIds };
}
