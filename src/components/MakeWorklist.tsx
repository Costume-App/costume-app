"use client";

import { MakePieceRow } from "@/components/MakePieceRow";
import type { Worklist, PieceRow } from "@/lib/tailor-summary";

export function MakeWorklist({
  productionId,
  worklist,
  onSaved,
}: {
  productionId: string;
  worklist: Worklist;
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
        <section key={role.roleId} className="space-y-2">
          <h3 className="font-display text-lg font-semibold">{role.roleName}</h3>
          {role.notes && role.notes.trim() && (
            <p className="whitespace-pre-wrap text-sm muted">{role.notes}</p>
          )}
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
        </section>
      ))}
    </div>
  );
}
