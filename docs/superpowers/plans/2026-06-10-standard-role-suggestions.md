# Standard Role Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a production is created, the empty workspace offers to bulk-create a known play's standard character roles — from a curated static catalog, with an on-demand AI fallback.

**Architecture:** A pure catalog module matches the production title to standard roles. The workspace (already a client component) renders a new banner when a production has no roles; the banner either previews curated roles or fetches AI suggestions, then calls a bulk role-creation endpoint. Only roles (characters) are created. The AI call is a thin server helper behind a new route, gracefully disabled when no API key is set.

**Tech Stack:** Next.js 16 (App Router), TypeScript (strict), Supabase (`supabaseAdmin`), Clerk auth, Vitest, `@anthropic-ai/sdk` (Claude Haiku 4.5, structured outputs).

**Conventions to follow (verified in this codebase):**
- Data layer in `src/lib/data/*`, one function per operation, throws `ValidationError`/`NotFoundError`.
- API routes: `getAuthContext()` → `assertProductionInOrg(orgId, id)` → data call → `errorResponse(err)` in catch.
- Tests use Vitest with chained `supabaseAdmin` mocks (data layer) or mocked deps (routes). Node environment — no React component tests exist, so the new component is verified manually.
- Client fetches use `credentials: "include"`.
- Spec: `docs/superpowers/specs/2026-06-10-standard-role-suggestions-design.md`.

---

## File Structure

- **Create** `src/lib/data/play-catalog.ts` — `PlayCatalogEntry`, `PLAY_CATALOG`, `findCuratedMatch`, `normalizeTitle`.
- **Create** `src/lib/data/play-catalog.test.ts` — matcher unit tests.
- **Create** `src/lib/ai/suggest-roles.ts` — `isAiConfigured`, `suggestRolesForTitle` (Anthropic call).
- **Create** `src/app/api/productions/[id]/suggest-roles/route.ts` — POST AI suggestion endpoint.
- **Create** `src/app/api/productions/[id]/suggest-roles/route.test.ts` — route tests.
- **Create** `src/components/RoleSuggestionBanner.tsx` — the banner UI.
- **Modify** `src/lib/data/roles.ts` — add `createRoles` batch insert.
- **Modify** `src/lib/data/roles.test.ts` — `createRoles` tests.
- **Modify** `src/app/api/productions/[id]/roles/route.ts` — accept `{ names: string[] }`.
- **Modify** `src/app/api/productions/[id]/roles/route.test.ts` — bulk-create tests.
- **Modify** `src/components/ProductionWorkspace.tsx` — render the banner.
- **Modify** `src/app/productions/[id]/page.tsx` — compute + pass `roleSuggestion` and `aiEnabled`.
- **Modify** `.env.example` — document `ANTHROPIC_API_KEY`.

---

## Task 1: Play catalog + matcher (pure)

**Files:**
- Create: `src/lib/data/play-catalog.ts`
- Test: `src/lib/data/play-catalog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/data/play-catalog.test.ts`:

```ts
import { expect, test } from "vitest";
import { normalizeTitle, findCuratedMatch, PLAY_CATALOG } from "@/lib/data/play-catalog";

test("normalizeTitle lowercases, trims, strips a leading article and punctuation", () => {
  expect(normalizeTitle("  The Nutcracker! ")).toBe("nutcracker");
  expect(normalizeTitle("A Midsummer Night's Dream")).toBe("midsummer nights dream");
  expect(normalizeTitle("Hamlet")).toBe("hamlet");
});

test("findCuratedMatch matches by canonical title, ignoring case/article/punctuation", () => {
  const match = findCuratedMatch("the hamlet");
  expect(match?.id).toBe("hamlet");
  expect(match?.roles.length).toBeGreaterThan(0);
});

test("findCuratedMatch matches by alias", () => {
  // "The Nutcracker" canonical; alias "nutcracker ballet" should also hit.
  const match = findCuratedMatch("Nutcracker Ballet");
  expect(match?.id).toBe("nutcracker");
});

test("findCuratedMatch returns null for an unknown title", () => {
  expect(findCuratedMatch("Some Original Devised Piece 2026")).toBeNull();
});

test("findCuratedMatch returns null for an empty title", () => {
  expect(findCuratedMatch("   ")).toBeNull();
});

test("every catalog entry has a unique id and non-empty roles", () => {
  const ids = PLAY_CATALOG.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const e of PLAY_CATALOG) expect(e.roles.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/play-catalog.test.ts`
