export type CostumeSource = "make" | "on_hand" | "shared" | "purchase";

export interface CostumeSourceOption {
  token: CostumeSource;
  label: string;
}

export const COSTUME_SOURCES: CostumeSourceOption[] = [
  { token: "make", label: "Make" },
  { token: "on_hand", label: "On hand" },
  { token: "shared", label: "Shared" },
  { token: "purchase", label: "Purchase" },
];

export const DEFAULT_SOURCE: CostumeSource = "make";

export function isCostumeSource(value: string): value is CostumeSource {
  return COSTUME_SOURCES.some((s) => s.token === value);
}

export function sourceLabel(token: string): string {
  return COSTUME_SOURCES.find((s) => s.token === token)?.label ?? "Make";
}

// The lazy default source for a design when no costume_pieces row exists:
// inventory-linked pieces are on-hand; everything else defaults to make.
export function defaultSourceFor(design: { inventory_item_id?: string | null }): CostumeSource {
  return design.inventory_item_id ? "on_hand" : DEFAULT_SOURCE;
}
