import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { assertProductionInOrg } from "@/lib/data/production-access";
import {
  isAiConfigured,
  readMeasurementForm,
  MeasurementFormServiceError,
  MeasurementFormUnreadableError,
} from "@/lib/ai/read-measurement-form";
import { CHOOSE_FILE, toFormContent } from "@/lib/measurement-import/input";
import { buildDraft } from "@/lib/measurement-import/draft";
import { loadMeasurementImportContext } from "@/lib/data/measurement-import";
import { ValidationError } from "@/lib/errors";

// One photo per request; the AI read is the slow part.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

// Read one form photo into a reviewable draft. Writes nothing.
export async function POST(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { id } = await params;
    await assertProductionInOrg(orgId, id);
    if (!isAiConfigured()) {
      return NextResponse.json({ error: "Measurement import isn't set up yet." }, { status: 501 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      console.error("Couldn't parse measurement import form data:", err);
      throw new ValidationError(CHOOSE_FILE);
    }
    const file = form.get("file");
    const content = await toFormContent(file instanceof File ? file : null);

    const extraction = await readMeasurementForm(content);
    const existing = await loadMeasurementImportContext(id);
    const draft = buildDraft(extraction, existing, {
      id: crypto.randomUUID(),
      fileName: file instanceof File ? file.name : "form",
      today: new Date().toISOString().slice(0, 10),
    });
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof MeasurementFormUnreadableError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof MeasurementFormServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    return errorResponse(err);
  }
}
