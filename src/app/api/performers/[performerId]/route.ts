import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { deletePerformer, updatePerformer, updatePerformerNotes, type Performer } from "@/lib/data/performers";
import { assertPerformerInOrg } from "@/lib/data/production-access";
import { ValidationError } from "@/lib/errors";

type Ctx = { params: Promise<{ performerId: string }> };

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    await deletePerformer(performerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      throw new ValidationError("Invalid request body");
    }
    const { label, notes } = body as { label?: unknown; notes?: unknown };
    const hasNotes = "notes" in body;
    let performer: Performer | undefined;
    // Label and notes are independent: a label-only body renames as before, a
    // notes-only body edits notes only, and both together update both, label first.
    if (typeof label === "string") {
      performer = await updatePerformer(performerId, label);
    }
    if (hasNotes) {
      performer = await updatePerformerNotes(performerId, typeof notes === "string" ? notes : null);
    }
    if (!performer) {
      // Neither field present: keep today's behavior of rejecting an empty rename.
      performer = await updatePerformer(performerId, "");
    }
    return NextResponse.json({ performer });
  } catch (err) {
    return errorResponse(err);
  }
}
