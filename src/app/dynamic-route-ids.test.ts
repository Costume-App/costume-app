import { expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Every dynamic segment in this app is a uuid, except share tokens (text).
// A dynamic route or page that reads `await params` directly would pass a
// malformed id to Postgres and 500; it must go through idParams/pageIdParams.
const APP_DIR = path.resolve(__dirname);
const TEXT_PARAM_FILES = new Set([
  "api/shares/[token]/accept/route.ts",
  "(app)/share/[token]/page.tsx",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const dynamicFiles = walk(APP_DIR)
  .map((f) => path.relative(APP_DIR, f).split(path.sep).join("/"))
  .filter((rel) => /(^|\/)route\.ts$|(^|\/)page\.tsx$/.test(rel))
  .filter((rel) => rel.includes("["))
  .filter((rel) => !rel.includes("[[..."))
  .filter((rel) => !TEXT_PARAM_FILES.has(rel));

test("the walk finds every dynamic route and page", () => {
  // 38 uuid-param API routes + 3 pages. A drop means the walk broke, not that files vanished.
  expect(dynamicFiles.length).toBeGreaterThanOrEqual(41);
});

test.each(dynamicFiles)("%s reads its params through idParams or pageIdParams", (rel) => {
  const src = readFileSync(path.join(APP_DIR, rel), "utf8");
  expect(src).not.toMatch(/await\s+params\b/);
  const helper = rel.endsWith("page.tsx") ? "pageIdParams(params)" : "idParams(params)";
  expect(src).toContain(helper);
});
