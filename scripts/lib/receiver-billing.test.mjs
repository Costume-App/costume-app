import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { planReceiverBillingReset, applyReceiverBillingPlan, resetReceiverBilling } from "./receiver-billing.mjs";
import { RECEIVER_ORG_NAME } from "./demo-org.mjs";

const sender = { clerkOrgId: "org_sender" };
const receiver = { clerkOrgId: "org_receiver" };
const demo = {
  clerkUserId: "user_sender",
  clerkOrgId: "org_sender",
  email: "sender@example.com",
  name: "Demo Theatre Co.",
  receiver: {
    clerkUserId: "user_receiver",
    clerkOrgId: "org_receiver",
    email: "receiver@example.com",
    name: RECEIVER_ORG_NAME,
  },
};

// Minimal stand-in for the supabase-js query builder, modeled on
// org-deletion.test.mjs's makeFake: every chain method returns the same
// node and records what it was given; awaiting the node shifts the next
// queued response for that table.
function makeFake(responses = {}) {
  const queues = Object.fromEntries(
    Object.entries(responses).map(([t, v]) => [t, Array.isArray(v) ? [...v] : [v]]),
  );
  const calls = [];
  const client = {
    from(table) {
      const rec = { table, op: "select", filters: [], payload: null };
      calls.push(rec);
      const node = {
        select(cols) { rec.cols = cols; return node; },
        insert(p) { rec.op = "insert"; rec.payload = p; return node; },
        delete() { rec.op = "delete"; return node; },
        eq(c, v) { rec.filters.push(`eq:${c}=${v}`); return node; },
        maybeSingle() { rec.single = true; return node; },
        then(res, rej) {
          const q = queues[table] ?? [];
          const next = q.shift() ?? { data: null, error: null };
          return Promise.resolve(next).then(res, rej);
        },
      };
      return node;
    },
  };
  return { client, calls };
}

describe("planReceiverBillingReset", () => {
  it("returns the three default ops, in order", () => {
    const plan = planReceiverBillingReset({ sender, receiver, clerkOrgName: RECEIVER_ORG_NAME });
    expect(plan).toEqual([
      { op: "delete", table: "production_purchases", orgId: "org_receiver" },
      { op: "delete", table: "seat_purchases", orgId: "org_receiver" },
      { op: "assertNotSubscribed", table: "org_subscriptions", orgId: "org_receiver" },
    ]);
  });

  it("is frozen", () => {
    const plan = planReceiverBillingReset({ sender, receiver, clerkOrgName: RECEIVER_ORG_NAME });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan[0])).toBe(true);
  });

  it("appends an unbound unlock insert when grantUnlock is true, with no row of its own", () => {
    const plan = planReceiverBillingReset({ sender, receiver, clerkOrgName: RECEIVER_ORG_NAME, grantUnlock: true });
    expect(plan.length).toBe(4);
    expect(plan[3]).toEqual({
      op: "insert",
      table: "production_purchases",
      orgId: "org_receiver",
    });
    expect(Object.hasOwn(plan[3], "row")).toBe(false);
  });

  it("throws when the receiver id equals the sender's", () => {
    expect(() => planReceiverBillingReset({ sender, receiver: sender, clerkOrgName: RECEIVER_ORG_NAME }))
      .toThrow(/differ from the sender/);
  });

  it("throws when the receiver id does not start with org_", () => {
    expect(() => planReceiverBillingReset({ sender, receiver: { clerkOrgId: "user_receiver" }, clerkOrgName: RECEIVER_ORG_NAME }))
      .toThrow(/must match/);
  });

  it("throws when the receiver id starts with org_ but contains a character outside the shape", () => {
    expect(() => planReceiverBillingReset({ sender, receiver: { clerkOrgId: "org_abc def" }, clerkOrgName: RECEIVER_ORG_NAME }))
      .toThrow(/must match/);
    expect(() => planReceiverBillingReset({ sender, receiver: { clerkOrgId: "org_abc/123" }, clerkOrgName: RECEIVER_ORG_NAME }))
      .toThrow(/must match/);
  });

  it("throws on a missing receiver", () => {
    expect(() => planReceiverBillingReset({ sender, receiver: undefined, clerkOrgName: RECEIVER_ORG_NAME }))
      .toThrow(/receiver is missing/);
  });

  it("throws on a Clerk name other than Demo Playhouse", () => {
    expect(() => planReceiverBillingReset({ sender, receiver, clerkOrgName: "Some Other Org" }))
      .toThrow(/Demo Playhouse/);
  });
});

