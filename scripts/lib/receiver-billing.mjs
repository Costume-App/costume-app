// The ONLY module in scripts/ that writes billing rows. Dev and prod share
// one Supabase database, so this module never trusts a caller's word on the
// target org: planReceiverBillingReset refuses to build a plan unless the
// receiver id looks like a Clerk org, differs from the sender's, and the
// Clerk dev API itself reports its name as "Demo Playhouse" (RECEIVER_ORG_NAME),
// and applyReceiverBillingPlan refuses to run any op whose orgId is not the
// one the caller named as the receiver, or whose (op, table) pair is not on
// its own fixed allowlist. Every reset resets to zero purchases; nothing
// here ever buys or repairs a real subscription (the video never buys
// Unlimited, so assertNotSubscribed only ever reads and throws, never fixes).
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

/** Pure: builds the ordered list of billing ops a receiver reset performs.
 * Throws before returning anything unless every one of these holds:
 * receiver.clerkOrgId is present and starts with "org_", it differs from
 * sender.clerkOrgId, and clerkOrgName (read live from the Clerk dev API by
 * the caller) equals RECEIVER_ORG_NAME. The returned list, and every op in
 * it, is frozen. */
export function planReceiverBillingReset({ sender, receiver, clerkOrgName, grantUnlock = false }) {
  if (!receiver || typeof receiver.clerkOrgId !== "string" || !receiver.clerkOrgId) {
    throw new Error("planReceiverBillingReset: receiver is missing a clerkOrgId");
  }
  if (!receiver.clerkOrgId.startsWith("org_")) {
    throw new Error(`planReceiverBillingReset: receiver.clerkOrgId "${receiver.clerkOrgId}" must start with "org_"`);
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
    ops.push(Object.freeze({
      op: "insert",
      table: "production_purchases",
      orgId,
      row: Object.freeze({ org_id: orgId, source: "training_demo" }),
    }));
  }
  return Object.freeze(ops);
}

/** Executes a plan built by planReceiverBillingReset against a supabase-js
 * client. Validates the WHOLE plan (every op's orgId matches receiverOrgId,
 * and every op's "op:table" pair is on ALLOWED_OPS) before it sends its
 * first call, so a bad op anywhere in the plan means zero writes, not a
 * partial run. */
export async function applyReceiverBillingPlan(sb, plan, receiverOrgId) {
  for (const op of plan) {
    if (op.orgId !== receiverOrgId) {
      throw new Error(
        `applyReceiverBillingPlan: op "${op.op}" on "${op.table}" targets org "${op.orgId}", not the receiver "${receiverOrgId}"`,
      );
    }
    const key = `${op.op}:${op.table}`;
    if (!ALLOWED_OPS.has(key)) {
      throw new Error(`applyReceiverBillingPlan: op "${key}" is not on the allowlist`);
    }
  }

  for (const op of plan) {
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
      const { error } = await sb.from(op.table).insert(op.row);
      if (error) throw new Error(`${op.table}: ${error.code ?? "unknown"} ${error.message}`);
    }
  }
}

async function fetchClerkOrgName(key, orgId) {
  const res = await fetch(`https://api.clerk.com/v1/organizations/${orgId}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk GET /organizations/${orgId} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).name;
}

/** Resets the receiver org's billing rows to zero: deletes every
 * production_purchases and seat_purchases row for the receiver, refuses if
 * it finds an active subscription, and (only when grantUnlock is true)
 * inserts one unbound production unlock. The only function in scripts/
 * that constructs a service-role Supabase client. */
export async function resetReceiverBilling({ demo, grantUnlock = false }) {
  const receiver = loadReceiver(demo);
  loadEnvLocalIntoProcess();
  const key = process.env.CLERK_SECRET_KEY;
  assertDevClerkKey(key);
  const clerkOrgName = await fetchClerkOrgName(key, receiver.clerkOrgId);
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const plan = planReceiverBillingReset({ sender: demo, receiver, clerkOrgName, grantUnlock });
  await applyReceiverBillingPlan(sb, plan, receiver.clerkOrgId);
  return plan;
}
