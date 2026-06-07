"use client";

import type { Dispatch, SetStateAction } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { CollapsibleRole } from "@/components/CollapsibleRole";
import { Tabs } from "@/components/Tabs";
import { RoleNotesPanel } from "@/components/RoleNotesPanel";
import { RoleCastPanel } from "@/components/RoleCastPanel";
import { RoleCostumePanel } from "@/components/RoleCostumePanel";
import type { MeasureStatus, Role, Performer, Casting, Cast } from "@/components/ProductionWorkspace";
import type { CostumeDesign } from "@/lib/data/costume-designs";
import type { CostumePiece } from "@/lib/data/costume-pieces";

type RoleTab = "ideas" | "cast" | "costume";

export function RoleCard({
  role,
  productionId,
  selectedCastId,
  tint,
  edge,
  performers,
  setPerformers,
  castings,
  setCastings,
  measurementStatus,
  casts,
  designs,
  setDesigns,
  pieces,
  setPieces,
}: {
  role: Role;
  productionId: string;
  selectedCastId: string;
  tint: string;
  edge: string;
  performers: Performer[];
  setPerformers: Dispatch<SetStateAction<Performer[]>>;
  castings: Casting[];
  setCastings: Dispatch<SetStateAction<Casting[]>>;
  measurementStatus: Record<string, MeasureStatus>;
  casts: Cast[];
  designs: CostumeDesign[];
  setDesigns: Dispatch<SetStateAction<CostumeDesign[]>>;
  pieces: CostumePiece[];
  setPieces: Dispatch<SetStateAction<CostumePiece[]>>;
}) {
  const [open, setOpen] = usePersistentState<boolean>(`nada:prod:${productionId}:role:${role.id}:open`, false);
  const [activeTab, setActiveTab] = usePersistentState<RoleTab>(
    `nada:prod:${productionId}:role:${role.id}:tab`,
    "ideas",
  );

  const primary = castings.find(
    (c) => c.castId === selectedCastId && c.roleId === role.id && c.assignment === "primary",
  );
  const summary = primary ? performers.find((p) => p.id === primary.performerId)?.name ?? "—" : "—";

  return (
    <CollapsibleRole
      title={role.name}
      summary={summary}
      open={open}
      onToggle={() => setOpen((o) => !o)}
      tint={tint}
      edge={edge}
    >
      <Tabs
        tabs={[
          { id: "ideas", label: "Ideas & Notes" },
          { id: "cast", label: "Cast & Measure" },
          { id: "costume", label: "Costume" },
        ]}
        active={activeTab}
        onChange={(id) => setActiveTab(id as RoleTab)}
      />
      {activeTab === "ideas" && (
        <RoleNotesPanel productionId={productionId} roleId={role.id} notes={role.notes} />
      )}
      {activeTab === "cast" && (
        <RoleCastPanel
          productionId={productionId}
          role={role}
          selectedCastId={selectedCastId}
          performers={performers}
          setPerformers={setPerformers}
          castings={castings}
          setCastings={setCastings}
          measurementStatus={measurementStatus}
        />
      )}
      {activeTab === "costume" && (
        <RoleCostumePanel
          productionId={productionId}
          role={role}
          selectedCastId={selectedCastId}
          castings={castings}
          performers={performers}
          casts={casts}
          designs={designs}
          setDesigns={setDesigns}
          pieces={pieces}
          setPieces={setPieces}
        />
      )}
    </CollapsibleRole>
  );
}
