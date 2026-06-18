import { expect, test, vi, beforeEach } from "vitest";

const result: { data: unknown; error: unknown } = { data: null, error: null };
const chain: Record<string, ReturnType<typeof vi.fn>> & { then?: unknown } = {};
for (const m of ["select", "upsert", "eq", "in"]) chain[m] = vi.fn(() => chain);
(chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
const from = vi.fn(() => chain);
function setResult(data: unknown, error: unknown = null) { result.data = data; result.error = error; }
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: () => from() } }));

import { recordOrgDomain, findOrgsByDomain } from "@/lib/data/org-domains";

beforeEach(() => {
  Object.values(chain).forEach((m) => typeof m === "function" && (m as ReturnType<typeof vi.fn>).mockClear?.());
  from.mockClear();
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => resolve(result);
  setResult(null, null);
});

test("recordOrgDomain skips a public domain (no upsert)", async () => {
  await recordOrgDomain("orgA", "teacher@gmail.com");
  expect(chain.upsert).not.toHaveBeenCalled();
});

test("recordOrgDomain skips a malformed email (no upsert)", async () => {
  await recordOrgDomain("orgA", "not-an-email");
  expect(chain.upsert).not.toHaveBeenCalled();
});

test("recordOrgDomain upserts a real org domain, ignoring duplicates", async () => {
  await recordOrgDomain("orgA", "teacher@lincolnhs.edu");
  expect(chain.upsert).toHaveBeenCalledWith(
    { org_id: "orgA", domain: "lincolnhs.edu" },
    { onConflict: "org_id,domain", ignoreDuplicates: true },
  );
});

test("findOrgsByDomain returns [] for a public domain without querying", async () => {
  expect(await findOrgsByDomain("gmail.com")).toEqual([]);
  expect(from).not.toHaveBeenCalled();
});

test("findOrgsByDomain joins matched org ids to names", async () => {
  let call = 0;
  (chain as { then: unknown }).then = (resolve: (r: typeof result) => unknown) => {
    call += 1;
    if (call === 1) return resolve({ data: [{ org_id: "orgA" }], error: null }); // org_domains rows
    return resolve({ data: [{ clerk_org_id: "orgA", name: "Lincoln HS" }], error: null }); // organizations
  };
  const matches = await findOrgsByDomain("lincolnhs.edu");
  expect(matches).toEqual([{ orgId: "orgA", name: "Lincoln HS" }]);
});
