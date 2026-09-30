// Uploads approved training videos to the public training-videos bucket and
// records them in src/lib/training-videos/manifest.json (committed; the app
// renders a player only for slugs listed there).
//
//   node scripts/upload-training-videos.mjs --video <slug>          # dry run
//   node scripts/upload-training-videos.mjs --all                   # dry run
//   node scripts/upload-training-videos.mjs --all --apply           # upload
//
// Reads recordings/training/out/<slug>.mp4 and <slug>.vtt, and generates
// <slug>.poster.jpg there from the title card (1.5 s in) with ffmpeg.
// The bucket is in the single shared Supabase project, so --apply needs the
// owner's go-ahead. The manifest is written only after every object answers
// a public HEAD with 200, the right content type and the right length.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";
import { BUCKET, UPLOADABLE_SLUGS, planUpload, serializeManifest } from "./lib/training-upload.mjs";

const OUT = "recordings/training/out";
const MANIFEST = "src/lib/training-videos/manifest.json";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
const has = (name) => process.argv.includes(`--${name}`);

const one = arg("video");
const slugs = has("all") ? UPLOADABLE_SLUGS : one ? [one] : null;
if (!slugs) {
  console.error("Usage: node scripts/upload-training-videos.mjs (--video <slug> | --all) [--apply]");
  process.exit(2);
}
// Validate before loading env, reading files, or running ffmpeg: an unknown
// slug (including "_probe" or a path) must never touch disk or the network.
for (const slug of slugs) {
  if (!UPLOADABLE_SLUGS.includes(slug)) {
    console.error(`Refusing to upload "${slug}": not an approved training video slug`);
    process.exit(1);
  }
}
const apply = has("apply");

loadEnvLocalIntoProcess();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
console.log(`Target: ${new URL(url).hostname} (bucket ${BUCKET})`);

function readOutput(slug, ext) {
  const p = `${OUT}/${slug}.${ext}`;
  if (!existsSync(p)) throw new Error(`Missing ${p}: build the video first`);
  return new Uint8Array(readFileSync(p));
}

function makePoster(slug) {
  const p = `${OUT}/${slug}.poster.jpg`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", `${OUT}/${slug}.mp4`, "-frames:v", "1", "-q:v", "3", p]);
  return new Uint8Array(readFileSync(p));
}

function probeDuration(slug) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${OUT}/${slug}.mp4`,
  ]).toString().trim();
  return Number(out);
}

async function putObject(o) {
  const { error } = await sb.storage.from(BUCKET).upload(o.path, o.bytes, {
    contentType: o.contentType,
    cacheControl: "31536000",
    upsert: false,
  });
  // Content-addressed: an existing object at this path already holds these bytes.
  if (error && !/exists|duplicate/i.test(error.message)) {
    throw new Error(`Upload failed for ${o.path}: ${error.message}`);
  }
  return error ? "exists" : "uploaded";
}

async function assertPublic(o) {
  const publicUrl = sb.storage.from(BUCKET).getPublicUrl(o.path).data.publicUrl;
  // identity: a compressing CDN must not drop content-length from the response.
  const res = await fetch(publicUrl, { method: "HEAD", headers: { "accept-encoding": "identity" } });
  const type = res.headers.get("content-type") ?? "";
  const length = Number(res.headers.get("content-length"));
  if (res.status !== 200 || !type.startsWith(o.contentType) || length !== o.bytes.byteLength) {
    throw new Error(
      `Public check failed for ${o.path}: status ${res.status}, type "${type}", length ${length} (want ${o.bytes.byteLength})`,
    );
  }
}

let manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
for (const slug of slugs) {
  const plan = planUpload({
    slug,
    mp4: readOutput(slug, "mp4"),
    vtt: readOutput(slug, "vtt"),
    poster: makePoster(slug),
    durationS: probeDuration(slug),
    manifest,
  });
  for (const o of plan.objects) {
    console.log(`${slug}: ${o.path} (${o.contentType}, ${o.bytes.byteLength} bytes)`);
  }
  if (plan.unchanged) {
    if (apply) {
      for (const o of plan.objects) console.log(`${slug}: ${o.path} ${await putObject(o)}`);
      for (const o of plan.objects) await assertPublic(o);
      console.log(`${slug}: manifest already current, objects verified live`);
    } else {
      console.log(`${slug}: manifest already current`);
    }
    continue;
  }
  if (!apply) {
    console.log(`${slug}: dry run, nothing uploaded (add --apply)`);
    continue;
  }
  for (const o of plan.objects) console.log(`${slug}: ${o.path} ${await putObject(o)}`);
  for (const o of plan.objects) await assertPublic(o);
  manifest = plan.manifest;
  writeFileSync(MANIFEST, serializeManifest(manifest));
  console.log(`${slug}: live and recorded in ${MANIFEST}`);
}
