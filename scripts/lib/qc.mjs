// Pure helpers for training-video QC. A long freeze is not proof of a bug
// (a zoom hold or a title card is static by design), but an UNEXPLAINED one
// usually is: footage that stopped while narration kept going.
export function parseFreezes(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const s = line.match(/freeze_start=([\d.]+)/);
    if (s) out.push({ start: Number(s[1]), duration: null });
    const d = line.match(/freeze_duration=([\d.]+)/);
    if (d && out.length) out[out.length - 1].duration = Number(d[1]);
  }
  return out;
}

export function unexplainedFreezes(freezes, sidecar, { cardS, totalS }) {
  const explained = [
    { start: 0, end: cardS },
    { start: totalS - cardS, end: totalS },
    ...(sidecar.zooms ?? []).map((z) => ({ start: z.start, end: z.end })),
  ];
  return freezes.filter((f) => {
    const end = f.start + (f.duration ?? 0);
    return !explained.some((e) => f.start >= e.start - 0.5 && end <= e.end + 0.5);
  });
}
