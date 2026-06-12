import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const listIn = vi.fn();          // .select("*").in(...)
const lookupMaybe = vi.fn();     // .select("id, source").eq().eq().maybeSingle()
const insertIdSingle = vi.fn();  // .insert(make target).select("id").single()
const upsertSingle = vi.fn();    // .upsert().select().single()
const delResolve = vi.fn();      // .delete().eq().eq()
const updateMaybe = vi.fn();     // .update().eq().eq().select("id").maybeSingle()
const insertResolve = vi.fn();   // .insert(make link) awaited directly (no .select())

// All builder spies are fully wired in beforeEach (mockReset wipes any inline body),
// so declare them bare here and keep a single source of truth for each behavior below.
const upsert = vi.fn();
const del = vi.fn();
const insert = vi.fn();
const updateEq = vi.fn();        // tracks the .eq(col, val) calls on the update path
const update = vi.fn();
const select = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({ select, insert, upsert, update, delete: del }) },
}));

import { listCostumePieces, upsertPieceSource, setPieceInventoryItem } from "@/lib/data/costume-pieces";

// insert is used two ways: `.insert(...).select("id").single()` (share target) and
// `await .insert(...)` directly (setPieceInventoryItem). Make the return both chainable
// (.select().single()) and awaitable (a thenable backed by insertResolve).
const makeInsertReturn = () => ({
  select: () => ({ single: insertIdSingle }),
  then: (...args: unknown[]) =>
    (insertResolve() as Promise<unknown>).then(...(args as [never])),
});

beforeEach(() => {
  [listIn, lookupMaybe, insertIdSingle, upsertSingle, delResolve, updateMaybe, insertResolve, updateEq, upsert, del, insert, update, select]
    .forEach((m) => m.mockReset());
  upsert.mockReturnValue({ select: () => ({ single: upsertSingle }) });
  del.mockReturnValue({ eq: () => ({ eq: delResolve }) });
  insert.mockImplementation(makeInsertReturn);
  update.mockImplementation(() => {
    const chain = {
      eq: (...a: unknown[]) => {
        updateEq(...a);
        return { ...chain, select: () => ({ maybeSingle: updateMaybe }) };
      },
    };
    return chain;
  });
  insertResolve.mockResolvedValue({ error: null });
  select.mockImplementation((cols: string) =>
    cols === "*" ? { in: listIn } : { eq: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) },
  );
});

test("listCostumePieces returns [] for no designs without querying", async () => {
  expect(await listCostumePieces([])).toEqual([]);
});

test("make with no note deletes the row", async () => {
  delResolve.mockResolvedValue({ error: null });
  expect(await upsertPieceSource({ designId: "d1", castingId: "c1", source: "make" })).toBeNull();
  expect(del).toHaveBeenCalled();
});

test("on_hand upserts a row", async () => {
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "on_hand" }, error: null });
  const row = await upsertPieceSource({ designId: "d1", castingId: "c1", source: "on_hand", sourceNote: "closet" });
  expect(row).toEqual({ id: "p1", source: "on_hand" });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      costume_design_id: "d1",
      casting_id: "c1",
      source: "on_hand",
      shared_with_piece_id: null,
      source_note: "closet",
      made: false,
      made_at: null,
      updated_at: expect.any(String),
    }),
    { onConflict: "costume_design_id,casting_id" },
  );
});

test("shared requires a target and rejects self", async () => {
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared" }))
    .rejects.toBeInstanceOf(ValidationError);
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c1" }))
    .rejects.toBeInstanceOf(ValidationError);
});

test("shared links to an existing make target", async () => {
  lookupMaybe.mockResolvedValue({ data: { id: "pT", source: "make" }, error: null });
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "shared" }, error: null });
  await upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ source: "shared", shared_with_piece_id: "pT" }),
    { onConflict: "costume_design_id,casting_id" },
  );
});

test("shared rejects a target that is itself shared (no chains)", async () => {
  lookupMaybe.mockResolvedValue({ data: { id: "pT", source: "shared" }, error: null });
  await expect(upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" }))
    .rejects.toBeInstanceOf(ValidationError);
});

test("shared creates the target row as make when missing", async () => {
  lookupMaybe.mockResolvedValue({ data: null, error: null });
  insertIdSingle.mockResolvedValue({ data: { id: "pNew" }, error: null });
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "shared" }, error: null });
  await upsertPieceSource({ designId: "d1", castingId: "c1", source: "shared", sharedWithCastingId: "c2" });
  expect(insert).toHaveBeenCalledWith({ costume_design_id: "d1", casting_id: "c2", source: "make" });
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ shared_with_piece_id: "pNew" }), expect.anything());
});

test("upsertPieceSource threads makerId → maker_id in the upserted row", async () => {
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "make", maker_id: "m1" }, error: null });
  await upsertPieceSource({ designId: "d1", castingId: "c1", source: "make", sourceNote: "custom", makerId: "m1" });
  expect(upsert).toHaveBeenCalledWith(
    expect.objectContaining({ maker_id: "m1" }),
    { onConflict: "costume_design_id,casting_id" },
  );
});

test("make row with makerId assigned is NOT deleted", async () => {
  upsertSingle.mockResolvedValue({ data: { id: "p1", source: "make", maker_id: "m1" }, error: null });
  const result = await upsertPieceSource({ designId: "d1", castingId: "c1", source: "make", makerId: "m1" });
  expect(del).not.toHaveBeenCalled();
  expect(result).toEqual({ id: "p1", source: "make", maker_id: "m1" });
});

test("setPieceInventoryItem updates an existing row's link without inserting", async () => {
  updateMaybe.mockResolvedValue({ data: { id: "pp1" }, error: null });
  await setPieceInventoryItem("d1", "c1", "item1");
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ added_inventory_item_id: "item1" }),
  );
  expect(updateEq).toHaveBeenCalledWith("costume_design_id", "d1");
  expect(updateEq).toHaveBeenCalledWith("casting_id", "c1");
  expect(insert).not.toHaveBeenCalled();
});

test("setPieceInventoryItem inserts a make row when none exists", async () => {
  updateMaybe.mockResolvedValue({ data: null, error: null });
  await setPieceInventoryItem("d1", "c1", "item1");
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({
      costume_design_id: "d1",
      casting_id: "c1",
      source: "make",
      added_inventory_item_id: "item1",
    }),
  );
});
