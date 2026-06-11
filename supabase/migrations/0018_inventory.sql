-- Org-level photographed inventory ("costume library") of on-hand items/props.
-- Reusable across productions; pulled into a role's pieces via the link column
-- added at the bottom. Mirrors makers (0013) + costume_design_images (0012).
create table if not exists inventory_items (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references organizations(clerk_org_id) on delete cascade,
  name       text not null,
  category   text,
  size       text,
  quantity   integer not null default 1,
  location   text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_items_org_id_idx on inventory_items(org_id);

-- Reference photos per inventory item. Objects live in the shared private
-- "role-images" bucket under an inventory/ path prefix; this table tracks paths.
create table if not exists inventory_item_images (
  id                uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  storage_path      text not null,
  created_at        timestamptz not null default now()
);
create index if not exists inventory_item_images_item_id_idx
  on inventory_item_images(inventory_item_id);

-- The live link: a costume piece pulled "from inventory". Deleting a library
-- item leaves existing pieces intact (they become plain on-hand pieces).
alter table costume_designs
  add column if not exists inventory_item_id uuid
    references inventory_items(id) on delete set null;
create index if not exists costume_designs_inventory_item_id_idx
  on costume_designs(inventory_item_id);
