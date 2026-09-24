import { describe, it, expect } from "vitest";
import { TWELFTH, TWELFTH_ROLES, deleteByTitle, ensureTwelfthNight, resetTwelfthNight } from "./demo-productions.mjs";
import { showDate } from "./demo-fixtures.mjs";

function fakeApi(productions = []) {
  const calls = [];
  let n = 0;
  const api = {
    calls,
    get: async (p) => {
      calls.push(["GET", p]);
      if (p === "/api/productions") return { productions };
      if (p.endsWith("/casts")) return { casts: [{ id: "cast-main" }] };
      throw new Error(`unexpected GET ${p}`);
    },
    post: async (p, b) => {
      calls.push(["POST", p, b]);
      if (p === "/api/productions") {
        const production = { id: `prod-${++n}`, title: b.title };
        productions.push(production);
        return { production };
      }
      if (p.endsWith("/roles") && b.names) return { roles: b.names.map((name) => ({ id: `role-${name}`, name })) };
      if (p.endsWith("/roles")) return { role: { id: `role-${b.name}`, name: b.name } };
      if (p.endsWith("/castings")) return { performer: { id: b.performerId ?? `perf-${++n}` }, casting: { id: `c-${n}` } };
      throw new Error(`unexpected POST ${p}`);
    },
    del: async (p) => {
      calls.push(["DELETE", p]);
      const id = p.split("/").pop();
      productions.splice(productions.findIndex((x) => x.id === id), 1);
      return null;
    },
  };
  return api;
}

describe("deleteByTitle", () => {
  it("deletes every production with the exact title and nothing else", async () => {
    const api = fakeApi([{ id: "a", title: TWELFTH }, { id: "b", title: "Hamlet" }, { id: "c", title: TWELFTH }]);
    expect(await deleteByTitle(api, TWELFTH)).toBe(2);
    expect(api.calls.filter((c) => c[0] === "DELETE").map((c) => c[1])).toEqual(["/api/productions/a", "/api/productions/c"]);
  });
});

describe("ensureTwelfthNight", () => {
  it("returns the existing production without writing", async () => {
    const api = fakeApi([{ id: "a", title: TWELFTH }]);
    expect((await ensureTwelfthNight(api)).id).toBe("a");
    expect(api.calls.some((c) => c[0] !== "GET")).toBe(false);
  });
  it("creates it with the Opening Night showing 10 days out", async () => {
    const api = fakeApi([]);
    await ensureTwelfthNight(api);
    const post = api.calls.find((c) => c[0] === "POST");
    expect(post[2]).toEqual({ title: TWELFTH, showings: [{ date: showDate(10), time: "19:30", label: "Opening Night" }] });
  });
});

describe("resetTwelfthNight", () => {
  it("replaces any existing copy and creates roles, ensembles, and castings in order", async () => {
    const api = fakeApi([{ id: "old", title: TWELFTH }]);
    const { production, roleIds, performerIds } = await resetTwelfthNight(api, {
      roles: TWELFTH_ROLES,
      ensembleRoles: ["Musicians"],
      castings: [
        { role: "Viola", name: "Maya Brooks" },
        { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
        { role: "Musicians", name: "Jordan Lee" },
      ],
    });
    expect(api.calls[1]).toEqual(["DELETE", "/api/productions/old"]);
    expect(production.id).not.toBe("old");
    expect(roleIds.get("Musicians")).toBe("role-Musicians");
    const castings = api.calls.filter((c) => c[1].endsWith("/castings")).map((c) => c[2]);
    expect(castings[0]).toEqual({ castId: "cast-main", roleId: "role-Viola", name: "Maya Brooks" });
    expect(castings[1]).toEqual({ castId: "cast-main", roleId: "role-Olivia", performerId: performerIds.get("Maya Brooks"), assignment: "understudy" });
    expect(castings[2]).toEqual({ castId: "cast-main", roleId: "role-Musicians", name: "Jordan Lee" });
  });
  it("creates no roles when given none (the AI section's empty state)", async () => {
    const api = fakeApi([]);
    await resetTwelfthNight(api);
    expect(api.calls.some((c) => c[1].endsWith("/roles"))).toBe(false);
  });
  it("rejects a casting for a role it did not create", async () => {
    await expect(resetTwelfthNight(fakeApi([]), { castings: [{ role: "Viola", name: "X" }] })).rejects.toThrow(/unknown role "Viola"/);
  });
  it("rejects reuse of a name not created earlier in the same call", async () => {
    await expect(resetTwelfthNight(fakeApi([]), { roles: ["Viola"], castings: [{ role: "Viola", name: "X", reuse: true }] }))
      .rejects.toThrow(/no performer "X" to reuse/);
  });
});
