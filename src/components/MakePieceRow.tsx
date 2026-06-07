"use client";

import { useRef, useState } from "react";
import type { MakeItem, PieceRow } from "@/lib/tailor-summary";

interface PiecePutBody {
  designId: string;
  castingId: string;
  source: "make";
  fabricType: string | null;
  fabricColor: string | null;
  fabricWidth: string | null;
  fabricSupplier: string | null;
  fabricYardage: number | null;
  fabricUnitCost: number | null;
  made: boolean;
}

export function MakePieceRow({
  productionId,
  item,
  onSaved,
}: {
  productionId: string;
  item: MakeItem;
  onSaved: (piece: PieceRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState(item.made);
  const [type, setType] = useState(item.fabric.type ?? "");
  const [color, setColor] = useState(item.fabric.color ?? "");
  const [width, setWidth] = useState(item.fabric.width ?? "");
  const [supplier, setSupplier] = useState(item.fabric.supplier ?? "");
  const [yardage, setYardage] = useState(item.fabric.yardage != null ? String(item.fabric.yardage) : "");
  const [unitCost, setUnitCost] = useState(item.fabric.unitCost != null ? String(item.fabric.unitCost) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Serialize saves so a fast blur-then-toggle (or two quick blurs) can't drop an
  // edit: each call captures its values now and runs after the previous finishes.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  function save(nextMade = made) {
    const body: PiecePutBody = {
      designId: item.designId,
      castingId: item.castingId,
      source: "make",
      fabricType: type.trim() || null,
      fabricColor: color.trim() || null,
      fabricWidth: width.trim() || null,
      fabricSupplier: supplier.trim() || null,
      fabricYardage: yardage.trim() === "" ? null : Number(yardage),
      fabricUnitCost: unitCost.trim() === "" ? null : Number(unitCost),
      made: nextMade,
    };
    setBusy(true);
    saveChain.current = saveChain.current.then(() => sendSave(body));
  }

  async function sendSave(body: PiecePutBody) {
    setError(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/pieces`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save");
        return;
      }
      const { piece } = (await res.json()) as { piece: PieceRow | null };
      onSaved(piece);
    } catch {
      setError("Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  function toggleMade() {
    const next = !made;
    setMade(next);
    save(next);
  }

  return (
    <li className="rounded-lg border border-[var(--field-line)]">
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          type="checkbox"
          checked={made}
          onChange={toggleMade}
          aria-label={`Mark ${item.performerName}'s ${item.castName} piece made`}
          className="h-4 w-4 accent-[var(--red)]"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex flex-1 items-center gap-2 text-left text-sm ${made ? "muted line-through" : ""}`}
        >
          <span className="font-medium">{item.performerName}</span>
          <span className="text-xs muted">
            {item.castName}
            {item.assignment === "understudy" ? " · u/s" : ""}
          </span>
          {item.fabric.type && <span className="ml-auto text-xs muted">{item.fabric.type}</span>}
          <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        </button>
        {busy && <span className="text-xs muted">Saving…</span>}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 sm:grid-cols-3">
          <Field label="Fabric" value={type} onChange={setType} onBlur={() => void save()} />
          <Field label="Color" value={color} onChange={setColor} onBlur={() => void save()} />
          <Field label="Width" value={width} onChange={setWidth} onBlur={() => void save()} placeholder={'e.g. 60"'} />
          <Field label="Yardage" value={yardage} onChange={setYardage} onBlur={() => void save()} inputMode="decimal" />
          <Field label="$/yd" value={unitCost} onChange={setUnitCost} onBlur={() => void save()} inputMode="decimal" />
          <Field label="Supplier" value={supplier} onChange={setSupplier} onBlur={() => void save()} />
          {error && <p className="col-span-full text-xs text-[var(--red)]">{error}</p>}
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <input
        className="field !p-1.5 text-sm"
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </label>
  );
}
