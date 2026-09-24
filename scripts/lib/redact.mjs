// Pure string helper: strips a secret value out of arbitrary text. Used by
// signInDemo to keep a Clerk sign-in ticket out of the terminal when a
// page.goto to `${base}/sign-in?__clerk_ticket=<token>` fails, since
// Playwright's error message (and its call log, and the stack) embeds the
// full URL it was navigating to.
export function redactSecret(text, secret) {
  if (typeof text !== "string" || !text) return text;
  if (typeof secret !== "string" || !secret) return text;
  return text.split(secret).join("<redacted>");
}
