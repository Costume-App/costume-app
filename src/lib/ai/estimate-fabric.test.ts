import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  // Vitest 4 requires a `function` (not arrow) impl for a mock used with `new`.
  default: vi.fn(function () {
    return { messages: { create } };
  }),
}));

import { estimateFabricYardage, type EstimateItem } from "@/lib/ai/estimate-fabric";

beforeEach(() => {
  create.mockReset();
  vi.unstubAllEnvs();
});

const aiText = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });

const items: EstimateItem[] = [
  { key: "c1:d1", garment: "Cloak", fabricWidth: '60"', measurements: [{ label: "Height", value: 70, unit: "in" }] },
];

test("returns an empty map without calling the model when items is empty", async () => {
  const out = await estimateFabricYardage([]);
  expect(out.size).toBe(0);
  expect(create).not.toHaveBeenCalled();
});

test("parses estimates into a Map, rounding to one decimal", async () => {
  create.mockResolvedValue(aiText({ estimates: [{ key: "c1:d1", yardage: 3.46 }] }));
  const out = await estimateFabricYardage(items);
  expect(out.get("c1:d1")).toBe(3.5);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ model: "claude-haiku-4-5" }),
  );
});

test("uses FABRIC_ESTIMATE_MODEL when set, overriding the default", async () => {
  vi.stubEnv("FABRIC_ESTIMATE_MODEL", "claude-sonnet-4-6");
  create.mockResolvedValue(aiText({ estimates: [] }));
  await estimateFabricYardage(items);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ model: "claude-sonnet-4-6" }),
  );
});

test("falls back to the default model when FABRIC_ESTIMATE_MODEL is blank", async () => {
  vi.stubEnv("FABRIC_ESTIMATE_MODEL", "");
  create.mockResolvedValue(aiText({ estimates: [] }));
  await estimateFabricYardage(items);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ model: "claude-haiku-4-5" }),
  );
});

test("ignores non-positive, non-numeric, mis-shaped, and keyless estimates", async () => {
  create.mockResolvedValue(
    aiText({
      estimates: [
        { key: "ok", yardage: 2.5 },
        { key: "neg", yardage: -1 },
        { key: "zero", yardage: 0 },
        { key: "nan", yardage: "x" },
        { yardage: 4 },
        { key: "", yardage: 4 },
        null,
      ],
    }),
  );
  const out = await estimateFabricYardage(items);
  expect([...out.entries()]).toEqual([["ok", 2.5]]);
});

test("returns an empty map when the model output is not valid JSON", async () => {
  create.mockResolvedValue({ content: [{ type: "text", text: "sorry, no idea" }] });
  const out = await estimateFabricYardage(items);
  expect(out.size).toBe(0);
});

test("serializes a text measurement with no unit", async () => {
  create.mockResolvedValue(aiText({ estimates: [] }));
  await estimateFabricYardage([
    {
      key: "c1:d1",
      garment: "Cloak",
      fabricWidth: '60"',
      measurements: [
        { label: "Shirt size", value: "L", unit: "" },
        { label: "Waist", value: 30, unit: "in" },
      ],
    },
  ]);
  const content = create.mock.calls[0][0].messages[0].content as string;
  expect(content).toContain("Shirt size: L");
  expect(content).toContain("Waist: 30in");
});
