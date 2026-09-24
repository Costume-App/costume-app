// Training video 2: "Roles and Cast". Script: docs/training-videos/scripts/roles-and-cast.md.
//
// DB state: only the demo org's "Twelfth Night" is touched. Each section's
// prep rebuilds it (lib/demo-productions.mjs resetTwelfthNight) to exactly
// what the viewer saw at the end of the previous section, so any section
// retakes alone. "ai-roles" films a live Haiku call through the app's own
// route, whose output varies; later sections start from TWELFTH_ROLES
// instead, so their retakes never depend on the model's answer.
import { TWELFTH, TWELFTH_ROLES, ensureTwelfthNight, resetTwelfthNight } from "../demo-productions.mjs";

const EXTRA_ROLE = "Sea Captain";
const ENSEMBLE = "Musicians";
const ROLES_AFTER_ADD = { roles: [...TWELFTH_ROLES, EXTRA_ROLE], ensembleRoles: [ENSEMBLE] };
const CAST_AFTER_CASTING = [
  { role: "Viola", name: "Maya Brooks" },
  { role: "Olivia", name: "Maya Brooks", assignment: "understudy", reuse: true },
];
const CAST_AFTER_ENSEMBLE = [
  ...CAST_AFTER_CASTING,
  { role: ENSEMBLE, name: "Theo Park" },
  { role: ENSEMBLE, name: "Rosa Diaz" },
];
// The deliberate duplicate: two separate performer rows named Jordan Lee.
const CAST_WITH_DUPLICATE = [
  ...CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: ENSEMBLE, name: "Jordan Lee" },
];
// What the viewer is left with after "Combine selected": one Jordan Lee in both roles.
const CAST_AFTER_COMBINE = [
  ...CAST_AFTER_ENSEMBLE,
  { role: "Sebastian", name: "Jordan Lee" },
  { role: ENSEMBLE, name: "Jordan Lee", reuse: true },
];

// Set by each prep so openRecord's fallback goto is the real URL (the id
// changes on every reset). The row click is what is filmed.
let twelfthPath = "/productions";
const remember = ({ production }) => { twelfthPath = `/productions/${production.id}`; };

/** Literal-ize a role/ensemble name before it goes into a RegExp. None of
 * today's fixture names carry regex metacharacters, but a role can be
 * renamed by hand later, so this is defensive rather than decorative. */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// RoleCard.tsx renders a role's row as a single <button> whose accessible
// name is "<▸ or ▾><role name>[<icons><collapsed summary>]", the triangle
// literally first (confirmed live with playwright-cli against the running
// app; a collapsed, uncast role's summary renders as a lone em dash). A plan
// draft's `^Viola` anchor never matches that button at all. Anchor past the
// triangle instead.
const roleNameRe = (name) => new RegExp(`^[▸▾]\\s*${escapeRe(name)}\\b`);

// Every role's <li> holds its own row button, tabs, and (once open) its
// Cast & Measure panel. Scoping to that <li> is not optional: a role card
// stays open once opened (RoleCard persists `open` per role id), so once
// two cards are open in the same take (cast-performers opens Viola, then
// Olivia, without closing Viola), an unscoped `getByRole("button", { name:
// "Cast & Measure" })` or `"+ Add"` matches TWO elements and Playwright's
// strict mode throws. Confirmed live by reproducing exactly that collision.
const roleCard = (page, name) =>
  page.locator("main li").filter({ has: page.getByRole("button", { name: roleNameRe(name) }) }).first();
const roleRow = (page, name) => roleCard(page, name).getByRole("button", { name: roleNameRe(name) }).first();

async function openTwelfth(page, h, s) {
  if (s === null) {
    // No sentence at this point in the section narrates opening the show
    // (either it already happened earlier in this same video, or the
    // section's first sentence is about something else, e.g. opening a
    // ROLE's card). openRecord always marks a beat, so routing through it
    // here would emit a beat with no sentence to align to. Land on the
    // production directly instead; this hard goto is still at the section's
    // START, so the builder's head-trim hides it the same way it hides
    // openRecord's own initial paint.
    await h.gotoAuthed(page, twelfthPath);
    await h.hold(page, 900); // settle before the first beat (lessons F6)
  } else {
    await h.gotoAuthed(page, "/productions");
    await h.hold(page, 900); // settle before the first beat (lessons F6)
    await h.openRecord(page, TWELFTH, twelfthPath, { headingRe: new RegExp(TWELFTH), s });
  }
}

/** Opens a role's card (if not already open) and switches to its Cast &
 * Measure tab. Returns the role's scoped card locator so callers can look
 * up pickers/openers inside it instead of unscoped from `main` (see
 * roleCard's comment for why that matters once more than one card is open
 * in the same take). */
