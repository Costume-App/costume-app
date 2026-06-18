"use client";

import { MEASUREMENT_MARKERS, type DiagramView } from "@/lib/body-diagram";

// A simple, stylized human outline (front and back share the shape). viewBox is
// 100 wide × 220 tall; markers are positioned over it with percentage offsets.
const SILHOUETTE =
  "M50 31 C57 33 64 40 70 50 C78 62 86 84 88 104 L82 108 C76 92 68 80 64 72 " +
  "L64 212 L54 212 C53 200 52 170 50 146 C48 170 47 200 46 212 L36 212 L36 72 " +
  "C32 80 24 92 18 108 L12 104 C14 84 22 62 30 50 C36 40 43 33 50 31 Z";

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
