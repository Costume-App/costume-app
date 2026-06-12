import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { COSTUME_SOURCES, sourceLabel, DEFAULT_SOURCE, isCostumeSource, defaultSourceFor } from "@/lib/costume-sources";

test("sources expose token + label and a make default", () => {
  expect(DEFAULT_SOURCE).toBe("make");
  expect(COSTUME_SOURCES.map((s) => s.token)).toEqual(["make", "on_hand", "shared", "purchase"]);
  expect(sourceLabel("on_hand")).toBe("On hand");
  expect(sourceLabel("purchase")).toBe("Purchase");
  expect(sourceLabel("nope")).toBe("Make"); // unknown falls back to default label
});

test("isCostumeSource guards the union", () => {
  expect(isCostumeSource("shared")).toBe(true);
  expect(isCostumeSource("purchase")).toBe(true);
  expect(isCostumeSource("borrow")).toBe(false);
});

test("defaultSourceFor returns make for an unlinked design", () => {
  expect(defaultSourceFor({ inventory_item_id: null })).toBe("make");
});

test("defaultSourceFor returns on_hand for an inventory-linked design", () => {
  expect(defaultSourceFor({ inventory_item_id: "i1" })).toBe("on_hand");
});

// Drift guard: the app's source enum must match the DB CHECK constraint on
// costume_pieces.source. Adding a source without a migration to widen the
// constraint (as happened with 'purchase' before 0020) fails here.
test("COSTUME_SOURCES matches the costume_pieces.source DB CHECK constraint", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  // The effective constraint is the LAST `source in (...)` defined across migrations.
  const matches = [...sql.matchAll(/source\s+in\s*\(([^)]*)\)/gi)];
  expect(matches.length).toBeGreaterThan(0);
  const dbValues = matches[matches.length - 1][1]
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean)
    .sort();
  const enumValues = COSTUME_SOURCES.map((s) => s.token).sort();
  expect(dbValues).toEqual(enumValues);
});
