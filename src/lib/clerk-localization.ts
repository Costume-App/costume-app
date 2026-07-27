// Clerk UI copy overrides.
//
// The sign-up affirmation lives here rather than inline in layout.tsx so it is a
// plain testable value — the wording is a compliance commitment from the
// 2026-07-27 review, not decoration. Clerk substitutes {{termsOfServiceLink}}
// and {{privacyPolicyLink}} with links to the URLs configured in the Clerk
// Dashboard, so the anchors must not be hardcoded here.
//
// The checkbox only renders once "Require express consent to legal documents" is
// enabled in the Clerk Dashboard — separately for the development and the
// production instance. Without that toggle this override is inert.
//
// Not type-annotated on purpose: ClerkProvider's `localization` prop is a
// deep-partial, and @clerk/types is not a declared dependency of this project.
export const CLERK_LOCALIZATION = {
  signUp: {
    legalConsent: {
      checkbox: {
        label__termsOfServiceAndPrivacyPolicy:
          "I confirm I am legally able to create this account for myself and for my " +
          "organization, and I agree to the {{termsOfServiceLink}} and {{privacyPolicyLink}}.",
      },
    },
  },
};
