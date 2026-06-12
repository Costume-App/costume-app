import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// AI estimates are optional — they only run when an Anthropic key is set. Reuse
// the existing gate rather than duplicating it (one source of truth).
export { isAiConfigured } from "@/lib/ai/suggest-roles";

export interface EstimateItem {
  key: string; // pieceKey(castingId, designId)
  garment: string; // design name, e.g. "Cloak"
  fabricWidth: string | null; // e.g. '60"' if entered
  measurements: { label: string; value: number; unit: string }[];
}

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    estimates: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, yardage: { type: "number" } },
        required: ["key", "yardage"],
        additionalProperties: false,
      },
    },
  },
  required: ["estimates"],
  additionalProperties: false,
} as const;

// Estimate the yards of fabric to construct each garment for a performer with the
// given measurements at the given width. Returns Map<key, yardage>; keys the model
// omits or garbles are simply absent. Returns empty immediately when items is empty.
export async function estimateFabricYardage(items: EstimateItem[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (items.length === 0) return out;

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: ESTIMATE_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          "You are a theatrical costume fabric estimator. For each garment below, estimate the " +
          "yards of fabric needed to construct it for a performer with the given measurements at the " +
          'given fabric width (assume 45" if the width is unknown). Return yardage as a positive ' +
          "number to one decimal place. Respond as JSON: " +
          '{"estimates": [{"key": "<key>", "yardage": <number>}, ...]} — one entry per garment, ' +
          "reusing each garment's exact key.\n\n" +
          JSON.stringify(
            items.map((it) => ({
              key: it.key,
              garment: it.garment,
              fabricWidth: it.fabricWidth ?? "unknown",
              measurements: it.measurements.map((m) => `${m.label}: ${m.value}${m.unit}`),
            })),
            null,
            2,
          ),
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  let parsed: { estimates?: unknown };
  try {
    parsed = JSON.parse(raw) as { estimates?: unknown };
  } catch {
    return out;
  }
  if (!Array.isArray(parsed.estimates)) return out;
  for (const e of parsed.estimates) {
    if (!e || typeof e !== "object") continue;
    const { key, yardage } = e as { key?: unknown; yardage?: unknown };
    if (typeof key !== "string" || !key) continue;
    if (typeof yardage !== "number" || !Number.isFinite(yardage) || yardage <= 0) continue;
    out.set(key, Math.round(yardage * 10) / 10);
  }
  return out;
}
