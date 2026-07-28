-- What the skirt calculator (src/lib/fabric/skirt-yardage.ts) last produced for
-- this piece, kept separate from fabric_yardage — the value the user sees and
-- may type over. Equal means the field still holds the calculator's number;
-- different means the user overrode it; null means it never came from the
-- calculator. This is the signal that lets the "Measurements changed" prompt
-- tell a genuinely stale estimate from a deliberate choice, instead of nagging
-- about an override and offering to revert it.
alter table costume_pieces add column if not exists calculated_yardage numeric
  constraint costume_pieces_calculated_yardage_check
  check (calculated_yardage is null or calculated_yardage > 0);
