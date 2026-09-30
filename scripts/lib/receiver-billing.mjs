// The only billing writer the training recorder reaches: every other script
// it runs talks to the app's own API, and resetReceiver's one exception
// routes through here, not through a Supabase client it builds itself. Dev
// and prod share one Supabase database, so this module never trusts a
// caller's word on the target org: planReceiverBillingReset refuses to build
// a plan unless the receiver id looks like a Clerk org, differs from the
// sender's, and the Clerk dev API itself reports its id and name as the
// receiver's ("Demo Playhouse", RECEIVER_ORG_NAME), and
// applyReceiverBillingPlan refuses to run any op whose orgId is not the one
// the caller named as the receiver, whose (op, table) pair is not on its own
// fixed allowlist, or that carries a payload of its own rather than one this
// module builds. Every reset resets to zero purchases; nothing here ever
// buys or repairs a real subscription (the video never buys Unlimited, so
// assertNotSubscribed only ever reads and throws, never fixes).
import { createClient } from "@supabase/supabase-js";
import { RECEIVER_ORG_NAME, loadReceiver, assertDevClerkKey, loadEnvLocalIntoProcess } from "./demo-org.mjs";

// The complete set of writes this module is allowed to make, keyed by
// "op:table". applyReceiverBillingPlan checks every op against this before
// it sends a single call.
const ALLOWED_OPS = new Set([
  "delete:production_purchases",
  "delete:seat_purchases",
  "assertNotSubscribed:org_subscriptions",
  "insert:production_purchases",
]);

const RECEIVER_ID_SHAPE = /^org_[A-Za-z0-9]+$/;

/** Pure: builds the ordered list of billing ops a receiver reset performs.
 * Throws before returning anything unless every one of these holds:
 * receiver.clerkOrgId is present and matches RECEIVER_ID_SHAPE, it differs
 * from sender.clerkOrgId, and clerkOrgName (read live from the Clerk dev API
 * by the caller) equals RECEIVER_ORG_NAME. The insert op it may append never
 * carries its own row; applyReceiverBillingPlan builds that row itself from
 * orgId. The returned list, and every op in it, is frozen. */
export function planReceiverBillingReset({ sender, receiver, clerkOrgName, grantUnlock = false }) {
  if (!receiver || typeof receiver.clerkOrgId !== "string" || !receiver.clerkOrgId) {
    throw new Error("planReceiverBillingReset: receiver is missing a clerkOrgId");
  }
  if (!RECEIVER_ID_SHAPE.test(receiver.clerkOrgId)) {
    throw new Error(`planReceiverBillingReset: receiver.clerkOrgId "${receiver.clerkOrgId}" must match ${RECEIVER_ID_SHAPE}`);
  }
  if (!sender || typeof sender.clerkOrgId !== "string" || !sender.clerkOrgId) {
    throw new Error("planReceiverBillingReset: sender is missing a clerkOrgId");
  }
  if (receiver.clerkOrgId === sender.clerkOrgId) {
    throw new Error("planReceiverBillingReset: receiver.clerkOrgId must differ from the sender's");
  }
  if (clerkOrgName !== RECEIVER_ORG_NAME) {
    throw new Error(`planReceiverBillingReset: Clerk reports org name "${clerkOrgName}", expected "${RECEIVER_ORG_NAME}"`);
  }

  const orgId = receiver.clerkOrgId;
  const ops = [
    Object.freeze({ op: "delete", table: "production_purchases", orgId }),
    Object.freeze({ op: "delete", table: "seat_purchases", orgId }),
    Object.freeze({ op: "assertNotSubscribed", table: "org_subscriptions", orgId }),
  ];
  if (grantUnlock) {
    ops.push(Object.freeze({ op: "insert", table: "production_purchases", orgId }));
  }
  return Object.freeze(ops);
}

/** Executes a plan built by planReceiverBillingReset against a supabase-js
 * client. Snapshots the plan into frozen copies FIRST, so a caller that
 * still holds the original array or op objects (the execution loop below
 * awaits between ops) cannot change what gets checked or sent after this
 * function has started. Validates the WHOLE snapshot (every op's orgId
 * matches receiverOrgId, every op's "op:table" pair is on ALLOWED_OPS, no op
 * carries a "row" of its own, and no "insert" op lacks a preceding
 * "assertNotSubscribed" for the same org) before it sends its first call, so
 * a bad op anywhere in the plan means zero writes, not a partial run. */
