import { expect, test } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// Every dynamic segment in this app is a uuid, except share tokens (text).
// A dynamic route or page that reads params directly, by any means, would pass a
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

// A call to the id-check helper, applied straight to the destructured `params` promise. Matching
// only this exact shape (not "idParams(" generally) means a helper call on some other value can't
// be counted as covering `params`.
const HELPER_CALL_RE = /\b(?:idParams|pageIdParams)\(params\)/g;

function helperCallCount(src: string): number {
  return (src.match(HELPER_CALL_RE) ?? []).length;
}

// Everything left over after every helper call is removed from the source. If a handler reads
// params both through the helper and some other way, the other way still shows up here.
function withoutHelperCalls(src: string): string {
  return src.replace(HELPER_CALL_RE, "");
}

// True when the (helper-call-stripped) source still reads `params` some other way: a bare
// `await params`, a member read like `await ctx.params` or `props.params` (the Next 16 page
// idiom), a synchronous `.params` access, or the `use(params)` hook.
function readsParamsDirectly(strippedSrc: string): boolean {
  return (
    /await\s+params\b/.test(strippedSrc) ||
    /\.params\b/.test(strippedSrc) ||
    /\buse\(\s*params\s*\)/.test(strippedSrc)
  );
}

function httpHandlerCount(src: string): number {
  return (src.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []).length;
}

// The predicate a dynamic route or page file must satisfy: no direct read of params anywhere in
// the file, and at least one helper call per exported HTTP handler (pages get a floor of one,
// since a page has no separate per-verb handlers to count).
function passesIdCheck(rel: string, src: string): boolean {
  const stripped = withoutHelperCalls(src);
  if (readsParamsDirectly(stripped)) return false;
  const floor = rel.endsWith("page.tsx") ? 1 : httpHandlerCount(src);
  return helperCallCount(src) >= floor;
}

// --- TDD evidence for the predicate itself, on inline sample sources (no fixture files under
// src/app). Each bypass shape below must be rejected; a correctly converted file must pass. ---

test("predicate rejects a route reading params via a bare await, bypassing the helper", () => {
  const src = `
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ id });
}`;
  expect(passesIdCheck("api/foo/[id]/route.ts", src)).toBe(false);
});

test("predicate rejects a route reading params off ctx, bypassing the helper", () => {
  const src = `
export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  return NextResponse.json({ id });
}`;
  expect(passesIdCheck("api/foo/[id]/route.ts", src)).toBe(false);
});

test("predicate rejects a page reading props.params directly (the Next 16 page idiom)", () => {
  const src = `
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <div>{id}</div>;
}`;
  expect(passesIdCheck("(app)/foo/[id]/page.tsx", src)).toBe(false);
});

test("predicate rejects a page reading params via the use() hook", () => {
  const src = `
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <div>{id}</div>;
}`;
  expect(passesIdCheck("(app)/foo/[id]/page.tsx", src)).toBe(false);
});

test("predicate rejects a second handler in an already-converted file that skips the helper", () => {
  const src = `
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await idParams(params);
  return NextResponse.json({ id });
}
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json({ id });
}`;
  expect(passesIdCheck("api/foo/[id]/route.ts", src)).toBe(false);
});

test("predicate rejects a second handler that never reads params through the helper at all", () => {
  // Same failure mode as above, without leaving a stray `await params` for the direct-read check
  // to catch: the count floor is the backstop for a bypass that doesn't touch params textually
  // (e.g. an id read out of a header or the URL instead).
  const src = `
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await idParams(params);
  return NextResponse.json({ id });
}
export async function DELETE(request: Request, { params }: Ctx) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return NextResponse.json({ id });
}`;
  expect(passesIdCheck("api/foo/[id]/route.ts", src)).toBe(false);
});

test("predicate passes a correctly converted route with multiple handlers", () => {
  const src = `
export async function GET(request: Request, { params }: Ctx) {
  const { id } = await idParams(params);
  return NextResponse.json({ id });
}
export async function DELETE(request: Request, { params }: Ctx) {
  const { id } = await idParams(params);
  return NextResponse.json({ id });
}`;
  expect(passesIdCheck("api/foo/[id]/route.ts", src)).toBe(true);
});

test("predicate passes a correctly converted page", () => {
  const src = `
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await pageIdParams(params);
  return <div>{id}</div>;
}`;
  expect(passesIdCheck("(app)/foo/[id]/page.tsx", src)).toBe(true);
});

// --- The real check, run against every dynamic route and page in the app. ---

test.each(dynamicFiles)("%s reads its params only through idParams or pageIdParams", (rel) => {
  const src = readFileSync(path.join(APP_DIR, rel), "utf8");
  expect(passesIdCheck(rel, src)).toBe(true);
});