async function openCastTab(page, h, roleName, s) {
  const card = roleCard(page, roleName);
  const row = card.getByRole("button", { name: roleNameRe(roleName) }).first();
  await h.point(page, row, { s });
  await h.hold(page, 600);
  await row.click();
  const tab = card.getByRole("button", { name: "Cast & Measure" });
  await tab.waitFor({ state: "visible", timeout: 4000 });
  await h.point(page, tab, { s, mark: false });
  await h.hold(page, 500);
  await tab.click();
  await h.hold(page, 700);
  return card;
}

/** Drives one PerformerPicker (RoleCastPanel's "+ Add primary" / "+ Add" /
 * "+ Add performer" openers) to add a brand-new performer by name, scoped to
 * the given role's card. `exact: true` on the opener matters: "+ Add" is a
 * literal substring of "+ Add primary", so an unscoped or non-exact lookup
 * can resolve either button. Confirmed live.
 *
 * `sOpen`/`sConfirm` let a caller land the opener click and the confirm
 * click under two different sentence indices when the narration splits
 * "choose + Add ___" from "type the name and add it" across two sentences
 * (ensemble's Theo Park beat does this); `sConfirm` defaults to `sOpen` for
 * callers where one sentence covers the whole add (cast-performers). */
async function addNewViaPicker(page, h, card, label, name, sOpen, sConfirm = sOpen) {
  const opener = card.getByRole("button", { name: `+ ${label}`, exact: true });
  await h.point(page, opener, { s: sOpen });
  await h.hold(page, 600);
  await opener.click();
  const input = card.getByLabel(label, { exact: true });
  await input.waitFor({ state: "visible", timeout: 4000 });
  await input.pressSequentially(name, { delay: 90 });
  await h.hold(page, 500);
  const addNew = card.getByRole("button", { name: /^\+ Add new/ });
  await h.point(page, addNew, { s: sConfirm, mark: false });
  await h.hold(page, 500);
  await addNew.click();
  await card.getByText(name, { exact: true }).first().waitFor({ state: "visible", timeout: 6000 });
  await h.hold(page, 800);
}

