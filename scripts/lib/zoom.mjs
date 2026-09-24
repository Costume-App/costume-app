// Zoom-in beats. The recorder captures a 2x still while the page holds still
// (recordVideo cannot record above CSS resolution, so zoomed video frames
// would be soft). The builder renders the whole zoom, ease in, hold, ease
// out, from that still with ffmpeg zoompan, then overlays it on the section
// at the output window the sync plan maps the hold to.
export const ZOOM = Object.freeze({ SCALE: 1.6, EASE_S: 0.4, MIN_HOLD_S: 0.5, FPS: 30, VIEW_W: 1920, VIEW_H: 1080 });

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function zoomRect(box, scale, vw, vh) {
  const w = vw / scale;
  const h = vh / scale;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { x: clamp(cx - w / 2, 0, vw - w), y: clamp(cy - h / 2, 0, vh - h), w, h };
}

export function zoomWindow(o0, o1, fps = ZOOM.FPS) {
  if (o0 === null || o1 === null || o0 === undefined || o1 === undefined) return null;
  if (o1 - o0 < 2 * ZOOM.EASE_S + ZOOM.MIN_HOLD_S) return null;
  const frames = Math.round((o1 - o0) * fps);
  const easeFrames = Math.min(Math.round(ZOOM.EASE_S * fps), Math.floor(frames / 3));
  return { start: o0, frames, easeFrames };
}

function smooth(p) {
  return p * p * (3 - 2 * p);
}

export function zoomAt(frame, { frames, easeFrames, scale }) {
  let e;
  if (frame < easeFrames) e = smooth(frame / easeFrames);
  else if (frame < frames - easeFrames) e = 1;
  else e = smooth((frames - frame) / easeFrames);
  return 1 + (scale - 1) * e;
}

export function zoompanFilter({ rect, scale, frames, easeFrames, vw, vh, outW, outH, fps }) {
  const N = frames;
  const A = easeFrames;
  const S1 = +(scale - 1).toFixed(6);
  const fx = +((rect.x + rect.w / 2) / vw).toFixed(6);
  const fy = +((rect.y + rect.h / 2) / vh).toFixed(6);
  const inP = `(on/${A})`;
  const outP = `((${N}-on)/${A})`;
  const e = `if(lt(on,${A}),${inP}*${inP}*(3-2*${inP}),if(lt(on,${N - A}),1,${outP}*${outP}*(3-2*${outP})))`;
  const z = `1+${S1}*(${e})`;
  const p = `((zoom-1)/${S1})`;
  const x = `max(0,min(iw-iw/zoom,iw*(0.5+${p}*(${fx}-0.5))-iw/zoom/2))`;
  const y = `max(0,min(ih-ih/zoom,ih*(0.5+${p}*(${fy}-0.5))-ih/zoom/2))`;
  return `zoompan=z='${z}':x='${x}':y='${y}':d=${N}:s=${outW}x${outH}:fps=${fps}`;
}

/** Raw-clip window of a zoom beat's still hold. The zoom marker's own `t`
 * is taken BEFORE the cursor glides to the target (so the beat aligns to
 * the glide's start), but the page only holds still from the moment the
 * still was captured, `stillT`, for `holdS` after it. Starting the overlay
 * at `t + 0.15` made the live cursor jump to its parked position in the
 * still at the overlay's first frame (followups M12). Takes recorded before
 * stillT existed keep their old window, so video 1's raws still build. */
export function zoomRawWindow(b) {
  if (Number.isFinite(b.zoom.stillT)) return { r0: b.zoom.stillT, r1: b.zoom.stillT + b.zoom.holdS };
  return { r0: b.t + 0.15, r1: b.t + b.zoom.holdS - 0.1 };
}
