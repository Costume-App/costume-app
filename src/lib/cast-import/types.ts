// Client-safe types for cast-list import (no server imports — the review UI uses these too).
import type { Assignment } from "@/lib/casting-assignment";

export type PerformerMark = "primary" | "understudy" | "unmarked";

// What the AI returns: only what is written on the page, no decisions.
export interface RawEntry {
  character: string;
  cast: string | null;
  group_label: boolean;
  performers: { name: string; mark: PerformerMark }[];
}

export interface RawExtraction {
  casts: string[];
  entries: RawEntry[];
}

// After the deterministic rules in infer.ts.
export interface InferredCasting {
  castLabel: string | null; // null = the list named no cast → the production's default cast
  performerName: string;
  assignment: Assignment;
}

export interface InferredRole {
  name: string;
  isEnsemble: boolean;
  castings: InferredCasting[];
}

export interface Inferred {
  castLabels: (string | null)[]; // distinct by match key, first-seen order
  roles: InferredRole[];
}

// The production as it is now — only what matching and validation need.
export interface ExistingData {
  casts: { id: string; name: string; color: string; isDefault: boolean }[];
  roles: { id: string; name: string; isEnsemble: boolean }[];
  performers: { id: string; name: string }[];
  castings: { castId: string; roleId: string; performerId: string; assignment: Assignment }[];
}

export type CastTarget = { kind: "existing"; castId: string } | { kind: "new"; name: string };
export type RoleTarget =
  | { kind: "existing"; roleId: string }
  | { kind: "new"; name: string; isEnsemble: boolean };
export type PerformerTarget = { kind: "existing"; performerId: string } | { kind: "new"; name: string };

export interface ImportCasting {
  key: string;
  castKey: string;
  roleKey: string;
  performerKey: string;
  assignment: Assignment;
}

// What the apply endpoint accepts. Keys tie castings to the casts/roles/performers listed.
export interface ApplyPayload {
  casts: { key: string; target: CastTarget }[];
  roles: { key: string; target: RoleTarget }[];
  performers: { key: string; target: PerformerTarget }[];
  castings: ImportCasting[];
}

// The review model: the payload plus what the review screen shows.
export interface DraftCast {
  key: string;
  label: string | null;
  target: CastTarget;
}

export interface DraftRole {
  key: string;
  sourceName: string;
  target: RoleTarget;
}

export interface DraftPerformer {
  key: string;
  sourceName: string;
  target: PerformerTarget;
  candidateIds: string[]; // existing performers whose name matches exactly
}

export interface Draft {
  casts: DraftCast[];
  roles: DraftRole[];
  performers: DraftPerformer[];
  castings: ImportCasting[];
}

export interface ImportCounts {
  casts: number;
  roles: number;
  performers: number;
  castings: number;
}

// Same shapes ProductionWorkspace keeps in state, so an import can refresh it in place.
export interface WorkspaceSnapshot {
  casts: { id: string; name: string; color: string }[];
  roles: { id: string; name: string; notes: string | null; isEnsemble: boolean }[];
  performers: { id: string; name: string }[];
  castings: { id: string; castId: string; roleId: string; performerId: string; assignment: Assignment }[];
}
