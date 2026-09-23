// Title card for the start and end of each training video, rendered by
// Chromium from HTML so it uses the app's real fonts (Fraunces, Hanken
// Grotesk) and palette tokens from src/app/globals.css (--bg, --ink, --red).
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function titleCardHtml({ title, subtitle }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Hanken+Grotesk:wght@500&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:1920px;height:1080px;background:#f4ecdd;color:#241c19}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center}
  h1{font-family:Fraunces,serif;font-weight:600;font-size:112px;margin:0;letter-spacing:-1px}
  .rule{width:220px;height:6px;background:#c62828;margin:40px 0 36px;border-radius:3px}
  p{font-family:"Hanken Grotesk",sans-serif;font-weight:500;font-size:40px;margin:0;opacity:.8}
</style></head><body>
  <h1>${esc(title)}</h1><div class="rule"></div><p>${esc(subtitle)}</p>
</body></html>`;
}

export async function renderTitleCard(browser, { title, subtitle }, outPath) {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.setContent(titleCardHtml({ title, subtitle }), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => document.fonts.check('600 112px Fraunces'));
  if (!loaded) throw new Error("Fraunces did not load; title card would fall back to a system serif");
  await page.screenshot({ path: outPath });
  await ctx.close();
}
