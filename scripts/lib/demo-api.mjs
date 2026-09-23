// Drives the app's own API routes as the demo user from an UNRECORDED
// headless context. Used by the seeder and by walkthrough section preps, so
// fixture data is created exactly the way the product creates it.
import { mintSignInTicket } from "./clerk-ticket.mjs";
import { assertDemoSession, assertLocalBase } from "./demo-org.mjs";

export async function signInDemo(browser, base, demo, { viewport = { width: 1920, height: 1080 } } = {}) {
  assertLocalBase(base);
  const token = await mintSignInTicket(demo.clerkUserId);
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${base}/sign-in?__clerk_ticket=${token}`);
  // A glob resolves before the redirect; wait on a predicate that excludes /sign-in.
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.user), null, { timeout: 20000 });
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
