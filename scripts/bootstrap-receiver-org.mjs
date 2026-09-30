// One-time: creates the SECOND training-video identity, the share receiver,
// in the DEV Clerk instance, and the organizations row, then writes it into
// scripts/lib/demo-org.json under `receiver` (committed; ids only, no
// secrets). Dev-Clerk-only, like bootstrap-demo-org.mjs.
//
//   node scripts/bootstrap-receiver-org.mjs
//
// Refuses to run if demo-org.json is missing (run bootstrap-demo-org.mjs
// first) or already has `receiver`: re-creating would orphan the old org's
// data. The receiver org is dedicated and gets NO org_subscriptions row: it
// must stay an unpaid org, since a video 6 section demonstrates what an
// unpaid receiving org sees.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_ORG_FILE,
  RECEIVER_ORG_NAME,
  assertDevClerkKey,
  loadEnvLocalIntoProcess,
} from "./lib/demo-org.mjs";

const EMAIL = "demo-playhouse+clerk_test@example.com";

if (!existsSync(DEMO_ORG_FILE)) {
  console.error(`${DEMO_ORG_FILE} missing. Run: node scripts/bootstrap-demo-org.mjs`);
  process.exit(1);
}
const demo = JSON.parse(readFileSync(DEMO_ORG_FILE, "utf8"));
if (demo.receiver) {
  console.error(`${DEMO_ORG_FILE} already has a receiver. The receiver org is set up; nothing to do.`);
  process.exit(1);
}
loadEnvLocalIntoProcess();
const key = process.env.CLERK_SECRET_KEY;
assertDevClerkKey(key);

async function clerk(method, path, body) {
  const res = await fetch(`https://api.clerk.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const user = await clerk("POST", "/users", {
  email_address: [EMAIL],
  first_name: "Riley",
  last_name: "Park",
  skip_password_requirement: true,
  legal_accepted_at: new Date().toISOString(),
});
console.log(`Clerk user created: ${user.id}`);

const org = await clerk("POST", "/organizations", { name: RECEIVER_ORG_NAME, created_by: user.id });
console.log(`Clerk org created: ${org.id}`);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: orgErr } = await sb.from("organizations").insert({ clerk_org_id: org.id, name: RECEIVER_ORG_NAME });
if (orgErr) throw new Error(`organizations insert: ${orgErr.message}`);
// Deliberately no org_subscriptions row: the receiver stays an unpaid org.

const receiver = { clerkUserId: user.id, clerkOrgId: org.id, email: EMAIL, name: RECEIVER_ORG_NAME };
writeFileSync(DEMO_ORG_FILE, JSON.stringify({ ...demo, receiver }, null, 2) + "\n");
console.log(`Receiver org ready: ${org.id} (user ${user.id}). Wrote ${DEMO_ORG_FILE}.`);
