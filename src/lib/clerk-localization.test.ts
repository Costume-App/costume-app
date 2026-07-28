import { expect, test } from "vitest";
import { CLERK_LOCALIZATION } from "@/lib/clerk-localization";

const CHECKBOX = CLERK_LOCALIZATION.signUp.legalConsent.checkbox;
const COMBINED = CHECKBOX.label__termsOfServiceAndPrivacyPolicy;
const ONLY_TERMS = CHECKBOX.label__onlyTermsOfService;
const ONLY_PRIVACY = CHECKBOX.label__onlyPrivacyPolicy;

test("sign-up affirmation covers the user and their organization", () => {
  for (const label of [COMBINED, ONLY_TERMS, ONLY_PRIVACY]) {
    expect(label).toContain("legally able to create this account");
    expect(label).toContain("for myself and for my organization");
  }
});

test("sign-up affirmation links both legal documents when both are configured", () => {
  expect(COMBINED).toContain("{{termsOfServiceLink}}");
  expect(COMBINED).toContain("{{privacyPolicyLink}}");
});

test("terms-only affirmation links only the terms document", () => {
  expect(ONLY_TERMS).toContain("{{termsOfServiceLink}}");
  expect(ONLY_TERMS).not.toContain("{{privacyPolicyLink}}");
});

test("privacy-only affirmation links only the privacy document", () => {
  expect(ONLY_PRIVACY).toContain("{{privacyPolicyLink}}");
  expect(ONLY_PRIVACY).not.toContain("{{termsOfServiceLink}}");
});
