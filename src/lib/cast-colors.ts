// The palette a cast can be tagged with. Stored as a token on `casts.color`;
// rendered as the hex below on the cast's switcher dot.
export interface CastColor {
  token: string;
  label: string;
  hex: string;
}

export const CAST_COLORS: CastColor[] = [
  { token: "slate", label: "Slate", hex: "#64748b" },
  { token: "red", label: "Red", hex: "#8c2b22" },
  { token: "gold", label: "Gold", hex: "#b88a2e" },
  { token: "blue", label: "Blue", hex: "#3b6ea5" },
  { token: "green", label: "Green", hex: "#3f7d4f" },
  { token: "plum", label: "Plum", hex: "#6d4c7d" },
];

export const DEFAULT_CAST_COLOR = "slate";

export function castColorHex(token: string): string {
  return CAST_COLORS.find((c) => c.token === token)?.hex ?? CAST_COLORS[0].hex;
}

// A light wash of the cast color, for tinting the workspace so the active cast
// stays recognizable while scrolling. Append an 8-bit alpha to the hex.
export function castColorTint(token: string): string {
  return castColorHex(token) + "1f"; // ~12% over the page background
}

export function castColorEdge(token: string): string {
  return castColorHex(token) + "55"; // ~33%, for a subtle colored card border
}
