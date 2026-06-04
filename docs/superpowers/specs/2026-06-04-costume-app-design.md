# Nada's Costume App — v1 Design Spec

**Date:** 2026-06-04
**Status:** Draft for review
**Source:** "Meeting with Nada at Saw Agency" transcript (2026-05-18), costume-app discussion ≈55:00–1:06:00, plus follow-up scoping with Chris.

---

## 1. Background & problem

Nada is a volunteer costume maker for high-school theater productions (Mary Poppins,
Newsies, Mamma Mia, Cinderella). She works **without commercial patterns** — for every
show she measures each performer and figures out fabric needs and construction from
scratch, by hand, every time. The repeated, concrete pain is: **"how much fabric do I
need?"** She wants software that turns a production's cast and their measurements into a
reliable fabric shopping plan, organized per show.

This app is a joint build (Nada + Chris, 50/50 per the meeting). The long-term vision
includes construction guidance, fabric shopping links, school memberships, and expansion
to other crafts (quilting, yarn, pottery, Cricut). **This spec covers v1 only** and
deliberately defers the riskier/long-tail pieces.

### Hard constraints (non-negotiable)
- **No photos of children, anywhere.** Performers are represented by a text label +
  measurements only. Enforced by simply not building any image field.
- **Extreme UX simplicity.** The primary user is intentionally non-technical
  ("I don't have any apps on my phone"). Data is entered on a phone, standing in a
  fitting room with a tape measure.

---

## 2. v1 scope

### In scope
- **Production workspace**: productions → roles → casts → performers/measurements →
  per-role costume designs → per-performer fabric calculations.
- **Roles (characters)** per production (e.g. Mary Poppins, Bert, Mr. Banks).
- **Multiple casts** per production with **custom names + color** (e.g. Gold Cast, Blue
  Cast), each ≥1; a default cast is created automatically.
- **Castings**: assign a performer to a role within a cast, flagged **primary** or
  **understudy**.
- **Costume model (Option A)**: a costume is **designed once per role** (garment, fabric,
  color, budget); the app generates a **sized fabric calc per performer** playing that
  role, across all casts and understudies, and totals fabric across them.
- **Per-piece source** (affordability): every per-performer piece is **Make from fabric**
  (default — runs the calc, counts toward fabric + budget), **On hand** (org already owns
  it — no calc, excluded, optional note), or **Shares another performer's costume**
  (no calc, excluded, references the piece being shared).
