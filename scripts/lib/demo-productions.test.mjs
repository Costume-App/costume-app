import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  TWELFTH, TWELFTH_ROLES, TWELFTH_CAST_STATE, TWELFTH_MEASURED_STATE, TWELFTH_COSTUMED_STATE,
  DEMO_MAKERS, DEMO_INVENTORY_NAMES, DEMO_INVENTORY_ITEMS, DEMO_INVENTORY_CAMERA_ITEM,
  deleteByTitle, ensureTwelfthNight, resetTwelfthNight, resetDemoCostumeOrg,
  resetDemoInventory, assertDemoInventoryOnly,
} from "./demo-productions.mjs";
import { showDate } from "./demo-fixtures.mjs";
import { ROSA_FORM } from "./demo-measurement-form.mjs";

function fakeApi(productions = [], { inventory = [], makers = [] } = {}) {
  const calls = [];
  let n = 0;
  const api = {
    calls,
    get: async (p) => {
      calls.push(["GET", p]);
      if (p === "/api/productions") return { productions };
      if (p === "/api/inventory") return { items: inventory };
      if (p === "/api/makers") return { makers };
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
      if (p === "/api/makers") {
        const maker = { id: `maker-${++n}`, name: b.name, color: b.color };
        makers.push(maker);
        return { maker };
      }
      if (p === "/api/inventory") {
        const item = { id: `inv-${++n}`, ...b };
        inventory.push(item);
        return { item };
      }
      if (p.endsWith("/roles") && b.names) return { roles: b.names.map((name) => ({ id: `role-${name}`, name })) };
      if (p.endsWith("/roles")) return { role: { id: `role-${b.name}`, name: b.name } };
      if (p.endsWith("/castings")) {
        return { performer: { id: b.performerId ?? `perf-${++n}` }, casting: { id: `c-${++n}` } };
      }
      if (p.endsWith("/designs")) return { design: { id: `design-${++n}`, name: b.name } };
      throw new Error(`unexpected POST ${p}`);
    },
    put: async (p, b) => {
      calls.push(["PUT", p, b]);
      if (p.endsWith("/measurements")) return { measurement: { id: `meas-${++n}` } };
      if (p.endsWith("/pieces")) return { piece: { id: `piece-${++n}` } };
      throw new Error(`unexpected PUT ${p}`);
    },
    patch: async (p, b) => {
      calls.push(["PATCH", p, b]);
      if (p.startsWith("/api/makers/")) return { maker: { id: p.split("/").pop(), ...b } };
      if (p.includes("/designs/")) return { design: { id: p.split("/").pop(), ...b } };
      throw new Error(`unexpected PATCH ${p}`);
    },
    del: async (p) => {
      calls.push(["DELETE", p]);
      if (p.startsWith("/api/productions/")) {
        const id = p.split("/").pop();
        productions.splice(productions.findIndex((x) => x.id === id), 1);
      } else if (p.startsWith("/api/inventory/")) {
        const id = p.split("/").pop();
        inventory.splice(inventory.findIndex((x) => x.id === id), 1);
      }
      return null;
    },
    upload: async (p, filePath) => {
      calls.push(["upload", p, filePath]);
      return { image: { id: `img-${++n}` } };
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

  it("writes a numeric measurement as valueNumeric with its unit", async () => {
    const api = fakeApi([]);
    const { performerIds } = await resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Maya Brooks": { chest: 34 } },
    });
    const puts = api.calls.filter((c) => c[0] === "PUT");
    expect(puts).toEqual([
      ["PUT", `/api/performers/${performerIds.get("Maya Brooks")}/measurements`, { measurementKey: "chest", valueNumeric: 34, unit: "in" }],
    ]);
  });

  it("writes a text measurement as valueText with an empty unit", async () => {
    const api = fakeApi([]);
    const { performerIds } = await resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Maya Brooks": { shirt_size: "M" } },
    });
    const puts = api.calls.filter((c) => c[0] === "PUT");
    expect(puts).toEqual([
      ["PUT", `/api/performers/${performerIds.get("Maya Brooks")}/measurements`, { measurementKey: "shirt_size", valueText: "M", unit: "" }],
    ]);
  });

  it("rejects measurements for a name not cast in this call", async () => {
    const api = fakeApi([]);
    await expect(resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Nobody Here": { chest: 34 } },
    })).rejects.toThrow(/no performer "Nobody Here" to measure/);
  });

  it("rejects an unknown measurement key before any PUT is sent", async () => {
    const api = fakeApi([]);
    await expect(resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Maya Brooks": { chest: 34, foo: 1 } },
    })).rejects.toThrow(/unknown measurement key "foo"/);
    expect(api.calls.some((c) => c[0] === "PUT")).toBe(false);
  });

  it("rejects an inherited Object property as a measurement key", async () => {
    const api = fakeApi([]);
    await expect(resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Maya Brooks": { toString: 1 } },
    })).rejects.toThrow(/unknown measurement key "toString"/);
    expect(api.calls.some((c) => c[0] === "PUT")).toBe(false);
  });

  it("names a numeric key given a string instead of calling it unknown", async () => {
    const api = fakeApi([]);
    await expect(resetTwelfthNight(api, {
      roles: ["Viola"],
      castings: [{ role: "Viola", name: "Maya Brooks" }],
      measurements: { "Maya Brooks": { waist: "26 1/2" } },
    })).rejects.toThrow(/measurement "waist" needs a number/);
    expect(api.calls.some((c) => c[0] === "PUT")).toBe(false);
  });

  describe("designs and pieces", () => {
    async function withViolaCast(api) {
      return resetTwelfthNight(api, {
        roles: ["Viola", "Sebastian"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "make" }],
      });
    }

    it("creates a design via POST /designs with roleId and name", async () => {
      const api = fakeApi([]);
      await withViolaCast(api);
      const post = api.calls.find((c) => c[0] === "POST" && c[1].endsWith("/designs"));
      expect(post[2]).toEqual({ roleId: "role-Viola", name: "Doublet" });
    });

    it("sends a PUT /pieces body with the resolved designId and castingId", async () => {
      const api = fakeApi([]);
      const { designIds, castingIds } = await withViolaCast(api);
      const put = api.calls.find((c) => c[0] === "PUT" && c[1].endsWith("/pieces"));
      expect(put[2]).toEqual({
        designId: designIds.get("Viola\u0000Doublet"),
        castingId: castingIds.get("Viola\u0000Maya Brooks"),
        source: "make",
      });
    });

    it("sends the passed-in makerId and the purchase price for a purchased, maker-assigned piece", async () => {
      const api = fakeApi([]);
      const makerIds = new Map([["Priya Shah", "maker-priya"]]);
      await resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Boots" }],
        pieces: [{
          role: "Viola", design: "Boots", performer: "Maya Brooks",
          source: "purchase", maker: "Priya Shah", purchasePrice: 24,
        }],
      }, { makerIds });
      const put = api.calls.find((c) => c[0] === "PUT" && c[1].endsWith("/pieces"));
      expect(put[2].makerId).toBe("maker-priya");
      expect(put[2].source).toBe("purchase");
      expect(put[2].purchasePrice).toBe(24);
    });

    it("PATCHes notes and uploads every photo for a design with both", async () => {
      const api = fakeApi([]);
      const { production, designIds } = await resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet", notes: "wool, deep green", photos: ["/tmp/a.jpg", "/tmp/b.jpg"] }],
      });
      const designId = designIds.get("Viola\u0000Doublet");
      const patches = api.calls.filter((c) => c[0] === "PATCH" && c[1] === `/api/productions/${production.id}/designs/${designId}`);
      expect(patches.length).toBe(1);
      expect(patches[0][2]).toEqual({ notes: "wool, deep green" });
      const uploads = api.calls.filter((c) => c[0] === "upload");
      expect(uploads.map((c) => [c[1] === `/api/productions/${production.id}/designs/${designId}/images`, c[2]])).toEqual([
        [true, "/tmp/a.jpg"],
        [true, "/tmp/b.jpg"],
      ]);
    });

    it("throws when a piece names an unknown role, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Nobody's Role", design: "Doublet", performer: "Maya Brooks", source: "make" }],
      })).rejects.toThrow(/unknown role "Nobody's Role"/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
      expect(api.calls.some((c) => c[0] === "PUT" && c[1].endsWith("/pieces"))).toBe(false);
    });

    it("throws when a piece names an unknown design, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Viola", design: "Nonexistent", performer: "Maya Brooks", source: "make" }],
      })).rejects.toThrow(/unknown design "Nonexistent"/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });

    it("throws when a piece names an unknown performer, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Viola", design: "Doublet", performer: "Nobody Here", source: "make" }],
      })).rejects.toThrow(/unknown performer "Nobody Here"/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });

    it("throws when a piece names an unknown maker, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "make", maker: "Nobody's Maker" }],
      })).rejects.toThrow(/unknown maker "Nobody's Maker"/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });

    it("throws on an unknown source, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola"],
        castings: [{ role: "Viola", name: "Maya Brooks" }],
        designs: [{ role: "Viola", name: "Doublet" }],
        pieces: [{ role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "borrowed" }],
      })).rejects.toThrow(/unknown source "borrowed"/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });

    it("throws /not cast in/ when the performer is not cast in the piece's role, before any design or piece write", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Viola", "Sebastian"],
        castings: [{ role: "Viola", name: "Maya Brooks" }, { role: "Sebastian", name: "Jordan Lee" }],
        designs: [{ role: "Sebastian", name: "Doublet" }],
        pieces: [{ role: "Sebastian", design: "Doublet", performer: "Maya Brooks", source: "make" }],
      })).rejects.toThrow(/not cast in/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
      expect(api.calls.some((c) => c[0] === "PUT" && c[1].endsWith("/pieces"))).toBe(false);
    });

    it("allows the same design name to repeat across two different roles", async () => {
      const api = fakeApi([]);
      const { designIds } = await resetTwelfthNight(api, {
        roles: ["Viola", "Sebastian"],
        castings: [{ role: "Viola", name: "Maya Brooks" }, { role: "Sebastian", name: "Jordan Lee" }],
        designs: [{ role: "Viola", name: "Doublet" }, { role: "Sebastian", name: "Doublet" }],
        pieces: [
          { role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "make" },
          { role: "Sebastian", design: "Doublet", performer: "Jordan Lee", source: "make" },
        ],
      });
      expect(designIds.get("Viola\u0000Doublet")).not.toBe(designIds.get("Sebastian\u0000Doublet"));
      const puts = api.calls.filter((c) => c[0] === "PUT" && c[1].endsWith("/pieces")).map((c) => c[2].designId);
      expect(new Set(puts).size).toBe(2);
    });

    it("creates a design from fromInventory via POST /designs with inventoryItemId and no name", async () => {
      const api = fakeApi([]);
      const inventoryIds = new Map([["Pirate coat", "inv-1"]]);
      const { designIds } = await resetTwelfthNight(api, {
        roles: ["Sebastian"],
        castings: [{ role: "Sebastian", name: "Jordan Lee" }],
        designs: [{ role: "Sebastian", fromInventory: "Pirate coat" }],
        pieces: [{ role: "Sebastian", design: "Pirate coat", performer: "Jordan Lee", source: "on_hand" }],
      }, { inventoryIds });
      const post = api.calls.find((c) => c[0] === "POST" && c[1].endsWith("/designs"));
      expect(post[2]).toEqual({ roleId: "role-Sebastian", inventoryItemId: "inv-1" });
      const put = api.calls.find((c) => c[0] === "PUT" && c[1].endsWith("/pieces"));
      expect(put[2].designId).toBe(designIds.get("Sebastian\u0000Pirate coat"));
    });

    it("throws naming an unknown fromInventory item, before any POST /designs", async () => {
      const api = fakeApi([]);
      const inventoryIds = new Map([["Pirate coat", "inv-1"]]);
      await expect(resetTwelfthNight(api, {
        roles: ["Sebastian"],
        designs: [{ role: "Sebastian", fromInventory: "Nope" }],
      }, { inventoryIds })).rejects.toThrow(/Nope/);
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });

    it("throws for fromInventory given with no inventoryIds, before any POST /designs", async () => {
      const api = fakeApi([]);
      await expect(resetTwelfthNight(api, {
        roles: ["Sebastian"],
        designs: [{ role: "Sebastian", fromInventory: "Pirate coat" }],
      })).rejects.toThrow();
      expect(api.calls.some((c) => c[0] === "POST" && c[1].endsWith("/designs"))).toBe(false);
    });
  });
});

