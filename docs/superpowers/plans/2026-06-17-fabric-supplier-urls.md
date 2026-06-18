# Fabric Supplier URLs + Clickable Shopping Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional URL to each fabric supplier and render the supplier name as a link on the Shopping tab of Costume Creations and My Work.

**Architecture:** Add a nullable `url` column to `fabric_suppliers`; carry it through the data layer (with a normalizer that prepends `https://`), the admin Fabric panel (add form + inline-editable per row), and the shared Costume Creations loader. Because a piece stores its supplier as free text, the Shopping list resolves name → URL via a case-insensitive map threaded into `buildFabricPurchaseList`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript (strict), Supabase, Vitest (node env — no jsdom/RTL).

## Global Constraints

- Schema change goes in **`supabase/migrations/0025_fabric_supplier_url.sql`** (next number; highest existing is `0024`).
- **Do NOT apply the migration to Supabase, push to GitHub, or deploy.** Local commits only; hold for Chris's explicit green light.
- Tests run in the **node** Vitest environment — component JSX is verified by `npx tsc --noEmit` + `npm run build`, NOT unit tests. Absence of a component render test is by design.
- URL normalization: trim; empty → `null`; prepend `https://` when no `http(s)://` scheme is present.
- Name matching between a piece's free-text supplier and the supplier list is **case-insensitive, trimmed** (`name.trim().toLowerCase()`).
- Supplier links open in a new tab (`target="_blank" rel="noopener noreferrer"`), styled with the existing `link-red` class.
- Supplier-settings writes stay admin-gated via the existing `requireOrgAdmin()` routes.
- Run the full suite with `npm test` (alias for `vitest run`). Current baseline: 444 passing.

---

### Task 1: Migration `0025` — add `url` column

**Files:**
- Create: `supabase/migrations/0025_fabric_supplier_url.sql`

**Interfaces:**
- Produces: a nullable `fabric_suppliers.url text` column.

> No automated test (SQL migration; data-layer tests mock Supabase). Verification is self-review — the migration is **not applied** this session.

- [ ] **Step 1: Create the migration file**

```sql
-- Optional website per fabric supplier. Rendered as a link on the Shopping tab
-- (Costume Creations + My Work). Nullable; existing suppliers keep url = null.
alter table fabric_suppliers add column if not exists url text;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0025_fabric_supplier_url.sql
git commit -m "feat(db): 0025 adds url column to fabric_suppliers"
```

---

### Task 2: Data layer — `url` + `normalizeSupplierUrl`

**Files:**
- Modify: `src/lib/data/fabric-settings.ts` (interface `:12-19`, `createFabricSupplier` `:109-123`, `updateFabricSupplier` `:125-153`)
- Test: `src/lib/data/fabric-settings.test.ts`

**Interfaces:**
- Produces: `normalizeSupplierUrl(raw: string | null | undefined): string | null`; `FabricSupplier.url: string | null`; `createFabricSupplier(orgId, { name, pricePerYard, isDefault, url? })`; `updateFabricSupplier(orgId, id, { name?, pricePerYard?, isDefault?, url? })`.

- [ ] **Step 1: Add the normalizer import and update the create test**

In `src/lib/data/fabric-settings.test.ts`, add `normalizeSupplierUrl` to the import from `@/lib/data/fabric-settings`, then replace the existing `createFabricSupplier inserts name + price...` test body (lines 137-141) so the insert payload includes `url: null`:

```ts
test("createFabricSupplier inserts name + price, defaulting price to null", async () => {
  setResult({ id: "s2", org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false, url: null });
  await createFabricSupplier("org_1", { name: "  JOANN  ", pricePerYard: null, isDefault: false });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false, url: null });
});
```

- [ ] **Step 2: Add failing tests for the normalizer and url persistence**

Append to `src/lib/data/fabric-settings.test.ts`:

