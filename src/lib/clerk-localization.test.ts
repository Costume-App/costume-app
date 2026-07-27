import { expect, test } from "vitest";
import { CLERK_LOCALIZATION } from "@/lib/clerk-localization";

const LABEL =
  CLERK_LOCALIZATION.signUp.legalConsent.checkbox.label__termsOfServiceAndPrivacyPolicy;

test("sign-up affirmation covers the user and their organization", () => {
  expect(LABEL).toContain("legally able to create this account");
  expect(LABEL).toContain("for myself and for my organization");
});

test("sign-up affirmation links both legal documents", () => {
  expect(LABEL).toContain("{{termsOfServiceLink}}");
  expect(LABEL).toContain("{{privacyPolicyLink}}");
});
