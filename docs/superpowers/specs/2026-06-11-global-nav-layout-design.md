# Global nav via route-group layout — design

**Date:** 2026-06-11
**Status:** Approved for planning

## Problem

The app's nav bar (org switcher + links + user button) lives inline only in
`src/app/productions/page.tsx`. Every other authenticated page (`makers`, `inventory`,
`my-work`, `productions/[id]`, summary, performer) instead shows a bare `← Productions`
back link. So navigation is inconsistent and there's no persistent way to reach Productions
/ My Work / Inventory / the org switcher from anywhere but the productions list.

## Goal

Render one shared nav bar across all authenticated pages via a Next.js **route-group
layout**, without changing any URLs, and tidy up the now-redundant back links.

Out of scope: redesigning the nav's look (reuse existing styling), mobile-specific nav
behavior beyond what exists today, touching public pages.

## Decisions (from brainstorming)

1. **Mount via a route group `(app)` + `layout.tsx`** (not a per-page component) — DRY;
   new pages in the group get the nav automatically. Route-group parens don't affect URLs.
2. **Nav contents:** `[ org ▾ ]` (left) · `Productions · My Work · Inventory · username ·
   <UserButton>` (right). A **Productions** link is added (the bar previously had none, as
   it only rendered on that page).
3. **Back links:** remove the redundant `← Productions` from the three top-level sibling
   pages (`makers`, `inventory`, `my-work`); **keep** the contextual back links on deep
   pages (`productions/[id]` → Productions, `summary` → production, `performer` → Cast/Back).

## Architecture

### Route group `(app)`

Create `src/app/(app)/` and move these page folders into it (preserving history with
`git mv`):
- `productions/` (includes `new/`, `[id]/`, `[id]/summary/`, `[id]/performers/...`)
- `makers/`
- `inventory/`
- `my-work/`

**Stay outside the group** (no nav): `src/app/page.tsx` (the `/` → `/productions`
redirect), `onboarding/`, `sign-in/`, `sign-up/`, `api/`, the root `layout.tsx`, and
`globals.css`.

URLs are unchanged because route-group segments in parentheses are not part of the path.
All page imports use the `@/…` absolute alias, so relocation breaks no imports.

### `AppNav` — `src/components/AppNav.tsx` (server component)

Renders the header bar, reusing the current productions-header markup/classes. Fetches the
display name itself (server-side), so pages don't have to:

```tsx
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { OrgSwitcher } from "@/components/OrgSwitcher";

export async function AppNav() {
  const user = await currentUser();
  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";
  return (
    <header className="mx-auto max-w-2xl px-6 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--field-line)] pb-3">
        <OrgSwitcher />
        <div className="flex items-center gap-2.5">
          <Link href="/productions" className="link-muted text-sm">Productions</Link>
          <Link href="/my-work" className="link-muted text-sm">My Work</Link>
          <Link href="/inventory" className="link-muted text-sm">Inventory</Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
```

### `(app)/layout.tsx`

```tsx
import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      {children}
    </>
  );
}
```

Each page keeps its own `<main className="mx-auto max-w-2xl p-6">`; the nav sits above it
at the same width.

### Page edits

- **`(app)/productions/page.tsx`**: remove the inline header block (the
  `border-b … <OrgSwitcher/> … <UserButton/>` div) — now provided by the layout — and drop
  the now-unused `currentUser` import + the `user`/`userName` computation. Keep everything
  else (data fetches, productions list, `InventoryQuickAddCard`).
- **`(app)/makers/page.tsx`, `(app)/inventory/page.tsx`, `(app)/my-work/page.tsx`**: remove
  the `<Link href="/productions">← Productions</Link>` block (and the unused `Link` import
  if it becomes unused). Keep the page heading + content.
- **Deep pages** (`productions/[id]`, `summary`, `performer`): unchanged — they keep their
  contextual back links and inherit the nav from the layout.

## Data flow

`AppNav` runs server-side per request, calling `currentUser()` (Clerk). `OrgSwitcher` is the
existing client component (org switching scoped to the active org). No data-layer or API
changes. Middleware already guarantees every `(app)` page has an authenticated user + active
org, so the nav always has an org to show.

## Testing / verification

Purely structural (file moves + new layout/component + small page edits). No new unit
tests; existing data/API tests are unaffected by page relocation (they import via `@/…`,
not by route path). Verify:
- `npx tsc --noEmit` clean
- `npm run lint` no new errors
- `npx vitest run` green (unchanged count)
- `npx next build` succeeds and lists the routes at their original paths (`/productions`,
  `/makers`, `/inventory`, `/my-work`, `/productions/[id]`, …) — confirms the route group
  didn't alter URLs
- Browser: the nav appears on every authenticated page (incl. deep pages, which also keep
  their contextual back link); `Productions`/`My Work`/`Inventory` links and the org
  switcher work; sign-in/up/onboarding show no nav.

## Files

| File | Change |
|------|--------|
| `src/app/(app)/layout.tsx` | **new** — renders `<AppNav/>` + children |
| `src/components/AppNav.tsx` | **new** — the shared nav bar (server) |
| `src/app/(app)/productions/…` | **moved** from `src/app/productions/…`; `page.tsx` loses its inline header + `currentUser` |
| `src/app/(app)/makers/…` | **moved**; `page.tsx` loses the `← Productions` back link |
| `src/app/(app)/inventory/…` | **moved**; `page.tsx` loses the back link |
| `src/app/(app)/my-work/…` | **moved**; `page.tsx` loses the back link |

## Risks / caveats

- **Route-group move is the main risk.** Mitigated by: URLs unchanged (parens), `@/…`
  absolute imports, and the `next build` route-list verification step.
- Nav may wrap on very narrow screens (three links + name + UserButton) — same behavior as
  today's productions header plus one link; not addressed here.
- A stray `<main>`-less page would look off, but every moved page already wraps content in
  `<main className="mx-auto max-w-2xl p-6">`, so spacing stays consistent under the nav.
