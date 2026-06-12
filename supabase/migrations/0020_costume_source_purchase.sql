-- The app added a fourth costume source 'purchase', but the costume_pieces.source
-- CHECK constraint (from 0005) still only allowed make/on_hand/shared, so saving a
-- purchase piece failed. Widen the constraint to include 'purchase'.
alter table costume_pieces drop constraint costume_pieces_source_check;

alter table costume_pieces
  add constraint costume_pieces_source_check
  check (source in ('make', 'on_hand', 'shared', 'purchase'));