```ts
test("normalizeSupplierUrl prepends https://, leaves schemes, nulls empties", () => {
  expect(normalizeSupplierUrl("joann.com")).toBe("https://joann.com");
  expect(normalizeSupplierUrl("  mood.com  ")).toBe("https://mood.com");
  expect(normalizeSupplierUrl("https://x.com")).toBe("https://x.com");
  expect(normalizeSupplierUrl("http://x.com")).toBe("http://x.com");
  expect(normalizeSupplierUrl("HTTPS://X.com")).toBe("HTTPS://X.com");
  expect(normalizeSupplierUrl("   ")).toBeNull();
  expect(normalizeSupplierUrl(null)).toBeNull();
  expect(normalizeSupplierUrl(undefined)).toBeNull();
});

test("createFabricSupplier normalizes and inserts a scheme-less url", async () => {
  setResult({ id: "s4", org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false, url: "https://joann.com" });
  await createFabricSupplier("org_1", { name: "JOANN", pricePerYard: null, isDefault: false, url: "joann.com" });
  expect(chain.insert).toHaveBeenCalledWith({ org_id: "org_1", name: "JOANN", price_per_yard: null, is_default: false, url: "https://joann.com" });
});

test("updateFabricSupplier patches a normalized url", async () => {
  setResult({ id: "s1", name: "Mood", price_per_yard: 4, is_default: false, url: "https://moodfabrics.com" });
  await updateFabricSupplier("org_1", "s1", { url: "moodfabrics.com" });
  expect(chain.update).toHaveBeenCalledWith({ url: "https://moodfabrics.com" });
});

test("updateFabricSupplier clears the url when given an empty string", async () => {
  setResult({ id: "s1", name: "Mood", price_per_yard: 4, is_default: false, url: null });
  await updateFabricSupplier("org_1", "s1", { url: "  " });
  expect(chain.update).toHaveBeenCalledWith({ url: null });
});
```

- [ ] **Step 3: Run the tests, verify the new ones fail**

Run: `npx vitest run src/lib/data/fabric-settings.test.ts`
Expected: the normalizer test fails (`normalizeSupplierUrl` is not exported), and the url create/update tests fail (no `url` in the payloads).

- [ ] **Step 4: Implement the normalizer and interface**

In `src/lib/data/fabric-settings.ts`, add the exported helper just below the imports (after line 2):

```ts
// Normalize a supplier website: trim, null when empty, and prepend https:// when no
// scheme is present (so an admin can type "joann.com").
export function normalizeSupplierUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
```

Replace the `FabricSupplier` interface (lines 12-19):

