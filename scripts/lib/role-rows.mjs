// Role-row locators shared by the training walkthroughs (roles-and-cast,
// measurements). Lives in scripts/lib/, not scripts/lib/walkthroughs/,
// because check-beat-annotations.mjs treats every non-underscore .mjs in
// walkthroughs/ as a walkthrough.

/** Literal-ize a role/ensemble name before it goes into a RegExp. None of
 * today's fixture names carry regex metacharacters, but a role can be
 * renamed by hand later, so this is defensive rather than decorative. */
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// RoleCard.tsx renders a role's row as a single <button> whose accessible
// name is "<▸ or ▾><role name>[<icons><collapsed summary>]", the triangle
// literally first (confirmed live with playwright-cli against the running
// app; a collapsed, uncast role's summary renders as a lone em dash). A plan
// draft's `^Viola` anchor never matches that button at all. Anchor past the
// triangle instead.
export const roleNameRe = (name) => new RegExp(`^[▸▾]\\s*${escapeRe(name)}\\b`);

// Every role's <li> holds its own row button, tabs, and (once open) its
// Cast & Measure panel. Scoping to that <li> is not optional: a role card
// stays open once opened (RoleCard persists `open` per role id), so once
// two cards are open in the same take (cast-performers opens Viola, then
// Olivia, without closing Viola), an unscoped `getByRole("button", { name:
// "Cast & Measure" })` or `"+ Add"` matches TWO elements and Playwright's
// strict mode throws. Confirmed live by reproducing exactly that collision.
export const roleCard = (page, name) =>
  page.locator("main li").filter({ has: page.getByRole("button", { name: roleNameRe(name) }) }).first();
export const roleRow = (page, name) => roleCard(page, name).getByRole("button", { name: roleNameRe(name) }).first();
