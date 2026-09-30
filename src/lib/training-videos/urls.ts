import { TRAINING_VIDEOS_BUCKET, type TrainingVideoManifest, type TrainingVideoSlug } from "./catalog";

export interface TrainingVideoSources {
  src: string;
  captions: string;
  poster: string;
  durationS: number;
}

export function publicObjectUrl(supabaseUrl: string, path: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${TRAINING_VIDEOS_BUCKET}/${encoded}`;
}

// Null means "render no player": the slug is not uploaded yet, or the server
// has no SUPABASE_URL to build the URLs from.
export function trainingVideoSources(
  slug: TrainingVideoSlug,
  manifest: TrainingVideoManifest,
  supabaseUrl: string | undefined,
): TrainingVideoSources | null {
  const entry = manifest[slug];
  if (!entry || !supabaseUrl) return null;
  return {
    src: publicObjectUrl(supabaseUrl, entry.mp4),
    captions: publicObjectUrl(supabaseUrl, entry.vtt),
    poster: publicObjectUrl(supabaseUrl, entry.poster),
    durationS: entry.durationS,
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
