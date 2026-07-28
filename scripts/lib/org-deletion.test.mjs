import { expect, test, describe, vi } from "vitest";
import {
  collectOrgStoragePaths,
  summarizeOrg,
  cancelOrgSubscription,
  anonymizeOrgFeedback,
  deleteOrgRows,
  writeDeletionLog,
  ORG_TABLES,
} from "./org-deletion.mjs";

// Minimal stand-in for the supabase-js query builder. Every chain method returns
// the same node and records what it was given; awaiting the node shifts the next
// queued response for that table. `calls` is the assertion surface.
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
        select(cols, opts) { rec.cols = cols; rec.opts = opts; return node; },
        insert(p) { rec.op = "insert"; rec.payload = p; return node; },
        update(p) { rec.op = "update"; rec.payload = p; return node; },
        delete() { rec.op = "delete"; return node; },
        eq(c, v) { rec.filters.push(`eq:${c}=${v}`); return node; },
        in(c, v) { rec.filters.push(`in:${c}=[${v.join(",")}]`); return node; },
        or(expr) { rec.filters.push(`or:${expr}`); return node; },
        maybeSingle() { rec.single = true; return node; },
        then(res, rej) {
          const q = queues[table] ?? [];
          const next = q.shift() ?? { data: [], error: null, count: 0 };
          return Promise.resolve(next).then(res, rej);
        },
      };
      return node;
    },
  };
  return { client, calls };
}

const tablesOf = (calls) => calls.map((c) => c.table);

describe("collectOrgStoragePaths", () => {
  test("gathers role, design, and inventory image paths", async () => {
    const { client, calls } = makeFake({
      productions: { data: [{ id: "p1" }], error: null },
      roles: { data: [{ id: "r1" }], error: null },
      costume_designs: { data: [{ id: "d1" }], error: null },
      role_images: { data: [{ storage_path: "p1/r1/a.jpg" }], error: null },
      costume_design_images: { data: [{ storage_path: "p1/designs/d1/b.jpg" }], error: null },
      inventory_items: { data: [{ id: "i1" }], error: null },
      inventory_item_images: { data: [{ storage_path: "inventory/i1/c.jpg" }], error: null },
    });

    const paths = await collectOrgStoragePaths(client, "org_1");

    expect(paths.sort()).toEqual([
      "inventory/i1/c.jpg",
      "p1/designs/d1/b.jpg",
      "p1/r1/a.jpg",
    ]);
    // Inventory paths contain no production id, so this branch is the easy one to miss.
    expect(tablesOf(calls)).toContain("inventory_item_images");
  });

  test("returns an empty list and skips image queries when the org has nothing", async () => {
    const { client, calls } = makeFake({
      productions: { data: [], error: null },
      inventory_items: { data: [], error: null },
    });
    const paths = await collectOrgStoragePaths(client, "org_1");
    expect(paths).toEqual([]);
    expect(tablesOf(calls)).not.toContain("role_images");
    expect(tablesOf(calls)).not.toContain("inventory_item_images");
  });

  test("deduplicates repeated paths", async () => {
    const { client } = makeFake({
      productions: { data: [{ id: "p1" }], error: null },
      roles: { data: [{ id: "r1" }], error: null },
      costume_designs: { data: [{ id: "d1" }], error: null },
      role_images: { data: [{ storage_path: "dup.jpg" }], error: null },
      costume_design_images: { data: [{ storage_path: "dup.jpg" }], error: null },
      inventory_items: { data: [], error: null },
    });
    expect(await collectOrgStoragePaths(client, "org_1")).toEqual(["dup.jpg"]);
  });

  test("throws on a query error", async () => {
    const { client } = makeFake({ productions: { data: null, error: { message: "boom" } } });
    await expect(collectOrgStoragePaths(client, "org_1")).rejects.toThrow("boom");
  });
});

describe("cancelOrgSubscription", () => {
  test("cancels the subscription and never touches the customer", async () => {
    const cancel = vi.fn().mockResolvedValue({});
    const del = vi.fn();
    const stripe = { subscriptions: { cancel }, customers: { del } };
    const { client } = makeFake({
      org_subscriptions: { data: { stripe_subscription_id: "sub_1" }, error: null },
    });

    const result = await cancelOrgSubscription(stripe, client, "org_1");

    expect(cancel).toHaveBeenCalledWith("sub_1");
    expect(del).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: true, subscriptionId: "sub_1" });
  });

  test("no-ops when the org has no subscription row", async () => {
    const cancel = vi.fn();
    const stripe = { subscriptions: { cancel }, customers: { del: vi.fn() } };
    const { client } = makeFake({ org_subscriptions: { data: null, error: null } });

    const result = await cancelOrgSubscription(stripe, client, "org_1");

    expect(cancel).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: false, subscriptionId: null });
  });
});

describe("anonymizeOrgFeedback", () => {
  test("nulls the owner columns and leaves the message alone", async () => {
    const { client, calls } = makeFake({
      feedback: { data: [{ id: "f1" }, { id: "f2" }], error: null },
    });

    const count = await anonymizeOrgFeedback(client, "org_1");

    const call = calls.find((c) => c.table === "feedback");
    expect(call.op).toBe("update");
    expect(call.payload).toEqual({ user_email: null, user_id: null, org_id: null });
    expect(call.payload).not.toHaveProperty("message");
    expect(call.filters).toContain("eq:org_id=org_1");
    expect(count).toBe(2);
  });
});

describe("deleteOrgRows", () => {
  test("deletes the three unconstrained tables and the org row", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");

    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.map((c) => c.table)).toEqual([
      "fabric_widths",
      "fabric_suppliers",
      "production_shares",
      "organizations",
    ]);
  });

  test("matches production_shares on either org column", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");
    const shares = calls.find((c) => c.table === "production_shares");
    expect(shares.filters.join(" ")).toContain("source_org_id");
    expect(shares.filters.join(" ")).toContain("accepted_by_org_id");
  });

  test("never deletes the feedback table", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");
    expect(calls.filter((c) => c.op === "delete").map((c) => c.table)).not.toContain("feedback");
  });
});

describe("summarizeOrg", () => {
  test("reports the org name, a count per table, and the file count", async () => {
    const responses = { organizations: [{ data: { name: "Nada's Theater" }, error: null }] };
    for (const t of ORG_TABLES) responses[t] = { data: null, error: null, count: 3 };
    responses.productions = [{ data: null, error: null, count: 3 }, { data: [], error: null }];
    responses.inventory_items = [{ data: null, error: null, count: 3 }, { data: [], error: null }];

    const { client } = makeFake(responses);
    const summary = await summarizeOrg(client, "org_1");

    expect(summary.orgName).toBe("Nada's Theater");
    expect(Object.keys(summary.tables)).toEqual(ORG_TABLES);
    expect(summary.storageFiles).toBe(0);
  });
});

describe("writeDeletionLog", () => {
  test("inserts the log row with the supplied dates", async () => {
    const { client, calls } = makeFake({});
    await writeDeletionLog(client, {
      orgId: "org_1",
      orgName: "Nada's Theater",
      requestedAt: "2026-08-01T00:00:00.000Z",
      requestedBy: "ticket-42",
      notes: null,
    });
    const call = calls.find((c) => c.table === "deletion_log");
    expect(call.op).toBe("insert");
    expect(call.payload).toMatchObject({
      org_id: "org_1",
      org_name: "Nada's Theater",
      requested_at: "2026-08-01T00:00:00.000Z",
      requested_by: "ticket-42",
    });
  });
});
