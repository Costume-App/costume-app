"use client";

import { MakePieceRow } from "@/components/MakePieceRow";
import { RolePhotoStrip, type RolePhoto } from "@/components/RolePhotoStrip";
import { usePersistentState } from "@/lib/use-persistent-state";
import type { Worklist, PieceRow } from "@/lib/tailor-summary";

type WorklistRole = Worklist["roles"][number];

export function MakeWorklist({
  productionId,
  worklist,
  photosByRole,
  onSaved,
}: {
  productionId: string;
  worklist: Worklist;
  photosByRole: Record<string, RolePhoto[]>;
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
  onSaved,
}: {
  productionId: string;
  role: WorklistRole;
  photos: RolePhoto[];
  onSaved: (designId: string, castingId: string, piece: PieceRow | null) => void;
}) {
  const [collapsed, setCollapsed] = usePersistentState<boolean>(
    `nada:prod:${productionId}:summary:role:${role.roleId}:collapsed`,
    false,
  );
  const items = role.garments.flatMap((g) => g.items);
  const made = items.filter((i) => i.made).length;

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-sm text-[var(--muted)]">{collapsed ? "▸" : "▾"}</span>
        <h3 className="font-display text-lg font-semibold">{role.roleName}</h3>
        <span className="ml-auto text-sm font-normal muted">
          {made}/{items.length} made
        </span>
      </button>
      {!collapsed && (
        <>
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
                    onSaved={(piece) => onSaved(g.designId, item.castingId, piece)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
