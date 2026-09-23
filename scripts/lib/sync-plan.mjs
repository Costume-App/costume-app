// Per-beat time warp for a training video section: raw-take spans are
// stretched so each beat (a recorder point() or zoom()) lands SHOW_LAG_S
// after the narration sentence it illustrates starts ("tell, then show").
// Audio is never warped; the footage follows the voice. Extracted as pure
// functions from listing-stack-headshot/scripts/build-synced-video.mjs,
// whose comments explain every constant (each was set after a real review).
export const SYNC = Object.freeze({
  HEAD_TRIM_S: 0.75,      // page-load flash at every take's head
  LEAD_IN_S: 0.5,         // quiet before a section's first sentence
  TAIL_S: 0.6,            // quiet after its last
  MIN_GAP_S: 0.35,        // between paragraphs
  SHOW_LAG_S: 0.55,       // a beat lands this long after its sentence starts
  MAX_LAG_FRACTION: 0.6,  // but never past this much of the sentence
  MIN_STRETCH: 0.62,      // fastest playback (about 1.6x)
  MAX_STRETCH: 1.8,       // slowest before freezing instead
  MIN_SEG_RAW_S: 0.3,     // ignore markers closer together than this
  MAX_PAUSE_S: 5.0,       // cap on dead air after a section's last sentence
  CARD_S: 3.0,            // title card length, both ends
  CARD_NARR_START_S: 0.8, // welcome narration starts on the intro card
});

export function narrationLayout(paragraphSeconds, { first }) {
  const start = first ? SYNC.CARD_NARR_START_S - SYNC.CARD_S : SYNC.LEAD_IN_S;
  const paraAt = [];
  let t = start;
  for (const dur of paragraphSeconds) {
    paraAt.push(t);
    t += dur + SYNC.MIN_GAP_S;
  }
  const narrEnd = t - SYNC.MIN_GAP_S;
  return { paraAt, narrEnd, outDur: Math.max(narrEnd + SYNC.TAIL_S, 1.0) };
}

export function flattenSentences(paragraphSeconds, paraAt, byPara) {
  const out = [];
  paragraphSeconds.forEach((dur, k) => {
    const list = byPara?.[`p${String(k).padStart(2, "0")}`];
    if (list?.length) {
      for (const s of list) {
        out.push({
          start: paraAt[k] + s.start,
          end: paraAt[k] + s.end,
          text: s.text,
          words: (s.words ?? []).map((w) => ({ text: w.text, start: paraAt[k] + w.start, end: paraAt[k] + w.end })),
        });
      }
    } else {
      out.push({ start: paraAt[k], end: paraAt[k] + dur, text: "", words: [] });
    }
  });
  return out;
}

export function prepareMarkers(beats, room) {
  return beats
    .map((b) => ({ ...b, t: b.t - SYNC.HEAD_TRIM_S }))
    .filter((m) => m.t > SYNC.MIN_SEG_RAW_S && m.t < room - SYNC.MIN_SEG_RAW_S)
    .sort((a, b) => a.t - b.t);
}

export function planSegments({ markers, sentences, room, outDur }) {
  const nB = markers.length;
  const nS = sentences.length;

  // Resolve each beat to a sentence. A declared s wins; otherwise spread
  // evenly (a guess, which the builder log flags).
  const resolved = [];
  for (let k = 0; k < nB; k++) {
    const declared = markers[k].s;
    const idx = Number.isInteger(declared)
      ? Math.min(declared, nS - 1)
      : Math.min(nS - 1, Math.round(((k + 0.5) * nS) / nB));
    if (sentences[idx]) resolved.push({ k, idx });
  }

  // Beats sharing one sentence are distributed across it, not stacked.
  const shareCount = new Map();
  for (const { idx } of resolved) shareCount.set(idx, (shareCount.get(idx) || 0) + 1);
  const seen = new Map();
  const pairs = [];
  for (const { k, idx } of resolved) {
    const sent = sentences[idx];
    const dur = sent.end - sent.start;
    const lag = Math.min(SYNC.SHOW_LAG_S, dur * SYNC.MAX_LAG_FRACTION);
    const m = shareCount.get(idx);
    const j = seen.get(idx) || 0;
    seen.set(idx, j + 1);
    const spread = m > 1 ? (j * Math.max(0, dur - lag)) / m : 0;
    pairs.push({ raw: markers[k].t, out: sent.start + lag + spread });
  }
  pairs.sort((a, b) => a.raw - b.raw);

  // Both axes strictly increasing: nudge, never drop.
  const pts = [{ raw: 0, out: 0 }];
  for (const p of pairs) {
    const prev = pts[pts.length - 1];
    const raw = Math.max(p.raw, prev.raw + SYNC.MIN_SEG_RAW_S);
    const out = Math.max(p.out, prev.out + 0.2);
    if (raw < room - SYNC.MIN_SEG_RAW_S && out < outDur - 0.2) pts.push({ raw, out });
  }
  pts.push({ raw: room, out: outDur });

  const segs = [];
  for (let j = 0; j < pts.length - 1; j++) {
    const rawDur = pts[j + 1].raw - pts[j].raw;
    const outWant = pts[j + 1].out - pts[j].out;
    if (rawDur <= 0.02 || outWant <= 0.02) continue;
    const start = pts[j].raw + SYNC.HEAD_TRIM_S;
    let end = pts[j + 1].raw + SYNC.HEAD_TRIM_S;
    let factor = outWant / rawDur;
    let freeze = 0;
    if (j === pts.length - 2 && factor < 1) {
      // Trailing static hold: trim it rather than speed it up.
      end = start + outWant;
      factor = 1;
    } else if (factor > SYNC.MAX_STRETCH) {
      factor = SYNC.MAX_STRETCH;
      freeze = outWant - rawDur * SYNC.MAX_STRETCH;
    } else if (factor < SYNC.MIN_STRETCH) {
      factor = SYNC.MIN_STRETCH;
    }
    segs.push({ start, end, factor, freeze });
  }
  return segs;
}

export function segOutDuration(seg) {
  return (seg.end - seg.start) * seg.factor + seg.freeze;
}

export function finalizeSection(inputSegs, narrEnd, outDur) {
  const segs = inputSegs.map((s) => ({ ...s }));
  const played = () => segs.reduce((a, s) => a + segOutDuration(s), 0);
  let actual = Math.max(played(), outDur);
  const last = segs[segs.length - 1];
  let over = actual - (narrEnd + SYNC.MAX_PAUSE_S);
  if (over > 0.05 && last) {
    const dropFreeze = Math.min(over, last.freeze);
    last.freeze -= dropFreeze;
    over -= dropFreeze;
    if (over > 0.05) {
      const spare = Math.max(0, last.end - last.start - SYNC.MIN_SEG_RAW_S);
      last.end -= Math.min(over / last.factor, spare);
    }
    actual = Math.max(played(), narrEnd + SYNC.TAIL_S);
  }
  return { segs, actual, pause: +(actual - narrEnd).toFixed(1) };
}

export function rawToOut(segs, clipT) {
  let acc = 0;
  for (const s of segs) {
    if (clipT >= s.start && clipT <= s.end) return acc + (clipT - s.start) * s.factor;
    acc += segOutDuration(s);
  }
  return null;
}
