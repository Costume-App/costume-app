// Pure planning for scripts/upload-training-videos.mjs: which objects to put
// in the training-videos bucket and the manifest entry that points at them.
// Paths are content-addressed, so a re-cut video gets a new path and the
// year-long CDN cache never serves a stale cut.
import { createHash } from "node:crypto";

export const BUCKET = "training-videos";
export const MAX_OBJECT_BYTES = 52428800; // Supabase Free plan per-object cap
// Kept equal to TRAINING_VIDEOS in src/lib/training-videos/catalog.ts by a test.
export const UPLOADABLE_SLUGS = [
  "getting-started",
  "roles-and-cast",
  "measurements",
  "costume-creations",
  "house-inventory",
  "sharing-and-billing",
];

const TYPES = { mp4: "video/mp4", vtt: "text/vtt", jpg: "image/jpeg" };

export function contentPath(slug, ext, bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  return `${slug}/${hash}.${ext}`;
}

function checkFile(slug, ext, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new Error(`${slug}.${ext} is empty`);
  }
  if (bytes.byteLength > MAX_OBJECT_BYTES) {
    throw new Error(`${slug}.${ext} is ${bytes.byteLength} bytes, over the 50 MB per-object cap`);
  }
}

export function planUpload({ slug, mp4, vtt, poster, durationS, manifest }) {
  if (!UPLOADABLE_SLUGS.includes(slug)) {
    throw new Error(`Refusing to upload "${slug}": not an approved training video slug`);
  }
  const files = { mp4, vtt, jpg: poster };
  for (const [ext, b] of Object.entries(files)) checkFile(slug, ext, b);
  if (!new TextDecoder().decode(vtt.subarray(0, 6)).startsWith("WEBVTT")) {
    throw new Error(`${slug}.vtt does not start with WEBVTT`);
  }
  if (!Number.isFinite(durationS) || durationS <= 0) {
    throw new Error(`${slug}: implausible duration ${durationS}`);
  }

  const objects = Object.entries(files).map(([ext, b]) => ({
    path: contentPath(slug, ext, b),
    contentType: TYPES[ext],
    bytes: b,
  }));
  const entry = {
    mp4: objects[0].path,
    vtt: objects[1].path,
    poster: objects[2].path,
    durationS: Math.round(durationS * 1000) / 1000,
  };
  const prev = manifest[slug];
  const unchanged =
    !!prev &&
    prev.mp4 === entry.mp4 &&
    prev.vtt === entry.vtt &&
    prev.poster === entry.poster &&
    prev.durationS === entry.durationS;
  return { objects, entry, manifest: { ...manifest, [slug]: entry }, unchanged };
}

export function serializeManifest(manifest) {
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
