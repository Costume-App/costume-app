// Performer height is stored as a single measurement in total inches. These
// helpers convert between that storage form and a feet+inches representation
// used for data entry and display.

// Break total inches into whole feet + remaining inches. Rounds to the nearest
// inch and clamps negatives to zero.
export function splitHeight(totalInches: number): { feet: number; inches: number } {
  const n = Math.max(0, Math.round(totalInches));
  return { feet: Math.floor(n / 12), inches: n % 12 };
}

// Combine feet + inches into total inches.
export function combineHeight(feet: number, inches: number): number {
  return feet * 12 + inches;
}

// Render total inches as e.g. 6'0".
export function formatHeight(totalInches: number): string {
  const { feet, inches } = splitHeight(totalInches);
  return `${feet}'${inches}"`;
}
