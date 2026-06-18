// Static, UI-facing descriptor of the paid plans. Safe to import anywhere
// (no DB, no secrets). Surfaced in 402 upgrade prompts.
export const PLANS = {
  perProduction: {
    id: "per_production",
    label: "Pay per production",
    price: "$49.99 one-time",
    includes: "1 production, 3 makers",
  },
  extraSeat: {
    id: "extra_seat",
    label: "Extra maker",
    price: "$10 one-time",
    includes: "1 more maker on this production",
  },
  unlimited: {
    id: "unlimited",
    label: "Unlimited",
    price: "$99/year",
    includes: "Unlimited productions & makers",
  },
} as const;

export type Plans = typeof PLANS;