Expected: FAIL — cannot resolve `@/lib/data/play-catalog`.

- [ ] **Step 3: Write the catalog + matcher**

Create `src/lib/data/play-catalog.ts`:

```ts
// A curated, in-repo catalog of common stage productions and their standard
// character roles. Used to offer a one-click "add all roles" when a new
// production's title matches a known play. Extend by adding entries — keep `id`
// a stable kebab-case slug and `roles` in a sensible billing order.

export interface PlayCatalogEntry {
  id: string;
  title: string;
  aliases: string[];
  roles: string[];
}

// Normalize a title for matching: lowercase, strip surrounding whitespace, drop a
// single leading article, remove punctuation, and collapse internal whitespace.
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const PLAY_CATALOG: PlayCatalogEntry[] = [
  {
    id: "hamlet",
    title: "Hamlet",
    aliases: [],
    roles: [
      "Hamlet", "Claudius", "Gertrude", "Polonius", "Ophelia", "Laertes",
      "Horatio", "Rosencrantz", "Guildenstern", "Ghost of King Hamlet",
      "Fortinbras", "Gravedigger", "Osric", "Marcellus", "Bernardo",
    ],
  },
  {
    id: "romeo-and-juliet",
    title: "Romeo and Juliet",
    aliases: ["romeo juliet"],
    roles: [
      "Romeo", "Juliet", "Mercutio", "Tybalt", "Benvolio", "Nurse",
      "Friar Laurence", "Lord Capulet", "Lady Capulet", "Lord Montague",
      "Lady Montague", "Paris", "Prince Escalus", "Balthasar",
    ],
  },
  {
    id: "a-midsummer-nights-dream",
    title: "A Midsummer Night's Dream",
    aliases: ["midsummer nights dream", "midsummer"],
    roles: [
      "Oberon", "Titania", "Puck", "Hermia", "Lysander", "Helena", "Demetrius",
      "Theseus", "Hippolyta", "Egeus", "Nick Bottom", "Peter Quince",
      "Francis Flute", "Snug", "Tom Snout", "Robin Starveling",
    ],
  },
  {
    id: "macbeth",
    title: "Macbeth",
    aliases: [],
    roles: [
      "Macbeth", "Lady Macbeth", "Banquo", "Macduff", "Lady Macduff",
      "King Duncan", "Malcolm", "Donalbain", "Fleance", "Three Witches",
      "Hecate", "Ross", "Lennox",
    ],
  },
  {
    id: "the-nutcracker",
    title: "The Nutcracker",
    aliases: ["nutcracker ballet"],
    roles: [
      "Clara", "The Nutcracker Prince", "Drosselmeyer", "The Mouse King",
      "Sugar Plum Fairy", "Cavalier", "Snow Queen", "Snow King",
      "Mother Ginger", "Dewdrop", "Fritz",
    ],
  },
  {
    id: "swan-lake",
    title: "Swan Lake",
    aliases: [],
    roles: [
      "Odette", "Odile", "Prince Siegfried", "Baron von Rothbart",
      "The Queen Mother", "Benno", "Wolfgang",
    ],
  },
  {
    id: "the-wizard-of-oz",
    title: "The Wizard of Oz",
    aliases: ["wizard of oz"],
    roles: [
      "Dorothy", "Scarecrow", "Tin Man", "Cowardly Lion", "The Wizard",
      "Glinda", "Wicked Witch of the West", "Auntie Em", "Uncle Henry",
      "Toto",
    ],
  },
  {
    id: "a-christmas-carol",
    title: "A Christmas Carol",
    aliases: ["christmas carol"],
    roles: [
      "Ebenezer Scrooge", "Bob Cratchit", "Tiny Tim", "Jacob Marley",
      "Ghost of Christmas Past", "Ghost of Christmas Present",
      "Ghost of Christmas Yet to Come", "Fred", "Mrs. Cratchit",
      "Fezziwig", "Belle",
    ],
  },
  {
    id: "peter-pan",
    title: "Peter Pan",
    aliases: [],
    roles: [
      "Peter Pan", "Wendy Darling", "Captain Hook", "Tinker Bell",
      "John Darling", "Michael Darling", "Smee", "Tiger Lily",
      "Mr. Darling", "Mrs. Darling",
    ],
  },
  {
    id: "cinderella",
    title: "Cinderella",
    aliases: [],
    roles: [
      "Cinderella", "Prince Charming", "Fairy Godmother", "Stepmother",
      "Stepsister (Anastasia)", "Stepsister (Drizella)", "The King",
      "The Grand Duke",
    ],
  },
  {
    id: "the-sound-of-music",
    title: "The Sound of Music",
    aliases: ["sound of music"],
    roles: [
      "Maria Rainer", "Captain Georg von Trapp", "Liesl", "Friedrich",
      "Louisa", "Kurt", "Brigitta", "Marta", "Gretl", "Max Detweiler",
      "Elsa Schraeder", "Mother Abbess", "Rolf",
    ],
  },
  {
    id: "annie",
    title: "Annie",
    aliases: [],
    roles: [
      "Annie", "Oliver Warbucks", "Grace Farrell", "Miss Hannigan",
      "Rooster Hannigan", "Lily St. Regis", "Sandy", "Molly", "Pepper",
      "Duffy", "President Roosevelt",
    ],
  },
];

// Return the first catalog entry whose canonical title or any alias matches the
// given title (normalized), or null when there is no match or the title is blank.
export function findCuratedMatch(title: string): PlayCatalogEntry | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;
  for (const entry of PLAY_CATALOG) {
    const candidates = [entry.title, ...entry.aliases].map(normalizeTitle);
    if (candidates.includes(needle)) return entry;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/play-catalog.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/play-catalog.ts src/lib/data/play-catalog.test.ts
git commit -m "feat: curated play catalog + title matcher for role suggestions"
```

