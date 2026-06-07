-- Structured fabric details + made/complete tracking, per performer's piece.
alter table costume_pieces add column fabric_type      text;
alter table costume_pieces add column fabric_color     text;
alter table costume_pieces add column fabric_width     text;
alter table costume_pieces add column fabric_supplier  text;
alter table costume_pieces add column fabric_yardage   numeric;
alter table costume_pieces add column fabric_unit_cost numeric;
alter table costume_pieces add column made             boolean not null default false;
alter table costume_pieces add column made_at          timestamptz;
