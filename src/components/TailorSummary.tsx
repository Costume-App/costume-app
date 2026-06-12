"use client";

import { useMemo, useState } from "react";
import { Tabs } from "@/components/Tabs";
import { MakeWorklist } from "@/components/MakeWorklist";
import { FabricPurchaseList } from "@/components/FabricPurchaseList";
import {
  buildMakeWorklist,
  buildFabricPurchaseList,
  type PieceRow,
  type MeasurementView,
} from "@/lib/tailor-summary";
import type { RolePhoto } from "@/components/RolePhotoStrip";
import { CostumesDueSummary } from "@/components/CostumesDueSummary";

interface Role { id: string; name: string; notes: string | null }
interface Design { id: string; role_id: string; name: string; display_order: number; inventory_item_id: string | null }
interface Casting { id: string; cast_id: string; role_id: string; performer_id: string; assignment: "primary" | "understudy" }
interface Performer { id: string; name: string }
interface Cast { id: string; name: string }

export function TailorSummary({
  productionId,
  roles,
  designs,
  castings,
  performers,
  casts,
  initialPieces,
  photosByRole,
  measurementsByCasting,
  makers,
  costumesDueDate,
  today,
  filterMakerId,
  aiConfigured,
}: {
  productionId: string;
  roles: Role[];
  designs: Design[];
  castings: Casting[];
  performers: Performer[];
  casts: Cast[];
  initialPieces: PieceRow[];
  photosByRole: Record<string, RolePhoto[]>;
  measurementsByCasting: Record<string, MeasurementView[]>;
  makers: { id: string; name: string; color: string }[];
  costumesDueDate: string | null;
  today: string;
  filterMakerId?: string;
  aiConfigured?: boolean;
}) {
  const [tab, setTab] = useState<"make" | "fabric">("make");
  const [pieces, setPieces] = useState<PieceRow[]>(initialPieces);
  const [estimating, setEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  async function estimateFabric() {
    setEstimating(true);
    setEstimateError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/estimate-fabric`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { pieces: PieceRow[]; estimated: number };
        setPieces(data.pieces);
      } else {
        setEstimateError(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't estimate fabric",
        );
      }
    } catch {
      setEstimateError("Couldn't estimate fabric");
    } finally {
      setEstimating(false);
    }
  }

  const worklist = useMemo(
    () => buildMakeWorklist(roles, designs, castings, performers, casts, pieces, { makerId: filterMakerId }),
    [roles, designs, castings, performers, casts, pieces, filterMakerId],
  );
  const purchase = useMemo(() => {
    const items = worklist.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
    return buildFabricPurchaseList(items);
  }, [worklist]);

  // Reflect a saved piece into local state so both tabs stay live (or drop it
  // when the row was cleared back to the empty default).
  function applySaved(designId: string, castingId: string, piece: PieceRow | null) {
    setPieces((prev) => {
      const rest = prev.filter(
        (p) => !(p.costume_design_id === designId && p.casting_id === castingId),
      );
      return piece ? [...rest, piece] : rest;
    });
  }

  return (
    <div className="space-y-4">
      <CostumesDueSummary
        dueDate={costumesDueDate}
        today={today}
        total={worklist.totalItems}
        made={worklist.madeItems}
      />
      <Tabs
        tabs={[
          {
            id: "make",
            label: `To make${worklist.totalItems ? ` (${worklist.madeItems}/${worklist.totalItems})` : ""}`,
          },
          { id: "fabric", label: "Fabric list" },
        ]}
        active={tab}
        onChange={(id) => setTab(id as "make" | "fabric")}
      />
      {tab === "make" ? (
        <MakeWorklist
          productionId={productionId}
          worklist={worklist}
          photosByRole={photosByRole}
          measurementsByCasting={measurementsByCasting}
          makers={makers}
          onSaved={applySaved}
        />
      ) : (
        <div className="space-y-3">
          {aiConfigured && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={estimateFabric}
                disabled={estimating}
                className="btn-primary"
              >
                {estimating ? "Estimating…" : "✨ Estimate fabric"}
              </button>
              <span className="text-sm muted">fills empty yardages only</span>
            </div>
          )}
          {estimateError && <p className="text-sm text-[var(--red)]">{estimateError}</p>}
          <FabricPurchaseList purchase={purchase} />
        </div>
      )}
    </div>
  );
}
