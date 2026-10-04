import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";

// Supabase pauses Free projects after 7 days without API traffic. Vercel Cron
// (see vercel.json) hits this route on a schedule; the one-row select is the
// activity that keeps the project awake. Nothing here touches Storage.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin.from("productions").select("id").limit(1);
  if (error) {
    console.error("Supabase keepalive query failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