```ts
export interface FabricSupplier {
  id: string;
  org_id: string;
  name: string;
  price_per_yard: number | null;
  is_default: boolean;
  url: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Persist `url` on create**

Replace `createFabricSupplier` (lines 109-123):

```ts
export async function createFabricSupplier(
  orgId: string,
  input: { name: string; pricePerYard: number | null; isDefault: boolean; url?: string | null },
): Promise<FabricSupplier> {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Supplier name is required");
  if (input.isDefault) await clearDefault("fabric_suppliers", orgId);
  const { data, error } = await supabaseAdmin
    .from("fabric_suppliers")
    .insert({
      org_id: orgId,
      name,
      price_per_yard: input.pricePerYard,
      is_default: input.isDefault,
      url: normalizeSupplierUrl(input.url),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FabricSupplier;
}
```

- [ ] **Step 6: Persist `url` on update**

Replace `updateFabricSupplier`'s signature + `update` object assembly (lines 125-142) so it accepts and normalizes `url`:

```ts
export async function updateFabricSupplier(
  orgId: string,
  id: string,
  patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean; url?: string | null },
): Promise<FabricSupplier> {
  const update: { name?: string; price_per_yard?: number | null; is_default?: boolean; url?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new ValidationError("Supplier name is required");
    update.name = trimmed;
  }
  if (patch.pricePerYard !== undefined) update.price_per_yard = patch.pricePerYard;
  if (patch.url !== undefined) update.url = normalizeSupplierUrl(patch.url);
  if (patch.isDefault === true) {
    await clearDefault("fabric_suppliers", orgId);
    update.is_default = true;
  } else if (patch.isDefault === false) {
    update.is_default = false;
  }
```

(Leave the rest of the function — the `supabaseAdmin...update(update)...` block — unchanged.)

- [ ] **Step 7: Run tests, verify pass**

Run: `npx vitest run src/lib/data/fabric-settings.test.ts`
Expected: PASS (all supplier + width tests, including the unchanged price/default tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/data/fabric-settings.ts src/lib/data/fabric-settings.test.ts
git commit -m "feat(data): fabric suppliers carry a normalized url"
```

---

### Task 3: API routes — pass `url` through

**Files:**
- Modify: `src/app/api/org/fabric-settings/suppliers/route.ts` (POST, `:14-28`)
- Modify: `src/app/api/org/fabric-settings/suppliers/[id]/route.ts` (PATCH, `:14-28`)
- Test: `src/app/api/org/fabric-settings/route.test.ts`

**Interfaces:**
- Consumes: `createFabricSupplier` / `updateFabricSupplier` url params from Task 2.
- Produces: POST reads `url` from the body; PATCH reads optional `url`.

- [ ] **Step 1: Add failing url-passthrough tests**

Append to `src/app/api/org/fabric-settings/route.test.ts`:

```ts
test("POST suppliers passes a url through to createFabricSupplier", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  createFabricSupplier.mockResolvedValue({ id: "s9" });
  await POSTSupplier(jsonReq({ name: "JOANN", url: "joann.com" }));
  expect(createFabricSupplier).toHaveBeenCalledWith("org_1", { name: "JOANN", pricePerYard: null, isDefault: false, url: "joann.com" });
});

test("PATCH suppliers/[id] passes a url through to updateFabricSupplier", async () => {
  requireOrgAdmin.mockResolvedValue({ userId: "u1", orgId: "org_1" });
  updateFabricSupplier.mockResolvedValue({ id: "s1" });
  await PATCHSupplier(patchReq({ url: "moodfabrics.com" }), idCtx("s1"));
  expect(updateFabricSupplier).toHaveBeenCalledWith("org_1", "s1", { url: "moodfabrics.com" });
});
```

- [ ] **Step 2: Run, verify the two new tests fail**

Run: `npx vitest run src/app/api/org/fabric-settings/route.test.ts`
Expected: both new tests FAIL — POST omits `url` (its absence from the call's `url` key fails the explicit `url: "joann.com"` expectation), and PATCH doesn't add `url` to the patch.

- [ ] **Step 3: POST passes `url`**

In `src/app/api/org/fabric-settings/suppliers/route.ts`, add `url` to the body type and the create input (replace lines 17-23):

```ts
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean; url?: string; orgName?: string };
    await ensureOrganization(orgId, body.orgName ?? "My School");
    const supplier = await createFabricSupplier(orgId, {
      name: typeof body.name === "string" ? body.name : "",
      pricePerYard: parsePrice(body.pricePerYard),
      isDefault: body.isDefault === true,
      url: typeof body.url === "string" ? body.url : undefined,
    });
```

- [ ] **Step 4: PATCH passes `url`**

In `src/app/api/org/fabric-settings/suppliers/[id]/route.ts`, add `url` to the body type and patch (replace lines 18-22):

```ts
    const body = (await request.json()) as { name?: string; pricePerYard?: unknown; isDefault?: boolean; url?: string };
    const patch: { name?: string; pricePerYard?: number | null; isDefault?: boolean; url?: string } = {};
    if (typeof body.name === "string") patch.name = body.name;
    if (body.pricePerYard !== undefined) patch.pricePerYard = parsePrice(body.pricePerYard);
    if (typeof body.isDefault === "boolean") patch.isDefault = body.isDefault;
    if (typeof body.url === "string") patch.url = body.url;
```

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/app/api/org/fabric-settings/route.test.ts`
Expected: PASS (the new tests plus the unchanged POST/PATCH/DELETE tests — the existing POST tests pass `url: undefined`, which `toHaveBeenCalledWith` ignores).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/org/fabric-settings/suppliers/route.ts" "src/app/api/org/fabric-settings/suppliers/[id]/route.ts" "src/app/api/org/fabric-settings/route.test.ts"
git commit -m "feat(api): fabric supplier routes accept a url"
```

---

### Task 4: Purchase list — carry `supplierUrl`

**Files:**
- Modify: `src/lib/tailor-summary.ts` (`FabricLine` `:61-69`, `buildFabricPurchaseList` `:286-325`)
- Test: `src/lib/tailor-summary.test.ts`

**Interfaces:**
- Produces: `FabricLine.supplierUrl: string | null`; `buildFabricPurchaseList(items, supplierPrices?, supplierUrls?: Record<string, string>)` sets `supplierUrl` from a normalized (`name.trim().toLowerCase()`) → url map.
- Consumes: nothing new.

- [ ] **Step 1: Add failing tests**

Append to `src/lib/tailor-summary.test.ts`:

```ts
test("buildFabricPurchaseList sets supplierUrl from the name→url map (case-insensitive)", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10 },
  };
  const pl = buildFabricPurchaseList([item], {}, { mood: "https://moodfabrics.com" });
  expect(pl.groups[0].lines[0].supplierUrl).toBe("https://moodfabrics.com");
});

test("buildFabricPurchaseList sets supplierUrl null when the supplier has no url", async () => {
  const { buildFabricPurchaseList } = await import("@/lib/tailor-summary");
  const item = {
    designId: "d1", castingId: "c1", performerId: "pf1", performerName: "Ana", castName: "A",
    assignment: "primary" as const, made: false, makerId: null, addedInventoryItemId: null,
    fabric: { type: "Wool", color: "Black", width: '60"', supplier: "Mood", yardage: 2, unitCost: 10 },
  };
  expect(buildFabricPurchaseList([item], {}, {}).groups[0].lines[0].supplierUrl).toBeNull();
  expect(buildFabricPurchaseList([item]).groups[0].lines[0].supplierUrl).toBeNull(); // no map arg
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: FAIL — `supplierUrl` is `undefined` (not on `FabricLine`), and TS rejects the property access.

- [ ] **Step 3: Add `supplierUrl` to `FabricLine`**

Replace `FabricLine` (lines 61-69):

```ts
export interface FabricLine {
  type: string;
  color: string | null;
  width: string | null;
  supplier: string | null;
  supplierUrl: string | null;
  totalYardage: number;
  estCost: number;
  pieceCount: number;
}
```

- [ ] **Step 4: Accept the url map and set it on new lines**

In `buildFabricPurchaseList`, change the signature (line 286-289) to add the third parameter:

```ts
export function buildFabricPurchaseList(
  items: MakeItem[],
  supplierPrices: Record<string, number> = {},
  supplierUrls: Record<string, string> = {},
): PurchaseList {
```

Then in the `lines.set(key, { ... })` object (lines 316-324), add the `supplierUrl` field:

```ts
      lines.set(key, {
        type,
        color: color || null,
        width: width || null,
        supplier: supplier || null,
        supplierUrl: supplier ? supplierUrls[supplier.toLowerCase()] ?? null : null,
        totalYardage: yardage,
        estCost: cost,
        pieceCount: 1,
      });
```

(`supplier` here is the trimmed `norm(item.fabric.supplier)`; the map is keyed lowercased.)

- [ ] **Step 5: Run, verify pass**

Run: `npx vitest run src/lib/tailor-summary.test.ts`
Expected: PASS (the new tests plus all existing purchase-list tests, which call with one or two args and default `supplierUrls` to `{}`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/tailor-summary.ts src/lib/tailor-summary.test.ts
git commit -m "feat(summary): purchase lines carry a supplier url"
```

---

### Task 5: Thread the url to the Shopping list and render the link

**Files:**
- Modify: `src/lib/data/costume-creations.ts:71` (map `url`)
- Modify: `src/components/TailorSummary.tsx` (`fabricSuppliers` prop `:53`, `purchase` memo `:91-96`)
- Modify: `src/components/FabricPurchaseList.tsx:46` (render link)

**Interfaces:**
- Consumes: `FabricLine.supplierUrl` (Task 4); `buildFabricPurchaseList(items, supplierPrices, supplierUrls)` (Task 4); `FabricSupplier.url` (Task 2).
- Produces: the rendered Shopping table with linked supplier names on both Costume Creations and My Work.

- [ ] **Step 1: Map `url` in the shared loader**

In `src/lib/data/costume-creations.ts`, replace the `fabricSuppliers` map (line 71):

```ts
    fabricSuppliers: fabricSuppliers.map((s) => ({ id: s.id, name: s.name, pricePerYard: s.price_per_yard, isDefault: s.is_default, url: s.url })),
```

- [ ] **Step 2: Accept `url` on the TailorSummary prop and build the url map**

In `src/components/TailorSummary.tsx`, update the `fabricSuppliers` prop type (line 53):

```ts
  fabricSuppliers: { id: string; name: string; pricePerYard: number | null; isDefault: boolean; url: string | null }[];
```

Replace the `purchase` memo (lines 91-96):

```ts
  const purchase = useMemo(() => {
    const items = worklist.roles.flatMap((r) => r.garments.flatMap((g) => g.items));
    const supplierPrices: Record<string, number> = {};
    const supplierUrls: Record<string, string> = {};
    for (const s of fabricSuppliers) {
      if (s.pricePerYard != null) supplierPrices[s.name] = s.pricePerYard;
      if (s.url) supplierUrls[s.name.trim().toLowerCase()] = s.url;
    }
    return buildFabricPurchaseList(items, supplierPrices, supplierUrls);
  }, [worklist, fabricSuppliers]);
```

- [ ] **Step 3: Render the supplier name as a link**

In `src/components/FabricPurchaseList.tsx`, replace the supplier cell (line 46):

```tsx
                    <td className="py-1.5">
                      {l.supplierUrl && l.supplier ? (
                        <a href={l.supplierUrl} target="_blank" rel="noopener noreferrer" className="link-red">
                          {l.supplier}
                        </a>
                      ) : (
                        l.supplier ?? "—"
                      )}
                    </td>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/costume-creations.ts src/components/TailorSummary.tsx src/components/FabricPurchaseList.tsx
git commit -m "feat(shopping): link supplier names to their url on Costume Creations + My Work"
```

---

### Task 6: Org Fabric panel — add + edit supplier URLs

**Files:**
- Modify: `src/components/OrgFabricPanel.tsx` (`Supplier` type `:6`, add-supplier state/handler `:24-94`, supplier row `:130-141`, add form `:143-147`)

**Interfaces:**
- Consumes: the supplier `url` field returned by `GET /api/org/fabric-settings`; the POST/PATCH url handling (Task 3).
- Produces: a URL input in the add-supplier form and an inline-editable URL on each existing supplier row.

- [ ] **Step 1: Add `url` to the local Supplier type and add-form state**

In `src/components/OrgFabricPanel.tsx`, update the `Supplier` type (line 6):

```ts
type Supplier = { id: string; name: string; price_per_yard: number | null; is_default: boolean; url: string | null };
```

Add a `newUrl` state beside `newPrice` (after line 25):

```ts
  const [newUrl, setNewUrl] = useState("");
```

- [ ] **Step 2: Include `url` when adding a supplier**

Replace the `addSupplier` POST + reset (lines 90-93):

```ts
    if (await send("/api/org/fabric-settings/suppliers", "POST", { name: newSupplier, pricePerYard: price, url: newUrl })) {
      setNewSupplier("");
      setNewPrice("");
      setNewUrl("");
    }
```

- [ ] **Step 3: Add an inline URL input to each supplier row**

In the supplier `<li>` (lines 131-140), insert a URL input between the price `<span>` and the "set default" button. The `key` includes `s.url` so the input remounts to the normalized value after a save; the `onBlur` only saves when the value actually changed:

```tsx
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="flex-1">{s.name}</span>
              <span className="muted">{s.price_per_yard != null ? `$${s.price_per_yard}/yd` : "—"}</span>
              <input
                key={`url-${s.id}-${s.url ?? ""}`}
                className="field !p-1.5 text-xs w-40"
                defaultValue={s.url ?? ""}
                placeholder="Website"
                aria-label={`Website for ${s.name}`}
                disabled={busy}
                onBlur={(e) => {
                  if (e.target.value.trim() === (s.url ?? "").trim()) return;
                  void send(`/api/org/fabric-settings/suppliers/${s.id}`, "PATCH", { url: e.target.value });
                }}
              />
              <button type="button" className="link-muted text-xs" disabled={busy || s.is_default} aria-label={`Set ${s.name} as the default supplier`} onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "PATCH", { isDefault: true })}>
                {s.is_default ? "★ default" : "set default"}
              </button>
              <button type="button" className="link-muted text-xs" disabled={busy} aria-label={`Remove supplier ${s.name}`} onClick={() => void send(`/api/org/fabric-settings/suppliers/${s.id}`, "DELETE")}>
                remove
              </button>
            </li>
```

- [ ] **Step 4: Add a URL input to the add-supplier form**

In the add-supplier form row (lines 143-147), add a URL input before the button:

```tsx
        <div className="mt-2 flex flex-wrap gap-2">
          <input className="field !p-1.5 text-sm" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} placeholder="Supplier name" aria-label="New supplier name" />
          <input className="field !p-1.5 text-sm w-28" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} inputMode="decimal" placeholder="$/yd" aria-label="New supplier price per yard" />
          <input className="field !p-1.5 text-sm w-40" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="Website (optional)" aria-label="New supplier website" />
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void addSupplier()}>Add supplier</button>
        </div>
```

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (no new unit tests; nothing regressed).

- [ ] **Step 7: Commit**

```bash
git add src/components/OrgFabricPanel.tsx
git commit -m "feat(fabric-settings): add + inline-edit supplier website URLs"
```

---

## Final verification

- [ ] `npm test` — all suites pass.
- [ ] `npx tsc --noEmit && npm run build` — clean.
- [ ] Confirm migration `0025` was **not** applied to Supabase and nothing was pushed/deployed. Report to Chris that the work is on local `main` awaiting his green light to apply `0025` + push.

## Notes / out of scope

- No URL validation beyond the `https://` prepend (admin-only field).
- Piece supplier stays free text; no FK, no data migration.
- A supplier name on a piece that doesn't match any supplier in the list (or whose supplier has no url) simply renders as plain text — the existing behavior.
