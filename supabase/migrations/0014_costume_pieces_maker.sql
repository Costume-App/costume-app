-- Which maker (org roster) is assigned to make a given piece. Null = unassigned.
alter table costume_pieces add column if not exists maker_id uuid references makers(id) on delete set null;
create index if not exists costume_pieces_maker_id_idx on costume_pieces(maker_id);
