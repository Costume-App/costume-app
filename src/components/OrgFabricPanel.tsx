"use client";

import { useEffect, useState } from "react";

type Width = { id: string; value: string; is_default: boolean };
type Supplier = { id: string; name: string; price_per_yard: number | null; is_default: boolean };

export function FabricTabIcon() {
  // Spool-of-thread glyph for the custom profile-page label.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <line x1="6" y1="8" x2="18" y2="8" />
      <line x1="6" y1="16" x2="18" y2="16" />
    </svg>
  );
}

export function OrgFabricPanel() {
  const [widths, setWidths] = useState<Width[] | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newWidth, setNewWidth] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/org/fabric-settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { widths?: Width[]; suppliers?: Supplier[] }) => {
        if (!active) return;
        setWidths(d.widths ?? []);
        setSuppliers(d.suppliers ?? []);
      })
      .catch(() => active && setError("Couldn't load fabric settings."));
    return () => {
      active = false;
    };
  }, []);

  async function reload() {
    const r = await fetch("/api/org/fabric-settings", { credentials: "include" });
    if (r.ok) {
      const d = (await r.json()) as { widths?: Width[]; suppliers?: Supplier[] };
      setWidths(d.widths ?? []);
      setSuppliers(d.suppliers ?? []);
    }
  }

  async function send(path: string, method: string, body?: unknown) {
    setError(null);
    const res = await fetch(path, {
      method,
      credentials: "include",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Action failed (admins only).");
      return false;
    }
    await reload();
    return true;
  }

  async function addWidth() {
    if (!newWidth.trim()) return;
    if (await send("/api/org/fabric-settings/widths", "POST", { value: newWidth })) setNewWidth("");
  }

  async function addSupplier() {
    if (!newSupplier.trim()) return;
    const price = newPrice.trim() === "" ? null : Number(newPrice);
    if (await send("/api/org/fabric-settings/suppliers", "POST", { name: newSupplier, pricePerYard: price })) {
      setNewSupplier("");
      setNewPrice("");
    }
  }

  if (error && !widths) return <p className="text-sm text-[var(--red)]">{error}</p>;
  if (!widths || !suppliers) return <p className="text-sm muted">Loading fabric settings…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold">Fabric settings</h2>
        <p className="mt-1 text-sm muted">Defaults that seed new pieces and the AI yardage estimate. Admins only.</p>
      </div>

      <section>
        <h3 className="mb-2 font-medium">Widths</h3>
        <ul className="space-y-1">
          {widths.map((w) => (
            <li key={w.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{w.value}</span>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/widths/${w.id}`, "PATCH", { isDefault: true })}>
                {w.is_default ? "★ default" : "set default"}
              </button>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/widths/${w.id}`, "DELETE")}>
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <input className="field !p-1.5 text-sm" value={newWidth} onChange={(e) => setNewWidth(e.target.value)} placeholder='e.g. 54"' />
          <button type="button" className="btn-primary" onClick={() => void addWidth()}>Add width</button>
        </div>
      </section>

      <section>
        <h3 className="mb-2 font-medium">Suppliers</h3>
        <ul className="space-y-1">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{s.name}</span>
              <span className="muted">{s.price_per_yard != null ? `$${s.price_per_yard}/yd` : "—"}</span>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "PATCH", { isDefault: true })}>
                {s.is_default ? "★ default" : "set default"}
              </button>
              <button type="button" className="link-muted text-xs" onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "DELETE")}>
                remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="field !p-1.5 text-sm" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Supplier name" />
          <input className="field !p-1.5 text-sm w-28" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" placeholder="$/yd" />
          <button type="button" className="btn-primary" onClick={() => void addSupplier()}>Add supplier</button>
        </div>
      </section>

      {error && <p className="text-sm text-[var(--red)]">{error}</p>}
    </div>
  );
}
