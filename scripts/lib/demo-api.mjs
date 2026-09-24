// Drives the app's own API routes as the demo user from an UNRECORDED
// headless context. Used by the seeder and by walkthrough section preps, so
// fixture data is created exactly the way the product creates it.
import { mintSignInTicket } from "./clerk-ticket.mjs";
import { assertDemoSession, assertLocalBase } from "./demo-org.mjs";
import { redactSecret } from "./redact.mjs";

/** Fails fast, before a ticket ever exists, on the common "forgot to start
 * the server" case. A plain fetch either answers (any status counts, this
 * only proves something is listening) or the connection is refused/times
 * out, and there is nothing secret to redact yet at this point. */
async function assertServerReachable(base) {
  let reachable = false;
  try {
    await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
    reachable = true;
  } catch {
    reachable = false;
  }
  if (!reachable) throw new Error(`server not reachable at ${base}`);
}

export async function signInDemo(browser, base, demo, { viewport = { width: 1920, height: 1080 } } = {}) {
  assertLocalBase(base);
  await assertServerReachable(base);
  const token = await mintSignInTicket(demo.clerkUserId);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    await page.goto(`${base}/sign-in?__clerk_ticket=${token}`);
    // A glob resolves before the redirect; wait on a predicate that excludes /sign-in.
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
    await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 20000 });
  } catch (err) {
    // The ticket travels in this URL, and Playwright's error text (and call
    // log, and stack) embeds the full URL it was navigating to. Redact
    // before this ever reaches a console.error or an escaping rejection.
    // Deliberately NOT attached as `cause`: that would carry the
    // unredacted message and stack right back into the ticket's reach.
    const redacted = new Error(redactSecret(String(err.message ?? err), token));
    redacted.stack = redactSecret(String(err.stack ?? redacted.stack ?? ""), token);
    throw redacted;
  }
  let session = await page.evaluate(() => ({ userId: window.Clerk.user?.id ?? null, orgId: window.Clerk.organization?.id ?? null }));
  if (session.orgId !== demo.clerkOrgId) {
    await page.evaluate((id) => window.Clerk.setActive({ organization: id }), demo.clerkOrgId);
    session = await page.evaluate(() => ({ userId: window.Clerk.user?.id ?? null, orgId: window.Clerk.organization?.id ?? null }));
  }
  assertDemoSession(session, demo);
  return { context, page };
}

export function createDemoApi(page) {
  async function call(method, path, body) {
    const res = await page.evaluate(async ({ method, path, body }) => {
      const init = { method, headers: {} };
      if (body !== undefined) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(body);
      }
      const r = await fetch(path, init);
      return { status: r.status, text: await r.text() };
    }, { method, path, body });
    if (res.status >= 400) throw new Error(`${method} ${path} -> ${res.status}: ${res.text.slice(0, 300)}`);
    return res.text ? JSON.parse(res.text) : null;
  }
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b ?? {}),
    put: (p, b) => call("PUT", p, b ?? {}),
    patch: (p, b) => call("PATCH", p, b ?? {}),
    del: (p) => call("DELETE", p),
  };
}

export async function withDemoApi(browser, base, demo, fn) {
  const { context, page } = await signInDemo(browser, base, demo);
  try {
    return await fn(createDemoApi(page));
  } finally {
    await context.close();
  }
}
