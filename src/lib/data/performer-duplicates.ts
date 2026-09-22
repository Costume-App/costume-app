import { supabaseAdmin } from "@/lib/supabase-admin";
import { ConflictError } from "@/lib/errors";
import { listPerformers, getFilledMeasurementCounts } from "@/lib/data/performers";
import { listCastings } from "@/lib/data/castings";
import {
  findDuplicateGroups,
  CAST_LIST_CHANGED,
  COMBINE_COLLISION,
  type DuplicateGroup,
} from "@/lib/performer-duplicates";

export interface RpcCombineCounts {
  castings_moved: number;
  measurements_filled: number;
  performers_removed: number;
}

// Same-name performers in a production, computed from fresh rows.
export async function loadDuplicateGroups(productionId: string): Promise<DuplicateGroup[]> {
  const [performers, castings] = await Promise.all([listPerformers(productionId), listCastings(productionId)]);
  const filledCounts = await getFilledMeasurementCounts(performers.map((p) => p.id));
  return findDuplicateGroups({
    performers: performers.map((p) => ({ id: p.id, name: p.label })),
    castings: castings.map((c) => ({
      id: c.id,
      castId: c.cast_id,
      roleId: c.role_id,
      performerId: c.performer_id,
      assignment: c.assignment,
    })),
    filledCounts,
  });
}

// One transaction via combine_performers (migration 0036). Callers pass a group that
// matchRequestedGroups already validated against fresh data.
export async function combinePerformers(
  productionId: string,
  keepId: string,
  dropIds: string[],
): Promise<RpcCombineCounts> {
  const { data, error } = await supabaseAdmin.rpc("combine_performers", {
    p_production_id: productionId,
    p_keep: keepId,
    p_drop: dropIds,
  });
  if (error) {
    // 23505: the kept row already holds one of the moved cast + role slots.
    if (error.code === "23505") throw new ConflictError(COMBINE_COLLISION);
    // P0002: an id fell outside the production between the recompute and the call.
    if (error.code === "P0002") throw new ConflictError(CAST_LIST_CHANGED);
    throw new Error(error.message);
  }
  return data as RpcCombineCounts;
}
