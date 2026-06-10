import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ValidationError } from "@/lib/errors";

// AI role suggestions are optional — they only work when an Anthropic key is set,
// mirroring the project's "integrations fail gracefully without keys" convention.
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const ROLE_LIST_SCHEMA = {
  type: "object",
  properties: { roles: { type: "array", items: { type: "string" } } },
  required: ["roles"],
  additionalProperties: false,
} as const;

// Ask Claude for the standard character roles of a known production. Returns role
// names only; returns an empty array if the model doesn't recognize the title.
export async function suggestRolesForTitle(title: string): Promise<string[]> {
  const clean = title.trim();
  if (!clean) throw new ValidationError("Production title is required");

  // The title is user-controlled, so it's interpolated into the prompt as data.
  // Risk is contained: the response is schema-constrained to {roles: string[]},
  // only role-name strings are ever surfaced, and nothing is persisted until the
  // user confirms via "Add all roles" in the UI.
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: ROLE_LIST_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `List the standard named character roles for the stage production, musical, or ballet titled "${clean}". ` +
          `Return character/role names only — no actor names, no descriptions — in a sensible billing order. ` +
          `If you do not recognize the title, return an empty list. Respond as JSON: {"roles": ["Name", ...]}.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  let parsed: { roles?: unknown };
  try {
    parsed = JSON.parse(raw) as { roles?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.roles)) return [];
  return parsed.roles
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter(Boolean);
}
