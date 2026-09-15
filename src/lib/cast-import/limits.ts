// Client-safe limits for cast-list import, shared by the upload box and the server.
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB
export const MAX_TEXT_CHARS = 50_000;
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"] as const;
