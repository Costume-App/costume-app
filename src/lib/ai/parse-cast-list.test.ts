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
  CastListServiceError,
  CastListUnreadableError,
  DEFAULT_CAST_IMPORT_MODEL,
  parseCastList,
} from "@/lib/ai/parse-cast-list";

beforeEach(() => {
  create.mockReset();
  vi.unstubAllEnvs();
});

const reply = (obj: unknown, stop_reason = "end_turn") => ({
  stop_reason,
  content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(obj) }],
});
const content = [{ type: "text" as const, text: "Alf\tAda Finch" }];

test("sends the content first, then the instructions, with the JSON schema, on Sonnet 5 by default", async () => {
  create.mockResolvedValue(reply({ casts: [], entries: [{ character: "Alf", cast: null, group_label: false, performers: [{ name: "Ada Finch", mark: "unmarked" }] }] }));
  const out = await parseCastList(content);
  expect(out).toEqual({
    casts: [],
    entries: [{ character: "Alf", cast: null, group_label: false, performers: [{ name: "Ada Finch", mark: "unmarked" }] }],
  });
  const params = create.mock.calls[0][0];
  expect(DEFAULT_CAST_IMPORT_MODEL).toBe("claude-sonnet-5");
  expect(params.model).toBe("claude-sonnet-5");
  expect(params.output_config.format.type).toBe("json_schema");
  expect(params.messages[0].content[0]).toEqual(content[0]);
  expect(params.messages[0].content.at(-1).type).toBe("text");
  // Route maxDuration is 120s; the SDK timeout must stay comfortably under that.
  expect(Anthropic).toHaveBeenCalledWith({ timeout: 100_000, maxRetries: 1 });
});

test("CAST_IMPORT_MODEL overrides the model; blank falls back", async () => {
  create.mockResolvedValue(reply({ casts: [], entries: [{ character: "Alf", cast: null, group_label: false, performers: [] }] }));
  vi.stubEnv("CAST_IMPORT_MODEL", "claude-opus-5");
  await parseCastList(content);
  expect(create.mock.calls[0][0].model).toBe("claude-opus-5");
  vi.stubEnv("CAST_IMPORT_MODEL", "  ");
  await parseCastList(content);
  expect(create.mock.calls[1][0].model).toBe("claude-sonnet-5");
});

test("sanitizes mis-shaped output: drops blank characters and names, coerces marks and casts", async () => {
  create.mockResolvedValue(
    reply({
      casts: ["Red", 7],
      entries: [
        { character: "  ", cast: null, group_label: false, performers: [] },
        { character: "Annie", cast: " ", group_label: "yes", performers: [{ name: "Jane", mark: "lead" }, { name: " " }, null] },
        "junk",
      ],
    }),
  );
  expect(await parseCastList(content)).toEqual({
    casts: ["Red"],
    entries: [{ character: "Annie", cast: null, group_label: false, performers: [{ name: "Jane", mark: "unmarked" }] }],
  });
});

test("no usable entries, invalid JSON, refusals and max_tokens are unreadable (422) errors", async () => {
  create.mockResolvedValue(reply({ casts: [], entries: [] }));
  await expect(parseCastList(content)).rejects.toThrow(CastListUnreadableError);
  create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] });
  await expect(parseCastList(content)).rejects.toThrow("No cast list found in that — check it's the right file, or paste the names.");
  create.mockResolvedValue({ stop_reason: "refusal", content: [] });
  await expect(parseCastList(content)).rejects.toThrow(CastListUnreadableError);
  create.mockResolvedValue({ stop_reason: "max_tokens", content: [{ type: "text", text: "{\"entries\": [" }] });
  await expect(parseCastList(content)).rejects.toThrow("That cast list is too long to read in one go — split it into smaller parts.");
});

test("a 400 from the API (e.g. a corrupt PDF) is unreadable; other API failures are service errors", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const BadRequest = (Anthropic as unknown as { BadRequestError: new (m: string) => Error }).BadRequestError;
  create.mockRejectedValue(new BadRequest("Could not process PDF"));
  await expect(parseCastList(content)).rejects.toThrow("Couldn't read that file — try pasting the text instead.");
  expect(console.error).toHaveBeenCalledWith("Cast list AI request rejected:", expect.any(Error));
  create.mockRejectedValue(new Error("socket hang up"));
  await expect(parseCastList(content)).rejects.toThrow(CastListServiceError);
});
