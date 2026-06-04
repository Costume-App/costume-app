import { expect, test, vi, beforeEach } from "vitest";

const upsert = vi.fn();
const from = vi.fn((_table: string) => ({ upsert }));

vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { ensureOrganization } from "@/lib/data/organizations";

beforeEach(() => {
  [upsert, from].forEach((m) => m.mockReset());
  from.mockReturnValue({ upsert });
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
