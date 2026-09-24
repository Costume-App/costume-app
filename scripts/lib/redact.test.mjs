import { describe, it, expect } from "vitest";
import { redactSecret } from "./redact.mjs";

describe("redactSecret", () => {
  it("replaces every occurrence of the secret with a redaction marker", () => {
    const secret = "tok_abc123";
    const text = `page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:6100/sign-in?__clerk_ticket=${secret}\ncall log:\n  - navigating to "http://localhost:6100/sign-in?__clerk_ticket=${secret}"`;
    const out = redactSecret(text, secret);
    expect(out).not.toContain(secret);
    expect(out.match(/<redacted>/g)).toHaveLength(2);
  });
  it("leaves text untouched when the secret is not present", () => {
    expect(redactSecret("no ticket here", "tok_abc123")).toBe("no ticket here");
  });
  it("returns the input unchanged for empty or missing text or secret", () => {
    expect(redactSecret("", "tok_abc123")).toBe("");
    expect(redactSecret(undefined, "tok_abc123")).toBeUndefined();
    expect(redactSecret("some text", "")).toBe("some text");
    expect(redactSecret("some text", undefined)).toBe("some text");
  });
});
