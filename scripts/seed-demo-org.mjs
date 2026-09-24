// Rebuilds the training-video demo org's fixtures through the app's API.
//
//   npm run build && npm start      (separate terminal, port 6100)
//   node scripts/seed-demo-org.mjs
//
// Deletes EVERY production in the demo org, then recreates DEMO_PRODUCTIONS.
// Safe only because the org is dedicated and every call is asserted to run
// as the demo user in the demo org (see lib/demo-api.mjs).
import { chromium } from "playwright";
import { loadDemoOrg, loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";
import { readBuildId, assertServerServingBuild } from "./lib/build-check.mjs";
import { withDemoApi } from "./lib/demo-api.mjs";
import { DEMO_PRODUCTIONS, MEASUREMENT_UNITS, showDate, validateFixtures } from "./lib/demo-fixtures.mjs";

loadEnvLocalIntoProcess();
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:6100";
// Same guard as record-training-video.mjs: the seeder writes through the
// app's own API against BASE, so BASE must be this repo's production build,
// never `next dev` and never a stale `next start`.
await assertServerServingBuild(BASE, readBuildId());
const demo = loadDemoOrg();
validateFixtures(DEMO_PRODUCTIONS);

const browser = await chromium.launch();
try {
  await withDemoApi(browser, BASE, demo, async (api) => {
    const { productions: existing } = await api.get("/api/productions");
    for (const p of existing) await api.del(`/api/productions/${p.id}`);
    console.log(`removed ${existing.length} production(s)`);

    for (const fx of DEMO_PRODUCTIONS) {
      const { production } = await api.post("/api/productions", {
        title: fx.title,
        notes: fx.notes,
        showings: fx.showings.map((s) => ({ date: showDate(s.offsetDays), time: s.time, label: s.label })),
      });
      const id = production.id;

      const plain = fx.roles.filter((r) => !r.isEnsemble).map((r) => r.name);
      const { roles: made } = await api.post(`/api/productions/${id}/roles`, { names: plain });
      const roleIds = new Map(made.map((r) => [r.name, r.id]));
      for (const r of fx.roles.filter((x) => x.isEnsemble)) {
        const { role } = await api.post(`/api/productions/${id}/roles`, { name: r.name, isEnsemble: true });
        roleIds.set(role.name, role.id);
      }

      const casts = await api.get(`/api/productions/${id}/casts`);
      const castId = casts.casts[0].id; // the default "Main Cast"

      const performerIds = new Map();
      for (const c of fx.cast) {
        const result = await api.post(`/api/productions/${id}/castings`, {
          castId,
          roleId: roleIds.get(c.role),
          name: c.performer, // assignment omitted: the route picks primary or ensemble from the role
        });
        // Each casting here is a distinct performer within this production; no
        // fixture casts the same name twice in one production, so there is
        // nothing to reuse. A name shared across the two productions (Marcus,
        // Sam, Lucia, Nell) is a different performer row in each, since
        // performers belong to a production, not to the org.
        performerIds.set(c.performer, result.performer.id);
      }

      for (const [who, values] of Object.entries(fx.measurements)) {
        const pid = performerIds.get(who);
        if (!pid) throw new Error(`${fx.key}: no performer id for ${who}`);
        for (const [key, value] of Object.entries(values)) {
          await api.put(`/api/performers/${pid}/measurements`, { measurementKey: key, valueNumeric: value, unit: MEASUREMENT_UNITS[key] });
        }
      }

      if (!fx.active) await api.patch(`/api/productions/${id}`, { isActive: false });
      console.log(`seeded ${fx.title}: ${fx.roles.length} roles, ${fx.cast.length} castings, ${Object.keys(fx.measurements).length} measured`);
    }

    const { productions: after } = await api.get("/api/productions");
    if (after.length !== DEMO_PRODUCTIONS.length) {
      throw new Error(`expected ${DEMO_PRODUCTIONS.length} productions after seeding, found ${after.length}`);
    }
    console.log("seed OK");
  });
} finally {
  await browser.close();
}
