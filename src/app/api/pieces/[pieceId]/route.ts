import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { idParams } from "@/lib/route-params";
import { ValidationError } from "@/lib/errors";
import { setPieceMade } from "@/lib/data/costume-pieces";

type Ctx = { params: Promise<{ pieceId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { pieceId } = await idParams(params);
    const body = (await request.json()) as { made?: unknown };
    if (typeof body.made !== "boolean") throw new ValidationError("made must be a boolean");
    await setPieceMade(orgId, pieceId, body.made);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
