# Cast List Import — Design

**Date:** 2026-09-14
**Status:** Approved by Chris (brainstorming session)
**Branch:** `feat/cast-list-import`
**Requested by:** Nada

## Goal

Let a user import a production's cast list — characters and the performers cast in them —
from whatever the director sent, instead of typing every role and name by hand. Works both:

- **before** characters exist (the import creates the roles), and
- **after** characters were added (the import matches existing roles and adds castings).

## Decisions made

- **Input:** paste box **and** file upload. Accepted: pasted text, `.txt`, `.csv`, `.pdf`,
  `.docx`, `.xlsx`, `.png`, `.jpg`. Cast lists arrive in varying forms (spreadsheets,
  director PDFs, docs, email text).
- **Parsing approach:** AI reads everything (Approach A). Rejected: a column-mapping path for
  spreadsheets plus AI for the rest (two parsers, real sheets are rarely clean) and regex
  heuristics (brittle; useless on PDFs laid out as tables).
- **Model:** Claude Sonnet 5 (`claude-sonnet-5`) by default, overridable with the
  `CAST_IMPORT_MODEL` env var (mirrors `FABRIC_ESTIMATE_MODEL`).
- **The AI extracts; code decides.** The model returns what is written (character, cast
  label, names, understudy marks). Ensemble/primary/understudy inference, merging and matching
  are deterministic, unit-tested server code.
- **Multiple names, no marks → ensemble.** A character with ≥2 names in a cast, none of them
  marked primary or understudy, becomes an ensemble role. Editable in the review.
- **Casts:** detected from the list and mapped in the review to an existing cast or a new one.
  A list with no cast labels goes to the production's default cast.
- **Matching existing data:** normalized-exact name matches attach to existing roles, casts and
  performers (so measurements carry over), badged in the review and switchable to "new".
  Additive only — nothing existing is modified or deleted.
- **Nothing is saved until the user confirms.** Apply is one Postgres transaction.
- **Privacy:** uploaded files are processed in memory, never stored. A disclosure line sits
  under the upload box. The `/privacy` page's service-provider sentence gains "reading cast
  lists you import" — **without naming any vendor**: the 2026-07-27 compliance review requires
  the policy to name no service provider (guarded by `src/app/legal-pages.test.ts`).

## Reference example

Nada supplied a real school cast list ("Peter and the Starcatcher", 2-page PDF). **It contains
real student names and must never be committed.** Shape that the design must handle:

- A two-column table (Character | Actor(s)) with a title and an intro paragraph of noise
  ("Thank you to everyone who auditioned…", rehearsal date).
- Group roles whose cell holds names in **two sub-columns** (Mermaids 11, Mollusks 9, Pirates 9,
  Sailors 9) — plain PDF text extraction scrambles these; Claude's native PDF input (text +
  page image) reads them correctly.
- Small group roles with 3 names (a "Trio", "Flashback Vocalists").
- Heavy reuse: ~80 castings resolve to ~23 people; one student is in 5 roles.
- Two different students share a surname — matching must be full-name exact, never fuzzy.
- Single cast, no understudies.

## Current state (verified)

- `casts` (per production, `is_default`, `color`, `display_order`); every production has a
  default "Main Cast" row (backfilled in `0004`).
- `roles` (`name`, `display_order`, `is_ensemble` from `0033`).
- `performers` (production-scoped, `label` ≤ 100 chars via `MAX_PERFORMER_NAME`).
- `castings` unique `(cast_id, role_id, performer_id)`; partial unique index
  `castings_one_primary_per_cast_role`; `assignment in ('primary','understudy','ensemble')`.
- AI pattern: `src/lib/ai/suggest-roles.ts` — `new Anthropic()`, `output_config.format`
  json_schema, `isAiConfigured()` gate, route returns 501 without a key.
- Role/casting creation is not billing-gated (only makers are).

## User flow

### Entry points

- **"Import cast list"** link in the cast list header (expand-from-link, per the UI pattern for
  rare actions). Always available.
- On a production with **no roles**, the import is offered alongside the AI role suggestions.
  Same flow — matching simply finds nothing.

### Step 1 — Provide

Expanded panel: large paste textarea, "…or upload a file" button, **Read cast list** button,
and the disclosure line: *"The list is read by AI to fill in the review. Nothing is saved
until you import."* While parsing: "Reading cast list…". Pasted text is preserved on
failure.

