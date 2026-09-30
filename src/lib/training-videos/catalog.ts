// The approved training videos, in series order, and the /guide section each
// one is embedded in. Titles match the H1 of docs/training-videos/scripts/<slug>.md.
export const TRAINING_VIDEOS = [
  { slug: "getting-started", title: "Getting Started", guideSection: "productions" },
  { slug: "roles-and-cast", title: "Roles and Cast", guideSection: "roles" },
  { slug: "measurements", title: "Measurements", guideSection: "measurements" },
  { slug: "costume-creations", title: "Costume Creations", guideSection: "creations" },
  { slug: "house-inventory", title: "House Inventory", guideSection: "inventory" },
  { slug: "sharing-and-billing", title: "Sharing and Billing", guideSection: "sharing" },
] as const;

export type TrainingVideoSlug = (typeof TRAINING_VIDEOS)[number]["slug"];

export const TRAINING_VIDEOS_BUCKET = "training-videos";

// Object paths inside the bucket, as written by scripts/upload-training-videos.mjs.
export interface TrainingVideoFiles {
  mp4: string;
  vtt: string;
  poster: string;
  durationS: number;
}

export type TrainingVideoManifest = Partial<Record<TrainingVideoSlug, TrainingVideoFiles>>;

export function isTrainingVideoSlug(s: string): s is TrainingVideoSlug {
  return TRAINING_VIDEOS.some((v) => v.slug === s);
}

export function videoForGuideSection(sectionId: string): TrainingVideoSlug | null {
  return TRAINING_VIDEOS.find((v) => v.guideSection === sectionId)?.slug ?? null;
}

export function trainingVideoTitle(slug: TrainingVideoSlug): string {
  const found = TRAINING_VIDEOS.find((v) => v.slug === slug);
  if (!found) throw new Error(`Unknown training video: ${slug}`);
  return found.title;
}
