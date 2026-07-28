# Compliance revisions to Terms, Privacy, and sign-up

**Date:** 2026-07-27
**Status:** Approved, ready for implementation plan

## Background

Nada's brother Isaias, who does compliance and fraud work, reviewed the public
`/terms` and `/privacy` pages (shipped 2026-07-15, commit `4837f36`) and gave
verbal feedback on a call with Chris. Nada is holding the launch on this work —
she has not invited anyone to the app and has not posted the Instagram videos
because she wants the disclosures settled first.

His feedback, in his order:

1. Delete the **Service providers** and **Security** sections from the Privacy Policy.
2. Trim **How we use information** — "we will provide information as needed in
   order to make the website work." Do not get too specific, from a legal and a
   compliance point of view.
3. Trim **What we collect** — "we will collect information that's necessary to
   facilitate the use of the app, and account information for verification and
   billing." Simple, a little vague, but enough that people understand what it
   is for.
4. **Sharing** is fine as written. Leave it.
5. **Retention** — because payment and billing records are kept, financial
   record-retention law applies. State adherence to applicable state and federal
   law rather than describing specifics.
6. Split the single `hello@` contact address into purpose-specific addresses, so
   requests are separable — and so they are easier to isolate under discovery.
7. Replace "within a reasonable period" with a concrete deletion window.
8. Add **CCPA** (California) and **GDPR** (Europe) to retention and rights.
9. Age claims: an unverifiable claim is unenforceable. Delete the under-13
   language, and add a sign-up tick box affirming the user is legally able to
   create the account for themselves and for the organization.

A second request from the same call — a skirt-radius fabric yardage calculation
driven by performer measurements — is **explicitly out of scope here** and gets
its own spec once Nada's formula is in hand.

## Decisions

| Question | Decision |
|---|---|
| Contact addresses | Three: `hello@` general/support, `billing@` payments, `privacy@` data requests |
| Deletion window | 30 days of a verified request |
| Checkbox mechanism | Clerk's built-in legal consent (`legalAccepted`) |
| Age language | Delete the unverifiable claims; keep contractual capacity + performer consent |
| Providers / Security sections | Genericize rather than delete outright |

### Why genericize instead of delete

Isaias said to delete both sections. Taken literally that conflicts with the
CCPA and GDPR references we are adding in the same document — both expect
disclosure of the *categories* of recipients. Genericizing satisfies his actual
concern (do not publish your exact vendor stack; do not make specific security
promises you must then keep) while preserving the disclosure the cited statutes
expect.

### Why GLBA and the BSA are not named

Isaias raised the Gramm-Leach-Bliley Act and possibly the Bank Secrecy Act,
because billing records are retained. His concrete instruction, though, was the
generic form: "adhere to any necessary state and federal laws as applicable for
data and financial retention."

Naming GLBA in the policy would assert that Measure My Costume is a financial
institution within the meaning of that act, which it almost certainly is not —
Stripe is the one processing payments. A false statutory self-designation is
worse than silence. The policy therefore commits to applicable record-retention
law generally, including law applying to financial records, without naming acts.

CCPA and GDPR **are** named, because Isaias asked for them specifically and
because they confer user-facing rights that a policy is expected to enumerate.

### Why Clerk's built-in consent

Clerk 7.4.3 (`@clerk/nextjs`) supports legal consent as a first-class feature:

- `legalAccepted` is a `FieldId`, so the prebuilt `<SignUp />` renders and
  validates it — submission is blocked until it is ticked.
- The label is localizable via
  `signUp.legalConsent.checkbox.label__termsOfServiceAndPrivacyPolicy`, which
  interpolates `{{termsOfServiceLink}}` and `{{privacyPolicyLink}}`.
- OAuth sign-ups are covered by a `legalConsent.continue` step.
- Acceptance is recorded as `legalAcceptedAt` on the Clerk user record.

That last point is what makes this the right choice rather than a hand-rolled
gate. Isaias's objection to the age language was that an unenforced claim is
worthless; a checkbox with no stored record repeats that mistake. A per-user
timestamp on the identity provider is real evidence.

## Scope

### Files changed

| File | Change |
|---|---|
| `src/app/privacy/page.tsx` | Rewrite sections; update nav; update date |
| `src/app/terms/page.tsx` | Edit §1, §5, §7, §9, §13; update date |
| `src/app/layout.tsx` | Add `localization` prop to `ClerkProvider` |
| `src/app/sign-up/[[...sign-up]]/page.tsx` | Remove the passive consent paragraph |
| `src/app/privacy/page.test.tsx` *(new)* | Assert compliance content |
| `src/app/terms/page.test.tsx` *(new)* | Assert compliance content |

No database migration. No API change. `LEGAL_LINKS` in
`src/components/landing/landing-content.ts` is unchanged — the landing footer
still consumes it, and its existing test still passes.

