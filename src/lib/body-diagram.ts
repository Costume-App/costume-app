export type DiagramView = "front" | "back";

export interface Marker {
  label: string;
  view: DiagramView;
  // Position as a percentage (0–100) of the silhouette box, so the diagram can place
  // an HTML dot over the SVG without depending on the SVG's internal coordinate units.
  x: number;
  y: number;
}

// Where each *dimensional* measurement is taken. Abstract fields (weight, shirt/pant/shoe
// size) intentionally have no marker. Coordinates are tuned against the silhouettes in
// BodyDiagram and are the single source of truth for both labels and focus highlighting.
export const MEASUREMENT_MARKERS: Record<string, Marker> = {
  height: { label: "Height", view: "front", x: 22, y: 50 },
  head: { label: "Head", view: "front", x: 50, y: 8 },
  neck: { label: "Neck", view: "front", x: 50, y: 16 },
  shoulder: { label: "Shoulder", view: "front", x: 64, y: 22 },
  chest: { label: "Chest", view: "front", x: 50, y: 30 },
  arm_circumference: { label: "Arm", view: "front", x: 72, y: 33 },
  sleeve: { label: "Sleeve", view: "front", x: 78, y: 44 },
  wrist: { label: "Wrist", view: "front", x: 82, y: 55 },
  waist: { label: "Waist", view: "front", x: 50, y: 43 },
  hips: { label: "Hips", view: "front", x: 50, y: 51 },
  thigh: { label: "Thigh", view: "front", x: 42, y: 62 },
  inseam: { label: "Inseam", view: "front", x: 50, y: 60 },
  knee: { label: "Knee", view: "front", x: 44, y: 78 },
  outseam: { label: "Outseam", view: "front", x: 30, y: 62 },
  back_length: { label: "Back length", view: "back", x: 50, y: 31 },
  nape_to_floor: { label: "Nape to floor", view: "back", x: 56, y: 55 },
};
