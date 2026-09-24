// Pure helpers for measuring how far a recorded frame trails the recorder's
// beat mark. measure-frame-lag.mjs crops a small box at each beat's cursor
// position out of the raw webm, reads a chroma average per frame with
// ffmpeg signalstats, and asks when the amber dot first shows up there.

/** `ffmpeg ... signalstats,metadata=print:key=<key>:file=-` stdout to
 * [{ t, v }]. metadata=print logs at info level, so without :file=- the
 * output goes to the log and `-v error` swallows it. */
export function parseSignalStats(text, key) {
  const out = [];
  let t = null;
  for (const line of text.split("\n")) {
    const frame = line.match(/pts_time:(-?[\d.]+)/);
    if (frame) {
      t = Number(frame[1]);
      continue;
    }
    const kv = line.match(/^([\w.]+)=(-?[\d.]+)/);
    if (kv && kv[1] === key && t !== null) out.push({ t, v: Number(kv[2]) });
  }
  return out;
}

const median = (xs) => {
  const a = [...xs].sort((p, q) => p - q);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

/** First frame at or after markT - searchBackS whose value departs from the
 * baseline (median over [markT - baselineFromS, markT - baselineToS], when
 * the cursor is known to be elsewhere) by more than `threshold`. */
export function arrivalTime(series, markT, { baselineFromS = 1.2, baselineToS = 0.7, searchBackS = 0.6, threshold = 6 } = {}) {
  const base = series.filter((p) => p.t >= markT - baselineFromS && p.t <= markT - baselineToS);
  if (base.length === 0) return null;
  const b = median(base.map((p) => p.v));
  const hit = series.find((p) => p.t >= markT - searchBackS && Math.abs(p.v - b) > threshold);
  return hit ? hit.t : null;
}

/** The constant to add at the rebase: the WORST observed lag (so the frame
 * at every mark already shows the settled cursor), plus one 25 fps frame of
 * margin, rounded up to 10 ms. A mark a frame late costs nothing on camera;
 * a mark a frame early freezes a gliding cursor. */
export function lagConstant(lags) {
  if (lags.length === 0) throw new Error("no lag samples");
  const worst = Math.max(...lags);
  return Math.max(0, Math.ceil((worst + 0.04) * 100 - 1e-9) / 100);
}