describe("applyReceiverBillingPlan", () => {
  it("refuses an op whose orgId differs from the receiver's, sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [{ op: "delete", table: "production_purchases", orgId: "org_someone_else" }];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/not the receiver/);
    expect(calls.length).toBe(0);
  });

  it("refuses a delete on org_subscriptions (outside the allowlist), sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [{ op: "delete", table: "org_subscriptions", orgId: "org_receiver" }];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/not on the allowlist/);
    expect(calls.length).toBe(0);
  });

  it("refuses an insert into seat_purchases (outside the allowlist), sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [{ op: "insert", table: "seat_purchases", orgId: "org_receiver", row: {} }];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/not on the allowlist/);
    expect(calls.length).toBe(0);
  });

  it("refuses the whole plan when only a later op is bad, sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [
      { op: "delete", table: "production_purchases", orgId: "org_receiver" },
      { op: "delete", table: "org_subscriptions", orgId: "org_receiver" },
    ];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/not on the allowlist/);
    expect(calls.length).toBe(0);
  });

  it("refuses an insert op that carries its own row, sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [
      { op: "assertNotSubscribed", table: "org_subscriptions", orgId: "org_receiver" },
      { op: "insert", table: "production_purchases", orgId: "org_receiver", row: { org_id: "org_someone_else" } },
    ];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/must not carry its own row/);
    expect(calls.length).toBe(0);
  });

  it("refuses an insert op with no preceding assertNotSubscribed for that org, sending zero calls", async () => {
    const { client, calls } = makeFake();
    const badPlan = [{ op: "insert", table: "production_purchases", orgId: "org_receiver" }];
    await expect(applyReceiverBillingPlan(client, badPlan, "org_receiver")).rejects.toThrow(/no preceding assertNotSubscribed/);
    expect(calls.length).toBe(0);
  });

  it("is immune to the caller mutating the plan array after execution has started", async () => {
    const plan = [
      { op: "delete", table: "production_purchases", orgId: "org_receiver" },
      { op: "assertNotSubscribed", table: "org_subscriptions", orgId: "org_receiver" },
    ];
    const { client, calls } = makeFake({
      production_purchases: { data: [], error: null },
      org_subscriptions: { data: null, error: null },
    });
    // Hook the fake client's first `from` call (the delete's) to mutate the
    // ORIGINAL plan array right as applyReceiverBillingPlan awaits that
    // call's result, standing in for a caller who still holds `plan` and
    // changes it mid-run. If applyReceiverBillingPlan executed from the live
    // `plan` reference instead of its own snapshot, op[1] below would run as
    // a disallowed delete on org_subscriptions instead of the validated
    // assertNotSubscribed select.
    const originalFrom = client.from.bind(client);
    let mutated = false;
    client.from = (table) => {
      if (!mutated) {
        mutated = true;
        plan[1] = { op: "delete", table: "org_subscriptions", orgId: "org_receiver" };
      }
      return originalFrom(table);
    };

    await applyReceiverBillingPlan(client, plan, "org_receiver");

    expect(calls.map((c) => ({ table: c.table, op: c.op }))).toEqual([
      { table: "production_purchases", op: "delete" },
      { table: "org_subscriptions", op: "select" },
    ]);
  });

  it("runs every recorded delete scoped to org_id = the receiver's", async () => {
    const { client, calls } = makeFake({
      production_purchases: { data: [], error: null },
      seat_purchases: { data: [], error: null },
      org_subscriptions: { data: null, error: null },
    });
    const plan = planReceiverBillingReset({ sender, receiver, clerkOrgName: RECEIVER_ORG_NAME });
    await applyReceiverBillingPlan(client, plan, "org_receiver");

    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.map((c) => c.table)).toEqual(["production_purchases", "seat_purchases"]);
    for (const c of deletes) {
      expect(c.filters).toEqual(["eq:org_id=org_receiver"]);
    }
  });

  it("sends the insert with the exact row when grantUnlock ops are present", async () => {
    const { client, calls } = makeFake({
      production_purchases: [{ data: [], error: null }, { data: null, error: null }],
      seat_purchases: { data: [], error: null },
      org_subscriptions: { data: null, error: null },
    });
    const plan = planReceiverBillingReset({ sender, receiver, clerkOrgName: RECEIVER_ORG_NAME, grantUnlock: true });
    await applyReceiverBillingPlan(client, plan, "org_receiver");

    const insert = calls.find((c) => c.op === "insert");
    expect(insert.table).toBe("production_purchases");
    expect(insert.payload).toEqual({ org_id: "org_receiver", source: "training_demo" });
  });

  describe("assertNotSubscribed", () => {
    async function run(row) {
      const { client } = makeFake({ org_subscriptions: { data: row, error: null } });
      const plan = [{ op: "assertNotSubscribed", table: "org_subscriptions", orgId: "org_receiver" }];
      return applyReceiverBillingPlan(client, plan, "org_receiver");
    }

    it("throws when comped is true", async () => {
      await expect(run({ comped: true, status: "inactive" })).rejects.toThrow(/already subscribed/);
    });

    it("throws when status is active", async () => {
      await expect(run({ comped: false, status: "active" })).rejects.toThrow(/already subscribed/);
    });

    it("throws when status is trialing", async () => {
      await expect(run({ comped: false, status: "trialing" })).rejects.toThrow(/already subscribed/);
    });

    it("passes when there is no row", async () => {
      await expect(run(null)).resolves.toBeUndefined();
    });

    it("passes when comped is false and status is inactive", async () => {
      await expect(run({ comped: false, status: "inactive" })).resolves.toBeUndefined();
    });
  });
});

