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
  ],
};
