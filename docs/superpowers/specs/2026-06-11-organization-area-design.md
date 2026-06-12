# Organization area — switcher, members, makers — design

**Date:** 2026-06-11
**Status:** Approved for planning
**Stack note:** Clerk `@clerk/nextjs` ^7.4.3 (org components + custom profile pages), Next.js 16 App Router.

## Problem

Today there is **no way to join an existing organization**. `onboarding/page.tsx`
renders only `<CreateOrganization>`, so every signup creates its own siloed org — a
second staff member cannot get into the first person's org. There is no org switcher, no
member management, and no in-app invitation surface anywhere. Separately, the productions
nav shows the org name as a non-clickable `<span>` and exposes **Makers** as its own
top-nav link, even though Makers conceptually belongs to the organization.

Note the distinction this design relies on:
- **Makers** = an app-level roster of the costume team (`makers` table: name + color), used
  to assign pieces. They are **not** users and have no login.
- **Members** = Clerk-managed users who belong to the Clerk organization.

## Goal

Turn the org name in the nav into a Clerk **`<OrganizationSwitcher>`** that handles
switching, creating, and managing organizations; move **Makers** into that org area as a
custom profile page alongside **Members**; and give new users a real path into an existing
org via **admin email invitations**. Lean on Clerk's prebuilt UI so member
management/auth stays Clerk-owned (the secure path) with minimal custom code.

