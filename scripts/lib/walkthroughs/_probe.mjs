// Verification-only walkthrough for Task 8. Not a training video.
export const WALKTHROUGH = {
  slug: "_probe",
  title: "Probe",
  guideAnchor: "productions",
  sections: [
    {
      id: "probe",
      heading: "Probe",
      targetSeconds: 8,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 1200);
        await h.point(page, page.getByRole("link", { name: /A Midsummer Night's Dream/ }), { s: 0 });
        await h.hold(page, 800);
        await h.zoom(page, page.getByRole("link", { name: /A Midsummer Night's Dream/ }), { s: 1, holdMs: 2000 });
      },
    },
    {
      // Frame-lag calibration (followups.md item 1). Teleports the cursor
      // (steps: 1) between two still targets, holding 1.5 s on each, so each
      // mark has a clean pre-move baseline at the NEXT target for
      // measure-frame-lag.mjs. Never built into a video.
      id: "lag",
      heading: "Lag",
      targetSeconds: 20,
      run: async (page, h) => {
        await h.gotoAuthed(page, "/productions");
        await h.hold(page, 1500);
        const a = page.locator("main h1").first();
        // "+ New Production" (target b in the brief) sits on the crimson
        // brand red (--red: #c62828), which reads almost identically to the
        // amber cursor dot in signalstats' V (red-difference chroma)
        // channel (measured diff 0.19 against threshold 6). The header
        // "Inventory" nav link sits on the plain muslin-paper page
        // background (--bg: #f4ecdd, no red component), is on screen at
        // load with no scroll, and does not overlap the h1 in <main>.
        const b = page.locator("header").getByRole("link", { name: "Inventory" });
        for (let i = 0; i < 5; i++) {
          await h.point(page, a, { steps: 1 });
          await h.hold(page, 1500);
          await h.point(page, b, { steps: 1 });
          await h.hold(page, 1500);
        }
      },
    },
  ],
};