---

## Task 2: `createRoles` batch insert (data layer)

**Files:**
- Modify: `src/lib/data/roles.ts`
- Test: `src/lib/data/roles.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/data/roles.test.ts` these mocks and tests. The existing file already mocks `from`/`select`/`insert` etc.; `createRoles` needs a `select("display_order").eq(...).order(...).limit(1)` read followed by `insert(rows).select()`. Add a fresh, self-contained test block at the end of the file:

```ts
// --- createRoles (batch) ---
import { createRoles } from "@/lib/data/roles";

test("createRoles trims, drops blanks, and appends after the max display_order", async () => {
  // First call: max-order lookup returns highest existing order = 4.
  // The shared `select` mock returns { eq: listEq } -> { order: order1 } -> { order: order2 };
  // createRoles instead calls .order(...).limit(1), so wire a dedicated chain here.
  const limit = vi.fn().mockResolvedValue({ data: [{ display_order: 4 }], error: null });
  const orderDesc = vi.fn(() => ({ limit }));
  const maxEq = vi.fn(() => ({ order: orderDesc }));
  const batchInsertSelect = vi.fn().mockResolvedValue({
    data: [
      { id: "r1", name: "Hamlet", display_order: 5 },
      { id: "r2", name: "Ophelia", display_order: 6 },
    ],
    error: null,
  });
  const batchInsert = vi.fn(() => ({ select: batchInsertSelect }));
  select.mockReturnValue({ eq: maxEq });
  insert.mockReturnValue({ select: batchInsertSelect });
  from.mockReturnValue({ select, insert: batchInsert });

  const rows = await createRoles({ productionId: "p1", names: ["  Hamlet ", "Ophelia", "   "] });

  expect(batchInsert).toHaveBeenCalledWith([
    { production_id: "p1", name: "Hamlet", display_order: 5 },
    { production_id: "p1", name: "Ophelia", display_order: 6 },
  ]);
  expect(rows).toEqual([
    { id: "r1", name: "Hamlet", display_order: 5 },
    { id: "r2", name: "Ophelia", display_order: 6 },
  ]);
});

test("createRoles starts at display_order 0 when the production has no roles", async () => {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const orderDesc = vi.fn(() => ({ limit }));
  const maxEq = vi.fn(() => ({ order: orderDesc }));
  const batchInsertSelect = vi.fn().mockResolvedValue({ data: [{ id: "r1", name: "A", display_order: 0 }], error: null });
  const batchInsert = vi.fn(() => ({ select: batchInsertSelect }));
  select.mockReturnValue({ eq: maxEq });
  from.mockReturnValue({ select, insert: batchInsert });

  await createRoles({ productionId: "p1", names: ["A"] });
  expect(batchInsert).toHaveBeenCalledWith([{ production_id: "p1", name: "A", display_order: 0 }]);
});

test("createRoles rejects when all names are blank", async () => {
  await expect(createRoles({ productionId: "p1", names: ["  ", ""] })).rejects.toBeInstanceOf(ValidationError);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/data/roles.test.ts`
