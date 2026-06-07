# Persist Workspace UI State — Design

**Date:** 2026-06-07
**Status:** Approved (pending spec review)

## Problem

On the production detail page, expanding role cards, picking a per-card tab, and selecting a cast all live in React component state. Navigating to a performer's measurements page (`/productions/[id]/performers/[performerId]`) and back remounts the page, resetting everything to collapsed/default. Users lose their place after every measurement edit.

## Goal

Persist the workspace's view state per production for the browser session and restore it on mount, so expanded cards, each card's active tab, and the selected cast survive navigation away and back.

## Non-goals

- No cross-session/permanent persistence (use `sessionStorage`, not `localStorage`).
- No server-side persistence; this is pure client view-state.
- No change to data, API, or measurements editing.

## Components / changes

### New `src/lib/use-persistent-state.ts`

- `parsePersisted<T>(raw: string | null, initial: T): T` — pure helper: returns `initial` for null/invalid JSON, else the parsed value. (Unit-testable without a DOM.)
- `usePersistentState<T>(key, initial): readonly [T, (v: T | ((prev: T) => T)) => void]`:
  - `useState(initial)` so SSR and first client render match (no hydration mismatch).
  - On mount (`useEffect` keyed by `key`): read `sessionStorage.getItem(key)` and, if present, `setValue(parsePersisted(raw, initial))`.
  - The returned setter writes `sessionStorage.setItem(key, JSON.stringify(next))` and supports both a value and an updater function. All storage access is wrapped in try/catch (private-mode safety).

### `CollapsibleRole.tsx` → controlled

Currently owns `open` via internal `useState(defaultOpen)`. Change to **controlled**: replace `defaultOpen` with props `open: boolean` and `onToggle: () => void`; the toggle button calls `onToggle`; body renders when `open`. (Only `RoleCard` uses this component now, so the change is contained.)

### `RoleCard.tsx`

Replace the local `useState<RoleTab>("ideas")` and rely on persistent state for both open and tab:
- `const [open, setOpen] = usePersistentState<boolean>(\`nada:prod:${productionId}:role:${role.id}:open\`, false)`
- `const [activeTab, setActiveTab] = usePersistentState<RoleTab>(\`nada:prod:${productionId}:role:${role.id}:tab\`, "ideas")`
- Pass `open={open}` and `onToggle={() => setOpen((o) => !o)}` to `CollapsibleRole`; keep `active={activeTab}` / `onChange={(id) => setActiveTab(id as RoleTab)}` on the tab strip.

### `ProductionWorkspace.tsx`

Replace `const [selectedCastId, setSelectedCastId] = useState<string>(initialCasts[0]?.id ?? "")` with:
`const [selectedCastId, setSelectedCastId] = usePersistentState<string>(\`nada:prod:${productionId}:cast\`, initialCasts[0]?.id ?? "")`.
Existing `setSelectedCastId(...)` calls (after add/delete cast) keep working — the setter persists.

## Key scheme

All keys prefixed `nada:prod:{productionId}:…` so productions don't collide and keys are easy to reason about.

## Error handling

- All `sessionStorage` access wrapped in try/catch (Safari private mode throws). On any failure the hook simply behaves like ordinary `useState`.
- A persisted cast id whose cast was later deleted is a benign edge (the switcher just shows nothing selected until the user picks one); not guarded, since cast ids are stable within a session.

## Testing

- `parsePersisted` unit tests: null → initial; valid JSON → parsed value; malformed JSON → initial. (Pure; no DOM needed — the project's vitest runs in node.)
- Hook wiring + controlled `CollapsibleRole` + restore behavior: manual smoke — expand cards, pick tabs, select a cast, open a performer's measurements, go back; state is restored.

## Migration / demo dependency

None.
