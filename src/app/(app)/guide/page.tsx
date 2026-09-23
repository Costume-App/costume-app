import Link from "next/link";
import { BodyDiagram } from "@/components/BodyDiagram";

export const metadata = { title: "User Guide" };

// Static, theme-styled walkthrough of every feature. Linked from a card on the
// Productions page. Update this when features are added or change.
export default function GuidePage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/productions" className="link-muted text-sm">
        ← Productions
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold">User Guide</h1>
      <p className="mt-1 mb-8 text-sm muted">
        Everything the app does, by area, from setting up your team to estimating fabric.
        Skim the headings and jump to what you need.
      </p>

      <nav className="surface mb-8 p-4 text-sm">
        <span className="lbl block">On this page</span>
        <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
          <li><a href="#org" className="link-muted">Your organization &amp; team</a></li>
          <li><a href="#productions" className="link-muted">Productions &amp; show dates</a></li>
          <li><a href="#roles" className="link-muted">Roles, casts &amp; performers</a></li>
          <li><a href="#measurements" className="link-muted">Taking measurements</a></li>
          <li><a href="#designs" className="link-muted">Costume designs &amp; pieces</a></li>
          <li><a href="#sourcing" className="link-muted">Sourcing each piece</a></li>
          <li><a href="#inventory" className="link-muted">House Inventory</a></li>
          <li><a href="#creations" className="link-muted">Costume Creations</a></li>
          <li><a href="#fabric-ai" className="link-muted">AI fabric estimate</a></li>
          <li><a href="#fabric-settings" className="link-muted">Fabric settings (admin)</a></li>
          <li><a href="#my-work" className="link-muted">My Work</a></li>
          <li><a href="#sharing" className="link-muted">Sharing a production</a></li>
          <li><a href="#billing" className="link-muted">Plans &amp; billing</a></li>
        </ul>
      </nav>

      <div className="space-y-10">
        <Section id="org" title="Your organization & team">
          <P>
            Everything lives inside an <B>organization</B> (your school or company). Use the
            organization menu in the top nav to switch or create one, and to manage who has access.
          </P>
          <UL>
            <LI><B>Members</B>: invite people by email and set them as Admin or Member. Admins
              can change organization-wide settings; members can do the day-to-day work.</LI>
            <LI><B>Makers</B>: your costume team (the people who actually sew). Add them under the
              <I> Makers</I> tab in the organization menu, each with a colour. You can link a maker to
              a signed-in member so they get their own <a href="#my-work" className="link-muted">My Work</a> list.</LI>
            <LI><B>Joining a colleague&rsquo;s organization</B>: if you sign up with a work email and your
              school or company already has an organization here, you&rsquo;ll be offered{" "}
              <B>Request access</B> instead of starting a separate one. Its admins get an email and can
              invite you in.</LI>
          </UL>
        </Section>

        <Section id="productions" title="Productions & show dates">
          <P>
            The <B>Productions</B> page lists your shows, newest activity first; past and cancelled
            ones tuck into a collapsed section below. Tap <B>+ New Production</B> to start one.
          </P>
          <UL>
            <LI><B>Show dates</B>: add one or more performance dates, each with an optional
              <I> time</I> and a free-text <I>label</I> (e.g. &ldquo;Opening Night&rdquo;). Cards show a
              countdown to the next showing.</LI>
            <LI><B>Costumes-due date</B>: set the date costumes need to be ready (often ~2 weeks
              before tech). The production shows a countdown plus how many pieces are still outstanding.</LI>
            <LI><B>Notes</B>: a free-text notes box per production for anything that doesn&rsquo;t fit
              elsewhere.</LI>
            <LI><B>Cancel / delete</B>: cancel a show to move it out of the active list, or delete it
              outright.</LI>
          </UL>
        </Section>

        <Section id="roles" title="Roles, casts & performers">
          <P>
            Inside a production, the workspace is organised by <B>role</B> (character). For each role you
            cast performers and build costumes.
          </P>
          <UL>
            <LI><B>Roles</B>: add them by hand, or, for a recognised show, let the app
              <I> suggest the standard roles with AI</I> and add them in one click. Rename roles anytime.
              Use <B>Sort</B> above the list to order it by the order added, character name, or the
              selected cast&rsquo;s performer name.</LI>
            <LI><B>Import cast list</B>: instead of typing everyone in, paste a cast list or upload
              one (PDF, Word, Excel, CSV, text, or a photo, up to 4 MB). AI reads it into roles and
              performers, and you review everything before it&rsquo;s added: rename roles, match people to
              performers you already have, mark ensemble roles, and choose primary or understudy.
              Anything the app isn&rsquo;t sure about is flagged for you to settle first.</LI>
            <LI><B>Casts</B>: when different performers play the same role on different nights, use a
              separate <I>cast</I> (e.g. &ldquo;Cast A&rdquo; / &ldquo;Cast B&rdquo;). Understudies are tracked
              separately from casts.</LI>
            <LI><B>Performers &amp; measurements</B>: assign a performer to each role, as primary or
              understudy, and record their measurements. Height is entered and shown in feet and inches.
              When adding someone, pick an <I>existing performer</I> from the list to cast them in another
              role. Their measurements carry over, so you only take them once.</LI>
            <LI><B>Ensemble roles</B>: tick <B>Ensemble</B> when adding a role (or on its Cast &amp; Measure
              tab) for groups like &ldquo;Villagers&rdquo;: no primary or understudies, just a list of
              performers who each need a costume.</LI>
            <LI><B>Combine duplicates</B>: if the same person was added under several roles as separate
              entries, the cast list offers <I>Combine duplicates</I>. It keeps one entry per name, moves
              every role onto it, and carries the measurements over, so you only take them once.</LI>
          </UL>
        </Section>

        <Section id="measurements" title="Taking measurements">
          <P>
            On a performer&apos;s page, open <B>Where do I measure?</B> to see a front and back
            body diagram. Most measurements are in inches; <B>Shirt size</B>, <B>Pant size</B>,
            and <B>Shoe size</B> are free text (e.g. <B>L</B>, <B>36/30</B>, <B>Men&apos;s 10</B>).
            Focus any field on the form to see where it&apos;s taken on the body.
          </P>
          <div className="surface mt-3 p-4">
            <BodyDiagram />
          </div>
          <P>
            <B>Measuring a group.</B> The bars at the top and bottom of a performer&apos;s page have{" "}
            <B>Prev</B> and <B>Next</B> buttons, so you can move from one person to the next without
            going back to the cast list. Tap the name in the middle to jump straight to anyone, and to
            see how many measurements each person has so far. From there you can choose the order:{" "}
            <B>By role</B> (the order on the Cast tab), <B>A to Z</B>, or <B>Order added</B>. Turn on{" "}
            <B>Skip anyone fully measured</B> and Next goes only to people who still need measuring.
            Your choice is remembered on that device.
          </P>
          <P>
            <B>Writing instead of typing.</B> On an iPad with an Apple Pencil, you can write numbers
            straight into any measurement box and the iPad turns your handwriting into text. This is
            Apple&apos;s <B>Scribble</B> feature. If it doesn&apos;t work, turn it on in{" "}
            <B>Settings &gt; Apple Pencil &gt; Scribble</B>. On Android, a Samsung S Pen or Gboard&apos;s handwriting keyboard
            works the same way. You can write measurements the way you would on paper:{" "}
            <B>34.5</B>, <B>34 1/2</B> and <B>34½</B> all save as 34.5. If a box shows a red dot,
            the app couldn&apos;t read that number, so write it again.
          </P>
          <P>
            <B>On a phone.</B> iPhones don&apos;t support Apple Pencil, but tapping a measurement box
            opens a large number pad. You can also tap the microphone on the keyboard and say the
            number (&ldquo;thirty four point five&rdquo;).
          </P>
          <P>
            <B>Already written it on paper?</B> Use <B>Import measurement forms</B> on the production.
            Take or choose photos of the filled-in forms (JPG, PNG or PDF, up to 20 at a time), and AI
            reads each one. Before anything is saved you review every form: pick which performer it
            belongs to (or add them as someone new), and see each value next to what&apos;s already
            saved, marked new, changed, or unchanged. Untick anything you don&apos;t want to import.
          </P>
        </Section>

        <Section id="designs" title="Costume designs & pieces">
          <P>
            Each role&rsquo;s costume is broken into <B>pieces</B> (e.g. &ldquo;Cloak&rdquo;, &ldquo;Vest&rdquo;,
            &ldquo;Boots&rdquo;). On a role&rsquo;s <I>Costume</I> tab you add, rename, and remove pieces.
          </P>
          <UL>
            <LI><B>Photos</B>: attach up to six reference photos per piece (and per role). On a phone
              you can shoot one on the spot or pick from your library.</LI>
            <LI><B>Notes</B>: a per-piece notes box for construction details, ideas, or reminders.</LI>
            <LI><Callout>Tip: more descriptive piece names produce better AI fabric estimates:
              &ldquo;Full-length wool cloak&rdquo; beats &ldquo;Cloak&rdquo;.</Callout></LI>
          </UL>
        </Section>

        <Section id="sourcing" title="Sourcing each piece">
          <P>
            For every performer, choose where their version of a piece comes from. Set the source on the
            Costume tab; it controls what shows up as tailoring work.
          </P>
          <UL>
            <LI><B>Make</B>: your team will sew it. These appear in <a href="#creations" className="link-muted">Costume Creations</a>.</LI>
            <LI><B>On hand</B>: already owned (often pulled from inventory); no work needed.</LI>
            <LI><B>Shared</B>: reuses another performer&rsquo;s piece, so it isn&rsquo;t built twice.</LI>
            <LI><B>Purchase</B>: bought rather than made; a <I>Purchased</I> checkbox tracks when it&rsquo;s
              in hand.</LI>
            <LI><B>Add from inventory</B>: pull an existing item from your library straight into a role;
              its photos and storage location come along.</LI>
          </UL>
        </Section>

        <Section id="inventory" title="House Inventory">
          <P>
            <B>House Inventory</B> is your photographed library of on-hand items and props. Reach it from
            the nav (&ldquo;Inventory&rdquo;) or the House Inventory card on the Productions page.
          </P>
          <UL>
            <LI>Add items with front/back photos, a category, a storage location, and a quantity.</LI>
            <LI>Items show as a grid of photo tiles, grouped by category and searchable by name. Tap a
              tile to open it and edit its details or photos. Each item also shows which production
              and role it was <I>made for</I>.</LI>
            <LI><B>Adding finished pieces</B>: when a made or purchased piece is ticked off, the app asks{" "}
              <I>Add &hellip; to House Inventory?</I> Say yes and it copies the name, notes and photos,
              and lets you add a category, location and size. If another performer&rsquo;s copy of the
              same design is already in inventory, the quantity goes up instead of creating a duplicate.</LI>
            <LI>From a costume piece linked to inventory, a quick <I>view-only popup</I> shows the item
              without leaving the page, plus a link to open it in full.</LI>
          </UL>
        </Section>

        <Section id="creations" title="Costume Creations">
          <P>
            <B>Costume Creations</B> (linked from a production) is the tailor&rsquo;s view: everything
            that needs to be <I>made</I>, plus a shopping list. It has two tabs:
          </P>
          <UL>
            <LI><B>To make</B>: every make-piece, per performer. Expand a row to fill in fabric
              (type, colour, width, yardage, price per yard, supplier), see the performer&rsquo;s
              measurements, assign a <B>maker</B>, and tick it off when it&rsquo;s done. The tab shows how
              many pieces are made so far.</LI>
            <LI><B>Shopping</B>: totals the yardage and estimated cost, grouped by fabric, so you
              know exactly what to buy. Suppliers with a website on file are links you can tap to
              shop. Below that, <B>Purchased items</B> lists every piece you&rsquo;re buying rather than
              making, with a price for each, and the page adds it all up as{" "}
              <B>Total (fabric + purchased)</B>.</LI>
          </UL>
          <P>
            <B>Skirt yardage.</B> For a skirt, choose a <B>Skirt type</B> on its row: full circle,
            three-quarter circle, half circle, or gathered (with a <B>Fullness</B> of 2, 2.5 or 3). The
            app works out the yardage from the performer&rsquo;s waist, the skirt length and the fabric
            width, and shows how it got there. The length starts from the performer&rsquo;s outseam; change
            it for a shorter skirt. A yardage you type yourself is never overwritten by the calculator.
          </P>
        </Section>

        <Section id="fabric-ai" title="AI fabric estimate">
          <P>
            On the <I>Shopping</I> tab, <B>✨ Estimate fabric</B> asks AI to fill in the yardage for
            every make-piece that&rsquo;s still blank, using the garment name, the performer&rsquo;s
            measurements, and the fabric width.
          </P>
          <UL>
            <LI>It only fills <I>empty</I> yardages; it never overwrites a number you typed.</LI>
            <LI>Every estimate stays editable, so treat it as a fast first draft and adjust as needed.</LI>
            <LI>Descriptive piece names and recorded measurements make the estimates noticeably better.</LI>
          </UL>
        </Section>

        <Section id="fabric-settings" title="Fabric settings (admin)">
          <P>
            Admins can set organisation-wide fabric defaults under the <I>Fabric</I> tab in the
            organization menu. These streamline data entry and improve estimates.
          </P>
          <UL>
            <LI><B>Widths</B>: a list of common fabric widths with one default. The default feeds the AI
              estimate when a piece has no width, and new pieces start from it.</LI>
            <LI><B>Suppliers</B>: a list of suppliers, each with a price per yard, an optional website, and
              one default. New
              pieces pre-fill the default supplier and its price, and the purchase list values blank-priced
              pieces at their supplier&rsquo;s rate.</LI>
            <LI>On a piece, width and supplier become drop-downs from these lists (any value you typed
              before is preserved). Every value stays editable per piece.</LI>
          </UL>
        </Section>

        <Section id="my-work" title="My Work">
          <P>
            If you&rsquo;re linked to a maker, <B>My Work</B> shows just the pieces assigned to you, grouped
            by production. Tick each one off as you finish it. It&rsquo;s the same status the rest of the team sees.
          </P>
        </Section>

        <Section id="sharing" title="Sharing a production">
          <P>
            Admins can give another organization a copy of a production&rsquo;s design work, for example
            when a show is remounted by another company or school. Open the production and use{" "}
            <B>Share production</B> (also on the production&rsquo;s card on the Productions page).
          </P>
          <UL>
            <LI>The copy includes roles, costume designs and pieces, notes, and photos. It never
              includes performers or measurements.</LI>
            <LI>Each share link works once. Enter an email to send it, or use <B>Copy link</B> and send it yourself. You
              can <B>Resend</B> an unused link.</LI>
            <LI>The person receiving it opens the link and taps <B>Accept &amp; copy to my
              organization</B>. Their copy is separate from yours, so later changes on either side
              don&rsquo;t affect the other.</LI>
          </UL>
        </Section>

        <Section id="billing" title="Plans & billing">
          <P>
            Plans are managed under the <I>Billing</I> tab in the organization menu, and anyone in the
            organization can purchase.
          </P>
          <UL>
            <LI><B>Pay Per Production</B>: $49.99 one time for a single production, with 3 makers
              included. Extra makers are $10 each.</LI>
            <LI><B>Unlimited</B>: $99.99 per year for unlimited productions and makers.</LI>
            <LI>If something needs a plan (starting a production, adding more makers, or sharing), the
              app tells you and offers the options right there.</LI>
          </UL>
        </Section>
      </div>

      <p className="mt-10 border-t border-[var(--field-line)] pt-4 text-sm muted">
        Can&rsquo;t find something, or want a feature?{" "}
        <Link href="/productions#feedback" className="link-red">
          Leave us feedback
        </Link>
        .
      </p>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold">{children}</strong>;
}

function I({ children }: { children: React.ReactNode }) {
  return <em>{children}</em>;
}

function Callout({ children }: { children: React.ReactNode }) {
  return <span className="text-[var(--red)]">{children}</span>;
}
