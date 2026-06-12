# AI fabric-yardage estimate — design

**Date:** 2026-06-12
**Status:** Approved for planning
**Roadmap:** #5 (AI fabric yardage; Nada: yardage → AI)

## Problem

The Costume Creations "Fabric list" tab aggregates the **per-piece fabric yardage** that's
currently entered by hand on each make row (`buildFabricPurchaseList` sums
`item.fabric.yardage`). Filling yardage for a whole show is tedious manual work.

## Goal

A one-click **"Estimate fabric"** action that uses AI to estimate the yardage for every make
piece missing one — from the garment (the design's name), the performer's measurements, and
the fabric width — then fills the worklist and the purchase list. Every value stays editable.

Out of scope: estimating fabric *type/color/supplier* (yardage only); changing how the
purchase list aggregates; a per-piece estimate button (bulk only, per the brainstorm).

## Decisions (from brainstorming)

1. **Bulk** trigger — one button estimates all make pieces *missing a yardage* in a single AI
   pass. Existing manual yardages are left alone.
2. **Model: `claude-haiku-4-5`** (matches the existing role-suggester; lowest cost; plain — no
   extended thinking), via the Anthropic SDK with schema-constrained JSON output.
3. **Persist** the estimates straight to the pieces (they're low-stakes and editable), unlike
   role suggestions which wait for an explicit "Add all".

## Architecture

### 1. AI lib — `src/lib/ai/estimate-fabric.ts` (mirrors `suggest-roles.ts`)

- Reuse `isAiConfigured()` (export it from `suggest-roles.ts` or move to a shared
  `src/lib/ai/config.ts`; the plan picks one — prefer importing the existing export).
- ```ts
  interface EstimateItem {
    key: string;                 // pieceKey(castingId, designId)
    garment: string;             // design name, e.g. "Cloak"
    fabricWidth: string | null;  // e.g. '60"' if entered
    measurements: { label: string; value: number; unit: string }[];
  }
  export async function estimateFabricYardage(items: EstimateItem[]): Promise<Map<string, number>>
  ```
- Returns a `Map<key, yardage>`. Calls `client.messages.create({ model: "claude-haiku-4-5",
  max_tokens, output_config: { format: { type: "json_schema", schema } } })` where the schema
  is `{ estimates: [{ key: string, yardage: number }] }`. Prompt: a theatrical costume fabric
  estimator — for each garment, estimate the **yards** of fabric to construct it for a
  performer with the given measurements at the given fabric width (assume 45″ if unknown);
  yardage as a positive number to one decimal. Parse defensively (ignore non-numeric / unknown
  keys, clamp to ≥ 0); on no/garbled output return an empty map. Returns empty immediately if
  `items` is empty.

### 2. Route — `POST /api/productions/[id]/estimate-fabric`

- `getAuthContext` → `assertProductionInOrg`. If `!isAiConfigured()`, return a 400/clear error.
- Load via the shared `loadCostumeCreationsData(orgId, production)`; build the make worklist
  (`buildMakeWorklist(...)`, no maker filter) and flatten its items.
- Select items whose `fabric.yardage == null` → build `EstimateItem`s: `garment` = the
  garment's `designName`, `fabricWidth` = `item.fabric.width`, `measurements` =
  `measurementsByCasting[castingId]` mapped to `{ label, value, unit }`. `key` =
  `pieceKey(castingId, designId)`.
- If none to estimate, return `{ pieces, estimated: 0 }` without calling the AI.
- `estimateFabricYardage(items)` → for each returned `key` with a yardage, **persist** via the
  existing `upsertPieceSource` (merge onto the piece's current fields — `source: "make"`,
  preserve fabric type/color/width/supplier/unit-cost/made/makerId — set
  `fabricYardage: yardage`). Lazy make-items (no row yet) get a new row with the yardage.
- Return the refreshed pieces (`listCostumePieces(designIds)`) + `estimated` count.

### 3. UI — `TailorSummary.tsx` (+ Costume Creations page)

- The Costume Creations page passes `aiConfigured={isAiConfigured()}` (server-side) into
  `TailorSummary` (mirrors how the production page gates role suggestions).
- `TailorSummary` (already holds `pieces` state): when `aiConfigured`, render a
  `✨ Estimate fabric` button on the **Fabric list** tab, above `FabricPurchaseList`, with a
  small note "fills empty yardages only". On click → `POST /api/productions/${productionId}/estimate-fabric`
  (credentials include) → on success `setPieces(data.pieces)` so the worklist and the derived
  purchase list recompute. Busy + error states; the button is disabled while running.
- Values remain editable exactly as today (blur saves), so a wrong estimate is a one-field fix.

## Data flow

Click → route loads the production, finds make-items with no yardage, asks Haiku for yards per
item, writes each estimate onto its piece, and returns the refreshed pieces. `TailorSummary`
swaps in the new pieces; `buildMakeWorklist` + `buildFabricPurchaseList` recompute, so the
Fabric list totals reflect the estimates. On `/my-work` the same `TailorSummary` is used, so the
button appears there too (still per-production, filtered) — acceptable; it estimates the
production's missing yardages, not just the user's. (If unwanted there, hide it when
`filterMakerId` is set — noted as a small option.)

## Files

| File | Change |
|------|--------|
| `src/lib/ai/estimate-fabric.ts` | **new** — `estimateFabricYardage` (Haiku, schema output) |
| `src/app/api/productions/[id]/estimate-fabric/route.ts` | **new** — POST: estimate + persist |
| `src/app/api/productions/[id]/estimate-fabric/route.test.ts` | **new** — route test (mock the lib + data) |
| `src/components/TailorSummary.tsx` | `aiConfigured` prop + the Estimate-fabric button/flow |
| `src/app/(app)/productions/[id]/summary/page.tsx` | pass `aiConfigured={isAiConfigured()}` |
| `src/app/(app)/my-work/page.tsx` | pass `aiConfigured` (or `false` to hide on My Work) |

## Testing

- **TDD the route** (`route.test.ts`), mirroring `suggest-roles/route.test.ts`: mock
  `estimateFabricYardage` and the data layer; assert it (a) estimates only make-items missing a
  yardage, (b) persists each via `upsertPieceSource` with the right merged fields, (c) returns
  the refreshed pieces + count, (d) 400s when AI isn't configured.
- The AI lib mirrors the established `suggest-roles` SDK pattern; verify its response parsing
  (clamp/ignore-bad-keys) with a small unit test that mocks the Anthropic client, plus manual.
- Existing tests unaffected. Verify `tsc` + `lint` + `vitest`; the live AI call is checked in an
  authenticated browser with `ANTHROPIC_API_KEY` set.

## Risks / caveats

- **Estimate quality** is Haiku-level and approximate — that's why every value stays editable
  and only *empty* yardages are filled (never overwrites a human entry).
- **Cost/latency**: one bulk Haiku call per click over a small item list — negligible. The
  route returns early (no AI call) when nothing is missing.
- **Graceful without a key**: `isAiConfigured()` gate hides the button and the route refuses,
  matching the project's "integrations fail gracefully without keys" convention.
- **Partial AI output**: keys the model omits simply stay unfilled; no crash.
