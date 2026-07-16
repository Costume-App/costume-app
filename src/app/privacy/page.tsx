import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Privacy Policy" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="July 15, 2026"
      intro="What Measure My Costume collects, why, and how it is handled."
    >
      <nav className="surface p-4 text-sm">
        <span className="lbl block">On this page</span>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><a href="#collect" className="link-muted">What we collect</a></li>
          <li><a href="#performers" className="link-muted">Performers &amp; minors</a></li>
          <li><a href="#use" className="link-muted">How we use information</a></li>
          <li><a href="#providers" className="link-muted">Service providers</a></li>
          <li><a href="#sharing" className="link-muted">Sharing</a></li>
          <li><a href="#security" className="link-muted">Security</a></li>
          <li><a href="#retention" className="link-muted">Retention &amp; deletion</a></li>
          <li><a href="#rights" className="link-muted">Your rights</a></li>
          <li><a href="#cookies" className="link-muted">Cookies</a></li>
          <li><a href="#changes" className="link-muted">Changes &amp; contact</a></li>
        </ul>
      </nav>

      <Section id="collect" title="What we collect">
        <UL>
          <LI>
            <B>Account information</B> — your name and email address, handled by our sign-in
            provider.
          </LI>
          <LI>
            <B>Organization content</B> — what your team enters to plan productions: shows,
            roles, performer names, measurements, costume designs, photos, notes, and fabric and
            cost details.
          </LI>
          <LI>
            <B>Billing information</B> — payments are handled by Stripe. We never see or store
            full card numbers.
          </LI>
          <LI>
            <B>Feedback</B> — anything you send us through the in-app feedback form or by email.
          </LI>
          <LI>
            <B>Technical basics</B> — sign-in session cookies and standard server logs that keep
            the service working and secure.
          </LI>
        </UL>
      </Section>

      <Section id="performers" title="Performers and minors">
        <P>
          Performer information — names, measurements, and photos — is entered by your
          organization, and your organization is responsible for having consent to store it,
          including from a parent or guardian for performers under 18. We process that
          information only to run the service for your organization. It is never used for
          advertising.
        </P>
        <P>
          Accounts are for adults. We do not knowingly let children under 13 create accounts,
          and we will delete any we discover.
        </P>
      </Section>

      <Section id="use" title="How we use information">
        <UL>
          <LI>To provide and operate the service for your organization.</LI>
          <LI>
            To calculate fabric estimates — descriptions of costume pieces are sent to our AI
            provider to produce the estimate.
          </LI>
          <LI>
            To send service email, such as invitations, requests to join an organization, and
            feedback replies.
          </LI>
          <LI>To respond to support requests and keep the service secure.</LI>
        </UL>
        <P>We do not sell personal information, and we show no advertising.</P>
      </Section>

      <Section id="providers" title="Service providers">
        <P>These companies process data for us, each receiving only what it needs:</P>
        <UL>
          <LI><B>Clerk</B> — sign-in and account management.</LI>
          <LI><B>Supabase</B> — database and photo storage.</LI>
          <LI><B>Stripe</B> — payments and billing.</LI>
          <LI><B>Anthropic</B> — AI fabric estimates.</LI>
          <LI><B>Resend</B> — email delivery.</LI>
          <LI><B>Vercel</B> — hosting.</LI>
        </UL>
      </Section>

      <Section id="sharing" title="Sharing">
        <P>
          We do not sell or rent your information. Beyond the providers above, we share data only
          if the law requires it.
        </P>
        <P>
          If your organization shares a production with another organization using a share link,
          only the design layer is copied — roles, costume designs, notes, and design photos.{" "}
          <B>Performer names and measurements are never included.</B>
        </P>
      </Section>

      <Section id="security" title="Security">
        <UL>
          <LI>All traffic is encrypted in transit (HTTPS).</LI>
          <LI>Your data is only visible to members of your organization.</LI>
          <LI>Photo links are time-limited signed URLs, not public addresses.</LI>
          <LI>Payment details go directly to Stripe and never touch our servers.</LI>
        </UL>
      </Section>

      <Section id="retention" title="Retention and deletion">
        <P>
          We keep your organization&rsquo;s data while the organization is active. To delete your
          organization and its data, email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>{" "}
          and we will remove it within a reasonable period.
        </P>
      </Section>

      <Section id="rights" title="Your rights">
        <P>
          You can view and update most information directly in the app. For access, correction,
          export, or deletion requests, email{" "}
          <a href="mailto:hello@measuremycostume.com" className="link-red">
            hello@measuremycostume.com
          </a>
          .
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
