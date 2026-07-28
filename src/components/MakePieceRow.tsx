"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePersistentState } from "@/lib/use-persistent-state";
import { formatHeight } from "@/lib/height";
import { MakeAssignment } from "@/components/MakeAssignment";
import { PlanLimitNotice } from "@/components/PlanLimitNotice";
import { AddToInventoryControl } from "@/components/AddToInventoryControl";
import { PhotoStrip } from "@/components/PhotoStrip";
import type { MakeItem, PieceRow, MeasurementView } from "@/lib/tailor-summary";
import {
  estimateSkirtYardage,
  parseWidthInches,
  SKIRT_CONSTRUCTIONS,
  CONSTRUCTION_LABELS,
  type SkirtConstruction,
} from "@/lib/fabric/skirt-yardage";

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
  skirtConstruction: string | null;
  skirtFullness: number | null;
  makerId: string | null;
  made: boolean;
}

export function MakePieceRow({
  productionId,
  item,
  garmentName,
  measurements,
  makers,
  fabricWidths,
  fabricSuppliers,
  onSaved,
}: {
  productionId: string;
  item: MakeItem;
  garmentName: string;
  measurements: MeasurementView[];
  makers: { id: string; name: string; color: string }[];
  fabricWidths: { id: string; value: string; isDefault: boolean }[];
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean; url: string | null }[];
  onSaved: (piece: PieceRow | null) => void;
}) {
  // Persist per piece so the card stays open after a trip to the measurements page.
  const [open, setOpen] = usePersistentState<boolean>(
    `nada:prod:${productionId}:summary:piece:${item.designId}:${item.castingId}:open`,
    false,
  );
  const [made, setMade] = useState(item.made);
  const [promptOpen, setPromptOpen] = useState(false);
  const [addedItemId, setAddedItemId] = useState<string | null>(item.addedInventoryItemId);
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
  const [construction, setConstruction] = useState<string>(item.fabric.skirtConstruction ?? "");
  const [fullness, setFullness] = useState<string>(
    item.fabric.skirtFullness != null ? String(item.fabric.skirtFullness) : "3",
  );
  const [makerId, setMakerId] = useState<string | null>(item.makerId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  // Serialize saves so a fast blur-then-toggle (or two quick blurs) can't drop an
  // edit: each call captures its values now and runs after the previous finishes.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const waistIn = measurementInches(measurements, "waist");
  const lengthIn = measurementInches(measurements, "outseam");
  const widthIn = parseWidthInches(width);

  // Recomputed for display; the value itself is saved on change, not on render.
  const estimate = useMemo(() => {
    if (!construction || waistIn == null || lengthIn == null || widthIn == null) return null;
    try {
      return estimateSkirtYardage({
        construction: construction as SkirtConstruction,
        waistInches: waistIn,
        lengthInches: lengthIn,
        fabricWidthInches: widthIn,
        fullness: construction === "gathered" ? Number(fullness) : undefined,
      });
    } catch {
      return null;
    }
  }, [construction, fullness, waistIn, lengthIn, widthIn]);

  // What the user has to supply before a number is possible.
  const missing = construction
    ? [
        waistIn == null ? "waist" : null,
        lengthIn == null ? "outseam (waist to ankle)" : null,
        widthIn == null ? "fabric width" : null,
      ].filter((x): x is string => x !== null)
    : [];

  // Shared by every path that can change the estimate's inputs (construction,
  // fullness, width). Takes the width in explicitly rather than reading the
  // `widthIn` computed above, because a width edit needs to compute against
  // its *new* value before that value has round-tripped through state.
  function computeYardage(
    nextConstruction: string,
    nextFullness: string,
    nextWidthIn: number | null,
  ): string | undefined {
    if (!nextConstruction || waistIn == null || lengthIn == null || nextWidthIn == null) {
      return undefined;
    }
    try {
      const r = estimateSkirtYardage({
        construction: nextConstruction as SkirtConstruction,
        waistInches: waistIn,
        lengthInches: lengthIn,
        fabricWidthInches: nextWidthIn,
        fullness: nextConstruction === "gathered" ? Number(nextFullness) : undefined,
      });
      return String(r.yards);
    } catch {
      // Leave the yardage alone; `missing` or the thrown case is surfaced in the UI.
      return undefined;
    }
  }

  function applyConstruction(nextConstruction: string, nextFullness: string) {
    const nextYardage = computeYardage(nextConstruction, nextFullness, widthIn);
    if (nextYardage != null) setYardage(nextYardage);
    void save({ construction: nextConstruction, fullness: nextFullness, yardage: nextYardage });
  }

  // Width can change the estimate too (it's part of the same geometry), so it
  // needs the same recompute-and-save treatment — otherwise the Yardage field
  // is left showing a number computed for the *previous* width, which is the
  // exact failure this feature exists to prevent.
  function applyWidth(nextWidth: string) {
    if (!construction) {
      void save({ width: nextWidth });
      return;
    }
    const nextYardage = computeYardage(construction, fullness, parseWidthInches(nextWidth));
    if (nextYardage != null) setYardage(nextYardage);
    void save({ width: nextWidth, yardage: nextYardage });
  }

  function save(opts?: {
    made?: boolean;
    makerId?: string | null;
    width?: string;
    supplier?: string;
    unitCost?: string;
    construction?: string;
    fullness?: string;
    yardage?: string;
  }) {
    const uc = opts?.unitCost ?? unitCost;
    const yd = opts?.yardage ?? yardage;
    const con = opts?.construction ?? construction;
    const ful = opts?.fullness ?? fullness;
    const body: PiecePutBody = {
      designId: item.designId,
      castingId: item.castingId,
      source: "make",
      fabricType: type.trim() || null,
      fabricColor: color.trim() || null,
      fabricWidth: (opts?.width ?? width).trim() || null,
      fabricSupplier: (opts?.supplier ?? supplier).trim() || null,
      fabricYardage: yd.trim() === "" ? null : Number(yd),
      fabricUnitCost: uc.trim() === "" ? null : Number(uc),
      skirtConstruction: con || null,
      skirtFullness: con === "gathered" ? Number(ful) : null,
      makerId: opts?.makerId !== undefined ? opts.makerId : makerId,
      made: opts?.made !== undefined ? opts.made : made,
    };
    setBusy(true);
    saveChain.current = saveChain.current.then(() => sendSave(body));
  }

  async function sendSave(body: PiecePutBody) {
    setError(null);
    setLimitMsg(null);
    try {
      const res = await fetch(`/api/productions/${productionId}/pieces`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        // 402 = the production is at its maker limit on this plan → friendly prompt.
        if (res.status === 402) {
          setLimitMsg(data.error ?? "This production has reached its maker limit.");
        } else {
          setError(data.error ?? "Couldn't save");
        }
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
    if (next && !addedItemId) setPromptOpen(true);
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
                    {m.key === "height" ? formatHeight(Number(m.value)) : `${m.value}${m.unit}`}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm muted">No measurements recorded yet — click to add.</p>
            )}
          </div>
          <PhotoStrip
            endpoint={`/api/productions/${productionId}/designs/${item.designId}/images`}
            max={6}
            readOnly
            label="Picture ideas"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Fabric" value={type} onChange={setType} onBlur={() => void save()} placeholder="Name/Type/Description" />
            <Field label="Color" value={color} onChange={setColor} onBlur={() => void save()} placeholder="Fabric color" />
            {fabricWidths.length > 0 ? (
              <SelectField
                label="Width"
                value={width}
                options={optionValues(fabricWidths.map((w) => w.value), width)}
                onChange={(v) => { setWidth(v); applyWidth(v); }}
              />
            ) : (
              <Field label="Width" value={width} onChange={setWidth} onBlur={() => applyWidth(width)} placeholder="Inches" />
            )}
            <SelectField
              label="Skirt type"
              value={construction ? CONSTRUCTION_LABELS[construction as SkirtConstruction] : ""}
              options={SKIRT_CONSTRUCTIONS.map((c) => CONSTRUCTION_LABELS[c])}
              onChange={(labelValue) => {
                const next =
                  SKIRT_CONSTRUCTIONS.find((c) => CONSTRUCTION_LABELS[c] === labelValue) ?? "";
                setConstruction(next);
                applyConstruction(next, fullness);
              }}
            />
            {construction === "gathered" && (
              <SelectField
                label="Fullness"
                value={fullness}
                options={["2", "2.5", "3"]}
                includeBlank={false}
                onChange={(v) => {
                  setFullness(v);
                  applyConstruction(construction, v);
                }}
              />
            )}
            <Field
              label="Yardage"
              value={yardage}
              onChange={setYardage}
              onBlur={() => void save()}
              inputMode="decimal"
              placeholder="Estimated # of yards"
              hint={
                construction
                  ? "Calculated from the measurements — type over it to override."
                  : "Leave blank to have the system estimate yardage."
              }
            />
            {construction && (
              <div className="col-span-full rounded-md bg-[var(--bg)] px-2 py-1.5">
                {missing.length > 0 ? (
                  <p className="text-xs muted">
                    Add {joinList(missing)} to calculate yardage.{" "}
                    <Link
                      href={`/productions/${productionId}/performers/${item.performerId}?from=summary`}
                      className="link-red"
                    >
                      Measurements ↗
                    </Link>
                  </p>
                ) : estimate ? (
                  <>
                    <span className="lbl block">How this was calculated</span>
                    <ul className="mt-0.5 space-y-0.5 text-[11px] leading-tight muted">
                      {estimate.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                    {estimate.warning && (
                      <p className="mt-1 text-xs text-[var(--red)]">{estimate.warning}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs muted">
                    Couldn&rsquo;t calculate yardage from these values — check the width and measurements.
                  </p>
                )}
              </div>
            )}
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
            {limitMsg && (
              <div className="col-span-full">
                <PlanLimitNotice message={limitMsg} reason="needs_seat" productionId={productionId} />
              </div>
            )}
          </div>
        </div>
      )}
      {promptOpen && (
        <div className="px-3 pb-3">
          <AddToInventoryControl
            productionId={productionId}
            designId={item.designId}
            castingId={item.castingId}
            pieceLabel={`${garmentName} (${item.performerName})`}
            onAdded={(id) => { setAddedItemId(id); setPromptOpen(false); }}
            onDismiss={() => setPromptOpen(false)}
          />
        </div>
      )}
    </li>
  );
}

// Measurements arrive as display rows; the numeric ones carry a number in `value`.
function measurementInches(rows: MeasurementView[], key: string): number | null {
  const row = rows.find((m) => m.key === key);
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// "waist", "waist and outseam", "waist, outseam, and fabric width" — a comma
// before the final "and" once there are 3+ items, instead of stacking "and"s.
function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  inputMode,
  prefix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  inputMode?: "decimal";
  prefix?: string;
  hint?: string;
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
      {hint && <span className="text-[11px] leading-tight muted">{hint}</span>}
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
  includeBlank = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  // Off for pickers like Fullness, where every rendered option is meaningful
  // and an empty selection would only produce bad data (see Fullness below).
  includeBlank?: boolean;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="lbl">{label}</span>
      <select className="field !p-1.5 text-sm w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        {includeBlank && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
