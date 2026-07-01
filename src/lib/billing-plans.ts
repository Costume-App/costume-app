// Static, UI-facing descriptor of the paid plans. Safe to import anywhere
// (no DB, no secrets). Surfaced in 402 upgrade prompts.
export const PLANS = {
  perProduction: {
    id: "per_production",
    label: "Pay Per Production",
    price: "$49.99",
    cadence: "one-time, per production",
    includes: "1 production, 3 makers",
    points: ["1 production", "3 makers included", "+$10 per extra maker"],
  },
  extraSeat: {
    id: "extra_seat",
    label: "Extra Maker",
    price: "$10",
    cadence: "one-time",
    includes: "1 more maker on this production",
    points: ["1 more maker on this production"],
  },
  unlimited: {
    id: "unlimited",
    label: "Unlimited",
    price: "$99.99",
    cadence: "per year",
    includes: "Unlimited productions & makers",
    points: ["Unlimited productions", "Unlimited makers", "Best for ongoing programs"],
  },
} as const;

export type Plans = typeof PLANS;
