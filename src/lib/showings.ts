export interface ShowingInput {
  date: string;
  time: string | null;
  label: string | null;
}

// Clean the create form's in-memory showing rows before submit: trim dates, drop
// rows with a blank date, normalize a blank time to null, trim/null the label,
// and dedupe exact (date, time) pairs while preserving first-seen order.
export function normalizeShowings(rows: { date: string; time: string; label?: string }[]): ShowingInput[] {
  const seen = new Set<string>();
  const out: ShowingInput[] = [];
  for (const row of rows) {
    const date = row.date.trim();
    if (!date) continue;
    const time = row.time.trim() || null;
    const key = `${date}|${time ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = (row.label ?? "").trim() || null;
    out.push({ date, time, label });
  }
  return out;
}
