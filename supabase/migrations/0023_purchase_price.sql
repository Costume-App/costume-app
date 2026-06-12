-- Purchase-source pieces now carry a flat per-piece price, summed into the
-- Costume Creations cost total alongside make-piece fabric cost. Distinct from
-- fabric_unit_cost (which is cost *per yard*).
alter table costume_pieces add column purchase_price numeric;
