import { supabaseAdmin } from "@/lib/supabase-admin";
import { ValidationError } from "@/lib/errors";
import { FEEDBACK_TYPES } from "@/lib/feedback-types";

export interface Feedback {
  id: string;
  org_id: string;
  user_id: string;
  user_email: string | null;
  type: string;
  message: string;
  created_at: string;
}

export async function createFeedback(input: {
  orgId: string;
  userId: string;
  userEmail: string | null;
  type: string;
  message: string;
}): Promise<Feedback> {
  const message = input.message.trim();
  if (!message) throw new ValidationError("Feedback message is required");
  if (!(FEEDBACK_TYPES as readonly string[]).includes(input.type)) {
    throw new ValidationError("Invalid feedback type");
  }
  const { data, error } = await supabaseAdmin
    .from("feedback")
    .insert({
      org_id: input.orgId,
      user_id: input.userId,
      user_email: input.userEmail,
      type: input.type,
      message,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Feedback;
}
