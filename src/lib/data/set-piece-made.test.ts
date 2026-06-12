import { expect, test, vi } from "vitest";

let fromMock: (table: string) => unknown;

vi.mock("@/lib/supabase-admin", () => ({
  supabaseAdmin: { from: (t: string) => fromMock(t) },
}));

import { setPieceMade } from "@/lib/data/costume-pieces";
import { NotFoundError } from "@/lib/errors";

test("setPieceMade updates made/made_at after asserting org ownership", async () => {
  const calls: Record<string, unknown>[] = [];
  const piecesUpdateEq = vi.fn().mockResolvedValue({ error: null });
  const piecesUpdate = vi.fn((patch) => { calls.push(patch as Record<string, unknown>); return { eq: piecesUpdateEq }; });
  fromMock = vi.fn((table: string) => {
    if (table === "costume_pieces") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pc1", costume_design_id: "d1" }, error: null }) }) }),
        update: piecesUpdate,
      };
    }
    if (table === "costume_designs") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { production_id: "pr1" }, error: null }) }) }) };
    }
    // productions
    return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pr1" }, error: null }) }) }) }) };
  });

  await setPieceMade("org_1", "pc1", true);
  expect(piecesUpdate).toHaveBeenCalledTimes(1);
  expect(calls[0].made).toBe(true);
  expect(calls[0].made_at).not.toBeNull();
  expect(piecesUpdateEq).toHaveBeenCalledWith("id", "pc1");
});

test("setPieceMade throws NotFoundError when the production is not in the org", async () => {
  fromMock = vi.fn((table: string) => {
    if (table === "costume_pieces") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "pc1", costume_design_id: "d1" }, error: null }) }) }) };
    }
    if (table === "costume_designs") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { production_id: "pr1" }, error: null }) }) }) };
    }
    return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
  });
  await expect(setPieceMade("org_1", "pc1", true)).rejects.toBeInstanceOf(NotFoundError);
});