Out of scope: custom-themed member management (we use Clerk's), per-resource permissions
beyond Admin/Member, view-only roles, domain-based auto-join.

## Decisions (from brainstorming)

1. **Join model:** admin invites by email (Clerk invitations). Works on Clerk free tier.
2. **Roles:** Admin + Member, using Clerk's built-in `org:admin` / `org:member`. Org
   creator is Admin; admins invite/remove members and rename/manage the org; members have
   full access to productions/makers/inventory but cannot manage members.
3. **Multi-org:** a user may belong to several orgs and switch the active one. The active
   org drives all data scoping (already how `getAuthContext` works).
4. **Build approach:** Clerk-native — `<OrganizationSwitcher>` + its built-in
   OrganizationProfile for members; **Makers embedded as a custom profile page**.

## Architecture

### 1. Nav switcher — `src/app/productions/page.tsx`

Replace the static org-name label with `<OrganizationSwitcher>`:

- Props: `hidePersonal` (the app requires an org — no personal workspace),
  `afterSelectOrganizationUrl="/productions"`, `afterCreateOrganizationUrl="/productions"`,
  `appearance={clerkAppearance}` (see §6).
- **Remove** the standalone `<Link href="/makers">Makers</Link>`. Keep the `/inventory`
  link, `userName`, and `<UserButton>` on the right.
- The page currently fetches the org via `clerkClient` solely to render `org.name`; the
  switcher renders the name itself, so **drop that `clerkClient` org fetch** and the `org`
  entry from the `Promise.all`. (`currentUser()` is still needed for `userName`.)

`<OrganizationSwitcher>` is a client component; the productions page is a server
component. Rendering a Clerk client component inside a server component is supported
(Clerk components are client-tagged), so no `"use client"` change to the page is needed.

### 2. Makers as a custom org-profile page

The custom page is declared as a child of the switcher:

```tsx
<OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/productions" appearance={clerkAppearance}>
  <OrganizationSwitcher.OrganizationProfilePage label="Makers" labelIcon={<MakersTabIcon />} url="makers">
    <OrgMakersPanel />
  </OrganizationSwitcher.OrganizationProfilePage>
</OrganizationSwitcher>
```

- **`OrgMakersPanel`** (new client component, `src/components/OrgMakersPanel.tsx`): on
  mount, `GET /api/makers` (credentials: "include") → renders
  `<MakersManager initialMakers={…} />` with the existing component. Shows a lightweight
  loading line until the fetch resolves, and an error line on failure. This reuses
  `MakersManager` unchanged.
- **`MakersTabIcon`** — a tiny inline SVG/icon element for `labelIcon` (Clerk requires a
  ReactElement). Can live in `OrgMakersPanel.tsx` or reuse an existing icon from
  `src/components/role-icons.tsx` if one fits.
- Because the switcher with custom children must be a client component context, the JSX
  for the switcher + custom page is extracted into a small client component
  **`OrgSwitcher`** (`src/components/OrgSwitcher.tsx`, `"use client"`) that the server
  productions page renders as `<OrgSwitcher />`. This keeps the page a server component
  and isolates all Clerk-client JSX in one file.

The standalone `/makers` route and page stay as-is (still functional if visited directly)
but are no longer linked from the nav. No redirect — avoids breaking bookmarks.

### 3. Member management — Clerk, no custom code

Provided entirely by `<OrganizationSwitcher>`'s "Manage organization" → built-in
`OrganizationProfile`:
- **Members:** list, invite by email, set role (Admin/Member), remove.
- **General:** rename org, leave org.
Admin-only actions are enforced by Clerk based on the member's role. No API routes, no
data-layer changes for this.

### 4. Onboarding — `src/app/onboarding/page.tsx`

Swap `<CreateOrganization>` for `<OrganizationList>`:

```tsx
<OrganizationList
  hidePersonal
  afterCreateOrganizationUrl="/productions"
  afterSelectOrganizationUrl="/productions"
  appearance={clerkAppearance}
/>
```

`<OrganizationList>` shows the user's existing memberships, **pending invitations they can
accept**, and a create-organization action — so an invited-but-org-less user can now join,
not just create. Keep the surrounding heading/copy (adjust copy from "Create your school"
to reflect create-or-join). The middleware `orgGate` is unchanged: org-less users still
land on `/onboarding`; once they accept/create and an org becomes active, they proceed.

### 5. Data scoping — unchanged

`getAuthContext()` returns Clerk's active `orgId`; every data-layer query already scopes
by it. Switching orgs in the switcher calls Clerk's `setActive` internally and navigates
to `/productions` (via `afterSelectOrganizationUrl`), reloading server components against
the new active org. **No migration, no data-layer edits.**

### 6. Theming — `src/lib/clerk-appearance.ts`

A single shared `appearance` object reused by `OrgSwitcher`, `OrganizationList`, and any
other Clerk component:

- `variables`: `colorPrimary` = curtain red `#8c2b22`, `colorText` = ink `#241c19`,
  `colorBackground` = surface `#fbf5e9`, `fontFamily` = Hanken, `borderRadius` to match.
- `elements`: minimal overrides as needed (e.g., button/card border to `--field-line`).

Match is approximate (Clerk renders its own DOM); goal is "consistent and on-brand," not
pixel-identical to the Atelier theme.

## Files

| File | Change |
|------|--------|
| `src/lib/clerk-appearance.ts` | **new** — shared Clerk `appearance` config |
| `src/components/OrgSwitcher.tsx` | **new** — `"use client"` wrapper: `<OrganizationSwitcher>` + Makers custom page |
| `src/components/OrgMakersPanel.tsx` | **new** — client: fetch `/api/makers` → `<MakersManager>`; exports `MakersTabIcon` |
| `src/app/productions/page.tsx` | replace org-name span with `<OrgSwitcher/>`; remove Makers link; drop `clerkClient` org fetch |
| `src/app/onboarding/page.tsx` | `<CreateOrganization>` → `<OrganizationList>`; update copy |

## Risks / caveats

- **Clerk free-tier member limit.** Free org plans historically cap members per org (~5).
  Confirm the real staff headcount fits free tier before relying on invites at scale; may
  require a Clerk paid plan. Not a build blocker.
- **Custom-page embedding friction.** If `OrgMakersPanel` inside the Clerk custom page
  hits styling/context issues, fallback is a switcher action linking to `/makers`
  (`<OrganizationSwitcher.OrganizationProfileLink label="Makers" url="/makers" />`).
- **Theme fidelity** is approximate by design (Clerk-owned DOM).

## Testing / verification

- No new pure logic → no new unit tests. `orgGate` is already unit-tested and unchanged.
- Verify: `npx tsc --noEmit` clean · `npm run lint` no new errors · `npx vitest run`
  green · then in an authenticated browser: the nav shows the org switcher; "Manage
  organization" shows Members (invite by email works, role + remove work) and a Makers tab
  rendering the maker roster; creating/switching orgs reloads productions scoped to the new
  org; onboarding (as an org-less user) offers create **and** any pending invitation.
