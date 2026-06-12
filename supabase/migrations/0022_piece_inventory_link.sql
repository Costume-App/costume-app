-- Links a costume piece to the House Inventory item created from it (one-to-one,
-- idempotent add). on delete set null so removing the item lets the piece be re-added.
alter table costume_pieces
  add column if not exists added_inventory_item_id uuid references inventory_items (id) on delete set null;