describe("resetDemoCostumeOrg", () => {
  it("deletes only inventory items named in DEMO_INVENTORY_NAMES", async () => {
    const [wanted] = DEMO_INVENTORY_NAMES;
    const api = fakeApi([], {
      inventory: [{ id: "keep", name: "Not A Demo Item" }, { id: "gone", name: wanted }],
      makers: DEMO_MAKERS.map((m) => ({ id: `maker-${m.name}`, name: m.name, color: m.color })),
    });
    await resetDemoCostumeOrg(api);
    const deletes = api.calls.filter((c) => c[0] === "DELETE");
    expect(deletes).toEqual([["DELETE", "/api/inventory/gone"]]);
  });

  it("deletes every item sharing a demo name, not just the first", async () => {
    const [wanted] = DEMO_INVENTORY_NAMES;
    const api = fakeApi([], {
      inventory: [{ id: "gone-1", name: wanted }, { id: "gone-2", name: wanted }],
      makers: DEMO_MAKERS.map((m) => ({ id: `maker-${m.name}`, name: m.name, color: m.color })),
    });
    await resetDemoCostumeOrg(api);
    const deletes = api.calls.filter((c) => c[0] === "DELETE").map((c) => c[1]);
    expect(deletes.sort()).toEqual(["/api/inventory/gone-1", "/api/inventory/gone-2"]);
  });

  it("PATCHes an existing maker's color to match DEMO_MAKERS instead of creating a duplicate", async () => {
    const api = fakeApi([], {
      inventory: [],
      makers: [
        { id: "maker-priya", name: "Priya Shah", color: "slate" },
        { id: "maker-unrelated", name: "Someone Else", color: "gold" },
      ],
    });
    const makerIds = await resetDemoCostumeOrg(api);
    expect(makerIds.get("Priya Shah")).toBe("maker-priya");
    const patches = api.calls.filter((c) => c[0] === "PATCH");
    expect(patches).toEqual([["PATCH", "/api/makers/maker-priya", { color: "pink" }]]);
    const posts = api.calls.filter((c) => c[0] === "POST" && c[1] === "/api/makers");
    expect(posts).toEqual([["POST", "/api/makers", { name: "Sam Ortiz", color: "orange" }]]);
    expect(api.calls.some((c) => c[1] === "/api/makers/maker-unrelated")).toBe(false);
  });

  it("sends no call at all for a maker that already matches", async () => {
    const api = fakeApi([], {
      inventory: [],
      makers: DEMO_MAKERS.map((m) => ({ id: `maker-${m.name}`, name: m.name, color: m.color })),
    });
    await resetDemoCostumeOrg(api);
    expect(api.calls.some((c) => c[0] === "PATCH" || (c[0] === "POST" && c[1] === "/api/makers"))).toBe(false);
  });
});

