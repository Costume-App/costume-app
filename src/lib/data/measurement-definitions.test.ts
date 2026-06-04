import { expect, test, vi, beforeEach } from "vitest";

const order = vi.fn();
const select = vi.fn(() => ({ order }));
const from = vi.fn((_table: string) => ({ select }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { listMeasurementDefinitions } from "@/lib/data/measurement-definitions";

beforeEach(() => {
  [order, select, from].forEach((m) => m.mockReset());
  select.mockReturnValue({ order });
  from.mockReturnValue({ select });
});

test("lists definitions ordered by display_order", async () => {
  order.mockResolvedValue({ data: [{ key: "height", label: "Height" }], error: null });
  const rows = await listMeasurementDefinitions();
  expect(from).toHaveBeenCalledWith("measurement_definitions");
  expect(order).toHaveBeenCalledWith("display_order", { ascending: true });
  expect(rows).toEqual([{ key: "height", label: "Height" }]);
});

test("throws on supabase error", async () => {
  order.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(listMeasurementDefinitions()).rejects.toThrow("boom");
});
