// Training video 1: "Getting Started". Script: docs/training-videos/scripts/getting-started.md.
//
// DB state: runs against the seeded demo org (node scripts/seed-demo-org.mjs).
//
// "create-production" CREATES "Twelfth Night" on camera. "welcome" and
// "productions-list" show the seeded list as-is, so their preps delete any
// existing "Twelfth Night" first. "create-production" is a standalone retake,
// so its prep deletes it too, every time. "workspace-tour" and "wrap-up" are
// filmed AFTER the viewer has already watched the show get created, so their
// preps converge on exactly one "Twelfth Night" existing (creating it through
// the demo API, with the same showing data the on-camera section types, if it
// is not already there from an earlier section's take in this same pass).
import { TWELFTH, TWELFTH_SHOWING, deleteByTitle, ensureTwelfthNight } from "../demo-productions.mjs";
import { showDate } from "../demo-fixtures.mjs";

// Set by workspace-tour's prep, right before its recorded take starts, so
// openRecord's fallback goto is a real production URL rather than a guess.
// The row click (client-side route) is the path actually filmed; this only
// matters if that click fails (see record-core.mjs openRecord).
let midsummerPath = "/productions";

export const WALKTHROUGH = {
  slug: "getting-started",
  title: "Getting Started",
  guideAnchor: "productions",
  sections: [
    {
      id: "welcome",
      heading: "Welcome",
      targetSeconds: 20,
      prep: (api) => deleteByTitle(api, TWELFTH),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 2500);
      },
    },
    {
      id: "productions-list",
      heading: "Your productions",
      targetSeconds: 24,
      prep: (api) => deleteByTitle(api, TWELFTH),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 700);

        const midsummerCard = page.locator("main").getByRole("link", { name: /A Midsummer Night's Dream/ }).first();
        await h.point(page, midsummerCard, { s: 0 });
        await h.hold(page, 1500);

        const badge = page.getByText(/\d+ days? to next showing/i).first();
        await h.zoom(page, badge, { s: 1, holdMs: 2600 });

        const pastLink = page.locator("main").getByRole("button", { name: /Show past & inactive/ });
        await h.point(page, pastLink, { s: 2 });
        await h.hold(page, 900);
        await pastLink.click();
        await page.locator("main").getByRole("button", { name: "Hide" }).waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 1600);

        const houseInventory = page.locator("main").getByText("House Inventory →", { exact: true });
        await h.point(page, houseInventory, { s: 3 });
        await h.hold(page, 900);
        const userGuide = page.locator("main").getByText("User Guide →", { exact: true });
        await h.point(page, userGuide, { s: 3 });
        await h.hold(page, 900);
        const feedback = page.locator("main").getByText("Submit feedback →", { exact: true });
        await h.point(page, feedback, { s: 3 });
        await h.hold(page, 1400);
      },
    },
    {
      id: "create-production",
      heading: "Create a production",
      targetSeconds: 26,
      prep: (api) => deleteByTitle(api, TWELFTH),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900); // settle before the first beat; see F6 (head-trim drops an early beat 0)

        const newBtn = page.locator("main").getByRole("link", { name: "+ New Production" });
        await h.point(page, newBtn, { s: 0 });
        await h.hold(page, 900);
        await newBtn.click();
        await page.getByPlaceholder("Mary Poppins").waitFor();
        await h.hold(page, 900);

        const titleInput = page.locator('input[placeholder="Mary Poppins"]');
        await h.point(page, titleInput, { s: 1 });
        await h.type(page, 'input[placeholder="Mary Poppins"]', TWELFTH);
        await h.hold(page, 500);

        // The showing date: 10 days out from whenever this pass records, so the
        // new show sorts ahead of "A Midsummer Night's Dream" (seeded 42 days
        // out, see scripts/lib/demo-fixtures.mjs) under the Productions page's
        // soonest-upcoming-first ordering, matching the approved script's
        // "listed at the top." Shared with the off-camera preps so a state a
        // viewer never watched get created (workspace-tour, wrap-up) still
        // matches what create-production actually typed.
        const dateInput = page.getByLabel("Showing date");
        await dateInput.fill(showDate(TWELFTH_SHOWING.offsetDays));
        const timeInput = page.getByLabel("Showing time (optional)");
        await timeInput.fill("19:30");
        await h.hold(page, 500);

        const labelInput = page.getByLabel("Showing label (optional)");
        await h.type(page, 'input[aria-label="Showing label (optional)"]', "Opening Night");
        await h.zoom(page, labelInput, { s: 3, holdMs: 2600 });

        const createBtn = page.getByRole("button", { name: "Create production" });
        await h.point(page, createBtn, { s: 4 });
        await h.hold(page, 900);
        await createBtn.click();
        await page.waitForURL(/\/productions(?:$|[/?])/, { timeout: 10000 });
        await page.locator("main").getByText(TWELFTH).first().waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 1500);
      },
    },
    {
      id: "workspace-tour",
      heading: "The production workspace",
      targetSeconds: 32,
      prep: async (api) => {
        await ensureTwelfthNight(api);
        const { productions } = await api.get("/api/productions");
        const midsummer = productions.find((p) => p.title === "A Midsummer Night's Dream");
        if (midsummer) midsummerPath = `/productions/${midsummer.id}`;
      },
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900); // settle before the first beat; see F6 (head-trim drops an early beat 0)
        await h.openRecord(page, "A Midsummer Night's Dream", midsummerPath, {
          headingRe: /A Midsummer Night's Dream/,
          s: 0,
        });

        const titaniaRow = page.locator("main").getByRole("button", { name: /Titania/ }).first();
        await h.zoom(page, titaniaRow, { s: 1, holdMs: 2600 });
        await titaniaRow.click();
        await page.getByRole("button", { name: "Ideas & Notes" }).waitFor({ state: "visible", timeout: 4000 });
        await h.hold(page, 600);

        await h.point(page, page.getByRole("button", { name: "Ideas & Notes" }), { s: 2 });
        await h.hold(page, 400);
        await h.point(page, page.getByRole("button", { name: "Cast & Measure" }), { s: 2 });
        await h.hold(page, 400);
        await h.point(page, page.getByRole("button", { name: "Costume" }), { s: 2 });
        await h.hold(page, 1200);

        const oberonDot = page
          .locator("main")
          .locator("li", { hasText: "Oberon" })
          .first()
          .getByRole("img", { name: /Measurements/ });
        await h.point(page, oberonDot, { s: 3 });
        await h.hold(page, 2200);
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 20,
      prep: (api) => ensureTwelfthNight(api),
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 3000);

        // With Twelfth Night's card pushing everything lower than in
        // "productions-list", this card sits low enough on the page that
        // point()'s own auto-scroll (record-core.mjs) does not land the
        // cursor on it reliably: at PAGE_ZOOM 1.5 the page's true scrollable
        // range only shows up through wheel input, not through
        // window.scrollTo/scrollIntoView, which read a pre-zoom scrollHeight
        // that already looks fully visible. A real wheel scroll to the
        // bottom is a deterministic end state, so point() then measures and
        // glides to a card that is already fully on screen.
        const userGuide = page.locator("main").getByRole("link", { name: /User Guide/ });
        await page.mouse.wheel(0, 2000);
        let lastScrollY = -1;
        for (let i = 0; i < 20; i++) {
          await h.hold(page, 150);
          const y = await page.evaluate(() => window.scrollY);
          if (y === lastScrollY) break;
          lastScrollY = y;
        }

        // The builder freezes the raw frame at the EXACT instant a beat is
        // marked for several seconds (the pause before "the User Guide is
        // one click away" finishes), so that one frame has to already be
        // fully settled. Direct frame extraction proved the scroll above was
        // never the problem: by the time point() marks its beat, the page
        // content is already still. The cursor was the problem. point()
        // marks its beat right after `await page.mouse.move(...)` resolves,
        // but the recorded video's frame timestamps lag the JS-observable
        // move completion by a couple hundred ms, so the exact frame the
        // builder freezes on still shows the cursor mid-glide toward the
        // card, landing between "House Inventory" and "User Guide" instead
        // of on it. Parking the cursor with an unmarked point() first, then
        // marking the beat with a second point() at the same target (a
        // no-op move, since the cursor is already there) puts the marked
        // instant on a frame that was already settled before the mark.
        await h.point(page, userGuide, { s: 2, mark: false });
        await h.hold(page, 300);
        await h.point(page, userGuide, { s: 2 });
        await h.hold(page, 4000);
      },
    },
  ],
};
