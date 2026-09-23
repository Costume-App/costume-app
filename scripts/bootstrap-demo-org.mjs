// One-time: creates the training-video demo user and org in the DEV Clerk
// instance, the organizations row, and a comped subscription, then writes
// scripts/lib/demo-org.json (committed; ids only, no secrets).
//
//   node scripts/bootstrap-demo-org.mjs
//
// Refuses to run if demo-org.json already exists: re-creating would orphan
// the old org's data. The demo org is dedicated; nothing else lives in it.
import { existsSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ORG_FILE, DEMO_ORG_NAME, assertDevClerkKey, loadEnvLocalIntoProcess } from "./lib/demo-org.mjs";

const EMAIL = "demo-theatre+clerk_test@example.com";

if (existsSync(DEMO_ORG_FILE)) {
  console.error(`${DEMO_ORG_FILE} already exists. The demo org is set up; nothing to do.`);
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
  first_name: "Morgan",
  last_name: "Lee",
  skip_password_requirement: true,
  legal_accepted_at: new Date().toISOString(),
});
const org = await clerk("POST", "/organizations", { name: DEMO_ORG_NAME, created_by: user.id });

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { error: orgErr } = await sb.from("organizations").upsert({ clerk_org_id: org.id, name: DEMO_ORG_NAME });
if (orgErr) throw new Error(`organizations upsert: ${orgErr.message}`);
const { error: subErr } = await sb.from("org_subscriptions").upsert({ org_id: org.id, comped: true });
if (subErr) throw new Error(`org_subscriptions upsert: ${subErr.message}`);

const demo = { clerkUserId: user.id, clerkOrgId: org.id, email: EMAIL, name: DEMO_ORG_NAME };
writeFileSync(DEMO_ORG_FILE, JSON.stringify(demo, null, 2) + "\n");
console.log(`Demo org ready: ${org.id} (user ${user.id}). Wrote ${DEMO_ORG_FILE}.`);