describe("resetReceiverBilling", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function jsonResponse(body) {
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }

  it("never fetches Clerk or builds a client when the dev-key check fails", async () => {
    process.env.CLERK_SECRET_KEY = "sk_live_not_a_dev_key";
    const fetchImpl = vi.fn();
    const createClientImpl = vi.fn();
    await expect(resetReceiverBilling({ demo, fetchImpl, createClientImpl })).rejects.toThrow(/sk_test_/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(createClientImpl).not.toHaveBeenCalled();
  });

  it("never builds a client when Clerk reports the wrong org id for the receiver", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "org_someone_else", name: RECEIVER_ORG_NAME }));
    const createClientImpl = vi.fn();
    await expect(resetReceiverBilling({ demo, fetchImpl, createClientImpl }))
      .rejects.toThrow(/Clerk returned org id "org_someone_else"/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(createClientImpl).not.toHaveBeenCalled();
  });

  it("never builds a client when Clerk reports the wrong org name for the receiver", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    const fetchImpl = vi.fn(async () => jsonResponse({ id: demo.receiver.clerkOrgId, name: "Some Other Org" }));
    const createClientImpl = vi.fn();
    await expect(resetReceiverBilling({ demo, fetchImpl, createClientImpl })).rejects.toThrow(/Demo Playhouse/);
    expect(createClientImpl).not.toHaveBeenCalled();
  });

  it("builds the client and applies the plan once the dev key and Clerk response both check out", async () => {
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const fetchImpl = vi.fn(async () => jsonResponse({ id: demo.receiver.clerkOrgId, name: RECEIVER_ORG_NAME }));
    const { client, calls } = makeFake({
      production_purchases: { data: [], error: null },
      seat_purchases: { data: [], error: null },
      org_subscriptions: { data: null, error: null },
    });
    const createClientImpl = vi.fn(() => client);

    const plan = await resetReceiverBilling({ demo, fetchImpl, createClientImpl });

    expect(createClientImpl).toHaveBeenCalledTimes(1);
    expect(createClientImpl).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      { auth: { persistSession: false } },
    );
    expect(calls.map((c) => c.table)).toEqual(["production_purchases", "seat_purchases", "org_subscriptions"]);
    expect(plan.length).toBe(3);
  });
});
