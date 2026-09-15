import { expect, test, vi, beforeEach } from "vitest";
import { ConflictError } from "@/lib/errors";

const listCasts = vi.fn();
const listRoles = vi.fn();
const listPerformers = vi.fn();
const listCastings = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/data/casts", () => ({ listCasts: (...a: unknown[]) => listCasts(...a) }));
vi.mock("@/lib/data/roles", () => ({ listRoles: (...a: unknown[]) => listRoles(...a) }));
vi.mock("@/lib/data/performers", () => ({ listPerformers: (...a: unknown[]) => listPerformers(...a) }));
vi.mock("@/lib/data/castings", () => ({ listCastings: (...a: unknown[]) => listCastings(...a) }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { applyCastImport, loadImportContext, loadWorkspaceSnapshot, pickCastColors } from "@/lib/data/cast-import";
import type { ApplyPayload, ExistingData } from "@/lib/cast-import/types";

beforeEach(() => {
  [listCasts, listRoles, listPerformers, listCastings, rpc].forEach((m) => m.mockReset());
  listCasts.mockResolvedValue([{ id: "c1", name: "Main Cast", color: "slate", is_default: true }]);
  listRoles.mockResolvedValue([{ id: "r1", name: "Alf", notes: "hat", is_ensemble: false }]);
  listPerformers.mockResolvedValue([{ id: "p1", label: "Ada Finch" }]);
  listCastings.mockResolvedValue([{ id: "k1", cast_id: "c1", role_id: "r1", performer_id: "p1", assignment: "primary" }]);
});

test("loadImportContext maps rows to the matching shape", async () => {
  expect(await loadImportContext("prod1")).toEqual({
    casts: [{ id: "c1", name: "Main Cast", color: "slate", isDefault: true }],
    roles: [{ id: "r1", name: "Alf", isEnsemble: false }],
    performers: [{ id: "p1", name: "Ada Finch" }],
    castings: [{ castId: "c1", roleId: "r1", performerId: "p1", assignment: "primary" }],
  });
  expect(listCasts).toHaveBeenCalledWith("prod1");
});

test("loadWorkspaceSnapshot maps rows to the workspace's state shape", async () => {
  expect(await loadWorkspaceSnapshot("prod1")).toEqual({
    casts: [{ id: "c1", name: "Main Cast", color: "slate" }],
    roles: [{ id: "r1", name: "Alf", notes: "hat", isEnsemble: false }],
    performers: [{ id: "p1", name: "Ada Finch" }],
    castings: [{ id: "k1", castId: "c1", roleId: "r1", performerId: "p1", assignment: "primary" }],
  });
});

test("pickCastColors prefers unused palette colors, then cycles", () => {
  expect(pickCastColors(["slate"], 2)).toEqual(["red", "gold"]);
  expect(pickCastColors(["slate", "red", "gold", "blue", "green", "plum"], 2)).toEqual(["slate", "red"]);
  expect(pickCastColors([], 0)).toEqual([]);
});

const existing: ExistingData = {
  casts: [{ id: "c1", name: "Main Cast", color: "slate", isDefault: true }],
  roles: [],
  performers: [],
  castings: [],
};

const payload: ApplyPayload = {
  casts: [
    { key: "c0", target: { kind: "existing", castId: "c1" } },
    { key: "c1", target: { kind: "new", name: "  Blue  Cast " } },
  ],
  roles: [
    { key: "r0", target: { kind: "existing", roleId: "r1" } },
    { key: "r1", target: { kind: "new", name: " Pirates ", isEnsemble: true } },
  ],
  performers: [
    { key: "p0", target: { kind: "existing", performerId: "p1" } },
    { key: "p1", target: { kind: "new", name: "Kim  Lee" } },
  ],
  castings: [
    { key: "k0", castKey: "c0", roleKey: "r0", performerKey: "p0", assignment: "primary" },
    { key: "k1", castKey: "c1", roleKey: "r1", performerKey: "p1", assignment: "ensemble" },
  ],
};

test("applyCastImport sends a resolved payload to the RPC and returns its counts", async () => {
  rpc.mockResolvedValue({ data: { casts: 1, roles: 1, performers: 1, castings: 2 }, error: null });
  expect(await applyCastImport("prod1", payload, existing)).toEqual({ casts: 1, roles: 1, performers: 1, castings: 2 });
  expect(rpc).toHaveBeenCalledWith("import_cast_list", {
    p_production_id: "prod1",
    p_payload: {
      casts: [
        { key: "c0", id: "c1" },
        { key: "c1", name: "Blue Cast", color: "red" },
      ],
      roles: [
        { key: "r0", id: "r1" },
        { key: "r1", name: "Pirates", is_ensemble: true },
      ],
      performers: [
        { key: "p0", id: "p1" },
        { key: "p1", name: "Kim Lee" },
      ],
      castings: [
        { cast: "c0", role: "r0", performer: "p0", assignment: "primary" },
        { cast: "c1", role: "r1", performer: "p1", assignment: "ensemble" },
      ],
    },
  });
});

test("applyCastImport drops casts and performers no casting references", async () => {
  rpc.mockResolvedValue({ data: { casts: 1, roles: 1, performers: 1, castings: 2 }, error: null });
  const withUnreferenced: ApplyPayload = {
    ...payload,
    casts: [...payload.casts, { key: "c2", target: { kind: "new", name: "Unused Cast" } }],
    performers: [...payload.performers, { key: "p2", target: { kind: "new", name: "Unused Performer" } }],
  };
  await applyCastImport("prod1", withUnreferenced, existing);
  const sentPayload = rpc.mock.calls[0][1].p_payload;
  expect(sentPayload.casts).toEqual([
    { key: "c0", id: "c1" },
    { key: "c1", name: "Blue Cast", color: "red" },
  ]);
  expect(sentPayload.performers).toEqual([
    { key: "p0", id: "p1" },
    { key: "p1", name: "Kim Lee" },
  ]);
});

test("applyCastImport turns unique violations and missing ids into a ConflictError", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
  await expect(applyCastImport("prod1", payload, existing)).rejects.toThrow(ConflictError);
  rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "Role is not in this production" } });
  await expect(applyCastImport("prod1", payload, existing)).rejects.toThrow(
    "The cast list changed while you were importing. Reload to see the latest.",
  );
});

test("applyCastImport rethrows other database errors as plain errors", async () => {
  rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function does not exist" } });
  await expect(applyCastImport("prod1", payload, existing)).rejects.toThrow("function does not exist");
});