### Step 2 — Review

- **Casts found:** each detected cast label → dropdown (existing cast / create new). If none
  detected, a single row "(single cast) → [default cast ▾]".
- **One card per character**, in list order:
  - Character name (editable) + role target dropdown: exact match pre-selected, else
    "New role"; any existing role selectable.
  - **Ensemble** checkbox (from the inference rule). For an existing role the checkbox reflects
    the role's current type and is read-only.
  - Performer chips per cast: name, `new` / `existing` badge (existing switchable to new),
    "also in N other roles" when the same person appears elsewhere in the list, ×
    to remove. On regular roles each chip has a primary/understudy selector.
  - Castings that already exist render greyed "already cast" and are skipped.
- **Conflicts** (red, must be resolved before Import is enabled):
  - A primary for a (cast, role) that already has a different primary → change to understudy
    or remove.
  - More than one primary for a (cast, role) within the import → pick one.
  - Imported role type disagrees with an existing role's type (e.g. import says ensemble,
    existing role is regular) → **Fit to this role** (re-labels the imported people to the
    role's type: all ensemble, or per cast first primary + understudies), remove those rows, or
    cancel and flip the role with the existing toggle first. The import never converts an
    existing role's type.
- Rows/cards can be removed.
- Summary + actions: **"Import 26 new roles, 23 new performers and 81 castings"** · Start over.

### Step 3 — Import

Apply in one transaction → panel closes → cast list refreshes from the fresh workspace data the
apply endpoint returns → inline note "Imported 26 new roles, 23 new performers and 81 castings."
On failure the review stays open with the error; nothing was saved.

## Architecture

### Units

| Unit | Responsibility |
|---|---|
| `src/lib/cast-import/input.ts` | Turn a paste or uploaded file into Claude content blocks (text / document / image). Size and type limits. |
| `src/lib/ai/parse-cast-list.ts` | Call Claude with the content + schema; return the sanitized raw extraction or throw an unreadable (422) / service (502) error. |
| `src/lib/cast-import/infer.ts` | Pure: raw extraction → normalized entries with role type and assignments; merge a character across casts. |
| `src/lib/cast-import/match.ts` | Pure: normalized entries + existing casts/roles/performers/castings → draft with matches, "already cast" flags and conflicts. |
| `src/lib/cast-import/normalize.ts` | Pure: name normalization + match keys. |
| `src/lib/cast-import/payload.ts` | Pure: validate an apply payload against production data. Server-side only; the review UI gates Import on the draft's conflicts from `match.ts`. |
| `src/lib/data/cast-import.ts` | Server: load production data for matching; call the `import_cast_list` RPC. |
| `src/lib/cast-import/analyze.ts` | Pure, client-safe: payload + existing data → already-cast, duplicates, conflicts, counts. Used live by the review UI and again by the apply route. |
| `src/lib/cast-import/draft-edits.ts` | Pure, client-safe: review edits (retarget, ensemble toggle, fit to role, assignment, remove). |
| `POST /api/productions/[id]/cast-import/parse` | Auth + org scope → input → AI → infer → match → `{ draft, existing }`. Writes nothing. |
| `POST /api/productions/[id]/cast-import/apply` | Auth + org scope → parse payload → re-analyze against fresh DB data → RPC → `{ counts, workspace }`. |
| `src/components/CastImportPanel.tsx` (+ small subcomponents) | Provide / Review / Import UI. |
| `supabase/migrations/0034_cast_import.sql` | `import_cast_list` function. |

### Input conversion (`input.ts`)

| Input | Sent to Claude as |
|---|---|
| Pasted text, `.txt`, `.csv` | `text` block |
| `.pdf` | `document` block, base64 `application/pdf` |
| `.png`, `.jpg` | `image` block, base64 |
| `.docx` | `mammoth` → HTML (keeps table cells distinct) → `text` block |
| `.xlsx` | each sheet → tab-separated text (one maintained xlsx reader — chosen in the plan; **not** the stale `xlsx` npm package) → `text` block |

Limits: file ≤ **4 MB** (Vercel request body cap is 4.5 MB); pasted/extracted text ≤ **50,000
characters**. Over-limit input is rejected with a message naming the limit — never silently
truncated. Unknown types → 400. Corrupt `.docx`/`.xlsx` → 400 "Couldn't read that file — try
pasting the text instead."

### AI extraction (`parse-cast-list.ts`)

- `new Anthropic()`; model `process.env.CAST_IMPORT_MODEL?.trim() || "claude-sonnet-5"`.
- `output_config.format` json_schema (additionalProperties false) for:

```ts
{
  casts: string[];                 // cast labels found, [] if none
  entries: Array<{
    character: string;
    cast: string | null;           // which cast label this entry belongs to
    group_label: boolean;          // text explicitly marks it as ensemble/chorus/group
    performers: Array<{ name: string; mark: "primary" | "understudy" | "unmarked" }>;
  }>;
}
```

- Prompt instructs: extract only characters and the people cast in them; ignore titles,
  paragraphs, dates, crew/staff; keep names exactly as written; mark understudies only when the
  text says so (u/s, understudy, alternate…); do not invent or merge people.
- The document is untrusted data. Risk is contained: output is schema-constrained, only names
  reach the UI, and nothing persists without user confirmation.
- `stop_reason === "max_tokens"` → 422 "That cast list is too long to read in one go — split it
  into smaller parts." (Structured JSON cut off mid-way can't be partially trusted.)
  `max_tokens` 16000, `effort: "medium"`. `stop_reason === "refusal"` → 422.
- Invalid JSON / empty `entries` → the route returns a "No cast list found" 422 and the review
  does not open. Anthropic API errors → 502 "Couldn't read the cast list right now — try again."
- Gated by `isAiConfigured()` → 501 "Cast import isn't set up yet."

### Inference rules (`infer.ts`)

Per `(character, cast)`:

- **Ensemble** if `group_label` is true, **or** ≥ 2 performers in a cast who are all `unmarked`.
- Otherwise **regular**: a performer marked `primary`, or the single/first `unmarked` performer
  when none is marked primary, is `primary`; everyone else is `understudy`.
- The same character (normalized) across multiple casts → **one role** with castings in each
  cast. The role is ensemble if it is ensemble in any cast; in that case all its castings are
  `ensemble`.
- The same character repeated within one cast → entries merged.
- Duplicate names within one (cast, role) → collapsed.

### Normalization (`normalize.ts`)

- Display value: trim, collapse internal whitespace. Casing is kept as written.
- Match key: display value lowercased, punctuation (`.` `,` `'` `’`) stripped, whitespace
  collapsed. `"Mrs. Bumbrake"` ≡ `"mrs bumbrake"`.
- **Full-name exact on the key only** — no fuzzy, surname, or initials matching. Two people
  sharing a surname stay separate.
- The same key appearing across entries → one performer ("also in N other roles").

### Matching (`match.ts`)

Given the inferred entries and the production's current casts, roles, performers and castings:

- Cast label → existing cast by key; unlabeled → default cast.
- Character → existing role by key, else new role.
- Performer → existing performer by key, else new. If more than one existing performer shares
  the key, pre-select "new" and list the candidates in the chip's dropdown (never guess).
- Casting already present `(cast, role, performer)` → "already cast", excluded from counts.
- Conflicts as listed under Step 2.

The draft returned to the client carries stable client keys for every cast/role/performer so the
review can edit mappings without re-parsing.

### Apply endpoint and payload

```ts
{
  casts:      Array<{ key: string; existingCastId: string } | { key: string; newName: string; color: string }>;
  roles:      Array<{ key: string; existingRoleId: string } | { key: string; newName: string; isEnsemble: boolean }>;
  performers: Array<{ key: string; existingPerformerId: string } | { key: string; newName: string }>;
  castings:   Array<{ castKey: string; roleKey: string; performerKey: string; assignment: "primary" | "understudy" | "ensemble" }>;
}
```

Server-side validation (400 with a message on any failure), before touching the DB:

- Every existing id belongs to this production (the production is already org-scoped via
  `assertProductionInOrg`). Existing ids are checked for uuid format first — a malformed id is
  a 400 validation error, never reaching the query.
- Every key referenced by a casting is defined exactly once.
- Names non-empty after trim; performer names ≤ `MAX_PERFORMER_NAME`.
- Assignment matches role type (existing roles: their current `is_ensemble`; new roles: the
  payload's `isEnsemble`).
- At most one `primary` per (cast, role), counting existing primaries.
- No duplicate castings in the payload.
- Size caps: ≤ 200 roles, ≤ 500 castings, ≤ 20 casts.

### SQL function (`0034_cast_import.sql`)

`import_cast_list(p_production_id uuid, p_payload jsonb) returns jsonb`, `language plpgsql`,
`set search_path = public`. In one transaction:

1. Insert new casts with the payload's `color` (the route assigns it before the RPC, cycling
   `CAST_COLORS` tokens not already used in the production), `is_default = false`,
   `display_order` after the current max.
2. Insert new roles in payload order, `display_order` after the current max, `is_ensemble` from
   the payload.
3. Insert new performers.
4. Resolve keys → ids; insert castings with
   `on conflict (cast_id, role_id, performer_id) do nothing`.
5. Return `{ casts, roles, performers, castings }` counts actually created.

The function also asserts that each existing id belongs to `p_production_id` (defence in depth).
A primary-index violation from a concurrent edit aborts the whole transaction; the route maps it
to 409 "The cast list changed while you were importing. Reload to see the latest."

Re-importing the same list is idempotent for castings. (New-name roles/performers would be
re-created only if the user switched matches to "new" — the review pre-selects existing matches,
so a straight re-import creates nothing.)

## Error handling summary

| Situation | Status | Message |
|---|---|---|
| No API key | 501 | Cast import isn't set up yet. |
| Unsupported type / over limit | 400 | Names the accepted types or the limit |
| Unreadable `.docx`/`.xlsx` | 400 | Couldn't read that file — try pasting the text instead. |
| Nothing extracted | 422 | No cast list found in that — check it's the right file, or paste the names. |
| Anthropic error / timeout | 502 | Couldn't read the cast list right now — try again. |
| Output hit `max_tokens` | 422 | That cast list is too long to read in one go — split it into smaller parts. |
| Invalid apply payload | 400 | Specific validation message |
| Concurrent primary conflict | 409 | The cast list changed while you were importing. Reload to see the latest. |

## Testing

Vitest, TDD, the repo's existing mock patterns.

- **Pure units (bulk of the coverage):** `normalize`, `infer` (ensemble rule, primary/understudy,
  cross-cast merge, in-cast duplicates), `match` (existing role/cast/performer matches, ambiguous
  existing performers, already-cast, every conflict type), `payload` validation.
- **Fixture:** `src/lib/cast-import/__fixtures__/starcatcher-shaped.ts` — the AI JSON output for a
  list with the reference example's structure but **fake names**: two-column ensemble cells, one
  person in 5 roles, a 3-person trio, a shared surname pair, single cast. Drives infer → match
  end to end without calling the model.
- **Input conversion:** text/csv → text; pdf/png/jpg → base64 blocks; tiny generated `.docx` and
  `.xlsx` fixtures convert; over-limit and unknown types reject.
- **AI module (SDK mocked):** model from env with the Sonnet 5 default, schema passed, invalid
  JSON handled, `max_tokens`/refusal → unreadable error, SDK failure → service error.
- **Routes:** org scoping, 501 without key, 400/422/502 paths, RPC called with the validated
  payload, 409 mapping.
- **SQL function:** verified after Chris applies `0034`, via the browser stress test.
- **Browser (Playwright, local):** import the real reference PDF (local file only — never
  committed), check the review against the PDF, import, verify the cast list, re-import to
  confirm nothing duplicates, then delete the test data.

## Privacy

- Uploaded files are held in memory for the request only; never written to storage or the DB.
- Sent to Anthropic: the list content only — no measurements or other performer data.
- Disclosure line under the upload box (see Step 1).
- `/privacy` Sharing section: the provider sentence becomes "…email delivery, automated fabric
  estimates, and reading cast lists you import." No vendor names (compliance guard). The
  "updated" date is pinned by the compliance test — left unchanged; flag for the lawyer review.

## Out of scope

- Importing measurements, performer contact info, or notes.
- Modifying or removing existing roles/castings, or converting a role's type, via import.
- Fuzzy name matching or cross-production performer rosters.
- Storing uploaded files.

## Rollout

- New migration `0034_cast_import.sql` — **Chris applies it** before browser verification.
- New dependencies: `mammoth`, plus one maintained xlsx reader.
- Env: `ANTHROPIC_API_KEY` already set; `CAST_IMPORT_MODEL` optional.
- Push/deploy only on Chris's explicit go-ahead.
