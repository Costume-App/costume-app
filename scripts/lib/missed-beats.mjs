// Pure predicate over a built section's raw beats: which ones failed to
// park. record-core.mjs's point() and zoom() are best-effort by design (a
// missed SELECTOR must not cost a whole take, see their comments), so a miss
// is recorded as `ok: false` in markers.json rather than thrown. Nothing
// downstream read `ok` before this, so a missed beat still got built into
// the video with whatever frame happened to be on screen. Extracted as a
// pure function, taking the same `rows` shape build-training-video.mjs
// already builds ({ id, rawBeats }[]), so the builder's refuse-to-build gate
// is unit-testable without ffmpeg or a real markers.json on disk.
export function missedBeats(rows) {
  const out = [];
  for (const row of rows) {
    for (const b of row.rawBeats ?? []) {
      if (b.ok === false) out.push({ section: row.id, beat: b.beat });
    }
  }
  return out;
}
