"use client";

import { useState } from "react";
import { MeasurementDot } from "@/components/MeasurementDot";
import { NoteIcon, ImageIcon, ShirtIcon } from "@/components/role-icons";

// Collapsible key explaining the indicator icons on each collapsed role card row.
export function RoleIconLegend() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="link-muted text-sm">
        ▸ Key
      </button>
    );
  }

  return (
    <div className="surface space-y-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="lbl">Key</span>
        <button type="button" onClick={() => setOpen(false)} className="link-muted text-sm">
          Hide
        </button>
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-center gap-2">
          <NoteIcon />
          <span>Role has notes</span>
        </li>
        <li className="flex items-center gap-2">
          <ImageIcon />
          <span>Role has photos</span>
        </li>
        <li className="flex items-center gap-2">
          <MeasurementDot status="none" />
          <span>Measurements — none captured yet</span>
        </li>
        <li className="flex items-center gap-2">
          <MeasurementDot status="partial" />
          <span>Measurements — some cast measured</span>
        </li>
        <li className="flex items-center gap-2">
          <MeasurementDot status="complete" />
          <span>Measurements — all cast measured</span>
        </li>
        <li className="flex items-center gap-2">
          <ShirtIcon done={false} />
          <span>Costume pieces still to make</span>
        </li>
        <li className="flex items-center gap-2">
          <ShirtIcon done />
          <span>All pieces sourced — nothing to make</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="text-xs muted">(no shirt)</span>
          <span>No costume pieces added yet</span>
        </li>
      </ul>
    </div>
  );
}
