# Global Nav via Route-Group Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one shared nav bar across all authenticated pages via a Next.js `(app)` route-group layout, without changing any URLs.

**Architecture:** A new `AppNav` server component (org switcher + Productions/My Work/Inventory links + user button) is rendered by `src/app/(app)/layout.tsx`. The authenticated page folders move into the `(app)` route group (parens → no URL change). The productions page sheds its inline header; three top-level pages shed their redundant `← Productions` back link.

**Tech Stack:** Next.js 16 App Router (route groups, nested layouts), Clerk (`currentUser`, `OrganizationSwitcher` via existing `OrgSwitcher`), TypeScript strict, Tailwind.

**No new logic / no tests:** purely structural. Existing data/API tests are unaffected (they import via `@/…`, not route paths). Verify with `tsc` + `lint` + `vitest` + route smoke-checks on the running dev server.

---

## File Structure

| File | Change |
|------|--------|
| `src/components/AppNav.tsx` | **new** — shared nav bar (server component) |
| `src/app/(app)/layout.tsx` | **new** — renders `<AppNav/>` + children |
| `src/app/(app)/productions/` | **moved** from `src/app/productions/`; `page.tsx` loses inline header + `currentUser` |
| `src/app/(app)/makers/` | **moved**; `page.tsx` loses back link |
| `src/app/(app)/inventory/` | **moved**; `page.tsx` loses back link |
| `src/app/(app)/my-work/` | **moved**; `page.tsx` loses back link |

Unchanged / stays outside the group: `src/app/page.tsx` (`/`→`/productions` redirect), `onboarding/`, `sign-in/`, `sign-up/`, `api/`, root `layout.tsx`, `globals.css`, and the deep pages under `productions/[id]` (they keep their contextual back links).

---

## Task 1: Route group + layout + AppNav (+ productions header removal)

Do this as one cohesive change so the app is never in a double-nav state: create the nav + layout, move the folders, and strip the productions page's now-duplicate inline header — then commit once.

**Files:**
- Create: `src/components/AppNav.tsx`, `src/app/(app)/layout.tsx`
- Move: `src/app/{productions,makers,inventory,my-work}` → `src/app/(app)/…`
- Modify: `src/app/(app)/productions/page.tsx`

- [ ] **Step 1: Create `src/components/AppNav.tsx`**

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
          <Link href="/productions" className="link-muted text-sm">
            Productions
          </Link>
          <Link href="/my-work" className="link-muted text-sm">
            My Work
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `src/app/(app)/layout.tsx`**

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

- [ ] **Step 3: Move the authenticated page folders into the group**

Run (the `(app)` path must be quoted because of the parentheses):

```bash
git mv src/app/productions "src/app/(app)/productions"
git mv src/app/makers "src/app/(app)/makers"
git mv src/app/inventory "src/app/(app)/inventory"
git mv src/app/my-work "src/app/(app)/my-work"
```

- [ ] **Step 4: Strip the inline header from `src/app/(app)/productions/page.tsx`**

(4a) Imports — replace:
```tsx
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { getAuthContext } from "@/lib/auth-context";
```
with:
```tsx
import Link from "next/link";
import { getAuthContext } from "@/lib/auth-context";
```

(4b) Remove the `OrgSwitcher` import — replace:
```tsx
import { InventoryQuickAddCard } from "@/components/InventoryQuickAddCard";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ShowingsList } from "@/components/ShowingsList";
```
with:
```tsx
import { InventoryQuickAddCard } from "@/components/InventoryQuickAddCard";
import { ShowingsList } from "@/components/ShowingsList";
```

(4c) Drop `user`/`userName` — replace:
```tsx
  const [productions, inventoryItems, user] = await Promise.all([
    listProductions(orgId),
    listInventoryItems(orgId),
    currentUser(),
  ]);

  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "";

  const allShowDates = await listShowDates(productions.map((p) => p.id));
```
with:
```tsx
  const [productions, inventoryItems] = await Promise.all([
    listProductions(orgId),
    listInventoryItems(orgId),
  ]);

  const allShowDates = await listShowDates(productions.map((p) => p.id));
```

