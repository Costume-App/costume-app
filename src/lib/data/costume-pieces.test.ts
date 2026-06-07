import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

const listIn = vi.fn();          // .select("*").in(...)
const lookupMaybe = vi.fn();     // .select("id, source").eq().eq().maybeSingle()
const insertIdSingle = vi.fn();  // .insert(make target).select("id").single()
const upsertSingle = vi.fn();    // .upsert().select().single()
const delResolve = vi.fn();      // .delete().eq().eq()

const upsert = vi.fn(() => ({ select: () => ({ single: upsertSingle }) }));
const del = vi.fn(() => ({ eq: () => ({ eq: delResolve }) }));
const insert = vi.fn(() => ({ select: () => ({ single: insertIdSingle }) }));
const select = vi.fn((cols: string) =>
  cols === "*"
    ? { in: listIn }
    : { eq: () => ({ eq: () => ({ maybeSingle: lookupMaybe }) }) },
);

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: () => ({ select, insert, upsert, delete: del }) },
}));

import { listCostumePieces, upsertPieceSource } from "@/lib/data/costume-pieces";

beforeEach(() => {
  [listIn, lookupMaybe, insertIdSingle, upsertSingle, delResolve, upsert, del, insert, select]
    .forEach((m) => m.mockReset());
  upsert.mockReturnValue({ select: () => ({ single: upsertSingle }) });
  del.mockReturnValue({ eq: () => ({ eq: delResolve }) });
  insert.mockReturnValue({ select: () => ({ single: insertIdSingle }) });
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
