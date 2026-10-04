import { expect, test, vi, beforeEach, afterEach } from "vitest";

const limit = vi.fn();
const select = vi.fn(() => ({ limit }));
const from = vi.fn<(table: string) => { select: typeof select }>(() => ({ select }));
vi.mock("@/lib/supabase-admin", () => ({ supabaseAdmin: { from: (table: string) => from(table) } }));

import { GET } from "@/app/api/cron/keepalive/route";

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  [limit, select, from].forEach((m) => m.mockClear());
  limit.mockResolvedValue({ data: [{ id: "p1" }], error: null });
  process.env.CRON_SECRET = "s3cret";
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

function req(auth?: string) {
  return new Request("http://test/api/cron/keepalive", {
    headers: auth ? { authorization: auth } : {},
  });
}

test("GET 200 runs one tiny query when the cron secret matches", async () => {
  const res = await GET(req("Bearer s3cret"));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true });
  expect(from).toHaveBeenCalledWith("productions");
  expect(select).toHaveBeenCalledWith("id");
  expect(limit).toHaveBeenCalledWith(1);
});

test("GET 401 without a matching secret and never touches the database", async () => {
  expect((await GET(req("Bearer wrong"))).status).toBe(401);
  expect((await GET(req())).status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});

test("GET 401 when CRON_SECRET is unset (fails closed)", async () => {
  delete process.env.CRON_SECRET;
  const res = await GET(req("Bearer "));
  expect(res.status).toBe(401);
  expect(from).not.toHaveBeenCalled();
});

test("GET 500 when the query errors, so the cron run shows as failed", async () => {
  limit.mockResolvedValue({ data: null, error: { message: "boom" } });
  const res = await GET(req("Bearer s3cret"));
  expect(res.status).toBe(500);
  expect(await res.json()).toMatchObject({ ok: false });
});
