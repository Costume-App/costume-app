import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { errorResponse } from "@/lib/api";
import { getMeasurements, upsertMeasurement } from "@/lib/data/performers";
import { assertPerformerInOrg } from "@/lib/data/production-access";

type Ctx = { params: Promise<{ performerId: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    const measurements = await getMeasurements(performerId);
    return NextResponse.json({ measurements });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { orgId } = await getAuthContext();
    const { performerId } = await params;
    await assertPerformerInOrg(orgId, performerId);
    const body = (await request.json()) as {
      measurementKey?: string;
      valueNumeric?: unknown;
      unit?: string;
    };
    const measurement = await upsertMeasurement({
      performerId,
      measurementKey: String(body.measurementKey ?? ""),
      valueNumeric: Number(body.valueNumeric),
      unit: String(body.unit ?? "in"),
    });
    return NextResponse.json({ measurement });
  } catch (err) {
    return errorResponse(err);
  }
}
