// Shared plumbing for the training-video pipeline: where footage lives, how
// walkthrough modules load, and the section contract the recorder and the
// builder both consume. Free of playwright/ffmpeg imports so it stays
// unit-testable. Ported (desktop only) from listing-stack-headshot.
import { readdirSync, statSync } from "node:fs";

export const TRAINING_ROOT = "recordings/training";
export const rawDir = (slug) => `${TRAINING_ROOT}/raw/${slug}`;
export const voDir = (slug) => `${TRAINING_ROOT}/vo/${slug}`;
export const workDir = (slug) => `${TRAINING_ROOT}/work/${slug}`;
export const outDir = () => `${TRAINING_ROOT}/out`;
export const qcDir = (slug) => `${TRAINING_ROOT}/qc/${slug}`;

const SAFE_ID = /^[a-z0-9-]+$/;

/** Throws on the first structural problem, naming the section. */
export function validateWalkthrough(w, slug) {
  if (!w || w.slug !== slug) throw new Error(`walkthrough must export WALKTHROUGH with slug "${slug}"`);
  for (const field of ["title", "guideAnchor"]) {
    if (typeof w[field] !== "string" || !w[field]) throw new Error(`${slug}: missing string ${field}`);
  }
  if (!Array.isArray(w.sections) || w.sections.length === 0) throw new Error(`${slug}: sections must be a non-empty array`);
  const ids = new Set();
  for (const s of w.sections) {
    if (typeof s.id !== "string" || !SAFE_ID.test(s.id)) throw new Error(`${slug}: section id "${s.id}" must match ${SAFE_ID}`);
    if (typeof s.heading !== "string" || !s.heading) throw new Error(`${slug}/${s.id}: missing string heading`);
    if (!Number.isFinite(s.targetSeconds) || s.targetSeconds <= 0) throw new Error(`${slug}/${s.id}: targetSeconds must be a positive number`);
    if (typeof s.run !== "function") throw new Error(`${slug}/${s.id}: run must be a function`);
    if (s.prep !== undefined && typeof s.prep !== "function") throw new Error(`${slug}/${s.id}: prep must be a function when present`);
    if (ids.has(s.id)) throw new Error(`${slug}: duplicate section id "${s.id}"`);
    ids.add(s.id);
  }
  return w;
}

export async function loadWalkthrough(slug) {
  // A leading underscore marks a verification-only walkthrough (e.g. _probe).
  if (!/^_?[a-z0-9-]+$/.test(slug)) throw new Error(`Invalid walkthrough slug "${slug}"`);
  let mod;
  try {
    mod = await import(`./walkthroughs/${slug}.mjs`);
  } catch (err) {
    throw new Error(`No walkthrough at scripts/lib/walkthroughs/${slug}.mjs (${err.message})`);
  }
  return validateWalkthrough(mod.WALKTHROUGH, slug);
}

/** The one .webm in a section's take dir. A retake replaces the dir, so
 * "newest by mtime" and "the only one" coincide. Throws with the fix. */
export function sectionClipPath(slug, sectionId) {
  const dir = `${rawDir(slug)}/${sectionId}`;
  let entries = [];
  try {
    entries = readdirSync(dir).filter((n) => n.endsWith(".webm"));
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    throw new Error(`No take for "${slug}/${sectionId}". Run: node scripts/record-training-video.mjs --video ${slug} --section ${sectionId}`);
  }
  entries.sort((a, b) => statSync(`${dir}/${b}`).mtimeMs - statSync(`${dir}/${a}`).mtimeMs);
  return `${dir}/${entries[0]}`;
}

/** m:ss. Round the TOTAL first, or 359.6s prints "5:60". */
export function mmss(totalSeconds) {
  const whole = Math.round(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
