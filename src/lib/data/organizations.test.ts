import { expect, test, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const maybeSingle = vi.fn();
const chain = { upsert, select, eq, maybeSingle };
const from = vi.fn((_table: string) => chain);

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

const getOrganization = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ organizations: { getOrganization } })),
}));

import { ensureOrganization, ensureOrgRow } from "@/lib/data/organizations";

beforeEach(() => {
  [upsert, select, eq, maybeSingle, from, getOrganization].forEach((m) => m.mockReset());
  from.mockReturnValue(chain);
  select.mockReturnValue(chain);
  eq.mockReturnValue(chain);
});

test("ensureOrganization upserts insert-only on clerk_org_id", async () => {
  upsert.mockResolvedValue({ error: null });
  await ensureOrganization("org_1", "Lincoln HS");
  expect(from).toHaveBeenCalledWith("organizations");
  expect(upsert).toHaveBeenCalledWith(
    { clerk_org_id: "org_1", name: "Lincoln HS" },
    { onConflict: "clerk_org_id", ignoreDuplicates: true },
  );
});

test("ensureOrganization throws on supabase error", async () => {
  upsert.mockResolvedValue({ error: { message: "nope" } });
  await expect(ensureOrganization("org_1", "Lincoln HS")).rejects.toThrow("nope");
});

test("ensureOrgRow does nothing when the row exists (no Clerk fetch, no upsert)", async () => {
  maybeSingle.mockResolvedValue({ data: { clerk_org_id: "org_1" }, error: null });
  await ensureOrgRow("org_1");
  expect(getOrganization).not.toHaveBeenCalled();
  expect(upsert).not.toHaveBeenCalled();
});

test("ensureOrgRow fetches the Clerk name and inserts when the row is missing", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: null });
  getOrganization.mockResolvedValue({ name: "Lincoln HS" });
  upsert.mockResolvedValue({ error: null });
  await ensureOrgRow("org_1");
  expect(getOrganization).toHaveBeenCalledWith({ organizationId: "org_1" });
  expect(upsert).toHaveBeenCalledWith(
    { clerk_org_id: "org_1", name: "Lincoln HS" },
    { onConflict: "clerk_org_id", ignoreDuplicates: true },
  );
});
