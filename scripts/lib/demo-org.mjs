// The training videos record as ONE dedicated demo user in ONE dedicated
// demo org. Dev and prod share a single Supabase database, so every script
// that writes (bootstrap, seeder, section preps, recorder) proves it is
// talking to localhost, a dev Clerk instance, and the demo org before it
// touches anything.
import { existsSync, readFileSync } from "node:fs";

export const DEMO_ORG_FILE = "scripts/lib/demo-org.json";
export const DEMO_ORG_NAME = "Demo Theatre Co.";

export function readEnvLocal(path = ".env.local") {
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

export function loadEnvLocalIntoProcess(path = ".env.local") {
  for (const [k, v] of Object.entries(readEnvLocal(path))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

export function loadDemoOrg(path = DEMO_ORG_FILE) {
  if (!existsSync(path)) throw new Error(`${path} missing. Run: node scripts/bootstrap-demo-org.mjs`);
  const demo = JSON.parse(readFileSync(path, "utf8"));
  for (const k of ["clerkUserId", "clerkOrgId", "email", "name"]) {
    if (typeof demo[k] !== "string" || !demo[k]) throw new Error(`${path}: missing ${k}`);
  }
  return demo;
}

export function assertLocalBase(base) {
  const host = new URL(base).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`Refusing base ${base}: training scripts only run against localhost`);
  }
}

export function assertDevClerkKey(key) {
  if (typeof key !== "string" || !key.startsWith("sk_test_")) {
    throw new Error("CLERK_SECRET_KEY must be a dev instance key (sk_test_...). Refusing.");
  }
}

export function assertDemoSession({ userId, orgId }, demo) {
  if (userId !== demo.clerkUserId) throw new Error(`Signed in as ${userId}, expected demo user ${demo.clerkUserId}`);
  if (orgId !== demo.clerkOrgId) throw new Error(`Active org is ${orgId}, expected demo org ${demo.clerkOrgId}`);
}
