import { expect, test } from "vitest";
import { emailDomain, isPublicEmailDomain } from "@/lib/email-domains";

test("emailDomain extracts and lowercases the domain", () => {
  expect(emailDomain("Person@School.EDU")).toBe("school.edu");
  expect(emailDomain("a.b+tag@lincolnhs.org")).toBe("lincolnhs.org");
});

test("emailDomain returns null for malformed input", () => {
  expect(emailDomain("noatsign")).toBeNull();
  expect(emailDomain("trailing@")).toBeNull();
  expect(emailDomain("nodot@localhost")).toBeNull();
});

test("isPublicEmailDomain flags consumer providers, not org domains", () => {
  expect(isPublicEmailDomain("gmail.com")).toBe(true);
  expect(isPublicEmailDomain("ICLOUD.COM")).toBe(true);
  expect(isPublicEmailDomain("lincolnhs.edu")).toBe(false);
});
