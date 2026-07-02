// Shared appearance for Clerk org components, approximating the Atelier theme.
// Left untyped on purpose so we don't depend on a specific @clerk/types export;
// the object is structurally validated where it's passed to `appearance={...}`.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#c62828", // curtain crimson
    colorText: "#241c19", // ink
    colorBackground: "#fbf5e9", // surface cream
    colorInputBackground: "#fbf5e9",
    colorInputText: "#241c19",
    borderRadius: "0.5rem",
    fontFamily: "var(--font-hanken), system-ui, sans-serif",
  },
  elements: {
    card: { border: "1px solid #2a211c" },
  },
};
