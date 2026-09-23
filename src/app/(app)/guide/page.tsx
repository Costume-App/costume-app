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
        Everything the app does, by area — from setting up your team to estimating fabric.
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
        </ul>
      </nav>

      <div className="space-y-10">
        <Section id="org" title="Your organization & team">
          <P>
            Everything lives inside an <B>organization</B> (your school or company). Use the
            organization menu in the top nav to switch or create one, and to manage who has access.
          </P>
          <UL>
            <LI><B>Members</B> — invite people by email and set them as Admin or Member. Admins
              can change organization-wide settings; members can do the day-to-day work.</LI>
            <LI><B>Makers</B> — your costume team (the people who actually sew). Add them under the
              <I> Makers</I> tab in the organization menu, each with a colour. You can link a maker to
              a signed-in member so they get their own <a href="#my-work" className="link-muted">My Work</a> list.</LI>
          </UL>
        </Section>

        <Section id="productions" title="Productions & show dates">
          <P>
            The <B>Productions</B> page lists your shows, newest activity first; past and cancelled
            ones tuck into a collapsed section below. Tap <B>+ New Production</B> to start one.
          </P>
          <UL>
            <LI><B>Show dates</B> — add one or more performance dates, each with an optional
              <I> time</I> and a free-text <I>label</I> (e.g. &ldquo;Opening Night&rdquo;). Cards show a
              countdown to the next showing.</LI>
            <LI><B>Costumes-due date</B> — set the date costumes need to be ready (often ~2 weeks
              before tech). The production shows a countdown plus how many pieces are still outstanding.</LI>
            <LI><B>Notes</B> — a free-text notes box per production for anything that doesn&rsquo;t fit
              elsewhere.</LI>
            <LI><B>Cancel / delete</B> — cancel a show to move it out of the active list, or delete it
              outright.</LI>
          </UL>
        </Section>

        <Section id="roles" title="Roles, casts & performers">
          <P>
            Inside a production, the workspace is organised by <B>role</B> (character). For each role you
            cast performers and build costumes.
          </P>
          <UL>
            <LI><B>Roles</B> — add them by hand, or, for a recognised show, let the app
              <I> suggest the standard roles with AI</I> and add them in one click. Rename roles anytime.
              Use <B>Sort</B> above the list to order it by the order added, character name, or the
              selected cast&rsquo;s performer name.</LI>
            <LI><B>Casts</B> — when different performers play the same role on different nights, use a
              separate <I>cast</I> (e.g. &ldquo;Cast A&rdquo; / &ldquo;Cast B&rdquo;). Understudies are tracked
              separately from casts.</LI>
            <LI><B>Performers &amp; measurements</B> — assign a performer to each role, as primary or
              understudy, and record their measurements. Height is entered and shown in feet and inches.
              When adding someone, pick an <I>existing performer</I> from the list to cast them in another
              role — their measurements carry over, so you only take them once.</LI>
            <LI><B>Ensemble roles</B> — tick <B>Ensemble</B> when adding a role (or on its Cast &amp; Measure
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
            <B>Already written it on paper?</B> Use <B>Import measurement forms</B> on the production
            to read a photo of the filled-in form.
          </P>
        </Section>

        <Section id="designs" title="Costume designs & pieces">
          <P>
            Each role&rsquo;s costume is broken into <B>pieces</B> (e.g. &ldquo;Cloak&rdquo;, &ldquo;Vest&rdquo;,
            &ldquo;Boots&rdquo;). On a role&rsquo;s <I>Costume</I> tab you add, rename, and remove pieces.
          </P>
          <UL>
            <LI><B>Photos</B> — attach up to six reference photos per piece (and per role). On a phone
              you can shoot one on the spot or pick from your library.</LI>
            <LI><B>Notes</B> — a per-piece notes box for construction details, ideas, or reminders.</LI>
            <LI><Callout>Tip: more descriptive piece names produce better AI fabric estimates —
              &ldquo;Full-length wool cloak&rdquo; beats &ldquo;Cloak&rdquo;.</Callout></LI>
          </UL>
        </Section>

        <Section id="sourcing" title="Sourcing each piece">
          <P>
            For every performer, choose where their version of a piece comes from. Set the source on the
            Costume tab; it controls what shows up as tailoring work.
          </P>
          <UL>
            <LI><B>Make</B> — your team will sew it. These appear in <a href="#creations" className="link-muted">Costume Creations</a>.</LI>
            <LI><B>On hand</B> — already owned (often pulled from inventory); no work needed.</LI>
            <LI><B>Shared</B> — reuses another performer&rsquo;s piece, so it isn&rsquo;t built twice.</LI>
            <LI><B>Purchase</B> — bought rather than made; a <I>Purchased</I> checkbox tracks when it&rsquo;s
              in hand.</LI>
            <LI><B>Add from inventory</B> — pull an existing item from your library straight into a role;
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
            <LI>The list is searchable and grouped by category; rows expand in place to edit.</LI>
            <LI>From a costume piece linked to inventory, a quick <I>view-only popup</I> shows the item
              without leaving the page, plus a link to open it in full.</LI>
          </UL>
        </Section>

        <Section id="creations" title="Costume Creations">
          <P>
            <B>Costume Creations</B> (linked from a production) is the tailor&rsquo;s view — everything
            that needs to be <I>made</I>, plus a fabric shopping list. It has two tabs:
          </P>
          <UL>
            <LI><B>To make</B> — every make-piece, per performer. Expand a row to fill in fabric
              (type, colour, width, yardage, price per yard, supplier), see the performer&rsquo;s
              measurements, assign a <B>maker</B>, and tick it off when it&rsquo;s done.</LI>
            <LI><B>Fabric list</B> — totals the yardage and estimated cost, grouped by fabric, so you
              know exactly what to buy.</LI>
          </UL>
        </Section>

        <Section id="fabric-ai" title="AI fabric estimate">
          <P>
            On the <I>Fabric list</I> tab, <B>✨ Estimate fabric</B> asks AI to fill in the yardage for
            every make-piece that&rsquo;s still blank — from the garment name, the performer&rsquo;s
            measurements, and the fabric width.
          </P>
          <UL>
            <LI>It only fills <I>empty</I> yardages; it never overwrites a number you typed.</LI>
            <LI>Every estimate stays editable — treat it as a fast first draft and adjust as needed.</LI>
            <LI>Descriptive piece names and recorded measurements make the estimates noticeably better.</LI>
          </UL>
        </Section>

        <Section id="fabric-settings" title="Fabric settings (admin)">
          <P>
            Admins can set organisation-wide fabric defaults under the <I>Fabric</I> tab in the
            organization menu. These streamline data entry and improve estimates.
          </P>
          <UL>
            <LI><B>Widths</B> — a list of common fabric widths with one default. The default feeds the AI
              estimate when a piece has no width, and new pieces start from it.</LI>
            <LI><B>Suppliers</B> — a list of suppliers, each with a price per yard and one default. New
              pieces pre-fill the default supplier and its price, and the purchase list values blank-priced
              pieces at their supplier&rsquo;s rate.</LI>
            <LI>On a piece, width and supplier become drop-downs from these lists (any value you typed
              before is preserved). Every value stays editable per piece.</LI>
          </UL>
        </Section>

        <Section id="my-work" title="My Work">
          <P>
            If you&rsquo;re linked to a maker, <B>My Work</B> shows just the pieces assigned to you, grouped
            by production. Tick each one off as you finish it — the same status the rest of the team sees.
          </P>
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