### Out of scope

- The skirt-radius yardage calculator (separate spec).
- Backfilling `legalAcceptedAt` for existing accounts. Nada confirmed on the
  call that nobody has been invited yet, so the existing accounts are Chris's
  and Nada's own.
- Any change to billing, sharing, or onboarding behavior. This is a
  documentation and sign-up-form change only.

## Privacy Policy — replacement content

`updated` becomes `"July 27, 2026"`.

### Nav

Remove `#providers` and `#security`. Add `#safeguards`. Final order:

```
What we collect · Performers & minors · How we use information · Sharing ·
Safeguards · Retention & deletion · Your rights · Cookies · Changes & contact
```

### `#collect` — What we collect

Replaces the five-bullet list. Keep `UL`/`LI` structure.

> We collect only what is necessary to facilitate your use of the app.
>
> - **Account information** — what is needed to create and verify your account
>   and to bill you.
> - **Organization content** — the production and costume information your team
>   enters to plan a show.
> - **Technical basics** — sign-in session cookies and standard server logs that
>   keep the service working.

Removed: the enumeration of performer names, measurements, photos, notes, and
fabric and cost details; the separate Feedback bullet; the Stripe card-number
sentence (card handling moves to Safeguards).

### `#performers` — Performers and minors

First paragraph is kept, with the age criterion made explicit:

> Performer information is entered by your organization, and your organization
> is responsible for having consent to store it, including consent from a parent
> or guardian for any performer under 18 years of age. We process that
> information only to run the service for your organization. It is never used
> for advertising.

