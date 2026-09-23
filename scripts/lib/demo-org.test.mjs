import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLocalBase, assertDevClerkKey, assertDemoSession, loadDemoOrg, readEnvLocal } from "./demo-org.mjs";

const demo = { clerkUserId: "user_1", clerkOrgId: "org_1", email: "d@example.com", name: "Demo Theatre Co." };

describe("assertLocalBase", () => {
  it("allows localhost and 127.0.0.1", () => {
    expect(() => assertLocalBase("http://localhost:6100")).not.toThrow();
    expect(() => assertLocalBase("http://127.0.0.1:6100")).not.toThrow();
  });
  it("refuses anything else", () => {
    expect(() => assertLocalBase("https://www.measuremycostume.com")).toThrow(/localhost/);
  });
});

describe("assertDevClerkKey", () => {
  it("requires a dev (sk_test_) key", () => {
    expect(() => assertDevClerkKey("sk_test_abc")).not.toThrow();
    expect(() => assertDevClerkKey("sk_live_abc")).toThrow(/sk_test_/);
    expect(() => assertDevClerkKey(undefined)).toThrow(/sk_test_/);
  });
});

describe("assertDemoSession", () => {
  it("passes only for the demo user in the demo org", () => {
    expect(() => assertDemoSession({ userId: "user_1", orgId: "org_1" }, demo)).not.toThrow();
    expect(() => assertDemoSession({ userId: "user_1", orgId: "org_2" }, demo)).toThrow(/org_2/);
    expect(() => assertDemoSession({ userId: "user_9", orgId: "org_1" }, demo)).toThrow(/user_9/);
  });
});

describe("loadDemoOrg and readEnvLocal", () => {
  it("loads a valid file and rejects a partial one", () => {
    const d = mkdtempSync(join(tmpdir(), "demo-"));
    writeFileSync(join(d, "ok.json"), JSON.stringify(demo));
    writeFileSync(join(d, "bad.json"), JSON.stringify({ clerkUserId: "user_1" }));
    expect(loadDemoOrg(join(d, "ok.json"))).toEqual(demo);
    expect(() => loadDemoOrg(join(d, "bad.json"))).toThrow(/clerkOrgId/);
  });
  it("parses KEY=value lines", () => {
    const d = mkdtempSync(join(tmpdir(), "env-"));
    writeFileSync(join(d, ".env.local"), "A=1\n# c\nB_KEY= two \n");
    expect(readEnvLocal(join(d, ".env.local"))).toEqual({ A: "1", B_KEY: "two" });
  });
});
