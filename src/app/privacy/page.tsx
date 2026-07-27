import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy Policy" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
// Copy is guarded by src/app/legal-pages.test.ts — the statutory commitments in
// here are the product of a compliance review, not free-form marketing copy.
export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="July 27, 2026"
      intro="What Measure My Costume collects, why, and how it is handled."
    >
      <nav className="surface p-4 text-sm">
        <span className="lbl block">On this page</span>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><a href="#collect" className="link-muted">What we collect</a></li>
          <li><a href="#performers" className="link-muted">Performers &amp; minors</a></li>
          <li><a href="#use" className="link-muted">How we use information</a></li>
          <li><a href="#sharing" className="link-muted">Sharing</a></li>
          <li><a href="#safeguards" className="link-muted">Safeguards</a></li>
          <li><a href="#retention" className="link-muted">Retention &amp; deletion</a></li>
          <li><a href="#rights" className="link-muted">Your rights</a></li>
          <li><a href="#cookies" className="link-muted">Cookies</a></li>
          <li><a href="#changes" className="link-muted">Changes &amp; contact</a></li>
        </ul>
      </nav>

      <Section id="collect" title="What we collect">
        <P>We collect only what is necessary to facilitate your use of the app.</P>
        <UL>
          <LI>
            <B>Account information</B> — what is needed to create and verify your account and to
            bill you.
          </LI>
          <LI>
            <B>Organization content</B> — the production and costume information your team enters
            to plan a show.
          </LI>
          <LI>
            <B>Technical basics</B> — sign-in session cookies and standard server logs that keep
            the service working.
          </LI>
        </UL>
      </Section>

      <Section id="performers" title="Performers and minors">
        <P>
          Performer information is entered by your organization, and your organization is
          responsible for having consent to store it, including consent from a parent or guardian
          for any performer under 18 years of age. We process that information only to run the
          service for your organization. It is never used for advertising.
        </P>
      </Section>

      <Section id="use" title="How we use information">
        <P>
          We use the information we collect to operate the service for your organization, to
          verify accounts and process billing, to send service-related email such as invitations
          and support replies, and to respond to your requests.
        </P>
        <P>We do not sell personal information, and we show no advertising.</P>
      </Section>

      <Section id="sharing" title="Sharing">
        <P>We do not sell or rent your information.</P>
        <P>
          We use third-party service providers to operate the service — for hosting, account
          sign-in, payment processing, email delivery, and automated fabric estimates. Each
          receives only the information it needs to perform its function on our behalf. Beyond
          that, we share information only where the law requires it.
        </P>
        <P>
          If your organization shares a production with another organization using a share link,
          only the design layer is copied — roles, costume designs, notes, and design photos.{" "}
          <B>Performer names and measurements are never included.</B>
        </P>
      </Section>

      <Section id="safeguards" title="Safeguards">
        <P>
          We use commercially reasonable administrative, technical, and physical safeguards to
          protect the information we hold. Payment card details are handled by our payment
          processor and are never stored on our systems.
        </P>
      </Section>

      <Section id="retention" title="Retention and deletion">
        <P>We keep your organization&rsquo;s data while the organization is active.</P>
        <P>
          We retain information, including payment and billing records, for as long as necessary
          to provide the service and to comply with applicable state and federal record-retention
          laws, including those that apply to financial records. Some records must be kept after
          an account closes for that reason.
        </P>
        <P>
          To delete your organization and its data, email{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will remove it within 30 days of a verified request, except for records we are
          required by law to retain.
        </P>
      </Section>

      <Section id="rights" title="Your rights">
        <P>You can view and update most information directly in the app.</P>
        <P>
          If you are a California resident, the California Consumer Privacy Act (CCPA) gives you
          the right to know what personal information we collect and how it is used, to request a
          copy of it, to request its deletion, and not to be treated differently for exercising
          those rights. We do not sell personal information.
        </P>
        <P>
          If you are in the European Economic Area or the United Kingdom, the General Data
          Protection Regulation (GDPR) gives you the right to access, correct, export, restrict,
          or delete your personal information, and to object to certain processing. For the
          content your team enters, your organization is the data controller and we act as its
          processor — direct those requests to your organization first, and we will assist it in
          responding.
        </P>
        <P>
          To exercise any of these rights, email{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will respond within 30 days.
        </P>
      </Section>

      <Section id="cookies" title="Cookies">
        <P>
          We use cookies only to keep you signed in and, briefly, to resume a checkout you
          started. There are no advertising trackers and no third-party analytics.
        </P>
      </Section>

      <Section id="changes" title="Changes and contact">
        <P>
          If this policy changes, we will post the new version here with an updated date and
          notify you of material changes by email or in the app. Questions? Email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          .
        </P>
      </Section>

      <p className="border-t border-[var(--field-line)] pt-4 text-sm muted">
        See also our <Link href="/terms" className="link-red">Terms of Service</Link>.
      </p>
    </LegalShell>
  );
}
