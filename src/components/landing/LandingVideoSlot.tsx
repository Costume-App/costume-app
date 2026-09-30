import { hostedTrainingVideo, TrainingVideoPlayer } from "@/components/TrainingVideo";
import type { TrainingVideoSlug } from "@/lib/training-videos/catalog";

export function LandingVideoSlot({ slug }: { slug: TrainingVideoSlug | null }) {
  if (!slug) return null;
  const hosted = hostedTrainingVideo(slug);
  if (!hosted) return null;
  return (
    <section className="relative mx-auto max-w-4xl px-5 pt-4">
      <div className="mb-6 text-center">
        <p className="lbl">Take the tour</p>
        <h2 className="mt-1 font-display text-3xl font-semibold sm:text-4xl">See It in Action</h2>
      </div>
      <TrainingVideoPlayer title={hosted.title} sources={hosted.sources} />
    </section>
  );
}
