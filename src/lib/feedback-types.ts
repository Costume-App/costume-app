export const FEEDBACK_TYPES = ["fix", "change", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  fix: "I need something fixed",
  change: "I'd like to see something work differently",
  other: "Other",
};
