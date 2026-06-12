// Shared content for the two A/B landing variants. Both render the same feature
// set with the same Atelier look; they differ in name, hero framing, and the
// order the feature acts lead in.

export type LandingSlug = "make-the-drama" | "measure-my-costume";
export type FeatureGroup = "Production" | "Costumes & Inventory" | "Cost";

export interface Feature {
  id: string;
  group: FeatureGroup;
  title: string;
  blurb: string;
}

// `id` keys an icon in LandingPage. Order within a group is the display order.
export const FEATURES: Feature[] = [
  { id: "all-in-one", group: "Production", title: "Everything in one place", blurb: "Casts, roles, costumes, fabric, and budget for a whole show — together." },
  { id: "auto-roles", group: "Production", title: "Auto-built cast lists", blurb: "Generate the standard roles for popular productions in a click." },
  { id: "character-boards", group: "Production", title: "Character boards", blurb: "Pin reference photos, ideas, and notes to every role." },
  { id: "measurements", group: "Production", title: "Cast measurements", blurb: "Capture each performer's measurements right where you need them." },

  { id: "sourcing", group: "Costumes & Inventory", title: "Source every piece", blurb: "Decide each costume: make it, buy it, or pull it from inventory." },
  { id: "inspiration", group: "Costumes & Inventory", title: "Piece inspiration", blurb: "Collect photos and ideas for every costume piece in one place." },
  { id: "inventory", group: "Costumes & Inventory", title: "House inventory", blurb: "Track your stock with photos and a storage location for every piece." },
  { id: "ai-fabric", group: "Costumes & Inventory", title: "AI fabric estimates", blurb: "Let AI calculate the yardage to bring each costume to life." },

  { id: "cost", group: "Cost", title: "Cost at a glance", blurb: "See your production's whole estimated cost in one place." },
];

export interface VariantConfig {
  slug: LandingSlug;
  brand: string;
  /** Display title split so the last word can take the curtain-red accent. */
  titleLead: string;
  titleAccent: string;
  tagline: string;
  eyebrow: string;
  groupOrder: FeatureGroup[];
}

export const VARIANTS: Record<LandingSlug, VariantConfig> = {
  "make-the-drama": {
    slug: "make-the-drama",
    brand: "Make the Drama",
    titleLead: "Make the",
    titleAccent: "Drama",
    tagline: "Your all-in-one play production management suite.",
    eyebrow: "The stage-to-curtain production suite",
    groupOrder: ["Production", "Costumes & Inventory", "Cost"],
  },
  "measure-my-costume": {
    slug: "measure-my-costume",
    brand: "Measure My Costume",
    titleLead: "Measure My",
    titleAccent: "Costume",
    tagline: "Every costume, every cast member, every yard — in one place.",
    eyebrow: "The costume shop, organized",
    groupOrder: ["Costumes & Inventory", "Production", "Cost"],
  },
};

// Placeholder — confirm the real address before launch.
export const CONTACT_EMAIL = "hello@makethedrama.com";
