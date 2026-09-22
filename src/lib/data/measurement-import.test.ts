import { expect, test, vi, beforeEach } from "vitest";
import { ConflictError, ValidationError } from "@/lib/errors";

const listPerformers = vi.fn();
const getMeasurementsForPerformers = vi.fn();
const listMeasurementDefinitions = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/data/performers", () => ({
  listPerformers: (...a: unknown[]) => listPerformers(...a),
  getMeasurementsForPerformers: (...a: unknown[]) => getMeasurementsForPerformers(...a),
}));
vi.mock("@/lib/data/measurement-definitions", () => ({
  listMeasurementDefinitions: (...a: unknown[]) => listMeasurementDefinitions(...a),
}));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { applyMeasurementImport, loadMeasurementImportContext } from "@/lib/data/measurement-import";
import type { ApplyPayload, ExistingData } from "@/lib/measurement-import/types";

const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  [listPerformers, getMeasurementsForPerformers, listMeasurementDefinitions, rpc].forEach((m) => m.mockReset());
  listPerformers.mockResolvedValue([{ id: P1, production_id: "prod1", label: "Ada Finch", notes: "hat", created_at: "2026-01-01" }]);
  getMeasurementsForPerformers.mockResolvedValue([
    { id: "m1", performer_id: P1, measurement_key: "chest", value_numeric: 36, value_text: null, unit: "in", updated_at: "" },
    { id: "m2", performer_id: P1, measurement_key: "shirt_size", value_numeric: null, value_text: "M", unit: "", updated_at: "" },
  ]);
  listMeasurementDefinitions.mockResolvedValue([
    { key: "chest", label: "Chest / bust", unit: "in", input_type: "number", help_text: null, display_order: 30 },
    { key: "shirt_size", label: "Shirt size", unit: "", input_type: "text", help_text: "x", display_order: 180 },
  ]);
});

test("loadMeasurementImportContext maps performers, their measurements and definitions", async () => {
  expect(await loadMeasurementImportContext("prod1")).toEqual({
    performers: [{ id: P1, name: "Ada Finch", notes: "hat", measurements: { chest: 36, shirt_size: "M" } }],
    definitions: [
      { key: "chest", label: "Chest / bust", unit: "in", input_type: "number", display_order: 30 },
      { key: "shirt_size", label: "Shirt size", unit: "", input_type: "text", display_order: 180 },
    ],
  });
  expect(getMeasurementsForPerformers).toHaveBeenCalledWith([P1]);
});

const existing: ExistingData = {
  performers: [{ id: P1, name: "Ada Finch", notes: null, measurements: {} }],
  definitions: [],
};

test("applyMeasurementImport calls the RPC with the snake_case payload and maps counts", async () => {
  rpc.mockResolvedValue({ data: { performers: 1, measurements: 2, notes: 1 }, error: null });
  const payload: ApplyPayload = {
    forms: [
      {
        performer: { kind: "existing", performerId: P1 },
        measurements: [{ key: "chest", valueNumeric: 36, valueText: null }],
        notesAppend: "From measurement form, 2026-09-22:\nSex: Male",
      },
      { performer: { kind: "new", name: "Bo Tran" }, measurements: [{ key: "shirt_size", valueNumeric: null, valueText: "M" }], notesAppend: null },
    ],
  };
  const result = await applyMeasurementImport("prod1", payload, existing);
  expect(result).toEqual({ performersCreated: 1, measurementsWritten: 2, notesAppended: 1 });
  expect(rpc).toHaveBeenCalledWith("import_measurement_forms", {
    p_production_id: "prod1",
    p_payload: {
      forms: [
        {
          performer: { id: P1 },
          measurements: [{ key: "chest", value_numeric: 36, value_text: null }],
          notes_append: "From measurement form, 2026-09-22:\nSex: Male",
        },
        { performer: { name: "Bo Tran" }, measurements: [{ key: "shirt_size", value_numeric: null, value_text: "M" }], notes_append: null },
      ],
    },
  });
});

test("refuses to create a new performer whose name now matches an existing one", async () => {
  const payload: ApplyPayload = {
    forms: [{ performer: { kind: "new", name: "ada finch" }, measurements: [{ key: "chest", valueNumeric: 36, valueText: null }], notesAppend: null }],
  };
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toBeInstanceOf(ConflictError);
  expect(rpc).not.toHaveBeenCalled();
});

test("refuses an existing performer id that is no longer in the production", async () => {
  const payload: ApplyPayload = {
    forms: [{ performer: { kind: "existing", performerId: "22222222-2222-4222-8222-222222222222" }, measurements: [{ key: "chest", valueNumeric: 36, valueText: null }], notesAppend: null }],
  };
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toBeInstanceOf(ConflictError);
  expect(rpc).not.toHaveBeenCalled();
});

test("refuses two forms in the same payload that create the same new performer name", async () => {
  const payload: ApplyPayload = {
    forms: [
      { performer: { kind: "new", name: "Bo Tran" }, measurements: [{ key: "chest", valueNumeric: 36, valueText: null }], notesAppend: null },
      { performer: { kind: "new", name: "bo tran" }, measurements: [{ key: "chest", valueNumeric: 37, valueText: null }], notesAppend: null },
    ],
  };
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toBeInstanceOf(ValidationError);
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toThrow(
    "Two forms create the same new performer: Bo Tran. Pick one performer for both.",
  );
  expect(rpc).not.toHaveBeenCalled();
});

test("maps the RPC's P0002 to ConflictError and other errors to Error", async () => {
  const payload: ApplyPayload = {
    forms: [{ performer: { kind: "existing", performerId: P1 }, measurements: [{ key: "chest", valueNumeric: 36, valueText: null }], notesAppend: null }],
  };
  rpc.mockResolvedValue({ data: null, error: { code: "P0002", message: "gone" } });
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toBeInstanceOf(ConflictError);
  rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
  await expect(applyMeasurementImport("prod1", payload, existing)).rejects.toThrow("boom");
});
