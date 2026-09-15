// Display form of a name: trimmed, internal whitespace collapsed. Casing is kept as written.
export function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Match key: exact full-name comparison that ignores case, spacing and light punctuation.
// Never fuzzy — two people who share a surname stay different people.
export function matchKey(s: string): string {
  return cleanName(s.toLowerCase().replace(/[.,''"’]/g, ""));
}
