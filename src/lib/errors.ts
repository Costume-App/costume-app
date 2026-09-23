// Thrown for client-correctable validation problems; API routes map it to HTTP 400.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Thrown when a resource doesn't exist or isn't visible to the caller; maps to HTTP 404.
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// Thrown when the data changed underneath a multi-step write (e.g. a concurrent edit); maps to HTTP 409.
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

// Thrown when an action exceeds the org's plan entitlements; maps to HTTP 402.
export type PlanLimitReason = "needs_unlock" | "needs_seat" | "needs_paid_plan";

const PLAN_LIMIT_MESSAGES: Record<PlanLimitReason, string> = {
  needs_unlock: "This action needs a production unlock. Buy a production or upgrade to Unlimited.",
  needs_seat: "This production has reached its maker limit. Add a seat or upgrade to Unlimited.",
  needs_paid_plan: "Sharing requires a paid plan. Buy a production or upgrade to Unlimited.",
};

export class PlanLimitError extends Error {
  reason: PlanLimitReason;
  constructor(reason: PlanLimitReason, message?: string) {
    super(message ?? PLAN_LIMIT_MESSAGES[reason]);
    this.name = "PlanLimitError";
    this.reason = reason;
  }
}

// Postgres "invalid input syntax" (e.g. a malformed UUID in a lookup) — callers treat it as not found.
export const PG_INVALID_TEXT_REPRESENTATION = "22P02";

// Postgres foreign_key_violation: the row points at something that does not exist.
export const PG_FOREIGN_KEY_VIOLATION = "23503";
