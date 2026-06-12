# Organization Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the productions nav's org name into a Clerk `<OrganizationSwitcher>` that handles org switching/creation and member management (invite-by-email, Admin/Member roles), embed the existing Makers roster as a custom org-profile page, and let onboarding create-or-join via `<OrganizationList>`.

**Architecture:** Clerk-native. A `"use client"` `OrgSwitcher` isolates all Clerk org-component JSX (so the productions page stays a server component) and declares a custom "Makers" profile page rendering `OrgMakersPanel` (which fetches `/api/makers` and reuses `MakersManager`). Member management is Clerk's built-in OrganizationProfile — no backend code. Data scoping is unchanged: `getAuthContext` already reads Clerk's active org.

**Tech Stack:** Next.js 16 App Router, `@clerk/nextjs` ^7.4.3 (`OrganizationSwitcher`, `OrganizationList`, custom profile pages, `appearance`), TypeScript strict, Tailwind 4.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/clerk-appearance.ts` | **new** — shared Clerk `appearance` config (theme tokens) |
| `src/components/OrgMakersPanel.tsx` | **new** — `"use client"`; fetch `/api/makers` → `<MakersManager>`; exports `MakersTabIcon` |
| `src/components/OrgSwitcher.tsx` | **new** — `"use client"`; `<OrganizationSwitcher>` + Makers custom page |
| `src/app/productions/page.tsx` | **modify** — render `<OrgSwitcher/>` in place of org-name span; remove Makers link; drop `clerkClient` org fetch |
| `src/app/onboarding/page.tsx` | **modify** — `<CreateOrganization>` → `<OrganizationList>` + copy |

There is no new pure logic, so there are **no new unit tests**; the repo has no React-component test infra and member management is Clerk-owned. Each task verifies with `npx tsc --noEmit` and `npm run lint`; the suite (`npx vitest run`) must stay green; final behavior is verified in an authenticated browser.

---

## Task 1: Shared Clerk appearance config

**Files:**
- Create: `src/lib/clerk-appearance.ts`

- [ ] **Step 1: Create the config**

Create `src/lib/clerk-appearance.ts` with exactly:

```ts
// Shared appearance for Clerk org components, approximating the Atelier theme.
// Left untyped on purpose so we don't depend on a specific @clerk/types export;
// the object is structurally validated where it's passed to `appearance={...}`.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#8c2b22", // curtain red
    colorText: "#241c19", // ink
    colorBackground: "#fbf5e9", // surface cream
    colorInputBackground: "#fbf5e9",
    colorInputText: "#241c19",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-hanken), system-ui, sans-serif",
  },
  elements: {
    card: { border: "1px solid #2a211c" },
  },
};
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (Not imported yet — that's fine.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/clerk-appearance.ts
git commit -m "feat: shared Clerk appearance config"
```

---

## Task 2: OrgMakersPanel (Makers embedded for the org profile)

A client component that fetches the maker roster and renders the existing `MakersManager`. Also exports `MakersTabIcon` for the custom-page label. `MakerRow` is NOT exported by `MakersManager`, so define a local matching type and map the response to it.

**Files:**
- Create: `src/components/OrgMakersPanel.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/OrgMakersPanel.tsx` with exactly:

```tsx
"use client";

import { useEffect, useState } from "react";
import { MakersManager } from "@/components/MakersManager";

type MakerRow = { id: string; name: string; color: string };

export function MakersTabIcon() {
  // Small scissors glyph for the custom profile-page label.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  );
}

export function OrgMakersPanel() {
  const [makers, setMakers] = useState<MakerRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/makers", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((d: { makers?: MakerRow[] }) => {
        if (active) setMakers((d.makers ?? []).map((m) => ({ id: m.id, name: m.name, color: m.color })));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-[var(--red)]">Couldn&apos;t load makers.</p>;
  if (!makers) return <p className="text-sm muted">Loading makers…</p>;

  return (
    <div>
      <h2 className="font-display text-xl font-semibold">Makers</h2>
      <p className="mt-1 mb-4 text-sm muted">
        Your costume team. Assign them to pieces to make, and track who&apos;s done.
      </p>
      <MakersManager initialMakers={makers} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `OrgMakersPanel.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/OrgMakersPanel.tsx
git commit -m "feat: OrgMakersPanel — maker roster for the org profile"
```

---

## Task 3: OrgSwitcher (nav switcher + Makers custom page)

**Files:**
- Create: `src/components/OrgSwitcher.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/OrgSwitcher.tsx` with exactly:

```tsx
"use client";

import { OrganizationSwitcher } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import { MakersTabIcon, OrgMakersPanel } from "@/components/OrgMakersPanel";

export function OrgSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterSelectOrganizationUrl="/productions"
      afterCreateOrganizationUrl="/productions"
      appearance={clerkAppearance}
    >
      <OrganizationSwitcher.OrganizationProfilePage label="Makers" labelIcon={<MakersTabIcon />} url="makers">
        <OrgMakersPanel />
      </OrganizationSwitcher.OrganizationProfilePage>
    </OrganizationSwitcher>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. If tsc reports that `OrganizationSwitcher.OrganizationProfilePage` does not exist on the type, STOP and report — the fallback is `<OrganizationSwitcher.OrganizationProfileLink label="Makers" url="/makers" labelIcon={<MakersTabIcon />} />` (links to the standalone makers page instead of embedding), but do not switch without flagging it.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/OrgSwitcher.tsx
git commit -m "feat: OrgSwitcher with embedded Makers profile page"
```

---

## Task 4: Wire the switcher into the productions nav

Replace the static org-name label with `<OrgSwitcher/>`, remove the standalone Makers link, and drop the now-unneeded `clerkClient` org fetch (the switcher renders the org name).

**Files:**
- Modify: `src/app/productions/page.tsx`

- [ ] **Step 1: Update the import line for server Clerk helpers**

In `src/app/productions/page.tsx`, change:

```tsx
import { currentUser, clerkClient } from "@clerk/nextjs/server";
```

to:

```tsx
import { currentUser } from "@clerk/nextjs/server";
```

- [ ] **Step 2: Add the OrgSwitcher import**

Immediately after the existing `import { InventoryQuickAddCard } from "@/components/InventoryQuickAddCard";` line, add:

```tsx
import { OrgSwitcher } from "@/components/OrgSwitcher";
```

- [ ] **Step 3: Drop the org fetch from the Promise.all**

Change:

```tsx
  const [productions, inventoryItems, user, org] = await Promise.all([
    listProductions(orgId),
    listInventoryItems(orgId),
    currentUser(),
    clerkClient().then((c) => c.organizations.getOrganization({ organizationId: orgId })),
  ]);
```

to:

```tsx
  const [productions, inventoryItems, user] = await Promise.all([
    listProductions(orgId),
    listInventoryItems(orgId),
    currentUser(),
  ]);
```

- [ ] **Step 4: Replace the org-name span + Makers link in the header**

Change:

```tsx
        <span className="lbl">{org.name}</span>
        <div className="flex items-center gap-2.5">
          <Link href="/makers" className="link-muted text-sm">
            Makers
          </Link>
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
```

to:

```tsx
        <OrgSwitcher />
        <div className="flex items-center gap-2.5">
          <Link href="/inventory" className="link-muted text-sm">
            Inventory
          </Link>
          {userName && <span className="text-sm muted">{userName}</span>}
          <UserButton />
        </div>
```

- [ ] **Step 5: Verify typecheck (catches any other `org` references)**

Run: `npx tsc --noEmit`
Expected: no errors. (`org` is no longer referenced; `orgId`, `userName`, `user`, `Link`, `UserButton` all still used.)

- [ ] **Step 6: Lint**

Run: `npm run lint`
Expected: no new errors (no unused `clerkClient`/`org`).

- [ ] **Step 7: Run the suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/productions/page.tsx
git commit -m "feat: org switcher in productions nav; drop separate Makers link"
```

---

## Task 5: Onboarding create-or-join

**Files:**
- Modify (full rewrite): `src/app/onboarding/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/onboarding/page.tsx` with exactly:

```tsx
"use client";

import { OrganizationList } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="font-display text-3xl font-semibold">Your organization</h1>
        <p className="mt-1 muted">
          Create a school or accept an invitation to start planning productions.
        </p>
      </div>
      <OrganizationList
        hidePersonal
        afterCreateOrganizationUrl="/productions"
        afterSelectOrganizationUrl="/productions"
        appearance={clerkAppearance}
      />
    </main>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat: onboarding via OrganizationList (create or accept invite)"
```

---

## Task 6: Manual verification

**Files:** none (verification only). The app is Clerk-gated; these checks require an authenticated browser. Dev server runs on http://localhost:3000.

- [ ] **Step 1: Nav switcher**

Open `/productions`. Confirm the top-left shows the Clerk org switcher displaying the current org name (no separate "Makers" link remains; "Inventory", username, and the user button are still on the right).

- [ ] **Step 2: Members management**

Open the switcher → "Manage organization" → Members. Confirm you can invite by email, the invited address appears as pending, and (as the org creator/Admin) you can set role Admin/Member and remove a member. General tab can rename and leave.

- [ ] **Step 3: Makers tab**

In the same Manage area, confirm a "Makers" page appears with the scissors icon, rendering the maker roster (add/rename/recolor/remove still work via the embedded `MakersManager`).

- [ ] **Step 4: Switch / create org**

Create a second org (or switch to another) from the switcher; confirm the app reloads to `/productions` scoped to the newly active org (its own productions/makers/inventory).

- [ ] **Step 5: Onboarding create-or-join**

As a signed-in user with no active org (or a fresh account), confirm `/onboarding` shows the organization list with a create-organization action and any pending invitations to accept; accepting/creating lands on `/productions`.

---

## Self-Review Notes

- **Spec coverage:** nav switcher (Task 4 + Task 3), Makers custom page (Task 2 + Task 3), members/invite/roles via Clerk (Task 3 switcher → built-in profile; verified Task 6.2), onboarding create-or-join (Task 5), shared appearance (Task 1, used in Tasks 3 & 5), data scoping unchanged (no task needed — `getAuthContext` untouched). ✓
- **Type consistency:** `clerkAppearance` (Task 1) imported in Tasks 3 & 5; `OrgMakersPanel`/`MakersTabIcon` (Task 2) imported in Task 3; `OrgSwitcher` (Task 3) imported in Task 4; local `MakerRow` matches `MakersManager`'s `{ id, name, color }` prop. ✓
- **Fallback recorded:** if custom profile pages aren't supported by the installed Clerk types, Task 3 Step 2 flags it and names the `OrganizationProfileLink` fallback rather than silently diverging.
- **No migration / no data-layer change**, consistent with the spec.
