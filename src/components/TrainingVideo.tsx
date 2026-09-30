import manifestJson from "@/lib/training-videos/manifest.json";
import {
  trainingVideoTitle,
  type TrainingVideoManifest,
  type TrainingVideoSlug,
} from "@/lib/training-videos/catalog";
import { formatDuration, trainingVideoSources, type TrainingVideoSources } from "@/lib/training-videos/urls";

const manifest: TrainingVideoManifest = manifestJson;

// Server component: renders nothing until the slug has been uploaded by
// scripts/upload-training-videos.mjs, so an un-hosted video never shows a
// broken player.
export function TrainingVideo({ slug, className }: { slug: TrainingVideoSlug; className?: string }) {
  const sources = trainingVideoSources(slug, manifest, process.env.SUPABASE_URL);
  if (!sources) return null;
  return (
    <div className={className}>
      <TrainingVideoPlayer title={trainingVideoTitle(slug)} sources={sources} />
    </div>
  );
}

// crossOrigin is required: the captions file is on the Supabase origin, and
// browsers drop a cross-origin <track> without it.
export function TrainingVideoPlayer({ title, sources }: { title: string; sources: TrainingVideoSources }) {
  return (
    <figure>
      <video
        controls
        preload="none"
        playsInline
        crossOrigin="anonymous"
        poster={sources.poster}
        aria-label={`Training video: ${title}`}
        className="aspect-video w-full rounded-md border border-[var(--field-line)] bg-black"
      >
        <source src={sources.src} type="video/mp4" />
        <track kind="captions" src={sources.captions} srcLang="en" label="English" default />
      </video>
      <figcaption className="mt-1 text-sm muted">
        Video: {title} ({formatDuration(sources.durationS)})
      </figcaption>
    </figure>
  );
}
