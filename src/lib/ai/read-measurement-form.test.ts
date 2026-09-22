import { expect, test, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class BadRequestError extends Error {}
  // Vitest 4 requires a `function` (not arrow) impl for a mock used with `new`.
  const Anthropic = vi.fn(function () {
    return { messages: { create } };
  });
  return { default: Object.assign(Anthropic, { BadRequestError }) };
});

import Anthropic from "@anthropic-ai/sdk";
import {
  MeasurementFormServiceError,
  MeasurementFormUnreadableError,
  readMeasurementForm,
  sanitizeExtraction,
} from "@/lib/ai/read-measurement-form";

const image = { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: "AQID" } };
const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });

beforeEach(() => {
  create.mockReset();
});

test("sanitizeExtraction fills every slot and drops junk", () => {
  expect(sanitizeExtraction({ name: " Ada ", fields: [{ label: "A chest", value: "36" }, { label: "", value: "" }, 7], notes: ["x", 3] })).toEqual({
    name: " Ada ",
    casted_as: null,
    sex: null,
    age: null,
    contact: null,
    sizes: { shirt: null, pant: null, shoe: null },
    fields: [{ label: "A chest", value: "36" }],
    notes: ["x"],
  });
  expect(sanitizeExtraction(null).fields).toEqual([]);
});

test("returns the sanitized extraction and sends the image with the instructions", async () => {
  create.mockResolvedValue(reply(JSON.stringify({ name: "Ada", fields: [{ label: "A chest", value: "36" }] })));
  const out = await readMeasurementForm(image);
  expect(out.name).toBe("Ada");
  expect(out.fields).toEqual([{ label: "A chest", value: "36" }]);
  const args = create.mock.calls[0][0] as { model: string; messages: { content: unknown[] }[] };
  expect(args.model).toBe("claude-sonnet-5");
  expect(args.messages[0].content[0]).toEqual(image);
  // Route maxDuration is 60s; the SDK timeout must stay comfortably under that, no retries.
  expect(Anthropic).toHaveBeenCalledWith({ timeout: 45_000, maxRetries: 0 });
});

test("a page with no name and no fields is unreadable (422)", async () => {
  create.mockResolvedValue(reply(JSON.stringify({ name: null, fields: [] })));
  await expect(readMeasurementForm(image)).rejects.toBeInstanceOf(MeasurementFormUnreadableError);
});

test("refusal and unparsable output are unreadable; SDK failure is a service error", async () => {
  create.mockResolvedValue(reply("", "refusal"));
  await expect(readMeasurementForm(image)).rejects.toBeInstanceOf(MeasurementFormUnreadableError);
  create.mockResolvedValue(reply("not json"));
  await expect(readMeasurementForm(image)).rejects.toBeInstanceOf(MeasurementFormUnreadableError);
  create.mockRejectedValue(new Error("network"));
  await expect(readMeasurementForm(image)).rejects.toBeInstanceOf(MeasurementFormServiceError);
});

test("a 400 from the API is unreadable", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const BadRequest = (Anthropic as unknown as { BadRequestError: new (m: string) => Error }).BadRequestError;
  create.mockRejectedValue(new BadRequest("Could not process image"));
  await expect(readMeasurementForm(image)).rejects.toBeInstanceOf(MeasurementFormUnreadableError);
});
