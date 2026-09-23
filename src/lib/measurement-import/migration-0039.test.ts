import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { matchKey } from "@/lib/cast-import/normalize";

// 0039 re-checks two app rules inside import_measurement_forms. These guard the SQL copies
// against drifting from the TypeScript originals.
const sql = readFileSync(join(process.cwd(), "supabase/migrations/0039_measurement_import_race_guards.sql"), "utf8");

test("the notes cap in SQL matches MAX_PERFORMER_NOTES", () => {
  // performers.ts is server-only, so read the constant from its source.
  const source = readFileSync(join(process.cwd(), "src/lib/data/performers.ts"), "utf8");
  const cap = source.match(/export const MAX_PERFORMER_NOTES = (\d+);/)?.[1];
  expect(cap).toBeDefined();
  expect(sql).toContain(`v_notes_length > ${cap}`);
});

test("the SQL match key strips the same punctuation as matchKey", () => {
  const source = readFileSync(join(process.cwd(), "src/lib/cast-import/normalize.ts"), "utf8");
  const tsClass = source.match(/replace\(\/\[([^\]]+)\]\/g/)?.[1];
  expect(tsClass).toBeDefined();
  // SQL doubles the single quote inside its string literal.
  const sqlClass = [...new Set(tsClass)].join("").replace(/'/g, "''");
  expect(sql).toContain(`'[${sqlClass}]'`);
  expect(matchKey("  O'Brien,  Ana. ")).toBe("obrien ana");
});
