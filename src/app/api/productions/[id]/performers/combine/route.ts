import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ConflictError } from "@/lib/errors";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { loadDuplicateGroups, combinePerformers } from "@/lib/data/performer-duplicates";
import { loadWorkspaceSnapshot } from "@/lib/data/cast-import";
import {
  parseCombineBody,
  matchRequestedGroups,
  CAST_LIST_CHANGED,
  type CombineCounts,
} from "@/lib/performer-duplicates";

type Ctx = { params: Promise<{ id: string }> };

// Combine same-name performers. The request names member sets; the server recomputes the groups
// from fresh rows and only runs sets that match a current, unblocked group exactly, so a stale
// review or a forged id can never merge two different people or a row from another production.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await idParams(params);
    await assertProductionInOrg(orgId, id);
    const requested = parseCombineBody(await request.json());

    const groups = matchRequestedGroups(requested, await loadDuplicateGroups(id));
    if (!groups) throw new ConflictError(CAST_LIST_CHANGED);

    const counts: CombineCounts = { groups: 0, castingsMoved: 0, measurementsFilled: 0, performersRemoved: 0 };
    for (const g of groups) {
      const dropIds = g.members.filter((m) => m.performerId !== g.keepId).map((m) => m.performerId);
      try {
        const r = await combinePerformers(id, g.keepId, dropIds);
        counts.groups += 1;
        counts.castingsMoved += r.castings_moved;
        counts.measurementsFilled += r.measurements_filled;
        counts.performersRemoved += r.performers_removed;
      } catch (err) {
        // Groups already combined stay combined; tell the client how far it got.
        if (err instanceof ConflictError) {
          return NextResponse.json({ error: err.message, completed: counts.groups }, { status: 409 });
        }
        throw err;
      }
    }

    const workspace = await loadWorkspaceSnapshot(id);
    return NextResponse.json({ counts, workspace });
  } catch (err) {
    return errorResponse(err);
  }
}