(4d) Remove the inline header div — replace:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--field-line)] pb-3">
        <OrgSwitcher />
        <div className="flex items-center gap-2.5">
          <Link href="/my-work" className="link-muted text-sm">
            My Work
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
      </div>

      <div className="mb-6 flex items-center justify-between gap-3">
```
with:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
```

- [ ] **Step 5: Verify typecheck + lint**

Run: `npx tsc --noEmit` → clean. Run: `npm run lint` → no new errors (`Link` is still used in productions/page.tsx for "+ New Production" and the list items; `UserButton`/`currentUser`/`OrgSwitcher`/`user`/`userName` are now gone, so no unused-symbol warnings).

- [ ] **Step 6: Verify the routes still resolve at unchanged paths (dev server on :3000)**

```bash
for p in /productions /makers /inventory /my-work; do
  /usr/bin/curl -s -o /dev/null -w "$p -> %{http_code}\n" "http://localhost:3000$p"
done
```
Expected: each returns `307` (Clerk auth redirect) — i.e. the route resolves at its original path (route group did not change URLs). A `404` on any would mean the move broke that route — stop and investigate.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: global nav via (app) route-group layout; dedupe productions header"
```

---

## Task 2: Remove redundant back links from top-level pages

The global nav now covers Productions, so the `← Productions` back link on these three sibling pages is redundant. Remove it (and the now-unused `Link` import in each).

**Files:**
- Modify: `src/app/(app)/makers/page.tsx`, `src/app/(app)/inventory/page.tsx`, `src/app/(app)/my-work/page.tsx`

- [ ] **Step 1: `makers/page.tsx`** — remove the back-link block. Replace:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
```
with:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
```
Then remove the now-unused import line `import Link from "next/link";` from the top of the file.

- [ ] **Step 2: `inventory/page.tsx`** — same edit. Replace:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
```
with:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
```
Then remove `import Link from "next/link";`.

- [ ] **Step 3: `my-work/page.tsx`** — same edit. Replace:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <div className="mt-2 mb-6">
```
with:
```tsx
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
```
Then remove `import Link from "next/link";`.

(If any of these files turns out to use `Link` elsewhere, leave its import — verify via the lint step. As of writing, all three use `Link` only for the back link.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean. Run: `npm run lint` → no new errors (no unused `Link`). Run: `npx vitest run` → green, unchanged count.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: drop redundant back links now covered by the global nav"
```

---

## Task 3: Verification

**Files:** none. Dev server: http://localhost:3000 (Clerk-gated → interactive checks need an authenticated browser).

- [ ] **Step 1: Static + route checks**

Run and confirm: `npx tsc --noEmit` (clean), `npm run lint` (no new errors), `npx vitest run` (green). Then re-run the route smoke-check from Task 1 Step 6 — all `/productions`, `/makers`, `/inventory`, `/my-work` return `307`.

- [ ] **Step 2: Browser**

In an authenticated browser confirm:
- The nav bar (`org ▾ · Productions · My Work · Inventory · username · UserButton`) appears on **every** authenticated page: productions list, a production detail page, the tailor summary, a performer page, makers (org menu → Manage → Makers), inventory, my-work.
- `Productions` / `My Work` / `Inventory` links and the org switcher all work.
- makers / inventory / my-work no longer show a `← Productions` back link; deep pages (production detail, summary, performer) still show their contextual back links.
- `sign-in`, `sign-up`, and `onboarding` show **no** nav.

---

## Self-Review Notes

- **Spec coverage:** route group + move (T1 Steps 2-3), `AppNav` (T1 Step 1), `(app)/layout.tsx` (T1 Step 2), productions header removal (T1 Step 4), back-link removal on the three siblings (T2), deep pages untouched (no task — intentional), URL-unchanged verification (T1 Step 6 + T3). ✓
- **No placeholders / exact edits:** every edit shows full old→new strings; `git mv` commands are exact and quote the `(app)` path. ✓
- **Consistency:** `AppNav` reuses the exact nav markup/classes removed from productions/page.tsx; the link set matches the spec (`Productions · My Work · Inventory`). ✓
- **Build caveat:** `next build` is intentionally NOT run as a verification step because the dev server on :3000 shares the `.next` dir; the route smoke-check (curl → 307) proves URLs are unchanged without that conflict.