Expected: FAIL — `createRoles` is not exported from `@/lib/data/roles`.

- [ ] **Step 3: Implement `createRoles`**

In `src/lib/data/roles.ts`, add after `createRole` (around line 34):

```ts
export async function createRoles(input: { productionId: string; names: string[] }): Promise<Role[]> {
  const names = input.names.map((n) => n.trim()).filter(Boolean);
  if (names.length === 0) throw new ValidationError("At least one role name is required");

  // Append after any existing roles so display order stays stable.
  const { data: existing, error: maxErr } = await supabaseAdmin
    .from("roles")
    .select("display_order")
    .eq("production_id", input.productionId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (maxErr) throw new Error(maxErr.message);
  const base = existing && existing.length > 0 ? (existing[0].display_order ?? 0) + 1 : 0;

  const rows = names.map((name, i) => ({
    production_id: input.productionId,
    name,
    display_order: base + i,
  }));
  const { data, error } = await supabaseAdmin.from("roles").insert(rows).select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Role[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/data/roles.test.ts`
Expected: PASS (existing tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/roles.ts src/lib/data/roles.test.ts
git commit -m "feat: createRoles batch insert"
```

---

## Task 3: Bulk-create via the roles route

**Files:**
- Modify: `src/app/api/productions/[id]/roles/route.ts`
- Test: `src/app/api/productions/[id]/roles/route.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/app/api/productions/[id]/roles/route.test.ts`, extend the `roles` mock to include `createRoles`, and add two tests.

Change the mock block (lines 14–19) to:

```ts
const listRoles = vi.fn();
const createRole = vi.fn();
const createRoles = vi.fn();
vi.mock("@/lib/data/roles", () => ({
  listRoles: (...a: unknown[]) => listRoles(...a),
  createRole: (...a: unknown[]) => createRole(...a),
  createRoles: (...a: unknown[]) => createRoles(...a),
}));
```

Update the `beforeEach` reset array (line 24) to include `createRoles`:

```ts
  [getAuthContext, assertProductionInOrg, listRoles, createRole, createRoles].forEach((m) => m.mockReset());
```

Add at the end of the file:

```ts
test("POST with names[] bulk-creates roles (201)", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createRoles.mockResolvedValue([
    { id: "r1", name: "Hamlet" },
    { id: "r2", name: "Ophelia" },
  ]);
  const res = await POST(postReq({ names: ["Hamlet", "Ophelia"] }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ roles: [{ id: "r1", name: "Hamlet" }, { id: "r2", name: "Ophelia" }] });
  expect(createRoles).toHaveBeenCalledWith({ productionId: "p1", names: ["Hamlet", "Ophelia"] });
  expect(createRole).not.toHaveBeenCalled();
});

