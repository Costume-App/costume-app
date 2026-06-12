import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildMakerAssignments, type MakerAssignment } from "@/lib/maker-assignments";

const ids = <T extends { [k: string]: unknown }>(rows: T[], key: keyof T): string[] =>
  [...new Set(rows.map((r) => r[key] as string).filter(Boolean))];

export async function listAssignmentsForMaker(orgId: string, makerId: string): Promise<MakerAssignment[]> {
  const { data: pieceRows, error: pErr } = await supabaseAdmin
    .from("costume_pieces")
    .select("id, costume_design_id, casting_id, made, made_at")
    .eq("maker_id", makerId);
  if (pErr) throw new Error(pErr.message);
  const pieces = (pieceRows ?? []) as {
    id: string; costume_design_id: string; casting_id: string; made: boolean; made_at: string | null;
  }[];
  if (pieces.length === 0) return [];

  const { data: designRows, error: dErr } = await supabaseAdmin
    .from("costume_designs")
    .select("id, production_id, role_id, name")
    .in("id", ids(pieces, "costume_design_id"));
  if (dErr) throw new Error(dErr.message);
  const designs = (designRows ?? []) as { id: string; production_id: string; role_id: string; name: string }[];

  // Org scoping happens here: only productions in this org survive, and
  // buildMakerAssignments drops pieces whose design's production isn't returned.
  const { data: prodRows, error: prErr } = await supabaseAdmin
    .from("productions")
    .select("id, title")
    .in("id", ids(designs, "production_id"))
    .eq("org_id", orgId);
  if (prErr) throw new Error(prErr.message);
  const productions = (prodRows ?? []) as { id: string; title: string }[];
  const orgProdIds = new Set(productions.map((p) => p.id));
  const orgDesigns = designs.filter((d) => orgProdIds.has(d.production_id));

  const { data: roleRows, error: rErr } = await supabaseAdmin
    .from("roles").select("id, name").in("id", ids(orgDesigns, "role_id"));
  if (rErr) throw new Error(rErr.message);

  const { data: castingRows, error: cErr } = await supabaseAdmin
    .from("castings").select("id, performer_id").in("id", ids(pieces, "casting_id"));
  if (cErr) throw new Error(cErr.message);
  const castings = (castingRows ?? []) as { id: string; performer_id: string }[];

  // performers store the display name in `label` (not `name`); map it for the builder.
  const { data: performerRows, error: peErr } = await supabaseAdmin
    .from("performers").select("id, label").in("id", ids(castings, "performer_id"));
  if (peErr) throw new Error(peErr.message);
  const performers = ((performerRows ?? []) as { id: string; label: string }[]).map((p) => ({
    id: p.id,
    name: p.label,
  }));

  return buildMakerAssignments({
    pieces,
    designs: orgDesigns,
    productions,
    roles: (roleRows ?? []) as { id: string; name: string }[],
    castings,
    performers,
  });
}
