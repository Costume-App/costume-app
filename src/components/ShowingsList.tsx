import { formatShowDate, formatShowTime } from "@/lib/countdown";

interface Showing {
  id: string;
  show_date: string;
  show_time: string | null;
}

// Read-only list of a production's showings (date + optional time). Pure
// presentation — safe to use from server and client components.
export function ShowingsList({ showings }: { showings: Showing[] }) {
  if (showings.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {showings.map((s) => (
        <li key={s.id} className="text-sm muted">
          {formatShowDate(s.show_date)}
          {s.show_time ? ` · ${formatShowTime(s.show_time)}` : ""}
        </li>
      ))}
    </ul>
  );
}