test("POST still creates a single role when given name", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1" });
  createRole.mockResolvedValue({ id: "r9", name: "Solo" });
  const res = await POST(postReq({ name: "Solo" }), ctx("p1"));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ role: { id: "r9", name: "Solo" } });
  expect(createRoles).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/roles/route.test.ts"`
Expected: FAIL — the `names[]` test gets a single-role response shape (route ignores `names`).

- [ ] **Step 3: Update the route**

Replace the `POST` handler in `src/app/api/productions/[id]/roles/route.ts` and the import on line 5.

Line 5 import:

```ts
import { listRoles, createRole, createRoles } from "@/lib/data/roles";
```

`POST` handler (lines 21–32):

```ts
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    const body = (await request.json()) as { name?: string; names?: string[] };
    if (Array.isArray(body.names)) {
      const roles = await createRoles({ productionId: id, names: body.names });
      return NextResponse.json({ roles }, { status: 201 });
    }
    const role = await createRole({ productionId: id, name: typeof body.name === "string" ? body.name : "" });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/roles/route.test.ts"`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/productions/[id]/roles/route.ts" "src/app/api/productions/[id]/roles/route.test.ts"
git commit -m "feat: roles route accepts names[] for bulk creation"
```

---

## Task 4: AI suggestion helper + route

**Files:**
- Create: `src/lib/ai/suggest-roles.ts`
- Create: `src/app/api/productions/[id]/suggest-roles/route.ts`
- Create: `src/app/api/productions/[id]/suggest-roles/route.test.ts`

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: `@anthropic-ai/sdk` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the AI helper**

Create `src/lib/ai/suggest-roles.ts`:

```ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ValidationError } from "@/lib/errors";

// AI role suggestions are optional — they only work when an Anthropic key is set,
// mirroring the project's "integrations fail gracefully without keys" convention.
export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const ROLE_LIST_SCHEMA = {
  type: "object",
  properties: { roles: { type: "array", items: { type: "string" } } },
  required: ["roles"],
  additionalProperties: false,
} as const;

// Ask Claude for the standard character roles of a known production. Returns role
// names only; returns an empty array if the model doesn't recognize the title.
export async function suggestRolesForTitle(title: string): Promise<string[]> {
  const clean = title.trim();
  if (!clean) throw new ValidationError("Production title is required");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    output_config: { format: { type: "json_schema", schema: ROLE_LIST_SCHEMA } },
    messages: [
      {
        role: "user",
        content:
          `List the standard named character roles for the stage production, musical, or ballet titled "${clean}". ` +
          `Return character/role names only — no actor names, no descriptions — in a sensible billing order. ` +
          `If you do not recognize the title, return an empty list. Respond as JSON: {"roles": ["Name", ...]}.`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  const raw = block && "text" in block ? block.text : "{}";
  let parsed: { roles?: unknown };
  try {
    parsed = JSON.parse(raw) as { roles?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.roles)) return [];
  return parsed.roles
    .filter((r): r is string => typeof r === "string")
    .map((r) => r.trim())
    .filter(Boolean);
}
```

- [ ] **Step 3: Write the failing route test**

Create `src/app/api/productions/[id]/suggest-roles/route.test.ts`:

```ts
import { expect, test, vi, beforeEach } from "vitest";

const getAuthContext = vi.fn();
vi.mock("@/lib/auth-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-context")>("@/lib/auth-context");
  return { ...actual, getAuthContext: () => getAuthContext() };
});

const assertProductionInOrg = vi.fn();
vi.mock("@/lib/data/production-access", () => ({
  assertProductionInOrg: (...a: unknown[]) => assertProductionInOrg(...a),
}));

