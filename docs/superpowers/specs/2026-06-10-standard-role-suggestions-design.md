# Standard Role Suggestions — Design

**Date:** 2026-06-10
**Status:** Approved (pending final spec review)

## Summary

After a user creates a production, the empty workspace detects whether the
production's title matches a known play and offers to bulk-create its standard
character **roles** (characters like "Hamlet", "Ophelia"). Knowledge comes from
a **curated static catalog** first; when there is no curated match, an **AI
fallback button** asks Claude to suggest the cast on demand.

Only roles (characters) are created — never performers or castings. Performers
are assigned later through the existing workflow.

## Decisions (from brainstorming)

- **Knowledge source:** Hybrid — curated catalog first, AI fallback on demand.
- **What gets created:** Roles only.
- **Trigger:** Post-creation banner on the workspace (no autocomplete on the
  New Production form).
- **AI fallback:** Manual button ("Suggest roles with AI"), only when there is
  no curated match. AI never auto-runs.
- **Curated storage:** Static TypeScript catalog file (no DB tables, no
  migration).
- **AI model:** `claude-haiku-4-5`.

## User Flow

1. User creates a production as today (title + optional show date). The New
   Production form and `POST /api/productions` are unchanged.
2. On the workspace, **if the production has zero roles** and the banner has not
   been dismissed for this production:
   - **Curated match** (e.g. "Hamlet") → prominent banner:
     *"This looks like **Hamlet**. Add its N standard roles?"* with a preview of
     the role names, an **Add all roles** button, and **Dismiss**.
   - **No curated match** → quieter banner with a **Suggest roles with AI**
     button. Clicking it calls the AI endpoint, then renders the returned role
     list with the same **Add all roles** / **Dismiss** affordances.
3. **Add all roles** → bulk-creates the roles, the banner disappears, the normal
   role cards render. The user edits/deletes individual roles afterward via the
   existing UI.
4. **Dismiss** → hides the banner for that production, persisted in
   `localStorage` via the existing `use-persistent-state` hook.

Once a production has at least one role, the banner never shows (the empty-state
condition is false).

## Curated Catalog

New file `src/lib/data/play-catalog.ts`:

```ts
export interface PlayCatalogEntry {
  id: string;            // stable slug, e.g. "hamlet"
  title: string;         // canonical display title
  aliases: string[];     // alternate titles users might type
  roles: string[];       // standard character names, in a sensible order
}

export const PLAY_CATALOG: PlayCatalogEntry[] = [ /* seeded entries */ ];
```

Seed ~10–12 common plays/ballets/musicals (e.g. Hamlet, Romeo and Juliet,
A Midsummer Night's Dream, Macbeth, The Nutcracker, Swan Lake, The Wizard of Oz,
A Christmas Carol, Peter Pan, Cinderella). Easily extended by editing the file.

## Matching Logic

A `findCuratedMatch(title: string): PlayCatalogEntry | null` helper:

1. Normalize the input title: lowercase, trim, strip a single leading article
   ("the"/"a"/"an"), remove punctuation, collapse internal whitespace.
2. Compare the normalized input against the normalized `title` and each
   normalized `alias` of every catalog entry.
3. Return the first exact-normalized match, or `null`.

Exact-normalized match only for v1 (so "The Nutcracker" → "nutcracker" matches,
but a typo like "Hamlte" will not). Fuzzy matching is explicitly out of scope
for v1 and can be added later if needed.

## Components & Data Flow

- **Server** — `src/app/productions/[id]/page.tsx` (or `ProductionWorkspace`'s
  server entry): compute `findCuratedMatch(title)` and pass a `roleSuggestion`
  prop into `ProductionWorkspace`. No extra fetch for the curated case.
- **`ProductionWorkspace.tsx`** — render the new banner only when
  `roles.length === 0` and the per-production dismiss flag is not set.
- **New `src/components/RoleSuggestionBanner.tsx`** (client component) — handles
  both states:
  - Curated: shows the matched play title + role-name preview.
  - No match: shows the "Suggest roles with AI" button; on click, fetches the AI
    endpoint and renders the returned list.
  - Both: **Add all roles** (calls bulk role creation) and **Dismiss**.
  - Styled with existing Atelier `globals.css` classes.
- **Bulk role creation** — extend `POST /api/productions/[id]/roles` to accept
  `{ names: string[] }` in addition to the existing `{ name }`. Add a
  `createRoles(input: { productionId, names })` batch insert in
  `src/lib/data/roles.ts` that trims/filters empty names and assigns sequential
  `display_order` after any existing roles.
- **AI suggestion endpoint** — new `POST /api/productions/[id]/suggest-roles`:
  - Validates auth via `getAuthContext()` and `assertProductionInOrg(orgId, id)`.
  - Calls Claude with the production title; returns `{ title, roles: string[] }`.
  - Does **not** persist anything. The client calls the bulk role endpoint on
    confirm.

## The AI Call

- Add dependency `@anthropic-ai/sdk`. Server-only, invoked only inside the
  `suggest-roles` route.
- Model `claude-haiku-4-5`.
- Use **structured outputs** (`output_config.format` with a JSON schema) to
  guarantee a clean `{ roles: string[] }` response. Parse with the SDK rather
  than hand-parsing text.
- Prompt: ask for the standard list of character roles for the given
  production/play title, names only, in performance-sensible order.
- **Graceful degradation:** if `ANTHROPIC_API_KEY` is not set, the
  `suggest-roles` route returns a clear "AI suggestions are not configured"
  error and the banner hides the AI button (matching the project convention that
  Email/SMS/AI integrations fail gracefully when keys are missing). The curated
  half works with no key.
- Add `ANTHROPIC_API_KEY` to the environment for the AI half to function.

## Out of Scope (v1)

- Creating performers, casts, or castings from a suggestion (roles only).
- Editing/checking individual roles before creation (single **Add all** confirm;
  edit afterward via existing UI).
- Fuzzy/typo-tolerant matching.
- Autocomplete on the New Production form.
- Using the dormant `productions.play_template_id` column (static catalog has no
  stable DB id to reference).

## Affected / New Files

- New: `src/lib/data/play-catalog.ts` (catalog + `findCuratedMatch`).
- New: `src/components/RoleSuggestionBanner.tsx`.
- New: `src/app/api/productions/[id]/suggest-roles/route.ts`.
- Modified: `src/lib/data/roles.ts` (add `createRoles` batch).
- Modified: `src/app/api/productions/[id]/roles/route.ts` (accept `names[]`).
- Modified: `src/components/ProductionWorkspace.tsx` (render banner).
- Modified: `src/app/productions/[id]/page.tsx` (compute + pass `roleSuggestion`).
- `package.json` (add `@anthropic-ai/sdk`).
- Env: `ANTHROPIC_API_KEY`.
