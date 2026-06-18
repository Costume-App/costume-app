"use client";

import { MEASUREMENT_MARKERS, type DiagramView } from "@/lib/body-diagram";

// A simple, stylized human outline (front and back share the shape). viewBox is
// 100 wide × 220 tall; markers are positioned over it with percentage offsets.
const SILHOUETTE =
  "M50 31 C58 31 63 36 63 44 L70 56 C74 60 75 70 73 80 L68 84 C66 76 64 70 63 66 " +
  "L63 96 C63 104 61 112 60 120 L62 150 C63 170 64 195 62 212 L54 212 C53 195 52 172 50 152 " +
  "C48 172 47 195 46 212 L38 212 C36 195 37 170 38 150 L40 120 C39 112 37 104 37 96 " +
  "L37 66 C36 70 34 76 32 84 L27 80 C25 70 26 60 30 56 L37 44 C37 36 42 31 50 31 Z";

function View({ view, activeKey }: { view: DiagramView; activeKey?: string }) {
  const markers = Object.entries(MEASUREMENT_MARKERS).filter(([, m]) => m.view === view);
  return (
    <div className="flex flex-1 flex-col items-center">
      <div className="relative w-full max-w-[180px]" style={{ aspectRatio: "100 / 220" }}>
        <svg viewBox="0 0 100 220" className="h-full w-full" aria-hidden="true">
          <circle cx="50" cy="18" r="13" fill="var(--field-line)" />
          <path d={SILHOUETTE} fill="var(--field-line)" />
        </svg>
        {markers.map(([key, m]) => {
          const active = key === activeKey;
          return (
            <div
              key={key}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
              style={{ left: `${m.x}%`, top: `${m.y}%` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface,#fff)] transition-transform"
                style={{
                  background: active ? "var(--red)" : "var(--muted)",
                  transform: active ? "scale(1.6)" : "scale(1)",
                }}
              />
              <span
                className="whitespace-nowrap text-[10px] leading-none"
                style={{ color: active ? "var(--red)" : "var(--muted)", fontWeight: active ? 600 : 400 }}
              >
                {m.label}
              </span>
            </div>
          );
        })}
      </div>
      <span className="mt-1 text-xs muted capitalize">{view}</span>
    </div>
  );
}

export function BodyDiagram({ activeKey }: { activeKey?: string }) {
  return (
    <div className="flex gap-4">
      <View view="front" activeKey={activeKey} />
      <View view="back" activeKey={activeKey} />
    </div>
  );
}
