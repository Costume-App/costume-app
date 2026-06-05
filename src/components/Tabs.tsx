"use client";

export interface TabDef {
  id: string;
  label: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 border-b border-[var(--field-line)]">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`-mb-px border-b-2 px-1 pb-2 pt-1 text-sm font-semibold ${
              on ? "border-[var(--red)] text-[var(--red)]" : "border-transparent text-[var(--muted)]"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
