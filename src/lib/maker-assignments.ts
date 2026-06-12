export interface AssignmentPiece {
  id: string;
  costume_design_id: string;
  casting_id: string;
  made: boolean;
  made_at: string | null;
}
export interface AssignmentDesign { id: string; production_id: string; role_id: string; name: string }
export interface AssignmentProduction { id: string; title: string }
export interface AssignmentRole { id: string; name: string }
export interface AssignmentCasting { id: string; performer_id: string }
export interface AssignmentPerformer { id: string; name: string }

export interface MakerAssignment {
  pieceId: string;
  productionId: string;
  productionTitle: string;
  roleName: string;
  performerName: string;
  designName: string;
  made: boolean;
  made_at: string | null;
}

export function buildMakerAssignments(input: {
  pieces: AssignmentPiece[];
  designs: AssignmentDesign[];
  productions: AssignmentProduction[];
  roles: AssignmentRole[];
  castings: AssignmentCasting[];
  performers: AssignmentPerformer[];
}): MakerAssignment[] {
  const designById = new Map(input.designs.map((d) => [d.id, d]));
  const prodById = new Map(input.productions.map((p) => [p.id, p]));
  const roleById = new Map(input.roles.map((r) => [r.id, r]));
  const castingById = new Map(input.castings.map((c) => [c.id, c]));
  const performerById = new Map(input.performers.map((p) => [p.id, p]));

  const rows: MakerAssignment[] = [];
  for (const piece of input.pieces) {
    const design = designById.get(piece.costume_design_id);
    if (!design) continue; // design not in the caller's org → drop
    const production = prodById.get(design.production_id);
    const role = roleById.get(design.role_id);
    const casting = castingById.get(piece.casting_id);
    const performer = casting ? performerById.get(casting.performer_id) : undefined;
    rows.push({
      pieceId: piece.id,
      productionId: design.production_id,
      productionTitle: production?.title ?? "—",
      roleName: role?.name ?? "—",
      performerName: performer?.name ?? "—",
      designName: design.name,
      made: piece.made,
      made_at: piece.made_at,
    });
  }
  rows.sort(
    (a, b) =>
      a.productionTitle.localeCompare(b.productionTitle, undefined, { sensitivity: "base" }) ||
      a.roleName.localeCompare(b.roleName, undefined, { sensitivity: "base" }),
  );
  return rows;
}