**Delete the second paragraph entirely** ("Accounts are for adults. We do not
knowingly let children under 13 create accounts, and we will delete any we
discover.").

### `#use` — How we use information

Replaces the four-bullet list plus closing line:

> We use the information we collect to operate the service for your
> organization, to verify accounts and process billing, to send service-related
> email such as invitations and support replies, and to respond to your
> requests.
>
> We do not sell personal information, and we show no advertising.

Removed: the bullet naming an AI provider. Automated estimates are disclosed
generically in Sharing instead.

### `#sharing` — Sharing

Gains the genericized providers paragraph. The share-link paragraph is kept
**verbatim** — Isaias reviewed it and said it was fine.

> We do not sell or rent your information.
>
> We use third-party service providers to operate the service — for hosting,
> account sign-in, payment processing, email delivery, and automated fabric
> estimates. Each receives only the information it needs to perform its function
> on our behalf. Beyond that, we share information only where the law requires
> it.
>
> If your organization shares a production with another organization using a
> share link, only the design layer is copied — roles, costume designs, notes,
> and design photos. **Performer names and measurements are never included.**

### `#safeguards` — Safeguards

Replaces the `#security` bullet list with a single paragraph:

> We use commercially reasonable administrative, technical, and physical
> safeguards to protect the information we hold. Payment card details are
> handled by our payment processor and are never stored on our systems.

Removed: HTTPS, org-only visibility, signed photo URLs, "never touch our
servers."

### `#retention` — Retention and deletion

> We keep your organization's data while the organization is active.
>
> We retain information, including payment and billing records, for as long as
> necessary to provide the service and to comply with applicable state and
> federal record-retention laws, including those that apply to financial
> records. Some records must be kept after an account closes for that reason.
>
> To delete your organization and its data, email
> privacy@measuremycostume.com. We will remove it **within 30 days** of a
> verified request, except for records we are required by law to retain.

### `#rights` — Your rights

> You can view and update most information directly in the app.
>
> If you are a California resident, the California Consumer Privacy Act (CCPA)
> gives you the right to know what personal information we collect and how it is
> used, to request a copy of it, to request its deletion, and not to be treated
> differently for exercising those rights. We do not sell personal information.
>
> If you are in the European Economic Area or the United Kingdom, the General
> Data Protection Regulation (GDPR) gives you the right to access, correct,
> export, restrict, or delete your personal information, and to object to
> certain processing. For the content your team enters, your organization is the
> data controller and we act as its processor — direct those requests to your
> organization first, and we will assist it in responding.
>
> To exercise any of these rights, email privacy@measuremycostume.com. We will
> respond within 30 days.

### `#cookies` — Cookies

Unchanged.

### `#changes` — Changes and contact

Unchanged except the address stays `hello@measuremycostume.com` (general
questions belong on the general lane).

## Terms of Service — edits

`updated` becomes `"July 27, 2026"`.

### §1 Agreeing to these terms

First paragraph unchanged. **Delete** "You must be at least 18 years old to
create an account." Replace with:

> You must be old enough to enter into a binding contract where you live. If you
> create an account on behalf of an organization, you confirm that you have
> authority to bind that organization to these terms. You confirm both when you
> create your account.

### §5 Performer information

Change "consent from a parent or guardian for performers under 18" to "consent
from a parent or guardian for any performer under 18 years of age." Rest
unchanged.

### §7 Payments

Append: "Questions about billing? Email billing@measuremycostume.com."

### §9 Ending your use

Change the deletion address from `hello@` to `privacy@`, and match the Privacy
Policy's window: "…and we will remove it within 30 days of a verified request,
except for records we are required by law to retain."

### §13 Contact

Replace the single address with all three, labeled:

> - General questions — hello@measuremycostume.com
> - Billing — billing@measuremycostume.com
> - Privacy and data requests — privacy@measuremycostume.com

## Sign-up checkbox

### `src/app/layout.tsx`

`ClerkProvider` (line 25) gains a `localization` prop:

```tsx
<ClerkProvider
  localization={{
    signUp: {
      legalConsent: {
        checkbox: {
          label__termsOfServiceAndPrivacyPolicy:
            "I confirm I am legally able to create this account for myself and " +
            "for my organization, and I agree to the {{termsOfServiceLink}} and " +
            "{{privacyPolicyLink}}.",
        },
      },
    },
  }}
>
```

The `{{termsOfServiceLink}}` and `{{privacyPolicyLink}}` tokens are substituted
by Clerk using the URLs configured in the Dashboard. Do not hardcode anchors.

### `src/app/sign-up/[[...sign-up]]/page.tsx`

Remove the `<p>` containing "By creating an account you agree to the…" and the
now-unused `Link` and `LEGAL_LINKS` imports. The page reduces to the `<main>`
wrapper plus `<SignUp />`. `LEGAL_LINKS` itself stays exported — the landing
footer uses it.

### Clerk Dashboard — configuration, not code

The code change renders nothing until this is done, in **both** the development
and production instances (they are configured separately):

1. Configure → Restrictions → Legal compliance → enable "Require express consent
   to legal documents."
2. Terms of Service URL: `https://www.measuremycostume.com/terms`
3. Privacy Policy URL: `https://www.measuremycostume.com/privacy`

## Testing

Two new Vitest specs, following the repo's existing component-test patterns.
They are content-assertion tests, not snapshots — the point is to make a future
edit that silently drops a statutory commitment fail loudly.

**`src/app/privacy/page.test.tsx`**

Present:
- `30 days`
- `California Consumer Privacy Act` and `CCPA`
- `General Data Protection Regulation` and `GDPR`
- `privacy@measuremycostume.com`
- `under 18 years of age`

Absent:
- `under 13`
- `reasonable period`
- Each vendor name: `Clerk`, `Supabase`, `Stripe`, `Anthropic`, `Resend`, `Vercel`

**`src/app/terms/page.test.tsx`**

Present:
- `hello@`, `billing@`, and `privacy@measuremycostume.com`
- `binding contract`
- `30 days`
- `under 18 years of age`

Absent:
- `at least 18 years old`

The full existing suite must stay green. `landing-content.test.ts` asserts
`LEGAL_LINKS` — that export is untouched, so it should pass unmodified. If it
does not, the sign-up edit went too far.

## Launch blockers

Neither is a code task; both must be done before this reaches production users.

1. **Create `billing@`, `privacy@`, and `support@`** on `measuremycostume.com`,
   alongside the existing `hello@` — four addresses in total. The policies
   promise a 30-day response at `privacy@` — an address that bounces is a
   self-inflicted policy violation. `support@` is not merely a contact-page
   nicety: the in-app feedback form (`src/app/api/feedback/route.ts`) already
   sends its notification there, and a send failure is swallowed silently (the
   feedback itself is still saved, but nobody is told a submission arrived) —
   so a missing mailbox loses feedback with no error surfaced anywhere. Also
   verify `feedback@measuremycostume.com` as a Resend sending domain address
   (`src/lib/email.ts`), since that is the `from` address those notifications
   are sent from.
2. **Enable Clerk legal consent** in the development and production instances.
   When verifying, don't stop at "a checkbox appears" — confirm the rendered
   label text matches `CLERK_LOCALIZATION`. A partial Dashboard configuration
   (only a Terms URL, or only a Privacy URL, set) renders one of Clerk's own
   stock labels instead, which would silently drop the affirmation while still
   looking like a working checkbox.

## Risks and open items

- **Not legal advice.** These are drafts written from a compliance
  professional's verbal feedback, not from counsel. The 2026-07-15 originals
  already carried a "needs lawyer review" note; naming CCPA and GDPR converts
  general language into specific statutory commitments and raises the stakes on
  that review. Flag this to Chris and Nada rather than treating the pages as
  finished.
- **The 30-day promise is operational, not decorative.** It obliges someone to
  actually action deletion requests within the window.
- **Existing users have no `legalAcceptedAt`.** Acceptable now — Nada has
  invited nobody. If accounts exist before this ships, decide whether Clerk
  should re-prompt at next sign-in.
