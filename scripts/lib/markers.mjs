// The one place recorder beat markers are rebased from wall-clock ms onto
// the raw clip's own timeline. record-core.mjs takes clipT0 immediately
// before ctx.newPage() (Playwright's recordVideo timeline starts inside
// that call), and point() marks only after a painted frame. What remains
// is the capture pipeline's own latency: the frame that shows an event
// lands a roughly constant time after the JS clock saw it. FRAME_LAG_S is
// that latency, MEASURED with scripts/measure-frame-lag.mjs against the
// _probe "lag" section (see docs/training-videos/README.md), never guessed.
// Adding it here, and only here, shifts every beat and every zoom still
// window by the same amount, so point beats and zoom beats stay consistent.
// Measured 2026-09-23: 30 samples over 3 takes, lag -0.124 to -0.083 s.
export const FRAME_LAG_S = 0;

export function rebaseMarkers(markers, clipT0, lagS = FRAME_LAG_S) {
  const t = (ms) => +((ms - clipT0) / 1000 + lagS).toFixed(3);
  return markers.map((m) => {
    const out = { beat: m.beat, t: t(m.at), ok: m.ok, s: m.s };
    if (m.pos) out.pos = m.pos;
    if (m.zoom) {
      const { stillAt, ...rest } = m.zoom;
      out.zoom = { ...rest, stillT: t(stillAt) };
    }
    return out;
  });
}
