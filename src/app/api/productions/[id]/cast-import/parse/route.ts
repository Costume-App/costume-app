import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import {
  isAiConfigured,
  parseCastList,
  CastListServiceError,
  CastListUnreadableError,
} from "@/lib/ai/parse-cast-list";
import { toCastListContent } from "@/lib/cast-import/input";
import { inferCastList } from "@/lib/cast-import/infer";
import { buildDraft } from "@/lib/cast-import/match";
import { loadImportContext } from "@/lib/data/cast-import";
import { ValidationError } from "@/lib/errors";

// Reading a multi-page PDF can take a while on the AI side.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

// Read a pasted or uploaded cast list into a reviewable draft. Writes nothing.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "Cast import isn't set up yet." }, { status: 501 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ValidationError("Paste a cast list or choose a file.");
    }
    const text = form.get("text");
    const file = form.get("file");
    const content = await toCastListContent({
      text: typeof text === "string" ? text : null,
      file: file instanceof File ? file : null,
    });

    const extraction = await parseCastList(content);
    const existing = await loadImportContext(id);
    const draft = buildDraft(inferCastList(extraction), existing);
    return NextResponse.json({ draft, existing });
  } catch (err) {
    if (err instanceof CastListUnreadableError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof CastListServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return errorResponse(err);
  }
}
