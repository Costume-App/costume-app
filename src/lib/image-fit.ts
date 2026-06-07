// Scale (width, height) so the longest side is at most `max`, preserving aspect
// ratio. Never upscales. Returns integer dimensions.
export function fitWithinMax(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
