import type { RawExtraction } from "@/lib/cast-import/types";

// AI output shaped like Nada's real "Peter and the Starcatcher" cast list, with FAKE names.
// The real list has real student names and must never be committed. Structure preserved:
// single cast, no understudies, 3-name group roles, big two-column group cells, one person in
// 5 roles (Fay Moreno), a shared surname pair (Rowan Pike / Jules Pike), messy whitespace.
// 14 roles (5 ensemble), 13 distinct people, 31 castings.
const one = (name: string) => [{ name, mark: "unmarked" as const }];
const many = (...names: string[]) => names.map((name) => ({ name, mark: "unmarked" as const }));

export const STARCATCHER_SHAPED: RawExtraction = {
  casts: [],
  entries: [
    { character: "Alf", cast: null, group_label: false, performers: one("Ada Finch") },
    { character: "Black Stache", cast: null, group_label: false, performers: one("Ben Ortiz") },
    { character: "Boy", cast: null, group_label: false, performers: one("Cara Holt") },
    { character: "Fighting Prawn", cast: null, group_label: false, performers: one("Fay Moreno") },
    { character: "Grempkin", cast: null, group_label: false, performers: one("Gus Lind") },
    {
      character: "Grempkin Flashback Vocalists",
      cast: null,
      group_label: false,
      performers: many("Kit Varga ", "Lou Adair", "Fay Moreno"),
    },
    { character: "Mack", cast: null, group_label: false, performers: one("Rowan Pike") },
    { character: "Mermaid Trio", cast: null, group_label: false, performers: many("Kit Varga", "Lou Adair", "Fay Moreno") },
    {
      character: "Mermaids",
      cast: null,
      group_label: false,
      performers: many("Ben Ortiz", "Gus Lind", "Rowan Pike", "Hana Ueda", "Ivo Marsh", "Juno Reyes"),
    },
    {
      character: "Pirates",
      cast: null,
      group_label: false,
      performers: many("Fay Moreno", "Kit Varga", "Gus Lind", "Rowan  Pike", "Hana Ueda"),
    },
    {
      character: "Sailors",
      cast: null,
      group_label: false,
      performers: many("Fay Moreno", "Kit Varga", "Gus Lind", "Rowan Pike", "Hana Ueda"),
    },
    { character: "Smee", cast: null, group_label: false, performers: one("Jules Pike") },
    { character: "Teacher", cast: null, group_label: false, performers: one("Lou Adair") },
    { character: "Mrs. Bumbrake", cast: null, group_label: false, performers: one("Nell Quade") },
  ],
};
