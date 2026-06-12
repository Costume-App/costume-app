"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePersistentState } from "@/lib/use-persistent-state";
import { formatHeight } from "@/lib/height";
import { MakeAssignment } from "@/components/MakeAssignment";
import type { MakeItem, PieceRow, MeasurementView } from "@/lib/tailor-summary";

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
  makerId: string | null;
  made: boolean;
}

export function MakePieceRow({
  productionId,
  item,
  measurements,
  makers,
  fabricWidths,
  fabricSuppliers,
  onSaved,
}: {
  productionId: string;
  item: MakeItem;
  measurements: MeasurementView[];
  makers: { id: string; name: string; color: string }[];
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean }[];
  onSaved: (piece: PieceRow | null) => void;
}) {
  // Persist per piece so the card stays open after a trip to the measurements page.
  const [open, setOpen] = usePersistentState<boolean>(
    `nada:prod:${productionId}:summary:piece:${item.designId}:${item.castingId}:open`,
    false,
  );
  const [made, setMade] = useState(item.made);
  const defaultWidth = fabricWidths.find((w) => w.isDefault)?.value ?? "";
  const defaultSupplier = fabricSuppliers.find((s) => s.isDefault) ?? null;
  const [type, setType] = useState(item.fabric.type ?? "");
  const [color, setColor] = useState(item.fabric.color ?? "");
  const [width, setWidth] = useState(item.fabric.width ?? defaultWidth);
  const [supplier, setSupplier] = useState(item.fabric.supplier ?? (defaultSupplier?.name ?? ""));
  const [yardage, setYardage] = useState(item.fabric.yardage != null ? String(item.fabric.yardage) : "");
  const [unitCost, setUnitCost] = useState(
    item.fabric.unitCost != null
      ? String(item.fabric.unitCost)
      : defaultSupplier?.pricePerYard != null
        ? String(defaultSupplier.pricePerYard)
        : "",
  );
  const [makerId, setMakerId] = useState<string | null>(item.makerId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Serialize saves so a fast blur-then-toggle (or two quick blurs) can't drop an
  // edit: each call captures its values now and runs after the previous finishes.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  function save(opts?: {
    made?: boolean;
    makerId?: string | null;
    width?: string;
    supplier?: string;
    unitCost?: string;
  }) {
    const uc = opts?.unitCost ?? unitCost;
    const body: PiecePutBody = {
      designId: item.designId,
      castingId: item.castingId,
      source: "make",
      fabricType: type.trim() || null,
      fabricColor: color.trim() || null,
      fabricWidth: (opts?.width ?? width).trim() || null,
      fabricSupplier: (opts?.supplier ?? supplier).trim() || null,
      fabricYardage: yardage.trim() === "" ? null : Number(yardage),
      fabricUnitCost: uc.trim() === "" ? null : Number(uc),
      makerId: opts?.makerId !== undefined ? opts.makerId : makerId,
      made: opts?.made !== undefined ? opts.made : made,
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

  function toggleMade(next: boolean) {
    setMade(next);
    save({ made: next });
  }

  function changeMaker(next: string | null) {
    setMakerId(next);
    save({ makerId: next });
  }

  const fabricLabel = [item.fabric.color, item.fabric.type].filter(Boolean).join(" ");

  return (
    <li className="rounded-lg border border-[var(--field-line)]">
      <div className="flex items-center gap-2 px-3 py-2">
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
          {fabricLabel && <span className="ml-auto text-xs muted">{fabricLabel}</span>}
          <span className="text-[var(--muted)]">{open ? "▾" : "▸"}</span>
        </button>
        <div className="shrink-0">
          <MakeAssignment
            makers={makers}
            makerId={makerId}
            made={made}
            madeLabel=""
            busy={busy}
            onChangeMaker={changeMaker}
            onToggleMade={toggleMade}
          />
        </div>
        {busy && <span className="text-xs muted">Saving…</span>}
      </div>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          <div className="rounded-md bg-[var(--bg)] px-2 py-1.5">
            <Link
              href={`/productions/${productionId}/performers/${item.performerId}?from=summary`}
              className="lbl inline-flex items-center gap-1 hover:text-[var(--red)] hover:underline"
            >
              Measurements <span aria-hidden>↗</span>
            </Link>
            {measurements.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                {measurements.map((m) => (
                  <span key={m.label}>
                    <span className="muted">{m.label}:</span>{" "}
                    {m.key === "height" ? formatHeight(m.value) : `${m.value}${m.unit}`}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm muted">No measurements recorded yet — click to add.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Fabric" value={type} onChange={setType} onBlur={() => void save()} placeholder="Name/Type/Description" />
            <Field label="Color" value={color} onChange={setColor} onBlur={() => void save()} placeholder="Fabric color" />
            {fabricWidths.length > 0 ? (
              <SelectField
                label="Width"
                value={width}
                options={optionValues(fabricWidths.map((w) => w.value), width)}
                onChange={(v) => { setWidth(v); void save({ width: v }); }}
              />
            ) : (
              <Field label="Width" value={width} onChange={setWidth} onBlur={() => void save()} placeholder="Inches" />
            )}
            <Field label="Yardage" value={yardage} onChange={setYardage} onBlur={() => void save()} inputMode="decimal" placeholder="Estimated # of yards" />
            <Field label="$/yd" value={unitCost} onChange={setUnitCost} onBlur={() => void save()} inputMode="decimal" prefix="$" placeholder="Per yard" />
            {fabricSuppliers.length > 0 ? (
              <SelectField
                label="Supplier"
                value={supplier}
                options={optionValues(fabricSuppliers.map((s) => s.name), supplier)}
                onChange={(v) => {
                  setSupplier(v);
                  const picked = fabricSuppliers.find((s) => s.name === v);
                  const nextCost =
                    picked?.pricePerYard != null && unitCost.trim() === ""
                      ? String(picked.pricePerYard)
                      : unitCost;
                  if (nextCost !== unitCost) setUnitCost(nextCost);
                  void save({ supplier: v, unitCost: nextCost });
                }}
              />
            ) : (
              <Field label="Supplier" value={supplier} onChange={setSupplier} onBlur={() => void save()} placeholder="Where to buy" />
            )}
            {error && <p className="col-span-full text-xs text-[var(--red)]">{error}</p>}
          </div>
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
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  inputMode?: "decimal";
  prefix?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm muted">
            {prefix}
          </span>
        )}
        <input
          className={`field !p-1.5 text-sm w-full ${prefix ? "!pl-5" : ""}`}
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
      </div>
    </label>
  );
}

// Build a <select>'s option list: the org list plus the current value if it isn't
// already in the list (so an old free-typed value isn't lost).
function optionValues(list: string[], current: string): string[] {
  const out = [...list];
  if (current && !out.includes(current)) out.unshift(current);
  return out;
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <select className="field !p-1.5 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