describe("DEMO_MAKERS", () => {
  it("has no more than the 3-maker seat cap and only CAST_COLORS tokens", () => {
    expect(DEMO_MAKERS.length).toBeLessThanOrEqual(3);
    const castColorsPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../src/lib/cast-colors.ts");
    const source = readFileSync(castColorsPath, "utf8");
    const tokens = [...source.matchAll(/token: "([a-z]+)"/g)].map((m) => m[1]);
    expect(tokens.length).toBeGreaterThan(0);
    for (const maker of DEMO_MAKERS) {
      expect(tokens).toContain(maker.color);
    }
  });
});

describe("TWELFTH_CAST_STATE", () => {
  it("holds video 2's end state after Combine duplicates", () => {
    expect(TWELFTH_CAST_STATE.roles).toEqual([...TWELFTH_ROLES, "Sea Captain"]);
    expect(TWELFTH_CAST_STATE.ensembleRoles).toEqual(["Musicians"]);
    expect(TWELFTH_CAST_STATE.castings).toEqual([
      { role: "Viola", name: "Maya Brooks" },
      { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
      { role: "Musicians", name: "Theo Park" },
      { role: "Musicians", name: "Rosa Diaz" },
      { role: "Sebastian", name: "Jordan Lee" },
      { role: "Musicians", name: "Jordan Lee", reuse: true },
    ]);
  });
});

describe("TWELFTH_MEASURED_STATE", () => {
  it("deep-equals the STATE_WRAP measurements.mjs used before the move", () => {
    // Snapshot of measurements.mjs's own STATE_WRAP as it read before this
    // task moved it (and the constants it is built from) into
    // demo-productions.mjs, so a later edit on either side shows up here.
    const oldStateWrap = {
      ...TWELFTH_CAST_STATE,
      measurements: {
        "Maya Brooks": { height: 66, chest: 34, shirt_size: "M", waist: 26.5 },
        "Jordan Lee": {
          height: 70, weight: 165, chest: 40, waist: 32, hips: 38, shoulder: 18,
          sleeve: 25, back_length: 18, inseam: 32, outseam: 42, neck: 15.5,
          arm_circumference: 12, wrist: 7, thigh: 22, knee: 15, head: 23, nape_to_floor: 60,
          shirt_size: "L", pant_size: "32/32", shoe_size: "Men's 10",
        },
        [ROSA_FORM.name]: {
          chest: 36, waist: 26.5, hips: 38, inseam: 30, nape_to_floor: 58, height: 65,
          shoulder: 15.5, head: 22.5, neck: 13.5,
          shirt_size: "S", pant_size: "4", shoe_size: "Women's 7",
        },
      },
    };
    expect(TWELFTH_MEASURED_STATE).toEqual(oldStateWrap);
  });
});

describe("TWELFTH_COSTUMED_STATE", () => {
  it("deep-equals a snapshot of video 4's STATE_WRAP taken before the move", () => {
    // Snapshot of costume-creations.mjs's own STATE_WRAP as it read before
    // this task moved BASE_STATE, the design lists, and ESTIMATED into
    // demo-productions.mjs, so a later edit on either side shows up here.
    const oldMeasurements = {
      ...TWELFTH_MEASURED_STATE.measurements,
      [ROSA_FORM.name]: { ...TWELFTH_MEASURED_STATE.measurements[ROSA_FORM.name], outseam: 40 },
    };
    const oldBaseState = { ...TWELFTH_CAST_STATE, measurements: oldMeasurements };
    const sketchPath = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "../fixtures/training/costume-sketch-viola-doublet.jpg",
    );
    const doubletFabric = { name: "Wool suiting", color: "Deep green", widthIn: 60, unitCost: 18, supplier: "Mill End Textiles" };
    const allDesigns = [
      { role: "Viola", name: "Doublet", notes: "Green wool, brass buttons, fitted to the waist.", photos: [sketchPath] },
      { role: "Viola", name: "Breeches" },
      { role: "Viola", name: "Boots" },
      { role: "Olivia", name: "Gown" },
      { role: "Sebastian", name: "Doublet" },
      { role: "Musicians", name: "Skirt" },
      { role: "Musicians", name: "Tunic" },
    ];
    const bootsPurchased = { role: "Viola", design: "Boots", performer: "Maya Brooks", source: "purchase", purchasePrice: 45 };
    const ensembleSplit = [
      { role: "Musicians", design: "Skirt", performer: "Theo Park", source: "on_hand" },
      { role: "Musicians", design: "Skirt", performer: "Jordan Lee", source: "on_hand" },
      { role: "Musicians", design: "Tunic", performer: ROSA_FORM.name, source: "on_hand" },
    ];
    const rosaSkirt = { type: "full_circle", lengthIn: 36 };
    const estimated = [
      { role: "Viola", design: "Doublet", performer: "Maya Brooks", source: "make", maker: "Priya Shah", fabric: { ...doubletFabric, yardage: 2.5 } },
      { role: "Viola", design: "Breeches", performer: "Maya Brooks", source: "make", maker: "Sam Ortiz", fabric: { name: "Wool suiting", color: "Charcoal", widthIn: 60, yardage: 1.8, unitCost: 18, supplier: "Mill End Textiles" } },
      bootsPurchased,
      ...ensembleSplit,
      { role: "Olivia", design: "Gown", performer: "Maya Brooks", source: "make", fabric: { name: "Silk taffeta", color: "Ivory", widthIn: 54, yardage: 6.5, unitCost: 24, supplier: "Fabric Row" } },
      { role: "Sebastian", design: "Doublet", performer: "Jordan Lee", source: "make", fabric: { name: "Wool suiting", color: "Deep green", widthIn: 60, yardage: 2.8, unitCost: 18, supplier: "Mill End Textiles" } },
      { role: "Musicians", design: "Skirt", performer: ROSA_FORM.name, source: "make", fabric: { name: "Cotton broadcloth", color: "Burgundy", widthIn: 60, yardage: 5.25, unitCost: 9, supplier: "Fabric Row" }, skirt: rosaSkirt },
      { role: "Musicians", design: "Tunic", performer: "Theo Park", source: "make", fabric: { name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.2, unitCost: 12, supplier: "Fabric Row" } },
      { role: "Musicians", design: "Tunic", performer: "Jordan Lee", source: "make", fabric: { name: "Linen", color: "Oatmeal", widthIn: 54, yardage: 2.4, unitCost: 12, supplier: "Fabric Row" } },
    ];
    const oldStateWrap = {
      ...oldBaseState,
      designs: allDesigns,
      pieces: estimated.map((p) => (p.role === "Viola" && p.design === "Doublet" ? { ...p, made: true } : p)),
    };
    expect(TWELFTH_COSTUMED_STATE).toEqual(oldStateWrap);
  });
});

