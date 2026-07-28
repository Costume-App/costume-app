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

  test("gathers inventory paths even when the org has no productions (asymmetric branch)", async () => {
    const { client, calls } = makeFake({
      productions: { data: [], error: null },
      inventory_items: { data: [{ id: "i1" }], error: null },
      inventory_item_images: { data: [{ storage_path: "inventory/i1/only.jpg" }], error: null },
    });

    const paths = await collectOrgStoragePaths(client, "org_1");

    expect(paths).toEqual(["inventory/i1/only.jpg"]);
    // Zero productions must not suppress the inventory branch, which is unguarded
    // by productionIds — but it also must not spuriously query the production-only tables.
    expect(tablesOf(calls)).not.toContain("roles");
    expect(tablesOf(calls)).not.toContain("costume_designs");
    expect(tablesOf(calls)).not.toContain("role_images");
    expect(tablesOf(calls)).not.toContain("costume_design_images");
    expect(tablesOf(calls)).toContain("inventory_item_images");
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

  test("throws when PostgREST reports more matching rows than were returned (truncation)", async () => {
    // count:5 but only 2 rows came back — a max_rows-style truncation. Silently
    // continuing here is exactly how files become unreachable forever once their
    // rows cascade away, so this must be a loud failure, not a partial result.
    const { client } = makeFake({
      productions: { data: [{ id: "p1" }, { id: "p2" }], error: null, count: 5 },
    });
    await expect(collectOrgStoragePaths(client, "org_1")).rejects.toThrow(/truncated/i);
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
  test("deletes tables in a fixed order, org row last", async () => {
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

  test("scopes every delete/update to this org and reports real counts", async () => {
    // An implementation that dropped the .eq() scoping, or dropped .select("id")
    // from the delete chains (reporting zeros to the operator), must fail this.
    const { client, calls } = makeFake({
      fabric_widths: { data: [{ id: "w1" }], error: null },
      fabric_suppliers: { data: [{ id: "s1" }, { id: "s2" }], error: null },
      production_shares: [
        { data: [{ id: "ps1" }], error: null }, // delete: source_org_id match
        { data: [{ id: "ps2" }, { id: "ps3" }], error: null }, // update: accepted_by_org_id match
      ],
      organizations: { data: [{ clerk_org_id: "org_1" }], error: null },
    });

    const counts = await deleteOrgRows(client, "org_1");

    expect(counts).toEqual({
      fabric_widths: 1,
      fabric_suppliers: 2,
      production_shares_deleted: 1,
      production_shares_released: 2,
      organizations: 1,
    });

    const widths = calls.find((c) => c.table === "fabric_widths");
    expect(widths.op).toBe("delete");
    expect(widths.filters).toContain("eq:org_id=org_1");

    const suppliers = calls.find((c) => c.table === "fabric_suppliers");
    expect(suppliers.op).toBe("delete");
    expect(suppliers.filters).toContain("eq:org_id=org_1");

    const orgs = calls.find((c) => c.table === "organizations");
    expect(orgs.op).toBe("delete");
    expect(orgs.filters).toContain("eq:clerk_org_id=org_1");
  });

  test("production_shares: deletes rows where this org is the source, only releases (does not delete) rows where it's the recipient", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");

    const shareCalls = calls.filter((c) => c.table === "production_shares");
    expect(shareCalls).toHaveLength(2);

    // Source-org rows: an explicit delete. These would cascade away anyway once
    // `organizations` is deleted, but the delete here is what makes the count honest.
    const del = shareCalls.find((c) => c.op === "delete");
    expect(del).toBeTruthy();
    expect(del.filters).toContain("eq:source_org_id=org_1");

    // Recipient-org rows belong to a DIFFERENT org (source_production_id,
    // created_by, token, recipient_email are all that other customer's data) —
    // must be released, never deleted.
    const upd = shareCalls.find((c) => c.op === "update");
    expect(upd).toBeTruthy();
    expect(upd.payload).toEqual({ accepted_by_org_id: null });
    expect(upd.filters).toContain("eq:accepted_by_org_id=org_1");
  });

  test("never deletes the feedback table", async () => {
    const { client, calls } = makeFake({});
    await deleteOrgRows(client, "org_1");
    expect(calls.filter((c) => c.op === "delete").map((c) => c.table)).not.toContain("feedback");
  });
});

describe("summarizeOrg", () => {
  test("reports the org name, a real count per table, the file count, and the right query shape", async () => {
    const responses = { organizations: [{ data: { name: "Nada's Theater" }, error: null }] };
    ORG_TABLES.forEach((t, i) => {
      responses[t] = { data: null, error: null, count: i + 1 };
    });
    // productions/inventory_items are queried twice: once for the count here,
    // once inside collectOrgStoragePaths for the id lookup. Keep the id-lookup
    // response empty so storageFiles is deterministically 0.
    responses.productions = [
      { data: null, error: null, count: responses.productions.count },
      { data: [], error: null },
    ];
    responses.inventory_items = [
      { data: null, error: null, count: responses.inventory_items.count },
      { data: [], error: null },
    ];

    const { client, calls } = makeFake(responses);
    const summary = await summarizeOrg(client, "org_1");

    expect(summary.orgName).toBe("Nada's Theater");
    expect(Object.keys(summary.tables)).toEqual(ORG_TABLES);
    expect(summary.storageFiles).toBe(0);

    // Real values, not just shape — a countIn that unconditionally returns 0
    // (exactly how the org_subscriptions "no id column" bug surfaced) must fail this.
    for (const t of ORG_TABLES) {
      expect(summary.tables[t]).toBe(ORG_TABLES.indexOf(t) + 1);
    }

    // Query shape for a plain org_id-scoped table.
    const makersCall = calls.find((c) => c.table === "makers");
    expect(makersCall.cols).toBe("*");
    expect(makersCall.opts).toEqual({ count: "exact", head: true });
    expect(makersCall.filters).toContain("eq:org_id=org_1");

    // org_subscriptions has no `id` column at all — selecting "*" rather than
    // "id" is exactly the fix for Critical 1. Assert the shape directly so a
    // regression back to selecting "id" is caught here, not in production.
    const subsCall = calls.find((c) => c.table === "org_subscriptions");
    expect(subsCall.cols).toBe("*");
    expect(subsCall.opts).toEqual({ count: "exact", head: true });

    // production_shares' count must cover both org columns — matching what
    // deleteOrgRows actually does to the table (delete one, release the other) —
    // or the dry-run total the operator reviews before an irreversible run undercounts.
    const sharesCall = calls.find((c) => c.table === "production_shares");
    expect(sharesCall.filters.join(" ")).toContain("source_org_id");
    expect(sharesCall.filters.join(" ")).toContain("accepted_by_org_id");
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

  test("maps a missing notes field to null", async () => {
    const { client, calls } = makeFake({});
    await writeDeletionLog(client, {
      orgId: "org_1",
      orgName: "Nada's Theater",
      requestedAt: "2026-08-01T00:00:00.000Z",
      requestedBy: "ticket-42",
      // notes intentionally omitted
    });
    const call = calls.find((c) => c.table === "deletion_log");
    expect(call.payload.notes).toBeNull();
  });
});