const isAiConfigured = vi.fn();
const suggestRolesForTitle = vi.fn();
vi.mock("@/lib/ai/suggest-roles", () => ({
  isAiConfigured: () => isAiConfigured(),
  suggestRolesForTitle: (...a: unknown[]) => suggestRolesForTitle(...a),
}));

import { POST } from "@/app/api/productions/[id]/suggest-roles/route";

beforeEach(() => {
  [getAuthContext, assertProductionInOrg, isAiConfigured, suggestRolesForTitle].forEach((m) => m.mockReset());
});

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://test", { method: "POST" });

test("POST returns AI-suggested roles using the production's own title", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(true);
  suggestRolesForTitle.mockResolvedValue(["Pippin", "Leading Player"]);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ title: "Pippin", roles: ["Pippin", "Leading Player"] });
  expect(suggestRolesForTitle).toHaveBeenCalledWith("Pippin");
});

test("POST 501 when AI is not configured", async () => {
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockResolvedValue({ id: "p1", title: "Pippin" });
  isAiConfigured.mockReturnValue(false);

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(501);
  expect(suggestRolesForTitle).not.toHaveBeenCalled();
});

test("POST 404 when production not in org", async () => {
  const { NotFoundError } = await import("@/lib/errors");
  getAuthContext.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  assertProductionInOrg.mockRejectedValue(new NotFoundError("Production not found"));

  const res = await POST(req(), ctx("p1"));
  expect(res.status).toBe(404);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run "src/app/api/productions/[id]/suggest-roles/route.test.ts"`
Expected: FAIL — cannot resolve the route module.

- [ ] **Step 5: Write the route**

Create `src/app/api/productions/[id]/suggest-roles/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import { isAiConfigured, suggestRolesForTitle } from "@/lib/ai/suggest-roles";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    const production = await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "AI suggestions are not configured." }, { status: 501 });
    }
    const roles = await suggestRolesForTitle(production.title);
    return NextResponse.json({ title: production.title, roles });
  } catch (err) {
    return errorResponse(err);
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run "src/app/api/productions/[id]/suggest-roles/route.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 7: Typecheck (confirms the SDK `output_config` usage compiles)**

Run: `npx tsc --noEmit`
Expected: no errors. If `output_config` is not accepted by the installed SDK's `messages.create` types, the structured-output schema can be dropped and the prompt-instructed JSON (already in the message) parsed instead — but verify the type first; current `@anthropic-ai/sdk` accepts `output_config`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/ai/suggest-roles.ts "src/app/api/productions/[id]/suggest-roles/route.ts" "src/app/api/productions/[id]/suggest-roles/route.test.ts"
git commit -m "feat: AI role suggestion helper + endpoint (Haiku 4.5)"
```

---

## Task 5: RoleSuggestionBanner component

**Files:**
- Create: `src/components/RoleSuggestionBanner.tsx`

No automated test (codebase has no React component tests; environment is `node`). Verified via typecheck/lint here and end-to-end in Task 7.

- [ ] **Step 1: Write the component**

Create `src/components/RoleSuggestionBanner.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { Role } from "@/components/ProductionWorkspace";

// A curated catalog match passed from the server, or null when the title is unknown.
export interface RoleSuggestion {
  id: string;
  title: string;
  roles: string[];
}

// Shown on an empty workspace to offer standard roles for a recognized play.
// Curated matches preview roles immediately; otherwise an AI button fetches them.
export function RoleSuggestionBanner({
  productionId,
  suggestion,
  aiEnabled,
  onRolesCreated,
  onDismiss,
}: {
  productionId: string;
  suggestion: RoleSuggestion | null;
  aiEnabled: boolean;
  onRolesCreated: (roles: Role[]) => void;
  onDismiss: () => void;
}) {
  const [aiRoles, setAiRoles] = useState<string[] | null>(null);
  const [aiTitle, setAiTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to offer: no curated match and AI disabled.
  if (!suggestion && !aiEnabled) return null;

  const names = suggestion ? suggestion.roles : aiRoles ?? [];
  const heading = suggestion ? suggestion.title : aiTitle;

  async function fetchAiRoles() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/suggest-roles`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { title: string; roles: string[] };
      setAiTitle(data.title);
      setAiRoles(data.roles);
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't get suggestions");
    }
    setLoading(false);
  }

  async function addAll() {
    if (names.length === 0) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/productions/${productionId}/roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ names }),
    });
    if (res.ok) {
      const { roles } = (await res.json()) as { roles: { id: string; name: string; notes: string | null }[] };
      onRolesCreated(roles.map((r) => ({ id: r.id, name: r.name, notes: r.notes })));
    } else {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't add roles");
      setLoading(false);
    }
    // On success the parent unmounts this banner (roles is no longer empty).
  }

  return (
    <div className="rounded-xl border border-[var(--field-line)] bg-[var(--field-tint,transparent)] p-5">
      {names.length > 0 ? (
        <>
          <p className="mb-1">
            {heading ? (
              <>This looks like <strong>{heading}</strong>. Add its {names.length} standard roles?</>
            ) : (
              <>Add these {names.length} suggested roles?</>
            )}
          </p>
          <p className="mb-3 text-sm muted">{names.join(" · ")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={addAll} disabled={loading} className="btn-primary">
              {loading ? "Adding…" : "Add all roles"}
            </button>
            <button type="button" onClick={onDismiss} disabled={loading} className="link-muted text-sm">
              Dismiss
            </button>
          </div>
        </>
      ) : suggestion === null && aiEnabled ? (
        <>
          <p className="mb-3">Know this play&apos;s cast? Let AI suggest the standard roles.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fetchAiRoles} disabled={loading} className="btn-primary">
              {loading ? "Thinking…" : "Suggest roles with AI"}
            </button>
            <button type="button" onClick={onDismiss} disabled={loading} className="link-muted text-sm">
              Dismiss
            </button>
          </div>
          {aiRoles !== null && aiRoles.length === 0 && (
            <p className="mt-2 text-sm muted">No suggestions found for this title — add roles manually below.</p>
          )}
        </>
      ) : null}
      {error && <p className="mt-2 text-[var(--red)]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`Role` is exported from `ProductionWorkspace` — confirmed in Task 6 it already is.)

- [ ] **Step 3: Commit**

```bash
git add src/components/RoleSuggestionBanner.tsx
git commit -m "feat: RoleSuggestionBanner component"
```

---

## Task 6: Wire the banner into the workspace

**Files:**
- Modify: `src/components/ProductionWorkspace.tsx`
- Modify: `src/app/productions/[id]/page.tsx`

- [ ] **Step 1: Add props + render in ProductionWorkspace**

In `src/components/ProductionWorkspace.tsx`:

(a) Add the import near the other imports (after line 13):

```tsx
import { RoleSuggestionBanner, type RoleSuggestion } from "@/components/RoleSuggestionBanner";
```

(b) Add two props to the component's destructured params (after `initialPieces,` on line 48) and to the type (after `initialPieces: CostumePiece[];` on line 48):

In the destructure list:

```tsx
  initialPieces,
  roleSuggestion,
  aiEnabled,
```

In the props type:

```tsx
  initialPieces: CostumePiece[];
  roleSuggestion: RoleSuggestion | null;
  aiEnabled: boolean;
```

(c) Add a dismiss flag with the existing persistent-state hook (after the `error` state on line 71):

```tsx
  const [suggestDismissed, setSuggestDismissed] = usePersistentState<boolean>(
    `nada:prod:${productionId}:roleSuggestDismissed`,
    false,
  );
```

(d) Replace the empty-state block (lines 267–270, the `roles.length === 0 ? (...)` branch's `<p>`) so the banner shows above the hint. Change:

```tsx
      {roles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
          No roles yet. Add the first character below.
        </p>
      ) : (
```

to:

```tsx
      {roles.length === 0 ? (
        <>
          {!suggestDismissed && (
            <RoleSuggestionBanner
              productionId={productionId}
              suggestion={roleSuggestion}
              aiEnabled={aiEnabled}
              onRolesCreated={(created) => setRoles((prev) => [...prev, ...created])}
              onDismiss={() => setSuggestDismissed(true)}
            />
          )}
          <p className="rounded-xl border border-dashed border-[var(--field-line)] p-6 text-center muted">
            No roles yet. Add the first character below.
          </p>
        </>
      ) : (
```

- [ ] **Step 2: Compute and pass props from the page**

In `src/app/productions/[id]/page.tsx`:

(a) Add the import after line 16 (`import { listShowDates } ...`):

```tsx
import { findCuratedMatch } from "@/lib/data/play-catalog";
```

(b) Compute values just before the `return (` (after line 70, the `const pieces = ...` line):

```tsx
  const curated = findCuratedMatch(production.title);
  const roleSuggestion = curated
    ? { id: curated.id, title: curated.title, roles: curated.roles }
    : null;
  const aiEnabled = !!process.env.ANTHROPIC_API_KEY;
```

(c) Pass them to `<ProductionWorkspace>` — add after `initialPieces={pieces}` (line 133):

```tsx
        initialPieces={pieces}
        roleSuggestion={roleSuggestion}
        aiEnabled={aiEnabled}
```

- [ ] **Step 3: Typecheck, lint, and run the full test suite**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: no type errors, no lint errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductionWorkspace.tsx src/app/productions/[id]/page.tsx
git commit -m "feat: surface role suggestions on the empty workspace"
```

---

## Task 7: Env docs + end-to-end verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the env var**

Append to `.env.example`:

```
# Anthropic (optional — enables AI role suggestions when no curated match).
# Without it, curated suggestions still work; the AI button is hidden.
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: Set the key locally for testing**

Add `ANTHROPIC_API_KEY=<your key>` to `.env.local` (do not commit `.env.local`).

- [ ] **Step 3: Manual end-to-end verification**

Run: `npm run dev`

Verify each:
1. Create a production titled **"Hamlet"** → on the workspace, the banner reads *"This looks like Hamlet. Add its 15 standard roles?"* with the role names listed. Click **Add all roles** → 15 role cards appear, banner disappears.
2. Create a production titled **"the wizard of oz"** (lowercase) → curated banner still matches (normalization).
3. Create a production with a made-up title (e.g. **"Our Devised Show"**) → quieter banner with **Suggest roles with AI**. Click it → a role list appears (or "No suggestions found"). **Add all roles** works.
4. Click **Dismiss** on a fresh production → banner hides and stays hidden on reload within the session.
5. Temporarily remove `ANTHROPIC_API_KEY` from `.env.local`, restart dev, open a made-up-title production → no AI button shows (banner renders nothing). Restore the key afterward.
6. Add a role manually to a brand-new curated-match production first, then reload → banner does not show (only shows when zero roles).

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs: document ANTHROPIC_API_KEY for AI role suggestions"
```

---

## Self-Review Notes

- **Spec coverage:** curated catalog (Task 1), matching logic (Task 1), roles-only bulk creation (Tasks 2–3), AI fallback w/ Haiku + structured outputs + graceful degradation (Task 4), post-creation banner with curated/AI states + dismiss (Tasks 5–6), env (Task 7). All spec sections map to a task.
- **Type consistency:** `Role` (`{id, name, notes}`) reused from `ProductionWorkspace` throughout; bulk endpoint returns full role rows mapped down to that shape in the banner. `RoleSuggestion` defined once in the banner and imported by the workspace.
- **Dismiss persistence:** uses the existing `usePersistentState` hook (sessionStorage), so dismissal lasts the browser session — a deliberate, minor deviation from the spec's "localStorage" wording, chosen for consistency with the rest of the workspace's persisted UI state.
- **No placeholders:** every code step contains complete code; every run step has an exact command and expected result.
