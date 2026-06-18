import { expect, test, vi, beforeEach } from "vitest";
import { ValidationError } from "@/lib/errors";

// Chained query-builder mock. Each leaf is reset and re-wired per test.
const order = vi.fn();
const listEq = vi.fn(() => ({ order }));
const insertSingle = vi.fn();
const insertSelect = vi.fn(() => ({ single: insertSingle }));
const insert = vi.fn(() => ({ select: insertSelect }));
const deleteEq = vi.fn();
const del = vi.fn(() => ({ eq: deleteEq }));
const measEq = vi.fn(() => ({ order }));
const upsertSingle = vi.fn();
const upsertSelect = vi.fn(() => ({ single: upsertSingle }));
const upsert = vi.fn(() => ({ select: upsertSelect }));

const select = vi.fn((_cols: string) => ({ eq: listEq }));
const from = vi.fn((_table: string) => ({ select, insert, delete: del, upsert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import {
  listPerformers,
  createPerformer,
  deletePerformer,
  getMeasurements,
  upsertMeasurement,
} from "@/lib/data/performers";

beforeEach(() => {
  [order, listEq, insertSingle, insertSelect, insert, deleteEq, del, measEq,
    upsertSingle, upsertSelect, upsert, select, from].forEach((m) => m.mockReset());
  listEq.mockReturnValue({ order });
  measEq.mockReturnValue({ order });
  insertSelect.mockReturnValue({ single: insertSingle });
  insert.mockReturnValue({ select: insertSelect });
  del.mockReturnValue({ eq: deleteEq });
  upsertSelect.mockReturnValue({ single: upsertSingle });
  upsert.mockReturnValue({ select: upsertSelect });
  select.mockReturnValue({ eq: listEq });
  from.mockReturnValue({ select, insert, delete: del, upsert });
});

test("listPerformers filters by production, ordered by created_at", async () => {
  order.mockResolvedValue({ data: [{ id: "pf1", label: "Bert" }], error: null });
  const rows = await listPerformers("p1");
  expect(from).toHaveBeenCalledWith("performers");
  expect(listEq).toHaveBeenCalledWith("production_id", "p1");
  expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
  expect(rows).toEqual([{ id: "pf1", label: "Bert" }]);
});

test("createPerformer inserts a trimmed label", async () => {
  insertSingle.mockResolvedValue({ data: { id: "pf2", label: "Mary" }, error: null });
  const row = await createPerformer({ productionId: "p1", label: "  Mary  " });
  expect(insert).toHaveBeenCalledWith({ production_id: "p1", label: "Mary" });
  expect(row).toEqual({ id: "pf2", label: "Mary" });
});

test("createPerformer rejects an empty label", async () => {
  await expect(createPerformer({ productionId: "p1", label: "   " })).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("deletePerformer deletes by id", async () => {
  deleteEq.mockResolvedValue({ error: null });
  await deletePerformer("pf1");
  expect(del).toHaveBeenCalled();
  expect(deleteEq).toHaveBeenCalledWith("id", "pf1");
});

test("getMeasurements filters by performer", async () => {
  order.mockResolvedValue({ data: [{ measurement_key: "waist", value_numeric: 28 }], error: null });
  const rows = await getMeasurements("pf1");
  expect(from).toHaveBeenCalledWith("performer_measurements");
  expect(listEq).toHaveBeenCalledWith("performer_id", "pf1");
  expect(rows).toEqual([{ measurement_key: "waist", value_numeric: 28 }]);
});

test("upsertMeasurement upserts on (performer_id, measurement_key)", async () => {
  upsertSingle.mockResolvedValue({
    data: { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" },
    error: null,
  });
  const row = await upsertMeasurement({
    performerId: "pf1",
    measurementKey: "waist",
    valueNumeric: 28,
    unit: "in",
  });
  expect(upsert).toHaveBeenCalledWith(
    { performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" },
    { onConflict: "performer_id,measurement_key" },
  );
  expect(row).toEqual({ performer_id: "pf1", measurement_key: "waist", value_numeric: 28, value_text: null, unit: "in" });
});

test("upsertMeasurement rejects a non-finite value", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "waist", valueNumeric: NaN, unit: "in" }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("upsertMeasurement stores a trimmed text value and clears the numeric value", async () => {
  upsertSingle.mockResolvedValue({
    data: { performer_id: "pf1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
    error: null,
  });
  await upsertMeasurement({
    performerId: "pf1",
    measurementKey: "shirt_size",
    valueText: "  L  ",
    unit: "",
  });
  expect(upsert).toHaveBeenCalledWith(
    { performer_id: "pf1", measurement_key: "shirt_size", value_numeric: null, value_text: "L", unit: "" },
    { onConflict: "performer_id,measurement_key" },
  );
});

test("upsertMeasurement rejects an empty text value", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "shirt_size", valueText: "   ", unit: "" }),
  ).rejects.toBeInstanceOf(ValidationError);
});

test("upsertMeasurement rejects when neither value is given", async () => {
  await expect(
    upsertMeasurement({ performerId: "pf1", measurementKey: "waist", unit: "in" }),
  ).rejects.toBeInstanceOf(ValidationError);
});
