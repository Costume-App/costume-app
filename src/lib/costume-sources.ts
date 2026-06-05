export type CostumeSource = "make" | "on_hand" | "shared";

export interface CostumeSourceOption {
  token: CostumeSource;
  label: string;
}

export const COSTUME_SOURCES: CostumeSourceOption[] = [
  { token: "make", label: "Make" },
  { token: "on_hand", label: "On hand" },
  { token: "shared", label: "Shared" },
];

export const DEFAULT_SOURCE: CostumeSource = "make";

export function isCostumeSource(value: string): value is CostumeSource {
  return COSTUME_SOURCES.some((s) => s.token === value);
}

export function sourceLabel(token: string): string {
  return COSTUME_SOURCES.find((s) => s.token === token)?.label ?? "Make";
}