describe("DEMO_INVENTORY_NAMES", () => {
  it("contains Doublet, every DEMO_INVENTORY_ITEMS name, and the camera item's name, with no repeats", () => {
    expect(DEMO_INVENTORY_NAMES).toContain("Doublet");
    for (const item of DEMO_INVENTORY_ITEMS) expect(DEMO_INVENTORY_NAMES).toContain(item.name);
    expect(DEMO_INVENTORY_NAMES).toContain(DEMO_INVENTORY_CAMERA_ITEM.name);
    expect(new Set(DEMO_INVENTORY_NAMES).size).toBe(DEMO_INVENTORY_NAMES.length);
  });
});

describe("resetDemoInventory", () => {
  it("sends one POST /api/inventory and one upload per item, returning a name-to-id map", async () => {
    const api = fakeApi([], { inventory: [] });
    const itemIds = await resetDemoInventory(api, DEMO_INVENTORY_ITEMS, { fileExists: () => true });
    const posts = api.calls.filter((c) => c[0] === "POST" && c[1] === "/api/inventory");
    expect(posts.length).toBe(DEMO_INVENTORY_ITEMS.length);
    for (const item of DEMO_INVENTORY_ITEMS) {
      const post = posts.find((c) => c[2].name === item.name);
      const expectedBody = { name: item.name, category: item.category, quantity: item.quantity, location: item.location };
      if (item.size !== undefined) expectedBody.size = item.size;
      if (item.notes !== undefined) expectedBody.notes = item.notes;
      expect(post[2]).toEqual(expectedBody);
      const id = itemIds.get(item.name);
      expect(id).toBeTruthy();
      const upload = api.calls.find((c) => c[0] === "upload" && c[1] === `/api/inventory/${id}/images`);
      expect(upload[2]).toBe(item.photo);
    }
  });

  it("throws when an item's name is not in DEMO_INVENTORY_NAMES, before any write", async () => {
    const api = fakeApi([], { inventory: [] });
    const items = [{ name: "Not listed", category: "Hats", quantity: 1, location: "Shelf 3", photo: "/tmp/not-listed.jpg" }];
    await expect(resetDemoInventory(api, items, { fileExists: () => true })).rejects.toThrow(/not in DEMO_INVENTORY_NAMES/);
    expect(api.calls.length).toBe(0);
  });

  it("throws when two items share a name, before any write", async () => {
    const api = fakeApi([], { inventory: [] });
    const [first] = DEMO_INVENTORY_ITEMS;
    await expect(resetDemoInventory(api, [first, first], { fileExists: () => true })).rejects.toThrow(/repeats/);
    expect(api.calls.length).toBe(0);
  });

  it("throws when a photo file is missing, before any write", async () => {
    const api = fakeApi([], { inventory: [] });
    await expect(resetDemoInventory(api, DEMO_INVENTORY_ITEMS, { fileExists: () => false })).rejects.toThrow(/photo/);
    expect(api.calls.length).toBe(0);
  });
});

describe("assertDemoInventoryOnly", () => {
  it("passes on a list of listed names only", async () => {
    const api = fakeApi([], { inventory: [{ id: "a", name: "Doublet" }, { id: "b", name: DEMO_INVENTORY_ITEMS[0].name }] });
    await expect(assertDemoInventoryOnly(api)).resolves.toBeUndefined();
  });

  it("throws naming an item not in the list, and sends no DELETE", async () => {
    const api = fakeApi([], { inventory: [{ id: "a", name: "Doublet" }, { id: "stray", name: "Hand-added thing" }] });
    await expect(assertDemoInventoryOnly(api)).rejects.toThrow(/Hand-added thing/);
    expect(api.calls.some((c) => c[0] === "DELETE")).toBe(false);
  });
});
