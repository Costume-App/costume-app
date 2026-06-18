-- Optional website per fabric supplier. Rendered as a link on the Shopping tab
-- (Costume Creations + My Work). Nullable; existing suppliers keep url = null.
alter table fabric_suppliers add column if not exists url text;
