"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePersistentState } from "@/lib/use-persistent-state";
import { formatHeight } from "@/lib/height";
import { MakeAssignment } from "@/components/MakeAssignment";
import { PlanLimitNotice } from "@/components/PlanLimitNotice";
import { AddToInventoryControl } from "@/components/AddToInventoryControl";
import { PhotoStrip } from "@/components/PhotoStrip";
import type { MakeItem, PieceRow, MeasurementView, Fabric } from "@/lib/tailor-summary";
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
  skirtLengthIn: number | null;
  calculatedYardage: number | null;
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
  // Per-piece length override, in inches — e.g. a knee-length skirt for a role
  // whose other pieces are floor-length. Pre-filled from the performer's outseam
  // ("waist to ankle") when no override is stored yet, so the field starts at a
  // sensible value the designer can type over. Only a value that genuinely
  // diverges from that outseam is ever persisted (`resolveLengthOverride`
  // below) — otherwise the stored length would freeze at whatever the outseam
  // happened to be on last save, and a later re-measurement would never flow
  // through to the estimate.
  const outseamIn = measurementInches(measurements, "outseam");
  const [length, setLength] = useState<string>(
    item.fabric.skirtLengthIn != null
      ? String(item.fabric.skirtLengthIn)
      : outseamIn != null
        ? String(outseamIn)
        : "",
  );
  const [makerId, setMakerId] = useState<string | null>(item.makerId ?? null);
  // The yardage value the calculator itself last produced — kept separate
  // from `yardage` (what the field displays) so the "Measurements changed"
  // prompt (see `shouldOfferYardageUpdate`) can tell a genuine staleness
  // (the field still shows this value, but the live estimate has moved on)
  // apart from a deliberate manual override (the field shows something else
  // entirely, which is the user's choice, not a claim about measurements).
  // Persisted as `calculated_yardage`, not merely tracked in memory — so a
  // hand-typed or AI-written value (which never sets this column) is never
  // mistaken for a stale calculator output after a reload.
  //
  // Seeded via `seedCalculatorYardage`, pulled out for the same reason
  // `deriveCalculatedYardage` below was: `item.fabric.yardage` and
  // `item.fabric.calculatedYardage` are both typed `number | null`, so a
  // field swap here would typecheck clean and stay green — the extracted
  // function is what puts that swap under direct test.
  const [calculatorYardage, setCalculatorYardage] = useState<number | null>(
    seedCalculatorYardage(item.fabric),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  // Serialize saves so a fast blur-then-toggle (or two quick blurs) can't drop an
  // edit: each call captures its values now and runs after the previous finishes.
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const waistIn = measurementInches(measurements, "waist");
  const widthIn = parseWidthInches(width);
  // The effective length: the field's own value if it holds a real positive
  // number that genuinely diverges from the outseam, otherwise the performer's
  // outseam. If neither is available, length is a missing measurement like
  // waist or width.
  const lengthOverrideIn = resolveLengthOverride(length, outseamIn);
  const effectiveLengthIn = lengthOverrideIn ?? outseamIn;
  // True only when the field holds non-blank text that fails the positive-
  // number check (0, negative, non-numeric) — as opposed to being blank, or
  // holding a value that simply matches the outseam. Drives visible feedback
  // instead of silently substituting the outseam and leaving the rejected
  // text sitting there unexplained.
  const lengthInvalid = length.trim() !== "" && parsePositiveNumber(length) == null;

  // Recomputed for display; the value itself is saved on change, not on render.
  const estimate = useMemo(() => {
    if (!construction || waistIn == null || effectiveLengthIn == null || widthIn == null) return null;
    try {
      return estimateSkirtYardage({
        construction: construction as SkirtConstruction,
        waistInches: waistIn,
        lengthInches: effectiveLengthIn,
        fabricWidthInches: widthIn,
        fullness: construction === "gathered" ? Number(fullness) : undefined,
      });
    } catch {
      return null;
    }
  }, [construction, fullness, waistIn, effectiveLengthIn, widthIn]);

  // What the user has to supply before a number is possible. `missingWaist` and
  // `missingLength` map to an actual performer measurement (waist directly;
  // length via outseam, since the Length field itself is right here) — only
  // those justify the Measurements-page link. `missingWidth` is a field two
  // columns to the left on this same row, never on the measurements page.
  const missingWaist = waistIn == null;
  const missingLength = effectiveLengthIn == null;
  const missingWidth = widthIn == null;
  const missing = construction
    ? [
        missingWaist ? "waist" : null,
        missingLength ? "length" : null,
        missingWidth ? "fabric width" : null,
      ].filter((x): x is string => x !== null)
    : [];
  const missingMeasurement = construction ? missingWaist || missingLength : false;

  // Shared by every path that can change the estimate's inputs (construction,
  // fullness, width, length). Takes width and length in explicitly rather than
  // reading the `widthIn`/`effectiveLengthIn` computed above, because an edit to
  // either needs to compute against its *new* value before that value has
  // round-tripped through state.
  function computeYardage(
    nextConstruction: string,
    nextFullness: string,
    nextWidthIn: number | null,
    nextLengthIn: number | null,
  ): string | undefined {
    if (!nextConstruction || waistIn == null || nextLengthIn == null || nextWidthIn == null) {
      return undefined;
    }
    try {
      const r = estimateSkirtYardage({
        construction: nextConstruction as SkirtConstruction,
        waistInches: waistIn,
        lengthInches: nextLengthIn,
        fabricWidthInches: nextWidthIn,
        fullness: nextConstruction === "gathered" ? Number(nextFullness) : undefined,
      });
      return String(r.yards);
    } catch {
      // Leave the yardage alone; `missing` or the thrown case is surfaced in the UI.
      return undefined;
    }
  }

  // Applies a freshly computed yardage. The tracker always takes the new value —
  // it records what the calculator produced, regardless of what is displayed.
  // The visible field is only replaced when it is NOT a manual override: a
  // number the user typed is theirs, and a recompute offers rather than imposes
  // (see `shouldOfferCalculatorValue` and the prompt it drives).
  function applyComputedYardage(nextYardage: string | undefined) {
    if (nextYardage == null) return;
    if (!isManualOverride(yardage, calculatorYardage)) setYardage(nextYardage);
    setCalculatorYardage(Number(nextYardage));
  }

  function applyConstruction(nextConstruction: string, nextFullness: string) {
    const nextYardage = computeYardage(nextConstruction, nextFullness, widthIn, effectiveLengthIn);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      construction: nextConstruction,
      fullness: nextFullness,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
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
    const nextYardage = computeYardage(construction, fullness, parseWidthInches(nextWidth), effectiveLengthIn);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      width: nextWidth,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
  }

  // Length has the identical not-yet-flushed-state hazard as width: compute
  // against the field's *new* value explicitly, falling back to outseam only
  // when the new value itself isn't a usable override.
  function applyLength(nextLength: string) {
    if (!construction) {
      void save({ length: nextLength });
      return;
    }
    const nextEffectiveLength = resolveLengthOverride(nextLength, outseamIn) ?? outseamIn;
    const nextYardage = computeYardage(construction, fullness, widthIn, nextEffectiveLength);
    const override = isManualOverride(yardage, calculatorYardage);
    applyComputedYardage(nextYardage);
    void save({
      length: nextLength,
      yardage: override ? undefined : nextYardage,
      calculatedYardage: nextYardage,
    });
  }

  function save(opts?: {
    made?: boolean;
    makerId?: string | null;
    width?: string;
    length?: string;
    supplier?: string;
    unitCost?: string;
    construction?: string;
    fullness?: string;
    yardage?: string;
    calculatedYardage?: string;
  }) {
    const uc = opts?.unitCost ?? unitCost;
    const yd = opts?.yardage ?? yardage;
    const con = opts?.construction ?? construction;
    const ful = opts?.fullness ?? fullness;
    const len = opts?.length ?? length;
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
      skirtLengthIn: con ? resolveLengthOverride(len, outseamIn) : null,
      // On a recompute that left an override in place, `yardage` is omitted so
      // fabric_yardage keeps the user's number, while `calculatedYardage` still
      // carries the figure the calculator just produced. Reading opts rather
      // than state matters: setCalculatorYardage has not flushed yet.
      calculatedYardage: deriveCalculatedYardage(
        opts?.calculatedYardage ?? opts?.yardage,
        calculatorYardage,
      ),
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
            {construction && (
              <Field
                label="Length"
                value={length}
                onChange={setLength}
                onBlur={() => applyLength(length)}
                inputMode="decimal"
                placeholder="Inches"
                warn={lengthInvalid}
                hint={
                  lengthInvalid
                    ? outseamIn != null
                      ? `"${length.trim()}" isn't a valid length — using the outseam (${outseamIn}") until you enter a positive number.`
                      : `"${length.trim()}" isn't a valid length — enter a positive number of inches.`
                    : outseamIn != null
                      ? `Defaults to the outseam (${outseamIn}") — type over it for a shorter/longer piece.`
                      : "No outseam recorded yet — enter the skirt length directly."
                }
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
                estimate
                  ? "Calculated from the measurements — type over it to override, or clear it to hand it back."
                  : construction
                    ? "Enter yardage manually until the measurements below are filled in."
                    : "Leave blank to have the system estimate yardage."
              }
            />
            {construction && (
              <div className="col-span-full rounded-md bg-[var(--bg)] px-2 py-1.5">
                {missing.length > 0 ? (
                  <p className="text-xs muted">
                    Add {joinList(missing)} to calculate yardage.
                    {missingMeasurement && (
                      <>
                        {" "}
                        <Link
                          href={`/productions/${productionId}/performers/${item.performerId}?from=summary`}
                          className="link-red"
                        >
                          Measurements ↗
                        </Link>
                      </>
                    )}
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
                    {shouldOfferYardageUpdate(yardage, estimate.yards, calculatorYardage) && (
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium text-[var(--red)] hover:underline"
                        onClick={() => {
                          const next = String(estimate.yards);
                          applyComputedYardage(next);
                          void save({ yardage: next });
                        }}
                      >
                        Measurements changed — update to {estimate.yards} yd
                      </button>
                    )}
                    {shouldOfferCalculatorValue(yardage, estimate.yards, calculatorYardage) && (
                      <button
                        type="button"
                        className="mt-1 text-xs font-medium text-[var(--red)] hover:underline"
                        onClick={() => {
                          const next = String(estimate.yards);
                          setYardage(next);
                          setCalculatorYardage(estimate.yards);
                          void save({ yardage: next, calculatedYardage: next });
                        }}
                      >
                        Calculator says {estimate.yards} yd — use it
                      </button>
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

// Parses the free-typed Length field. Blank or non-positive/non-finite text is
// "no override" rather than an error — the caller falls back to outseam.
function parsePositiveNumber(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Whether the Length field holds a genuine override of the performer's
// outseam — used identically by the compute path (what number to estimate
// against) and the save path (what to persist as `skirt_length_in`).
//
// A parsed value that merely *equals* the current outseam is not an override:
// it is almost always the outseam pre-fill (see the `length` state initializer
// in the component) echoed straight back, because `applyConstruction` saves on
// every construction pick, well before the designer has typed anything. Once
// that was persisted, the field would initialize from the stored number on
// every future load instead of from the (possibly since-changed) outseam, so
// a re-measurement would never reach the estimate — a silent under-buy. Blank
// or invalid text (see `parsePositiveNumber`) is likewise "no override".
export function resolveLengthOverride(rawLength: string, outseamIn: number | null): number | null {
  const parsed = parsePositiveNumber(rawLength);
  if (parsed == null) return null;
  return outseamIn != null && parsed === outseamIn ? null : parsed;
}

// Whether to show the "Measurements changed" nudge beneath the derivation.
// It must fire only on genuine staleness: the Yardage field still holds the
// calculator's own last output (`lastCalculatedYardage`), and the live
// estimate has since diverged from it — e.g. a re-measurement moved the
// effective length. It must NOT fire on a blank field (`Number("")` is 0, a
// false "divergence"), and it must NOT fire when the designer has typed a
// different number on purpose: that is a deliberate override, not evidence
// that measurements changed, and nagging about it forever would misdescribe
// the designer's own choice.
export function shouldOfferYardageUpdate(
  yardageText: string,
  estimateYards: number,
  lastCalculatedYardage: number | null,
): boolean {
  if (yardageText.trim() === "" || lastCalculatedYardage == null) return false;
  const current = Number(yardageText);
  if (!Number.isFinite(current) || current !== lastCalculatedYardage) return false;
  return estimateYards !== lastCalculatedYardage;
}

// Whether the Yardage field currently holds a number the user typed rather than
// one the calculator produced. This is what a recompute checks before replacing
// the field: a value the user chose is theirs to keep, and silently swapping it
// for a smaller computed one is the under-buy failure this whole feature exists
// to prevent.
//
// A blank field is deliberately NOT an override — clearing the field is how a
// user hands the piece back to the calculator, and it is the only way to do so.
// Non-numeric text is not an override either: there is nothing to protect, and
// treating it as one would freeze the field on a typo.
export function isManualOverride(
  yardageText: string,
  calculatorYardage: number | null,
): boolean {
  if (yardageText.trim() === "") return false;
  const current = Number(yardageText);
  if (!Number.isFinite(current)) return false;
  // No calculator history, but a real number in the field: it came from the user
  // or the AI, either way not from this calculator, so protect it.
  if (calculatorYardage == null) return true;
  return current !== calculatorYardage;
}

// The override counterpart to `shouldOfferYardageUpdate`. That one fires when
// the field still shows the calculator's own number and the estimate has moved
// away from it. This one fires when the field shows the user's number instead —
// offering the calculator's latest figure without ever imposing it.
//
// The two are mutually exclusive by construction: that predicate requires
// `current === lastCalculatedYardage`, this one requires the opposite. A test
// asserts it across a matrix, because they are maintained separately.
export function shouldOfferCalculatorValue(
  yardageText: string,
  estimateYards: number,
  lastCalculatedYardage: number | null,
): boolean {
  if (yardageText.trim() === "" || lastCalculatedYardage == null) return false;
  const current = Number(yardageText);
  if (!Number.isFinite(current)) return false;
  // Calculator-controlled — the other prompt owns this case.
  if (current === lastCalculatedYardage) return false;
  // Nothing to offer if the calculator agrees with what they typed.
  return estimateYards !== current;
}

// What `save` persists as `calculated_yardage` — extracted from the inline
// body-builder so this ternary, the actual fix for the override-reverting
// bug, is under direct test rather than only exercised incidentally through
// `save()`.
//
// `optsYardage` is `save`'s own `opts.yardage` — present only on a recompute
// (a construction/width/length change, or the "Measurements changed" button),
// where it holds the exact string `computeYardage` just produced. When
// present, that value IS the calculator's output, full stop. When absent —
// a manual edit, a maker change, a made toggle — there was no recompute, so
// the previously tracked value carries through unchanged; this is what lets
// a deliberate override permanently diverge from the live estimate and
// silence the "Measurements changed" prompt for this piece instead of having
// every unrelated save quietly re-stamp it as calculator-derived.
export function deriveCalculatedYardage(
  optsYardage: string | undefined,
  trackedCalculatorYardage: number | null,
): number | null {
  return optsYardage !== undefined ? Number(optsYardage) : trackedCalculatorYardage;
}

// What seeds `calculatorYardage` on mount/reload — extracted from the inline
// `item.fabric.calculatedYardage ?? null` for the same reason as
// `deriveCalculatedYardage` above: `yardage` and `calculatedYardage` are both
// typed `number | null`, so a field swap here (reading `yardage` instead of
// `calculatedYardage`) would typecheck clean and pass every existing test —
// which is exactly the failure this branch exists to prevent, since it would
// make every hand-typed override look calculator-derived again. `yardage` is
// included in the parameter type on purpose, even though it's unused: it's
// what makes a field swap fail this function's own assertion instead of only
// failing to compile.
export function seedCalculatorYardage(
  fabric: Pick<Fabric, "yardage" | "calculatedYardage">,
): number | null {
  return fabric.calculatedYardage ?? null;
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
  warn,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  inputMode?: "decimal";
  prefix?: string;
  hint?: string;
  // Renders `hint` as a warning instead of a muted aside — for feedback the
  // user needs to notice (e.g. a rejected Length value), not routine help text.
  warn?: boolean;
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
      {hint && (
        <span className={`text-[11px] leading-tight ${warn ? "text-[var(--red)]" : "muted"}`}>{hint}</span>
      )}
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