export const WALKTHROUGH = {
  slug: "roles-and-cast",
  title: "Roles and Cast",
  guideAnchor: "roles",
  sections: [
    {
      id: "intro",
      heading: "Roles and cast",
      targetSeconds: 16,
      prep: async (api) => { await ensureTwelfthNight(api); },
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 900);
        const twelfthCard = page.locator("main").getByRole("link", { name: new RegExp(TWELFTH) }).first();
        await h.point(page, twelfthCard, { s: 0 });
        await h.hold(page, 1200);
        const badge = page.getByText(/days to next showing/i).first();
        await h.zoom(page, badge, { s: 1, holdMs: 2600 });
        const midsummerCard = page.locator("main").getByRole("link", { name: /A Midsummer Night's Dream/ }).first();
        await h.point(page, midsummerCard, { s: 2 });
        await h.hold(page, 1800);
        await h.point(page, twelfthCard, { s: 3 });
        await h.hold(page, 2200);
        await h.zoom(page, twelfthCard, { s: 4, holdMs: 2800 });
      },
    },
    {
      id: "ai-roles",
      heading: "Suggest roles with AI",
      targetSeconds: 30,
      prep: async (api) => remember(await resetTwelfthNight(api)),
      run: async (page, h) => {
        // s:0: "Let's open Twelfth Night from the Productions page."
        // openTwelfth(page, h, 0) covers this with the production-card beat.
        await openTwelfth(page, h, 0);
        // s:1: "A brand new show has no roles yet, so the workspace offers a
        // shortcut." is scene-setting with nothing new on screen yet, so it
        // gets no beat of its own (same pattern as other sections'
        // unaddressed setup sentences).
        const suggest = page.getByRole("button", { name: "Suggest roles with AI" });
        // s:2: "Choose Suggest roles with AI, and in a few seconds the app
        // lists the show's standard characters."
        await h.point(page, suggest, { s: 2 });
        await h.hold(page, 900);
        await suggest.click();
        const addAll = page.getByRole("button", { name: "Add all roles" });
        const failed = page.getByText(/Couldn't get suggestions|AI suggestions are not configured|No suggestions found/);
        // One wait on either outcome (a Promise.race of two waitFors leaves
        // the loser pending, and its later timeout is an unhandled rejection).
        await addAll.or(failed).first().waitFor({ state: "visible", timeout: 30000 });
        if (await failed.isVisible()) {
          throw new Error("ai-roles: the AI suggestion call failed on camera; check ANTHROPIC_API_KEY in the server env and retake");
        }
        await h.hold(page, 1800); // let the suggested names be read
        // s:3: "If the list looks right, choose Add all roles, and every
        // character lands in your workspace at once." The click and the
        // role list it produces are both this sentence's action, so the
        // later hold on Viola's freshly added row stays on s:3 too.
        await h.point(page, addAll, { s: 3 });
        await h.hold(page, 900);
        await addAll.click();
        await roleRow(page, "Viola").waitFor({ state: "visible", timeout: 10000 });
        await h.hold(page, 1500);
        await h.point(page, roleRow(page, "Viola"), { s: 3 });
        await h.hold(page, 2000);
        // s:4: "For many well known shows, the list appears on its own,
        // with no AI step at all." is closing commentary about shows not
        // filmed here, with nothing new to show, so it gets no beat either.
      },
    },
    {
      id: "add-roles",
      heading: "Add a role by hand",
      targetSeconds: 28,
      prep: async (api) => remember(await resetTwelfthNight(api, { roles: TWELFTH_ROLES })),
      run: async (page, h) => {
        // s:0 ("Need a character the list missed?") is a rhetorical question
        // with nothing new to show, so openTwelfth's own beat carries it.
        await openTwelfth(page, h, 0);
        const input = page.getByPlaceholder("Add a role (character)");
        const addBtn = page.locator("main").getByRole("button", { name: "Add role", exact: true });

        // s:1: "Type it into the box, and choose Add role."
        await h.point(page, input, { s: 1, mark: false });
        await h.type(page, 'input[placeholder="Add a role (character)"]', EXTRA_ROLE);
        await h.point(page, addBtn, { s: 1 });
        await h.hold(page, 600);
        await addBtn.click();
        await roleRow(page, EXTRA_ROLE).waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 700);
        // s:2: "A regular role like this one gets its own primary performer
        // and understudies..." holds on the row that sentence describes.
        await h.zoom(page, roleRow(page, EXTRA_ROLE), { s: 2, holdMs: 3000 });

        // s:3: "For a group like the musicians, tick Ensemble before you add it."
        await h.point(page, input, { s: 3, mark: false });
        await h.type(page, 'input[placeholder="Add a role (character)"]', ENSEMBLE);
        const ensembleBox = page.locator("main form").getByLabel("Ensemble");
        await h.zoom(page, ensembleBox, { s: 3, holdMs: 2000 });
        await ensembleBox.check();
        await h.hold(page, 500);
        await h.point(page, addBtn, { s: 3, mark: false });
        await h.hold(page, 500);
        await addBtn.click();
        await roleRow(page, ENSEMBLE).waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 700);
        // s:4: "An ensemble role works differently... a simple list of
        // performers who each still need their own costume," holds on the
        // new ensemble row's own summary.
        await h.zoom(page, roleRow(page, ENSEMBLE), { s: 4, holdMs: 3200 });
      },
    },
    {
      id: "cast-performers",
      heading: "Cast a performer",
      targetSeconds: 38,
      prep: async (api) => remember(await resetTwelfthNight(api, ROLES_AFTER_ADD)),
      run: async (page, h) => {
        // No sentence here narrates opening the show; the section's first
        // beat is s:0 on Viola's own row inside openCastTab.
        await openTwelfth(page, h, null);
        const violaCard = await openCastTab(page, h, "Viola", 0);
        await addNewViaPicker(page, h, violaCard, "Add primary", "Maya Brooks", 1);

        // Viola's card stays open (RoleCard never auto-collapses a sibling),
        // so by the time Olivia's card opens too, two "Cast & Measure" tabs
        // and two "+ Add" understudy openers exist on the page at once.
        // openCastTab and the opener below are both scoped to Olivia's own
        // card for exactly that reason.
        const oliviaCard = await openCastTab(page, h, "Olivia", 2);
        const opener = oliviaCard.getByRole("button", { name: "+ Add", exact: true });
        await h.point(page, opener, { s: 2, mark: false });
        await h.hold(page, 500);
        await opener.click();
        const input = oliviaCard.getByLabel("Add understudy", { exact: true });
        await input.waitFor({ state: "visible", timeout: 4000 });
        await input.pressSequentially("Maya", { delay: 90 });
        // The candidate button's accessible name is "Maya Brooks Viola" (the
        // performer's existing role summary appended); Viola's OWN row
        // button would also match /Maya Brooks/ if it were collapsed, but it
        // stays open for this whole section, so its name is just "▾ Viola"
        // with no summary text, and this stays unambiguous (confirmed live).
        const existing = page.getByRole("button", { name: /Maya Brooks/ }).filter({ hasText: "Viola" }).first();
        await h.zoom(page, existing, { s: 3, holdMs: 2600 });
        await existing.click();
        // Picking an existing performer is a mutation + re-render (lessons
        // B5): assert the understudy actually landed before moving on.
        await oliviaCard.getByText("Maya Brooks", { exact: true }).first().waitFor({ state: "visible", timeout: 6000 });
        await h.hold(page, 1500);
      },
    },
    {
      id: "ensemble",
      heading: "Ensemble roles",
      targetSeconds: 30,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_AFTER_CASTING })),
      run: async (page, h) => {
        // No sentence here narrates opening the show; the section's first
        // beat is s:0 on the ensemble role's own row inside openCastTab,
        // matching "Now let's fill the musicians, an ensemble role that
        // works a little differently from the primary roles we've cast so
        // far."
        await openTwelfth(page, h, null);
        const card = await openCastTab(page, h, ENSEMBLE, 0);
        // s:1: "Open the ensemble role, head to its Cast & Measure tab, and
        // choose + Add performer for each person in the group." openCastTab
        // (s:0 above) already covers opening the role and switching tabs;
        // the new action this sentence adds is clicking "+ Add performer"
        // itself, so only Theo Park's opener lands on s:1. Once a beat
        // moves on to s:2, check-beat-annotations enforces non-decreasing
        // s down a section, so it can never step back to s:1, and Rosa's
        // opener stays on s:2 alongside her confirm instead of repeating
        // s:1.
        // s:2: "Add Theo Park first, then Rosa Diaz right after, one at a
        // time." covers the actual typing-and-confirm for both performers:
        // Theo's confirm click and the whole of Rosa's add (opener plus
        // confirm) land here.
        await addNewViaPicker(page, h, card, "Add performer", "Theo Park", 1, 2);
        await addNewViaPicker(page, h, card, "Add performer", "Rosa Diaz", 2);
        await roleRow(page, ENSEMBLE).click(); // collapse
        await h.hold(page, 800);
        const count = page.locator("main").getByText("Ensemble · 2", { exact: true }).first();
        // s:3: "When you close the card, its row shows how many performers
        // the ensemble holds, so you always know the group's headcount
        // without opening it again."
        await h.zoom(page, count, { s: 3, holdMs: 2600 });
        await h.hold(page, 800);
        // s:4: "That quick count is especially handy for a large ensemble
        // like this one." is closing commentary with nothing new to show,
        // so it gets no beat of its own.
      },
    },
    {
      id: "combine-duplicates",
      heading: "Combine duplicates",
      targetSeconds: 34,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_WITH_DUPLICATE })),
      run: async (page, h) => {
        // s:0 ("Sometimes the same person gets typed in twice...") is scene
        // setting with nothing new on screen yet, so it gets no beat, and
        // opening the show itself is not narrated here either.
        await openTwelfth(page, h, null);
        const notice = page.locator("main").getByText(/1 name appears more than\s+once/).first();
        await h.point(page, notice, { s: 1 });
        await h.hold(page, 1200);
        const combine = page.locator("main").getByRole("button", { name: "Combine duplicates" });
        await h.point(page, combine, { s: 1, mark: false });
        await h.hold(page, 700);
        await combine.click();
        const kept = page.locator("main").getByText("Kept", { exact: true }).first();
        await kept.waitFor({ state: "visible", timeout: 6000 });
        await h.zoom(page, kept, { s: 2, holdMs: 2400 });
        const submit = page.locator("main").getByRole("button", { name: /^Combine selected \(1\)$/ });
        await h.point(page, submit, { s: 3 });
        await h.hold(page, 800);
        await submit.click();
        await notice.waitFor({ state: "hidden", timeout: 8000 });
        await h.hold(page, 2000);
      },
    },
    {
      id: "wrap-up",
      heading: "Wrap up",
      targetSeconds: 16,
      prep: async (api) => remember(await resetTwelfthNight(api, { ...ROLES_AFTER_ADD, castings: CAST_AFTER_COMBINE })),
      run: async (page, h) => {
        await openTwelfth(page, h, 0);
        await h.hold(page, 1000);
        // s:1 recaps every step by name; tour the rows that show each one:
        // Viola (cast primary), Musicians (ensemble), Sebastian (the
        // combined duplicate). Each stop is a zoom, not a plain point: a
        // moving cursor alone is too small a pixel change for ffmpeg's
        // freezedetect to register, so only a zoom's still-frame window
        // reads as "explained" footage (confirmed live by comparing a
        // point()-only version of this tour against this one).
        await h.zoom(page, roleRow(page, "Viola"), { s: 1, holdMs: 2200 });
        await h.point(page, roleRow(page, ENSEMBLE), { s: 1, mark: false });
        await h.hold(page, 900);
        await h.zoom(page, roleRow(page, "Sebastian"), { s: 1, holdMs: 2200 });
        // s:2: "In the next video, we will take measurements..." holds on a
        // role row so its "No measurements yet" summary is in frame.
        await h.zoom(page, roleRow(page, "Viola"), { s: 2, holdMs: 2600 });
        await h.hold(page, 1800);
      },
    },
  ],
};
