import Link from "next/link";
import { B, LegalShell, LI, P, Section, UL } from "@/components/legal/LegalPage";

export const metadata = { title: "Terms of Service" };

// Static legal page, publicly reachable (listed in src/lib/public-routes.ts).
export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="July 27, 2026"
      intro="The plain-English rules for using Measure My Costume."
    >
      <Section id="agreement" title="1. Agreeing to these terms">
        <P>
          Measure My Costume (&ldquo;the service&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          costume- and production-planning tool for theater organizations, available at
          measuremycostume.com. By creating an account or using the service, you agree to these
          terms and to our <Link href="/privacy" className="link-red">Privacy Policy</Link>. If
          you are using the service on behalf of an organization, you are agreeing for that
          organization too.
        </P>
        <P>
          You must be old enough to enter into a binding contract where you live. If you create an
          account on behalf of an organization, you confirm that you have authority to bind that
          organization to these terms. By creating an account you confirm both.
        </P>
      </Section>

      <Section id="service" title="2. The service">
        <P>
          Measure My Costume helps costume teams plan productions: manage roles and casts, record
          performer measurements, design and source costume pieces, track a house inventory, and
          estimate fabric and costs.
        </P>
      </Section>

      <Section id="accounts" title="3. Accounts and organizations">
        <P>
          Sign-in is handled by our authentication provider. Your work lives inside an{" "}
          <B>organization</B>; organization admins control who is a member and what settings
          apply. Keep your sign-in credentials secure — you are responsible for activity that
          happens under your account.
        </P>
      </Section>

      <Section id="content" title="4. Your content">
        <P>
          Your organization owns the content it puts into the service — productions, designs,
          measurements, photos, and notes. We claim no ownership of it. You grant us only the
          limited license we need to store, process, back up, and display that content in order
          to run the service for you.
        </P>
        <P>You are responsible for having the rights to any content you upload.</P>
      </Section>

      <Section id="performers" title="5. Performer information">
        <P>
          Much of what the service stores is information about performers — names, body
          measurements, and photos — entered by your organization. <B>Your organization is
          responsible for having permission to collect and store that information</B>, including
          consent from a parent or guardian for any performer under 18 years of age. Do not enter information
          about a performer if you do not have that permission.
        </P>
      </Section>

      <Section id="acceptable-use" title="6. Acceptable use">
        <UL>
          <LI>Use the service only for lawful purposes.</LI>
          <LI>Do not upload content that is abusive, infringing, or harmful.</LI>
          <LI>Do not probe, disrupt, scrape, or reverse engineer the service.</LI>
          <LI>Do not resell the service or share accounts outside your organization.</LI>
        </UL>
      </Section>

      <Section id="payments" title="7. Payments">
        <P>
          Paid plans are billed by our payment processor, Stripe, at the pricing shown on the
          site — a one-time purchase per production or an annual subscription. You can cancel a
          subscription at any time; it stays active until the end of the period you paid for.
          Fees are nonrefundable except where the law requires otherwise. If prices change, we
          will let you know before your next renewal.
        </P>
        <P>
          Questions about billing? Email{" "}
          <a href="mailto:billing@measuremycostume.com" className="link-red">
            billing@measuremycostume.com
          </a>
          .
        </P>
      </Section>

      <Section id="ai" title="8. Automatic estimates">
        <P>
          Fabric-yardage estimates are generated automatically. They are suggestions to help you
          plan, not guarantees — double-check quantities before purchasing fabric. We are not
          responsible for purchasing decisions made from an estimate.
        </P>
      </Section>

      <Section id="ending" title="9. Ending your use">
        <P>
          You can stop using the service at any time, and you can ask us to delete your
          organization and its data by emailing{" "}
          <a href="mailto:privacy@measuremycostume.com" className="link-red">
            privacy@measuremycostume.com
          </a>
          . We will remove it within 30 days of a verified request, except for records we are
          required by law to retain. We may suspend or close accounts that violate these terms,
          with notice where practical.
        </P>
      </Section>

      <Section id="disclaimers" title="10. Disclaimers and limitation of liability">
        <P>
          The service is provided <B>as is</B> and <B>as available</B>, without warranties of any
          kind. To the fullest extent permitted by law, we are not liable for indirect,
          incidental, or consequential damages, and our total liability for any claim is limited
          to the amount your organization paid us in the 12 months before the claim arose.
        </P>
      </Section>

      <Section id="changes" title="11. Changes to these terms">
        <P>
          We may update these terms from time to time. We will post the new version here with an
          updated date, and for material changes we will notify you by email or in the app.
          Continuing to use the service after a change means you accept the new terms.
        </P>
      </Section>

      <Section id="law" title="12. Governing law">
        <P>
          These terms are governed by the laws of the State of Washington, USA, without regard to
          its conflict-of-law rules.
        </P>
      </Section>

      <Section id="contact" title="13. Contact">
        <P>Reach us at the address that matches your question:</P>
        <UL>
          <LI>
            <B>General questions</B> —{" "}
            <a href="mailto:hello@measuremycostume.com" className="link-red">
              hello@measuremycostume.com
            </a>
          </LI>
          <LI>
            <B>Billing</B> —{" "}
            <a href="mailto:billing@measuremycostume.com" className="link-red">
              billing@measuremycostume.com
            </a>
          </LI>
          <LI>
            <B>Privacy and data requests</B> —{" "}
            <a href="mailto:privacy@measuremycostume.com" className="link-red">
              privacy@measuremycostume.com
            </a>
          </LI>
        </UL>
      </Section>

      <p className="border-t border-[var(--field-line)] pt-4 text-sm muted">
        See also our <Link href="/privacy" className="link-red">Privacy Policy</Link>.
      </p>
    </LegalShell>
  );
}
