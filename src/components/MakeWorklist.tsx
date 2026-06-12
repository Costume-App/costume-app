"use client";

import { MakePieceRow } from "@/components/MakePieceRow";
import { RolePhotoStrip, type RolePhoto } from "@/components/RolePhotoStrip";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { Worklist, PieceRow, MeasurementView } from "@/lib/tailor-summary";

type WorklistRole = Worklist["roles"][number];

export function MakeWorklist({
  productionId,
  worklist,
  photosByRole,
  measurementsByCasting,
  makers,
  fabricWidths,
  fabricSuppliers,
  onSaved,
}: {
  productionId: string;
  worklist: Worklist;
  photosByRole: Record<string, RolePhoto[]>;
  measurementsByCasting: Record<string, MeasurementView[]>;
  makers: { id: string; name: string; color: string }[];
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  if (worklist.totalItems === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
        Nothing to make yet. Add costume pieces and mark them &ldquo;Make&rdquo;.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {worklist.roles.map((role) => (
        <RoleSection
          key={role.roleId}
          productionId={productionId}
          role={role}
          photos={photosByRole[role.roleId] ?? []}
          measurementsByCasting={measurementsByCasting}
          makers={makers}
          fabricWidths={fabricWidths}
          fabricSuppliers={fabricSuppliers}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function RoleSection({
  productionId,
  role,
  photos,
  measurementsByCasting,
  makers,
  fabricWidths,
  fabricSuppliers,
  onSaved,
}: {
  productionId: string;
  role: WorklistRole;
  photos: RolePhoto[];
  measurementsByCasting: Record<string, MeasurementView[]>;
  makers: { id: string; name: string; color: string }[];
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  const [collapsed, setCollapsed] = usePersistentState<boolean>(
    `nada:prod:${productionId}:summary:role:${role.roleId}:collapsed`,
    false,
  );
  const items = role.garments.flatMap((g) => g.items);
  const made = items.filter((i) => i.made).length;

  return (
    <section className="surface overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="text-sm text-[var(--muted)]">{collapsed ? "▸" : "▾"}</span>
        <h3 className="font-display text-lg font-semibold">{role.roleName}</h3>
        <span className="ml-auto text-sm font-normal muted">
          {made}/{items.length} made
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-2 border-t border-[var(--field-line)] px-3 pb-3 pt-2">
          {role.notes && role.notes.trim() && (
            <p className="whitespace-pre-wrap text-sm muted">{role.notes}</p>
          )}
          <RolePhotoStrip images={photos} />
          {role.garments.map((g) => (
            <div key={g.designId} className="space-y-1">
              <p className="lbl">{g.designName}</p>
              <ul className="space-y-1">
                {g.items.map((item) => (
                  <MakePieceRow
                    key={`${g.designId}:${item.castingId}`}
                    productionId={productionId}
                    item={item}
                    garmentName={g.designName}
                    measurements={measurementsByCasting[item.castingId] ?? []}
                    makers={makers}
                    fabricWidths={fabricWidths}
                    fabricSuppliers={fabricSuppliers}
                    onSaved={(piece) => onSaved(g.designId, item.castingId, piece)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
