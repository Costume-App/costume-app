import { supabaseAdmin } from "@/lib/supabase-admin";
import { listCasts } from "@/lib/data/casts";
import { listRoles } from "@/lib/data/roles";
import { listPerformers } from "@/lib/data/performers";
import { listCastings } from "@/lib/data/castings";
import { CAST_COLORS } from "@/lib/cast-colors";
import { ConflictError } from "@/lib/errors";
import { cleanName } from "@/lib/cast-import/normalize";
import type { ApplyPayload, ExistingData, ImportCounts, WorkspaceSnapshot } from "@/lib/cast-import/types";

async function loadRows(productionId: string) {
  const [casts, roles, performers, castings] = await Promise.all([
    listCasts(productionId),
    listRoles(productionId),
    listPerformers(productionId),
    listCastings(productionId),
  ]);
  return { casts, roles, performers, castings };
}

// The production as matching and validation see it.
export async function loadImportContext(productionId: string): Promise<ExistingData> {
  const { casts, roles, performers, castings } = await loadRows(productionId);
  return {
    casts: casts.map((c) => ({ id: c.id, name: c.name, color: c.color, isDefault: c.is_default })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, isEnsemble: r.is_ensemble })),
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    castings: castings.map((c) => ({
      castId: c.cast_id,
      roleId: c.role_id,
      performerId: c.performer_id,
      assignment: c.assignment,
    })),
  };
}

// Fresh workspace state after an import (same mapping as the production page).
export async function loadWorkspaceSnapshot(productionId: string): Promise<WorkspaceSnapshot> {
  const { casts, roles, performers, castings } = await loadRows(productionId);
  return {
    casts: casts.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    roles: roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes, isEnsemble: r.is_ensemble })),
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    castings: castings.map((c) => ({
      id: c.id,
      castId: c.cast_id,
      roleId: c.role_id,
      performerId: c.performer_id,
      assignment: c.assignment,
    })),
  };
}

// Colors for new casts: palette colors the production isn't using yet, then cycle the palette.
export function pickCastColors(used: string[], count: number): string[] {
  const all = CAST_COLORS.map((c) => c.token);
  const unused = all.filter((t) => !used.includes(t));
  const pool = unused.length > 0 ? unused : all;
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

const CHANGED = "The cast list changed while you were importing. Reload to see the latest.";

// Create everything in one transaction via import_cast_list (migration 0034). The payload must
// already have passed parseApplyPayload + analyzeImport.
export async function applyCastImport(
  productionId: string,
  payload: ApplyPayload,
  existing: ExistingData,
): Promise<ImportCounts> {
  const newCastCount = payload.casts.filter((c) => c.target.kind === "new").length;
  const colors = pickCastColors(existing.casts.map((c) => c.color), newCastCount);
  let nextColor = 0;
  const rpcPayload = {
    casts: payload.casts.map(({ key, target }) =>
      target.kind === "existing"
        ? { key, id: target.castId }
        : { key, name: cleanName(target.name), color: colors[nextColor++] },
    ),
    roles: payload.roles.map(({ key, target }) =>
      target.kind === "existing"
        ? { key, id: target.roleId }
        : { key, name: cleanName(target.name), is_ensemble: target.isEnsemble },
    ),
    performers: payload.performers.map(({ key, target }) =>
      target.kind === "existing" ? { key, id: target.performerId } : { key, name: cleanName(target.name) },
    ),
    castings: payload.castings.map((c) => ({
      cast: c.castKey,
      role: c.roleKey,
      performer: c.performerKey,
      assignment: c.assignment,
    })),
  };
  const { data, error } = await supabaseAdmin.rpc("import_cast_list", {
    p_production_id: productionId,
    p_payload: rpcPayload,
  });
  if (error) {
    if (error.code === "23505" || error.code === "P0002") throw new ConflictError(CHANGED);
    throw new Error(error.message);
  }
  return data as ImportCounts;
}
