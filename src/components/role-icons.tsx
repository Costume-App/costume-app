// Shared role-card header icons, reused by RoleCard and the icon legend.

export function NoteIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Has notes"
    >
      <title>Has notes</title>
      <path d="M5 3h10l4 4v14H5z" />
      <path d="M15 3v4h4" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

export function ImageIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Has photos"
    >
      <title>Has photos</title>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L5 20" />
    </svg>
  );
}

export function ShirtIcon({ done }: { done: boolean }) {
  // A short-sleeved shirt with a square collar notch.
  // Filled = nothing left to make; outline = pieces still to make.
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={done ? "var(--red)" : "none"}
      stroke={done ? "var(--red)" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={done ? "All pieces sourced" : "Pieces to make"}
    >
      <title>{done ? "All pieces sourced" : "Pieces to make"}</title>
      <path d="M3 7L6 10L8 9V20H16V9L18 10L21 7L17 4H15V7H9V4H7Z" />
    </svg>
  );
}