- **Budget** per costume design / per show (Nada's "$30 per kid" idea), counting only
  pieces that are *made*.
- **Multi-user accounts**: Clerk Organizations (schools) **and** per-production
  collaborator invites with roles.
- **Production show date + countdown** on the productions list.
- **Garment library (small, proven set)**: skirt, pants/knickers, vest.
- **Play templates**: **user-defined** (save any production's role list as a reusable
  template) **plus a small seed** of a few popular school titles (role lists only).

### Out of scope for v1 (future)
- **Construction guidance** (AI "how to cut/fold/dart/assemble"). Hardest, least reliable
  piece; revisit later.
- **Wardrobe inventory** — a searchable catalog of org-owned garments with sizes. v1 only
  has the lightweight "On hand + note" marker, not a managed inventory.
- **Fabric shopping links / retailer pricing feeds.** Manual price entry only in v1.
- **Paid billing.** v1 is free but **billing-ready** (see §6).
- **Custom garment / formula editor** for Nada. (The data-driven engine paves the way; UI
  comes later.)
- **Large curated play catalog.** v1 seeds only a handful; a broad, IP-vetted library is a
  later content effort.
- **Second "costumes-due" date** (e.g. dress rehearsal). v1 has one show date.
- Expansion to non-costume crafts (quilting, yarn, pottery, Cricut).

### Success criteria
- Nada can create a show (optionally from a template), define roles, set up one or more
  casts with primaries + understudies, add performers, enter measurements on a phone, and
  get a trustworthy "buy this much fabric" total with a budget check — without a manual.
- Pieces can be marked made / on-hand / shared so totals reflect only what must be sewn.
- Fabric numbers are deterministic and covered by tests with known-good cases.
- A second costumer or a director can be invited to a production with the right access.

---

## 3. Platform & architecture

- **Next.js 16** (App Router), **TypeScript** (strict, `@/*` → `./src/*`),
  **Tailwind CSS 4**, deployed on **Vercel**. Note: Next 16 middleware is `proxy.ts`,
  not `middleware.ts`.
- **Supabase** (Postgres). All writes/reads of app data go through `supabaseAdmin`
  (service-role key, **server-side only**, never exposed to the browser).
- **Clerk** for authentication + **Organizations** (schools). Every API route:
  1. validates `userId` from `auth()`;
  2. resolves the user's access to the target org/production;
  3. only then queries Supabase.
  Client-side fetches use `credentials: "include"`.
- **Server components by default**; `"use client"` only where interactive (measurement
  entry, cast grid, live calc results, countdown).

---

## 4. Data model (Supabase)

### Global reference tables (data-driven)

**`garment_templates`** — `id, name, slug, description, fabric_widths int[],
formula text, required_measurement_keys text[], default_waste_buffer_pct, active,
timestamps`. Seeded v1: **skirt, pants/knickers, vest.**

**`measurement_definitions`** — `key pk, label, unit, input_type, help_text,
display_order`. Standard costuming set (**to be confirmed by Nada**): height, weight,
chest/bust, waist, hips, shoulder width, sleeve/arm length, back length, inseam, outseam.

### Play templates

**`play_templates`** — `id pk, title, description, scope ('seed'|'org'),
org_id (null for seed), source_note, created_by, created_at`. Seed = global starter
titles; org = user-saved.

**`play_template_roles`** — `id pk, play_template_id fk, role_name, display_order,
typically_has_understudy bool, notes`.

### Per-organization application data

**`organizations`** — app row keyed to Clerk org id:
`clerk_org_id pk, name, plan (default 'free'), plan_status, limits jsonb, created_at`.
Billing-ready placeholders; nothing charged in v1.

**`productions`** — `id pk, org_id fk, created_by, title, show_date date,
play_template_id (nullable, provenance), notes, timestamps`.

**`roles`** (characters) — `id pk, production_id fk, name, display_order, notes`.
Seeded from a template's roles when one is chosen; freely editable.

**`casts`** — `id pk, production_id fk, name, color, is_default bool, display_order,
created_at`. A default cast is auto-created with each production.

**`performers`** (people) — `id pk, production_id fk, label (role or first name), notes,
created_at`. No photos; no PII beyond a label.

**`performer_measurements`** — `id pk, performer_id fk, measurement_key fk,
value_numeric, unit, updated_at`. One row per measurement.

**`castings`** — `id pk, production_id fk, cast_id fk, role_id fk, performer_id fk,
assignment ('primary'|'understudy'), display_order`. A performer playing a role in a cast.

**`costume_designs`** (per role, one row per garment that makes up the character's look —
e.g. "Mary's jacket", "Mary's skirt") — `id pk, production_id fk, role_id fk, name,
garment_template_id fk, fabric_width, fabric_type, fabric_color, waste_buffer_pct,
price_per_yard_cents, budget_cents, notes, timestamps`.

**`costume_pieces`** (the per-performer instance of a design) — `id pk,
costume_design_id fk, casting_id fk, source ('make'|'on_hand'|'shared'),
shared_with_piece_id (nullable → costume_pieces.id), source_note, computed_yardage,
computed_cost_cents, status, updated_at`. The `casting_id` supplies performer (→
measurements), cast, and role; the design supplies garment + fabric. Pieces are
materialized for each (design × casting of that design's role) so totals are exact;
computed values are **cached** and recomputed when inputs change.

---

## 5. Fabric calculation engine

Deterministic, explainable, test-covered.

- Each `garment_templates.formula` is a **safe arithmetic expression** over measurement
  variables (by key), `fabric_width`, and `waste_buffer_pct`, evaluated by **one generic
  evaluator** using a sandboxed expression parser (e.g. `expr-eval`). **Never `eval()`.**
- **Per piece, behavior depends on `source`:**
  - `make` — normalize the performer's measurements, evaluate the design's garment
    formula at the design's fabric width + buffer; `computed_yardage` rounded **up** to ¼
    yard; `computed_cost_cents = yardage × price_per_yard_cents`. Counts toward fabric
    totals + budget.
  - `on_hand` — no calc; excluded from fabric totals and spend; optional `source_note`.
  - `shared` — no calc; excluded; `shared_with_piece_id` records whose made garment is
    reused.
- **Waste buffer** models Nada's "one or two extra for mistakes."
- **Missing measurements:** if the performer lacks any of the garment template's
  `required_measurement_keys`, the piece renders **"needs: chest, waist…"** instead of a
  number. A fake number is never shown.
- **Totals (production & per-design):** sum yardage by `fabric_type` over `make` pieces;
  total cost vs budget; counts of make / on-hand / shared; list of pieces needing
  measurements.
- **Reliability:** every seeded garment template ships with **unit tests** asserting
  known-good yardage for sample measurement sets at each fabric width. Built
  **test-first** — a wrong number costs real money and fabric. Formulas authored/validated
  with Nada.

---

## 6. Permissions & billing-ready seam

- **Org (school):** Clerk Organizations. Org admins manage members; members can see
  productions shared at the org level.
- **Production roles** (access, distinct from theatrical "roles"/characters):
  - `owner` — full control, delete, invite.
  - `editor` — add/edit roles, casts, castings, performers, measurements, designs, pieces.
  - `viewer` — read-only (e.g. a director).
- **Enforcement:** in **every** API route — `auth()` → resolve the user's effective
  access role for that production (org membership + `production_collaborators`) →
  allow/deny. No client-trusted permissions. All production-scoped tables (roles, casts,
  castings, performers, designs, pieces) are gated through the parent production.
- **Billing-ready:** a single `assertWithinPlanLimits(org, action)` checkpoint (e.g. max
  productions). No-op in v1, but the **one** place subscription gating will live later.

**`production_collaborators`** — `production_id fk, user_id, role
('owner'|'editor'|'viewer'), created_at`, PK (production_id, user_id).
**`production_invites`** — `id pk, production_id fk, email, role, token,
status ('pending'|'accepted'|'revoked'), created_at, accepted_at`.

---

## 7. Screens & flows

Mobile-first; big tap targets; one primary action per screen; autosave throughout; plain
language. Empty states and inline hints do the teaching — **no manual**.

1. **Sign in / pick school** (Clerk) → **My Productions**.
2. **Productions list** — cards show title, **countdown** to show date
   (*"42 days to go"* / *"Opens today!"* / muted *"Opened 3 days ago"*), # roles,
   # performers, "to make" count, budget status. Default sort: soonest show date.
   Prominent **"+ New Production"**.
3. **New production** — title, **show date**, notes; optionally **start from a template**
   (seed titles or your org's saved templates) → seeds the role list. A default cast is
   created.
4. **Production detail** — tabs:
   - **Cast** — a grid: **roles as rows, casts as columns**; each cell shows the assigned
     performer (+ an understudy slot), marked primary/understudy. Add/rename roles, add
     casts (custom name + color), assign performers. This is the cast-list view.
   - **Performers** — the people and their **measurements** (large numeric inputs, in/cm
     toggle, autosave, progress "6 of 9 measured"). No photos.
   - **Costumes** — list of **per-role designs** ("+ Add costume to a role" → garment,
     fabric width, type, color, budget). Open a design → see its **per-performer pieces**
     (everyone playing that role across casts + understudies) each with a **source toggle**
     (Make / On hand / Shares…) and its live yardage + budget result.
   - **Summary** — totals: yardage by fabric, total cost vs budget, counts of
     make/on-hand/shared, and any pieces still "needs measurements." A **Save as template**
     action captures the role list for reuse.
5. **Share** — invite a collaborator by email (org member or per-production) with a role.

---

## 8. Non-functional requirements

- **Privacy:** no image-upload fields exist anywhere. Performer data = label +
  measurements.
- **Simplicity:** one primary action per screen; autosave (no "Save" hunting);
  mobile-first; plain language, not jargon. The cast grid is the one denser screen and
  gets extra care.
- **Error handling:** missing measurements → clear "needs X," never a fabricated number.
  Optional email (invites via Resend) **fails gracefully** if API keys are absent.
- **Testing:** TDD for (a) the calc engine — per-template known-good cases at each fabric
  width, plus source behavior (make vs on_hand/shared exclusion); (b) permission checks —
  each access role × each protected route. No suite exists yet, so a minimal runner is
  stood up scoped to these areas.

---

## 9. Suggested build order (for the plan)

Large for one milestone, so the plan should sequence it:
1. Auth + orgs + productions + show date/countdown + productions list.
2. Performers + measurements + garment templates + calc engine (single default cast,
   per-performer costume) — proves the core number, test-first.
3. Roles + multiple casts + castings (cast grid) + costume designs → per-performer pieces.
4. Per-piece sources (make/on-hand/shared) + summary totals + budget.
5. Play templates (user-defined save + small seed) + collaborator invites.

---

## 10. Open items for Nada

1. **Confirm the measurement field list** against her 4-page paper intake form.
2. **Validate the three seed formulas** (skirt, pants/knickers, vest) with known-good real
   examples for the unit tests.
3. Confirm **"show date"** is the right countdown anchor (vs a costumes-due date).
4. Pick the **handful of seed play titles** to ship (role lists only).
