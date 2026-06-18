export type DiagramView = "front" | "back";

// A measurement's span, drawn as a line on the silhouette to show where/how the
// measurement is taken: horizontal across the body for circumferences (chest, waist),
// vertical for lengths (height, inseam), or diagonal along a limb (sleeve). Endpoints
// use the same 0–100 percentage space as the dot position.
export interface MarkerLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Marker {
  label: string;
  view: DiagramView;
  // Position as a percentage (0–100) of the silhouette box, so the diagram can place
  // an HTML dot over the SVG without depending on the SVG's internal coordinate units.
  x: number;
  y: number;
  // The measurement's span line, in the same 0–100 percentage space.
  line: MarkerLine;
}

// Where each *dimensional* measurement is taken. Abstract fields (weight, shirt/pant/shoe
// size) intentionally have no marker. Coordinates are tuned against the silhouettes in
// BodyDiagram and are the single source of truth for the dot, the label, and the span line.
export const MEASUREMENT_MARKERS: Record<string, Marker> = {
  height: { label: "Height", view: "front", x: 22, y: 50, line: { x1: 22, y1: 2, x2: 22, y2: 96.5 } },
  head: { label: "Head", view: "front", x: 50, y: 8, line: { x1: 38, y1: 8, x2: 62, y2: 8 } },
  neck: { label: "Neck", view: "front", x: 50, y: 16, line: { x1: 43, y1: 16, x2: 57, y2: 16 } },
  shoulder: { label: "Shoulder", view: "front", x: 64, y: 22, line: { x1: 32, y1: 22, x2: 68, y2: 22 } },
  chest: { label: "Chest", view: "front", x: 50, y: 30, line: { x1: 36, y1: 30, x2: 64, y2: 30 } },
  arm_circumference: { label: "Arm", view: "front", x: 72, y: 31, line: { x1: 66, y1: 33, x2: 84, y2: 33 } },
  sleeve: { label: "Sleeve", view: "front", x: 84, y: 43, line: { x1: 66, y1: 23, x2: 86, y2: 49 } },
  wrist: { label: "Wrist", view: "front", x: 86, y: 51, line: { x1: 79, y1: 49, x2: 90, y2: 49 } },
  waist: { label: "Waist", view: "front", x: 50, y: 43, line: { x1: 36, y1: 43, x2: 64, y2: 43 } },
  hips: { label: "Hips", view: "front", x: 50, y: 51, line: { x1: 36, y1: 51, x2: 64, y2: 51 } },
  thigh: { label: "Thigh", view: "front", x: 43, y: 62, line: { x1: 36, y1: 62, x2: 50, y2: 62 } },
  inseam: { label: "Inseam", view: "front", x: 50, y: 70, line: { x1: 50, y1: 62, x2: 50, y2: 95 } },
  knee: { label: "Knee", view: "front", x: 43, y: 78, line: { x1: 36, y1: 78, x2: 50, y2: 78 } },
  outseam: { label: "Outseam", view: "front", x: 30, y: 86, line: { x1: 37, y1: 43, x2: 37, y2: 95 } },
  back_length: { label: "Back length", view: "back", x: 50, y: 30, line: { x1: 50, y1: 16, x2: 50, y2: 43 } },
  nape_to_floor: { label: "Nape to floor", view: "back", x: 56, y: 55, line: { x1: 54, y1: 15, x2: 54, y2: 95 } },
};