export async function applyReceiverBillingPlan(sb, plan, receiverOrgId) {
  const ops = plan.map((op) => Object.freeze({ ...op }));

  const assertedOrgs = new Set();
  for (const op of ops) {
    if (op.orgId !== receiverOrgId) {
      throw new Error(
        `applyReceiverBillingPlan: op "${op.op}" on "${op.table}" targets org "${op.orgId}", not the receiver "${receiverOrgId}"`,
      );
    }
    const key = `${op.op}:${op.table}`;
    if (!ALLOWED_OPS.has(key)) {
      throw new Error(`applyReceiverBillingPlan: op "${key}" is not on the allowlist`);
    }
    if (Object.hasOwn(op, "row")) {
      throw new Error(`applyReceiverBillingPlan: op "${key}" must not carry its own row; the row is built here`);
    }
    if (op.op === "assertNotSubscribed") {
      assertedOrgs.add(op.orgId);
    }
    if (op.op === "insert" && !assertedOrgs.has(op.orgId)) {
      throw new Error(
        `applyReceiverBillingPlan: op "${key}" for org "${op.orgId}" has no preceding assertNotSubscribed for that org`,
      );
    }
  }

  for (const op of ops) {
    if (op.op === "delete") {
      const { error } = await sb.from(op.table).delete().eq("org_id", op.orgId);
      if (error) throw new Error(`${op.table}: ${error.code ?? "unknown"} ${error.message}`);
    } else if (op.op === "assertNotSubscribed") {
      const { data, error } = await sb.from(op.table).select("comped, status").eq("org_id", op.orgId).maybeSingle();
      if (error) throw new Error(`${op.table}: ${error.code ?? "unknown"} ${error.message}`);
      if (data && (data.comped === true || data.status === "active" || data.status === "trialing")) {
        throw new Error(
          `applyReceiverBillingPlan: receiver org "${op.orgId}" is already subscribed (comped=${data.comped}, status=${data.status})`,
        );
      }
    } else if (op.op === "insert") {
      const row = { org_id: op.orgId, source: "training_demo" };
      const { error } = await sb.from(op.table).insert(row);
      if (error) throw new Error(`${op.table}: ${error.code ?? "unknown"} ${error.message}`);
    }
  }
}

async function fetchClerkOrg(fetchImpl, key, orgId) {
  const res = await fetchImpl(`https://api.clerk.com/v1/organizations/${encodeURIComponent(orgId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk GET /organizations/${orgId} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Resets the receiver org's billing rows to zero: deletes every
 * production_purchases and seat_purchases row for the receiver, refuses if
 * it finds an active subscription, and (only when grantUnlock is true)
 * inserts one unbound production unlock. This is the only place demo-
 * productions.mjs's resetReceiver reaches Supabase directly rather than
 * through the app's API; other repo scripts (bootstrap-receiver-org.mjs,
 * delete-org.mjs) build their own service-role clients for unrelated work.
 * fetchImpl and createClientImpl default to the real fetch and
 * @supabase/supabase-js's createClient; tests inject fakes so a failed
 * dev-key check or a wrong Clerk id/name can be proven to build no client
 * and write nothing. */
export async function resetReceiverBilling({ demo, grantUnlock = false, fetchImpl = fetch, createClientImpl = createClient }) {
  const receiver = loadReceiver(demo);
  loadEnvLocalIntoProcess();
  const key = process.env.CLERK_SECRET_KEY;
  assertDevClerkKey(key);
  const org = await fetchClerkOrg(fetchImpl, key, receiver.clerkOrgId);
  if (org.id !== receiver.clerkOrgId) {
    throw new Error(`resetReceiverBilling: Clerk returned org id "${org.id}", expected "${receiver.clerkOrgId}"`);
  }
  const plan = planReceiverBillingReset({ sender: demo, receiver, clerkOrgName: org.name, grantUnlock });
  const sb = createClientImpl(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  await applyReceiverBillingPlan(sb, plan, receiver.clerkOrgId);
  return plan;
}
